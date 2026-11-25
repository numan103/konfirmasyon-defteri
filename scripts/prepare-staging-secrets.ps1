$ErrorActionPreference = 'Stop'
$private = Join-Path $env:LOCALAPPDATA 'ALFA\PrivateBackups'
$target = Join-Path $private 'staging-secrets.json'
if (!(Test-Path -LiteralPath $private)) { New-Item -ItemType Directory -Path $private -Force | Out-Null }
if (Test-Path -LiteralPath $target) { throw 'Staging secrets already exist; refusing to rotate silently.' }
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$random = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
$secrets = [ordered]@{
  publishable = 'sb_publishable_staging_' + $random
  serviceRole = 'sb_secret_staging_' + $random
  channelSecret = 'edu_staging_' + $random
  adminEmail = 'staging-admin@example.invalid'
}
$json = $secrets | ConvertTo-Json -Depth 3
$json | Set-Content -LiteralPath $target -Encoding UTF8
(Get-Acl -LiteralPath $target).Access |
  Where-Object { $_.IdentityReference -notin @('NT AUTHORITY\SYSTEM', "$env:USERDOMAIN\$env:USERNAME") } |
  ForEach-Object { throw 'Unexpected ACL on staging secrets; refusing to continue.' }
Write-Output 'Staging secrets prepared privately; values are not displayed.'
