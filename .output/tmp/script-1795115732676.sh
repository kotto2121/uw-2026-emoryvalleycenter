const ExcelJS = require('/Users/haseebqureshi/Code/emoryvalley/node_modules/exceljs');
const { readIncidentWorkbook } = require('/Users/haseebqureshi/Code/emoryvalley/api/lib/incidents-xlsx.js');

(async () => {
  // Fully-unknown file; user orients row 2 as the header with mixed known/unknown cols.
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['Some Report']);                          // row 1: title
  ws.addRow(['Incident Date', 'Who', 'Where']);       // row 2: real header (squash-matched via aliases? no — unknown)
  ws.addRow(['01/05/2026', 'Jane Doe', 'Room 3']);
  const buf = await wb.xlsx.writeBuffer();

  // no headerRow -> none
  const r1 = await readIncidentWorkbook(buf, { require: false });
  console.log('scan:', { confidence: r1.confidence, headerRow: r1.headerRow, previewRows: r1.preview.length, firstPreviewRow: r1.preview[0] });

  // With DB-style mappings containing 'Incident Date' alias + headerRow=2 -> oriented
  const maps = [{ field: 'event_date', alias: 'incidentdate' }];
  const r2 = await readIncidentWorkbook(buf, { mappings: maps, require: false, headerRow: 2 });
  console.log('oriented:', { confidence: r2.confidence, headerRow: r2.headerRow, rows: r2.rows.length, row0: r2.rows[0], missing: r2.missingRequired, unknowns: r2.unknownHeaders.map(u=>u.header) });
})();
