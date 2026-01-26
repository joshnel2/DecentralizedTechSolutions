/**
 * Apex Drive Virtual File System
 * 
 * Creates a virtual drive that shows only matters the user has access to.
 * Uses Windows native APIs through a child process to create the virtual drive.
 * 
 * Architecture:
 * - Virtual root shows matter folders (filtered by user permissions)
 * - Each matter folder shows its documents and subfolders
 * - File operations are proxied to Azure File Share via the API
 * - Local cache provides fast access to recently used files
 */

import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';
import { spawn, ChildProcess } from 'child_process';
import log from 'electron-log';

import { ApiClient, VirtualFile, VirtualFolder, Matter } from '../api/ApiClient';
import { SyncEngine } from '../sync/SyncEngine';
import { ConfigManager } from '../config/ConfigManager';
import { FileCache } from '../cache/FileCache';

// Virtual file system entry types
interface VFSEntry {
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

interface VFSDirectory extends VFSEntry {
  isDirectory: true;
  children: Map<string, VFSEntry>;
}

interface VFSFile extends VFSEntry {
  isDirectory: false;
  documentId: string;
  azurePath: string;
  cached: boolean;
  cachePath?: string;
}

export class ApexDriveVFS extends EventEmitter {
  private apiClient: ApiClient;
  private syncEngine: SyncEngine;
  private configManager: ConfigManager;
  private fileCache: FileCache;
  
  private mounted: boolean = false;
  private driveLetter: string = 'Z';
  private vfsProcess: ChildProcess | null = null;
  
  // In-memory file system tree
  private root: VFSDirectory;
  private matters: Map<string, Matter> = new Map();
  private pathToEntry: Map<string, VFSEntry> = new Map();
  
  // Open file handles
  private openHandles: Map<number, { path: string; mode: string; position: number }> = new Map();
  private nextHandle: number = 1;

  constructor(apiClient: ApiClient, syncEngine: SyncEngine, configManager: ConfigManager) {
    super();
    this.apiClient = apiClient;
    this.syncEngine = syncEngine;
    this.configManager = configManager;
    this.fileCache = new FileCache(configManager);
    
    // Initialize empty root
    this.root = {
      name: '',
      isDirectory: true,
      size: 0,
      created: new Date(),
      modified: new Date(),
      accessed: new Date(),
      attributes: 0x10, // FILE_ATTRIBUTE_DIRECTORY
      children: new Map(),
    };
    
    // Listen for sync events
    this.syncEngine.on('filesChanged', () => this.refreshFileTree());
    this.syncEngine.on('matterChanged', (matterId: string) => this.refreshMatter(matterId));
  }

  public isMounted(): boolean {
    return this.mounted;
  }

  /**
   * Mount the virtual drive
   */
  public async mount(driveLetter: string): Promise<void> {
    if (this.mounted) {
      throw new Error('Drive is already mounted');
    }

    this.driveLetter = driveLetter.toUpperCase();
    log.info(`Mounting Apex Drive at ${this.driveLetter}:`);

    // Load matters and build initial file tree
    await this.refreshFileTree();

    // Start the VFS driver process
    await this.startVFSDriver();

    this.mounted = true;
    this.emit('mounted', { driveLetter: this.driveLetter });
  }

  /**
   * Unmount the virtual drive
   */
  public async unmount(): Promise<void> {
    if (!this.mounted) {
      return;
    }

    log.info('Unmounting Apex Drive...');

    // Stop the VFS driver process
    await this.stopVFSDriver();

    this.mounted = false;
    this.emit('unmounted');
  }

  /**
   * Refresh the entire file tree from the server
   */
  public async refreshFileTree(): Promise<void> {
    log.info('Refreshing file tree...');
    
    try {
      // Get all matters the user has access to
      const mattersResponse = await this.apiClient.getMatters();
      this.matters.clear();
      
      // Clear and rebuild root
      this.root.children.clear();
      this.pathToEntry.clear();
      this.pathToEntry.set('\\', this.root);

      // Add each matter as a folder
      for (const matter of mattersResponse) {
        this.matters.set(matter.id, matter);
        
        const matterFolder: VFSDirectory = {
          name: this.sanitizeFolderName(`${matter.number || matter.id} - ${matter.name}`),
          isDirectory: true,
          size: 0,
          created: new Date(matter.createdAt),
          modified: new Date(matter.updatedAt || matter.createdAt),
          accessed: new Date(),
          attributes: 0x10,
          matterId: matter.id,
          children: new Map(),
        };

        this.root.children.set(matterFolder.name.toLowerCase(), matterFolder);
        this.pathToEntry.set(`\\${matterFolder.name}`.toLowerCase(), matterFolder);

        // Load documents for this matter
        await this.loadMatterContents(matter.id, matterFolder);
      }

      log.info(`File tree refreshed: ${this.matters.size} matters`);
      this.emit('fileTreeRefreshed');
    } catch (error) {
      log.error('Failed to refresh file tree:', error);
      throw error;
    }
  }

  /**
   * Refresh a specific matter's contents
   */
  public async refreshMatter(matterId: string): Promise<void> {
    const matter = this.matters.get(matterId);
    if (!matter) {
      return;
    }

    const matterFolderName = this.sanitizeFolderName(`${matter.number || matter.id} - ${matter.name}`);
    const matterFolder = this.root.children.get(matterFolderName.toLowerCase()) as VFSDirectory;
    
    if (matterFolder) {
      matterFolder.children.clear();
      await this.loadMatterContents(matterId, matterFolder);
    }
  }

  /**
   * Load contents of a matter folder
   */
  private async loadMatterContents(matterId: string, parentFolder: VFSDirectory): Promise<void> {
    try {
      const files = await this.apiClient.listFiles(matterId);
      
      for (const file of files) {
        if (file.isFolder) {
          // Add subfolder
          const folder: VFSDirectory = {
            name: this.sanitizeFolderName(file.name),
            isDirectory: true,
            size: 0,
            created: new Date(file.createdAt),
            modified: new Date(file.updatedAt || file.createdAt),
            accessed: new Date(),
            attributes: 0x10,
            matterId,
            children: new Map(),
          };
          
          parentFolder.children.set(folder.name.toLowerCase(), folder);
          
          // Recursively load folder contents
          if (file.children) {
            for (const child of file.children) {
              this.addFileToFolder(folder, child, matterId);
            }
          }
        } else {
          // Add file
          this.addFileToFolder(parentFolder, file, matterId);
        }
      }
    } catch (error) {
      log.error(`Failed to load contents for matter ${matterId}:`, error);
    }
  }

  /**
   * Add a file to a folder in the tree
   */
  private addFileToFolder(folder: VFSDirectory, file: VirtualFile, matterId: string): void {
    const vfsFile: VFSFile = {
      name: this.sanitizeFileName(file.name),
      isDirectory: false,
      size: file.size,
      created: new Date(file.createdAt),
      modified: new Date(file.updatedAt || file.createdAt),
      accessed: new Date(),
      attributes: 0x20, // FILE_ATTRIBUTE_ARCHIVE
      matterId,
      documentId: file.id,
      azurePath: file.azurePath || file.path,
      cached: this.fileCache.isCached(file.id),
    };
    
    folder.children.set(vfsFile.name.toLowerCase(), vfsFile);
  }

  /**
   * Start the Windows VFS driver process
   */
  private async startVFSDriver(): Promise<void> {
    // The VFS driver is implemented as a native Windows service using WinFsp or Dokan
    // For this implementation, we use a Node.js-based approach with the fuse-native package
    // which works on Windows through WinFsp
    
    const driverPath = path.join(__dirname, 'vfs-driver.js');
    
    // Check if we're on Windows
    if (process.platform !== 'win32') {
      log.warn('Virtual drive mounting is only supported on Windows');
      throw new Error('Virtual drive mounting requires Windows');
    }

    // Start the driver in a child process to isolate it
    this.vfsProcess = spawn(process.execPath, [driverPath], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        APEX_DRIVE_LETTER: this.driveLetter,
        APEX_CACHE_DIR: this.configManager.getCacheDir(),
      },
    });

    // Handle messages from the driver
    this.vfsProcess.on('message', (message: any) => {
      this.handleDriverMessage(message);
    });

    this.vfsProcess.stdout?.on('data', (data) => {
      log.debug('[VFS Driver]', data.toString());
    });

    this.vfsProcess.stderr?.on('data', (data) => {
      log.error('[VFS Driver Error]', data.toString());
    });

    this.vfsProcess.on('exit', (code) => {
      log.info(`VFS driver exited with code ${code}`);
      this.mounted = false;
      this.emit('driverExited', { code });
    });

    // Wait for driver to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('VFS driver startup timeout'));
      }, 30000);

      const onMessage = (message: any) => {
        if (message.type === 'ready') {
          clearTimeout(timeout);
          this.vfsProcess?.off('message', onMessage);
          resolve();
        } else if (message.type === 'error') {
          clearTimeout(timeout);
          this.vfsProcess?.off('message', onMessage);
          reject(new Error(message.error));
        }
      };

      this.vfsProcess?.on('message', onMessage);
      
      // Send initialization command
      this.vfsProcess?.send({ type: 'init', driveLetter: this.driveLetter });
    });
  }

  /**
   * Stop the VFS driver process
   */
  private async stopVFSDriver(): Promise<void> {
    if (!this.vfsProcess) {
      return;
    }

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.vfsProcess?.kill('SIGKILL');
        resolve();
      }, 5000);

      this.vfsProcess?.once('exit', () => {
        clearTimeout(timeout);
        this.vfsProcess = null;
        resolve();
      });

      this.vfsProcess?.send({ type: 'unmount' });
    });
  }

  /**
   * Handle messages from the VFS driver
   */
  private handleDriverMessage(message: any): void {
    switch (message.type) {
      case 'getattr':
        this.handleGetAttr(message);
        break;
      case 'readdir':
        this.handleReadDir(message);
        break;
      case 'open':
        this.handleOpen(message);
        break;
      case 'read':
        this.handleRead(message);
        break;
      case 'write':
        this.handleWrite(message);
        break;
      case 'create':
        this.handleCreate(message);
        break;
      case 'unlink':
        this.handleUnlink(message);
        break;
      case 'mkdir':
        this.handleMkdir(message);
        break;
      case 'rmdir':
        this.handleRmdir(message);
        break;
      case 'rename':
        this.handleRename(message);
        break;
      case 'release':
        this.handleRelease(message);
        break;
      default:
        log.warn(`Unknown VFS message type: ${message.type}`);
    }
  }

  /**
   * Get file/directory attributes
   */
  private async handleGetAttr(message: any): Promise<void> {
    const vfsPath = this.normalizePath(message.path);
    const entry = this.pathToEntry.get(vfsPath.toLowerCase());

    if (!entry) {
      this.sendDriverResponse(message.id, { error: 'ENOENT' });
      return;
    }

    this.sendDriverResponse(message.id, {
      mode: entry.isDirectory ? 0o40755 : 0o100644,
      size: entry.size,
      atime: entry.accessed,
      mtime: entry.modified,
      ctime: entry.created,
      nlink: entry.isDirectory ? 2 : 1,
    });
  }

  /**
   * List directory contents
   */
  private async handleReadDir(message: any): Promise<void> {
    const vfsPath = this.normalizePath(message.path);
    const entry = this.pathToEntry.get(vfsPath.toLowerCase());

    if (!entry || !entry.isDirectory) {
      this.sendDriverResponse(message.id, { error: 'ENOTDIR' });
      return;
    }

    const dir = entry as VFSDirectory;
    const entries = ['.', '..'];
    
    for (const [name, child] of dir.children) {
      entries.push(child.name);
    }

    this.sendDriverResponse(message.id, { entries });
  }

  /**
   * Open a file
   */
  private async handleOpen(message: any): Promise<void> {
    const vfsPath = this.normalizePath(message.path);
    const entry = this.pathToEntry.get(vfsPath.toLowerCase());

    if (!entry || entry.isDirectory) {
      this.sendDriverResponse(message.id, { error: 'ENOENT' });
      return;
    }

    const file = entry as VFSFile;

    // Ensure file is cached for reading
    if (!file.cached) {
      try {
        await this.cacheFile(file);
      } catch (error) {
        log.error(`Failed to cache file ${file.name}:`, error);
        this.sendDriverResponse(message.id, { error: 'EIO' });
        return;
      }
    }

    const handle = this.nextHandle++;
    this.openHandles.set(handle, {
      path: vfsPath,
      mode: message.flags,
      position: 0,
    });

    this.sendDriverResponse(message.id, { handle });
  }

  /**
   * Read file data
   */
  private async handleRead(message: any): Promise<void> {
    const handleInfo = this.openHandles.get(message.handle);
    if (!handleInfo) {
      this.sendDriverResponse(message.id, { error: 'EBADF' });
      return;
    }

    const entry = this.pathToEntry.get(handleInfo.path.toLowerCase()) as VFSFile;
    if (!entry || entry.isDirectory) {
      this.sendDriverResponse(message.id, { error: 'ENOENT' });
      return;
    }

    try {
      const data = await this.fileCache.read(
        entry.documentId,
        message.offset,
        message.length
      );
      
      this.sendDriverResponse(message.id, { data: data.toString('base64') });
    } catch (error) {
      log.error(`Failed to read file ${entry.name}:`, error);
      this.sendDriverResponse(message.id, { error: 'EIO' });
    }
  }

  /**
   * Write file data
   */
  private async handleWrite(message: any): Promise<void> {
    const handleInfo = this.openHandles.get(message.handle);
    if (!handleInfo) {
      this.sendDriverResponse(message.id, { error: 'EBADF' });
      return;
    }

    const entry = this.pathToEntry.get(handleInfo.path.toLowerCase()) as VFSFile;
    if (!entry || entry.isDirectory) {
      this.sendDriverResponse(message.id, { error: 'ENOENT' });
      return;
    }

    try {
      const data = Buffer.from(message.data, 'base64');
      const bytesWritten = await this.fileCache.write(
        entry.documentId,
        data,
        message.offset
      );

      // Mark file as dirty for sync
      this.syncEngine.markDirty(entry.documentId, entry.matterId!, entry.azurePath);

      // Update file size if needed
      const newSize = message.offset + bytesWritten;
      if (newSize > entry.size) {
        entry.size = newSize;
      }
      entry.modified = new Date();

      this.sendDriverResponse(message.id, { bytesWritten });
    } catch (error) {
      log.error(`Failed to write file ${entry.name}:`, error);
      this.sendDriverResponse(message.id, { error: 'EIO' });
    }
  }

  /**
   * Create a new file
   */
  private async handleCreate(message: any): Promise<void> {
    const vfsPath = this.normalizePath(message.path);
    const parentPath = path.dirname(vfsPath);
    const fileName = path.basename(vfsPath);

    const parentEntry = this.pathToEntry.get(parentPath.toLowerCase()) as VFSDirectory;
    if (!parentEntry || !parentEntry.isDirectory) {
      this.sendDriverResponse(message.id, { error: 'ENOENT' });
      return;
    }

    if (!parentEntry.matterId) {
      // Can't create files at root level (outside of matters)
      this.sendDriverResponse(message.id, { error: 'EACCES' });
      return;
    }

    try {
      // Create file on server
      const result = await this.apiClient.createFile(
        parentEntry.matterId,
        fileName,
        parentPath.replace(/\\/g, '/')
      );

      // Add to local tree
      const newFile: VFSFile = {
        name: this.sanitizeFileName(fileName),
        isDirectory: false,
        size: 0,
        created: new Date(),
        modified: new Date(),
        accessed: new Date(),
        attributes: 0x20,
        matterId: parentEntry.matterId,
        documentId: result.documentId,
        azurePath: result.azurePath,
        cached: false,
      };

      parentEntry.children.set(newFile.name.toLowerCase(), newFile);
      this.pathToEntry.set(vfsPath.toLowerCase(), newFile);

      // Create cache file
      await this.fileCache.createEmpty(result.documentId);
      newFile.cached = true;

      const handle = this.nextHandle++;
      this.openHandles.set(handle, {
        path: vfsPath,
        mode: 'w',
        position: 0,
      });

      this.sendDriverResponse(message.id, { handle });
    } catch (error) {
      log.error(`Failed to create file ${fileName}:`, error);
      this.sendDriverResponse(message.id, { error: 'EIO' });
    }
  }

  /**
   * Delete a file
   */
  private async handleUnlink(message: any): Promise<void> {
    const vfsPath = this.normalizePath(message.path);
    const parentPath = path.dirname(vfsPath);
    const fileName = path.basename(vfsPath);

    const entry = this.pathToEntry.get(vfsPath.toLowerCase()) as VFSFile;
    if (!entry || entry.isDirectory) {
      this.sendDriverResponse(message.id, { error: 'ENOENT' });
      return;
    }

    try {
      // Delete on server
      await this.apiClient.deleteFile(entry.documentId);

      // Remove from cache
      await this.fileCache.delete(entry.documentId);

      // Remove from tree
      const parent = this.pathToEntry.get(parentPath.toLowerCase()) as VFSDirectory;
      if (parent) {
        parent.children.delete(fileName.toLowerCase());
      }
      this.pathToEntry.delete(vfsPath.toLowerCase());

      this.sendDriverResponse(message.id, { success: true });
    } catch (error) {
      log.error(`Failed to delete file ${fileName}:`, error);
      this.sendDriverResponse(message.id, { error: 'EIO' });
    }
  }

  /**
   * Create a directory
   */
  private async handleMkdir(message: any): Promise<void> {
    const vfsPath = this.normalizePath(message.path);
    const parentPath = path.dirname(vfsPath);
    const dirName = path.basename(vfsPath);

    const parentEntry = this.pathToEntry.get(parentPath.toLowerCase()) as VFSDirectory;
    if (!parentEntry || !parentEntry.isDirectory) {
      this.sendDriverResponse(message.id, { error: 'ENOENT' });
      return;
    }

    if (!parentEntry.matterId) {
      // Can't create folders at root level
      this.sendDriverResponse(message.id, { error: 'EACCES' });
      return;
    }

    try {
      // Create folder on server
      await this.apiClient.createFolder(
        parentEntry.matterId,
        dirName,
        parentPath.replace(/\\/g, '/')
      );

      // Add to local tree
      const newDir: VFSDirectory = {
        name: this.sanitizeFolderName(dirName),
        isDirectory: true,
        size: 0,
        created: new Date(),
        modified: new Date(),
        accessed: new Date(),
        attributes: 0x10,
        matterId: parentEntry.matterId,
        children: new Map(),
      };

      parentEntry.children.set(newDir.name.toLowerCase(), newDir);
      this.pathToEntry.set(vfsPath.toLowerCase(), newDir);

      this.sendDriverResponse(message.id, { success: true });
    } catch (error) {
      log.error(`Failed to create directory ${dirName}:`, error);
      this.sendDriverResponse(message.id, { error: 'EIO' });
    }
  }

  /**
   * Remove a directory
   */
  private async handleRmdir(message: any): Promise<void> {
    const vfsPath = this.normalizePath(message.path);
    const parentPath = path.dirname(vfsPath);
    const dirName = path.basename(vfsPath);

    const entry = this.pathToEntry.get(vfsPath.toLowerCase()) as VFSDirectory;
    if (!entry || !entry.isDirectory) {
      this.sendDriverResponse(message.id, { error: 'ENOENT' });
      return;
    }

    if (entry.children.size > 0) {
      this.sendDriverResponse(message.id, { error: 'ENOTEMPTY' });
      return;
    }

    try {
      // Delete on server
      await this.apiClient.deleteFolder(entry.matterId!, vfsPath.replace(/\\/g, '/'));

      // Remove from tree
      const parent = this.pathToEntry.get(parentPath.toLowerCase()) as VFSDirectory;
      if (parent) {
        parent.children.delete(dirName.toLowerCase());
      }
      this.pathToEntry.delete(vfsPath.toLowerCase());

      this.sendDriverResponse(message.id, { success: true });
    } catch (error) {
      log.error(`Failed to delete directory ${dirName}:`, error);
      this.sendDriverResponse(message.id, { error: 'EIO' });
    }
  }

  /**
   * Rename/move a file or directory
   */
  private async handleRename(message: any): Promise<void> {
    const srcPath = this.normalizePath(message.srcPath);
    const dstPath = this.normalizePath(message.dstPath);

    const entry = this.pathToEntry.get(srcPath.toLowerCase());
    if (!entry) {
      this.sendDriverResponse(message.id, { error: 'ENOENT' });
      return;
    }

    try {
      if (entry.isDirectory) {
        await this.apiClient.renameFolder(
          entry.matterId!,
          srcPath.replace(/\\/g, '/'),
          dstPath.replace(/\\/g, '/')
        );
      } else {
        await this.apiClient.renameFile(
          (entry as VFSFile).documentId,
          path.basename(dstPath)
        );
      }

      // Update local tree
      const srcParentPath = path.dirname(srcPath);
      const dstParentPath = path.dirname(dstPath);
      const srcName = path.basename(srcPath);
      const dstName = path.basename(dstPath);

      const srcParent = this.pathToEntry.get(srcParentPath.toLowerCase()) as VFSDirectory;
      const dstParent = this.pathToEntry.get(dstParentPath.toLowerCase()) as VFSDirectory;

      if (srcParent && dstParent) {
        srcParent.children.delete(srcName.toLowerCase());
        entry.name = entry.isDirectory 
          ? this.sanitizeFolderName(dstName) 
          : this.sanitizeFileName(dstName);
        dstParent.children.set(entry.name.toLowerCase(), entry);
        
        this.pathToEntry.delete(srcPath.toLowerCase());
        this.pathToEntry.set(dstPath.toLowerCase(), entry);
      }

      this.sendDriverResponse(message.id, { success: true });
    } catch (error) {
      log.error(`Failed to rename ${srcPath} to ${dstPath}:`, error);
      this.sendDriverResponse(message.id, { error: 'EIO' });
    }
  }

  /**
   * Release (close) a file handle
   */
  private async handleRelease(message: any): Promise<void> {
    const handleInfo = this.openHandles.get(message.handle);
    if (!handleInfo) {
      this.sendDriverResponse(message.id, { success: true });
      return;
    }

    const entry = this.pathToEntry.get(handleInfo.path.toLowerCase()) as VFSFile;
    
    // If file was modified, trigger sync
    if (entry && !entry.isDirectory) {
      const isDirty = this.syncEngine.isDirty(entry.documentId);
      if (isDirty) {
        // Sync immediately for better user experience
        this.syncEngine.syncFile(entry.documentId).catch((error) => {
          log.error(`Failed to sync file ${entry.name} on close:`, error);
        });
      }
    }

    this.openHandles.delete(message.handle);
    this.sendDriverResponse(message.id, { success: true });
  }

  /**
   * Cache a file from Azure
   */
  private async cacheFile(file: VFSFile): Promise<void> {
    log.debug(`Caching file: ${file.name}`);
    
    const content = await this.apiClient.downloadFile(file.documentId);
    await this.fileCache.store(file.documentId, content);
    file.cached = true;
    file.cachePath = this.fileCache.getCachePath(file.documentId);
  }

  /**
   * Send response to VFS driver
   */
  private sendDriverResponse(id: number, response: any): void {
    this.vfsProcess?.send({ type: 'response', id, ...response });
  }

  /**
   * Normalize a path to use backslashes
   */
  private normalizePath(p: string): string {
    return p.replace(/\//g, '\\');
  }

  /**
   * Sanitize folder name for file system
   */
  private sanitizeFolderName(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '_').trim();
  }

  /**
   * Sanitize file name for file system
   */
  private sanitizeFileName(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '_').trim();
  }

  /**
   * Find matter ID from path
   */
  private getMatterFromPath(vfsPath: string): string | undefined {
    const parts = vfsPath.split('\\').filter(p => p);
    if (parts.length > 0) {
      const matterFolder = this.root.children.get(parts[0].toLowerCase()) as VFSDirectory;
      return matterFolder?.matterId;
    }
    return undefined;
  }
}
