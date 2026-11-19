process.env.ELECTRON_USER_DATA = "/tmp/ev-test-e2e6-" + Date.now();
const db = require("/Users/haseebqureshi/Code/emoryvalley/db/index.js");
const { createApp } = require("/Users/haseebqureshi/Code/emoryvalley/api/server.js");
const { generateDemoFiles } = require("/Users/haseebqureshi/Code/emoryvalley/api/lib/demo.js");
const ExcelJS = require("exceljs");
const assert = require("assert");

(async () => {
  await db.getDb();
  const app = createApp({ token: "dev-token" });
  const server = await new Promise((res) => { const s = app.listen(0, "127.0.0.1", () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const H = { "x-evc-token": "dev-token" };
  const post = (url, body, headers = {}) => fetch(base + url, { method: "POST", headers: { ...H, ...headers }, body });

  const { incidents } = await generateDemoFiles({ months: ["2026-01"] });
  const demo = incidents[0].buffer;

  let r = await post("/imports/analyze", demo);
  let j = await r.json();
  assert.equal(j.unknownHeaders.length, 0);
  assert.deepEqual(j.missingRequired, []);
  console.log("1. clean analyze: rows:", j.rowsRead);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(demo);
  const ws = wb.worksheets[0];
  ws.getRow(1).eachCell((cell) => { if (String(cell.value).includes("Member's Full Name")) cell.value = "Client"; });
  const nc = ws.columnCount + 1;
  ws.getCell(1, nc).value = "Follow Up Date";
  for (let i = 2; i <= 4; i++) ws.getCell(i, nc).value = "01/15/2026";
  const doctored = Buffer.from(await wb.xlsx.writeBuffer());

  r = await post("/imports/analyze", doctored);
  j = await r.json();
  assert.equal(j.unknownHeaders.length, 2);
  console.log("2. doctored analyze: unknowns:", j.unknownHeaders.map(u => u.header).join(", "));

  const decisions = [
    { header: "Client", action: "map", field: "member_full_name", remember: true },
    { header: "Follow Up Date", action: "new", field: "follow_up_date", remember: true },
  ];
  r = await post(`/imports/${j.uploadId}/commit`, JSON.stringify({ decisions }), { "content-type": "application/json" });
  let k = await r.json();
  assert.equal(r.status, 201);
  assert.equal(k.rememberedMappings, 2);
  console.log("3. commit:", r.status, "inserted:", k.inserted, "remembered:", k.rememberedMappings);

  const row = db.get("SELECT extra_fields FROM event_report WHERE extra_fields IS NOT NULL LIMIT 1");
  assert.equal(JSON.parse(row.extra_fields).follow_up_date, "01/15/2026");
  console.log("4. extra_fields:", row.extra_fields);

  r = await post("/imports/analyze", doctored);
  j = await r.json();
  assert.equal(j.unknownHeaders.length, 0);
  console.log("5. re-analyze after remember: unknowns: 0");

  await post(`/imports/${j.uploadId}/commit`, JSON.stringify({ decisions: [] }), { "content-type": "application/json" });
  r = await post(`/imports/${j.uploadId}/commit`, JSON.stringify({ decisions: [] }), { "content-type": "application/json" });
  assert.equal(r.status, 410);
  console.log("6. double-commit guard: 410");

  r = await fetch(base + "/programs/phs_incidents/columns", { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ field: "event_location", alias: "Where It Happened" }) });
  assert.equal(r.status, 201);
  r = await fetch(base + "/programs/phs_incidents/columns?alias=" + encodeURIComponent("Where It Happened"), { method: "DELETE", headers: H });
  assert.equal((await r.json()).deleted, 1);
  console.log("7. CRUD round-trip with spaced alias: ok");

  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(demo);
  const ws2 = wb2.worksheets[0];
  ws2.getRow(1).eachCell((cell) => { if (String(cell.value).includes("Date Of Event")) cell.value = "Ignored Col"; });
  r = await post("/imports/analyze", Buffer.from(await wb2.xlsx.writeBuffer()));
  j = await r.json();
  assert.ok(j.missingRequired.includes("event_date"));
  r = await post(`/imports/${j.uploadId}/commit`, JSON.stringify({ decisions: [{ header: "Ignored Col", action: "ignore" }] }), { "content-type": "application/json" });
  assert.equal(r.status, 422, "expected 422, got " + r.status);
  const err = await r.json();
  assert.ok(err.error.includes("event_date"));
  console.log("8. required-missing commit: 422,", err.error.slice(0, 55));

  server.close();
  console.log("\nALL E2E CHECKS PASSED");
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
