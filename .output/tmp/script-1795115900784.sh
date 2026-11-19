#!/bin/bash
TOKEN="dev-token"
BASE="http://127.0.0.1:4100"
RESP=$(curl -s -X POST "$BASE/api/imports/analyze" -H "x-evc-token: $TOKEN" -H "x-filename: clean2.xlsx" -H "Content-Type: application/octet-stream" --data-binary @/tmp/evx-clean.xlsx)
UP=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['uploadId'])")
curl -s -X POST "$BASE/api/imports/$UP/commit" -H "x-evc-token: $TOKEN" -H "Content-Type: application/json" -d '{"decisions":[]}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print({k:d.get(k) for k in ['inserted','sheet','rememberedMappings','appliedDecisions','error']})"
