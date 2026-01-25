const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const chokidar = require('chokidar');
const EventEmitter = require('events');

class SyncManager extends EventEmitter {
  constructor(apiClient, syncFolder) {
    super();
    this.apiClient = apiClient;
    this.syncFolder = syncFolder;
    this.isSyncing = false;
    this.lastSync = null;
    this.lastStats = null;
    this.autoSyncInterval = null;
    this.watcher = null;
    this.syncQueue = [];
    this.isProcessingQueue = false;
    
    // Local database of synced files (stores metadata)
    this.localDbPath = path.join(syncFolder, '.apex-drive', 'sync-db.json');
    this.localDb = this.loadLocalDb();
    
    // Ensure sync folder exists
    this.ensureFolderExists(syncFolder);
    this.ensureFolderExists(path.join(syncFolder, '.apex-drive'));
  }
  
  loadLocalDb() {
    try {
      if (fs.existsSync(this.localDbPath)) {
        return JSON.parse(fs.readFileSync(this.localDbPath, 'utf8'));
      }
    } catch (error) {
      console.error('Failed to load local db:', error);
    }
    return { files: {}, lastSync: null };
  }
  
  saveLocalDb() {
    try {
      fs.writeFileSync(this.localDbPath, JSON.stringify(this.localDb, null, 2));
    } catch (error) {
      console.error('Failed to save local db:', error);
    }
  }
  
  ensureFolderExists(folderPath) {
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
  }
  
  sanitizeFolderName(name) {
    return name.replace(/[<>:"/\\|?*]/g, '_').trim();
  }
  
  async syncAll() {
    if (this.isSyncing) {
      console.log('Sync already in progress');
      return;
    }
    
    this.isSyncing = true;
    this.emit('sync-start');
    
    const stats = {
      downloaded: 0,
      uploaded: 0,
      deleted: 0,
      errors: 0,
      startTime: Date.now(),
    };
    
    try {
      // Get all matters the user has access to
      const matters = await this.apiClient.getMatters();
      console.log(`Syncing ${matters.length} matters`);
      
      // Create Matters folder
      const mattersFolder = path.join(this.syncFolder, 'Matters');
      this.ensureFolderExists(mattersFolder);
      
      // Track which files should exist
      const expectedFiles = new Set();
      
      // Sync each matter
      for (const matter of matters) {
        try {
          await this.syncMatter(matter, mattersFolder, expectedFiles, stats);
        } catch (error) {
          console.error(`Failed to sync matter ${matter.name}:`, error);
          stats.errors++;
        }
      }
      
      // Also sync user's uploaded documents (not in any matter)
      await this.syncUserDocuments(expectedFiles, stats);
      
      // Clean up files that no longer exist on server
      await this.cleanupDeletedFiles(expectedFiles, stats);
      
      // Update sync time
      this.lastSync = new Date();
      this.localDb.lastSync = this.lastSync.toISOString();
      this.saveLocalDb();
      
      stats.endTime = Date.now();
      stats.duration = stats.endTime - stats.startTime;
      this.lastStats = stats;
      
      console.log(`Sync complete: ${stats.downloaded} downloaded, ${stats.uploaded} uploaded, ${stats.errors} errors`);
      
    } catch (error) {
      console.error('Sync failed:', error);
      this.emit('sync-error', error);
    } finally {
      this.isSyncing = false;
      this.emit('sync-complete', stats);
    }
  }
  
  async syncMatter(matter, mattersFolder, expectedFiles, stats) {
    // Create matter folder: Matters/{MatterNumber} - {MatterName}
    const matterFolderName = matter.number 
      ? `${this.sanitizeFolderName(matter.number)} - ${this.sanitizeFolderName(matter.name)}`
      : this.sanitizeFolderName(matter.name);
    
    const matterFolder = path.join(mattersFolder, matterFolderName);
    this.ensureFolderExists(matterFolder);
    
    // Get documents for this matter
    const documents = await this.apiClient.getMatterDocuments(matter.id);
    console.log(`  Matter "${matter.name}": ${documents.length} documents`);
    
    for (const doc of documents) {
      try {
        await this.syncDocument(doc, matterFolder, matter.id, expectedFiles, stats);
      } catch (error) {
        console.error(`    Failed to sync ${doc.name}:`, error.message);
        stats.errors++;
      }
    }
  }
  
  async syncUserDocuments(expectedFiles, stats) {
    // Get all user documents (some may not be in matters)
    const documents = await this.apiClient.getAllUserDocuments();
    
    // Filter to only documents not in matters
    const standaloneDocs = documents.filter(d => !d.matterId);
    
    if (standaloneDocs.length > 0) {
      const myDocsFolder = path.join(this.syncFolder, 'My Documents');
      this.ensureFolderExists(myDocsFolder);
      
      for (const doc of standaloneDocs) {
        try {
          await this.syncDocument(doc, myDocsFolder, null, expectedFiles, stats);
        } catch (error) {
          console.error(`Failed to sync ${doc.name}:`, error.message);
          stats.errors++;
        }
      }
    }
  }
  
  async syncDocument(doc, folder, matterId, expectedFiles, stats) {
    const filename = this.sanitizeFolderName(doc.originalName || doc.name);
    const localPath = path.join(folder, filename);
    
    // Add to expected files
    expectedFiles.add(localPath);
    
    // Check if we need to download
    const localInfo = this.localDb.files[doc.id];
    const needsDownload = !localInfo || 
                          !fs.existsSync(localPath) || 
                          localInfo.serverUpdatedAt !== doc.uploadedAt;
    
    if (needsDownload) {
      console.log(`    Downloading: ${filename}`);
      
      try {
        const { data } = await this.apiClient.downloadDocument(doc.id);
        fs.writeFileSync(localPath, data);
        
        // Calculate local hash
        const hash = crypto.createHash('md5').update(data).digest('hex');
        
        // Update local database
        this.localDb.files[doc.id] = {
          localPath,
          filename,
          matterId,
          serverUpdatedAt: doc.uploadedAt,
          localHash: hash,
          size: data.length,
          downloadedAt: new Date().toISOString(),
        };
        
        stats.downloaded++;
        this.emit('file-synced', { name: filename, action: 'downloaded' });
        
      } catch (error) {
        console.error(`    Download failed for ${filename}:`, error.message);
        stats.errors++;
      }
    } else {
      // Check if local file was modified (for upload)
      if (fs.existsSync(localPath)) {
        const localData = fs.readFileSync(localPath);
        const currentHash = crypto.createHash('md5').update(localData).digest('hex');
        
        if (currentHash !== localInfo.localHash) {
          console.log(`    Uploading modified: ${filename}`);
          
          try {
            await this.apiClient.uploadDocument(localPath, matterId, filename);
            
            // Update local hash
            this.localDb.files[doc.id].localHash = currentHash;
            this.localDb.files[doc.id].uploadedAt = new Date().toISOString();
            
            stats.uploaded++;
            this.emit('file-synced', { name: filename, action: 'uploaded' });
            
          } catch (error) {
            console.error(`    Upload failed for ${filename}:`, error.message);
            stats.errors++;
          }
        }
      }
    }
    
    this.saveLocalDb();
  }
  
  async cleanupDeletedFiles(expectedFiles, stats) {
    // Find files in local db that are no longer on server
    for (const [docId, info] of Object.entries(this.localDb.files)) {
      if (!expectedFiles.has(info.localPath)) {
        console.log(`  Removing deleted file: ${info.filename}`);
        
        try {
          if (fs.existsSync(info.localPath)) {
            fs.unlinkSync(info.localPath);
          }
          delete this.localDb.files[docId];
          stats.deleted++;
        } catch (error) {
          console.error(`  Failed to delete ${info.filename}:`, error.message);
        }
      }
    }
    
    this.saveLocalDb();
  }
  
  startAutoSync(intervalMs) {
    this.stopAutoSync();
    
    console.log(`Starting auto-sync every ${intervalMs / 60000} minutes`);
    
    this.autoSyncInterval = setInterval(() => {
      this.syncAll();
    }, intervalMs);
  }
  
  stopAutoSync() {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }
  
  startWatching() {
    if (this.watcher) return;
    
    this.watcher = chokidar.watch(this.syncFolder, {
      ignored: [
        /(^|[\/\\])\../,  // Ignore dot files
        path.join(this.syncFolder, '.apex-drive'),  // Ignore our db folder
      ],
      persistent: true,
      ignoreInitial: true,
    });
    
    this.watcher.on('change', (filePath) => {
      console.log(`File changed: ${filePath}`);
      this.queueUpload(filePath);
    });
    
    this.watcher.on('add', (filePath) => {
      console.log(`File added: ${filePath}`);
      this.queueUpload(filePath);
    });
  }
  
  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
  
  queueUpload(filePath) {
    // Add to queue (debounced)
    if (!this.syncQueue.includes(filePath)) {
      this.syncQueue.push(filePath);
    }
    
    // Process queue after a short delay
    if (!this.isProcessingQueue) {
      setTimeout(() => this.processUploadQueue(), 2000);
    }
  }
  
  async processUploadQueue() {
    if (this.isProcessingQueue || this.syncQueue.length === 0) return;
    
    this.isProcessingQueue = true;
    
    while (this.syncQueue.length > 0) {
      const filePath = this.syncQueue.shift();
      
      try {
        // Find the document ID for this file
        const docEntry = Object.entries(this.localDb.files).find(
          ([, info]) => info.localPath === filePath
        );
        
        if (docEntry) {
          const [docId, info] = docEntry;
          console.log(`Uploading changed file: ${info.filename}`);
          
          await this.apiClient.uploadDocument(filePath, info.matterId, info.filename);
          
          // Update hash
          const data = fs.readFileSync(filePath);
          info.localHash = crypto.createHash('md5').update(data).digest('hex');
          info.uploadedAt = new Date().toISOString();
          this.saveLocalDb();
          
          this.emit('file-synced', { name: info.filename, action: 'uploaded' });
        }
      } catch (error) {
        console.error(`Failed to upload ${filePath}:`, error.message);
      }
    }
    
    this.isProcessingQueue = false;
  }
}

module.exports = { SyncManager };
