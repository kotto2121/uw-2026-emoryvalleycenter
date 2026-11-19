git add api/lib/importer.js api/lib/incidents-xlsx.js && git commit -m "Route importer cell cleaning through db/normalize.js normalizeValue

Follow-up to 6c369db: importer.js and incidents-xlsx.js now use the shared
normalizeValue helper for cell cleaning instead of ad-hoc normalization." && git status --short && git log -1 --stat