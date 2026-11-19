/**
 * api/lib/xlsx-read.js — a small, tolerant .xlsx reader (values only).
 *
 * Why not exceljs for reading? Real workbooks from EVC's desktops contain
 * Excel Tables with date-grouped filters, charts, pivot-style summary sheets,
 * odd/empty style elements, etc. exceljs parses ALL of that and threw on a real
 * file ("Unexpected xml node in parseOpen: dateGroupItem"). This reader only
 * looks at what we need — sheet names, shared strings, cell values, number
 * formats (to recognise dates) and hidden rows — and ignores everything else.
 * (exceljs is still used to WRITE the report workbooks.)
 *
 * readWorkbook(buffer) -> { sheets: [{ name, state, rows: (string|number|Date|null)[][], hiddenRows: Set<number> }] }
 * Row/column indexes in `rows` are 0-based; rows[0] is spreadsheet row 1.
 */
const JSZip = require("jszip");

function decode(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/_x([0-9A-F]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16))); // Excel escapes
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? decode(m[1]) : null;
};

/** Concatenate every <t> inside a fragment (handles rich-text runs; skips phonetic <rPh>). */
function textOf(fragment) {
  const noPhonetic = fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let m;
  while ((m = re.exec(noPhonetic))) out += m[1] ? decode(m[1]) : "";
  return out;
}

/** "BC12" -> 0-based column index 54. */
function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

function isDateFormatCode(code) {
  if (!code) return false;
  const c = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, ""); // strip literals, colors/locales, escapes
  return /[dmy]/i.test(c) && !/^[#0.,%\s]+$/.test(c);
}

function excelSerialToDate(n, date1904) {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return new Date(epoch + Math.round(n * 86400000));
}

async function readWorkbook(buffer) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw Object.assign(new Error("That file isn't a readable .xlsx workbook. (Old .xls files: open in Excel and Save As .xlsx.)"), { status: 422 });
  }
  const read = async (p) => (zip.file(p) ? zip.file(p).async("string") : null);

  const workbookXml = await read("xl/workbook.xml");
  if (!workbookXml) throw Object.assign(new Error("No workbook found inside the .xlsx file."), { status: 422 });
  const date1904 = /date1904="(1|true)"/.test(workbookXml);

  // Sheet name -> file path, via the workbook relationships.
  const relsXml = (await read("xl/_rels/workbook.xml.rels")) || "";
  const rels = {};
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    let target = attr(m[0], "Target") || "";
    target = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    rels[id] = target.replace(/\/\.\//g, "/");
  }
  const sheetDefs = [...workbookXml.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    name: attr(m[0], "name"),
    state: attr(m[0], "state") || "visible",
    path: rels[attr(m[0], "r:id")],
  }));

  // Shared strings.
  const sstXml = (await read("xl/sharedStrings.xml")) || "";
  const shared = [...sstXml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map((m) => (m[1] ? textOf(m[1]) : ""));

  // Styles: which cell style indexes are dates?
  const stylesXml = (await read("xl/styles.xml")) || "";
  const customFormats = {};
  for (const m of stylesXml.matchAll(/<numFmt\b[^>]*>/g)) customFormats[Number(attr(m[0], "numFmtId"))] = attr(m[0], "formatCode");
  const cellXfs = (stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/) || [])[1] || "";
  const dateStyle = [...cellXfs.matchAll(/<xf\b[^>]*>/g)].map((m) => {
    const id = Number(attr(m[0], "numFmtId") || 0);
    return BUILTIN_DATE_FORMATS.has(id) || isDateFormatCode(customFormats[id]);
  });

  const sheets = [];
  for (const def of sheetDefs) {
    const xml = def.path ? await read(def.path) : null;
    if (!xml) continue; // chartsheets etc.
    const rows = [];
    const hiddenRows = new Set();
    const sheetData = (xml.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/) || [])[1] || "";
    let implicitRow = 0;
    for (const rm of sheetData.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rAttr = attr(`<row ${rm[1]}>`, "r");
      const r = rAttr ? Number(rAttr) - 1 : implicitRow;
      implicitRow = r + 1;
      if (/\bhidden="(1|true)"/.test(rm[1])) hiddenRows.add(r);
      const body = rm[2] || "";
      const row = [];
      let implicitCol = 0;
      for (const cm of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const tag = `<c ${cm[1]}>`;
        const ref = attr(tag, "r");
        const c = ref ? colIndex(ref) : implicitCol;
        implicitCol = c + 1;
        const t = attr(tag, "t");
        const s = Number(attr(tag, "s") || 0);
        const inner = cm[2] || "";
        const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let value = null;
        if (t === "s") value = v !== undefined ? shared[Number(v)] ?? null : null;
        else if (t === "inlineStr") value = textOf(inner);
        else if (t === "str") value = v !== undefined ? decode(v) : null; // formula result
        else if (t === "b") value = v === "1" ? "TRUE" : v === "0" ? "FALSE" : null;
        else if (t === "e") value = null; // #N/A etc.
        else if (t === "d") value = v ? new Date(v) : null;
        else if (v !== undefined && v !== "") {
          const n = Number(v);
          value = dateStyle[s] && Number.isFinite(n) ? excelSerialToDate(n, date1904) : n;
        }
        row[c] = value;
      }
      rows[r] = row;
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    sheets.push({ name: def.name, state: def.state, rows, hiddenRows });
  }
  return { sheets };
}

module.exports = { readWorkbook, excelSerialToDate };
