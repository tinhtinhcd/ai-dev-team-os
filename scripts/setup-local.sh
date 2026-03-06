#!/usr/bin/env bash
# Local development setup: initialize .env, install deps, verify build
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo "==> AI Dev Team OS – local setup"
echo ""

# 1. Initialize .env from template if missing
if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example"
  cp .env.example .env
  echo "    Edit .env to add Slack/Linear keys when needed."
else
  echo "==> .env already exists, skipping"
fi

# 2. Install root dependencies
echo "==> Installing root dependencies"
npm install

# 3. Install gateway dependencies
echo "==> Installing gateway dependencies"
cd gateway && npm install && cd ..

# 4. Build main app
echo "==> Building main app"
npm run build

# 5. Build gateway
echo "==> Building gateway"
cd gateway && npm run build && cd ..

echo ""
echo "==> Setup complete. Run 'npm run dev' to start the dev server."
echo "    See README.md for local development workflow."
