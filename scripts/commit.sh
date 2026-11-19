#!/bin/bash
cd /Users/haseebqureshi/Code/emoryvalley
git add -A
git commit -q -m "Scaffold Electron + Next.js + Express + SQLite hello-world app with Windows packaging

- app/: Next.js (Pages Router) static-export front end rendering Hello World from the API
- api/: minimal Express server (documented routes in api/README.md), serves static UI in prod
- db/: SQLite layer via sql.js (pure WASM, no native deps) seeded with Hello World
- electron/: main starts API + loads UI; preload exposes API base URL
- electron-builder win config (nsis + portable); README documents Windows build/delivery
- Verified end-to-end: /health, /api/hello, POST/GET greetings, persisted DB, static UI over HTTP" 2>&1
echo "== exit: $? =="
echo "== git log =="
git log --oneline -3 2>&1
echo "== tracked file count =="
git ls-files | wc -l
echo "== tracked files =="
git ls-files
echo "== remaining status =="
git status --porcelain --untracked-files=all | head -20