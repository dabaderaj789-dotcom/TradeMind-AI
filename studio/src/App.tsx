import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { DebugPanel } from "./components/DebugPanel";
import { EventLog } from "./components/EventLog";
import { InspectorPanel } from "./components/InspectorPanel";
import { OverlayToggles } from "./components/OverlayToggles";
import { ReplayChart } from "./components/ReplayChart";
import { ValidationDashboardView } from "./components/ValidationDashboard";
import { ValidationPanel } from "./components/ValidationPanel";
import type {
  DebugData,
  InspectorData,
  MetricsData,
  OverlayKey,
  ReplayEvent,
  ReplayFrame,
  ReplaySession,
} from "./types";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];
const SPEEDS = [0.5, 1, 2, 4, 8];

export default function App() {
  const [symbols, setSymbols] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [symbolId, setSymbolId] = useState("");
  const [timeframe, setTimeframe] = useState("1h");
  const [session, setSession] = useState<ReplaySession | null>(null);
  const [frame, setFrame] = useState<ReplayFrame | null>(null);
  const [events, setEvents] = useState<ReplayEvent[]>([]);
  const [inspector, setInspector] = useState<InspectorData | null>(null);
  const [debug, setDebug] = useState<DebugData | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [enabledOverlays, setEnabledOverlays] = useState<Set<OverlayKey>>(
    () => new Set(["ema", "sma", "vwap", "market_structure"]),
  );
  const [debugMode, setDebugMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [jumpDate, setJumpDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationMode, setValidationMode] = useState(false);
  const [view, setView] = useState<"replay" | "dashboard">("replay");
  const playTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickMs = useRef(500);

  useEffect(() => {
    api.listSymbols().then((r) => {
      setSymbols(r.items);
      if (r.items.length) setSymbolId(r.items[0].id);
    }).catch((e) => setError(String(e)));
  }, []);

  const refreshFrame = useCallback(async (sessionId: string) => {
    const overlays = [...enabledOverlays];
    const f = await api.getFrame(sessionId, overlays);
    setFrame(f);
    const insp = await api.getInspector(sessionId);
    setInspector(insp);
    if (debugMode) {
      setDebug(await api.getDebug(sessionId));
    }
  }, [enabledOverlays, debugMode]);

  const startSession = async () => {
    if (!symbolId) return;
    setLoading(true);
    setError(null);
    try {
      const s = await api.createSession({ symbol_id: symbolId, timeframe, candle_limit: 3000 });
      setSession(s);
      const ev = await api.listEvents(s.session_id);
      setEvents(ev.items);
      setMetrics(await api.getMetrics(s.session_id));
      await refreshFrame(s.session_id);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleStepForward = async () => {
    if (!session) return;
    const f = await api.stepForward(session.session_id);
    setFrame(f);
    setSession((prev) => prev ? { ...prev, current_index: f.current_index, current_time: f.current_time } : prev);
    setInspector(await api.getInspector(session.session_id));
  };

  const handleStepBack = async () => {
    if (!session) return;
    const f = await api.stepBack(session.session_id);
    setFrame(f);
    setSession((prev) => prev ? { ...prev, current_index: f.current_index, current_time: f.current_time } : prev);
    setInspector(await api.getInspector(session.session_id));
  };

  const handleJumpIndex = async (index: number) => {
    if (!session) return;
    const f = await api.jump(session.session_id, { index });
    setFrame(f);
    setSession((prev) => prev ? { ...prev, current_index: f.current_index } : prev);
    setInspector(await api.getInspector(session.session_id, index));
  };

  const handleJumpDate = async () => {
    if (!session || !jumpDate) return;
    const f = await api.jump(session.session_id, { open_time: new Date(jumpDate).toISOString() });
    setFrame(f);
    setSession((prev) => prev ? { ...prev, current_index: f.current_index } : prev);
    setInspector(await api.getInspector(session.session_id));
  };

  const handleEventSelect = async (eventId: string) => {
    if (!session) return;
    const f = await api.jumpEvent(session.session_id, { event_id: eventId });
    setFrame(f);
    setSession((prev) => prev ? { ...prev, current_index: f.current_index } : prev);
    setInspector(await api.getInspector(session.session_id));
  };

  const handleOverlayChange = (key: OverlayKey, checked: boolean) => {
    setEnabledOverlays((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  useEffect(() => {
    if (session) refreshFrame(session.session_id);
  }, [enabledOverlays, session, refreshFrame]);

  useEffect(() => {
    if (!session || !playing) {
      if (playTimer.current) clearInterval(playTimer.current);
      return;
    }

    const run = async () => {
      if (!session) return;
      if (session.current_index >= session.total_bars - 1) {
        setPlaying(false);
        return;
      }
      await handleStepForward();
    };

    playTimer.current = setInterval(run, tickMs.current);
    return () => {
      if (playTimer.current) clearInterval(playTimer.current);
    };
  }, [playing, session?.session_id, session?.current_index, session?.total_bars]);

  const togglePlay = async () => {
    if (!session) return;
    const next = !playing;
    const hint = await api.setPlayback(session.session_id, next, speed);
    tickMs.current = hint.tick_interval_ms;
    setPlaying(next);
  };

  const changeSpeed = async (s: number) => {
    setSpeed(s);
    if (!session) return;
    const hint = await api.setPlayback(session.session_id, playing, s);
    tickMs.current = hint.tick_interval_ms;
  };

  const toggleDebug = async (enabled: boolean) => {
    setDebugMode(enabled);
    if (!session) return;
    await api.updateSettings(session.session_id, { debug_mode: enabled });
    if (enabled) setDebug(await api.getDebug(session.session_id));
    else setDebug(null);
  };

  const toggleValidationMode = async (enabled: boolean) => {
    setValidationMode(enabled);
    if (!session) return;
    await api.updateSettings(session.session_id, { validation_mode: enabled });
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>TradeMind Replay Studio</h1>
          <p className="subtitle">Internal engineering validation — no future candle reveal</p>
        </div>
        <div className="session-controls">
          <div className="view-tabs">
            <button
              type="button"
              className={view === "replay" ? "active" : ""}
              onClick={() => setView("replay")}
            >
              Replay
            </button>
            <button
              type="button"
              className={view === "dashboard" ? "active" : ""}
              onClick={() => setView("dashboard")}
            >
              Dashboard
            </button>
          </div>
          {view === "replay" && (
            <>
              <select value={symbolId} onChange={(e) => setSymbolId(e.target.value)}>
                {symbols.map((s) => (
                  <option key={s.id} value={s.id}>{s.code}</option>
                ))}
              </select>
              <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                {TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
              </select>
              <button type="button" onClick={startSession} disabled={loading}>
                {loading ? "Loading…" : "Start Replay"}
              </button>
            </>
          )}
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {view === "dashboard" && (
        <ValidationDashboardView symbols={symbols} />
      )}

      {view === "replay" && session && frame && (
        <>
          <div className="toolbar">
            <button type="button" onClick={handleStepBack} title="Step back">◀</button>
            <button type="button" onClick={togglePlay} title="Play / Pause">
              {playing ? "⏸" : "▶"}
            </button>
            <button type="button" onClick={handleStepForward} title="Step forward">▶</button>
            <select value={speed} onChange={(e) => changeSpeed(Number(e.target.value))}>
              {SPEEDS.map((s) => <option key={s} value={s}>{s}x</option>)}
            </select>
            <span className="bar-indicator">
              Bar {frame.current_index + 1} / {frame.total_bars}
            </span>
            <input
              type="range"
              min={0}
              max={frame.total_bars - 1}
              value={frame.current_index}
              onChange={(e) => handleJumpIndex(Number(e.target.value))}
              className="timeline"
            />
            <input
              type="datetime-local"
              value={jumpDate}
              onChange={(e) => setJumpDate(e.target.value)}
            />
            <button type="button" onClick={handleJumpDate}>Jump to Date</button>
            <button
              type="button"
              onClick={async () => {
                if (!session) return;
                const f = await api.jumpEvent(session.session_id, { direction: "previous" });
                setFrame(f);
                setSession((prev) => prev ? { ...prev, current_index: f.current_index } : prev);
                setInspector(await api.getInspector(session.session_id));
              }}
            >
              ◀ Event
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!session) return;
                const f = await api.jumpEvent(session.session_id, { direction: "next" });
                setFrame(f);
                setSession((prev) => prev ? { ...prev, current_index: f.current_index } : prev);
                setInspector(await api.getInspector(session.session_id));
              }}
            >
              Event ▶
            </button>
          </div>

          <div className="layout">
            <aside className="sidebar left">
              <OverlayToggles enabled={enabledOverlays} onChange={handleOverlayChange} />
            </aside>

            <main className="main">
              <ReplayChart
                frame={frame}
                enabledOverlays={enabledOverlays}
                onCandleClick={handleJumpIndex}
              />
            </main>

            <aside className="sidebar right">
              <ValidationPanel
                sessionId={session.session_id}
                currentIndex={frame.current_index}
                onJumpToSetup={handleJumpIndex}
                enabled={validationMode}
                onToggle={toggleValidationMode}
              />
              <InspectorPanel data={inspector} />
              <DebugPanel
                debug={debug}
                metrics={metrics}
                debugMode={debugMode}
                onToggleDebug={toggleDebug}
              />
            </aside>
          </div>

          <EventLog
            events={events}
            currentIndex={frame.current_index}
            onSelect={handleEventSelect}
          />
        </>
      )}

      {view === "replay" && !session && !loading && (
        <div className="empty-state">
          <p>Select a symbol and timeframe, then start a replay session.</p>
          <p className="muted">Requires persisted candles and analysis results in the database.</p>
        </div>
      )}
    </div>
  );
}
