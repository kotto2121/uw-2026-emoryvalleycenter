cd /Users/haseebqureshi/Code/emoryvalley
git status -s | grep -v '^A ' || true
echo "=== unmerged ==="
git diff --name-only --diff-filter=U
echo "=== server.js conflict hunks ==="
grep -n '<<<<<<<\|=======\|>>>>>>>' api/server.js || true
