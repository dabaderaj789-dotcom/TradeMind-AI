import { UnavailableProviderPanel } from "./UnavailableProviderPanel";

export function PositionsPanel() {
  return (
    <UnavailableProviderPanel
      title="Positions"
      detail="Unavailable from current provider — quantity, avg, LTP, and P&L appear when execution is connected."
    />
  );
}
