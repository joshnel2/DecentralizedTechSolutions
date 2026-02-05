/**
 * Shared types for Apex Drive Desktop Client
 */

// User and authentication
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  firmId: string;
  firmName: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  serverUrl: string;
}

export interface AuthResult {
  success: boolean;
  token?: string;
  refreshToken?: string;
  user?: User;
  expiresIn?: number;
  error?: string;
}

// Matters
export interface Matter {
  id: string;
  name: string;
  number: string | null;
  description: string | null;
  status: string;
  clientId: string;
  clientName: string;
  createdAt: string;
  updatedAt: string | null;
}

// Files and folders
export interface VirtualFile {
  id: string;
  name: string;
  path: string;
  azurePath?: string;
  size: number;
  type: string;
  isFolder: boolean;
  matterId?: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string | null;
  children?: VirtualFile[];
}

export interface VirtualFolder {
  id: string;
  name: string;
  path: string;
  matterId: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

// File operations
export interface FileOperation {
  type: 'create' | 'update' | 'delete' | 'rename' | 'move';
  documentId: string;
  matterId: string;
  path: string;
  oldPath?: string;
  timestamp: string;
}

// Sync
export interface SyncStatus {
  syncing: boolean;
  lastSync: Date | null;
  dirtyFiles: number;
  running: boolean;
}

export interface SyncLog {
  id: string;
  timestamp: Date;
  type: 'upload' | 'download' | 'conflict' | 'error' | 'info';
  message: string;
  documentId?: string;
  matterId?: string;
  error?: string;
}

export interface ConflictInfo {
  documentId: string;
  localModified: Date;
  serverModified: Date;
  path: string;
}

// Drive status
export interface DriveStatus {
  mounted: boolean;
  driveLetter: string;
  connected: boolean;
}

// Settings
export type ConflictStrategy = 'local' | 'server' | 'both' | 'ask';

export interface AppSettings {
  driveLetter: string;
  autoStart: boolean;
  autoMount: boolean;
  startMinimized: boolean;
  serverUrl: string;
  syncInterval: number;
  cacheDir: string;
  maxCacheSize: number;
  conflictStrategy: ConflictStrategy;
  showNotifications: boolean;
  logLevel: string;
}

// Cache
export interface CacheEntry {
  documentId: string;
  size: number;
  hash: string;
  lastAccessed: number;
  dirty: boolean;
}

export interface CacheInfo {
  used: number;
  max: number;
  count: number;
}

// VFS entries
export interface VFSEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  attributes: number;
  matterId?: string;
  documentId?: string;
  azurePath?: string;
}

export interface VFSDirectory extends VFSEntry {
  isDirectory: true;
  children: Map<string, VFSEntry>;
}

export interface VFSFile extends VFSEntry {
  isDirectory: false;
  documentId: string;
  azurePath: string;
  cached: boolean;
  cachePath?: string;
}

// API responses
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateFileResponse {
  documentId: string;
  azurePath: string;
  name: string;
}

// Desktop client registration
export interface DesktopClientInfo {
  deviceName: string;
  platform: string;
  version: string;
}

// IPC channel types
export type IpcChannel =
  | 'auth:login'
  | 'auth:logout'
  | 'auth:check'
  | 'drive:mount'
  | 'drive:unmount'
  | 'drive:status'
  | 'drive:open'
  | 'settings:get'
  | 'settings:set'
  | 'settings:selectCacheDir'
  | 'sync:now'
  | 'sync:status'
  | 'sync:logs'
  | 'matters:list'
  | 'files:list'
  | 'app:version'
  | 'app:checkUpdates';

// Event channel types
export type EventChannel =
  | 'drive-status'
  | 'sync-status'
  | 'sync-progress'
  | 'file-changed'
  | 'conflict-detected'
  | 'navigate'
  | 'notification'
  | 'error';
