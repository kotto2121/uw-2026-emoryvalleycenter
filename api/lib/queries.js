/**
 * api/lib/queries.js — read models for the dashboards and reports.
 *
 * Conventions:
 *   - Months are 'YYYY-MM' strings.
 *   - Exact duplicate rows (2nd+ identical row in one export) are excluded
 *     unless includeDuplicates is true.
 *   - "Not recorded" is reported separately from "No Injury" etc.: a blank in
 *     the export is missing data, not a negative answer.
 *   - Event counts are records; people counts use the person registry.
 *   - Test patients (person.is_test = 1) are left out of every count.
 *   - Segment "behavioral" = the person's Behavioral box (person.is_behavioral);
 *     "non" = everyone else, including events with no matched person.
 */
const db = require("../../db");
const {
  splitOptions, categorize, INTERVENTION_OPTIONS, BEHAVIORAL_OPTIONS, TIER_OPTIONS, MEDICAL_OPTIONS, OTHER_CATEGORIES,
} = require("../../db/classify");
const { compareKey } = require("../../db/normalize");

const FLAGS = {
  f_hospitalization: "Hospitalizations",
  f_restraint: "Restrictive interventions",
  f_er: "ER visits",
  f_911: "911 calls",
  f_police: "Police involvement",
  f_crisis: "Crisis events",
  f_property_damage: "Property damage",
  f_self_injury: "Self-injury",
};

function prevMonth(month) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Unqualified `person_id` so these work on event_report and bh_enrollment alike.
const NOT_TEST = "(person_id IS NULL OR person_id NOT IN (SELECT id FROM person WHERE is_test = 1))";
const IS_BH = "(person_id IN (SELECT id FROM person WHERE is_behavioral = 1))";
const NOT_BH = "(person_id IS NULL OR person_id NOT IN (SELECT id FROM person WHERE is_behavioral = 1))";

const METRIC_KEYS = Object.keys(FLAGS);
/** An event that counts toward at least one metric in FLAGS. */
const ANY_METRIC = `(${METRIC_KEYS.join(" + ")}) > 0`;

/**
 * filters: from/to (YYYY-MM), site, includeDuplicates,
 *          segment ('behavioral' | 'non'), reportable ('reportable' | 'non').
 */
function eventWhere({ from, to, site, includeDuplicates, segment, reportable } = {}) {
  const w = ["event_month IS NOT NULL", NOT_TEST];
  const p = [];
  if (!includeDuplicates) w.push("is_exact_duplicate = 0");
  if (from) { w.push("event_month >= ?"); p.push(from); }
  if (to) { w.push("event_month <= ?"); p.push(to); }
  if (site) { w.push("site_home = ?"); p.push(site); }
  if (segment === "behavioral") w.push(IS_BH);
  if (segment === "non") w.push(NOT_BH);
  if (reportable === "reportable") w.push("is_reportable = 1");
  if (reportable === "non") w.push("is_reportable = 0");
  return { sql: w.join(" AND "), params: p };
}

/**
 * Months whose event data looks incomplete: the last event date is more than
 * 5 days before month end AND the month is the newest in the data (an export
 * pulled mid-month). Older months are assumed complete.
 */
function partialMonths() {
  const row = db.get(
    `SELECT event_month AS m, MAX(event_date) AS last FROM event_report
     WHERE event_month = (SELECT MAX(event_month) FROM event_report) GROUP BY 1`);
  if (!row) return {};
  const [y, mo] = row.m.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const lastDay = Number(row.last.slice(8, 10));
  return lastDay < monthEnd - 5 ? { [row.m]: row.last } : {};
}

function months() {
  const ev = db.all("SELECT DISTINCT event_month AS m FROM event_report WHERE event_month IS NOT NULL").map((r) => r.m);
  const bh = db.all("SELECT DISTINCT report_month AS m FROM bh_enrollment").map((r) => r.m);
  return {
    all: [...new Set([...ev, ...bh])].sort(),
    events: ev.sort(),
    roster: bh.sort(),
  };
}

function meta() {
  const m = months();
  const counts = db.get(`SELECT
      (SELECT COUNT(*) FROM event_report) AS events,
      (SELECT COUNT(*) FROM bh_enrollment) AS roster_rows,
      (SELECT COUNT(*) FROM person) AS people,
      (SELECT COUNT(*) FROM match_review WHERE status = 'pending') AS pending_reviews,
      (SELECT COUNT(*) FROM import_batch) AS imports,
      (SELECT COUNT(*) FROM import_batch WHERE is_demo = 1) AS demo_imports,
      (SELECT MAX(imported_at) FROM import_batch) AS last_import,
      (SELECT COUNT(*) FROM person WHERE is_behavioral = 1) AS behavioral_people,
      (SELECT COUNT(*) FROM person WHERE is_test = 1) AS test_people`);
  const sites = db.all("SELECT DISTINCT site_home AS s FROM event_report WHERE site_home IS NOT NULL ORDER BY 1").map((r) => r.s);
  return { months: m, partialMonths: partialMonths(), sites, ...counts, hasData: counts.imports > 0, isDemo: counts.demo_imports > 0 };
}

// ---- Behavioral Health ------------------------------------------------------

// Behavioral is a person-level fact: the Behavioral box on a person's page
// (person.is_behavioral) is the only source of truth. A BH roster import just
// ticks the box; OP / PSR service is not reported.
function bhPeopleCount() {
  return db.get("SELECT COUNT(*) AS n FROM person WHERE is_behavioral = 1 AND is_test = 0").n;
}

function bhMonth(month) {
  // Everyone's totals, only for the BH-vs-everyone-else share.
  const all = db.get(
    `SELECT COUNT(*) AS events, SUM(CASE WHEN is_reportable = 1 THEN 1 ELSE 0 END) AS reportable
     FROM event_report WHERE event_month = ? AND is_exact_duplicate = 0 AND ${NOT_TEST}`, [month]);
  // BH clients' events: the KPIs and the crisis & safety indicators (FLAGS).
  const flagSql = Object.keys(FLAGS).map((f) => `SUM(${f}) AS ${f}`).join(", ");
  const bh = db.get(
    `SELECT COUNT(*) AS events, COUNT(DISTINCT person_id) AS people, ${flagSql},
            SUM(CASE WHEN is_reportable = 1 THEN 1 ELSE 0 END) AS reportable
     FROM event_report
     WHERE event_month = ? AND is_exact_duplicate = 0 AND ${IS_BH} AND ${NOT_TEST}`, [month]);
  const out = {
    month, events: all.events, reportable: all.reportable || 0,
    bhClientEvents: bh.events, bhClientsWithEvents: bh.people, bhReportable: bh.reportable || 0,
  };
  for (const f of Object.keys(FLAGS)) out[f] = bh[f] || 0;
  return out;
}

function bhDashboard({ month } = {}) {
  const m = months();
  // Default: the latest COMPLETE month of events.
  const partial = partialMonths();
  const complete = m.events.filter((x) => !partial[x]);
  const target = month || complete[complete.length - 1] || m.events[m.events.length - 1];
  const bhPeople = bhPeopleCount();
  if (!target) return { month: null, months: m.all, current: null, previous: null, trend: [], flags: FLAGS, bhPeople };
  const trend = m.all.filter((x) => x <= target).slice(-12).map(bhMonth);
  return {
    month: target,
    months: m.all,
    bhPeople,
    current: bhMonth(target),
    previous: m.all.includes(prevMonth(target)) ? bhMonth(prevMonth(target)) : null,
    trend,
    flags: FLAGS,
    partialMonths: partial,
  };
}

// ---- Incidents -------------------------------------------------------------

function groupCount(column, where, { limit = 0 } = {}) {
  const rows = db.all(
    `SELECT COALESCE(${column}, '(Not recorded)') AS label, COUNT(*) AS n
     FROM event_report WHERE ${where.sql} GROUP BY 1 ORDER BY n DESC`, where.params);
  // Deterministically merge cosmetic variants (case/punctuation/whitespace
  // differences only) via compareKey. Canonical label = highest-count variant,
  // alphabetical tie-break. NULL/blank stays its own '(Not recorded)' bucket.
  const merged = new Map(); // key -> { label, n }
  for (const { label, n } of rows) {
    if (label === "(Not recorded)") {
      const cur = merged.get("(Not recorded)") || { label, n: 0 };
      cur.n += n;
      merged.set("(Not recorded)", cur);
      continue;
    }
    const key = compareKey(label);
    const cur = merged.get(key);
    if (!cur || n > cur.n || (n === cur.n && label < cur.label)) {
      merged.set(key, { label, n: (cur ? cur.n : 0) + n, _key: key });
    } else {
      cur.n += n;
    }
  }
  const out = [...merged.values()]
    .map(({ label, n }) => ({ label, n }))
    .sort((a, b) => b.n - a.n);
  if (!limit || out.length <= limit) return out;
  const head = out.slice(0, limit);
  const rest = out.slice(limit).reduce((s, r) => s + r.n, 0);
  return [...head, { label: "All other", n: rest }];
}

function incidentsSummary(filters = {}) {
  const where = eventWhere(filters);
  const flagSql = Object.keys(FLAGS).map((f) => `SUM(${f}) AS ${f}`).join(", ");
  const totals = db.get(
    `SELECT COUNT(*) AS events, COUNT(DISTINCT person_id) AS people, COUNT(DISTINCT site_home) AS sites,
            SUM(CASE WHEN is_reportable = 1 THEN 1 ELSE 0 END) AS reportable,
            SUM(CASE WHEN injury_level = 'Serious Injury' THEN 1 ELSE 0 END) AS serious,
            SUM(CASE WHEN event_interventions IS NOT NULL THEN 1 ELSE 0 END) AS with_intervention,
            SUM(CASE WHEN behavioral_psychiatric_events IS NOT NULL THEN 1 ELSE 0 END) AS with_behavioral,
            SUM(CASE WHEN medical_events IS NOT NULL THEN 1 ELSE 0 END) AS with_medical,
            SUM(CASE WHEN tier_1_events IS NOT NULL THEN 1 ELSE 0 END) AS tier1,
            SUM(CASE WHEN tier_2_events IS NOT NULL THEN 1 ELSE 0 END) AS tier2,
            SUM(CASE WHEN other_event_types IS NOT NULL THEN 1 ELSE 0 END) AS with_other,
            ${flagSql}
     FROM event_report WHERE ${where.sql}`, where.params);
  const byMonth = db.all(
    `SELECT event_month AS month, COUNT(*) AS events,
            SUM(CASE WHEN is_reportable = 1 THEN 1 ELSE 0 END) AS reportable,
            SUM(CASE WHEN injury_level IN ('Minor Injury','Serious Injury') THEN 1 ELSE 0 END) AS injuries,
            COUNT(DISTINCT person_id) AS people,
            ${flagSql}
     FROM event_report WHERE ${where.sql} GROUP BY 1 ORDER BY 1`, where.params);

  // Multi-select fields: count each option once per event.
  function optionCounts(column, dictionary) {
    const counts = new Map();
    for (const r of db.all(`SELECT ${column} AS t FROM event_report WHERE ${where.sql} AND ${column} IS NOT NULL`, where.params)) {
      const { options, unparsed } = splitOptions(r.t, dictionary);
      for (const o of options) counts.set(o, (counts.get(o) || 0) + 1);
      if (unparsed) counts.set("Unrecognized option", (counts.get("Unrecognized option") || 0) + 1);
    }
    return [...counts.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
  }
  const allegations = new Map();
  for (const col of ["tier_1_events", "tier_2_events"]) {
    for (const o of optionCounts(col, TIER_OPTIONS)) {
      const key = `${o.label}`;
      const cur = allegations.get(key) || { label: key, tier1: 0, tier2: 0, n: 0 };
      cur[col === "tier_1_events" ? "tier1" : "tier2"] += o.n;
      cur.n += o.n;
      allegations.set(key, cur);
    }
  }
  // Keyword categories (db/classify.js): each category once per event; rows
  // that match none land in a gray catch-all bucket at the end.
  function categoryCounts(column, categories, noneLabel) {
    const counts = new Map(categories.map(([label]) => [label, 0]));
    let none = 0;
    for (const r of db.all(`SELECT ${column} AS t FROM event_report WHERE ${where.sql} AND ${column} IS NOT NULL`, where.params)) {
      const hits = categorize(r.t, categories);
      if (!hits.length) none++;
      for (const label of hits) counts.set(label, counts.get(label) + 1);
    }
    const rows = [...counts.entries()].filter(([, n]) => n > 0).map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
    if (none) rows.push({ label: noneLabel, n: none });
    return rows;
  }

  const dq = db.get(
    `SELECT COUNT(*) AS rows,
       SUM(is_exact_duplicate) AS duplicates,
       SUM(CASE WHEN injury_level IS NULL THEN 1 ELSE 0 END) AS injury_level_blank,
       SUM(CASE WHEN event_location IS NULL THEN 1 ELSE 0 END) AS location_blank,
       SUM(CASE WHEN incident_observation_and_source IS NULL THEN 1 ELSE 0 END) AS observation_blank,
       SUM(CASE WHEN medical_events IS NULL THEN 1 ELSE 0 END) AS medical_blank
     FROM event_report WHERE ${eventWhere({ ...filters, includeDuplicates: true }).sql}`,
    eventWhere({ ...filters, includeDuplicates: true }).params);

  return {
    totals,
    byMonth,
    byLocation: groupCount("event_location", where, { limit: 6 }),
    byObservation: groupCount("incident_observation_and_source", where, { limit: 6 }),
    byInjury: groupCount("injury_level", where),
    byReportability: groupCount("reportability_status", where),
    topSites: groupCount("site_home", where, { limit: 10 }).filter((r) => r.label !== "All other"),
    interventions: optionCounts("event_interventions", INTERVENTION_OPTIONS),
    behavioral: optionCounts("behavioral_psychiatric_events", BEHAVIORAL_OPTIONS),
    medical: optionCounts("medical_events", MEDICAL_OPTIONS),
    allegations: [...allegations.values()].sort((a, b) => b.n - a.n),
    otherGroups: categoryCounts("other_event_types", OTHER_CATEGORIES, "Narrative / other entries"),
    flags: FLAGS,
    dataQuality: dq,
  };
}

// ---- Behavioral metrics (the Behavioral Reporting workbook's report tabs) ----

/**
 * One call for the Behavioral Metrics page:
 *   summary  each metric + "Any of the above" + all events, as events and
 *            people, split All / Behavioral / Non-Behavioral (ignores the
 *            segment filter, since it shows every segment)
 *   trend    every month in range x every metric (honors all filters)
 *   sites    every site: events, reportable, any metric, people
 *   people   every person with events: same columns + Behavioral box
 */
function behavioralMetrics(filters = {}) {
  const split = eventWhere({ ...filters, segment: undefined });
  const conds = [...METRIC_KEYS.map((k) => [k, `${k} = 1`]), ["any", ANY_METRIC], ["all", "1 = 1"]];
  const sel = conds
    .map(([k, c]) => `SUM(CASE WHEN ${c} THEN 1 ELSE 0 END) AS e_${k}, COUNT(DISTINCT CASE WHEN ${c} THEN person_id END) AS p_${k}`)
    .join(", ");
  const bySeg = db.all(
    `SELECT CASE WHEN ${IS_BH} THEN 'behavioral' ELSE 'non' END AS seg, ${sel}
     FROM event_report WHERE ${split.sql} GROUP BY 1`, split.params);
  const b = bySeg.find((r) => r.seg === "behavioral") || {};
  const n = bySeg.find((r) => r.seg === "non") || {};
  // The two segments never share a person, so people add up across them.
  const cell = (prefix, k) => {
    const bv = b[`${prefix}_${k}`] || 0;
    const nv = n[`${prefix}_${k}`] || 0;
    return { all: bv + nv, behavioral: bv, non: nv };
  };
  const label = (k) => FLAGS[k] || (k === "any" ? "Any of the above" : "All events");
  const summary = conds.map(([k]) => ({ key: k, label: label(k), events: cell("e", k), people: cell("p", k) }));

  const where = eventWhere(filters);
  const flagSql = METRIC_KEYS.map((k) => `SUM(${k}) AS ${k}`).join(", ");
  const anySum = `SUM(CASE WHEN ${ANY_METRIC} THEN 1 ELSE 0 END)`;
  const repSum = "SUM(CASE WHEN is_reportable = 1 THEN 1 ELSE 0 END)";
  const monthRows = db.all(
    `SELECT event_month AS month, COUNT(*) AS events, ${flagSql}, ${anySum} AS any_metric
     FROM event_report WHERE ${where.sql} GROUP BY 1 ORDER BY 1`, where.params);
  // Keep months with no matching events as zero rows, so the chart has no gaps.
  const inRange = months().events.filter((m) => (!filters.from || m >= filters.from) && (!filters.to || m <= filters.to));
  const zero = Object.fromEntries(["events", ...METRIC_KEYS, "any_metric"].map((k) => [k, 0]));
  const trend = inRange.map((m) => monthRows.find((r) => r.month === m) || { month: m, ...zero });

  const sites = db.all(
    `SELECT COALESCE(site_home, '(Not recorded)') AS site, COUNT(*) AS events, ${repSum} AS reportable,
            ${anySum} AS any_metric, COUNT(DISTINCT person_id) AS people
     FROM event_report WHERE ${where.sql} GROUP BY 1 ORDER BY events DESC, site`, where.params);
  const people = db.all(
    `SELECT e.person_id AS id, p.display_name AS name, p.is_behavioral, COUNT(*) AS events,
            ${repSum} AS reportable, ${anySum} AS any_metric, MAX(e.event_date) AS last_event
     FROM event_report e JOIN person p ON p.id = e.person_id
     WHERE ${where.sql} GROUP BY e.person_id ORDER BY events DESC, name`, where.params);

  const registry = db.get(
    "SELECT SUM(CASE WHEN is_behavioral = 1 THEN 1 ELSE 0 END) AS behavioral, SUM(is_test) AS test FROM person");
  return {
    flags: FLAGS,
    summary,
    trend,
    sites,
    people,
    registry: { behavioral: registry.behavioral || 0, test: registry.test || 0 },
  };
}

function incidentList({ from, to, site, segment, reportable, q, flag, includeDuplicates, limit = 200, offset = 0 } = {}) {
  const where = eventWhere({ from, to, site, segment, reportable, includeDuplicates });
  if (q) {
    where.sql += " AND (member_full_name LIKE ? OR p.display_name LIKE ? OR other_event_types LIKE ? OR injury_description LIKE ?)";
    const like = `%${q}%`;
    where.params.push(like, like, like, like);
  }
  if (flag && (FLAGS[flag] || flag === "is_reportable")) where.sql += ` AND ${flag} = 1`;
  const total = db.get(
    `SELECT COUNT(*) AS n FROM event_report e LEFT JOIN person p ON p.id = e.person_id WHERE ${where.sql}`, where.params).n;
  const rows = db.all(
    `SELECT e.*, p.display_name AS person_name FROM event_report e
     LEFT JOIN person p ON p.id = e.person_id
     WHERE ${where.sql} ORDER BY event_date DESC, e.id DESC LIMIT ? OFFSET ?`,
    [...where.params, Math.min(Number(limit) || 200, 1000), Number(offset) || 0]);
  return { total, rows };
}

// ---- Overview --------------------------------------------------------------

function overview() {
  const m = months();
  const latest = m.all[m.all.length - 1] || null;
  const trend = m.all.slice(-12).map((month) => {
    const people = db.get(
      `SELECT COUNT(*) AS n FROM (
         SELECT person_id FROM event_report WHERE event_month = ? AND person_id IS NOT NULL AND ${NOT_TEST}
         UNION SELECT person_id FROM bh_enrollment WHERE report_month = ? AND person_id IS NOT NULL AND ${NOT_TEST})`,
      [month, month]).n;
    const ev = db.get(
      `SELECT COUNT(*) AS events, SUM(CASE WHEN is_reportable = 1 THEN 1 ELSE 0 END) AS reportable
       FROM event_report WHERE event_month = ? AND is_exact_duplicate = 0 AND ${NOT_TEST}`, [month]);
    return { month, people, events: ev.events, reportable: ev.reportable || 0 };
  });
  const sources = db.all(
    `SELECT kind, COUNT(*) AS imports, MAX(imported_at) AS last_import,
            MAX(COALESCE(report_month, '')) AS last_month, SUM(rows_inserted) AS rows
     FROM import_batch GROUP BY kind`);
  return { latest, trend, sources, bhPeople: bhPeopleCount(), meta: meta(), partialMonths: partialMonths() };
}

// ---- People ----------------------------------------------------------------

function peopleList({ q, limit = 500 } = {}) {
  const params = [];
  let where = "1=1";
  if (q) {
    where = "(p.display_name LIKE ? OR EXISTS (SELECT 1 FROM person_alias a WHERE a.person_id = p.id AND a.raw_name LIKE ?))";
    params.push(`%${q}%`, `%${q}%`);
  }
  return db.all(
    `SELECT p.id, p.display_name, p.is_demo, p.is_behavioral, p.is_test,
       (SELECT COUNT(*) FROM person_alias a WHERE a.person_id = p.id) AS aliases,
       (SELECT COUNT(*) FROM event_report e WHERE e.person_id = p.id AND e.is_exact_duplicate = 0) AS events,
       (SELECT MAX(event_date) FROM event_report e WHERE e.person_id = p.id) AS last_event,
       (SELECT GROUP_CONCAT(DISTINCT service) FROM bh_enrollment b WHERE b.person_id = p.id
          AND b.report_month = (SELECT MAX(report_month) FROM bh_enrollment)) AS bh_services
     FROM person p WHERE ${where} ORDER BY p.display_name LIMIT ?`, [...params, limit]);
}

function personDetail(id) {
  const person = db.get("SELECT * FROM person WHERE id = ?", [id]);
  if (!person) return null;
  return {
    person,
    aliases: db.all("SELECT raw_name, source, how, created_at FROM person_alias WHERE person_id = ? ORDER BY id", [id]),
    enrollments: db.all("SELECT report_month, service FROM bh_enrollment WHERE person_id = ? ORDER BY report_month DESC, service", [id]),
    events: db.all(
      `SELECT id, event_date, member_full_name, site_home, event_location, reportability_status, injury_level,
              other_event_types, event_interventions, is_exact_duplicate
       FROM event_report WHERE person_id = ? ORDER BY event_date DESC LIMIT 200`, [id]),
  };
}

function reviewQueue({ status = "pending" } = {}) {
  const rows = db.all(
    `SELECT r.*, a.display_name AS person_name, b.display_name AS candidate_name
     FROM match_review r
     JOIN person a ON a.id = r.person_id
     JOIN person b ON b.id = r.candidate_person_id
     WHERE r.status = ? ORDER BY r.score DESC, r.id`, [status]);
  const sideInfo = (pid) => ({
    aliases: db.all("SELECT raw_name, source FROM person_alias WHERE person_id = ? ORDER BY id LIMIT 6", [pid]),
    events: db.get("SELECT COUNT(*) AS n FROM event_report WHERE person_id = ?", [pid]).n,
    roster: db.get("SELECT COUNT(*) AS n FROM bh_enrollment WHERE person_id = ?", [pid]).n,
    sites: db.all(
      `SELECT site_home AS s, COUNT(*) AS n FROM event_report WHERE person_id = ? AND site_home IS NOT NULL
       GROUP BY 1 ORDER BY n DESC LIMIT 2`, [pid]).map((r) => r.s),
  });
  return rows.map((r) => ({ ...r, person: sideInfo(r.person_id), candidate: sideInfo(r.candidate_person_id) }));
}

// ---- Reports ---------------------------------------------------------------

function bhRoster({ month, service }) {
  const rows = db.all(
    `SELECT b.raw_name, b.extra_json, p.id AS person_id, p.display_name,
       (SELECT COUNT(*) FROM event_report e WHERE e.person_id = b.person_id AND e.event_month = b.report_month AND e.is_exact_duplicate = 0) AS events,
       (SELECT GROUP_CONCAT(DISTINCT b2.service) FROM bh_enrollment b2 WHERE b2.person_id = b.person_id AND b2.report_month = b.report_month) AS services,
       (SELECT COUNT(*) FROM bh_enrollment b3 WHERE b3.person_id = b.person_id AND b3.service = b.service AND b3.report_month = ?) AS in_prev
     FROM bh_enrollment b LEFT JOIN person p ON p.id = b.person_id
     WHERE b.report_month = ? AND b.service = ? AND COALESCE(p.is_test, 0) = 0
     ORDER BY COALESCE(p.last_name, b.raw_name), p.first_name`, [prevMonth(month), month, service]);
  return rows.map((r) => ({
    ...r,
    extra: JSON.parse(r.extra_json || "{}"),
    isNew: r.in_prev === 0,
    alsoIn: (r.services || "").split(",").filter((s) => s && s !== service),
  }));
}

module.exports = {
  FLAGS, prevMonth, months, partialMonths, meta, bhDashboard, incidentsSummary, incidentList, behavioralMetrics,
  overview, peopleList, personDetail, reviewQueue, bhRoster,
};
