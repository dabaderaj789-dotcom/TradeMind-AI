/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#070a12",
          900: "#0b0f1a",
          850: "#111725",
          800: "#161d2e",
          700: "#1e2740",
          600: "#2a3454",
        },
        brand: {
          400: "#5b8cff",
          500: "#3b6cff",
          600: "#2f57d6",
        },
        bull: "#22c55e",
        bear: "#ef4444",
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
      },
    },
  },
  plugins: [],
};
