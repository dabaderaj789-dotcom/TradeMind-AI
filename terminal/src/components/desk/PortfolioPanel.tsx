import { UnavailableProviderPanel } from "./UnavailableProviderPanel";

export function PortfolioPanel() {
  return (
    <UnavailableProviderPanel
      title="Portfolio"
      detail="Unavailable from current provider — holdings, margin, and exposure are not invented."
    />
  );
}
