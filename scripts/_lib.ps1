# Shared helpers for Continuum scripts.
# Dot-source from other scripts:  . "$PSScriptRoot/_lib.ps1"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    [OK]   $msg" -ForegroundColor Green }
function Write-Bad($msg)  { Write-Host "    [FAIL] $msg" -ForegroundColor Red }
function Write-Warn2($msg){ Write-Host "    [WARN] $msg" -ForegroundColor Yellow }
function Write-Skip($msg) { Write-Host "    [skip] $msg" -ForegroundColor DarkGray }

function Get-PortListenerInfo {
  param(
    [Parameter(Mandatory = $true)]
    [int[]]$Ports
  )

  $seen = @{}
  foreach ($port in $Ports) {
    try {
      $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
      foreach ($connection in $connections) {
        $key = "$($connection.OwningProcess):$port"
        if ($seen.ContainsKey($key)) { continue }
        $seen[$key] = $true

        $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
        $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue

        [pscustomobject]@{
          Port = $port
          ProcessId = $connection.OwningProcess
          ProcessName = if ($process) { $process.ProcessName } else { '<unknown>' }
          CommandLine = if ($cim) { $cim.CommandLine } else { '' }
        }
      }
    } catch { }
  }
}

function Test-ContinuumProcess {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Listener,
    [Parameter(Mandatory = $true)]
    [string]$RepoPath
  )

  if ([string]::IsNullOrWhiteSpace($Listener.CommandLine)) { return $false }

  $resolvedRepo = (Resolve-Path $RepoPath).Path.ToLowerInvariant()
  $repoSlash = $resolvedRepo.Replace('\', '/')
  $commandLine = $Listener.CommandLine.ToLowerInvariant()
  $commandSlash = $commandLine.Replace('\', '/')

  return $commandLine.Contains($resolvedRepo) -or $commandSlash.Contains($repoSlash)
}

function Stop-ContinuumPortListeners {
  param(
    [Parameter(Mandatory = $true)]
    [int[]]$Ports,
    [Parameter(Mandatory = $true)]
    [string]$RepoPath,
    [switch]$FailOnForeign
  )

  $listeners = @(Get-PortListenerInfo -Ports $Ports)
  if ($listeners.Count -eq 0) {
    Write-Ok "Development ports are free"
    return $true
  }

  $foreign = @()
  $continuumPids = @{}

  foreach ($listener in $listeners) {
    if (Test-ContinuumProcess -Listener $listener -RepoPath $RepoPath) {
      $continuumPids[$listener.ProcessId] = $listener
    } else {
      $foreign += $listener
    }
  }

  foreach ($processId in $continuumPids.Keys) {
    $listener = $continuumPids[$processId]
    $portsForPid = ($listeners | Where-Object { $_.ProcessId -eq $processId } | Select-Object -ExpandProperty Port -Unique) -join ', '
    Write-Ok "Stopping stale Continuum $($listener.ProcessName) (PID $processId) on ports: $portsForPid"
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }

  if ($continuumPids.Count -gt 0) {
    for ($i = 1; $i -le 20; $i++) {
      $remaining = @(Get-PortListenerInfo -Ports $Ports | Where-Object { Test-ContinuumProcess -Listener $_ -RepoPath $RepoPath })
      if ($remaining.Count -eq 0) { break }
      Start-Sleep -Milliseconds 250
    }
  }

  if ($foreign.Count -eq 0) { return $true }

  foreach ($listener in $foreign) {
    Write-Bad "Port $($listener.Port) is used by $($listener.ProcessName) (PID $($listener.ProcessId))"
    if (-not [string]::IsNullOrWhiteSpace($listener.CommandLine)) {
      Write-Host "    $($listener.CommandLine)" -ForegroundColor DarkGray
    }
  }

  if ($FailOnForeign) {
    Write-Warn2 "Free those ports, or change SERVER_PORT / HOCUSPOCUS_PORT / Vite port in config."
    return $false
  }

  return $true
}

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
