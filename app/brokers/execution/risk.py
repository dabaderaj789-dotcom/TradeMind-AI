"""Hard risk gates before any order (paper or live)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime

from app.brokers.execution.types import OrderIntent


@dataclass
class RiskState:
    day: date = field(default_factory=lambda: datetime.now(UTC).date())
    orders_today: int = 0
    kill_switch: bool = False

    def roll_day(self) -> None:
        today = datetime.now(UTC).date()
        if today != self.day:
            self.day = today
            self.orders_today = 0


@dataclass(frozen=True, slots=True)
class RiskConfig:
    kill_switch: bool
    live_enabled: bool
    max_qty: int
    max_orders_per_day: int


class RiskGate:
    def __init__(self, config: RiskConfig, state: RiskState | None = None) -> None:
        self.config = config
        self.state = state or RiskState(kill_switch=config.kill_switch)

    def set_kill_switch(self, on: bool) -> None:
        self.state.kill_switch = on

    def check(self, intent: OrderIntent, *, mode_live: bool) -> str | None:
        """Return error message if blocked, else None."""
        self.state.roll_day()
        if self.state.kill_switch or self.config.kill_switch:
            return "Kill switch is ON — all orders blocked"
        if mode_live and not self.config.live_enabled:
            return (
                "Live trading disabled. Set TRADING_LIVE_ENABLED=true and "
                "TRADING_MODE=live only after paper testing."
            )
        if intent.quantity <= 0:
            return "Quantity must be > 0"
        if intent.quantity > self.config.max_qty:
            return f"Quantity {intent.quantity} exceeds TRADING_MAX_QTY={self.config.max_qty}"
        if self.state.orders_today >= self.config.max_orders_per_day:
            return (
                f"Daily order cap reached ({self.config.max_orders_per_day}). "
                "Raise TRADING_MAX_ORDERS_PER_DAY if intentional."
            )
        return None

    def record_order(self) -> None:
        self.state.roll_day()
        self.state.orders_today += 1
