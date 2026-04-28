# Kredo File Manager

A premium Windows desktop app for organizing and managing GST-related documents. Built with **Tauri 2.0 + React + TypeScript**.

## Features

- **Entity Management** — Add clients/firms, configure email recipients per entity
- **Smart Folder Creation** — Create FY and month-wise folder structures (no duplicates)
- **File Scanner** — Recursive scan of all files with inventory dashboard
- **Export** — Generate PDF and Excel summary reports
- **Email** — One-click send summaries to pre-configured recipients via SMTP

## Quick Start

### Prerequisites
- Windows 10/11
- Internet connection (for first-time setup)

### Setup

1. **Extract** the ZIP to any folder
2. **Double-click `setup.bat`** — it will:
   - Check for Node.js (install from https://nodejs.org if missing)
   - Check for Rust (auto-installs if missing)
   - Install all npm dependencies
   - Verify Tauri CLI

### Development

```
dev.bat
```
Launches the app in development mode with hot reload.

### Build Production .exe

```
build.bat
```
Produces the final `.exe` installer in `src-tauri/target/release/bundle/`.

## Project Structure

```
kredo-file-manager/
├── setup.bat              # One-time environment setup
├── dev.bat                # Launch dev server
├── build.bat              # Build production .exe
├── package.json
├── vite.config.ts
├── index.html
├── src/                   # React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/            # Design tokens + global CSS
│   ├── components/        # Reusable UI components
│   ├── pages/             # App pages
│   ├── hooks/             # Custom React hooks
│   ├── store/             # Zustand state management
│   ├── types/             # TypeScript definitions
│   └── utils/             # Helpers and utilities
├── src-tauri/             # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       └── commands/      # Tauri commands
│           ├── folder.rs  # Folder creation/listing
│           ├── scanner.rs # Recursive file scanning
│           ├── email.rs   # SMTP email sending
│           └── settings.rs# App settings persistence
```

## Design System

Follows the **Kredo GST Design System**:
- Brand purple `#615FFF` for positive actions
- Soft red `#E25C5C` for caution only
- Plus Jakarta Sans typography
- Shadow-based card edges, no borders
- Premium transitions and micro-interactions

## App Pages

1. **Entities** — Manage clients, set email TO/CC/Subject per entity
2. **Create Folders** — Pick entity + FY → create folder structure (skips existing)
3. **Scan & Preview** — Filter by entity + FY → full file inventory with stats
4. **Export & Email** — Generate PDF/Excel reports, one-click email with attachment
5. **Settings** — Root folder selection, SMTP configuration

## Tech Stack

| Layer    | Technology                     |
|----------|-------------------------------|
| Frontend | React 18, TypeScript, Zustand |
| Backend  | Rust, Tauri 2.0               |
| Styling  | CSS Variables (design tokens) |
| Export   | jsPDF, ExcelJS                |
| Email    | lettre (Rust SMTP)            |
| Build    | Vite, Cargo                   |
