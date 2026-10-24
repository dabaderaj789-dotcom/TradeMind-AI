/**
 * Lock browser gestures to the chart surface so pinch/pan never scroll or
 * pull-to-refresh the page. Outside the chart, normal scrolling still works.
 */

import { useEffect, useRef } from "react";

/**
 * Attach to the chart stage element. While a finger is down inside the stage,
 * we prevent default on touchmove (non-passive) so iOS/Android don't scroll
 * or refresh the document.
 */
export function useChartGestureLock(enabled = true) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    let active = false;

    const onStart = (e: TouchEvent) => {
      active = true;
      document.documentElement.classList.add("tm-chart-touch");
      document.body.classList.add("tm-chart-touch");
      // Multi-touch (pinch): block browser page zoom before it starts.
      if (e.touches.length > 1 && e.cancelable) e.preventDefault();
    };

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        active = false;
        document.documentElement.classList.remove("tm-chart-touch");
        document.body.classList.remove("tm-chart-touch");
      }
    };

    const onMove = (e: TouchEvent) => {
      if (!active) return;
      // Block page scroll / pull-to-refresh while interacting with the chart.
      if (e.cancelable) e.preventDefault();
    };

    // Safari pinch-zoom on the document
    const onGesture = (e: Event) => {
      if (e.cancelable) e.preventDefault();
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("gesturestart", onGesture as EventListener, { passive: false });
    el.addEventListener("gesturechange", onGesture as EventListener, { passive: false });

    return () => {
      document.documentElement.classList.remove("tm-chart-touch");
      document.body.classList.remove("tm-chart-touch");
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("gesturestart", onGesture as EventListener);
      el.removeEventListener("gesturechange", onGesture as EventListener);
    };
  }, [enabled]);

  return ref;
}
