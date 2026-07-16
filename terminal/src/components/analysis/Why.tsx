import { useState } from "react";
import { fmtPct, titleCase, type Tone } from "../../lib/format";
import type { Explainability, QualityCheck } from "../../lib/decision";
import { Progress, Badge } from "../common/primitives";
import { Modal } from "../common/Modal";

export interface WhyProps {
  title: string;
  summary?: string;
  reasoning?: string;
  evidence?: Record<string, number>;
  contributions?: { label: string; value: string; tone?: Tone }[];
  confidence?: { score: number; note?: string };
  explainability?: Explainability;
  qualityChecks?: QualityCheck[];
  raw?: unknown;
}

export function Why(props: WhyProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="inline-flex items-center gap-1 text-[11px] font-medium text-muted hover:text-brand transition-colors"
        onClick={() => setOpen(true)}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
        Why?
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={props.title} subtitle={props.summary} size="md">
        <WhyBody {...props} />
      </Modal>
    </>
  );
}

function WhyBody({
  reasoning,
  evidence,
  contributions,
  confidence,
  explainability,
  qualityChecks,
  raw,
}: WhyProps) {
  const evidenceEntries = Object.entries(evidence ?? {}).filter(([, v]) => Number.isFinite(v));
  return (
    <div className="space-y-5">
      {explainability && (
        <Section title="Professional reasoning">
          <ExplainRow label="Why this direction?" text={explainability.whyDirection} />
          <ExplainRow label="Why not the opposite?" text={explainability.whyNotOpposite} />
          <ExplainRow label="Why now?" text={explainability.whyNow} />
          <ExplainRow label="What would invalidate?" text={explainability.invalidation} />
          {explainability.improvements.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wide text-faint mb-1.5">To improve confidence</div>
              <ul className="space-y-1 text-xs text-muted list-disc pl-4">
                {explainability.improvements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      )}

      {reasoning && (
        <Section title="Summary">
          <p className="text-sm text-muted leading-relaxed">{reasoning}</p>
        </Section>
      )}

      {qualityChecks && qualityChecks.length > 0 && (
        <Section title="Quality checklist">
          <div className="space-y-1.5">
            {qualityChecks.map((c) => (
              <div
                key={c.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-subtle/40 bg-bg/40 px-2.5 py-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium text-content">
                    {c.passed ? "✓" : "✗"} {c.label}
                    {c.critical && !c.passed && (
                      <span className="ml-1 text-[10px] text-bear">(critical)</span>
                    )}
                  </div>
                  <div className="text-[10px] text-faint mt-0.5">{c.detail}</div>
                </div>
                <Badge tone={c.passed ? "bull" : "warn"}>{c.passed ? "Pass" : "Fail"}</Badge>
              </div>
            ))}
          </div>
        </Section>
      )}

      {confidence && (
        <Section title="Confidence model">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-semibold font-mono text-content">{confidence.score.toFixed(0)}</span>
            <span className="text-sm text-faint">/ 100</span>
          </div>
          <div className="mt-2">
            <Progress value={confidence.score} tone={confidence.score >= 70 ? "bull" : confidence.score >= 50 ? "warn" : "bear"} />
          </div>
          {confidence.note && <p className="mt-2 text-xs text-faint">{confidence.note}</p>}
          <p className="mt-1 text-[10px] text-faint">
            Geometric composite — weak factors penalise the score more than a simple average.
          </p>
        </Section>
      )}

      {evidenceEntries.length > 0 && (
        <Section title="Factor breakdown">
          <div className="space-y-2.5">
            {evidenceEntries.map(([key, value]) => (
              <div key={key}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted">{titleCase(key)}</span>
                  <span className="font-mono text-content">{fmtPct(value, 0)}</span>
                </div>
                <Progress value={value} tone={value >= 70 ? "bull" : value >= 50 ? "info" : "warn"} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {contributions && contributions.length > 0 && (
        <Section title="Contributions">
          <div className="space-y-1.5">
            {contributions.map((c) => (
              <div key={c.label} className="flex items-center justify-between text-sm">
                <span className="text-muted">{c.label}</span>
                <span className="font-mono text-content">{c.value}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {raw != null && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-faint hover:text-muted select-none">
            Advanced · view raw data
          </summary>
          <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-bg border border-subtle/60 p-3 text-[11px] leading-relaxed text-muted font-mono">
            {JSON.stringify(raw, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function ExplainRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="mb-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-faint mb-0.5">{label}</div>
      <p className="text-sm text-muted leading-relaxed">{text}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-faint mb-2">{title}</div>
      {children}
    </div>
  );
}
