/**
 * api/lib/demo.js — FAKE data that statistically mirrors the real PHS export.
 *
 * Every name, site and narrative here is invented. Distributions follow the
 * deidentified profile of "New Reportable Event Report (14).xlsx" (351 rows /
 * month, ~30 distinct dates, 46 sites, ~83 people, 8.8% reportable, the
 * observed location / observation / injury-level mixes, ~5% exact duplicate
 * rows, concatenated multi-select fields with no delimiter).
 *
 * It also produces a monthly behavioral-health roster .docx in a GUESSED
 * layout (headings + one table per service), with deliberate name variations
 * ("Last, First", nicknames, typos) so the Review Queue has realistic work.
 * Replace the docx layout once we have a real (redacted) sample.
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

const OBSERVATION = [
  ["Witnessed by Provider Staff", 178], ["Discovered by Provider Staff", 44], ["Discovered by Other", 24],
  ["Discovered by Other Service Provider", 11], ["Witnessed by Therapy Personnel", 6],
  ["Witnessed by Person Supported/Other Persons Supported", 6], ["Witnessed by Other", 5],
  ["Discovered by Therapy Personnel", 4], ["Witnessed by Other Service Provider", 4],
];
const LOCATION = [
  ["Home - Inside", 204], ["Community - Supervised", 42], ["Community - Unsupervised", 19],
  ["Home - Outside", 18], ["Day Program / Work / School", 8], ["Unknown", 3], ["Vehicle", 2],
];
const INJURY = [["No Injury", 206], ["Minor Injury", 26], ["Serious Injury", 5]];
const OTHER_TYPES = [
  ["Other - self injurious behaviors", 5], ["Other - fall without injury", 14], ["Other - property damage", 9],
  ["Other - verbal aggression toward peer", 10], ["Other - refused medication", 8],
  ["Other - physical aggression toward staff", 9], ["Other - elopement attempt", 5],
  ["Other - minor vehicle incident (demo narrative)", 3], ["Other - choking episode, resolved with prompting", 3],
  ["Other - peer to peer altercation", 9], ["Other - medication administered late", 6],
];
const INJURY_TEXT = [
  "Small abrasion to left knee, first aid applied.", "Bruise noted on right forearm.", "Redness to hand after striking table.",
  "Scratch on cheek, cleaned and monitored.", "Complained of ankle pain, ice applied.", "No visible injury; monitored for 24 hours.",
  "Bump on forehead, neuro checks completed.", "Skin tear on elbow, bandaged.",
];
const INTERVENTION_COMBOS = [
  ["911 Call", "EMT", "Emergency Room Visit"], ["911 Call", "EMT"], ["Emergency Room Visit"], ["911 Call", "Police Involvement"],
  ["911 Call", "EMT", "Emergency Room Visit", "Hospital Admission"], ["Mobile Crisis"], ["Police Involvement"], ["First Aid"],
  ["911 Call", "Mobile Crisis", "Police Involvement"], ["Urgent Care Visit"],
];
const BEHAVIORAL_COMBOS = [
  ["Physical Aggression", "Property Damage", "Crisis Call"], ["Suicidal Ideation", "Mobile Crisis Assessment"],
  ["Self Injurious Behavior", "Physical Aggression"], ["Elopement", "Police Involvement"],
  ["Physical Aggression", "Psychiatric Hospitalization"], ["Property Damage", "Verbal Aggression"],
];
const TIER1 = ["Tier 1 - Demo Allegation A", "Tier 1 - Demo Allegation B"];
const TIER2 = ["Tier 2 - Demo Serious Injury", "Tier 2 - Demo Unplanned Hospitalization"];

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
  const n = Math.round(351 * (0.9 + monthIndex * 0.035) + (r() - 0.5) * 40);
  const totalW = population.people.reduce((s, p) => s + p.weight, 0);
  // ~83 people appear in a typical month: restrict to a monthly active subset.
  const active = population.people.filter(() => r() < 0.72);
  const activeW = active.reduce((s, p) => s + p.weight, 0) || totalW;
  const rows = [];
  for (let i = 0; i < n; i++) {
    let x = r() * activeW;
    let person = active[0];
    for (const p of active) if ((x -= p.weight) < 0) { person = p; break; }
    const day = 1 + Math.floor(r() * daysInMonth);
    let name = `${person.first} ${person.last}`;
    const v = r();
    if (person.variant && v < 0.25) name = person.variant;
    else if (v < 0.06) name = `${person.last}, ${person.first}`;
    else if (v < 0.1) name = `${person.first} ${person.middle}. ${person.last}`;
    else if (v < 0.12) name = name.toUpperCase();

    const row = {
      "Date Of Event": `${pad(m)}/${pad(day)}/${y}`,
      "Member's Full Name": name,
      "Tier 1 Events": r() < 0.011 ? pick(r, TIER1) : "",
      "Tier 2 Events": r() < 0.009 ? pick(r, TIER2) : "",
      "Behavioral/Psychiatric Events": r() < 0.03 ? pick(r, BEHAVIORAL_COMBOS).join("") : "",
      "Medical Events": "",
      "Other Event Types": r() < 0.242 ? weighted(r, OTHER_TYPES) : "",
      "Non Reportable": r() < 0.088 ? "Reportable" : "Non-Reportable",
      "This incident was / By": r() < 0.803 ? weighted(r, OBSERVATION) : "",
      "Event Location": r() < 0.843 ? weighted(r, LOCATION) : "",
      "Event Interventions": r() < 0.034 ? pick(r, INTERVENTION_COMBOS).join("") : "",
      "Site/Home": r() < 0.85 ? person.site : pick(r, population.sites),
      "Injury Description": "",
      "Level of Injury": r() < 0.675 ? weighted(r, INJURY) : "",
    };
    if (row["Level of Injury"] && row["Level of Injury"] !== "No Injury") row["Injury Description"] = pick(r, INJURY_TEXT);
    else if (r() < 0.25) row["Injury Description"] = "No injury observed.";
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

const CLINICIANS = ["Demo Clinician A", "Demo Clinician B", "Demo Clinician C", "Demo Clinician D"];

function rosterForMonth(r, population, month, monthIndex) {
  const roster = { OP: [], PSR: [] };
  population.people.forEach((p, i) => {
    if (!p.bh) return;
    // a little churn month to month
    if (r() < 0.12 - monthIndex * 0.005) return;
    const services = p.bh === "both" ? ["OP", "PSR"] : [p.bh];
    // Roster names are typed "Last, First" — sometimes with the nickname / typo variant.
    let name = `${p.last}, ${p.first}`;
    if (p.variant && i % 2 === 0) {
      const [vf, ...vl] = p.variant.split(" ");
      name = `${vl.join(" ")}, ${vf}`;
    } else if (r() < 0.1) name = `${p.last}, ${p.first} ${p.middle}.`;
    for (const s of services) {
      roster[s].push([name, `${pad(1 + (i % 12))}/${pad(1 + (i % 27))}/20${22 + (i % 4)}`, CLINICIANS[i % 4], s === "OP" ? pick(r, ["Weekly", "Bi-weekly", "Monthly"]) : pick(r, ["2x weekly", "3x weekly", "Weekly"])]);
    }
  });
  // New enrollees over time so the trend moves.
  for (let k = 0; k < monthIndex; k++) {
    const p = population.people[(k * 7 + 1) % population.people.length];
    if (!p.bh) roster.OP.push([`${p.last}, ${p.first}`, `${month.slice(5)}/01/${month.slice(0, 4)}`, CLINICIANS[k % 4], "Weekly"]);
  }
  roster.OP.sort((a, b) => a[0].localeCompare(b[0]));
  roster.PSR.sort((a, b) => a[0].localeCompare(b[0]));
  return roster;
}

function monthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

async function rosterDocx(roster, month) {
  const header = ["Client Name", "Admission Date", "Clinician", "Frequency"];
  const body =
    para(`Behavioral Health Services Roster — ${monthLabel(month)}`, { bold: true, size: 32 }) +
    para("DEMO DATA — all names are fictitious.", { size: 18 }) +
    para("Outpatient Therapy (OP)", { bold: true, size: 26 }) +
    table(header, roster.OP) +
    para("") +
    para("Psychosocial Rehabilitation (PSR)", { bold: true, size: 26 }) +
    table(header, roster.PSR);
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
