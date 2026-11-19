#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
git rm -r --cached app/.next >/dev/null 2>&1 || echo "nothing to untrack"
echo "=== staged summary ==="
git add -A
git status --short | head -40
echo "=== counts ==="
git status --short | wc -l
