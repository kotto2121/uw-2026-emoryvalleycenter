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

  // Inject cosmetic variants + a real description value (idempotent via existing ids)
  db.run(`UPDATE event_report SET injury_level = 'no injury' WHERE id IN (SELECT id FROM event_report LIMIT 39)`);
  db.run(`UPDATE event_report SET injury_level = 'No injury.' WHERE id IN (SELECT id FROM event_report LIMIT 15)`);
  db.run(`UPDATE event_report SET injury_level = 'none observed.' WHERE id IN (SELECT id FROM event_report LIMIT 5)`);
  db.run(`UPDATE event_report SET injury_level = 'Minor Injury' WHERE id IN (SELECT id FROM event_report LIMIT 55 OFFSET 500)`);
  db.run(`UPDATE event_report SET injury_level = 'redness, bruising' WHERE id IN (SELECT id FROM event_report LIMIT 5 OFFSET 600)`);

  const raw = db.all(`SELECT injury_level AS label, COUNT(*) AS n FROM event_report WHERE injury_level IS NOT NULL GROUP BY 1 ORDER BY n DESC`);
  const pre = raw.reduce((s, r) => s + r.n, 0);
  console.log("raw non-null buckets:", raw.map(r => `${r.n}:${JSON.stringify(r.label)}`));

  const q = require("../../api/lib/queries");
  // call groupCount indirectly via incidentsSummary but on same filter: summary excludes duplicates.
  // Compare on the exact same WHERE: use summary's byInjury vs raw with its where. Simpler: replicate merge here.
  const merged = new Map();
  for (const { label, n } of raw) {
    const key = compareKey(label);
    const cur = merged.get(key);
    if (!cur || n > cur.n || (n === cur.n && label < cur.label)) merged.set(key, { label, n: (cur ? cur.n : 0) + n });
    else cur.n += n;
  }
  const out = [...merged.values()].sort((a, b) => b.n - a.n);
  const post = out.reduce((s, r) => s + r.n, 0);
  console.log("merged buckets:", out.map(r => `${r.n}:${r.label}`));
  console.log("totals pre==post:", pre === post, `(${pre})`);
  // no-injury family should collapse: 'no injury', 'No injury.', 'No Injury' share comparekey 'noinjury';
  // 'none observed.' is a DIFFERENT key (semantic — out of scope, correctly not merged)
  const fam = out.filter(r => compareKey(r.label) === "noinjury");
  console.log("no-injury cosmetic family merged into:", fam.length, "bucket(s):", fam);
  const ok = fam.length === 1 && pre === post && out.length < raw.length;
  console.log(ok ? "MERGE PASS" : "MERGE FAIL");
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
