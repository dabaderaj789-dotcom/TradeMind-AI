import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface AuthState {
  user: string | null;
  login: (username: string) => void;
  logout: () => void;
}

const STORAGE_KEY = "trademind.session";
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const login = useCallback((username: string) => {
    localStorage.setItem(STORAGE_KEY, username);
    setUser(username);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
