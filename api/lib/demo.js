/**
 * api/lib/demo.js — FAKE data that statistically mirrors the real PHS export.
 *
 * Every name, site and narrative here is invented. Distributions follow the
 * deidentified profile of "New Reportable Event Report (14).xlsx" (351 rows /
 * month, ~30 distinct dates, 46 sites, ~83 people, 8.8% reportable, the
 * observed location / observation / injury-level mixes, ~5% exact duplicate
 * rows, concatenated multi-select fields with no delimiter).
 *
 * Category labels and their relative frequencies follow the aggregate counts
 * ChatGPT extracted from EVC's real 6-month export (docs/chatgpt-outputs/
 * Prompt_C_event_option_labels.json). PHS writes names "Last, First".
 *
 * It also produces the monthly behavioral-health roster .docx in EVC's REAL
 * layout (docs/chatgpt-outputs/Prompt_A_document_structure.json): staff
 * headings with "Total: N (service)", header-less [site | frequency | name]
 * tables with schedule rows mixed in, a 1:1 table and an "Additional
 * Caseload" table. Names there are "First Last", with a few nicknames/typos so
 * the Review Queue has realistic work.
 *
 * Output is deterministic (seeded PRNG) so every teammate sees the same demo.
 */
const ExcelJS = require("exceljs");
const JSZip = require("jszip");

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["James","Mary","Robert","Patricia","Michael","Jennifer","William","Linda","David","Elizabeth","Richard","Barbara","Joseph","Susan","Thomas","Jessica","Charles","Sarah","Christopher","Karen","Daniel","Nancy","Matthew","Lisa","Anthony","Betty","Mark","Margaret","Donald","Sandra","Steven","Ashley","Paul","Kimberly","Andrew","Emily","Joshua","Donna","Kenneth","Michelle","Kevin","Carol","Brian","Amanda","George","Melissa","Timothy","Deborah","Ronald","Stephanie","Jason","Rebecca","Edward","Laura","Jeffrey","Cynthia","Ryan","Amy","Jacob","Angela","Gary","Shirley","Nicholas","Anna","Eric","Brenda","Jonathan","Pamela","Larry","Katherine","Justin","Christine","Scott","Debra","Samuel","Rachel"];
const LAST = ["Abernathy","Bellweather","Calloway","Dunsmore","Ellsworth","Fairbanks","Galloway","Hargrove","Ingersoll","Jessup","Kettering","Lockhart","Merriweather","Northcutt","Oakley","Pendleton","Quarles","Rutherford","Stallworth","Thornbury","Underhill","Vandergriff","Whitlock","Yarbrough","Ashcroft","Blevins","Crumley","Darnell","Eckhart","Fortner","Gentry","Hollifield","Isbell","Jernigan","Kincaid","Ledford","McCurry","Neeley","Overholt","Pickering","Rountree","Sizemore","Tipton","Upchurch","Varnell","Wofford","Brannon","Cantrell","Dossett","Elrod","Fritts","Goins","Huskey","Inman","Justus","Kyker","Lowery","Mullins","Nidiffer","Ogle"];
const NICK = { Robert: "Bobby", William: "Bill", Richard: "Rick", James: "Jim", Michael: "Mike", Christopher: "Chris", Thomas: "Tom", Charles: "Charlie", Daniel: "Danny", Matthew: "Matt", Anthony: "Tony", Elizabeth: "Liz", Katherine: "Kathy", Jennifer: "Jenny", Rebecca: "Becky", Kimberly: "Kim", Joshua: "Josh", Jacob: "Jake", Samuel: "Sam", Steven: "Steve", Timothy: "Tim", Kenneth: "Kenny", Ronald: "Ron", Jeffrey: "Jeff", Edward: "Ed", Margaret: "Peggy", Patricia: "Patty", Susan: "Sue", Deborah: "Debbie", Pamela: "Pam", Nicholas: "Nick", Jonathan: "Jon", Larry: "Lawrence" };
const SITE_WORDS = ["Maple","Willow","Cedar","Dogwood","Hickory","Magnolia","Laurel","Sycamore","Aspen","Birch","Chestnut","Juniper","Poplar","Redbud","Sassafras","Walnut","Hemlock","Linden","Mulberry","Spruce","Tupelo","Buckeye","Holly"];
const SITE_KINDS = ["House","Cottage","Residence","Place"];

// Real labels; weights = counts in EVC's 6-month export (aggregate only).
const OBSERVATION = [
  ["Witnessed by Provider Staff", 1481], ["Discovered by Provider Staff", 263], ["Discovered by Other", 100],
  ["Witnessed by DIDD/TennCare Staff", 54], ["Witnessed by Other", 35], ["Witnessed by Therapy Personnel", 32],
  ["Witnessed by Person Supported/Other Persons Supported", 21], ["Discovered by Person Supported/Other Persons Supported", 21],
  ["Witnessed by Other Service Provider", 12], ["Discovered by DIDD/TennCare Staff", 6], ["Witnessed by Private Citizen", 5],
  ["Witnessed by Medical Personnel", 4], ["Discovered by Other Service Provider", 4], ["Discovered by Therapy Personnel", 3],
  ["Discovered by Medical Personnel", 2], ["Discovered by Law Enforcement", 1], ["Witnessed by APS/DCS", 1], ["Discovered by Private Citizen", 1],
];
const LOCATION = [
  ["Home - Inside", 1752], ["Community - Supervised", 150], ["Home - Outside", 77], ["Community - Unsupervised", 74],
  ["Vehicle", 27], ["Day Program / Work / School", 27], ["Unknown", 6],
];
const INJURY = [["No Injury", 1594], ["Minor Injury", 596], ["Serious Injury", 13]];
const OTHER_CATEGORIES = [
  ["Other - self injurious behaviors; disruptive behaviors", 165], ["Falls with injury", 13],
  ["Minor – Vehicle accident while transporting person", 10], ["Other - Aggression", 9], ["Other - medical", 5],
];
// Real exports put free-text narratives in "Other Event Types" (441 of 643 rows). Fake ones:
const NARRATIVES = [
  "Other - DEMO: person supported refused evening medication; staff re-offered per plan and notified nurse.",
  "Other - DEMO: verbal disagreement with housemate at dinner; staff redirected and both calmed within 10 minutes.",
  "Other - DEMO: person supported left the table abruptly and slammed a door, damaging property (door frame); no injuries.",
  "Other - DEMO: minor property damage — broke a lamp while upset; staff used de-escalation techniques.",
  "Other - DEMO: person supported reported stomach pain; staff contacted on-call nurse and monitored.",
  "Other - DEMO: medication administered 40 minutes late due to pharmacy delivery delay.",
  "Other - DEMO: attempted to leave the home without staff; returned with staff prompting after 5 minutes.",
  "Other - DEMO: hit own head with open hand twice; staff blocked and redirected, no visible injury.",
];
const INJURY_TEXT = [
  "DEMO: small abrasion to left knee, first aid applied.", "DEMO: bruise noted on right forearm.", "DEMO: redness to hand after striking table.",
  "DEMO: scratch on cheek, cleaned and monitored.", "DEMO: complained of ankle pain, ice applied.",
  "DEMO: bump on forehead, neuro checks completed.", "DEMO: skin tear on elbow, bandaged.",
];
// Multi-select combos, written the way PHS exports them (labels glued, no delimiter).
const INTERVENTION_COMBOS = [
  [["Emergency Room Visit"], 24], [["911 Call", "EMT", "Emergency Room Visit"], 15], [["Urgent Care Facility"], 8],
  [["911 Call"], 5], [["911 Call", "EMT"], 5], [["911 Call", "Police"], 5], [["Emergency Room Visit", "X-ray (to rule out fracture)"], 3],
  [["911 Call", "Police", "Mobile Crisis Services"], 3], [["Police"], 2], [["Urgent Care Facility", "Emergency Room Visit"], 2],
  [["Mobile Crisis Services"], 1], [["911 Call", "Fire Department", "EMT"], 1], [["Abdominal Thrust/Back Blows/Heimlich Maneuver"], 1],
  [["Administration of PRN Psychotropic Medication", "Mobile Crisis Services"], 1],
];
const BEHAVIORAL_COMBOS = [
  [["Behavioral Crisis requiring crisis intervention"], 7], [["Physical Aggression", "Staff"], 3], [["Physical Aggression", "Housemate"], 2],
  [["Behavioral Crisis requiring crisis intervention", "Engagement with Law Enforcement"], 4],
  [["Reportable Behavior involving physical aggression and/or self-injurious behavior resulting in injury to another person", "Staff"], 4],
  [["Behavioral Crisis requiring crisis intervention", "Psychiatric Admission (for observation) including in an acute care hospital"], 2],
  [["Suicide Attempt", "Behavioral Crisis requiring crisis intervention"], 2], [["Self-Injurious Behavior"], 1], [["Engagement with Law Enforcement"], 1],
];
const TIER1 = [["Alleged Physical Abuse", 2], ["Death-Unexpected and/or Unexplained", 2], ["Alleged Emotional/Psychological Abuse", 1], ["Alleged Sexual Abuse", 1], ["Alleged Neglect", 1]];
const TIER2 = [["Alleged Neglect", 12], ["Alleged Emotional/Psychological Abuse", 3], ["Alleged Physical Abuse", 1]];
const TOTAL_ROWS = 2500; // rows in the real 6-month export

function weighted(r, table) {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of table) if ((x -= w) < 0) return v;
  return table[table.length - 1][0];
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const pad = (n) => String(n).padStart(2, "0");

/** The last `count` complete months before `today`, oldest first: ['2026-05', ...]. */
function demoMonths(count = 6, today = new Date()) {
  const out = [];
  for (let i = count; i >= 1; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  }
  return out;
}

function buildPopulation(r) {
  const used = new Set();
  const people = [];
  while (people.length < 120) {
    const first = pick(r, FIRST);
    const last = pick(r, LAST);
    if (used.has(`${first} ${last}`)) continue;
    used.add(`${first} ${last}`);
    const middle = String.fromCharCode(65 + Math.floor(r() * 26));
    people.push({ first, last, middle, weight: Math.pow(r(), 2.2) * 10 + 0.3 });
  }
  const sites = [];
  const usedSites = new Set();
  while (sites.length < 46) {
    const s = `${pick(r, SITE_WORDS)} ${pick(r, SITE_KINDS)}`;
    if (!usedSites.has(s)) {
      usedSites.add(s);
      sites.push(s);
    }
  }
  people.forEach((p, i) => (p.site = sites[i % sites.length]));
  // Some people are written inconsistently somewhere: these create review items.
  people.forEach((p, i) => {
    if (i % 11 === 3 && NICK[p.first]) p.variant = `${NICK[p.first]} ${p.last}`;
    else if (i % 13 === 5) p.variant = `${p.first} ${p.last.slice(0, -2)}${p.last.slice(-1)}${p.last.slice(-2, -1)}`; // transposed letters
  });
  // ~60 people receive behavioral health services.
  people.forEach((p, i) => {
    p.bh = i % 2 === 0 ? (i % 6 === 0 ? "both" : i % 4 === 0 ? "PSR" : "OP") : null;
  });
  return { people, sites };
}

function incidentRowsForMonth(r, population, month, monthIndex) {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const n = Math.round((TOTAL_ROWS / 6) * (0.9 + monthIndex * 0.035) + (r() - 0.5) * 40);
  // ~83–100 people appear in a typical month: restrict to a monthly active subset.
  const active = population.people.filter(() => r() < 0.75);
  const activeW = active.reduce((s, p) => s + p.weight, 0);
  const rate = (count) => count / TOTAL_ROWS;
  const rows = [];
  for (let i = 0; i < n; i++) {
    let x = r() * activeW;
    let person = active[0];
    for (const p of active) if ((x -= p.weight) < 0) { person = p; break; }
    const day = 1 + Math.floor(r() * daysInMonth);
    // PHS writes "Last, First" (100% in the real export).
    let name = `${person.last}, ${person.first}`;
    const v = r();
    if (person.variant && v < 0.25) {
      const parts = person.variant.split(" ");
      name = `${parts.slice(1).join(" ")}, ${parts[0]}`;
    } else if (v < 0.05) name = `${person.last}, ${person.first} ${person.middle}.`;

    const other = r() < rate(643) ? (r() < 202 / 643 ? weighted(r, OTHER_CATEGORIES) : pick(r, NARRATIVES)) : "";
    const level = r() < 2203 / TOTAL_ROWS ? weighted(r, INJURY) : "";
    const row = {
      "Date Of Event": `${pad(m)}/${pad(day)}/${y}`,
      "Member's Full Name": name,
      "Tier 1 Events": r() < rate(7) ? weighted(r, TIER1) : "",
      "Tier 2 Events": r() < rate(16) ? weighted(r, TIER2) : "",
      "Behavioral/Psychiatric Events": r() < rate(30) ? weighted(r, BEHAVIORAL_COMBOS).join("") : "",
      "Medical Events": "",
      "Other Event Types": other,
      "Non Reportable": r() < rate(108) ? "Reportable" : "Non-Reportable",
      "This incident was / By": r() < 0.803 ? weighted(r, OBSERVATION) : "",
      "Event Location": r() < 0.843 ? weighted(r, LOCATION) : "",
      "Event Interventions": r() < rate(90) ? weighted(r, INTERVENTION_COMBOS).join("") : "",
      "Site/Home": r() < 0.85 ? person.site : pick(r, population.sites),
      "Injury Description": "",
      "Level of Injury": level,
    };
    if (level && level !== "No Injury") row["Injury Description"] = pick(r, INJURY_TEXT);
    rows.push(row);
  }
  // ~5.4% exact duplicate rows, as in the real export.
  const dupes = Math.round(n * 0.054);
  for (let i = 0; i < dupes; i++) rows.push({ ...rows[Math.floor(r() * rows.length)] });
  rows.sort((a, b) => a["Date Of Event"].localeCompare(b["Date Of Event"]));
  return rows;
}

async function incidentWorkbook(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  const headers = Object.keys(rows[0]);
  ws.addRow(headers);
  for (const row of rows) ws.addRow(headers.map((h) => row[h]));
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c) => (c.width = 22));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---- minimal .docx writer ---------------------------------------------------

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const para = (text, { bold = false, size = 22 } = {}) =>
  `<w:p><w:r><w:rPr>${bold ? "<w:b/>" : ""}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
const cell = (text, bold) =>
  `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${para(text, { bold })}</w:tc>`;
function table(header, rows) {
  const border = '<w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/>';
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${border}</w:tblBorders></w:tblPr>` +
    `<w:tr>${header.map((h) => cell(h, true)).join("")}</w:tr>` +
    rows.map((r) => `<w:tr>${r.map((c) => cell(c, false)).join("")}</w:tr>`).join("") +
    "</w:tbl>";
}

async function makeDocx(bodyXml) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}<w:sectPr/></w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

const PSR_STAFF = ["Demo Clinician A", "Demo Clinician B", "Demo Clinician C"];
const OP_STAFF = ["Demo Therapist D", "Demo Therapist E"];
const FREQS = ["Weekly", "Bi-weekly", "1M", "2x weekly"];
const SCHEDULES = ["Mon, Wed, Fri (9:00AM-11:00AM)", "Tue, Thu (1:00PM-3:00PM)"];

/** Who is on which caseload this month (churn grows the roster over time). */
function rosterForMonth(r, population, month, monthIndex) {
  const roster = { PSR: [], OP: [], oneToOne: [], additional: [] };
  population.people.forEach((p, i) => {
    if (!p.bh) return;
    if (r() < 0.1 - monthIndex * 0.005) return; // a little churn month to month
    // The roster writes "First Last"; some people are written with a nickname / typo.
    let name = `${p.first} ${p.last}`;
    if (p.variant && i % 2 === 0) name = p.variant;
    else if (i % 10 === 4) name = `${p.first} ${p.middle}. ${p.last}`;
    const entry = { name, site: p.site, freq: FREQS[i % FREQS.length] };
    if (p.bh === "PSR" || p.bh === "both") roster.PSR.push({ ...entry, staff: PSR_STAFF[i % PSR_STAFF.length] });
    if (p.bh === "OP" || p.bh === "both") roster.OP.push({ ...entry, staff: OP_STAFF[Math.floor(i / 2) % OP_STAFF.length] });
  });
  // New enrollees over time so the trend moves.
  for (let k = 0; k < monthIndex; k++) {
    const p = population.people[(k * 7 + 1) % population.people.length];
    if (!p.bh) roster.OP.push({ name: `${p.first} ${p.last}`, site: p.site, freq: "Weekly", staff: OP_STAFF[k % 2] });
  }
  // 1:1 PSR sessions: pairs of existing PSR clients.
  for (let k = 0; k + 1 < Math.min(6, roster.PSR.length); k += 2) roster.oneToOne.push([roster.PSR[k], roster.PSR[k + 1]]);
  // Additional caseload: a few people per staff member, some annotated.
  roster.additional = roster.OP.slice(0, 8).map((e, k) => ({ ...e, name: k % 5 === 4 ? `${e.name} - DEMO STATUS` : e.name }));
  return roster;
}

function monthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Header-less [site | frequency | name] rows with schedule rows mixed in, like the real doc. */
function caseloadTable(entries, total, service) {
  const rows = [];
  entries.forEach((e, i) => {
    if (i % 8 === 0) rows.push([SCHEDULES[(i / 8) % 2], i ? "" : "(One per Week)", `Total: ${total} (${service})`]);
    rows.push([e.site, e.freq, e.name]);
    if (i % 11 === 10) rows.push([e.site, "", ""]); // blank template row
  });
  return tableNoHeader(rows);
}

function tableNoHeader(rows) {
  const border = '<w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/>';
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${border}</w:tblBorders></w:tblPr>` +
    rows.map((r) => `<w:tr>${r.map((c) => cell(c, false)).join("")}</w:tr>`).join("") + "</w:tbl>";
}

async function rosterDocx(roster, month) {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const updated = new Date(Date.UTC(y, m - 1, lastDay - 2)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  let body =
    para("Behavioral Health", { bold: true, size: 32 }) +
    para("DEMO DATA — all names are fictitious.", { size: 18 }) +
    para("Caseloads", { bold: true, size: 28 }) +
    para(`Updated ${updated}`) + para("");
  for (const staff of PSR_STAFF) {
    const list = roster.PSR.filter((e) => e.staff === staff);
    if (!list.length) continue;
    body += para(`${staff} — Total: ${list.length} (Psychosocial Rehabilitation-PSR)`, { bold: true }) +
      caseloadTable(list, list.length, "Psychosocial Rehabilitation- PSR") + para("") + para("");
  }
  for (const staff of OP_STAFF) {
    const list = roster.OP.filter((e) => e.staff === staff);
    if (!list.length) continue;
    body += para(`Therapist: ${staff} — Total: ${list.length} (Individual Therapy)`, { bold: true }) +
      tableNoHeader(list.map((e) => [e.site, e.freq, e.name])) + para("");
  }
  if (roster.oneToOne.length) {
    body += para("1:1 (Psychosocial Rehabilitation-PSR)", { bold: true }) +
      table(["Site", "Frequency", PSR_STAFF[2], ""], roster.oneToOne.map(([a, b]) => [a.site, a.freq, a.name, b.name])) + para("");
  }
  if (roster.additional.length) {
    const half = Math.ceil(roster.additional.length / 2);
    const left = roster.additional.slice(0, half);
    const right = roster.additional.slice(half);
    body += para(`Additional Caseload: As of ${updated}`, { bold: true }) +
      table([OP_STAFF[0], OP_STAFF[1]], left.map((e, k) => [e.name, right[k] ? right[k].name : ""])) + para("");
  }
  body += para("Demo contact procedures", { bold: true }) +
    para("DEMO: procedures for contacting the on-call clinician would appear here.") +
    para("Therapy", { bold: true }) + para("DEMO: therapy contact notes.") +
    para("PSR", { bold: true }) + para("DEMO: PSR contact notes.");
  return makeDocx(body);
}

/**
 * Generate all demo files.
 * @returns {Promise<{ incidents: Array<{month, filename, buffer}>, rosters: Array<{month, filename, buffer}> }>}
 */
async function generateDemoFiles({ months = demoMonths(), seed = 2026 } = {}) {
  const r = rng(seed);
  const population = buildPopulation(r);
  const incidents = [];
  const rosters = [];
  for (let i = 0; i < months.length; i++) {
    const month = months[i];
    const rows = incidentRowsForMonth(r, population, month, i);
    incidents.push({ month, filename: `DEMO New Reportable Event Report ${month}.xlsx`, buffer: await incidentWorkbook(rows) });
    const roster = rosterForMonth(r, population, month, i);
    rosters.push({ month, filename: `DEMO BH Roster ${month}.docx`, buffer: await rosterDocx(roster, month) });
  }
  return { incidents, rosters, population };
}

module.exports = { generateDemoFiles, demoMonths, monthLabel };
