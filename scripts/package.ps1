param([switch]$UseExistingExecutable)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspace
$builtExe = Join-Path $workspace 'src-tauri\target\release\codebook.exe'
$rootExe = Join-Path $workspace 'CodeBook.exe'
if (-not $UseExistingExecutable) {
    if (-not (Test-Path -LiteralPath $builtExe)) { throw 'Build the desktop executable first, or use -UseExistingExecutable to package the current root executable.' }
    Copy-Item -LiteralPath $builtExe -Destination $rootExe -Force
    if ((Get-FileHash -LiteralPath $rootExe).Hash -ne (Get-FileHash -LiteralPath $builtExe).Hash) { throw 'Executable copy verification failed.' }
}
if (-not (Test-Path -LiteralPath $rootExe)) { throw 'CodeBook.exe is missing from the project root.' }
$releaseDir = Join-Path $workspace 'release'
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$releaseExe = Join-Path $releaseDir 'CodeBook.exe'
Copy-Item -LiteralPath $rootExe -Destination $releaseExe -Force
Copy-Item -LiteralPath 'docs\START_HERE.txt' -Destination $releaseDir -Force
Copy-Item -LiteralPath 'README.md','VALIDATION.md','LICENSE','THIRD_PARTY_NOTICES.md' -Destination $releaseDir -Force
$hash = (Get-FileHash -LiteralPath $rootExe -Algorithm SHA256).Hash
Set-Content -LiteralPath (Join-Path $releaseDir 'CodeBook.exe.sha256') -Value "$hash  CodeBook.exe" -Encoding ascii
Copy-Item -LiteralPath (Join-Path $releaseDir 'CodeBook.exe.sha256') -Destination (Join-Path $workspace 'CodeBook.exe.sha256') -Force
$version = (Get-Content -Raw -LiteralPath 'package.json' | ConvertFrom-Json).version
$archive = Join-Path $releaseDir "CodeBook-$version-Windows.zip"
$files = @('CodeBook.exe','START_HERE.txt','README.md','VALIDATION.md','LICENSE','THIRD_PARTY_NOTICES.md','CodeBook.exe.sha256') | ForEach-Object { Join-Path $releaseDir $_ }
Add-Type -AssemblyName System.IO.Compression,System.IO.Compression.FileSystem
$temporaryArchive = Join-Path $releaseDir ("package-" + [guid]::NewGuid().ToString() + '.zip')
$zip = [IO.Compression.ZipFile]::Open($temporaryArchive, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $files) {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file, [IO.Path]::GetFileName($file)) | Out-Null
    }
    foreach ($imageName in @('dark-editor.png','dark-bookshelf.png','system-bible-dark.png','google-docs-formatting.png','compact-workspace.png','midnight-editor.png','rose-editor.png','white-editor.png','emoji-search.png','markdown-import.png')) {
        $imagePath = Join-Path $workspace "docs\images\$imageName"
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $imagePath, "docs/images/$imageName") | Out-Null
    }
} finally { $zip.Dispose() }
Move-Item -LiteralPath $temporaryArchive -Destination $archive -Force
Get-Item -LiteralPath $rootExe,$archive | Select-Object FullName,Length
Write-Output "SHA256: $hash"
