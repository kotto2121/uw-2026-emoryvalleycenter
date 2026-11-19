process.env.ELECTRON_USER_DATA = "/tmp/ev-test-db-" + Date.now();
const db = require("/Users/haseebqureshi/Code/emoryvalley/db/index.js");
const { readIncidentWorkbook } = require("/Users/haseebqureshi/Code/emoryvalley/api/lib/incidents-xlsx.js");
const { generateDemoFiles } = require("/Users/haseebqureshi/Code/emoryvalley/api/lib/demo.js");
(async () => {
  await db.getDb();
  const files = await generateDemoFiles({ months: 1 });
  const xlsx = files.find(f => /\.xlsx$/i.test(f.name) || f.buffer);
  const inc = files.find(f => /incident/i.test(f.name));
  const buf = (inc || xlsx).buffer;
  // 1) default (backward-compat) path
  const a = await readIncidentWorkbook(buf);
  console.log("default parse:", a.rows.length, "rows; unknown:", a.unknownHeaders.length, "; missingReq:", a.missingRequired.length);
  // 2) DB-mappings path, no hard-fail on required
  const mappings = db.all("SELECT field, alias FROM column_mappings WHERE program='phs_incidents'");
  const b = await readIncidentWorkbook(buf, { mappings, require: false });
  console.log("db-mappings parse:", b.rows.length, "rows; unknown:", b.unknownHeaders.length);
  // 3) custom mapping: rename event_date alias so header becomes unknown
  const custom = mappings.filter(m => m.field !== "event_date").concat([{ field: "member_full_name", alias: "Client Name" }]);
  const c = await readIncidentWorkbook(buf, { mappings: custom, require: false });
  console.log("custom parse unknowns:", c.unknownHeaders.map(u => u.header).join(" | "), "; missingReq:", c.missingRequired);
  console.log("samples:", JSON.stringify(c.unknownHeaders[0]?.samples));
})().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
