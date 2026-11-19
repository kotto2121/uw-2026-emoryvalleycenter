#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
rm -f scripts/cleanup.sh scripts/first-push.sh scripts/show-remote.sh
rmdir scripts 2>/dev/null || true
git add -A
git commit -q -m "Remove throwaway helper scripts"
echo "=== final status (should be empty) ==="
git status --short
echo "=== log ==="
git log --oneline -4
echo "=== remote sync ==="
git status -sb | head -1
