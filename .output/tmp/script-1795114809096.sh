#!/bin/bash
TOKEN=dev-token
# verbose-ish probe: capture HTTP code + body separately
echo "--- with dev-token ---"
curl -s -m 15 -w "\nHTTP:%{http_code}\n" -X POST http://127.0.0.1:4100/api/imports/analyze \
  -H "x-evc-token: $TOKEN" \
  -F "file=@/Users/haseebqureshi/Code/emoryvalley/.output/tmp/doctored.xlsx" \
  -H "x-filename: doctored.xlsx" 2>&1
echo ""
echo "--- GET /api/imports with dev-token ---"
curl -s -m 5 -o /dev/null -w "HTTP:%{http_code}\n" http://127.0.0.1:4100/api/imports -H "x-evc-token: $TOKEN"
echo "--- actual server stdout? check if 4100 process is api/server.js ---"
ps -p 28265 -o command= 2>/dev/null
ps -p 28321 -o command= 2>/dev/null
