import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const lanHost = env.VITE_DEV_HOST || process.env.VITE_DEV_HOST || "";
  const apiTarget = env.VITE_API_TARGET || process.env.VITE_API_TARGET || "http://127.0.0.1:8000";

  // Local launcher serves under /studio/; standalone Vercel set VITE_BASE=/
  const base = env.VITE_BASE || process.env.VITE_BASE || "/studio/";

  return {
    plugins: [react()],
    base,
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      allowedHosts: true,
      hmr: lanHost
        ? {
            host: lanHost,
            protocol: "ws",
            clientPort: 5173,
          }
        : undefined,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: "0.0.0.0",
      port: 5173,
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
