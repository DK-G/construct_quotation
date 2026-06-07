# Setup Script for Construct Quotation Worktree node_modules Junction
$RepoName = "construct_quotation"
$WorktreeDir = $PSScriptRoot
$SharedBaseDir = "D:\dev\shared\node_modules\$RepoName"
$SharedRepoNodeModules = "$SharedBaseDir\repo\node_modules"


Write-Host "Verifying shared node_modules target directory..."
if (-not (Test-Path $SharedRepoNodeModules)) {
    Write-Host "Creating shared directory: $SharedRepoNodeModules"
    New-Item -ItemType Directory -Force -Path $SharedRepoNodeModules | Out-Null
}

$LocalNodeModules = "$WorktreeDir\node_modules"
Write-Host "Checking local node_modules..."
if (Test-Path $LocalNodeModules) {
    $item = Get-Item $LocalNodeModules
    if ($item.LinkType -eq "Junction") {
        Write-Host "Junction link already exists: $LocalNodeModules -> $($item.Target)"
        if ($item.Target -ne $SharedRepoNodeModules) {
            Write-Host "Warning: Junction target does not match. Recreating junction..."
            cmd /c rmdir $LocalNodeModules
            cmd /c mklink /j $LocalNodeModules $SharedRepoNodeModules

        }
    } else {
        Write-Host "Local node_modules is a standard directory. Removing it..."
        cmd /c rmdir /s /q $LocalNodeModules
        Write-Host "Creating new junction..."
        cmd /c mklink /j $LocalNodeModules $SharedRepoNodeModules
    }
} else {
    Write-Host "Creating junction link..."
    cmd /c mklink /j $LocalNodeModules $SharedRepoNodeModules
}

Write-Host "Checking Yarn 4 configuration..."
$YarnRcPath = "$WorktreeDir\.yarnrc.yml"
$YarnRcContent = @"
nodeLinker: node-modules
cacheFolder: D:/dev/shared/yarn-cache/$RepoName
enableGlobalCache: false
"@
if (-not (Test-Path $YarnRcPath)) {
    Write-Host "Creating .yarnrc.yml..."
    Set-Content -Path $YarnRcPath -Value $YarnRcContent -Encoding UTF8
}

Write-Host "Setup complete. You can now run 'yarn install' safely."
