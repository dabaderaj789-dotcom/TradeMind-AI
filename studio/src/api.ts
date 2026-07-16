const API_BASE = import.meta.env.VITE_API_BASE ?? "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listSymbols: (search?: string) =>
    request<{ items: Array<{ id: string; code: string; name: string }> }>(
      `/symbols?page_size=100${search ? `&search=${encodeURIComponent(search)}` : ""}`,
    ),

  createSession: (body: {
    symbol_id: string;
    timeframe: string;
    candle_limit?: number;
    strategy_id?: string;
  }) => request<import("./types").ReplaySession>("/replay-studio/sessions", {
    method: "POST",
    body: JSON.stringify(body),
  }),

  getFrame: (sessionId: string, overlays?: string[]) =>
    request<import("./types").ReplayFrame>(
      `/replay-studio/sessions/${sessionId}/frame${
        overlays?.length ? `?overlays=${overlays.join(",")}` : ""
      }`,
    ),

  stepForward: (sessionId: string, steps = 1) =>
    request<import("./types").ReplayFrame>(
      `/replay-studio/sessions/${sessionId}/step-forward`,
      { method: "POST", body: JSON.stringify({ steps }) },
    ),

  stepBack: (sessionId: string, steps = 1) =>
    request<import("./types").ReplayFrame>(
      `/replay-studio/sessions/${sessionId}/step-back`,
      { method: "POST", body: JSON.stringify({ steps }) },
    ),

  jump: (sessionId: string, body: { index?: number; open_time?: string }) =>
    request<import("./types").ReplayFrame>(
      `/replay-studio/sessions/${sessionId}/jump`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  jumpEvent: (sessionId: string, body: { event_id?: string; direction?: string }) =>
    request<import("./types").ReplayFrame>(
      `/replay-studio/sessions/${sessionId}/jump-event`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  setPlayback: (sessionId: string, playing: boolean, speed?: number) =>
    request<{ tick_interval_ms: number; replay_speed: number }>(
      `/replay-studio/sessions/${sessionId}/playback`,
      { method: "POST", body: JSON.stringify({ playing, speed }) },
    ),

  getInspector: (sessionId: string, barIndex?: number) =>
    request<import("./types").InspectorData>(
      `/replay-studio/sessions/${sessionId}/inspector${
        barIndex !== undefined ? `?bar_index=${barIndex}` : ""
      }`,
    ),

  listEvents: (sessionId: string) =>
    request<{ items: import("./types").ReplayEvent[]; total: number }>(
      `/replay-studio/sessions/${sessionId}/events`,
    ),

  getDebug: (sessionId: string) =>
    request<import("./types").DebugData>(`/replay-studio/sessions/${sessionId}/debug`),

  getMetrics: (sessionId: string) =>
    request<import("./types").MetricsData>(`/replay-studio/sessions/${sessionId}/metrics`),

  updateSettings: (
    sessionId: string,
    settings: { debug_mode?: boolean; validation_mode?: boolean },
  ) =>
    request<import("./types").ReplaySession>(
      `/replay-studio/sessions/${sessionId}/settings`,
      { method: "PATCH", body: JSON.stringify(settings) },
    ),

  getSetupQueue: (sessionId: string) =>
    request<import("./validationTypes").SetupQueue>(
      `/validation/sessions/${sessionId}/setups`,
    ),

  listRejectionReasons: () =>
    request<import("./validationTypes").RejectionReasonOption[]>(
      "/validation/rejection-reasons",
    ),

  submitReview: (body: {
    setup_id: string;
    verdict: "correct" | "incorrect" | "unsure";
    notes?: string;
    rejection_reason?: string;
    replay_session_id?: string;
  }) =>
    request<import("./validationTypes").ValidationReview>("/validation/reviews", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getDashboard: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return request<import("./validationTypes").ValidationDashboard>(
      `/validation/dashboard${qs ? `?${qs}` : ""}`,
    );
  },

  getValidationReport: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return request<import("./validationTypes").ValidationReport>(
      `/validation/report${qs ? `?${qs}` : ""}`,
    );
  },

  exportValidationCsv: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return fetch(`${API_BASE}/validation/export.csv${qs ? `?${qs}` : ""}`).then((r) => {
      if (!r.ok) throw new Error(r.statusText);
      return r.text();
    });
  },
};
