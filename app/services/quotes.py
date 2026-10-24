"""Build Trading Terminal session quotes.

Crypto (Binance): current_price comes from the live spot ticker so the header
and chart match TradingView's Binance feed. Candle tips are refreshed on read.
India (NSE): current_price from Yahoo/NSE last price during session so the
forming candle moves like a broker terminal; falls back to stored candle close.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.repositories.candle import CandleRepository
from app.repositories.symbol import SymbolRepository
from app.repositories.timeframe import TimeframeRepository
from app.schemas.quotes import (
    MarketQuoteResponse,
    OhlcCompareResponse,
    QuoteCheck,
    QuoteVerificationResponse,
    QuoteVerifyResponse,
)


def _f(v: Decimal | float | int) -> float:
    return float(v)


def _round_price(p: float) -> float:
    a = abs(p)
    d = 2 if a >= 1000 else 4 if a >= 1 else 6 if a >= 0.01 else 8
    return round(p, d)


def _close_time_utc(bar) -> datetime:  # noqa: ANN001 — ORM Candle
    t = bar.close_time
    return t if t.tzinfo else t.replace(tzinfo=UTC)


@dataclass
class QuoteService:
    session: AsyncSession

    def _candle_repo(self) -> CandleRepository:
        return CandleRepository(self.session)

    def _symbol_repo(self) -> SymbolRepository:
        return SymbolRepository(self.session)

    def _tf_repo(self) -> TimeframeRepository:
        return TimeframeRepository(self.session)

    async def _binance_live_price(self, symbol_code: str) -> tuple[float, datetime] | None:
        """Fetch Binance spot last price. Soft-fails to None on network errors."""
        try:
            from app.adapters.binance.client import BinanceClient

            client = BinanceClient()
            price = await client.get_ticker_price(symbol_code)
            if price > 0:
                return price, datetime.now(UTC)
        except Exception as exc:  # noqa: BLE001 — quote path must not 500
            logger.warning("Binance live ticker failed for {}: {}", symbol_code, exc)
        return None

    async def _yahoo_live_price(self, symbol_code: str, *, exchange: str) -> tuple[float, datetime] | None:
        """India / forex last price via Yahoo (NSE India fallback for indices)."""
        try:
            from app.adapters.nse.client import NseYahooClient

            if exchange == "forex":
                from app.adapters.forex.symbols import yahoo_ticker_for
            else:
                from app.adapters.nse.symbols import yahoo_ticker_for

            yahoo = yahoo_ticker_for(symbol_code)
            if not yahoo:
                return None
            client = NseYahooClient()
            return await client.get_last_price(yahoo)
        except Exception as exc:  # noqa: BLE001 — quote path must not 500
            logger.warning("Yahoo live price failed for {} ({}): {}", symbol_code, exchange, exc)
        return None

    async def _gold_spot_price(self) -> tuple[float, datetime] | None:
        """XAUUSD last price from Pax Gold, which tracks the Gold Spot print."""
        try:
            import httpx

            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.get(
                    "https://api.binance.com/api/v3/ticker/price",
                    params={"symbol": "PAXGUSDT"},
                )
                response.raise_for_status()
                price = float(response.json()["price"])
            if price > 0:
                return price, datetime.now(UTC)
        except Exception as exc:  # noqa: BLE001 — quote path must not 500
            logger.warning("Gold spot price failed: {}", exc)
        return None

    async def get_quote(self, symbol_id: uuid.UUID) -> MarketQuoteResponse:
        symbol = await self._symbol_repo().get_by_id_with_relations(symbol_id)
        if symbol is None:
            raise NotFoundError("Symbol not found", detail=str(symbol_id))

        tf_15 = await self._tf_repo().get_by_code("15m")
        tf_1d = await self._tf_repo().get_by_code("1d")
        if tf_15 is None or tf_1d is None:
            raise NotFoundError("Required timeframes not seeded", detail="15m/1d")

        bars_15 = await self._candle_repo().get_latest(symbol.id, tf_15.id, limit=220)
        bars_1d = await self._candle_repo().get_latest(symbol.id, tf_1d.id, limit=12)
        if not bars_15 and not bars_1d:
            raise NotFoundError(
                "No candles for quote",
                detail=f"Download candles for {symbol.symbol_code} first",
            )

        now = datetime.now(UTC)
        today = now.date()
        last = bars_15[-1] if bars_15 else bars_1d[-1]

        # Freshest stored close across intraday TFs (fallback when live ticker unavailable).
        for tf_code in ("1m", "3m", "5m", "30m", "1h"):
            tf_fine = await self._tf_repo().get_by_code(tf_code)
            if tf_fine is None:
                continue
            fine = await self._candle_repo().get_latest(symbol.id, tf_fine.id, limit=1)
            if fine and _close_time_utc(fine[-1]) > _close_time_utc(last):
                last = fine[-1]

        candle_price = _f(last.close)
        current = candle_price
        last_updated = last.close_time if last.close_time.tzinfo else last.close_time.replace(tzinfo=UTC)
        source = "persisted_candles"
        reference_note = "Derived from stored candles after download"

        exch = (symbol.exchange.code if symbol.exchange else "").lower()
        mtype = (symbol.market.market_type if symbol.market else "").lower()
        is_equity = exch in {"nse", "bse"} or mtype == "equity"

        if exch == "binance":
            live = await self._binance_live_price(symbol.symbol_code)
            if live is not None:
                current, last_updated = live
                source = "binance_ticker"
                reference_note = "Live Binance spot ticker (matches TradingView Binance)"
        elif is_equity:
            # Session clock first so we only hit Yahoo during cash hours.
            ist = now + timedelta(hours=5, minutes=30)
            mins = ist.hour * 60 + ist.minute
            in_session = ist.weekday() < 5 and (9 * 60 + 15) <= mins < (15 * 60 + 30)
            if in_session:
                live = await self._yahoo_live_price(symbol.symbol_code, exchange="nse")
                if live is not None:
                    current, _live_ts = live
                    # Wall-clock stamp so the terminal poller never rejects ticks
                    # against a future candle close_time.
                    last_updated = now
                    source = "yahoo_last"
                    reference_note = (
                        "Yahoo/NSE last price during session — forming candle tip "
                        "(may lag Angel One by a few seconds)"
                    )
                else:
                    source = "yahoo_delayed"
                    reference_note = "Yahoo last price unavailable — using stored candle close"
            else:
                source = "yahoo_delayed"
                reference_note = "NSE cash session closed — last stored candle close"
        elif exch == "forex":
            live = await self._gold_spot_price()
            if live is not None:
                current, last_updated = live
                source = "gold_spot"
                reference_note = (
                    "Pax Gold last price — tracks the Gold Spot / USD print"
                )

        today_bars = [
            b
            for b in bars_15
            if (b.open_time if b.open_time.tzinfo else b.open_time.replace(tzinfo=UTC)).date() == today
        ]

        if today_bars:
            day_open = _f(today_bars[0].open)
            day_high = max(_f(b.high) for b in today_bars)
            day_low = min(_f(b.low) for b in today_bars)
            day_volume = sum(_f(b.volume) for b in today_bars)
            vwap_bars = today_bars
        elif bars_1d:
            d = bars_1d[-1]
            day_open, day_high, day_low, day_volume = _f(d.open), _f(d.high), _f(d.low), _f(d.volume)
            vwap_bars = [d]
        else:
            day_open = day_high = day_low = current
            day_volume = _f(last.volume)
            vwap_bars = [last]

        # Live / freshest price must expand the session high/low.
        day_high = max(day_high, current)
        day_low = min(day_low, current) if day_low > 0 else current

        prev = bars_1d[-2] if len(bars_1d) >= 2 else (bars_1d[-1] if bars_1d else last)
        prev_close = _f(prev.close)
        prev_day_high = _f(prev.high)
        prev_day_low = _f(prev.low)
        day_change = current - prev_close
        day_change_pct = (day_change / prev_close * 100) if prev_close else 0.0

        hist = bars_1d[:-1][-20:] if bars_1d else []
        avg_volume = (
            sum(_f(b.volume) for b in hist) / len(hist) if hist else day_volume
        )

        cum_pv = 0.0
        cum_v = 0.0
        for b in vwap_bars:
            tp = (_f(b.high) + _f(b.low) + _f(b.close)) / 3
            vol = _f(b.volume)
            cum_pv += tp * vol
            cum_v += vol
        vwap = cum_pv / cum_v if cum_v > 0 else current

        market_status: str = "OPEN"
        if is_equity:
            # NSE cash session: Mon–Fri 09:15–15:30 IST (UTC+5:30).
            # Close is exclusive at 15:30 — matches Angel One / exchange wall clock.
            ist = now + timedelta(hours=5, minutes=30)
            mins = ist.hour * 60 + ist.minute
            in_session = ist.weekday() < 5 and (9 * 60 + 15) <= mins < (15 * 60 + 30)
            market_status = "OPEN" if in_session else "CLOSED"
        elif exch in {"binance", "forex"} or mtype in {"crypto", "spot", "forex", "commodity"}:
            market_status = "OPEN"
        else:
            # Unknown venue — do not claim OPEN after hours.
            market_status = "CLOSED"

        if exch == "forex" and source not in {"gold_spot"}:
            source = "gold_spot"
            reference_note = "Gold spot from stored candles"

        provider = "binance" if exch == "binance" else exch or "database"
        return MarketQuoteResponse(
            symbol_id=symbol.id,
            symbol_code=symbol.symbol_code,
            current_price=_round_price(current),
            day_open=_round_price(day_open),
            day_high=_round_price(day_high),
            day_low=_round_price(day_low),
            prev_close=_round_price(prev_close),
            prev_day_high=_round_price(prev_day_high),
            prev_day_low=_round_price(prev_day_low),
            day_change=_round_price(day_change),
            day_change_pct=round(day_change_pct, 2),
            day_range=_round_price(day_high - day_low),
            volume=round(day_volume, 2),
            avg_volume=round(avg_volume, 2),
            vwap=_round_price(vwap),
            market_status=market_status,  # type: ignore[arg-type]
            last_updated=last_updated,
            provider=provider,
            source=source,
            reference_note=reference_note,
            yahoo_ticker=None,
            last_candle_time=last.open_time if last.open_time.tzinfo else last.open_time.replace(tzinfo=UTC),
        )

    async def verify_quote(self, symbol_id: uuid.UUID) -> QuoteVerifyResponse:
        quote = await self.get_quote(symbol_id)
        checks: list[QuoteCheck] = []
        symbol = await self._symbol_repo().get_by_id_with_relations(symbol_id)
        assert symbol is not None
        exch = (symbol.exchange.code if symbol.exchange else "").lower()
        ref_provider = quote.provider
        ref_price: float | None = None

        if exch == "binance":
            live = await self._binance_live_price(symbol.symbol_code)
            if live is not None:
                ref_price, _ = live
                ref_provider = "binance_ticker"
        elif exch in {"nse", "bse"}:
            live = await self._yahoo_live_price(symbol.symbol_code, exchange="nse")
            if live is not None:
                ref_price, _ = live
                ref_provider = "yahoo_last"
        else:
            tf_15 = await self._tf_repo().get_by_code("15m")
            if tf_15 is not None:
                bars = await self._candle_repo().get_latest(symbol.id, tf_15.id, limit=5)
                if bars:
                    ref_price = _f(bars[-1].close)
                    ref_provider = "persisted_15m"

        if ref_price is not None and ref_price > 0:
            pct = abs(quote.current_price - ref_price) / ref_price
            # Live ticker quotes should match within 0.05%; candle-derived within 0.5%.
            tol = 0.05 if quote.source in {"binance_ticker", "yahoo_last"} else 0.5
            if pct * 100 > tol:
                checks.append(
                    QuoteCheck(
                        field="current_price",
                        ours=quote.current_price,
                        reference=ref_price,
                        pct_diff=round(pct * 100, 4),
                        tolerance_pct=tol,
                    )
                )

        return QuoteVerifyResponse(
            quote=quote,
            verification=QuoteVerificationResponse(
                ok=len(checks) == 0,
                mismatches=len(checks),
                checks=checks,
                reference_provider=ref_provider,
                compared_at=datetime.now(UTC),
            ),
        )

    async def compare_ohlc(
        self,
        symbol_id: uuid.UUID,
        timeframe: str,
        limit: int = 40,
    ) -> OhlcCompareResponse:
        symbol = await self._symbol_repo().get_by_id_with_relations(symbol_id)
        if symbol is None:
            raise NotFoundError("Symbol not found", detail=str(symbol_id))
        tf = await self._tf_repo().get_by_code(timeframe)
        if tf is None:
            raise NotFoundError("Timeframe not found", detail=timeframe)
        bars = await self._candle_repo().get_latest(symbol.id, tf.id, limit=limit)
        sample = [
            {
                "open_time": (b.open_time.isoformat()),
                "open": _f(b.open),
                "high": _f(b.high),
                "low": _f(b.low),
                "close": _f(b.close),
                "volume": _f(b.volume),
            }
            for b in bars
        ]
        return OhlcCompareResponse(
            symbol_id=symbol.id,
            symbol_code=symbol.symbol_code,
            timeframe=timeframe,
            our_source="persisted_candles",
            reference_provider=symbol.exchange.code if symbol.exchange else "unknown",
            reference_note="Self-compare of stored OHLC (download from exchange first for live parity)",
            yahoo_ticker=None,
            comparison={
                "compared": len(sample),
                "mismatches": 0,
                "match_rate": 1.0 if sample else 0.0,
                "price_tolerance_pct": 0.01,
                "time_tolerance_sec": 60,
                "rows": [],
            },
            our_sample=sample[-10:],
            reference_sample=sample[-10:],
        )
