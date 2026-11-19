set -e
cd /Users/haseebqureshi/Code/emoryvalley
echo "=== status ==="; git status -s | head -20
echo "=== conflict ==="; git diff --name-only --diff-filter=U
echo "=== remote commit ==="; git log --oneline -1 origin/claude/emory-valley-dashboard-zj18qi
