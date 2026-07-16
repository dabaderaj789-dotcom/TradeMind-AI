import { useQueryClient } from "@tanstack/react-query";
import { useSettings } from "../../store/settings";
import { ProfileMenu } from "./ProfileMenu";

export function TopBarActions() {
  const qc = useQueryClient();
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);

  return (
    <div className="flex items-center gap-1.5">
      <button
        className="btn-chip !px-2"
        title="Refresh all data"
        onClick={() => qc.invalidateQueries()}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-2.6-6.4" />
          <path d="M21 3v6h-6" />
        </svg>
      </button>
      <button
        className="btn-chip !px-2"
        title="Toggle theme"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        {theme === "dark" ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
        )}
      </button>
      <div className="ml-1">
        <ProfileMenu />
      </div>
    </div>
  );
}
