# API — Greenhouse local server

Express on `127.0.0.1`. In the packaged app it runs on a random port inside the Electron main process, with a per-launch token. In dev it runs on port `4100` with token `dev-token`.

**Every `/api/*` request needs the header `x-evc-token: <token>`.** Missing or wrong token → `401`.

| Method | Route | Purpose |
|---|---|---|
| GET | `/health` | Liveness (no token). |
| GET | `/api/meta` | Months available, sites, counts, pending reviews, demo flag. |
| GET | `/api/overview` | 12-month trend (people, events, reportable, BH) and data sources. |
| GET | `/api/bh?month=YYYY-MM` | Behavioral health KPIs for the month, previous month and trend. |
| GET | `/api/incidents/summary?from&to&site&segment&reportable&includeDuplicates=1` | Incident KPIs and breakdowns (incl. Medical options and Other Event Types keyword groups). |
| GET | `/api/incidents?from&to&site&segment&reportable&q&flag&limit&offset` | Event rows (with matched person). |
| GET | `/api/metrics?from&to&site&segment&reportable&includeDuplicates=1` | Behavioral Metrics page: each metric's events/people split All / Behavioral / Non-Behavioral, monthly trend, by-site and by-person tables. |
| POST | `/api/import/incidents` | Body: raw .xlsx bytes, header `x-filename`. Imports the PHS event report directly (no review step). |
| POST | `/api/imports/analyze` | Body: raw .xlsx bytes, header `x-filename`. Parses the workbook in memory and returns an `uploadId`, warnings, unknown headers and missing required columns — nothing is committed yet. |
| POST | `/api/imports/:uploadId/commit` | JSON `{ decisions: [{ header, action: "map"\|"new"\|"ignore", field?, remember? }] }`. Commits the held upload; `remember: true` persists the column mapping for next time. Held uploads expire (→ `410`) if not committed. |
| GET | `/api/programs/:key/columns` | Column mappings (field ↔ Excel header aliases) for a program (`phs_incidents`). |
| POST | `/api/programs/:key/columns` | JSON `{ field, alias, required? }`. Adds a mapping. |
| DELETE | `/api/programs/:key/columns?alias=&[field=]` | Deletes a mapping by alias (optionally scoped to one field). |
| POST | `/api/import/roster/preview` | Body: raw .docx bytes. Returns tables plus guessed month, service and name column. |
| POST | `/api/import/roster/commit` | JSON `{ month, filename, tables }` (the edited preview). |
| GET | `/api/imports` | Import history. |
| DELETE | `/api/imports/:id` | Undo an import (backup first). |
| GET | `/api/reviews?status=pending` | Review Queue items. |
| POST | `/api/reviews/:id` | `{ action: "merge" \| "distinct", keepId? }` |
| GET | `/api/people?q=` / `/api/people/:id` | Person registry / detail (aliases, enrollments, events). |
| PATCH | `/api/people/:id` | Any of `{ display_name, is_behavioral: bool, is_test: bool }`. A BH roster import sets `is_behavioral` only while it has never been set. |
| GET | `/api/reports/bh-roster?month&service=OP\|PSR` | Roster report rows. Not used by the UI since the OP / PSR reports were dropped. |
| GET | `/api/reports/bh-roster.xlsx?month[&service]` | Excel export (both services if no service is given). Not used by the UI; the packaged-app smoke test still calls it. |
| GET | `/api/reports/incidents.xlsx?from&to[&includeDuplicates=1]` | Incident report workbook (Summary, Month, Site, Individual, Tier 1/2, Behavior, Medical, Other, Reportable, Discovery, Location, Requirements, Injury). |
| POST | `/api/demo/load` | Replace all data with fictitious demo data (refused if real data is loaded). |
| POST | `/api/admin/clear` | `{ confirm: "CLEAR" }`. Wipes all data (backup first). |
| GET | `/api/admin/info` | Database path and version. |

Filters on `/api/incidents/summary`, `/api/incidents` and `/api/metrics`: `segment=behavioral|non` (the person's Behavioral box) and `reportable=reportable|non`. Test patients (`person.is_test = 1`) are left out of every count on every route, including the Excel reports.

The schema is in `db/index.js`.

## Running the API standalone

The server is plain Express and runs fine without Electron:

```bash
node api/server.js
```

Standalone defaults (see the `if (require.main === module)` block at the bottom of `api/server.js`):

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `4100` | HTTP port. |
| `EVC_API_TOKEN` | `dev-token` | The secret required in `x-evc-token` on every `/api/*` call. |
| `EVC_DEV_ORIGIN` | `http://localhost:3000` | The single origin allowed by CORS (for browser clients). |
| `EVC_DB_PATH` | (see below) | Override the SQLite file location. |

Database file location (`db/index.js → dbFilePath()`), in priority order:

1. `EVC_DB_PATH` env var
2. `ELECTRON_USER_DATA/emoryvalley.db` (set by the Electron main process)
3. `db/emoryvalley.db` in the repo (standalone/dev default)

The server is also embeddable: `require("./api/server.js").createApp({ token, staticDir, allowOrigin })` returns the Express app — this is how Electron runs it on a random port with a per-launch token.

### Security constraints if you move it off 127.0.0.1

The current model assumes a local, single-user machine. If you bind to a network interface or expose the API remotely, know that:

- **Token auth is the only gate** — a static shared secret, no user accounts, no TLS termination, no rate limiting. Anyone with the token has full read/write access to all data, including `/api/admin/clear`.
- **The Host header check** (`api/server.js`) only accepts `127.0.0.1`, `localhost`, `[::1]` — remote clients will get `421` until you extend this list (this is the DNS-rebinding defense, so relax it deliberately).
- **CORS is single-origin** (`EVC_DEV_ORIGIN`); browsers on other origins will be blocked even with the token.
- The database is an unencrypted SQLite file; backups are written next to it before every import, undo and clear (last 10 kept).

All PHI-handling caveats in the root README's security model apply double once the API leaves the laptop.
