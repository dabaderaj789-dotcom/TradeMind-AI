"""Personal trading service — paper default, Angel live opt-in."""

from __future__ import annotations

from functools import lru_cache

from app.brokers.angel.client import AngelSmartApiClient
from app.brokers.execution.angel_orders import AngelOrderGateway
from app.brokers.execution.paper import PaperBroker
from app.brokers.execution.risk import RiskConfig, RiskGate
from app.brokers.execution.types import OrderIntent, OrderResult, TradingMode
from app.config.settings import get_settings
from fastapi import status

from app.core.exceptions import AppException


class TradingBlockedError(AppException):
    def __init__(self, detail: str) -> None:
        super().__init__(
            "Trading blocked",
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
        )


class TradingService:
    def __init__(
        self,
        *,
        mode: TradingMode,
        risk: RiskGate,
        paper: PaperBroker,
        angel: AngelOrderGateway | None,
        angel_configured: bool,
    ) -> None:
        self.mode = mode
        self.risk = risk
        self.paper = paper
        self.angel = angel
        self.angel_configured = angel_configured

    def status(self) -> dict:
        self.risk.state.roll_day()
        return {
            "mode": self.mode.value,
            "live_enabled": self.risk.config.live_enabled,
            "kill_switch": self.risk.state.kill_switch or self.risk.config.kill_switch,
            "angel_configured": self.angel_configured,
            "max_qty": self.risk.config.max_qty,
            "max_orders_per_day": self.risk.config.max_orders_per_day,
            "orders_today": self.risk.state.orders_today,
            "paper_orders": len(self.paper.orders),
            "note": (
                "Default is PAPER. Live Angel orders require TRADING_MODE=live, "
                "TRADING_LIVE_ENABLED=true, kill switch off, and valid Angel credentials."
            ),
        }

    def set_kill_switch(self, on: bool) -> dict:
        self.risk.set_kill_switch(on)
        return self.status()

    async def place_order(self, intent: OrderIntent) -> OrderResult:
        live = self.mode == TradingMode.LIVE
        blocked = self.risk.check(intent, mode_live=live)
        if blocked:
            raise TradingBlockedError(blocked)

        if live:
            if not self.angel or not self.angel_configured:
                raise TradingBlockedError(
                    "Angel not configured — cannot place live orders"
                )
            result = await self.angel.place(intent)
        else:
            result = await self.paper.place(intent)

        if result.ok:
            self.risk.record_order()
        return result


@lru_cache
def get_trading_service() -> TradingService:
    settings = get_settings()
    mode_raw = (settings.trading_mode or "paper").strip().lower()
    mode = TradingMode.LIVE if mode_raw == "live" else TradingMode.PAPER
    risk = RiskGate(
        RiskConfig(
            kill_switch=bool(settings.trading_kill_switch),
            live_enabled=bool(settings.trading_live_enabled),
            max_qty=int(settings.trading_max_qty),
            max_orders_per_day=int(settings.trading_max_orders_per_day),
        )
    )
    paper = PaperBroker()
    client = AngelSmartApiClient(
        api_key=settings.angel_api_key or "",
        client_code=settings.angel_client_code or "",
        password=settings.angel_password or "",
        totp_secret=settings.angel_totp_secret or "",
    )
    angel_gw = AngelOrderGateway(client) if client.is_ready else None
    return TradingService(
        mode=mode,
        risk=risk,
        paper=paper,
        angel=angel_gw,
        angel_configured=client.is_ready,
    )


def reset_trading_service() -> None:
    """Test helper — clear cached singleton."""
    get_trading_service.cache_clear()
