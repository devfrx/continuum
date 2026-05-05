#requires -Version 5.1
<#
.SYNOPSIS
  Continuum one-shot setup: prerequisites, dependencies, Docker services, schema.
.EXAMPLE
  pnpm setup
  pwsh ./scripts/setup.ps1 -SkipDocker -SkipInstall -Force
#>
[CmdletBinding()]
param(
  [switch]$SkipDocker,
  [switch]$SkipInstall,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
. "$PSScriptRoot/_lib.ps1"

# 1. Prereqs ------------------------------------------------------------------
Write-Step "Checking prerequisites"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Bad "Node.js not found. Install from https://nodejs.org (>= 20)."
  exit 1
}
$nodeMajor = [int]((& node -v) -replace '^v(\d+)\..*','$1')
if ($nodeMajor -lt 20) { Write-Bad "Node $nodeMajor detected; need >= 20"; exit 1 }
Write-Ok "Node $(node -v)"

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Warn2 "pnpm not found, installing globally..."
  npm install -g pnpm@9.12.0
}
Write-Ok "pnpm $(pnpm -v)"

if (-not $SkipDocker) {
  if (-not (Initialize-Docker)) {
    Write-Bad "Docker CLI not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop"
    Write-Warn2 "Or re-run with -SkipDocker to set up everything else."
    exit 1
  }
  Write-Ok "docker -> $(Resolve-DockerCommand)"
  if (-not (Test-DockerDaemon)) {
    Write-Bad "Docker daemon is not running. Open Docker Desktop and wait for it, then re-run."
    exit 1
  }
  Write-Ok "Docker daemon running"
}

# 2. .env ---------------------------------------------------------------------
Write-Step "Configuring .env"
if (-not (Test-Path '.env') -or $Force) {
  Copy-Item '.env.example' '.env' -Force
  Write-Ok ".env created from .env.example"
} else {
  Write-Ok ".env already exists (use -Force to overwrite)"
}

# 3. Dependencies -------------------------------------------------------------
if (-not $SkipInstall) {
  Write-Step "Installing workspace dependencies (pnpm install)"
  pnpm install
  if ($LASTEXITCODE -ne 0) { Write-Bad "pnpm install failed"; exit 1 }
  Write-Ok "Dependencies installed"
} else {
  Write-Warn2 "Skipping pnpm install (-SkipInstall)"
}

# 4. Docker services ----------------------------------------------------------
if (-not $SkipDocker) {
  Write-Step "Starting Docker services (postgres, redis, minio)"
  docker compose up -d
  if ($LASTEXITCODE -ne 0) { Write-Bad "docker compose up failed"; exit 1 }

  Write-Step "Waiting for Postgres to become ready"
  $ready = $false
  for ($i = 1; $i -le 30; $i++) {
    docker exec continuum-postgres pg_isready -U continuum -d continuum *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
    Write-Host "    ... waiting ($i/30)"
  }
  if (-not $ready) { Write-Bad "Postgres did not become ready in time"; exit 1 }
  Write-Ok "Postgres ready"
}

# 5. DB schema ----------------------------------------------------------------
if (-not $SkipDocker) {
  Write-Step "Applying database schema (server/drizzle/init.sql)"
  $sqlPath = Join-Path $PSScriptRoot '..\server\drizzle\init.sql'
  if (-not (Test-Path $sqlPath)) {
    Write-Warn2 "init.sql not found at $sqlPath; skipping schema apply"
  } else {
    $sql = Get-Content -Raw $sqlPath
    $sql | docker exec -i continuum-postgres psql -U continuum -d continuum -v ON_ERROR_STOP=1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
      Write-Warn2 "Schema apply failed. Re-run later with: pnpm db:apply"
    } else {
      Write-Ok "Schema applied"
    }
  }
}

# 6. Done ---------------------------------------------------------------------
Write-Step "Setup complete"
Write-Host @"

Next steps:
  - Open LM Studio (load chat + embedding models) on http://localhost:1234
  - Optional: start Ollama on http://localhost:11434
  - Run:   pnpm start
  - Web:   http://localhost:5174
  - API:   http://localhost:3001/health
  - Check: pnpm check
  Note: use 'pnpm bootstrap' (not 'pnpm setup') to re-run this script.

"@ -ForegroundColor Green
