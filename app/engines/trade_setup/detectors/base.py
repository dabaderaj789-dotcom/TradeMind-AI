"""Setup detector base and registry."""

from __future__ import annotations

from abc import ABC, abstractmethod

from app.engines.trade_setup.types import BarAnalysisContext, TradeSetupCandidate


class SetupDetector(ABC):
    """Pluggable setup detector — extend to add new setup types without engine changes."""

    @property
    @abstractmethod
    def setup_type_id(self) -> str:
        ...

    @abstractmethod
    def detect(
        self,
        ctx: BarAnalysisContext,
        evidence: dict[str, float],
    ) -> TradeSetupCandidate | None:
        ...


class SetupDetectorRegistry:
    def __init__(self) -> None:
        self._detectors: dict[str, SetupDetector] = {}

    def register(self, detector: SetupDetector) -> None:
        self._detectors[detector.setup_type_id] = detector

    def all(self) -> list[SetupDetector]:
        return list(self._detectors.values())

    def get(self, setup_type_id: str) -> SetupDetector | None:
        return self._detectors.get(setup_type_id)


def build_default_registry() -> SetupDetectorRegistry:
    from app.engines.trade_setup.detectors.breakout import BreakoutDetector
    from app.engines.trade_setup.detectors.pullback import PullbackDetector
    from app.engines.trade_setup.detectors.range_rejection import RangeRejectionDetector
    from app.engines.trade_setup.detectors.reversal import ReversalDetector
    from app.engines.trade_setup.detectors.trend_continuation import TrendContinuationDetector

    registry = SetupDetectorRegistry()
    for detector_cls in (
        TrendContinuationDetector,
        PullbackDetector,
        BreakoutDetector,
        ReversalDetector,
        RangeRejectionDetector,
    ):
        registry.register(detector_cls())
    return registry
