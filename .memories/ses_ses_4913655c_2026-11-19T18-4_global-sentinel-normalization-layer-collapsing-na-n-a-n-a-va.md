## Done

**Episode:** eps_d5e60d34

**Outstanding**
Fuzzy similarity for free-text narratives was explicitly deferred (future review-queue suggestion feature). Already-imported DBs retain raw sentinel strings in stored rows — a re-import or a one-shot UPDATE migration would retroactively clean existing data. groupCount's '(Not recorded)' vs '(Not applicable)' distinction (blank vs explicit N/A) is currently merged into one bucket; could split later if the distinction matters to compliance reporting.
**Strategy**
  Intent: Add a globally-available value normalization layer (sentinel canonicalization) so cosmetic variants like NA/n/a/N/A collapse to one canonical value across all data ingestion paths, eliminating implicit duplicate buckets in dashboards.
  Guidelines: Re-read each file immediately before editing (another session ses_724f0fd1 has pending edits to importer.js, incidents-xlsx.js, db/index.js, server.js, uploads.js). Put normalization at the cell-clean stage so it flows through hashing consistently; document the decision. Keep splitOptions matching intact for concatenated multi-select fields.
  Guardrails: No fuzzy matching or auto-merging of free-text. No per-pipeline copies of the sentinel list. Don't clobber the other session's pending edits. Don't destroy raw values needed for audit without noting it.
  Output: A single shared normalization module (db/normalize.js) is the only home of sentinel/canonicalization rules; incident xlsx and BH roster docx ingest paths both apply it; sentinel variants store as NULL and render as one bucket in groupCount breakdowns; row-hash dedupe still works; a verification script proves ['NA','n/a','N/A',' None ','-',''] all normalize to null and demo re-import shows a single '(Not recorded)' bucket in byObservation.

**Tasks**
- ✓ Create db/normalize.js: canonicalize (trim, NFKC, whitespace collapse) + sentinel set -> null, with field-level opt-out support and unit-style self-check · 28s
- ✓ Wire normalization into incident xlsx ingest (incidents-xlsx.js clean()) and roster docx path (docx-tables.js), re-reading files first to avoid clobbering ses_724f0fd1 edits; document hash-position decision · 1m 12s
- ✓ Verify: run normalizer script over sentinel variants; regenerate/re-import demo data and confirm byObservation collapses to a single '(Not recorded)' bucket; confirm dedupe still works on re-import · 1m 38s

✓ All 3 task(s) completed

**Tools Used**: files.read×12, files.edit×4, tasks.done×3, search×2, explore×2, session×2, files.script×2, episode.prepare×1, episode.start×1, files.write×1, tasks.verify×1, episode.verify×1, episode.finish×1

**Episode Stats**
- Episode: eps_d5e60d34
- Model: qwen3.8-max
- Provider: qwen-plan
- Tokens: ↑840.4K (9.8k tok/s) ↓8.7K (45 tok/s) · cache: 717.2K read 0 write
- Context: 40.4K final · 55.6K avg · 80.0K peak
- Duration: 1m 49s · 28 turns

**Summary**
Global sentinel normalization layer collapsing NA/n/a/N/A variants across all ingest paths

**Implemented**
Created db/normalize.js as the single home for value normalization: compareKey (NFKC + diacritic strip + exotic-space handling + alphanumeric squash) for sentinel detection, SENTINELS set (na/n.a./none/null/nil/unknown/tbd/?/dashes/etc.), normalizeValue (cleanup + sentinel->null, keepSentinels opt-out per field), and normalizeRecord. Wired at the cell-clean chokepoint in incidents-xlsx.js so every mapped xlsx cell is normalized BEFORE row hashing — dedupe hashes normalized values, so re-import dedupe still passes (verified: 0 inserted / 328 skipped) and sentinel variance no longer defeats it. Wired into importRoster for BH docx names + extra columns (sentinel names skipped). No changes to splitOptions/classify — multi-select 'N/A' glued to real options is unaffected. Verified e2e: unit script all-PASS (13 sentinel cases -> null, legitimate values/Dates/numbers untouched, opt-out works); demo re-import shows byObservation with a single '(Not recorded)' bucket (449) instead of NA/n/a/N/A variants, and observation_blank=449 confirms consistency.

```sigil
ses_4913655c · Global sentinel norm
 ▒▒▒▒▒░░░░░  importer.js ██░░░░
 ▒▒▒▒▒░░░░░  incidents-xlsx.js ██░░░░
 ▒▒▒▒▒░░░░░  normalize.js ██░░░░
 shape: ▓▓ST▓▓T▓T▒
 tools: files.read×12 files.edit×4 tasks.done×3 search×2 ex…
 tasks: ██████████ 3/3
```
