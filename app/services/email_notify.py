"""SMTP email + ntfy.sh push for personal TradeMind alerts."""

from __future__ import annotations

import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import httpx
from loguru import logger

from app.config.settings import Settings, get_settings


class EmailNotConfiguredError(RuntimeError):
    pass


def email_configured(settings: Settings | None = None) -> bool:
    s = settings or get_settings()
    return bool(
        s.alert_email_to
        and s.smtp_host
        and s.smtp_user
        and s.smtp_password
        and s.smtp_from
    )


def ntfy_configured(settings: Settings | None = None) -> bool:
    s = settings or get_settings()
    return bool((s.alert_ntfy_topic or "").strip())


def send_email_sync(
    *,
    subject: str,
    text_body: str,
    html_body: str | None = None,
    settings: Settings | None = None,
) -> None:
    s = settings or get_settings()
    if not email_configured(s):
        raise EmailNotConfiguredError(
            "Email not configured. Set ALERT_EMAIL_TO, SMTP_HOST, SMTP_USER, "
            "SMTP_PASSWORD, SMTP_FROM"
        )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = s.smtp_from
    msg["To"] = s.alert_email_to
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    if html_body:
        msg.attach(MIMEText(html_body, "html", "utf-8"))

    if s.smtp_use_tls:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            smtp.login(s.smtp_user, s.smtp_password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP_SSL(s.smtp_host, s.smtp_port, timeout=30) as smtp:
            smtp.login(s.smtp_user, s.smtp_password)
            smtp.send_message(msg)

    logger.info("Alert email sent to {} subject={}", s.alert_email_to, subject[:80])


async def send_email(
    *,
    subject: str,
    text_body: str,
    html_body: str | None = None,
    settings: Settings | None = None,
) -> None:
    await asyncio.to_thread(
        send_email_sync,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
        settings=settings,
    )


async def send_ntfy(
    *,
    subject: str,
    text_body: str,
    settings: Settings | None = None,
) -> None:
    """Push via public ntfy.sh topic (phone app / browser) — no SMTP password needed."""
    s = settings or get_settings()
    topic = (s.alert_ntfy_topic or "").strip()
    if not topic:
        raise EmailNotConfiguredError("ALERT_NTFY_TOPIC not set")
    base = (s.alert_ntfy_server or "https://ntfy.sh").rstrip("/")
    url = f"{base}/{topic}"
    headers = {
        "Title": subject[:120],
        "Priority": "high",
        "Tags": "chart_with_upwards_trend,trademind",
        "User-Agent": "TradeMindAI/1.0",
    }
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        resp = await client.post(url, content=text_body.encode("utf-8"), headers=headers)
        if resp.status_code >= 400:
            raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
    logger.info("ntfy alert posted to {}", topic)


async def send_alert(
    *,
    subject: str,
    text_body: str,
    html_body: str | None = None,
    settings: Settings | None = None,
) -> dict[str, str]:
    """Deliver via ntfy and/or SMTP. Succeeds if at least one channel works."""
    s = settings or get_settings()
    results: dict[str, str] = {}
    errors: list[str] = []

    if ntfy_configured(s):
        try:
            await send_ntfy(subject=subject, text_body=text_body, settings=s)
            results["ntfy"] = "sent"
        except Exception as exc:  # noqa: BLE001
            errors.append(f"ntfy: {exc}")
            results["ntfy"] = f"failed: {exc}"

    if email_configured(s):
        try:
            await send_email(
                subject=subject,
                text_body=text_body,
                html_body=html_body,
                settings=s,
            )
            results["email"] = "sent"
        except Exception as exc:  # noqa: BLE001
            errors.append(f"email: {exc}")
            results["email"] = f"failed: {exc}"

    if not results:
        raise EmailNotConfiguredError(
            "No alert channel configured. Set ALERT_NTFY_TOPIC and/or SMTP_*"
        )
    if "sent" not in results.values():
        raise EmailNotConfiguredError("; ".join(errors) or "All alert channels failed")
    return results


def format_signal_email(payload: dict[str, Any]) -> tuple[str, str, str]:
    """Return subject, text, html for a signal / lifecycle alert."""
    kind = str(payload.get("event") or "SIGNAL")
    symbol = str(payload.get("symbol_code") or "?")
    direction = str(payload.get("direction") or "").upper()
    tf = str(payload.get("timeframe") or "")
    subject = f"TradeMind {kind}: {direction} {symbol} {tf}".strip()

    lines = [
        f"Event: {kind}",
        f"Symbol: {symbol}",
        f"Timeframe: {tf}",
        f"Direction: {direction}",
        f"Setup: {payload.get('setup_type') or '—'}",
        f"Confidence: {payload.get('confidence')}",
        "",
        f"Entry: {payload.get('entry')}",
        f"Stop loss: {payload.get('stop_loss')}",
        f"Target 1: {payload.get('target_1')}",
        f"Target 2: {payload.get('target_2') or '—'}",
        f"Target 3: {payload.get('target_3') or '—'}",
        f"R:R: {payload.get('risk_reward') or '—'}",
        f"Last price: {payload.get('last_price') or '—'}",
        "",
        f"Explanation: {payload.get('explanation') or ''}",
        "",
        "TradeMind personal alert — verify on chart before trading.",
        "Not financial advice. No broker order was placed.",
    ]
    text = "\n".join(lines)

    html = f"""
    <html><body style="font-family:Segoe UI,Arial,sans-serif;background:#0b1220;color:#e2e8f0;padding:20px">
      <h2 style="margin:0 0 8px">{kind}: {direction} {symbol}</h2>
      <p style="color:#94a3b8;margin:0 0 16px">{tf} · confidence {payload.get('confidence')}</p>
      <table style="border-collapse:collapse;width:100%;max-width:420px">
        <tr><td style="padding:6px 0;color:#94a3b8">Entry</td><td style="padding:6px 0;font-weight:700">{payload.get('entry')}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8">Stop loss</td><td style="padding:6px 0;color:#f87171;font-weight:700">{payload.get('stop_loss')}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8">Target 1</td><td style="padding:6px 0;color:#34d399;font-weight:700">{payload.get('target_1')}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8">Target 2</td><td style="padding:6px 0">{payload.get('target_2') or '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8">Target 3</td><td style="padding:6px 0">{payload.get('target_3') or '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8">R:R</td><td style="padding:6px 0">{payload.get('risk_reward') or '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#94a3b8">Last</td><td style="padding:6px 0">{payload.get('last_price') or '—'}</td></tr>
      </table>
      <p style="margin-top:16px;color:#cbd5e1">{payload.get('explanation') or ''}</p>
      <p style="margin-top:24px;font-size:12px;color:#64748b">
        Personal TradeMind alert. Verify on chart. No broker order placed.
      </p>
    </body></html>
    """
    return subject, text, html
