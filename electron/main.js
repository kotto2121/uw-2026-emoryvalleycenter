/**
 * electron/main.js — Electron main process.
 *
 * Startup sequence (Outlook-style):
 *   1. Show a small frameless splash window with the animated logo immediately.
 *   2. Start the local API (random free port + random per-launch token) and
 *      open the database.
 *   3. Create the main window hidden; when it has painted, fade the splash
 *      out and show the main window.
 *
 * Dev (NODE_ENV=development, via `npm run dev`): the API runs separately on
 * :4100 with token "dev-token" and the UI comes from the Next.js dev server.
 * Packaged / production: the API is started in-process and also serves the
 * static Next.js export (app/out).
 */
const { app, BrowserWindow, shell, session } = require("electron");
const path = require("path");
const crypto = require("crypto");

// Project root: works whether this file runs from electron/ (dev) or is
// bundled into dist/main.js (packaged).
const ROOT = path.join(__dirname, "..");

const isDev = !app.isPackaged && process.env.NODE_ENV === "development";

// Let the db layer know where to store emoryvalley.db.
process.env.ELECTRON_USER_DATA = app.getPath("userData");

const BRAND_BG = "#f6f5f0";

// CI self-test: EVC_SMOKE_TEST=<file> launches the real packaged app, exercises
// the API from inside the window, writes a JSON result to <file>, and exits.
const SMOKE = process.env.EVC_SMOKE_TEST || null;
function smokeResult(result, code) {
  try { require("fs").writeFileSync(SMOKE, JSON.stringify(result, null, 2)); } catch {}
  app.exit(code);
}
const SPLASH_MIN_MS = 2200; // let the logo animation play out

// macOS ignores the BrowserWindow `icon` option (the dock icon comes from the
// app bundle, which in dev is the stock Electron icon) — set it explicitly.
const ICON_PATH = path.join(ROOT, "electron", "assets", "icon.png");
if (process.platform === "darwin" && require("fs").existsSync(ICON_PATH)) {
  app.whenReady().then(() => { try { app.dock.setIcon(ICON_PATH); } catch {} });
}

let apiServer = null;
let mainWindow = null;
let splash = null;
let splashStartedAt = Date.now();

// One running copy only: a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

async function startApi() {
  if (isDev) {
    return { url: "http://127.0.0.1:4100", token: process.env.EVC_API_TOKEN || "dev-token" };
  }
  const token = crypto.randomBytes(32).toString("hex");
  const { createApp } = require("../api/server.js");
  const db = require("../db");
  await db.getDb(); // open/migrate the database while the splash is showing
  const expressApp = createApp({ token, staticDir: path.join(ROOT, "app", "out") });
  await new Promise((resolve) => {
    apiServer = expressApp.listen(0, "127.0.0.1", resolve); // 0 = any free port
  });
  const { port } = apiServer.address();
  console.log(`[main] embedded API on 127.0.0.1:${port}`);
  return { url: `http://127.0.0.1:${port}`, token };
}

function createSplash() {
  splash = new BrowserWindow({
    width: 440,
    height: 340,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    title: "Greenhouse",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  splash.loadFile(path.join(ROOT, "electron", "splash.html"));
  splash.once("ready-to-show", () => splash.show());
}

async function createMainWindow(api) {
  const isMac = process.platform === "darwin";
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: BRAND_BG,
    title: "Greenhouse by Emory Valley Center",
    // Modern frameless look with native window buttons overlaid (Windows/Linux)
    // or traffic lights inset (macOS). The UI draws its own title bar.
    titleBarStyle: "hidden",
    ...(isMac
      ? { trafficLightPosition: { x: 16, y: 14 } }
      : { titleBarOverlay: { color: BRAND_BG, symbolColor: "#1d2b26", height: 44 } }),
    icon: path.join(ROOT, "electron", "assets", "icon.png"),
    webPreferences: {
      preload: path.join(ROOT, "electron", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--evc-api=${api.url}`, `--evc-token=${api.token}`, `--evc-platform=${process.platform}`],
    },
  });

  // Never navigate the app window away from the app; open links externally.
  const appOrigin = isDev ? "http://localhost:3000" : api.url;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(appOrigin)) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  const shown = Date.now();
  mainWindow.once("ready-to-show", async () => {
    if (SMOKE) {
      try {
        const r = await mainWindow.webContents.executeJavaScript(`(async () => {
          const { apiUrl, token } = window.evc; const H = { "x-evc-token": token };
          const j = (p, o = {}) => fetch(apiUrl + p, { ...o, headers: H }).then(async (x) => ({ s: x.status, ok: x.ok, b: (x.headers.get("content-type") || "").includes("json") ? await x.json() : (await x.arrayBuffer()).byteLength }));
          const page = document.title;
          const demo = await j("/api/demo/load", { method: "POST" });
          const bh = await j("/api/bh");
          const xlsx = await j("/api/reports/bh-roster.xlsx?month=" + bh.b.month);
          const unauth = (await fetch(apiUrl + "/api/meta")).status;
          return { page, demo: demo.s, events: demo.b.meta && demo.b.meta.events, op: bh.b.current && bh.b.current.op, xlsxBytes: xlsx.b, unauth };
        })()`);
        const ok = r.demo === 201 && r.events > 0 && r.op > 0 && r.xlsxBytes > 1000 && r.unauth === 401;
        smokeResult({ ok, ...r }, ok ? 0 : 1);
      } catch (err) {
        smokeResult({ ok: false, error: String(err && err.stack || err) }, 1);
      }
      return;
    }
    const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - splashStartedAt));
    setTimeout(() => {
      if (splash && !splash.isDestroyed()) {
        splash.webContents.executeJavaScript("document.body.classList.add('out')").catch(() => {});
        setTimeout(() => splash && !splash.isDestroyed() && splash.destroy(), 380);
      }
      mainWindow.maximize();
      mainWindow.show();
      if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });
    }, wait);
    console.log(`[main] main window painted in ${Date.now() - shown}ms`);
  });

  await mainWindow.loadURL(isDev ? process.env.ELECTRON_START_URL || "http://localhost:3000" : `${api.url}/`);
  mainWindow.on("closed", () => (mainWindow = null));
}

app.whenReady().then(async () => {
  // Deny camera/mic/geolocation etc. — the app needs none of them.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(false));

  splashStartedAt = Date.now();
  createSplash();
  try {
    const api = await startApi();
    await createMainWindow(api);
  } catch (err) {
    console.error("[main] startup failed:", err);
    if (SMOKE) return smokeResult({ ok: false, error: String(err && err.stack ? err.stack : err) }, 1);
    const { dialog } = require("electron");
    dialog.showErrorBox("Greenhouse couldn't start", String(err && err.stack ? err.stack : err));
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (apiServer) apiServer.close();
  if (process.platform !== "darwin") app.quit();
});

// macOS: re-opening from the dock after closing the window. The API token is
// per-launch, so the simplest correct behavior is a clean relaunch.
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && apiServer) {
    app.relaunch();
    app.exit(0);
  }
});
