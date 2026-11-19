## Done

**Episode:** eps_594c19da

**Outstanding**
Suggestions are heuristics only — no LLM/backend matching, and no visual "suggested" hint in the UI; the select just shows the preselected value.
**Strategy**
  Intent: Auto-suggest action + field for unknown columns in the import mapping UI so users aren't forced to manually configure every unrecognized header
  Guidelines: Add a pure suggestDecision(header, knownFields) helper in app/pages/import.js using normalization + token overlap + similarity; use it in the initial useState and the sync useEffect.
  Guardrails: Client-side only; preserve the decisions[u.header] guard pattern; keep remember default true; don't touch the API.
  Output: Uploading a file with unknown headers shows preselected suggestions: fuzzy-matched known fields preselect 'map' with the field; unmatched headers preselect 'new' with a snake_case slug. Suggestions apply on initial render and after header-row re-analysis. User can override; no crashes.

**Tasks**
- ✓ Implement suggestDecision helper and wire it into initial decisions state and the re-analysis sync useEffect in app/pages/import.js; verify mapping panel preselects suggestions without crashing · 24s

✓ All 1 task(s) completed

**Tools Used**: search×2, files.read×2, files.edit×2, episode.rem×1, files.view×1, episode.prepare×1, episode.start×1, tasks.verify×1, tasks.done×1, episode.verify×1, episode.finish×1

**Episode Stats**
- Episode: eps_594c19da
- Model: qwen3.8-max
- Provider: qwen-plan
- Tokens: ↑319.6K (6.3k tok/s) ↓3.3K (42 tok/s) · cache: 279.9K read 0 write
- Context: 25.9K final · 40.0K avg · 50.7K peak
- Duration: 31s (3m 12s idle) · 15 turns

**Summary**
Auto-suggest map/new actions for unknown import columns

**Implemented**
Added a suggestDecision(header, knownFields) helper to app/pages/import.js that fuzzy-matches each unknown header against known fields: exact/normalized match scores 1.0, token overlap and character-bigram similarity are combined with a 0.45 threshold, and unmatched headers fall back to action:'new' with a snake_case slug of the header (e.g. 'Funding Source' → 'funding_source'). Wired it into both the initial decisions useState and the sync useEffect that backfills after header-row re-analysis. Users can still override any preselected action/field. Dev server compiled cleanly.

```sigil
ses_724f0fd1 · Auto-suggest map/new
 ▒▒▒▒▒░░░░░  import.js ██████
 shape: ▒▒U▓▒S▒▒T░
 tools: search×2 files.read×2 files.edit×2 episode.finish×1…
 tasks: ██████████ 1/1
```
