# TradeMind AI — Trading Terminal (Sprint 10)

A production-quality, desktop-first **trading terminal** for TradeMind AI, inspired by
TradingView, Bloomberg Terminal and TrendSpider. It surfaces the outputs of the existing
analysis, trade-setup, strategy and backtesting engines as fast, natural-language decision
support — it does **not** place orders and does **not** modify any backend logic.

> Decision support, not order execution. Analytics are informational only and not financial advice.

---

## Highlights

- **Live market scanner** homepage — sortable, virtualized table (Symbol · Setup · Trend ·
  Confidence · Timeframe · Last Update · Action). Click any row to open the full terminal.
- **Four-area terminal layout**
  - **Left sidebar** — logo, market selector, symbol search, watchlist, favorites, recent symbols.
  - **Center** — TradingView Lightweight Chart (candles + volume + zoom + crosshair) with
    independent overlay toggles: EMA, SMA, VWAP, Order Blocks, Fair Value Gaps, Liquidity
    Sweeps, Market Structure, BOS, CHoCH, Trade Setups.
  - **Right analysis panel** — natural-language cards for Trend, Market Structure (BOS/CHoCH +
    HH/HL/LH/LL), Smart Money, Trade Setup and Strategy.
  - **Bottom panel** — tabs: Opportunities, Recent Analysis, Event Log, Trade History, Backtest Summary.
- **Explainability** — every analysis card has a **“Why?”** button revealing reasoning, evidence
  breakdown, plugin contributions and the confidence calculation. Raw JSON is hidden behind an
  “Advanced” disclosure and never shown by default.
- **Professional dark theme** (with a working light theme), semantic colors, rounded cards,
  smooth animations, skeleton loaders and explicit loading / error / empty states.
- **Performance** — route-level lazy loading & code splitting, React Query caching + dedup +
  optional auto-refresh, and a virtualized scanner list.
- **Persistent settings** — default timeframe, default overlays, scanner filters, theme and
  refresh interval, all stored locally.
- **Auth** — login page, profile menu and logout.

---

## Tech stack

React 18 · TypeScript · Vite · Tailwind CSS (CSS-variable theming) · TradingView
`lightweight-charts` v4 · TanStack Query (server state) · TanStack Virtual (virtualization) ·
Zustand (global client state) · React Router.

---

## Architecture

```
terminal/src/
├── lib/            apiClient, endpoints, types, format, overlays, timeline, queryKeys
├── store/          zustand stores: auth, settings, prefs (watchlist/favorites/recents), backtest
├── hooks/          queries (React Query), useScanner, useRecommendation, useBacktest, useTheme, …
├── components/
│   ├── common/     Card, Badge, Modal, Tabs, Toggle, ConfidenceRing, states/skeletons
│   ├── layout/     AppShell, Sidebar, ProfileMenu, TopBarActions
│   ├── sidebar/    MarketSelector, SidebarSearch, SymbolRow
│   ├── chart/      TerminalChart, OverlayToggles, TimeframeSelector
│   ├── analysis/   Trend / MarketStructure / SmartMoney / TradeSetup / Strategy cards + Why
│   ├── bottom/     Opportunities / RecentAnalysis / EventLog / TradeHistory / BacktestSummary
│   └── scanner/    ScannerTable, ScannerFilters
├── pages/          LoginPage, ScannerPage, TerminalPage, SettingsPage
├── App.tsx         routing + auth guard + lazy pages
└── main.tsx        providers (QueryClient, Router)
```

State separation: **server state** lives in React Query (cached by symbol/timeframe query keys);
**client state** (session, settings, watchlist/favorites/recents) lives in persisted Zustand stores.

---

## Getting started

```bash
cd terminal
npm install
npm run dev
```

- Dev server: <http://localhost:5175>. It proxies `/api/*` to the backend (default
  `http://localhost:8000`), so there are no CORS issues.
- Start the backend first from the repo root: `uvicorn app.main:app --reload`.
- Point at a different backend: set `VITE_API_TARGET` (dev) or `VITE_API_BASE` (build).

```bash
# PowerShell
$env:VITE_API_TARGET="http://localhost:8000"; npm run dev
```

### Build

```bash
npm run build     # type-check + production bundle (code-split) in dist/
npm run preview   # serve the production build
```

---

## Preview / walkthrough

1. **Sign in** — any username/password starts a local session (see note below).
2. **Scanner** (home) — pick a market and timeframe, sort columns, apply filters, click a row.
3. **Terminal** — toggle overlays, switch timeframes, read the right-hand analysis cards, click
   **Why?** on any card, explore the bottom tabs, and run a backtest from *Backtest Summary*.
4. **Settings** — set default timeframe/overlays, theme, auto-refresh interval and scanner filters.

> Screenshots aren’t committed (rendering requires a running backend with market data). Follow the
> steps above against a live API to see populated panels.

---

## Notes on backend integration

- **Authentication:** the TradeMind backend does not yet expose an auth endpoint, so the terminal
  manages a local session. The single integration seam is `authService` in `src/store/auth.ts` —
  swap its `login` for a real `POST /auth/login` when the API exists, with no UI changes.
- **Data availability:** the SMC/structure/setup read endpoints return *persisted* analysis, so a
  symbol/timeframe only shows data after the corresponding engine has run for it. Empty panels mean
  “no persisted analysis yet”, not a frontend error — this is handled with explicit empty states.
- **Backtests** are asynchronous: the terminal starts a run, polls status, then renders the report
  metrics (rendered generically since the metrics payload is an open dict) and the trade list.
```
