## Memory: Decision: label-variant grouping — embeddings deferred
<!-- memoryType: agent -->

In the emoryvalley dashboard project (branch claude/emory-valley-dashboard-zj18qi), `groupCount` in `api/lib/queries.js` deterministically merges cosmetic label variants at query time using `compareKey` from `db/normalize.js` (case/punctuation/whitespace only; canonical label = highest-count variant, alphabetical tie-break; '(Not recorded)' is its own bucket; limit/'All other' rollup applies after merge). No stored data is modified.

**Deferred decision (Nov 2026):** Semantic equivalents (e.g. 'none observed.' vs 'no injury') remain separate buckets. The user agreed embeddings are the ideal approach for detecting semantically-similar values that ought to be grouped, but explicitly deferred building it — no similarity-detection script, no alias table, no embedding pipeline for now. Do not start this work without the user asking. If revisited, the discussed design was: an offline candidate-report script (token overlap + trigrams, optionally embedding/LLM-seeded) producing ranked pairs for human review, approved pairs going into a versioned alias file (e.g. db/aliases.json) consulted by groupCount after the compareKey merge — keeping query-time merging deterministic.

Also still awaiting user direction: derived injury_severity column and body-part/injury-type tagging (items 3 and 4 from the injury-field analysis).
