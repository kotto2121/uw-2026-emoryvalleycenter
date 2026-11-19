/**
 * electron/main.js — Electron main process.
 *
 * - In dev (NODE_ENV=development): loads the Next.js dev server at
 *   ELECTRON_START_URL; the API is started separately by `npm run dev`.
 * - In production (packaged app): starts the Express API in-process on a
 *   random free port, then loads the static Next.js export (app/out).
 * - Sets ELECTRON_USER_DATA so the db layer writes the SQLite file into
 *   the OS user-data dir (e.g. %APPDATA%\EmoryValley on Windows).
 */
const { app, BrowserWindow } = require("electron");
const path = require("path");
const http = require("http");

const isDev = process.env.NODE_ENV === "development";

// Let the db layer know where to store emoryvalley.db.
process.env.ELECTRON_USER_DATA = app.getPath("userData");

let apiServer = null;
let mainWindow = null;

function portInUse(port) {
  return new Promise((resolve) => {
    const req = http
      .get({ host: "127.0.0.1", port, path: "/health", timeout: 500 }, (res) => {
        res.resume();
        resolve(true);
      })
      .on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function startApi() {
  // Reuse an already-running API (e.g. `npm run dev:api`) if healthy.
  if (await portInUse(4100)) {
    console.log("[main] reusing API already listening on :4100");
    return "http://localhost:4100";
  }
  const { createApp } = require("../api/server.js");
  const expressApp = createApp();
  await new Promise((resolve) => {
    apiServer = expressApp.listen(4100, "127.0.0.1", resolve);
  });
  console.log("[main] started embedded API on :4100");
  return "http://localhost:4100";
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    title: "EmoryValley",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const apiUrl = await startApi();

  if (isDev) {
    const url = process.env.ELECTRON_START_URL || "http://localhost:3000";
    await mainWindow.loadURL(url);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // Production: the API serves the static Next.js export (app/out) and the
    // UI calls same-origin /api/* endpoints. Load over http:// (no file://).
    await mainWindow.loadURL(apiUrl);
  }

  mainWindow.on("closed", () => (mainWindow = null));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (apiServer) apiServer.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
