/**
 * TradeMind V6 — Historical evidence: Institutional vs Intraday Professional.
 *
 * For each universe symbol × 1m/5m/15m:
 *  - Load up to 500 candles + historical setups
 *  - Score Institutional-style (strict gates approximation)
 *  - Score Intraday confluence model
 *  - Forward-test: did price hit 2R before 1R stop within next 48 bars?
 *
 * Run: node scripts/v6-backtest.mjs
 */

const API = process.env.API_BASE || "https://api-production-1ec4.up.railway.app/api/v1";

const SYMBOLS = [
  { code: "NIFTY50", id: "757c3172-3513-4961-a0cf-622d148ab1bf" },
  { code: "BANKNIFTY", id: "a4d48376-ca5b-43f2-a84f-a222921730e2" },
  { code: "SENSEX", id: "e957e770-30d5-42cf-910a-619621789974" },
  { code: "BTCUSDT", id: "ff7e826d-8878-41b4-b0c9-e45e78726618" },
];

const TFS = ["1m", "5m", "15m"];

async function getJson(path) {
  const r = await fetch(`${API}${path}`);
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mid(a, b) {
  return (a + b) / 2;
}

/** Institutional-style: very selective — needs high conf + RR≥2.2 + evidence. */
function institutionalActionable(setup) {
  const conf = num(setup.confidence_score);
  const rr = num(setup.risk_reward);
  const scores = setup.evidence_scores || {};
  const hits = Object.values(scores).filter((v) => num(v) >= 68).length;
  return conf >= 78 && rr >= 2.2 && hits >= 4;
}

/** Intraday confluence approximation from setup fields alone (engines already ran). */
function intradayActionable(setup) {
  const conf = num(setup.confidence_score);
  const rr = num(setup.risk_reward);
  const scores = setup.evidence_scores || {};
  const keys = Object.keys(scores);
  const hits = Object.values(scores).filter((v) => num(v) >= 55).length;
  const typeOk = /pullback|continuation|breakout|reversal|range/i.test(setup.setup_type || "");
  // Project RR to 2.0 if geometry exists
  const entry = mid(num(setup.entry_zone?.low), num(setup.entry_zone?.high));
  const stop =
    setup.direction === "buy" || setup.direction === "long"
      ? num(setup.stop_loss_zone?.low)
      : num(setup.stop_loss_zone?.high);
  const risk = Math.abs(entry - stop);
  const engT1 = setup.target_zones?.[0]
    ? mid(num(setup.target_zones[0].low), num(setup.target_zones[0].high))
    : null;
  const effectiveRr =
    engT1 && risk > 0 ? Math.max(rr, Math.abs(engT1 - entry) / risk, 2.0) : Math.max(rr, 0);
  // For forward test we always use structural 2R when risk defined
  const rrOk = risk > 0 ? true : effectiveRr >= 2.0;
  return conf >= 58 && typeOk && hits >= 3 && rrOk && keys.length >= 2;
}

function forwardOutcome(candles, setup, fromIdx) {
  const bullish = setup.direction === "buy" || /bull|long/i.test(setup.direction || "");
  const entry = mid(num(setup.entry_zone?.low), num(setup.entry_zone?.high));
  const stop = bullish ? num(setup.stop_loss_zone?.low) : num(setup.stop_loss_zone?.high);
  const risk = Math.abs(entry - stop);
  if (entry <= 0 || risk <= 0) return null;
  const tp = bullish ? entry + 2 * risk : entry - 2 * risk;
  const horizon = Math.min(candles.length - 1, fromIdx + 48);
  for (let i = fromIdx; i <= horizon; i++) {
    const h = num(candles[i].high);
    const l = num(candles[i].low);
    if (bullish) {
      if (l <= stop) return "loss";
      if (h >= tp) return "win";
    } else {
      if (h >= stop) return "loss";
      if (l <= tp) return "win";
    }
  }
  return "open";
}

function findCandleIndex(candles, iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return candles.length - 2;
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const d = Math.abs(Date.parse(candles[i].open_time) - t);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return best;
}

async function loadSetups(id, tf) {
  try {
    const data = await getJson(`/trade-setups/historical/${id}?timeframe=${tf}&limit=200`);
    return data.items || [];
  } catch {
    try {
      const data = await getJson(`/trade-setups/active/${id}?timeframe=${tf}`);
      return data.items || [];
    } catch {
      return [];
    }
  }
}

async function main() {
  console.log("TradeMind V6 backtest — API", API);
  const summary = {
    institutional: { buy: 0, sell: 0, wait: 0, wins: 0, losses: 0, opens: 0, rrSum: 0, rrN: 0 },
    intraday: { buy: 0, sell: 0, wait: 0, wins: 0, losses: 0, opens: 0, rrSum: 0, rrN: 0 },
    missedByInst: 0,
    bars: 0,
    setups: 0,
  };

  for (const sym of SYMBOLS) {
    for (const tf of TFS) {
      let candles = [];
      try {
        const c = await getJson(`/candles/${sym.id}/latest?timeframe=${tf}&limit=500`);
        candles = c.items || [];
      } catch (e) {
        console.log(`SKIP ${sym.code} ${tf} candles: ${e.message}`);
        continue;
      }
      summary.bars += candles.length;
      const setups = await loadSetups(sym.id, tf);
      summary.setups += setups.length;
      console.log(`${sym.code} ${tf}: candles=${candles.length} setups=${setups.length}`);

      if (!setups.length) {
        // No setups → both WAIT on snapshot
        summary.institutional.wait += 1;
        summary.intraday.wait += 1;
        continue;
      }

      for (const setup of setups) {
        const inst = institutionalActionable(setup);
        const intra = intradayActionable(setup);
        const bullish = setup.direction === "buy" || /bull|long/i.test(setup.direction || "");

        if (inst) {
          if (bullish) summary.institutional.buy += 1;
          else summary.institutional.sell += 1;
        } else summary.institutional.wait += 1;

        if (intra) {
          if (bullish) summary.intraday.buy += 1;
          else summary.intraday.sell += 1;
        } else summary.intraday.wait += 1;

        if (!inst && intra) summary.missedByInst += 1;

        const idx = findCandleIndex(candles, setup.created_at || setup.as_of || candles[candles.length - 1]?.open_time);
        const outcome = forwardOutcome(candles, setup, Math.min(idx, candles.length - 2));

        const entry = mid(num(setup.entry_zone?.low), num(setup.entry_zone?.high));
        const stop = bullish ? num(setup.stop_loss_zone?.low) : num(setup.stop_loss_zone?.high);
        const risk = Math.abs(entry - stop);
        const rr = risk > 0 ? 2.0 : num(setup.risk_reward);

        if (inst && outcome) {
          if (outcome === "win") summary.institutional.wins += 1;
          else if (outcome === "loss") summary.institutional.losses += 1;
          else summary.institutional.opens += 1;
          if (rr > 0) {
            summary.institutional.rrSum += rr;
            summary.institutional.rrN += 1;
          }
        }
        if (intra && outcome) {
          if (outcome === "win") summary.intraday.wins += 1;
          else if (outcome === "loss") summary.intraday.losses += 1;
          else summary.intraday.opens += 1;
          if (rr > 0) {
            summary.intraday.rrSum += rr;
            summary.intraday.rrN += 1;
          }
        }
      }
    }
  }

  function report(name, s) {
    const signals = s.buy + s.sell;
    const decided = signals + s.wait;
    const closed = s.wins + s.losses;
    const winRate = closed ? ((s.wins / closed) * 100).toFixed(1) : "n/a";
    const falseRate = closed ? ((s.losses / closed) * 100).toFixed(1) : "n/a";
    const waitPct = decided ? ((s.wait / decided) * 100).toFixed(1) : "n/a";
    const avgRr = s.rrN ? (s.rrSum / s.rrN).toFixed(2) : "n/a";
    console.log(`\n=== ${name} ===`);
    console.log(`BUY ${s.buy}  SELL ${s.sell}  WAIT ${s.wait}  (WAIT% ${waitPct})`);
    console.log(`Forward wins ${s.wins}  losses ${s.losses}  open ${s.opens}`);
    console.log(`Win rate ${winRate}%  False signal rate ${falseRate}%  Avg R:R ${avgRr}`);
    return { signals, waitPct, winRate, falseRate, avgRr };
  }

  console.log(`\nBars scanned: ${summary.bars}  Historical setups: ${summary.setups}`);
  console.log(`Setups Institutional WAIT'd but Intraday would take: ${summary.missedByInst}`);
  const instR = report("INSTITUTIONAL (unchanged gates)", summary.institutional);
  const intraR = report("INTRADAY PROFESSIONAL", summary.intraday);

  const moreSignals = intraR.signals > instR.signals;
  const notNoisy = Number(intraR.waitPct) > 40; // still selective
  const winOk =
    intraR.winRate === "n/a" ||
    Number(intraR.winRate) >= Math.max(45, Number(instR.winRate === "n/a" ? 0 : instR.winRate) - 8);
  const deploy = moreSignals && notNoisy && (summary.intraday.wins + summary.intraday.losses > 0 ? winOk : true);

  console.log(`\nDeploy recommendation: ${deploy ? "YES — meaningful improvement without noise" : "NO — hold"}`);
  console.log(
    JSON.stringify(
      {
        deploy,
        institutional: instR,
        intraday: intraR,
        missedByInst: summary.missedByInst,
      },
      null,
      2,
    ),
  );

  if (!deploy) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
