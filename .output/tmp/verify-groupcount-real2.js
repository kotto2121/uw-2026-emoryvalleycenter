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
  db.run(`UPDATE event_report SET injury_level = 'no injury' WHERE id IN (SELECT id FROM event_report LIMIT 39)`);
  db.run(`UPDATE event_report SET injury_level = 'No injury.' WHERE id IN (SELECT id FROM event_report LIMIT 15)`);
  db.run(`UPDATE event_report SET injury_level = 'Minor injury.' WHERE id IN (SELECT id FROM event_report LIMIT 10 OFFSET 500)`);

  const q = require("../../api/lib/queries");
  const s = q.incidentsSummary({});

  // apples-to-apples baseline: same exclusion rules as groupCount's callers
  const where = "1=1"; // incidentsSummary({}) with no filters — check what eventWhere yields
  // Instead read eventWhere output via s? Simplest: mimic summary's default filter.
  const dupClause = "AND NOT is_exact_duplicate";
  const baseline = db.get(`SELECT COALESCE(SUM(n),0) AS n FROM (
      SELECT COUNT(*) AS n FROM event_report WHERE NOT is_exact_duplicate GROUP BY COALESCE(injury_level,'(Not recorded)'))`).n;
  const post = s.byInjury.reduce((a, r) => a + r.n, 0);
  console.log("byInjury:", s.byInjury.map(r => `${r.n}:${JSON.stringify(r.label)}`));
  console.log("baseline (dedup, grouped):", baseline, "| byInjury sum:", post);

  const fam = s.byInjury.filter(r => r.label !== "(Not recorded)" && compareKey(r.label) === "noinjury");
  const minor = s.byInjury.filter(r => compareKey(r.label) === "minorinjury");
  const ok = fam.length === 1 && minor.length === 1 && baseline === post;
  console.log(ok ? "GROUPCOUNT MERGE PASS (real code path)" : "FAIL");
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
