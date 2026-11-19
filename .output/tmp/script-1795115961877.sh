cd /Users/haseebqureshi/Code/emoryvalley
git add api/lib/incidents-xlsx.js api/server.js app/pages/import.js
git commit -m "feat(imports): graceful schema-discovery xlsx flow — confidence grading, orientation UI, alias learning

- Parser returns confidence-graded results (full/partial/none) instead of
  throwing 422 on unrecognized sheets; opts.headerRow override for the UI
  orientation path; preview rows and unmappedRequired surfaced for review.
- analyze passes confidence/headerRow/preview through and accepts
  ?headerRow= for re-analysis; commit accepts headerRow so fully-unknown
  files complete orient -> map -> commit.
- IncidentReview renders three states from one component: confirm (full),
  unknown-columns mapping with blocking required fields (partial), and a
  click-to-orient preview grid (none) that re-analyzes into mapping state.
- Verified end-to-end: clean imports unchanged; doctored files show the
  mapping UI; unknown files orient via row pick and commit; re-analyzing
  the same novel file auto-orients from persisted aliases (learning loop)."
git log --oneline -3