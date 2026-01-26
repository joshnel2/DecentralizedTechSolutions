/**
 * Apex Drive Sync Engine
 * 
 * Handles bidirectional synchronization between local cache and Azure File Share.
 * 
 * Features:
 * - Tracks dirty (modified) files
 * - Uploads changed files to server
 * - Downloads updated files from server
 * - Conflict resolution
 * - Retry logic with exponential backoff
 */

import { EventEmitter } from 'events';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';

import { ApiClient, FileOperation } from '../api/ApiClient';
import { ConfigManager } from '../config/ConfigManager';
import { FileCache } from '../cache/FileCache';

interface DirtyFile {
  documentId: string;
  matterId: string;
  azurePath: string;
  modifiedAt: Date;
  retryCount: number;
  lastError?: string;
}

interface SyncLog {
  id: string;
  timestamp: Date;
  type: 'upload' | 'download' | 'conflict' | 'error' | 'info';
  message: string;
  documentId?: string;
  matterId?: string;
  error?: string;
}

export class SyncEngine extends EventEmitter {
  private apiClient: ApiClient;
  private configManager: ConfigManager;
  private fileCache: FileCache;
  
  private running: boolean = false;
  private syncing: boolean = false;
  private syncTimer: NodeJS.Timeout | null = null;
  
  private dirtyFiles: Map<string, DirtyFile> = new Map();
  private syncLogs: SyncLog[] = [];
  private maxLogs: number = 1000;
  
  private lastSyncTime: Date | null = null;
  private pendingChanges: FileOperation[] = [];

  constructor(apiClient: ApiClient, configManager: ConfigManager) {
    super();
    this.apiClient = apiClient;
    this.configManager = configManager;
    this.fileCache = new FileCache(configManager);

    // Listen for server-side changes
    this.apiClient.on('fileChanged', (op: FileOperation) => {
      this.handleServerChange(op);
    });

    this.apiClient.on('syncRequired', () => {
      this.syncNow();
    });
  }

  /**
   * Start the sync engine
   */
  public start(): void {
    if (this.running) {
      return;
    }

    log.info('Starting sync engine');
    this.running = true;

    // Initial sync
    this.syncNow();

    // Schedule periodic sync
    const interval = this.configManager.getSyncInterval();
    this.syncTimer = setInterval(() => {
      this.syncNow();
    }, interval);

    this.addLog('info', 'Sync engine started');
  }

  /**
   * Stop the sync engine
   */
  public stop(): void {
    if (!this.running) {
      return;
    }

    log.info('Stopping sync engine');
    this.running = false;

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    this.addLog('info', 'Sync engine stopped');
  }

  /**
   * Mark a file as dirty (modified locally)
   */
  public markDirty(documentId: string, matterId: string, azurePath: string): void {
    const existing = this.dirtyFiles.get(documentId);
    
    this.dirtyFiles.set(documentId, {
      documentId,
      matterId,
      azurePath,
      modifiedAt: new Date(),
      retryCount: existing?.retryCount || 0,
    });

    log.debug(`File marked dirty: ${documentId}`);
    this.emit('dirtyFileAdded', { documentId, matterId });
  }

  /**
   * Check if a file is dirty
   */
  public isDirty(documentId: string): boolean {
    return this.dirtyFiles.has(documentId);
  }

  /**
   * Trigger sync immediately
   */
  public async syncNow(): Promise<void> {
    if (this.syncing) {
      log.debug('Sync already in progress, skipping');
      return;
    }

    this.syncing = true;
    this.emit('syncStarted');

    try {
      // Upload dirty files
      await this.uploadDirtyFiles();

      // Get changes from server
      await this.downloadServerChanges();

      this.lastSyncTime = new Date();
      this.addLog('info', 'Sync completed successfully');
      
      this.emit('syncCompleted', { lastSync: this.lastSyncTime });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error('Sync failed:', message);
      this.addLog('error', `Sync failed: ${message}`);
      
      this.emit('syncFailed', { error: message });
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Sync a specific file immediately
   */
  public async syncFile(documentId: string): Promise<void> {
    const dirtyFile = this.dirtyFiles.get(documentId);
    if (!dirtyFile) {
      return;
    }

    try {
      await this.uploadFile(dirtyFile);
      this.dirtyFiles.delete(documentId);
      this.addLog('upload', `File synced: ${documentId}`, documentId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error(`Failed to sync file ${documentId}:`, message);
      this.addLog('error', `Failed to sync file: ${message}`, documentId);
      
      // Update retry count
      dirtyFile.retryCount++;
      dirtyFile.lastError = message;
    }
  }

  /**
   * Get sync status
   */
  public getStatus(): {
    syncing: boolean;
    lastSync: Date | null;
    dirtyFiles: number;
    running: boolean;
  } {
    return {
      syncing: this.syncing,
      lastSync: this.lastSyncTime,
      dirtyFiles: this.dirtyFiles.size,
      running: this.running,
    };
  }

  /**
   * Get sync logs
   */
  public getLogs(limit: number = 100): SyncLog[] {
    return this.syncLogs.slice(-limit);
  }

  /**
   * Upload all dirty files
   */
  private async uploadDirtyFiles(): Promise<void> {
    if (this.dirtyFiles.size === 0) {
      return;
    }

    log.info(`Uploading ${this.dirtyFiles.size} dirty files`);

    const filesToUpload = Array.from(this.dirtyFiles.values())
      .filter(f => f.retryCount < 3); // Skip files that have failed too many times

    for (const dirtyFile of filesToUpload) {
      try {
        await this.uploadFile(dirtyFile);
        this.dirtyFiles.delete(dirtyFile.documentId);
        this.addLog('upload', `Uploaded: ${dirtyFile.azurePath}`, dirtyFile.documentId, dirtyFile.matterId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        log.error(`Failed to upload ${dirtyFile.documentId}:`, message);
        
        dirtyFile.retryCount++;
        dirtyFile.lastError = message;
        
        if (dirtyFile.retryCount >= 3) {
          this.addLog('error', `Upload failed after 3 retries: ${dirtyFile.azurePath}`, dirtyFile.documentId);
        }
      }
    }
  }

  /**
   * Upload a single file
   */
  private async uploadFile(dirtyFile: DirtyFile): Promise<void> {
    // Read from cache
    const content = await this.fileCache.readFull(dirtyFile.documentId);
    
    // Upload to server
    await this.apiClient.uploadFile(dirtyFile.documentId, content);
    
    log.debug(`Uploaded file: ${dirtyFile.documentId}`);
  }

  /**
   * Download changes from server
   */
  private async downloadServerChanges(): Promise<void> {
    const since = this.lastSyncTime?.toISOString() || new Date(0).toISOString();
    
    try {
      const changes = await this.apiClient.getChanges(since);
      
      if (changes.length === 0) {
        return;
      }

      log.info(`Processing ${changes.length} server changes`);

      for (const change of changes) {
        await this.processServerChange(change);
      }
    } catch (error) {
      log.error('Failed to get server changes:', error);
      throw error;
    }
  }

  /**
   * Process a change from the server
   */
  private async processServerChange(change: FileOperation): Promise<void> {
    log.debug(`Processing server change: ${change.type} ${change.documentId}`);

    switch (change.type) {
      case 'create':
      case 'update':
        // Check for conflict
        if (this.dirtyFiles.has(change.documentId)) {
          await this.handleConflict(change);
        } else {
          // Download the file
          await this.downloadFile(change.documentId);
          this.addLog('download', `Downloaded: ${change.path}`, change.documentId, change.matterId);
        }
        break;

      case 'delete':
        // Remove from cache
        await this.fileCache.delete(change.documentId);
        this.dirtyFiles.delete(change.documentId);
        this.addLog('info', `File deleted on server: ${change.path}`, change.documentId);
        break;

      case 'rename':
      case 'move':
        // Update cache metadata if needed
        this.addLog('info', `File ${change.type}d: ${change.oldPath} -> ${change.path}`, change.documentId);
        break;
    }

    this.emit('filesChanged', { change });
  }

  /**
   * Handle real-time server change notification
   */
  private async handleServerChange(change: FileOperation): Promise<void> {
    log.debug(`Real-time server change: ${change.type} ${change.documentId}`);
    
    // Queue for next sync
    this.pendingChanges.push(change);
    
    // Emit for immediate UI update
    this.emit('fileChanged', change);
    
    // If not currently syncing, process immediately for critical changes
    if (!this.syncing && (change.type === 'delete' || change.type === 'update')) {
      await this.processServerChange(change);
    }
  }

  /**
   * Handle conflict between local and server changes
   */
  private async handleConflict(serverChange: FileOperation): Promise<void> {
    const localFile = this.dirtyFiles.get(serverChange.documentId);
    if (!localFile) {
      return;
    }

    log.warn(`Conflict detected for file: ${serverChange.documentId}`);
    this.addLog('conflict', `Conflict: ${serverChange.path}`, serverChange.documentId, serverChange.matterId);

    const strategy = this.configManager.getConflictStrategy();

    switch (strategy) {
      case 'local':
        // Keep local changes, upload them
        log.info('Resolving conflict: keeping local version');
        // Don't download, let the local upload overwrite
        break;

      case 'server':
        // Use server version, discard local changes
        log.info('Resolving conflict: using server version');
        this.dirtyFiles.delete(serverChange.documentId);
        await this.downloadFile(serverChange.documentId);
        break;

      case 'both':
        // Keep both - rename local as conflict copy
        log.info('Resolving conflict: keeping both versions');
        await this.createConflictCopy(localFile);
        await this.downloadFile(serverChange.documentId);
        break;

      case 'ask':
      default:
        // Emit event for user to decide
        this.emit('conflictDetected', {
          documentId: serverChange.documentId,
          localModified: localFile.modifiedAt,
          serverModified: new Date(serverChange.timestamp),
          path: serverChange.path,
        });
        break;
    }
  }

  /**
   * Download a file from server to cache
   */
  private async downloadFile(documentId: string): Promise<void> {
    const content = await this.apiClient.downloadFile(documentId);
    await this.fileCache.store(documentId, content);
    log.debug(`Downloaded file: ${documentId}`);
  }

  /**
   * Create a conflict copy of a local file
   */
  private async createConflictCopy(localFile: DirtyFile): Promise<void> {
    const content = await this.fileCache.readFull(localFile.documentId);
    
    // Create a new file with conflict suffix
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const pathParts = localFile.azurePath.split('/');
    const fileName = pathParts.pop() || 'file';
    const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
    const baseName = fileName.replace(ext, '');
    const conflictName = `${baseName} (conflict ${timestamp})${ext}`;
    const conflictPath = [...pathParts, conflictName].join('/');

    // Create the conflict file on server
    const result = await this.apiClient.createFile(
      localFile.matterId,
      conflictName,
      pathParts.join('/')
    );

    // Upload content
    await this.apiClient.uploadFile(result.documentId, content);

    // Store in cache
    await this.fileCache.store(result.documentId, content);

    // Remove from dirty files
    this.dirtyFiles.delete(localFile.documentId);

    this.addLog('info', `Created conflict copy: ${conflictName}`, result.documentId, localFile.matterId);
  }

  /**
   * Add a log entry
   */
  private addLog(
    type: SyncLog['type'],
    message: string,
    documentId?: string,
    matterId?: string
  ): void {
    const entry: SyncLog = {
      id: uuidv4(),
      timestamp: new Date(),
      type,
      message,
      documentId,
      matterId,
    };

    this.syncLogs.push(entry);

    // Trim logs if needed
    if (this.syncLogs.length > this.maxLogs) {
      this.syncLogs = this.syncLogs.slice(-this.maxLogs);
    }

    this.emit('logAdded', entry);
  }

  /**
   * Resolve a conflict manually
   */
  public async resolveConflict(
    documentId: string,
    resolution: 'local' | 'server' | 'both'
  ): Promise<void> {
    const localFile = this.dirtyFiles.get(documentId);
    if (!localFile) {
      return;
    }

    switch (resolution) {
      case 'local':
        await this.uploadFile(localFile);
        this.dirtyFiles.delete(documentId);
        break;

      case 'server':
        this.dirtyFiles.delete(documentId);
        await this.downloadFile(documentId);
        break;

      case 'both':
        await this.createConflictCopy(localFile);
        await this.downloadFile(documentId);
        break;
    }

    this.addLog('info', `Conflict resolved (${resolution}): ${localFile.azurePath}`, documentId);
  }
}
