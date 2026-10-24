/**
 * Imperative tip bus — paint the forming candle without React re-renders.
 * TerminalChart subscribes; useLiveStream publishes on every tick.
 */

export interface ChartTipTick {
  symbolId: string;
  price: number;
  ts: number;
  volume?: number;
  /** Provider / exchange timestamp ms */
  providerTs?: number;
  frontendReceivedAt: number;
  source?: string;
}

type Listener = (tick: ChartTipTick) => void;

const listeners = new Set<Listener>();

export function publishChartTip(tick: ChartTipTick) {
  for (const fn of listeners) {
    try {
      fn(tick);
    } catch {
      /* subscriber errors must not break the stream */
    }
  }
}

export function subscribeChartTip(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
