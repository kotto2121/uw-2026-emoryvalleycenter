#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
git add -A
echo "=== files to be committed ==="
git diff --cached --name-only | sed 's/^/  /'
echo "=== count ==="
git diff --cached --name-only | wc -l
git commit -q -m 'Rename app to "Greenhouse by Emory Valley Center"; untrack Next.js build cache

Update user-facing name across package.json (productName, author), Electron
window title, Next.js page title + visible brand line, and README (heading,
artifact names, DB path note). Add app/.next/ to .gitignore and remove the
build cache that was accidentally tracked.'
echo "=== after commit ==="
git status --short | wc -l
git log --oneline -3
