const ExcelJS = require('/Users/haseebqureshi/Code/emoryvalley/node_modules/exceljs');
const { readIncidentWorkbook } = require('/Users/haseebqureshi/Code/emoryvalley/api/lib/incidents-xlsx.js');

async function build(name, header, rows, opts) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(header); rows.forEach(r => ws.addRow(r));
  const buf = await wb.xlsx.writeBuffer();
  return readIncidentWorkbook(buf, opts)
    .then(r => console.log(name, '->', { confidence: r.confidence, headerRow: r.headerRow, rows: r.rows.length, missing: r.missingRequired, unknowns: r.unknownHeaders.map(u => u.header), previewRows: r.preview?.length }))
    .catch(e => console.log(name, '-> THREW:', e.message));
}

(async () => {
  await build('full', ['Date Of Event', "Member's Full Name", 'Event Location'], [[new Date(2026, 0, 5), 'Jane Doe', 'Room 3']]);
  await build('partial-2hits', ['Date Of Event', "Member's Full Name", 'Mystery'], [[new Date(2026, 0, 5), 'Jane', 'x']]);
  await build('none', ['Foo', 'Bar', 'Baz'], [['1', '2', '3']]);
})();
