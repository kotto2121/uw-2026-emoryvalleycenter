#!/bin/bash
cd /Users/haseebqureshi/Code/emoryvalley
grep -n -E 'readIncidentWorkbook|confidence|preview|headerRow|hiddenRows|sheets|worksheets' api/server.js | head -60
echo "=== git log remote-side commits touching incidents-xlsx ==="
git log --oneline HEAD..77e914c -- api/lib/incidents-xlsx.js api/lib/xlsx-read.js
echo "=== local commits ==="
git log --oneline 77e914c..HEAD -- api/lib/incidents-xlsx.js
echo "=== other files in conflict? ==="
git diff --name-only --diff-filter=U
