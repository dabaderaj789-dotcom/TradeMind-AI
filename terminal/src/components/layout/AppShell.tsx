import { Outlet, useLocation } from "react-router-dom";
import { IconRail } from "./IconRail";
import { MobileNav } from "../shell/MobileNav";
import { cx } from "../../lib/format";

/** TradeMind Terminal shell — slim rail off-chart; chart routes go full-bleed. */
export function AppShell() {
  const location = useLocation();
  const onTerminal = location.pathname.startsWith("/terminal");

  return (
    <div className="terminal-shell flex h-screen overflow-hidden bg-bg">
      {!onTerminal && <IconRail />}
      <main
        className={cx(
          "flex min-w-0 flex-1 flex-col overflow-hidden pb-[calc(3.75rem+env(safe-area-inset-bottom))] lg:pb-0",
        )}
      >
        <Outlet />
      </main>
      <MobileNav />
    </div>
  );
}
