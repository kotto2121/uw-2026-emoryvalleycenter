#!/bin/bash
cd /Users/haseebqureshi/Code/emoryvalley
node -e "
const ExcelJS = require('exceljs');
(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['Incident ID','Date of Event','Event Type','Sneaky Renamed Col','Brand New Thing']);
  ws.addRow(['X-1','2026-11-01','Fall','','hello']);
  await wb.xlsx.writeFile('/Users/haseebqureshi/Code/emoryvalley/.output/tmp/doctored.xlsx');
  console.log('wrote');
})();
" && ls -la /Users/haseebqureshi/Code/emoryvalley/.output/tmp/doctored.xlsx

F=/Users/haseebqureshi/Code/emoryvalley/.output/tmp/doctored.xlsx
curl -s -m 15 -w "\nHTTP:%{http_code}\n" -X POST http://127.0.0.1:4100/api/imports/analyze \
  -H "x-evc-token: dev-token" \
  -H "Content-Type: application/octet-stream" \
  -H "x-filename: doctored.xlsx" \
  --data-binary "@$F"
