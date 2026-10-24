import { useDecision } from "../../hooks/useDecision";
import { fmtPrice } from "../../lib/format";
import { Badge, Skeleton } from "../common/primitives";
import type { PredictivePlan } from "../../lib/predictiveSignal";
import type { AiDecision } from "../../lib/decision";
import { DECISION_PROFILES, type DecisionProfileId } from "../../lib/decisionProfiles";
import type { ExpiryIntelligence } from "../../lib/expiryIntelligence";
import type { ExpiryReview } from "../../lib/expiryReview";
import type { MissedOpportunityDayReport } from "../../lib/missedOpportunity";
import type { PersonalityStats } from "../../lib/personalityLearning";
import { useLiveValidation } from "../../lib/liveValidation";
import { usePaperTrading } from "../../lib/paperTrading";
import { buildDailyTradingReport, formatDailyTradingReport } from "../../lib/dailyTradingReport";
import type { LateSessionSetup } from "../../lib/lateSessionIntelligence";
import { useSettings } from "../../store/settings";
import { useWorkspace } from "../../store/workspace";
import { cx } from "../../lib/format";
import { ExecutionTradeCardView } from "./ExecutionTradeCard";

/**
 * V6 AI Desk — Institutional | Intraday profiles.
 * Institutional engine untouched; Intraday uses separate confluence model.
 */
export function AnalysisPanel({ id, tf }: { id: string; tf: string }) {
  const {
    decision,
    predictive,
    isLoading,
    trend,
    profile,
    expiryIntel,
    expiryReview,
    executionCard,
    missedOpportunity,
    personalityLeaderboard,
    lateSession,
  } = useDecision(id, tf);
  const setAiPanelMode = useWorkspace((s) => s.setAiPanelMode);
  const setDecisionProfile = useSettings((s) => s.setDecisionProfile);
  const profileMeta = DECISION_PROFILES.find((p) => p.id === profile);
  const validationOn = useLiveValidation((s) => s.enabled);
  const setValidation = useLiveValidation((s) => s.setEnabled);
  const paperOn = usePaperTrading((s) => s.enabled);
  const setPaper = usePaperTrading((s) => s.setEnabled);

  const actionable =
    !!decision &&
    (decision.kind === "BUY" ||
      decision.kind === "STRONG BUY" ||
      decision.kind === "SELL" ||
      decision.kind === "STRONG SELL");

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface/95 animate-fade-in">
      <div className="flex shrink-0 items-center gap-2 border-b border-subtle bg-elevated/60 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
            Analysis · AI Desk
            {expiryIntel?.active && (
              <span className="ml-2 text-warn">· EXPIRY</span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <ProfileSwitcher active={profile} onChange={setDecisionProfile} />
            {decision && <Badge tone={decision.tone}>{decision.kind}</Badge>}
            {expiryIntel?.active && expiryIntel.dayClass && (
              <Badge tone="warn">{expiryIntel.dayClass}</Badge>
            )}
          </div>
        </div>
        <button
          type="button"
          className={cx("btn-chip !text-[9px]", validationOn && "btn-chip-active")}
          title="Live Validation Mode — log DATA/DECISION/TIME/PRICE"
          onClick={() => setValidation(!validationOn)}
        >
          {validationOn ? "VALIDATING" : "Validate"}
        </button>
        <button
          type="button"
          className={cx("btn-chip !text-[9px]", paperOn && "btn-chip-active")}
          title="Paper trades only — no broker orders"
          onClick={() => setPaper(!paperOn)}
        >
          {paperOn ? "PAPER ON" : "Paper"}
        </button>
        <button
          type="button"
          title="Collapse to strip"
          className="btn-chip !px-2"
          onClick={() => setAiPanelMode("strip")}
        >
          ▬
        </button>
        <button
          type="button"
          title="Hide AI panel"
          className="btn-chip !px-2"
          onClick={() => setAiPanelMode("hidden")}
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-0 overflow-auto ai-panel-scroll">
        {isLoading && !decision ? (
          <div className="p-4">
            <Skeleton className="h-40" />
          </div>
        ) : (
          <>
            {executionCard && <ExecutionTradeCardView card={executionCard} />}
            <FullDesk
              decision={decision}
              plan={predictive}
              trendLabel={trend?.trend ?? decision?.trendLabel}
              actionable={actionable}
              profile={profile}
              expiryIntel={expiryIntel}
              expiryReview={expiryReview}
              missedOpportunity={missedOpportunity}
              personalityLeaderboard={personalityLeaderboard}
              lateSession={lateSession}
              validationOn={validationOn}
              paperOn={paperOn}
            />
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-subtle/30 px-3 py-2 text-[9px] tracking-wide text-faint">
        TRADEMIND AI V6 · {profileMeta?.short ?? "AI"}
        {expiryIntel?.active ? " · EXPIRY INTEL" : ""} · NOT FINANCIAL ADVICE
      </div>
    </div>
  );
}

function ProfileSwitcher({
  active,
  onChange,
}: {
  active: DecisionProfileId;
  onChange: (id: DecisionProfileId) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {DECISION_PROFILES.filter((p) => p.implemented).map((p) => (
        <button
          key={p.id}
          type="button"
          title={p.description}
          onClick={() => onChange(p.id)}
          className={cx(
            "rounded px-2 py-0.5 font-display text-[11px] font-bold tracking-tight transition-colors",
            active === p.id
              ? "bg-brand/20 text-brand ring-1 ring-brand/40"
              : "text-muted hover:bg-elevated hover:text-content",
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/** Collapsed AI strip — Decision · Confidence · Institutional Score */
export function AiStrip({ id, tf }: { id: string; tf: string }) {
  const { decision, profile } = useDecision(id, tf);
  const setAiPanelMode = useWorkspace((s) => s.setAiPanelMode);
  const short = DECISION_PROFILES.find((p) => p.id === profile)?.short ?? "AI";

  return (
    <aside className="hidden w-[72px] shrink-0 flex-col border-l border-subtle/35 bg-surface/95 lg:flex animate-fade-in">
      <button
        type="button"
        title="Expand AI desk"
        className="flex flex-1 flex-col items-center gap-4 px-1.5 py-4 text-center transition-colors hover:bg-elevated/50"
        onClick={() => setAiPanelMode("full")}
      >
        <div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-faint">{short}</div>
        {decision ? (
          <>
            <div>
              <div className="text-[8px] uppercase tracking-wide text-faint">Decision</div>
              <div
                className={cx(
                  "mt-0.5 font-display text-[11px] font-bold leading-tight",
                  decision.tone === "bull"
                    ? "text-bull"
                    : decision.tone === "bear"
                      ? "text-bear"
                      : "text-warn",
                )}
              >
                {decision.kind}
              </div>
            </div>
            <div>
              <div className="text-[8px] uppercase tracking-wide text-faint">Conf</div>
              <div className="mt-0.5 font-mono text-[12px] font-semibold tabular-nums text-content">
                {Math.round(decision.confidence)}%
              </div>
            </div>
            {decision.intraday ? (
              <div>
                <div className="text-[8px] uppercase tracking-wide text-faint">Lvl</div>
                <div className="mt-0.5 font-mono text-[11px] font-semibold text-content">
                  {decision.intraday.setupLevel === "early" ? "B" : "A"}
                </div>
              </div>
            ) : (
              <div>
                <div className="text-[8px] uppercase tracking-wide text-faint">Inst</div>
                <div className="mt-0.5 font-mono text-[12px] font-semibold tabular-nums text-content">
                  {decision.institutional?.score ?? "—"}
                </div>
              </div>
            )}
            {decision.personality && (
              <div>
                <div className="text-[8px] uppercase tracking-wide text-faint">Pers</div>
                <div className="mt-0.5 font-mono text-[10px] font-semibold leading-tight text-content">
                  {decision.personality.strength}%
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-[10px] text-faint">…</div>
        )}
      </button>
      <button
        type="button"
        className="border-t border-subtle/30 py-2 text-[9px] text-faint hover:text-muted"
        onClick={() => setAiPanelMode("hidden")}
        title="Hide"
      >
        ✕
      </button>
    </aside>
  );
}

function FullDesk({
  decision,
  plan,
  trendLabel,
  actionable,
  profile,
  expiryIntel,
  expiryReview,
  missedOpportunity,
  personalityLeaderboard,
  lateSession,
  validationOn,
  paperOn,
}: {
  decision: AiDecision | null;
  plan: PredictivePlan | null;
  trendLabel?: string;
  actionable: boolean;
  profile: DecisionProfileId;
  expiryIntel?: ExpiryIntelligence | null;
  expiryReview?: ExpiryReview | null;
  missedOpportunity?: MissedOpportunityDayReport | null;
  personalityLeaderboard?: PersonalityStats[];
  lateSession?: LateSessionSetup | null;
  validationOn?: boolean;
  paperOn?: boolean;
}) {
  const validationEvents = useLiveValidation((s) => s.events);
  const paperDayStats = usePaperTrading((s) => s.dayStats);
  const paperStats = paperDayStats();
  const shortTf = profile === "intraday" || profile === "scalping";
  const dailyNote =
    validationOn || paperOn
      ? (() => {
          try {
            return formatDailyTradingReport(buildDailyTradingReport());
          } catch {
            return null;
          }
        })()
      : null;

  if (!decision) {
    return <div className="p-4 text-sm text-muted">Select a symbol to load analysis.</div>;
  }

  const buy = decision.kind.includes("BUY");
  const structure =
    decision.qualityChecks.find((c) => c.id === "structure")?.detail ??
    decision.contributions.find((c) => /structure/i.test(c.label))?.value ??
    "—";
  const liquidity = decision.marketHealth?.liquidity ?? "—";
  const bias = decision.mtf?.summary ?? decision.direction;
  const obCheck = decision.qualityChecks.find((c) => /order.?block|ob/i.test(c.id + c.label));
  const fvgCheck = decision.qualityChecks.find((c) => /fvg|fair.?value/i.test(c.id + c.label));
  const rr = plan?.riskReward ?? decision.signalQuality?.riskReward ?? null;
  const reason =
    decision.explainability?.whyDirection ||
    decision.reasoning ||
    "Standing aside — conditions are not clear enough to act.";
  const invalidation =
    decision.explainability?.invalidation ||
    (decision.unlockConditions?.[0] ? `Invalid until: ${decision.unlockConditions[0]}` : "—");
  const intra = decision.intraday;
  const pers = decision.personality;
  const recentValidation = validationOn ? validationEvents.slice(0, 8) : [];

  return (
    <div className="animate-fade-in">
      {expiryIntel?.active && <ExpiryIntelCard intel={expiryIntel} />}
      {expiryReview && <ExpiryReviewCard review={expiryReview} />}

      {lateSession?.inLateWindow && (
        <div className="border-b border-subtle/30 px-4 py-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">
            Late Session · 3PM Intelligence
          </div>
          <div className="mt-1 font-display text-base font-bold text-content">
            {lateSession.direction === "wait"
              ? "NO TRADE"
              : lateSession.direction === "buy"
                ? "BUY"
                : "SELL"}
            <span className="ml-2 text-sm font-normal text-muted">
              {lateSession.classification.replace(/_/g, " ")}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted">{lateSession.summary}</p>
          {lateSession.direction !== "wait" && (
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] text-muted">
              <span>Entry {lateSession.entry != null ? fmtPrice(lateSession.entry) : "—"}</span>
              <span>SL {lateSession.stop != null ? fmtPrice(lateSession.stop) : "—"}</span>
              <span>TP1 {lateSession.tp1 != null ? fmtPrice(lateSession.tp1) : "—"}</span>
              <span>TP2 {lateSession.tp2 != null ? fmtPrice(lateSession.tp2) : "—"}</span>
              <span>RR {lateSession.rr != null ? lateSession.rr.toFixed(2) : "—"}</span>
              <span>Conf {Math.round(lateSession.confidence)}%</span>
              <span>Exp move {lateSession.expectedMovePoints ?? "—"} pts</span>
              <span>Dur ~{lateSession.expectedDurationMin ?? "—"}m</span>
            </div>
          )}
          {lateSession.whyNow.length > 0 && (
            <p className="mt-2 text-[11px] text-content">
              Why now: {lateSession.whyNow.slice(0, 4).join("; ")}
            </p>
          )}
          {lateSession.whatChanged.length > 0 && (
            <p className="mt-1 text-[11px] text-muted">
              What changed: {lateSession.whatChanged.slice(0, 3).join("; ")}
            </p>
          )}
          <p className="mt-1 text-[11px] text-muted">Invalidate: {lateSession.invalidation}</p>
        </div>
      )}

      {validationOn && recentValidation.length > 0 && (
        <div className="border-b border-warn/20 bg-warn/5 px-4 py-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-warn">
            Live Validation Feed
          </div>
          <div className="mt-2 space-y-3">
            {recentValidation.map((e) => {
              const s = e.snapshot;
              const o = e.outcome;
              return (
                <div key={e.id} className="border-l-2 border-warn/40 pl-2 font-mono text-[10px] leading-relaxed text-muted">
                  <div className="text-content">
                    {s.tsIst} · {s.symbolCode} {fmtPrice(s.spot)}
                  </div>
                  {s.personality && (
                    <div>
                      PERSONALITY: <span className="text-content">{s.personality}</span>
                    </div>
                  )}
                  <div>
                    AI: <span className="text-content">{s.decision}</span>
                    {s.earlyOrConfirmed ? ` · ${s.earlyOrConfirmed.toUpperCase()}` : ""}
                    {s.confidence != null ? ` · conf ${Math.round(s.confidence)}` : ""}
                  </div>
                  {(s.nextBuyTrigger != null || s.nextSellTrigger != null) && (
                    <div>
                      {s.nextBuyTrigger != null && <>NEXT BUY: {fmtPrice(s.nextBuyTrigger)} </>}
                      {s.nextSellTrigger != null && <>NEXT SELL: {fmtPrice(s.nextSellTrigger)}</>}
                    </div>
                  )}
                  {(s.entry != null || s.stop != null) && (
                    <div>
                      {s.entry != null && <>ENTRY {fmtPrice(s.entry)} </>}
                      {s.stop != null && <>SL {fmtPrice(s.stop)} </>}
                      {s.tp1 != null && <>TP {fmtPrice(s.tp1)} </>}
                      {s.rr != null && <>RR {s.rr.toFixed(2)}</>}
                    </div>
                  )}
                  {o.movePts != null && (
                    <div>
                      MOVE: {o.movePts > 0 ? "+" : ""}
                      {o.movePts.toFixed(1)} pts · MFE {o.mfe ?? 0} · MAE {o.mae ?? 0}
                    </div>
                  )}
                  {s.decision === "WAIT" && (
                    <div>
                      VALID SETUP: {o.validSetupExisted ? "YES" : "NO"} · MISSED:{" "}
                      {o.missed == null ? "—" : o.missed ? "YES" : "NO"}
                    </div>
                  )}
                  {o.missReason && <div className="text-warn">REASON: {o.missReason}</div>}
                  {!o.missReason && s.reason && (
                    <div className="truncate text-faint">{s.reason.slice(0, 120)}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {dailyNote && (
        <div className="border-b border-subtle/30 px-4 py-2 font-mono text-[9px] leading-relaxed whitespace-pre-wrap text-faint">
          {dailyNote}
        </div>
      )}

      {paperOn && (
        <div className="border-b border-subtle/30 px-4 py-2 font-mono text-[10px] text-muted">
          Paper · n={paperStats.sampleSize}
          {paperStats.winRate != null ? ` · WR ${paperStats.winRate}%` : " · WR —"}
          {paperStats.expectancy != null ? ` · Exp ${paperStats.expectancy}` : ""}
          {paperStats.profitFactor != null ? ` · PF ${paperStats.profitFactor}` : ""}
          <span className="block text-faint">{paperStats.disclaimer}</span>
        </div>
      )}

      <div
        className={cx(
          "border-b px-4 py-3",
          actionable
            ? buy
              ? "border-bull/20 bg-bull/5"
              : "border-bear/20 bg-bear/5"
            : "border-warn/20 bg-warn/5",
        )}
      >
        <div
          className={cx(
            "font-display text-lg font-semibold tracking-tight",
            actionable ? (buy ? "text-bull" : "text-bear") : "text-warn",
          )}
        >
          {actionable ? (buy ? "BUY" : "SELL") : "WAIT"}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">
          {pers?.label ?? plan?.setupType?.replace(/_/g, " ") ?? decision.setupType} ·{" "}
          {actionable
            ? intra
              ? intra.setupLevel === "early"
                ? "Early Setup · Quality B"
                : "Confirmed Setup · Quality A"
              : plan?.state ?? "Ready"
            : shortTf
              ? "Opportunity filter"
              : "Capital preservation"}
        </div>
      </div>

      {shortTf && pers && (
        <div className="border-b border-subtle/30 px-4 py-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">
            Market Personality
          </div>
          <div className="mt-1 font-display text-base font-bold text-content">{pers.label}</div>
          <div className="mt-1 flex flex-wrap gap-3 font-mono text-[11px] text-muted">
            <span>
              Strength <span className="font-semibold text-content">{pers.strength}%</span>
            </span>
            <span>
              Confidence <span className="font-semibold text-content">{pers.confidence}%</span>
            </span>
            <span className="capitalize">{pers.bias}</span>
          </div>
          {pers.characteristics.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-[11px] text-muted">
              {pers.characteristics.slice(0, 5).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <table className="w-full border-collapse text-[12px]">
        <tbody>
          {shortTf && (
            <>
              <Row
                label="LEVEL"
                value={
                  intra
                    ? intra.setupLevel === "early"
                      ? "1 · Early (B)"
                      : "2 · Confirmed (A)"
                    : "— · WAIT"
                }
                accent={intra?.setupLevel === "confirmed" ? "bull" : intra ? "brand" : undefined}
              />
              <Row
                label="SIZE"
                value={intra ? `${Math.round(intra.positionScale * 100)}%` : "—"}
              />
              <Row
                label="EARLY TELLS"
                value={
                  intra?.earlyPatterns?.length
                    ? intra.earlyPatterns.slice(0, 3).join(", ")
                    : decision.evidenceSummary.slice(0, 2).join(", ") || "—"
                }
              />
            </>
          )}
          <Row label="BIAS" value={String(bias)} />
          <Row label="TREND" value={trendLabel ?? decision.trendLabel ?? "—"} />
          <Row label="STRUCTURE" value={structure} />
          <Row label="LIQUIDITY" value={liquidity} />
          <Row
            label="ORDER BLOCKS"
            value={obCheck ? (obCheck.passed ? "Aligned" : obCheck.detail) : "See overlays"}
          />
          <Row
            label="FVG"
            value={fvgCheck ? (fvgCheck.passed ? "Present" : fvgCheck.detail) : "See overlays"}
          />
          <Row label="ENTRY" value={plan ? fmtPrice(plan.entry) : "—"} accent="brand" />
          <Row label="SL" value={plan ? fmtPrice(plan.stop) : "—"} accent="bear" />
          <Row label="TP1" value={plan ? fmtPrice(plan.target1) : "—"} accent="info" />
          <Row
            label="TP2"
            value={plan?.target2 != null ? fmtPrice(plan.target2) : "—"}
            accent="info"
          />
          <Row
            label="TP3"
            value={plan?.target3 != null ? fmtPrice(plan.target3) : "—"}
            accent="info"
          />
          <Row label="R:R" value={rr != null ? rr.toFixed(2) : "—"} accent="brand" />
          <Row label="CONFIDENCE" value={`${Math.round(decision.confidence)}%`} />
          <Row
            label="QUALITY"
            value={decision.tradeQuality}
            sub={intra?.levelNote}
          />
          <Row
            label="INSTITUTIONAL"
            value={`${decision.institutional?.score ?? "—"}`}
            sub={decision.institutional?.grade}
          />
        </tbody>
      </table>

      {shortTf && personalityLeaderboard && personalityLeaderboard.length > 0 && (
        <div className="border-t border-subtle/30 px-4 py-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">
            Personality edge (observed · n required)
          </div>
          <div className="mt-2 space-y-1.5">
            {personalityLeaderboard.slice(0, 4).map((s) => (
              <div key={s.personalityId} className="flex justify-between gap-2 font-mono text-[10px] text-muted">
                <span className="truncate text-content">{s.label}</span>
                <span>
                  {s.followThroughRate}% · n={s.samples}
                  {s.tradesTaken > 0 ? ` · WR ${s.tradeWinRate}%` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {shortTf && missedOpportunity && (
        <div className="border-t border-subtle/30 px-4 py-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">
            Missed Opportunity · {missedOpportunity.day} · n={missedOpportunity.sampleSize}
          </div>
          <div className="mt-2 font-display text-xl font-bold text-content">
            {missedOpportunity.missedOpportunityScore}
            <span className="text-sm font-normal text-muted"> / 100 observed score</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] text-muted">
            <span>BUY {missedOpportunity.totalBuy}</span>
            <span>SELL {missedOpportunity.totalSell}</span>
            <span>Correct WAIT {missedOpportunity.correctWait}</span>
            <span>Incorrect WAIT {missedOpportunity.incorrectWait}</span>
            <span>Missed BUY {missedOpportunity.missedBuy}</span>
            <span>Missed SELL {missedOpportunity.missedSell}</span>
            <span>Avg missed pts {missedOpportunity.averageMissedPoints}</span>
            <span>Avg MFE {missedOpportunity.averageMfe}</span>
            <span>Avg MAE {missedOpportunity.averageMae}</span>
            <span>Exp R:R {missedOpportunity.expectedRrAvg ?? "—"}</span>
            <span>Hit≥10 {missedOpportunity.hit10}</span>
            <span>Hit≥15 {missedOpportunity.hit15}</span>
            <span>Hit≥20 {missedOpportunity.hit20}</span>
            <span>Hit≥25 {missedOpportunity.hit25}</span>
          </div>
          <p className="mt-2 text-[9px] text-faint">
            Not an accuracy%. Insufficient sample until multi-session n is adequate.
          </p>
          {missedOpportunity.records.filter((r) => r.classification.startsWith("missed")).slice(0, 1).map((r) => (
            <p key={r.id} className="mt-2 text-[11px] leading-relaxed text-warn">
              Last miss: {r.selfAsk} {r.lessons[0] ?? ""} · Early evidence:{" "}
              {r.hadEarlySetupEvidence ? "yes" : "no"} · Confirmed path blocked:{" "}
              {r.hadConfirmedPathBlocked ? "yes" : "no"}
            </p>
          ))}
        </div>
      )}

      {expiryIntel?.active && (
        <div className="border-t border-subtle/30 px-4 py-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">
            Expiry session notes
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-content">
            {expiryIntel.decisionNotes.whyForExpiry}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            <span className="font-semibold text-faint">INDEX vs OPTION PREMIUM: </span>
            {expiryIntel.decisionNotes.premiumImpact}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            <span className="font-semibold text-faint">Invalidate: </span>
            {expiryIntel.decisionNotes.invalidate}
          </p>
          {expiryIntel.lateSessionOpportunity && (
            <p className="mt-2 text-[12px] leading-relaxed text-brand">
              Stronger move evidence (not time-based): {expiryIntel.lateSessionEvidence.join("; ")}
            </p>
          )}
        </div>
      )}

      <div className="border-t border-subtle/30 px-4 py-3">
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">
          {actionable ? "Why this trade" : "Reasoning"}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-content">{reason}</p>
        {intra?.setupLevel === "early" && (
          <p className="mt-2 text-[11px] text-muted">
            Early B — smaller size. Confirmed A needs:{" "}
            {(decision.unlockConditions ?? []).slice(0, 3).join("; ") || "full confluence + structure"}
          </p>
        )}
      </div>
      <div className="border-t border-subtle/30 px-4 py-3">
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">
          Invalidation
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">{invalidation}</p>
      </div>

      {!actionable && (decision.unlockConditions?.length > 0 || decision.explainability?.improvements?.length) && (
        <div className="border-t border-subtle/30 px-4 py-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-faint">
            What is missing · Learn
          </div>
          <ul className="mt-2 space-y-2">
            {(decision.unlockConditions?.length
              ? decision.unlockConditions
              : decision.explainability?.improvements ?? []
            )
              .slice(0, 8)
              .map((u) => (
                <li key={u} className="flex gap-2 text-[12px] leading-snug text-muted">
                  <span className="mt-0.5 shrink-0 font-mono text-brand">›</span>
                  <span>{u}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ExpiryIntelCard({ intel }: { intel: ExpiryIntelligence }) {
  return (
    <div className="border-b border-warn/25 bg-warn/5 px-4 py-3">
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-warn">
        Expiry Intelligence
      </div>
      <div className="mt-1 font-display text-[13px] font-bold text-content">{intel.schedule.label}</div>
      <div className="mt-1 font-mono text-[11px] text-muted">{intel.summary}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <div className="text-faint">Day class</div>
          <div className="font-semibold text-content">{intel.dayClass ?? "—"}</div>
        </div>
        <div>
          <div className="text-faint">Realized vol</div>
          <div className="font-semibold text-content">{intel.realizedVol}</div>
        </div>
        <div>
          <div className="text-faint">Compression</div>
          <div className="font-semibold text-content">{intel.compressing ? "Yes" : "No"}</div>
        </div>
        <div>
          <div className="text-faint">Directional odds</div>
          <div className="font-semibold text-content">{intel.directionalLikelihood}</div>
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-snug text-faint">{intel.ivNote}</p>
    </div>
  );
}

function ExpiryReviewCard({ review }: { review: ExpiryReview }) {
  return (
    <div className="border-b border-brand/25 bg-brand/5 px-4 py-3">
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand">
        Expiry Review · Post close
      </div>
      <div className="mt-1 font-mono text-[11px] text-muted">
        {review.symbolCode} · {review.expiryDate} · class {review.dayClassAtClose ?? "—"}
      </div>
      <p className="mt-2 text-[12px] text-content">{review.actualCharacter}</p>
      <p className="mt-1 text-[11px] text-muted">{review.scorecard.agreementNote}</p>
      <div className="mt-2 font-mono text-[11px] text-muted">
        Signals {review.scorecard.signals} · WAIT {review.scorecard.waits} · Wins {review.scorecard.wins} ·
        Losses {review.scorecard.losses}
        {review.sessionChangePct != null && ` · Session ${review.sessionChangePct.toFixed(2)}%`}
      </div>
      <ul className="mt-2 space-y-1">
        {review.lessons.slice(0, 4).map((l) => (
          <li key={l} className="text-[11px] leading-snug text-muted">
            › {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "brand" | "bear" | "info" | "bull";
}) {
  const color =
    accent === "brand"
      ? "text-brand"
      : accent === "bear"
        ? "text-bear"
        : accent === "info"
          ? "text-info"
          : accent === "bull"
            ? "text-bull"
            : "text-content";
  return (
    <tr className="border-b border-subtle/25 transition-colors hover:bg-elevated/40">
      <td className="px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
        {label}
      </td>
      <td className="max-w-[160px] px-4 py-2 text-right">
        <span className={`font-mono text-[12px] font-semibold tabular-nums ${color}`}>{value}</span>
        {sub && <div className="text-[10px] text-faint">{sub}</div>}
      </td>
    </tr>
  );
}
