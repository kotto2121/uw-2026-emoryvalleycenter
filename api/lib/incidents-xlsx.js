/**
 * api/lib/incidents-xlsx.js — read a PHS "New Reportable Event Report" .xlsx.
 *
 * Column headings are matched loosely (case/punctuation-insensitive) against
 * both the original PHS headings and the recommended normalized names from the
 * schema profile, so a re-ordered or slightly renamed export still imports.
 * Blank / whitespace-only cells and Kristen's "No Data Reported" placeholders
 * become null. Dates are parsed explicitly as MM/DD/YYYY text (how PHS exports
 * them), real Excel dates, Excel serial numbers, or ISO strings.
 *
 * Workbooks can hold many sheets (Kristen's working file has 19: the raw
 * export on "All", report tabs, charts, and a hand-edited "Data" copy). Every
 * sheet is scanned for the event-report header row; the sheet with the best
 * header match wins and the others are reported as warnings — never imported
 * too, which would double-count. Rows hidden by an Excel filter are still
 * imported (all rows count), with a warning that filters were applied.
 *
 * Column aliases can also come from the database (column_mappings, managed
 * through the Import Center's unknown-column review); see opts.mappings.
 */
const { readWorkbook } = require("./xlsx-read");
const { normalizeValue } = require("../../db/normalize");

const FIELDS = [
  ["event_date", ["Date Of Event", "event_date", "Event Date"]],
  ["member_full_name", ["Member's Full Name", "member_full_name", "Member Name", "Full Name"]],
  ["tier_1_events", ["Tier 1 Events", "tier_1_events"]],
  ["tier_2_events", ["Tier 2 Events", "tier_2_events"]],
  ["behavioral_psychiatric_events", ["Behavioral/Psychiatric Events", "behavioral_psychiatric_events"]],
  ["medical_events", ["Medical Events", "medical_events"]],
  ["other_event_types", ["Other Event Types", "other_event_types"]],
  ["reportability_status", ["Non Reportable", "reportability_status", "Reportable"]],
  ["incident_observation_and_source", ["This incident was / By", "This incident was/By", "incident_observation_and_source"]],
  ["event_location", ["Event Location", "event_location"]],
  ["event_interventions", ["Event Interventions", "event_interventions"]],
  ["site_home", ["Site/Home", "site_home", "Site", "Home"]],
  ["injury_description", ["Injury Description", "injury_description"]],
  ["injury_level", ["Level of Injury", "injury_level", "Injury Level"]],
];

const REQUIRED = ["event_date", "member_full_name"];

const squash = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Build a lookup map from squashed header -> canonical field, given mappings.
 * Mappings shape (both sources produce this):
 *   - DB:  [{ field, alias }]   (alias pre-squashed)
 *   - default: FIELDS           ([[field, [names...]], ...])
 */
function buildLookup(mappings) {
  const lookup = new Map();
  if (Array.isArray(mappings) && mappings.length && Array.isArray(mappings[0])) {
    for (const [field, names] of mappings) for (const n of names) lookup.set(squash(n), field);
  } else {
    for (const m of mappings || []) lookup.set(squash(m.alias), m.field);
  }
  return lookup;
}

function cellText(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return cellText(v.result);
    if ("text" in v) return cellText(v.text);
    if ("error" in v) return null;
  }
  return v;
}

function clean(v) {
  // Normalize via the shared layer (db/normalize.js) BEFORE hashing/import so
  // sentinel variants (NA / n/a / "No Data Reported" / '-' ...) collapse to
  // null and re-import dedupe hashes normalized values.
  return normalizeValue(cellText(v));
}

const pad = (n) => String(n).padStart(2, "0");

/** -> 'YYYY-MM-DD' or null. */
function parseDate(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  }
  if (typeof v === "number" || /^\d{5}(\.\d+)?$/.test(String(v))) {
    // Excel serial date (days since 1899-12-30).
    const d = new Date(Date.UTC(1899, 11, 30) + Number(v) * 86400000);
    return parseDate(d);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/); // MM/DD/YYYY
  if (m) {
    let [, mo, da, yr] = m;
    if (yr.length === 2) yr = Number(yr) > 50 ? `19${yr}` : `20${yr}`;
    return `${yr}-${pad(mo)}-${pad(da)}`;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  return null;
}

/**
 * Parse the workbook buffer.
 * @param {Buffer} buffer
 * @param {object} [opts]
 * @param {Array}  [opts.mappings]  DB mappings [{ field, alias }] — defaults to FIELDS
 * @param {boolean} [opts.require]  throw on missing required columns (default true for
 *                                  backward compat; the analyze/commit flow passes false)
 * @param {number}  [opts.headerRow] 1-based header row override — the review UI's
 *                                  orientation step ("this row is the header") re-parses
 *                                  through this path, skipping the scan.
 * @returns {{ rows: object[], warnings: string[], sheet: string, unmappedHeaders: string[],
 *            unknownHeaders: {header:string, samples:any[]}[], missingRequired: string[],
 *            confidence: 'full'|'partial'|'none', headerRow: number|null, preview: any[][] }}
 */
async function readIncidentWorkbook(buffer, opts = {}) {
  const { mappings, require: requireMissing = true, headerRow: headerRowOverride } = opts;
  const lookup = buildLookup(mappings && mappings.length ? mappings : FIELDS);
  const knownFields = new Set(lookup.values());
  const { sheets } = await readWorkbook(buffer);
  const warnings = [];

  // Pass 1: scan the first 15 rows of every sheet, tracking the best
  // candidate header row (most alias hits). >=3 hits is a confident match;
  // 1-2 hits is a tentative one we still hand to the review UI rather than
  // rejecting. Zero hits anywhere -> confidence 'none'.
  // opts.headerRow overrides the scan entirely: the review UI's orientation
  // step ("this row is the header") re-parses through this path.
  const scanRow = (ws, r) => {
    const map = {};
    let hits = 0;
    (ws.rows[r] || []).forEach((v, c) => {
      const field = lookup.get(squash(cellText(v)));
      if (field && !Object.values(map).includes(field)) {
        map[c] = field;
        hits++;
      }
    });
    return { map, hits };
  };
  const candidates = [];
  if (headerRowOverride) {
    const ws = sheets[0];
    const r = headerRowOverride - 1;
    const { map, hits } = scanRow(ws, r);
    candidates.push({ ws, headerRow: r, map, hits });
  } else {
    for (const ws of sheets) {
      for (let r = 0; r < Math.min(15, ws.rows.length); r++) {
        const { map, hits } = scanRow(ws, r);
        if (hits > 0) {
          const dataRows = ws.rows.slice(r + 1).filter((row) => row.some((v) => clean(v) !== null)).length;
          candidates.push({ ws, headerRow: r, map, hits, dataRows });
        }
        if (hits >= 3) break; // confident match — stop scanning this sheet
      }
    }
  }
  // Best candidate: most alias hits; ties broken by most data rows.
  candidates.sort((x, y) => y.hits - x.hits || (y.dataRows || 0) - (x.dataRows || 0));
  const best = candidates[0] || null;

  // Raw first-15-rows dump for the review UI (orientation / mapping state).
  const previewRows = (ws) => {
    const preview = [];
    for (let r = 0; r < Math.min(15, ws.rows.length); r++) {
      const cells = (ws.rows[r] || []).map((v) => {
        const t = cellText(v);
        return t instanceof Date ? parseDate(t) : t == null ? "" : String(t);
      });
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      preview.push(cells);
    }
    return preview;
  };

  // Nothing recognized in any sheet: confidence 'none'. Return a preview so
  // the UI can ask the user which row is the header — this is the entry
  // point to schema discovery, not an error.
  if (!best) {
    const ws = sheets[0];
    return {
      rows: [], warnings, sheet: ws.name, unmappedHeaders: [], unknownHeaders: [],
      missingRequired: [...REQUIRED],
      confidence: "none", headerRow: null, preview: previewRows(ws),
    };
  }

  // Runner-up sheets that also look like event data: warn, don't import.
  for (const other of candidates.slice(1)) {
    if ((other.hits || 0) >= 3) {
      warnings.push(`Sheet "${other.ws.name}" also looks like event data (${other.dataRows} rows) but was NOT imported — only "${best.ws.name}" was, to avoid double-counting.`);
    }
  }

  const { ws, headerRow, map } = best;
  const tentative = best.hits < 3;

  // Required-column check is deferred when requireMissing is false: the
  // caller (commit step) validates after the user has mapped unknowns.
  const mapped = new Set(Object.values(map));
  const missingRequired = REQUIRED.filter((f) => !mapped.has(f));
  if (missingRequired.length && requireMissing) {
    throw Object.assign(
      new Error(`Sheet "${ws.name}" is missing required column(s): ${missingRequired.join(", ")}`),
      { status: 422 }
    );
  }

  // Unknown headers: not mapped to any field — collected with sample values so
  // the review UI can let the user map / accept / ignore them.
  const unknownHeaders = [];
  const unmappedHeaders = [];
  (ws.rows[headerRow] || []).forEach((v, c) => {
    if (map[c]) return;
    const header = String(cellText(v) ?? "").trim();
    if (!header) return;
    unmappedHeaders.push(header);
    const samples = [];
    for (let r = headerRow + 1; r < Math.min(ws.rows.length, headerRow + 6) && samples.length < 3; r++) {
      const val = clean((ws.rows[r] || [])[c]);
      if (val !== null) samples.push(val instanceof Date ? parseDate(val) : val);
    }
    unknownHeaders.push({ header, samples });
  });
  for (const [field, names] of FIELDS) {
    if (!mapped.has(field) && knownFields.has(field)) warnings.push(`Column "${names[0]}" not found — left blank.`);
  }
  if (tentative) warnings.push("This sheet was only partially recognized — confirm the column mapping in the review step.");

  const rows = [];
  let badDates = 0;
  let hidden = 0;
  const allFields = new Set([...FIELDS.map(([f]) => f), ...knownFields]);
  for (let r = headerRow + 1; r < ws.rows.length; r++) {
    const src = ws.rows[r] || [];
    const rec = {};
    let any = false;
    for (const [col, field] of Object.entries(map)) {
      let v = clean(src[Number(col)]);
      if (typeof v === "number" && field !== "event_date") v = String(v);
      rec[field] = v;
      if (v !== null) any = true;
    }
    if (!any) continue;
    if (ws.hiddenRows.has(r)) hidden++;
    const rawDate = rec.event_date;
    rec.event_date = parseDate(rawDate);
    if (rawDate && !rec.event_date) badDates++;
    for (const field of allFields) {
      if (!(field in rec)) rec[field] = null;
      if (rec[field] instanceof Date) rec[field] = parseDate(rec[field]);
    }
    rows.push(rec);
  }
  if (badDates) warnings.push(`${badDates} row(s) had a date that could not be read; they are kept but won't appear in monthly counts.`);
  if (hidden) warnings.push(`${hidden} row(s) were hidden by an Excel filter. All rows are imported regardless of filters.`);
  return {
    rows, warnings, sheet: ws.name, unmappedHeaders, unknownHeaders, missingRequired,
    confidence: tentative ? "partial" : "full",
    headerRow: headerRow + 1,
    preview: previewRows(ws),
  };
}

module.exports = { readIncidentWorkbook, parseDate, FIELDS, REQUIRED, buildLookup, squash };
