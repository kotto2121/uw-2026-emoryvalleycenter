/**
 * api/server.js — local Express API for Greenhouse. Routes: see api/README.md.
 *
 * SECURITY MODEL (this app handles PHI on one laptop):
 *   - Listens on 127.0.0.1 only.
 *   - Every /api/* request must carry the per-launch secret in the
 *     `x-evc-token` header. Electron generates a random token at startup and
 *     hands it to the UI through the preload script, so a website open in
 *     Kristen's browser cannot read data from this local port (CORS alone
 *     wouldn't stop a malicious page from *trying*; the token does).
 *   - No wildcard CORS. In dev, only the Next.js dev server origin is allowed.
 *   - Host header must be localhost/127.0.0.1 (blocks DNS-rebinding tricks).
 *
 * Run standalone (dev):     node api/server.js   (port 4100, token from EVC_API_TOKEN or "dev-token")
 * Run in Electron:          require("../api/server.js").createApp({ token, staticDir })
 */
const express = require("express");
const db = require("../db");
const { resolveReview } = require("../db/people");
const { readIncidentWorkbook } = require("./lib/incidents-xlsx");
const { readDocx, guessRoster } = require("./lib/docx-tables");
const { importIncidents, importRoster, deleteBatch } = require("./lib/importer");
const { generateDemoFiles } = require("./lib/demo");
const { bhRosterWorkbook } = require("./lib/reports");
const q = require("./lib/queries");

const MAX_UPLOAD = "40mb";

/** Wrap a sync/async handler so thrown errors reach the error middleware. */
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function createApp({ token, staticDir = null, allowOrigin = null } = {}) {
  if (!token) throw new Error("createApp requires a token");
  const app = express();
  app.disable("x-powered-by");

  // Only answer requests addressed to the loopback host.
  app.use((req, res, next) => {
    const host = String(req.headers.host || "").replace(/:\d+$/, "");
    if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) return res.status(421).end();
    next();
  });

  if (allowOrigin) {
    app.use((req, res, next) => {
      if (req.headers.origin === allowOrigin) {
        res.setHeader("Access-Control-Allow-Origin", allowOrigin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-evc-token, x-filename");
        res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
      }
      if (req.method === "OPTIONS") return res.sendStatus(204);
      next();
    });
  }

  app.get("/health", (req, res) => res.json({ ok: true }));

  // Everything under /api requires the token.
  app.use("/api", (req, res, next) => {
    if (req.headers["x-evc-token"] !== token) return res.status(401).json({ error: "unauthorized" });
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", express.json({ limit: "2mb" }));
  const raw = express.raw({ type: () => true, limit: MAX_UPLOAD });
  const filenameOf = (req) => decodeURIComponent(String(req.headers["x-filename"] || "upload"));

  // ---- meta / dashboards ----
  app.get("/api/meta", h(async (req, res) => { await db.getDb(); res.json(q.meta()); }));
  app.get("/api/overview", h(async (req, res) => { await db.getDb(); res.json(q.overview()); }));
  app.get("/api/bh", h(async (req, res) => { await db.getDb(); res.json(q.bhDashboard({ month: req.query.month })); }));
  app.get("/api/incidents/summary", h(async (req, res) => {
    await db.getDb();
    res.json(q.incidentsSummary(filtersFrom(req.query)));
  }));
  app.get("/api/incidents", h(async (req, res) => {
    await db.getDb();
    res.json(q.incidentList({ ...filtersFrom(req.query), q: req.query.q, flag: req.query.flag, limit: req.query.limit, offset: req.query.offset }));
  }));

  // ---- imports ----
  app.get("/api/imports", h(async (req, res) => {
    await db.getDb();
    res.json({
      imports: db.all("SELECT * FROM import_batch ORDER BY id DESC").map((b) => ({
        ...b, summary: JSON.parse(b.summary_json || "null"), summary_json: undefined,
      })),
    });
  }));

  app.post("/api/import/incidents", raw, h(async (req, res) => {
    await db.getDb();
    const { rows, warnings, sheet, unmappedHeaders } = await readIncidentWorkbook(req.body);
    db.backup("pre-import");
    const summary = importIncidents({ rows, filename: filenameOf(req), warnings });
    res.status(201).json({ ...summary, sheet, unmappedHeaders });
  }));

  // Word roster: step 1 = preview (we guess, the user confirms), step 2 = commit.
  app.post("/api/import/roster/preview", raw, h(async (req, res) => {
    const { blocks } = await readDocx(req.body);
    const guess = guessRoster(blocks, filenameOf(req));
    if (!guess.tables.length) return res.status(422).json({ error: "No tables found in that Word document." });
    res.json(guess);
  }));

  app.post("/api/import/roster/commit", h(async (req, res) => {
    await db.getDb();
    const { month, filename, tables } = req.body || {};
    // tables: [{ service: 'OP'|'PSR'|null, nameCol, serviceCol, header, rows }]
    const entries = [];
    for (const t of tables || []) {
      for (const row of t.rows || []) {
        const name = row[t.nameCol];
        let service = t.service;
        if (t.serviceCol >= 0 && !service) {
          const v = String(row[t.serviceCol] || "");
          service = /psycho|psr/i.test(v) ? "PSR" : /out|\bop\b/i.test(v) ? "OP" : null;
        }
        if (!service || !name) continue;
        const extra = {};
        (t.header || []).forEach((hd, i) => { if (i !== t.nameCol) extra[hd] = row[i] ?? ""; });
        entries.push({ name, service, extra });
      }
    }
    if (!entries.length) return res.status(400).json({ error: "Nothing to import — mark at least one table as OP or PSR." });
    db.backup("pre-import");
    res.status(201).json(importRoster({ entries, month, filename }));
  }));

  app.delete("/api/imports/:id", h(async (req, res) => {
    await db.getDb();
    db.backup("pre-undo");
    res.json(deleteBatch(Number(req.params.id)));
  }));

  // ---- people & review queue ----
  app.get("/api/people", h(async (req, res) => { await db.getDb(); res.json({ people: q.peopleList({ q: req.query.q }) }); }));
  app.get("/api/people/:id", h(async (req, res) => {
    await db.getDb();
    const d = q.personDetail(Number(req.params.id));
    if (!d) return res.status(404).json({ error: "person not found" });
    res.json(d);
  }));
  app.patch("/api/people/:id", h(async (req, res) => {
    await db.getDb();
    const name = String(req.body?.display_name || "").trim();
    if (!name) return res.status(400).json({ error: "display_name is required" });
    db.tx(() => db.run("UPDATE person SET display_name = ? WHERE id = ?", [name, Number(req.params.id)]));
    res.json({ ok: true });
  }));
  app.get("/api/reviews", h(async (req, res) => { await db.getDb(); res.json({ reviews: q.reviewQueue({ status: req.query.status || "pending" }) }); }));
  app.post("/api/reviews/:id", h(async (req, res) => {
    await db.getDb();
    const { action, keepId } = req.body || {};
    res.json(db.tx(() => resolveReview(Number(req.params.id), action, keepId ? Number(keepId) : undefined)));
  }));

  // ---- reports ----
  app.get("/api/reports/bh-roster", h(async (req, res) => {
    await db.getDb();
    const { month, service } = req.query;
    if (!month || !["OP", "PSR"].includes(service)) return res.status(400).json({ error: "month and service (OP|PSR) are required" });
    res.json({ month, service, rows: q.bhRoster({ month, service }) });
  }));
  app.get("/api/reports/bh-roster.xlsx", h(async (req, res) => {
    await db.getDb();
    const { month } = req.query;
    const services = req.query.service ? [req.query.service] : ["OP", "PSR"];
    if (!month || services.some((s) => !["OP", "PSR"].includes(s))) return res.status(400).json({ error: "bad month/service" });
    const buf = await bhRosterWorkbook({ month, services });
    const name = `BH Roster ${services.join("+")} ${month}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(buf);
  }));

  // ---- demo data & admin ----
  app.post("/api/demo/load", h(async (req, res) => {
    await db.getDb();
    const meta = q.meta();
    if (meta.hasData && !meta.isDemo) {
      return res.status(409).json({ error: "Real data is loaded. Clear all data before loading the demo." });
    }
    db.clearAll();
    const files = await generateDemoFiles();
    const results = [];
    for (let i = 0; i < files.incidents.length; i++) {
      const inc = files.incidents[i];
      const { rows } = await readIncidentWorkbook(inc.buffer);
      results.push(importIncidents({ rows, filename: inc.filename, isDemo: true }));
      const ros = files.rosters[i];
      const { blocks } = await readDocx(ros.buffer);
      const guess = guessRoster(blocks, ros.filename);
      const entries = guess.tables.flatMap((t) =>
        t.rows.map((row) => ({
          name: row[t.nameCol],
          service: t.service,
          extra: Object.fromEntries(t.header.map((hd, j) => [hd, row[j]]).filter((_, j) => j !== t.nameCol)),
        })));
      results.push(importRoster({ entries, month: guess.month || ros.month, filename: ros.filename, isDemo: true }));
    }
    db.tx(() => db.run("UPDATE import_batch SET is_demo = 1"));
    res.status(201).json({ ok: true, imports: results.length, meta: q.meta() });
  }));

  app.post("/api/admin/clear", h(async (req, res) => {
    await db.getDb();
    if (req.body?.confirm !== "CLEAR") return res.status(400).json({ error: 'send { "confirm": "CLEAR" }' });
    const backupPath = db.backup("pre-clear");
    db.clearAll();
    res.json({ ok: true, backup: backupPath });
  }));

  app.get("/api/admin/info", h(async (req, res) => {
    await db.getDb();
    res.json({ dbPath: db.dbFilePath(), version: require("../package.json").version });
  }));

  app.use("/api", (req, res) => res.status(404).json({ error: "not found" }));

  // Packaged app: serve the static Next.js export (app/out).
  if (staticDir) app.use(express.static(staticDir, { index: "index.html", extensions: ["html"] }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error("[api] error:", err);
    res.status(status).json({ error: status >= 500 ? "Internal error — see the app log." : err.message });
  });

  return app;
}

function filtersFrom(query) {
  return {
    from: /^\d{4}-\d{2}$/.test(query.from || "") ? query.from : undefined,
    to: /^\d{4}-\d{2}$/.test(query.to || "") ? query.to : undefined,
    site: query.site || undefined,
    includeDuplicates: query.includeDuplicates === "1",
  };
}

module.exports = { createApp };

// Standalone mode (dev): `node api/server.js`
if (require.main === module) {
  const port = Number(process.env.PORT) || 4100;
  const token = process.env.EVC_API_TOKEN || "dev-token";
  createApp({ token, allowOrigin: process.env.EVC_DEV_ORIGIN || "http://localhost:3000" }).listen(port, "127.0.0.1", () => {
    console.log(`[api] listening on http://127.0.0.1:${port} (dev token: ${token})`);
  });
}
