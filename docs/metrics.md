# Metrics and definitions

Every number Greenhouse shows, how it's counted, and where it comes from. The counting rules live in code: `db/classify.js` (indicator definitions), `api/lib/queries.js` (dashboards) and `api/lib/reports.js` (Excel reports). If anything here disagrees with the code, the code is what runs, so update this page.

## General rules (apply everywhere)

| Rule | Detail |
|---|---|
| **Records vs. people** | "Events" and "records" count rows in the PHS export. "People" counts distinct people in the [person registry](person-matching.md). One person can have many records. |
| **Exact duplicates excluded** | A row that is identical in all 14 fields to an earlier row *in the same file* is flagged `is_exact_duplicate` and left out of every count, unless you turn on **Include exact duplicate rows** on the Incidents page. We can't tell a double-entry from two genuinely identical events. In real exports about 5–8% of rows are exact duplicates. |
| **Blank ≠ none** | Blank fields are shown as "Not recorded" / "No Data Reported", never folded into "No Injury" and similar values. |
| **Months** | Event month comes from **Date Of Event**. Roster month is the month chosen at import (default: the "Updated …" date in the document). |
| **Incomplete month** | The *newest* event month is marked incomplete if its last event date is more than 5 days before month end, meaning the export was pulled mid-month. Incomplete months still appear in trends but are skipped as "this month" in KPI tiles and comparisons. |
| **Month-over-month deltas** | Compare with the calendar month before. Green/red only where "better" is obvious (fewer incidents is green, more clients served is green). |

## Behavioral Health (needs the Word roster)

| Metric | Definition |
|---|---|
| **People in OP** | Distinct people listed in any Individual Therapy (OP) table that month. |
| **People in PSR** | Distinct people in any Psychosocial Rehabilitation table that month, including the 1:1 PSR table. |
| **Receiving both** | People in both OP and PSR that month. |
| **BH clients with an incident** | Roster people that month who have at least one event record in the same month, linked through the person registry. |
| **Incident records involving BH clients** | Event records that month for people on that month's roster. |
| **New vs. last month** (reports) | On this service's roster this month but not the previous month. |
| **Incidents** (reports) | That person's event records in the same month. |

The **Additional Caseload** table is not counted until EVC decides what it represents (see [open questions](limitations-and-open-questions.md)).

## Safety indicators (from the PHS export; no roster needed)

Each indicator is a yes/no flag on an event record. It is set when the record's Tier 1, Tier 2, Behavioral/Psychiatric, Medical, Other Event Types or Event Interventions text contains one of the listed options. Counts are **event records with the flag**, not individual options.

| Indicator | Counted when the record contains… | Data Metric Goal |
|---|---|---|
| **Hospitalizations** | "Psychiatric Admission (for observation) including in an acute care hospital", or any "Hospitalization – Medical/Psychiatric …" intervention. **ER visits are not hospitalizations.** | Behavioral Health: number of hospitalizations |
| **Police involvement** | "Engagement with Law Enforcement", the "Police" intervention, or "Incarceration …". | Behavioral Health: number of police interventions |
| **Crisis events** | Any "Behavioral Crisis requiring …" option (crisis intervention, emergency psychotropic medication, protective equipment/restraints), "Mobile Crisis Services" or "MH Mobile Crisis Team". PHS has no "crisis call" option, so this is the closest equivalent. | Behavioral Health: number of crisis calls (approximation) |
| **Property damage** | "Property Destruction exceeding $100", **or** "property damage / damaged property / destruction of property" in narrative text. Damage under $100 is only caught if a narrative mentions it. | Behavioral Health: number of property damage events |
| **ER visits** | "Emergency Room Visit" or "Hospital Emergency Room". | — |
| **911 calls** | "911 Call". | — |
| **Self-injury / suicide attempt** | "Self-Injurious Behavior" or "Suicide Attempt" only. The broad category "Other - self injurious behaviors; disruptive behaviors" is **not** counted here because it mixes in disruptive behavior; it appears under *Other event types*. | — |
| **Restrictive interventions** | "Manual Restraint", "Mechanical Restraint", "Protective Equipment", "Emergency Psychotropic Medication", or "Behavioral Crisis requiring protective equipment, manual or mechanical restraints…". | Relevant to Human Rights |

**Changing a definition:** edit `FLAG_PATTERNS` in `db/classify.js` and increase `CLASSIFIER_VERSION`. On next start, every stored record is re-classified automatically; there's no need to re-import.

## Incidents & Safety dashboard

| Tile / chart | Definition |
|---|---|
| Event records | Records in the filter range (duplicates excluded). |
| People involved / sites | Distinct people / distinct Site/Home labels. |
| Reportable | Records whose "Non Reportable" column says **Reportable**. (Despite its name, that column holds both values.) |
| Serious injuries | Level of Injury = "Serious Injury". |
| Emergency response | Records with a 911 Call; the hint shows ER visits. |
| Level of injury | No / Minor / Serious / Not recorded. |
| Where events happen | Event Location (top 6 plus "All other"). |
| How events became known | "This incident was / By" (e.g. "Witnessed by Provider Staff"). |
| Interventions, Behavioral/psychiatric, Medical | Multi-select fields split into individual options ([how](data-sources-and-parsing.md#multi-select-fields)). One record can count toward several options. |
| Abuse, neglect & death (Tier 1/2) | Options in the Tier 1 and Tier 2 columns. |
| Other event types | Short PHS categories. Free-text entries are grouped as "Narrative / other entries". |
| Data quality | Duplicate rows and how often key fields are blank. |

## Incident report workbook (Reports page)

The workbook rebuilds the tabs of the manual report workbook. Every tab lists **every PHS option**, including those with 0, plus a "No Data Reported" row for blanks.

| Tab | Content |
|---|---|
| Summary | Period, totals, every safety indicator, incomplete-month notes. |
| Month | Events, reportable, non-reportable and people per month. |
| Site | Events, reportable and serious injuries per Site/Home. |
| Individual | Same, per person. **Contains names.** |
| Tier 1, Tier 2, Behavior, Medical, Requirements | Multi-select options. Requirements = Event Interventions. |
| Other | Known "Other" categories plus "Other (free-text / narrative entry)". |
| Reportable, Discovery, Location, Injury | Single-select fields. |

Not reproduced: the manual workbook's "Type" tab, which depends on an "Incident Types" column that the raw export doesn't contain, and its charts. The dashboards provide the charts.

## Who counts as a BH client

Behavioral is a **person-level** fact: the Behavioral box on a person's page is the only source of truth for every BH number (Behavioral Health dashboard, Behavioral Metrics, Overview). It has no month history, so a past month shows today's boxes. OP / PSR service is not reported — the program reports BH as one group.

The Word roster is optional. Importing one ticks Behavioral for everyone on it whose box was never set by hand; it never unticks anyone. Someone who leaves BH stays counted until their box is unticked. Everything in the app works from the PHS export plus the Behavioral boxes; the OP and PSR monthly reports were dropped from the app.

On the Behavioral Health page, every number — including the Crisis & safety indicators — counts **BH clients only**. Behavioral Metrics has the All / Behavioral / Non-Behavioral split.

## Data Metric Goals coverage

| Program (Data Metric Goals) | Status |
|---|---|
| **Behavioral Health:** hospitalizations, police, crisis, property damage, people in PSR, people in OP | **Live** (definitions above) |
| Behavioral Health: people with BCBA services | Needs a BCBA caseload source |
| **Incidents** (supports Human Rights and Behavioral Health) | **Live** |
| Rolling Census, EVC Homes, Early Learning, Employment, Vocational Rehab, Early Intervention, MAPs, Enabling Technology, Family Support, Human Rights, Pay, Discharges, Surveys | **Planned.** Each has a roadmap page listing its metrics and the source it needs. |
