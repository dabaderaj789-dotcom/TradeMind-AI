/**
 * Latest option-chain freeze store — publish on fetch; validation copies at decision T.
 * Never re-fetch to backfill an old decision.
 */

import { create } from "zustand";
import type { OptionChainFreeze } from "./validationSnapshot";

interface OcFreezeState {
  byUnderlying: Record<string, OptionChainFreeze>;
  publish: (snap: OptionChainFreeze) => void;
  /** Deep copy of latest for underlying, or null. */
  getFrozen: (underlying: string) => OptionChainFreeze | null;
}

export const useOptionChainFreeze = create<OcFreezeState>((set, get) => ({
  byUnderlying: {},
  publish: (snap) => {
    const key = snap.underlying.toUpperCase();
    set((s) => ({
      byUnderlying: {
        ...s.byUnderlying,
        [key]: JSON.parse(JSON.stringify(snap)) as OptionChainFreeze,
      },
    }));
  },
  getFrozen: (underlying) => {
    const s = get().byUnderlying[underlying.toUpperCase()];
    return s ? (JSON.parse(JSON.stringify(s)) as OptionChainFreeze) : null;
  },
}));
