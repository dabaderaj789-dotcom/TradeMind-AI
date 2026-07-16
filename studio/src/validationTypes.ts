export interface ValidationReview {
  id: string;
  setup_id: string;
  verdict: "correct" | "incorrect" | "unsure";
  rejection_reason: string | null;
  rejection_reason_label: string | null;
  notes: string | null;
  plugin_issues: string[];
  confidence_score: number;
  reviewed_at: string;
}

export interface SetupQueueItem {
  setup_id: string;
  setup_type: string;
  direction: string;
  confidence_score: number;
  confidence_level: string;
  detected_at: string;
  bar_index: number;
  explanation: string;
  review: ValidationReview | null;
}

export interface SetupQueue {
  session_id: string;
  validation_mode: boolean;
  total_setups: number;
  reviewed_count: number;
  pending_count: number;
  items: SetupQueueItem[];
}

export interface RejectionReasonOption {
  value: string;
  label: string;
  plugin: string;
}

export interface ValidationDashboard {
  filters_applied: Record<string, string>;
  total_reviewed: number;
  correct_count: number;
  incorrect_count: number;
  unsure_count: number;
  acceptance_rate_pct: number;
  rejection_rate_pct: number;
  unsure_rate_pct: number;
  rejection_reasons: Array<{ reason: string; label: string; count: number }>;
  plugin_statistics: Record<string, {
    label: string;
    flagged_reviews: number;
    incorrect_count: number;
    incorrect_rate_pct: number;
  }>;
  setup_type_statistics: Record<string, {
    total: number;
    incorrect: number;
    incorrect_rate_pct: number;
  }>;
}

export interface ValidationReport {
  summary: string;
  incorrect_total: number;
  issues: Array<{
    category: string;
    key: string;
    label: string;
    count: number;
    pct_of_incorrect: number;
    severity: string;
  }>;
  recommendations: string[];
  filters_applied: Record<string, string>;
}
