$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $repoRoot "apps\cli\dist\bin.js"
if (-not (Test-Path $cli)) {
  throw "未找到 $cli，请先在仓库根目录执行 pnpm check"
}

$demoRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("cimiloop-m1-demo-" + [guid]::NewGuid().ToString("N"))
$repository = Join-Path $demoRoot "repository"
$appData = Join-Path $demoRoot "app-data"
New-Item -ItemType Directory -Path $repository, $appData | Out-Null
git init $repository | Out-Null

$env:LOCALAPPDATA = $appData
$contractFile = Join-Path $repoRoot "examples\m1\feature-contract.json"
$planFile = Join-Path $repoRoot "examples\m1\feature-plan.json"

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
Invoke-CimiLoop init --owner-name "M1 Demo Owner" --owner-email "m1-demo@example.com" --yes | Out-Null

Write-Host "创建 Draft Change..."
$created = Invoke-CimiLoop change create --title "M1 Feature vertical slice"
$changeId = $created.data.change.id

Write-Host "Bootstrap Solo 治理..."
$bootstrapped = Invoke-CimiLoop governance bootstrap-solo $changeId
$intentRole = $bootstrapped.data.roles | Where-Object { $_.role_key -eq "intent_owner" }
$technicalRole = $bootstrapped.data.roles | Where-Object { $_.role_key -eq "technical_owner" }

Write-Host "提交并批准 Contract..."
Invoke-CimiLoop contract submit CHG-0001 --file $contractFile | Out-Null
$intentRequest = Invoke-CimiLoop contract request-review CHG-0001
Invoke-CimiLoop decision submit $intentRequest.data.request.id --outcome approve --acting-role $intentRole.id --reason "Demo 批准 Contract v1" | Out-Null

Write-Host "提交并批准 Plan..."
Invoke-CimiLoop plan submit CHG-0001 --file $planFile | Out-Null
$planRequest = Invoke-CimiLoop plan request-review CHG-0001
$approved = Invoke-CimiLoop decision submit $planRequest.data.request.id --outcome approve --acting-role $technicalRole.id --reason "Demo 批准 Plan v1"

if ($approved.data.change.lifecycle_state -ne "Planned") {
  throw "Expected Planned, got $($approved.data.change.lifecycle_state)"
}

Write-Host "查询 Room 与 Timeline..."
$room = Invoke-CimiLoop room show CHG-0001
$timeline = Invoke-CimiLoop timeline CHG-0001
if (-not $room.room.next_action) { throw "Change Room 缺少下一动作" }
if ($timeline.events.Count -lt 1) { throw "Timeline 为空" }

Write-Host "M1 demo passed: CHG-0001 is Planned"
Write-Host "Room next action: $($room.room.next_action)"
Write-Host "Timeline events: $($timeline.events.Count)"
Write-Host "Demo repository: $repository"
