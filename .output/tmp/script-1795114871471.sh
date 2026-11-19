#!/bin/bash
cd /Users/haseebqureshi/Code/emoryvalley
echo "--- full scripts ---"
node -e "const s=require('./package.json').scripts; for (const k in s) console.log(k+': '+s[k])"
echo "--- parent 28267 ---"
ps -p 28267 -o command=
echo "--- any electron running? ---"
ps aux | grep -i electron | grep -v grep | awk '{print $2, substr($0, index($0,$11), 120)}' | head -5
