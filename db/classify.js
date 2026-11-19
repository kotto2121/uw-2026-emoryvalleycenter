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
const CLASSIFIER_VERSION = 2;

// Real PHS option labels recovered from EVC's export (docs/chatgpt-outputs/
// Prompt_C_event_option_labels.json + Option_label_verification.json).
// Labels marked "inferred" were only seen inside concatenated cells; confirm
// them against the PHS form before relying on them.
const INTERVENTION_OPTIONS = [
  "911 Call",
  "EMT",
  "Emergency Room Visit",
  "Police",
  "Mobile Crisis Services",
  "Urgent Care Facility",
  "Abdominal Thrust/Back Blows/Heimlich Maneuver",
  "Administration of PRN Psychotropic Medication", // inferred
  "Fire Department", // inferred
  "X-ray (to rule out fracture)", // inferred
];

const BEHAVIORAL_OPTIONS = [
  "Behavioral Crisis requiring crisis intervention",
  "Engagement with Law Enforcement",
  "Physical Aggression",
  "Psychiatric Admission (for observation) including in an acute care hospital", // inferred
  "Reportable Behavior involving physical aggression and/or self-injurious behavior resulting in injury to another person", // inferred
  "Self-Injurious Behavior", // inferred
  "Suicide Attempt", // inferred
  // "Housemate" / "Staff" appear to be sub-choices (who was targeted), not event types.
  "Housemate",
  "Staff",
];

const TIER_OPTIONS = [
  "Alleged Emotional/Psychological Abuse",
  "Alleged Physical Abuse",
  "Alleged Sexual Abuse",
  "Alleged Neglect",
  "Death-Unexpected and/or Unexplained",
];

/**
 * Flag name -> pattern searched across the classification + intervention text.
 * Mapping agreed from Prompt C's dashboard_mapping, with its cautions:
 *  - hospitalization: psychiatric admission only (Medical Events is blank in the
 *    export, so medical admissions are NOT captured).
 *  - crisis: a behavioral crisis event OR Mobile Crisis involvement (not proof a
 *    phone call happened).
 *  - property damage: PHS has no option for it; only narrative mentions in
 *    "Other Event Types" are counted, so treat as a floor, not a total.
 *  - self-injury: the strict labels only; the broad "Other - self injurious
 *    behaviors; disruptive behaviors" category is reported separately.
 */
const FLAG_PATTERNS = {
  f_911: /911 Call/i,
  f_emt: /EMT/, // case-sensitive; PHS glues labels together ("911 CallEMTEmergency…")
  f_er: /Emergency Room Visit/i,
  f_hospitalization: /Psychiatric Admission|hospitaliz|hospital admission/i,
  f_police: /Engagement with Law Enforcement|Police/i,
  f_crisis: /Behavioral Crisis requiring crisis intervention|Mobile Crisis/i,
  f_property_damage: /property damage|damag(ed|ing) (the )?property|destruction of property|destroyed property/i,
  f_self_injury: /Self-Injurious Behavior|Suicide Attempt/,
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
  CLASSIFIER_VERSION,
  TIER_OPTIONS,
  INTERVENTION_OPTIONS,
  BEHAVIORAL_OPTIONS,
  FLAG_PATTERNS,
  computeFlags,
  splitOptions,
};
