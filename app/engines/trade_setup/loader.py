"""Load aligned analysis results for trade setup detection."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.trade_setup.types import BarAnalysisContext
from app.repositories.analysis_result import AnalysisResultRepository
from app.repositories.candle import CandleRepository

SOURCE_PLUGINS = (
    "market_structure",
    "order_blocks",
    "fair_value_gaps",
    "liquidity_sweeps",
    "rsi",
    "vwap",
    "atr",
)


async def load_aligned_context(
    session: AsyncSession,
    *,
    symbol_id: uuid.UUID,
    timeframe_id: int,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int | None = None,
    scan_from_index: int = 0,
) -> tuple[list[BarAnalysisContext], dict[str, str]]:
    """
    Build per-bar aligned analysis context from persisted plugin results.

    Returns contexts and map of plugin_id -> params_hash used.
    """
    result_repo = AnalysisResultRepository(session)
    candle_repo = CandleRepository(session)

    params_hashes: dict[str, str] = {}
    plugin_bars: dict[str, dict[datetime, dict]] = {}

    for plugin_id in SOURCE_PLUGINS:
        phash = await result_repo.get_latest_params_hash(symbol_id, timeframe_id, plugin_id)
        if phash is None:
            continue
        params_hashes[plugin_id] = phash
        rows = await result_repo.get_results(
            symbol_id,
            timeframe_id,
            plugin_id=plugin_id,
            params_hash=phash,
            start=start,
            end=end,
            limit=limit or 1_000_000,
        )
        plugin_bars[plugin_id] = {r.open_time: r.values for r in rows}

    if not plugin_bars:
        return [], params_hashes

    all_times = sorted(
        {t for bars in plugin_bars.values() for t in bars},
    )

    candles = await candle_repo.get_candles_for_analysis(
        symbol_id,
        timeframe_id,
        start=start,
        end=end,
        limit=limit or len(all_times) or 500,
    )
    candle_by_time = {c.open_time: c for c in candles}

    contexts: list[BarAnalysisContext] = []
    for idx, open_time in enumerate(all_times):
        if idx < scan_from_index:
            continue
        candle = candle_by_time.get(open_time)
        ms = plugin_bars.get("market_structure", {}).get(open_time, {})
        ob = plugin_bars.get("order_blocks", {}).get(open_time, {})
        fvg = plugin_bars.get("fair_value_gaps", {}).get(open_time, {})
        ls = plugin_bars.get("liquidity_sweeps", {}).get(open_time, {})
        rsi_vals = plugin_bars.get("rsi", {}).get(open_time, {})
        vwap_vals = plugin_bars.get("vwap", {}).get(open_time, {})
        atr_vals = plugin_bars.get("atr", {}).get(open_time, {})

        close = float(candle.close) if candle else 0.0
        high = float(candle.high) if candle else close
        low = float(candle.low) if candle else close
        volume = float(candle.volume) if candle else 0.0

        contexts.append(
            BarAnalysisContext(
                open_time=open_time,
                bar_index=idx,
                close=close,
                high=high,
                low=low,
                volume=volume,
                market_structure=ms,
                order_blocks=ob,
                fair_value_gaps=fvg,
                liquidity_sweeps=ls,
                rsi=rsi_vals.get("rsi"),
                vwap=vwap_vals.get("vwap"),
                atr=atr_vals.get("atr"),
            )
        )

    return contexts, params_hashes
