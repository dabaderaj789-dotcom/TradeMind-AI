export interface SymbolItem {
  id: string;
  code: string;
  name: string;
}

export interface ReplaySession {
  session_id: string;
  symbol_id: string;
  symbol_code: string;
  timeframe: string;
  total_bars: number;
  current_index: number;
  current_time: string | null;
  playback_state: string;
  replay_speed: number;
  debug_mode: boolean;
  validation_mode?: boolean;
  events_count: number;
  engine_version: string;
}

export interface CandlePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  open_time: string;
}

export interface ReplayFrame {
  session_id: string;
  current_index: number;
  total_bars: number;
  current_time: string | null;
  playback_state: string;
  replay_speed: number;
  candles: CandlePoint[];
  overlays: Record<string, unknown>;
  visible_events: ReplayEvent[];
}

export interface ReplayEvent {
  event_id: string;
  event_type: string;
  bar_index: number;
  open_time: string;
  label: string;
  direction?: string;
  price?: number;
  metadata?: Record<string, unknown>;
}

export interface InspectorData {
  bar_index: number;
  open_time: string;
  candle: Record<string, unknown>;
  indicators: Record<string, unknown>;
  market_structure: Record<string, unknown>;
  smart_money: Record<string, unknown>;
  trade_setup: Record<string, unknown> | null;
  strategy_evaluation: Record<string, unknown> | null;
  confidence_scores: Record<string, number>;
  evidence_breakdown: Record<string, number>;
  reasoning: string | null;
}

export interface DebugData {
  debug_mode: boolean;
  current_index: number;
  open_time: string | null;
  execution_order: string[];
  params_hashes: Record<string, string>;
  raw_plugin_outputs: Record<string, unknown>;
  json_payloads: Record<string, unknown>;
}

export interface MetricsData {
  metrics: {
    candles_loaded: number;
    plugins_loaded: number;
    events_extracted: number;
    total_load_ms: number;
    db_query_ms: number;
    memory_estimate_bytes: number;
    cache_hits: number;
    cache_misses: number;
    plugin_timings: Array<{
      plugin_id: string;
      duration_ms: number;
      rows_loaded: number;
      cache_hit: boolean;
    }>;
  };
  tick_interval_ms: number;
}

export type OverlayKey =
  | "ema"
  | "sma"
  | "rsi"
  | "macd"
  | "atr"
  | "vwap"
  | "market_structure"
  | "order_blocks"
  | "fair_value_gaps"
  | "liquidity_sweeps"
  | "trade_setups"
  | "strategy_decisions";

export const OVERLAY_OPTIONS: { key: OverlayKey; label: string; group: string }[] = [
  { key: "ema", label: "EMA", group: "Indicators" },
  { key: "sma", label: "SMA", group: "Indicators" },
  { key: "rsi", label: "RSI", group: "Indicators" },
  { key: "macd", label: "MACD", group: "Indicators" },
  { key: "atr", label: "ATR", group: "Indicators" },
  { key: "vwap", label: "VWAP", group: "Indicators" },
  { key: "market_structure", label: "Market Structure", group: "SMC" },
  { key: "order_blocks", label: "Order Blocks", group: "SMC" },
  { key: "fair_value_gaps", label: "Fair Value Gaps", group: "SMC" },
  { key: "liquidity_sweeps", label: "Liquidity Sweeps", group: "SMC" },
  { key: "trade_setups", label: "Trade Setups", group: "Engine" },
  { key: "strategy_decisions", label: "Strategy Decisions", group: "Engine" },
];
