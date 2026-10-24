import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { Spinner } from "./components/common/primitives";
import { LoginPage } from "./pages/LoginPage";
import { TerminalPage } from "./pages/TerminalPage";
import { TerminalHomeRedirect } from "./components/layout/TerminalHomeRedirect";
import { useThemeEffect } from "./hooks/useTheme";
import { useAuth } from "./store/auth";

const HomePage = lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const MarketsPage = lazy(() => import("./pages/MarketsPage").then((m) => ({ default: m.MarketsPage })));
const WatchlistPage = lazy(() => import("./pages/WatchlistPage").then((m) => ({ default: m.WatchlistPage })));
const LatencyLabPage = lazy(() =>
  import("./pages/LatencyLabPage").then((m) => ({ default: m.LatencyLabPage })),
);
const OptionChainPage = lazy(() =>
  import("./pages/OptionChainPage").then((m) => ({ default: m.OptionChainPage })),
);
const MarketAccuracyPage = lazy(() =>
  import("./pages/MarketAccuracyPage").then((m) => ({ default: m.MarketAccuracyPage })),
);
const AlertsPage = lazy(() => import("./pages/AlertsPage").then((m) => ({ default: m.AlertsPage })));

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner label="Loading…" />
    </div>
  );
}

export default function App() {
  useThemeEffect();
  const user = useAuth((s) => s.user);

  if (!user) return <LoginPage />;

  return (
    <ErrorBoundary label="Terminal failed to render">
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<TerminalHomeRedirect />} />
          <Route
            path="overview"
            element={
              <Suspense fallback={<PageFallback />}>
                <HomePage />
              </Suspense>
            }
          />
          <Route
            path="markets"
            element={
              <Suspense fallback={<PageFallback />}>
                <MarketsPage />
              </Suspense>
            }
          />
          <Route
            path="watchlist"
            element={
              <Suspense fallback={<PageFallback />}>
                <WatchlistPage />
              </Suspense>
            }
          />
          {/* Eager: TerminalPage includes Lightweight Charts — lazy load hung on “Loading…” forever */}
          <Route
            path="terminal/:symbolId"
            element={
              <ErrorBoundary label="Chart workspace crashed">
                <TerminalPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={<PageFallback />}>
                <SettingsPage />
              </Suspense>
            }
          />
          <Route
            path="lab/latency"
            element={
              <Suspense fallback={<PageFallback />}>
                <LatencyLabPage />
              </Suspense>
            }
          />
          <Route
            path="lab/options"
            element={
              <Suspense fallback={<PageFallback />}>
                <OptionChainPage />
              </Suspense>
            }
          />
          <Route
            path="lab/accuracy"
            element={
              <Suspense fallback={<PageFallback />}>
                <MarketAccuracyPage />
              </Suspense>
            }
          />
          <Route
            path="lab/alerts"
            element={
              <Suspense fallback={<PageFallback />}>
                <AlertsPage />
              </Suspense>
            }
          />
          <Route path="scanner" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
