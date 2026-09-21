$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $repoRoot "apps\cli\dist\bin.js"
$fakeRuntime = Join-Path $repoRoot "examples\m2\fake-runtime.mjs"
$recoveryFile = Join-Path $repoRoot "examples\m4\recovery.json"
$prodRecoveryFile = Join-Path $repoRoot "examples\v1\recovery-prod.json"
if (-not (Test-Path $cli)) {
  throw "CLI not found. Run pnpm check first."
}

$demoRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("cimiloop-v1-demo-" + [guid]::NewGuid().ToString("N"))
$repository = Join-Path $demoRoot "repository"
$appData = Join-Path $demoRoot "app-data"
New-Item -ItemType Directory -Path $repository, $appData | Out-Null
git init $repository | Out-Null

$env:LOCALAPPDATA = $appData
$contractFile = Join-Path $repoRoot "examples\m2\feature-contract.json"
$planFile = Join-Path $repoRoot "examples\m2\feature-plan.json"
$artifactFile = Join-Path $demoRoot "artifact.bin"
Set-Content -Path $artifactFile -Value "v1-demo-artifact" -Encoding UTF8

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

Write-Host "Initialize Feature change through Planned and an evaluated artifact..."
Invoke-CimiLoop init --owner-name "V1 Demo Owner" --owner-email "v1-demo@example.com" --yes | Out-Null
$created = Invoke-CimiLoop change create --title "V1 north-star feature"
$bootstrapped = Invoke-CimiLoop governance bootstrap-solo $created.data.change.id
$intentRole = $bootstrapped.data.roles | Where-Object { $_.role_key -eq "intent_owner" }
$technicalRole = $bootstrapped.data.roles | Where-Object { $_.role_key -eq "technical_owner" }
$projectRole = $bootstrapped.data.roles | Where-Object { $_.role_key -eq "project_owner" }
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
$artifact = Invoke-CimiLoop artifact record $runs.runs[0].id --file $artifactFile --summary "V1 demo artifact"
$artifactId = $artifact.data.artifact.id
$artifactDigest = $artifact.data.artifact.digest.value
$junit = Join-Path $demoRoot "junit.xml"
Set-Content -Path $junit -Value '<testsuite failures="0" tests="1"></testsuite>' -Encoding ASCII
$claim = Invoke-CimiLoop claim submit CHG-0001 --key "AC-run" --statement "Claimed Work Item produced Run and Artifact." --category intent --obligation required --source acceptance
$integrity = Invoke-CimiLoop claim submit CHG-0001 --key "integrity.digest" --statement "Artifact digest is independently verified." --category integrity --obligation required --source contract
Invoke-CimiLoop evidence promote CHG-0001 --claim $claim.data.claim.id --artifact $artifactId --digest $artifactDigest --file $junit --format junit | Out-Null
$evidence = Invoke-CimiLoop evidence promote CHG-0001 --claim $integrity.data.claim.id --artifact $artifactId --digest $artifactDigest --file $junit --format junit
$evaluation = Invoke-CimiLoop evaluate complete CHG-0001 --evaluation-id "0199a000-0000-7000-8000-00000000e001" --artifact $artifactId --digest $artifactDigest --input-digest ("d" * 64) --result DENY --reason "evaluator self-score"
if ($evaluation.data.evaluation.result -ne "ALLOW") {
  throw "Expected Kernel ALLOW, got $($evaluation.data.evaluation.result)"
}

Write-Host "Verify the same artifact digest in test and production..."
$testEnv = Invoke-CimiLoop environment register CHG-0001 --key "acceptance-test" --kind test --name "Acceptance Test" --adapter "file://examples/acceptance-target"
$testRelease = Invoke-CimiLoop release create CHG-0001 --kind test --artifact $artifactId --digest $artifactDigest --environment $testEnv.data.environment.id --scope "acceptance.health" --window-start "2026-09-20T00:00:00.000Z" --window-end "2026-09-21T00:00:00.000Z" --recovery-file $recoveryFile
$deploy = Invoke-CimiLoop release queue $testRelease.data.release.id --environment $testEnv.data.environment.id
$status = Invoke-CimiLoop release queue $testRelease.data.release.id --environment $testEnv.data.environment.id
$verify = Invoke-CimiLoop release queue $testRelease.data.release.id --environment $testEnv.data.environment.id

$prodEnv = Invoke-CimiLoop environment register CHG-0001 --key "prod" --kind production --name "Production" --adapter "file://examples/acceptance-target"
$prodRelease = Invoke-CimiLoop release create CHG-0001 --kind production --artifact $artifactId --digest $artifactDigest --environment $prodEnv.data.environment.id --scope "production.service" --window-start "2026-09-20T00:00:00.000Z" --window-end "2026-09-21T00:00:00.000Z" --recovery-file $prodRecoveryFile
$releaseRequest = Invoke-CimiLoop release request-review $prodRelease.data.release.id
Invoke-CimiLoop decision submit $releaseRequest.data.request.id --outcome approve --acting-role $releaseRole.id --reason "Demo approve production release" | Out-Null
$prodDeploy = Invoke-CimiLoop release queue $prodRelease.data.release.id --environment $prodEnv.data.environment.id
$prodStatus = Invoke-CimiLoop release queue $prodRelease.data.release.id --environment $prodEnv.data.environment.id
$prodVerify = Invoke-CimiLoop release queue $prodRelease.data.release.id --environment $prodEnv.data.environment.id
$shownProd = Invoke-CimiLoop release show $prodRelease.data.release.id
if ($shownProd.release.status -ne "verified") { throw "Expected verified production release" }
if ($shownProd.release.artifact_digest.value -ne $artifactDigest) { throw "Production digest drifted" }

Write-Host "Close knowledge obligations and export the project..."
Invoke-CimiLoop knowledge record CHG-0001 --evidence $evidence.data.evidence.id --source technical --conclusion Update | Out-Null
$proposed = Invoke-CimiLoop change propose-close CHG-0001 --risk "No open production defects."
if ($proposed.data.closure_evaluation.result -ne "ALLOW") {
  throw "Expected ALLOW close, got $($proposed.data.closure_evaluation.result)"
}
Invoke-CimiLoop change close CHG-0001 --evaluation $proposed.data.closure_evaluation.id | Out-Null
$exported = Invoke-CimiLoop project export
if (-not $exported.data.export_manifest.content_digest.value) { throw "Export digest missing" }
$timeline = Invoke-CimiLoop timeline CHG-0001

Write-Host "V1 demo passed: Feature closed and exported"
Write-Host "Change: $($created.data.change.id)"
Write-Host "Artifact digest: $artifactDigest"
Write-Host "Evaluation: $($evaluation.data.evaluation.id) $($evaluation.data.evaluation.result)"
Write-Host "Production release: $($prodRelease.data.release.id) $($shownProd.release.status)"
Write-Host "Export digest: $($exported.data.export_manifest.content_digest.value)"
Write-Host "Timeline events: $($timeline.events.Count)"
Write-Host "Demo repository: $repository"
