// Crisis & safety indicators shown as tiles on Behavioral Health and Incidents & Safety.
// [flag, label, is a Data Metric Goal, how it's counted] — full definitions in docs/metrics.md
export const INDICATORS = [
  ["f_hospitalization", "Hospitalizations", true, "“Psychiatric Admission…” (behavioral) or a “Hospitalization – Medical/Psychiatric” intervention. ER visits are counted separately."],
  ["f_police", "Police involvement", true, "“Engagement with Law Enforcement”, the “Police” intervention, or “Incarceration”."],
  ["f_crisis", "Crisis events", true, "Any “Behavioral Crisis requiring …” option, or Mobile Crisis / MH Mobile Crisis Team involvement."],
  ["f_property_damage", "Property damage", true, "“Property Destruction exceeding $100”, plus narrative mentions of property damage."],
  ["f_er", "ER visits", false, "“Emergency Room Visit” or “Hospital Emergency Room”."],
  ["f_911", "911 calls", false, "“911 Call” intervention."],
  ["f_self_injury", "Self-injury / suicide attempt", false, "“Self-Injurious Behavior” or “Suicide Attempt” only."],
  ["f_restraint", "Restrictive interventions", false, "Manual/mechanical restraint, protective equipment, or emergency psychotropic medication."],
];
