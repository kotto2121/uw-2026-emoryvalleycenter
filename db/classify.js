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
 * The dictionaries below come from EVC's real export (via the ChatGPT
 * structure-only analysis in docs/chatgpt-outputs/). The export can only show
 * options that were actually selected; confirm the full list on the PHS form.
 */

/**
 * Bump when the dictionaries or patterns change: on startup, every stored
 * event row is re-classified so dashboards always reflect the current rules.
 */
const CLASSIFIER_VERSION = 3;

/*
 * Option dictionaries. Sources:
 *  - Kristen's report workbook: its Requirements / Behavior / Medical / Other /
 *    Tier 1 / Tier 2 tabs list every option on the PHS form (incl. unselected ones).
 *  - Values actually seen in exports (docs/chatgpt-outputs/, sample workbook).
 * Some labels exist in a short form (report tab) and a long form (export), e.g.
 * "Choking episode" vs "Choking episode requiring medical intervention"; both
 * are listed so splitting works either way (longest match wins).
 */
const INTERVENTION_OPTIONS = [
  "911 Call", "EMT", "Emergency Room Visit", "Hospital Emergency Room", "Urgent Care Facility", "Fire Department",
  "Police", "Incarceration", "Incarceration Admission", "Incarceration Discharge",
  "Mobile Crisis Services", "MH Mobile Crisis Team",
  "CPR", "Automated External Defibrillator (AED)/CPR",
  "Abdominal Thrust/Back Blows/Heimlich Maneuver", "Abdominal Thrust (Heimlich)",
  "X-ray (to rule out fracture)", "X-Ray to rule out fracture",
  "Emergency Psychotropic Medication", "Administration of PRN Psychotropic Medication",
  "Manual Restraint", "Mechanical Restraint", "Protective Equipment",
  "Hospitalization - Medical", "Hospitalization - Psychiatric",
  "Hospitalization – Medical (Planned or Unplanned) Admission", "Hospitalization – Psychiatric Admission",
  "Hospitalization – Medical Discharge", "Hospitalization – Psychiatric Discharge",
  "Assisted Care Living Facility Admission", "Assisted Care Living Facility Discharge",
  "Skilled Nursing Facility Admission", "Skilled Nursing Facility Discharge",
  "ICF/IID Admission", "ICF/IID Discharge",
];

const BEHAVIORAL_OPTIONS = [
  "Behavioral Crisis requiring crisis intervention",
  "Behavioral Crisis requiring emergency psychotropic medication",
  "Behavioral Crisis requiring protective equipment, manual or mechanical restraints, regardless of type or time used or approved by plan of care",
  "Engagement with Law Enforcement",
  "Criminal Conduct or Probable Criminal Conduct",
  "Physical Aggression",
  "Sexual Aggression",
  "Property Destruction exceeding $100",
  "Psychiatric Admission (for observation) including in an acute care hospital",
  "Psychiatric Admission",
  "Reportable Behavior involving physical aggression and/or self-injurious behavior resulting in injury to another person",
  "Self-Injurious Behavior",
  "Suicide Attempt",
  // Sub-choices (who was targeted), not event types:
  "Housemate",
  "Staff",
];

const MEDICAL_OPTIONS = [
  "UTI", "Skin Infection", "Cellulitis", "MRSA", "Sepsis", "Pneumonia", "Flu", "Fecal Impaction",
  "Severe Dehydration requiring medical treatment by a medical professional", "Severe Dehydration",
  "Severe Allergic Reaction requiring medical treatment by a medical professional", "Severe Allergic Reaction",
  "Choking episode requiring medical intervention", "Choking episode",
  "Seizure Progressing to Status Epilepticus",
  "Pressure Ulcer/Decubitus Ulcer",
  "Insect or animal bite",
  "Serious Injury of Known Cause",
  "Deaths (other than those that are unexpected/unexplained)",
];

const TIER_OPTIONS = [
  "Alleged Emotional/Psychological Abuse",
  "Alleged Physical Abuse",
  "Alleged Sexual Abuse",
  "Alleged Neglect",
  "Alleged Exploitation of a Person Supported",
  "Alleged Financial Exploitation Exceeding $1,000",
  "Alleged Exploitation Exceeding $1,000",
  "Alleged Financial Exploitation",
  "Death-Unexpected and/or Unexplained",
  "Serious Injury of Unknown Cause",
  "Suspicious Injury",
];

// Single-select fields: full option lists (from Kristen's report tabs + exports),
// used so report tables show every option, including zeros.
const LOCATION_OPTIONS = ["Home - Inside", "Home - Outside", "Community - Supervised", "Community - Unsupervised", "Day Program / Work / School", "Volunteer Site", "Vehicle", "Unknown"];
const INJURY_OPTIONS = ["No Injury", "Minor Injury", "Serious Injury"];
const OBSERVATION_OPTIONS = [
  "Witnessed by Provider Staff", "Discovered by Provider Staff",
  "Witnessed by Therapy Personnel", "Discovered by Therapy Personnel",
  "Witnessed by Medical Personnel", "Discovered by Medical Personnel",
  "Witnessed by DIDD/TennCare Staff", "Discovered by DIDD/TennCare Staff",
  "Witnessed by Other Service Provider", "Discovered by Other Service Provider",
  "Witnessed by Person Supported/Other Persons Supported", "Discovered by Person Supported/Other Persons Supported",
  "Witnessed by Family Member", "Discovered by Family Member",
  "Witnessed by Conservator/Legal Representative", "Discovered by Conservator/Legal Representative",
  "Witnessed by Law Enforcement", "Discovered by Law Enforcement",
  "Witnessed by APS/DCS", "Discovered by APS/CPS",
  "Witnessed by Private Citizen", "Discovered by Private Citizen",
  "Witnessed by Other", "Discovered by Other",
];
const OTHER_OPTIONS = [
  "Other - self injurious behaviors; disruptive behaviors", "Other - Aggression", "Other - medical",
  "Falls with injury", "Minor – Vehicle accident while transporting person", "Serious – Vehicle accident",
  "Medication Variance and Omission", "Missing Person (>1 hour)", "Unsafe Environment", "Emergency Situations",
  "Enabling Technology Remote Supports", "Positive COVID-19 Test Result", "Victim of Fire",
  "Administration of Routine Psychotropic Medication without Consent",
];

/**
 * Flag name -> pattern searched across the classification + intervention text.
 * These are the definitions behind every dashboard tile (see docs/metrics.md):
 *  - hospitalization: psychiatric admission (behavioral field) OR a medical/psychiatric
 *    hospitalization intervention. ER visits are NOT hospitalizations.
 *  - police: Engagement with Law Enforcement, the Police intervention, or Incarceration.
 *  - crisis: any "Behavioral Crisis requiring …" option or Mobile Crisis / MH Mobile
 *    Crisis Team involvement (PHS has no "crisis call" option).
 *  - property damage: the "Property Destruction exceeding $100" option, plus narrative
 *    mentions in "Other Event Types".
 *  - self-injury: "Self-Injurious Behavior" or "Suicide Attempt" only; the broad
 *    "Other - self injurious behaviors; disruptive behaviors" category is reported separately.
 *  - restraint: restrictive interventions (manual/mechanical restraint, protective
 *    equipment, emergency psychotropic medication).
 */
const FLAG_PATTERNS = {
  f_911: /911 Call/i,
  f_emt: /EMT/, // case-sensitive; PHS glues labels together ("911 CallEMTEmergency…")
  f_er: /Emergency Room Visit|Hospital Emergency Room/i,
  f_hospitalization: /Psychiatric Admission|Hospitalization|hospitaliz|hospital admission/i,
  f_police: /Engagement with Law Enforcement|Police|Incarceration/i,
  f_crisis: /Behavioral Crisis requiring|Mobile Crisis/i,
  f_property_damage: /Property Destruction|property damage|damag(ed|ing) (the )?property|destruction of property|destroyed property/i,
  f_self_injury: /Self-Injurious Behavior|Suicide Attempt/,
  f_restraint: /Manual Restraint|Mechanical Restraint|Protective Equipment|Emergency Psychotropic Medication|emergency psychotropic medication|restraints?, regardless/i,
};

/**
 * Keyword categories for "Other Event Types", which mixes PHS short categories
 * with free text, typos and case variants, so an option list can't split it.
 * Labels and terms follow EVC's Behavioral Reporting workbook (its Other tab),
 * so the counts can be checked against it. One event can match several.
 */
const OTHER_CATEGORIES = [
  ["Self-injurious behaviors", /self[- ]?injur/i],
  ["Disruptive behaviors", /disruptive/i],
  ["Aggression", /aggress/i],
  ["Screaming", /scream/i],
  ["Agitation", /agitat/i],
  ["Vehicle accident", /vehicle accident/i],
  ["Falls with injury", /falls? with injury/i],
  ["Medication Variance", /medication variance/i],
  ["Unsafe Environment", /unsafe environment/i],
  ["Missing Person", /missing person/i],
  ["Emergency Situations", /emergency situation/i],
  ["Positive COVID-19", /covid/i],
  ["Victim of Fire", /victim of fire/i],
  ["Routine Psychotropic Medication", /routine psychotropic/i],
  ["Enabling Technology Remote Supports", /enabling technology|remote support/i],
];

/** -> labels of every category whose pattern matches the text. */
function categorize(text, categories) {
  const s = String(text || "");
  return categories.filter(([, re]) => re.test(s)).map(([label]) => label);
}

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
  CLASSIFIER_VERSION,
  TIER_OPTIONS,
  MEDICAL_OPTIONS,
  LOCATION_OPTIONS,
  INJURY_OPTIONS,
  OBSERVATION_OPTIONS,
  OTHER_OPTIONS,
  INTERVENTION_OPTIONS,
  BEHAVIORAL_OPTIONS,
  FLAG_PATTERNS,
  OTHER_CATEGORIES,
  computeFlags,
  splitOptions,
  categorize,
};
