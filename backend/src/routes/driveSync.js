import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { listFiles, downloadFile, isAzureConfigured, getShareClient, ensureDirectory, getAzureConfig } from '../utils/azureStorage.js';

const router = Router();

// ============================================
// TEST AZURE CONNECTION - Verify uploads work
// ============================================
router.get('/test-azure', authenticate, async (req, res) => {
  try {
    const firmId = req.user.firmId;
    const results = {
      configured: false,
      canConnect: false,
      canCreateFolder: false,
      canUploadFile: false,
      canListFiles: false,
      canDeleteFile: false,
      config: null,
      errors: []
    };
    
    // Step 1: Check if Azure is configured
    const azureEnabled = await isAzureConfigured();
    results.configured = azureEnabled;
    
    if (!azureEnabled) {
      return res.json({
        success: false,
        message: 'Azure Storage not configured. Configure it in Admin Portal (/rx760819).',
        results
      });
    }
    
    // Get config info (without exposing key)
    const config = await getAzureConfig();
    results.config = {
      accountName: config.accountName,
      shareName: config.shareName,
      hasKey: !!config.accountKey
    };
    
    // Step 2: Try to connect and get share client
    try {
      const shareClient = await getShareClient();
      results.canConnect = true;
      
      // Step 3: Try to create firm folder
      const testFolder = `firm-${firmId}`;
      try {
        await ensureDirectory(testFolder);
        results.canCreateFolder = true;
      } catch (err) {
        results.errors.push(`Create folder failed: ${err.message}`);
      }
      
      // Step 4: Try to upload a test file
      const testFileName = `_test_${Date.now()}.txt`;
      const testFilePath = `${testFolder}/${testFileName}`;
      const testContent = `Apex Drive test file\nCreated: ${new Date().toISOString()}\nFirm: ${firmId}`;
      
      try {
        const dirClient = shareClient.getDirectoryClient(testFolder);
        const fileClient = dirClient.getFileClient(testFileName);
        const contentBuffer = Buffer.from(testContent, 'utf-8');
        
        await fileClient.create(contentBuffer.length);
        await fileClient.uploadRange(contentBuffer, 0, contentBuffer.length);
        results.canUploadFile = true;
        results.testFilePath = testFilePath;
        results.testFileSize = contentBuffer.length;
        
        // Step 5: Try to list files
        try {
          const files = [];
          for await (const item of dirClient.listFilesAndDirectories()) {
            files.push(item.name);
          }
          results.canListFiles = true;
          results.filesInFolder = files.length;
        } catch (err) {
          results.errors.push(`List files failed: ${err.message}`);
        }
        
        // Step 6: Clean up - delete test file
        try {
          await fileClient.delete();
          results.canDeleteFile = true;
        } catch (err) {
          results.errors.push(`Delete test file failed: ${err.message}`);
        }
        
      } catch (err) {
        results.errors.push(`Upload file failed: ${err.message}`);
      }
      
    } catch (err) {
      results.errors.push(`Connect failed: ${err.message}`);
    }
    
    const allPassed = results.configured && results.canConnect && 
                      results.canCreateFolder && results.canUploadFile && 
                      results.canListFiles;
    
    res.json({
      success: allPassed,
      message: allPassed 
        ? 'Azure Storage is working correctly! Files can be uploaded.' 
        : 'Azure Storage has issues. Check errors.',
      results
    });
    
  } catch (error) {
    console.error('Test Azure error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Test failed: ' + error.message,
      stack: error.stack
    });
  }
});

// ============================================
// LIST AZURE FILES - See what's actually in Azure
// ============================================
router.get('/list-azure', authenticate, async (req, res) => {
  try {
    const firmId = req.user.firmId;
    const { folder = '' } = req.query;
    
    const azureEnabled = await isAzureConfigured();
    if (!azureEnabled) {
      return res.status(400).json({ 
        error: 'Azure Storage not configured' 
      });
    }
    
    const shareClient = await getShareClient();
    const firmFolder = `firm-${firmId}`;
    const targetPath = folder ? `${firmFolder}/${folder}` : firmFolder;
    
    const files = [];
    const folders = [];
    
    try {
      const dirClient = shareClient.getDirectoryClient(targetPath);
      
      for await (const item of dirClient.listFilesAndDirectories()) {
        if (item.kind === 'directory') {
          folders.push({
            name: item.name,
            path: `${targetPath}/${item.name}`,
            type: 'folder'
          });
        } else {
          files.push({
            name: item.name,
            path: `${targetPath}/${item.name}`,
            size: item.properties?.contentLength || 0,
            lastModified: item.properties?.lastModified,
            type: 'file'
          });
        }
      }
      
      res.json({
        success: true,
        path: targetPath,
        folders,
        files,
        totalFolders: folders.length,
        totalFiles: files.length
      });
      
    } catch (err) {
      if (err.statusCode === 404) {
        return res.json({
          success: true,
          path: targetPath,
          folders: [],
          files: [],
          message: 'Folder does not exist yet. It will be created when files are uploaded.'
        });
      }
      throw err;
    }
    
  } catch (error) {
    console.error('List Azure error:', error);
    res.status(500).json({ error: 'Failed to list files: ' + error.message });
  }
});

// ============================================
// DRIVE SYNC - Auto-sync documents from drives
// ============================================

// Trigger sync for a specific drive configuration
router.post('/sync/:driveId', authenticate, async (req, res) => {
  try {
    const { driveId } = req.params;

    // Get drive configuration
    const drive = await query(
      `SELECT * FROM drive_configurations WHERE id = $1 AND firm_id = $2`,
      [driveId, req.user.firmId]
    );

    if (drive.rows.length === 0) {
      return res.status(404).json({ error: 'Drive not found' });
    }

    const driveConfig = drive.rows[0];

    // Start sync based on drive type
    let result;
    switch (driveConfig.drive_type) {
      case 'azure_files':
        result = await syncAzureFiles(driveConfig, req.user);
        break;
      case 'local':
      case 'network':
        result = await syncLocalDrive(driveConfig, req.user);
        break;
      case 'onedrive':
      case 'sharepoint':
        result = await syncMicrosoftCloud(driveConfig, req.user);
        break;
      default:
        return res.status(400).json({ error: `Sync not supported for ${driveConfig.drive_type}` });
    }

    // Update last sync time
    await query(
      `UPDATE drive_configurations SET last_sync_at = NOW() WHERE id = $1`,
      [driveId]
    );

    res.json({
      success: true,
      synced: result.synced,
      updated: result.updated,
      errors: result.errors,
      message: `Synced ${result.synced} documents, updated ${result.updated}`
    });

  } catch (error) {
    console.error('Drive sync error:', error);
    res.status(500).json({ error: 'Failed to sync drive' });
  }
});

// Get sync status and queue
router.get('/status', authenticate, async (req, res) => {
  try {
    // Get pending sync items
    const pending = await query(
      `SELECT * FROM document_sync_queue 
       WHERE firm_id = $1 AND status = 'pending'
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.firmId]
    );

    // Get recent sync history
    const recent = await query(
      `SELECT * FROM document_sync_queue 
       WHERE firm_id = $1 AND status != 'pending'
       ORDER BY processed_at DESC
       LIMIT 20`,
      [req.user.firmId]
    );

    // Get drive configs with last sync times
    const drives = await query(
      `SELECT id, name, drive_type, last_sync_at, auto_sync, sync_interval_minutes
       FROM drive_configurations
       WHERE firm_id = $1 AND status = 'active'`,
      [req.user.firmId]
    );

    res.json({
      pending: pending.rows,
      recent: recent.rows,
      drives: drives.rows,
    });

  } catch (error) {
    console.error('Get sync status error:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

// ============================================
// QUICK SCAN - Scan Azure File Share without drive config
// This is the simplest way to sync Clio Drive files after drag-and-drop
// ============================================
router.post('/scan-azure', authenticate, async (req, res) => {
  try {
    const firmId = req.user.firmId;
    console.log(`[SYNC] Quick scan triggered for firm ${firmId}`);
    
    // Check if Azure is configured
    const azureEnabled = await isAzureConfigured();
    if (!azureEnabled) {
      return res.status(400).json({ 
        error: 'Azure Storage not configured',
        message: 'Configure Azure Storage in Admin Portal first'
      });
    }
    
    // Get the share client
    const shareClient = await getShareClient();
    const firmFolder = `firm-${firmId}`;
    
    // Pre-load all matters for this firm
    const mattersResult = await query(
      `SELECT id, name, number FROM matters WHERE firm_id = $1`,
      [firmId]
    );
    const matters = mattersResult.rows;
    console.log(`[SYNC] Loaded ${matters.length} matters for matching`);
    
    // Pre-load all clients
    const clientsResult = await query(
      `SELECT id, name FROM clients WHERE firm_id = $1`,
      [firmId]
    );
    const clients = clientsResult.rows;
    
    // Recursively scan Azure file share
    const allFiles = await scanAzureDirectory(shareClient, firmFolder, '');
    console.log(`[SYNC] Found ${allFiles.length} files in Azure`);
    
    const results = { 
      scanned: allFiles.length,
      created: 0, 
      updated: 0, 
      matched: 0,
      unmatched: 0,
      errors: [] 
    };
    
    for (const file of allFiles) {
      try {
        // Check if document exists
        const existing = await query(
          `SELECT id, matter_id, size, external_etag FROM documents 
           WHERE firm_id = $1 AND external_path = $2`,
          [firmId, file.path]
        );
        
        // Match folder to matter
        const { matterId, clientId } = matchFolderToPermissions(file.folder, matters, clients);
        const ext = path.extname(file.name).toLowerCase();
        const mimeType = getFileType(ext);
        
        if (matterId) {
          results.matched++;
        } else {
          results.unmatched++;
        }
        
        if (existing.rows.length > 0) {
          // Update if changed
          const doc = existing.rows[0];
          const hasChanged = file.etag !== doc.external_etag || file.size !== doc.size;
          
          if (hasChanged || (!doc.matter_id && matterId)) {
            await query(
              `UPDATE documents SET 
                matter_id = COALESCE($1, matter_id),
                size = $2,
                external_etag = $3,
                external_modified_at = $4,
                updated_at = NOW()
               WHERE id = $5`,
              [matterId, file.size, file.etag, file.lastModified, doc.id]
            );
            results.updated++;
          }
        } else {
          // Create new document record
          await query(
            `INSERT INTO documents (
              firm_id, matter_id, name, original_name, path, folder_path,
              type, size, external_path, external_etag, external_modified_at,
              uploaded_by, owner_id, privacy_level, status, storage_location
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
            [
              firmId,
              matterId,
              file.name,
              file.name,
              file.path,
              file.folder,
              mimeType,
              file.size,
              file.path,
              file.etag,
              file.lastModified,
              req.user.id,
              req.user.id,
              matterId ? 'team' : 'firm',
              'final',
              'azure'
            ]
          );
          results.created++;
        }
        
      } catch (err) {
        console.error(`[SYNC] Error processing ${file.path}:`, err.message);
        results.errors.push({ path: file.path, error: err.message });
      }
    }
    
    console.log(`[SYNC] Complete: ${results.created} created, ${results.updated} updated, ${results.matched} matched to matters`);
    
    res.json({
      success: true,
      ...results,
      message: `Scanned ${results.scanned} files: ${results.created} new, ${results.updated} updated, ${results.matched} matched to matters`
    });
    
  } catch (error) {
    console.error('Quick scan error:', error);
    res.status(500).json({ error: 'Failed to scan Azure: ' + error.message });
  }
});

// ============================================
// SCAN & MATCH - Match Azure files to Clio manifest
// This is the key endpoint for the HYBRID migration approach:
// 1. First, fetch Clio manifest via API (metadata only)
// 2. User copies files from Clio Drive to Azure (drag-drop or robocopy)
// 3. Run this endpoint to match files and create DB records with matter links
// ============================================
router.post('/scan-and-match', authenticate, async (req, res) => {
  try {
    const firmId = req.user.firmId;
    const { dryRun = false } = req.body;
    
    console.log(`[SCAN-MATCH] Starting scan-and-match for firm ${firmId} (dryRun: ${dryRun})`);
    
    // Check if Azure is configured
    const azureEnabled = await isAzureConfigured();
    if (!azureEnabled) {
      return res.status(400).json({ 
        error: 'Azure Storage not configured',
        message: 'Configure Azure Storage in Admin Portal first'
      });
    }
    
    // Check if we have a Clio manifest to match against
    const manifestCheck = await query(
      `SELECT COUNT(*) as count FROM clio_document_manifest WHERE firm_id = $1`,
      [firmId]
    );
    
    const manifestCount = parseInt(manifestCheck.rows[0].count);
    if (manifestCount === 0) {
      return res.status(400).json({
        error: 'No Clio manifest found',
        message: 'First fetch the Clio document manifest via the migration API before running scan-and-match',
        hint: 'POST /api/migration/clio/documents/manifest'
      });
    }
    
    console.log(`[SCAN-MATCH] Found ${manifestCount} documents in Clio manifest`);
    
    // Get the share client and scan Azure
    const shareClient = await getShareClient();
    const firmFolder = `firm-${firmId}`;
    
    // Recursively scan Azure file share
    const azureFiles = await scanAzureDirectory(shareClient, firmFolder, '');
    console.log(`[SCAN-MATCH] Found ${azureFiles.length} files in Azure`);
    
    if (azureFiles.length === 0) {
      return res.json({
        success: true,
        message: 'No files found in Azure. Copy files from Clio Drive first.',
        azureFiles: 0,
        manifestCount
      });
    }
    
    // Load all pending manifest entries
    const manifestResult = await query(
      `SELECT id, clio_id, name, clio_path, matter_id, client_id, owner_id,
              content_type, size, clio_created_at, match_status
       FROM clio_document_manifest 
       WHERE firm_id = $1 AND match_status IN ('pending', 'missing')
       ORDER BY name`,
      [firmId]
    );
    
    const pendingManifest = manifestResult.rows;
    console.log(`[SCAN-MATCH] ${pendingManifest.length} pending manifest entries to match`);
    
    // Build lookup maps for efficient matching
    // Map by exact filename (case-insensitive)
    const manifestByName = new Map();
    // Map by filename without extension
    const manifestByBaseName = new Map();
    // Map by path components
    const manifestByPath = new Map();
    
    for (const doc of pendingManifest) {
      const nameLower = doc.name.toLowerCase();
      const baseName = nameLower.replace(/\.[^/.]+$/, ''); // Remove extension
      
      // Store by exact name
      if (!manifestByName.has(nameLower)) {
        manifestByName.set(nameLower, []);
      }
      manifestByName.get(nameLower).push(doc);
      
      // Store by base name (for fuzzy matching)
      if (!manifestByBaseName.has(baseName)) {
        manifestByBaseName.set(baseName, []);
      }
      manifestByBaseName.get(baseName).push(doc);
      
      // Store by path if available
      if (doc.clio_path) {
        const pathLower = doc.clio_path.toLowerCase();
        manifestByPath.set(pathLower, doc);
      }
    }
    
    const results = {
      scanned: azureFiles.length,
      matched: 0,
      imported: 0,
      unmatched: 0,
      alreadyImported: 0,
      errors: [],
      matches: [] // Details of matches for review
    };
    
    // Pre-load matters for linking
    const mattersResult = await query(
      `SELECT id, name, number FROM matters WHERE firm_id = $1`,
      [firmId]
    );
    const matters = mattersResult.rows;
    
    // Pre-load clients
    const clientsResult = await query(
      `SELECT id, name FROM clients WHERE firm_id = $1`,
      [firmId]
    );
    const clients = clientsResult.rows;
    
    // Match each Azure file to manifest
    for (const azureFile of azureFiles) {
      try {
        const fileNameLower = azureFile.name.toLowerCase();
        const baseName = fileNameLower.replace(/\.[^/.]+$/, '');
        
        let matchedDoc = null;
        let matchMethod = null;
        let matchConfidence = 0;
        
        // Strategy 1: Exact filename match (highest confidence)
        const exactMatches = manifestByName.get(fileNameLower);
        if (exactMatches && exactMatches.length > 0) {
          // If multiple matches, try to narrow by path
          if (exactMatches.length === 1) {
            matchedDoc = exactMatches[0];
            matchMethod = 'exact_filename';
            matchConfidence = 95;
          } else {
            // Multiple files with same name - try to match by folder structure
            const azureFolder = azureFile.folder.toLowerCase();
            for (const doc of exactMatches) {
              if (doc.clio_path) {
                const clioFolder = path.dirname(doc.clio_path).toLowerCase();
                // Check if folder names have common elements
                if (azureFolder.includes(clioFolder) || clioFolder.includes(azureFolder)) {
                  matchedDoc = doc;
                  matchMethod = 'exact_filename_with_path';
                  matchConfidence = 98;
                  break;
                }
              }
            }
            // If still not matched, take first one with lower confidence
            if (!matchedDoc) {
              matchedDoc = exactMatches[0];
              matchMethod = 'exact_filename_ambiguous';
              matchConfidence = 75;
            }
          }
        }
        
        // Strategy 2: Base name match (without extension)
        if (!matchedDoc) {
          const baseMatches = manifestByBaseName.get(baseName);
          if (baseMatches && baseMatches.length === 1) {
            matchedDoc = baseMatches[0];
            matchMethod = 'basename_match';
            matchConfidence = 85;
          }
        }
        
        // Strategy 3: Fuzzy matching on folder structure
        if (!matchedDoc) {
          // Try to match based on matter folder patterns
          const { matterId, clientId } = matchFolderToPermissions(azureFile.folder, matters, clients);
          if (matterId) {
            // Found a matter, look for manifest entries linked to this matter
            const matterDocs = pendingManifest.filter(d => 
              d.matter_id === matterId && 
              d.name.toLowerCase() === fileNameLower
            );
            if (matterDocs.length > 0) {
              matchedDoc = matterDocs[0];
              matchMethod = 'matter_folder_match';
              matchConfidence = 90;
            }
          }
        }
        
        if (matchedDoc) {
          results.matched++;
          results.matches.push({
            azureFile: azureFile.path,
            manifestId: matchedDoc.id,
            manifestName: matchedDoc.name,
            method: matchMethod,
            confidence: matchConfidence
          });
          
          if (!dryRun) {
            // Update manifest with match
            await query(`
              UPDATE clio_document_manifest
              SET match_status = 'matched',
                  matched_azure_path = $1,
                  match_confidence = $2,
                  match_method = $3,
                  updated_at = NOW()
              WHERE id = $4
            `, [azureFile.path, matchConfidence, matchMethod, matchedDoc.id]);
            
            // Check if document already exists
            const existingDoc = await query(
              `SELECT id FROM documents WHERE firm_id = $1 AND external_path = $2`,
              [firmId, azureFile.path]
            );
            
            if (existingDoc.rows.length > 0) {
              results.alreadyImported++;
              // Update manifest to point to existing doc
              await query(`
                UPDATE clio_document_manifest
                SET match_status = 'imported',
                    matched_document_id = $1,
                    updated_at = NOW()
                WHERE id = $2
              `, [existingDoc.rows[0].id, matchedDoc.id]);
            } else {
              // Create document record
              const ext = path.extname(azureFile.name).toLowerCase();
              const mimeType = getFileType(ext);
              
              const docResult = await query(`
                INSERT INTO documents (
                  firm_id, matter_id, name, original_name, path, folder_path,
                  type, size, external_path, external_etag, external_modified_at,
                  uploaded_by, owner_id, privacy_level, status, storage_location,
                  clio_id, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
                RETURNING id
              `, [
                firmId,
                matchedDoc.matter_id,
                azureFile.name,
                matchedDoc.name, // Original name from Clio
                azureFile.path,
                azureFile.folder,
                matchedDoc.content_type || mimeType,
                azureFile.size || matchedDoc.size,
                azureFile.path,
                azureFile.etag,
                azureFile.lastModified,
                matchedDoc.owner_id || req.user.id,
                matchedDoc.owner_id || req.user.id,
                matchedDoc.matter_id ? 'team' : 'firm',
                'final',
                'azure',
                matchedDoc.clio_id,
                matchedDoc.clio_created_at || new Date()
              ]);
              
              // Update manifest with document ID
              await query(`
                UPDATE clio_document_manifest
                SET match_status = 'imported',
                    matched_document_id = $1,
                    updated_at = NOW()
                WHERE id = $2
              `, [docResult.rows[0].id, matchedDoc.id]);
              
              results.imported++;
            }
          }
        } else {
          results.unmatched++;
          
          // If not in dry run, create document record anyway (will have no Clio link)
          if (!dryRun) {
            const { matterId, clientId } = matchFolderToPermissions(azureFile.folder, matters, clients);
            const ext = path.extname(azureFile.name).toLowerCase();
            const mimeType = getFileType(ext);
            
            const existingDoc = await query(
              `SELECT id FROM documents WHERE firm_id = $1 AND external_path = $2`,
              [firmId, azureFile.path]
            );
            
            if (existingDoc.rows.length === 0) {
              await query(`
                INSERT INTO documents (
                  firm_id, matter_id, name, original_name, path, folder_path,
                  type, size, external_path, external_etag, external_modified_at,
                  uploaded_by, owner_id, privacy_level, status, storage_location
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
              `, [
                firmId,
                matterId,
                azureFile.name,
                azureFile.name,
                azureFile.path,
                azureFile.folder,
                mimeType,
                azureFile.size,
                azureFile.path,
                azureFile.etag,
                azureFile.lastModified,
                req.user.id,
                req.user.id,
                matterId ? 'team' : 'firm',
                'final',
                'azure'
              ]);
              results.imported++;
            }
          }
        }
        
      } catch (err) {
        console.error(`[SCAN-MATCH] Error processing ${azureFile.path}:`, err.message);
        results.errors.push({ path: azureFile.path, error: err.message });
      }
    }
    
    console.log(`[SCAN-MATCH] Complete: ${results.matched} matched, ${results.imported} imported, ${results.unmatched} unmatched`);
    
    res.json({
      success: true,
      dryRun,
      manifestCount,
      ...results,
      message: dryRun 
        ? `Dry run complete: Would match ${results.matched} files, import ${results.matched} documents`
        : `Matched ${results.matched} files to Clio manifest, imported ${results.imported} documents`
    });
    
  } catch (error) {
    console.error('Scan and match error:', error);
    res.status(500).json({ error: 'Failed to scan and match: ' + error.message });
  }
});

// ============================================
// MIGRATION SCRIPTS - Generate scripts for robocopy/manual migration
// ============================================
router.get('/migration-scripts', authenticate, async (req, res) => {
  try {
    const firmId = req.user.firmId;
    
    // Get Azure config for the scripts
    const config = await getAzureConfig();
    if (!config) {
      return res.status(400).json({
        error: 'Azure Storage not configured',
        message: 'Configure Azure in Admin Portal first'
      });
    }
    
    const { accountName, shareName } = config;
    const firmFolder = `firm-${firmId}`;
    const azurePath = `\\\\${accountName}.file.core.windows.net\\${shareName}\\${firmFolder}`;
    const azurePathMac = `smb://${accountName}.file.core.windows.net/${shareName}/${firmFolder}`;
    
    // Windows batch script for mounting + robocopy
    const windowsScript = `@echo off
REM ============================================
REM CLIO TO APEX DRIVE MIGRATION SCRIPT
REM ============================================
REM This script copies all files from Clio Drive to Azure File Share
REM 
REM PREREQUISITES:
REM 1. Clio Drive desktop app installed and logged in
REM 2. Azure storage account key (get from your Apex admin)
REM
REM INSTRUCTIONS:
REM 1. Save this file as migrate-to-apex.bat
REM 2. Right-click and "Run as Administrator"
REM 3. Enter your Azure storage key when prompted
REM 4. Wait for transfer to complete
REM 5. Go to Apex and click "Scan & Match" to link documents
REM ============================================

echo.
echo ==========================================
echo CLIO TO APEX DRIVE MIGRATION
echo ==========================================
echo.

REM Check if Clio Drive is mounted
if not exist "Z:\\" (
    echo ERROR: Clio Drive not found at Z:\\
    echo Please ensure Clio Drive desktop app is running and logged in.
    echo.
    pause
    exit /b 1
)

echo Found Clio Drive at Z:\\
echo.

REM Get Azure storage key
set /p AZURE_KEY="Enter your Azure Storage Account Key: "
echo.

REM Mount Azure File Share as Y drive
echo Mounting Azure File Share...
net use Y: ${azurePath} /user:AZURE\\${accountName} "%AZURE_KEY%" /persistent:no

if errorlevel 1 (
    echo ERROR: Failed to mount Azure File Share
    echo Check your storage account key and network connection.
    pause
    exit /b 1
)

echo Azure File Share mounted at Y:\\
echo.

REM Create destination folder if needed
if not exist "Y:\\" mkdir "Y:\\"

REM Start robocopy
echo ==========================================
echo STARTING FILE TRANSFER
echo ==========================================
echo Source: Z:\\ (Clio Drive)
echo Destination: Y:\\ (Azure/${firmFolder})
echo.
echo This may take a while for large document libraries.
echo DO NOT close this window until complete.
echo.

robocopy "Z:\\" "Y:\\" /E /MT:16 /R:3 /W:5 /NP /TEE /LOG:migration_log.txt ^
    /XD "$RECYCLE.BIN" "System Volume Information" ^
    /XF "desktop.ini" "thumbs.db" ".DS_Store"

if errorlevel 8 (
    echo.
    echo WARNING: Some files could not be copied. Check migration_log.txt
) else (
    echo.
    echo ==========================================
    echo TRANSFER COMPLETE!
    echo ==========================================
)

REM Disconnect Azure drive
echo.
echo Disconnecting Azure File Share...
net use Y: /delete /y

echo.
echo ==========================================
echo NEXT STEPS:
echo ==========================================
echo 1. Log in to Apex Drive
echo 2. Go to Settings - Migration
echo 3. Click "Scan and Match" to link your documents
echo.
echo Migration log saved to: migration_log.txt
echo.
pause
`;

    // PowerShell version with progress
    const powershellScript = `# ============================================
# CLIO TO APEX DRIVE MIGRATION (PowerShell)
# ============================================
# Run this script in PowerShell as Administrator
# ============================================

param(
    [string]$AzureStorageKey,
    [string]$ClioPath = "Z:\\",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "CLIO TO APEX DRIVE MIGRATION" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check Clio Drive
if (-not (Test-Path $ClioPath)) {
    Write-Host "ERROR: Clio Drive not found at $ClioPath" -ForegroundColor Red
    Write-Host "Please ensure Clio Drive desktop app is running and logged in."
    exit 1
}

Write-Host "Found Clio Drive at $ClioPath" -ForegroundColor Green

# Get Azure key if not provided
if (-not $AzureStorageKey) {
    $SecureKey = Read-Host "Enter Azure Storage Account Key" -AsSecureString
    $AzureStorageKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureKey)
    )
}

# Mount Azure File Share
$AzurePath = "${azurePath}"
$MountPoint = "Y:"

Write-Host ""
Write-Host "Mounting Azure File Share..." -ForegroundColor Yellow

# Remove existing mount if any
net use $MountPoint /delete /y 2>$null

# Mount
$result = net use $MountPoint $AzurePath /user:AZURE\\${accountName} $AzureStorageKey /persistent:no 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to mount Azure File Share" -ForegroundColor Red
    Write-Host $result
    exit 1
}

Write-Host "Azure File Share mounted at $MountPoint" -ForegroundColor Green

# Count files first
Write-Host ""
Write-Host "Counting files to transfer..." -ForegroundColor Yellow
$files = Get-ChildItem -Path $ClioPath -Recurse -File -ErrorAction SilentlyContinue
$totalFiles = $files.Count
$totalSize = ($files | Measure-Object -Property Length -Sum).Sum
$totalSizeMB = [math]::Round($totalSize / 1MB, 2)

Write-Host "Found $totalFiles files ($totalSizeMB MB)" -ForegroundColor Cyan

if ($DryRun) {
    Write-Host ""
    Write-Host "DRY RUN - No files will be copied" -ForegroundColor Yellow
    Write-Host "Remove -DryRun flag to perform actual transfer"
    net use $MountPoint /delete /y 2>$null
    exit 0
}

# Start robocopy with progress
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "STARTING FILE TRANSFER" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Source: $ClioPath"
Write-Host "Destination: $MountPoint\\"
Write-Host ""

$startTime = Get-Date

robocopy $ClioPath "$MountPoint\\" /E /MT:16 /R:3 /W:5 /NP /TEE /LOG:migration_log.txt \`
    /XD '$RECYCLE.BIN' 'System Volume Information' \`
    /XF 'desktop.ini' 'thumbs.db' '.DS_Store'

$endTime = Get-Date
$duration = $endTime - $startTime

# Cleanup
Write-Host ""
Write-Host "Disconnecting Azure File Share..." -ForegroundColor Yellow
net use $MountPoint /delete /y 2>$null

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "TRANSFER COMPLETE!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "Duration: $($duration.ToString('hh\\:mm\\:ss'))"
Write-Host "Files: $totalFiles"
Write-Host "Size: $totalSizeMB MB"
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "1. Log in to Apex Drive"
Write-Host "2. Go to Settings > Migration"
Write-Host "3. Click 'Scan and Match' to link your documents"
Write-Host ""
Write-Host "Migration log saved to: migration_log.txt"
`;

    // Mac script
    const macScript = `#!/bin/bash
# ============================================
# CLIO TO APEX DRIVE MIGRATION (macOS)
# ============================================
# 
# PREREQUISITES:
# 1. Clio Drive desktop app installed and logged in
# 2. Azure storage account key
#
# USAGE:
# chmod +x migrate-to-apex.sh
# ./migrate-to-apex.sh
# ============================================

echo ""
echo "=========================================="
echo "CLIO TO APEX DRIVE MIGRATION"
echo "=========================================="
echo ""

# Configuration
AZURE_ACCOUNT="${accountName}"
AZURE_SHARE="${shareName}"
FIRM_FOLDER="${firmFolder}"
CLIO_PATH="/Volumes/Clio"
AZURE_MOUNT="/Volumes/ApexDrive"

# Check Clio Drive
if [ ! -d "$CLIO_PATH" ]; then
    echo "ERROR: Clio Drive not found at $CLIO_PATH"
    echo "Please ensure Clio Drive desktop app is running and logged in."
    exit 1
fi

echo "Found Clio Drive at $CLIO_PATH"
echo ""

# Get Azure key
echo -n "Enter Azure Storage Account Key: "
read -s AZURE_KEY
echo ""
echo ""

# Create mount point
mkdir -p "$AZURE_MOUNT"

# Mount Azure File Share
echo "Mounting Azure File Share..."
mount_smbfs "//$AZURE_ACCOUNT:$AZURE_KEY@$AZURE_ACCOUNT.file.core.windows.net/$AZURE_SHARE" "$AZURE_MOUNT"

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to mount Azure File Share"
    exit 1
fi

echo "Azure File Share mounted at $AZURE_MOUNT"
echo ""

# Create destination folder
mkdir -p "$AZURE_MOUNT/$FIRM_FOLDER"

# Count files
echo "Counting files..."
FILE_COUNT=$(find "$CLIO_PATH" -type f | wc -l | tr -d ' ')
echo "Found $FILE_COUNT files to transfer"
echo ""

# Start transfer
echo "=========================================="
echo "STARTING FILE TRANSFER"
echo "=========================================="
echo "Source: $CLIO_PATH"
echo "Destination: $AZURE_MOUNT/$FIRM_FOLDER"
echo ""

rsync -avh --progress \\
    --exclude='.DS_Store' \\
    --exclude='._*' \\
    --exclude='.Spotlight-*' \\
    --exclude='.Trashes' \\
    "$CLIO_PATH/" "$AZURE_MOUNT/$FIRM_FOLDER/"

# Unmount
echo ""
echo "Unmounting Azure File Share..."
diskutil unmount "$AZURE_MOUNT"

echo ""
echo "=========================================="
echo "TRANSFER COMPLETE!"
echo "=========================================="
echo ""
echo "NEXT STEPS:"
echo "1. Log in to Apex Drive"
echo "2. Go to Settings > Migration"
echo "3. Click 'Scan and Match' to link your documents"
echo ""
`;

    // Instructions document
    const instructions = `# Clio to Apex Drive Migration Guide

## Overview

This guide explains how to migrate your documents from Clio Drive to Apex Drive using the **Hybrid Migration** approach - the fastest and most reliable method.

## Migration Steps

### Step 1: Fetch Clio Document Manifest (5-10 minutes)

Before copying files, fetch the document metadata from Clio:

1. Log in to Apex as an admin
2. Go to **Settings → Migration → Clio**
3. Connect your Clio account (if not already connected)
4. Click **"Fetch Document Manifest"**

This downloads document names, matter links, and folder structure from Clio - but NOT the actual files. This is fast and won't hit rate limits.

### Step 2: Copy Files (varies by library size)

Choose your preferred method:

#### Option A: Manual Drag & Drop (Small libraries < 500 files)
1. Open Clio Drive in Windows Explorer (usually Z:\\)
2. Open Azure Storage Explorer (download from Microsoft)
3. Connect to your Azure storage account
4. Navigate to: apexdrive → ${firmFolder}
5. Drag folders from Clio Drive to Azure

#### Option B: Robocopy Script (Recommended for 500+ files)
1. Download the migration script (Windows .bat or PowerShell)
2. Run as Administrator
3. Enter your Azure storage key when prompted
4. Wait for transfer to complete

#### Option C: VM Migration (Very large libraries 10,000+ files)
1. Create a Windows VM in Azure (same region as storage)
2. Install Clio Drive app and sign in
3. Mount Azure File Share as a drive
4. Run robocopy with /MT:32 for maximum speed
5. Delete VM when complete

### Step 3: Scan & Match (5-10 minutes)

After files are copied:

1. Go to **Settings → Migration → Clio**
2. Click **"Scan & Match"**
3. Review the matching results
4. Confirm import

This matches each file in Azure to its Clio metadata, preserving:
- Matter associations
- Client links
- Original creation dates
- Folder structure

## Estimated Transfer Times

| Library Size | Drag & Drop | Robocopy | VM Robocopy |
|-------------|-------------|----------|-------------|
| 100 files   | 5 min       | 2 min    | 1 min       |
| 1,000 files | 30 min      | 15 min   | 5 min       |
| 10,000 files| 4+ hours    | 2 hours  | 30 min      |
| 50,000 files| Not recommended | 8 hours | 2 hours  |

## Troubleshooting

### "Clio Drive not found"
- Ensure Clio Drive desktop app is installed and running
- Sign in to Clio Drive if prompted
- Check that Z:\\ drive is accessible

### "Failed to mount Azure File Share"
- Verify your storage account key is correct
- Check your network allows SMB traffic (port 445)
- Try from a different network (some corporate networks block SMB)

### "Some files failed to copy"
- Check migration_log.txt for details
- Common issues: files in use, permissions, long paths
- Re-run the script - robocopy will skip already-copied files

### "Documents not matching to matters"
- Ensure you fetched the Clio manifest BEFORE copying files
- Run Scan & Match again
- Some files may need manual linking if names changed

## Azure Storage Key

Your Azure storage account key is needed for the migration scripts.

**Storage Account:** ${accountName}
**File Share:** ${shareName}
**Your Firm Folder:** ${firmFolder}

Contact your Apex platform administrator for the storage key.

---
Generated for firm ${firmId}
`;

    res.json({
      success: true,
      scripts: {
        windows: {
          filename: 'migrate-to-apex.bat',
          content: windowsScript,
          description: 'Windows batch script - double-click to run'
        },
        powershell: {
          filename: 'migrate-to-apex.ps1',
          content: powershellScript,
          description: 'PowerShell script with progress tracking'
        },
        mac: {
          filename: 'migrate-to-apex.sh',
          content: macScript,
          description: 'macOS/Linux bash script'
        }
      },
      instructions: {
        filename: 'MIGRATION_GUIDE.md',
        content: instructions
      },
      azureInfo: {
        accountName,
        shareName,
        firmFolder,
        windowsPath: azurePath,
        macPath: azurePathMac
      }
    });
    
  } catch (error) {
    console.error('Migration scripts error:', error);
    res.status(500).json({ error: 'Failed to generate scripts: ' + error.message });
  }
});

// Helper to get Azure config (imported from azureStorage but need local access)
async function getAzureConfig() {
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  const shareName = process.env.AZURE_FILE_SHARE_NAME || 'apexdrive';
  
  if (accountName && accountKey) {
    return { accountName, accountKey, shareName };
  }
  
  try {
    const result = await query(
      `SELECT key, value FROM platform_settings WHERE key IN ('azure_storage_account_name', 'azure_storage_account_key', 'azure_file_share_name')`
    );
    const settings = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }
    if (settings.azure_storage_account_name && settings.azure_storage_account_key) {
      return {
        accountName: settings.azure_storage_account_name,
        accountKey: settings.azure_storage_account_key,
        shareName: settings.azure_file_share_name || 'apexdrive'
      };
    }
  } catch (err) {
    console.log('[MIGRATION] Could not load platform settings:', err.message);
  }
  
  return null;
}

// Watch folder for changes (webhook-style for Azure File Share)
router.post('/watch/:driveId', authenticate, async (req, res) => {
  try {
    const { driveId } = req.params;
    const { folderPath } = req.body;

    // Add to watch list
    await query(
      `INSERT INTO document_sync_queue (
        drive_id, firm_id, external_path, sync_direction, status
      ) VALUES ($1, $2, $3, 'inbound', 'watching')
      ON CONFLICT (drive_id, external_path) DO UPDATE SET status = 'watching'`,
      [driveId, req.user.firmId, folderPath || '/']
    );

    res.json({ success: true, watching: folderPath || '/' });

  } catch (error) {
    console.error('Watch folder error:', error);
    res.status(500).json({ error: 'Failed to start watching folder' });
  }
});

// ============================================
// SYNC FUNCTIONS
// ============================================

async function syncAzureFiles(driveConfig, user) {
  // Azure File Share sync using the Azure Storage SDK
  const results = { synced: 0, updated: 0, matched: 0, errors: [] };

  try {
    // Check if Azure is configured
    const azureEnabled = await isAzureConfigured();
    if (!azureEnabled) {
      results.errors.push({ error: 'Azure Storage not configured' });
      return results;
    }

    // Get the share client
    const shareClient = await getShareClient();
    const firmFolder = `firm-${user.firmId}`;
    
    // Pre-load all matters for this firm to match folder names
    const mattersResult = await query(
      `SELECT id, name, number FROM matters WHERE firm_id = $1`,
      [user.firmId]
    );
    const matters = mattersResult.rows;
    console.log(`[SYNC] Loaded ${matters.length} matters for permission matching`);
    
    // Pre-load all clients for this firm
    const clientsResult = await query(
      `SELECT id, name FROM clients WHERE firm_id = $1`,
      [user.firmId]
    );
    const clients = clientsResult.rows;
    
    // Recursively scan Azure file share
    const allFiles = await scanAzureDirectory(shareClient, firmFolder, '');
    
    console.log(`[SYNC] Found ${allFiles.length} files in Azure for firm ${user.firmId}`);

    for (const file of allFiles) {
      try {
        // Check if document already exists in database
        // Cloud-native: We track size, etag, and last_modified to detect changes
        // This is more efficient than Clio which relies on file system watchers
        const existing = await query(
          `SELECT id, content_hash, external_path, matter_id, size, 
                  external_etag, external_modified_at 
           FROM documents 
           WHERE firm_id = $1 AND external_path = $2`,
          [user.firmId, file.path]
        );

        // Match folder path to matter/client for permissions
        const { matterId, clientId } = matchFolderToPermissions(file.folder, matters, clients);
        const ext = path.extname(file.name).toLowerCase();
        const mimeType = getFileType(ext);

        if (existing.rows.length > 0) {
          const doc = existing.rows[0];
          
          // Check if file has actually changed using Azure metadata
          // Priority: etag > size comparison > always update
          const hasChanged = (
            // If we have etag and it's different, file changed
            (file.etag && doc.external_etag && file.etag !== doc.external_etag) ||
            // If size changed, file definitely changed
            (file.size && doc.size && file.size !== doc.size) ||
            // If we have lastModified and it's newer, file changed
            (file.lastModified && doc.external_modified_at && 
             new Date(file.lastModified) > new Date(doc.external_modified_at))
          );

          // Build update fields
          const updateFields = [];
          const updateValues = [];
          let paramIndex = 1;

          // Always update size if different (cheap comparison)
          if (file.size && file.size !== doc.size) {
            updateFields.push(`size = $${paramIndex++}`);
            updateValues.push(file.size);
          }

          // Update matter_id if we found a match and it's not set
          if (matterId && !doc.matter_id) {
            updateFields.push(`matter_id = $${paramIndex++}`);
            updateValues.push(matterId);
            results.matched++;
            console.log(`[SYNC] Matched existing doc "${file.name}" to matter`);
          }

          // Update client_id if we found a match and it's not set
          if (clientId && !doc.client_id) {
            updateFields.push(`client_id = $${paramIndex++}`);
            updateValues.push(clientId);
          }

          // Store Azure metadata for future change detection
          if (file.etag && file.etag !== doc.external_etag) {
            updateFields.push(`external_etag = $${paramIndex++}`);
            updateValues.push(file.etag);
          }
          if (file.lastModified) {
            updateFields.push(`external_modified_at = $${paramIndex++}`);
            updateValues.push(file.lastModified);
          }

          // Update sync timestamp
          updateFields.push(`last_synced_at = NOW()`);

          // If file content changed, mark it for re-indexing
          if (hasChanged) {
            updateFields.push(`needs_reindex = true`);
            updateFields.push(`content_extracted_at = NULL`);
            results.updated++;
            console.log(`[SYNC] Updated: ${file.name} (content changed)`);
          }

          // Only run update if we have fields to update
          if (updateFields.length > 0) {
            updateValues.push(doc.id);
            await query(
              `UPDATE documents SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
              updateValues
            );
          }
        } else {
          // Create new document record from Azure file with permissions
          await query(
            `INSERT INTO documents (
              firm_id, matter_id, client_id, name, original_name, type, size,
              drive_id, external_path, folder_path, uploaded_by,
              external_etag, external_modified_at, last_synced_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
            [
              user.firmId,
              matterId,
              clientId,
              file.name,
              file.name,
              mimeType,
              file.size || 0,
              driveConfig.id,
              file.path,
              file.folder,
              user.id,
              file.etag || null,
              file.lastModified || null
            ]
          );
          results.synced++;
          if (matterId) results.matched++;
          console.log(`[SYNC] Added: ${file.name}${matterId ? ' (linked to matter)' : ''}`);
        }
      } catch (fileError) {
        console.error(`[SYNC] Error processing ${file.name}:`, fileError.message);
        results.errors.push({ file: file.name, error: fileError.message });
      }
    }

    // Update last sync time
    await query(
      `UPDATE drive_configurations SET last_sync_at = NOW(), last_sync_status = 'success' WHERE id = $1`,
      [driveConfig.id]
    );

  } catch (error) {
    console.error('[SYNC] Azure sync error:', error);
    results.errors.push({ error: `Azure sync failed: ${error.message}` });
    
    // Update sync status to error
    await query(
      `UPDATE drive_configurations SET last_sync_status = 'error', last_error = $1 WHERE id = $2`,
      [error.message, driveConfig.id]
    );
  }

  return results;
}

// Match folder path to a matter or client for permissions
// Supports Clio Drive folder structure:
//   - /Matters/[ClientName] - [MatterName]/...
//   - /Matters/[MatterNumber] - [MatterName]/...
//   - /Matters/[MatterNumber]/...
//   - /Clients/[ClientName]/[MatterName]/...
//   - /[ClientName]/[MatterName]/...
function matchFolderToPermissions(folderPath, matters, clients) {
  let matterId = null;
  let clientId = null;
  
  if (!folderPath || folderPath === '/') {
    return { matterId, clientId };
  }
  
  // Get path parts
  const pathParts = folderPath.split('/').filter(p => p && p.trim());
  
  // Skip the first part if it's a common root folder
  const skipFolders = ['matters', 'clients', 'documents', 'files', 'general', 'firm'];
  let startIndex = 0;
  if (pathParts.length > 0 && skipFolders.includes(pathParts[0].toLowerCase())) {
    startIndex = 1;
  }
  
  // Process remaining path parts
  for (let i = startIndex; i < pathParts.length; i++) {
    const part = pathParts[i];
    
    // Skip if empty or common subfolder names
    if (!part || ['documents', 'files', 'correspondence', 'pleadings', 'discovery'].includes(part.toLowerCase())) {
      continue;
    }
    
    // === CLIO FORMAT: "[ClientName] - [MatterName]" or "[MatterNumber] - [MatterName]" ===
    if (part.includes(' - ')) {
      const [prefix, suffix] = part.split(' - ').map(s => s.trim());
      
      // Try to match prefix as matter number first
      const matchedByNumber = matters.find(m => 
        m.number && normalizeString(m.number) === normalizeString(prefix)
      );
      if (matchedByNumber) {
        matterId = matchedByNumber.id;
        console.log(`[SYNC] Clio match: "${part}" -> matter #${matchedByNumber.number}`);
        break;
      }
      
      // Try to match prefix as client name, suffix as matter name
      const matchedClient = clients.find(c => 
        normalizeString(c.name) === normalizeString(prefix) ||
        normalizeString(c.name).includes(normalizeString(prefix)) ||
        normalizeString(prefix).includes(normalizeString(c.name))
      );
      if (matchedClient) {
        clientId = matchedClient.id;
        // Now find matter by name (suffix)
        const matchedMatter = matters.find(m =>
          normalizeString(m.name) === normalizeString(suffix) ||
          normalizeString(m.name).includes(normalizeString(suffix)) ||
          normalizeString(suffix).includes(normalizeString(m.name))
        );
        if (matchedMatter) {
          matterId = matchedMatter.id;
          console.log(`[SYNC] Clio match: "${part}" -> client "${matchedClient.name}", matter "${matchedMatter.name}"`);
          break;
        }
      }
      
      // Try matching suffix as matter name directly
      const matterBySuffix = matters.find(m =>
        normalizeString(m.name) === normalizeString(suffix) ||
        normalizeString(m.name).includes(normalizeString(suffix))
      );
      if (matterBySuffix) {
        matterId = matterBySuffix.id;
        console.log(`[SYNC] Clio match: "${part}" -> matter "${matterBySuffix.name}"`);
        break;
      }
    }
    
    // === DIRECT MATTER NUMBER MATCH ===
    const matterByNumber = matters.find(m => 
      m.number && normalizeString(m.number) === normalizeString(part)
    );
    if (matterByNumber) {
      matterId = matterByNumber.id;
      console.log(`[SYNC] Number match: "${part}" -> matter #${matterByNumber.number}`);
      break;
    }
    
    // === DIRECT MATTER NAME MATCH ===
    const matterByName = matters.find(m => {
      const mName = normalizeString(m.name);
      const pName = normalizeString(part);
      return mName === pName || 
             (mName.length > 3 && pName.includes(mName)) || 
             (pName.length > 3 && mName.includes(pName));
    });
    if (matterByName) {
      matterId = matterByName.id;
      console.log(`[SYNC] Name match: "${part}" -> matter "${matterByName.name}"`);
      break;
    }
    
    // === CLIENT NAME MATCH (only if no matter found yet) ===
    if (!matterId && !clientId) {
      const clientByName = clients.find(c => {
        const cName = normalizeString(c.name);
        const pName = normalizeString(part);
        return cName === pName || 
               (cName.length > 3 && pName.includes(cName)) || 
               (pName.length > 3 && cName.includes(pName));
      });
      if (clientByName) {
        clientId = clientByName.id;
        console.log(`[SYNC] Client match: "${part}" -> client "${clientByName.name}"`);
        // Don't break - keep looking for matter in subfolders
      }
    }
  }
  
  return { matterId, clientId };
}

// Normalize string for comparison
function normalizeString(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/[_\-\.]/g, ' ')  // Replace separators with spaces
    .replace(/\s+/g, ' ')       // Collapse multiple spaces
    .trim();
}

// Recursively scan Azure directory
async function scanAzureDirectory(shareClient, basePath, subPath) {
  const files = [];
  const fullPath = subPath ? `${basePath}/${subPath}` : basePath;
  
  try {
    const dirClient = shareClient.getDirectoryClient(fullPath);
    
    for await (const item of dirClient.listFilesAndDirectories()) {
      const itemPath = subPath ? `${subPath}/${item.name}` : item.name;
      
      if (item.kind === 'directory') {
        // Recursively scan subdirectory
        const subFiles = await scanAzureDirectory(shareClient, basePath, itemPath);
        files.push(...subFiles);
      } else {
        // Check if it's a document type we care about
        const ext = path.extname(item.name).toLowerCase();
        const documentTypes = [
          '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
          '.txt', '.rtf', '.odt', '.ods', '.odp', '.csv', '.md',
          '.jpg', '.jpeg', '.png', '.gif', '.tiff', '.bmp'
        ];
        
        if (documentTypes.includes(ext)) {
          files.push({
            name: item.name,
            path: `${basePath}/${itemPath}`,
            folder: subPath || '/',
            size: item.properties?.contentLength || 0,
            // Capture Azure file metadata for change detection
            lastModified: item.properties?.lastModified || null,
            contentMD5: item.properties?.contentMD5 || null,
            etag: item.properties?.etag || null
          });
        }
      }
    }
  } catch (error) {
    // Directory might not exist, that's OK
    console.log(`[SYNC] Could not scan ${fullPath}: ${error.message}`);
  }
  
  return files;
}

async function syncLocalDrive(driveConfig, user) {
  // Same logic as Azure Files for local/network paths
  return syncAzureFiles(driveConfig, user);
}

async function syncMicrosoftCloud(driveConfig, user) {
  // OneDrive/SharePoint sync using Microsoft Graph API
  // 
  // Cloud-Native Architecture (Better than Clio's approach):
  // 1. Register webhook with Graph API for change notifications
  // 2. Use delta queries to get only changed files
  // 3. Process changes incrementally instead of full scans
  //
  // Required setup:
  // - Microsoft Graph API permissions: Files.Read.All, Sites.Read.All
  // - Webhook endpoint registered with Microsoft
  // - User's OAuth tokens stored in integrations table
  
  const results = { synced: 0, updated: 0, matched: 0, errors: [] };

  try {
    // Check if user has Microsoft integration set up
    const integration = await query(
      `SELECT access_token, refresh_token, token_expires_at, settings
       FROM integrations 
       WHERE firm_id = $1 AND provider = 'microsoft' AND is_active = true`,
      [user.firmId]
    );

    if (integration.rows.length === 0) {
      results.errors.push({ 
        error: 'Microsoft integration not configured',
        action: 'Go to Settings → Integrations → Microsoft 365 to connect your account',
        code: 'INTEGRATION_REQUIRED'
      });
      return results;
    }

    const { access_token, token_expires_at } = integration.rows[0];

    // Check if token is expired
    if (new Date(token_expires_at) < new Date()) {
      results.errors.push({ 
        error: 'Microsoft access token expired',
        action: 'Re-authenticate in Settings → Integrations → Microsoft 365',
        code: 'TOKEN_EXPIRED'
      });
      return results;
    }

    // TODO: Implement Graph API delta sync
    // For now, return a helpful message indicating the feature is in development
    results.errors.push({ 
      error: 'OneDrive/SharePoint sync is coming soon',
      message: 'For now, use Apex Drive (Azure File Share) for full sync support. OneDrive documents can still be opened directly via Word Online.',
      code: 'FEATURE_IN_DEVELOPMENT'
    });

    console.log(`[SYNC] Microsoft Cloud sync requested for firm ${user.firmId} - feature in development`);

  } catch (error) {
    console.error('[SYNC] Microsoft Cloud sync error:', error);
    results.errors.push({ error: error.message });
  }

  return results;
}

async function scanDirectory(dirPath, rootPath, files = []) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Skip hidden directories and system folders
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await scanDirectory(fullPath, rootPath, files);
        }
      } else if (entry.isFile()) {
        // Only sync document types
        const ext = path.extname(entry.name).toLowerCase();
        const documentTypes = [
          '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
          '.txt', '.rtf', '.odt', '.ods', '.odp', '.csv', '.md',
          '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff'
        ];
        
        if (documentTypes.includes(ext)) {
          const stats = await fs.stat(fullPath);
          const relativePath = path.relative(rootPath, fullPath);
          const folderPath = path.dirname(relativePath);
          
          files.push({
            name: entry.name,
            fullPath,
            relativePath,
            folderPath: folderPath === '.' ? '/' : '/' + folderPath.replace(/\\/g, '/'),
            size: stats.size,
            mtime: stats.mtime,
            type: getFileType(ext)
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning ${dirPath}:`, error.message);
  }
  
  return files;
}

function getFileType(ext) {
  const types = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.rtf': 'application/rtf',
    '.csv': 'text/csv',
    '.md': 'text/markdown',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
  };
  return types[ext] || 'application/octet-stream';
}

export default router;
