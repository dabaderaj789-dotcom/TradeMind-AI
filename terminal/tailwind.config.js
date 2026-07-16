/** @type {import('tailwindcss').Config} */
const withAlpha = (v) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: withAlpha("--c-bg"),
        surface: withAlpha("--c-surface"),
        elevated: withAlpha("--c-elevated"),
        overlay: withAlpha("--c-overlay"),
        subtle: withAlpha("--c-border"),
        line: withAlpha("--c-border"),
        content: withAlpha("--c-text"),
        muted: withAlpha("--c-text-muted"),
        faint: withAlpha("--c-text-faint"),
        brand: {
          DEFAULT: withAlpha("--c-brand"),
          soft: withAlpha("--c-brand-soft"),
        },
        bull: withAlpha("--c-bull"),
        bear: withAlpha("--c-bear"),
        warn: withAlpha("--c-warn"),
        info: withAlpha("--c-info"),
        neutral: withAlpha("--c-neutral"),
      },
          fontFamily: {
            sans: ["IBM Plex Sans", "Segoe UI", "system-ui", "sans-serif"],
            mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
            display: ["IBM Plex Sans", "Segoe UI", "system-ui", "sans-serif"],
          },
      borderRadius: {
        xl: "0.85rem",
        "2xl": "1.1rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.18)",
        pop: "0 12px 40px rgba(0,0,0,0.45)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "scale-in": "scale-in 0.15s ease-out",
      },
    },
  },
  plugins: [],
};
