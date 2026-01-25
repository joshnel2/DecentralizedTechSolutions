const { app, BrowserWindow, ipcMain, Tray, Menu, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const { SyncManager } = require('./sync');
const { ApiClient } = require('./api');

// Initialize store for settings
const store = new Store({
  name: 'apex-drive-config',
  defaults: {
    syncFolder: path.join(app.getPath('documents'), 'Apex Drive'),
    apiUrl: '',
    autoSync: true,
    syncInterval: 5, // minutes
  }
});

let mainWindow = null;
let tray = null;
let syncManager = null;
let apiClient = null;
let isLoggedIn = false;

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 600,
    minHeight: 500,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  
  // Create a simple tray icon if file doesn't exist
  let trayIcon;
  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
  } else {
    // Create a simple colored icon
    trayIcon = nativeImage.createEmpty();
  }
  
  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADVSURBVDiNpZMxDoJAEEW/EBfwBNzAAxh7Ei9gLCy8gAewMNZeQRODhYWVMRYUJhYWJhYW/IJkCQuLm0wy2dn/5s/sDAD8Q4IAAO+91lqP4ziPqipSSgIA5xzGGIQQICJorTdKqZW19plSKu+6bqG1HgFAFEVwzqGqKhRFgbIs0ff9g4iW3vutc+5ljDkT0RIAkiRBXdcAgDzPMR6P0TQNqqpC0zSYzWaYz+eQUnrvPZxzKIoCSZKAiLC/oy7DMLyY+a2U2njvIYSAMQbW2vtPPuEH2T1e37H6l7wAAAAASUVORK5CYII=') : trayIcon);
  
  tray.setToolTip('Apex Drive');
  
  updateTrayMenu();
  
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

function updateTrayMenu() {
  const syncFolder = store.get('syncFolder');
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Open Apex Drive', 
      click: () => mainWindow?.show() 
    },
    { 
      label: 'Open Sync Folder', 
      click: () => shell.openPath(syncFolder)
    },
    { type: 'separator' },
    { 
      label: isLoggedIn ? 'Sync Now' : 'Login Required',
      enabled: isLoggedIn,
      click: () => syncManager?.syncAll()
    },
    { 
      label: syncManager?.isSyncing ? 'Syncing...' : 'Sync Status: Idle',
      enabled: false 
    },
    { type: 'separator' },
    { 
      label: 'Settings', 
      click: () => {
        mainWindow?.show();
        mainWindow?.webContents.send('navigate', 'settings');
      }
    },
    { type: 'separator' },
    { 
      label: 'Quit Apex Drive', 
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray?.setContextMenu(contextMenu);
}

// IPC Handlers
ipcMain.handle('get-config', () => {
  return {
    syncFolder: store.get('syncFolder'),
    apiUrl: store.get('apiUrl'),
    autoSync: store.get('autoSync'),
    syncInterval: store.get('syncInterval'),
    isLoggedIn,
  };
});

ipcMain.handle('set-config', (event, config) => {
  if (config.syncFolder) store.set('syncFolder', config.syncFolder);
  if (config.apiUrl) store.set('apiUrl', config.apiUrl);
  if (config.autoSync !== undefined) store.set('autoSync', config.autoSync);
  if (config.syncInterval) store.set('syncInterval', config.syncInterval);
  return true;
});

ipcMain.handle('login', async (event, { email, password, apiUrl }) => {
  try {
    store.set('apiUrl', apiUrl);
    apiClient = new ApiClient(apiUrl);
    
    const result = await apiClient.login(email, password);
    
    if (result.success) {
      isLoggedIn = true;
      
      // Initialize sync manager
      syncManager = new SyncManager(apiClient, store.get('syncFolder'));
      
      // Set up sync events
      syncManager.on('sync-start', () => {
        mainWindow?.webContents.send('sync-status', { syncing: true });
        updateTrayMenu();
      });
      
      syncManager.on('sync-complete', (stats) => {
        mainWindow?.webContents.send('sync-status', { syncing: false, stats });
        updateTrayMenu();
      });
      
      syncManager.on('sync-error', (error) => {
        mainWindow?.webContents.send('sync-error', error.message);
        updateTrayMenu();
      });
      
      syncManager.on('file-synced', (file) => {
        mainWindow?.webContents.send('file-synced', file);
      });
      
      // Start initial sync
      await syncManager.syncAll();
      
      // Start auto-sync if enabled
      if (store.get('autoSync')) {
        syncManager.startAutoSync(store.get('syncInterval') * 60 * 1000);
      }
      
      updateTrayMenu();
      
      return { success: true, user: result.user };
    }
    
    return { success: false, error: result.error };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('logout', async () => {
  isLoggedIn = false;
  if (syncManager) {
    syncManager.stopAutoSync();
    syncManager = null;
  }
  if (apiClient) {
    apiClient.logout();
    apiClient = null;
  }
  updateTrayMenu();
  return true;
});

ipcMain.handle('sync-now', async () => {
  if (syncManager) {
    await syncManager.syncAll();
    return true;
  }
  return false;
});

ipcMain.handle('get-sync-status', () => {
  if (!syncManager) return { syncing: false, lastSync: null, stats: null };
  return {
    syncing: syncManager.isSyncing,
    lastSync: syncManager.lastSync,
    stats: syncManager.lastStats,
  };
});

ipcMain.handle('get-matters', async () => {
  if (!apiClient) return [];
  return await apiClient.getMatters();
});

ipcMain.handle('get-documents', async (event, matterId) => {
  if (!apiClient) return [];
  return await apiClient.getMatterDocuments(matterId);
});

ipcMain.handle('open-sync-folder', () => {
  shell.openPath(store.get('syncFolder'));
});

ipcMain.handle('open-matter-folder', (event, matterName) => {
  const syncFolder = store.get('syncFolder');
  const matterFolder = path.join(syncFolder, 'Matters', matterName.replace(/[<>:"/\\|?*]/g, '_'));
  if (fs.existsSync(matterFolder)) {
    shell.openPath(matterFolder);
  } else {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Folder Not Found',
      message: 'This matter folder has not been synced yet. Click "Sync Now" to download documents.'
    });
  }
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Sync Folder'
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  createTray();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Don't quit on Windows/Linux, minimize to tray
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
