// TradeMind AI — Demo API server (zero dependencies, Node built-in http).
//
// Implements the REST contract consumed by the Trading Terminal and Replay
// Studio, serving deterministic in-memory demo data so the whole product runs
// locally without Python, PostgreSQL, Docker or internet access.

import http from "node:http";
import { URL } from "node:url";
import {
  SYMBOLS,
  EXCHANGES,
  symbolResponse,
  analysisFor,
  strategiesList,
  strategyDetail,
  startBacktest,
  getBacktest,
  invalidateAnalysis,
  marketQuoteFor,
  verifyMarketQuote,
} from "./data.mjs";
import { compareOhlc, fetchMarketCandles } from "./market-data.mjs";

// Railway / Render inject PORT; local launcher uses DEMO_API_PORT.
const PORT = Number(process.env.PORT ?? process.env.DEMO_API_PORT ?? 8000);
const HOST = process.env.DEMO_API_HOST ?? "0.0.0.0";
const PREFIX = "/api/v1";
const VERSION = "0.1.0-demo";

/** Extra origins from CORS_ORIGINS (comma-separated), for Vercel / production frontends. */
const EXTRA_ORIGINS = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Allowed origin patterns: localhost, LAN, known free-host suffixes, plus CORS_ORIGINS. */
function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (EXTRA_ORIGINS.includes("*") || EXTRA_ORIGINS.includes(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const h = u.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0") return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    // Free-tier frontend hosts (Vercel / Netlify preview + production)
    if (h.endsWith(".vercel.app") || h.endsWith(".netlify.app")) return true;
    return false;
  } catch {
    return false;
  }
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  const allow = origin && isAllowedOrigin(origin) ? origin : EXTRA_ORIGINS[0] || "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// ---- tiny router ---------------------------------------------------------
const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const rx = new RegExp(
    "^" +
      pattern
        .replace(/\//g, "\\/")
        .replace(/:([A-Za-z0-9_]+)/g, (_, k) => {
          keys.push(k);
          return "([^\\/]+)";
        }) +
      "$",
  );
  routes.push({ method, rx, keys, handler });
}
const GET = (p, h) => route("GET", PREFIX + p, h);
const POST = (p, h) => route("POST", PREFIX + p, h);
const PATCH = (p, h) => route("PATCH", PREFIX + p, h);
const DELETE = (p, h) => route("DELETE", PREFIX + p, h);

// ---- helpers -------------------------------------------------------------
function send(res, status, body, req) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    ...(req ? corsHeaders(req) : { "Access-Control-Allow-Origin": "*" }),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}
function notFound(res, msg = "Not found", req) {
  send(res, 404, { detail: msg }, req);
}
function paginate(items, page = 1, pageSize = 100) {
  return { items, total: items.length, page, page_size: pageSize, pages: Math.max(1, Math.ceil(items.length / pageSize)) };
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    return {};
  }
}

// =========================================================================
// Market quote (session OHLC + status)
// =========================================================================
GET("/quotes/:symbolId", async (req, res, p) => {
  const symbol = SYMBOLS.find((s) => s.id === p.symbolId);
  if (!symbol) return notFound(res, "Symbol not found", req);
  try {
    const quote = await marketQuoteFor(symbol);
    send(res, 200, quote, req);
  } catch (err) {
    send(res, 502, { detail: `Quote feed failed: ${err?.message ?? err}` }, req);
  }
});

GET("/debug/quote-verify/:symbolId", async (req, res, p) => {
  const symbol = SYMBOLS.find((s) => s.id === p.symbolId);
  if (!symbol) return notFound(res, "Symbol not found", req);
  try {
    const result = await verifyMarketQuote(symbol);
    send(res, 200, result, req);
  } catch (err) {
    send(res, 502, { detail: `Quote verification failed: ${err?.message ?? err}` }, req);
  }
});

// =========================================================================
// OHLC accuracy compare (developer mode)
// =========================================================================
GET("/debug/ohlc-compare/:symbolId", async (req, res, p, url) => {
  const tf = url.searchParams.get("timeframe") ?? "1h";
  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 40));
  invalidateAnalysis(p.symbolId, tf);
  const a = await analysisFor(p.symbolId, tf);
  if (!a) return notFound(res, "Symbol not found", req);
  let reference;
  let providerLabel = a.providerLabel;
  try {
    const fresh = await fetchMarketCandles(a.symbol, tf, Math.max(limit + 10, 50));
    reference = fresh.bars;
    providerLabel = fresh.providerLabel;
  } catch (err) {
    return send(res, 502, { detail: `Reference feed failed: ${err?.message ?? err}` }, req);
  }
  const ours = a.bars.slice(-limit);
  const refs = reference.slice(-limit);
  const comparison = compareOhlc(ours, refs);
  send(res, 200, {
    symbol_id: a.symbol.id,
    symbol_code: a.symbol.symbol_code,
    timeframe: tf,
    our_source: a.source,
    reference_provider: providerLabel,
    reference_note: a.referenceNote,
    yahoo_ticker: a.yahooTicker ?? null,
    comparison,
    our_sample: ours.slice(-5).map((b) => ({
      open_time: b.open_time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    })),
    reference_sample: refs.slice(-5).map((b) => ({
      open_time: b.open_time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    })),
  }, req);
});

// =========================================================================
// Health & reference data
// =========================================================================
GET("/health", async (req, res) => {
  send(res, 200, {
    status: "healthy",
    app: "TradeMind AI (demo backend)",
    version: VERSION,
    environment: "demo",
    timestamp: new Date().toISOString(),
    services: [
      { name: "demo-data", status: "healthy", latency_ms: 0.1 },
      { name: "analysis-engines", status: "healthy", latency_ms: 0.2 },
    ],
  });
});

GET("/exchanges", async (req, res) => send(res, 200, paginate(EXCHANGES)));

GET("/symbols", async (req, res, _p, url) => {
  const search = (url.searchParams.get("search") ?? "").toLowerCase();
  const exchangeCode = (url.searchParams.get("exchange_code") ?? "").toLowerCase();
  const pageSize = Number(url.searchParams.get("page_size") ?? 100);
  const page = Number(url.searchParams.get("page") ?? 1);
  let items = SYMBOLS.map(symbolResponse);
  if (exchangeCode) items = items.filter((s) => s.exchange_code.toLowerCase() === exchangeCode);
  if (search) {
    items = items.filter(
      (s) =>
        s.symbol_code.toLowerCase().includes(search) ||
        s.name.toLowerCase().includes(search) ||
        s.exchange_code.toLowerCase().includes(search),
    );
  }
  send(res, 200, paginate(items, page, pageSize));
});

// =========================================================================
// Candles
// =========================================================================
GET("/candles/:symbolId/latest", async (req, res, p, url) => {
  const tf = url.searchParams.get("timeframe") ?? "1h";
  const limit = Number(url.searchParams.get("limit") ?? 500);
  const a = await analysisFor(p.symbolId, tf);
  if (!a) return notFound(res, "Symbol not found");
  const items = a.bars.slice(-limit).map((b) => ({
    symbol_id: a.symbol.id,
    symbol_code: a.symbol.symbol_code,
    timeframe: tf,
    open_time: b.open_time,
    close_time: b.close_time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    quote_volume: Number((b.volume * b.close).toFixed(2)),
    trades_count: 100 + Math.floor(b.volume % 900),
    is_complete: true,
    source: a.source ?? "live",
    provider: a.providerLabel ?? null,
  }));
  send(res, 200, {
    items,
    total: items.length,
    symbol_id: a.symbol.id,
    timeframe: tf,
    source: a.source,
    provider: a.providerLabel,
    note: a.referenceNote,
  });
});

// =========================================================================
// Market structure
// =========================================================================
GET("/market-structure/trend/:symbolId", async (req, res, p, url) => {
  const a = await analysisFor(p.symbolId, url.searchParams.get("timeframe") ?? "1h");
  if (!a) return notFound(res);
  send(res, 200, a.ms.trend);
});
GET("/market-structure/levels/:symbolId", async (req, res, p, url) => {
  const a = await analysisFor(p.symbolId, url.searchParams.get("timeframe") ?? "1h");
  if (!a) return notFound(res);
  send(res, 200, a.ms.levels);
});
GET("/market-structure/events/:symbolId", async (req, res, p, url) => {
  const a = await analysisFor(p.symbolId, url.searchParams.get("timeframe") ?? "1h");
  if (!a) return notFound(res);
  send(res, 200, a.ms.events);
});

// =========================================================================
// Smart money concepts
// =========================================================================
function smcList(a, items, tf) {
  return { symbol_id: a.symbol.id, timeframe: tf, as_of: a.bars[a.bars.length - 1].open_time, items, total: items.length };
}
GET("/order-blocks/active/:symbolId", async (req, res, p, url) => {
  const tf = url.searchParams.get("timeframe") ?? "1h";
  const a = await analysisFor(p.symbolId, tf);
  if (!a) return notFound(res);
  send(res, 200, smcList(a, a.ob, tf));
});
GET("/fair-value-gaps/active/:symbolId", async (req, res, p, url) => {
  const tf = url.searchParams.get("timeframe") ?? "1h";
  const a = await analysisFor(p.symbolId, tf);
  if (!a) return notFound(res);
  send(res, 200, smcList(a, a.fvg, tf));
});
GET("/liquidity-sweeps/active/:symbolId", async (req, res, p, url) => {
  const tf = url.searchParams.get("timeframe") ?? "1h";
  const a = await analysisFor(p.symbolId, tf);
  if (!a) return notFound(res);
  send(res, 200, smcList(a, a.sweeps, tf));
});

// =========================================================================
// Trade setups
// =========================================================================
GET("/trade-setups/active/:symbolId", async (req, res, p, url) => {
  const tf = url.searchParams.get("timeframe") ?? "1h";
  const a = await analysisFor(p.symbolId, tf);
  if (!a) return notFound(res);
  send(res, 200, { symbol_id: a.symbol.id, timeframe: tf, items: a.setups.active, total: a.setups.active.length });
});
GET("/trade-setups/historical/:symbolId", async (req, res, p, url) => {
  const tf = url.searchParams.get("timeframe") ?? "1h";
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const a = await analysisFor(p.symbolId, tf);
  if (!a) return notFound(res);
  const items = a.setups.historical.slice(0, limit);
  send(res, 200, { symbol_id: a.symbol.id, timeframe: tf, items, total: items.length });
});

// =========================================================================
// Strategies
// =========================================================================
GET("/strategies", async (req, res) => send(res, 200, strategiesList()));
GET("/strategies/:strategyId", async (req, res, p, url) => {
  const symbolId = url.searchParams.get("symbol_id") ?? SYMBOLS[0].id;
  const tf = url.searchParams.get("timeframe") ?? "1h";
  const detail = await strategyDetail(p.strategyId, symbolId, tf);
  if (!detail) return notFound(res, "Strategy not found");
  send(res, 200, detail);
});

// =========================================================================
// Analysis results (indicator / market-structure series)
// =========================================================================
GET("/analysis/results/:symbolId", async (req, res, p, url) => {
  const tf = url.searchParams.get("timeframe") ?? "1h";
  const plugin = url.searchParams.get("plugin_id") ?? "ema";
  const limit = Number(url.searchParams.get("limit") ?? 5000);
  const a = await analysisFor(p.symbolId, tf);
  if (!a) return notFound(res);
  const items = (a.series[plugin] ?? []).slice(-limit);
  send(res, 200, { symbol_id: a.symbol.id, timeframe: tf, plugin_id: plugin, items, total: items.length });
});

// =========================================================================
// Backtests
// =========================================================================
POST("/backtests/start", async (req, res) => {
  const body = await readBody(req);
  if (!body.symbol_id) return send(res, 422, { detail: "symbol_id required" });
  const bt = await startBacktest({ symbol_id: body.symbol_id, timeframe: body.timeframe ?? "1h", strategy_id: body.strategy_id });
  send(res, 200, { run_id: bt.run_id, status: bt.status, strategy_id: bt.strategy_id, engine_version: "demo-1.0.0", params_hash: "demo" });
});
GET("/backtests/:runId/status", async (req, res, p) => {
  const bt = getBacktest(p.runId);
  if (!bt) return notFound(res, "Backtest run not found");
  send(res, 200, {
    run_id: bt.run_id,
    status: bt.status,
    strategy_id: bt.strategy_id,
    bars_processed: bt.bars_processed,
    initial_capital: bt.initial_capital,
    final_capital: bt.final_capital,
    started_at: bt.started_at,
    completed_at: bt.completed_at,
  });
});
GET("/backtests/:runId/report", async (req, res, p) => {
  const bt = getBacktest(p.runId);
  if (!bt) return notFound(res, "Backtest run not found");
  send(res, 200, {
    run_id: bt.run_id,
    status: bt.status,
    metrics: bt.metrics,
    equity_curve: bt.equity_curve,
    monthly_returns: [],
    yearly_returns: [],
    walk_forward_segments: [],
    generated_at: bt.completed_at,
  });
});
GET("/backtests/:runId/trades", async (req, res, p) => {
  const bt = getBacktest(p.runId);
  if (!bt) return notFound(res, "Backtest run not found");
  send(res, 200, { run_id: bt.run_id, items: bt.trades, total: bt.trades.length });
});

// =========================================================================
// Replay Studio
// =========================================================================
const sessions = new Map();

function overlaysForSlice(a, upto, wanted) {
  const bars = a.bars.slice(0, upto + 1);
  const out = {};
  const timeVal = (series) =>
    (a.series[series] ?? [])
      .filter((it) => new Date(it.open_time) <= new Date(bars[bars.length - 1].open_time))
      .map((it) => ({ time: Math.floor(new Date(it.open_time).getTime() / 1000), value: it.values[series] }))
      .filter((pt) => pt.value != null && Number.isFinite(pt.value) && Number.isFinite(pt.time));
  for (const key of wanted) {
    if (["ema", "sma", "vwap", "rsi"].includes(key)) {
      out[key] = timeVal(key);
    } else if (key === "market_structure") {
      const markers = a.ms.swings
        .filter((s) => s.i <= upto)
        .slice(-12)
        .map((s) => ({
          time: a.bars[s.i]?.time ?? a.bars[Math.min(upto, a.bars.length - 1)].time,
          position: s.kind === "high" ? "aboveBar" : "belowBar",
          shape: s.kind === "high" ? "arrowDown" : "arrowUp",
          color: s.kind === "high" ? "#ef5350" : "#26a69a",
          text: s.label,
        }))
        .sort((x, y) => x.time - y.time);
      out.market_structure = {
        markers,
        support_levels: a.ms.levels.support_levels.map((l) => ({ price: l.price })),
        resistance_levels: a.ms.levels.resistance_levels.map((l) => ({ price: l.price })),
      };
    } else if (key === "order_blocks") {
      out.order_blocks = a.ob.map((o) => ({ high: o.zone_high, low: o.zone_low, type: o.type }));
    } else if (key === "fair_value_gaps") {
      out.fair_value_gaps = a.fvg.map((f) => ({ high: f.gap_high, low: f.gap_low, type: f.type }));
    } else if (key === "liquidity_sweeps") {
      out.liquidity_sweeps = a.sweeps.map((s) => ({ level: s.sweep_level, type: s.type }));
    }
  }
  return out;
}

function buildEvents(a) {
  const events = [];
  const idxByTime = new Map(a.bars.map((b, i) => [b.open_time, i]));
  for (const ev of a.ms.events.bos_events.concat(a.ms.events.choch_events)) {
    const i = idxByTime.get(ev.break_time) ?? a.bars.findIndex((b) => b.open_time === ev.break_time);
    events.push({
      event_id: `ms_${ev.event_type}_${i}`,
      event_type: ev.event_type,
      bar_index: i < 0 ? 0 : i,
      open_time: ev.break_time,
      label: ev.event_type.toUpperCase().replace(/_/g, " "),
      direction: ev.event_type.includes("bull") ? "bullish" : "bearish",
      price: ev.break_price,
      metadata: { broken_swing_price: ev.broken_swing_price },
    });
  }
  for (const s of a.setups.active.concat(a.setups.historical)) {
    const i = a.bars.findIndex((b) => b.open_time === s.detected_at);
    events.push({
      event_id: `setup_${s.setup_id}`,
      event_type: "trade_setup",
      bar_index: i < 0 ? 0 : i,
      open_time: s.detected_at,
      label: `${s.direction} ${s.setup_type.replace(/_/g, " ")}`,
      direction: s.direction,
      price: (s.entry_zone.low + s.entry_zone.high) / 2,
      metadata: { confidence: s.confidence_score, status: s.status },
    });
  }
  events.sort((x, y) => x.bar_index - y.bar_index);
  return events;
}

function sessionResponse(sess) {
  const a = sess.analysis;
  return {
    session_id: sess.id,
    symbol_id: a.symbol.id,
    symbol_code: a.symbol.symbol_code,
    timeframe: sess.tf,
    total_bars: a.bars.length,
    current_index: sess.index,
    current_time: a.bars[sess.index]?.open_time ?? null,
    playback_state: sess.playback,
    replay_speed: sess.speed,
    debug_mode: sess.debug,
    validation_mode: sess.validation,
    events_count: sess.events.length,
    engine_version: "demo-1.0.0",
  };
}

function frameResponse(sess, overlays) {
  const a = sess.analysis;
  const wanted = overlays && overlays.length ? overlays : ["ema", "sma", "vwap", "market_structure"];
  const visible = sess.events.filter((e) => e.bar_index <= sess.index);
  return {
    session_id: sess.id,
    current_index: sess.index,
    total_bars: a.bars.length,
    current_time: a.bars[sess.index]?.open_time ?? null,
    playback_state: sess.playback,
    replay_speed: sess.speed,
    candles: a.bars.slice(0, sess.index + 1).map((b) => ({
      time: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
      open_time: b.open_time,
    })),
    overlays: overlaysForSlice(a, sess.index, wanted),
    visible_events: visible,
  };
}

POST("/replay-studio/sessions", async (req, res) => {
  const body = await readBody(req);
  const tf = body.timeframe ?? "1h";
  const a = await analysisFor(body.symbol_id ?? SYMBOLS[0].id, tf);
  if (!a) return send(res, 422, { detail: "Unknown symbol_id" });
  const id = `sess_${Math.random().toString(36).slice(2, 10)}`;
  const sess = {
    id,
    tf,
    analysis: a,
    index: Math.min(60, a.bars.length - 1),
    playback: "paused",
    speed: 1,
    debug: false,
    validation: false,
    events: buildEvents(a),
    reviews: new Map(),
  };
  sessions.set(id, sess);
  send(res, 200, sessionResponse(sess));
});

function withSession(handler) {
  return (req, res, p, url) => {
    const sess = sessions.get(p.id);
    if (!sess) return notFound(res, "Replay session not found");
    return handler(req, res, p, url, sess);
  };
}

GET("/replay-studio/sessions/:id", withSession((req, res, p, url, sess) => send(res, 200, sessionResponse(sess))));
DELETE("/replay-studio/sessions/:id", withSession((req, res, p, url, sess) => {
  sessions.delete(sess.id);
  send(res, 200, { deleted: true });
}));

GET("/replay-studio/sessions/:id/frame", withSession((req, res, p, url, sess) => {
  const ov = url.searchParams.get("overlays");
  send(res, 200, frameResponse(sess, ov ? ov.split(",").filter(Boolean) : null));
}));

POST("/replay-studio/sessions/:id/step-forward", withSession(async (req, res, p, url, sess) => {
  const body = await readBody(req);
  sess.index = Math.min(sess.analysis.bars.length - 1, sess.index + (body.steps ?? 1));
  send(res, 200, frameResponse(sess, null));
}));
POST("/replay-studio/sessions/:id/step-back", withSession(async (req, res, p, url, sess) => {
  const body = await readBody(req);
  sess.index = Math.max(0, sess.index - (body.steps ?? 1));
  send(res, 200, frameResponse(sess, null));
}));
POST("/replay-studio/sessions/:id/jump", withSession(async (req, res, p, url, sess) => {
  const body = await readBody(req);
  if (typeof body.index === "number") sess.index = Math.max(0, Math.min(sess.analysis.bars.length - 1, body.index));
  else if (body.open_time) {
    const i = sess.analysis.bars.findIndex((b) => b.open_time === body.open_time);
    if (i >= 0) sess.index = i;
  }
  send(res, 200, frameResponse(sess, null));
}));
POST("/replay-studio/sessions/:id/jump-event", withSession(async (req, res, p, url, sess) => {
  const body = await readBody(req);
  let target;
  if (body.event_id) target = sess.events.find((e) => e.event_id === body.event_id);
  else {
    const dir = body.direction ?? "next";
    const backward = /prev|back/i.test(dir);
    const ordered = backward ? [...sess.events].reverse() : sess.events;
    target = ordered.find((e) => (backward ? e.bar_index < sess.index : e.bar_index > sess.index));
  }
  if (target) sess.index = target.bar_index;
  send(res, 200, frameResponse(sess, null));
}));
POST("/replay-studio/sessions/:id/playback", withSession(async (req, res, p, url, sess) => {
  const body = await readBody(req);
  sess.playback = body.playing ? "playing" : "paused";
  if (body.speed) sess.speed = body.speed;
  send(res, 200, { tick_interval_ms: Math.round(1000 / sess.speed), replay_speed: sess.speed });
}));

GET("/replay-studio/sessions/:id/inspector", withSession((req, res, p, url, sess) => {
  const a = sess.analysis;
  const bi = url.searchParams.get("bar_index");
  const idx = bi != null ? Math.max(0, Math.min(a.bars.length - 1, Number(bi))) : sess.index;
  const b = a.bars[idx];
  const val = (series) => (a.series[series] ?? []).find((it) => it.open_time === b.open_time)?.values ?? {};
  const sw = a.ms.swings.find((s) => s.i === idx);
  const setup = a.setups.active.concat(a.setups.historical).find((s) => s.detected_at === b.open_time) ?? null;
  send(res, 200, {
    bar_index: idx,
    open_time: b.open_time,
    candle: { open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume },
    indicators: { ...val("ema"), ...val("sma"), ...val("vwap"), ...val("rsi"), ...val("macd"), ...val("atr") },
    market_structure: { trend: a.ms.trend.trend, swing_type: sw ? sw.label : null, market_phase: a.ms.trend.market_phase },
    smart_money: {
      order_blocks: a.ob.length,
      fair_value_gaps: a.fvg.length,
      liquidity_sweeps: a.sweeps.length,
    },
    trade_setup: setup,
    strategy_evaluation: setup ? { strategy_id: "trend_rider", accepted: setup.confidence_score >= 55 } : null,
    confidence_scores: { setup: setup?.confidence_score ?? 0, trend: a.ms.trend.confidence },
    evidence_breakdown: setup?.evidence_scores ?? { market_structure: a.ms.trend.confidence },
    reasoning: setup?.explanation ?? `Bar ${idx}: ${a.ms.trend.trend} structure, phase ${a.ms.trend.market_phase}.`,
  });
}));

GET("/replay-studio/sessions/:id/events", withSession((req, res, p, url, sess) => {
  send(res, 200, { items: sess.events, total: sess.events.length });
}));

GET("/replay-studio/sessions/:id/debug", withSession((req, res, p, url, sess) => {
  const a = sess.analysis;
  send(res, 200, {
    debug_mode: sess.debug,
    current_index: sess.index,
    open_time: a.bars[sess.index]?.open_time ?? null,
    execution_order: ["indicators", "market_structure", "order_blocks", "fair_value_gaps", "liquidity_sweeps", "trade_setups", "strategies"],
    params_hashes: { indicators: "demo", market_structure: "demo", trade_setups: "demo" },
    raw_plugin_outputs: {
      market_structure: a.ms.trend,
      order_blocks: a.ob.length,
      fair_value_gaps: a.fvg.length,
      liquidity_sweeps: a.sweeps.length,
    },
    json_payloads: { active_setups: a.setups.active.length },
  });
}));

GET("/replay-studio/sessions/:id/metrics", withSession((req, res, p, url, sess) => {
  const a = sess.analysis;
  send(res, 200, {
    metrics: {
      candles_loaded: a.bars.length,
      plugins_loaded: 7,
      events_extracted: sess.events.length,
      total_load_ms: 42.5,
      db_query_ms: 0,
      memory_estimate_bytes: a.bars.length * 128,
      cache_hits: 6,
      cache_misses: 1,
      plugin_timings: [
        { plugin_id: "indicators", duration_ms: 6.2, rows_loaded: a.bars.length, cache_hit: true },
        { plugin_id: "market_structure", duration_ms: 8.1, rows_loaded: a.bars.length, cache_hit: true },
        { plugin_id: "order_blocks", duration_ms: 4.4, rows_loaded: a.ob.length, cache_hit: false },
        { plugin_id: "trade_setups", duration_ms: 5.0, rows_loaded: a.setups.active.length, cache_hit: true },
      ],
    },
    tick_interval_ms: Math.round(1000 / sess.speed),
  });
}));

PATCH("/replay-studio/sessions/:id/settings", withSession(async (req, res, p, url, sess) => {
  const body = await readBody(req);
  if (typeof body.debug_mode === "boolean") sess.debug = body.debug_mode;
  if (typeof body.validation_mode === "boolean") sess.validation = body.validation_mode;
  send(res, 200, sessionResponse(sess));
}));

// =========================================================================
// Validation toolkit
// =========================================================================
const REJECTION_REASONS = [
  { value: "wrong_structure", label: "Wrong market structure", plugin: "market_structure" },
  { value: "bad_order_block", label: "Invalid order block", plugin: "order_blocks" },
  { value: "no_fvg", label: "Fair value gap absent", plugin: "fair_value_gaps" },
  { value: "weak_sweep", label: "Weak liquidity sweep", plugin: "liquidity_sweeps" },
  { value: "low_rr", label: "Poor risk / reward", plugin: "trade_setups" },
  { value: "late_entry", label: "Entry too late", plugin: "trade_setups" },
];

GET("/validation/rejection-reasons", async (req, res) => send(res, 200, REJECTION_REASONS));

GET("/validation/sessions/:id/setups", withSession((req, res, p, url, sess) => {
  const a = sess.analysis;
  const all = a.setups.active.concat(a.setups.historical.slice(0, 10));
  const items = all.map((s) => {
    const bar = a.bars.findIndex((b) => b.open_time === s.detected_at);
    const review = sess.reviews.get(s.setup_id) ?? null;
    return {
      setup_id: s.setup_id,
      setup_type: s.setup_type,
      direction: s.direction,
      confidence_score: s.confidence_score,
      confidence_level: s.confidence_level,
      detected_at: s.detected_at,
      bar_index: bar < 0 ? 0 : bar,
      explanation: s.explanation,
      review,
    };
  });
  const reviewed = items.filter((i) => i.review).length;
  send(res, 200, {
    session_id: sess.id,
    validation_mode: sess.validation,
    total_setups: items.length,
    reviewed_count: reviewed,
    pending_count: items.length - reviewed,
    items,
  });
}));

POST("/validation/reviews", async (req, res) => {
  const body = await readBody(req);
  if (!body.setup_id || !body.verdict) return send(res, 422, { detail: "setup_id and verdict required" });
  const reason = REJECTION_REASONS.find((r) => r.value === body.rejection_reason) ?? null;
  const review = {
    id: `rev_${Math.random().toString(36).slice(2, 10)}`,
    setup_id: body.setup_id,
    verdict: body.verdict,
    rejection_reason: reason?.value ?? null,
    rejection_reason_label: reason?.label ?? null,
    notes: body.notes ?? null,
    plugin_issues: reason ? [reason.plugin] : [],
    confidence_score: 0,
    reviewed_at: new Date().toISOString(),
  };
  const sess = body.replay_session_id ? sessions.get(body.replay_session_id) : null;
  if (sess) sess.reviews.set(body.setup_id, review);
  send(res, 200, review);
});

GET("/validation/dashboard", async (req, res, _p, url) => {
  const filters = Object.fromEntries(url.searchParams.entries());
  let correct = 0;
  let incorrect = 0;
  let unsure = 0;
  for (const sess of sessions.values()) {
    for (const r of sess.reviews.values()) {
      if (r.verdict === "correct") correct++;
      else if (r.verdict === "incorrect") incorrect++;
      else unsure++;
    }
  }
  const total = correct + incorrect + unsure;
  const pct = (n) => (total ? r2pct(n / total) : 0);
  send(res, 200, {
    filters_applied: filters,
    total_reviewed: total,
    correct_count: correct,
    incorrect_count: incorrect,
    unsure_count: unsure,
    acceptance_rate_pct: pct(correct),
    rejection_rate_pct: pct(incorrect),
    unsure_rate_pct: pct(unsure),
    rejection_reasons: REJECTION_REASONS.map((r) => ({ reason: r.value, label: r.label, count: 0 })),
    plugin_statistics: {},
    setup_type_statistics: {},
  });
});
function r2pct(x) {
  return Number((x * 100).toFixed(1));
}

GET("/validation/report", async (req, res, _p, url) => {
  send(res, 200, {
    summary: "No incorrect setups recorded yet in this demo session. Review setups in Validation mode to populate this report.",
    incorrect_total: 0,
    issues: [],
    recommendations: ["Enable Validation mode and step through setups to build a review history."],
    filters_applied: Object.fromEntries(url.searchParams.entries()),
  });
});

GET("/validation/export.csv", async (req, res) => {
  const rows = ["setup_id,verdict,rejection_reason,notes,reviewed_at"];
  for (const sess of sessions.values()) {
    for (const r of sess.reviews.values()) {
      rows.push([r.setup_id, r.verdict, r.rejection_reason ?? "", (r.notes ?? "").replace(/,/g, ";"), r.reviewed_at].join(","));
    }
  }
  send(res, 200, rows.join("\n"));
});

// =========================================================================
// Dispatcher
// =========================================================================
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, "", req);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.rx.exec(path);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    try {
      await r.handler(req, res, params, url);
    } catch (err) {
      send(res, 500, { detail: String(err?.message ?? err) }, req);
    }
    return;
  }
  if (path === "/" || path === PREFIX || path === PREFIX + "/") {
    return send(res, 200, { app: "TradeMind AI demo backend", version: VERSION, docs: `${PREFIX}/health` }, req);
  }
  notFound(res, `No route for ${req.method} ${path}`, req);
});

server.listen(PORT, HOST, () => {
  console.log(`[demo-api] listening on http://${HOST}:${PORT}${PREFIX}`);
  console.log(`[demo-api] ${SYMBOLS.length} symbols, deterministic analysis ready.`);
});
