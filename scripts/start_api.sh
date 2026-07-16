#!/usr/bin/env bash
# Migrate Neon/Postgres then start FastAPI (Railway / Render).
set -euo pipefail

echo "[trademind] alembic upgrade head…"
alembic upgrade head

PORT="${PORT:-8000}"
echo "[trademind] uvicorn 0.0.0.0:${PORT}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT}"
