#!/bin/bash
cd /Users/haseebqureshi/Code/emoryvalley
echo "== git status (porcelain, incl untracked) =="
git status --porcelain --untracked-files=all
echo "== git log =="
git log --oneline -5 2>&1 || echo "(no commits)"
echo "== files on disk =="
ls -la
echo "== git rev-parse --git-dir =="
git rev-parse --git-dir 2>&1
echo "== is package.json tracked/ignored? =="
git check-ignore -v package.json README.md 2>&1 || echo "(not ignored)"
echo "== DONE =="