const ExcelJS = require('/Users/haseebqureshi/Code/emoryvalley/api/node_modules/exceljs');
const { readIncidentWorkbook } = require('/Users/haseebqureshi/Code/emoryvalley/api/lib/incidents-xlsx.js');

async function build(name, header, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(header); rows.forEach(r => ws.addRow(r));
  const buf = await wb.xlsx.writeBuffer();
  return readIncidentWorkbook(buf, { mappings: [], require: false })
    .then(r => console.log(name, '->', { confidence: r.confidence, headerRow: r.headerRow, sheet: r.sheet, rows: r.rows.length, missing: r.missingRequired, previewRows: r.preview?.length }))
    .catch(e => console.log(name, '-> THREW:', e.message));
}

(async () => {
  await build('full', ['Date Of Event', "Member's Full Name", 'Event Location'], [[new Date(2026, 0, 5), 'Jane Doe', 'Room 3']]);
  await build('partial', ['Date Of Event', 'Mystery Column', 'Another One'], [[new Date(2026, 0, 5), 'x', 'y']]);
  await build('none', ['Foo', 'Bar', 'Baz'], [['1', '2', '3']]);
  // corrupt
  try { await readIncidentWorkbook(Buffer.from('not a zip'), { require: false }); }
  catch (e) { console.log('corrupt -> THREW:', e.message.slice(0, 60)); }
})();
