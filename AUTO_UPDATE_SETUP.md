# Kredo File Manager — Auto-Update Setup Guide

## Overview

The app uses Tauri's updater plugin with GitHub Releases. When a new version is published, installed apps detect it automatically and offer a one-click update.

---

## One-Time Setup (10 minutes)

### Step 1: Create a GitHub Repository

1. Go to https://github.com/new
2. Name: `kredo-file-manager` (private or public — both work)
3. Create the repo (don't initialize with README)
4. Push your code:

```bash
cd kredo-file-manager
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/kredo-file-manager.git
git push -u origin main
```

### Step 2: Generate Signing Keys

Tauri requires signed updates for security. Run this once:

```bash
npx tauri signer generate -w ~/.tauri/kredo.key
```

This creates two files:
- **Private key**: `~/.tauri/kredo.key` (keep secret, used for signing builds)
- **Public key**: Printed to terminal (paste into `tauri.conf.json`)

**Save the password** you enter — you'll need it for every build.

### Step 3: Configure the Project

Open `src-tauri/tauri.conf.json` and replace the placeholder values:

```json
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/YOUR_USERNAME/kredo-file-manager/releases/latest/download/latest.json"
    ],
    "pubkey": "PASTE_YOUR_PUBLIC_KEY_HERE"
  }
}
```

Replace:
- `YOUR_USERNAME` → your GitHub username
- `PASTE_YOUR_PUBLIC_KEY_HERE` → the public key from Step 2

### Step 4: Set Environment Variables for Signing

Before building, set these environment variables:

**Windows (Command Prompt):**
```cmd
set TAURI_SIGNING_PRIVATE_KEY=C:\Users\YOU\.tauri\kredo.key
set TAURI_SIGNING_PRIVATE_KEY_PASSWORD=your_password_here
```

**Windows (PowerShell):**
```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "C:\Users\YOU\.tauri\kredo.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "your_password_here"
```

**Tip:** Add these to your system environment variables permanently so you don't need to set them every time.

---

## Publishing an Update

Every time you want to release a new version:

### Step 1: Bump the Version

Edit `src-tauri/tauri.conf.json`:
```json
"version": "1.0.1"
```

Also update `package.json`:
```json
"version": "1.0.1"
```

### Step 2: Build

```cmd
build.bat
```

This produces these files in `src-tauri/target/release/bundle/nsis/`:
- `Kredo File Manager_1.0.1_x64-setup.exe` — the installer
- `Kredo File Manager_1.0.1_x64-setup.nsis.zip` — the update bundle
- `Kredo File Manager_1.0.1_x64-setup.nsis.zip.sig` — the signature

### Step 3: Create `latest.json`

Create a file called `latest.json` with this content:

```json
{
  "version": "1.0.1",
  "notes": "Bug fixes and UI improvements",
  "pub_date": "2026-04-28T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "PASTE_CONTENTS_OF_.sig_FILE_HERE",
      "url": "https://github.com/YOUR_USERNAME/kredo-file-manager/releases/download/v1.0.1/Kredo.File.Manager_1.0.1_x64-setup.nsis.zip"
    }
  }
}
```

To get the signature, open the `.sig` file and copy its contents:
```cmd
type "src-tauri\target\release\bundle\nsis\Kredo File Manager_1.0.1_x64-setup.nsis.zip.sig"
```

### Step 4: Create GitHub Release

1. Go to your repo → Releases → "Create a new release"
2. Tag: `v1.0.1`
3. Title: `v1.0.1`
4. Description: Your release notes
5. Attach these 3 files:
   - `Kredo File Manager_1.0.1_x64-setup.exe` (for fresh installs)
   - `Kredo File Manager_1.0.1_x64-setup.nsis.zip` (for auto-updates)
   - `latest.json` (the manifest)
6. Publish

### Step 5: Done

All installed apps will detect the update:
- **On launch**: Silent check, toast notification if update available
- **Settings > About**: Manual "Check for Updates" button
- **One-click install**: Downloads, installs, and restarts automatically

---

## How It Works

```
App launches
    │
    ▼
Fetches latest.json from GitHub
    │
    ▼
Compares version in latest.json vs installed version
    │
    ├─ Same → "You're up to date"
    │
    └─ Newer → Shows "Update available"
                    │
                    ▼
              User clicks "Download & Install"
                    │
                    ▼
              Downloads .nsis.zip from GitHub
                    │
                    ▼
              Verifies signature with public key
                    │
                    ▼
              Installs update + Restarts app
```

---

## Troubleshooting

**"Check for Updates" fails:**
- App needs internet access to reach GitHub
- Check if the endpoint URL in tauri.conf.json is correct
- Private repos need a GitHub token (use `https://YOUR_TOKEN@github.com/...`)

**Build doesn't produce .sig file:**
- Ensure `TAURI_SIGNING_PRIVATE_KEY` environment variable is set
- Ensure the key file path is correct

**Update downloads but fails to install:**
- The signature doesn't match — rebuild with the correct private key
- The public key in tauri.conf.json must match the private key used to sign

**Update not detected:**
- Check that `latest.json` has the correct version number
- The version must be strictly greater than the installed version (semver)
- Ensure `latest.json` is attached to the **latest** GitHub release

---

## Automating Releases (Future)

For fully automated builds + releases, add a GitHub Actions workflow:

1. Push a version tag: `git tag v1.0.2 && git push --tags`
2. GitHub Actions builds the app, signs it, creates `latest.json`, and publishes the release

This eliminates manual steps entirely. Set up when the release cadence increases.
