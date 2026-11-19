#!/bin/bash
cd /Users/haseebqureshi/Code/emoryvalley
# Remove throwaway verification helper scripts (not part of the app deliverable)
rm -f scripts/install.sh scripts/verify-stack.sh scripts/verify-ui-and-win.sh scripts/diag-git.sh scripts/commit.sh scripts/build-win.sh scripts/commit-author.sh
rmdir scripts 2>/dev/null || true
git add -A
git commit -q -m "Remove throwaway build/verify helper scripts" 2>&1
echo "== exit: $? =="
git log --oneline -3 2>&1
echo "== status =="
git status --porcelain --untracked-files=all
echo "== final tree (top level) =="
ls -d */ 2>/dev/null
echo "== DONE =="