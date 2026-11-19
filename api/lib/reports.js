/**
 * api/lib/reports.js — Excel exports of the monthly BH rosters (OP / PSR).
 *
 * This replaces the manual step of splitting the emailed Word doc into two
 * reports. One workbook per call: a sheet per requested service plus a
 * Summary sheet.
 */
const ExcelJS = require("exceljs");
const { bhRoster } = require("./queries");
const { monthLabel } = require("./demo");

const SERVICE_NAMES = { OP: "Outpatient Therapy (OP)", PSR: "Psychosocial Rehabilitation (PSR)" };
const BRAND = "FF1F5C4A";

async function bhRosterWorkbook({ month, services = ["OP", "PSR"] }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Greenhouse by Emory Valley Center";
  wb.created = new Date();

  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 38 }, { width: 14 }, { width: 14 }];
  summary.addRow([`Behavioral Health Roster — ${monthLabel(month)}`]).font = { bold: true, size: 14 };
  summary.addRow([`Generated ${new Date().toLocaleString("en-US")} by Greenhouse`]).font = { italic: true, color: { argb: "FF666666" } };
  summary.addRow([]);
  const h = summary.addRow(["Service", "People", "New this month"]);
  h.font = { bold: true, color: { argb: "FFFFFFFF" } };
  h.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } }));

  for (const service of services) {
    const rows = bhRoster({ month, service });
    summary.addRow([SERVICE_NAMES[service], rows.length, rows.filter((r) => r.isNew).length]);

    const ws = wb.addWorksheet(service);
    const extraCols = [...new Set(rows.flatMap((r) => Object.keys(r.extra)))].filter((c) => !/name/i.test(c));
    ws.addRow([`${SERVICE_NAMES[service]} — ${monthLabel(month)}`]).font = { bold: true, size: 13 };
    ws.addRow([`${rows.length} people`]);
    ws.addRow([]);
    const header = ws.addRow(["#", "Name", "Name as written in source", ...extraCols, "Also receives", "New vs last month", `Incidents in ${monthLabel(month)}`]);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } }));
    rows.forEach((r, i) => {
      ws.addRow([
        i + 1,
        r.display_name || r.raw_name,
        r.raw_name,
        ...extraCols.map((c) => r.extra[c] ?? ""),
        r.alsoIn.join(", "),
        r.isNew ? "New" : "",
        r.events,
      ]);
    });
    ws.columns.forEach((c, i) => (c.width = i === 0 ? 6 : 24));
    ws.views = [{ state: "frozen", ySplit: 4 }];
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: header.cellCount } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { bhRosterWorkbook, SERVICE_NAMES };
