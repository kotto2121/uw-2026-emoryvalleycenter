/**
 * db/classify.js — derive dashboard flags from PHS event-report text fields.
 *
 * PHS exports multi-select fields (Event Interventions, Behavioral/Psychiatric
 * Events) as option labels glued together with NO delimiter, e.g.
 * "911 CallEMTEmergency Room Visit". A comma split can't recover them, so:
 *
 *   - Flags are computed by searching the text for patterns (works whatever
 *     the delimiter situation).
 *   - splitOptions() recovers individual labels by longest-match against a
 *     known option dictionary, for "kinds of intervention" breakdowns.
 *
 * IMPORTANT: the dictionaries and patterns below are a first draft built from
 * the deidentified profile (which confirmed "911 Call", "EMT" and
 * "Emergency Room Visit"). Replace/extend them with the real PHS option list
 * (see docs/chatgpt-prompt.md, Task 2) before trusting the numbers.
 */

const INTERVENTION_OPTIONS = [
  "911 Call",
  "EMT",
  "Emergency Room Visit",
  "Police Involvement",
  "Police Called",
  "Hospital Admission",
  "Psychiatric Hospitalization",
  "Mobile Crisis",
  "Crisis Call",
  "Urgent Care Visit",
  "First Aid",
  "Physician Visit",
  "Restraint",
  "N/A",
];

const BEHAVIORAL_OPTIONS = [
  "Physical Aggression",
  "Verbal Aggression",
  "Property Damage",
  "Self Injurious Behavior",
  "Elopement",
  "Suicidal Ideation",
  "Suicide Attempt",
  "Psychiatric Hospitalization",
  "Crisis Call",
  "Mobile Crisis Assessment",
  "Police Involvement",
];

/** Flag name -> pattern searched across all classification + intervention text. */
const FLAG_PATTERNS = {
  f_911: /911/i,
  f_emt: /\bEMT|\bEMS\b|ambulance/i,
  f_er: /emergency room|emergency department|\bER visit|\bED visit/i,
  f_hospitalization: /hospitaliz|hospital admission|admitted to (the )?hospital|inpatient/i,
  f_police: /police|law enforcement|sheriff|officer/i,
  f_crisis: /crisis/i,
  f_property_damage: /property damage|damag(ed|ing) property|destruction of property/i,
  f_self_injury: /self[\s-]*injur/i,
};

/** The text fields searched for flags (narratives included on purpose). */
const FLAG_SOURCE_FIELDS = [
  "tier_1_events",
  "tier_2_events",
  "behavioral_psychiatric_events",
  "medical_events",
  "other_event_types",
  "event_interventions",
];

function computeFlags(row) {
  const text = FLAG_SOURCE_FIELDS.map((f) => row[f] || "").join(" • ");
  const flags = {};
  for (const [flag, re] of Object.entries(FLAG_PATTERNS)) flags[flag] = re.test(text) ? 1 : 0;
  const rs = (row.reportability_status || "").toLowerCase();
  flags.is_reportable = rs.startsWith("non") ? 0 : rs.startsWith("reportable") ? 1 : null;
  return flags;
}

/**
 * Split a delimiter-less concatenation into known options (longest match
 * first). Text that matches nothing is returned in `unparsed`.
 */
function splitOptions(text, dictionary = INTERVENTION_OPTIONS) {
  const found = [];
  let rest = String(text || "");
  const sorted = [...dictionary].sort((a, b) => b.length - a.length);
  for (const opt of sorted) {
    const re = new RegExp(opt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    if (re.test(rest)) {
      found.push(opt);
      rest = rest.replace(re, " ");
    }
  }
  const unparsed = rest.replace(/[\s,;|/]+/g, " ").trim();
  return { options: found, unparsed: unparsed || null };
}

module.exports = {
  INTERVENTION_OPTIONS,
  BEHAVIORAL_OPTIONS,
  FLAG_PATTERNS,
  computeFlags,
  splitOptions,
};
