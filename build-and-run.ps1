<#
.SYNOPSIS
    Workflow Manager - Build and Run Script
#>

$ErrorActionPreference = "Stop"

Write-Host "=============================================="
Write-Host "      Workflow Manager - Build and Run"
Write-Host "=============================================="
Write-Host ""

try {
    Write-Host "Step 1: Installing dependencies..."
    Write-Host ""
    npm install
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed with exit code $LASTEXITCODE"
    }

    Write-Host ""
    Write-Host "Step 2: Rebuilding native modules for Electron..."
    Write-Host ""
    npx electron-rebuild
    if ($LASTEXITCODE -ne 0) {
        throw "electron-rebuild failed with exit code $LASTEXITCODE"
    }

    Write-Host ""
    Write-Host "Step 3: Building the application..."
    Write-Host ""
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "npm run build failed with exit code $LASTEXITCODE"
    }

    Write-Host ""
    Write-Host "Step 4: Starting the application..."
    Write-Host ""
    
    $exePath = Join-Path -Path (Get-Location) -ChildPath "dist\Workflow Manager\Workflow Manager.exe"
    Start-Process -FilePath $exePath

    Write-Host ""
    Write-Host "Build and run completed successfully!"
}
catch {
    Write-Host ""
    Write-Host "ERROR: $_" -ForegroundColor Red
    Read-Host -Prompt "Press Enter to exit"
    exit 1
}

Read-Host -Prompt "Press Enter to exit"