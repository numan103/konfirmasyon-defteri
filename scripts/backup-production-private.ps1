# Run in a user-controlled local PowerShell terminal. Never paste passwords in chat.
[CmdletBinding()]
param([switch]$Prepared, [switch]$Direct)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$bin = 'C:\Program Files\PostgreSQL\17\bin'
$private = 'C:\Users\Pc\AppData\Local\ALFA\PrivateBackups'
$container = Join-Path $private 'alfa-backups.hc'
$destination = 'V:\ALFA-Backups'
$dumpTool = Join-Path $bin 'pg_dump.exe'
$restoreTool = Join-Path $bin 'pg_restore.exe'
if ($Direct -and !$Prepared) { throw 'Direct mode requires the verified prepared configuration.' }

if ([Console]::IsInputRedirected) {
    throw 'Interactive local terminal required. Do not run through redirected input.'
}
# Native libpq authentication expects UTF-8 password bytes. Avoid legacy OEM
# console encodings (for example Turkish CP857) altering non-ASCII input.
# Changes apply only to this local terminal, not the Windows system locale.
& "$env:SystemRoot\System32\chcp.com" 65001 > $null
if ($LASTEXITCODE -ne 0) { throw 'Could not enable UTF-8 console input.' }
[Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
foreach ($tool in @($dumpTool, $restoreTool)) {
    if (!(Test-Path -LiteralPath $tool -PathType Leaf)) { throw "Missing tool: $tool" }
    $version = & $tool --version
    if ($LASTEXITCODE -ne 0 -or $version -notmatch '\b17\.') {
        throw 'PostgreSQL 17 tools required.'
    }
}
if (!(Test-Path -LiteralPath $private -PathType Container)) {
    throw 'PrivateBackups folder missing. No backup started.'
}
# Reject junctions/symlinks in the destination path, including its ancestors.
$directory = Get-Item -LiteralPath $private
for ($item = $directory; $null -ne $item; $item = $item.Parent) {
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'Backup path contains a reparse point. No backup started.'
    }
}
$acl = Get-Acl -LiteralPath $private
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowedSids = @($currentSid, 'S-1-5-18')
if (!$acl.AreAccessRulesProtected) { throw 'Folder ACL inheritance must be disabled.' }
foreach ($rule in $acl.Access) {
    $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if ($rule.AccessControlType -eq 'Allow' -and $sid -notin $allowedSids) {
        throw 'Folder grants access beyond current user and SYSTEM. No backup started.'
    }
}

if (!(Test-Path -LiteralPath $container -PathType Leaf)) {
    throw 'Expected private VeraCrypt container is missing.'
}
if (-not ('AlfaBackupDeviceQuery' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class AlfaBackupDeviceQuery {
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern uint QueryDosDevice(string name, StringBuilder target, int length);
}
'@
}
function Assert-EncryptedDestination {
    $target = New-Object Text.StringBuilder 4096
    $result = [AlfaBackupDeviceQuery]::QueryDosDevice('V:', $target, $target.Capacity)
    if ($result -eq 0 -or $target.ToString() -cne '\Device\VeraCryptVolumeV') {
        throw 'V: is not a mounted VeraCrypt volume. No backup started.'
    }
    if (!(Test-Path -LiteralPath 'V:\' -PathType Container)) {
        throw 'Encrypted volume is not accessible.'
    }
    if (Test-Path -LiteralPath $destination) {
        if (!(Test-Path -LiteralPath $destination -PathType Container) -or
            ((Get-Item -LiteralPath $destination).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'Unsafe destination inside encrypted volume.'
        }
    }
}
Assert-EncryptedDestination
if ($Prepared) {
    # This volume was already mounted and explicitly confirmed by the operator.
    # Pin its identity as well as requiring the live VeraCrypt driver mapping.
    $mounted = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='V:'"
    if ($null -eq $mounted -or $mounted.VolumeSerialNumber -cne 'C8D672CF' -or
        $mounted.Size -ne 5366349824) {
        throw 'Previously confirmed encrypted volume identity changed. No backup started.'
    }
} else {
    Write-Host "In VeraCrypt, verify V: is mounted from: $container"
    if ((Read-Host 'Correct container shown for V:? Type MOUNTED') -cne 'MOUNTED') {
        throw 'Container identity not confirmed. No backup started.'
    }
}
Write-Host 'Keep V: mounted until the script finishes. Dismount afterward to lock the backup.'

if ($Prepared) {
    # Read-only Dashboard Connect > Session pooler checked by the assistant.
    # These are routing parameters, never passwords or API tokens.
    $poolerHost = 'aws-1-eu-west-1.pooler.supabase.com'
    $port = '5432'
    $database = 'postgres'
    $dbUser = 'postgres.fssrtlpjqbavzomynwmg'
    if ($Direct) {
        # Direct IPv6 connectivity checked locally; bypass pooler for diagnosis.
        $poolerHost = 'db.fssrtlpjqbavzomynwmg.supabase.co'
        $dbUser = 'postgres'
    }
    $ca = Join-Path $private 'supabase-pooler-ca-bundle.pem'
    if (!(Test-Path -LiteralPath $ca -PathType Leaf) -or
        (Get-FileHash -LiteralPath $ca -Algorithm SHA256).Hash -cne
        'BB0ED428F7180B77883739D5D22C1B35AED66371B84CD3D2C86323B0F7AA2BA8') {
        throw 'Prepared trusted CA bundle missing or changed. No backup started.'
    }
} else {
    $poolerHost = (Read-Host 'Production Session Pooler host (no URL)').Trim()
    $port = (Read-Host 'Session Pooler port (5432)').Trim()
    $database = (Read-Host 'Database (postgres)').Trim()
    $dbUser = (Read-Host 'Production Session Pooler user').Trim()
    $ca = (Read-Host 'Full path to trusted Supabase/pooler CA PEM file').Trim('" ')
}
if ($Direct) {
    if ($poolerHost -cne 'db.fssrtlpjqbavzomynwmg.supabase.co' -or
        $port -ne '5432' -or $database -cne 'postgres' -or $dbUser -cne 'postgres') {
        throw 'Direct source does not match the approved production project.'
    }
} else {
    if ($poolerHost -notmatch '^[a-zA-Z0-9.-]+\.pooler\.supabase\.com$' -or $port -ne '5432') {
        throw 'Expected Supabase Session Pooler host and port 5432. No backup started.'
    }
    if ($database -ne 'postgres' -or $dbUser -cne 'postgres.fssrtlpjqbavzomynwmg') {
        throw 'Source does not match the approved production project. No backup started.'
    }
}
if (!(Test-Path -LiteralPath $ca -PathType Leaf)) { throw 'Trusted CA file missing.' }
if ((Get-Content -LiteralPath $ca -Raw) -notmatch '-----BEGIN CERTIFICATE-----') {
    throw 'Expected PEM CA certificate. No backup started.'
}
# CA provenance must be checked by the operator; a PEM header alone is not trust.
if (!$Prepared) {
    if ((Read-Host 'CA obtained from an official trusted source? Type TRUSTED-CA') -cne 'TRUSTED-CA') {
        throw 'CA trust not confirmed. No backup started.'
    }
    if ((Read-Host 'Read-only production backup into private encrypted storage. Type BACKUP') -cne 'BACKUP') {
        throw 'Cancelled. No backup started.'
    }
}

$names = @('PGHOST','PGPORT','PGDATABASE','PGUSER','PGSSLMODE','PGSSLROOTCERT',
    'PGPASSWORD','PGPASSFILE','PGSERVICE','PGSERVICEFILE','PGOPTIONS',
    'PGCONNECT_TIMEOUT','PGSSLKEY','PGSSLCERT','PGSSLCRL','PGSSLCRLDIR')
$saved = @{}
foreach ($name in $names) {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
Assert-EncryptedDestination
if (!(Test-Path -LiteralPath $destination)) {
    New-Item -ItemType Directory -Path $destination | Out-Null
}
$partial = Join-Path $destination "alfa-$stamp.dump.partial"
$dump = Join-Path $destination "alfa-$stamp.dump"
if ((Test-Path -LiteralPath $partial) -or (Test-Path -LiteralPath $dump)) {
    throw 'Destination already exists; refusing overwrite.'
}
try {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
    $env:PGHOST = $poolerHost
    $env:PGPORT = $port
    $env:PGDATABASE = $database
    $env:PGUSER = $dbUser
    $env:PGSSLMODE = 'verify-full'
    $env:PGSSLROOTCERT = (Resolve-Path -LiteralPath $ca).Path
    $env:PGCONNECT_TIMEOUT = '20'
    $env:PGOPTIONS = '-c default_transaction_read_only=on'
    # Disable automatic credential-file loading. --password prompts natively;
    # the password never passes through a PowerShell variable or script argument.
    $env:PGPASSFILE = Join-Path $destination ([guid]::NewGuid().ToString() + '.nonexistent')
    Assert-EncryptedDestination
    Write-Host 'pg_dump will now request the password privately. TLS verify-full is mandatory.'
    Write-Host 'Use the exact new database password, without quotes or URL encoding. Input is invisible.'
    & $dumpTool --password --format=custom --lock-wait-timeout=10s "--file=$partial"
    if ($LASTEXITCODE -ne 0) {
        throw 'Dump failed (including possible TLS/auth/permission failure). Partial file is NOT a backup.'
    }
    if (!(Test-Path -LiteralPath $partial) -or (Get-Item -LiteralPath $partial).Length -eq 0) {
        throw 'Dump absent or empty.'
    }
    & $restoreTool --list $partial > $null
    if ($LASTEXITCODE -ne 0) { throw 'Archive listing failed. Partial file is NOT verified.' }
    Move-Item -LiteralPath $partial -Destination $dump
    $hash = (Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash
    [ordered]@{
        createdUtc = (Get-Date).ToUniversalTime().ToString('o')
        bytes = (Get-Item -LiteralPath $dump).Length
        sha256 = $hash
        format = 'PostgreSQL custom'
        pgDumpVersion = (& $dumpTool --version)
        tls = 'verify-full'
        encryptedStorage = 'VeraCrypt mounted V:; private container mapping confirmed by operator'
        archiveListReadable = $true
        isolatedRestoreVerified = $false
        backupRestoreStatus = 'BLOCKED - isolated restore not performed'
    } | ConvertTo-Json | Set-Content -LiteralPath "$dump.manifest.json" -Encoding UTF8
    Write-Host "Backup created and archive list checked: $dump"
    Write-Host 'Backup/restore: BLOCKED until a verified isolated restore and integrity/RLS/ACL checks succeed.'
} finally {
    foreach ($name in $names) {
        [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process')
    }
}
