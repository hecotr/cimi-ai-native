$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $repoRoot "apps\cli\dist\bin.js"
$fakeRuntime = Join-Path $repoRoot "examples\m2\fake-runtime.mjs"
if (-not (Test-Path $cli)) {
  throw "CLI not found. Run pnpm check first."
}

$demoRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("cimiloop-m3-demo-" + [guid]::NewGuid().ToString("N"))
$repository = Join-Path $demoRoot "repository"
$appData = Join-Path $demoRoot "app-data"
New-Item -ItemType Directory -Path $repository, $appData | Out-Null
git init $repository | Out-Null

$env:LOCALAPPDATA = $appData
$contractFile = Join-Path $repoRoot "examples\m2\feature-contract.json"
$planFile = Join-Path $repoRoot "examples\m2\feature-plan.json"
$artifactFile = Join-Path $demoRoot "artifact.bin"
Set-Content -Path $artifactFile -Value "m3-demo-artifact" -Encoding UTF8

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

Write-Host "Initialize project and produce an artifact..."
Invoke-CimiLoop init --owner-name "M3 Demo Owner" --owner-email "m3-demo@example.com" --yes | Out-Null
$created = Invoke-CimiLoop change create --title "M3 evidence vertical slice"
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
$artifact = Invoke-CimiLoop artifact record $runs.runs[0].id --file $artifactFile --summary "M3 demo artifact"
$artifactId = $artifact.data.artifact.id
$artifactDigest = $artifact.data.artifact.digest.value

Write-Host "Submit required claims, promote deterministic evidence, and complete independent evaluation..."
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
$package = Invoke-CimiLoop evidence package CHG-0001
if ($package.package.evidence_ids.Count -lt 1) { throw "Evidence package missing references" }

Write-Host "M3 demo passed: independent evaluation ALLOW"
Write-Host "Claim: $($claim.data.claim.id)"
Write-Host "Evidence: $($evidence.data.evidence.id) $($evidence.data.evidence.stance)"
Write-Host "Evaluation: $($evaluation.data.evaluation.id) $($evaluation.data.evaluation.result)"
Write-Host "Package claims=$($package.package.claim_ids.Count) evidence=$($package.package.evidence_ids.Count)"
Write-Host "Demo repository: $repository"
