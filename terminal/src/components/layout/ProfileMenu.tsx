import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../store/auth";

export function ProfileMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const initial = (user?.displayName ?? "?").slice(0, 1).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg pl-1 pr-2 py-1 hover:bg-elevated transition-colors"
      >
        <span className="h-8 w-8 rounded-full bg-gradient-to-br from-brand to-info flex items-center justify-center text-xs font-semibold text-white">
          {initial}
        </span>
        <span className="hidden md:block text-left leading-tight">
          <span className="block text-xs font-medium text-content">{user?.displayName}</span>
          <span className="block text-[10px] text-faint">{user?.role}</span>
        </span>
        <svg className="text-faint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 card shadow-pop p-1 z-50 animate-fade-in">
          <div className="px-3 py-2.5 border-b border-subtle/60">
            <div className="text-sm font-medium text-content">{user?.displayName}</div>
            <div className="text-xs text-faint">@{user?.username}</div>
          </div>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-content hover:bg-elevated rounded-lg"
            onClick={() => {
              setOpen(false);
              navigate("/settings");
            }}
          >
            <IconGear /> Settings
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-bear hover:bg-bear/10 rounded-lg"
            onClick={logout}
          >
            <IconLogout /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function IconGear() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
