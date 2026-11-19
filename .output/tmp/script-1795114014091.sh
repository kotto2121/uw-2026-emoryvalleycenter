process.env.ELECTRON_USER_DATA = "/tmp/ev-test-db-" + Date.now();
const db = require("/Users/haseebqureshi/Code/emoryvalley/db/index.js");
const { createApp } = require("/Users/haseebqureshi/Code/emoryvalley/api/server.js");
const { generateDemoFiles } = require("/Users/haseebqureshi/Code/emoryvalley/api/lib/demo.js");
const ExcelJS = require("/Users/haseebqureshi/Code/emoryvalley/api/node_modules/exceljs");

(async () => {
  await db.getDb();
  const app = createApp({ token: "dev-token" });
  const server = app.listen(0, "127.0.0.1");
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/api`;

  // Build a "doctored" workbook: renamed Date column + brand-new column.
  const { incidents } = await generateDemoFiles({ months: ["2026-01"] });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(incidents[0].buffer);
  const ws = wb.worksheets[0];
  ws.getRow(1).eachCell((cell) => {
    if (String(cell.value).includes("Date Of Event")) cell.value = "Event Day";
  });
  ws.getCell(1, ws.columnCount + 1).value = "Transport Notes";
  for (let r = 2; r <= 6; r++) ws.getCell(r, ws.columnCount + 1).value = "unit " + r;
  const doctored = Buffer.from(await wb.xlsx.writeBuffer());

  const post = (url, body, headers = {}) =>
    fetch(base + url, { method: "POST", headers: { "x-token": "dev-token", ...headers }, body });

  // 1) demo file: clean analyze
  let r = await post("/imports/analyze", incidents[0].buffer);
  let j = await r.json();
  console.log("demo analyze:", r.status, "unknown:", j.unknownHeaders.length, "missingReq:", j.missingRequired?.length);

  // 2) doctored file: analyze shows unknowns with samples
  r = await post("/imports/analyze", doctored);
  j = await r.json();
  console.log("doctored analyze:", r.status, "unknowns:", j.unknownHeaders.map(u => u.header).join(", "), "missingReq:", j.missingRequired);

  // 3) commit with decisions: map Event Day->event_date, new field Transport Notes, ignore nothing
  const decisions = [
    { header: "Event Day", action: "map", field: "event_date", remember: true },
    { header: "Transport Notes", action: "new", field: "transport_notes", remember: true },
  ];
  r = await post(`/imports/${j.uploadId}/commit`, JSON.stringify({ decisions }), { "content-type": "application/json" });
  let k = await r.json();
  console.log("commit:", r.status, "inserted:", k.inserted, "remembered:", k.rememberedMappings, "error:", k.error || "none");

  // 4) double commit must fail cleanly
  r = await post(`/imports/${j.uploadId}/commit`, JSON.stringify({ decisions }), { "content-type": "application/json" });
  console.log("double commit:", r.status, (await r.json()).error?.slice(0, 40));

  // 5) re-upload doctored file: remembered mappings -> no unknowns
  r = await post("/imports/analyze", doctored);
  j = await r.json();
  console.log("re-analyze after remember: unknowns:", j.unknownHeaders.length, "missingReq:", j.missingRequired?.length);

  // 6) extra_fields stored in DB
  const row = db.get("SELECT extra_fields FROM event_report WHERE extra_fields IS NOT NULL LIMIT 1");
  console.log("extra_fields sample:", row?.extra_fields);

  // 7) mapping CRUD
  r = await fetch(base + "/programs/phs_incidents/columns", { headers: { "x-token": "dev-token" } });
  const cols = (await r.json()).columns;
  console.log("CRUD read:", cols.length, "mappings; transport_notes aliases:", cols.filter(c => c.field === "transport_notes").map(c => c.alias));
  r = await fetch(base + "/programs/phs_incidents/columns?alias=Transport%20Notes", { method: "DELETE", headers: { "x-token": "dev-token" } });
  console.log("CRUD delete:", r.status, (await r.json()).deleted);

  server.close();
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
