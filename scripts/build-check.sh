#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
echo "=== next build (static export) ==="
npx next build app
echo "=== build OK ==="
