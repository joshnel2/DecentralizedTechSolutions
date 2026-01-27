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
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { app } from 'electron';
import log from 'electron-log';

import { ApiClient, Matter, VirtualFile } from '../api/ApiClient';

const execAsync = promisify(exec);

export class VirtualDrive extends EventEmitter {
  private apiClient: ApiClient;
  private mounted: boolean = false;
  private driveLetter: string = 'B';
  private localPath: string;
  private syncInProgress: boolean = false;
  private syncInterval: NodeJS.Timeout | null = null;

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
      await this.syncFiles();

      // 5. Start periodic sync
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

      // Stop periodic sync
      this.stopPeriodicSync();

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

      // Get matters the user has access to (API filters by permissions)
      const matters = await this.apiClient.getMatters();
      log.info(`User has access to ${matters.length} matters`);

      // Create Matters folder
      const mattersPath = path.join(this.localPath, 'Matters');
      await fs.mkdir(mattersPath, { recursive: true });

      // Sync each matter's files
      for (const matter of matters) {
        await this.syncMatter(matter, mattersPath);
      }

      // Clean up matters user no longer has access to
      await this.cleanupRemovedMatters(matters, mattersPath);

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
   * Sync a single matter's files
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
          // Download file content
          try {
            const content = await this.apiClient.downloadFile(file.id);
            await fs.writeFile(filePath, content);
            log.debug(`Downloaded: ${file.name}`);
          } catch (downloadError) {
            log.error(`Failed to download ${file.name}:`, downloadError);
          }
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
   * Clean up matters the user no longer has access to
   */
  private async cleanupRemovedMatters(currentMatters: Matter[], mattersPath: string): Promise<void> {
    try {
      const existingFolders = await fs.readdir(mattersPath);
      const currentMatterNames = new Set(
        currentMatters.map(m => this.sanitizeFolderName(
          m.number ? `${m.number} - ${m.name}` : m.name
        ))
      );

      for (const folder of existingFolders) {
        if (!currentMatterNames.has(folder)) {
          // User no longer has access to this matter - remove it
          const folderPath = path.join(mattersPath, folder);
          try {
            await fs.rm(folderPath, { recursive: true });
            log.info(`Removed matter folder (no longer accessible): ${folder}`);
          } catch (e) {
            log.error(`Failed to remove folder ${folder}:`, e);
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
   * Force refresh - re-sync all files
   */
  public async refresh(): Promise<void> {
    await this.syncFiles();
  }
}
