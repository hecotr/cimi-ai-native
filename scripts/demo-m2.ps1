$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $repoRoot "apps\cli\dist\bin.js"
$fakeRuntime = Join-Path $repoRoot "examples\m2\fake-runtime.mjs"
if (-not (Test-Path $cli)) {
  throw "未找到 $cli，请先在仓库根目录执行 pnpm check"
}

$demoRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("cimiloop-m2-demo-" + [guid]::NewGuid().ToString("N"))
$repository = Join-Path $demoRoot "repository"
$appData = Join-Path $demoRoot "app-data"
New-Item -ItemType Directory -Path $repository, $appData | Out-Null
git -c init.defaultBranch=main init --template= $repository | Out-Null
Set-Content -Path (Join-Path $repository "README.md") -Value "m2-demo" -Encoding UTF8
git -C $repository -c user.email=m2-demo@example.com -c user.name="M2 Demo" add README.md | Out-Null
git -C $repository -c user.email=m2-demo@example.com -c user.name="M2 Demo" commit -m init | Out-Null

$env:LOCALAPPDATA = $appData
$contractFile = Join-Path $repoRoot "examples\m2\feature-contract.json"
$planFile = Join-Path $repoRoot "examples\m2\feature-plan.json"
$artifactFile = Join-Path $repository "artifact.bin"
Set-Content -Path $artifactFile -Value "m2-demo-artifact" -Encoding UTF8

function Invoke-CimiLoop {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  $stdoutFile = Join-Path $demoRoot "last.json"
  $stderrFile = Join-Path $demoRoot "last.err"
  $allArgs = @("--no-warnings", $cli, "--project-dir", $repository, "--json") + $Arguments
  $quotedArgs = $allArgs | ForEach-Object {
    if ($_ -match '[\s"]') { '"{0}"' -f ($_ -replace '"', '\"') } else { $_ }
  }
  $process = Start-Process -FilePath "node" -ArgumentList $quotedArgs -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -Wait -NoNewWindow -PassThru
  if ($process.ExitCode -ne 0) {
    $errorText = ""
    if (Test-Path $stderrFile) { $errorText = Get-Content -Raw -Encoding UTF8 $stderrFile }
    if (Test-Path $stdoutFile) { $errorText += Get-Content -Raw -Encoding UTF8 $stdoutFile }
    throw "cimiloop $($Arguments -join ' ') failed with exit $($process.ExitCode)`n$errorText"
  }
  return (Get-Content -Raw -Encoding UTF8 $stdoutFile) | ConvertFrom-Json
}

Write-Host "初始化 Project..."
Invoke-CimiLoop init --owner-name "M2 Demo Owner" --owner-email "m2-demo@example.com" --yes | Out-Null

Write-Host "创建并批准到 Planned..."
$created = Invoke-CimiLoop change create --title "M2 execution vertical slice"
$changeId = $created.data.change.id
$bootstrapped = Invoke-CimiLoop governance bootstrap-solo $changeId
$intentRole = $bootstrapped.data.roles | Where-Object { $_.role_key -eq "intent_owner" }
$technicalRole = $bootstrapped.data.roles | Where-Object { $_.role_key -eq "technical_owner" }
Invoke-CimiLoop contract submit CHG-0001 --file $contractFile | Out-Null
$intentRequest = Invoke-CimiLoop contract request-review CHG-0001
Invoke-CimiLoop decision submit $intentRequest.data.request.id --outcome approve --acting-role $intentRole.id --reason "Demo 批准 Contract" | Out-Null
Invoke-CimiLoop plan submit CHG-0001 --file $planFile | Out-Null
$planRequest = Invoke-CimiLoop plan request-review CHG-0001
Invoke-CimiLoop decision submit $planRequest.data.request.id --outcome approve --acting-role $technicalRole.id --reason "Demo 批准 Plan" | Out-Null

Write-Host "调度并执行 Work Item..."
Invoke-CimiLoop scheduler tick CHG-0001 | Out-Null
$items = Invoke-CimiLoop work-item list CHG-0001
$workItemId = $items.work_items[0].id
Invoke-CimiLoop work-item claim $workItemId | Out-Null
Invoke-CimiLoop work-item execute $workItemId --executable $fakeRuntime | Out-Null
$runs = Invoke-CimiLoop run list $workItemId
if ($runs.runs[0].status -ne "completed") {
  throw "Expected completed run, got $($runs.runs[0].status)"
}
$artifact = Invoke-CimiLoop artifact record $runs.runs[0].id --file $artifactFile --summary "M2 demo artifact"
if (-not $artifact.data.artifact.digest.value) { throw "Artifact digest missing" }

Write-Host "M2 demo passed: CHG-0001 executed"
Write-Host "Work Item: $workItemId"
Write-Host "Run: $($runs.runs[0].id) $($runs.runs[0].status)"
Write-Host "Artifact: $($artifact.data.artifact.id)"
Write-Host "Demo repository: $repository"
