# Data sources and parsing

How Greenhouse reads each source file, rule by rule. Code references are relative to the repo root.

- [1. PHS event report (.xlsx)](#1-phs-event-report-xlsx)
- [2. Behavioral Health caseload document (.docx)](#2-behavioral-health-caseload-document-docx)
- [3. What happens after parsing](#3-what-happens-after-parsing)
- [4. Test files](#4-test-files)

---

## 1. PHS event report (.xlsx)

**Source:** PHS → "New Reportable Event Report" → Excel export.
**Code:** `api/lib/xlsx-read.js` (reading the workbook), `api/lib/incidents-xlsx.js` (finding and mapping the data), `api/lib/importer.js` (saving it).

### What a real export looks like

- One row per event report, 14 columns (A–N). All values are text, and dates are text in `MM/DD/YYYY` format.
- **No client ID or date of birth.** People are identified only by "Member's Full Name", written `Last, First` in 100% of rows.
- The multi-select columns (Tier 1/2, Behavioral/Psychiatric, Medical, Event Interventions) contain **option labels glued together with no separator**, e.g. `911 CallEMTEmergency Room Visit`.
- About 5–8% of rows are exact duplicates.
- "Other Event Types" mixes short categories with free-text narratives of up to ~4,500 characters, which can contain names.
- Exports may cover one month or many. A sample covered 10 months (5,000 rows), with the newest month only partly complete.
- The file may be a **working workbook** rather than a raw export. One real file had 19 sheets: the export on "All", report tabs, 34 charts, an Excel Table with a date filter, and a hand-edited copy of one month on "Data".

### Step 1: Reading the workbook (`xlsx-read.js`)

Greenhouse uses its own small reader instead of a general Excel library. A real file with an Excel Table and a date-grouped filter crashed the general library (`exceljs`), which tries to understand the whole file. The custom reader only looks at:

- sheet names and the sheet → file mapping (`xl/workbook.xml` and its relationships),
- shared strings (including rich-text runs; phonetic hints are skipped),
- cell values: strings, numbers, inline strings, formula results, booleans (errors such as `#N/A` become blank),
- number formats, to recognise real Excel dates (built-in date formats plus custom codes containing d/m/y; supports the 1904 date system),
- hidden rows (rows hidden by a filter).

Charts, tables, filters, styles, drawings, comments and printer settings are ignored.

### Step 2: Choosing the sheet (`incidents-xlsx.js`)

1. Every sheet is scanned for a **header row** in its first 15 rows. A row qualifies if it contains at least 3 recognised column names **including** "Date Of Event" and "Member's Full Name".
2. If several sheets qualify, the one with the **most data rows** is imported. Ties go to more recognised columns.
3. Every other qualifying sheet is listed in a warning ("Sheet "Data" also looks like event data (351 rows) but was NOT imported"). Only one sheet is ever imported per file, to avoid double-counting.

### Step 3: Mapping columns

Header text is compared ignoring case, spaces and punctuation. Each field accepts the PHS heading or the normalized name from the schema profile:

| Field (database) | Accepted headings |
|---|---|
| `event_date` | Date Of Event, event_date, Event Date |
| `member_full_name` | Member's Full Name, member_full_name, Member Name, Full Name |
| `tier_1_events` / `tier_2_events` | Tier 1 Events / Tier 2 Events |
| `behavioral_psychiatric_events` | Behavioral/Psychiatric Events |
| `medical_events` | Medical Events |
| `other_event_types` | Other Event Types |
| `reportability_status` | **Non Reportable** (holds both "Reportable" and "Non-Reportable"), Reportable |
| `incident_observation_and_source` | This incident was / By |
| `event_location` | Event Location |
| `event_interventions` | Event Interventions |
| `site_home` | Site/Home, Site, Home |
| `injury_description` | Injury Description |
| `injury_level` | Level of Injury, Injury Level |

- Column order doesn't matter, and extra columns are ignored (listed as "unmapped headers").
- A missing optional column produces a warning and stays blank.
- If the same heading appears twice, only the first is used.

### Step 4: Cleaning values

| Rule | Detail |
|---|---|
| Blanks | Empty and whitespace-only cells become `NULL`. Non-breaking spaces count as spaces. |
| Placeholders | `No Data Reported` / `*No Data Reported` (from hand-edited copies) become `NULL`. |
| Trimming | Leading and trailing whitespace is trimmed. Internal spelling and capitalisation are kept. |
| Dates | `MM/DD/YYYY` or `M/D/YY` text, real Excel dates, Excel serial numbers, or ISO `YYYY-MM-DD`. Stored as `YYYY-MM-DD`. Unreadable dates are kept with no month and counted in a warning. |
| Numbers in text fields | Converted to text (one real injury description was a number). |
| Hidden rows | Imported anyway. The warning says how many rows a filter had hidden. |

### Step 5: De-duplication and re-import safety (`importer.js`)

- Each row gets a fingerprint: a SHA-1 hash of all 14 cleaned fields **plus how many times that exact row has already appeared in this file** (1st, 2nd …).
- If the fingerprint is already in the database, the row is skipped ("already imported"). So re-importing the same file adds nothing, and an overlapping export (e.g. Jan–Mar, then Feb–Apr) only adds the new rows.
- The 2nd and later copies of an identical row within one file are stored but flagged `is_exact_duplicate = 1` and excluded from counts by default.
- Rows with the same date, person and site but different details are separate events and are kept.

### Multi-select fields

Tier 1, Tier 2, Behavioral/Psychiatric, Medical and Event Interventions hold several option labels glued together. They're split using **option dictionaries** in `db/classify.js`. The dictionaries come from the complete PHS option lists in Kristen's report workbook tabs (Requirements, Behavior, Medical, Other, Tier 1, Tier 2) plus every value seen in real exports.

- **Longest match first.** Each dictionary label is searched for, longest first, and removed from the text. Longest-first matters because some labels contain others: "Alleged Financial Exploitation Exceeding $1,000" contains "Alleged Financial Exploitation", and "Psychiatric Admission (for observation) including in an acute care hospital" contains "Psychiatric Admission".
- **Unrecognised text.** Anything left over is counted as "Unrecognized option", and the import summary lists those fragments ("Add them to db/classify.js").
- **Indicators don't depend on splitting.** The yes/no safety indicators search the text with patterns, so they work even if a new option isn't in the dictionary yet.
- "Housemate" and "Staff" in the behavioral field are sub-choices (who was targeted), not event types. They're excluded from the workbook's Behavior tab.

### Step 6: Classification

Each saved row gets yes/no indicator flags (`f_hospitalization`, `f_police`, `f_crisis` …) and `is_reportable`. See [metrics.md](metrics.md#safety-indicators-from-the-phs-export-no-roster-needed) for the definitions. Flags are recomputed for **all** stored rows on startup whenever `CLASSIFIER_VERSION` changes, and new flag columns are added to the database automatically.

---

## 2. Behavioral Health caseload document (.docx)

**Source:** the monthly Word document "Behavioral Health — Caseloads — Updated <date>", sent by email.
**Code:** `api/lib/docx-tables.js` (`readDocx`, `guessRoster`, `tableEntries`), import step in `api/server.js` (`/api/import/roster/preview` and `/commit`), UI in `app/pages/import.js`.

### What the real document looks like

Learned through the structure-only ChatGPT analysis in [`chatgpt-outputs/Prompt_A_document_structure.json`](chatgpt-outputs/Prompt_A_document_structure.json):

```
Behavioral Health
Caseloads
Updated <date>

<Staff> — Total: 24 (Psychosocial Rehabilitation-PSR)      ← heading = service + staff + count
┌───────────────────────────────┬────────────────┬─────────────────────────────────┐
│ Mon, Wed, Fri (9:00AM-11:00AM)│                │                                 │ ← schedule row (not a client)
│ <site>                        │ Weekly         │ First Last                      │ ← client row
│ <site>                        │ Bi-weekly      │ First Last                      │
│ Mon, Wed, Fri (9:00AM-11:00AM)│ (One per Week) │ Total: 24 (Psychosocial Rehab…) │ ← summary row (not a client)
│ <site>                        │                │                                 │ ← blank template row
└───────────────────────────────┴────────────────┴─────────────────────────────────┘
… four PSR tables (one per staff member) …
Therapist: <Staff> — Total: 26 (Individual Therapy)          ← OP tables (three)
1:1 (Psychosocial Rehabilitation-PSR)                         ← header row: Site | Frequency | <staff> | (blank); names in 2 columns
Additional Caseload: As of <date>                             ← header row = two staff names; names in both columns,
                                                                 some with " - STATUS" after the name; service not stated
… contact procedures (paragraphs, ignored) …
```

- 9 tables, no client ID or date of birth, names written `First Last`.
- About 12 people appear in both OP and PSR.
- Some tables have merged cells (`gridSpan`).
- The document also contains staff names and phone numbers in its procedure paragraphs. These are never imported.

### Step 1: Reading the document (`readDocx`)

A `.docx` is a zip file, and the body is `word/document.xml`. A small tag scanner walks paragraphs and tables **in document order**:

- Paragraph text joins all its text runs. Tabs and line breaks are kept as whitespace.
- Table cells are physical `<w:tc>` elements, so a merged cell counts once and isn't duplicated.
- Nested tables are flattened into the cell that contains them.
- Text boxes, images, headers and footers are not read.
- `.doc` (Word 97–2003) is not supported. Save it as `.docx` first.

### Step 2: Interpreting each table (`guessRoster`)

For every table, the **heading** is the nearest non-empty paragraph above it.

| Decision | Rule |
|---|---|
| **Report month** | The first date found in the document's paragraphs: "October 2026", "October 28, 2026", "Oct. 2026", "10/28/2026", "10/2026", "2026-10-28". Falls back to the file name. The user can change it in the preview. |
| **Service** | From the heading: "Psychosocial", "PSR" → **PSR**. "Individual Therapy", "Therapy", "Therapist", "Outpatient", "OP" → **OP**. If the heading says neither, the table's own text is checked. "Additional Caseload" is **never** assigned a service automatically. |
| **Staff** | From the heading: strip "Therapist:", then take the text before "—", "Total:", "(" or "caseload". "1:1" and "Additional" are not staff names. In header-row tables, a name-like column header is used as that column's staff (1:1 and Additional Caseload). |
| **Expected total** | "Total: N" in the heading. The preview compares it with the number of clients found. |
| **Header row?** | Yes if the first row has a recognised header cell ("Site", "Frequency", "Client Name", "Member's Full Name" …; **the whole cell** must be the header phrase), or if it's the Additional Caseload table. Otherwise there's no header row, which is normal for this document. |
| **Schedule / summary rows** | Skipped if any cell contains a weekday followed by a time ("Mon, Wed, Fri (9:00AM…") or "Total:". |
| **Name-like cell** | `First Last`, `First M. Last`, `Last, First` (letters, apostrophes, hyphens, periods; 2–4 words; no digits or parentheses) **or** a de-identified token such as `Member 104` / `Person 2973` (one word + number). Frequencies ("Weekly", "1M", "2x weekly") and schedules are never names. |
| **Name column(s)** | *Header-less tables:* exactly **one**, the **rightmost** column that is at least 80% as name-like as the best column. Site labels in the first column can look like names ("Maple House"), and in EVC's layout the client is always in the last column. *Header-row tables:* every column holding ≥30% of the best column's names, except columns headed Site, Frequency etc. (1:1 → 2 columns; Additional Caseload → 2 columns). *A "Client Name"-style header* overrides everything. |
| **Column labels** | Name column(s) → "Client name"; a column of frequencies → "Frequency"; first column → "Site"; otherwise "Column N". |

### Step 3: Extracting clients (`tableEntries`)

The same function produces the preview counts and the actual import, so the two always agree. For each row that isn't a schedule row, and for each selected name column:

1. Skip the cell if it isn't name-like.
2. Split off a trailing status: `Jane Doe - discharged` becomes name `Jane Doe` and status `discharged`. Only a **spaced** hyphen or dash counts, so `Smith-Jones` stays intact.
3. Keep the other cells as details: Site, Frequency, Staff, Status and Section (the heading).

### Step 4: Saving (`importRoster`)

- One `bh_enrollment` row per (name as written, service, month). The same person on two PSR caseloads counts once for PSR.
- Re-importing the same roster for the same month adds nothing.
- Names go through [person matching](person-matching.md). Roster names (`First Last`) and PHS names (`Last, First`) of the same person link automatically.

### Checking a new layout

If the document's layout changes, the preview shows it straight away: totals that don't match the headings, the wrong service, or names in the wrong column. The user can correct the service and name columns per table before importing. If the change is permanent, update the rules above in `docx-tables.js` and re-run the checks in the [developer guide](developer-guide.md#testing).

---

## 3. What happens after parsing

```
file ─► reader ─► cleaned rows ─► importer ─┬─► person matching (registry, Review Queue)
                                            ├─► classification flags (event reports)
                                            └─► SQLite (one transaction; backup taken first)
```

Each import is one database transaction. If anything fails, nothing is saved. A backup copy of the database is taken before every import, undo or clear.

## 4. Test files

| File | What it is |
|---|---|
| `demo-data/DEMO New Reportable Event Report YYYY-MM.xlsx` | Fictitious exports that mirror the real export's columns, labels and proportions (`npm run demo:files`). |
| `demo-data/DEMO BH Roster YYYY-MM.docx` | Fictitious rosters in the real layout, with deliberate nicknames and typos. |
| `demo-data/DEMO BH Roster 2026-10 (ChatGPT real layout).docx` | ChatGPT's fictitious reproduction of the real document's exact layout (merged cells, blank rows, schedule rows). |
| `scripts/make-roster-from-export.js` | Builds fake rosters whose clients come from a **de-identified** export's tokens, so a real-shaped export and roster can be tested together. Refuses to run if the names don't look de-identified. Output goes to `demo-data/from-export/`, which is git-ignored. |
