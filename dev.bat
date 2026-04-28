@echo off
cd /d "%~dp0"
title Kredo File Manager - Dev Mode
echo.
echo  Starting Kredo File Manager in dev mode...
echo  This will launch both the frontend and Tauri window.
echo  (Close this window or press Ctrl+C to stop)
echo.
call npx tauri dev
if %ERRORLEVEL% neq 0 (
    echo.
    echo  Dev server exited with an error. Check messages above.
    pause
)
