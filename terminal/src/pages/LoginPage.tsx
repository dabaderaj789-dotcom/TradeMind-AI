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
    <div className="grid min-h-screen bg-bg lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-subtle/40 bg-surface p-12 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(900px 420px at 20% 0%, rgb(var(--c-brand) / 0.14), transparent 55%), radial-gradient(700px 380px at 90% 80%, rgb(var(--c-info) / 0.08), transparent 50%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <Logo />
          <div>
            <div className="font-display text-lg font-semibold tracking-tight text-content">TradeMind AI</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">Terminal V2</div>
          </div>
        </div>
        <div className="relative max-w-md">
          <h1 className="font-display text-4xl font-semibold leading-[1.15] tracking-tight text-content">
            Price first.
            <br />
            Noise nowhere.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-muted">
            An institutional chart desk for structure, smart money and AI decisions — built to stay out of the way of price.
          </p>
        </div>
        <p className="relative text-xs text-faint">
          © {new Date().getFullYear()} TradeMind AI · Decision support, not financial advice.
        </p>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo />
            <div>
              <div className="font-display text-lg font-semibold">TradeMind AI</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand">Terminal V2</div>
            </div>
          </div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-content">Sign in</h2>
          <p className="mt-1 text-sm text-faint">Enter the terminal.</p>
          <div className="mt-8 space-y-4">
            <Field label="Username">
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="trader" autoFocus autoComplete="username" />
            </Field>
            <Field label="Password">
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </Field>
            {error && <p className="text-sm text-bear">{error}</p>}
            <button type="submit" className="btn-primary w-full">
              Enter terminal
            </button>
          </div>
          <p className="mt-6 text-center text-xs text-faint">
            Demo: <span className="text-muted">demo@trademind.ai</span> / <span className="text-muted">demo123</span>
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
