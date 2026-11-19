/**
 * api/lib/importer.js — commit parsed source rows into SQLite.
 *
 * Re-import safety: every incident row gets a content hash + its occurrence
 * number within the file. Importing the same export twice (or an overlapping
 * export) inserts nothing new. Identical rows inside ONE file are kept but
 * flagged is_exact_duplicate, and dashboards exclude them by default — we
 * can't prove they are double-entries rather than two real events.
 */
const crypto = require("crypto");
const db = require("../../db");
const { createResolver } = require("../../db/people");
const { computeFlags } = require("../../db/classify");
const { FIELDS } = require("./incidents-xlsx");

const FIELD_NAMES = FIELDS.map(([f]) => f);

function hashRow(rec, occurrence) {
  const h = crypto.createHash("sha1");
  h.update(FIELD_NAMES.map((f) => rec[f] ?? "").join("\u001f"));
  h.update(`#${occurrence}`);
  return h.digest("hex");
}

function importIncidents({ rows, filename, isDemo = false, warnings = [] }) {
  return db.tx(() => {
    const { lastId: batchId } = db.run(
      "INSERT INTO import_batch (kind, filename, is_demo) VALUES ('incident_xlsx', ?, ?)",
      [filename || null, isDemo ? 1 : 0]
    );
    const resolver = createResolver({ source: "PHS event report", isDemo });
    const occurrences = new Map();
    let inserted = 0;
    let skipped = 0;
    let exactDuplicates = 0;
    const months = new Set();

    for (const rec of rows) {
      const contentKey = FIELD_NAMES.map((f) => rec[f] ?? "").join("\u001f");
      const n = (occurrences.get(contentKey) || 0) + 1;
      occurrences.set(contentKey, n);
      if (n > 1) exactDuplicates++;
      const rowHash = hashRow(rec, n);
      if (db.get("SELECT 1 FROM event_report WHERE row_hash = ?", [rowHash])) {
        skipped++;
        continue;
      }
      const personId = rec.member_full_name ? resolver.resolve(rec.member_full_name) : null;
      const flags = computeFlags(rec);
      const month = rec.event_date ? rec.event_date.slice(0, 7) : null;
      if (month) months.add(month);
      const extra = rec.extra_fields && Object.keys(rec.extra_fields).length
        ? JSON.stringify(rec.extra_fields) : null;
      const cols = [
        "batch_id", "row_hash", "is_exact_duplicate", "person_id", "event_month", "extra_fields",
        ...FIELD_NAMES, ...Object.keys(flags),
      ];
      const vals = [
        batchId, rowHash, n > 1 ? 1 : 0, personId, month, extra,
        ...FIELD_NAMES.map((f) => rec[f] ?? null), ...Object.values(flags),
      ];
      db.run(
        `INSERT INTO event_report (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
        vals
      );
      inserted++;
    }

    const summary = {
      batchId,
      rowsRead: rows.length,
      inserted,
      alreadyImported: skipped,
      exactDuplicatesInFile: exactDuplicates,
      months: [...months].sort(),
      people: resolver.stats,
      warnings,
    };
    db.run(
      "UPDATE import_batch SET rows_read = ?, rows_inserted = ?, rows_skipped = ?, summary_json = ? WHERE id = ?",
      [rows.length, inserted, skipped, JSON.stringify(summary), batchId]
    );
    return summary;
  });
}

/**
 * entries: [{ name, service: 'OP'|'PSR', extra: {col: value} }]
 */
function importRoster({ entries, month, filename, isDemo = false }) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) {
    throw Object.assign(new Error("A report month (YYYY-MM) is required."), { status: 400 });
  }
  return db.tx(() => {
    const { lastId: batchId } = db.run(
      "INSERT INTO import_batch (kind, filename, report_month, is_demo) VALUES ('bh_docx', ?, ?, ?)",
      [filename || null, month, isDemo ? 1 : 0]
    );
    const resolver = createResolver({ source: "BH roster (Word)", isDemo });
    let inserted = 0;
    let skipped = 0;
    const byService = { OP: 0, PSR: 0 };
    for (const e of entries) {
      const name = String(e.name || "").trim();
      if (!name || !["OP", "PSR"].includes(e.service)) continue;
      const personId = resolver.resolve(name);
      const r = db.run(
        `INSERT OR IGNORE INTO bh_enrollment (batch_id, person_id, raw_name, service, report_month, extra_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [batchId, personId, name, e.service, month, JSON.stringify(e.extra || {})]
      );
      if (r.changes) {
        inserted++;
        byService[e.service]++;
      } else skipped++;
    }
    const summary = {
      batchId,
      month,
      rowsRead: entries.length,
      inserted,
      alreadyImported: skipped,
      byService,
      people: resolver.stats,
    };
    db.run(
      "UPDATE import_batch SET rows_read = ?, rows_inserted = ?, rows_skipped = ?, summary_json = ? WHERE id = ?",
      [entries.length, inserted, skipped, JSON.stringify(summary), batchId]
    );
    return summary;
  });
}

/** Undo an import: remove its rows, then any people left with no records. */
function deleteBatch(batchId) {
  return db.tx(() => {
    const b = db.get("SELECT id FROM import_batch WHERE id = ?", [batchId]);
    if (!b) throw Object.assign(new Error("import not found"), { status: 404 });
    const ev = db.run("DELETE FROM event_report WHERE batch_id = ?", [batchId]).changes;
    const bh = db.run("DELETE FROM bh_enrollment WHERE batch_id = ?", [batchId]).changes;
    db.run("DELETE FROM import_batch WHERE id = ?", [batchId]);
    const orphans = cleanupOrphans();
    return { eventsRemoved: ev, rosterRowsRemoved: bh, peopleRemoved: orphans };
  });
}

function cleanupOrphans() {
  const orphanIds = db
    .all(
      `SELECT p.id FROM person p
       WHERE NOT EXISTS (SELECT 1 FROM event_report e WHERE e.person_id = p.id)
         AND NOT EXISTS (SELECT 1 FROM bh_enrollment b WHERE b.person_id = p.id)`
    )
    .map((r) => r.id);
  for (const id of orphanIds) {
    db.run("DELETE FROM person_alias WHERE person_id = ?", [id]);
    db.run("DELETE FROM match_review WHERE person_id = ? OR candidate_person_id = ?", [id, id]);
    db.run("DELETE FROM person_distinct WHERE a = ? OR b = ?", [id, id]);
    db.run("DELETE FROM person WHERE id = ?", [id]);
  }
  return orphanIds.length;
}

module.exports = { importIncidents, importRoster, deleteBatch };
