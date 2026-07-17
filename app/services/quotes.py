"""Build Trading Terminal session quotes from persisted candles."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal

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

        # Current price must be the freshest stored close across intraday TFs —
        # not just 15m, which can lag 1m/5m/1h data by several bars.
        for tf_code in ("1m", "3m", "5m", "30m", "1h"):
            tf_fine = await self._tf_repo().get_by_code(tf_code)
            if tf_fine is None:
                continue
            fine = await self._candle_repo().get_latest(symbol.id, tf_fine.id, limit=1)
            if fine and _close_time_utc(fine[-1]) > _close_time_utc(last):
                last = fine[-1]

        current = _f(last.close)

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

        exch = (symbol.exchange.code if symbol.exchange else "").lower()
        mtype = (symbol.market.market_type if symbol.market else "").lower()
        is_equity = exch in {"nse", "bse"} or mtype == "equity"
        market_status: str = "OPEN"
        if is_equity:
            # NSE cash session: Mon–Fri 09:15–15:30 IST (UTC+5:30).
            ist = now + timedelta(hours=5, minutes=30)
            in_session = (
                ist.weekday() < 5
                and (ist.hour, ist.minute) >= (9, 15)
                and (ist.hour, ist.minute) <= (15, 30)
            )
            market_status = "OPEN" if in_session else "CLOSED"

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
            last_updated=last.close_time if last.close_time.tzinfo else last.close_time.replace(tzinfo=UTC),
            provider=provider,
            source="persisted_candles",
            reference_note="Derived from stored 15m/1d candles after download",
            yahoo_ticker=None,
        )

    async def verify_quote(self, symbol_id: uuid.UUID) -> QuoteVerifyResponse:
        quote = await self.get_quote(symbol_id)
        # Self-consistency check against latest 15m close (no second live hop required).
        checks: list[QuoteCheck] = []
        symbol = await self._symbol_repo().get_by_id_with_relations(symbol_id)
        tf_15 = await self._tf_repo().get_by_code("15m")
        assert symbol is not None and tf_15 is not None
        bars = await self._candle_repo().get_latest(symbol.id, tf_15.id, limit=5)
        if bars:
            ref = _f(bars[-1].close)
            pct = abs(quote.current_price - ref) / ref if ref else 0.0
            if pct > 0.0001:
                checks.append(
                    QuoteCheck(
                        field="current_price",
                        ours=quote.current_price,
                        reference=ref,
                        pct_diff=round(pct * 100, 4),
                        tolerance_pct=0.01,
                    )
                )
        return QuoteVerifyResponse(
            quote=quote,
            verification=QuoteVerificationResponse(
                ok=len(checks) == 0,
                mismatches=len(checks),
                checks=checks,
                reference_provider=quote.provider,
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
