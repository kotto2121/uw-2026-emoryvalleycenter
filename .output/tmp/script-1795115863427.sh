#!/bin/bash
cd /Users/haseebqureshi/Code/emoryvalley
cat package.json | head -30
grep -rn "token" api/server.js | head -5
ls .env* 2>/dev/null && cat .env 2>/dev/null | grep -i token | head -3
