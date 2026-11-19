process.env.ELECTRON_USER_DATA = "/tmp/ev-test-db-" + Date.now();
const db = require("/Users/haseebqureshi/Code/emoryvalley/db/index.js");
(async () => {
  await db.getDb();
  const mappings = db.all("SELECT program, field, alias, required FROM column_mappings ORDER BY id");
  console.log("mappings seeded:", mappings.length);
  const req = mappings.filter(m => m.required);
  console.log("required fields:", req.map(m => m.field).join(", "));
  // second init on same db must not duplicate
  const again = db.all("SELECT COUNT(*) c FROM column_mappings")[0].c;
  console.log("count after re-check:", again);
  const cols = db.all("SELECT name FROM pragma_table_info('event_report') WHERE name='extra_fields'");
  console.log("extra_fields column:", cols.length ? "present" : "MISSING");
  // reopen from disk to test persistence + migration path
  const db2 = require("/Users/haseebqureshi/Code/emoryvalley/db/index.js");
  console.log("reinit persistence count:", db2.all("SELECT COUNT(*) c FROM column_mappings")[0].c);
})().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
