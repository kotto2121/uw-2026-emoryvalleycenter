# Architecture

## Constraints that shaped it

| Constraint | Consequence |
|---|---|
| No hosting or subdomain allowed; IT is cautious | A self-contained **desktop app** on Kristen's laptop (Windows, 16 GB RAM, Ryzen 5). |
| No API access to PHS or Paylocity | Data arrives as **files** (Excel/Word exports) that the user imports. |
| Patient data (PHI) | Everything runs **locally**: no network, no cloud, no third-party services. |
| Small budget, non-technical maintainers | Few dependencies, no native build tools, one database file, automatic builds. |

## Components

```
┌──────────────────────────── Electron app (one .exe) ─────────────────────────────┐
│                                                                                  │
│  Main process (dist/main.js, bundled by esbuild from electron/main.js)           │
│   ├─ Splash window (electron/splash.html)            ← animated logo at launch   │
│   ├─ Express API on 127.0.0.1:<random port>          ← api/server.js             │
│   │    ├─ importers: xlsx-read.js, incidents-xlsx.js, docx-tables.js,            │
│   │    │             importer.js                                                 │
│   │    ├─ read models: queries.js     reports: reports.js (Excel via exceljs)    │
│   │    └─ demo data: demo.js                                                     │
│   └─ SQLite via sql.js (WebAssembly) ← db/index.js, people.js, names.js,         │
│                                         classify.js                              │
│                                                                                  │
│  Renderer (sandboxed window): Next.js static export (app/out)                    │
│   └─ talks only to the local API, with a per-launch token from electron/preload.js│
└──────────────────────────────────────────────────────────────────────────────────┘
       data file: %APPDATA%\Greenhouse by Emory Valley Center\emoryvalley.db (+ backups\)
```

| Layer | Tech | Why |
|---|---|---|
| Shell | Electron 33 | A desktop app from web tech; one portable `.exe`. |
| UI | Next.js 15 (pages router, static export), React 19, Recharts, Framer Motion | A polished UI built as plain static files, so no server is needed. |
| API | Express 4, in-process | A clear boundary between UI and data, so the team can work in parallel. |
| Database | SQLite through **sql.js** (WebAssembly) | No native modules, so nothing to compile for Windows and builds are reproducible. |
| Excel in | Custom reader (`xlsx-read.js`, uses JSZip) | Tolerant of real working workbooks. |
| Excel out | exceljs | Formatted report workbooks. |
| Word in | Custom reader (`docx-tables.js`, uses JSZip) | Only tables and paragraphs are needed. |

## Startup sequence (`electron/main.js`)

1. Only one copy can run; a second launch focuses the existing window.
2. The **splash window** appears immediately (frameless, transparent, CSS-animated logo).
3. The database is opened. Migrations run (new flag columns are added) and records are re-classified if `CLASSIFIER_VERSION` changed.
4. A **random 64-character token** is generated, and the API starts on `127.0.0.1` on a **random free port**. The API also serves the UI's static files.
5. The main window is created hidden. The API address and token go in through process arguments and the preload script, which exposes only `window.evc = { apiUrl, token, platform }`.
6. When the main window has painted (and at least 2.2 s after the splash appeared), the splash fades out and the main window is shown maximized.

**Development mode** (`npm run dev`): the API runs separately on port 4100 with token `dev-token`, the UI comes from the Next.js dev server on :3000, and CORS allows only that origin.

## Data model (`db/index.js`)

| Table | One row per | Key columns |
|---|---|---|
| `import_batch` | imported file | kind (`incident_xlsx` / `bh_docx`), filename, report_month, counts, `summary_json`, is_demo |
| `person` | person (registry) | id, display_name, first/last name |
| `person_alias` | spelling seen | raw_name, `raw_key` (unique), `norm_key` (`last\|first` or `id\|token`), source, how |
| `person_distinct` | "different people" decision | (a, b) |
| `match_review` | Review Queue question | person_id, candidate_person_id, score, reason, status |
| `event_report` | PHS export row | the 14 source fields (normalized names), `row_hash` (unique), `is_exact_duplicate`, `person_id`, `event_month`, `is_reportable`, `f_*` indicator flags |
| `bh_enrollment` | roster entry | raw_name, service (OP/PSR), report_month, person_id, `extra_json` (site, frequency, staff, status, section) |
| `app_meta` | setting | e.g. `classifier_version` |

**Persistence:** sql.js keeps the database in memory. After each committed transaction the whole database is written to a temp file and renamed over the real one (an atomic replace). A copy goes to `backups\` before every import, undo or clear, and the last 10 are kept. At EVC's scale (thousands of rows a year) this is fast and simple.

## Build and release

| Step | Command | Output |
|---|---|---|
| UI | `npm run build:ui` | `app/out/` (static HTML/JS) |
| Main process | `npm run build:main` | `dist/main.js` (one bundled file, about 4 MB) + `dist/sql-wasm.wasm` |
| Package | `npm run dist:win` | `release/` portable `.exe` + NSIS installer |

The packaged app contains **no `node_modules`**: everything the main process needs is bundled into `dist/main.js`. This was introduced after electron-builder silently dropped a nested dependency and the packaged app crashed at start.

**CI** (`.github/workflows/build-windows.yml`) runs on every push to `main` or `claude/**`, or manually:

1. `npm ci` → `npm run dist:win` on `windows-latest`.
2. **Self-test:** launches the packaged `.exe` with `EVC_SMOKE_TEST=<file>`. The app loads demo data, queries the dashboards, exports Excel, checks that an unauthenticated request is refused, writes the result and exits. The build fails if any step fails.
3. Uploads the `.exe` files and their SHA-256 checksums as an artifact, kept for 30 days.

Builds are **not code-signed** yet (see [limitations](limitations-and-open-questions.md)).
