#!/usr/bin/env bash
# Cross-platform fallback for start.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then echo ".env missing — run scripts/setup.sh first"; exit 1; fi
if [ ! -d node_modules ]; then pnpm install; fi

if ! docker ps --filter 'name=continuum-postgres' --format '{{.Names}}' | grep -q continuum-postgres; then
  docker compose up -d
  sleep 2
fi

FILTERS=(--filter @continuum/server --filter @continuum/web)
if [ "${1:-}" != "--no-desktop" ]; then FILTERS+=(--filter @continuum/desktop); fi

pnpm "${FILTERS[@]}" run --parallel dev
