@echo off
chcp 65001 >nul
echo ==============================================
echo      Workflow Manager - Build and Run
echo ==============================================
echo.

echo Step 1: Installing dependencies...
echo.
npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo Step 2: Rebuilding native modules for Electron...
echo.
npx electron-rebuild
if %errorlevel% neq 0 (
    echo ERROR: Failed to rebuild native modules
    pause
    exit /b 1
)

echo.
echo Step 3: Building the application...
echo.
npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo Step 4: Starting the application...
echo.
start "" "dist\Workflow Manager\Workflow Manager.exe"

echo.
echo Build and run completed!
echo Press any key to exit...
pause >nul