param(
  [string]$Url = 'https://alfa-trader.com',
  [string]$Playwright = '',
  [string]$Shots = '',
  [int]$MaxAttempts = 1,
  [switch]$NoEgress
)

& (Join-Path $PSScriptRoot 'alfa-qa-run.ps1') `
  -Surface smoke `
  -Url $Url `
  -Playwright $Playwright `
  -Shots $Shots `
  -MaxAttempts $MaxAttempts `
  -IncludeEgress:(-not $NoEgress)
exit $LASTEXITCODE
