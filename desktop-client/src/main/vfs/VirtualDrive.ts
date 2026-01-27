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
