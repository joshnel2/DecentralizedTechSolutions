import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { listFiles, downloadFile, isAzureConfigured, getShareClient } from '../utils/azureStorage.js';

const router = Router();

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
        const existing = await query(
          `SELECT id, content_hash, external_path, matter_id FROM documents 
           WHERE firm_id = $1 AND external_path = $2`,
          [user.firmId, file.path]
        );

        // Match folder path to matter/client for permissions
        const { matterId, clientId } = matchFolderToPermissions(file.folder, matters, clients);

        if (existing.rows.length > 0) {
          // Document exists - update matter_id if we found a match and it's not set
          if (matterId && !existing.rows[0].matter_id) {
            await query(
              `UPDATE documents SET matter_id = $1 WHERE id = $2`,
              [matterId, existing.rows[0].id]
            );
            results.matched++;
            console.log(`[SYNC] Matched existing doc "${file.name}" to matter`);
          }
          results.updated++;
        } else {
          // Create new document record from Azure file with permissions
          const ext = path.extname(file.name).toLowerCase();
          const mimeType = getFileType(ext);
          
          await query(
            `INSERT INTO documents (
              firm_id, matter_id, client_id, name, original_name, type, size,
              drive_id, external_path, folder_path, uploaded_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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
              user.id
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
function matchFolderToPermissions(folderPath, matters, clients) {
  let matterId = null;
  let clientId = null;
  
  if (!folderPath || folderPath === '/') {
    return { matterId, clientId };
  }
  
  // Normalize the folder path
  const normalizedPath = folderPath.toLowerCase().replace(/[_-]/g, ' ').trim();
  const pathParts = normalizedPath.split('/').filter(p => p);
  
  // Check each part of the path for matter/client matches
  for (const part of pathParts) {
    // Skip common folder names
    if (['matters', 'clients', 'documents', 'files', 'general'].includes(part)) {
      continue;
    }
    
    // Try to match to a matter (by name or number)
    for (const matter of matters) {
      const matterName = matter.name.toLowerCase().replace(/[_-]/g, ' ').trim();
      const matterNumber = (matter.number || '').toLowerCase().trim();
      
      // Fuzzy match: check if folder contains matter name or vice versa
      if (matterName && (part.includes(matterName) || matterName.includes(part))) {
        matterId = matter.id;
        console.log(`[SYNC] Matched folder "${folderPath}" to matter "${matter.name}"`);
        break;
      }
      // Also match by matter number
      if (matterNumber && part.includes(matterNumber)) {
        matterId = matter.id;
        console.log(`[SYNC] Matched folder "${folderPath}" to matter number "${matter.number}"`);
        break;
      }
    }
    
    if (matterId) break;
    
    // Try to match to a client
    for (const client of clients) {
      const clientName = client.name.toLowerCase().replace(/[_-]/g, ' ').trim();
      
      if (clientName && (part.includes(clientName) || clientName.includes(part))) {
        clientId = client.id;
        console.log(`[SYNC] Matched folder "${folderPath}" to client "${client.name}"`);
        break;
      }
    }
  }
  
  return { matterId, clientId };
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
            size: item.properties?.contentLength || 0
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
  // OneDrive/SharePoint sync using Graph API
  // This would use stored access tokens to call Microsoft Graph
  
  const results = { synced: 0, updated: 0, errors: [] };

  // TODO: Implement Graph API sync
  // For now, return placeholder
  results.errors.push({ error: 'Cloud sync requires Microsoft Graph API setup' });

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
