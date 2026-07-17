/**
 * Shaded horizontal zones (Order Blocks, Fair Value Gaps) rendered as
 * semi-transparent rectangles via the lightweight-charts primitives API.
 * Institutional style: quiet fills, hairline borders, one small caption.
 */

import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp,
} from "lightweight-charts";

export interface PriceZone {
  id: string;
  priceHigh: number;
  priceLow: number;
  /** Bar time the zone was created at; the shade extends from here to the right edge. */
  timeStart: UTCTimestamp | null;
  fillColor: string;
  borderColor: string;
  label: string;
  labelColor: string;
}

interface RenderRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  border: string;
  label: string;
  labelColor: string;
}

class ZonesRenderer implements ISeriesPrimitivePaneRenderer {
  constructor(private readonly _rects: RenderRect[]) {}

  draw(target: Parameters<ISeriesPrimitivePaneRenderer["draw"]>[0]): void {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const r of this._rects) {
        if (r.h < 1 || r.w < 1) continue;
        ctx.fillStyle = r.fill;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = r.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        if (r.label && r.h >= 12) {
          ctx.font = '600 9px "IBM Plex Sans", Inter, system-ui, sans-serif';
          ctx.fillStyle = r.labelColor;
          ctx.textBaseline = "top";
          ctx.fillText(r.label, r.x + 6, r.y + 3);
        }
      }
    });
  }
}

class ZonesPaneView implements ISeriesPrimitivePaneView {
  constructor(private readonly _source: ZonesPrimitive) {}

  renderer(): ISeriesPrimitivePaneRenderer | null {
    const chart = this._source.chart;
    const series = this._source.series;
    if (!chart || !series) return null;

    const timeScale = chart.timeScale();
    const width = timeScale.width();
    const rects: RenderRect[] = [];

    for (const z of this._source.zones) {
      const yHigh = series.priceToCoordinate(z.priceHigh);
      const yLow = series.priceToCoordinate(z.priceLow);
      if (yHigh == null || yLow == null) continue;
      let x = 0;
      if (z.timeStart != null) {
        const coord = timeScale.timeToCoordinate(z.timeStart as Time);
        // Zone may start left of the visible range — clamp to the pane edge.
        x = coord == null ? 0 : Math.max(0, coord);
      }
      const y = Math.min(yHigh, yLow);
      const h = Math.abs(yLow - yHigh);
      rects.push({
        x,
        y,
        w: Math.max(0, width - x),
        h,
        fill: z.fillColor,
        border: z.borderColor,
        label: z.label,
        labelColor: z.labelColor,
      });
    }
    return new ZonesRenderer(rects);
  }
}

export class ZonesPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<SeriesType> | null = null;
  zones: PriceZone[] = [];

  private _paneViews: ZonesPaneView[] = [new ZonesPaneView(this)];
  private _requestUpdate: (() => void) | null = null;

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.series = param.series;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this._requestUpdate = null;
  }

  setZones(zones: PriceZone[]): void {
    this.zones = zones;
    this._requestUpdate?.();
  }

  paneViews(): readonly ISeriesPrimitivePaneView[] {
    return this._paneViews;
  }
}
