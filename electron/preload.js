/**
 * electron/preload.js — the only bridge between main and the UI.
 *
 * Exposes `window.evc = { apiUrl, token, platform, isElectron }`. The API URL
 * (random port) and per-launch token arrive as process arguments from
 * electron/main.js. Nothing else from Node is exposed to the page.
 */
const { contextBridge } = require("electron");

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

contextBridge.exposeInMainWorld("evc", {
  apiUrl: arg("evc-api") || "http://127.0.0.1:4100",
  token: arg("evc-token") || "dev-token",
  platform: arg("evc-platform") || process.platform,
  isElectron: true,
});
