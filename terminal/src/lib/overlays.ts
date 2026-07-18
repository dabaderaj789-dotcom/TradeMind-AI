/**
 * Granular overlay visibility — professional declutter controls.
 * Presentation only; no trading-engine changes.
 */

export type OverlayId =
  | "ema"
  | "sma"
  | "vwap"
  | "priceReferences"
  | "support"
  | "resistance"
  | "prevSupport"
  | "prevResistance"
  | "orderBlocks"
  | "prevOrderBlocks"
  | "fvg"
  | "prevFvg"
  | "sweeps"
  | "bos"
  | "choch"
  | "hh"
  | "hl"
  | "lh"
  | "ll"
  | "tradeSetups"
  /** @deprecated mapped to support+resistance for old persisted sessions */
  | "marketStructure";

export interface OverlayMeta {
  id: OverlayId;
  label: string;
  group: "Indicators" | "Levels" | "Smart Money" | "Structure" | "Signals";
  color: string;
}

export const OVERLAYS: OverlayMeta[] = [
  { id: "ema", label: "EMA (20)", group: "Indicators", color: "#f59e0b" },
  { id: "sma", label: "SMA (20)", group: "Indicators", color: "#38bdf8" },
  { id: "vwap", label: "VWAP", group: "Indicators", color: "#a855f7" },
  { id: "priceReferences", label: "Day / Prev refs", group: "Indicators", color: "#94a3b8" },

  { id: "support", label: "Support", group: "Levels", color: "#34ba7a" },
  { id: "resistance", label: "Resistance", group: "Levels", color: "#e85c5c" },
  { id: "prevSupport", label: "Previous Support", group: "Levels", color: "#34ba7a" },
  { id: "prevResistance", label: "Previous Resistance", group: "Levels", color: "#e85c5c" },

  { id: "orderBlocks", label: "Order Blocks", group: "Smart Money", color: "#4f7cff" },
  { id: "prevOrderBlocks", label: "Previous Order Blocks", group: "Smart Money", color: "#64748b" },
  { id: "fvg", label: "Fair Value Gaps", group: "Smart Money", color: "#22d3ee" },
  { id: "prevFvg", label: "Previous FVG", group: "Smart Money", color: "#64748b" },
  { id: "sweeps", label: "Liquidity Sweeps", group: "Smart Money", color: "#f472b6" },

  { id: "bos", label: "BOS", group: "Structure", color: "#22c55e" },
  { id: "choch", label: "CHoCH", group: "Structure", color: "#f59e0b" },
  { id: "hh", label: "HH", group: "Structure", color: "#86efac" },
  { id: "hl", label: "HL", group: "Structure", color: "#86efac" },
  { id: "lh", label: "LH", group: "Structure", color: "#fca5a5" },
  { id: "ll", label: "LL", group: "Structure", color: "#fca5a5" },

  { id: "tradeSetups", label: "Trade Signals", group: "Signals", color: "#4f7cff" },
];

/** Clean institutional defaults — current context + previous majors faded. */
export const DEFAULT_OVERLAYS: Record<OverlayId, boolean> = {
  ema: false,
  sma: false,
  vwap: false,
  priceReferences: false,
  support: true,
  resistance: true,
  prevSupport: true,
  prevResistance: true,
  orderBlocks: true,
  prevOrderBlocks: true,
  fvg: true,
  prevFvg: true,
  sweeps: true,
  bos: true,
  choch: true,
  hh: false,
  hl: false,
  lh: false,
  ll: false,
  tradeSetups: true,
  marketStructure: false,
};

/** Merge persisted overlays with new keys; migrate deprecated marketStructure. */
export function normalizeOverlays(
  raw?: Partial<Record<string, boolean>> | null,
): Record<OverlayId, boolean> {
  const out: Record<OverlayId, boolean> = { ...DEFAULT_OVERLAYS };
  if (!raw) return out;
  for (const key of Object.keys(out) as OverlayId[]) {
    if (typeof raw[key] === "boolean") out[key] = raw[key]!;
  }
  // Legacy: marketStructure controlled S/R + swings together.
  if (raw.marketStructure === true) {
    if (raw.support === undefined) out.support = true;
    if (raw.resistance === undefined) out.resistance = true;
  }
  if (raw.marketStructure === false && raw.support === undefined && raw.resistance === undefined) {
    out.support = false;
    out.resistance = false;
  }
  return out;
}
