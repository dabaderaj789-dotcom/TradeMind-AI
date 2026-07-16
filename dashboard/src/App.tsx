import { useCallback, useEffect, useMemo, useState } from "react";
import ActiveOpportunitiesTable from "./components/ActiveOpportunitiesTable";
import CandlestickChart from "./components/CandlestickChart";
import FvgPanel from "./components/FvgPanel";
import Header from "./components/Header";
import LiquiditySweepPanel from "./components/LiquiditySweepPanel";
import LoginScreen from "./components/LoginScreen";
import MarketStructurePanel from "./components/MarketStructurePanel";
import OrderBlockPanel from "./components/OrderBlockPanel";
import RecentAnalysisHistory from "./components/RecentAnalysisHistory";
import StrategyRecommendationCard from "./components/StrategyRecommendationCard";
import TradeSetupCard from "./components/TradeSetupCard";
import TrendCard from "./components/TrendCard";
import Watchlist from "./components/Watchlist";
import { Card } from "./components/ui";
import { useAuth } from "./context/AuthContext";
import { useSymbolData } from "./hooks/useSymbolData";
import { useWatchlist } from "./hooks/useWatchlist";
import { useWatchlistData } from "./hooks/useWatchlistData";
import { api, type Timeframe } from "./lib/api";
import type { Symbol, WatchItem } from "./lib/types";

export default function App() {
  const { user } = useAuth();
  if (!user) return <LoginScreen />;
  return <Dashboard />;
}

function Dashboard() {
  const [selected, setSelected] = useState<WatchItem | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [nonce, setNonce] = useState(0);
  const watchlist = useWatchlist();

  const { data, loading, error, lastUpdated, refresh } = useSymbolData(selected?.id ?? null, timeframe);
  const watchData = useWatchlistData(watchlist.items, timeframe, nonce);

  // Pick a sensible default symbol on first load.
  useEffect(() => {
    if (selected) return;
    if (watchlist.items.length > 0) {
      setSelected(watchlist.items[0]);
      return;
    }
    let cancelled = false;
    void api
      .searchSymbols("")
      .then((res) => {
        if (!cancelled && res.items.length > 0) {
          const s = res.items[0];
          setSelected({ id: s.id, symbol_code: s.symbol_code, name: s.name });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selected, watchlist.items]);

  const handleSelectSymbol = useCallback((s: Symbol) => {
    setSelected({ id: s.id, symbol_code: s.symbol_code, name: s.name });
  }, []);

  const handleSelectWatch = useCallback((item: WatchItem) => setSelected(item), []);

  const handleSelectById = useCallback(
    (id: string) => {
      const item = watchlist.items.find((i) => i.id === id);
      if (item) setSelected(item);
    },
    [watchlist.items],
  );

  const handleRefresh = useCallback(() => {
    void refresh();
    setNonce((n) => n + 1);
  }, [refresh]);

  const canAddCurrent = useMemo(
    () => !!selected && !watchlist.has(selected.id),
    [selected, watchlist],
  );

  return (
    <div className="min-h-full flex flex-col">
      <Header
        symbol={selected}
        timeframe={timeframe}
        onSelectSymbol={handleSelectSymbol}
        onTimeframeChange={setTimeframe}
        onRefresh={handleRefresh}
        refreshing={loading}
        lastUpdated={lastUpdated}
      />

      <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 lg:p-6 space-y-4">
        {error && data.candles.length === 0 && (
          <div className="rounded-lg border border-bear/40 bg-bear/10 px-4 py-3 text-sm text-bear">
            {error}
          </div>
        )}

        <div className="grid grid-cols-12 gap-4">
          {/* Primary column */}
          <div className="col-span-12 xl:col-span-8 space-y-4">
            <Card
              title={selected ? `${selected.symbol_code} · ${timeframe}` : "Chart"}
              bodyClassName="p-0"
            >
              <div className="h-[440px] p-2">
                {data.candles.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-500">
                    {loading ? "Loading chart…" : "No candle data available for this symbol / timeframe."}
                  </div>
                ) : (
                  <CandlestickChart
                    candles={data.candles}
                    supports={data.levels?.support_levels}
                    resistances={data.levels?.resistance_levels}
                    orderBlocks={data.orderBlocks}
                  />
                )}
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TradeSetupCard setup={data.activeSetups[0] ?? null} loading={loading} />
              <StrategyRecommendationCard detail={data.strategyDetail} loading={loading} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="col-span-12 xl:col-span-4 space-y-4">
            <TrendCard trend={data.trend} loading={loading} />
            <MarketStructurePanel levels={data.levels} events={data.events} loading={loading} />
            <Watchlist
              items={watchlist.items}
              activeId={selected?.id ?? null}
              quotes={watchData.quotes}
              onSelect={handleSelectWatch}
              onRemove={watchlist.remove}
              onAddCurrent={() => selected && watchlist.add(selected)}
              canAddCurrent={canAddCurrent}
            />
          </div>
        </div>

        {/* Smart money concepts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <OrderBlockPanel blocks={data.orderBlocks} loading={loading} />
          <FvgPanel gaps={data.fvgs} loading={loading} />
          <LiquiditySweepPanel sweeps={data.sweeps} loading={loading} />
        </div>

        <ActiveOpportunitiesTable
          opportunities={watchData.opportunities}
          loading={watchData.loading}
          onSelectSymbol={handleSelectById}
        />

        <RecentAnalysisHistory setups={data.historicalSetups} loading={loading} />

        <footer className="pt-2 pb-6 text-center text-xs text-slate-600">
          TradeMind AI · Analytics are informational only and not financial advice.
        </footer>
      </main>
    </div>
  );
}
