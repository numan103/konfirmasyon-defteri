param(
  [string]$Url = 'http://127.0.0.1:8787',
  [string]$Playwright = '',
  [string]$Shots = '',
  [int]$MaxAttempts = 2
)

& (Join-Path $PSScriptRoot 'alfa-qa-run.ps1') `
  -Surface all `
  -Url $Url `
  -Playwright $Playwright `
  -Shots $Shots `
  -MaxAttempts $MaxAttempts `
  -Unit
exit $LASTEXITCODE
