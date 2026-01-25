# Apex Drive

Desktop sync app for Apex legal practice management. Like Clio Drive - sync your firm documents locally for instant access.

## Features

- **Automatic Sync**: Documents sync every 5 minutes (configurable)
- **Matter-Based Access**: Only see documents from your assigned matters
- **Local Files**: Open documents instantly - no download wait
- **Two-Way Sync**: Changes sync back to the cloud automatically
- **Tray App**: Runs in the background, always keeping files up to date

## How It Works

1. Sign in with your Apex credentials
2. App syncs your matters and documents to a local folder
3. Open files directly from Finder/Explorer - they're on your computer
4. Edit and save - changes sync back automatically
5. New uploads appear in the Apex web app and for your team

## Installation

### From Release (Recommended)
Download the installer from your Apex portal:
- **Windows**: `Apex Drive Setup.exe`
- **macOS**: `Apex Drive.dmg`
- **Linux**: `Apex Drive.AppImage`

### From Source

```bash
# Install dependencies
npm install

# Run in development
npm start

# Build installers
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

## Folder Structure

After syncing, your documents appear in:

```
Documents/
└── Apex Drive/
    ├── Matters/
    │   ├── 2024-001 - Smith v Jones/
    │   │   ├── Pleadings/
    │   │   │   ├── Complaint.docx
    │   │   │   └── Answer.docx
    │   │   └── Discovery/
    │   │       └── Interrogatories.docx
    │   └── 2024-002 - Johnson Estate/
    │       └── Will.pdf
    └── My Documents/
        └── Templates/
            └── engagement_letter.docx
```

## Security

- Your login token is stored securely in the system keychain
- Only documents you have permission to access are synced
- All transfers use HTTPS encryption
- Local database stores only metadata, not file contents

## Configuration

Access settings via the tray icon menu or main window:

- **Sync Folder**: Where files are stored locally
- **Auto-Sync**: Enable/disable automatic background sync
- **Sync Interval**: How often to check for changes (1-60 minutes)

## Requirements

- Windows 10+ / macOS 10.13+ / Ubuntu 18.04+
- 100MB disk space (plus space for your documents)
- Internet connection for initial sync and updates

## Troubleshooting

### Files not syncing
1. Check the sync status in the tray menu
2. Click "Sync Now" to force a sync
3. Check your internet connection

### Login issues
1. Make sure you're using the correct server URL
2. Verify your email and password work on the web app
3. Contact your firm admin if locked out

### Performance
The app uses minimal resources when idle. During sync:
- CPU: Brief spikes during file hashing
- Network: Only changed files are transferred
- Disk: Files are stored efficiently with deduplication
