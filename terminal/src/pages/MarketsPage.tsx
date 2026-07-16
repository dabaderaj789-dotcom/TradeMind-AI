import { MarketBrowser } from "../components/markets/MarketBrowser";
import { TopBarActions } from "../components/layout/TopBarActions";

export function MarketsPage() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-subtle/60 bg-surface/90 px-4 backdrop-blur-md lg:px-6">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-content">Markets</h1>
          <p className="text-[11px] text-faint">Browse all instruments · open a chart in one click</p>
        </div>
        <TopBarActions />
      </header>
      <div className="min-h-0 flex-1 pb-20 lg:pb-0">
        <MarketBrowser />
      </div>
    </div>
  );
}
