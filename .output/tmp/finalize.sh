#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
git rm -r --cached scripts >/dev/null 2>&1 || true
rm -rf scripts
git add -A
git commit -q -m "Remove throwaway helper scripts dir" 2>/dev/null || echo "nothing to commit"
git push origin main 2>&1
echo "=== final ==="
git status -sb | head -1
git status --short
ls -d scripts 2>/dev/null || echo "no scripts dir"
