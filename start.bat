@echo off
chcp 65001 >nul
echo ==============================================
echo      Workflow Manager - Quick Start
echo ==============================================
echo.

set "EXE_PATH=dist\Workflow Manager\Workflow Manager.exe"

if not exist "%EXE_PATH%" (
    echo ERROR: Application not found at:
    echo        %EXE_PATH%
    echo.
    echo Please run "npm run build" first to build the application.
    pause
    exit /b 1
)

echo Starting Workflow Manager...
echo.

start "" "%EXE_PATH%"

echo Application started successfully!
echo.
echo Press any key to exit...
pause >nul