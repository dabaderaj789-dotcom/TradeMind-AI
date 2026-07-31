"""Provider-layer errors (configuration / capability / upstream)."""

from __future__ import annotations

from fastapi import status

from app.core.exceptions import AppException


class ProviderNotConfiguredError(AppException):
    """Credentials or license missing for this provider."""

    def __init__(self, provider_id: str, detail: str | None = None) -> None:
        super().__init__(
            f"Market data provider '{provider_id}' is not configured",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail or "Set credentials in environment / settings, then restart.",
        )


class ProviderCapabilityError(AppException):
    """Requested feature not supported by the active provider."""

    def __init__(self, provider_id: str, capability: str) -> None:
        super().__init__(
            f"Provider '{provider_id}' does not support {capability}",
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Switch MARKET_DATA_*_PROVIDER or use a provider that advertises this capability.",
        )


class ProviderUpstreamError(AppException):
    """Upstream broker/vendor request failed."""

    def __init__(self, provider_id: str, detail: str) -> None:
        super().__init__(
            f"Provider '{provider_id}' upstream error",
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=detail,
        )
