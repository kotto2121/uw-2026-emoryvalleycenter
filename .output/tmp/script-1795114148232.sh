process.env.ELECTRON_USER_DATA = "/tmp/ev-test-e2e-" + Date.now();
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

  // --- 1. Regression: legacy direct import route still works ---
  const { incidents } = await generateDemoFiles({ months: ["2026-01"] });
  let r = await post("/api/import/incidents".replace("/api", ""), incidents[0].buffer, { "x-filename": "legacy.xlsx" });
  let j = await r.json();
  assert.equal(r.status, 201, "legacy import failed: " + JSON.stringify(j));
  console.log("1. legacy route regression:", r.status, "inserted:", j.inserted);

  // rows must be skipped on re-import (dedup intact)
  r = await post("/import/incidents", incidents[0].buffer, { "x-filename": "legacy.xlsx" });
  j = await r.json();
  assert.equal(j.inserted, 0);
  console.log("2. dedup on re-import: inserted:", j.inserted, "skipped:", j.alreadyImported);

  // --- 3. demo analyze: no unknowns ---
  r = await post("/imports/analyze", incidents[1].buffer);
  j = await r.json();
  assert.equal(j.unknownHeaders.length, 0);
  assert.deepEqual(j.missingRequired, []);
  console.log("3. clean analyze: unknown:0 missingReq:0 rows:", j.rowsRead);

  // --- 4. doctored file: review flow ---
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(incidents[1].buffer);
  const ws = wb.worksheets[0];
  ws.getRow(1).eachCell((cell) => { if (String(cell.value).includes("Member's Full Name")) cell.value = "Client"; });
  const nc = ws.columnCount + 1;
  ws.getCell(1, nc).value = "Follow Up Date";
  for (let i = 2; i <= 4; i++) ws.getCell(i, nc).value = "01/15/2026";
  const doctored = Buffer.from(await wb.xlsx.writeBuffer());

  r = await post("/imports/analyze", doctored);
  j = await r.json();
  assert.equal(j.unknownHeaders.length, 2);
  const samples = j.unknownHeaders.find(u => u.header === "Follow Up Date").samples;
  assert.ok(samples.length > 0);
  console.log("4. doctored analyze: unknowns:", j.unknownHeaders.map(u => u.header).join(", "), "samples:", samples);

  // --- 5. commit with decisions ---
  const decisions = [
    { header: "Client", action: "map", field: "member_full_name", remember: true },
    { header: "Follow Up Date", action: "new", field: "follow_up_date", remember: true },
  ];
  r = await post(`/imports/${j.uploadId}/commit`, JSON.stringify({ decisions }), { "content-type": "application/json" });
  let k = await r.json();
  assert.equal(r.status, 201, "commit failed: " + JSON.stringify(k));
  assert.ok(k.inserted > 0);
  assert.equal(k.rememberedMappings, 2);
  console.log("5. commit:", r.status, "inserted:", k.inserted, "remembered:", k.rememberedMappings);

  // --- 6. extra_fields in DB ---
  const row = db.get("SELECT extra_fields FROM event_report WHERE extra_fields IS NOT NULL LIMIT 1");
  assert.ok(row, "no extra_fields row found");
  const ef = JSON.parse(row.extra_fields);
  assert.equal(ef.follow_up_date, "01/15/2026");
  console.log("6. extra_fields:", row.extra_fields);

  // --- 7. remembered mappings apply on re-upload ---
  r = await post("/imports/analyze", doctored);
  j = await r.json();
  assert.equal(j.unknownHeaders.length, 0, "remembered mapping not applied");
  console.log("7. re-analyze: unknowns:", j.unknownHeaders.length);

  // --- 8. double commit guard ---
  r = await post(`/imports/${j.uploadId}/commit`, JSON.stringify({ decisions }), { "content-type": "application/json" });
  // use a fresh analyze so the uploadId is live, then double-commit it
  r = await post("/imports/analyze", doctored);
  j = await r.json();
  await post(`/imports/${j.uploadId}/commit`, JSON.stringify({ decisions: [] }), { "content-type": "application/json" });
  r = await post(`/imports/${j.uploadId}/commit`, JSON.stringify({ decisions: [] }), { "content-type": "application/json" });
  assert.equal(r.status, 410);
  console.log("8. double-commit guard:", r.status);

  // --- 9. mapping CRUD round-trip ---
  r = await fetch(base + "/programs/phs_incidents/columns", { headers: H });
  let cols = (await r.json()).columns;
  assert.ok(cols.some(c => c.field === "follow_up_date" && c.alias === "followupdate"));
  r = await fetch(base + "/programs/phs_incidents/columns", { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ field: "event_location", alias: "Where It Happened", required: false }) });
  assert.equal(r.status, 201);
  r = await fetch(base + "/programs/phs_incidents/columns?alias=Where%20It%20Happened", { method: "DELETE", headers: H });
  const del = await r.json();
  assert.equal(del.deleted, 1);
  console.log("9. CRUD round-trip: add+delete ok, total mappings:", cols.length + 1);

  // --- 10. required-missing commit returns 422 with actionable message ---
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(incidents[1].buffer);
  const ws2 = wb2.worksheets[0];
  ws2.getRow(1).eachCell((cell) => { if (String(cell.value).includes("Date Of Event")) cell.value = "Ignored Col"; });
  const noDate = Buffer.from(await wb2.xlsx.writeBuffer());
  r = await post("/imports/analyze", noDate);
  j = await r.json();
  assert.equal(j.missingRequired.includes("event_date"), true);
  r = await post(`/imports/${j.uploadId}/commit`, JSON.stringify({ decisions: [{ header: "Ignored Col", action: "ignore" }] }), { "content-type": "application/json" });
  assert.equal(r.status, 422);
  const err = await r.json();
  assert.ok(err.error.includes("event_date"));
  console.log("10. required-missing commit:", r.status, err.error.slice(0, 60));

  server.close();
  console.log("\nALL E2E CHECKS PASSED");
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
