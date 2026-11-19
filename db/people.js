/**
 * db/people.js — the person registry and human-in-the-loop identity resolution.
 *
 * Strategy (no client ID exists in the source files):
 *   1. Exact alias: this exact raw string was seen before  -> same person.
 *   2. Normalized: same 'last|first' after normalization    -> same person
 *      ("SMITH, JOHN A." == "John Smith").
 *   3. Otherwise a NEW person is created immediately (so dashboards stay
 *      complete), and if an existing person looks similar (score >= REVIEW_THRESHOLD)
 *      a match_review row asks a human "are these the same person?".
 *      Merge   -> records are combined, the alias is remembered forever.
 *      Distinct -> the pair is remembered and never asked again.
 *
 * Every confirmed decision becomes an alias, so month 1 needs some review and
 * later months are almost entirely automatic.
 *
 * All functions here expect to run inside db.tx(...).
 */
const db = require("./index");
const { parseName, rawKey, scoreNames } = require("./names");

const REVIEW_THRESHOLD = 0.82;

/** Per-import cache of every known alias, parsed once. */
function createResolver({ source, isDemo = false } = {}) {
  const known = db
    .all("SELECT person_id, raw_name FROM person_alias WHERE norm_key NOT LIKE 'id|%'")
    .map((r) => ({ personId: r.person_id, parsed: parseName(r.raw_name) }));
  const distinct = new Set(
    db.all("SELECT a, b FROM person_distinct").map((r) => `${r.a}:${r.b}`)
  );
  const stats = { exact: 0, normalized: 0, created: 0, reviews: 0 };
  const seen = new Map(); // raw_key -> person_id within this import

  function addAlias(personId, raw, parsed, how) {
    db.run(
      `INSERT OR IGNORE INTO person_alias (person_id, raw_name, raw_key, norm_key, source, how)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [personId, String(raw).trim(), rawKey(raw), parsed.key, source, how]
    );
    known.push({ personId, parsed });
  }

  function resolve(raw) {
    const rk = rawKey(raw);
    if (!rk) return null;
    if (seen.has(rk)) return seen.get(rk);

    const exact = db.get("SELECT person_id FROM person_alias WHERE raw_key = ?", [rk]);
    if (exact) {
      stats.exact++;
      seen.set(rk, exact.person_id);
      return exact.person_id;
    }

    // ID-like "names" ("Person 123", "Member 001", a client number): these are
    // identifiers, not spellings — match them exactly, never fuzzily, or every
    // token would look like a near-duplicate of every other one.
    if (/\d/.test(raw)) {
      const display = String(raw).trim().replace(/\s+/g, " ");
      const { lastId: personId } = db.run(
        "INSERT INTO person (display_name, first_name, last_name, is_demo) VALUES (?, NULL, NULL, ?)",
        [display, isDemo ? 1 : 0]
      );
      db.run(
        `INSERT OR IGNORE INTO person_alias (person_id, raw_name, raw_key, norm_key, source, how)
         VALUES (?, ?, ?, ?, ?, 'new')`,
        [personId, display, rk, `id|${rk}`, source]
      );
      stats.created++;
      seen.set(rk, personId);
      return personId;
    }

    const parsed = parseName(raw);
    if (parsed.last && parsed.first) {
      const norm = db.get(
        "SELECT person_id FROM person_alias WHERE norm_key = ? ORDER BY id LIMIT 1",
        [parsed.key]
      );
      if (norm) {
        addAlias(norm.person_id, raw, parsed, "normalized");
        stats.normalized++;
        seen.set(rk, norm.person_id);
        return norm.person_id;
      }
    }

    // New person.
    const { lastId: personId } = db.run(
      "INSERT INTO person (display_name, first_name, last_name, is_demo) VALUES (?, ?, ?, ?)",
      [parsed.display, parsed.first || null, parsed.last || null, isDemo ? 1 : 0]
    );
    stats.created++;

    // Best fuzzy candidate among existing people (one question per new person).
    let best = null;
    for (const k of known) {
      if (k.personId === personId) continue;
      const pair = personId < k.personId ? `${personId}:${k.personId}` : `${k.personId}:${personId}`;
      if (distinct.has(pair)) continue;
      const s = scoreNames(parsed, k.parsed);
      if (s.score >= REVIEW_THRESHOLD && (!best || s.score > best.score)) {
        best = { ...s, candidate: k.personId };
      }
    }
    addAlias(personId, raw, parsed, "new");
    if (best) {
      db.run(
        `INSERT INTO match_review (person_id, candidate_person_id, score, reason)
         VALUES (?, ?, ?, ?)`,
        [personId, best.candidate, best.score, best.reason]
      );
      stats.reviews++;
    }
    seen.set(rk, personId);
    return personId;
  }

  return { resolve, stats };
}

/** Merge person `dropId` into `keepId`. Everything that pointed at drop moves. */
function mergePeople(keepId, dropId) {
  if (keepId === dropId) return;
  db.run("UPDATE person_alias SET how = 'merged' WHERE person_id = ?", [dropId]);
  for (const t of ["event_report", "bh_enrollment", "person_alias"]) {
    db.run(`UPDATE ${t} SET person_id = ? WHERE person_id = ?`, [keepId, dropId]);
  }
  // Re-point open questions that mention the dropped person.
  db.run("UPDATE match_review SET person_id = ? WHERE person_id = ? AND status = 'pending'", [keepId, dropId]);
  db.run("UPDATE match_review SET candidate_person_id = ? WHERE candidate_person_id = ? AND status = 'pending'", [keepId, dropId]);
  db.run(
    "UPDATE match_review SET status = 'merged', resolved_at = datetime('now') WHERE status = 'pending' AND person_id = candidate_person_id"
  );
  // Carry "distinct" decisions over to the surviving id.
  const pairs = db.all("SELECT a, b FROM person_distinct WHERE a = ? OR b = ?", [dropId, dropId]);
  db.run("DELETE FROM person_distinct WHERE a = ? OR b = ?", [dropId, dropId]);
  for (const { a, b } of pairs) {
    const other = a === dropId ? b : a;
    if (other !== keepId) markDistinct(keepId, other);
  }
  db.run("DELETE FROM person WHERE id = ?", [dropId]);
}

function markDistinct(a, b) {
  const [x, y] = a < b ? [a, b] : [b, a];
  db.run("INSERT OR IGNORE INTO person_distinct (a, b) VALUES (?, ?)", [x, y]);
}

/** Resolve a review: action = 'merge' | 'distinct'. keepId optional for merge. */
function resolveReview(reviewId, action, keepId) {
  const r = db.get("SELECT * FROM match_review WHERE id = ?", [reviewId]);
  if (!r) throw Object.assign(new Error("review not found"), { status: 404 });
  if (r.status !== "pending") throw Object.assign(new Error("review already resolved"), { status: 409 });
  if (action === "merge") {
    // Default: keep whichever record has more history, so a one-off typo
    // doesn't become the display name.
    const weight = (id) =>
      db.get(
        `SELECT (SELECT COUNT(*) FROM event_report WHERE person_id = ?) +
                (SELECT COUNT(*) FROM bh_enrollment WHERE person_id = ?) AS n`, [id, id]).n;
    const keep = keepId && [r.person_id, r.candidate_person_id].includes(keepId)
      ? keepId
      : weight(r.person_id) > weight(r.candidate_person_id) ? r.person_id : r.candidate_person_id;
    const drop = keep === r.person_id ? r.candidate_person_id : r.person_id;
    db.run("UPDATE match_review SET status = 'merged', resolved_at = datetime('now') WHERE id = ?", [reviewId]);
    mergePeople(keep, drop);
    return { merged: true, keepId: keep };
  }
  if (action === "distinct") {
    markDistinct(r.person_id, r.candidate_person_id);
    db.run("UPDATE match_review SET status = 'distinct', resolved_at = datetime('now') WHERE id = ?", [reviewId]);
    return { merged: false };
  }
  throw Object.assign(new Error("action must be 'merge' or 'distinct'"), { status: 400 });
}

module.exports = { createResolver, mergePeople, markDistinct, resolveReview, REVIEW_THRESHOLD };
