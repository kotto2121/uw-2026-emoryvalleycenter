#!/usr/bin/env node
/**
 * Write the fictitious demo files to ./demo-data so they can be dragged into
 * the Import Center (exercises the real import + name-matching flow).
 *
 *   npm run demo:files
 *
 * Every name and site in these files is invented. See api/lib/demo.js.
 */
const fs = require("fs");
const path = require("path");
const { generateDemoFiles } = require("../api/lib/demo");

(async () => {
  const out = path.join(__dirname, "..", "demo-data");
  fs.mkdirSync(out, { recursive: true });
  const { incidents, rosters } = await generateDemoFiles();
  for (const f of [...incidents, ...rosters]) {
    fs.writeFileSync(path.join(out, f.filename), f.buffer);
    console.log("wrote", path.join("demo-data", f.filename));
  }
})();
