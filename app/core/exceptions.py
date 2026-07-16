"""Global exception types and FastAPI exception handlers."""

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from loguru import logger
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException


class ErrorResponse(BaseModel):
    """Standard error response schema."""

    success: bool = False
    error: str
    detail: str | list[Any] | None = None
    status_code: int


class AppException(Exception):
    """Base application exception for domain-level errors."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail: str | None = None,
    ) -> None:
        self.message = message
        self.status_code = status_code
        self.detail = detail or message
        super().__init__(message)


class NotFoundError(AppException):
    """Raised when a requested resource does not exist."""

    def __init__(self, message: str = "Resource not found", *, detail: str | None = None) -> None:
        super().__init__(message, status_code=status.HTTP_404_NOT_FOUND, detail=detail)


class ConflictError(AppException):
    """Raised when an operation conflicts with existing state."""

    def __init__(self, message: str = "Conflict", *, detail: str | None = None) -> None:
        super().__init__(message, status_code=status.HTTP_409_CONFLICT, detail=detail)


class ValidationError(AppException):
    """Raised for business-level validation failures."""

    def __init__(self, message: str = "Validation failed", *, detail: str | None = None) -> None:
        super().__init__(message, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


class AdapterError(AppException):
    """Raised when an exchange adapter operation fails."""

    def __init__(
        self,
        message: str = "Adapter error",
        *,
        detail: str | None = None,
        status_code: int = status.HTTP_502_BAD_GATEWAY,
    ) -> None:
        super().__init__(message, status_code=status_code, detail=detail)


class SymbolNotFoundError(NotFoundError):
    """Raised when a symbol is not found on the exchange or in the database."""

    def __init__(self, symbol_code: str, *, exchange_code: str | None = None) -> None:
        detail = f"symbol={symbol_code}"
        if exchange_code:
            detail = f"exchange={exchange_code}, {detail}"
        super().__init__("Symbol not found", detail=detail)


class RateLimitError(AdapterError):
    """Raised when exchange rate limit is exceeded."""

    def __init__(self, exchange_code: str, *, retry_after: int | None = None) -> None:
        detail = f"exchange={exchange_code}"
        if retry_after is not None:
            detail = f"{detail}, retry_after={retry_after}s"
        super().__init__("Rate limit exceeded", detail=detail, status_code=status.HTTP_429_TOO_MANY_REQUESTS)


class StreamingNotSupportedError(AdapterError):
    """Raised when WebSocket streaming is requested but not yet implemented."""

    def __init__(self, exchange_code: str) -> None:
        super().__init__(
            "WebSocket streaming not yet implemented",
            detail=f"exchange={exchange_code}",
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
        )


def _build_error_response(
    *,
    error: str,
    detail: str | list[Any] | None,
    status_code: int,
) -> JSONResponse:
    body = ErrorResponse(
        error=error,
        detail=detail,
        status_code=status_code,
    )
    return JSONResponse(status_code=status_code, content=body.model_dump())


async def app_exception_handler(_request: Request, exc: AppException) -> JSONResponse:
    logger.warning("Application error: {} — {}", exc.message, exc.detail)
    return _build_error_response(
        error=exc.message,
        detail=exc.detail,
        status_code=exc.status_code,
    )


async def http_exception_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    logger.warning("HTTP error {}: {}", exc.status_code, exc.detail)
    return _build_error_response(
        error="HTTP error",
        detail=exc.detail,
        status_code=exc.status_code,
    )


async def validation_exception_handler(
    _request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    errors = exc.errors()
    logger.warning("Request validation failed: {}", errors)
    return _build_error_response(
        error="Request validation failed",
        detail=errors,
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
    )


async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception: {}", exc)
    return _build_error_response(
        error="Internal server error",
        detail="An unexpected error occurred",
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Register all global exception handlers on the FastAPI application."""
    app.add_exception_handler(AppException, app_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)
