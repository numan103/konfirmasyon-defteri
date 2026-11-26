param(
  [string]$Url = 'http://127.0.0.1:8787',
  [string]$Playwright = '',
  [string]$Shots = '',
  [int]$MaxAttempts = 2,
  [switch]$Unit,
  [switch]$SkipBrowser
)

& (Join-Path $PSScriptRoot 'alfa-qa-run.ps1') `
  -Surface web `
  -Url $Url `
  -Playwright $Playwright `
  -Shots $Shots `
  -MaxAttempts $MaxAttempts `
  -Unit:$Unit `
  -SkipBrowser:$SkipBrowser
exit $LASTEXITCODE
