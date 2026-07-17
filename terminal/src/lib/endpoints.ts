import { apiGet, apiPost, qs } from "./apiClient";
import type {
  AnalysisResultList,
  BacktestTrades,
  CandleList,
  Exchange,
  Fvg,
  Levels,
  LiquiditySweep,
  OrderBlock,
  Paginated,
  PerformanceReport,
  SmcList,
  StrategyDetail,
  StrategyList,
  StructureEvents,
  Symbol,
  TradeSetupList,
  Trend,
  MarketQuote,
  QuoteVerification,
} from "./types";

export const endpoints = {
  exchanges: (signal?: AbortSignal) =>
    apiGet<Paginated<Exchange>>(`/exchanges${qs({ page_size: 100 })}`, signal),

  symbols: (params: { search?: string; exchange?: string; pageSize?: number }, signal?: AbortSignal) =>
    apiGet<Paginated<Symbol>>(
      `/symbols${qs({
        search: params.search,
        exchange_code: params.exchange,
        page_size: params.pageSize ?? 100,
        active_only: true,
      })}`,
      signal,
    ),

  candles: (symbolId: string, timeframe: string, limit = 400, signal?: AbortSignal) =>
    apiGet<CandleList>(`/candles/${symbolId}/latest${qs({ timeframe, limit })}`, signal),

  /** Download + persist candles from the exchange adapter (existing FastAPI). */
  downloadCandles: (
    body: { symbol_id: string; timeframe: string; incremental?: boolean },
    signal?: AbortSignal,
  ) => apiPost<{ symbol_id: string; timeframe: string; candles_written: number }>("/candles/download", body, signal),

  /** Run analysis plugins and persist results. */
  executeAnalysis: (
    body: {
      symbol_id: string;
      timeframe: string;
      plugins: Array<{ plugin_id: string; parameters?: Record<string, unknown> }>;
      candle_limit?: number;
      persist?: boolean;
    },
    signal?: AbortSignal,
  ) => apiPost<{ symbol_id: string; timeframe: string }>("/analysis/execute", body, signal),

  executeMarketStructure: (body: { symbol_id: string; timeframe: string; persist?: boolean }, signal?: AbortSignal) =>
    apiPost("/market-structure/execute", body, signal),

  executeOrderBlocks: (body: { symbol_id: string; timeframe: string; persist?: boolean }, signal?: AbortSignal) =>
    apiPost("/order-blocks/execute", body, signal),

  executeFvgs: (body: { symbol_id: string; timeframe: string; persist?: boolean }, signal?: AbortSignal) =>
    apiPost("/fair-value-gaps/execute", body, signal),

  executeSweeps: (body: { symbol_id: string; timeframe: string; persist?: boolean }, signal?: AbortSignal) =>
    apiPost("/liquidity-sweeps/execute", body, signal),

  executeTradeSetups: (
    body: { symbol_id: string; timeframe: string; ensure_analysis?: boolean; incremental?: boolean },
    signal?: AbortSignal,
  ) => apiPost("/trade-setups/execute", body, signal),

  trend: (symbolId: string, timeframe: string, signal?: AbortSignal) =>
    apiGet<Trend>(`/market-structure/trend/${symbolId}${qs({ timeframe })}`, signal),

  levels: (symbolId: string, timeframe: string, signal?: AbortSignal) =>
    apiGet<Levels>(`/market-structure/levels/${symbolId}${qs({ timeframe })}`, signal),

  events: (symbolId: string, timeframe: string, limit = 80, signal?: AbortSignal) =>
    apiGet<StructureEvents>(`/market-structure/events/${symbolId}${qs({ timeframe, limit })}`, signal),

  orderBlocks: (symbolId: string, timeframe: string, signal?: AbortSignal) =>
    apiGet<SmcList<OrderBlock>>(`/order-blocks/active/${symbolId}${qs({ timeframe })}`, signal),

  fvgs: (symbolId: string, timeframe: string, signal?: AbortSignal) =>
    apiGet<SmcList<Fvg>>(`/fair-value-gaps/active/${symbolId}${qs({ timeframe })}`, signal),

  sweeps: (symbolId: string, timeframe: string, signal?: AbortSignal) =>
    apiGet<SmcList<LiquiditySweep>>(`/liquidity-sweeps/active/${symbolId}${qs({ timeframe })}`, signal),

  activeSetups: (symbolId: string, timeframe: string, limit = 25, signal?: AbortSignal) =>
    apiGet<TradeSetupList>(`/trade-setups/active/${symbolId}${qs({ timeframe, limit })}`, signal),

  historicalSetups: (symbolId: string, timeframe: string, limit = 50, signal?: AbortSignal) =>
    apiGet<TradeSetupList>(`/trade-setups/historical/${symbolId}${qs({ timeframe, limit })}`, signal),

  strategies: (signal?: AbortSignal) => apiGet<StrategyList>("/strategies", signal),

  strategyDetail: (strategyId: string, symbolId: string, timeframe: string, signal?: AbortSignal) =>
    apiGet<StrategyDetail>(`/strategies/${strategyId}${qs({ symbol_id: symbolId, timeframe })}`, signal),

  analysisResults: (
    symbolId: string,
    timeframe: string,
    pluginId: string,
    limit = 400,
    signal?: AbortSignal,
  ) =>
    apiGet<AnalysisResultList>(
      `/analysis/results/${symbolId}${qs({ timeframe, plugin_id: pluginId, limit })}`,
      signal,
    ),

  /** Economic calendar — FastAPI only (may be empty until a provider is wired). */
  calendarEvents: (signal?: AbortSignal) =>
    apiGet<{ date: string; items: Array<{ id: string; title: string; market: string; time_label: string; impact: string }>; total: number }>(
      "/calendar/events",
      signal,
    ),

  backtestStart: (
    body: { symbol_id: string; timeframe: string; strategy_id: string; candle_limit?: number },
    signal?: AbortSignal,
  ) => apiPost<{ run_id: string; status: string; strategy_id: string }>("/backtests/start", body, signal),

  backtestStatus: (runId: string, signal?: AbortSignal) =>
    apiGet<{ run_id: string; status: string; bars_processed: number; final_capital: number | null }>(
      `/backtests/${runId}/status`,
      signal,
    ),

  backtestTrades: (runId: string, signal?: AbortSignal) =>
    apiGet<BacktestTrades>(`/backtests/${runId}/trades`, signal),

  backtestReport: (runId: string, signal?: AbortSignal) =>
    apiGet<PerformanceReport>(`/backtests/${runId}/report`, signal),

  /** Developer: our OHLC vs live provider reference (Binance / Yahoo). */
  ohlcCompare: (symbolId: string, timeframe: string, limit = 40, signal?: AbortSignal) =>
    apiGet<OhlcCompareResult>(`/debug/ohlc-compare/${symbolId}${qs({ timeframe, limit })}`, signal),

  /** Live session quote — current price, day OHLC, prev close, volume, status. */
  quote: (symbolId: string, signal?: AbortSignal) =>
    apiGet<MarketQuote>(`/quotes/${symbolId}`, signal),

  /** Developer: verify quote fields vs fresh provider pull. */
  quoteVerify: (symbolId: string, signal?: AbortSignal) =>
    apiGet<{ quote: MarketQuote; verification: QuoteVerification }>(
      `/debug/quote-verify/${symbolId}`,
      signal,
    ),
};

export interface OhlcCompareResult {
  symbol_id: string;
  symbol_code: string;
  timeframe: string;
  our_source: string;
  reference_provider: string;
  reference_note: string;
  yahoo_ticker: string | null;
  comparison: {
    compared: number;
    mismatches: number;
    match_rate: number;
    price_tolerance_pct: number;
    volume_tolerance_pct?: number;
    time_tolerance_sec: number;
    rows: Array<{
      index: number;
      open_time: string;
      time_diff_sec: number;
      mismatch: boolean;
      open: { ours: number; reference: number; abs: number; pct: number };
      high: { ours: number; reference: number; abs: number; pct: number };
      low: { ours: number; reference: number; abs: number; pct: number };
      close: { ours: number; reference: number; abs: number; pct: number };
      volume?: { ours: number; reference: number; abs: number; pct: number; skipped?: boolean };
    }>;
  };
  our_sample: Array<{ open_time: string; open: number; high: number; low: number; close: number; volume?: number }>;
  reference_sample: Array<{ open_time: string; open: number; high: number; low: number; close: number; volume?: number }>;
}

export const TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

/** Display labels for toolbar (TradingView-style). */
export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1H",
  "4h": "4H",
  "1d": "1D",
  "1w": "1W",
};
