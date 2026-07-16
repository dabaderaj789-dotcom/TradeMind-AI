import { useEffect } from "react";
import { useSettings } from "../store/settings";

/** Applies the persisted theme to the document root. */
export function useThemeEffect() {
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
}
