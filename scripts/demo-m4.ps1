$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $repoRoot "apps\cli\dist\bin.js"
$fakeRuntime = Join-Path $repoRoot "examples\m2\fake-runtime.mjs"
$recoveryFile = Join-Path $repoRoot "examples\m4\recovery.json"
if (-not (Test-Path $cli)) {
  throw "CLI not found. Run pnpm check first."
}

$demoRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("cimiloop-m4-demo-" + [guid]::NewGuid().ToString("N"))
$repository = Join-Path $demoRoot "repository"
$appData = Join-Path $demoRoot "app-data"
New-Item -ItemType Directory -Path $repository, $appData | Out-Null
git init $repository | Out-Null

$env:LOCALAPPDATA = $appData
$contractFile = Join-Path $repoRoot "examples\m2\feature-contract.json"
$planFile = Join-Path $repoRoot "examples\m2\feature-plan.json"
$artifactFile = Join-Path $demoRoot "artifact.bin"
Set-Content -Path $artifactFile -Value "m4-demo-artifact" -Encoding UTF8

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

Write-Host "Initialize project and produce an evaluated artifact..."
Invoke-CimiLoop init --owner-name "M4 Demo Owner" --owner-email "m4-demo@example.com" --yes | Out-Null
$created = Invoke-CimiLoop change create --title "M4 delivery vertical slice"
$changeId = $created.data.change.id
$bootstrapped = Invoke-CimiLoop governance bootstrap-solo $changeId
$intentRole = $bootstrapped.data.roles | Where-Object { $_.role_key -eq "intent_owner" }
$technicalRole = $bootstrapped.data.roles | Where-Object { $_.role_key -eq "technical_owner" }
Invoke-CimiLoop contract submit CHG-0001 --file $contractFile | Out-Null
$intentRequest = Invoke-CimiLoop contract request-review CHG-0001
Invoke-CimiLoop decision submit $intentRequest.data.request.id --outcome approve --acting-role $intentRole.id --reason "Demo approve contract" | Out-Null
Invoke-CimiLoop plan submit CHG-0001 --file $planFile | Out-Null
$planRequest = Invoke-CimiLoop plan request-review CHG-0001
Invoke-CimiLoop decision submit $planRequest.data.request.id --outcome approve --acting-role $technicalRole.id --reason "Demo approve plan" | Out-Null
Invoke-CimiLoop scheduler tick CHG-0001 | Out-Null
$items = Invoke-CimiLoop work-item list CHG-0001
$workItemId = ($items.work_items | Where-Object { $_.kind -eq "execution" } | Select-Object -First 1).id
Invoke-CimiLoop work-item claim $workItemId | Out-Null
Invoke-CimiLoop work-item execute $workItemId --executable $fakeRuntime | Out-Null
$runs = Invoke-CimiLoop run list $workItemId
$artifact = Invoke-CimiLoop artifact record $runs.runs[0].id --file $artifactFile --summary "M4 demo artifact"
$artifactId = $artifact.data.artifact.id
$artifactDigest = $artifact.data.artifact.digest.value
$claim = Invoke-CimiLoop claim submit CHG-0001 --key "AC-1" --statement "Acceptance passed." --category intent --obligation required --source acceptance
Invoke-CimiLoop evidence record CHG-0001 --claim $claim.data.claim.id --stance Supports --subject-type artifact --subject-id $artifactId --subject-digest $artifactDigest --reference "cimi-object://evidence/m4-demo" --digest ("c" * 64) --producer evaluator | Out-Null
$evaluation = Invoke-CimiLoop evaluate complete CHG-0001 --evaluation-id "0199a000-0000-7000-8000-00000000e001" --artifact $artifactId --digest $artifactDigest --input-digest ("d" * 64) --result DENY --reason "evaluator self-score"
if ($evaluation.data.evaluation.result -ne "ALLOW") {
  throw "Expected Kernel ALLOW, got $($evaluation.data.evaluation.result)"
}

Write-Host "Register test environment and verify the same artifact digest..."
$environment = Invoke-CimiLoop environment register CHG-0001 --key "acceptance-test" --kind test --name "Acceptance Test" --adapter "file://examples/acceptance-target"
$environmentId = $environment.data.environment.id
$shownEnv = Invoke-CimiLoop environment show $environmentId
if ($shownEnv.environment.kind -ne "test") { throw "Environment kind mismatch" }

$release = Invoke-CimiLoop release create CHG-0001 --kind test --artifact $artifactId --digest $artifactDigest --environment $environmentId --scope "acceptance.health" --window-start "2026-09-20T00:00:00.000Z" --window-end "2026-09-21T00:00:00.000Z" --recovery-file $recoveryFile
$releaseId = $release.data.release.id
if ($release.data.release.status -ne "authorized") { throw "Test release must be auto-authorized" }

$deploy = Invoke-CimiLoop release queue $releaseId --environment $environmentId
$deployOp = $deploy.data.operation
Invoke-CimiLoop deployment record-result $deployOp.id --key $deployOp.operation_key --state succeeded --log-reference "file://logs/m4-deploy.log" --log-digest ("a" * 64) --summary "demo deploy" --actual-digest $artifactDigest | Out-Null

$status = Invoke-CimiLoop release queue $releaseId --environment $environmentId
$statusOp = $status.data.operation
Invoke-CimiLoop deployment record-result $statusOp.id --key $statusOp.operation_key --state succeeded --log-reference "file://logs/m4-status.log" --log-digest ("b" * 64) --summary "demo status" --actual-digest $artifactDigest --health healthy --core-path pass | Out-Null

$verify = Invoke-CimiLoop release queue $releaseId --environment $environmentId
$verifyOp = $verify.data.operation
Invoke-CimiLoop deployment record-result $verifyOp.id --key $verifyOp.operation_key --state succeeded --log-reference "file://logs/m4-verify.log" --log-digest ("c" * 64) --summary "demo verify" --actual-digest $artifactDigest --health healthy --core-path pass | Out-Null

$shownRelease = Invoke-CimiLoop release show $releaseId
if ($shownRelease.release.status -ne "verified") {
  throw "Expected verified test release, got $($shownRelease.release.status)"
}
if ($shownRelease.release.artifact_digest.value -ne $artifactDigest) {
  throw "Release digest drifted from the evaluated artifact"
}

Write-Host "M4 demo passed: test release verified with the same artifact digest"
Write-Host "Environment: $($shownEnv.environment.environment_key) $($shownEnv.environment.kind)"
Write-Host "Release: $releaseId $($shownRelease.release.status)"
Write-Host "Deployment: $($deploy.data.deployment.id)"
Write-Host "Demo repository: $repository"
