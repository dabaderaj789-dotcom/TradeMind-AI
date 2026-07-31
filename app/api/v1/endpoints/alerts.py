"""Personal email signal alerts."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from app.services.email_notify import EmailNotConfiguredError
from app.services.signal_alerts import get_alert_service

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("/status", summary="Alert scanner + email status")
async def alert_status() -> dict[str, Any]:
    svc = get_alert_service()
    if svc is None:
        return {"enabled": False, "error": "Alert service not started"}
    return svc.status()


@router.post("/test-email", summary="Send a test alert email")
async def test_email() -> dict[str, str]:
    svc = get_alert_service()
    if svc is None:
        raise HTTPException(503, "Alert service not started")
    try:
        return await svc.send_test_email()
    except EmailNotConfiguredError as exc:
        raise HTTPException(503, str(exc)) from exc


@router.post("/scan", summary="Run one alert scan now")
async def scan_now() -> dict[str, Any]:
    svc = get_alert_service()
    if svc is None:
        raise HTTPException(503, "Alert service not started")
    return await svc.scan_once()
