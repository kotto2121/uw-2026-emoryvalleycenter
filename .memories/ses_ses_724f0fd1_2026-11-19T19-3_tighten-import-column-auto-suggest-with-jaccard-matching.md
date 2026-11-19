## Done

**Episode:** eps_17e55917

**Outstanding**
none
**Strategy**
  Intent: Make import column auto-suggest matching stricter so weak partial matches (e.g. 'Last Name' → member_full_name) no longer preselect 'map'
  Guidelines: Edit only suggestDecision + SUGGEST_THRESHOLD in app/pages/import.js; keep the exact-match fast path and the 'new' fallback unchanged.
  Guardrails: Client-side only; don't touch the API; preserve decisions[u.header] guard pattern and user override behavior.
  Output: suggestDecision uses Jaccard token similarity (intersection/union) instead of overlap/min, with a raised threshold (~0.6). 'First/Last/Middle Name' fall back to 'new' with snake_case slugs; exact/near-exact matches like 'Member Full Name' still suggest 'map'. Dev server compiles cleanly.

**Tasks**
- ✓ Replace overlap/min token scoring with Jaccard similarity and raise SUGGEST_THRESHOLD in app/pages/import.js; sanity-check scores for First/Last/Middle Name vs member_full_name and Member Full Name vs member_full_name · 56s

✓ All 1 task(s) completed

**Tools Used**: files.edit×4, files.script×3, episode.rem×1, files.view×1, search×1, files.read×1, episode.prepare×1, episode.start×1, tasks.verify×1, tasks.done×1, episode.verify×1, episode.finish×1

**Episode Stats**
- Episode: eps_17e55917
- Model: qwen3.8-max
- Provider: qwen-plan
- Tokens: ↑324.1K (6.7k tok/s) ↓4.9K (50 tok/s) · cache: 293.0K read 0 write
- Context: 23.6K final · 38.6K avg · 46.7K peak
- Duration: 1m 1s (1m 35s idle) · 16 turns

**Summary**
Tighten import column auto-suggest with Jaccard matching

**Implemented**
Tightened suggestDecision in app/pages/import.js: replaced the overly generous overlap/min token scoring (which let 'Last Name' → member_full_name at 0.9) with pure Jaccard token similarity (intersection/union), raised SUGGEST_THRESHOLD 0.45→0.6, and removed the now-dead bigram/similarity helpers that were inflating short-string scores. Sanity-checked: First/Last/Middle Name → 'new' with their own snake_case slugs; exact matches, 'Member Full Name', and 'Full Name' → 'map' to member_full_name; 'Funding Source' → 'map'; no-overlap headers → 'new'. Dev server compiled cleanly.

```sigil
ses_724f0fd1 · Tighten import colum
 ▒▒▒▒▒░░░░░  import.js ██████
 shape: ▒▒▒S▓▒▒T▒░
 tools: files.edit×4 files.script×3 episode.finish×1 episod…
 tasks: ██████████ 1/1
```
