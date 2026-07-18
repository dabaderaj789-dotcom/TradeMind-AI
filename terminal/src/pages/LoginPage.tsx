import { useState, type FormEvent } from "react";
import { useAuth } from "../store/auth";

export function LoginPage() {
  const login = useAuth((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter email and password.");
      return;
    }
    const result = login(email, password);
    if (!result.ok) setError(result.error);
    else setError(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-[380px] animate-fade-in">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-bg shadow-glow">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l6-6 4 4 8-8" />
              <path d="M17 7h4v4" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-content">TradeMind AI</h1>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">Terminal V4</div>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-subtle/50 bg-surface/90 p-6 shadow-card backdrop-blur-xl"
        >
          <h2 className="font-display text-lg font-semibold text-content">Sign in</h2>
          <p className="mt-1 text-sm text-faint">Personal trading terminal</p>

          <label className="mt-6 block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="trademind@ai.com"
              autoFocus
              autoComplete="username"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••"
              autoComplete="current-password"
            />
          </label>

          {error && <p className="mt-3 text-sm text-bear">{error}</p>}

          <button type="submit" className="btn-primary mt-6 w-full">
            Enter terminal
          </button>
        </form>
      </div>
    </div>
  );
}
