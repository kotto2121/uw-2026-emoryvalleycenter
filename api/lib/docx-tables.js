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

/** Find a "November 2026" / "11/2026" style month in free text -> 'YYYY-MM'. */
function findMonth(text) {
  const t = String(text || "").toLowerCase();
  let m = t.match(new RegExp(`\\b(${MONTHS.join("|")}|${MONTHS.map((x) => x.slice(0, 3)).join("|")})\\.?,?\\s+(20\\d\\d)\\b`));
  if (m) {
    const idx = MONTHS.findIndex((x) => x.startsWith(m[1].slice(0, 3)));
    return `${m[2]}-${String(idx + 1).padStart(2, "0")}`;
  }
  m = t.match(/\b(0?[1-9]|1[0-2])\/(20\d\d)\b/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  return null;
}

const OP_RE = /\bout[\s-]?patient\b|\bO\.?P\.?\b/i;
const PSR_RE = /psycho[\s-]?social|\bP\.?S\.?R\.?\b/i;
const NAME_HDR_RE = /name|client|member|individual|person|consumer|participant/i;

function serviceFrom(text) {
  const op = OP_RE.test(text);
  const psr = PSR_RE.test(text);
  if (op && !psr) return "OP";
  if (psr && !op) return "PSR";
  return null;
}

/** Does this cell look like a person's name (2–4 words / "Last, First")? */
function looksLikeName(s) {
  s = String(s || "").trim();
  if (!s || s.length > 40 || /\d/.test(s)) return false;
  return /^[A-Za-z'’.-]+,\s*[A-Za-z'’. -]+$/.test(s) || /^[A-Za-z'’.-]+(\s+[A-Za-z'’.()"-]+){1,3}$/.test(s);
}

/**
 * Propose how to read each table as a roster.
 * Returns { month, tables: [{ index, context, header, rows, hasHeader,
 *   nameCol, service, serviceCol, sample }] }
 */
function guessRoster(blocks, filename = "") {
  const allText = blocks.filter((b) => b.type === "para").map((b) => b.text).join("\n");
  const month = findMonth(allText) || findMonth(filename);
  const tables = [];
  let recentParas = [];

  blocks.forEach((b) => {
    if (b.type === "para") {
      recentParas.push(b.text);
      recentParas = recentParas.slice(-3);
      return;
    }
    const rows = b.rows;
    const width = Math.max(...rows.map((r) => r.length));
    const first = rows[0] || [];
    const hasHeader =
      first.some((c) => NAME_HDR_RE.test(c)) ||
      (rows.length > 1 && !first.some(looksLikeName) && rows[1].some(looksLikeName));
    const header = hasHeader ? first : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
    const body = hasHeader ? rows.slice(1) : rows;

    // Name column: a header that says "name", else the column with the most name-like cells.
    let nameCol = header.findIndex((h) => NAME_HDR_RE.test(h) && !/staff|clinician|therapist|provider|case/i.test(h));
    if (nameCol < 0) {
      let bestScore = -1;
      for (let c = 0; c < width; c++) {
        const score = body.filter((r) => looksLikeName(r[c])).length;
        if (score > bestScore) {
          bestScore = score;
          nameCol = c;
        }
      }
    }

    // Service: a per-row column with OP/PSR values, else the heading text, else the header.
    let serviceCol = -1;
    for (let c = 0; c < width; c++) {
      if (c === nameCol) continue;
      const vals = body.map((r) => serviceFrom(r[c] || "")).filter(Boolean);
      if (vals.length >= Math.max(1, body.length * 0.6)) {
        serviceCol = c;
        break;
      }
    }
    const context = recentParas.join(" · ");
    const service = serviceCol >= 0 ? null : serviceFrom(context) || serviceFrom(header.join(" "));

    tables.push({
      index: tables.length,
      context,
      header,
      hasHeader,
      rowCount: body.length,
      rows: body,
      nameCol,
      serviceCol,
      service, // 'OP' | 'PSR' | null (=ignore unless user picks)
    });
    recentParas = [];
  });

  return { month, tables };
}

module.exports = { readDocx, guessRoster, findMonth, serviceFrom, looksLikeName };
