/**
 * api/lib/reports.js — Excel exports of the monthly BH rosters (OP / PSR).
 *
 * This replaces the manual step of splitting the emailed Word doc into two
 * reports. One workbook per call: a sheet per requested service plus a
 * Summary sheet.
 */
const ExcelJS = require("exceljs");
const { bhRoster, partialMonths } = require("./queries");
const db = require("../../db");
const C = require("../../db/classify");
const { monthLabel } = require("./demo");

const SERVICE_NAMES = { OP: "Outpatient Therapy (OP)", PSR: "Psychosocial Rehabilitation (PSR)" };
const BRAND = "FF1F5C4A";

async function bhRosterWorkbook({ month, services = ["OP", "PSR"] }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Greenhouse by Emory Valley Center";
  wb.created = new Date();

  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 38 }, { width: 14 }, { width: 14 }];
  summary.addRow([`Behavioral Health Roster — ${monthLabel(month)}`]).font = { bold: true, size: 14 };
  summary.addRow([`Generated ${new Date().toLocaleString("en-US")} by Greenhouse`]).font = { italic: true, color: { argb: "FF666666" } };
  summary.addRow([]);
  const h = summary.addRow(["Service", "People", "New this month"]);
  h.font = { bold: true, color: { argb: "FFFFFFFF" } };
  h.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } }));

  for (const service of services) {
    const rows = bhRoster({ month, service });
    summary.addRow([SERVICE_NAMES[service], rows.length, rows.filter((r) => r.isNew).length]);

    const ws = wb.addWorksheet(service);
    const extraCols = [...new Set(rows.flatMap((r) => Object.keys(r.extra)))].filter((c) => !/name|^section$/i.test(c));
    ws.addRow([`${SERVICE_NAMES[service]} — ${monthLabel(month)}`]).font = { bold: true, size: 13 };
    ws.addRow([`${rows.length} people`]);
    ws.addRow([]);
    const header = ws.addRow(["#", "Name", "Name as written in source", ...extraCols, "Also receives", "New vs last month", `Incidents in ${monthLabel(month)}`]);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } }));
    rows.forEach((r, i) => {
      ws.addRow([
        i + 1,
        r.display_name || r.raw_name,
        r.raw_name,
        ...extraCols.map((c) => r.extra[c] ?? ""),
        r.alsoIn.join(", "),
        r.isNew ? "New" : "",
        r.events,
      ]);
    });
    ws.columns.forEach((c, i) => (c.width = i === 0 ? 6 : 24));
    ws.views = [{ state: "frozen", ySplit: 4 }];
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: header.cellCount } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---- Incident report workbook (rebuilds the manual Excel report tabs) -------

const headerStyle = (row) => {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } }));
};

function addTable(wb, name, title, columns, rows, note) {
  const ws = wb.addWorksheet(name.slice(0, 31));
  ws.addRow([title]).font = { bold: true, size: 13 };
  if (note) ws.addRow([note]).font = { italic: true, color: { argb: "FF666666" } };
  ws.addRow([]);
  headerStyle(ws.addRow(columns));
  rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((c, i) => (c.width = i === 0 ? 58 : 14));
  return ws;
}

/**
 * Count a single-select column against a full option list. Options nobody
 * chose show 0 (like the manual tabs); blanks become "No Data Reported";
 * values not in the list are appended so nothing is silently dropped.
 */
function singleSelect(rows, field, options) {
  const counts = new Map(options.map((o) => [o, 0]));
  let blank = 0;
  for (const r of rows) {
    const v = r[field];
    if (!v) blank++;
    else counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...[...counts.entries()].sort((a, b) => b[1] - a[1]), ["No Data Reported", blank]];
}

/** Count a glued multi-select column, one count per option per event. */
function multiSelect(rows, field, options, { exclude = [] } = {}) {
  const counts = new Map(options.filter((o) => !exclude.includes(o)).map((o) => [o, 0]));
  let blank = 0;
  let unrecognized = 0;
  for (const r of rows) {
    if (!r[field]) { blank++; continue; }
    const { options: found, unparsed } = C.splitOptions(r[field], options);
    for (const o of found) if (!exclude.includes(o)) counts.set(o, (counts.get(o) || 0) + 1);
    if (unparsed) unrecognized++;
  }
  // Collapse short/long variants of the same option that are both zero.
  const out = [...counts.entries()].filter(([, n], i, arr) => n > 0 || !arr.some(([o2, n2]) => n2 > 0 && (o2.startsWith(arr[i][0]) || arr[i][0].startsWith(o2))));
  out.sort((a, b) => b[1] - a[1]);
  if (unrecognized) out.push(["Unrecognized option (see import warnings)", unrecognized]);
  out.push(["No Data Reported", blank]);
  return out;
}

async function incidentReportWorkbook({ from, to, includeDuplicates = false } = {}) {
  // Test patients (person.is_test) are left out of every report.
  const where = ["event_month IS NOT NULL", "COALESCE(p.is_test, 0) = 0"];
  const params = [];
  if (!includeDuplicates) where.push("is_exact_duplicate = 0");
  if (from) { where.push("event_month >= ?"); params.push(from); }
  if (to) { where.push("event_month <= ?"); params.push(to); }
  const rows = db.all(
    `SELECT e.*, p.display_name AS person_name FROM event_report e LEFT JOIN person p ON p.id = e.person_id
     WHERE ${where.join(" AND ")}`, params);
  const partial = partialMonths();
  const period = `${from ? monthLabel(from) : "first month"} – ${to ? monthLabel(to) : "latest month"}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Greenhouse by Emory Valley Center";
  wb.created = new Date();

  // Summary
  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ width: 46 }, { width: 18 }];
  sum.addRow(["Incident report (PHS New Reportable Event Report)"]).font = { bold: true, size: 14 };
  sum.addRow([`Period: ${period}`]);
  sum.addRow([`Generated ${new Date().toLocaleString("en-US")} by Greenhouse`]).font = { italic: true, color: { argb: "FF666666" } };
  sum.addRow([includeDuplicates ? "Exact duplicate rows are INCLUDED." : "Exact duplicate rows in the export are excluded."]).font = { italic: true, color: { argb: "FF666666" } };
  for (const [m, last] of Object.entries(partial)) {
    if ((!from || m >= from) && (!to || m <= to)) sum.addRow([`Note: ${monthLabel(m)} looks incomplete (events through ${last}).`]).font = { color: { argb: "FFB42318" } };
  }
  sum.addRow([]);
  headerStyle(sum.addRow(["Measure", "Count"]));
  const count = (pred) => rows.filter(pred).length;
  [
    ["Event records", rows.length],
    ["People involved", new Set(rows.map((r) => r.person_id)).size],
    ["Sites / homes", new Set(rows.map((r) => r.site_home)).size],
    ["Reportable", count((r) => r.is_reportable === 1)],
    ["Non-Reportable", count((r) => r.is_reportable === 0)],
    ["Serious injuries", count((r) => r.injury_level === "Serious Injury")],
    ["Tier 1 events", count((r) => r.tier_1_events)],
    ["Tier 2 events", count((r) => r.tier_2_events)],
    ...Object.entries({ f_hospitalization: "Hospitalizations", f_er: "ER visits", f_911: "911 calls", f_police: "Police involvement", f_crisis: "Crisis events", f_property_damage: "Property damage", f_self_injury: "Self-injury / suicide attempt", f_restraint: "Restrictive interventions" })
      .map(([k, label]) => [label, count((r) => r[k] === 1)]),
  ].forEach((r) => sum.addRow(r));

  // Month
  const byMonth = new Map();
  for (const r of rows) {
    const m = byMonth.get(r.event_month) || { events: 0, rep: 0, people: new Set() };
    m.events++; if (r.is_reportable === 1) m.rep++; m.people.add(r.person_id);
    byMonth.set(r.event_month, m);
  }
  addTable(wb, "Month", "Events by month", ["Month", "Events", "Reportable", "Non-Reportable", "People"],
    [...byMonth.entries()].sort().map(([m, v]) => [monthLabel(m) + (partial[m] ? " (incomplete)" : ""), v.events, v.rep, v.events - v.rep, v.people.size]));

  // Site / Individual
  const group = (key) => {
    const g = new Map();
    for (const r of rows) {
      const k = r[key] || "No Data Reported";
      const v = g.get(k) || { events: 0, rep: 0, serious: 0 };
      v.events++; if (r.is_reportable === 1) v.rep++; if (r.injury_level === "Serious Injury") v.serious++;
      g.set(k, v);
    }
    return [...g.entries()].sort((a, b) => b[1].events - a[1].events).map(([k, v]) => [k, v.events, v.rep, v.serious]);
  };
  addTable(wb, "Site", "Events by site / home", ["Site/Home", "Events", "Reportable", "Serious injuries"], group("site_home"));
  addTable(wb, "Individual", "Events by person", ["Person", "Events", "Reportable", "Serious injuries"], group("person_name"),
    "Contains names — share only with authorized staff.");

  addTable(wb, "Tier 1", "Tier 1 events", ["Tier 1 event", "Events"], multiSelect(rows, "tier_1_events", C.TIER_OPTIONS));
  addTable(wb, "Tier 2", "Tier 2 events", ["Tier 2 event", "Events"], multiSelect(rows, "tier_2_events", C.TIER_OPTIONS));
  addTable(wb, "Behavior", "Behavioral / psychiatric events", ["Option", "Events"],
    multiSelect(rows, "behavioral_psychiatric_events", C.BEHAVIORAL_OPTIONS, { exclude: ["Housemate", "Staff"] }),
    "One event can have several options. 'Housemate'/'Staff' (who was targeted) are not listed.");
  addTable(wb, "Medical", "Medical events", ["Option", "Events"], multiSelect(rows, "medical_events", C.MEDICAL_OPTIONS));
  addTable(wb, "Other", "Other event types", ["Other event type", "Events"],
    (() => {
      // Match ignoring case/punctuation: the export spells some categories two ways
      // ("…behaviors; disruptive…" and "…behaviors, disruptive…").
      const squash = (v) => String(v).toLowerCase().replace(/[^a-z0-9]/g, "");
      const canon = new Map(C.OTHER_OPTIONS.map((o) => [squash(o), o]));
      const asOption = (v) => (v ? canon.get(squash(v)) || null : null);
      const known = singleSelect(rows.map((r) => ({ v: asOption(r.other_event_types) })), "v", C.OTHER_OPTIONS);
      const narrative = count((r) => r.other_event_types && !asOption(r.other_event_types));
      const blank = count((r) => !r.other_event_types);
      return [...known.filter(([o]) => o !== "No Data Reported"), ["Other (free-text / narrative entry)", narrative], ["No Data Reported", blank]];
    })());
  addTable(wb, "Reportable", "Reportable vs. non-reportable", ["Status", "Events"], singleSelect(rows, "reportability_status", ["Non-Reportable", "Reportable"]));
  addTable(wb, "Discovery", "How events became known (this incident was / by)", ["Witnessed / discovered by", "Events"], singleSelect(rows, "incident_observation_and_source", C.OBSERVATION_OPTIONS));
  addTable(wb, "Location", "Event location", ["Location", "Events"], singleSelect(rows, "event_location", C.LOCATION_OPTIONS));
  addTable(wb, "Requirements", "Interventions required", ["Intervention", "Events"], multiSelect(rows, "event_interventions", C.INTERVENTION_OPTIONS),
    "One event can have several interventions.");
  addTable(wb, "Injury", "Level of injury", ["Level", "Events"], singleSelect(rows, "injury_level", C.INJURY_OPTIONS));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { bhRosterWorkbook, incidentReportWorkbook, SERVICE_NAMES };
