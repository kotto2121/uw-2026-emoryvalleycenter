process.env.EVC_DB_PATH = "/tmp/ev-groupcount-test.db";
const db = require("../../db");
const { readIncidentWorkbook } = require("../../api/lib/incidents-xlsx");
const { importIncidents } = require("../../api/lib/importer");
const { generateDemoFiles } = require("../../api/lib/demo");
const { compareKey } = require("../../db/normalize");

(async () => {
  await db.getDb();
  const files = await generateDemoFiles();
  for (const inc of files.incidents) {
    const { rows } = await readIncidentWorkbook(inc.buffer);
    importIncidents({ rows, filename: inc.filename, isDemo: true });
  }

  // Inject cosmetic variants (same total counts, different spellings)
  db.run(`UPDATE event_report SET injury_level = 'no injury' WHERE id IN (SELECT id FROM event_report LIMIT 39)`);
  db.run(`UPDATE event_report SET injury_level = 'No injury.' WHERE id IN (SELECT id FROM event_report LIMIT 15)`);
  db.run(`UPDATE event_report SET injury_level = 'Minor injury.' WHERE id IN (SELECT id FROM event_report LIMIT 10 OFFSET 500)`);

  const rawTotal = db.get(`SELECT COUNT(*) AS n FROM event_report`).n;

  // Exercise the REAL groupCount via incidentsSummary
  const q = require("../../api/lib/queries");
  const s = q.incidentsSummary({});
  const byInjury = s.byInjury;
  const postTotal = byInjury.reduce((a, r) => a + r.n, 0);

  const fam = byInjury.filter(r => r.label !== "(Not recorded)" && compareKey(r.label) === "noinjury");
  const minor = byInjury.filter(r => compareKey(r.label) === "minorinjury");
  console.log("byInjury:", byInjury.map(r => `${r.n}:${JSON.stringify(r.label)}`));
  console.log("'no injury' cosmetic family -> buckets:", fam.length, fam);
  console.log("'minor injury' family -> buckets:", minor.length, minor);
  console.log("(Not recorded):", (byInjury.find(r => r.label === "(Not recorded)") || {}).n ?? 0);
  console.log("row totals pre==post:", rawTotal === postTotal, `(${rawTotal})`);
  console.log("topSites:", s.topSites.slice(0, 3).map(r => `${r.n}:${r.label}`));

  const ok = fam.length === 1 && minor.length === 1 && rawTotal === postTotal;
  console.log(ok ? "GROUPCOUNT MERGE PASS (real code path)" : "FAIL");
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
