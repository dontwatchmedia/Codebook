param([ValidateSet('dev','build','test')][string]$Mode = 'dev')
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspace
if (Test-Path -LiteralPath (Join-Path $workspace '.tools\cargo\bin\cargo.exe')) {
    $env:CARGO_HOME = Join-Path $workspace '.tools\cargo'
    $env:RUSTUP_HOME = Join-Path $workspace '.tools\rustup'
    $env:PATH = "$env:CARGO_HOME\bin;$env:PATH"
}
switch ($Mode) {
    'dev' { & npm.cmd run desktop:dev }
    'build' { & npm.cmd run desktop:build }
    'test' { & cargo test --manifest-path src-tauri/Cargo.toml }
}
exit $LASTEXITCODE
