"""Email alert formatting (no SMTP)."""

from app.services.email_notify import format_signal_email
from app.services.signal_alerts import _zone_mid


def test_format_signal_email_includes_levels() -> None:
    subject, text, html = format_signal_email(
        {
            "event": "NEW_SIGNAL",
            "symbol_code": "NIFTY50",
            "timeframe": "5m",
            "direction": "BUY",
            "setup_type": "pullback",
            "confidence": 72,
            "entry": 24500,
            "stop_loss": 24400,
            "target_1": 24650,
            "target_2": 24750,
            "target_3": None,
            "risk_reward": 1.5,
            "last_price": 24510,
            "explanation": "Test",
        }
    )
    assert "NIFTY50" in subject
    assert "24500" in text
    assert "24400" in text
    assert "Stop loss" in html


def test_zone_mid() -> None:
    assert _zone_mid({"high": 10, "low": 8}) == 9.0
    assert _zone_mid(None) is None
