<#
.SYNOPSIS
Creates a source-only distribution ZIP for the Business Analytics submission.

.DESCRIPTION
Copies the project tree to a temporary staging folder, skipping node_modules,
build output, VCS metadata, logs, and ALL real .env files. .env.example files
are kept. The archive is then inspected and the script fails if a secret .env
file or node_modules entry is found.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts/create-distribution.ps1
#>

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
$distributionRoot = Join-Path $root "distribution"
$staging = Join-Path $distributionRoot "staging"
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$zipPath = Join-Path $distributionRoot "AI-Motor-Shop-BA-$stamp.zip"

if (Test-Path $staging) {
    Remove-Item -Path $staging -Recurse -Force
}
New-Item -ItemType Directory -Path $staging -Force | Out-Null

$excludedDirectoryNames = @(".git", "node_modules", "dist", "build", "coverage", "distribution")
$excludedExactFileNames = @(".env", ".env.local", ".env.development.local", ".env.test.local", ".env.production.local")

function Test-ExcludedRelativePath {
    param([string]$RelativePath)

    $segments = $RelativePath -split "[\\/]"
    foreach ($segment in $segments) {
        if ($excludedDirectoryNames -contains $segment) { return $true }
        if ($excludedExactFileNames -contains $segment) { return $true }
        if ($segment.StartsWith(".env.") -and $segment -ne ".env.example") { return $true }
        if ($segment -like "*.log") { return $true }
    }
    return $false
}

$sourceItems = Get-ChildItem -Path $root -Force | Where-Object {
    $excludedDirectoryNames -notcontains $_.Name -and
    $excludedExactFileNames -notcontains $_.Name
}

foreach ($item in $sourceItems) {
    if ($item.PSIsContainer) {
        $files = Get-ChildItem -Path $item.FullName -Recurse -Force -File
        foreach ($file in $files) {
            $relative = $file.FullName.Substring($root.Length + 1)
            if (Test-ExcludedRelativePath -RelativePath $relative) { continue }
            $destination = Join-Path $staging $relative
            $destinationDirectory = Split-Path -Parent $destination
            if (-not (Test-Path $destinationDirectory)) {
                New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
            }
            Copy-Item -Path $file.FullName -Destination $destination -Force
        }
    }
    else {
        if (-not (Test-ExcludedRelativePath -RelativePath $item.Name)) {
            Copy-Item -Path $item.FullName -Destination (Join-Path $staging $item.Name) -Force
        }
    }
}

Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zipPath -Force

# Verify the archive before reporting success.
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $badEntries = @()
    foreach ($entry in $archive.Entries) {
        $segments = $entry.FullName -split "[\\/]"
        $hasNodeModules = $segments -contains "node_modules"
        $hasSecretEnv = $false
        foreach ($segment in $segments) {
            if ($segment -eq ".env") { $hasSecretEnv = $true }
            if ($segment.StartsWith(".env.") -and $segment -ne ".env.example") { $hasSecretEnv = $true }
        }
        if ($hasNodeModules -or $hasSecretEnv) {
            $badEntries += $entry.FullName
        }
    }

    if ($badEntries.Count -gt 0) {
        Write-Error "Distribution archive contains excluded content:`n$($badEntries -join "`n")"
    }
}
finally {
    $archive.Dispose()
}

Remove-Item -Path $staging -Recurse -Force

Write-Host "Created: $zipPath"
Write-Host "Verified: no .env secrets and no node_modules entries."
