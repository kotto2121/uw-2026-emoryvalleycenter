#!/bin/bash
cd /Users/haseebqureshi/Code/emoryvalley
grep -n -E '^(<<<<<<<|=======|>>>>>>>)' api/lib/incidents-xlsx.js
echo "---diff---"
git diff api/lib/incidents-xlsx.js | head -120
