param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("start", "stop")]
  [string]$Action,
  [string]$Root
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$server = Join-Path $repoRoot "examples\acceptance-target\server.mjs"
if (-not (Test-Path $server)) {
  throw "acceptance server script not found"
}

if (-not $Root) {
  $Root = Join-Path ([System.IO.Path]::GetTempPath()) "cimiloop-acceptance-env"
}
New-Item -ItemType Directory -Path $Root -Force | Out-Null
$portFile = Join-Path $Root "port"
$pidFile = Join-Path $Root "server.pid"

if ($Action -eq "stop") {
  if (Test-Path $pidFile) {
    $processId = [int](Get-Content -Raw $pidFile)
    if ($processId -gt 0) {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $pidFile, $portFile -Force -ErrorAction SilentlyContinue
  }
  return
}

$env:CIMILOOP_ACCEPTANCE_ROOT = $Root
$env:CIMILOOP_ACCEPTANCE_PORT_FILE = $portFile
$process = Start-Process -FilePath "node" -ArgumentList @($server) -PassThru -WindowStyle Hidden
Set-Content -Path $pidFile -Value $process.Id -Encoding ascii
$deadline = (Get-Date).AddSeconds(5)
while (-not (Test-Path $portFile)) {
  if ((Get-Date) -gt $deadline) {
    throw "acceptance server did not write a port file"
  }
  Start-Sleep -Milliseconds 50
}
Write-Output (Get-Content -Raw $portFile).Trim()
