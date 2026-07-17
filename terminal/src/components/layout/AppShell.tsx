import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "../shell/MobileNav";

export function AppShell() {
  return (
    <div className="terminal-shell flex h-screen overflow-hidden bg-bg">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden pb-[calc(3.75rem+env(safe-area-inset-bottom))] lg:pb-0">
        <Outlet />
      </main>
      <MobileNav />
    </div>
  );
}
