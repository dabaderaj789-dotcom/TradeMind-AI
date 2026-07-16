import { useEffect, useState } from "react";
import { api } from "../api";
import type { RejectionReasonOption, SetupQueueItem } from "../validationTypes";

interface Props {
  sessionId: string;
  currentIndex: number;
  onJumpToSetup: (barIndex: number) => void;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export function ValidationPanel({
  sessionId,
  currentIndex,
  onJumpToSetup,
  enabled,
  onToggle,
}: Props) {
  const [queue, setQueue] = useState<SetupQueueItem[]>([]);
  const [reasons, setReasons] = useState<RejectionReasonOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<"correct" | "incorrect" | "unsure">("correct");
  const [rejectionReason, setRejectionReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({ reviewed: 0, pending: 0, total: 0 });

  const loadQueue = async () => {
    const data = await api.getSetupQueue(sessionId);
    setQueue(data.items);
    setStats({
      reviewed: data.reviewed_count,
      pending: data.pending_count,
      total: data.total_setups,
    });
  };

  useEffect(() => {
    if (!enabled) return;
    loadQueue().catch(console.error);
    api.listRejectionReasons().then(setReasons).catch(console.error);
  }, [sessionId, enabled]);

  const visibleSetups = queue.filter((s) => s.bar_index <= currentIndex);
  const currentSetup =
    visibleSetups.find((s) => s.bar_index === currentIndex) ??
    visibleSetups[visibleSetups.length - 1];

  useEffect(() => {
    if (currentSetup && !selectedId) {
      setSelectedId(currentSetup.setup_id);
    }
  }, [currentSetup, selectedId]);

  const selected = queue.find((s) => s.setup_id === selectedId) ?? currentSetup;

  useEffect(() => {
    if (!selected) return;
    if (selected.review) {
      setVerdict(selected.review.verdict);
      setNotes(selected.review.notes ?? "");
      setRejectionReason(selected.review.rejection_reason ?? "");
    } else {
      setVerdict("correct");
      setNotes("");
      setRejectionReason("");
    }
  }, [selected?.setup_id]);

  const saveReview = async () => {
    if (!selected) return;
    if (verdict === "incorrect" && !rejectionReason) {
      alert("Select a rejection reason for incorrect verdicts.");
      return;
    }
    setSaving(true);
    try {
      await api.submitReview({
        setup_id: selected.setup_id,
        verdict,
        notes: notes || undefined,
        rejection_reason: verdict === "incorrect" ? rejectionReason : undefined,
        replay_session_id: sessionId,
      });
      await loadQueue();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel validation-panel">
      <div className="validation-header">
        <h3>Validation Mode</h3>
        <label className="toggle">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
          Enabled
        </label>
      </div>

      {enabled && (
        <>
          <p className="validation-stats">
            Reviewed {stats.reviewed} / {stats.total} · Pending {stats.pending}
          </p>

          <label className="field-label">
            Setup at bar
            <select
              value={selectedId ?? ""}
              onChange={(e) => {
                setSelectedId(e.target.value);
                const item = queue.find((s) => s.setup_id === e.target.value);
                if (item) onJumpToSetup(item.bar_index);
              }}
            >
              {visibleSetups.map((s) => (
                <option key={s.setup_id} value={s.setup_id}>
                  #{s.bar_index} {s.setup_type} ({s.direction}){" "}
                  {s.review ? `[${s.review.verdict}]` : "[pending]"}
                </option>
              ))}
            </select>
          </label>

          {selected && (
            <>
              <p className="setup-summary">{selected.explanation}</p>
              <p className="muted">
                Confidence {selected.confidence_score.toFixed(1)} ({selected.confidence_level})
              </p>

              <div className="verdict-buttons">
                {(["correct", "incorrect", "unsure"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`verdict-btn verdict-${v} ${verdict === v ? "active" : ""}`}
                    onClick={() => setVerdict(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>

              {verdict === "incorrect" && (
                <label className="field-label">
                  Rejection reason
                  <select
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                  >
                    <option value="">Select reason…</option>
                    {reasons.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </label>
              )}

              <label className="field-label">
                Notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Optional review notes…"
                />
              </label>

              <button type="button" className="save-review-btn" onClick={saveReview} disabled={saving}>
                {saving ? "Saving…" : "Save Review"}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
