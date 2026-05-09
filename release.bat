@echo off
cd /d "%~dp0"
title Kredo — Release New Version
echo.
echo  ========================================
echo    Kredo File Manager — New Release
echo  ========================================
echo.
echo  This will tag and push to GitHub.
echo  GitHub Actions will automatically:
echo    - Build the x64 .exe
echo    - Sign the update bundle
echo    - Create the GitHub Release
echo    - Generate latest.json
echo.
echo  Current version in tauri.conf.json:
findstr /C:"version" src-tauri\tauri.conf.json | findstr /V schema
echo.

set /p VER="  Enter new version (e.g. 1.0.1): "

if "%VER%"=="" (
    echo  No version entered. Cancelled.
    pause
    exit /b 1
)

echo.
echo  Make sure you already updated the version to %VER% in:
echo    - src-tauri\tauri.conf.json
echo    - package.json
echo.
set /p CONFIRM="  Continue? (y/n): "
if /i not "%CONFIRM%"=="y" (
    echo  Cancelled.
    pause
    exit /b 0
)

echo.
echo  Installing dependencies...
call npm install

echo  Syncing Rust crates...
cd src-tauri
cargo update
cd ..

echo.
echo  Committing changes...
git add .
git commit -m "v%VER%"

echo  Creating tag v%VER%...
git tag v%VER%

echo  Pushing code + tag to GitHub...
git push
git push --tags

echo.
echo  ========================================
echo    Done! GitHub Actions is now building.
echo.
echo    Track progress at:
echo    https://github.com/kredo-team/kredo-file-manager/actions
echo.
echo    Release will appear at:
echo    https://github.com/kredo-team/kredo-file-manager/releases
echo  ========================================
echo.
pause
