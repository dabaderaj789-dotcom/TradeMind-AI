"""V7 Professional Market Data Engine — ticks, option chain, accuracy probes.

All live market data goes through the Provider Abstraction Layer.
Chart / option-chain / accuracy never import broker SDKs directly.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.providers.errors import ProviderNotConfiguredError, ProviderUpstreamError
from app.providers.mappers import option_chain_to_response, tick_to_response
from app.providers.registry import get_provider_registry
from app.providers.types import ProviderCapability
from app.repositories.symbol import SymbolRepository
from app.schemas.market_engine import (
    AccuracySymbolResult,
    MarketAccuracyReport,
    OptionChainResponse,
    TickQuoteResponse,
)
from app.services.quotes import QuoteService


class MarketEngineService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _symbols(self) -> SymbolRepository:
        return SymbolRepository(self.session)

    async def get_tick(self, symbol_id: uuid.UUID) -> TickQuoteResponse:
        """Hot-path last price for tip painting — provider-agnostic."""
        t0 = datetime.now(UTC)
        symbol = await self._symbols().get_by_id_with_relations(symbol_id)
        if symbol is None:
            raise NotFoundError("Symbol not found", detail=str(symbol_id))

        exch = (symbol.exchange.code if symbol.exchange else "").lower()
        registry = get_provider_registry()

        try:
            provider = registry.for_exchange(exch or "nse")
            tick = await provider.get_tick(symbol.symbol_code, exchange=exch or None)
            return tick_to_response(tick, symbol_id=symbol.id, received=t0)
        except (ProviderUpstreamError, ProviderNotConfiguredError, NotImplementedError) as exc:
            logger.debug("Provider tick miss for {}: {}", symbol.symbol_code, exc)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Provider tick error for {}: {}", symbol.symbol_code, exc)

        # Fallback: candle-derived quote path (still no broker SDK in this service)
        full = await QuoteService(self.session).get_quote(symbol_id)
        from decimal import Decimal

        from app.providers.types import NormalizedTick

        fallback = NormalizedTick(
            symbol_code=symbol.symbol_code,
            last=Decimal(str(full.current_price)),
            timestamp=full.last_updated or datetime.now(UTC),
            exchange=exch,
            volume=Decimal(str(full.volume)) if full.volume is not None else None,
            provider=full.provider,
            source=full.source,
            market_status=full.market_status,  # type: ignore[arg-type]
        )
        return tick_to_response(fallback, symbol_id=symbol.id, received=t0)

    async def get_option_chain(
        self,
        underlying: str,
        *,
        expiry: str | None = None,
    ) -> OptionChainResponse:
        registry = get_provider_registry()
        provider = registry.for_role("option_chain")
        if not provider.supports(ProviderCapability.OPTION_CHAIN):
            from app.providers.errors import ProviderCapabilityError

            raise ProviderCapabilityError(provider.provider_id, "option_chain")
        chain = await provider.get_option_chain(underlying, expiry=expiry)
        return option_chain_to_response(chain)

    async def list_providers(self) -> dict:
        registry = get_provider_registry()
        return {
            "roles": registry.role_map(),
            "providers": registry.describe(),
        }

    async def accuracy_report(self) -> MarketAccuracyReport:
        """Compare our live prices against a second pull from the same provider role."""
        targets = [
            ("NIFTY50", "nse"),
            ("BANKNIFTY", "nse"),
            ("SENSEX", "nse"),
            ("BTCUSDT", "binance"),
        ]
        repo = SymbolRepository(self.session)
        results: list[AccuracySymbolResult] = []
        registry = get_provider_registry()

        for code, exch in targets:
            provider = registry.for_exchange(exch)
            sym = await repo.get_by_exchange_code_and_symbol(exch, code)
            if sym is None and code == "NIFTY50":
                sym = await repo.get_by_exchange_code_and_symbol(exch, "NIFTY")
            if sym is None:
                results.append(
                    AccuracySymbolResult(
                        symbol_code=code,
                        exchange=exch,
                        ours=None,
                        reference=None,
                        reference_provider=provider.provider_id,
                        price_diff=None,
                        price_diff_pct=None,
                        ok=False,
                        note="Symbol not in database",
                    )
                )
                continue
            try:
                tick = await self.get_tick(sym.id)
                ours = tick.price
                ref_tick = await provider.get_tick(code if code != "NIFTY50" else sym.symbol_code, exchange=exch)
                reference = float(ref_tick.last)
                diff = ours - reference
                pct = (diff / reference * 100) if reference else 0.0
                ok = abs(pct) < 0.15
                results.append(
                    AccuracySymbolResult(
                        symbol_code=code,
                        exchange=exch,
                        ours=ours,
                        reference=reference,
                        reference_provider=provider.provider_id,
                        price_diff=round(diff, 4),
                        price_diff_pct=round(pct, 4),
                        ok=ok,
                        note="Self-check vs active provider" if ok else "Drift vs provider",
                    )
                )
            except Exception as exc:  # noqa: BLE001
                results.append(
                    AccuracySymbolResult(
                        symbol_code=code,
                        exchange=exch,
                        ours=None,
                        reference=None,
                        reference_provider=provider.provider_id,
                        price_diff=None,
                        price_diff_pct=None,
                        ok=False,
                        note=str(exc)[:200],
                    )
                )

        ok_n = sum(1 for r in results if r.ok)
        roles = registry.role_map()
        return MarketAccuracyReport(
            generated_at=datetime.now(UTC),
            results=results,
            summary={"checked": len(results), "ok": ok_n, "failed": len(results) - ok_n, "roles": roles},
            limitations=[
                f"India live provider: {roles.get('india')}. Crypto: {roles.get('crypto')}.",
                "Broker adapters (angel/upstox/dhan/…) are registered but inactive until credentials + client wiring.",
                "yahoo_nse is public REST — not Angel One / NSE tick WebSocket.",
                "Crypto uses Binance public ticker/WS — matches TradingView Binance.",
                "Option chain provider is config-driven (MARKET_DATA_OPTION_CHAIN_PROVIDER).",
            ],
        )
