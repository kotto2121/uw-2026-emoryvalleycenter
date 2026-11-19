#!/bin/bash
set -e
cd /Users/haseebqureshi/Code/emoryvalley
git commit -m "docs: add docs/build-windows.md and condense README build section to link to it" -- README.md docs/build-windows.md
git log --oneline -1
git show --stat --format= HEAD