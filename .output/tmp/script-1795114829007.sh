#!/bin/bash
F=/Users/haseebqureshi/Code/emoryvalley/.output/tmp/doctored.xlsx
ls -la "$F"
curl -s -m 15 -w "\nHTTP:%{http_code}\n" -X POST http://127.0.0.1:4100/api/imports/analyze \
  -H "x-evc-token: dev-token" \
  -H "Content-Type: application/octet-stream" \
  -H "x-filename: doctored.xlsx" \
  --data-binary "@$F"
