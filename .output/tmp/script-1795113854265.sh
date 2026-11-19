process.env.ELECTRON_USER_DATA = "/tmp/ev-test-db-" + Date.now();
const db = require("/Users/haseebqureshi/Code/emoryvalley/db/index.js");
(async () => {
  await db.getDb();
  const mappings = db.all("SELECT program, field, alias, required FROM column_mappings ORDER BY id");
  console.log("mappings seeded:", mappings.length);
  console.log("required fields:", mappings.filter(m => m.required).map(m => m.field).join(", "));
  const cols = db.all("SELECT name FROM pragma_table_info('event_report') WHERE name='extra_fields'");
  console.log("extra_fields column:", cols.length ? "present" : "MISSING");
  // simulate reopen: clear module cache, reload from disk
  delete require.cache[require.resolve("/Users/haseebqureshi/Code/emoryvalley/db/index.js")];
  const db2 = require("/Users/haseebqureshi/Code/emoryvalley/db/index.js");
  await db2.getDb();
  console.log("reinit mapping count (must equal first):", db2.all("SELECT COUNT(*) c FROM column_mappings")[0].c);
})().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
