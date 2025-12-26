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
