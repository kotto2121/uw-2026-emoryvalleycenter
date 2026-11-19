# Prompts for EVC's ChatGPT (run on Kristen's laptop)

These prompts get the hackathon team the **structure** of EVC's real files
without any protected health information (PHI) leaving Kristen's laptop. Run
them in EVC's HIPAA-compliant ChatGPT workspace, which EVC's AI policy covers.

**Rules for whoever runs these:**

1. Start a **new chat** for this work. Don't reuse a chat that already has other client data in it.
2. Only copy back to the team what the prompts ask for: JSON structure, counts, option labels, and the *fake* Word document.
3. Before sharing any output, Kristen reads it once and checks for real names, initials, dates of birth, addresses, or narrative text. If any appear, delete them and don't share that part.
4. Paste each prompt **as-is**. Each one already contains the "no names" instructions.

---

## Before you start: getting ChatGPT to read the Word document

Last time ChatGPT couldn't open a `.docx` because no document viewer was available. Try these in order:

1. **Upload the `.docx` and use Prompt A.** It tells ChatGPT to read the file with Python (`python-docx`) in its analysis tool, so no viewer is needed. This works if *Data analysis / Code interpreter* is enabled in EVC's workspace.
2. If that fails, in Word use **File → Save As → PDF**, upload the PDF, and run Prompt A again.
3. If uploads don't work at all, open the Word doc, select the tables, **copy**, paste them into the chat, then run Prompt A.

---

## Prompt A: describe the monthly Behavioral Health Word document (structure only)

> Attach: the monthly behavioral health Word document (the one listing outpatient and PSR clients).

```text
You are helping a nonprofit's volunteer software team build a local tool that reads a monthly Word document. The document contains protected health information. The team must NOT see any client information. Your job is to describe the document's STRUCTURE only.

STRICT PRIVACY RULES — follow them in every part of your answer:
- Never output any person's name, initials, date of birth, address, phone, ID number, diagnosis, or any free-text cell content.
- Never quote a cell that contains information about a person. You MAY quote column headers, section headings, and labels such as "Outpatient", "PSR", or month names.
- When describing name formats, use made-up placeholders such as "Lastname, Firstname" or "Firstname M. Lastname", never real examples.
- Report counts, not lists of people.

How to read the file: if the attachment is a .docx, use your Python / data-analysis tool with the python-docx library (from docx import Document; iterate doc.element.body in order so you see paragraphs and tables in document order; for each table read every row's cell text). Do not rely on a document viewer. If it is a PDF or pasted text, read it directly.

Produce ONE JSON object (no other prose) with exactly this shape:

{
  "file_type": "docx | pdf | pasted",
  "page_or_section_count": <number>,
  "report_month_signal": "where the month/period appears (e.g. 'title paragraph: <Month> <Year>', 'header', 'filename', 'none')",
  "document_outline": [
    // every heading/paragraph and table IN ORDER. For paragraphs give only generic heading text (no names). For tables give the summary below.
    {"type": "paragraph", "text": "<heading text, or '[paragraph about a person - omitted]'>"},
    {"type": "table", "table_index": 0,
     "heading_just_before": "<generic heading text or null>",
     "service_it_lists": "OP | PSR | both (per-row column) | other: <label> | unclear",
     "how_service_is_indicated": "separate table under heading | column named <header> | other: ...",
     "column_headers": ["<exact header text>", "..."],
     "has_header_row": true,
     "data_row_count": <number>,
     "name_column_header": "<header of the column with the person's name>",
     "name_formats_seen": {"Lastname, Firstname": <count>, "Firstname Lastname": <count>, "Lastname, Firstname M.": <count>, "Firstname M. Lastname": <count>, "ALL CAPS": <count>, "includes suffix (Jr/Sr/II)": <count>, "includes nickname in quotes or parentheses": <count>, "other": <count>},
     "multiple_names_in_one_cell": <count of cells>,
     "names_split_across_two_columns": true/false,
     "merged_cells": true/false,
     "blank_rows": <count>,
     "repeated_header_rows": <count>,
     "other_columns": [{"header": "<exact header>", "kind": "date | staff name | frequency | status | ID number | free text | other", "fill_rate_percent": <0-100>}]
    }
  ],
  "identifiers_present": {
     "client_id_or_mrn": "yes - column '<header>' | no",
     "date_of_birth": "yes - column '<header>' | no",
     "medicaid_or_insurance_id": "yes - column '<header>' | no",
     "other_unique_id": "describe or 'no'"
  },
  "same_person_listed_more_than_once": {"within_a_table": <count>, "in_both_OP_and_PSR": <count>},
  "parsing_gotchas": ["anything that would trip up an automated parser, e.g. tables split across pages, text boxes, images of tables, footnotes, tracked changes, nested tables"]
}

After the JSON, add a short checklist titled "Privacy check" confirming that you did not include any names, initials, dates of birth, IDs, or free-text cell contents.
```

---

## Prompt B: make a FAKE Word document with the identical layout

Run this **in the same chat, right after Prompt A**, so ChatGPT copies the real layout exactly. The names below are invented. The team's demo Excel data uses the same invented people, so this fake document will exercise the app's name matching.

```text
Now create a FAKE version of that Word document so developers can test their parser without any real data.

Requirements:
1. Reproduce the real document's layout EXACTLY: same order of headings/paragraphs, same number of tables, same column headers in the same order, same header-row behavior, same way OP vs PSR is indicated, same way the month is shown, same name format mix (use roughly the same proportions you measured), and any merged cells / repeated headers / quirks you listed as parsing gotchas.
2. Use ONLY the invented people listed below. Do not use any real name from the document. Put each person in the service shown in brackets ([both] means they appear in both OP and PSR).
3. Deliberately include these realistic inconsistencies so the matcher is tested:
   - Write Joshua Ledford as "Ledfodr, Joshua" (typo).
   - Write William Quarles as "Quarles, Bill" (nickname).
   - Write Charles Huskey as "Huskye, Charles" (typo).
   - Write Kenneth Gentry as "Gentry, Kenny" (nickname).
   - Write Pamela Gentry as "Gentyr, Pamela" (typo).
   - Give about 10% of people a middle initial.
   Follow the real document's name order (e.g. "Lastname, Firstname" or "Firstname Lastname") for everyone else.
4. Fill every other column with obviously fake values: staff/clinician names as "Demo Clinician A/B/C/D", dates between 2022 and 2026, any ID columns as "DEMO-0001", "DEMO-0002", ...
5. Set the report month to October 2026.
6. Add the line "DEMO DATA — all names are fictitious." directly under the title.
7. Use your Python tool with python-docx to build the file and give me a download link named "DEMO BH Roster 2026-10 (real layout).docx".

Invented people:
Andrew Stallworth [both]; Matthew Calloway [OP]; Steven Kyker [PSR]; Christine Wofford [both]; Matthew Kyker [PSR]; Debra Rountree [OP]; Anna Quarles [both]; Melissa Darnell [OP]; Donald Abernathy [PSR]; Joshua Ledford [both]; Pamela Oakley [PSR]; Gary Bellweather [OP]; Nicholas Justus [both]; Sarah Thornbury [OP]; Carol Hargrove [PSR]; Larry Vandergriff [both]; Ryan Vandergriff [PSR]; Richard Dossett [OP]; William Quarles [both]; George Rountree [OP]; Betty Blevins [PSR]; Andrew Kettering [both]; Charles Huskey [PSR]; Rachel Jernigan [OP]; Amy Lockhart [both]; James Stallworth [OP]; Donald Ellsworth [PSR]; Sandra Crumley [both]; Ryan Varnell [PSR]; Kenneth Gentry [OP]; Ryan Huskey [both]; George Fritts [OP]; Richard Underhill [PSR]; Brenda Brannon [both]; Carol Neeley [PSR]; Pamela Gentry [OP]; Charles Galloway [both]; Sandra Ledford [OP]; Sandra Ashcroft [PSR]; Deborah Vandergriff [both]

Before giving the link, re-open the generated file with python-docx and confirm in one line that none of the real document's names appear in it.
```

**Bring back:** the JSON from Prompt A and the fake `.docx` from Prompt B. Drop the `.docx` into the Import Center on any dev machine to test.

---

## Prompt C: PHS event report option lists (labels only)

> Attach: the PHS "New Reportable Event Report" Excel export.

```text
This Excel export contains protected health information. I need ONLY the form's option labels (the fixed choices from the PHS form), never anything about a person.

STRICT PRIVACY RULES: never output names, site/home labels, dates, injury descriptions, or any free-text narrative. Only output fixed category/option labels, and only counts.

Use your Python / data-analysis tool (pandas + openpyxl). Trim whitespace; treat blank cells as missing.

Several columns are multi-select fields where PHS glued the chosen options together with NO delimiter (for example "911 CallEMTEmergency Room Visit"). For each of these columns:
  - "Tier 1 Events", "Tier 2 Events", "Behavioral/Psychiatric Events", "Event Interventions"
work out the individual option labels. Hints: options usually start with a capital letter or digit right after the previous option ends (lowercase-to-uppercase boundary), and the same label recurs across rows. Verify each label by checking it appears as a whole option in at least one row.

Return ONE JSON object:
{
  "columns": {
    "Tier 1 Events":                 {"options": [{"label": "<exact label>", "rows": <count>}], "unsplittable_examples_count": <n>},
    "Tier 2 Events":                 {...},
    "Behavioral/Psychiatric Events": {...},
    "Event Interventions":           {...},
    "Other Event Types":             {"short_category_labels": [{"label": "<label>", "rows": <count>}], "narrative_rows": <count>},
    "Non Reportable":                {"values": [...]},
    "This incident was / By":        {"values": [...]},
    "Event Location":                {"values": [...]},
    "Level of Injury":               {"values": [...]}
  },
  "dashboard_mapping": {
    "hospitalization": ["<labels that mean a hospital admission>"],
    "police_involvement": ["..."],
    "crisis_call": ["..."],
    "property_damage": ["..."],
    "er_visit": ["..."],
    "self_injury": ["..."]
  },
  "hidden_sheets_or_columns": "describe any hidden sheets, hidden columns, or columns outside A:N (header names only)",
  "any_id_like_column": "header name of any column that looks like a client ID / MRN, or 'none'"
}

For "Other Event Types", only list a label if it is a short category (under 60 characters, appears in at least 3 rows, and contains no person or place names). Count everything else as narrative_rows.

End with a one-line privacy check.
```

**Bring back:** the JSON. A developer pastes the option labels into `db/classify.js` (`INTERVENTION_OPTIONS`, `BEHAVIORAL_OPTIONS`, `FLAG_PATTERNS`). Until that's done, the crisis and police counts in the Behavioral Health dashboard are best guesses.

---

## Prompt D: how well do the two files match? (counts only)

> Attach both files: the Word roster and the PHS Excel export **for the same month**.

```text
I want to estimate how reliably the Word roster's client names can be matched to the "Member's Full Name" column of the Excel export. Output COUNTS ONLY: no names, no initials, no examples drawn from the data.

Using Python:
1. Extract every client name from the Word document's tables (column identified in our earlier analysis, or the column whose header contains "name").
2. Extract the distinct values of "Member's Full Name" from the Excel file.
3. Normalize both: lowercase, strip punctuation, convert "Last, First Middle" to first/last parts, drop suffixes (jr, sr, ii, iii), drop middle names/initials.
4. For each roster name, classify it as:
   a. exact match on the raw string
   b. match after normalization (same first + last)
   c. same last name + first name is a common nickname/short form or shares the first 3 letters
   d. same first name + last name differs by 1–2 characters (likely typo)
   e. no plausible match in the Excel file (person had no events that month, which is normal)
   f. ambiguous (more than one plausible Excel person)

Return JSON:
{"roster_names": <n>, "excel_distinct_names": <n>,
 "a_exact": <n>, "b_normalized": <n>, "c_nickname_or_prefix": <n>, "d_typo": <n>, "e_no_match": <n>, "f_ambiguous": <n>,
 "excel_names_in_last_comma_first_format_percent": <0-100>,
 "roster_names_in_last_comma_first_format_percent": <0-100>,
 "notes": "generic observations only, e.g. 'some roster names include middle initials', with no names"}

End with a one-line privacy check.
```

**Bring back:** the JSON. It shows how much of the matching will be automatic and how many items will land in the Review Queue each month.

---

## Questions for Kristen (no ChatGPT needed)

- [ ] In PHS, can the event report and the BH roster be exported with an **Individual ID / client number** (or date of birth) column added? One shared ID would replace almost all name matching.
- [ ] Who produces the Word roster, and could they send it as Excel instead?
- [ ] Is BitLocker (device encryption) turned on for this laptop? Ask IT.
- [ ] Can IT allow an unsigned internal app (`Greenhouse … .exe`) to run? Test the portable build on this laptop before demo day.
- [ ] Which people besides Kristen should be able to import data, and should anyone see dashboards without seeing names?
- [ ] Paste back the database schema ChatGPT produced from the Excel report earlier, so we can compare it with `db/index.js`.
