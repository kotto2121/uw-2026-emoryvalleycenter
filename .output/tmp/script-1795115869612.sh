const ExcelJS = require('/Users/haseebqureshi/Code/emoryvalley/node_modules/exceljs');
const fs = require('fs');

async function make(name, header, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(header); rows.forEach(r => ws.addRow(r));
  fs.writeFileSync(`/tmp/evx-${name}.xlsx`, Buffer.from(await wb.xlsx.writeBuffer()));
}

(async () => {
  await make('clean', ['Date Of Event', "Member's Full Name", 'Event Location'],
    [[new Date(2026, 0, 5), 'Jane Doe', 'Room 3'], [new Date(2026, 0, 6), 'John Smith', 'Room 4']]);
  await make('doctored', ['Date Of Event', "Member's Full Name", 'Event Location', 'Brand New Thing'],
    [[new Date(2026, 1, 5), 'Alice Ray', 'Gym', 'hello']]);
  await make('unknown', ['Some Report'],
    [[' '], ['Incident Date', 'Who Was Involved', 'Where'], ['01/05/2026', 'Jane Doe', 'Room 3'], ['02/05/2026', 'Bob Lee', 'Gym']]);
  console.log('fixtures written');
})();
