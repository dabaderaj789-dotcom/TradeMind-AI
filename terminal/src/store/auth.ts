import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  username: string;
  displayName: string;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  login: (email: string, password: string) => { ok: true } | { ok: false; error: string };
  logout: () => void;
}

/** Temporary personal gate — frontend only. */
export const TEMP_LOGIN = {
  email: "trademind@ai.com",
  password: "TradeMind@2026",
} as const;

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      login: (email, password) => {
        const e = email.trim().toLowerCase();
        const p = password;
        if (e !== TEMP_LOGIN.email || p !== TEMP_LOGIN.password) {
          return { ok: false, error: "Invalid email or password." };
        }
        set({
          user: {
            username: TEMP_LOGIN.email,
            displayName: "Trader",
            role: "Trader",
          },
        });
        return { ok: true };
      },
      logout: () => set({ user: null }),
    }),
    { name: "trademind.auth.v3" },
  ),
);
