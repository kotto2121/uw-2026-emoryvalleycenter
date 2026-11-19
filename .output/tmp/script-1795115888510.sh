#!/bin/bash
TOKEN="dev-token"
BASE="http://127.0.0.1:4100"

echo "=== 4. commit with mapped decisions (expect 201 + rememberedMappings) ==="
UP1=$(python3 -c "import json; print(json.load(open('/tmp/an1.json'))['uploadId'])")
curl -s -X POST "$BASE/api/imports/$UP1/commit" -H "x-evc-token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"decisions":[]}' | python3 -c "import json,sys; d=json.load(sys.stdin); print({k:d.get(k) for k in ['inserted','sheet','rememberedMappings','appliedDecisions','error']})"

echo "=== 5. orient flow: commit unknown file with headerRow=3 + mapping 'Incident Date'->event_date, others as new fields ==="
UP3=$(python3 -c "import json,sys; d=json.load(open('/tmp/an3.json')); print(d['uploadId'])")
curl -s -X POST "$BASE/api/imports/$UP3/commit" -H "x-evc-token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"headerRow":3,"decisions":[{"header":"Incident Date","action":"map","field":"event_date","remember":true},{"header":"Who Was Involved","action":"map","field":"member_full_name","remember":true},{"header":"Where","action":"new","field":"ev_location","remember":true}]}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print({k:d.get(k) for k in ['inserted','rememberedMappings','appliedDecisions','error']})"

echo "=== 6. learning loop: re-analyze the same unknown file (expect alias hits -> partial/full, no human needed) ==="
curl -s -X POST "$BASE/api/imports/analyze" -H "x-evc-token: $TOKEN" -H "x-filename: unknown-again.xlsx" -H "Content-Type: application/octet-stream" --data-binary @/tmp/evx-unknown.xlsx \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print({k:d.get(k) for k in ['confidence','headerRow','rowsRead','unknownHeaders','missingRequired']})"
