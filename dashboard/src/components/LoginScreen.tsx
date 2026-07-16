import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Enter your username and password to continue.");
      return;
    }
    setError(null);
    login(username.trim());
  };

  return (
    <div className="min-h-full grid lg:grid-cols-2">
      {/* Brand / marketing side */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-base-900 via-base-850 to-base-950 border-r border-base-800">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-lg font-semibold text-slate-100">TradeMind AI</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold text-slate-50 leading-snug">
            Institutional-grade market intelligence.
          </h1>
          <p className="mt-4 text-slate-400">
            Smart-money structure, order blocks, fair value gaps, liquidity sweeps and
            AI-generated trade setups — unified in a single professional cockpit.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-400">
            {[
              "Real-time market structure & trend detection",
              "Order Block, FVG & Liquidity Sweep analytics",
              "Confidence-scored trade setups & strategy plans",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-slate-600">
          © {new Date().getFullYear()} TradeMind AI. For informational purposes only. Not financial advice.
        </p>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center p-6">
        <form onSubmit={onSubmit} className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <Logo />
            <span className="text-lg font-semibold text-slate-100">TradeMind AI</span>
          </div>
          <h2 className="text-2xl font-semibold text-slate-50">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Access your trading dashboard.</p>

          <div className="mt-8 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Username</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="trader"
                autoFocus
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-bear">{error}</p>}
            <button type="submit" className="btn-primary w-full">
              Sign in
            </button>
          </div>

          <p className="mt-6 text-xs text-slate-600 text-center">
            Demo access — enter any username and password to explore the dashboard.
          </p>
        </form>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-card">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M17 7h4v4" />
      </svg>
    </div>
  );
}
