process.env.ELECTRON_USER_DATA = "/tmp/ev-test-db2-" + Date.now();
const db = require("/Users/haseebqureshi/Code/emoryvalley/db/index.js");
const { createApp } = require("/Users/haseebqureshi/Code/emoryvalley/api/server.js");
(async () => {
  await db.getDb();
  const app = createApp({ token: "dev-token" });
  const server = await new Promise((res) => { const s = app.listen(0, "127.0.0.1", () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const H = { "x-evc-token": "dev-token" };
  let r = await fetch(base + "/programs/phs_incidents/columns?alias=Site%2FHome", { method: "DELETE", headers: H });
  const j = await r.json();
  console.log("delete Site/Home aliases:", r.status, j.deleted);
  r = await fetch(base + "/programs/phs_incidents/columns", { headers: H });
  const cols = (await r.json()).columns;
  console.log("remaining site_home aliases:", cols.filter(c => c.field === "site_home").length);
  // re-add it to restore
  r = await fetch(base + "/programs/phs_incidents/columns", { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ field: "site_home", alias: "Site/Home" }) });
  console.log("re-add:", r.status);
  server.close();
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
