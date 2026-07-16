import { useState, type FormEvent } from "react";
import { useAuth } from "../store/auth";

export function LoginPage() {
  const login = useAuth((s) => s.login);
  const [username, setUsername] = useState("demo@trademind.ai");
  const [password, setPassword] = useState("demo123");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Enter your username and password.");
      return;
    }
    login(username.trim());
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-bg">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-surface via-elevated to-bg border-r border-subtle/60">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-lg font-semibold text-content">TradeMind AI</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-4xl font-semibold text-content leading-tight">
            The market, decoded in seconds.
          </h1>
          <p className="mt-4 text-muted leading-relaxed">
            A professional trading terminal unifying market structure, smart-money concepts, AI trade
            setups and strategy plans — with natural-language analysis and full explainability.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4">
            {[
              ["Structure", "BOS · CHoCH · HH/HL"],
              ["Smart Money", "OB · FVG · Sweeps"],
              ["Decision", "Setups · Strategies"],
            ].map(([t, s]) => (
              <div key={t} className="card p-3">
                <div className="text-sm font-semibold text-content">{t}</div>
                <div className="text-[11px] text-faint mt-1">{s}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-faint">© {new Date().getFullYear()} TradeMind AI · Decision support, not financial advice.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <Logo />
            <span className="text-lg font-semibold text-content">TradeMind AI</span>
          </div>
          <h2 className="text-2xl font-semibold text-content">Sign in</h2>
          <p className="mt-1 text-sm text-faint">Access your trading terminal.</p>
          <div className="mt-8 space-y-4">
            <Field label="Username">
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="trader" autoFocus autoComplete="username" />
            </Field>
            <Field label="Password">
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </Field>
            {error && <p className="text-sm text-bear">{error}</p>}
            <button type="submit" className="btn-primary w-full">Sign in</button>
          </div>
          <p className="mt-6 text-xs text-faint text-center">
            Demo session: <span className="text-muted">demo@trademind.ai</span> / <span className="text-muted">demo123</span>
            <span className="block text-[10px] text-faint mt-1">Local UI gate — market data comes from FastAPI.</span>
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Logo() {
  return (
    <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-brand to-info flex items-center justify-center shadow-card">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M17 7h4v4" />
      </svg>
    </div>
  );
}
