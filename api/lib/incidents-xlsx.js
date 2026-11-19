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
 * sheet is scanned for the event-report header row; the sheet with the most
 * data rows wins and the others are reported as warnings — never imported
 * too, which would double-count.
 */
const { readWorkbook } = require("./xlsx-read");

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
const HEADER_LOOKUP = new Map();
for (const [field, names] of FIELDS) for (const n of names) HEADER_LOOKUP.set(squash(n), field);

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

// Placeholders used in hand-edited copies of the export; they mean "blank".
const PLACEHOLDER_RE = /^\*?\s*no data reported$/i;

function clean(v) {
  v = cellText(v);
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  const s = String(v).replace(/\u00a0/g, " ").trim();
  return s === "" || PLACEHOLDER_RE.test(s) ? null : s;
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
 * @returns {{ rows: object[], warnings: string[], sheet: string, unmappedHeaders: string[] }}
 */
/** Find the header row (first 15 rows) of one sheet; null if it isn't an event report. */
function findHeader(rows) {
  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const map = {};
    let hits = 0;
    (rows[r] || []).forEach((v, c) => {
      const field = HEADER_LOOKUP.get(squash(cellText(v)));
      if (field && !Object.values(map).includes(field)) {
        map[c] = field;
        hits++;
      }
    });
    if (hits >= 3 && REQUIRED.every((f) => Object.values(map).includes(f))) return { headerRow: r, map, hits };
  }
  return null;
}

/**
 * Parse the workbook buffer.
 * @returns {{ rows: object[], warnings: string[], sheet: string, unmappedHeaders: string[] }}
 */
async function readIncidentWorkbook(buffer) {
  const { sheets } = await readWorkbook(buffer);
  const warnings = [];

  const candidates = [];
  for (const ws of sheets) {
    const h = findHeader(ws.rows);
    if (!h) continue;
    const dataRows = ws.rows.slice(h.headerRow + 1).filter((r) => r.some((v) => clean(v) !== null)).length;
    candidates.push({ ws, ...h, dataRows });
  }
  if (!candidates.length) {
    throw Object.assign(
      new Error("Couldn't find the event report columns (e.g. 'Date Of Event', \"Member's Full Name\") in any sheet."),
      { status: 422 }
    );
  }
  // Most data rows wins; ties go to the sheet with more recognised columns.
  candidates.sort((a, b) => b.dataRows - a.dataRows || b.hits - a.hits);
  const { ws, headerRow, map } = candidates[0];
  for (const other of candidates.slice(1)) {
    warnings.push(`Sheet "${other.ws.name}" also looks like event data (${other.dataRows} rows) but was NOT imported — only "${ws.name}" was, to avoid double-counting.`);
  }

  const mapped = new Set(Object.values(map));
  const unmappedHeaders = (ws.rows[headerRow] || []).map((v, c) => (map[c] || v === null || v === undefined || v === "" ? null : String(v))).filter(Boolean);
  for (const [field, names] of FIELDS) {
    if (!mapped.has(field)) warnings.push(`Column "${names[0]}" not found — left blank.`);
  }

  const rows = [];
  let badDates = 0;
  let hidden = 0;
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
    for (const [field] of FIELDS) {
      if (!(field in rec)) rec[field] = null;
      if (rec[field] instanceof Date) rec[field] = parseDate(rec[field]);
    }
    rows.push(rec);
  }
  if (badDates) warnings.push(`${badDates} row(s) had a date that could not be read; they are kept but won't appear in monthly counts.`);
  if (hidden) warnings.push(`${hidden} row(s) were hidden by an Excel filter. All rows are imported regardless of filters.`);
  return { rows, warnings, sheet: ws.name, unmappedHeaders };
}

module.exports = { readIncidentWorkbook, parseDate, FIELDS };
