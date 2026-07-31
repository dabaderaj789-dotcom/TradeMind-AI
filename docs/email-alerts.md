# Email signal alerts (no Angel, no chart watching)

TradeMind can email you when a trade setup appears and when price hits **entry / stop / targets**.

Works with Yahoo/NSE data — Angel not required.

## What you get in the mail

- Direction (BUY / SELL)
- Symbol + timeframe
- Entry, stop loss, target 1–3, R:R
- Confidence + short explanation
- Later mails: `ENTRY`, `STOP_LOSS`, `TARGET_1` …

## Setup (Railway variables)

```env
ALERTS_ENABLED=true
ALERT_EMAIL_TO=you@gmail.com
ALERT_WATCHLIST=NIFTY50:5m,BANKNIFTY:5m
ALERT_INTERVAL_SEC=180
ALERT_MIN_CONFIDENCE=60

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASSWORD=xxxx          # Gmail App Password
SMTP_FROM=TradeMind <you@gmail.com>
SMTP_USE_TLS=true
```

Then open **Alerts** in the terminal (`/lab/alerts`) → **Send test email**.

## API

- `GET /api/v1/alerts/status`
- `POST /api/v1/alerts/test-email`
- `POST /api/v1/alerts/scan`

## Notes

- Scanner runs in the API process every `ALERT_INTERVAL_SEC` seconds.
- Alerts are **research signals**, not broker orders.
- Always verify on the chart before trading size.
