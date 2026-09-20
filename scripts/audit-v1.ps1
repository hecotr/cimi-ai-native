$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$forbidden = @("sk-live-", "BEGIN RSA PRIVATE KEY", "Authorization: Bearer", "process_env")
$scanRoots = @(
  (Join-Path $repoRoot "packages"),
  (Join-Path $repoRoot "apps")
)
$hits = @()
foreach ($root in $scanRoots) {
  $files = Get-ChildItem -Path $root -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.FullName -notmatch "\\(dist|node_modules|test)\\" -and
      @(".ts", ".js", ".mjs", ".json") -contains $_.Extension
    }
  foreach ($file in $files) {
    $text = Get-Content -Raw -Encoding UTF8 $file.FullName
    foreach ($pattern in $forbidden) {
      if ($text -like ("*" + $pattern + "*")) {
        $hits += "$($file.FullName): $pattern"
      }
    }
  }
}
if ($hits.Count -gt 0) {
  throw "audit-v1 found forbidden secret material:`n$($hits -join "`n")"
}

$env:npm_config_yes = "true"
npx --yes --package node@24.15.0 --package pnpm@12.4.2 -c "pnpm exec vitest run tests/faults tests/security"
if ($LASTEXITCODE -ne 0) {
  throw "audit-v1 tests failed"
}

Write-Output "audit-v1 passed: no secret material in src and fault/security tests succeeded"
