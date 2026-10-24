#!/usr/bin/env node
/**
 * Keep the Edge bookmark http://127.0.0.1:5173/ working.
 * Trading Terminal listens on 5175; this only redirects.
 */
import http from "node:http";

const TARGET = "http://127.0.0.1:5175/";
const PORT = 5173;

const server = http.createServer((req, res) => {
  const path = req.url && req.url !== "/" ? req.url : "";
  res.writeHead(302, { Location: `${TARGET.replace(/\/$/, "")}${path}` });
  res.end();
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`[redirect] port ${PORT} already in use — open ${TARGET}`);
    process.exit(0);
  }
  console.error("[redirect]", err);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[redirect] http://127.0.0.1:${PORT}/ → ${TARGET}`);
});
