import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dashboard talks to the TradeMind API through a same-origin proxy so the
// browser never triggers CORS (backend allows :3000 / :5173 only).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET ?? "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
