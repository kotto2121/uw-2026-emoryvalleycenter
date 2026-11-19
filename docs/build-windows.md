# Building the Windows app (.exe)

Everything ships from one script — `npm run dist:win` — or, **recommended**, from GitHub Actions, which builds on a real Windows runner and smoke-tests the packaged app before you ever download it.

## The one-command build

```bash
npm run dist:win
```

That runs three steps in order (all defined in `package.json`):

| Step | Script | What it does |
| --- | --- | --- |
| 1. UI | `npm run build:ui` | `next build app` — static export of the Next.js frontend to `app/out/` |
| 2. Main | `npm run build:main` | esbuild bundles `electron/main.js` + the Express API + the database layer into a **single** `dist/main.js`, and copies `sql-wasm.wasm` next to it |
| 3. Package | `electron-builder --win --x64` | produces the Windows artifacts in `release/` |

Step 2 matters: the packaged app ships **no `node_modules` at all** — one JS file plus the sql.js WebAssembly binary. electron-builder's dependency collection had silently dropped a nested package (`call-bind-apply-helpers`) and the app crashed on start; bundling makes that class of bug impossible and the app much smaller. See `scripts/build-main.js`.

## What you get

`release/` contains:

- **`Greenhouse by Emory Valley Center Setup <version>.exe`** — NSIS installer (lets the user pick the install directory; Start Menu shortcut named "Greenhouse")
- **a portable `.exe`** — single file, no install

Neither is code-signed, so Windows SmartScreen will warn on first run ("More info → Run anyway"). **Test on the target laptop early** — IT policy (AppLocker or Defender) may block unsigned apps entirely.

## Where to build

### GitHub Actions (recommended)

Every push to `main` or `claude/**` builds on a real Windows runner (`.github/workflows/build-windows.yml`), and you can also trigger it manually: **Actions → "Build Windows app" → Run workflow**.

The workflow goes further than a local build:

1. `npm ci` + `npm run dist:win`
2. **Smoke test** — launches the packaged `.exe` on Windows with `EVC_SMOKE_TEST` set; the app must self-test and exit clean within 120 s or the build fails
3. Generates `SHA256SUMS.txt` for all exe files
4. Uploads everything as the **Greenhouse-Windows** artifact (kept 30 days)

Download: **Actions → "Build Windows app" → latest run → Artifacts**. This is the safest path — it proves the exe actually launches on Windows before anyone installs it.

### Locally on Windows

On a Windows machine with Node.js LTS:

```powershell
npm install
npm run dist:win
```

### Cross-building from macOS

`npm run dist:win` also works from a Mac — electron-builder downloads the Windows toolchain (nsis, winCodeSign) automatically on first run; no Wine is needed for the NSIS + portable targets. The result is still unsigned and untested-on-Windows, so prefer CI when possible.

## Shortcuts and tips

- **Main-process/API-only change?** Skip the Next.js rebuild:
  ```bash
  npm run build:main && npx electron-builder --win --x64
  ```
- **Version bump:** edit `version` in `package.json` — installer and portable exe filenames include it.
- **Clear stale output:** `release/` accumulates artifacts across targets (e.g. an old `win-arm64-unpacked/` from an earlier experiment). `rm -rf release` before a fresh build avoids mixing old and new files.
- **Icons/branding:** electron-builder reads `build/icon.png` (see the Brand section in the README before swapping it).

## Troubleshooting

- **App crashes at start after install** — almost certainly a packaging/bundling issue. Check `dist/main.js` was produced (`npm run build:main` output prints its size) and that `dist/sql-wasm.wasm` exists; it must stay unpacked per `build.asarUnpack` in `package.json`.
- **electron-builder errors about missing Windows tools on macOS** — let it re-download the toolchain; a stale cache in `~/Library/Caches/electron-builder` can be deleted safely.
- **Smoke test fails in CI** — the workflow log includes the app's self-test JSON (`release` step output); the app exited non-zero or wrote `ok: false`.
