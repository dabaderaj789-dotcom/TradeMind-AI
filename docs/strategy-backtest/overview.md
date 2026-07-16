# Strategy & Backtesting Engine — Sprint 8

Institutional-grade strategy evaluation and deterministic backtesting over Trade Setup outputs.

## Architecture

```
Trade Setups (DB) → Strategy Engine → Trade Plans (DB)
                         ↓
              Candles + Trade Plans → Backtest Engine → Trades + Performance Report (DB)
```

Strategies **never** analyze raw candles — they only consume `SetupInput` from the Trade Setup Engine.

## Strategy Plugin Architecture

### BaseStrategy Interface

| Method | Purpose |
|--------|---------|
| `strategy_id()` | Unique identifier |
| `strategy_name()` | Display name |
| `strategy_version()` | Semantic version |
| `description()` | Human-readable summary |
| `supported_markets()` | Market types |
| `supported_timeframes()` | Timeframe codes |
| `required_setup_types()` | Setup types this strategy trades |
| `default_parameters()` / `parameters_model()` | Config schema |
| `validate()` | Parameter validation |
| `evaluate_setup()` | Accept/reject setup with confidence |
| `generate_trade_plan()` | Produce trade plan if accepted |

Register new strategies in `register_builtin_strategies()` without modifying the engine core.

### Phase 1 Strategies

| Strategy ID | Setup Type | Key Evidence |
|-------------|------------|--------------|
| `trend_continuation` | trend_continuation | Trend alignment, fresh OB, open FVG |
| `pullback` | pullback | Market structure, mitigated OB |
| `breakout` | breakout | BOS, volume confirmation |
| `reversal` | reversal | CHoCH, liquidity sweep, FVG |
| `range_rejection` | range_rejection | Range context, sweep, S/R |

## Trade Plan

Recommendations only — no order execution.

| Field | Description |
|-------|-------------|
| `plan_id` | Unique plan identifier |
| `strategy_id`, `setup_id` | Provenance |
| `direction` | bullish / bearish |
| `entry_zone` | High/low bounds |
| `stop_loss` | Stop price level |
| `target_1`, `target_2`, `target_3` | Profit targets |
| `risk_reward` | Calculated R:R |
| `trade_expiration_bars` | Plan validity window |
| `position_risk_pct` | Suggested risk per trade |
| `strategy_confidence` | Strategy-specific score |
| `reasoning` | Human-readable explanation |

## Backtesting Engine

Deterministic, replay-safe simulation over historical candles and trade plans.

### Modes

| Mode | Description |
|------|-------------|
| `historical` | Full candle range replay |
| `incremental` | Same engine, configurable window |
| `walk_forward` | Train/test segments with rolling windows |

### Execution Rules

- Order types: `market`, `limit`, `stop`
- Costs: commission %, slippage %, spread, flat fees, tick size rounding

### Position Sizing

- `fixed`, `percent_risk`, `atr`, `fixed_fractional`

### Trade Management

- Partial profit at Target 1 (`partial_take_pct`)
- Break-even stop after Target 1 (`move_to_breakeven`)
- Trailing stop (`trailing_stop_atr_mult`)
- Time-based exit (`max_bars_in_trade`)
- Multiple targets (T1, T2, T3)

## Performance Analytics

Net profit, gross profit/loss, win/loss rate, profit factor, expectancy, average trade/winner/loser, maximum drawdown, recovery factor, Sharpe, Sortino, Calmar, consecutive win/loss streaks, average holding time, equity curve, monthly/yearly returns.

## Database Schema (Migration 005)

| Table | Purpose |
|-------|---------|
| `strategy_definitions` | Registered strategy metadata |
| `strategy_versions` | Version history for reproducibility |
| `trade_plans` | Generated trade plans |
| `backtest_runs` | Backtest execution metadata |
| `backtest_trades` | Simulated trade history |
| `performance_reports` | Full analytics JSON |

Versioning via `strategy_version` + `params_hash` + `engine_version`.

## API

### Strategies — `/api/v1/strategies`

```http
GET  /api/v1/strategies
POST /api/v1/strategies/execute
GET  /api/v1/strategies/{strategy_id}?symbol_id=...&timeframe=1h
```

### Backtesting — `/api/v1/backtests`

```http
POST /api/v1/backtests/start
GET  /api/v1/backtests/{run_id}/status
GET  /api/v1/backtests/{run_id}/results
GET  /api/v1/backtests/{run_id}/trades
GET  /api/v1/backtests/{run_id}/report
GET  /api/v1/backtests/{run_id}/equity-curve
```

### Example: Run backtest

```bash
curl -X POST http://localhost:8000/api/v1/backtests/start \
  -H "Content-Type: application/json" \
  -d '{
    "symbol_id": "YOUR_SYMBOL_UUID",
    "timeframe": "1h",
    "strategy_id": "trend_continuation",
    "backtest_config": {
      "initial_capital": 10000,
      "commission_pct": 0.001,
      "slippage_pct": 0.0005,
      "order_type": "limit",
      "position_sizing": "percent_risk",
      "position_risk_pct": 1.0
    }
  }'
```

## Reports

Structured reports (`build_structured_report`) include:

| Section | Contents |
|---------|----------|
| `performance_summary` | Full metrics (net profit, Sharpe, drawdown, etc.) |
| `trade_list` | All simulated trades with entry/exit details |
| `monthly_performance` / `yearly_performance` | Period P&L buckets |
| `drawdown_analysis` | Max drawdown and drawdown periods |
| `risk_statistics` | Sharpe, Sortino, Calmar, profit factor, streaks |
| `equity_curve` | Bar-by-bar equity series |

Use `compare_strategies()` to rank multiple strategy backtest results.

## Replay Safety

Identical candles + plans + config + versions → identical trades and metrics.

## Tests

```bash
pytest tests/unit/test_strategy.py tests/unit/test_backtest.py tests/api/test_strategy_backtest_api.py -v
```
