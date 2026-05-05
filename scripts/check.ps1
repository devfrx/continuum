#requires -Version 5.1
<#
.SYNOPSIS
  Health check: types + Docker containers + HTTP probes for every service.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
. "$PSScriptRoot/_lib.ps1"

function Test-Url($name, $url, [int]$timeoutSec = 2) {
  try {
    $r = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec $timeoutSec -UseBasicParsing -ErrorAction Stop
    if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) {
      Write-Ok "$name -> $url ($($r.StatusCode))"
      return $true
    }
    Write-Bad "$name -> $url returned $($r.StatusCode)"
  } catch {
    Write-Bad "$name -> $url unreachable"
  }
  return $false
}

# 1. Type checks --------------------------------------------------------------
Write-Step "Workspace typecheck (pnpm -r typecheck)"
pnpm -r typecheck
if ($LASTEXITCODE -eq 0) { Write-Ok "All packages type-check cleanly" } else { Write-Bad "Typecheck failed" }

# 2. Containers ---------------------------------------------------------------
Write-Step "Docker containers"
if (-not (Initialize-Docker)) {
  Write-Skip "docker CLI not found (install Docker Desktop or check PATH)"
} elseif (-not (Test-DockerDaemon)) {
  Write-Skip "docker daemon not running"
} else {
  $names = @('continuum-postgres','continuum-redis','continuum-minio')
  foreach ($n in $names) {
    $running = docker ps --filter "name=$n" --format '{{.Status}}' 2>$null
    if ($running) { Write-Ok "$n -> $running" } else { Write-Bad "$n not running" }
  }
}

# 3. HTTP services ------------------------------------------------------------
Write-Step "HTTP services"
Test-Url 'Server   '  'http://localhost:3001/health'        | Out-Null
Test-Url 'AI health'  'http://localhost:3001/api/ai/health' | Out-Null
Test-Url 'Web (vite)' 'http://localhost:5174'               | Out-Null
Test-Url 'MinIO     ' 'http://localhost:9000/minio/health/live' | Out-Null
Test-Url 'LM Studio ' 'http://localhost:1234/v1/models'     | Out-Null
Test-Url 'Ollama    ' 'http://localhost:11434/v1/models'    | Out-Null

# 4. Hocuspocus (TCP only) ----------------------------------------------------
Write-Step "Hocuspocus (TCP probe :1235)"
try {
  $tcp = New-Object System.Net.Sockets.TcpClient
  $iar = $tcp.BeginConnect('127.0.0.1', 1235, $null, $null)
  if ($iar.AsyncWaitHandle.WaitOne(1000) -and $tcp.Connected) {
    Write-Ok "Hocuspocus accepting connections"
    $tcp.Close()
  } else {
    Write-Bad "Hocuspocus not reachable"
  }
} catch { Write-Bad "Hocuspocus probe error: $_" }

Write-Host ""
