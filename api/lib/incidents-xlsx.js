/**
 * api/lib/incidents-xlsx.js — read a PHS "New Reportable Event Report" .xlsx.
 *
 * Column headings are matched loosely (case/punctuation-insensitive) against
 * both the original PHS headings and the recommended normalized names from the
 * schema profile, so a re-ordered or slightly renamed export still imports.
 * Blank / whitespace-only cells become null. Dates are parsed explicitly as
 * MM/DD/YYYY text (how PHS exports them), real Excel dates, or ISO strings.
 */
const ExcelJS = require("exceljs");

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
  v = cellText(v);
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  const s = String(v).trim();
  return s === "" ? null : s;
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
 * @returns {{ rows: object[], warnings: string[], sheet: string, unmappedHeaders: string[],
 *            unknownHeaders: {header:string, samples:any[]}[], missingRequired: string[] }}
 */
async function readIncidentWorkbook(buffer, opts = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const warnings = [];
  const { mappings, require: requireMissing = true } = opts;
  const HEADER_LOOKUP = buildLookup(mappings || FIELDS);
  const knownFields = new Set(HEADER_LOOKUP.values());

  for (const ws of wb.worksheets) {
    // Find the header row among the first 15 rows.
    let headerRow = null;
    let map = null;
    for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const m = {};
      let hits = 0;
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const field = HEADER_LOOKUP.get(squash(cellText(cell.value)));
        if (field && !Object.values(m).includes(field)) {
          m[col] = field;
          hits++;
        }
      });
      if (hits >= 3) {
        headerRow = r;
        map = m;
        break;
      }
    }
    if (!map) continue;

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

    // Unknown headers: not mapped to any field — collect with sample values
    // so the review UI can let the user map / accept / ignore them.
    const unknownHeaders = [];
    const unmappedHeaders = [];
    ws.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, col) => {
      if (!map[col]) {
        const header = String(cellText(cell.value) ?? "").trim();
        if (!header) return;
        unmappedHeaders.push(header);
        const samples = [];
        for (let r = headerRow + 1; r <= Math.min(ws.rowCount, headerRow + 5) && samples.length < 3; r++) {
          const v = clean(ws.getRow(r).getCell(col).value);
          if (v !== null) samples.push(v instanceof Date ? parseDate(v) : v);
        }
        unknownHeaders.push({ header, samples });
      }
    });
    for (const [field, names] of FIELDS) {
      if (!mapped.has(field) && knownFields.has(field)) warnings.push(`Column "${names[0]}" not found — left blank.`);
    }

    const rows = [];
    let badDates = 0;
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const rec = {};
      let any = false;
      for (const [col, field] of Object.entries(map)) {
        const v = clean(row.getCell(Number(col)).value);
        rec[field] = v;
        if (v !== null) any = true;
      }
      if (!any) continue;
      const rawDate = rec.event_date;
      rec.event_date = parseDate(rawDate);
      if (rawDate && !rec.event_date) badDates++;
      for (const field of new Set(HEADER_LOOKUP.values())) {
        if (!(field in rec)) rec[field] = null;
        if (rec[field] instanceof Date) rec[field] = parseDate(rec[field]);
      }
      rows.push(rec);
    }
    if (badDates) warnings.push(`${badDates} row(s) had a date that could not be read.`);
    return { rows, warnings, sheet: ws.name, unmappedHeaders, unknownHeaders, missingRequired };
  }

  throw Object.assign(
    new Error(
      "Couldn't find the event report columns (e.g. 'Date Of Event', \"Member's Full Name\") in any sheet."
    ),
    { status: 422 }
  );
}

module.exports = { readIncidentWorkbook, parseDate, FIELDS, REQUIRED, buildLookup, squash };
