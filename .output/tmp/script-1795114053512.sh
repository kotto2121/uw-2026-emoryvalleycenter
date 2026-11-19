process.env.ELECTRON_USER_DATA = "/tmp/ev-test-db-" + Date.now();
const db = require("/Users/haseebqureshi/Code/emoryvalley/db/index.js");
const { createApp } = require("/Users/haseebqureshi/Code/emoryvalley/api/server.js");
const { generateDemoFiles } = require("/Users/haseebqureshi/Code/emoryvalley/api/lib/demo.js");
const ExcelJS = require("exceljs");

(async () => {
  await db.getDb();
  const app = createApp({ token: "dev-token" });
  const server = await new Promise((res) => {
    const s = app.listen(0, "127.0.0.1", () => res(s));
  });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/api`;
  const H = { "x-evc-token": "dev-token" };

  const { incidents } = await generateDemoFiles({ months: ["2026-01"] });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(incidents[0].buffer);
  const ws = wb.worksheets[0];
  ws.getRow(1).eachCell((cell) => {
    if (String(cell.value).includes("Date Of Event")) cell.value = "Event Day";
  });
  const newCol = ws.columnCount + 1;
  ws.getCell(1, newCol).value = "Transport Notes";
  for (let r = 2; r <= 6; r++) ws.getCell(r, newCol).value = "unit " + r;
  const doctored = Buffer.from(await wb.xlsx.writeBuffer());

  const post = (url, body, headers = {}) =>
    fetch(base + url, { method: "POST", headers: { ...H, ...headers }, body });

  let r = await post("/imports/analyze", incidents[0].buffer);
  let j = await r.json();
  console.log("demo analyze:", r.status, "unknown:", j.unknownHeaders.length, "missingReq:", j.missingRequired?.length);

  r = await post("/imports/analyze", doctored);
  j = await r.json();
  console.log("doctored analyze:", r.status, "unknowns:", j.unknownHeaders.map(u => u.header).join(", "), "missingReq:", j.missingRequired);

  const decisions = [
    { header: "Event Day", action: "map", field: "event_date", remember: true },
    { header: "Transport Notes", action: "new", field: "transport_notes", remember: true },
  ];
  r = await post(`/imports/${j.uploadId}/commit`, JSON.stringify({ decisions }), { "content-type": "application/json" });
  let k = await r.json();
  console.log("commit:", r.status, "inserted:", k.inserted, "remembered:", k.rememberedMappings, "error:", k.error || "none");

  r = await post(`/imports/${j.uploadId}/commit`, JSON.stringify({ decisions }), { "content-type": "application/json" });
  console.log("double commit:", r.status, (await r.json()).error?.slice(0, 60));

  r = await post("/imports/analyze", doctored);
  j = await r.json();
  console.log("re-analyze after remember: unknowns:", j.unknownHeaders.length, "missingReq:", j.missingRequired?.length);

  const row = db.get("SELECT extra_fields FROM event_report WHERE extra_fields IS NOT NULL LIMIT 1");
  console.log("extra_fields sample:", row?.extra_fields);

  r = await fetch(base + "/programs/phs_incidents/columns", { headers: H });
  const cols = (await r.json()).columns;
  console.log("CRUD read:", cols.length, "mappings; transport_notes aliases:", cols.filter(c => c.field === "transport_notes").map(c => c.alias));
  r = await fetch(base + "/programs/phs_incidents/columns?alias=Transport%20Notes", { method: "DELETE", headers: H });
  console.log("CRUD delete:", r.status, (await r.json()).deleted);

  server.close();
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
