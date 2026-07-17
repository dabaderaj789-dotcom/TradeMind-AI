export type OverlayId =
  | "ema"
  | "sma"
  | "vwap"
  | "priceReferences"
  | "orderBlocks"
  | "fvg"
  | "sweeps"
  | "marketStructure"
  | "bos"
  | "choch"
  | "tradeSetups";

export interface OverlayMeta {
  id: OverlayId;
  label: string;
  group: "Indicators" | "Reference" | "Smart Money" | "Structure";
  color: string;
}

export const OVERLAYS: OverlayMeta[] = [
  { id: "ema", label: "EMA (20)", group: "Indicators", color: "#f59e0b" },
  { id: "sma", label: "SMA (20)", group: "Indicators", color: "#38bdf8" },
  { id: "vwap", label: "VWAP (series)", group: "Indicators", color: "#a855f7" },
  { id: "priceReferences", label: "Price References", group: "Reference", color: "#94a3b8" },
  { id: "orderBlocks", label: "Order Blocks", group: "Smart Money", color: "#4f7cff" },
  { id: "fvg", label: "Fair Value Gaps", group: "Smart Money", color: "#22d3ee" },
  { id: "sweeps", label: "Liquidity Sweeps", group: "Smart Money", color: "#f472b6" },
  { id: "marketStructure", label: "S/R Levels", group: "Structure", color: "#94a3b8" },
  { id: "bos", label: "BOS", group: "Structure", color: "#22c55e" },
  { id: "choch", label: "CHoCH", group: "Structure", color: "#f59e0b" },
  { id: "tradeSetups", label: "Trade Plan", group: "Structure", color: "#4f7cff" },
];

/** Clean institutional defaults — current SMC + S/R + plan only. */
export const DEFAULT_OVERLAYS: Record<OverlayId, boolean> = {
  ema: false,
  sma: false,
  vwap: false,
  priceReferences: false,
  orderBlocks: true,
  fvg: true,
  sweeps: true,
  marketStructure: true,
  bos: true,
  choch: true,
  tradeSetups: true,
};
