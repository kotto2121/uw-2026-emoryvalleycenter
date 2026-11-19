/**
 * db/normalize.js — THE single home for value normalization rules.
 *
 * Every ingest path (incident xlsx, BH roster docx, demo data) must funnel
 * text cell values through normalizeValue() so that cosmetic variants of the
 * same semantic value collapse to one canonical form BEFORE storage. This is
 * what stops dashboards from showing implicit-duplicate buckets like
 * NA / n/a / N/A side by side.
 *
 * What it does:
 *   1. cell cleanup: NFKC unicode normalization, NBSP -> space, trim,
 *      internal whitespace collapse
 *   2. sentinel mapping: known "not applicable / not recorded" spellings
 *      ('n/a', 'na', 'none', '-', '?', '' ...) -> null
 *
 * What it deliberately does NOT do:
 *   - No fuzzy matching, no auto-merging of free-text narratives.
 *   - No case-folding of stored values (only for sentinel detection).
 *
 * Position relative to hashing: normalization runs at cell-clean time, so
 * the row hash is computed on normalized values. Re-importing the same file
 * therefore still dedupes (identical normalization => identical hash), and
 * sentinel variance no longer defeats dedupe either. Raw values are NOT
 * preserved separately — if audit needs the original string, capture it in
 * the import batch summary before this point.
 */

// Sentinel spellings matched against the *comparison key* (see below).
// Squashed (lowercase, non-alphanumerics stripped) so 'N.A.', 'N / A',
// 'n.a' all match 'na' — extend this ONE list, all pipelines benefit.
const SENTINELS = new Set([
  "",          // empty after cleanup
  "na",
  "n.a",
  "nan",       // xlsx float artifact (NaN)
  "none",
  "null",
  "nil",
  "n",
  "unk",       // abbreviation only. NOT "unknown": PHS Event Location has a real
               // "Unknown" option, counted as populated (see schema profile).
  "nodatareported", // "No Data Reported" / "*No Data Reported" placeholders in hand-edited copies
  "notapplicable",
  "notrecorded",
  "notavailable",
  "tbd",
  "?",
  "-",         // dash placeholders (any dash count: -, --, ---)
  "--",
  "---",
  "xxxx",
  "xx",
]);

/**
 * Comparison key: NFKC-normalize, strip diacritics, lowercase, drop every
 * non-alphanumeric char and collapse whitespace. Handles N/A vs n.a. vs
 * "N / A", fullwidth characters, non-breaking spaces, etc.
 */
function compareKey(v) {
  if (v === null || v === undefined) return "";
  let s = String(v).normalize("NFKC");
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); // strip diacritics
  s = s.replace(/[\u00a0\u2000-\u200b\u202f\u3000]/g, " "); // exotic spaces -> space
  return s.replace(/[^a-z0-9]+/gi, "").toLowerCase();
}

/**
 * Normalize a text cell value for storage.
 *   null/undefined           -> null
 *   Date/number              -> passed through untouched (use for date/numeric fields)
 *   sentinel text            -> null
 *   other text               -> trimmed, NFKC, whitespace-collapsed
 *
 * opts.keepSentinels: pass true for fields where a sentinel spelling could be
 * a legitimate value (e.g. name-ish columns) — skips sentinel mapping.
 */
function normalizeValue(v, opts = {}) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") return v;

  let s = String(v).normalize("NFKC");
  s = s.replace(/[\u00a0\u2000-\u200b\u202f\u3000]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (s === "") return null;

  if (!opts.keepSentinels && SENTINELS.has(compareKey(s))) return null;
  return s;
}

/**
 * Normalize an object of field -> raw value. Per-field opt-out/force via opts:
 *   { fields: { [field]: { keepSentinels?: true } } }
 * Unknown fields get default treatment. Non-string scalars (numbers, Dates)
 * pass through normalizeValue unchanged.
 */
function normalizeRecord(rec, opts = {}) {
  const out = {};
  for (const [field, value] of Object.entries(rec)) {
    const fo = opts.fields?.[field] || {};
    out[field] = normalizeValue(value, fo);
  }
  return out;
}

/** True if the value (after cleanup) is a sentinel. */
function isSentinel(v) {
  if (v === null || v === undefined) return true;
  if (v instanceof Date || typeof v === "number") return false;
  return SENTINELS.has(compareKey(String(v)));
}

module.exports = { normalizeValue, normalizeRecord, isSentinel, compareKey, SENTINELS };
