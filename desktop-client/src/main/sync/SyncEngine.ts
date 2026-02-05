/**
 * Apex Drive Sync Engine
 * 
 * Handles synchronization status and notifications.
 * Works with HTTP-only backend (no WebSocket required).
 */

import { EventEmitter } from 'events';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';

import { ApiClient } from '../api/ApiClient';
import { ConfigManager } from '../config/ConfigManager';

interface SyncLog {
  id: string;
  timestamp: Date;
  type: 'upload' | 'download' | 'conflict' | 'error' | 'info';
  message: string;
  documentId?: string;
  matterId?: string;
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

  constructor(apiClient: ApiClient, configManager: ConfigManager) {
    super();
    this.apiClient = apiClient;
    this.configManager = configManager;

    // Listen for server-side changes (if WebSocket available)
    this.apiClient.on('fileChanged', () => {
      this.addLog('info', 'File changed on server');
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
   * Check if we have HTTP connectivity to the server
   */
  public isHttpConnected(): boolean {
    return this.httpConnected;
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
      // Try to verify the connection by making an API call
      // This works even without WebSocket
      const matters = await this.apiClient.getMatters();
      
      this.httpConnected = true;
      this.lastSyncTime = new Date();
      this.addLog('info', `Sync completed - ${matters.length} matters available`);
      
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
      dirtyFiles: 0,
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
}
