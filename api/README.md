# API — Greenhouse local server

Express on `127.0.0.1`. In the packaged app it runs on a random port inside the Electron main process, with a per-launch token. In dev it runs on port `4100` with token `dev-token`.

**Every `/api/*` request needs the header `x-evc-token: <token>`.** Missing or wrong token → `401`.

| Method | Route | Purpose |
|---|---|---|
| GET | `/health` | Liveness (no token). |
| GET | `/api/meta` | Months available, sites, counts, pending reviews, demo flag. |
| GET | `/api/overview` | 12-month trend (people, events, reportable, BH) and data sources. |
| GET | `/api/bh?month=YYYY-MM` | Behavioral health KPIs for the month, previous month and trend. |
| GET | `/api/incidents/summary?from&to&site&includeDuplicates=1` | Incident KPIs and breakdowns. |
| GET | `/api/incidents?from&to&site&q&flag&limit&offset` | Event rows (with matched person). |
| POST | `/api/import/incidents` | Body: raw .xlsx bytes, header `x-filename`. Imports the PHS event report. |
| POST | `/api/import/roster/preview` | Body: raw .docx bytes. Returns tables plus guessed month, service and name column. |
| POST | `/api/import/roster/commit` | JSON `{ month, filename, tables }` (the edited preview). |
| GET | `/api/imports` | Import history. |
| DELETE | `/api/imports/:id` | Undo an import (backup first). |
| GET | `/api/reviews?status=pending` | Review Queue items. |
| POST | `/api/reviews/:id` | `{ action: "merge" \| "distinct", keepId? }` |
| GET | `/api/people?q=` / `/api/people/:id` | Person registry / detail (aliases, enrollments, events). |
| PATCH | `/api/people/:id` | `{ display_name }` |
| GET | `/api/reports/bh-roster?month&service=OP\|PSR` | Roster report rows. |
| GET | `/api/reports/bh-roster.xlsx?month[&service]` | Excel export (both services if no service is given). |
| POST | `/api/demo/load` | Replace all data with fictitious demo data (refused if real data is loaded). |
| POST | `/api/admin/clear` | `{ confirm: "CLEAR" }`. Wipes all data (backup first). |
| GET | `/api/admin/info` | Database path and version. |

The schema is in `db/index.js`.
