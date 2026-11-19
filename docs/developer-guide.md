# Developer guide

## Setup

Requirements: Node.js 20+ (CI uses 20; developed on 22) and npm. No Python, no C++ build tools.

```bash
npm install
npm run dev
```

`npm run dev` starts three processes together:

- API on `127.0.0.1:4100` (token `dev-token`), with the database at `db/emoryvalley.db`;
- the Next.js dev server on `localhost:3000`;
- Electron, pointed at the dev server.

You can also run only the API and UI in a browser: `npm run dev:api` plus `npm run dev:ui`, then open http://localhost:3000.

Load data with **Explore with demo data** on the welcome screen, or run `npm run demo:files` and drag the files from `demo-data/` into the Import Center.

## Repository map

| Path | Contents |
|---|---|
| `electron/` | `main.js` (startup, window, API, self-test), `preload.js`, `splash.html`, `assets/icon.png` |
| `api/server.js` | All routes (documented in `api/README.md`) |
| `api/lib/` | `xlsx-read.js`, `incidents-xlsx.js`, `docx-tables.js`, `importer.js`, `queries.js`, `reports.js`, `demo.js` |
| `db/` | `index.js` (schema, migrations, persistence), `people.js`, `names.js`, `classify.js` |
| `app/` | Next.js UI: `pages/`, `components/` (Layout, charts, ui, Drawer, Icon, Logo), `lib/` (api client, format, program catalog), `styles/globals.css` |
| `scripts/` | `build-main.js` (esbuild bundle), `generate-demo-files.js`, `make-roster-from-export.js` |
| `docs/` | This documentation |
| `demo-data/` | Fictitious test files |
| `.github/workflows/` | Windows build and self-test |

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | API + UI dev server + Electron |
| `npm run build:ui` | Static UI build into `app/out` |
| `npm run build:main` | Bundle the main process into `dist/main.js`, copy `sql-wasm.wasm` |
| `npm run dist:win` | Build everything and package the Windows portable `.exe` and installer |
| `npm run demo:files` | Write fictitious demo files to `demo-data/` |
| `node scripts/make-roster-from-export.js <export.xlsx> --month YYYY-MM [--months N]` | Fake rosters built from a de-identified export |

## Testing

There's no unit-test framework yet. These checks are what was used during development and should be repeated after changes:

1. **Parser checks (Node).** Run the Word parser over the three roster layouts and confirm every table's client count equals its heading total:

   ```bash
   node -e "const {readDocx,guessRoster,tableEntries}=require('./api/lib/docx-tables.js');readDocx(require('fs').readFileSync(process.argv[1])).then(({blocks})=>{const g=guessRoster(blocks);console.log(g.month,g.tables.map(t=>tableEntries(t).length+'/'+(t.expectedTotal??'-')).join(' '))})" "demo-data/DEMO BH Roster 2026-10 (ChatGPT real layout).docx"
   ```

   Expected: `2026-10 24/24 18/- 12/12 25/25 26/26 5/- 4/- 6/- 22/-`.

2. **Import round trip.** Import a demo export twice. The second time should report `0` new rows.

3. **UI.** Build the UI, start the API with `staticDir` pointing at `app/out`, and click through every page with demo data (Playwright works well for this). There should be no console errors.

4. **Packaged app.** `npm run build:main && npx electron-builder --linux dir` (or `--win`), then run the binary with `EVC_SMOKE_TEST=/tmp/smoke.json`. It must write `"ok": true`. CI does this on Windows on every push.

Adding a real test runner (e.g. `node --test`) with these as fixtures is a good next step.

## Common maintenance tasks

### A new PHS option appears ("Unrecognized option" in an import warning)

1. Add the exact label to the matching list in `db/classify.js` (`INTERVENTION_OPTIONS`, `BEHAVIORAL_OPTIONS`, `MEDICAL_OPTIONS`, `TIER_OPTIONS`, `OTHER_OPTIONS` …).
2. If it should count toward a safety indicator, extend that indicator's pattern in `FLAG_PATTERNS`.
3. Increase `CLASSIFIER_VERSION`. Stored records are re-classified on the next start.
4. Update [metrics.md](metrics.md).

### Add a new safety indicator

Add an `f_<name>` pattern to `FLAG_PATTERNS` and increase `CLASSIFIER_VERSION`. The database column is added automatically on start (`migrate()` in `db/index.js`). Then add a label to `FLAGS` in `api/lib/queries.js` and a tile to `INDICATORS` in `app/pages/behavioral-health.js`.

### The Word roster layout changes

Look at the import preview first: totals that don't match the headings point at the problem. Then adjust the rules in `api/lib/docx-tables.js`: `SCHEDULE_RE`, `KNOWN_HDR_RE`, `NAME_HDR_RE`, `staffFromHeading`, the name-column selection. Re-run the parser check above. Ideally get a new structure-only description and fake copy through `docs/chatgpt-prompt.md` (Prompts A and B).

### Add a new data source (e.g. Rolling Census)

1. **Learn the structure** without seeing PHI (adapt Prompts A–D in `docs/chatgpt-prompt.md`).
2. **Schema:** add a table in `db/index.js` (`CREATE TABLE IF NOT EXISTS …`), with a `batch_id` and a `person_id` where people are involved.
3. **Reader:** add `api/lib/<source>.js`. Use `readWorkbook()` for Excel and `readDocx()` for Word.
4. **Importer:** add a function in `api/lib/importer.js`. Use `createResolver()` for names, run in `db.tx()`, record an `import_batch` with a new `kind`, and make re-imports idempotent (unique keys or row hashes).
5. **Routes** in `api/server.js` (and `api/README.md`); **queries** in `api/lib/queries.js`.
6. **UI:** a drop zone in `app/pages/import.js`; a dashboard page; set the program's `status: "live"` and `href` in `app/lib/programs.js` so it moves into the sidebar.
7. **Demo data** for it in `api/lib/demo.js`, and docs.

### Change the brand

The logo is in `app/components/Logo.js` and `electron/splash.html`. Icons are `build/icon.png` and `electron/assets/icon.png` (512×512). Colors are the tokens at the top of `app/styles/globals.css` and in `splash.html`. Chart colors (`SERIES` in `app/components/charts.js`) were checked for color-blind safety; re-check them if you change them.

## Conventions

- **Months** are `YYYY-MM` strings and dates are `YYYY-MM-DD` text, everywhere.
- **Blank stays blank:** store `NULL`, show "Not recorded".
- **Every import** runs in one transaction, takes a backup first, and is idempotent.
- **No new runtime network calls, ever.** No CDN assets either; fonts are system fonts.
- **Comments explain why**, especially for any rule derived from the real files.
