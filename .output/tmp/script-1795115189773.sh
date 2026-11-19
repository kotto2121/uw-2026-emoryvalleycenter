set -e
cd /Users/haseebqureshi/Code/emoryvalley
git fetch origin
git pull --rebase origin claude/emory-valley-dashboard-zj18qi
git push origin claude/emory-valley-dashboard-zj18qi
git status -sb
git log --oneline -3
