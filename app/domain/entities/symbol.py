"""Domain symbol entity."""

from dataclasses import dataclass, field
from decimal import Decimal

from app.domain.enums.market_type import MarketType


@dataclass(frozen=True, slots=True)
class Symbol:
    """Exchange-native tradable instrument."""

    symbol_code: str
    name: str
    exchange_code: str
    market_type: MarketType
    base_asset: str | None = None
    quote_asset: str | None = None
    tick_size: Decimal = Decimal("0.01")
    lot_size: int = 1
    is_active: bool = True
    metadata: dict[str, object] = field(default_factory=dict)
