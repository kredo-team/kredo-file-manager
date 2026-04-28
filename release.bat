@echo off
cd /d "%~dp0"
title Kredo — Release New Version
echo.
echo  ========================================
echo    Kredo File Manager — New Release
echo  ========================================
echo.
echo  This will: build, sign, and prepare
echo  files for a GitHub Release.
echo.

REM Load signing keys
if exist .env.signing (
    call .env.signing
    echo  Signing keys loaded.
) else (
    echo  ERROR: .env.signing not found.
    echo  Create it with your signing key path and password.
    pause
    exit /b 1
)

echo.
echo  Current version in tauri.conf.json:
findstr /C:"version" src-tauri\tauri.conf.json | findstr /V schema
echo.
echo  Make sure you bumped the version in:
echo    - src-tauri\tauri.conf.json
echo    - package.json
echo.
set /p CONFIRM="  Continue with build? (y/n): "
if /i not "%CONFIRM%"=="y" (
    echo  Cancelled.
    pause
    exit /b 0
)

echo.
echo  Building...
echo.
call npx tauri build

if %ERRORLEVEL% neq 0 (
    echo.
    echo  Build failed.
    pause
    exit /b 1
)

echo.
echo  ========================================
echo    Build complete!
echo  ========================================
echo.
echo  Next steps:
echo.
echo  1. Go to: src-tauri\target\release\bundle\nsis\
echo.
echo  2. You need these files:
echo     - Kredo File Manager_x.x.x_x64-setup.exe
echo     - Kredo File Manager_x.x.x_x64-setup.nsis.zip
echo     - Kredo File Manager_x.x.x_x64-setup.nsis.zip.sig
echo.
echo  3. Create latest.json (see AUTO_UPDATE_SETUP.md)
echo.
echo  4. Create GitHub Release:
echo     https://github.com/kredo-team/kredo-file-manager/releases/new
echo     - Tag: vX.X.X
echo     - Attach: .exe + .nsis.zip + latest.json
echo.
echo  ========================================
echo.
pause
