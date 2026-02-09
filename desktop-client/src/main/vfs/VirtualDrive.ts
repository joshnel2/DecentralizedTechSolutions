/**
 * Apex Drive Virtual Drive
 * 
 * Creates a mapped drive (B:) that ONLY shows files the user has permission to access.
 * Uses local sync folder + drive mapping - no special drivers needed.
 * 
 * How it works:
 * 1. Creates a local folder: C:\Users\{user}\ApexDrive
 * 2. Maps it to B: drive using Windows subst command
 * 3. Syncs ONLY files the user has permission to see (via API)
 * 4. User sees B: drive in Explorer with only their permitted files
 */

import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { app } from 'electron';
import log from 'electron-log';
import chokidar from 'chokidar';

import { ApiClient, Matter, VirtualFile } from '../api/ApiClient';

const execAsync = promisify(exec);

export class VirtualDrive extends EventEmitter {
  private apiClient: ApiClient;
  private mounted: boolean = false;
  private driveLetter: string = 'B';
  private localPath: string;
  private syncInProgress: boolean = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private fileWatcher: chokidar.FSWatcher | null = null;
  private uploadQueue: Map<string, NodeJS.Timeout> = new Map(); // debounce uploads

  constructor(apiClient: ApiClient, driveLetter: string = 'B') {
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

      // 2. Mount based on platform
      if (process.platform === 'win32') {
        // Windows: use subst command to map drive letter
        try {
          await execAsync(`subst ${this.driveLetter}: /d`);
        } catch (e) {
          // Ignore - drive might not be mapped
        }
        await execAsync(`subst ${this.driveLetter}: "${this.localPath}"`);
        log.info(`Drive ${this.driveLetter}: mapped to ${this.localPath}`);
      } else if (process.platform === 'darwin') {
        // macOS: create a symlink in /Volumes for Finder visibility
        const volumePath = `/Volumes/Apex Drive`;
        try {
          await fs.unlink(volumePath);
        } catch (e) {
          // Ignore - symlink might not exist
        }
        try {
          await fs.symlink(this.localPath, volumePath);
          log.info(`Symlink created: ${volumePath} -> ${this.localPath}`);
        } catch (e) {
          // If /Volumes symlink fails (permissions), just use the local folder directly
          log.info(`Could not create /Volumes symlink, using local folder: ${this.localPath}`);
        }
      } else {
        // Linux: just use the local folder
        log.info(`Using local folder for drive: ${this.localPath}`);
      }

      this.mounted = true;

      // 3. Initial sync - download user's permitted files
      await this.syncFiles();

      // 4. Start watching for local file changes (upload back to server)
      this.startFileWatcher();

      // 5. Start periodic sync (download from server)
      this.startPeriodicSync();

      this.emit('mounted', { driveLetter: this.driveLetter });
      log.info('Apex Drive mounted successfully');

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

      // Remove drive mapping based on platform
      if (process.platform === 'win32') {
        await execAsync(`subst ${this.driveLetter}: /d`);
      } else if (process.platform === 'darwin') {
        try {
          await fs.unlink(`/Volumes/Apex Drive`);
        } catch (e) {
          // Ignore
        }
      }

      this.mounted = false;
      this.emit('unmounted');
      log.info('Apex Drive unmounted');

    } catch (error) {
      log.error('Failed to unmount drive:', error);
      throw error;
    }
  }

  /**
   * Sync files from server - ONLY files user has permission to see
   */
  public async syncFiles(): Promise<void> {
    if (this.syncInProgress) {
      log.debug('Sync already in progress');
      return;
    }

    this.syncInProgress = true;
    this.emit('syncStarted');

    try {
      log.info('Syncing files (only user-permitted files)...');

      // Get matters with A-Z structure from drive API
      const driveData = await this.apiClient.getDriveMatters();
      log.info(`User has access to ${driveData.totalMatters} matters`);

      // Use the pre-built A-Z structure from the API
      if (driveData.structure && driveData.structure.length > 0) {
        for (const letterGroup of driveData.structure) {
          const letterPath = path.join(this.localPath, letterGroup.letter);
          await fs.mkdir(letterPath, { recursive: true });
          
          log.info(`Syncing letter ${letterGroup.letter} with ${letterGroup.matters.length} matters`);
          
          // Create matter folders inside each letter
          for (const matter of letterGroup.matters) {
            await this.syncMatterInLetter(matter as Matter, letterPath);
          }
        }
      } else {
        // Fallback: use flat matters list and build structure locally
        // Group by first letter of MATTER NAME (Clio-style)
        const matters = driveData.matters || [];
        const mattersByLetter = new Map<string, Matter[]>();
        
        for (const matter of matters) {
          // Use first letter of matter name, not client name
          const matterName = matter.name || 'Unknown';
          let letter = matterName.charAt(0).toUpperCase();
          if (!/[A-Z]/.test(letter)) {
            letter = '#'; // Numbers and special chars go to # folder
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
            await this.syncMatterInLetter(matter, letterPath);
          }
        }
      }

      // Clean up removed matters
      await this.cleanupRemovedMatters(driveData.matters || [], this.localPath);

      this.emit('syncCompleted');
      log.info('File sync completed');

    } catch (error) {
      log.error('Sync failed:', error);
      this.emit('syncFailed', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync a matter inside a letter folder (Clio-style: /A/Anderson - Case 123/)
   */
  private async syncMatterInLetter(matter: Matter, letterPath: string): Promise<void> {
    // Use folderName from API if available, otherwise construct it
    const folderName = (matter as any).folderName || 
      `${matter.clientName || 'Unknown'} - ${matter.number ? `${matter.number} ` : ''}${matter.name}`;
    const matterFolderName = this.sanitizeFolderName(folderName);
    const matterPath = path.join(letterPath, matterFolderName);

    try {
      await fs.mkdir(matterPath, { recursive: true });
      log.info(`Created matter folder: ${matterFolderName}`);

      // Get files for this matter (API filters by user permissions)
      log.info(`Fetching files for matter ${matter.id} (${matter.name})...`);
      const files = await this.apiClient.listFiles(matter.id);
      log.info(`Matter "${matter.name}" (${matter.id}) has ${files.length} files`);

      if (files.length === 0) {
        log.info(`No files found for matter "${matter.name}" - folder will be empty`);
      }

      // Create subfolders and files
      for (const file of files) {
        log.debug(`Syncing file: ${file.name} (isFolder: ${file.isFolder})`);
        await this.syncFile(file, matterPath, matter.id);
      }

      // Store matter ID mapping
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

    } catch (error) {
      log.error(`Failed to sync matter ${matter.name}:`, error);
    }
  }

  /**
   * Sync a single matter's files (fallback flat structure)
   */
  private async syncMatter(matter: Matter, mattersPath: string): Promise<void> {
    // Create matter folder with client name prefix if available
    const matterFolderName = this.sanitizeFolderName(
      matter.number 
        ? `${matter.number} - ${matter.name}`
        : matter.name
    );
    const matterPath = path.join(mattersPath, matterFolderName);

    try {
      await fs.mkdir(matterPath, { recursive: true });

      // Get files for this matter (API filters by user permissions)
      const files = await this.apiClient.listFiles(matter.id);

      // Create subfolders and files
      for (const file of files) {
        await this.syncFile(file, matterPath, matter.id);
      }

      // Store matter ID mapping
      const metaPath = path.join(matterPath, '.apex-matter');
      await fs.writeFile(metaPath, JSON.stringify({ matterId: matter.id, name: matter.name }));
      // Hide the metadata file on Windows
      try {
        await execAsync(`attrib +h "${metaPath}"`);
      } catch (e) {
        // Ignore
      }

    } catch (error) {
      log.error(`Failed to sync matter ${matter.name}:`, error);
    }
  }

  /**
   * Sync a single file or folder
   */
  private async syncFile(file: VirtualFile, parentPath: string, matterId: string): Promise<void> {
    const filePath = path.join(parentPath, this.sanitizeFolderName(file.name));

    try {
      if (file.isFolder) {
        // Create folder
        await fs.mkdir(filePath, { recursive: true });

        // Recursively sync children if present
        if (file.children) {
          for (const child of file.children) {
            await this.syncFile(child, filePath, matterId);
          }
        }
      } else {
        // Check if file needs to be downloaded
        const needsDownload = await this.fileNeedsDownload(filePath, file);

        if (needsDownload && file.id) {
          // Download file content - pass Azure path for direct Azure files
          try {
            const content = await this.apiClient.downloadFile(file.id, file.azurePath);
            await fs.writeFile(filePath, content);
            log.info(`Downloaded: ${file.name} (${content.length} bytes)`);
          } catch (downloadError) {
            log.error(`Failed to download ${file.name}:`, downloadError);
          }
        } else if (!needsDownload) {
          log.debug(`Skipping ${file.name} - already up to date`);
        }

        // Store file metadata
        const metaDir = path.join(parentPath, '.apex-files');
        await fs.mkdir(metaDir, { recursive: true });
        const metaPath = path.join(metaDir, `${this.sanitizeFolderName(file.name)}.json`);
        await fs.writeFile(metaPath, JSON.stringify({
          id: file.id,
          matterId,
          azurePath: file.azurePath,
          size: file.size,
          updatedAt: file.updatedAt,
        }));
        try {
          await execAsync(`attrib +h "${metaDir}"`);
        } catch (e) {
          // Ignore
        }
      }
    } catch (error) {
      log.error(`Failed to sync file ${file.name}:`, error);
    }
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
        if (remoteTime > localTime) {
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
   * Clean up matters the user no longer has access to (handles A-Z structure)
   */
  private async cleanupRemovedMatters(currentMatters: Matter[], basePath: string): Promise<void> {
    try {
      // Build set of current matter folder names (including client name)
      const currentMatterFolders = new Set(
        currentMatters.map(m => {
          const clientName = m.clientName || 'Unknown Client';
          const matterName = m.number ? `${m.number} ${m.name}` : m.name;
          return this.sanitizeFolderName(`${clientName} - ${matterName}`);
        })
      );

      // Get the first letter for each matter (based on matter name, not client)
      const currentLetters = new Set(
        currentMatters.map(m => {
          const matterName = m.name || 'Unknown';
          let letter = matterName.charAt(0).toUpperCase();
          return /[A-Z]/.test(letter) ? letter : '#';
        })
      );

      // Iterate through letter folders
      const existingFolders = await fs.readdir(basePath);
      
      for (const folder of existingFolders) {
        // Skip hidden files
        if (folder.startsWith('.')) continue;
        
        const folderPath = path.join(basePath, folder);
        const stat = await fs.stat(folderPath).catch(() => null);
        if (!stat?.isDirectory()) continue;

        // Check if this is a letter folder (A-Z or #)
        if (folder.length === 1 && (/[A-Z#]/.test(folder))) {
          if (!currentLetters.has(folder)) {
            // No matters for this letter anymore - remove entire letter folder
            try {
              await fs.rm(folderPath, { recursive: true });
              log.info(`Removed letter folder (no matters): ${folder}`);
            } catch (e) {
              log.error(`Failed to remove letter folder ${folder}:`, e);
            }
          } else {
            // Letter folder still needed - check individual matter folders inside
            const matterFolders = await fs.readdir(folderPath);
            for (const matterFolder of matterFolders) {
              if (matterFolder.startsWith('.')) continue;
              
              if (!currentMatterFolders.has(matterFolder)) {
                const matterPath = path.join(folderPath, matterFolder);
                try {
                  await fs.rm(matterPath, { recursive: true });
                  log.info(`Removed matter folder (no longer accessible): ${folder}/${matterFolder}`);
                } catch (e) {
                  log.error(`Failed to remove matter folder ${matterFolder}:`, e);
                }
              }
            }
          }
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
    // Remove/replace characters not allowed in Windows file names
    return name
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200); // Max reasonable length
  }

  /**
   * Start periodic sync
   */
  private startPeriodicSync(): void {
    if (this.syncInterval) {
      return;
    }

    // Sync every 5 minutes
    this.syncInterval = setInterval(() => {
      this.syncFiles();
    }, 5 * 60 * 1000);
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

  // =============================================
  // FILE WATCHER - Detects saves from Word/etc and uploads to server
  // =============================================

  /**
   * Start watching the local sync folder for file changes.
   * When a user saves a file from Word/Excel/etc., chokidar detects it
   * and uploads it to the server via the API.
   */
  private startFileWatcher(): void {
    if (this.fileWatcher) {
      return;
    }

    log.info('Starting file watcher for local changes...');

    this.fileWatcher = chokidar.watch(this.localPath, {
      ignoreInitial: true, // Don't fire for existing files
      ignored: [
        /(^|[\/\\])\../, // Ignore dotfiles (.apex-matter, .apex-files, etc.)
        /~\$/, // Ignore Word temp files (~$document.docx)
        /\.tmp$/i, // Ignore .tmp files
        /\.lock$/i, // Ignore lock files
      ],
      awaitWriteFinish: {
        stabilityThreshold: 2000, // Wait 2s after last write before firing
        pollInterval: 500,
      },
      persistent: true,
    });

    // File added or modified
    this.fileWatcher.on('add', (filePath: string) => {
      this.handleLocalFileChange(filePath, 'add');
    });
    this.fileWatcher.on('change', (filePath: string) => {
      this.handleLocalFileChange(filePath, 'change');
    });

    this.fileWatcher.on('error', (error: Error) => {
      log.error('File watcher error:', error);
    });

    log.info('File watcher started');
  }

  /**
   * Stop the file watcher
   */
  private stopFileWatcher(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
      log.info('File watcher stopped');
    }

    // Clear any pending upload timers
    for (const timer of this.uploadQueue.values()) {
      clearTimeout(timer);
    }
    this.uploadQueue.clear();
  }

  /**
   * Handle a local file change - debounce and upload to server
   */
  private handleLocalFileChange(filePath: string, eventType: 'add' | 'change'): void {
    // Get relative path from sync folder
    const relativePath = path.relative(this.localPath, filePath);
    const fileName = path.basename(filePath);

    // Skip metadata files
    if (fileName.startsWith('.apex-') || fileName.startsWith('~$')) {
      return;
    }

    log.info(`[FileWatcher] ${eventType}: ${relativePath}`);

    // Debounce: Word saves multiple times rapidly, wait for it to finish
    if (this.uploadQueue.has(filePath)) {
      clearTimeout(this.uploadQueue.get(filePath)!);
    }

    const timer = setTimeout(async () => {
      this.uploadQueue.delete(filePath);
      await this.uploadLocalFile(filePath, relativePath);
    }, 3000); // Wait 3 seconds after last change

    this.uploadQueue.set(filePath, timer);
  }

  /**
   * Upload a locally changed file to the server
   */
  private async uploadLocalFile(filePath: string, relativePath: string): Promise<void> {
    try {
      // Read file content
      const content = await fs.readFile(filePath);
      if (content.length === 0) {
        log.debug(`Skipping empty file: ${relativePath}`);
        return;
      }

      // Determine the matter this file belongs to by checking parent folders for .apex-matter
      const matterId = await this.findMatterIdForPath(filePath);
      const fileName = path.basename(filePath);

      // Check if we have metadata for this file (it was downloaded from server)
      const metaDir = path.join(path.dirname(filePath), '.apex-files');
      const metaPath = path.join(metaDir, `${this.sanitizeFolderName(fileName)}.json`);
      
      let existingDocId: string | null = null;
      try {
        const metaRaw = await fs.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(metaRaw);
        existingDocId = meta.id;
      } catch {
        // No metadata - this is a new file
      }

      if (existingDocId) {
        // Existing file was modified - upload updated content
        log.info(`Uploading modified file: ${fileName} (doc: ${existingDocId})`);
        await this.apiClient.uploadFile(existingDocId, content);
        this.emit('fileUploaded', { fileName, documentId: existingDocId, type: 'update' });
        log.info(`Successfully uploaded update for: ${fileName}`);
      } else {
        // New file - create document on server
        if (matterId) {
          log.info(`Uploading new file: ${fileName} to matter ${matterId}`);
          const result = await this.apiClient.createFile(matterId, fileName, relativePath);
          
          // Upload the content
          if (result.documentId) {
            await this.apiClient.uploadFile(result.documentId, content);
            
            // Save metadata for future updates
            await fs.mkdir(metaDir, { recursive: true });
            await fs.writeFile(metaPath, JSON.stringify({
              id: result.documentId,
              matterId,
              azurePath: result.azurePath,
              size: content.length,
              updatedAt: new Date().toISOString(),
            }));
            try {
              if (process.platform === 'win32') {
                await execAsync(`attrib +h "${metaDir}"`);
              }
            } catch {}
            
            this.emit('fileUploaded', { fileName, documentId: result.documentId, type: 'create' });
            log.info(`Successfully uploaded new file: ${fileName}`);
          }
        } else {
          // No matter ID - upload as personal document
          log.info(`Uploading personal file: ${fileName}`);
          try {
            const result = await this.apiClient.createFile('', fileName, relativePath);
            if (result.documentId) {
              await this.apiClient.uploadFile(result.documentId, content);
              
              await fs.mkdir(metaDir, { recursive: true });
              await fs.writeFile(metaPath, JSON.stringify({
                id: result.documentId,
                size: content.length,
                updatedAt: new Date().toISOString(),
              }));
              
              this.emit('fileUploaded', { fileName, documentId: result.documentId, type: 'create' });
              log.info(`Successfully uploaded personal file: ${fileName}`);
            }
          } catch (uploadErr) {
            log.error(`Failed to upload personal file ${fileName}:`, uploadErr);
          }
        }
      }
    } catch (error) {
      log.error(`Failed to upload ${relativePath}:`, error);
      this.emit('uploadFailed', { path: relativePath, error: (error as Error).message });
    }
  }

  /**
   * Walk up the directory tree to find a .apex-matter file and extract the matter ID
   */
  private async findMatterIdForPath(filePath: string): Promise<string | null> {
    let currentDir = path.dirname(filePath);
    
    // Walk up directories until we find .apex-matter or hit the sync root
    while (currentDir.startsWith(this.localPath) && currentDir !== this.localPath) {
      const metaPath = path.join(currentDir, '.apex-matter');
      try {
        const metaRaw = await fs.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(metaRaw);
        return meta.matterId || null;
      } catch {
        // No metadata at this level, go up
      }
      currentDir = path.dirname(currentDir);
    }
    
    return null;
  }

  /**
   * Open the drive in file explorer (cross-platform)
   */
  public async openInExplorer(): Promise<void> {
    if (!this.mounted) {
      throw new Error('Drive is not mounted');
    }

    try {
      if (process.platform === 'win32') {
        await execAsync(`explorer ${this.driveLetter}:`);
      } else if (process.platform === 'darwin') {
        const volumePath = `/Volumes/Apex Drive`;
        const openPath = existsSync(volumePath) ? volumePath : this.localPath;
        await execAsync(`open "${openPath}"`);
      } else {
        await execAsync(`xdg-open "${this.localPath}"`);
      }
    } catch (error) {
      log.error('Failed to open explorer:', error);
      throw error;
    }
  }

  /**
   * Force refresh - re-sync all files
   */
  public async refresh(): Promise<void> {
    await this.syncFiles();
  }
}
