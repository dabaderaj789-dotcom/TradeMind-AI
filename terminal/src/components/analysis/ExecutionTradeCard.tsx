import { fmtPrice, cx } from "../../lib/format";
import type { ExecutionTradeCard } from "../../lib/executionTradeCard";

/**
 * Execution layer Trade Card — sits above AI analysis.
 * Shows executable levels or WAIT + next triggers.
 */
export function ExecutionTradeCardView({ card }: { card: ExecutionTradeCard }) {
  const trade = card.mode === "trade";
  const buy = card.side === "BUY";

  return (
    <div
      className={cx(
        "border-b px-4 py-3.5",
        trade
          ? buy
            ? "border-bull/30 bg-bull/8"
            : "border-bear/30 bg-bear/8"
          : "border-warn/30 bg-warn/8",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-faint">
          Execution · Trade Card
        </div>
        <div
          className={cx(
            "rounded px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums",
            card.quality === "A+" || card.quality === "A"
              ? "bg-bull/20 text-bull"
              : card.quality === "B"
                ? "bg-brand/15 text-brand"
                : "bg-elevated text-muted",
          )}
        >
          {card.quality}
        </div>
      </div>

      <div
        className={cx(
          "mt-1.5 font-display text-2xl font-bold tracking-tight",
          trade ? (buy ? "text-bull" : "text-bear") : "text-warn",
        )}
      >
        {card.side}
      </div>
      {card.planLine && (
        <div className="mt-1 font-display text-[15px] font-semibold leading-snug text-content">
          {card.planLine}
        </div>
      )}

      {trade ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[12px] tabular-nums">
            <Level label="Entry" value={card.entry} accent="brand" />
            <Level label="SL" value={card.stop} accent="bear" />
            <Level label="TP1" value={card.tp1} accent="info" />
            <Level label="TP2" value={card.tp2} accent="info" />
            <Level label="TP3" value={card.tp3} accent="info" />
            <div>
              <div className="text-[9px] uppercase tracking-wide text-faint">R:R</div>
              <div className="font-semibold text-brand">
                {card.riskReward != null ? card.riskReward.toFixed(2) : "—"}
              </div>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-3 font-mono text-[11px] text-muted">
            <span>
              Confidence <span className="font-semibold text-content">{card.confidence}%</span>
            </span>
            <span>
              Quality <span className="font-semibold text-content">{card.quality}</span>
            </span>
            <span>
              Hold <span className="font-semibold text-content">{card.holdingTime}</span>
            </span>
          </div>
          <div className="mt-3">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">Reason</div>
            <ul className="mt-1.5 space-y-1">
              {card.reasonLines.map((line) => (
                <li key={line} className="text-[12px] leading-snug text-content">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-[12px] leading-snug text-muted">
            {card.reasonLines[0] ?? "No executable setup — watch the triggers."}
          </p>
          <div className="mt-3 space-y-2.5">
            <Trigger label="Next BUY trigger" text={card.nextBuyTrigger} tone="bull" />
            <Trigger label="Next SELL trigger" text={card.nextSellTrigger} tone="bear" />
          </div>
        </>
      )}
    </div>
  );
}

function Level({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | null;
  accent: "brand" | "bear" | "info";
}) {
  const color =
    accent === "brand" ? "text-brand" : accent === "bear" ? "text-bear" : "text-info";
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide text-faint">{label}</div>
      <div className={cx("font-semibold", color)}>{value != null ? fmtPrice(value) : "—"}</div>
    </div>
  );
}

function Trigger({
  label,
  text,
  tone,
}: {
  label: string;
  text: string | null;
  tone: "bull" | "bear";
}) {
  return (
    <div
      className={cx(
        "rounded-md border px-2.5 py-2",
        tone === "bull" ? "border-bull/25 bg-bull/5" : "border-bear/25 bg-bear/5",
      )}
    >
      <div
        className={cx(
          "text-[9px] font-bold uppercase tracking-[0.12em]",
          tone === "bull" ? "text-bull" : "text-bear",
        )}
      >
        {label}
      </div>
      <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-content">{text ?? "—"}</p>
    </div>
  );
}
