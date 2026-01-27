/**
 * Apex Drive Desktop Client - Main Process
 * 
 * This is the entry point for the Electron application.
 * It manages authentication, file sync, and the system tray.
 */

import { app, BrowserWindow, Menu, Tray, ipcMain, dialog, shell, nativeImage } from 'electron';
import path from 'path';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';

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
let apiClient: ApiClient | null = null;
let syncEngine: SyncEngine | null = null;
let authManager: AuthManager | null = null;
let configManager: ConfigManager | null = null;

// Store for persistent settings
const store = new Store({
  name: 'apex-drive-settings',
  defaults: {
    serverUrl: process.env.APEX_SERVER_URL || 'https://strappedai-gpfra9f8gsg9d9hy.canadacentral-01.azurewebsites.net',
    syncInterval: 30000, // 30 seconds
    cacheDir: '',
    maxCacheSize: 5 * 1024 * 1024 * 1024, // 5GB
  }
});

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: true,
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Load the renderer
  if (isDev) {
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
    if (tray && !(app as any).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray(): void {
  // Create a simple tray icon
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAA7AAAAOwBeShxvQAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAJhSURBVFiF7ZY9aBRBFMd/s3t3l5wfkIgIgoiFFhYWFoKNjY2NjYWFhY2FjY2NjYWNjYWNjYWNjYWNjYWNjYWNhY2NhY2NhYWIIKJBEhLj7nZn5i1uc7t3e3uBiD9Y2H3z5s2b/3/ezAqMMfxPyf8lwL8WgOj1gVpr1ey+gAL6AXkA2esDuqXcXYLOAmxLVwLgAngRjHnkA/gcgJsBO4BlwJVAf0AewKcA3J+5vAhc8QGOB2BvAN4GJo0xY16QfQH1APrAJT/I44DcCmxJCJ1AWdM0SwB8E8B7wGGllF8kfHMkIJ8BZwJ4J4C3Ob8IfAYMG2OOez35HeAEpVQ5gHcJmAzgbSASwHFglT7gtRfkOwCvBHI8IBeCywE8E8CzAq4H8rQPsO5tANL7gVcCeSeADwZwk1LqtHfQbwLLgbyojKn4AJcArxZwNYCXgUsBeD2Q1wN4PpCXAngXiATwVkfurSoANwN4WSm1NID2ATifEIIAfgrgcwF8JICb9DkAfyYQ/ELg7QBuD+CFDlyWlnc9gPcE8IwPsFUAbwfyagAvBvJyAC8qpdYH4A2l1FGllBdkvwJOR1naCuDdIGK2BOAk4IhS6lQAdwq4HsDbwKtewGcdOKaUOhXA+4G8pJS65QX5Grgm1pwEHFBK3QKyAE74AO8CeSWApwN5KZB3O3DOG/IaMKmUuuaFDMAVF+58AG8H8BbgllfkHWC/hxwN4NsqAA8E8DYQDeBlH8i3gbcA3AtwIwRwxkPO+0EGYL8X6DcBPOiDDALbPABvhQA+6IN8FMALHrLuhXwvgFcCOGH+Bf0FBaC/LlVkvkoAAAAASUVORK5CYII='
  );

  tray = new Tray(icon);
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
  const syncStatus = syncEngine?.getStatus();
  const statusText = isConnected 
    ? (syncStatus?.syncing ? 'Syncing...' : 'Connected') 
    : 'Disconnected';

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Apex Drive',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: `Status: ${statusText}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Open Apex Drive',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Sync Now',
      enabled: isConnected,
      click: () => {
        syncEngine?.syncNow();
      },
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send('navigate', '/settings');
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
      label: 'Quit',
      click: () => {
        (app as any).isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

async function initializeApp(): Promise<void> {
  log.info('Initializing Apex Drive...');

  // Initialize config manager
  configManager = new ConfigManager(store as any);

  // Initialize auth manager
  authManager = new AuthManager(store as any);
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
    apiClient.setHttpConnected(true); // Mark HTTP as connected after token verification
    log.info('Token verified successfully - connected to server');
  } catch (error) {
    log.error('Token verification failed:', error);
    await createWindow();
    return;
  }

  // Initialize sync engine
  syncEngine = new SyncEngine(apiClient, configManager);

  // Start sync engine
  syncEngine.start();

  // Create system tray
  createTray();

  // Show main window
  await createWindow();

  // Check for updates
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }
}

async function signOut(): Promise<void> {
  syncEngine?.stop();
  await authManager?.signOut();
  
  // Reset state
  apiClient = null;
  syncEngine = null;
  
  // Show login window
  if (mainWindow) {
    mainWindow.webContents.send('navigate', '/login');
  } else {
    await createWindow();
  }
}

// IPC Handlers
function setupIpcHandlers(): void {
  // Authentication
  ipcMain.handle('auth:login', async (_, credentials: { email: string; password: string; serverUrl: string }) => {
    try {
      store.set('serverUrl', credentials.serverUrl);
      
      const tempClient = new ApiClient(credentials.serverUrl);
      const result = await tempClient.login(credentials.email, credentials.password);
      
      await authManager?.saveToken(result.accessToken, result.refreshToken);
      authManager?.saveUserInfo(result.user);
      
      // Initialize full app
      apiClient = tempClient;
      apiClient.setToken(result.accessToken);
      apiClient.setHttpConnected(true); // Mark HTTP as connected after successful login
      
      // Initialize other components
      syncEngine = new SyncEngine(apiClient, configManager!);
      syncEngine.start();
      
      createTray();
      updateTrayMenu();
      
      log.info('Login successful for user:', result.user.email);
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

  // Drive operations (placeholder for future virtual drive)
  ipcMain.handle('drive:mount', async () => {
    return { success: true, message: 'Virtual drive coming soon - use the file browser in the app' };
  });

  ipcMain.handle('drive:unmount', async () => {
    return { success: true };
  });

  ipcMain.handle('drive:status', async () => {
    return {
      mounted: false,
      driveLetter: 'Z',
      connected: apiClient?.isConnected() ?? false,
    };
  });

  ipcMain.handle('drive:open', async () => {
    // Open the app's file browser
    mainWindow?.show();
    mainWindow?.webContents.send('navigate', '/files');
    return { success: true };
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

  ipcMain.handle('files:download', async (_, documentId: string, fileName: string) => {
    try {
      const content = await apiClient?.downloadFile(documentId);
      if (!content) throw new Error('No content');
      
      // Save to temp and open
      const tempPath = path.join(app.getPath('temp'), fileName);
      const fs = await import('fs/promises');
      await fs.writeFile(tempPath, content);
      
      // Open with default app
      shell.openPath(tempPath);
      
      return { success: true, path: tempPath };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to download file' };
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
  (app as any).isQuitting = true;
  syncEngine?.stop();
});
