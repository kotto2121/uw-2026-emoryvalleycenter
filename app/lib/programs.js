/**
 * app/lib/programs.js — the program catalog, straight from EVC's
 * "Data Metrics" goals. `status: "live"` programs have working dashboards;
 * the rest render as roadmap pages listing each metric and the data source
 * it will need — so leadership can see the whole plan, not just the MVP.
 */
export const PROGRAMS = [
  {
    slug: "behavioral-health", name: "Behavioral Health", status: "live", href: "/behavioral-health", icon: "brain",
    source: "PHS event report (.xlsx) + monthly BH roster (.docx)",
    metrics: ["Number of hospitalizations", "Number of police interventions", "Number of crisis calls", "Number of property damage events", "Number of people in PSR", "Number of people in OP", "Number of people with BCBA services"],
  },
  {
    slug: "incidents", name: "Incidents & Safety", status: "live", href: "/incidents", icon: "shield",
    source: "PHS New Reportable Event Report (.xlsx)",
    metrics: ["Events by month", "Reportable vs non-reportable", "Injury level", "Event location", "Interventions (911, EMT, ER…)", "Events by site/home"],
  },
  {
    slug: "census", name: "Rolling Census", status: "planned", icon: "users",
    source: "PHS client demographics export",
    metrics: ["People served by program", "Age bands (incl. children served)", "County", "Zip code", "Other demographics"],
  },
  {
    slug: "evc-homes", name: "EVC-Owned Homes", status: "planned", icon: "home",
    source: "Housing spreadsheet (Excel)",
    metrics: ["Number of people receiving services", "Number of accessible homes", "Number of vouchers"],
  },
  {
    slug: "early-learning", name: "Early Learning Center / Little Learning Lab", status: "planned", icon: "sprout",
    source: "ELC enrollment spreadsheet (Excel)",
    metrics: ["Number of vouchers", "Number of scholarships", "Children kindergarten ready", "Children working with the Inclusion Specialist", "Children identified with Child Find", "Children with disabilities"],
  },
  {
    slug: "employment", name: "Employment Services", status: "planned", icon: "briefcase",
    source: "Employment Services tracker (Excel)",
    metrics: ["Number of people employed", "Tenure at jobs", "Wages at jobs", "Hours worked", "Number of job sites", "Number of volunteer sites", "Hours spent volunteering"],
  },
  {
    slug: "voc-rehab", name: "Vocational Rehab", status: "planned", icon: "target",
    source: "VR case tracker (Excel)",
    metrics: ["Number of people served", "Number of successful closures"],
  },
  {
    slug: "early-intervention", name: "Early Intervention", status: "planned", icon: "baby",
    source: "EI / TRIAD tracker (Excel)",
    metrics: ["Number diagnosed with autism through TRIAD", "Number exiting but still needing services"],
  },
  {
    slug: "maps", name: "Medicaid Alternative Pathways to Independence", status: "planned", icon: "route",
    source: "MAPs tracker (Excel)",
    metrics: ["Number of milestones met", "Number of people supported", "Number of graduates", "Moved on to ECF services vs. not"],
  },
  {
    slug: "enabling-tech", name: "Enabling Technology", status: "planned", icon: "cpu",
    source: "Enabling Technology log (Excel)",
    metrics: ["Number of people using enabling technology", "Kinds of technology in use"],
  },
  {
    slug: "family-support", name: "Family Support", status: "planned", icon: "heart",
    source: "Family Support roster (Excel)",
    metrics: ["Number of people served", "Demographics of people served"],
  },
  {
    slug: "human-rights", name: "Human Rights", status: "planned", icon: "scale",
    source: "Human Rights Committee log (Excel)",
    metrics: ["People with Rep Payees (and how many reviewed)", "People with Conservators (and how many reviewed)", "Rights restrictions and reasons", "Lifted rights restrictions", "True restrictions vs. housemate-related"],
  },
  {
    slug: "pay", name: "Pay & Workforce", status: "planned", icon: "wallet", restricted: true,
    source: "Paylocity exports (Excel/CSV) — HR access only",
    metrics: ["DSP pay with tenure", "Teacher pay with tenure", "Frontline supervisor pay by department", "Mentoring with retention", "Number of people taking benefits"],
  },
  {
    slug: "discharges", name: "Discharges", status: "planned", icon: "logout",
    source: "PHS discharge export",
    metrics: ["Number of people discharged", "Discharge reasons"],
  },
  {
    slug: "surveys", name: "Surveys", status: "planned", icon: "clipboard",
    source: "Survey tool exports (Excel/CSV)",
    metrics: ["Annual family survey", "Exit survey", "7-day survey", "30-day survey", "90-day survey", "Employee pulse survey"],
  },
];

export const programBySlug = (slug) => PROGRAMS.find((p) => p.slug === slug);
