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

const isDev = !app.isPackaged && process.env.NODE_ENV === "development";

// Let the db layer know where to store emoryvalley.db.
process.env.ELECTRON_USER_DATA = app.getPath("userData");

const BRAND_BG = "#f6f5f0";
const SPLASH_MIN_MS = 2200; // let the logo animation play out

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
  const expressApp = createApp({ token, staticDir: path.join(__dirname, "..", "app", "out") });
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
  splash.loadFile(path.join(__dirname, "splash.html"));
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
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
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
