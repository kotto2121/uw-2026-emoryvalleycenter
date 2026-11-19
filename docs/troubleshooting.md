# Troubleshooting

## Windows blocks the app

| Message | Meaning | What to do |
|---|---|---|
| "Windows protected your PC" with a **Run anyway** option | SmartScreen: the app isn't code-signed. | Click **More info → Run anyway**. You only need to do this once. |
| "Smart App Control blocked an app that may be unsafe" (no Run anyway; **Run as administrator doesn't help**) | **Smart App Control** blocks every unsigned app. | Check *Windows Security → App & browser control → Smart App Control settings*. If it's On or in Evaluation, either IT turns it off for this laptop, or EVC code-signs the app. **Warning:** on many Windows versions, turning Smart App Control off can't be undone without resetting Windows, so this is IT's decision. |
| "This app has been blocked by your system administrator" | IT policy (AppLocker / WDAC / Intune). | Ask IT to allow the file. Give them its SHA-256 checksum (in `SHA256SUMS.txt` from the build, or run `Get-FileHash <file> -Algorithm SHA256` in PowerShell). |
| Antivirus quarantines the `.exe` | Heuristics on an unknown file. | Ask IT to allow it by checksum. Try the installer version instead of the portable one. |

## The app starts but shows an error

| Message | What to do |
|---|---|
| "Greenhouse couldn't start" with "Cannot find module …" | A packaging bug in builds before 19 Nov 2026. Download the latest build (the CI self-test now catches this). |
| A blank white window | Close and reopen the app. If it keeps happening, delete `%APPDATA%\Greenhouse by Emory Valley Center\` **after copying the `.db` file somewhere safe**, then send the team the error text. |

## Import problems

| Message | Cause | What to do |
|---|---|---|
| "That file isn't a readable .xlsx workbook" | `.xls`, `.csv` or a damaged file. | Open it in Excel and use *Save As → Excel Workbook (.xlsx)*. |
| "Couldn't find the event report columns" | No sheet has both "Date Of Event" and "Member's Full Name" in its first 15 rows. | Check you exported the right report and didn't rename those headings. |
| "Sheet X also looks like event data … NOT imported" | The workbook has a second copy of the data (e.g. a hand-edited month). | Usually fine. The largest sheet was imported. If the wrong sheet was chosen, save the right sheet as its own file. |
| "N row(s) were hidden by an Excel filter" | Rows were filtered out in Excel. | Informational. All rows are imported. |
| "N row(s) had a date that could not be read" | Unusual date text. | Fix those dates in Excel and re-import (already-imported rows are skipped). |
| "… option label(s) weren't recognised" | PHS added or renamed an option. | Counts are still saved. Ask the team to add the label to `db/classify.js`. |
| Roster preview: orange **"heading says N"** tag | The number of clients found differs from the "Total: N" in that table's heading. | Look at that table in the preview. Try a different **Name column**, or check the Word document (a name in the wrong column, or a merged cell). |
| Roster preview: "No date found in the document" | No "Updated <date>" line was found. | Pick the month in the **Report month** box. |
| "That file isn't a readable .docx" | An old `.doc` file. | Open it in Word and use *Save As → Word Document (.docx)*. |

## Numbers look wrong

| Symptom | Likely cause |
|---|---|
| This month's numbers are much lower than usual | The export was pulled mid-month. Look for the orange "looks incomplete" banner, and re-import a full export later (only new rows are added). |
| The same person appears twice on the People screen | Spellings too different to link automatically and no Review Queue item was created. Rename one, or ask the team about adding a manual merge. Check the Review Queue first. |
| OP/PSR counts are 0 | No roster has been imported for that month. Check the month chosen at import (Import Center → Import history). |
| Totals differ from the manual report by a few | Exact duplicate rows are excluded (toggle "Include exact duplicate rows" on Incidents to compare), or blanks are counted as "No Data Reported" rather than dropped. |

## Starting over

- **Undo one import:** Import Center → Import history → **Undo**.
- **Clear everything:** Settings → type `CLEAR` → **Clear all data**. A backup is saved first.
- **Restore a backup:** close the app, copy the wanted file from `%APPDATA%\Greenhouse by Emory Valley Center\backups\` over `emoryvalley.db` in the folder above it, then reopen the app.
