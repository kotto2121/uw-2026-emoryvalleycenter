# App — Next.js frontend (Greenhouse UI)

Static-exported Next.js (pages router) app that talks to the local Express API (`api/`). It renders dashboards, the import wizard, the Review Queue, people registry, reports and roadmap pages.

## Pages (`app/pages`)

| Page | Route | Purpose |
|---|---|---|
| `index.js` | `/` | Overview — 12-month trends and KPIs. |
| `behavioral-health.js` | `/behavioral-health` | BH dashboard: OP/PSR enrollment, crisis indicators, month-over-month trend. |
| `incidents.js` | `/incidents` | Incidents & Safety dashboard with filters (month range, site, search, flag). |
| `import.js` | `/import` | Import Center — drag-drop .xlsx/.docx, column-mapping review step. |
| `review.js` | `/review` | Review Queue — merge/distinct decisions on uncertain person matches. |
| `people.js` | `/people` | Person registry, detail drawer (aliases, enrollments, events), rename. |
| `reports.js` | `/reports` | Monthly OP/PSR roster reports; Excel download or print. |
| `programs.js` | `/programs` | Roadmap for planned EVC programs (catalog in `app/lib/programs.js`). |
| `settings.js` | `/settings` | Demo data load/clear, DB info. |

Shared UI lives in `app/components/` — `Layout.js` (sidebar/topbar), `charts.js` (Recharts wrappers + color-blind-safe `SERIES` palette), KPI tiles, drawer, icons, `Logo.js`.

## How it talks to the API

All requests go through `app/lib/api.js`. It resolves the connection via `apiConfig()`:

- **In Electron:** the preload script exposes `window.evc = { apiUrl, token, platform, isElectron }` (random port + per-launch token passed as process args from `electron/main.js`).
- **In a plain browser (dev):** no `window.evc`, so it falls back to `http://127.0.0.1:4100` with token `dev-token`.

Every request sends `x-evc-token`; `api.upload` posts raw file bytes with `x-filename`; `api.download` fetches files (e.g. the Excel report) into a Save-as flow. Response caching is disabled server-side (`Cache-Control: no-store`).

## Dev workflow

```bash
npm run dev        # API (:4100) + Next dev (:3000) + Electron, together
# or UI-only in a browser:
npm run dev:api    # terminal 1
npm run dev:ui     # terminal 2 → http://localhost:3000
```

The Next.js dev origin (`http://localhost:3000`) is the only origin the API's CORS allows in dev.

## Build

`next.config.js` sets `output: "export"` (plus relative asset paths, `trailingSlash`), so `npm run build:ui` produces a fully static export in `app/out`. In the packaged app the API serves `app/out` directly (`staticDir` in `createApp`) — there is no separate web server. `npm run dist:win` runs `build:ui`, bundles the Electron/API main process with esbuild, then packages with electron-builder.

## Styling

Color tokens live at the top of `app/styles/globals.css`; chart colors are the `SERIES` array in `app/components/charts.js` (validated for color-blind safety — re-validate if changed). Branding notes are in the root README.

## API contract

See [`api/README.md`](../api/README.md) for the full route table, auth model, and how to run the API standalone.
