#!/bin/bash
set -e
cd /Users/haseebqureshi/Code/emoryvalley

echo "== 1. Build Next.js static export =="
npm run build:ui 2>&1 | tail -15

echo "== 2. Confirm app/out exists =="
ls -la app/out/ | head -5
test -f app/out/index.html && echo "index.html OK"

echo "== 3. Start API in production mode (serves app/out + /api) =="
rm -f db/emoryvalley.db   # fresh seed
NODE_ENV=production node api/server.js > /tmp/api.log 2>&1 &
API_PID=$!
sleep 2

echo "== 4. Hit endpoints =="
echo "--- /health ---";        curl -s http://localhost:4100/health; echo
echo "--- /api/hello ---";     curl -s http://localhost:4100/api/hello; echo
echo "--- POST /api/greetings ---"; curl -s -X POST http://localhost:4100/api/greetings -H 'Content-Type: application/json' -d '{"message":"Hi Windows!"}'; echo
echo "--- /api/greetings ---"; curl -s http://localhost:4100/api/greetings; echo
echo "--- GET / (static UI served) ---"; curl -s http://localhost:4100/ | grep -o '<title>[^<]*</title>' | head -1

echo "== 5. Confirm SQLite file persisted =="
ls -la db/emoryvalley.db

kill $API_PID 2>/dev/null || true
echo "== DONE =="