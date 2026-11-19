#!/bin/bash
cd /Users/haseebqureshi/Code/emoryvalley
ls demo-data/ 2>/dev/null
node -e "
const XLSX = require('xlsx');
const wb = XLSX.utils.book_new();
// doctored: renamed column + brand-new column
const ws = XLSX.utils.aoa_to_sheet([
  ['Incident ID','Date of Event','Event Type','Sneaky Renamed Col','Brand New Thing'],
  ['X-1','2026-11-01','Fall','','hello']
]);
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
XLSX.writeFile(wb, '.output/tmp/doctored.xlsx');
console.log('wrote .output/tmp/doctored.xlsx');
" 2>&1 || echo "xlsx module not found at root, trying api/"
