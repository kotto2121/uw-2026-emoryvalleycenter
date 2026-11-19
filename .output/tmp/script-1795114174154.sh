process.env.ELECTRON_USER_DATA = "/tmp/ev-test-e2e3-" + Date.now();
const db = require("/Users/haseebqureshi/Code/emoryvalley/db/index.js");
const { createApp } = require("/Users/haseebqureshi/Code/emoryvalley/api/server.js");
(async () => {
  await db.getDb();
  const app = createApp({ token: "dev-token" });
  const server = await new Promise((res) => { const s = app.listen(0, "127.0.0.1", () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const H = { "x-evc-token": "dev-token" };
  // add
  let r = await fetch(base + "/programs/phs_incidents/columns", { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ field: "event_location", alias: "Where It Happened" }) });
  console.log("add:", r.status);
  // what's in the table?
  const rows = db.all("SELECT field, alias FROM column_mappings WHERE field='event_location'");
  console.log("event_location rows:", rows);
  // delete with the raw alias
  r = await fetch(base + "/programs/phs_incidents/columns?alias=" + encodeURIComponent("Where It Happened"), { method: "DELETE", headers: H });
  console.log("delete:", r.status, await r.json());
  server.close();
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
