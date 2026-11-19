#!/bin/bash
cd /Users/haseebqureshi/Code/emoryvalley
node -e "
const ExcelJS = require('exceljs');
(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['Date Of Event',\"Member's Full Name\",'Event Type','Brand New Thing']);
  ws.addRow(['2026-11-01','Test Person, John','Fall','hello world']);
  await wb.xlsx.writeFile('/Users/haseebqureshi/Code/emoryvalley/.output/tmp/doctored2.xlsx');
  console.log('wrote doctored2');
})();
"
F=/Users/haseebqureshi/Code/emoryvalley/.output/tmp/doctored2.xlsx
echo "--- analyze ---"
RESP=$(curl -s -m 15 -X POST http://127.0.0.1:4100/api/imports/analyze \
  -H "x-evc-token: dev-token" -H "Content-Type: application/octet-stream" \
  -H "x-filename: doctored2.xlsx" --data-binary "@$F")
echo "$RESP"
UPID=$(echo "$RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).uploadId||''))")
echo "--- commit (ignore unknown col) ---"
curl -s -m 15 -X POST "http://127.0.0.1:4100/api/imports/$UPID/commit" \
  -H "x-evc-token: dev-token" -H "Content-Type: application/json" \
  -d '{"decisions":[{"header":"Brand New Thing","action":"ignore"}]}'
echo ""
