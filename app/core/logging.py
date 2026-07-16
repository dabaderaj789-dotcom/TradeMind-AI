"""Structured logging configuration using Loguru."""

import sys
from typing import Any

from loguru import logger

from app.config.settings import Settings


def setup_logging(settings: Settings) -> None:
    """Configure Loguru with structured JSON or human-readable output."""
    logger.remove()

    if settings.log_format == "json":
        log_format = (
            '{{"timestamp": "{time:YYYY-MM-DDTHH:mm:ss.SSSZ}", '
            '"level": "{level}", '
            '"message": "{message}", '
            '"module": "{module}", '
            '"function": "{function}", '
            '"line": {line}}}'
        )
    else:
        log_format = (
            "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
            "<level>{level: <8}</level> | "
            "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
            "<level>{message}</level>"
        )

    logger.add(
        sys.stdout,
        format=log_format,
        level=settings.log_level.upper(),
        serialize=settings.log_format == "json",
        backtrace=settings.debug,
        diagnose=settings.debug,
    )

    logger.bind(app=settings.app_name, env=settings.app_env)


def get_logger(**context: Any) -> Any:
    """Return a contextualized logger instance."""
    return logger.bind(**context)
