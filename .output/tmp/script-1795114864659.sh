#!/bin/bash
cd /Users/haseebqureshi/Code/emoryvalley
echo "--- scripts ---"
node -e "console.log(JSON.stringify(require('./package.json').scripts, null, 2))"
echo "--- BUILD_ID exists? ---"
ls -la .next/BUILD_ID 2>/dev/null || echo "no BUILD_ID"
stat -f "%Sm .next" .next 2>/dev/null
stat -f "%Sm import.js" app/pages/import.js
echo "--- parent of 28321 (who spawned next-server) ---"
ps -p 28321 -o ppid=
