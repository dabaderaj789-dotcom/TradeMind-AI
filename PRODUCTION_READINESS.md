# TradeMind AI — Production Readiness Report

**Date:** 2026-07-16  
**Scope:** FastAPI, PostgreSQL, React Terminal, Replay Studio, all analysis engines, bootstrap, deployment  
**Policy:** No new features / UI redesign — correctness & reliability fixes only  

---

## Overall verdict

| Metric | Score (0–100) |
| --- | ---: |
| **Overall project health** | **58** |
| Code quality | 62 |
| Architecture | 70 |
| Performance | 48 |
| Scalability | 42 |
| Maintainability | 65 |
| Security | 28 |
| Accuracy | 68 |

**Verdict:** Suitable for **private / closed-beta** testing of the real FastAPI stack after Docker + bootstrap. **Not ready** for public internet exposure or capital-at-risk trading. Security is the primary blocker.

---

## Fixes applied during this review

| Severity | Issue | Fix |
| --- | --- | --- |
| CRITICAL | Replay/Validation used `symbol.code` (AttributeError) | Use `symbol.symbol_code` |
| CRITICAL | Analysis fetched **oldest** candles when history > limit | `get_candles_for_analysis` uses newest window |
| CRITICAL | MTF Neutrals counted as agreement → false BUY/SELL eligibility | Only matching directional TFs count |
| CRITICAL | Live quote poller ignored `VITE_API_BASE` | Poll `${VITE_API_BASE}/quotes` + `/health` |
| CRITICAL | Studio chart price-line leak, stale click, RSI never mounts | Track/remove lines; `frameRef`; RSI effect on enable |
| HIGH | Dockerfile skipped migrations; compose used `--reload` | `CMD scripts/start_api.sh`; drop reload |
| HIGH | Open `*.vercel.app` CORS by default | Opt-in `CORS_ALLOW_VERCEL_PREVIEWS` |
| HIGH | Terminal `fitContent` on every candle update | Fit only on material length change |

---

## Remaining technical debt (priority)

### CRITICAL
- **No API authentication** — all mutating routes are open to anyone who can reach the host.

### HIGH
- Session **auto-commit on every request** (including GETs that sync plugin registries).
- Replay sessions are **in-process memory** (lost on restart; broken under multi-worker).
- **SmallInteger** overflow risk for large bar counts.
- Multi-symbol **backtest capital / trade attribution** bugs.
- SMC plugins **recompute nested engines** under parallel `/analysis/execute` (CPU/memory bomb).
- UI login is **cosmetic** (any password works).

### MEDIUM
- Scanner / Morning Brief **request storms**.
- Mobile workbench / Scanner access gaps.
- `demo-server/`, `dashboard/`, stale verify scripts still in the tree.
- Quote “verify” is largely a **self-check**, not live exchange parity.
- Pagination / list response shapes inconsistent across APIs.

---

## Recommended before Version 1.0

1. Add API auth (shared API key minimum; JWT preferred).  
2. Lock CORS to exact production origins.  
3. Persist Replay sessions or pin single worker + TTL.  
4. Migrate SmallInteger → Integer for bar metrics.  
5. Share SMC analysis state; serialize heavy plugins; cap Scanner concurrency.  
6. Explicit commit policy; stop GET side-effects.  
7. Terminal ErrorBoundary + candle error/retry UI.  
8. Archive `demo-server` and unused `dashboard`.  
9. Label Decision Engine clearly as client rules over API data.  
10. Run [VERIFICATION.md](./VERIFICATION.md) end-to-end on Docker.

---

## Architecture (current official path)

```
React Terminal / Replay Studio
        ↓
     FastAPI
        ↓
   PostgreSQL
        ↓
 Market adapters (Binance / NSE)
```

Decision WAIT/BUY/SELL remains a **browser rules layer** consuming FastAPI inputs — intentional, not a server ML model.

---

## Module health (summary)

| Module | Status |
| --- | --- |
| Market Structure | Sound; needs newest-candle path (fixed) |
| Order Blocks / FVG / Sweeps | Sound algorithms; nested recompute cost HIGH |
| Trade Setup Engine | Usable; active rows can accumulate on re-run |
| Strategy Engine | Usable; depends on clean setups |
| Replay Studio | Critical AttributeError fixed; memory store remains |
| Validation Toolkit | Critical AttributeError fixed; N+1 lists |
| Bootstrap / Deploy | Aligned to FastAPI; Docker required locally |
| Terminal / Studio UI | Critical chart/stream/MTF fixes applied |

---

*Interactive scorecard also available as a Cursor Canvas: `production-readiness.canvas.tsx`.*
