#!/usr/bin/env bash
# Cross-platform fallback for setup. Mirrors scripts/setup.ps1.
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf "\n\033[36m==> %s\033[0m\n" "$1"; }
ok()   { printf "    \033[32mOK   %s\033[0m\n" "$1"; }
warn() { printf "    \033[33mWARN %s\033[0m\n" "$1"; }
err()  { printf "    \033[31mERR  %s\033[0m\n" "$1"; }

need() { command -v "$1" >/dev/null 2>&1 || { err "'$1' not found. $2"; exit 1; }; }

step "Checking prerequisites"
need node 'Install Node.js 20+'
NODE_MAJOR=$(node -v | sed -E 's/^v([0-9]+).*/\1/')
[ "$NODE_MAJOR" -ge 20 ] || { err "Node $NODE_MAJOR; need >= 20"; exit 1; }
ok "Node $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  warn "pnpm not found, installing..."
  npm install -g pnpm@9.12.0
fi
ok "pnpm $(pnpm -v)"

need docker 'Install Docker Desktop'
docker info >/dev/null 2>&1 || { err "Docker daemon not running"; exit 1; }
ok "Docker daemon running"

step "Configuring .env"
if [ ! -f .env ]; then cp .env.example .env; ok ".env created"; else ok ".env exists"; fi

step "Installing dependencies"
pnpm install

step "Starting Docker services"
docker compose up -d

step "Waiting for Postgres"
for i in $(seq 1 30); do
  if docker exec continuum-postgres pg_isready -U continuum -d continuum >/dev/null 2>&1; then
    ok "Postgres ready"; break
  fi
  echo "    ... waiting ($i/30)"; sleep 1
done

step "Pushing schema"
pnpm --filter @continuum/server db:push || warn "db:push failed; re-run later"

step "Setup complete"
echo "Next:  pnpm start  (or scripts/start.sh)"
