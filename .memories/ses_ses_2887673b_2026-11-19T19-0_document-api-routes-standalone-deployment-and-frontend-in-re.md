## Done

**Episode:** eps_709a789b

**Outstanding**
none
**Strategy**
  Intent: Ensure complete, accurate documentation for the API (all routes + how to run it standalone outside Electron) and for the Next.js frontend.
  Guidelines: Read api/server.js, db/index.js, app/lib, next.config.js and electron/preload.js first; document only what the code actually does. Keep the existing route-table style in api/README.md.
  Guardrails: Docs-only changes — no code modifications. Don't invent env vars or behavior not present in the code. Avoid touching files other sessions are editing (api/lib/queries.js).
  Output: api/README.md documents every route in api/server.js plus a "Running the API standalone" section (port/token config, auth, CORS/Host caveats); a frontend doc (app/README.md) covers pages, API wiring, dev workflow and build integration; root README links both. All claims verified against actual code.

**Tasks**
- ✓ Verify api/README.md route table against api/server.js; document standalone API deployment (env vars, token, CORS/Host, DB path) · 41s
- ✓ Write app/README.md frontend documentation (pages, API wiring, dev workflow, build integration) and link both docs from root README · 1m 16s

✓ All 2 task(s) completed

**Tools Used**: files.read×13, files.edit×4, explore×3, tasks.done×2, episode.prepare×1, episode.start×1, tasks.verify×1, files.write×1, episode.verify×1, episode.finish×1

**Episode Stats**
- Episode: eps_709a789b
- Model: qwen3.8-max
- Provider: qwen-plan
- Tokens: ↑681.3K (8.8k tok/s) ↓4.5K (43 tok/s) · cache: 616.4K read 0 write
- Context: 34.3K final · 51.9K avg · 68.0K peak
- Duration: 1m 21s · 25 turns

**Summary**
Document API routes, standalone deployment, and frontend in READMEs

**Implemented**
Verified api/README.md against api/server.js and added the six missing routes (imports/analyze, imports/:uploadId/commit, programs/:key/columns CRUD). Added a "Running the API standalone" section documenting env vars (PORT, EVC_API_TOKEN, EVC_DEV_ORIGIN, EVC_DB_PATH), DB file location precedence, createApp embedding, and security caveats for moving off 127.0.0.1. Wrote app/README.md covering all nine pages, API wiring via window.evc with dev fallback, dev workflow, static export/build integration, and styling. Linked both docs from the root README.

```sigil
ses_2887673b · Document API routes,
 ▒▒▒▒▒░░░░░  README.md ██░░░░
 ▒▒▒▒▒░░░░░  README.md ██░░░░
 ▒▒▒▒▒░░░░░  README.md ██░░░░
 shape: ▒S▓▓▒T▓▓▒T
 tools: files.read×13 files.edit×4 explore×3 tasks.done×2 e…
 tasks: ██████████ 2/2
```
