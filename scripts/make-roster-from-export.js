#!/usr/bin/env node
/**
 * Generate a FAKE behavioral-health roster (.docx, EVC's real layout) whose
 * clients come from a DE-IDENTIFIED PHS event export — so the two files can be
 * imported together and the person matching can be tested end to end.
 *
 *   node scripts/make-roster-from-export.js <export.xlsx> --month 2026-03 [--months 2] [--out dir]
 *
 * - Uses the export's own member tokens (e.g. "Person 123") for ~45 clients, so
 *   they match the event records exactly, plus ~58 roster-only tokens with no
 *   events (EVC's real overlap is ~40%: 41 of 103 roster clients had events).
 * - Sites are generic ("Demo Site 07"); real site labels are NOT copied.
 * - --months N writes N consecutive monthly rosters ending at --month, with a
 *   little churn, so "new vs. last month" and trends can be tested.
 *
 * ⚠ Only run this on an export whose names are already removed/tokenised: the
 * client names in the output are taken from the export.
 */
const fs = require("fs");
const path = require("path");
const { readIncidentWorkbook } = require("../api/lib/incidents-xlsx");
const { rosterDocx, rng, PSR_STAFF, OP_STAFF, FREQS } = require("../api/lib/demo");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

(async () => {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) {
    console.error("usage: node scripts/make-roster-from-export.js <export.xlsx> --month YYYY-MM [--months N] [--out dir]");
    process.exit(1);
  }
  const { rows, sheet } = await readIncidentWorkbook(fs.readFileSync(file));
  const allMonths = [...new Set(rows.map((r) => r.event_date && r.event_date.slice(0, 7)).filter(Boolean))].sort();
  const endMonth = arg("month", allMonths[allMonths.length - 1]);
  const nMonths = Number(arg("months", "1"));
  const outDir = arg("out", path.join(__dirname, "..", "demo-data", "from-export"));
  fs.mkdirSync(outDir, { recursive: true });

  // Refuse obviously identifiable names.
  const names = [...new Set(rows.map((r) => r.member_full_name).filter(Boolean))];
  const tokenLike = names.filter((n) => /\d/.test(n)).length;
  if (tokenLike < names.length * 0.9) {
    console.error(`Refusing: only ${tokenLike} of ${names.length} member names look like de-identified tokens (e.g. "Person 123").`);
    process.exit(2);
  }

  const r = rng(20260319);
  const pick = (arr) => arr.splice(Math.floor(r() * arr.length), 1)[0];

  // People with events, most active first (they're likelier BH clients), then shuffled picks.
  const activity = new Map();
  for (const row of rows) if (row.member_full_name) activity.set(row.member_full_name, (activity.get(row.member_full_name) || 0) + 1);
  const pool = [...activity.keys()];
  const fromExport = [];
  while (fromExport.length < Math.min(45, pool.length)) fromExport.push(pick(pool));

  // Roster-only clients: new tokens in the same format, numbered after the highest seen.
  const sample = names[0];
  const prefix = sample.replace(/\d+\s*$/, "").trim() || "Person";
  const width = (sample.match(/(\d+)\s*$/) || ["", "000"])[1].length;
  let next = Math.max(...names.map((n) => Number((n.match(/(\d+)\s*$/) || [0, 0])[1]))) + 1;
  const token = () => `${prefix} ${String(next++).padStart(width, "0")}`;
  const rosterOnly = Array.from({ length: 58 }, token);

  const clients = [...fromExport, ...rosterOnly].map((name, i) => ({
    name,
    site: `Demo Site ${String(1 + (i % 12)).padStart(2, "0")}`,
    freq: FREQS[i % FREQS.length],
    // ~12 people in both services, PSR-heavy like the real roster.
    service: i % 8 === 0 ? "both" : i % 3 === 0 ? "OP" : "PSR",
    inExport: i < fromExport.length,
  }));

  const [ey, em] = endMonth.split("-").map(Number);
  const monthsOut = Array.from({ length: nMonths }, (_, k) => {
    const d = new Date(Date.UTC(ey, em - 1 - (nMonths - 1 - k), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });

  let active = clients.slice(0, clients.length - nMonths * 3); // later months add a few new clients
  for (const [k, month] of monthsOut.entries()) {
    if (k > 0) {
      active = active.filter((_, i) => (i + k) % 29 !== 0); // a few discharges
      active.push(...clients.slice(clients.length - nMonths * 3 + (k - 1) * 3, clients.length - nMonths * 3 + k * 3)); // a few admissions
    }
    const roster = { PSR: [], OP: [], oneToOne: [], additional: [] };
    active.forEach((c, i) => {
      if (c.service !== "OP") roster.PSR.push({ ...c, staff: PSR_STAFF[i % PSR_STAFF.length] });
      if (c.service !== "PSR") roster.OP.push({ ...c, staff: OP_STAFF[Math.floor(i / 3) % OP_STAFF.length] });
    });
    for (let j = 0; j + 1 < Math.min(6, roster.PSR.length); j += 2) roster.oneToOne.push([roster.PSR[j], roster.PSR[j + 1]]);
    roster.additional = roster.OP.slice(0, 10).map((e, j) => ({ ...e, name: j % 5 === 4 ? `${e.name} - DEMO STATUS` : e.name }));

    const buf = await rosterDocx(roster, month);
    const out = path.join(outDir, `DEMO BH Roster ${month} (from export).docx`);
    fs.writeFileSync(out, buf);
    const inExport = active.filter((c) => c.inExport).length;
    console.log(`wrote ${out}\n  ${active.length} clients (${inExport} also in the export's event records, ${active.length - inExport} roster-only) · PSR ${roster.PSR.length} · OP ${roster.OP.length}`);
  }
  console.log(`source sheet: "${sheet}", export months ${allMonths[0]} … ${allMonths[allMonths.length - 1]}`);
})();
