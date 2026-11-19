/**
 * db/index.js — SQLite database layer (sql.js, pure WASM — no native deps).
 *
 * sql.js runs SQLite compiled to WebAssembly, so this works identically on
 * macOS, Windows, and Linux with zero build tooling. The database is a real
 * SQLite file on disk; we load it into memory, operate, and persist it back
 * after writes.
 *
 * Location of the db file:
 *   - Packaged app: %APPDATA%/EmoryValley/emoryvalley.db (Windows) or
 *     ~/Library/Application Support/EmoryValley/... (macOS) via Electron's
 *     userData path when ELECTRON_USER_DATA is set by the main process.
 *   - Standalone dev: ./db/emoryvalley.db
 */
const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

function dbFilePath() {
  if (process.env.EMORYVALLEY_DB_PATH) return process.env.EMORYVALLEY_DB_PATH;
  if (process.env.ELECTRON_USER_DATA)
    return path.join(process.env.ELECTRON_USER_DATA, "emoryvalley.db");
  return path.join(__dirname, "emoryvalley.db");
}

let db = null;
let SQL = null;

async function getDb() {
  if (db) return db;

  SQL = await initSqlJs({
    locateFile: (file) =>
      path.join(__dirname, "..", "node_modules", "sql.js", "dist", file),
  });

  const file = dbFilePath();
  if (fs.existsSync(file)) {
    db = new SQL.Database(fs.readFileSync(file));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS greetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed the hello-world row on first run.
  const count = db.exec("SELECT COUNT(*) AS n FROM greetings")[0].values[0][0];
  if (count === 0) {
    db.run("INSERT INTO greetings (message) VALUES (?)", ["Hello World"]);
    persist();
  }

  return db;
}

/** Write the in-memory database back to its SQLite file on disk. */
function persist() {
  const file = dbFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(db.export()));
}

/** GET /api/hello — latest greeting from SQLite. */
async function latestGreeting() {
  const d = await getDb();
  const rows = d.exec("SELECT message, created_at FROM greetings ORDER BY id DESC LIMIT 1");
  if (!rows.length) return null;
  const [message, created_at] = rows[0].values[0];
  return { message, createdAt: created_at };
}

/** POST /api/greetings — insert a greeting and persist. */
async function addGreeting(message) {
  const d = await getDb();
  d.run("INSERT INTO greetings (message) VALUES (?)", [message]);
  persist();
  const rows = d.exec("SELECT last_insert_rowid()");
  const id = rows[0].values[0][0];
  return { id, message };
}

module.exports = { getDb, persist, latestGreeting, addGreeting, dbFilePath };
