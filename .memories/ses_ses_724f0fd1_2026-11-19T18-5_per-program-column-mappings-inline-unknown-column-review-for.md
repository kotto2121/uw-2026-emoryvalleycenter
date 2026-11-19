## Done

**Episode:** eps_e5a26ba7

**Outstanding**
none
**Strategy**
  Intent: Replace the hardcoded column whitelist in the Excel importer with a per-program, CRUD-able mapping system, and add a single-upload review flow in the Import Center so unknown columns can be accepted/mapped/ignored inline (with optional remembering) instead of hard-failing.
  Guidelines: Work bottom-up: schema → parser refactor → API/upload store → UI → end-to-end verification. Seed column_mappings from the existing FIELDS constant so default behavior is identical. Reuse existing patterns: RosterPreview's upload→preview→confirm flow, h() handler wrapper, db run/all/get helpers, Card/toast/select components. Keep modules small and side-effect-free where possible.
  Guardrails: No destructive migrations — existing local-first DB data must survive. No new npm dependencies. No temp files for held uploads (in-memory with TTL only). Don't fabricate real PHS data — use demo-data generation for testing. Preserve the atomic batch-commit guarantee (no import_batch row before user confirms).
  Output: Dropping any .xlsx into the Import Center never hard-fails on unknown columns: the file uploads once, unknown headers are shown with sample values, the user maps/creates/ignores each (optionally remembering per program), and commit imports the batch with extra_fields stored and mappings persisted. Demo files import exactly as before. Implementation is DRY and modular: parser stays pure, held-upload store is its own module, mappings live in SQLite seeded from the current FIELDS constant.

**Tasks**
- ✓ Add column_mappings table (program, field, alias, required) seeded from FIELDS, plus extra_fields JSON column on incident rows; idempotent migration in db/index.js · 1m 5s
- ✓ Refactor readIncidentWorkbook to accept mappings as a parameter, report unknown columns with sample values instead of throwing, and move required-field validation to commit time · 2m 10s
- ✓ Create api/lib/uploads.js held-upload store (in-memory, TTL, single-commit guard) and wire POST /api/imports/analyze, POST /api/imports/:uploadId/commit, and per-program mapping CRUD endpoints in api/server.js · 4m 37s
- ✓ Build the Import Center review UI in app/pages/import.js: unknown-column review step with map/new-field/ignore choices, remember checkboxes, sample values, following the RosterPreview pattern · 5m 34s
- ✓ End-to-end verification: demo file imports unchanged; doctored file with renamed+new columns flows through analyze→commit; extra_fields stored; remembered mappings auto-apply on re-upload · 7m 16s

✓ All 5 task(s) completed

**Tools Used**: files.edit×24, files.read×22, files.script×15, tasks.done×5, search×3, episode.prepare×1, episode.start×1, files.write×1, tasks.verify×1, episode.verify×1, episode.finish×1

**Episode Stats**
- Episode: eps_e5a26ba7
- Model: qwen3.8-max
- Provider: qwen-plan
- Tokens: ↑3.4M (19.5k tok/s) ↓29.8K (68 tok/s) · cache: 3.1M read 0 write
- Context: 77.7K final · 90.1K avg · 154.6K peak
- Duration: 7m 26s · 72 turns

**Summary**
Per-program column mappings + inline unknown-column review for Excel importer

**Implemented**
Replaced the hardcoded FIELDS whitelist in the Excel importer with a per-program, DB-backed column mapping system plus a single-upload review flow. Layers: (1) db/index.js — new column_mappings table (program/field/alias/required, UNIQUE on program+alias) seeded idempotently from the existing FIELDS constant so default behavior is unchanged; extra_fields JSON column added to event_report with an idempotent ALTER migration. (2) api/lib/incidents-xlsx.js — readIncidentWorkbook now accepts mappings as a parameter via a new buildLookup helper, reports unknown headers with sample values (unknownHeaders) instead of throwing, and defers required-column validation to commit time (require:false opt-in for the new flow, default true keeps legacy callers identical). (3) api/lib/uploads.js — new in-memory held-upload store (15-min TTL, single-commit guard, no temp files, no new deps). (4) api/server.js — POST /api/imports/analyze holds the file and returns header analysis; POST /api/imports/:uploadId/commit applies user decisions (map/new/ignore + remember), re-parses with updated mappings, validates required fields actually resolved in the file, imports the batch atomically via existing importIncidents machinery, then persists remembered mappings; plus GET/POST/DELETE per-program mapping CRUD (aliases stored squashed for consistent lookups). (5) app/pages/import.js — new IncidentReview component following the RosterPreview upload→preview→confirm pattern: unknown columns listed with sample values, per-column map-to-field/new-field/ignore choice with a remember checkbox, required-field status callout, commit button disabled until requirements met; clean files skip straight to commit. All aliases normalized through one squash function (DRY), parser stays pure, and the atomic batch guarantee is preserved (no import_batch row until user confirms).

```sigil
ses_724f0fd1 · Per-program column m
 ▒▒▒▒▒░░░░░  importer.js █░░░░░
 ▒▒▒▒▒░░░░░  incidents-xlsx.js █░░░░░
 ▒▒▒▒▒░░░░░  uploads.js █░░░░░
 ▒▒▒▒▒░░░░░  server.js █░░░░░
 ▒▒▒▒▒░░░░░  import.js █░░░░░
 ▒▒▒▒▒░░░░░  index.js █░░░░░
 shape: ▓ST▓T▓T▓TT
 tools: files.edit×24 files.read×22 files.script×15 tasks.d…
 tasks: ██████████ 5/5
```
