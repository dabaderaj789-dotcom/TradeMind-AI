"""Reusable OHLCV candle validation."""

from datetime import UTC, datetime
from decimal import Decimal

from loguru import logger

from app.domain.entities.adapter_types import ValidationResult
from app.domain.entities.candle import Candle


class CandleValidator:
    """Validates normalized candles before persistence."""

    def __init__(
        self,
        *,
        max_price_change_pct: Decimal = Decimal("50"),
        future_tolerance_seconds: int = 300,
    ) -> None:
        self._max_price_change_pct = max_price_change_pct
        self._future_tolerance_seconds = future_tolerance_seconds

    def validate_batch(self, candles: list[Candle]) -> ValidationResult:
        """Validate a batch of candles, returning valid ones and rejection stats."""
        if not candles:
            return ValidationResult(valid_candles=[], rejected_count=0)

        valid: list[Candle] = []
        rejected = 0
        reasons: list[str] = []
        prev_close: Decimal | None = None
        prev_time: datetime | None = None
        now = datetime.now(UTC)

        for candle in sorted(candles, key=lambda c: c.open_time):
            reason = self._validate_single(candle, prev_close=prev_close, prev_time=prev_time, now=now)
            if reason:
                rejected += 1
                if len(reasons) < 10:
                    reasons.append(f"{candle.open_time.isoformat()}: {reason}")
                logger.debug("Rejected candle {}: {}", candle.open_time, reason)
                continue

            valid.append(candle)
            prev_close = candle.close
            prev_time = candle.open_time

        if rejected:
            logger.warning("Rejected {} of {} candles", rejected, len(candles))

        return ValidationResult(
            valid_candles=valid,
            rejected_count=rejected,
            rejection_reasons=reasons,
        )

    def _validate_single(
        self,
        candle: Candle,
        *,
        prev_close: Decimal | None,
        prev_time: datetime | None,
        now: datetime,
    ) -> str | None:
        if candle.open <= 0 or candle.high <= 0 or candle.low <= 0 or candle.close <= 0:
            return "non-positive price"

        if candle.low > min(candle.open, candle.close) or candle.high < max(candle.open, candle.close):
            return "OHLC integrity violation"

        if candle.volume < 0:
            return "negative volume"

        if candle.open_time.tzinfo is None:
            return "open_time missing timezone"

        future_limit = now.timestamp() + self._future_tolerance_seconds
        if candle.open_time.timestamp() > future_limit:
            return "future timestamp"

        if prev_time is not None and candle.open_time <= prev_time:
            return "non-monotonic timestamp"

        if prev_close is not None and prev_close > 0:
            change_pct = abs(candle.close - prev_close) / prev_close * Decimal("100")
            if change_pct > self._max_price_change_pct:
                return f"price change {change_pct:.2f}% exceeds threshold"

        return None
