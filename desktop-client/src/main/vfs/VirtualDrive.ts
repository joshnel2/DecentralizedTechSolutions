/**
 * Apex Drive Virtual Drive
 * 
 * Creates a mapped drive (Z:) that ONLY shows files the user has permission to access.
 * Implements Clio Drive-style two-way sync:
 * - Downloads files from server on mount
 * - Watches for local file changes and uploads them
 * - Creates new versions on every save
 * - Handles conflicts between local and server changes
 * 
 * How it works:
 * 1. Creates a local folder: C:\Users\{user}\ApexDrive
 * 2. Maps it to Z: drive using Windows subst command
 * 3. Syncs ONLY files the user has permission to see (via API)
 * 4. Watches for local changes and uploads them back
 * 5. User sees Z: drive in Explorer with only their permitted files
 */

import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, statSync, readFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { app } from 'electron';
import log from 'electron-log';
import chokidar, { FSWatcher } from 'chokidar';
import crypto from 'crypto';

import { ApiClient, Matter, VirtualFile } from '../api/ApiClient';

const execAsync = promisify(exec);

// Track file state for conflict detection
interface FileState {
  documentId: string;
  matterId: string;
  localHash: string;
  serverHash: string;
  lastModified: number;
  uploading: boolean;
  azurePath?: string;
}

// Pending upload for debouncing
interface PendingUpload {
  filePath: string;
  documentId: string;
  matterId: string;
  timeout: NodeJS.Timeout;
}

export class VirtualDrive extends EventEmitter {
  private apiClient: ApiClient;
  private mounted: boolean = false;
  private driveLetter: string = 'Z';
  private localPath: string;
  private syncInProgress: boolean = false;
  private syncInterval: NodeJS.Timeout | null = null;
  
  // File watcher for two-way sync
  private fileWatcher: FSWatcher | null = null;
  
  // Track file states for sync
  private fileStates: Map<string, FileState> = new Map();
  
  // Pending uploads (debounced)
  private pendingUploads: Map<string, PendingUpload> = new Map();
  
  // Files currently being downloaded (to ignore watcher events)
  private downloadingFiles: Set<string> = new Set();
  
  // Debounce delay for uploads (ms) - Word saves multiple times
  private uploadDebounceMs: number = 2000;

  constructor(apiClient: ApiClient, driveLetter: string = 'Z') {
    super();
    this.apiClient = apiClient;
    this.driveLetter = driveLetter;
    
    // Local folder for synced files
    this.localPath = path.join(app.getPath('userData'), 'ApexDrive');
  }

  /**
   * Check if drive is mounted
   */
  public isMounted(): boolean {
    return this.mounted;
  }

  /**
   * Get the drive letter
   */
  public getDriveLetter(): string {
    return this.driveLetter;
  }

  /**
   * Get the local sync path
   */
  public getLocalPath(): string {
    return this.localPath;
  }

  /**
   * Mount the virtual drive
   */
  public async mount(): Promise<void> {
    if (this.mounted) {
      log.info('Drive already mounted');
      return;
    }

    try {
      log.info(`Mounting Apex Drive to ${this.driveLetter}:`);

      // 1. Create local folder if it doesn't exist
      await fs.mkdir(this.localPath, { recursive: true });
      log.info(`Local folder ready: ${this.localPath}`);

      // 2. Remove any existing mapping for this drive letter
      try {
        await execAsync(`subst ${this.driveLetter}: /d`);
      } catch (e) {
        // Ignore - drive might not be mapped
      }

      // 3. Map the local folder to the drive letter
      await execAsync(`subst ${this.driveLetter}: "${this.localPath}"`);
      log.info(`Drive ${this.driveLetter}: mapped to ${this.localPath}`);

      this.mounted = true;

      // 4. Initial sync - download user's permitted files
      await this.syncFromServer();

      // 5. Start file watcher for two-way sync
      this.startFileWatcher();

      // 6. Start periodic sync (for server-side changes)
      this.startPeriodicSync();

      this.emit('mounted', { driveLetter: this.driveLetter });
      log.info('Apex Drive mounted successfully with two-way sync');

    } catch (error) {
      log.error('Failed to mount drive:', error);
      throw error;
    }
  }

  /**
   * Unmount the virtual drive
   */
  public async unmount(): Promise<void> {
    if (!this.mounted) {
      return;
    }

    try {
      log.info(`Unmounting drive ${this.driveLetter}:`);

      // Stop file watcher
      this.stopFileWatcher();

      // Stop periodic sync
      this.stopPeriodicSync();

      // Clear pending uploads
      for (const pending of this.pendingUploads.values()) {
        clearTimeout(pending.timeout);
      }
      this.pendingUploads.clear();

      // Remove drive mapping
      await execAsync(`subst ${this.driveLetter}: /d`);

      this.mounted = false;
      this.emit('unmounted');
      log.info('Apex Drive unmounted');

    } catch (error) {
      log.error('Failed to unmount drive:', error);
      throw error;
    }
  }

  /**
   * Start watching for local file changes
   */
  private startFileWatcher(): void {
    if (this.fileWatcher) {
      return;
    }

    log.info('Starting file watcher for two-way sync...');

    this.fileWatcher = chokidar.watch(this.localPath, {
      ignored: [
        /(^|[\/\\])\../, // Ignore dot files (.apex-matter, .apex-files, etc.)
        /~\$/,           // Ignore Word temp files (~$)
        /\.tmp$/i,       // Ignore temp files
        /\.bak$/i,       // Ignore backup files
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100
      },
      depth: 10,
    });

    this.fileWatcher
      .on('change', (filePath) => this.handleFileChange(filePath))
      .on('add', (filePath) => this.handleFileAdd(filePath))
      .on('unlink', (filePath) => this.handleFileDelete(filePath))
      .on('error', (error) => log.error('File watcher error:', error));

    log.info('File watcher started');
  }

  /**
   * Stop file watcher
   */
  private stopFileWatcher(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
      log.info('File watcher stopped');
    }
  }

  /**
   * Handle file change (user edited and saved a file)
   */
  private async handleFileChange(filePath: string): Promise<void> {
    // Ignore if we're downloading this file
    if (this.downloadingFiles.has(filePath)) {
      log.debug(`Ignoring change for downloading file: ${filePath}`);
      return;
    }

    // Get file state
    const relativePath = path.relative(this.localPath, filePath);
    const state = this.fileStates.get(relativePath);

    if (!state) {
      log.debug(`No state for changed file: ${relativePath}`);
      return;
    }

    if (state.uploading) {
      log.debug(`File already uploading: ${relativePath}`);
      return;
    }

    log.info(`File changed: ${relativePath}`);

    // Debounce the upload (Word saves multiple times)
    this.scheduleUpload(filePath, state.documentId, state.matterId);
  }

  /**
   * Handle new file added locally
   */
  private async handleFileAdd(filePath: string): Promise<void> {
    // Ignore if we're downloading this file
    if (this.downloadingFiles.has(filePath)) {
      return;
    }

    const relativePath = path.relative(this.localPath, filePath);
    
    // Check if we already have state (it's from initial sync)
    if (this.fileStates.has(relativePath)) {
      return;
    }

    // Skip if it's in a hidden folder
    if (relativePath.includes('.apex-')) {
      return;
    }

    log.info(`New file detected: ${relativePath}`);

    // Try to determine which matter this file belongs to
    const matterInfo = await this.getMatterInfoFromPath(filePath);
    if (!matterInfo) {
      log.warn(`Cannot determine matter for new file: ${relativePath}`);
      this.emit('uploadError', { 
        filePath, 
        error: 'Cannot determine which matter this file belongs to' 
      });
      return;
    }

    // Create the file on the server
    try {
      const fileName = path.basename(filePath);
      const folderPath = this.getFolderPathForMatter(relativePath, matterInfo.matterId);
      
      log.info(`Creating new file on server: ${fileName} in matter ${matterInfo.matterId}`);
      
      const result = await this.apiClient.createFile(
        matterInfo.matterId,
        fileName,
        folderPath
      );

      // Read and upload the content
      const content = await fs.readFile(filePath);
      await this.apiClient.uploadFile(result.documentId, content);

      // Store file state
      const hash = this.computeHash(content);
      this.fileStates.set(relativePath, {
        documentId: result.documentId,
        matterId: matterInfo.matterId,
        localHash: hash,
        serverHash: hash,
        lastModified: Date.now(),
        uploading: false,
        azurePath: result.azurePath,
      });

      log.info(`New file uploaded: ${fileName} (${result.documentId})`);
      this.emit('fileUploaded', { filePath, documentId: result.documentId, isNew: true });

    } catch (error) {
      log.error(`Failed to upload new file: ${relativePath}`, error);
      this.emit('uploadError', { filePath, error: (error as Error).message });
    }
  }

  /**
   * Handle file deleted locally
   */
  private async handleFileDelete(filePath: string): Promise<void> {
    const relativePath = path.relative(this.localPath, filePath);
    const state = this.fileStates.get(relativePath);

    if (!state) {
      return;
    }

    log.info(`File deleted locally: ${relativePath}`);

    // Remove from tracking
    this.fileStates.delete(relativePath);

    // Cancel any pending upload
    const pending = this.pendingUploads.get(filePath);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingUploads.delete(filePath);
    }

    // Optionally delete from server (could prompt user)
    // For now, we just log it - user can delete via web UI
    this.emit('fileDeletedLocally', { filePath, documentId: state.documentId });
  }

  /**
   * Schedule an upload with debouncing
   */
  private scheduleUpload(filePath: string, documentId: string, matterId: string): void {
    // Cancel existing pending upload
    const existing = this.pendingUploads.get(filePath);
    if (existing) {
      clearTimeout(existing.timeout);
    }

    // Schedule new upload
    const timeout = setTimeout(() => {
      this.pendingUploads.delete(filePath);
      this.uploadFile(filePath, documentId, matterId);
    }, this.uploadDebounceMs);

    this.pendingUploads.set(filePath, {
      filePath,
      documentId,
      matterId,
      timeout,
    });
  }

  /**
   * Upload a changed file to the server
   */
  private async uploadFile(filePath: string, documentId: string, matterId: string): Promise<void> {
    const relativePath = path.relative(this.localPath, filePath);
    const state = this.fileStates.get(relativePath);

    if (!state) {
      log.warn(`No state for upload: ${relativePath}`);
      return;
    }

    // Check if file still exists
    if (!existsSync(filePath)) {
      log.warn(`File no longer exists: ${relativePath}`);
      return;
    }

    state.uploading = true;
    this.emit('uploadStarted', { filePath, documentId });

    try {
      // Read file content
      const content = await fs.readFile(filePath);
      const newHash = this.computeHash(content);

      // Check if actually changed
      if (newHash === state.localHash) {
        log.debug(`File unchanged (same hash): ${relativePath}`);
        state.uploading = false;
        return;
      }

      log.info(`Uploading changed file: ${relativePath} (${content.length} bytes)`);

      // Upload to server (this creates a new version)
      const result = await this.apiClient.uploadFile(documentId, content);

      // Update state
      state.localHash = newHash;
      state.serverHash = newHash;
      state.lastModified = Date.now();

      log.info(`Upload complete: ${relativePath}`);
      this.emit('fileUploaded', { 
        filePath, 
        documentId, 
        size: result.size,
        isNew: false 
      });

    } catch (error) {
      log.error(`Upload failed: ${relativePath}`, error);
      this.emit('uploadError', { 
        filePath, 
        documentId, 
        error: (error as Error).message 
      });
    } finally {
      state.uploading = false;
    }
  }

  /**
   * Sync files from server (download)
   */
  public async syncFromServer(): Promise<void> {
    if (this.syncInProgress) {
      log.debug('Sync already in progress');
      return;
    }

    this.syncInProgress = true;
    this.emit('syncStarted');

    try {
      log.info('Syncing files from server...');

      // Get matters with A-Z structure from drive API
      const driveData = await this.apiClient.getDriveMatters();
      log.info(`User has access to ${driveData.totalMatters} matters`);

      if (driveData.totalMatters === 0) {
        log.info('No matters to sync');
        this.emit('syncCompleted', { matterCount: 0, fileCount: 0 });
        return;
      }

      let totalFiles = 0;

      // Use the pre-built A-Z structure from the API
      if (driveData.structure && driveData.structure.length > 0) {
        for (const letterGroup of driveData.structure) {
          const letterPath = path.join(this.localPath, letterGroup.letter);
          await fs.mkdir(letterPath, { recursive: true });
          
          log.info(`Syncing letter ${letterGroup.letter} with ${letterGroup.matters.length} matters`);
          
          // Create matter folders inside each letter
          for (const matter of letterGroup.matters) {
            const fileCount = await this.syncMatterFolder(matter as Matter, letterPath);
            totalFiles += fileCount;
          }
        }
      } else {
        // Fallback: use flat matters list and build structure locally
        const matters = driveData.matters || [];
        const mattersByLetter = new Map<string, Matter[]>();
        
        for (const matter of matters) {
          const clientName = matter.clientName || matter.name || 'Unknown';
          let letter = clientName.charAt(0).toUpperCase();
          if (!/[A-Z]/.test(letter)) {
            letter = '#';
          }
          
          if (!mattersByLetter.has(letter)) {
            mattersByLetter.set(letter, []);
          }
          mattersByLetter.get(letter)!.push(matter);
        }

        for (const [letter, letterMatters] of mattersByLetter) {
          const letterPath = path.join(this.localPath, letter);
          await fs.mkdir(letterPath, { recursive: true });
          
          for (const matter of letterMatters) {
            const fileCount = await this.syncMatterFolder(matter, letterPath);
            totalFiles += fileCount;
          }
        }
      }

      // Clean up removed matters
      await this.cleanupRemovedMatters(driveData.matters || []);

      this.emit('syncCompleted', { 
        matterCount: driveData.totalMatters, 
        fileCount: totalFiles 
      });
      log.info(`Sync completed: ${driveData.totalMatters} matters, ${totalFiles} files`);

    } catch (error) {
      log.error('Sync failed:', error);
      this.emit('syncFailed', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync a matter folder (Clio-style: /A/Anderson - Case 123/)
   */
  private async syncMatterFolder(matter: Matter, letterPath: string): Promise<number> {
    // Use folderName from API if available, otherwise construct it
    const folderName = (matter as any).folderName || 
      `${matter.clientName || 'Unknown'} - ${matter.number ? `${matter.number} ` : ''}${matter.name}`;
    const matterFolderName = this.sanitizeFolderName(folderName);
    const matterPath = path.join(letterPath, matterFolderName);

    try {
      await fs.mkdir(matterPath, { recursive: true });

      // Get files for this matter (API filters by user permissions)
      log.info(`Fetching files for matter ${matter.id} (${matter.name})...`);
      const files = await this.apiClient.listFiles(matter.id);
      log.info(`Matter "${matter.name}" has ${files.length} files`);

      // Download and sync files
      let fileCount = 0;
      for (const file of files) {
        const downloadedCount = await this.syncFile(file, matterPath, matter.id);
        fileCount += downloadedCount;
      }

      // Store matter metadata
      const metaPath = path.join(matterPath, '.apex-matter');
      await fs.writeFile(metaPath, JSON.stringify({ 
        matterId: matter.id, 
        name: matter.name,
        number: matter.number,
        clientName: matter.clientName
      }));
      
      // Hide the metadata file on Windows
      try {
        await execAsync(`attrib +h "${metaPath}"`);
      } catch (e) {
        // Ignore
      }

      return fileCount;

    } catch (error) {
      log.error(`Failed to sync matter ${matter.name}:`, error);
      return 0;
    }
  }

  /**
   * Sync a single file or folder
   */
  private async syncFile(file: VirtualFile, parentPath: string, matterId: string): Promise<number> {
    const filePath = path.join(parentPath, this.sanitizeFolderName(file.name));
    let count = 0;

    try {
      if (file.isFolder) {
        // Create folder
        await fs.mkdir(filePath, { recursive: true });

        // Recursively sync children if present
        if (file.children) {
          for (const child of file.children) {
            count += await this.syncFile(child, filePath, matterId);
          }
        }
      } else {
        // Check if file needs to be downloaded
        const needsDownload = await this.fileNeedsDownload(filePath, file);
        const relativePath = path.relative(this.localPath, filePath);

        if (needsDownload && file.id) {
          // Mark as downloading (to ignore watcher events)
          this.downloadingFiles.add(filePath);

          try {
            // Download file content
            const content = await this.apiClient.downloadFile(file.id);
            await fs.writeFile(filePath, content);
            
            // Compute hash and store state
            const hash = this.computeHash(content);
            this.fileStates.set(relativePath, {
              documentId: file.id,
              matterId,
              localHash: hash,
              serverHash: hash,
              lastModified: Date.now(),
              uploading: false,
              azurePath: file.azurePath,
            });

            log.debug(`Downloaded: ${file.name}`);
            count = 1;
          } catch (downloadError) {
            log.error(`Failed to download ${file.name}:`, downloadError);
          } finally {
            this.downloadingFiles.delete(filePath);
          }
        } else if (file.id) {
          // File exists locally - just update state if not already tracked
          if (!this.fileStates.has(relativePath)) {
            try {
              const content = await fs.readFile(filePath);
              const hash = this.computeHash(content);
              this.fileStates.set(relativePath, {
                documentId: file.id,
                matterId,
                localHash: hash,
                serverHash: hash,
                lastModified: Date.now(),
                uploading: false,
                azurePath: file.azurePath,
              });
            } catch (e) {
              // File might have been deleted
            }
          }
          count = 1;
        }
      }
    } catch (error) {
      log.error(`Failed to sync file ${file.name}:`, error);
    }

    return count;
  }

  /**
   * Check if a file needs to be downloaded
   */
  private async fileNeedsDownload(localPath: string, remoteFile: VirtualFile): Promise<boolean> {
    try {
      const stats = await fs.stat(localPath);
      
      // Compare size
      if (stats.size !== remoteFile.size) {
        return true;
      }

      // Compare modification time if available
      if (remoteFile.updatedAt) {
        const remoteTime = new Date(remoteFile.updatedAt).getTime();
        const localTime = stats.mtime.getTime();
        if (remoteTime > localTime + 1000) { // 1 second tolerance
          return true;
        }
      }

      return false;
    } catch (error) {
      // File doesn't exist locally
      return true;
    }
  }

  /**
   * Get matter info from file path
   */
  private async getMatterInfoFromPath(filePath: string): Promise<{ matterId: string } | null> {
    // Walk up the directory tree to find .apex-matter file
    let currentDir = path.dirname(filePath);
    const maxDepth = 10;
    let depth = 0;

    while (currentDir !== this.localPath && depth < maxDepth) {
      const metaPath = path.join(currentDir, '.apex-matter');
      try {
        const content = await fs.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(content);
        if (meta.matterId) {
          return { matterId: meta.matterId };
        }
      } catch (e) {
        // No metadata file here, go up
      }
      currentDir = path.dirname(currentDir);
      depth++;
    }

    return null;
  }

  /**
   * Get folder path within a matter
   */
  private getFolderPathForMatter(relativePath: string, matterId: string): string {
    // relativePath is like: A/Anderson - Case 123/Discovery/file.docx
    // We need to extract: Discovery
    const parts = relativePath.split(path.sep);
    
    // Skip: Letter folder, Matter folder
    if (parts.length > 3) {
      return parts.slice(2, -1).join('/');
    }
    
    return '';
  }

  /**
   * Compute SHA-256 hash of content
   */
  private computeHash(content: Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Clean up matters the user no longer has access to
   */
  private async cleanupRemovedMatters(currentMatters: Matter[]): Promise<void> {
    try {
      // Build set of current matter IDs
      const currentMatterIds = new Set(currentMatters.map(m => m.id));

      // Check each .apex-matter file
      const letterFolders = await fs.readdir(this.localPath);
      
      for (const letterFolder of letterFolders) {
        if (letterFolder.startsWith('.')) continue;
        
        const letterPath = path.join(this.localPath, letterFolder);
        const stat = await fs.stat(letterPath).catch(() => null);
        if (!stat?.isDirectory()) continue;

        // Check matter folders in this letter
        const matterFolders = await fs.readdir(letterPath);
        
        for (const matterFolder of matterFolders) {
          if (matterFolder.startsWith('.')) continue;
          
          const matterPath = path.join(letterPath, matterFolder);
          const metaPath = path.join(matterPath, '.apex-matter');
          
          try {
            const content = await fs.readFile(metaPath, 'utf-8');
            const meta = JSON.parse(content);
            
            if (meta.matterId && !currentMatterIds.has(meta.matterId)) {
              // User no longer has access to this matter
              log.info(`Removing matter folder (access revoked): ${letterFolder}/${matterFolder}`);
              await fs.rm(matterPath, { recursive: true });
              
              // Remove file states for this matter
              for (const [key, state] of this.fileStates) {
                if (state.matterId === meta.matterId) {
                  this.fileStates.delete(key);
                }
              }
            }
          } catch (e) {
            // No metadata file or invalid JSON
          }
        }

        // Remove empty letter folders
        const remaining = await fs.readdir(letterPath);
        const nonHidden = remaining.filter(f => !f.startsWith('.'));
        if (nonHidden.length === 0) {
          await fs.rm(letterPath, { recursive: true });
          log.info(`Removed empty letter folder: ${letterFolder}`);
        }
      }
    } catch (error) {
      log.error('Failed to cleanup removed matters:', error);
    }
  }

  /**
   * Sanitize folder/file name for Windows
   */
  private sanitizeFolderName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200);
  }

  /**
   * Start periodic sync (for server-side changes)
   */
  private startPeriodicSync(): void {
    if (this.syncInterval) {
      return;
    }

    // Sync every 2 minutes (check for server-side changes)
    this.syncInterval = setInterval(() => {
      this.syncFromServer();
    }, 2 * 60 * 1000);
  }

  /**
   * Stop periodic sync
   */
  private stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Open the drive in Windows Explorer
   */
  public async openInExplorer(): Promise<void> {
    if (!this.mounted) {
      throw new Error('Drive is not mounted');
    }

    try {
      await execAsync(`explorer ${this.driveLetter}:`);
    } catch (error) {
      log.error('Failed to open explorer:', error);
      throw error;
    }
  }

  /**
   * Force refresh - re-sync all files from server
   */
  public async refresh(): Promise<void> {
    await this.syncFromServer();
  }

  /**
   * Get sync statistics
   */
  public getStats(): { 
    trackedFiles: number; 
    pendingUploads: number;
    downloadingFiles: number;
  } {
    return {
      trackedFiles: this.fileStates.size,
      pendingUploads: this.pendingUploads.size,
      downloadingFiles: this.downloadingFiles.size,
    };
  }
}
