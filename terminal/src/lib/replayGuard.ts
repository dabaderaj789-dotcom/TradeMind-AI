/**
 * Replay guard — only data available at index T may enter analysis.
 * AI decision path is paused while replayActive; this helper enforces candle cutoffs.
 */

export function sliceCandlesAtIndex<T>(all: T[], index: number | null): T[] {
  if (!all.length) return [];
  if (index == null) return all;
  const end = Math.max(1, Math.min(all.length, index + 1));
  return all.slice(0, end);
}

/** Assert no element after T is present in the visible set. */
export function assertNoFutureCandles<T>(
  all: T[],
  visible: T[],
  index: number,
): { ok: boolean; leakCount: number } {
  const allowed = sliceCandlesAtIndex(all, index);
  if (visible.length > allowed.length) {
    return { ok: false, leakCount: visible.length - allowed.length };
  }
  for (let i = 0; i < visible.length; i++) {
    if (visible[i] !== allowed[i]) {
      return { ok: false, leakCount: visible.length - i };
    }
  }
  return { ok: true, leakCount: 0 };
}

/** Decision inputs must not include timestamps after asOfMs. */
export function filterAsOf<T extends { open_time?: string; as_of?: string; ts?: string }>(
  items: T[],
  asOfMs: number,
): T[] {
  return items.filter((item) => {
    const raw = item.open_time ?? item.as_of ?? item.ts;
    if (!raw) return false;
    const t = Date.parse(raw);
    return Number.isFinite(t) && t <= asOfMs;
  });
}
