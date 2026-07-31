"""Async Angel One SmartAPI REST client (httpx + pyotp).

Does not place orders by itself — execution goes through ``app.brokers.execution``.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx
from loguru import logger

try:
    import pyotp
except ImportError:  # pragma: no cover
    pyotp = None  # type: ignore[assignment]

_BASE = "https://apiconnect.angelone.in"
_LOGIN = f"{_BASE}/rest/auth/angelbroking/user/v1/loginByPassword"
_LTP = f"{_BASE}/rest/secure/angelbroking/order/v1/getLtpData"
_PLACE = f"{_BASE}/rest/secure/angelbroking/order/v1/placeOrder"
_CANCEL = f"{_BASE}/rest/secure/angelbroking/order/v1/cancelOrder"
_ORDER_BOOK = f"{_BASE}/rest/secure/angelbroking/order/v1/getOrderBook"


class AngelApiError(RuntimeError):
    def __init__(self, message: str, *, payload: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.payload = payload or {}


@dataclass
class AngelSession:
    jwt_token: str
    refresh_token: str
    feed_token: str
    logged_in_at: datetime


class AngelSmartApiClient:
    """Session-caching Angel REST client for one personal account."""

    def __init__(
        self,
        *,
        api_key: str,
        client_code: str,
        password: str,
        totp_secret: str,
        timeout: float = 20.0,
    ) -> None:
        self._api_key = api_key.strip()
        self._client_code = client_code.strip()
        self._password = password.strip()
        self._totp_secret = totp_secret.strip()
        self._timeout = timeout
        self._session: AngelSession | None = None
        self._lock = asyncio.Lock()

    @property
    def is_ready(self) -> bool:
        return bool(self._api_key and self._client_code and self._password and self._totp_secret)

    def _base_headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-UserType": "USER",
            "X-SourceID": "WEB",
            "X-ClientLocalIP": "127.0.0.1",
            "X-ClientPublicIP": "127.0.0.1",
            "X-MACAddress": "00:00:00:00:00:00",
            "X-PrivateKey": self._api_key,
        }

    def _auth_headers(self) -> dict[str, str]:
        if not self._session:
            raise AngelApiError("Not logged in")
        headers = self._base_headers()
        token = self._session.jwt_token
        if not token.startswith("Bearer "):
            token = f"Bearer {token}"
        headers["Authorization"] = token
        return headers

    def _totp_now(self) -> str:
        if pyotp is None:
            raise AngelApiError("pyotp is not installed — add pyotp to requirements")
        if not self._totp_secret:
            raise AngelApiError("ANGEL_TOTP_SECRET is empty")
        return pyotp.TOTP(self._totp_secret).now()

    async def ensure_session(self, *, force: bool = False) -> AngelSession:
        async with self._lock:
            if self._session and not force:
                return self._session
            if not self.is_ready:
                raise AngelApiError(
                    "Angel credentials incomplete "
                    "(need ANGEL_API_KEY, ANGEL_CLIENT_CODE, ANGEL_PASSWORD, ANGEL_TOTP_SECRET)"
                )
            body = {
                "clientcode": self._client_code,
                "password": self._password,
                "totp": self._totp_now(),
            }
            async with httpx.AsyncClient(timeout=self._timeout) as http:
                resp = await http.post(_LOGIN, headers=self._base_headers(), json=body)
            data = _parse_json(resp)
            if not data.get("status"):
                raise AngelApiError(
                    f"Angel login failed: {data.get('message') or data.get('errorcode') or resp.status_code}",
                    payload=data,
                )
            payload = data.get("data") or {}
            jwt = str(payload.get("jwtToken") or "")
            if not jwt:
                raise AngelApiError("Angel login returned empty jwtToken", payload=data)
            self._session = AngelSession(
                jwt_token=jwt,
                refresh_token=str(payload.get("refreshToken") or ""),
                feed_token=str(payload.get("feedToken") or ""),
                logged_in_at=datetime.now(UTC),
            )
            logger.info("Angel SmartAPI session established for {}", self._client_code)
            return self._session

    async def get_ltp(
        self,
        *,
        exchange: str,
        tradingsymbol: str,
        symboltoken: str,
    ) -> float:
        await self.ensure_session()
        body = {
            "exchange": exchange,
            "tradingsymbol": tradingsymbol,
            "symboltoken": symboltoken,
        }
        data = await self._secure_post(_LTP, body)
        row = data.get("data") or {}
        ltp = row.get("ltp")
        if ltp is None:
            raise AngelApiError("Angel LTP missing in response", payload=data)
        return float(ltp)

    async def place_order(self, orderparams: dict[str, Any]) -> dict[str, Any]:
        await self.ensure_session()
        return await self._secure_post(_PLACE, orderparams)

    async def cancel_order(self, *, variety: str, orderid: str) -> dict[str, Any]:
        await self.ensure_session()
        return await self._secure_post(
            _CANCEL,
            {"variety": variety, "orderid": orderid},
        )

    async def order_book(self) -> dict[str, Any]:
        await self.ensure_session()
        async with httpx.AsyncClient(timeout=self._timeout) as http:
            resp = await http.get(_ORDER_BOOK, headers=self._auth_headers())
        return _parse_json(resp)

    async def _secure_post(self, url: str, body: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self._timeout) as http:
            resp = await http.post(url, headers=self._auth_headers(), json=body)
            data = _parse_json(resp)
            # One retry on auth failure.
            if resp.status_code in {401, 403} or (
                isinstance(data, dict)
                and data.get("status") is False
                and "token" in str(data.get("message", "")).lower()
            ):
                await self.ensure_session(force=True)
                resp = await http.post(url, headers=self._auth_headers(), json=body)
                data = _parse_json(resp)
        if isinstance(data, dict) and data.get("status") is False:
            raise AngelApiError(
                f"Angel API error: {data.get('message') or data.get('errorcode')}",
                payload=data,
            )
        return data


def _parse_json(resp: httpx.Response) -> dict[str, Any]:
    try:
        data = resp.json()
    except Exception as exc:  # noqa: BLE001
        raise AngelApiError(f"Angel non-JSON response HTTP {resp.status_code}") from exc
    if not isinstance(data, dict):
        raise AngelApiError(f"Angel unexpected payload type HTTP {resp.status_code}")
    if resp.status_code >= 500:
        raise AngelApiError(f"Angel HTTP {resp.status_code}", payload=data)
    return data
