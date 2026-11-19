/**
 * api/lib/docx-tables.js — extract tables (and the text around them) from a .docx.
 *
 * A .docx is a zip; the body lives in word/document.xml. We walk its tags with
 * a small state machine instead of pulling in a full Word library: we only
 * need paragraphs and table cells, in document order.
 *
 * Because we don't yet have a sample of the monthly behavioral-health Word doc,
 * the import is deliberately generic: every table comes back with the
 * paragraphs just before it (often a heading like "Outpatient" or "PSR"), and
 * guessRoster() proposes which tables are OP vs PSR and which column holds the
 * name. The Import Center shows those guesses and lets the user correct them.
 */
const JSZip = require("jszip");

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/**
 * @returns {Promise<{ blocks: Array<{type:'para',text:string}|{type:'table',rows:string[][]}> }>}
 */
async function readDocx(buffer) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw Object.assign(new Error("That file isn't a readable .docx (Word 2007+) document."), { status: 422 });
  }
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw Object.assign(new Error("No word/document.xml inside the .docx."), { status: 422 });
  const xml = await docFile.async("string");

  const blocks = [];
  const tagRe = /<(\/?)(w:tbl|w:tr|w:tc|w:p|w:t|w:tab|w:br|w:cr)(?=[\s>/])[^>]*?(\/?)>/g;
  let tblDepth = 0;
  let para = null; // current paragraph text buffer
  let table = null; // rows of current top-level table
  let row = null;
  let cell = null; // array of paragraph strings
  let inText = false;
  let lastIndex = 0;
  let m;

  while ((m = tagRe.exec(xml))) {
    if (inText) {
      const text = decodeEntities(xml.slice(lastIndex, m.index));
      if (para !== null) para += text;
    }
    const [, close, tag, selfClose] = m;
    lastIndex = tagRe.lastIndex;
    inText = false;

    if (tag === "w:t" && !close && !selfClose) {
      inText = true;
      continue;
    }
    if ((tag === "w:tab") && para !== null) para += "\t";
    if ((tag === "w:br" || tag === "w:cr") && para !== null) para += "\n";

    if (tag === "w:p") {
      if (!close && !selfClose) para = "";
      else if (close) {
        const text = (para || "").replace(/[  ]+/g, " ").trim();
        if (tblDepth === 0) {
          if (text) blocks.push({ type: "para", text });
        } else if (tblDepth === 1 && cell) {
          cell.push(text);
        } else if (tblDepth > 1 && cell) {
          cell.push(text); // flatten nested tables into the outer cell
        }
        para = null;
      } else if (selfClose && tblDepth === 1 && cell) {
        cell.push("");
      }
    } else if (tag === "w:tbl") {
      if (!close) {
        tblDepth++;
        if (tblDepth === 1) table = [];
      } else {
        if (tblDepth === 1 && table) {
          const rows = table.filter((r) => r.some((c) => c));
          if (rows.length) blocks.push({ type: "table", rows });
          table = null;
        }
        tblDepth--;
      }
    } else if (tag === "w:tr" && tblDepth === 1) {
      if (!close) row = [];
      else {
        if (table && row) table.push(row);
        row = null;
      }
    } else if (tag === "w:tc" && tblDepth === 1) {
      if (!close) cell = [];
      else {
        if (row && cell) row.push(cell.filter(Boolean).join(" ").trim());
        cell = null;
      }
    }
  }
  return { blocks };
}

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const MON_RE = `(${MONTHS.join("|")}|${MONTHS.map((x) => x.slice(0, 3)).join("|")})`;

/**
 * Find a month in free text -> 'YYYY-MM'. Handles "October 2026",
 * "October 15, 2026", "Oct. 2026", "10/15/2026", "10/2026", "2026-10-15".
 */
function findMonth(text) {
  const t = String(text || "").toLowerCase().replace(/ /g, " ");
  const monthIdx = (name) => MONTHS.findIndex((x) => x.startsWith(name.slice(0, 3))) + 1;
  let m = t.match(new RegExp(`\\b${MON_RE}\\.?\\s+(?:\\d{1,2}(?:st|nd|rd|th)?,?\\s+)?(20\\d\\d)\\b`));
  if (m) return `${m[2]}-${String(monthIdx(m[1])).padStart(2, "0")}`;
  m = t.match(/\b(0?[1-9]|1[0-2])\/(?:\d{1,2}\/)?(20\d\d|\d\d)\b/);
  if (m) {
    const y = m[2].length === 2 ? `20${m[2]}` : m[2];
    return `${y}-${m[1].padStart(2, "0")}`;
  }
  m = t.match(/\b(20\d\d)-(0[1-9]|1[0-2])(?:-\d\d)?\b/);
  if (m) return `${m[1]}-${m[2]}`;
  return null;
}

// Service signals. EVC's roster calls outpatient therapy "Individual Therapy".
const PSR_RE = /psycho[\s-]?social|\bP\.?S\.?R\.?\b/i;
const OP_RE = /\bout[\s-]?patient\b|\bO\.?P\.?\b|individual therapy|\btherapist\b|\btherapy\b/i;
const NAME_HDR_RE = /\b(name|client|member|individual|person|consumer|participant)\b/i;
const KNOWN_HDR_RE = /^(site|home|location|frequency|freq|day|days|time|schedule|staff|clinician|therapist|name|client( name)?|notes?|status|start( date)?|admission( date)?)$/i;
const FREQ_RE = /^(weekly|bi-?weekly|monthly|daily|\d+\s*[xX]\s*(\/|per\s*)?\s*(wk|week|mo|month)|\d+\s*[mMwW]|\(?one per (week|month)\)?|as needed|prn)$/i;
const SCHEDULE_RE = /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b.*\d{1,2}(:\d{2})?\s*(am|pm)?|total\s*:/i;

function serviceFrom(text) {
  const psr = PSR_RE.test(text);
  const op = OP_RE.test(String(text).replace(PSR_RE, " "));
  if (psr && !op) return "PSR";
  if (op && !psr) return "OP";
  return null;
}

/** Normalize a cell: nbsp -> space, collapse whitespace. */
const tidy = (s) => String(s || "").replace(/ /g, " ").replace(/\s+/g, " ").trim();

/**
 * Split "Jane Doe - discharged" into { name: "Jane Doe", status: "discharged" }.
 * Only a SPACED hyphen/dash counts, so "Smith-Jones" stays intact.
 */
function splitStatus(cell) {
  const t = tidy(cell);
  const m = t.match(/^(.*?\S)\s+[-–—]\s+(.+)$/);
  return m ? { name: m[1], status: m[2] } : { name: t, status: null };
}

/** Does this cell look like a person's name ("First Last", "First M. Last", "Last, First")? */
function looksLikeName(s) {
  s = splitStatus(s).name;
  if (!s || s.length > 45 || /\d|:|\(|\)/.test(s) || SCHEDULE_RE.test(s) || FREQ_RE.test(s)) return false;
  const W = "[\\p{L}'’.-]+";
  return new RegExp(`^${W},\\s*${W}(\\s+${W})*$`, "u").test(s) || new RegExp(`^${W}(\\s+${W}){1,3}$`, "u").test(s);
}

/** Pull "Demo Clinician A" out of "Therapist: Demo Clinician A — Total: 26 (Individual Therapy)". */
function staffFromHeading(h) {
  let t = tidy(h).replace(/^(therapist|clinician|staff|case ?manager)\s*:\s*/i, "");
  t = t.split(/\s+[-–—]\s+|\bTotal\s*:|\(|\bcaseload\b/i)[0];
  t = t.replace(/\b(psychosocial rehabilitation|individual therapy|outpatient|psr|op)\b/gi, "").replace(/[\s:–—-]+$/, "").trim();
  if (!t || /^1:1$|^additional$/i.test(t) || /\d/.test(t)) return null;
  return t;
}

/**
 * Interpret every table in the document as (part of) a roster.
 *
 * Built around the real EVC "Behavioral Health Caseloads" layout (see
 * docs/chatgpt-outputs/Prompt_A_document_structure.json):
 *   - most tables have NO header row: [site, frequency, client name]
 *   - service + staff are in the heading paragraph above each table
 *   - schedule/summary rows ("Mon, Wed, Fri (9:00AM-11:00AM) | | Total: 24 (...)")
 *     are mixed into the tables and are not clients
 *   - a "1:1" table has a header row (Site | Frequency | <staff> | '') and names in two columns
 *   - an "Additional Caseload" table uses staff names as column headers; every column
 *     holds client names, some with a trailing " - STATUS" annotation
 * It still handles simple header-row layouts (e.g. "Client Name" columns).
 *
 * Returns { month, tables: [{ index, heading, staff, expectedTotal, header, hasHeader,
 *   rows, skipRow[], nameLike[][], nameCols[], service, serviceCol, columnStaff[] }] }
 */
function guessRoster(blocks, filename = "") {
  const allText = blocks.filter((b) => b.type === "para").map((b) => b.text).join("\n");
  const month = findMonth(allText) || findMonth(filename);
  const tables = [];
  let lastHeading = "";

  blocks.forEach((b) => {
    if (b.type === "para") {
      if (tidy(b.text)) lastHeading = tidy(b.text);
      return;
    }
    const raw = b.rows.map((r) => r.map(tidy));
    const width = Math.max(...raw.map((r) => r.length));
    const rows = raw.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
    const heading = lastHeading;
    lastHeading = "";
    const isAdditional = /additional caseload/i.test(heading);

    // Header row?
    const first = rows[0] || [];
    const firstKnown = first.filter((c) => KNOWN_HDR_RE.test(c) || NAME_HDR_RE.test(c)).length;
    const hasHeader = isAdditional || firstKnown >= 1;
    const body = hasHeader ? rows.slice(1) : rows;

    // Which rows are schedule/summary/blank rows rather than clients?
    const nameLike = body.map((r) => r.map((c) => looksLikeName(c)));
    const skipRow = body.map((r, i) => r.some((c) => SCHEDULE_RE.test(c)) || !nameLike[i].some(Boolean));

    // Column kinds.
    const colScore = (c) => body.filter((r, i) => !skipRow[i] && nameLike[i][c]).length;
    const freqCol = Array.from({ length: width }, (_, c) => c).find((c) => {
      const vals = body.map((r) => r[c]).filter(Boolean);
      return vals.length && vals.filter((v) => FREQ_RE.test(v)).length >= vals.length * 0.6;
    });

    let nameCols;
    const scores = Array.from({ length: width }, (_, c) => colScore(c));
    const best = Math.max(0, ...scores);
    const hdrName = hasHeader && !isAdditional ? first.findIndex((h) => NAME_HDR_RE.test(h) && !/staff|clinician|therapist|provider|case/i.test(h)) : -1;
    if (hdrName >= 0) {
      nameCols = [hdrName];
    } else if (hasHeader) {
      // Header tables (1:1, Additional Caseload): every column whose header is blank or a
      // staff name (not "Site"/"Frequency"/…) and that holds a real share of names.
      nameCols = scores
        .map((sc, c) => (best && sc >= Math.max(1, best * 0.3) && !(first[c] && KNOWN_HDR_RE.test(first[c])) ? c : -1))
        .filter((c) => c >= 0);
    } else {
      // Header-less tables: exactly ONE name column — the rightmost column that is
      // (nearly) as name-like as the best one. Site / home labels in the first column
      // can look like names ("Maple House"), and in EVC's layout the client is always last.
      const candidates = scores.map((sc, c) => (best && sc >= best * 0.8 ? c : -1)).filter((c) => c >= 0);
      nameCols = candidates.length ? [candidates[candidates.length - 1]] : [];
    }

    const header = Array.from({ length: width }, (_, c) => {
      if (hasHeader && !isAdditional && first[c] && KNOWN_HDR_RE.test(first[c])) return first[c];
      if (nameCols.includes(c)) return nameCols.length > 1 ? `Client name ${nameCols.indexOf(c) + 1}` : "Client name";
      if (c === freqCol) return "Frequency";
      if (c === 0) return "Site";
      return `Column ${c + 1}`;
    });

    // Staff: from the heading; for header-row tables, a staff name in the header.
    const headingStaff = staffFromHeading(heading);
    const columnStaff = Array.from({ length: width }, (_, c) =>
      hasHeader && first[c] && !KNOWN_HDR_RE.test(first[c]) && looksLikeName(first[c]) ? first[c] : null);

    const totalMatch = heading.match(/total\s*:\s*(\d+)/i);
    const serviceCol = -1; // EVC's roster signals service per table, not per row
    const service = isAdditional ? null : serviceFrom(heading) || serviceFrom(rows.flat().join(" "));

    tables.push({
      index: tables.length,
      heading,
      context: heading, // kept for older UI code
      staff: headingStaff,
      columnStaff,
      expectedTotal: totalMatch ? Number(totalMatch[1]) : null,
      isAdditional,
      header,
      hasHeader,
      rowCount: body.length,
      rows: body,
      skipRow,
      nameLike,
      nameCols,
      nameCol: nameCols[0] ?? 0, // backwards compatibility
      serviceCol,
      service,
    });
  });

  return { month, tables };
}

/**
 * Turn one (possibly user-edited) table config into roster entries.
 * Used for both the preview counts and the actual import, so they agree.
 */
function tableEntries(t) {
  const out = [];
  const nameCols = Array.isArray(t.nameCols) && t.nameCols.length ? t.nameCols : [t.nameCol ?? 0];
  (t.rows || []).forEach((row, r) => {
    if (row.some((c) => SCHEDULE_RE.test(tidy(c)))) return;
    for (const c of nameCols) {
      const cell = row[c];
      if (!looksLikeName(cell)) continue;
      const { name, status } = splitStatus(cell);
      const extra = {};
      (t.header || []).forEach((h, i) => {
        if (!nameCols.includes(i) && row[i]) extra[h] = tidy(row[i]);
      });
      const staff = (t.columnStaff && t.columnStaff[c]) || t.staff;
      if (staff) extra.Staff = staff;
      if (status) extra.Status = status;
      if (t.heading) extra.Section = t.heading;
      out.push({ name, extra, row: r, col: c });
    }
  });
  return out;
}

module.exports = { readDocx, guessRoster, tableEntries, findMonth, serviceFrom, looksLikeName, splitStatus, staffFromHeading };
