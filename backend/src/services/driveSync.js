/**
 * Apex Drive Background Sync Service
 * Syncs Azure File Share to database for instant loading
 */

import { query } from '../db/connection.js';

let syncInterval = null;
const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// MIME type mapping
const MIME_TYPES = {
  'pdf': 'application/pdf',
  'doc': 'application/msword',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'ppt': 'application/vnd.ms-powerpoint',
  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'txt': 'text/plain',
  'rtf': 'application/rtf',
  'csv': 'text/csv',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'msg': 'application/vnd.ms-outlook',
  'eml': 'message/rfc822',
  'zip': 'application/zip',
  'html': 'text/html',
  'htm': 'text/html',
  'tiff': 'image/tiff',
  'tif': 'image/tiff'
};

/**
 * Sync a single firm's files from Azure to database
 */
async function syncFirmFiles(firmId, shareClient) {
  const firmFolder = `firm-${firmId}`;
  const files = [];
  
  async function scanDirectory(dirPath, relativePath = '') {
    try {
      const dirClient = shareClient.getDirectoryClient(dirPath);
      
      for await (const item of dirClient.listFilesAndDirectories()) {
        const fullPath = dirPath ? `${dirPath}/${item.name}` : item.name;
        const relPath = relativePath ? `${relativePath}/${item.name}` : item.name;
        
        if (item.kind === 'directory') {
          await scanDirectory(fullPath, relPath);
        } else {
          const ext = item.name.split('.').pop()?.toLowerCase() || '';
          const lastSlash = relPath.lastIndexOf('/');
          
          files.push({
            name: item.name,
            type: MIME_TYPES[ext] || 'application/octet-stream',
            size: item.properties?.contentLength || 0,
            folderPath: lastSlash > 0 ? relPath.substring(0, lastSlash) : '',
            azurePath: fullPath
          });
        }
      }
    } catch (err) {
      // Directory might not exist, that's OK
      if (!err.message?.includes('ResourceNotFound')) {
        console.log(`[SYNC] Could not scan ${dirPath}: ${err.message}`);
      }
    }
  }
  
  await scanDirectory(firmFolder, '');
  
  if (files.length === 0) {
    return { firmId, filesFound: 0, synced: 0 };
  }
  
  // Get existing files for this firm (handle case where storage_location column might not exist yet)
  let existingResult;
  try {
    existingResult = await query(
      `SELECT id, external_path FROM documents WHERE firm_id = $1 AND storage_location = 'azure'`,
      [firmId]
    );
  } catch (err) {
    // Fallback if storage_location column doesn't exist
    existingResult = await query(
      `SELECT id, external_path FROM documents WHERE firm_id = $1 AND external_path IS NOT NULL`,
      [firmId]
    );
  }
  const existingPaths = new Map(existingResult.rows.map(r => [r.external_path, r.id]));
  
  let inserted = 0;
  let updated = 0;
  
  // Process files in batches
  for (const file of files) {
    try {
      if (existingPaths.has(file.azurePath)) {
        // Update existing
        await query(
          `UPDATE documents SET name = $1, type = $2, size = $3, folder_path = $4, updated_at = NOW()
           WHERE id = $5`,
          [file.name, file.type, file.size, file.folderPath, existingPaths.get(file.azurePath)]
        );
        existingPaths.delete(file.azurePath); // Mark as seen
        updated++;
      } else {
        // Insert new - get a system user or first admin for the firm
        const adminResult = await query(
          `SELECT id FROM users WHERE firm_id = $1 AND role IN ('owner', 'admin') LIMIT 1`,
          [firmId]
        );
        const uploadedBy = adminResult.rows[0]?.id || null;
        
        // Try with storage_location, fallback without it
        try {
          await query(
            `INSERT INTO documents (firm_id, name, original_name, type, size, folder_path, external_path, storage_location, uploaded_by, path)
             VALUES ($1, $2, $2, $3, $4, $5, $6, 'azure', $7, $6)`,
            [firmId, file.name, file.type, file.size, file.folderPath, file.azurePath, uploadedBy]
          );
        } catch (insertErr) {
          // Fallback without storage_location
          await query(
            `INSERT INTO documents (firm_id, name, original_name, type, size, folder_path, external_path, uploaded_by, path)
             VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $6)`,
            [firmId, file.name, file.type, file.size, file.folderPath, file.azurePath, uploadedBy]
          );
        }
        inserted++;
      }
    } catch (err) {
      // Skip individual file errors
    }
  }
  
  // Remove files that no longer exist in Azure
  const removedPaths = Array.from(existingPaths.keys());
  if (removedPaths.length > 0) {
    await query(
      `DELETE FROM documents WHERE firm_id = $1 AND external_path = ANY($2)`,
      [firmId, removedPaths]
    );
  }
  
  return { 
    firmId, 
    filesFound: files.length, 
    inserted, 
    updated, 
    removed: removedPaths.length 
  };
}

/**
 * Run sync for all firms
 */
async function runSync() {
  console.log('[DRIVE SYNC] Starting background sync...');
  
  try {
    // Check if Azure is configured
    const { isAzureConfigured, getShareClient } = await import('../utils/azureStorage.js');
    
    if (!(await isAzureConfigured())) {
      console.log('[DRIVE SYNC] Azure not configured, skipping sync');
      return;
    }
    
    const shareClient = await getShareClient();
    
    // Get all firms
    const firmsResult = await query(`SELECT id FROM firms WHERE status = 'active' OR status IS NULL`);
    
    console.log(`[DRIVE SYNC] Syncing ${firmsResult.rows.length} firms...`);
    
    for (const firm of firmsResult.rows) {
      try {
        const result = await syncFirmFiles(firm.id, shareClient);
        if (result.filesFound > 0) {
          console.log(`[DRIVE SYNC] Firm ${firm.id}: ${result.filesFound} files (${result.inserted} new, ${result.updated} updated, ${result.removed} removed)`);
        }
      } catch (err) {
        console.error(`[DRIVE SYNC] Error syncing firm ${firm.id}:`, err.message);
      }
    }
    
    console.log('[DRIVE SYNC] Sync complete');
    
  } catch (error) {
    console.error('[DRIVE SYNC] Sync error:', error.message);
  }
}

/**
 * Start the background sync service
 */
export function startDriveSync() {
  console.log('[DRIVE SYNC] Starting background sync service...');
  
  // Run initial sync after a short delay (let server start first)
  setTimeout(() => {
    runSync().catch(err => console.error('[DRIVE SYNC] Initial sync error:', err));
  }, 5000);
  
  // Schedule periodic sync
  syncInterval = setInterval(() => {
    runSync().catch(err => console.error('[DRIVE SYNC] Periodic sync error:', err));
  }, SYNC_INTERVAL_MS);
  
  console.log(`[DRIVE SYNC] Scheduled to run every ${SYNC_INTERVAL_MS / 60000} minutes`);
}

/**
 * Stop the background sync service
 */
export function stopDriveSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[DRIVE SYNC] Stopped background sync service');
  }
}

/**
 * Manually trigger sync for a specific firm
 */
export async function syncFirm(firmId) {
  try {
    const { isAzureConfigured, getShareClient } = await import('../utils/azureStorage.js');
    
    if (!(await isAzureConfigured())) {
      return { error: 'Azure not configured' };
    }
    
    const shareClient = await getShareClient();
    return await syncFirmFiles(firmId, shareClient);
  } catch (error) {
    return { error: error.message };
  }
}

export default { startDriveSync, stopDriveSync, syncFirm };
