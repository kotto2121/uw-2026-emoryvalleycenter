set -e
cd /Users/haseebqureshi/Code/emoryvalley
node --check api/lib/queries.js
git add api/lib/queries.js
GIT_EDITOR=true git rebase --continue || { echo "REBASE_CONFLICT_AGAIN"; git status -s | grep -v '^A ' || true; grep -rn '<<<<<<<' --include='*.js' api db app || true; exit 0; }
echo "=== log ==="; git log --oneline -12
echo "=== push ==="
git push origin claude/emory-valley-dashboard-zj18qi
git status -sb
