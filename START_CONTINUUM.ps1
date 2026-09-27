[CmdletBinding()]
param(
  [switch]$NoOpen,
  [switch]$Rebuild
)

$ErrorActionPreference = 'Stop'
$continuumRoot = $PSScriptRoot
$continuumUrl = 'http://127.0.0.1:4180'
$continuumLogDirectory = Join-Path $continuumRoot '.continuum'
$continuumOutputLog = Join-Path $continuumLogDirectory 'server.stdout.log'
$continuumErrorLog = Join-Path $continuumLogDirectory 'server.stderr.log'

function Test-ContinuumHealth {
  try {
    $continuumResponse = Invoke-RestMethod -Uri "$continuumUrl/health" -TimeoutSec 2
    return ($continuumResponse.app -eq 'continuum')
  } catch { return $false }
}

Push-Location -LiteralPath $continuumRoot
try {
  $continuumNode = (Get-Command node.exe -ErrorAction Stop).Source
  $continuumNodeMajor = [int]((& $continuumNode --version) -replace '^v(\d+).*$', '$1')
  if ($continuumNodeMajor -lt 22) { throw 'Continuum requires Node.js 22 or newer.' }

  $continuumBuildNeeded = $Rebuild.IsPresent -or -not (Test-Path -LiteralPath 'dist/index.html')
  if (-not (Test-Path -LiteralPath 'node_modules')) {
    $continuumNpm = (Get-Command npm.cmd -ErrorAction Stop).Source
    & $continuumNpm ci
    if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed (exit $LASTEXITCODE). The app was not started." }
    $continuumBuildNeeded = $true
  }
  if (-not $continuumBuildNeeded) {
    $continuumBuildTime = (Get-Item -LiteralPath 'dist/index.html').LastWriteTimeUtc
    $continuumInputs = @('src', 'public', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json')
    foreach ($continuumInput in $continuumInputs) {
      if (Test-Path -LiteralPath $continuumInput) {
        $continuumChanged = Get-ChildItem -LiteralPath $continuumInput -Recurse -File | Where-Object { $_.LastWriteTimeUtc -gt $continuumBuildTime } | Select-Object -First 1
        if ($continuumChanged) { $continuumBuildNeeded = $true; break }
      }
    }
  }
  if ($continuumBuildNeeded) {
    $continuumNpm = (Get-Command npm.cmd -ErrorAction Stop).Source
    & $continuumNpm run build
    if ($LASTEXITCODE -ne 0) { throw "Production build failed (exit $LASTEXITCODE). An older build will not be opened." }
  }

  if (-not (Test-ContinuumHealth)) {
    # Never terminate an unrelated process or silently choose a different port.
    $continuumPortBusy = $false
    $continuumProbe = [System.Net.Sockets.TcpClient]::new()
    try { $continuumProbe.Connect('127.0.0.1', 4180); $continuumPortBusy = $true } catch {} finally { $continuumProbe.Dispose() }
    if ($continuumPortBusy) { throw 'Port 4180 is in use, but it did not identify itself as Continuum. Close that listener or choose another port manually; nothing was stopped.' }

    New-Item -ItemType Directory -Path $continuumLogDirectory -Force | Out-Null
    # Pin this launch to the URL above even when the parent shell has a port override.
    $continuumPreviousPort = $env:CONTINUUM_PORT
    try {
      $env:CONTINUUM_PORT = '4180'
      $continuumProcess = Start-Process -FilePath $continuumNode -ArgumentList 'server.mjs' -WorkingDirectory $continuumRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $continuumOutputLog -RedirectStandardError $continuumErrorLog
    } finally { $env:CONTINUUM_PORT = $continuumPreviousPort }

    $continuumDeadline = [DateTime]::UtcNow.AddSeconds(20)
    $continuumReady = $false
    do {
      if (Test-ContinuumHealth) { $continuumReady = $true; break }
      if ($continuumProcess.HasExited) { break }
      Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $continuumDeadline)
    if (-not $continuumReady) {
      throw "Continuum did not become ready. Check $continuumErrorLog and $continuumOutputLog."
    }
    Set-Content -LiteralPath (Join-Path $continuumLogDirectory 'server.pid') -Value $continuumProcess.Id
    Write-Host "Continuum started (PID $($continuumProcess.Id))."
  } else { Write-Host 'Using the existing Continuum server on port 4180.' }

  # Health identifies the process; this additionally verifies that the built entry exists.
  $continuumPage = Invoke-WebRequest -Uri "$continuumUrl/" -Method Head -TimeoutSec 5 -UseBasicParsing
  if ($continuumPage.StatusCode -ne 200) { throw 'The server is running, but the application entry could not be loaded.' }
  Write-Host "Ready: $continuumUrl"
  Write-Host "Presentation: $continuumUrl/pitch.html"
  $continuumOptionalStarter = Join-Path $continuumRoot 'START_LOCAL_AI.ps1'
  if (Test-Path -LiteralPath $continuumOptionalStarter) {
    try { & $continuumOptionalStarter } catch { Write-Warning "Optional local AI did not start: $($_.Exception.Message). The app is ready." }
  }
  if (-not $NoOpen) { Start-Process $continuumUrl }
} finally { Pop-Location }
