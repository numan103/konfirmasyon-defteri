param(
  [ValidateSet('web', 'mobile', 'all', 'smoke')]
  [string]$Surface = 'all',
  [string]$Url = 'http://127.0.0.1:8787',
  [string]$Playwright = '',
  [string]$Shots = '',
  [int]$MaxAttempts = 2,
  [switch]$Unit,
  [switch]$SkipBrowser,
  [switch]$IncludeEgress
)

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

if ([string]::IsNullOrWhiteSpace($Playwright)) {
  $fromEnv = $env:ALFA_PLAYWRIGHT
  $local = Join-Path $repo 'node_modules/playwright/index.mjs'
  $knownLocal = 'C:/Users/Pc/AppData/Local/Temp/opencode/alfa-chart-browser-tests/node_modules/playwright/index.mjs'
  if ($fromEnv) { $Playwright = $fromEnv }
  elseif (Test-Path $local) { $Playwright = $local }
  elseif (Test-Path $knownLocal) { $Playwright = $knownLocal }
  else { $Playwright = 'node_modules/playwright/index.mjs' }
}
if (-not (Test-Path $Playwright)) {
  throw "Playwright module not found: $Playwright. Set ALFA_PLAYWRIGHT or pass -Playwright."
}

$webSuites = @(
  'alfa-chart-scope',
  'alfa-drawings',
  'alfa-multichart',
  'alfa-indicator-pane',
  'alfa-chart-time',
  'alfa-history-navigation',
  'alfa-open-interest',
  'alfa-workspace',
  'alfa-workspace-persistence',
  'alfa-cloud-settings-flow',
  'alfa-cloud-resolution',
  'alfa-replay',
  'alfa-paper',
  'alfa-strategy',
  'alfa-research',
  'alfa-lab',
  'alfa-excursions',
  'site-feature-gating',
  'charts-feature-nav',
  'alfa-ux-eight',
  'alfa-feature-discovery',
  'alfa-watchlist-tv'
)
$mobileSuites = @(
  'alfa-mobile-shell',
  'alfa-mobile-landscape',
  'alfa-drawing-experience',
  'alfa-trust-touch',
  'alfa-capability-pwa',
  'alfa-mobile-chart-interactions',
  'alfa-mobile-drawing-pro',
  'alfa-mobile-watchlist-pro',
  'alfa-mobile-alarm-trust'
)
$smokeSuites = @(
  'alfa-mobile-chart-interactions',
  'alfa-mobile-drawing-pro',
  'alfa-mobile-watchlist-pro',
  'alfa-mobile-alarm-trust',
  'alfa-capability-pwa'
)
if ($IncludeEgress) { $smokeSuites += 'egress' }
$allSuites = @($webSuites + $mobileSuites | Select-Object -Unique)

if ($Surface -eq 'web') { $suites = $webSuites }
elseif ($Surface -eq 'mobile') { $suites = $mobileSuites }
elseif ($Surface -eq 'smoke') { $suites = $smokeSuites }
else { $suites = $allSuites }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportRoot = Join-Path $repo ".qa-reports/$Surface-$stamp"
$logDir = Join-Path $reportRoot 'logs'
$shotDir = if ($Shots) { [System.IO.Path]::GetFullPath($Shots) } else { Join-Path $reportRoot 'shots' }
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
New-Item -ItemType Directory -Force -Path $shotDir | Out-Null

$results = @()

if ($Unit) {
  $unitLog = Join-Path $logDir 'unit.log'
  & node --test tests/*.test.mjs *> $unitLog
  $unitCode = $LASTEXITCODE
  $unitStatus = if ($unitCode -eq 0) { 'PASS' } else { 'FAIL' }
  $results += [pscustomobject]@{
    Suite = 'unit'; Status = $unitStatus; Code = $unitCode; Attempts = 1; Hint = ''
  }
  Write-Output ("{0,-34} {1} (exit {2}, attempts 1)" -f 'unit', $unitStatus, $unitCode)
}

if (-not $SkipBrowser) {
  foreach ($suite in $suites) {
    $attempts = 0
    do {
      $attempts++
      $output = @(& node "tests/browser/$suite.browser.mjs" "--url=$Url" "--playwright=$Playwright" "--shots=$shotDir" 2>&1)
      $code = $LASTEXITCODE
    } while ($code -ne 0 -and $attempts -lt $MaxAttempts)

    if ($code -eq 0) { $status = 'PASS' } else { $status = 'FAIL' }
    $hint = ($output | Select-String -Pattern 'AssertionError|TimeoutError|"error"|"result": "FAIL"|Error:' | Select-Object -Last 1).Line
    if (-not $hint) { $hint = '' }
    $results += [pscustomobject]@{
      Suite = $suite; Status = $status; Code = $code; Attempts = $attempts; Hint = $hint
    }
    $output | Set-Content -Encoding UTF8 (Join-Path $logDir "$suite.log")
    Write-Output ("{0,-34} {1} (exit {2}, attempts {3}) {4}" -f $suite, $status, $code, $attempts, $hint)
  }
}

$pass = @($results | Where-Object Status -eq 'PASS').Count
$fail = @($results | Where-Object Status -eq 'FAIL').Count
$retried = @($results | Where-Object Attempts -gt 1).Count
Write-Output ("SUMMARY surface={0} url={1} total={2} pass={3} fail={4} retried={5} report={6}" -f `
  $Surface, $Url, $results.Count, $pass, $fail, $retried, $reportRoot)

$results | Export-Csv -Path (Join-Path $reportRoot 'summary.csv') -NoTypeInformation -Encoding UTF8
$results | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $reportRoot 'summary.json')

if ($fail -gt 0) { exit 1 }
