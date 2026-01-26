# Apex Drive Desktop Client

A Windows desktop application that creates a virtual drive for seamless access to your legal documents, providing a Clio Drive-like experience on top of Azure File Share.

## Features

- **Virtual Drive Letter** - Access all your matters through a single mapped drive (e.g., Z:)
- **Matter-Filtered View** - See only the matters you have access to, based on your permissions
- **Real-Time Sync** - Files sync automatically between your computer and Azure
- **Desktop Integration** - Open, edit, and save files directly in Word, Excel, etc.
- **Offline Cache** - Recently accessed files are cached locally for fast access
- **System Tray** - Runs in the background with quick access from the system tray

## Requirements

- Windows 10 or later (64-bit)
- [WinFsp](https://winfsp.dev/) - Windows File System Proxy (installed automatically)
- An Apex Legal account with document access

## Installation

### From Installer

1. Download the latest `Apex Drive Setup.exe` from the releases page
2. Run the installer
3. Follow the prompts (WinFsp will be installed if needed)
4. Launch Apex Drive and sign in

### Development Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Create installer
npm run dist:win
```

## Architecture

### Main Process (`src/main/`)

- **main.ts** - Application entry point, window management, system tray
- **vfs/** - Virtual file system implementation using WinFsp
- **api/** - API client for server communication
- **sync/** - Bidirectional sync engine
- **cache/** - Local file cache management
- **auth/** - Authentication and secure token storage
- **config/** - Application settings

### Preload Script (`src/preload/`)

- **preload.ts** - Secure bridge between main and renderer processes

### Renderer (`src/renderer/`)

- **App.tsx** - Main React application
- **components/** - UI components (Login, Dashboard, Settings, SyncLogs)
- **styles/** - CSS styles

## How It Works

1. **Authentication** - User logs in with Apex Legal credentials
2. **Matter Loading** - Fetches list of matters the user has access to
3. **Virtual Drive** - Creates a virtual drive using WinFsp
4. **File Operations** - Intercepts file system calls and translates them to Azure operations
5. **Caching** - Downloads files on demand and caches them locally
6. **Sync** - Monitors for changes and syncs back to Azure

## Configuration

Settings are stored in:
- Windows: `%APPDATA%\apex-drive-desktop\config.json`

### Available Settings

| Setting | Default | Description |
|---------|---------|-------------|
| driveLetter | Z | Virtual drive letter |
| autoStart | true | Start with Windows |
| autoMount | true | Mount drive on startup |
| syncInterval | 30000 | Sync interval in ms |
| maxCacheSize | 5GB | Maximum local cache size |
| conflictStrategy | ask | How to handle conflicts |

## Security

- Authentication tokens stored in Windows Credential Manager
- All communication over HTTPS
- File content cached locally only when accessed
- Permissions enforced server-side

## Troubleshooting

### Drive not mounting

1. Ensure WinFsp is installed: `winfsctl lsvol`
2. Check if the drive letter is available
3. Try running as administrator for first mount

### Sync issues

1. Check internet connection
2. View sync logs in the app
3. Try "Sync Now" to force immediate sync

### Files not appearing

1. Wait for initial sync to complete
2. Check matter permissions in web app
3. Refresh the file tree

## License

Proprietary - Apex Legal, Inc.

## Support

Contact support@apexlegal.com for assistance.
