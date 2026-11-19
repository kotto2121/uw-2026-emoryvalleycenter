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
const { readDocx, guessRoster, tableEntries } = require("./lib/docx-tables");
const { importIncidents, importRoster, deleteBatch } = require("./lib/importer");
const uploads = require("./lib/uploads");
const { FIELDS, REQUIRED, squash } = require("./lib/incidents-xlsx");
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

  // ---- Excel import: analyze -> (review unknown columns) -> commit ----
  // Single upload: the file is held in memory under an uploadId while the
  // user reviews unknown headers; nothing is committed until they confirm.
  const PROGRAM = "phs_incidents";

  const mappingsFor = () =>
    db.all("SELECT field, alias, required FROM column_mappings WHERE program = ?", [PROGRAM]);

  const knownFieldNames = () => {
    const seen = new Set();
    for (const [f] of FIELDS) seen.add(f);
    for (const m of mappingsFor()) seen.add(m.field);
    return [...seen];
  };

  app.post("/api/imports/analyze", raw, h(async (req, res) => {
    await db.getDb();
    const mappings = mappingsFor();
    const result = await readIncidentWorkbook(req.body, { mappings, require: false });
    const { uploadId } = uploads.hold({ filename: filenameOf(req), buffer: req.body, result });
    res.json({
      uploadId,
      sheet: result.sheet,
      rowsRead: result.rows.length,
      warnings: result.warnings,
      unknownHeaders: result.unknownHeaders,
      missingRequired: result.missingRequired,
      knownFields: knownFieldNames(),
      requiredFields: REQUIRED,
    });
  }));

  app.post("/api/imports/:uploadId/commit", h(async (req, res) => {
    await db.getDb();
    const held = uploads.takeForCommit(req.params.uploadId);
    if (!held) return res.status(410).json({ error: "That upload has expired or was already imported. Please drop the file again." });

    // decisions: [{ header, action: 'map'|'new'|'ignore', field?, remember? }]
    const decisions = Array.isArray(req.body?.decisions) ? req.body.decisions : [];
    const extraByField = {};   // field -> header(s) accepted as extra columns
    const remember = [];       // mappings to persist for next time

    for (const d of decisions) {
      const header = String(d.header || "").trim();
      if (!header || d.action === "ignore") continue;
      if (d.action === "new") {
        const field = String(d.field || "").trim();
        if (!field) continue;
        extraByField[field] = extraByField[field] || [];
        extraByField[field].push(header);
        if (d.remember) remember.push({ field, alias: header, isNew: true });
      } else if (d.action === "map" && d.field) {
        // Header resolved to an existing canonical field: remember so next
        // month's file with the same header imports without asking.
        if (d.remember) remember.push({ field: d.field, alias: header });
      }
    }

    // Re-parse the held buffer with (mappings + remembered 'map' decisions).
    // 'new' fields get a synthetic alias so the parser materializes their
    // values under a header-named key, which we then collect into extra_fields.
    const mappings = mappingsFor().concat(
      remember.filter(r => !r.isNew).map(r => ({ field: r.field, alias: r.alias })),
      remember.filter(r => r.isNew).map(r => ({ field: r.alias, alias: r.alias }))
    );
    let result;
    try {
      result = await readIncidentWorkbook(held.buffer, { mappings, require: false });
    } catch (err) {
      return res.status(422).json({ error: err.message });
    }

    // Required fields must actually resolve in THIS file — the parser reports
    // which required columns had no matching header after re-parse.
    const stillMissing = result.missingRequired || [];
    if (stillMissing.length) {
      return res.status(422).json({
        error: `Can't import yet — these required columns are still unmapped: ${stillMissing.join(", ")}. Map them in the review step and try again.`,
        missingRequired: stillMissing,
      });
    }

    // Attach accepted new fields as extra_fields on each row.
    const rows = result.rows;
    const extraHeaders = new Map(); // header -> field
    for (const [field, headers] of Object.entries(extraByField)) {
      for (const hd of headers) extraHeaders.set(hd, field);
    }
    if (extraHeaders.size) {
      for (const row of rows) {
        const extras = {};
        for (const [header, field] of extraHeaders) {
          const v = row[header];
          if (v !== undefined) extras[field] = v;
        }
        if (Object.keys(extras).length) row.extra_fields = extras;
      }
    }

    db.backup("pre-import");
    const summary = importIncidents({ rows, filename: held.filename, warnings: result.warnings });

    // Persist remembered mappings AFTER a successful commit.
    if (remember.length) {
      db.tx(() => {
        for (const r of remember) {
          db.run(
            "INSERT OR IGNORE INTO column_mappings (program, field, alias, required) VALUES (?, ?, ?, 0)",
            [PROGRAM, r.field, squash(r.alias)]
          );
        }
      });
    }

    res.status(201).json({
      ...summary,
      sheet: result.sheet,
      unmappedHeaders: result.unmappedHeaders,
      appliedDecisions: decisions.length,
      rememberedMappings: remember.length,
    });
  }));

  // ---- per-program column mapping CRUD ----
  app.get("/api/programs/:key/columns", h(async (req, res) => {
    await db.getDb();
    res.json({
      program: req.params.key,
      columns: db.all(
        "SELECT field, alias, required FROM column_mappings WHERE program = ? ORDER BY field, alias",
        [req.params.key]
      ),
    });
  }));

  app.post("/api/programs/:key/columns", h(async (req, res) => {
    await db.getDb();
    const { field, alias, required } = req.body || {};
    if (!field || !alias) return res.status(400).json({ error: "field and alias are required" });
    db.tx(() => {
      db.run(
        "INSERT OR REPLACE INTO column_mappings (program, field, alias, required) VALUES (?, ?, ?, ?)",
        [req.params.key, String(field).trim(), squash(String(alias).trim()), required ? 1 : 0]
      );
    });
    res.status(201).json({ ok: true });
  }));

  app.delete("/api/programs/:key/columns", h(async (req, res) => {
    await db.getDb();
    const { field, alias } = req.query;
    if (!alias) return res.status(400).json({ error: "alias query param is required" });
    const n = db.tx(() => db.run(
      "DELETE FROM column_mappings WHERE program = ? AND alias = ?" + (field ? " AND field = ?" : ""),
      field ? [req.params.key, squash(alias), field] : [req.params.key, squash(alias)]
    )).changes;
    res.json({ deleted: n });
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
    // tables: the (possibly user-edited) preview tables: { service, nameCols, header, rows, staff, columnStaff, heading }
    const entries = [];
    for (const t of tables || []) {
      if (!["OP", "PSR"].includes(t.service)) continue;
      for (const e of tableEntries(t)) entries.push({ name: e.name, service: t.service, extra: e.extra });
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
      const entries = guess.tables
        .filter((t) => t.service)
        .flatMap((t) => tableEntries(t).map((e) => ({ name: e.name, service: t.service, extra: e.extra })));
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
