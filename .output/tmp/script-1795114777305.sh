#!/bin/bash
echo "=== Node processes ==="
ps aux | grep -E "node|next" | grep -v grep | grep -v rehex | awk '{print $2, $9, substr($0, index($0,$11), 200)}'
echo ""
echo "=== Listening ports (node) ==="
lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep -E "node|next" | awk '{print $1, $2, $9}'
