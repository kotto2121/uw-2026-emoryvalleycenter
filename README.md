# Greenhouse by Emory Valley Center

A **local-first desktop dashboard** for Emory Valley Center (EVC). It runs entirely on one Windows laptop: no server, no subdomain, no cloud, and no internet connection.

**What it does now (MVP: behavioral health monthly workflow):**

1. **Import** the PHS *New Reportable Event Report* (.xlsx) and the monthly *Behavioral Health roster* Word document (.docx).
2. **Match people across files** without a client ID: a person registry with name normalization and fuzzy matching. Close-but-uncertain matches go to a **Review Queue** for a human decision, and every decision is remembered.
3. **Dashboards:** Overview, Behavioral Health (OP / PSR enrollment plus crisis indicators) and Incidents & Safety, with filters by month and site and month-over-month trends.
4. **Reports:** the monthly OP and PSR reports that used to be built by hand, exported as Excel or printed.
5. **Roadmap pages** for every other program in EVC's Data Metric Goals.

It also ships with **six months of fictitious demo data** that statistically mirrors the real PHS export (see `api/lib/demo.js`).

## Architecture

```
electron/        main process: splash → local API → main window
  main.js        random port + per-launch secret token, single instance, navigation lock-down
  preload.js     exposes window.evc = { apiUrl, token, platform } (nothing else)
  splash.html    animated launch screen (logo draws in, Outlook-style)
api/             Express API (127.0.0.1 only, token required on /api/*)
  server.js      routes (documented in api/README.md)
  lib/           incidents-xlsx.js (Excel reader), docx-tables.js (Word table reader),
                 importer.js, queries.js (dashboards), reports.js (Excel export), demo.js
db/              SQLite via sql.js (pure WASM — no native build tools)
  index.js       schema, atomic saves, automatic backups
  names.js       name parsing, nicknames, Jaro–Winkler similarity
  people.js      person registry, auto-link rules, Review Queue, merges
  classify.js    PHS option dictionaries + crisis/police/hospitalization flags
app/             Next.js (pages router) static export → app/out
  components/    Layout (sidebar/topbar), charts, KPI tiles, drawer, icons, logo
  pages/         index (Overview), behavioral-health, incidents, import, review,
                 people, reports, programs (roadmap), settings
docs/            chatgpt-prompt.md — prompts to run on EVC's ChatGPT (structure only, no PHI)
demo-data/       generated fictitious files for testing the import flow
```

### Privacy and security model

- The API listens on `127.0.0.1` only, on a random port, and every `/api` call must carry a 64-character secret generated at launch. That stops a website open in the browser from reading data off the local port. There is no wildcard CORS, and the Host header is checked.
- The renderer is sandboxed and context-isolated, with no Node access. External links open in the default browser, and all permission requests (camera, location and so on) are denied.
- The database is one SQLite file in `%APPDATA%\Greenhouse by Emory Valley Center\`. Saves are atomic (temp file, then rename), and a backup is taken before every import, undo or clear (the last 10 are kept).
- **Not yet:** at-rest encryption beyond Windows BitLocker, and per-user roles. Both are on the roadmap.

### Matching people without an ID

PHS exports and the Word roster have no shared client ID. `db/people.js` applies, in order:

1. **Exact alias:** this exact string was seen before, so it's the same person.
2. **Normalized:** "SMITH, JOHN A." equals "John Smith" (order, case, punctuation, middle initials and suffixes are ignored). Auto-linked.
3. Otherwise a **new person** is created, and if someone similar exists (nicknames, typos, swapped names; score ≥ 0.82), a **Review Queue** item asks "same person?". Merge or distinct; the decision is stored permanently.

Known limitation: two different people with the identical normalized name are auto-linked. If PHS can export an Individual ID, add it as a column and match on that first.

## Develop

```bash
npm install
npm run dev
```

This starts the API (`:4100`, token `dev-token`), the Next.js dev server (`:3000`) and Electron. Click **Explore with demo data** on the welcome screen, or run `npm run demo:files` and drag files from `demo-data/` into the Import Center.

To run only the UI in a browser: `npm run dev:api` plus `npm run dev:ui`, then open http://localhost:3000 (it falls back to the dev token).

## Build for Kristen's Windows laptop

On a Windows machine with Node.js LTS:

```powershell
npm install
npm run dist:win
```

`release/` will contain an **NSIS installer** and a **portable .exe**. Neither is code-signed, so SmartScreen will warn ("More info → Run anyway"). **Test on her laptop early.** IT policy (AppLocker or Defender) may block unsigned apps entirely.

## Brand

The logo is a **placeholder** (a sprout in a ring). To apply EVC's brand:

- Replace the SVG in `app/components/Logo.js` and `electron/splash.html`, and the icon in `build/icon.png` and `electron/assets/icon.png` (512×512).
- Update the color tokens at the top of `app/styles/globals.css` and in `electron/splash.html`.
- The chart colors (`SERIES` in `app/components/charts.js`) were checked for color-blind safety. Re-validate them if you change them.

## Next steps

- Replace the option dictionaries in `db/classify.js` with PHS's real option list (`docs/chatgpt-prompt.md`, Prompt C).
- Check the Word importer against the real layout using the fake .docx from Prompt B.
- Ask whether PHS can export an Individual ID; if so, match on it before names.
- Next program importers: Rolling Census (PHS demographics), then Employment Services.
