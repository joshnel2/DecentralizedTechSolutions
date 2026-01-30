/**
 * Apex Drive Desktop Client - Main Process
 * 
 * This is the entry point for the Electron application.
 * It manages authentication, file sync, and the system tray.
 */

import { app, BrowserWindow, Menu, Tray, ipcMain, dialog, shell, nativeImage, Notification } from 'electron';
import path from 'path';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';

import { ApiClient } from './api/ApiClient';
import { SyncEngine } from './sync/SyncEngine';
import { AuthManager } from './auth/AuthManager';
import { ConfigManager } from './config/ConfigManager';
import { VirtualDrive } from './vfs/VirtualDrive';

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
autoUpdater.logger = log;

// Auto-update state
let updateAvailable = false;
let updateDownloaded = false;
let updateInfo: any = null;
let downloadProgress = 0;

// Global references
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let apiClient: ApiClient | null = null;
let syncEngine: SyncEngine | null = null;
let authManager: AuthManager | null = null;
let configManager: ConfigManager | null = null;
let virtualDrive: VirtualDrive | null = null;

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
  const isMounted = virtualDrive?.isMounted() ?? false;
  const syncStatus = syncEngine?.getStatus();
  const statusText = isConnected 
    ? (syncStatus?.syncing ? 'Syncing...' : 'Connected') 
    : 'Disconnected';
  const driveText = isMounted ? `B: Mounted` : 'Not Mounted';

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
    {
      label: `Drive: ${driveText}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: isMounted ? 'Open B: Drive' : 'Mount B: Drive',
      enabled: isConnected,
      click: async () => {
        if (isMounted) {
          virtualDrive?.openInExplorer();
        } else {
          try {
            await virtualDrive?.mount();
            updateTrayMenu();
          } catch (e) {
            log.error('Failed to mount from tray:', e);
          }
        }
      },
    },
    {
      label: 'Unmount Drive',
      enabled: isMounted,
      visible: isMounted,
      click: async () => {
        try {
          await virtualDrive?.unmount();
          updateTrayMenu();
        } catch (e) {
          log.error('Failed to unmount from tray:', e);
        }
      },
    },
    {
      label: 'Open App Window',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Sync Files',
      enabled: isConnected && isMounted,
      click: async () => {
        syncEngine?.syncNow();
        virtualDrive?.refresh();
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
    // Update menu items
    ...(updateAvailable || updateDownloaded ? [
      { type: 'separator' as const },
      {
        label: updateDownloaded 
          ? `Install Update (v${updateInfo?.version})` 
          : `Download Update (v${updateInfo?.version})`,
        click: async () => {
          if (updateDownloaded) {
            // Install update
            if (virtualDrive?.isMounted()) {
              try {
                await virtualDrive.unmount();
              } catch (e) {
                log.error('Failed to unmount before update:', e);
              }
            }
            autoUpdater.quitAndInstall(false, true);
          } else {
            // Download update
            autoUpdater.downloadUpdate();
            // Show window with settings page
            if (mainWindow) {
              mainWindow.show();
              mainWindow.webContents.send('navigate', '/settings');
            }
          }
        },
      },
    ] : []),
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

  // Set up auto-updater
  setupAutoUpdater();
}

async function signOut(): Promise<void> {
  // Stop sync and unmount drive
  syncEngine?.stop();
  
  // Unmount virtual drive if mounted
  if (virtualDrive?.isMounted()) {
    try {
      await virtualDrive.unmount();
    } catch (e) {
      log.error('Failed to unmount drive during sign out:', e);
    }
  }
  
  await authManager?.signOut();
  
  // Reset state
  apiClient = null;
  syncEngine = null;
  virtualDrive = null;
  
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
      
      // Initialize virtual drive (will be mounted when user clicks Mount)
      virtualDrive = new VirtualDrive(apiClient, 'Z');
      
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

  // Config (read-only app configuration for renderer)
  ipcMain.handle('config:get', async () => {
    return {
      serverUrl: store.get('serverUrl') as string,
    };
  });

  // Drive operations - Mount Z: drive with ONLY user's permitted files
  ipcMain.handle('drive:mount', async () => {
    try {
      if (!apiClient) {
        return { success: false, error: 'Not connected to server' };
      }
      
      if (!virtualDrive) {
        virtualDrive = new VirtualDrive(apiClient, 'Z');
      }
      
      await virtualDrive.mount();
      updateTrayMenu();
      
      return { 
        success: true, 
        driveLetter: virtualDrive.getDriveLetter(),
        message: `Drive ${virtualDrive.getDriveLetter()}: mounted - only showing your permitted files`
      };
    } catch (error) {
      log.error('Failed to mount drive:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to mount drive' };
    }
  });

  ipcMain.handle('drive:unmount', async () => {
    try {
      if (virtualDrive?.isMounted()) {
        await virtualDrive.unmount();
        updateTrayMenu();
      }
      return { success: true };
    } catch (error) {
      log.error('Failed to unmount drive:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to unmount drive' };
    }
  });

  ipcMain.handle('drive:status', async () => {
    return {
      mounted: virtualDrive?.isMounted() ?? false,
      driveLetter: virtualDrive?.getDriveLetter() ?? 'Z',
      connected: apiClient?.isConnected() ?? false,
      localPath: virtualDrive?.getLocalPath() ?? null,
    };
  });

  ipcMain.handle('drive:open', async () => {
    try {
      if (virtualDrive?.isMounted()) {
        // Open Z: drive in Windows Explorer
        await virtualDrive.openInExplorer();
        return { success: true };
      } else {
        // Not mounted - offer to mount first
        return { success: false, error: 'Drive not mounted. Mount the drive first.' };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to open drive' };
    }
  });

  ipcMain.handle('drive:refresh', async () => {
    try {
      if (virtualDrive?.isMounted()) {
        await virtualDrive.refresh();
        return { success: true };
      }
      return { success: false, error: 'Drive not mounted' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to refresh' };
    }
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
    if (isDev) {
      return { updateAvailable: false, currentVersion: app.getVersion() };
    }
    
    try {
      const result = await autoUpdater.checkForUpdates();
      return { 
        updateAvailable: updateAvailable,
        currentVersion: app.getVersion(),
        latestVersion: result?.updateInfo?.version,
        releaseNotes: result?.updateInfo?.releaseNotes,
        releaseDate: result?.updateInfo?.releaseDate,
      };
    } catch (error) {
      log.error('Check updates failed:', error);
      return { 
        updateAvailable: false, 
        currentVersion: app.getVersion(),
        error: error instanceof Error ? error.message : 'Failed to check for updates'
      };
    }
  });

  // Download update
  ipcMain.handle('app:downloadUpdate', async () => {
    if (isDev || !updateAvailable) {
      return { success: false, error: 'No update available' };
    }
    
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      log.error('Download update failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Download failed' };
    }
  });

  // Install update (quit and install)
  ipcMain.handle('app:installUpdate', async () => {
    if (!updateDownloaded) {
      return { success: false, error: 'Update not downloaded yet' };
    }
    
    // Unmount drive before quitting
    if (virtualDrive?.isMounted()) {
      try {
        await virtualDrive.unmount();
      } catch (e) {
        log.error('Failed to unmount before update:', e);
      }
    }
    
    // Quit and install
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  });

  // Get update status
  ipcMain.handle('app:updateStatus', () => {
    return {
      updateAvailable,
      updateDownloaded,
      updateInfo,
      downloadProgress,
      currentVersion: app.getVersion(),
    };
  });
}

/**
 * Set up auto-updater with event handlers
 */
function setupAutoUpdater(): void {
  if (isDev) {
    log.info('Skipping auto-updater in development mode');
    return;
  }

  // Configure auto-updater
  autoUpdater.autoDownload = false; // We'll control when to download
  autoUpdater.autoInstallOnAppQuit = true;

  // Event: Checking for update
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
    mainWindow?.webContents.send('update-status', { 
      status: 'checking',
      message: 'Checking for updates...' 
    });
  });

  // Event: Update available
  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    updateAvailable = true;
    updateInfo = info;
    
    mainWindow?.webContents.send('update-status', { 
      status: 'available',
      message: `Update ${info.version} is available`,
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate,
    });

    // Show notification
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: 'Update Available',
        body: `Apex Drive ${info.version} is available. Click to download.`,
        icon: nativeImage.createFromDataURL(
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAA7AAAAOwBeShxvQAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAJhSURBVFiF7ZY9aBRBFMd/s3t3l5wfkIgIgoiFFhYWFoKNjY2NjYWFhY2FjY2NjYWNjYWNjYWNjYWNjYWNjYWNhY2NhY2NhYWIIKJBEhLj7nZn5i1uc7t3e3uBiD9Y2H3z5s2b/3/ezAqMMfxPyf8lwL8WgOj1gVpr1ey+gAL6AXkA2esDuqXcXYLOAmxLVwLgAngRjHnkA/gcgJsBO4BlwJVAf0AewKcA3J+5vAhc8QGOB2BvAN4GJo0xY16QfQH1APrAJT/I44DcCmxJCJ1AWdM0SwB8E8B7wGGllF8kfHMkIJ8BZwJ4J4C3Ob8IfAYMG2OOez35HeAEpVQ5gHcJmAzgbSASwHFglT7gtRfkOwCvBHI8IBeCywE8E8CzAq4H8rQPsO5tANL7gVcCeSeADwZwk1LqtHfQbwLLgbyojKn4AJcArxZwNYCXgUsBeD2Q1wN4PpCXAngXiATwVkfurSoANwN4WSm1NID2ATifEIIAfgrgcwF8JICb9DkAfyYQ/ELg7QBuD+CFDlyWlnc9gPcE8IwPsFUAbwfyagAvBvJyAC8qpdYH4A2l1FGllBdkvwJOR1naCuDdIGK2BOAk4IhS6lQAdwq4HsDbwKtewGcdOKaUOhXA+4G8pJS65QX5Grgm1pwEHFBK3QKyAE74AO8CeSWApwN5KZB3O3DOG/IaMKmUuuaFDMAVF+58AG8H8BbgllfkHWC/hxwN4NsqAA8E8DYQDeBlH8i3gbcA3AtwIwRwxkPO+0EGYL8X6DcBPOiDDALbPABvhQA+6IN8FMALHrLuhXwvgFcCOGH+Bf0FBaC/LlVkvkoAAAAASUVORK5CYII='
        ),
      });
      
      notification.on('click', () => {
        mainWindow?.show();
        mainWindow?.webContents.send('navigate', '/settings');
      });
      
      notification.show();
    }

    // Update tray menu
    updateTrayMenu();
  });

  // Event: Update not available
  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available, current version is latest');
    updateAvailable = false;
    updateInfo = info;
    
    mainWindow?.webContents.send('update-status', { 
      status: 'up-to-date',
      message: 'You have the latest version',
      version: info.version,
    });
  });

  // Event: Download progress
  autoUpdater.on('download-progress', (progress) => {
    downloadProgress = progress.percent;
    log.info(`Download progress: ${progress.percent.toFixed(1)}%`);
    
    mainWindow?.webContents.send('update-status', { 
      status: 'downloading',
      message: `Downloading update: ${progress.percent.toFixed(0)}%`,
      progress: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  // Event: Update downloaded
  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version);
    updateDownloaded = true;
    downloadProgress = 100;
    
    mainWindow?.webContents.send('update-status', { 
      status: 'ready',
      message: `Update ${info.version} is ready to install`,
      version: info.version,
    });

    // Show notification
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: 'Update Ready',
        body: `Apex Drive ${info.version} is ready. Restart to install.`,
        icon: nativeImage.createFromDataURL(
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAA7AAAAOwBeShxvQAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAJhSURBVFiF7ZY9aBRBFMd/s3t3l5wfkIgIgoiFFhYWFoKNjY2NjYWFhY2FjY2NjYWNjYWNjYWNjYWNjYWNjYWNhY2NhY2NhYWIIKJBEhLj7nZn5i1uc7t3e3uBiD9Y2H3z5s2b/3/ezAqMMfxPyf8lwL8WgOj1gVpr1ey+gAL6AXkA2esDuqXcXYLOAmxLVwLgAngRjHnkA/gcgJsBO4BlwJVAf0AewKcA3J+5vAhc8QGOB2BvAN4GJo0xY16QfQH1APrAJT/I44DcCmxJCJ1AWdM0SwB8E8B7wGGllF8kfHMkIJ8BZwJ4J4C3Ob8IfAYMG2OOez35HeAEpVQ5gHcJmAzgbSASwHFglT7gtRfkOwCvBHI8IBeCywE8E8CzAq4H8rQPsO5tANL7gVcCeSeADwZwk1LqtHfQbwLLgbyojKn4AJcArxZwNYCXgUsBeD2Q1wN4PpCXAngXiATwVkfurSoANwN4WSm1NID2ATifEIIAfgrgcwF8JICb9DkAfyYQ/ELg7QBuD+CFDlyWlnc9gPcE8IwPsFUAbwfyagAvBvJyAC8qpdYH4A2l1FGllBdkvwJOR1naCuDdIGK2BOAk4IhS6lQAdwq4HsDbwKtewGcdOKaUOhXA+4G8pJS65QX5Grgm1pwEHFBK3QKyAE74AO8CeSWApwN5KZB3O3DOG/IaMKmUuuaFDMAVF+58AG8H8BbgllfkHWC/hxwN4NsqAA8E8DYQDeBlH8i3gbcA3AtwIwRwxkPO+0EGYL8X6DcBPOiDDALbPABvhQA+6IN8FMALHrLuhXwvgFcCOGH+Bf0FBaC/LlVkvkoAAAAASUVORK5CYII='
        ),
      });
      
      notification.on('click', () => {
        autoUpdater.quitAndInstall(false, true);
      });
      
      notification.show();
    }

    // Update tray menu
    updateTrayMenu();
  });

  // Event: Error
  autoUpdater.on('error', (error) => {
    log.error('Auto-updater error:', error);
    
    mainWindow?.webContents.send('update-status', { 
      status: 'error',
      message: 'Update check failed',
      error: error.message,
    });
  });

  // Check for updates after a short delay
  setTimeout(() => {
    log.info('Checking for updates...');
    autoUpdater.checkForUpdates().catch(err => {
      log.error('Initial update check failed:', err);
    });
  }, 5000);

  // Check for updates periodically (every 4 hours)
  setInterval(() => {
    log.info('Periodic update check...');
    autoUpdater.checkForUpdates().catch(err => {
      log.error('Periodic update check failed:', err);
    });
  }, 4 * 60 * 60 * 1000);
}

// Protocol handler for apexdrive:// URLs
// This allows the web app to trigger actions in the desktop app
function handleProtocolUrl(url: string): void {
  log.info('Protocol URL received:', url);
  
  try {
    const parsedUrl = new URL(url);
    const action = parsedUrl.hostname || parsedUrl.pathname.replace(/^\/+/, '');
    
    switch (action) {
      case 'open':
        // Open a specific file or folder in the mounted drive
        const filePath = parsedUrl.searchParams.get('path');
        const docId = parsedUrl.searchParams.get('docId');
        
        if (filePath && virtualDrive?.isMounted()) {
          const driveLetter = virtualDrive.getDriveLetter();
          const fullPath = `${driveLetter}:\\${decodeURIComponent(filePath)}`;
          log.info('Opening file in Explorer:', fullPath);
          shell.showItemInFolder(fullPath);
        } else if (virtualDrive?.isMounted()) {
          // Just open the drive root
          virtualDrive.openInExplorer();
        } else {
          // Drive not mounted - show window and prompt to mount
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
        break;
        
      case 'connect':
        // Handle connection token from web app
        const token = parsedUrl.searchParams.get('token');
        const serverUrl = parsedUrl.searchParams.get('server');
        if (token && serverUrl && mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send('connect-with-token', { token, serverUrl });
        }
        break;
        
      case 'sync':
        // Trigger immediate sync
        syncEngine?.syncNow();
        if (virtualDrive?.isMounted()) {
          virtualDrive.refresh();
        }
        break;
        
      case 'show':
        // Show the main window
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
        break;
        
      default:
        log.info('Unknown protocol action:', action);
        // Default: show the window
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
    }
  } catch (error) {
    log.error('Failed to parse protocol URL:', error);
  }
}

// Register protocol handler (single instance lock)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running - quit this one
  app.quit();
} else {
  app.on('second-instance', (_, commandLine) => {
    // Someone tried to run a second instance - focus our window and handle URL
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    
    // Handle protocol URL from command line
    const protocolUrl = commandLine.find(arg => arg.startsWith('apexdrive://'));
    if (protocolUrl) {
      handleProtocolUrl(protocolUrl);
    }
  });
}

// Set as default protocol handler for apexdrive://
if (!isDev) {
  app.setAsDefaultProtocolClient('apexdrive');
}

// Handle protocol URL when app is opened via URL (macOS)
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

// App lifecycle
app.whenReady().then(async () => {
  setupIpcHandlers();
  await initializeApp();

  // Handle protocol URL from initial launch (Windows/Linux)
  const protocolUrl = process.argv.find(arg => arg.startsWith('apexdrive://'));
  if (protocolUrl) {
    // Delay to ensure window is ready
    setTimeout(() => handleProtocolUrl(protocolUrl), 500);
  }

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
