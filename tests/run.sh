#!/usr/bin/env bash
# Run the full test suite
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Running test suite"
echo ""

failed=0

# Tooling / workflow tests
if [ -f tests/tooling.test.sh ]; then
  echo "==> tests/tooling.test.sh"
  if bash tests/tooling.test.sh; then
    echo "    PASS"
  else
    echo "    FAIL"
    failed=1
  fi
  echo ""
fi

if [ $failed -eq 0 ]; then
  echo "==> All tests passed."
else
  echo "==> Some tests failed."
  exit 1
fi
