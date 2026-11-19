#!/bin/bash
curl -s -m 15 -X POST http://127.0.0.1:4100/api/imports/analyze \
  -H "x-evc-token: dev-token" \
  -F "file=@/Users/haseebqureshi/Code/emoryvalley/.output/tmp/doctored.xlsx" \
  -H "x-filename: doctored.xlsx"
echo ""
