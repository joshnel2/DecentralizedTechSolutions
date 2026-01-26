/**
 * Apex Drive Desktop Client - Main Process
 * 
 * This is the entry point for the Electron application.
 * It manages the virtual file system, system tray, and window lifecycle.
 */

import { app, BrowserWindow, Menu, Tray, ipcMain, dialog, shell, nativeImage } from 'electron';
import path from 'path';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';

import { ApexDriveVFS } from './vfs/ApexDriveVFS';
import { ApiClient } from './api/ApiClient';
import { SyncEngine } from './sync/SyncEngine';
import { AuthManager } from './auth/AuthManager';
import { ConfigManager } from './config/ConfigManager';

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
autoUpdater.logger = log;

// Global references
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let vfs: ApexDriveVFS | null = null;
let apiClient: ApiClient | null = null;
let syncEngine: SyncEngine | null = null;
let authManager: AuthManager | null = null;
let configManager: ConfigManager | null = null;

// Store for persistent settings
const store = new Store({
  name: 'apex-drive-settings',
  defaults: {
    driveLetter: 'Z',
    autoStart: true,
    autoMount: true,
    serverUrl: 'https://api.apexlegal.com',
    syncInterval: 30000, // 30 seconds
    cacheDir: '',
    maxCacheSize: 5 * 1024 * 1024 * 1024, // 5GB
  }
});

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

async function createWindow(): Promise<void> {
  const iconPath = isDev 
    ? path.join(__dirname, '../../build/icon.png')
    : path.join(process.resourcesPath, 'resources/icon.png');

  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    show: false,
    frame: true,
    titleBarStyle: 'default',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Load the renderer
  if (isDev) {
    // In development, connect to Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    // Minimize to tray instead of closing
    if (tray && !app.isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray(): void {
  const iconPath = isDev
    ? path.join(__dirname, '../../build/tray-icon.png')
    : path.join(process.resourcesPath, 'resources/tray-icon.png');

  // Create a default icon if the file doesn't exist
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
  } catch {
    // Create a simple default icon
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Apex Drive');

  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });
}

function updateTrayMenu(): void {
  if (!tray) return;

  const isConnected = apiClient?.isConnected() ?? false;
  const isMounted = vfs?.isMounted() ?? false;
  const driveLetter = store.get('driveLetter') as string;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Apex Drive',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: `Status: ${isConnected ? 'Connected' : 'Disconnected'}`,
      enabled: false,
    },
    {
      label: `Drive ${driveLetter}: ${isMounted ? 'Mounted' : 'Not Mounted'}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: isMounted ? 'Unmount Drive' : 'Mount Drive',
      click: async () => {
        if (isMounted) {
          await unmountDrive();
        } else {
          await mountDrive();
        }
        updateTrayMenu();
      },
    },
    {
      label: 'Open Drive',
      enabled: isMounted,
      click: () => {
        shell.openPath(`${driveLetter}:\\`);
      },
    },
    {
      label: 'Sync Now',
      enabled: isConnected && isMounted,
      click: () => {
        syncEngine?.syncNow();
      },
    },
    { type: 'separator' },
    {
      label: 'Open Settings',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send('navigate', '/settings');
        }
      },
    },
    {
      label: 'View Sync Log',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send('navigate', '/logs');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Sign Out',
      click: async () => {
        await signOut();
      },
    },
    {
      label: 'Quit Apex Drive',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

async function initializeApp(): Promise<void> {
  log.info('Initializing Apex Drive...');

  // Initialize config manager
  configManager = new ConfigManager(store);

  // Initialize auth manager
  authManager = new AuthManager(store);
  const isAuthenticated = await authManager.isAuthenticated();

  if (!isAuthenticated) {
    log.info('User not authenticated, showing login window');
    await createWindow();
    return;
  }

  // Initialize API client
  const serverUrl = store.get('serverUrl') as string;
  const token = await authManager.getToken();
  apiClient = new ApiClient(serverUrl, token);

  // Verify token is valid
  try {
    await apiClient.verifyToken();
    log.info('Token verified successfully');
  } catch (error) {
    log.error('Token verification failed:', error);
    await createWindow();
    return;
  }

  // Initialize sync engine
  syncEngine = new SyncEngine(apiClient, configManager);
  
  // Initialize virtual file system
  vfs = new ApexDriveVFS(apiClient, syncEngine, configManager);

  // Auto-mount if configured
  if (store.get('autoMount')) {
    await mountDrive();
  }

  // Start sync engine
  syncEngine.start();

  // Create system tray
  createTray();

  // Show window if not running in background
  if (!store.get('startMinimized')) {
    await createWindow();
  }

  // Check for updates
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }
}

async function mountDrive(): Promise<boolean> {
  if (!vfs) {
    log.error('VFS not initialized');
    return false;
  }

  try {
    const driveLetter = store.get('driveLetter') as string;
    await vfs.mount(driveLetter);
    log.info(`Drive ${driveLetter}: mounted successfully`);
    
    // Notify renderer
    mainWindow?.webContents.send('drive-status', { mounted: true, driveLetter });
    
    return true;
  } catch (error) {
    log.error('Failed to mount drive:', error);
    
    dialog.showErrorBox(
      'Mount Failed',
      `Failed to mount Apex Drive: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    
    return false;
  }
}

async function unmountDrive(): Promise<boolean> {
  if (!vfs) {
    return true;
  }

  try {
    await vfs.unmount();
    log.info('Drive unmounted successfully');
    
    // Notify renderer
    mainWindow?.webContents.send('drive-status', { mounted: false });
    
    return true;
  } catch (error) {
    log.error('Failed to unmount drive:', error);
    return false;
  }
}

async function signOut(): Promise<void> {
  await unmountDrive();
  syncEngine?.stop();
  await authManager?.signOut();
  
  // Reset state
  apiClient = null;
  syncEngine = null;
  vfs = null;
  
  // Show login window
  await createWindow();
  mainWindow?.webContents.send('navigate', '/login');
}

// IPC Handlers
function setupIpcHandlers(): void {
  // Authentication
  ipcMain.handle('auth:login', async (_, credentials: { email: string; password: string; serverUrl: string }) => {
    try {
      store.set('serverUrl', credentials.serverUrl);
      
      const tempClient = new ApiClient(credentials.serverUrl);
      const result = await tempClient.login(credentials.email, credentials.password);
      
      await authManager?.saveToken(result.token, result.refreshToken);
      
      // Initialize full app
      apiClient = tempClient;
      apiClient.setToken(result.token);
      
      // Initialize other components
      syncEngine = new SyncEngine(apiClient, configManager!);
      vfs = new ApexDriveVFS(apiClient, syncEngine, configManager!);
      
      if (store.get('autoMount')) {
        await mountDrive();
      }
      
      syncEngine.start();
      createTray();
      
      return { success: true, user: result.user };
    } catch (error) {
      log.error('Login failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Login failed' };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    await signOut();
    return { success: true };
  });

  ipcMain.handle('auth:check', async () => {
    const isAuthenticated = await authManager?.isAuthenticated() ?? false;
    return { authenticated: isAuthenticated };
  });

  // Drive operations
  ipcMain.handle('drive:mount', async () => {
    const result = await mountDrive();
    return { success: result };
  });

  ipcMain.handle('drive:unmount', async () => {
    const result = await unmountDrive();
    return { success: result };
  });

  ipcMain.handle('drive:status', async () => {
    return {
      mounted: vfs?.isMounted() ?? false,
      driveLetter: store.get('driveLetter'),
      connected: apiClient?.isConnected() ?? false,
    };
  });

  ipcMain.handle('drive:open', async () => {
    const driveLetter = store.get('driveLetter') as string;
    if (vfs?.isMounted()) {
      shell.openPath(`${driveLetter}:\\`);
      return { success: true };
    }
    return { success: false, error: 'Drive not mounted' };
  });

  // Settings
  ipcMain.handle('settings:get', async () => {
    return store.store;
  });

  ipcMain.handle('settings:set', async (_, settings: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(settings)) {
      store.set(key, value);
    }
    return { success: true };
  });

  ipcMain.handle('settings:selectCacheDir', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Select Cache Directory',
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      return { path: result.filePaths[0] };
    }
    return { path: null };
  });

  // Sync operations
  ipcMain.handle('sync:now', async () => {
    if (syncEngine) {
      await syncEngine.syncNow();
      return { success: true };
    }
    return { success: false, error: 'Sync engine not initialized' };
  });

  ipcMain.handle('sync:status', async () => {
    return syncEngine?.getStatus() ?? { syncing: false, lastSync: null };
  });

  ipcMain.handle('sync:logs', async (_, limit?: number) => {
    return syncEngine?.getLogs(limit ?? 100) ?? [];
  });

  // Matters
  ipcMain.handle('matters:list', async () => {
    try {
      const matters = await apiClient?.getMatters();
      return { success: true, matters };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch matters' };
    }
  });

  // File operations
  ipcMain.handle('files:list', async (_, matterId: string, folderPath?: string) => {
    try {
      const files = await apiClient?.listFiles(matterId, folderPath);
      return { success: true, files };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list files' };
    }
  });

  // App info
  ipcMain.handle('app:version', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:checkUpdates', async () => {
    if (!isDev) {
      const result = await autoUpdater.checkForUpdates();
      return { updateAvailable: result?.updateInfo?.version !== app.getVersion() };
    }
    return { updateAvailable: false };
  });
}

// App lifecycle
app.whenReady().then(async () => {
  setupIpcHandlers();
  await initializeApp();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep running in system tray on Windows
  if (process.platform !== 'darwin' && !tray) {
    app.quit();
  }
});

app.on('before-quit', async () => {
  app.isQuitting = true;
  await unmountDrive();
  syncEngine?.stop();
});

// Auto-start configuration
if (app.isPackaged) {
  const autoLaunch = store.get('autoStart') as boolean;
  app.setLoginItemSettings({
    openAtLogin: autoLaunch,
    openAsHidden: true,
  });
}

// Extend Electron's App type
declare module 'electron' {
  interface App {
    isQuitting?: boolean;
  }
}
