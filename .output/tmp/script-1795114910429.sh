#!/bin/bash
# Is the dev-served page actually running the NEW import code?
cd /Users/haseebqureshi/Code/emoryvalley
HTML=$(curl -s http://localhost:3000/import/)
echo "$HTML" | grep -o '/_next/static/chunks/[^"]*\.js' | sort -u > /tmp/chunks.txt
wc -l /tmp/chunks.txt
FOUND=0
while read -r c; do
  if curl -s "http://localhost:3000$c" | grep -q "imports/analyze"; then
    echo "FOUND analyze in: $c"; FOUND=1
  fi
done < /tmp/chunks.txt
[ "$FOUND" = "0" ] && echo "NOT FOUND in any served chunk — browser is running OLD import code"
