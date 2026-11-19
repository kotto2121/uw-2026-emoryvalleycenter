#!/bin/bash
cd /Users/haseebqureshi/Code/emoryvalley/api
node -e "
const XLSX = require('xlsx');
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([
  ['Incident ID','Date of Event','Event Type','Sneaky Renamed Col','Brand New Thing'],
  ['X-1','2026-11-01','Fall','','hello']
]);
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
XLSX.writeFile(wb, '../.output/tmp/doctored.xlsx');
console.log('wrote doctored.xlsx');
"
echo "--- curl analyze endpoint ---"
curl -s -m 10 -X POST http://127.0.0.1:4100/api/imports/analyze -F "file=@/Users/haseebqureshi/Code/emoryvalley/.output/tmp/doctored.xlsx"
echo ""
echo "--- health/other probe ---"
curl -s -m 5 -o /dev/null -w "GET /api/imports -> %{http_code}\n" http://127.0.0.1:4100/api/imports
curl -s -m 5 -o /dev/null -w "POST /api/imports/analyze (empty) -> %{http_code}\n" -X POST http://127.0.0.1:4100/api/imports/analyze
