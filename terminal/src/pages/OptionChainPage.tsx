/**
 * V7 Option Chain page — thin wrapper around desk OptionChainPanel.
 */

import { OptionChainPanel } from "../components/options/OptionChainPanel";

export function OptionChainPage() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3 lg:p-4">
      <header>
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">Market Engine</div>
        <h1 className="font-display text-xl font-bold">Option Chain</h1>
        <p className="text-sm text-muted">NSE public chain · polls every 3s · also available as a desk panel</p>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-subtle">
        <OptionChainPanel />
      </div>
    </div>
  );
}

export default OptionChainPage;
