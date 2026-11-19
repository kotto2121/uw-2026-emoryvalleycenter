#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
git rm -q -f scripts/final-cleanup.sh 2>/dev/null || rm -f scripts/final-cleanup.sh
rmdir scripts 2>/dev/null || true
git add -A
git commit -q -m "Remove throwaway helper script" 2>/dev/null || echo "nothing to commit"
echo "=== push ==="
git push origin main 2>&1
echo "=== final state ==="
git status -sb | head -1
git status --short
echo "=== scripts dir? ==="
ls -d scripts 2>/dev/null || echo "no scripts dir"
