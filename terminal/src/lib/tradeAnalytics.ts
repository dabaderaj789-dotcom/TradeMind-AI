import type { MarketId } from "./markets";
import type { AiDecision } from "./decision";
import type { PredictivePlan, SignalState } from "./predictiveSignal";

/** Lifecycle events for every generated trade plan. */
export type OutcomeEventType =
  | "entry_generated"
  | "entry_triggered"
  | "entry_missed"
  | "stop_hit"
  | "target_1_hit"
  | "target_2_hit"
  | "target_3_hit"
  | "expired"
  | "cancelled";

export interface OutcomeEvent {
  type: OutcomeEventType;
  at: string;
  price?: number;
  note?: string;
}

export interface TradeReview {
  whyWorked: string;
  whyFailed: string;
  strongestRule: string;
  failedRule: string;
  wouldTakeAgain: boolean;
  summary: string;
}

export type BenchmarkTag =
  | "false_positive"
  | "false_negative"
  | "late_entry"
  | "early_entry"
  | "missed_trade"
  | "cancelled_trade";

export interface TrackedTrade {
  id: string;
  setup_id: string;
  symbol_id: string;
  symbol_code: string;
  market: MarketId | string;
  timeframe: string;
  strategy_id: string | null;
  strategy_name: string;
  setup_type: string;
  direction: "buy" | "sell";
  confidence: number;
  institutional_score: number;
  risk_reward: number | null;
  entry: number;
  stop: number;
  target1: number;
  target2: number | null;
  target3: number | null;
  events: OutcomeEvent[];
  /** Latest lifecycle state */
  status: OutcomeEventType;
  exit_price: number | null;
  /** Realized R multiples (positive = win) */
  pnl_r: number | null;
  won: boolean | null;
  holding_ms: number | null;
  review: TradeReview | null;
  benchmarks: BenchmarkTag[];
  quality_checks_passed: number;
  quality_checks_total: number;
  created_at: string;
  updated_at: string;
  completed: boolean;
}

export interface StrategyStats {
  strategy_id: string;
  strategy_name: string;
  total_signals: number;
  active_signals: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  average_rr: number;
  average_holding_ms: number;
  max_drawdown_r: number;
  profit_factor: number;
  signal_quality: number;
}

export interface SymbolStats {
  symbol_id: string;
  symbol_code: string;
  market: string;
  win_rate: number;
  signal_count: number;
  average_rr: number;
  best_strategy: string;
  worst_strategy: string;
}

export interface TimeframeStats {
  timeframe: string;
  win_rate: number;
  accuracy: number;
  average_rr: number;
  signal_count: number;
}

export interface CalibrationBucket {
  label: string;
  predicted_min: number;
  predicted_max: number;
  count: number;
  actual_win_rate: number;
  avg_confidence: number;
  calibrated: boolean;
}

export interface BenchmarkStats {
  false_positives: number;
  false_negatives: number;
  late_entries: number;
  early_entries: number;
  missed_trades: number;
  cancelled_trades: number;
}

export interface ImprovementReport {
  generated_at: string;
  period_label: string;
  best_setup: string;
  worst_setup: string;
  most_common_failure: string;
  most_successful_market: string;
  most_successful_timeframe: string;
  suggested_improvements: string[];
  sample_size: number;
}

export interface PerformanceSnapshot {
  trades: TrackedTrade[];
  strategies: StrategyStats[];
  symbols: SymbolStats[];
  timeframes: TimeframeStats[];
  leaderboard: StrategyStats[];
  by_market: Record<string, StrategyStats[]>;
  calibration: CalibrationBucket[];
  benchmarks: BenchmarkStats;
  weekly: ImprovementReport;
}

const TERMINAL: OutcomeEventType[] = [
  "stop_hit",
  "target_1_hit",
  "target_2_hit",
  "target_3_hit",
  "expired",
  "cancelled",
  "entry_missed",
];

function hasEvent(t: TrackedTrade, type: OutcomeEventType): boolean {
  return t.events.some((e) => e.type === type);
}

function riskAbs(t: TrackedTrade): number {
  return Math.max(Math.abs(t.entry - t.stop), 1e-9);
}

function pushEvent(t: TrackedTrade, type: OutcomeEventType, price?: number, note?: string): TrackedTrade {
  if (hasEvent(t, type) && type !== "entry_generated") return t;
  const at = new Date().toISOString();
  const events = [...t.events, { type, at, price, note }];
  return { ...t, events, status: type, updated_at: at };
}

function buildReview(t: TrackedTrade): TradeReview {
  const won = t.won === true;
  const checks = `${t.quality_checks_passed}/${t.quality_checks_total}`;
  if (won) {
    return {
      whyWorked: `Price reached target after ${t.setup_type.replace(/_/g, " ")} with ${Math.round(t.confidence)}% confidence and institutional score support.`,
      whyFailed: "—",
      strongestRule: t.institutional_score >= 80 ? "Institutional score / MTF confluence" : "Setup geometry & R:R",
      failedRule: "—",
      wouldTakeAgain: t.confidence >= 70 && (t.risk_reward ?? 0) >= 1.5,
      summary: `Win · ${t.pnl_r?.toFixed(2) ?? "—"}R · quality gates ${checks}. Engine would ${t.confidence >= 70 ? "take again" : "require higher confidence"}.`,
    };
  }
  if (t.status === "stop_hit") {
    return {
      whyWorked: "—",
      whyFailed: "Stop was hit before targets — structure invalidation or premature entry.",
      strongestRule: "Risk defined (stop placement)",
      failedRule: t.benchmarks.includes("early_entry")
        ? "Entry timing (early)"
        : t.benchmarks.includes("late_entry")
          ? "Entry timing (late)"
          : "Directional edge / confluence",
      wouldTakeAgain: false,
      summary: `Loss · ${t.pnl_r?.toFixed(2) ?? "—"}R. Same trade would be rejected after review unless confluence improves.`,
    };
  }
  if (t.status === "entry_missed" || t.status === "expired") {
    return {
      whyWorked: "—",
      whyFailed: "Entry zone never filled before expiry — signal did not become a live trade.",
      strongestRule: "Patience (did not chase)",
      failedRule: "Entry timing / zone placement",
      wouldTakeAgain: (t.confidence ?? 0) >= 75,
      summary: "Missed · no fill. Engine correctly avoided chasing; zone may need tighter placement.",
    };
  }
  return {
    whyWorked: "—",
    whyFailed: t.status === "cancelled" ? "Plan cancelled when confluence broke." : "Incomplete.",
    strongestRule: "Self-review gate",
    failedRule: "Confluence stability",
    wouldTakeAgain: false,
    summary: `Closed as ${t.status.replace(/_/g, " ")}.`,
  };
}

function tagBenchmarks(t: TrackedTrade, entryPrice?: number): BenchmarkTag[] {
  const tags: BenchmarkTag[] = [];
  if (t.status === "stop_hit") tags.push("false_positive");
  if (t.status === "entry_missed" || t.status === "expired") tags.push("missed_trade");
  if (t.status === "cancelled") tags.push("cancelled_trade");
  if (hasEvent(t, "entry_triggered") && entryPrice != null && t.entry > 0) {
    const distPct = Math.abs(entryPrice - t.entry) / t.entry;
    if (distPct > 0.004) tags.push("late_entry");
    else if (distPct < 0.0005 && t.direction === "buy" && entryPrice > t.entry) tags.push("early_entry");
  }
  return [...new Set(tags)];
}

/** Map predictive UI state → outcome event types to record. */
export function eventsFromPlanState(state: SignalState, flags: PredictivePlan["hitFlags"]): OutcomeEventType[] {
  const out: OutcomeEventType[] = [];
  if (flags.entry || state === "Active Trade" || state === "Partial Profit" || state === "Target Hit" || state === "Stop Hit") {
    out.push("entry_triggered");
  }
  if (flags.t1 || state === "Partial Profit") out.push("target_1_hit");
  if (flags.t2) out.push("target_2_hit");
  if (flags.t3 || (state === "Target Hit" && flags.t1)) {
    if (flags.t3) out.push("target_3_hit");
    else if (state === "Target Hit") out.push(flags.t2 ? "target_2_hit" : "target_1_hit");
  }
  if (flags.stop || state === "Stop Hit") out.push("stop_hit");
  if (state === "Expired") {
    out.push(flags.entry ? "expired" : "entry_missed");
  }
  return out;
}

export function createTrackedTrade(opts: {
  plan: PredictivePlan;
  decision: AiDecision;
  symbolId: string;
  symbolCode: string;
  market: string;
  timeframe: string;
}): TrackedTrade {
  const { plan, decision, symbolId, symbolCode, market, timeframe } = opts;
  const now = new Date().toISOString();
  const id = `${symbolId}:${timeframe}:${plan.setup.setup_id}`;
  return {
    id,
    setup_id: plan.setup.setup_id,
    symbol_id: symbolId,
    symbol_code: symbolCode,
    market,
    timeframe,
    strategy_id: decision.strategyId,
    strategy_name: plan.strategyName,
    setup_type: plan.setup.setup_type,
    direction: plan.direction,
    confidence: plan.confidence,
    institutional_score: decision.institutional.score,
    risk_reward: plan.riskReward,
    entry: plan.entry,
    stop: plan.stop,
    target1: plan.target1,
    target2: plan.target2,
    target3: plan.target3,
    events: [{ type: "entry_generated", at: now, price: plan.lastPrice, note: plan.state }],
    status: "entry_generated",
    exit_price: null,
    pnl_r: null,
    won: null,
    holding_ms: null,
    review: null,
    benchmarks: [],
    quality_checks_passed: decision.qualityChecks.filter((c) => c.passed).length,
    quality_checks_total: decision.qualityChecks.length,
    created_at: now,
    updated_at: now,
    completed: false,
  };
}

/** Apply new lifecycle events; finalize when terminal. */
export function applyOutcomeEvents(
  trade: TrackedTrade,
  eventTypes: OutcomeEventType[],
  price: number,
): TrackedTrade {
  let next = trade;
  for (const type of eventTypes) {
    if (hasEvent(next, type)) continue;
    next = pushEvent(next, type, price);
  }

  const triggered = hasEvent(next, "entry_triggered");
  const entryEvt = next.events.find((e) => e.type === "entry_triggered");
  const entryPx = entryEvt?.price ?? next.entry;

  if (TERMINAL.includes(next.status) || hasEvent(next, "stop_hit") || hasEvent(next, "target_1_hit")) {
    const stop = hasEvent(next, "stop_hit");
    const t3 = hasEvent(next, "target_3_hit");
    const t2 = hasEvent(next, "target_2_hit");
    const t1 = hasEvent(next, "target_1_hit");

    let exit = price;
    let won: boolean | null = null;
    let pnl_r: number | null = null;

    if (stop && triggered) {
      exit = next.stop;
      won = false;
      pnl_r = -1;
      next = { ...next, status: "stop_hit" };
    } else if (t3 || t2 || t1) {
      exit = t3 ? next.target3 ?? next.target1 : t2 ? next.target2 ?? next.target1 : next.target1;
      won = true;
      const reward = Math.abs(exit - next.entry);
      pnl_r = reward / riskAbs(next);
      next = {
        ...next,
        status: t3 ? "target_3_hit" : t2 ? "target_2_hit" : "target_1_hit",
      };
    } else if (next.status === "entry_missed" || next.status === "expired" || next.status === "cancelled") {
      won = null;
      pnl_r = null;
    }

    const gen = next.events.find((e) => e.type === "entry_generated")?.at ?? next.created_at;
    const end = next.updated_at;
    const holding_ms = triggered ? new Date(end).getTime() - new Date(entryEvt?.at ?? gen).getTime() : null;
    const completed = TERMINAL.includes(next.status);
    const benchmarks = tagBenchmarks({ ...next, exit_price: exit, won, pnl_r }, entryPx);
    const withMeta: TrackedTrade = {
      ...next,
      exit_price: exit,
      won,
      pnl_r,
      holding_ms,
      benchmarks,
      completed,
    };
    return { ...withMeta, review: completed ? buildReview(withMeta) : null };
  }

  return next;
}

export function cancelTrackedTrade(trade: TrackedTrade, price: number, note?: string): TrackedTrade {
  if (trade.completed) return trade;
  const next = pushEvent(trade, "cancelled", price, note);
  const benchmarks = tagBenchmarks(next);
  const finalized: TrackedTrade = {
    ...next,
    completed: true,
    won: null,
    pnl_r: null,
    benchmarks,
  };
  return { ...finalized, review: buildReview(finalized) };
}

function completedTrades(trades: TrackedTrade[]): TrackedTrade[] {
  return trades.filter((t) => t.completed && (t.won === true || t.won === false));
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function strategyStatsFor(name: string, id: string, trades: TrackedTrade[]): StrategyStats {
  const all = trades.filter((t) => t.strategy_name === name || t.strategy_id === id);
  const done = completedTrades(all);
  const wins = done.filter((t) => t.won);
  const losses = done.filter((t) => t.won === false);
  const winSum = wins.reduce((s, t) => s + Math.max(t.pnl_r ?? 0, 0), 0);
  const lossSum = Math.abs(losses.reduce((s, t) => s + Math.min(t.pnl_r ?? 0, 0), 0));
  const equity: number[] = [];
  let eq = 0;
  let peak = 0;
  let maxDd = 0;
  for (const t of done) {
    eq += t.pnl_r ?? 0;
    equity.push(eq);
    peak = Math.max(peak, eq);
    maxDd = Math.max(maxDd, peak - eq);
  }
  return {
    strategy_id: id || name,
    strategy_name: name,
    total_signals: all.length,
    active_signals: all.filter((t) => !t.completed).length,
    winning_trades: wins.length,
    losing_trades: losses.length,
    win_rate: done.length ? (wins.length / done.length) * 100 : 0,
    average_rr: avg(
      done.map((t) => (t.pnl_r != null && t.pnl_r > 0 ? t.pnl_r : t.risk_reward ?? 0)).filter((x) => x > 0),
    ),
    average_holding_ms: avg(done.map((t) => t.holding_ms ?? 0).filter(Boolean)),
    max_drawdown_r: maxDd,
    profit_factor: lossSum > 0 ? winSum / lossSum : winSum > 0 ? 99 : 0,
    signal_quality: avg(all.map((t) => t.institutional_score)),
  };
}

export function computePerformanceSnapshot(trades: TrackedTrade[]): PerformanceSnapshot {
  const strategyNames = [...new Set(trades.map((t) => t.strategy_name))];
  const strategies = strategyNames.map((n) => {
    const sample = trades.find((t) => t.strategy_name === n);
    return strategyStatsFor(n, sample?.strategy_id ?? n, trades);
  });

  const leaderboard = [...strategies].sort((a, b) => {
    const score = (s: StrategyStats) => s.win_rate * 0.35 + s.profit_factor * 15 + s.average_rr * 10 + s.signal_quality * 0.2;
    return score(b) - score(a);
  });

  const markets = [...new Set(trades.map((t) => t.market))];
  const by_market: Record<string, StrategyStats[]> = {};
  for (const m of markets) {
    const subset = trades.filter((t) => t.market === m);
    const names = [...new Set(subset.map((t) => t.strategy_name))];
    by_market[m] = names
      .map((n) => strategyStatsFor(n, subset.find((t) => t.strategy_name === n)?.strategy_id ?? n, subset))
      .sort((a, b) => b.win_rate - a.win_rate);
  }

  const symbolIds = [...new Set(trades.map((t) => t.symbol_id))];
  const symbols: SymbolStats[] = symbolIds.map((sid) => {
    const subset = trades.filter((t) => t.symbol_id === sid);
    const done = completedTrades(subset);
    const byStrat = new Map<string, { w: number; n: number }>();
    for (const t of done) {
      const cur = byStrat.get(t.strategy_name) ?? { w: 0, n: 0 };
      cur.n += 1;
      if (t.won) cur.w += 1;
      byStrat.set(t.strategy_name, cur);
    }
    let best = "—";
    let worst = "—";
    let bestRate = -1;
    let worstRate = 101;
    for (const [name, { w, n }] of byStrat) {
      const r = (w / n) * 100;
      if (r > bestRate) {
        bestRate = r;
        best = name;
      }
      if (r < worstRate) {
        worstRate = r;
        worst = name;
      }
    }
    return {
      symbol_id: sid,
      symbol_code: subset[0]?.symbol_code ?? sid,
      market: subset[0]?.market ?? "—",
      win_rate: done.length ? (done.filter((t) => t.won).length / done.length) * 100 : 0,
      signal_count: subset.length,
      average_rr: avg(done.map((t) => Math.abs(t.pnl_r ?? t.risk_reward ?? 0))),
      best_strategy: best,
      worst_strategy: worst === best && byStrat.size < 2 ? "—" : worst,
    };
  });

  const tfs = ["15m", "1h", "4h", "1d"];
  const timeframes: TimeframeStats[] = tfs.map((tf) => {
    const subset = trades.filter((t) => t.timeframe === tf);
    const done = completedTrades(subset);
    const wins = done.filter((t) => t.won).length;
    return {
      timeframe: tf,
      win_rate: done.length ? (wins / done.length) * 100 : 0,
      accuracy: subset.length
        ? (subset.filter((t) => t.completed && t.won !== null).length / subset.length) * 100
        : 0,
      average_rr: avg(done.map((t) => Math.abs(t.pnl_r ?? 0))),
      signal_count: subset.length,
    };
  });

  const buckets = [
    { label: "90–100", min: 90, max: 100 },
    { label: "80–89", min: 80, max: 89.999 },
    { label: "70–79", min: 70, max: 79.999 },
    { label: "60–69", min: 60, max: 69.999 },
    { label: "<60", min: 0, max: 59.999 },
  ];
  const calibration: CalibrationBucket[] = buckets.map((b) => {
    const done = completedTrades(trades).filter((t) => t.confidence >= b.min && t.confidence <= b.max);
    const wr = done.length ? (done.filter((t) => t.won).length / done.length) * 100 : 0;
    const mid = (b.min + b.max) / 2;
    return {
      label: b.label,
      predicted_min: b.min,
      predicted_max: b.max,
      count: done.length,
      actual_win_rate: wr,
      avg_confidence: avg(done.map((t) => t.confidence)),
      calibrated: done.length >= 5 ? Math.abs(wr - mid) <= 15 : done.length === 0,
    };
  });

  const benchmarks: BenchmarkStats = {
    false_positives: trades.filter((t) => t.benchmarks.includes("false_positive")).length,
    false_negatives: trades.filter((t) => t.benchmarks.includes("false_negative")).length,
    late_entries: trades.filter((t) => t.benchmarks.includes("late_entry")).length,
    early_entries: trades.filter((t) => t.benchmarks.includes("early_entry")).length,
    missed_trades: trades.filter((t) => t.benchmarks.includes("missed_trade")).length,
    cancelled_trades: trades.filter((t) => t.benchmarks.includes("cancelled_trade")).length,
  };

  const weekAgo = Date.now() - 7 * 86400000;
  const weeklyTrades = trades.filter((t) => new Date(t.created_at).getTime() >= weekAgo);
  const setupCounts = new Map<string, { w: number; n: number; fail: number }>();
  for (const t of weeklyTrades.length ? weeklyTrades : trades) {
    const cur = setupCounts.get(t.setup_type) ?? { w: 0, n: 0, fail: 0 };
    cur.n += 1;
    if (t.won) cur.w += 1;
    if (t.won === false || t.status === "stop_hit") cur.fail += 1;
    setupCounts.set(t.setup_type, cur);
  }
  let bestSetup = "—";
  let worstSetup = "—";
  let bestWr = -1;
  let worstWr = 101;
  for (const [k, v] of setupCounts) {
    if (!v.n) continue;
    const wr = (v.w / v.n) * 100;
    if (wr > bestWr) {
      bestWr = wr;
      bestSetup = k.replace(/_/g, " ");
    }
    if (wr < worstWr) {
      worstWr = wr;
      worstSetup = k.replace(/_/g, " ");
    }
  }

  const failureReasons = new Map<string, number>();
  for (const t of trades) {
    if (!t.review?.failedRule || t.review.failedRule === "—") continue;
    failureReasons.set(t.review.failedRule, (failureReasons.get(t.review.failedRule) ?? 0) + 1);
  }
  const mostFail = [...failureReasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Insufficient sample";

  const marketWins = new Map<string, { w: number; n: number }>();
  for (const t of completedTrades(trades)) {
    const cur = marketWins.get(String(t.market)) ?? { w: 0, n: 0 };
    cur.n += 1;
    if (t.won) cur.w += 1;
    marketWins.set(String(t.market), cur);
  }
  const bestMarket =
    [...marketWins.entries()].sort((a, b) => b[1].w / Math.max(b[1].n, 1) - a[1].w / Math.max(a[1].n, 1))[0]?.[0] ??
    "—";
  const bestTf = [...timeframes].sort((a, b) => b.win_rate - a.win_rate)[0];

  const suggested: string[] = [];
  if (benchmarks.false_positives > benchmarks.missed_trades) {
    suggested.push("Raise institutional / confidence gates — false positives exceed missed trades.");
  }
  if (benchmarks.late_entries > 0) {
    suggested.push("Tighten entry zones or alert earlier — late entries detected.");
  }
  if (calibration.some((c) => c.count >= 5 && !c.calibrated)) {
    suggested.push("Recalibrate confidence model — predicted confidence diverges from realized win rate.");
  }
  if (bestTf && bestTf.signal_count > 0) {
    suggested.push(`Prefer ${bestTf.timeframe} setups where win rate is highest (${bestTf.win_rate.toFixed(0)}%).`);
  }
  if (!suggested.length) {
    suggested.push("Collect more completed outcomes before changing parameters.");
  }

  const weekly: ImprovementReport = {
    generated_at: new Date().toISOString(),
    period_label: weeklyTrades.length ? "Last 7 days" : "All history",
    best_setup: bestSetup,
    worst_setup: worstSetup,
    most_common_failure: mostFail,
    most_successful_market: bestMarket,
    most_successful_timeframe: bestTf?.timeframe ?? "—",
    suggested_improvements: suggested,
    sample_size: weeklyTrades.length || trades.length,
  };

  return {
    trades,
    strategies,
    symbols,
    timeframes,
    leaderboard,
    by_market,
    calibration,
    benchmarks,
    weekly,
  };
}

export function fmtHolding(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "—";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.round(h / 24)}d`;
}
