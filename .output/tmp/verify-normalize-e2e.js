process.env.EVC_DB_PATH = "/tmp/ev-normalize-test.db";
const db = require("../../db");
const { readIncidentWorkbook } = require("../../api/lib/incidents-xlsx");
const { importIncidents } = require("../../api/lib/importer");
const { generateDemoFiles } = require("../../api/lib/demo");

(async () => {
  await db.getDb();
  const files = await generateDemoFiles();
  for (const inc of files.incidents) {
    const { rows } = await readIncidentWorkbook(inc.buffer);
    importIncidents({ rows, filename: inc.filename, isDemo: true });
  }
  const q = require("../../api/lib/queries");
  const s = q.incidentsSummary({});
  console.log("byObservation:", JSON.stringify(s.byObservation));
  console.log("byLocation:", JSON.stringify(s.byLocation));
  console.log("dataQuality.observation_blank:", s.dataQuality.observation_blank);

  // Dedupe check: re-import the first file, expect all skipped.
  const { rows: rows2 } = await readIncidentWorkbook(files.incidents[0].buffer);
  const sum = importIncidents({ rows: rows2, filename: files.incidents[0].filename });
  console.log("re-import: inserted =", sum.inserted, "skipped =", sum.alreadyImported);
  console.log(sum.inserted === 0 && sum.alreadyImported === sum.rowsRead ? "DEDUPE PASS" : "DEDUPE FAIL");
})().catch((e) => { console.error(e); process.exit(1); });
