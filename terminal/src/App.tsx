import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { Spinner } from "./components/common/primitives";
import { LoginPage } from "./pages/LoginPage";
import { useThemeEffect } from "./hooks/useTheme";
import { useAuth } from "./store/auth";

const HomePage = lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));
const TerminalPage = lazy(() => import("./pages/TerminalPage").then((m) => ({ default: m.TerminalPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const MarketsPage = lazy(() => import("./pages/MarketsPage").then((m) => ({ default: m.MarketsPage })));
const WatchlistPage = lazy(() => import("./pages/WatchlistPage").then((m) => ({ default: m.WatchlistPage })));

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
    <Routes>
      <Route element={<AppShell />}>
        <Route
          index
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
        <Route
          path="terminal/:symbolId"
          element={
            <Suspense fallback={<PageFallback />}>
              <TerminalPage />
            </Suspense>
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
        <Route path="scanner" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
