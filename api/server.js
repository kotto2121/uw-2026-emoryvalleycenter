/**
 * api/server.js — minimal Express API backed by the SQLite db layer.
 *
 * Route documentation lives in api/README.md. Summary:
 *
 *   GET  /health       Liveness probe. Returns { ok: true }.
 *   GET  /api/hello    Latest greeting from SQLite. Returns { message, createdAt }.
 *   GET  /api/greetings  All greetings, newest first. Returns { greetings: [...] }.
 *   POST /api/greetings  Insert a greeting. Body: { message: string }. Returns { id, message }.
 *
 * Run standalone (dev):        node api/server.js          (listens on :4100)
 * Run as module (Electron):    require("../api/server.js").createApp()
 */
const express = require("express");
const path = require("path");
const db = require("../db");

function createApp() {
  const app = express();
  app.use(express.json());

  // Allow the Electron renderer (file:// or localhost:3000) to call the API.
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.get("/health", (req, res) => res.json({ ok: true }));

  app.get("/api/hello", async (req, res, next) => {
    try {
      const greeting = await db.latestGreeting();
      res.json(greeting ?? { message: "Hello World", createdAt: null });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/greetings", async (req, res, next) => {
    try {
      const d = await db.getDb();
      const rows = d.exec("SELECT id, message, created_at FROM greetings ORDER BY id DESC");
      const greetings = rows.length
        ? rows[0].values.map(([id, message, created_at]) => ({ id, message, createdAt: created_at }))
        : [];
      res.json({ greetings });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/greetings", async (req, res, next) => {
    try {
      const message = (req.body && req.body.message || "").toString().trim();
      if (!message) return res.status(400).json({ error: "message is required" });
      const created = await db.addGreeting(message);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  });

  // In production (packaged app), serve the static Next.js export from app/out
  // so Electron loads the UI over http://localhost:4100 (no file:// issues).
  if (process.env.NODE_ENV === "production") {
    const outDir = path.join(__dirname, "..", "app", "out");
    app.use(express.static(outDir, { index: "index.html" }));
  }

  app.use((err, req, res, next) => {
    console.error("[api] error:", err);
    res.status(500).json({ error: "internal error" });
  });

  return app;
}

module.exports = { createApp };

// Standalone mode: `node api/server.js`
if (require.main === module) {
  const port = process.env.PORT || 4100;
  createApp().listen(port, "127.0.0.1", () => {
    console.log(`[api] listening on http://localhost:${port}`);
  });
}
