#!/bin/bash
cd /Users/haseebqureshi/Code/emoryvalley
curl -s -m 15 -w "\nHTTP:%{http_code}\n" -X POST http://127.0.0.1:4100/api/imports/analyze \
  -H "x-evc-token: dev-token" \
  -H "Content-Type: application/octet-stream" \
  -H "x-filename: doctored.xlsx" \
  --data-binary "@.output/tmp/doctored.xlsx"
