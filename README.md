# Greenhouse by Emory Valley Center

A minimal **hello-world Electron app** with a clean three-tier layout:

- **`app/`** — React front end built with **Next.js** (static export).
- **`api/`** — minimal **Node.js / Express** API (routes documented in [`api/README.md`](api/README.md)).
- **`db/`** — **SQLite** database layer (via [`sql.js`](db/index.js), a pure-WASM build of SQLite — *no native compilation required*, so it runs identically on macOS and Windows).

Electron ties it together: the main process starts the Express API and loads the Next.js UI. The UI fetches `Hello World` from the API, which reads it out of SQLite.

## Layout

```
.
├── app/            # Next.js front end (Pages Router, static export -> app/out)
│   ├── next.config.js
│   └── pages/index.js
├── api/            # Express API
│   ├── server.js   # createApp() + standalone listener
│   └── README.md   # route documentation
├── db/             # SQLite (sql.js) data layer
│   └── index.js
├── electron/       # Electron main + preload
│   ├── main.js
│   └── preload.js
├── package.json    # root scripts + electron-builder config
└── README.md
```

## Prerequisites

- **Node.js 18+** (tested on Node 24) and npm.
- Nothing else — no Python, no Visual Studio Build Tools, no C++ compiler. SQLite is WASM (`sql.js`), so there are **zero native modules** to rebuild on a new machine.

## Run in development

```bash
npm install
npm run dev
```

`npm run dev` starts three things together (via `concurrently`):

1. **API** on `http://localhost:4100` (`node api/server.js`)
2. **Next.js dev server** on `http://localhost:3000`
3. **Electron**, which waits for both to be healthy (`wait-on`) and then opens a window pointing at the Next.js dev server.

You should see **"Hello World"** in the Electron window, with a list of greetings loaded from SQLite and a form to add more.

> The SQLite file in dev lives at `./db/emoryvalley.db` (created + seeded on first run).

## Run the production path locally

This is what the packaged app does — the API serves the static export and Electron loads it over `http://localhost:4100`:

```bash
npm run build:ui          # next build -> app/out (static export)
NODE_ENV=production npm run start:api &   # API serves app/out + /api/*
NODE_ENV=production npx electron .        # loads http://localhost:4100
```

## Build for Windows (deliver to a colleague's laptop)

The app is configured with **electron-builder** for Windows (`nsis` installer + `portable` exe). See the `build` block in `package.json`.

### Recommended: build on a Windows machine

Building a signed, native Windows installer is most reliable **on Windows itself**. On the colleague's (or any) Windows PC:

```powershell
# 1. Install Node.js LTS from https://nodejs.org (includes npm).
# 2. In a terminal, from the project root:
npm install
npm run dist:win
```

Output lands in `release/`:

- `Greenhouse by Emory Valley Center Setup 0.1.0.exe` — NSIS installer (lets the user pick install dir).
- `Greenhouse by Emory Valley Center 0.1.0.exe` — portable single-file exe (no install needed; just double-click).

Copy either file to the colleague's laptop and run it. **That's the whole delivery.** No Node.js install required on their machine — Electron bundles its own runtime.

### Building the Windows target from macOS/Linux (cross-compile)

electron-builder *can* produce Windows artifacts from macOS, but with caveats — be honest about these:

- **NSIS installer** cross-built from macOS generally works and is fine to hand over.
- **Code signing** on Windows requires a Windows environment (or a hosted signing service) — unsigned builds will trigger SmartScreen "Windows protected your PC" warnings. The colleague clicks "More info → Run anyway". This is normal for unsigned internal tools.
- **Portable/NSIS** need no Wine for pure-JS/WASM apps (we have no native modules), so cross-build from macOS usually succeeds:
  ```bash
  npm run dist:win
  ```
  If it fails on your Mac, fall back to building on Windows (above) — that path is guaranteed.

> Because this app uses **sql.js (WASM)** instead of `better-sqlite3`, there are no platform-specific binaries to compile, which is exactly why cross-building and the Windows install are painless here.

## Scripts reference

| Script | Does |
|---|---|
| `npm run dev` | API + Next.js dev server + Electron, together. |
| `npm run dev:api` / `dev:ui` / `dev:electron` | Individual pieces. |
| `npm run build:ui` | `next build` → static export in `app/out`. |
| `npm run start:api` | Run API in production mode (serves `app/out`). |
| `npm run dist` | Build UI + package for the current OS. |
| `npm run dist:win` | Build UI + package Windows installer + portable exe. |

## Notes / known limitations

- **Unsigned** — fine for internal hand-off; expect a SmartScreen prompt on first launch.
- The DB is a single local SQLite file per machine (in the OS user-data dir for packaged builds: `%APPDATA%\Greenhouse by Emory Valley Center\emoryvalley.db` on Windows).
- CORS is wide open (`*`) because the API is local-only and meant for the Electron renderer. Don't expose it to a network.
