/**
 * Apex Drive File Cache
 * 
 * Manages local file caching for fast access.
 * 
 * Features:
 * - LRU eviction when cache is full
 * - Partial file reads
 * - Atomic writes
 * - Cache integrity verification
 */

import fs from 'fs/promises';
import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import log from 'electron-log';

import { ConfigManager } from '../config/ConfigManager';

interface CacheEntry {
  documentId: string;
  size: number;
  hash: string;
  lastAccessed: number;
  dirty: boolean;
}

interface CacheMetadata {
  version: number;
  entries: Record<string, CacheEntry>;
  totalSize: number;
}

const CACHE_VERSION = 1;
const METADATA_FILE = 'cache-metadata.json';

export class FileCache {
  private configManager: ConfigManager;
  private cacheDir: string;
  private metadata: CacheMetadata;
  private metadataDirty: boolean = false;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
    this.cacheDir = configManager.getCacheDir();
    
    // Ensure cache directory exists
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }

    // Load or initialize metadata
    this.metadata = this.loadMetadata();
  }

  /**
   * Check if a file is cached
   */
  public isCached(documentId: string): boolean {
    return documentId in this.metadata.entries;
  }

  /**
   * Get the cache path for a document
   */
  public getCachePath(documentId: string): string {
    // Use hash of documentId to distribute files
    const hash = crypto.createHash('md5').update(documentId).digest('hex');
    const subDir = hash.substring(0, 2);
    return path.join(this.cacheDir, subDir, documentId);
  }

  /**
   * Store a file in the cache
   */
  public async store(documentId: string, content: Buffer): Promise<void> {
    const cachePath = this.getCachePath(documentId);
    const cacheSubDir = path.dirname(cachePath);

    // Ensure subdirectory exists
    await fs.mkdir(cacheSubDir, { recursive: true });

    // Calculate hash
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    // Check if we need to evict files
    await this.ensureSpace(content.length);

    // Write to temp file first (atomic write)
    const tempPath = `${cachePath}.tmp`;
    await fs.writeFile(tempPath, content);
    await fs.rename(tempPath, cachePath);

    // Update metadata
    const existingEntry = this.metadata.entries[documentId];
    if (existingEntry) {
      this.metadata.totalSize -= existingEntry.size;
    }

    this.metadata.entries[documentId] = {
      documentId,
      size: content.length,
      hash,
      lastAccessed: Date.now(),
      dirty: false,
    };
    this.metadata.totalSize += content.length;

    this.scheduleSaveMetadata();
    log.debug(`Cached file: ${documentId} (${content.length} bytes)`);
  }

  /**
   * Create an empty cached file
   */
  public async createEmpty(documentId: string): Promise<void> {
    await this.store(documentId, Buffer.alloc(0));
  }

  /**
   * Read a portion of a cached file
   */
  public async read(documentId: string, offset: number, length: number): Promise<Buffer> {
    const entry = this.metadata.entries[documentId];
    if (!entry) {
      throw new Error(`File not in cache: ${documentId}`);
    }

    const cachePath = this.getCachePath(documentId);
    
    // Update access time
    entry.lastAccessed = Date.now();
    this.scheduleSaveMetadata();

    // Read the requested portion
    const fileHandle = await fs.open(cachePath, 'r');
    try {
      const buffer = Buffer.alloc(Math.min(length, entry.size - offset));
      await fileHandle.read(buffer, 0, buffer.length, offset);
      return buffer;
    } finally {
      await fileHandle.close();
    }
  }

  /**
   * Read the full cached file
   */
  public async readFull(documentId: string): Promise<Buffer> {
    const entry = this.metadata.entries[documentId];
    if (!entry) {
      throw new Error(`File not in cache: ${documentId}`);
    }

    const cachePath = this.getCachePath(documentId);
    
    // Update access time
    entry.lastAccessed = Date.now();
    this.scheduleSaveMetadata();

    return fs.readFile(cachePath);
  }

  /**
   * Write to a cached file
   */
  public async write(documentId: string, data: Buffer, offset: number): Promise<number> {
    const entry = this.metadata.entries[documentId];
    if (!entry) {
      throw new Error(`File not in cache: ${documentId}`);
    }

    const cachePath = this.getCachePath(documentId);

    // Open for writing
    const fileHandle = await fs.open(cachePath, 'r+');
    try {
      await fileHandle.write(data, 0, data.length, offset);
      
      // Update size if we wrote beyond the current end
      const newSize = Math.max(entry.size, offset + data.length);
      if (newSize > entry.size) {
        this.metadata.totalSize += (newSize - entry.size);
        entry.size = newSize;
      }
      
      entry.lastAccessed = Date.now();
      entry.dirty = true;
      
      this.scheduleSaveMetadata();
      
      return data.length;
    } finally {
      await fileHandle.close();
    }
  }

  /**
   * Delete a file from the cache
   */
  public async delete(documentId: string): Promise<void> {
    const entry = this.metadata.entries[documentId];
    if (!entry) {
      return;
    }

    const cachePath = this.getCachePath(documentId);

    try {
      await fs.unlink(cachePath);
    } catch {
      // File might not exist
    }

    this.metadata.totalSize -= entry.size;
    delete this.metadata.entries[documentId];
    this.scheduleSaveMetadata();
    
    log.debug(`Removed from cache: ${documentId}`);
  }

  /**
   * Get cache size info
   */
  public getCacheInfo(): { used: number; max: number; count: number } {
    return {
      used: this.metadata.totalSize,
      max: this.configManager.getMaxCacheSize(),
      count: Object.keys(this.metadata.entries).length,
    };
  }

  /**
   * Clear the entire cache
   */
  public async clear(): Promise<void> {
    for (const documentId of Object.keys(this.metadata.entries)) {
      await this.delete(documentId);
    }
    
    this.metadata = {
      version: CACHE_VERSION,
      entries: {},
      totalSize: 0,
    };
    
    await this.saveMetadata();
    log.info('Cache cleared');
  }

  /**
   * Verify cache integrity
   */
  public async verify(): Promise<{ valid: number; invalid: number; missing: number }> {
    const result = { valid: 0, invalid: 0, missing: 0 };

    for (const [documentId, entry] of Object.entries(this.metadata.entries)) {
      const cachePath = this.getCachePath(documentId);

      try {
        const content = await fs.readFile(cachePath);
        const hash = crypto.createHash('sha256').update(content).digest('hex');

        if (hash === entry.hash) {
          result.valid++;
        } else {
          result.invalid++;
          // Remove invalid entry
          delete this.metadata.entries[documentId];
          this.metadata.totalSize -= entry.size;
        }
      } catch {
        result.missing++;
        // Remove missing entry
        delete this.metadata.entries[documentId];
        this.metadata.totalSize -= entry.size;
      }
    }

    await this.saveMetadata();
    return result;
  }

  /**
   * Ensure there's enough space for a new file
   */
  private async ensureSpace(requiredBytes: number): Promise<void> {
    const maxSize = this.configManager.getMaxCacheSize();
    
    while (this.metadata.totalSize + requiredBytes > maxSize) {
      // Find least recently used entry
      const entries = Object.values(this.metadata.entries)
        .filter(e => !e.dirty) // Don't evict dirty files
        .sort((a, b) => a.lastAccessed - b.lastAccessed);

      if (entries.length === 0) {
        // All files are dirty or cache is empty
        break;
      }

      // Evict oldest entry
      const oldest = entries[0];
      await this.delete(oldest.documentId);
      log.debug(`Evicted from cache: ${oldest.documentId}`);
    }
  }

  /**
   * Load metadata from disk
   */
  private loadMetadata(): CacheMetadata {
    const metadataPath = path.join(this.cacheDir, METADATA_FILE);

    try {
      const data = require('fs').readFileSync(metadataPath, 'utf8');
      const metadata = JSON.parse(data) as CacheMetadata;
      
      if (metadata.version !== CACHE_VERSION) {
        log.info('Cache version mismatch, resetting cache');
        return this.createEmptyMetadata();
      }
      
      log.info(`Loaded cache metadata: ${Object.keys(metadata.entries).length} entries`);
      return metadata;
    } catch {
      return this.createEmptyMetadata();
    }
  }

  /**
   * Create empty metadata
   */
  private createEmptyMetadata(): CacheMetadata {
    return {
      version: CACHE_VERSION,
      entries: {},
      totalSize: 0,
    };
  }

  /**
   * Schedule metadata save (debounced)
   */
  private scheduleSaveMetadata(): void {
    this.metadataDirty = true;
    
    if (this.saveTimer) {
      return;
    }

    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      if (this.metadataDirty) {
        await this.saveMetadata();
      }
    }, 5000);
  }

  /**
   * Save metadata to disk
   */
  private async saveMetadata(): Promise<void> {
    const metadataPath = path.join(this.cacheDir, METADATA_FILE);
    const tempPath = `${metadataPath}.tmp`;

    try {
      await fs.writeFile(tempPath, JSON.stringify(this.metadata, null, 2));
      await fs.rename(tempPath, metadataPath);
      this.metadataDirty = false;
    } catch (error) {
      log.error('Failed to save cache metadata:', error);
    }
  }
}
