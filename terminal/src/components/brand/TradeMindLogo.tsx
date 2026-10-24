/**
 * TradeMind AI mark — original trend + T/M monogram.
 * Works on dark/light headers and as a compact icon.
 */

export function TradeMindLogo({
  size = 28,
  withWordmark = false,
  className = "",
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden={!withWordmark}
        role={withWordmark ? "img" : undefined}
      >
        {withWordmark ? <title>TradeMind AI</title> : null}
        <rect width="32" height="32" rx="7" fill="url(#tm_bg)" />
        <path
          d="M7 21.5 L12.5 14.5 L16.2 18.2 L25 8.5"
          stroke="url(#tm_line)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M21.2 8.5 H25 V12.3"
          stroke="#34d399"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9.2 24.2 H14.8 M12 24.2 V19.6"
          stroke="#93c5fd"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="tm_bg" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1d4ed8" />
            <stop offset="1" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id="tm_line" x1="7" y1="21" x2="25" y2="9" gradientUnits="userSpaceOnUse">
            <stop stopColor="#60a5fa" />
            <stop offset="1" stopColor="#34d399" />
          </linearGradient>
        </defs>
      </svg>
      {withWordmark && (
        <span className="flex flex-col leading-none">
          <span className="font-display text-[13px] font-bold tracking-tight text-content">
            TradeMind <span className="text-brand">AI</span>
          </span>
          <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-faint">
            Trade smarter. Trade with edge.
          </span>
        </span>
      )}
    </span>
  );
}
