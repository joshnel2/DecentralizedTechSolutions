/**
 * Apex Drive Preload Script
 * 
 * Exposes a secure API to the renderer process.
 * Uses contextBridge to safely expose IPC methods.
 */

import { contextBridge, ipcRenderer } from 'electron';

// Type definitions for the exposed API
export interface ApexDriveAPI {
  // Authentication
  auth: {
    login: (credentials: { email: string; password: string; serverUrl: string }) => Promise<{ success: boolean; user?: any; error?: string }>;
    logout: () => Promise<{ success: boolean }>;
    check: () => Promise<{ authenticated: boolean }>;
  };

  // Drive operations
  drive: {
    mount: () => Promise<{ success: boolean }>;
    unmount: () => Promise<{ success: boolean }>;
    status: () => Promise<{ mounted: boolean; driveLetter: string; connected: boolean }>;
    open: () => Promise<{ success: boolean; error?: string }>;
  };

  // Settings
  settings: {
    get: () => Promise<Record<string, any>>;
    set: (settings: Record<string, any>) => Promise<{ success: boolean }>;
    selectCacheDir: () => Promise<{ path: string | null }>;
  };

  // Sync
  sync: {
    now: () => Promise<{ success: boolean; error?: string }>;
    status: () => Promise<{ syncing: boolean; lastSync: string | null; dirtyFiles?: number }>;
    logs: (limit?: number) => Promise<any[]>;
  };

  // Matters
  matters: {
    list: () => Promise<{ success: boolean; matters?: any[]; error?: string }>;
  };

  // Files
  files: {
    list: (matterId: string, folderPath?: string) => Promise<{ success: boolean; files?: any[]; error?: string }>;
  };

  // App info
  app: {
    version: () => Promise<string>;
    checkUpdates: () => Promise<{ updateAvailable: boolean }>;
  };

  // Events
  on: (channel: string, callback: (...args: any[]) => void) => void;
  off: (channel: string, callback: (...args: any[]) => void) => void;
}

// Create the API object
const apexDriveAPI: ApexDriveAPI = {
  auth: {
    login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
    logout: () => ipcRenderer.invoke('auth:logout'),
    check: () => ipcRenderer.invoke('auth:check'),
  },

  drive: {
    mount: () => ipcRenderer.invoke('drive:mount'),
    unmount: () => ipcRenderer.invoke('drive:unmount'),
    status: () => ipcRenderer.invoke('drive:status'),
    open: () => ipcRenderer.invoke('drive:open'),
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (settings) => ipcRenderer.invoke('settings:set', settings),
    selectCacheDir: () => ipcRenderer.invoke('settings:selectCacheDir'),
  },

  sync: {
    now: () => ipcRenderer.invoke('sync:now'),
    status: () => ipcRenderer.invoke('sync:status'),
    logs: (limit) => ipcRenderer.invoke('sync:logs', limit),
  },

  matters: {
    list: () => ipcRenderer.invoke('matters:list'),
  },

  files: {
    list: (matterId, folderPath) => ipcRenderer.invoke('files:list', matterId, folderPath),
  },

  app: {
    version: () => ipcRenderer.invoke('app:version'),
    checkUpdates: () => ipcRenderer.invoke('app:checkUpdates'),
  },

  on: (channel, callback) => {
    // Whitelist allowed channels
    const validChannels = [
      'drive-status',
      'sync-status',
      'sync-progress',
      'file-changed',
      'conflict-detected',
      'navigate',
      'notification',
      'error',
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => callback(...args));
    }
  },

  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },
};

// Expose the API to the renderer
contextBridge.exposeInMainWorld('apexDrive', apexDriveAPI);

// Expose platform info
contextBridge.exposeInMainWorld('platform', {
  os: process.platform,
  arch: process.arch,
});
