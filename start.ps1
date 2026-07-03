<#
.SYNOPSIS
    Workflow Manager - Quick Start Script
#>

$ErrorActionPreference = "Stop"

Write-Host "=============================================="
Write-Host "      Workflow Manager - Quick Start"
Write-Host "=============================================="
Write-Host ""

$exePath = Join-Path -Path (Get-Location) -ChildPath "dist\Workflow Manager\Workflow Manager.exe"

if (-not (Test-Path -Path $exePath -PathType Leaf)) {
    Write-Host "ERROR: Application not found at:"
    Write-Host "       $exePath"
    Write-Host ""
    Write-Host "Please run 'npm run build' first to build the application."
    Read-Host -Prompt "Press Enter to exit"
    exit 1
}

Write-Host "Starting Workflow Manager..."
Write-Host ""

Start-Process -FilePath $exePath

Write-Host "Application started successfully!"
Write-Host ""
Read-Host -Prompt "Press Enter to exit"