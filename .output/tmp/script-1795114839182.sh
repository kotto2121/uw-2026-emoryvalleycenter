#!/bin/bash
find /Users/haseebqureshi/Code/emoryvalley -maxdepth 4 -name "xlsx" -type d -not -path "*/xlsx/*" 2>/dev/null
grep -rn "require(\"xlsx\")\|require('xlsx')" /Users/haseebqureshi/Code/emoryvalley/api --include="*.js" | head -5
cat /Users/haseebqureshi/Code/emoryvalley/package.json | grep -A2 -B2 xlsx
