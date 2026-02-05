/**
 * Apex Drive Configuration Manager
 * 
 * Manages application settings and preferences.
 */

import path from 'path';
import { app } from 'electron';
import Store from 'electron-store';
import log from 'electron-log';

export type ConflictStrategy = 'local' | 'server' | 'both' | 'ask';

interface AppConfig {
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

const DEFAULT_CONFIG: AppConfig = {
  driveLetter: 'B',
  autoStart: true,
  autoMount: true,
  startMinimized: false,
  serverUrl: 'https://strappedai-gpfra9f8gsg9d9hy.canadacentral-01.azurewebsites.net',
  syncInterval: 30000, // 30 seconds
  cacheDir: '',
  maxCacheSize: 5 * 1024 * 1024 * 1024, // 5GB
  conflictStrategy: 'ask',
  showNotifications: true,
  logLevel: 'info',
};

export class ConfigManager {
  private store: Store;
  private config: AppConfig;

  constructor(store: Store) {
    this.store = store;
    
    // Load config with defaults
    this.config = {
      ...DEFAULT_CONFIG,
      driveLetter: store.get('driveLetter', DEFAULT_CONFIG.driveLetter) as string,
      autoStart: store.get('autoStart', DEFAULT_CONFIG.autoStart) as boolean,
      autoMount: store.get('autoMount', DEFAULT_CONFIG.autoMount) as boolean,
      startMinimized: store.get('startMinimized', DEFAULT_CONFIG.startMinimized) as boolean,
      serverUrl: store.get('serverUrl', DEFAULT_CONFIG.serverUrl) as string,
      syncInterval: store.get('syncInterval', DEFAULT_CONFIG.syncInterval) as number,
      cacheDir: store.get('cacheDir', '') as string,
      maxCacheSize: store.get('maxCacheSize', DEFAULT_CONFIG.maxCacheSize) as number,
      conflictStrategy: store.get('conflictStrategy', DEFAULT_CONFIG.conflictStrategy) as ConflictStrategy,
      showNotifications: store.get('showNotifications', DEFAULT_CONFIG.showNotifications) as boolean,
      logLevel: store.get('logLevel', DEFAULT_CONFIG.logLevel) as string,
    };

    // Set default cache directory if not specified
    if (!this.config.cacheDir) {
      this.config.cacheDir = path.join(app.getPath('userData'), 'cache');
    }
  }

  /**
   * Get the configured drive letter
   */
  public getDriveLetter(): string {
    return this.config.driveLetter;
  }

  /**
   * Set the drive letter
   */
  public setDriveLetter(letter: string): void {
    const normalized = letter.toUpperCase().charAt(0);
    if (!/[A-Z]/.test(normalized)) {
      throw new Error('Invalid drive letter');
    }
    this.config.driveLetter = normalized;
    this.store.set('driveLetter', normalized);
  }

  /**
   * Get the server URL
   */
  public getServerUrl(): string {
    return this.config.serverUrl;
  }

  /**
   * Set the server URL
   */
  public setServerUrl(url: string): void {
    this.config.serverUrl = url;
    this.store.set('serverUrl', url);
  }

  /**
   * Get the sync interval in milliseconds
   */
  public getSyncInterval(): number {
    return this.config.syncInterval;
  }

  /**
   * Set the sync interval
   */
  public setSyncInterval(ms: number): void {
    if (ms < 5000) {
      throw new Error('Sync interval must be at least 5 seconds');
    }
    this.config.syncInterval = ms;
    this.store.set('syncInterval', ms);
  }

  /**
   * Get the cache directory
   */
  public getCacheDir(): string {
    return this.config.cacheDir;
  }

  /**
   * Set the cache directory
   */
  public setCacheDir(dir: string): void {
    this.config.cacheDir = dir;
    this.store.set('cacheDir', dir);
  }

  /**
   * Get the maximum cache size in bytes
   */
  public getMaxCacheSize(): number {
    return this.config.maxCacheSize;
  }

  /**
   * Set the maximum cache size
   */
  public setMaxCacheSize(bytes: number): void {
    this.config.maxCacheSize = bytes;
    this.store.set('maxCacheSize', bytes);
  }

  /**
   * Get the conflict resolution strategy
   */
  public getConflictStrategy(): ConflictStrategy {
    return this.config.conflictStrategy;
  }

  /**
   * Set the conflict resolution strategy
   */
  public setConflictStrategy(strategy: ConflictStrategy): void {
    this.config.conflictStrategy = strategy;
    this.store.set('conflictStrategy', strategy);
  }

  /**
   * Check if auto-start is enabled
   */
  public isAutoStartEnabled(): boolean {
    return this.config.autoStart;
  }

  /**
   * Set auto-start
   */
  public setAutoStart(enabled: boolean): void {
    this.config.autoStart = enabled;
    this.store.set('autoStart', enabled);
  }

  /**
   * Check if auto-mount is enabled
   */
  public isAutoMountEnabled(): boolean {
    return this.config.autoMount;
  }

  /**
   * Set auto-mount
   */
  public setAutoMount(enabled: boolean): void {
    this.config.autoMount = enabled;
    this.store.set('autoMount', enabled);
  }

  /**
   * Check if start minimized is enabled
   */
  public isStartMinimized(): boolean {
    return this.config.startMinimized;
  }

  /**
   * Set start minimized
   */
  public setStartMinimized(enabled: boolean): void {
    this.config.startMinimized = enabled;
    this.store.set('startMinimized', enabled);
  }

  /**
   * Check if notifications are enabled
   */
  public areNotificationsEnabled(): boolean {
    return this.config.showNotifications;
  }

  /**
   * Set notifications
   */
  public setNotifications(enabled: boolean): void {
    this.config.showNotifications = enabled;
    this.store.set('showNotifications', enabled);
  }

  /**
   * Get all settings
   */
  public getAll(): AppConfig {
    return { ...this.config };
  }

  /**
   * Update multiple settings at once
   */
  public update(settings: Partial<AppConfig>): void {
    for (const [key, value] of Object.entries(settings)) {
      if (key in this.config && value !== undefined) {
        (this.config as any)[key] = value;
        this.store.set(key, value);
      }
    }
  }

  /**
   * Reset to default settings
   */
  public resetToDefaults(): void {
    this.config = { ...DEFAULT_CONFIG };
    for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
      this.store.set(key, value);
    }
  }

  /**
   * Get available drive letters
   */
  public async getAvailableDriveLetters(): Promise<string[]> {
    if (process.platform !== 'win32') {
      return [];
    }

    const { exec } = await import('child_process');
    
    return new Promise((resolve) => {
      exec('wmic logicaldisk get name', (error, stdout) => {
        if (error) {
          log.error('Failed to get drive letters:', error);
          resolve(['X', 'Y', 'Z']);
          return;
        }

        const usedLetters = new Set(
          stdout.split('\n')
            .map(line => line.trim())
            .filter(line => /^[A-Z]:$/.test(line))
            .map(line => line.charAt(0))
        );

        const available: string[] = [];
        // Prefer letters at the end of the alphabet
        for (let i = 90; i >= 68; i--) { // Z to D
          const letter = String.fromCharCode(i);
          if (!usedLetters.has(letter)) {
            available.push(letter);
          }
        }

        resolve(available);
      });
    });
  }
}
