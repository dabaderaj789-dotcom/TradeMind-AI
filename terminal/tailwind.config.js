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
        sans: ["Sora", "Segoe UI", "system-ui", "sans-serif"],
        display: ["Sora", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 28px rgba(0,0,0,0.35)",
        pop: "0 16px 48px rgba(0,0,0,0.55)",
        glow: "0 0 0 1px rgba(94, 168, 210, 0.18), 0 0 24px rgba(94, 168, 210, 0.08)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-left": {
          "0%": { opacity: "0", transform: "translateX(-12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.98)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
        "slide-in-right": "slide-in-right 0.32s cubic-bezier(0.22, 1, 0.36, 1)",
        "slide-in-left": "slide-in-left 0.32s cubic-bezier(0.22, 1, 0.36, 1)",
        "scale-in": "scale-in 0.2s ease-out",
        "pulse-soft": "pulseSoft 2.4s ease-in-out infinite",
      },
      transitionTimingFunction: {
        terminal: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
