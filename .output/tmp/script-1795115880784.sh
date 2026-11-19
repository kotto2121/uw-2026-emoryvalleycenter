#!/bin/bash
TOKEN="dev-token"
BASE="http://127.0.0.1:4100"
sleep 1

echo "=== health ==="
curl -s -m 5 "$BASE/health"; echo

echo "=== 1. clean xlsx (expect confidence full) ==="
curl -s -X POST "$BASE/api/imports/analyze" -H "x-evc-token: $TOKEN" -H "x-filename: clean.xlsx" -H "Content-Type: application/octet-stream" --data-binary @/tmp/evx-clean.xlsx | python3 -c "import json,sys; d=json.load(sys.stdin); print({k:d.get(k) for k in ['confidence','headerRow','sheet','rowsRead','unknownHeaders','missingRequired','uploadId']})" > /tmp/an1.json
cat /tmp/an1.json

echo "=== 2. doctored xlsx (expect partial + unknownHeaders) ==="
curl -s -X POST "$BASE/api/imports/analyze" -H "x-evc-token: $TOKEN" -H "x-filename: doctored.xlsx" -H "Content-Type: application/octet-stream" --data-binary @/tmp/evx-doctored.xlsx | python3 -c "import json,sys; d=json.load(sys.stdin); print({k:d.get(k) for k in ['confidence','headerRow','rowsRead','unknownHeaders','missingRequired']})"

echo "=== 3. unknown xlsx (expect confidence none + preview, NO 422) ==="
curl -s -X POST "$BASE/api/imports/analyze" -H "x-evc-token: $TOKEN" -H "x-filename: unknown.xlsx" -H "Content-Type: application/octet-stream" --data-binary @/tmp/evx-unknown.xlsx > /tmp/an3.json
python3 -c "import json; d=json.load(open('/tmp/an3.json')); print({k:d.get(k) for k in ['confidence','headerRow','rowsRead','missingRequired']}); print('preview rows:', len(d.get('preview') or [])); print('row3:', (d.get('preview') or [None]*3)[2])"
