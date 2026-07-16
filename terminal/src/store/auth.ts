import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  username: string;
  displayName: string;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  login: (username: string) => void;
  logout: () => void;
}

/**
 * The TradeMind backend does not (yet) expose an authentication endpoint, so the
 * terminal manages a local session. `authService` is the single seam to swap in a
 * real login API later without touching the UI.
 */
export const authService = {
  async login(username: string, _password: string): Promise<AuthUser> {
    // Placeholder for a real POST /auth/login call.
    return {
      username,
      displayName: username.charAt(0).toUpperCase() + username.slice(1),
      role: "Trader",
    };
  },
};

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      login: (username) =>
        set({
          user: {
            username,
            displayName: username.charAt(0).toUpperCase() + username.slice(1),
            role: "Trader",
          },
        }),
      logout: () => set({ user: null }),
    }),
    { name: "trademind.auth" },
  ),
);
