@echo off
cd /d "%~dp0"
title Kredo — Push to GitHub
echo.
echo  ========================================
echo    Push to GitHub
echo  ========================================
echo.

set /p MSG="  Commit message (e.g. v1.0.1 or fix email): "

if "%MSG%"=="" (
    echo  No message entered. Cancelled.
    pause
    exit /b 1
)

echo.
echo  Adding all changes...
git add .

echo  Committing: %MSG%
git commit -m "%MSG%"

echo  Pushing to GitHub...
git push

echo.
echo  ========================================
echo    Done! Changes pushed to GitHub.
echo  ========================================
echo.
pause
