// ---- Reference data -------------------------------------------------------
export interface Exchange {
  id: string;
  code: string;
  name: string;
  country: string | null;
  timezone: string;
  market_types: string[];
  is_active: boolean;
}

export interface Symbol {
  id: string;
  exchange_code: string;
  exchange_name: string;
  market_code: string;
  market_type: string;
  symbol_code: string;
  name: string;
  base_asset: string | null;
  quote_asset: string | null;
  tick_size: number;
  lot_size: number;
  is_active: boolean;
  /** Optional instrument class from API (index, equity, etf, futures, …). */
  instrument?: string;
}

/** Minimal symbol reference persisted in local prefs. */
export interface SymbolLite {
  id: string;
  symbol_code: string;
  name: string;
  exchange_code: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

// ---- Market data ----------------------------------------------------------
export interface Candle {
  symbol_id: string;
  symbol_code: string;
  timeframe: string;
  open_time: string;
  close_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  is_complete: boolean;
}

export interface CandleList {
  items: Candle[];
  total: number;
  symbol_id: string;
  timeframe: string;
}

/** Live session quote from the configured market data provider. */
export interface MarketQuote {
  symbol_id: string;
  symbol_code: string;
  current_price: number;
  day_open: number;
  day_high: number;
  day_low: number;
  prev_close: number;
  prev_day_high: number;
  prev_day_low: number;
  day_change: number;
  day_change_pct: number;
  day_range: number;
  volume: number;
  avg_volume: number;
  vwap: number;
  market_status: "OPEN" | "CLOSED";
  last_updated: string;
  provider: string;
  source: string;
  reference_note?: string;
  yahoo_ticker?: string | null;
}

export interface QuoteVerification {
  ok: boolean;
  mismatches: number;
  checks: Array<{
    field: string;
    ours: number | string;
    reference: number | string;
    pct_diff: number;
    tolerance_pct: number;
    unit?: string;
  }>;
  reference_provider: string;
  compared_at: string;
}

// ---- Market structure -----------------------------------------------------
export interface Trend {
  symbol_id: string;
  timeframe: string;
  as_of: string;
  trend: string;
  market_phase: string;
  phase_confidence: number;
  confidence: number;
}

export interface DynamicLevel {
  price: number;
  strength: number;
  touches: number;
  created_at: string;
  last_validated_at: string;
}

export interface Levels {
  symbol_id: string;
  timeframe: string;
  as_of: string;
  support_levels: DynamicLevel[];
  resistance_levels: DynamicLevel[];
}

export interface StructureEvent {
  event_type: string;
  broken_swing_price: number;
  break_price: number;
  break_time: string;
  open_time: string;
}

export interface StructureEvents {
  symbol_id: string;
  timeframe: string;
  bos_events: StructureEvent[];
  choch_events: StructureEvent[];
  total: number;
}

// ---- Smart money concepts -------------------------------------------------
export interface OrderBlock {
  order_block_id: string;
  type: string;
  zone_high: number;
  zone_low: number;
  status: string;
  mitigation_state: string;
  touch_count: number;
  strength_score: number;
  strength_components: Record<string, number>;
  confidence: number;
  explanation: string;
  created_at: string;
  timeframe_code: string;
}

export interface Fvg {
  fvg_id: string;
  type: string;
  gap_high: number;
  gap_low: number;
  gap_size: number;
  gap_percent: number;
  status: string;
  fill_state: string;
  fill_percentage: number;
  quality_score: number;
  quality_components: Record<string, number>;
  confidence: number;
  explanation: string;
  created_at: string;
}

export interface LiquiditySweep {
  sweep_id: string;
  type: string;
  sweep_level: number;
  level_type: string;
  penetration_depth: number;
  status: string;
  strength_score: number;
  strength_components: Record<string, number>;
  confirmation_components: Record<string, number>;
  confidence: number;
  explanation: string;
  created_at: string;
  confirmed_at: string | null;
  failed_at: string | null;
  invalidated_at: string | null;
}

export interface SmcList<T> {
  symbol_id: string;
  timeframe: string;
  as_of: string | null;
  items: T[];
  total: number;
}

// ---- Trade setups ---------------------------------------------------------
export interface SetupZone {
  high: number;
  low: number;
  label: string;
}

export interface TradeSetup {
  setup_id: string;
  setup_type: string;
  direction: string;
  confidence_score: number;
  confidence_level: string;
  evidence_scores: Record<string, number>;
  entry_zone: SetupZone;
  stop_loss_zone: SetupZone;
  target_zones: SetupZone[];
  risk_reward: number | null;
  status: string;
  signal_state?: string;
  explanation: string;
  reference_ids: Record<string, unknown>;
  detected_at: string;
  engine_version: string;
}

export interface TradeSetupList {
  symbol_id: string;
  timeframe: string;
  items: TradeSetup[];
  total: number;
}

// ---- Strategies -----------------------------------------------------------
export interface StrategyMetadata {
  strategy_id: string;
  strategy_name: string;
  strategy_version: string;
  description: string;
  supported_markets: string[];
  supported_timeframes: string[];
  required_setup_types: string[];
  default_parameters: Record<string, unknown>;
}

export interface StrategyList {
  items: StrategyMetadata[];
  total: number;
}

export interface TradePlan {
  plan_id: string;
  strategy_id: string;
  setup_id: string;
  direction: string;
  entry_zone: Record<string, number>;
  stop_loss: number;
  target_1: number;
  target_2: number;
  target_3: number | null;
  risk_reward: number;
  trade_expiration_bars: number;
  position_risk_pct: number;
  strategy_confidence: number;
  reasoning: string;
  detected_at: string;
}

export interface StrategyDetail {
  strategy: StrategyMetadata;
  recent_plans: TradePlan[];
}

// ---- Analysis results (indicator overlays) --------------------------------
export interface AnalysisBar {
  open_time: string;
  plugin_id: string;
  plugin_version: string;
  params_hash: string;
  values: Record<string, unknown>;
  computed_at: string;
}

export interface AnalysisResultList {
  symbol_id: string;
  timeframe: string;
  plugin_id: string | null;
  items: AnalysisBar[];
  total: number;
}

// ---- Backtests ------------------------------------------------------------
export interface BacktestTrade {
  trade_id: string;
  plan_id: string;
  setup_id: string;
  direction: string;
  entry_time: string;
  exit_time: string | null;
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  pnl: number;
  pnl_pct: number;
  commission: number;
  exit_reason: string | null;
  bars_held: number;
}

export interface BacktestTrades {
  run_id: string;
  items: BacktestTrade[];
  total: number;
}

export interface PerformanceReport {
  run_id: string;
  metrics: Record<string, unknown>;
  equity_curve: Record<string, unknown>[];
  monthly_returns: Record<string, number>;
  yearly_returns: Record<string, number>;
  walk_forward_segments: Record<string, unknown>[];
  generated_at: string;
}

// ---- Derived view models --------------------------------------------------
export interface Opportunity {
  symbol: SymbolLite;
  setup: TradeSetup;
}

export interface ScanRow {
  symbol: SymbolLite;
  trend: Trend | null;
  topSetup: TradeSetup | null;
  setupCount: number;
}

export type EventKind = "BOS" | "CHoCH" | "Setup" | "Sweep";

export interface TimelineEvent {
  id: string;
  kind: EventKind;
  label: string;
  detail: string;
  tone: "bull" | "bear" | "neutral" | "warn" | "info";
  at: string;
}
