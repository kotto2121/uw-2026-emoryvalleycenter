# User guide

This guide is for the people who run the monthly reporting. No technical background is needed.

## 1. What Greenhouse does

Each month you receive two things:

1. **The PHS event report.** An Excel export from Practical Health Systems, "New Reportable Event Report", with one row per incident.
2. **The Behavioral Health caseload document** (optional). A Word file listing which people are on each Psychosocial Rehabilitation (PSR) and Individual Therapy (OP) caseload. Importing it marks those people **Behavioral**.

Greenhouse reads both files, works out which rows belong to the same person, and builds:

- Dashboards: **Overview**, **Behavioral Health** and **Incidents & Safety**.
- The **incident report workbook**, an Excel file with the same tabs as the manual report workbook (Month, Site, Individual, Tier 1, Tier 2, Behavior, Medical, Other, Reportable, Discovery, Location, Requirements, Injury).

Everything stays on the laptop. Greenhouse has no internet connection and no cloud account.

## 2. Installing and starting

1. Get `Greenhouse by Emory Valley Center 0.1.0.exe` (the portable app) from the project team.
2. Save it to a normal folder such as `Documents\Greenhouse`, not the Downloads folder or a USB stick.
3. Double-click it. The first time, Windows may show **"Windows protected your PC"**. Click **More info → Run anyway**.
   If Windows says the app is *blocked* (Smart App Control, or "blocked by your administrator"), see [Troubleshooting](troubleshooting.md#windows-blocks-the-app).
4. A green Greenhouse card appears for a couple of seconds, then the main window opens.

Nothing is installed. To remove Greenhouse, delete the `.exe`. Your data is kept separately (see [Where your data lives](#7-where-your-data-lives)).

## 3. The monthly routine (about 10 minutes)

### Step 1: Import the PHS event report

1. In PHS, export the **New Reportable Event Report** to Excel as usual.
2. In Greenhouse, open **Import Center** and drag the `.xlsx` file onto **PHS event report** (or click it to browse).
3. Read the result card:

| You'll see | What it means |
|---|---|
| **Rows read** | Rows found in the file. |
| **Already imported (skipped)** | Rows Greenhouse already has from an earlier import. Re-importing an overlapping or identical file is safe. |
| **Exact duplicate rows (flagged)** | Rows that are 100% identical to another row in the same file. They're kept but left out of the counts. |
| **New people · to review** | People Greenhouse hasn't seen before, and how many look like possible duplicates. |

The file can be one month, several months, or a whole year, and it can be the raw export or a workbook with extra tabs. Greenhouse imports the sheet that holds the export and tells you if it ignored another sheet that looked similar.

### Step 2 (optional): Import the Behavioral Health caseload document

This only ticks **Behavioral** for the people on it. You can tick it yourself on a person's page instead (see [People screen](#5-people-screen)). Greenhouse reports BH clients as one group, not OP and PSR separately.

1. Drag the Word file (`.docx`) onto **Behavioral health roster**. If you have an old `.doc` file, open it in Word and use *Save As → Word Document (.docx)* first.
2. Greenhouse shows a **preview** before importing anything:
   - **Report month.** Taken from the "Updated …" date in the document. Change it if the roster is for a different month.
   - One section per caseload table, showing its heading, the **staff** member, the **service** (PSR or OP) and how many clients were found.
   - A green **"matches heading total"** tag means the number of clients found equals the "Total: N" in the heading. An orange tag means they differ, so look at that table.
   - Rows with days and times or "Total:" are schedule rows, not clients. They're shown struck through and skipped.
   - **Additional Caseload** is set to *Don't import* until EVC decides which service it belongs to.
3. If something is wrong, change the **Service** dropdown or the **Name columns** chips for that table.
4. Click **Import N entries**.

### Step 3: Review possible duplicates

If the sidebar shows a number next to **Review Queue**, open it. Each card shows two records that might be the same person, for example "Kenny Gentry" and "Kenneth Gentry", or a typo like "Ledfodr" and "Ledford".

- **Same person — merge** (or press **M**) combines them. Greenhouse remembers the decision, so that spelling links automatically from now on.
- **Different people** (or press **D**) keeps them apart. Greenhouse won't ask about this pair again.

The queue shrinks over time. The first month needs the most review; later months need very little.

### Step 4: Check the dashboards

- **Overview:** headline numbers for the latest *complete* month, with trends.
- **Behavioral Health:** people marked Behavioral — how many had an incident, their incident records, and the crisis and safety indicators, all counted for BH clients only.
- **Incidents & Safety:** everything in the PHS export, with filters by month range and site.

Hover over any chart for exact values. Click a site bar to filter by that site. Click a row in **Event records** to see the full record.

### Step 5: Export the reports

Open **Reports**, choose a month range for the **Incident report workbook**, then **Download (Excel)**. This replaces the manual report workbook.

When you save, Windows asks where to put the file.

## 4. Reading the numbers correctly

- **"Not recorded" / "No Data Reported"** means the field was left blank in PHS. It does *not* mean "none". For example, a blank injury level isn't the same as "No Injury".
- **Event records vs. people.** Most counts are *records*. One person can have several events in a month. "People involved" counts distinct people.
- **Incomplete months.** If the newest month in the export ends well before the end of the month (the export was pulled mid-month), Greenhouse shows an orange **"looks incomplete"** banner and uses the previous month as "this month".
- **The safety indicators** (hospitalizations, police, crisis, property damage and so on) are counted from specific PHS options. Hover over each tile to see exactly which options count. Full definitions are in [Metrics and definitions](metrics.md).
- **Demo data.** If a yellow **Demo data** badge is showing, the numbers are fictitious.

## 5. People screen

**People** lists everyone Greenhouse knows about. It shows every spelling seen in the source files, their BH services by month, and their event records. You can rename how a person is displayed; the original spellings are kept.

Each person's page has two boxes:

- **Behavioral patient.** Ticked means the person counts as a BH client everywhere in Greenhouse. Untick it when someone leaves BH; nothing unticks it automatically.
- **Test patient.** Ticked means the person is left out of every count.

This screen shows names. Use it only on a secure computer, and don't screen-share it outside authorized staff.

## 6. Undoing mistakes

- **Undo an import:** go to **Import Center → Import history → Undo** on that file. A backup is saved first.
- **Start over:** go to **Settings → Clear all data** (type `CLEAR`). A backup is saved first.
- **Demo data:** **Settings → Load demo data**. This only works when no real data is loaded.

## 7. Where your data lives

All data is in one file on the laptop:

```
%APPDATA%\Greenhouse by Emory Valley Center\emoryvalley.db
```

A `backups` folder next to it keeps the last 10 automatic backups, one taken before every import, undo or clear. **Settings** shows the exact path.
