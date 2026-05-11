#requires -Version 5.1
<#
.SYNOPSIS
  Stop Continuum dev processes and Docker services.
.EXAMPLE
  pnpm stop
  pwsh ./scripts/stop.ps1 -KeepDocker
  pwsh ./scripts/stop.ps1 -Wipe         # destroys all DB / Redis / MinIO data
#>
[CmdletBinding()]
param(
  [switch]$KeepDocker,
  [switch]$Wipe,
  [switch]$ForcePorts
)

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
. "$PSScriptRoot/_lib.ps1"

# 1. Kill Continuum processes on our ports ----------------------------------
$ports = @(3001, 5174, 1235)
$portList = $ports -join ", "
Write-Step "Releasing ports: $portList"
if ($ForcePorts) {
  foreach ($port in $ports) {
    try {
      $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
      foreach ($c in $conns) {
        $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        if ($proc) {
          Write-Ok "Killing $($proc.ProcessName) (PID $($proc.Id)) on :$port"
          Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
      }
    } catch { }
  }
} else {
  Stop-ContinuumPortListeners -Ports $ports -RepoPath $repo | Out-Null
}

# 2. Docker -----------------------------------------------------------------
if (-not $KeepDocker) {
  if (-not (Initialize-Docker)) {
    Write-Skip "docker not found — nothing to stop"
  } elseif (-not (Test-DockerDaemon)) {
    Write-Skip "docker daemon not running — nothing to stop"
  } elseif ($Wipe) {
    Write-Step "Stopping Docker services AND removing volumes (-Wipe)"
    $confirm = Read-Host 'Type "yes" to confirm DESTROYING all DB / Redis / MinIO data'
    if ($confirm -ne 'yes') { Write-Host 'Aborted.'; exit 0 }
    docker compose down -v
    Remove-Item '.docker-data' -Recurse -Force -ErrorAction SilentlyContinue
  } else {
    Write-Step "Stopping Docker services"
    docker compose down
  }
}

Write-Step "Done"
