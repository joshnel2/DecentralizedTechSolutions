/**
 * Apex Drive Sync Engine
 * 
 * Coordinates synchronization between local files and server.
 * Works with VirtualDrive for two-way sync like Clio Drive.
 */

import { EventEmitter } from 'events';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';

import { ApiClient } from '../api/ApiClient';
import { ConfigManager } from '../config/ConfigManager';

interface SyncLog {
  id: string;
  timestamp: Date;
  type: 'upload' | 'download' | 'conflict' | 'error' | 'info' | 'version';
  message: string;
  documentId?: string;
  matterId?: string;
  fileName?: string;
}

export class SyncEngine extends EventEmitter {
  private apiClient: ApiClient;
  private configManager: ConfigManager;
  
  private running: boolean = false;
  private syncing: boolean = false;
  private syncTimer: NodeJS.Timeout | null = null;
  
  private syncLogs: SyncLog[] = [];
  private maxLogs: number = 1000;
  
  private lastSyncTime: Date | null = null;
  private httpConnected: boolean = false;

  // Stats
  private uploadCount: number = 0;
  private downloadCount: number = 0;
  private errorCount: number = 0;

  constructor(apiClient: ApiClient, configManager: ConfigManager) {
    super();
    this.apiClient = apiClient;
    this.configManager = configManager;

    // Listen for server-side changes (if WebSocket available)
    this.apiClient.on('fileChanged', (data) => {
      this.addLog('info', `File changed on server: ${data?.path || 'unknown'}`, data?.documentId);
      this.emit('serverFileChanged', data);
    });

    this.apiClient.on('syncRequired', () => {
      this.addLog('info', 'Server requested sync');
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

    // Schedule periodic sync check
    const interval = this.configManager.getSyncInterval();
    this.syncTimer = setInterval(() => {
      this.checkConnection();
    }, interval);

    this.addLog('info', 'Sync engine started - two-way sync enabled');
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
   * Check if we have HTTP connectivity to the server
   */
  public isHttpConnected(): boolean {
    return this.httpConnected;
  }

  /**
   * Check connection to server
   */
  private async checkConnection(): Promise<void> {
    try {
      await this.apiClient.getMatters();
      this.httpConnected = true;
    } catch (error) {
      this.httpConnected = false;
      this.addLog('error', 'Lost connection to server');
    }
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
      // Verify connection
      const matters = await this.apiClient.getMatters();
      
      this.httpConnected = true;
      this.lastSyncTime = new Date();
      this.addLog('info', `Connection verified - ${matters.length} matters available`);
      
      this.emit('syncCompleted', { lastSync: this.lastSyncTime, matterCount: matters.length });
    } catch (error) {
      this.httpConnected = false;
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error('Sync failed:', message);
      this.addLog('error', `Sync failed: ${message}`);
      
      this.emit('syncFailed', { error: message });
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Log an upload event
   */
  public logUpload(fileName: string, documentId: string, version?: number): void {
    this.uploadCount++;
    const message = version 
      ? `Uploaded: ${fileName} (version ${version})`
      : `Uploaded: ${fileName}`;
    this.addLog('upload', message, documentId);
  }

  /**
   * Log a download event
   */
  public logDownload(fileName: string, documentId: string): void {
    this.downloadCount++;
    this.addLog('download', `Downloaded: ${fileName}`, documentId);
  }

  /**
   * Log a version creation
   */
  public logVersionCreated(fileName: string, documentId: string, version: number): void {
    this.addLog('version', `New version ${version} created: ${fileName}`, documentId);
  }

  /**
   * Log an error
   */
  public logError(message: string, documentId?: string): void {
    this.errorCount++;
    this.addLog('error', message, documentId);
  }

  /**
   * Log a conflict
   */
  public logConflict(fileName: string, documentId: string): void {
    this.addLog('conflict', `Conflict detected: ${fileName}`, documentId);
  }

  /**
   * Get sync status
   */
  public getStatus(): {
    syncing: boolean;
    lastSync: Date | null;
    running: boolean;
    connected: boolean;
    uploadCount: number;
    downloadCount: number;
    errorCount: number;
  } {
    return {
      syncing: this.syncing,
      lastSync: this.lastSyncTime,
      running: this.running,
      connected: this.httpConnected,
      uploadCount: this.uploadCount,
      downloadCount: this.downloadCount,
      errorCount: this.errorCount,
    };
  }

  /**
   * Get sync logs
   */
  public getLogs(limit: number = 100): SyncLog[] {
    return this.syncLogs.slice(-limit);
  }

  /**
   * Clear sync logs
   */
  public clearLogs(): void {
    this.syncLogs = [];
  }

  /**
   * Reset stats
   */
  public resetStats(): void {
    this.uploadCount = 0;
    this.downloadCount = 0;
    this.errorCount = 0;
  }

  /**
   * Add a log entry
   */
  public addLog(
    type: SyncLog['type'],
    message: string,
    documentId?: string,
    matterId?: string,
    fileName?: string
  ): void {
    const entry: SyncLog = {
      id: uuidv4(),
      timestamp: new Date(),
      type,
      message,
      documentId,
      matterId,
      fileName,
    };

    this.syncLogs.push(entry);

    // Trim logs if needed
    if (this.syncLogs.length > this.maxLogs) {
      this.syncLogs = this.syncLogs.slice(-this.maxLogs);
    }

    this.emit('logAdded', entry);
    
    // Also log to console
    const logLevel = type === 'error' ? 'error' : type === 'conflict' ? 'warn' : 'info';
    log[logLevel](`[SYNC] ${message}`);
  }
}
