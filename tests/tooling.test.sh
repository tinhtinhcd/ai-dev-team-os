#!/usr/bin/env bash
# Tests for setup scripts and tooling
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

errors=0

# 1. setup-local.sh exists and is executable
if [ ! -f scripts/setup-local.sh ]; then
  echo "FAIL: scripts/setup-local.sh not found"
  errors=$((errors + 1))
fi

# 2. smoke-test.sh exists
if [ ! -f scripts/smoke-test.sh ]; then
  echo "FAIL: scripts/smoke-test.sh not found"
  errors=$((errors + 1))
fi

# 3. .env.example exists
if [ ! -f .env.example ]; then
  echo "FAIL: .env.example not found"
  errors=$((errors + 1))
fi

# 4. package.json has required scripts
for script in dev build lint; do
  if ! grep -q "\"$script\"" package.json; then
    echo "FAIL: package.json missing script: $script"
    errors=$((errors + 1))
  fi
done

# 5. README exists and mentions local setup
if [ ! -f README.md ]; then
  echo "FAIL: README.md not found"
  errors=$((errors + 1))
elif ! grep -qi "local\|setup\|development" README.md; then
  echo "FAIL: README.md should mention local setup or development"
  errors=$((errors + 1))
fi

# 6. Smoke test passes (build + lint)
if ! bash scripts/smoke-test.sh > /dev/null 2>&1; then
  echo "FAIL: scripts/smoke-test.sh failed"
  errors=$((errors + 1))
fi

if [ $errors -gt 0 ]; then
  echo "tooling.test.sh: $errors error(s)"
  exit 1
fi
