$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $repoRoot "apps\cli\dist\bin.js"
$fakeRuntime = Join-Path $repoRoot "examples\m2\fake-runtime.mjs"
$recoveryFile = Join-Path $repoRoot "examples\m4\recovery.json"
$prodRecoveryFile = Join-Path $repoRoot "examples\v1\recovery-prod.json"
if (-not (Test-Path $cli)) {
  throw "CLI not found. Run pnpm check first."
}

$demoRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("cimiloop-m5-demo-" + [guid]::NewGuid().ToString("N"))
$repository = Join-Path $demoRoot "repository"
$target = Join-Path $demoRoot "empty-target"
$appData = Join-Path $demoRoot "app-data"
New-Item -ItemType Directory -Path $repository, $appData, $target | Out-Null
git -c init.defaultBranch=main init --template= $repository | Out-Null
Set-Content -Path (Join-Path $repository "README.md") -Value "m5-demo" -Encoding UTF8
git -C $repository -c user.email=m5-demo@example.com -c user.name="M5 Demo" add README.md | Out-Null
git -C $repository -c user.email=m5-demo@example.com -c user.name="M5 Demo" commit -m init | Out-Null

$env:LOCALAPPDATA = $appData
$contractFile = Join-Path $repoRoot "examples\m2\feature-contract.json"
$planFile = Join-Path $repoRoot "examples\m2\feature-plan.json"
$artifactFile = Join-Path $repository ".git\cimiloop\artifacts\artifact.bin"

function Invoke-CimiLoopAt {
  param(
    [string]$ProjectDir,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )
  $stdoutFile = Join-Path $demoRoot "last.json"
  $stderrFile = Join-Path $demoRoot "last.err"
  $allArgs = @("--no-warnings", $cli, "--project-dir", $ProjectDir, "--json") + $Arguments
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

function Invoke-CimiLoop {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  Invoke-CimiLoopAt -ProjectDir $repository @Arguments
}

Write-Host "Close a Feature through knowledge closure and DeliveryClosed..."
Invoke-CimiLoop init --owner-name "M5 Demo Owner" --owner-email "m5-demo@example.com" --yes | Out-Null
New-Item -ItemType Directory -Path (Split-Path -Parent $artifactFile) -Force | Out-Null
Set-Content -Path $artifactFile -Value "m5-demo-artifact" -Encoding UTF8
$acceptanceRoot = Join-Path $demoRoot "acceptance"
New-Item -ItemType Directory -Path $acceptanceRoot | Out-Null
$env:CIMILOOP_ACCEPTANCE_ROOT = $acceptanceRoot
$created = Invoke-CimiLoop change create --title "M5 portable close"
$bootstrapped = Invoke-CimiLoop governance bootstrap-solo $created.data.change.id
$intentRole = $bootstrapped.data.roles | Where-Object { $_.role_key -eq "intent_owner" }
$technicalRole = $bootstrapped.data.roles | Where-Object { $_.role_key -eq "technical_owner" }
$releaseRole = $bootstrapped.data.roles | Where-Object { $_.role_key -eq "release_owner" }
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
$artifact = Invoke-CimiLoop artifact record $runs.runs[0].id --file $artifactFile --summary "M5 demo artifact"
$artifactId = $artifact.data.artifact.id
$artifactDigest = $artifact.data.artifact.digest.value
$payloadDir = Join-Path $acceptanceRoot ("artifacts\" + $artifactDigest)
New-Item -ItemType Directory -Path $payloadDir -Force | Out-Null
Set-Content -Path (Join-Path $payloadDir "payload.txt") -Value "m5-demo-artifact" -Encoding UTF8
$junit = Join-Path $repository "junit.xml"
Set-Content -Path $junit -Value '<testsuite failures="0" tests="1"></testsuite>' -Encoding ASCII
$claim = Invoke-CimiLoop claim submit CHG-0001 --key "AC-run" --statement "Claimed Work Item produced Run and Artifact." --category intent --obligation required --source acceptance
$integrity = Invoke-CimiLoop claim submit CHG-0001 --key "integrity.digest" --statement "Artifact digest is independently verified." --category integrity --obligation required --source contract
Invoke-CimiLoop evidence promote CHG-0001 --claim $claim.data.claim.id --artifact $artifactId --digest $artifactDigest --file $junit --format junit | Out-Null
$evidence = Invoke-CimiLoop evidence promote CHG-0001 --claim $integrity.data.claim.id --artifact $artifactId --digest $artifactDigest --file $junit --format junit
$evaluation = Invoke-CimiLoop evaluate complete CHG-0001 --evaluation-id "0199a000-0000-7000-8000-00000000e001" --artifact $artifactId --digest $artifactDigest --input-digest ("d" * 64) --result DENY --reason "evaluator self-score"
if ($evaluation.data.evaluation.result -ne "ALLOW") {
  throw "Expected Kernel ALLOW, got $($evaluation.data.evaluation.result)"
}
$testEnv = Invoke-CimiLoop environment register CHG-0001 --key "acceptance-test" --kind test --name "Acceptance Test" --adapter "file://examples/acceptance-target"
$testRelease = Invoke-CimiLoop release create CHG-0001 --kind test --artifact $artifactId --digest $artifactDigest --environment $testEnv.data.environment.id --scope "acceptance.health" --window-start "2026-09-20T00:00:00.000Z" --window-end "2026-09-21T00:00:00.000Z" --recovery-file $recoveryFile
Invoke-CimiLoop release queue $testRelease.data.release.id --environment $testEnv.data.environment.id | Out-Null
Invoke-CimiLoop release queue $testRelease.data.release.id --environment $testEnv.data.environment.id | Out-Null
Invoke-CimiLoop release queue $testRelease.data.release.id --environment $testEnv.data.environment.id | Out-Null
$prodEnv = Invoke-CimiLoop environment register CHG-0001 --key "prod" --kind production --name "Production" --adapter "file://examples/acceptance-target"
$prodRelease = Invoke-CimiLoop release create CHG-0001 --kind production --artifact $artifactId --digest $artifactDigest --environment $prodEnv.data.environment.id --scope "production.service" --window-start "2026-09-20T00:00:00.000Z" --window-end "2026-09-21T00:00:00.000Z" --recovery-file $prodRecoveryFile
$releaseRequest = Invoke-CimiLoop release request-review $prodRelease.data.release.id
Invoke-CimiLoop decision submit $releaseRequest.data.request.id --outcome approve --acting-role $releaseRole.id --reason "Demo approve production release" | Out-Null
Invoke-CimiLoop release queue $prodRelease.data.release.id --environment $prodEnv.data.environment.id | Out-Null
Invoke-CimiLoop release queue $prodRelease.data.release.id --environment $prodEnv.data.environment.id | Out-Null
Invoke-CimiLoop release queue $prodRelease.data.release.id --environment $prodEnv.data.environment.id | Out-Null
Invoke-CimiLoop knowledge record CHG-0001 --evidence $evidence.data.evidence.id --source technical --conclusion Update | Out-Null
$proposed = Invoke-CimiLoop change propose-close CHG-0001 --risk "No open production defects."
if ($proposed.data.closure_evaluation.result -ne "ALLOW") {
  throw "Expected ALLOW close, got $($proposed.data.closure_evaluation.result)"
}
Invoke-CimiLoop change close CHG-0001 --evaluation $proposed.data.closure_evaluation.id | Out-Null
$closed = Invoke-CimiLoop change show CHG-0001
if ($closed.change.lifecycle_state -ne "DeliveryClosed") {
  throw "Expected DeliveryClosed, got $($closed.change.lifecycle_state)"
}

Write-Host "Export a portable bundle and import it into a completely empty directory..."
$bundleFile = Join-Path $demoRoot "bundle.json"
$exported = Invoke-CimiLoop project export --file $bundleFile
if (-not (Test-Path $bundleFile)) { throw "Export bundle file missing" }
$staged = Invoke-CimiLoopAt -ProjectDir $target project import-stage --file $bundleFile --target $target
if ($staged.data.import_report.runtime_ownership -ne "dormant") { throw "Staged import must stay dormant" }
$committed = Invoke-CimiLoopAt -ProjectDir $target project import-commit $staged.data.import_report.id --target $target
if ($committed.data.import_report.status -ne "accepted") { throw "Import commit failed" }
if ($committed.data.import_report.runtime_ownership -ne "dormant") { throw "Imported ownership must be dormant" }

$listed = Invoke-CimiLoopAt -ProjectDir $target change list
if ($listed.changes[0].id -ne $created.data.change.id) { throw "Imported Change id drifted" }
$timeline = Invoke-CimiLoopAt -ProjectDir $target timeline CHG-0001
if (-not ($timeline.events | Where-Object { $_.event_type -eq "ChangeClosed" })) {
  throw "Imported timeline missing ChangeClosed"
}
$shownChange = Invoke-CimiLoopAt -ProjectDir $target change show CHG-0001
if ($shownChange.change.lifecycle_state -ne "DeliveryClosed") { throw "Imported lifecycle drifted" }
$recovered = Invoke-CimiLoopAt -ProjectDir $target deployment recover
if ($recovered.executed -ne 0) { throw "Dormant worker executed pending operations" }

Write-Host "M5 demo passed: knowledge closed, exported, and imported as dormant"
Write-Host "Source change: $($created.data.change.id)"
Write-Host "Bundle: $bundleFile"
Write-Host "Imported ownership: $($committed.data.import_report.runtime_ownership)"
Write-Host "Imported timeline events: $($timeline.events.Count)"
Write-Host "Empty target: $target"
