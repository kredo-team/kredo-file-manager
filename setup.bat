@echo off
cd /d "%~dp0"
setlocal enabledelayedexpansion
title Kredo File Manager - Setup
color 0B

echo.
echo  ========================================
echo    Kredo File Manager - Environment Setup
echo  ========================================
echo.
echo  This will check and install:
echo    1. Node.js (v18+)
echo    2. Rust toolchain
echo    3. npm dependencies
echo    4. Tauri CLI
echo.

:: Check Node.js
echo [1/4] Checking Node.js...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo   ERROR: Node.js not found.
    echo   Please install Node.js v18+ from https://nodejs.org/
    echo   After installing, run setup.bat again.
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%v in ('node --version') do echo   Found Node.js %%v
)
echo.

:: Check Rust
echo [2/4] Checking Rust toolchain...
where rustc >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo   Rust not found. Installing via rustup...
    powershell -Command "Invoke-WebRequest https://win.rustup.rs/x86_64 -OutFile rustup-init.exe"
    if exist rustup-init.exe (
        rustup-init.exe -y
        del rustup-init.exe
        set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
        echo   Rust installed. You may need to restart your terminal.
    ) else (
        echo   Download failed. Install Rust manually from https://rustup.rs/
        pause
        exit /b 1
    )
) else (
    for /f "tokens=*" %%v in ('rustc --version') do echo   Found %%v
)
echo.

:: Install npm deps
echo [3/4] Installing npm dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo   npm install failed. Check your internet connection.
    pause
    exit /b 1
)
echo   Dependencies installed.
echo.

:: Verify Tauri CLI
echo [4/4] Verifying Tauri CLI...
call npx tauri --version >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo   Installing Tauri CLI...
    call npm install -D @tauri-apps/cli@latest
)
echo   Tauri CLI ready.
echo.

echo  ========================================
echo    Setup complete!
echo.
echo    Run dev.bat   - Start dev server
echo    Run build.bat - Build production .exe
echo  ========================================
echo.
pause
