#!/usr/bin/env node
/**
 * Bundle the Electron main process + API + DB layer into dist/main.js.
 *
 * Why: electron-builder's node_modules collection silently dropped a nested
 * dependency (call-bind-apply-helpers) and the packaged app crashed at start.
 * Bundling means the packaged app ships NO node_modules at all — one JS file
 * plus the sql.js WebAssembly binary — so that class of bug can't happen, and
 * the app is much smaller.
 */
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

esbuild
  .build({
    entryPoints: [path.join(root, "electron", "main.js")],
    outfile: path.join(dist, "main.js"),
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    external: ["electron"],
    sourcemap: false,
    minify: false, // keep stack traces readable for bug reports
    legalComments: "none",
    logLevel: "warning",
  })
  .then(() => {
    fs.copyFileSync(require.resolve("sql.js/dist/sql-wasm.wasm"), path.join(dist, "sql-wasm.wasm"));
    const kb = (f) => Math.round(fs.statSync(path.join(dist, f)).size / 1024);
    console.log(`dist/main.js ${kb("main.js")} KB, dist/sql-wasm.wasm ${kb("sql-wasm.wasm")} KB`);
  })
  .catch(() => process.exit(1));
