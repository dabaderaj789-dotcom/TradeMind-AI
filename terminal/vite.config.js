import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
// Bound to 0.0.0.0 so phones on the same Wi-Fi can connect.
// HMR host is set via VITE_DEV_HOST (LAN IP) from launch.mjs.
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), "");
    var lanHost = env.VITE_DEV_HOST || process.env.VITE_DEV_HOST || "";
    var apiTarget = env.VITE_API_TARGET || process.env.VITE_API_TARGET || "http://127.0.0.1:8000";
    return {
        plugins: [react()],
        resolve: {
            alias: {
                "@": fileURLToPath(new URL("./src", import.meta.url)),
            },
        },
        server: {
            host: "0.0.0.0",
            port: 5175,
            strictPort: true,
            // Allow access via LAN IP / hostname from iPhone Safari
            allowedHosts: true,
            hmr: lanHost
                ? {
                    host: lanHost,
                    protocol: "ws",
                    clientPort: 5175,
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
            port: 5175,
        },
        build: {
            outDir: "dist",
            emptyOutDir: true,
            chunkSizeWarningLimit: 900,
        },
    };
});
