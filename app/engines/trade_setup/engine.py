"""Trade Setup Engine orchestrator."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.engines.trade_setup.detectors.base import SetupDetectorRegistry, build_default_registry
from app.engines.trade_setup.evidence import extract_evidence
from app.engines.trade_setup.scoring import DEFAULT_EVIDENCE_WEIGHTS, score_candidate
from app.engines.trade_setup.types import (
    ENGINE_VERSION,
    ScoredTradeSetup,
    SetupStatus,
    SetupType,
    BarAnalysisContext,
)


@dataclass
class TradeSetupEngineConfig:
    evidence_weights: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_EVIDENCE_WEIGHTS))
    min_confidence: float = 45.0
    expiration_bars: int = 20
    enabled_setup_types: list[str] | None = None
    scan_bars: int | None = None


@dataclass
class TradeSetupEngineResult:
    setups: list[ScoredTradeSetup]
    engine_version: str
    bars_scanned: int


class TradeSetupEngine:
    """Deterministic trade setup detection from aligned plugin evidence."""

    def __init__(self, registry: SetupDetectorRegistry | None = None) -> None:
        self._registry = registry or build_default_registry()

    @property
    def engine_version(self) -> str:
        return ENGINE_VERSION

    def detect(
        self,
        contexts: list[BarAnalysisContext],
        config: TradeSetupEngineConfig,
    ) -> TradeSetupEngineResult:
        if not contexts:
            return TradeSetupEngineResult(setups=[], engine_version=ENGINE_VERSION, bars_scanned=0)

        scan_contexts = contexts
        if config.scan_bars is not None and config.scan_bars > 0:
            scan_contexts = contexts[-config.scan_bars :]

        enabled = set(config.enabled_setup_types or [d.setup_type_id for d in self._registry.all()])
        detectors = [d for d in self._registry.all() if d.setup_type_id in enabled]

        all_setups: list[ScoredTradeSetup] = []
        seen_keys: set[str] = set()

        for ctx in scan_contexts:
            evidence = extract_evidence(ctx)
            for detector in detectors:
                candidate = detector.detect(ctx, evidence)
                if candidate is None:
                    continue

                scored = score_candidate(
                    candidate,
                    weights=config.evidence_weights,
                    min_confidence=config.min_confidence,
                    expiration_bars=config.expiration_bars,
                )
                if scored is None:
                    continue

                dedupe_key = (
                    f"{scored.setup_type.value}:{scored.direction.value}:"
                    f"{round(scored.entry_zone.low, 4)}:{round(scored.entry_zone.high, 4)}"
                )
                if dedupe_key in seen_keys:
                    continue
                seen_keys.add(dedupe_key)
                all_setups.append(scored)

        self._apply_expiration(all_setups, scan_contexts)
        return TradeSetupEngineResult(
            setups=all_setups,
            engine_version=ENGINE_VERSION,
            bars_scanned=len(scan_contexts),
        )

    def _apply_expiration(
        self,
        setups: list[ScoredTradeSetup],
        contexts: list[BarAnalysisContext],
    ) -> None:
        if not contexts:
            return
        last_index = contexts[-1].bar_index
        for setup in setups:
            if last_index > setup.expires_index:
                setup.status = SetupStatus.EXPIRED
