$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$artifact = 'C:\Users\Pc\AppData\Local\ALFA\StagingArtifact'
$origin = 'https://alfa-charts-staging.pages.dev'
$secrets = Get-Content -LiteralPath (Join-Path $env:LOCALAPPDATA 'ALFA\PrivateBackups\staging-secrets.json') -Raw | ConvertFrom-Json

if (Test-Path -LiteralPath $artifact) { Remove-Item -LiteralPath $artifact -Recurse -Force }
New-Item -ItemType Directory -Path $artifact -Force | Out-Null

foreach ($dir in @('assets','api','functions','lib','ayna','ayna-server')) {
  Copy-Item -LiteralPath (Join-Path $repo $dir) -Destination (Join-Path $artifact $dir) -Recurse -Force
}
$skip = @('wrangler.toml','vercel.json','package.json','package-lock.json','.gitignore','.vercelignore',
  'bump.js','poll-deploy.js','local-check.js','import-check.js','ds-verify.js','ds-strat-test.js','index-local.html')
Get-ChildItem -LiteralPath $repo -File | Where-Object {
  $_.Name -notlike 'chk_*' -and $_.Name -notin $skip -and $_.Extension -ne '.git'
} | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $artifact $_.Name) -Force }

$files = Get-ChildItem -LiteralPath $artifact -Recurse -File -Include *.html,*.js,*.mjs,*.json,*.css,*.webmanifest
foreach ($file in $files) {
  $text = [IO.File]::ReadAllText($file.FullName)
  $updated = $text
  $updated = $updated -replace 'https://fssrtlpjqbavzomynwmg\.supabase\.co', $origin
  $updated = $updated -replace 'http://fssrtlpjqbavzomynwmg\.supabase\.co', $origin
  $updated = $updated -replace 'https://www\.alfa-trader\.com', $origin
  $updated = $updated -replace 'https://alfa-trader\.com', $origin
  $updated = $updated -replace 'http://alfa-trader\.com', $origin
  $updated = $updated -replace 'https://alfatraders\.vercel\.app', $origin
  $updated = $updated -replace "'alfa-trader\.com'", "'$origin'"
  $updated = $updated -replace 'alfa-trader\.com', 'alfa-charts-staging.pages.dev'
  $updated = $updated -replace 'alfatraders\.vercel\.app', 'alfa-charts-staging.pages.dev'
  $updated = $updated -replace 'sb-fssrtlpjqbavzomynwmg-auth-token', 'sb-alfa-charts-staging-auth-token'
  $updated = $updated -replace 'sb_publishable_[A-Za-z0-9_-]+', $secrets.publishable
  $updated = $updated -replace 'fssrtlpjqbavzomynwmg', 'alfa-charts-staging'
  if ($updated -cne $text) { [IO.File]::WriteAllText($file.FullName, $updated) }
}

# Local no-op stubs keep the Pages bundler self-contained; blob-backed staging
# routes are intentionally unavailable and are not exercised by the egress gate.
$blob = Join-Path $artifact 'node_modules\@vercel\blob'
New-Item -ItemType Directory -Path $blob -Force | Out-Null
'{"name":"@vercel/blob","version":"0.0.0-staging","type":"module","main":"index.js","exports":{".":"./index.js","./client":"./client.js"}}' | Set-Content -LiteralPath (Join-Path $blob 'package.json') -Encoding UTF8
'export async function put() { throw new Error("disabled in staging"); }' + "`n" +
'export async function list() { return { blobs: [] }; }' + "`n" +
'export async function del() {}' | Set-Content -LiteralPath (Join-Path $blob 'index.js') -Encoding UTF8
'export function handleUpload() { return new Response(JSON.stringify({ error: "disabled in staging" }), { status: 501 }); }' | Set-Content -LiteralPath (Join-Path $blob 'client.js') -Encoding UTF8

$rest = Join-Path $artifact 'functions\rest\v1'
$auth = Join-Path $artifact 'functions\auth\v1'
New-Item -ItemType Directory -Path $rest,$auth -Force | Out-Null
foreach ($name in @('[[path]].js','[table].js')) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'staging-rest-function.js') -Destination (Join-Path $rest $name) -Force
}
foreach ($name in @('[[path]].js','[endpoint].js')) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'staging-auth-function.js') -Destination (Join-Path $auth $name) -Force
}

$remaining = @()
foreach ($file in (Get-ChildItem -LiteralPath $artifact -Recurse -File)) {
  $text = [IO.File]::ReadAllText($file.FullName)
  if ($text -match 'fssrtlpjqbavzomynwmg|alfa-trader\.com|alfatraders\.vercel\.app|sb_publishable_(?!staging_)') {
    $remaining += $file.FullName.Substring($artifact.Length + 1)
  }
}
if ($remaining.Count) { throw ('Production references remain: ' + ($remaining -join ', ')) }
Write-Output ('Staging artifact ready: ' + $artifact + ' (' + $files.Count + ' rewritten text files)')
