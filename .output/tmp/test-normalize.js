const { normalizeValue, isSentinel, compareKey } = require("../../db/normalize");

const cases = ["NA", "n/a", "N/A", " None ", "-", "", null, "N/A ", " n.a. ", "--", "?", "N/A\u00a0"];
let failed = 0;
for (const c of cases) {
  const out = normalizeValue(c);
  const ok = out === null;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${JSON.stringify(c)} -> ${JSON.stringify(out)}`);
}

const kept = [
  ["Jane Doe", "Jane Doe"],
  ["  Major  Injury  ", "Major Injury"],
  [123, 123],
  [new Date(Date.UTC(2026, 0, 2)), new Date(Date.UTC(2026, 0, 2))],
];
for (const [input, expected] of kept) {
  const out = normalizeValue(input);
  const ok = String(out) === String(expected);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${JSON.stringify(input)} -> ${JSON.stringify(out)} (expected ${JSON.stringify(expected)})`);
}

// keepSentinels opt-out
const opt = normalizeValue("N/A", { keepSentinels: true });
const optOk = opt === "N/A";
if (!optOk) failed++;
console.log(`${optOk ? "PASS" : "FAIL"} keepSentinels opt-out -> ${JSON.stringify(opt)}`);

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
