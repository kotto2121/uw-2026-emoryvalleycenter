set -e
cd /Users/haseebqureshi/Code/emoryvalley
git add db/index.js
GIT_EDITOR=true git rebase --continue
git log --oneline -12
git push origin claude/emory-valley-dashboard-zj18qi
git status -sb
