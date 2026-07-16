"""Unit tests for Replay Studio engine."""

from datetime import UTC, datetime

from app.engines.replay_studio.engine import ReplayStudioEngine
from app.engines.replay_studio.types import ReplayCandle, ReplaySession


def _session(n: int = 20) -> ReplaySession:
    candles = [
        ReplayCandle(
            open_time=datetime(2024, 1, 1, tzinfo=UTC),
            open=100 + i,
            high=102 + i,
            low=99 + i,
            close=101 + i,
            volume=1000,
        )
        for i in range(n)
    ]
    # Fix times to be unique
    for i, c in enumerate(candles):
        c.open_time = datetime(2024, 1, 1, i, tzinfo=UTC)

    return ReplaySession(
        session_id=__import__("uuid").uuid4(),
        symbol_id=__import__("uuid").uuid4(),
        symbol_code="BTCUSDT",
        timeframe_id=1,
        timeframe_code="1h",
        candles=candles,
        analysis_by_plugin={},
        params_hashes={},
        trade_setups=[],
        strategy_decisions=[],
        events=[],
        time_to_index={c.open_time: i for i, c in enumerate(candles)},
    )


def test_step_forward_never_exceeds_bounds() -> None:
    session = _session(10)
    engine = ReplayStudioEngine()
    for _ in range(20):
        engine.step_forward(session)
    assert session.current_index == 9


def test_frame_never_reveals_future_candles() -> None:
    session = _session(15)
    session.current_index = 5
    engine = ReplayStudioEngine()
    frame = engine.build_frame(session)
    assert len(frame["candles"]) == 6
    assert frame["current_index"] == 5


def test_jump_to_date() -> None:
    session = _session(24)
    engine = ReplayStudioEngine()
    target = datetime(2024, 1, 1, 10, tzinfo=UTC)
    idx = engine.jump_to_date(session, target)
    assert idx == 10


def test_replay_consistency_same_index_same_frame() -> None:
    session = _session(30)
    session.current_index = 12
    engine = ReplayStudioEngine()
    first = engine.build_frame(session)
    second = engine.build_frame(session)
    assert first["candles"] == second["candles"]
    assert first["current_index"] == second["current_index"]
