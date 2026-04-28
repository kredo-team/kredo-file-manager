@echo off
cd /d "%~dp0"
title Kredo File Manager - Production Build
echo.
echo  ========================================
echo    Building Kredo File Manager (.exe)
echo  ========================================
echo.
echo  This may take a few minutes on first build
echo  (Rust needs to compile dependencies).
echo.

call npx tauri build

if %ERRORLEVEL% neq 0 (
    echo.
    echo  Build failed. Check the error messages above.
    pause
    exit /b 1
)

echo.
echo  ========================================
echo    Build complete!
echo.
echo    Your .exe is in:
echo    src-tauri\target\release\bundle\
echo  ========================================
echo.
pause
