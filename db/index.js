/**
 * db/index.js — SQLite database layer (sql.js, pure WASM — no native deps).
 *
 * sql.js runs SQLite compiled to WebAssembly, so this works identically on
 * macOS, Windows, and Linux with zero build tooling. The database is a real
 * SQLite file on disk: we load it into memory, operate, and persist it back
 * after writes (atomically: write a temp file, then rename over the original).
 *
 * Location of the db file:
 *   - EVC_DB_PATH env var, if set (tests / scripts).
 *   - Packaged app: Electron's userData dir (ELECTRON_USER_DATA, set by
 *     electron/main.js) — on Windows: %APPDATA%\Greenhouse by Emory Valley Center\
 *   - Standalone dev: ./db/emoryvalley.db (git-ignored).
 *
 * Schema overview (see SCHEMA below):
 *   import_batch     one row per imported file (incident xlsx, BH docx, demo)
 *   person           the app-owned person registry (stable internal id)
 *   person_alias     every raw name string ever seen -> person
 *   person_distinct  pairs a human said are NOT the same person
 *   match_review     "are these the same person?" questions for the Review Queue
 *   event_report     PHS "Reportable Event Report" rows (one column per source field)
 *   bh_enrollment    behavioral-health roster rows (OP / PSR) by report month
 */
const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

function dbFilePath() {
  if (process.env.EVC_DB_PATH) return process.env.EVC_DB_PATH;
  if (process.env.ELECTRON_USER_DATA)
    return path.join(process.env.ELECTRON_USER_DATA, "emoryvalley.db");
  return path.join(__dirname, "emoryvalley.db");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS import_batch (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL,             -- 'incident_xlsx' | 'bh_docx'
  filename      TEXT,
  report_month  TEXT,                      -- YYYY-MM (bh_docx)
  imported_at   TEXT NOT NULL DEFAULT (datetime('now')),
  rows_read     INTEGER NOT NULL DEFAULT 0,
  rows_inserted INTEGER NOT NULL DEFAULT 0,
  rows_skipped  INTEGER NOT NULL DEFAULT 0, -- already imported earlier
  is_demo       INTEGER NOT NULL DEFAULT 0,
  summary_json  TEXT
);

CREATE TABLE IF NOT EXISTS person (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name  TEXT NOT NULL,
  first_name    TEXT,
  last_name     TEXT,
  is_demo       INTEGER NOT NULL DEFAULT 0,
  is_behavioral INTEGER,                   -- NULL = never set; a BH roster import sets 1, a person's page can set 0/1
  is_test       INTEGER NOT NULL DEFAULT 0, -- 1 = test patient, left out of every count
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS person_alias (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id     INTEGER NOT NULL REFERENCES person(id),
  raw_name      TEXT NOT NULL,
  raw_key       TEXT NOT NULL UNIQUE,      -- lower-cased, whitespace-collapsed raw string
  norm_key      TEXT NOT NULL,             -- 'last|first' after normalization
  source        TEXT,
  how           TEXT NOT NULL,             -- 'new' | 'exact' | 'normalized' | 'merged'
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_alias_norm ON person_alias(norm_key);
CREATE INDEX IF NOT EXISTS ix_alias_person ON person_alias(person_id);

CREATE TABLE IF NOT EXISTS person_distinct (
  a INTEGER NOT NULL, b INTEGER NOT NULL,  -- a < b
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (a, b)
);

CREATE TABLE IF NOT EXISTS match_review (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id           INTEGER NOT NULL,   -- the newer record
  candidate_person_id INTEGER NOT NULL,   -- the existing record it may duplicate
  score               REAL NOT NULL,
  reason              TEXT,
  status              TEXT NOT NULL DEFAULT 'pending', -- pending | merged | distinct
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at         TEXT
);
CREATE INDEX IF NOT EXISTS ix_review_status ON match_review(status);

CREATE TABLE IF NOT EXISTS event_report (
  id                              INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id                        INTEGER NOT NULL REFERENCES import_batch(id),
  row_hash                        TEXT NOT NULL UNIQUE,  -- content hash + occurrence #
  is_exact_duplicate              INTEGER NOT NULL DEFAULT 0, -- 2nd+ identical row in its file
  person_id                       INTEGER REFERENCES person(id),
  event_date                      TEXT,   -- YYYY-MM-DD
  event_month                     TEXT,   -- YYYY-MM
  member_full_name                TEXT,
  tier_1_events                   TEXT,
  tier_2_events                   TEXT,
  behavioral_psychiatric_events   TEXT,
  medical_events                  TEXT,
  other_event_types               TEXT,
  reportability_status            TEXT,
  incident_observation_and_source TEXT,
  event_location                  TEXT,
  event_interventions             TEXT,
  site_home                       TEXT,
  injury_description              TEXT,
  injury_level                    TEXT,
  extra_fields                    TEXT,   -- JSON: accepted-but-unmapped columns ('{}' if none)
  -- derived flags (see db/classify.js); recomputed on import
  is_reportable       INTEGER,
  f_911               INTEGER NOT NULL DEFAULT 0,
  f_emt               INTEGER NOT NULL DEFAULT 0,
  f_er                INTEGER NOT NULL DEFAULT 0,
  f_hospitalization   INTEGER NOT NULL DEFAULT 0,
  f_police            INTEGER NOT NULL DEFAULT 0,
  f_crisis            INTEGER NOT NULL DEFAULT 0,
  f_property_damage   INTEGER NOT NULL DEFAULT 0,
  f_self_injury       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_event_month ON event_report(event_month);
CREATE INDEX IF NOT EXISTS ix_event_person ON event_report(person_id);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS column_mappings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  program       TEXT NOT NULL,             -- program key, e.g. 'phs_incidents'
  field         TEXT NOT NULL,             -- canonical field name, e.g. 'event_date'
  alias         TEXT NOT NULL,             -- accepted spreadsheet header (squashed for lookup)
  required      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (program, alias)
);

CREATE TABLE IF NOT EXISTS bh_enrollment (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id      INTEGER NOT NULL REFERENCES import_batch(id),
  person_id     INTEGER REFERENCES person(id),
  raw_name      TEXT NOT NULL,
  service       TEXT NOT NULL,            -- 'OP' | 'PSR'
  report_month  TEXT NOT NULL,            -- YYYY-MM
  extra_json    TEXT,                     -- the other columns of the source row
  UNIQUE (raw_name, service, report_month)
);
CREATE INDEX IF NOT EXISTS ix_bh_month ON bh_enrollment(report_month);
`;

let db = null;
let SQL = null;

async function getDb() {
  if (db) return db;
  SQL = await initSqlJs({
    locateFile: (file) => {
      // Bundled/packaged app: the .wasm sits next to dist/main.js.
      const beside = path.join(__dirname, file);
      if (fs.existsSync(beside)) return beside;
      return require.resolve(`sql.js/dist/${file}`); // running from source
    },
  });
  const file = dbFilePath();
  db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
  db.run("PRAGMA foreign_keys = ON;");
  db.run(SCHEMA);
  migrate();
  // Idempotent migration: add extra_fields to event_report for DBs created
  // before the column existed. CREATE TABLE IF NOT EXISTS covers fresh DBs.
  const hasExtra = all(
    "SELECT 1 FROM pragma_table_info('event_report') WHERE name = 'extra_fields'"
  );
  if (!hasExtra.length) db.run("ALTER TABLE event_report ADD COLUMN extra_fields TEXT;");
  // Same for the person report flags (Behavioral / Test patient).
  const personCols = new Set(all("SELECT name FROM pragma_table_info('person')").map((r) => r.name));
  if (!personCols.has("is_behavioral")) db.run("ALTER TABLE person ADD COLUMN is_behavioral INTEGER;");
  if (!personCols.has("is_test")) db.run("ALTER TABLE person ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;");
  seedColumnMappings();
  reclassifyIfNeeded();
  return db;
}

/** Add any flag column that db/classify.js defines but the stored table lacks. */
function migrate() {
  const { FLAG_PATTERNS } = require("./classify");
  const have = new Set(all("PRAGMA table_info(event_report)").map((c) => c.name));
  for (const flag of Object.keys(FLAG_PATTERNS)) {
    if (!have.has(flag)) db.run(`ALTER TABLE event_report ADD COLUMN ${flag} INTEGER NOT NULL DEFAULT 0`);
  }
}

/**
 * Seed column_mappings from the parser's default FIELDS so behavior is
 * identical out of the box. Idempotent: INSERT OR IGNORE on (program, alias),
 * so user-added mappings are never touched and re-running never duplicates.
 */
function seedColumnMappings() {
  const { FIELDS, REQUIRED } = require("../api/lib/incidents-xlsx");
  db.run("BEGIN");
  try {
    for (const [field, names] of FIELDS) {
      for (const n of names) {
        db.run(
          "INSERT OR IGNORE INTO column_mappings (program, field, alias, required) VALUES (?, ?, ?, ?)",
          ["phs_incidents", field, squash(n), REQUIRED.includes(field) ? 1 : 0]
        );
      }
    }
    db.run("COMMIT");
    persist();
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  }
}

/**
 * Re-derive event flags when db/classify.js changes (CLASSIFIER_VERSION), so
 * data imported under older rules is updated without re-importing files.
 */
function reclassifyIfNeeded() {
  const { CLASSIFIER_VERSION, computeFlags } = require("./classify");
  const row = get("SELECT value FROM app_meta WHERE key = 'classifier_version'");
  if (row && Number(row.value) === CLASSIFIER_VERSION) return;
  const rows = all("SELECT * FROM event_report");
  db.run("BEGIN");
  try {
    for (const r of rows) {
      const f = computeFlags(r);
      const keys = Object.keys(f);
      db.run(`UPDATE event_report SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, [...keys.map((k) => f[k]), r.id]);
    }
    db.run("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('classifier_version', ?)", [String(CLASSIFIER_VERSION)]);
    db.run("COMMIT");
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  }
  if (rows.length) persist();
}

const squash = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Write the in-memory database back to disk atomically: write a temp file,
 * then rename it over the real one, so a crash mid-write can't corrupt it.
 */
function persist() {
  if (!db) return;
  const file = dbFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(db.export()));
  fs.renameSync(tmp, file);
}

/** Copy the current db file to backups/emoryvalley-<stamp>.db (keeps the last 10). */
function backup(label = "auto") {
  const file = dbFilePath();
  if (!fs.existsSync(file)) return null;
  const dir = path.join(path.dirname(file), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(dir, `emoryvalley-${stamp}-${label}.db`);
  fs.copyFileSync(file, dest);
  const old = fs.readdirSync(dir).filter((f) => f.endsWith(".db")).sort();
  while (old.length > 10) fs.unlinkSync(path.join(dir, old.shift()));
  return dest;
}

// ---- tiny query helpers (sql.js has a low-level API) -----------------------

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    return out;
  } finally {
    stmt.free();
  }
}

function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  return {
    changes: db.getRowsModified(),
    lastId: db.exec("SELECT last_insert_rowid()")[0].values[0][0],
  };
}

/** Run fn inside a transaction; persist to disk on success. */
function tx(fn) {
  db.run("BEGIN");
  try {
    const result = fn();
    db.run("COMMIT");
    persist();
    return result;
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  }
}

/** Remove every row from every table (used by Settings → Clear all data). */
function clearAll() {
  tx(() => {
    for (const t of [
      "match_review",
      "person_distinct",
      "event_report",
      "bh_enrollment",
      "person_alias",
      "person",
      "import_batch",
    ]) {
      db.run(`DELETE FROM ${t}`);
    }
    db.run("DELETE FROM sqlite_sequence");
  });
}

module.exports = { getDb, persist, backup, dbFilePath, all, get, run, tx, clearAll };
