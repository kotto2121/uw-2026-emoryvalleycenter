cd /Users/haseebqureshi/Code/emoryvalley
grep -n '<<<<<<<\|=======\|>>>>>>>' db/index.js || echo "NO MARKERS"
node --check db/index.js && echo "SYNTAX OK"
node --check api/server.js && node --check api/lib/importer.js && node --check api/lib/incidents-xlsx.js && echo "ALL SYNTAX OK"
