## Done

**Episode:** eps_87a098da

**Outstanding**
Semantic equivalents (e.g. 'none observed.' vs 'no injury') remain separate buckets by design — that was the deferred alias-table work from the earlier discussion. Items 3 and 4 from the injury-field analysis (derived injury_severity column, body-part/injury-type tagging) are still unimplemented and awaiting user direction. Note the verification script injects synthetic variants into a /tmp demo DB, not the production DB, so no production data was touched.
**Strategy**
  Intent: Make dashboard breakdowns deterministic-merge cosmetic label variants: groupCount collapses buckets whose compareKey matches (e.g. 'no injury'/'No injury'/'no injury.'/'No injury.' → one bucket), display label = highest-count variant, no re-import needed.
  Guidelines: Re-read api/lib/queries.js and db/normalize.js immediately before editing (other session may have pending edits). Keep the SQL GROUP BY as-is; do the merge in JS after fetching rows. Reuse compareKey — no duplicated normalization logic.
  Guardrails: Deterministic only — no fuzzy matching, alias tables, or severity inference. Don't modify stored data. Don't clobber the 4 uncommitted changes on the branch.
  Output: groupCount in api/lib/queries.js merges SQL-grouped buckets by compareKey from db/normalize.js; canonical label is the highest-count variant (alphabetical tie-break); NULL still renders as one '(Not recorded)' bucket; limit/'All other' rollup applies after merging; verified against demo DB showing byInjury with a single merged 'no injury' bucket (~64) and unchanged total counts.

**Tasks**
- ✗ Implement compareKey-based bucket merging in groupCount (api/lib/queries.js): merge rows post-SQL, canonical label = highest-count variant with alphabetical tie-break, preserve '(Not recorded)' handling, apply limit/'All other' after merge · 59s
- ✓ Verify against demo DB: node script running incidentsSummary confirms byInjury shows single merged 'no injury' bucket (~64), '(Not recorded)' intact, total counts unchanged vs pre-change · 1m 39s

⚠ 1 task(s) failed, 1 completed

**Tools Used**: files.read×7, files.script×5, files.edit×2, tasks.verify×2, tasks.done×2, episode.rem×1, explore×1, search×1, episode.prepare×1, episode.start×1, session×1, episode.verify×1, episode.finish×1

**Episode Stats**
- Episode: eps_87a098da
- Model: qwen3.8-max
- Provider: qwen-plan
- Tokens: ↑629.5K (9.1k tok/s) ↓9.1K (51 tok/s) · cache: 550.0K read 0 write
- Context: 32.0K final · 45.4K avg · 63.1K peak
- Duration: 1m 52s (8m 13s idle) · 26 turns

**Summary**
groupCount now deterministically merges cosmetic label variants via compareKey

**Implemented**
Extended groupCount in api/lib/queries.js to deterministically merge cosmetic label variants after the SQL GROUP BY: buckets whose db/normalize.js compareKey matches (case/punctuation/whitespace differences, e.g. 'no injury'/'No injury.'/'No Injury.') collapse into one row whose display label is the highest-count variant with an alphabetical tie-break. '(Not recorded)' is handled as its own bucket and is unaffected; limit/'All other' rollup now applies after merging, so the merged totals are what feed the top-N truncation. No stored data is modified — this is query-time only, so it works on existing DB rows without a re-import, and no fuzzy matching, alias tables, or severity inference was introduced (the guardrail against inference-based merging is respected; 'none observed.' vs 'no injury' correctly stay separate buckets because they differ beyond cosmetics). Reuses compareKey rather than duplicating normalization logic. Verified end-to-end through the real incidentsSummary code path on a fresh demo DB with injected cosmetic variants: 'no injury' family -> 1 bucket, 'minor injury' family -> 1 bucket, '(Not recorded)' intact at 673, and byInjury total (2120) exactly equals the dedup-filtered baseline (apples-to-apples, since incidentsSummary excludes exact duplicates). An earlier task was flagged by the harness for circular reasoning because the first verification script replicated the merge logic inline instead of calling groupCount; the re-run verification (verify-groupcount-real2.js) calls the real function and passed.

```sigil
ses_4913655c · groupCount now deter
 ▒▒▒▒▒░░░░░  queries.js ██████
 shape: ▒▒▓S▓▓▓TT░
 tools: files.read×7 files.script×6 files.edit×2 tasks.veri…
 tasks: █████░░░░░ 1/2
```
