# Apex Drive Desktop Client

A professional Windows desktop application that provides seamless access to your legal documents through a virtual drive, offering a Clio Drive-like experience with enterprise-grade security.

## Features

- **Virtual Drive Letter** - Access all your matters through a dedicated mapped drive (e.g., Z:)
- **Permission-Based View** - Only see documents from matters you have access to
- **Automatic Sync** - Files synchronize automatically between your computer and the cloud
- **Desktop Integration** - Open, edit, and save files directly in Microsoft Office applications
- **Local Cache** - Recently accessed files are cached locally for fast access
- **System Tray** - Runs in the background with quick access from the system tray
- **Auto Updates** - Seamlessly receive updates when new versions are available

## Security

Apex Drive is built with security as a top priority:

- **256-bit Encryption** - All data encrypted in transit using TLS 1.3
- **Secure Token Storage** - Authentication tokens stored in encrypted local storage
- **Role-Based Access** - Only documents you're authorized to view are synced
- **Server-Side Enforcement** - All permissions verified server-side
- **No Third-Party Drivers** - Uses native Windows drive mapping (no kernel drivers required)

## Requirements

- Windows 10 or later (64-bit)
- An Apex Legal account with document access
- Internet connection for initial sync

## Installation

### From Installer

1. Download the latest `Apex Drive Setup.exe` from your firm administrator
2. Run the installer
3. Launch Apex Drive and sign in with your Apex Legal credentials
4. Click "Mount Drive" to access your documents

### Development Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Create Windows installer
npm run dist:win
```

## Architecture

### Main Process (`src/main/`)

| Module | Description |
|--------|-------------|
| `main.ts` | Application entry point, window management, system tray |
| `vfs/VirtualDrive.ts` | Virtual drive implementation using Windows drive mapping |
| `api/ApiClient.ts` | HTTP/WebSocket client for server communication |
| `sync/SyncEngine.ts` | Synchronization status and management |
| `auth/AuthManager.ts` | Authentication and secure token handling |
| `config/ConfigManager.ts` | Application settings management |

### Preload Script (`src/preload/`)

- `preload.ts` - Secure context bridge between main and renderer processes

### Renderer (`src/renderer/`)

- `App.tsx` - Main React application with navigation
- `components/` - UI components (Login, Dashboard, Settings, SyncLogs)
- `styles/` - CSS modules and global styles

## How It Works

1. **Authentication** - User signs in with Apex Legal credentials
2. **Matter Loading** - Fetches list of matters the user has access to via API
3. **Virtual Drive** - Maps a local folder to a drive letter (e.g., Z:)
4. **Folder Structure** - Creates A-Z organized folders matching matter names
5. **File Sync** - Downloads permitted files on-demand with local caching
6. **Background Sync** - Periodically checks for changes and updates

## Configuration

Settings are stored in the user's app data directory.

### Available Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `driveLetter` | Z | Virtual drive letter to use |
| `autoStart` | true | Launch when Windows starts |
| `autoMount` | true | Mount drive automatically on startup |
| `syncInterval` | 30000 | Sync check interval (milliseconds) |
| `maxCacheSize` | 5GB | Maximum local cache size |
| `conflictStrategy` | ask | How to handle file conflicts |
| `showNotifications` | true | Show sync notifications |

## Troubleshooting

### Drive not mounting

1. Ensure the drive letter is not already in use
2. Try a different drive letter in Settings
3. Restart the application

### Files not appearing

1. Wait for the initial sync to complete (check the Sync Logs)
2. Verify your matter permissions in the web application
3. Click "Sync Now" to force a refresh

### Connection issues

1. Check your internet connection
2. Verify the server URL in Settings
3. Try signing out and signing back in

## Building for Production

```bash
# Install dependencies
npm install

# Build all components
npm run build

# Create installer
npm run dist:win
```

The installer will be created in the `release/` directory.

## License

Proprietary - Apex Legal, Inc. All rights reserved.

## Support

For assistance, contact your firm administrator or email support@apexlegal.com.
