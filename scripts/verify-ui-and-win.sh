#!/bin/bash
cd /Users/haseebqureshi/Code/emoryvalley

echo "== A. Static UI actually served over HTTP =="
NODE_ENV=production node api/server.js > /tmp/api2.log 2>&1 &
PID=$!
sleep 2
echo "--- raw head of GET / ---"
curl -s http://localhost:4100/ | head -c 400
echo
echo "--- title tag ---"
curl -s http://localhost:4100/ | grep -oE '<title>[^<]*</title>'
echo "--- a built JS asset loads (200?) ---"
ASSET=$(curl -s http://localhost:4100/ | grep -oE '/_next/static/[^"]+\.js' | head -1)
echo "asset path: $ASSET"
curl -s -o /dev/null -w "status=%{http_code}\n" "http://localhost:4100$ASSET"
kill $PID 2>/dev/null || true

echo
echo "== B. Validate electron-builder Windows config =="
node -e "const b=require('./package.json').build; console.log('win targets:', JSON.stringify(b.win.target)); console.log('appId:', b.appId); console.log('output:', b.directories.output);"
echo "electron-builder present:"
ls node_modules/.bin/electron-builder >/dev/null 2>&1 && echo "  yes" || echo "  NO"
echo "sql.js wasm (asarUnpack target) present:"
ls node_modules/sql.js/dist/sql-wasm.wasm >/dev/null 2>&1 && echo "  yes" || echo "  NO"
echo "== DONE =="