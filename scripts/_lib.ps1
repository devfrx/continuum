# Shared helpers for Continuum scripts.
# Dot-source from other scripts:  . "$PSScriptRoot/_lib.ps1"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    [OK]   $msg" -ForegroundColor Green }
function Write-Bad($msg)  { Write-Host "    [FAIL] $msg" -ForegroundColor Red }
function Write-Warn2($msg){ Write-Host "    [WARN] $msg" -ForegroundColor Yellow }
function Write-Skip($msg) { Write-Host "    [skip] $msg" -ForegroundColor DarkGray }

<#
.SYNOPSIS
  Locate the docker CLI even if it's not on PATH (Docker Desktop on Windows
  doesn't always update PATH for non-interactive shells). Returns $null if
  not found.
#>
function Resolve-DockerCommand {
  $cmd = Get-Command docker -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe",
    "$env:ProgramFiles\Docker\Docker\resources\docker.exe",
    "$env:LOCALAPPDATA\Docker\bin\docker.exe",
    "${env:ProgramFiles(x86)}\Docker\Docker\resources\bin\docker.exe"
  )
  foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { return $c }
  }
  return $null
}

<#
.SYNOPSIS
  Ensure docker.exe is callable from the current session. If it exists in a
  known Docker Desktop install location but isn't on PATH, prepend it.
  Returns $true if docker is now usable.
#>
function Initialize-Docker {
  $exe = Resolve-DockerCommand
  if (-not $exe) { return $false }
  $dir = Split-Path -Parent $exe
  if (-not ($env:Path -split ';' | Where-Object { $_ -ieq $dir })) {
    $env:Path = "$dir;$env:Path"
  }
  return $true
}

<#
.SYNOPSIS
  Returns $true if Docker is installed AND the daemon responds.
#>
function Test-DockerDaemon {
  if (-not (Initialize-Docker)) { return $false }
  & docker info --format '{{.ServerVersion}}' *> $null
  return ($LASTEXITCODE -eq 0)
}
