#requires -Version 5.1
<#
.SYNOPSIS
  Start Continuum in development mode (Docker services + server + web + desktop).
.EXAMPLE
  pnpm start
  pwsh ./scripts/start.ps1 -NoDesktop
  pwsh ./scripts/start.ps1 -ServerOnly
  pwsh ./scripts/start.ps1 -SkipDocker
#>
[CmdletBinding()]
param(
  [switch]$NoDesktop,
  [switch]$ServerOnly,
  [switch]$WebOnly,
  [switch]$SkipDocker
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
. "$PSScriptRoot/_lib.ps1"

# 1. Sanity ------------------------------------------------------------------
if (-not (Test-Path '.env')) {
  Write-Warn2 ".env not found. Run 'pnpm bootstrap' (or: Copy-Item .env.example .env)"
  exit 1
}
if (-not (Test-Path 'node_modules')) {
  Write-Warn2 "node_modules missing — running pnpm install..."
  pnpm install
}

# 2. Docker ------------------------------------------------------------------
if (-not $SkipDocker) {
  if (-not (Initialize-Docker)) {
    Write-Warn2 "Docker not found — starting without containers (-SkipDocker assumed)."
    Write-Warn2 "Postgres/Redis/MinIO won't be available; the server will fail to connect."
    $SkipDocker = $true
  } elseif (-not (Test-DockerDaemon)) {
    Write-Warn2 "Docker daemon not running — start Docker Desktop first or re-run with -SkipDocker."
    exit 1
  } else {
    Write-Step "Ensuring Docker services are up"
    $running = (docker ps --filter 'name=continuum-postgres' --format '{{.Names}}') -contains 'continuum-postgres'
    if (-not $running) {
      docker compose up -d
      Start-Sleep -Seconds 2
    } else {
      Write-Ok "continuum-postgres already running"
    }
  }
}

# 3. Decide which filters to run --------------------------------------------
$filters = @()
if ($ServerOnly) {
  $filters = @('@continuum/server')
} elseif ($WebOnly) {
  $filters = @('@continuum/web')
} else {
  $filters = @('@continuum/server', '@continuum/web')
  if (-not $NoDesktop) { $filters += '@continuum/desktop' }
}

$filterArgs = @()
foreach ($f in $filters) { $filterArgs += @('--filter', $f) }

$joined = $filters -join ", "
Write-Step "Starting: $joined"
Write-Host "    (Ctrl+C to stop)`n"

& pnpm @filterArgs run --parallel dev
