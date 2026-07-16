"""Base class for trade strategies."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, ValidationError as PydanticValidationError

from app.core.exceptions import ValidationError as AppValidationError
from app.engines.strategy.types import SetupEvaluation, SetupInput, TradePlan


class BaseStrategy(ABC):
    """Strategies evaluate trade setups and produce trade plans — never raw candles."""

    @classmethod
    @abstractmethod
    def strategy_id(cls) -> str:
        ...

    @classmethod
    @abstractmethod
    def strategy_name(cls) -> str:
        ...

    @classmethod
    def strategy_version(cls) -> str:
        return "1.0.0"

    @classmethod
    @abstractmethod
    def description(cls) -> str:
        ...

    @classmethod
    def supported_markets(cls) -> list[str]:
        return ["crypto", "forex", "equities"]

    @classmethod
    def supported_timeframes(cls) -> list[str]:
        return ["1m", "5m", "15m", "1h", "4h", "1d"]

    @classmethod
    @abstractmethod
    def required_setup_types(cls) -> list[str]:
        ...

    @classmethod
    @abstractmethod
    def default_parameters(cls) -> dict[str, Any]:
        ...

    @classmethod
    @abstractmethod
    def parameters_model(cls) -> type[BaseModel]:
        ...

    def validate(self, parameters: dict[str, Any] | None) -> dict[str, Any]:
        merged = {**self.default_parameters(), **(parameters or {})}
        try:
            validated = self.parameters_model().model_validate(merged)
            return validated.model_dump()
        except PydanticValidationError as exc:
            raise AppValidationError(
                f"Invalid parameters for {self.strategy_id()}",
                detail=str(exc.errors()),
            ) from exc

    @abstractmethod
    def evaluate_setup(
        self,
        setup: SetupInput,
        parameters: dict[str, Any],
    ) -> SetupEvaluation:
        ...

    @abstractmethod
    def generate_trade_plan(
        self,
        setup: SetupInput,
        evaluation: SetupEvaluation,
        parameters: dict[str, Any],
    ) -> TradePlan | None:
        ...

    def metadata(self) -> dict[str, Any]:
        return {
            "strategy_id": self.strategy_id(),
            "strategy_name": self.strategy_name(),
            "strategy_version": self.strategy_version(),
            "description": self.description(),
            "supported_markets": self.supported_markets(),
            "supported_timeframes": self.supported_timeframes(),
            "required_setup_types": self.required_setup_types(),
            "default_parameters": self.default_parameters(),
        }
