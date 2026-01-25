const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('apexDrive', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (config) => ipcRenderer.invoke('set-config', config),
  
  // Auth
  login: (email, password, apiUrl) => ipcRenderer.invoke('login', { email, password, apiUrl }),
  logout: () => ipcRenderer.invoke('logout'),
  
  // Sync
  syncNow: () => ipcRenderer.invoke('sync-now'),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  
  // Data
  getMatters: () => ipcRenderer.invoke('get-matters'),
  getDocuments: (matterId) => ipcRenderer.invoke('get-documents', matterId),
  
  // Folders
  openSyncFolder: () => ipcRenderer.invoke('open-sync-folder'),
  openMatterFolder: (matterName) => ipcRenderer.invoke('open-matter-folder', matterName),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  
  // Events
  onSyncStatus: (callback) => ipcRenderer.on('sync-status', (_, data) => callback(data)),
  onSyncError: (callback) => ipcRenderer.on('sync-error', (_, error) => callback(error)),
  onFileSynced: (callback) => ipcRenderer.on('file-synced', (_, file) => callback(file)),
  onNavigate: (callback) => ipcRenderer.on('navigate', (_, page) => callback(page)),
});
