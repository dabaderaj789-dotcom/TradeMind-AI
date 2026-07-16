"""FastAPI route handlers and dependency injection."""

from app.api.deps import get_db, get_health_service, get_settings_dep

__all__ = ["get_db", "get_health_service", "get_settings_dep"]
