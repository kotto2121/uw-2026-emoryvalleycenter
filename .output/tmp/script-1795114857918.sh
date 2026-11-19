#!/bin/bash
echo "--- how was next started? ---"
ps -p 28321 -o lstart=,command=
ps -p 28321 -o command= | tr ' ' '\n' | head -20
echo "--- .next build time vs import.js mtime ---"
stat -f "%Sm %N" /Users/haseebqureshi/Code/emoryvalley/.next/BUILD_ID 2>/dev/null
ls /Users/haseebqureshi/Code/emoryvalley/.next/static/chunks/app/ 2>/dev/null | head
find /Users/haseebqureshi/Code/emoryvalley/.next/static -name "*.js" -newer /Users/haseebqureshi/Code/emoryvalley/app/pages/import.js 2>/dev/null | head -3
echo "(empty above = no built chunks newer than the edited import.js)"
echo "--- does the built bundle contain the new endpoint string? ---"
grep -rl "imports/analyze" /Users/haseebqureshi/Code/emoryvalley/.next/static 2>/dev/null | head -3
echo "(empty = stale build missing the new flow)"
