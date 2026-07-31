"""Angel One SmartAPI — live India ticks when credentials are set."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from app.brokers.angel.client import AngelApiError, AngelSmartApiClient
from app.brokers.angel.symbols import resolve_angel_instrument
from app.providers._helpers import empty_health
from app.providers.base import MarketDataProvider
from app.providers.errors import ProviderNotConfiguredError, ProviderUpstreamError
from app.providers.types import (
    InstrumentMetadata,
    NormalizedTick,
    ProviderCapability,
    ProviderHealth,
    ProviderId,
)

_CAPS = frozenset(
    {
        ProviderCapability.TICKS,
        ProviderCapability.VOLUME,
        ProviderCapability.INSTRUMENTS,
    }
)


def _india_session_open() -> bool:
    now = datetime.now(UTC)
    ist = now + timedelta(hours=5, minutes=30)
    mins = ist.hour * 60 + ist.minute
    return ist.weekday() < 5 and (9 * 60 + 15) <= mins < (15 * 60 + 30)


class AngelSmartApiProvider(MarketDataProvider):
    """Live LTP via Angel SmartAPI (requires API key + PIN + TOTP secret)."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        client_code: str | None = None,
        api_secret: str | None = None,
        password: str | None = None,
        totp_secret: str | None = None,
        client: AngelSmartApiClient | None = None,
    ) -> None:
        self._api_key = (api_key or "").strip()
        self._client_code = (client_code or "").strip()
        # api_secret kept for settings compatibility; Angel PIN lives in password.
        self._api_secret = (api_secret or "").strip()
        self._password = (password or "").strip()
        self._totp_secret = (totp_secret or "").strip()
        self._client = client or AngelSmartApiClient(
            api_key=self._api_key,
            client_code=self._client_code,
            password=self._password,
            totp_secret=self._totp_secret,
        )

    @property
    def provider_id(self) -> str:
        return ProviderId.ANGEL.value

    @property
    def display_name(self) -> str:
        return "Angel SmartAPI"

    @property
    def capabilities(self) -> frozenset[ProviderCapability]:
        return _CAPS

    @property
    def is_configured(self) -> bool:
        return self._client.is_ready

    async def get_tick(
        self,
        symbol_code: str,
        *,
        exchange: str | None = None,
    ) -> NormalizedTick:
        if not self.is_configured:
            raise ProviderNotConfiguredError(
                self.provider_id,
                detail=(
                    "Set ANGEL_API_KEY, ANGEL_CLIENT_CODE, ANGEL_PASSWORD (PIN), "
                    "and ANGEL_TOTP_SECRET"
                ),
            )
        inst = resolve_angel_instrument(symbol_code)
        if not inst:
            raise ProviderUpstreamError(
                self.provider_id,
                detail=f"No Angel token mapped for {symbol_code}",
            )
        try:
            ltp = await self._client.get_ltp(
                exchange=exchange.upper() if exchange else inst.exchange,
                tradingsymbol=inst.tradingsymbol,
                symboltoken=inst.symboltoken,
            )
        except AngelApiError as exc:
            raise ProviderUpstreamError(self.provider_id, detail=str(exc)) from exc

        status: str = "OPEN" if _india_session_open() else "CLOSED"
        return NormalizedTick(
            symbol_code=symbol_code.upper(),
            last=Decimal(str(ltp)),
            timestamp=datetime.now(UTC),
            exchange=(exchange or inst.exchange).lower(),
            provider=self.provider_id,
            source="angel_smartapi_ltp",
            market_status=status,  # type: ignore[arg-type]
        )

    async def get_instrument(
        self,
        symbol_code: str,
        *,
        exchange: str | None = None,
    ) -> InstrumentMetadata | None:
        inst = resolve_angel_instrument(symbol_code)
        if not inst:
            return None
        return InstrumentMetadata(
            symbol_code=symbol_code.upper(),
            name=inst.tradingsymbol,
            exchange=(exchange or inst.exchange).lower(),
            segment="INDEX" if "NIFTY" in symbol_code.upper() or symbol_code.upper() == "SENSEX" else "EQ",
            instrument_type="index" if inst.tradingsymbol in {"NIFTY", "BANKNIFTY", "SENSEX"} else "equity",
            provider=self.provider_id,
            tradingsymbol=inst.tradingsymbol,
            provider_token=inst.symboltoken,
        )

    async def health_check(self) -> ProviderHealth:
        if not self.is_configured:
            return empty_health(
                self.provider_id,
                configured=False,
                capabilities=_CAPS,
                message="Angel credentials incomplete",
            )
        try:
            await self._client.ensure_session()
            return ProviderHealth(
                provider=self.provider_id,
                status="ok",
                message="Angel session ready",
                capabilities=tuple(sorted(c.value for c in _CAPS)),
            )
        except AngelApiError as exc:
            return ProviderHealth(
                provider=self.provider_id,
                status="degraded",
                message=str(exc)[:200],
                capabilities=tuple(sorted(c.value for c in _CAPS)),
            )
