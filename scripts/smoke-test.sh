#!/usr/bin/env bash
# Minimal production-readiness smoke test: build + lint
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Smoke test: build + lint"
echo ""

echo "==> Root: npm run build"
npm run build

echo "==> Root: npm run lint"
npm run lint

echo "==> Gateway: npm run build"
cd gateway && npm run build && cd ..

echo "==> Gateway: npm run lint"
cd gateway && npm run lint && cd ..

echo ""
echo "==> Smoke test passed."
