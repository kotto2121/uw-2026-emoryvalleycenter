#!/bin/bash
cd /Users/haseebqureshi/Code/emoryvalley
node -e "require('./api/lib/incidents-xlsx.js'); console.log('module loads OK')"
node -e "
const { parseDate } = require('./api/lib/incidents-xlsx.js');
console.log(parseDate('11/19/2026'), parseDate('2026-11-19'), parseDate(46000));
"
echo "=== conflicts remaining ==="
grep -rn -E '^(<{7}|={7}|>{7})' api/lib/incidents-xlsx.js || echo "none"
