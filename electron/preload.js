/**
 * electron/preload.js — minimal, safe bridge between main and renderer.
 * Exposes the API base URL to the Next.js front end.
 */
const { contextBridge } = require("electron");

const isDev = process.env.NODE_ENV === "development";
const apiUrl = isDev ? "http://localhost:4100" : process.env.API_URL || "http://localhost:4100";

contextBridge.exposeInMainWorld("apiUrl", apiUrl);
