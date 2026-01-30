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
 * Also attempts to match files to matters based on folder structure
 */
async function syncFirmFiles(firmId, shareClient) {
  const firmFolder = `firm-${firmId}`;
  const files = [];
  
  // Pre-load matters for this firm for matching
  const mattersResult = await query(`
    SELECT id, name, number, 
           LOWER(name) as name_lower, 
           LOWER(number) as number_lower
    FROM matters WHERE firm_id = $1
  `, [firmId]);
  
  // Build lookup maps for matter matching
  const matterByName = new Map();
  const matterByNumber = new Map();
  const matterById = new Map();
  
  for (const m of mattersResult.rows) {
    matterById.set(m.id, m);
    if (m.name) {
      matterByName.set(m.name_lower, m);
      // Also try normalized name (remove special chars)
      const normalized = m.name_lower.replace(/[^a-z0-9]/g, '');
      matterByName.set(normalized, m);
    }
    if (m.number) {
      matterByNumber.set(m.number_lower, m);
    }
  }
  
  // Function to try to match a folder path to a matter
  function matchFolderToMatter(folderPath) {
    if (!folderPath) return null;
    
    // Split path and try each part
    const parts = folderPath.split('/').filter(p => p);
    
    for (const part of parts) {
      const partLower = part.toLowerCase();
      
      // Try to match "matter-{uuid}" format
      if (partLower.startsWith('matter-')) {
        const matterId = part.substring(7);
        if (matterById.has(matterId)) {
          return matterById.get(matterId);
        }
      }
      
      // Try direct name match
      if (matterByName.has(partLower)) {
        return matterByName.get(partLower);
      }
      
      // Try number match
      if (matterByNumber.has(partLower)) {
        return matterByNumber.get(partLower);
      }
      
      // Try normalized match (remove special characters)
      const normalized = partLower.replace(/[^a-z0-9]/g, '');
      if (normalized.length > 3 && matterByName.has(normalized)) {
        return matterByName.get(normalized);
      }
      
      // Try "Number - Name" format (e.g., "2024-001 - Smith Case")
      const dashMatch = part.match(/^([^\s-]+)\s*-\s*(.+)$/);
      if (dashMatch) {
        const possibleNumber = dashMatch[1].toLowerCase();
        const possibleName = dashMatch[2].toLowerCase();
        if (matterByNumber.has(possibleNumber)) {
          return matterByNumber.get(possibleNumber);
        }
        if (matterByName.has(possibleName)) {
          return matterByName.get(possibleName);
        }
      }
    }
    
    return null;
  }
  
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
          const folderPath = lastSlash > 0 ? relPath.substring(0, lastSlash) : '';
          
          // Try to match this file's folder to a matter
          const matchedMatter = matchFolderToMatter(folderPath);
          
          files.push({
            name: item.name,
            type: MIME_TYPES[ext] || 'application/octet-stream',
            size: item.properties?.contentLength || 0,
            folderPath: folderPath,
            azurePath: fullPath,
            matterId: matchedMatter?.id || null,
            matterName: matchedMatter?.name || null
          });
        }
      }
    } catch (err) {
      // Directory might not exist, that's OK - don't log for non-existent folders
      const isNotFound = err.message?.includes('ResourceNotFound') || 
                         err.message?.includes('does not exist') ||
                         err.statusCode === 404;
      if (!isNotFound) {
        console.log(`[SYNC] Could not scan ${dirPath}: ${err.message}`);
      }
    }
  }
  
  await scanDirectory(firmFolder, '');
  
  if (files.length === 0) {
    return { firmId, filesFound: 0, synced: 0, matched: 0 };
  }
  
  // Get existing files for this firm (handle case where storage_location column might not exist yet)
  let existingResult;
  try {
    existingResult = await query(
      `SELECT id, external_path, matter_id FROM documents WHERE firm_id = $1 AND storage_location = 'azure'`,
      [firmId]
    );
  } catch (err) {
    // Fallback if storage_location column doesn't exist
    existingResult = await query(
      `SELECT id, external_path, matter_id FROM documents WHERE firm_id = $1 AND external_path IS NOT NULL`,
      [firmId]
    );
  }
  const existingPaths = new Map(existingResult.rows.map(r => [r.external_path, { id: r.id, matterId: r.matter_id }]));
  
  let inserted = 0;
  let updated = 0;
  let matched = 0;
  
  // Get default admin for uploads
  const adminResult = await query(
    `SELECT id FROM users WHERE firm_id = $1 AND role IN ('owner', 'admin') LIMIT 1`,
    [firmId]
  );
  const uploadedBy = adminResult.rows[0]?.id || null;
  
  // Process files in batches
  for (const file of files) {
    try {
      const existing = existingPaths.get(file.azurePath);
      
      if (existing) {
        // Update existing - also update matter_id if we found a match and it wasn't set before
        const shouldUpdateMatter = file.matterId && !existing.matterId;
        
        if (shouldUpdateMatter) {
          await query(
            `UPDATE documents SET name = $1, type = $2, size = $3, folder_path = $4, matter_id = $5, updated_at = NOW()
             WHERE id = $6`,
            [file.name, file.type, file.size, file.folderPath, file.matterId, existing.id]
          );
          matched++;
        } else {
          await query(
            `UPDATE documents SET name = $1, type = $2, size = $3, folder_path = $4, updated_at = NOW()
             WHERE id = $5`,
            [file.name, file.type, file.size, file.folderPath, existing.id]
          );
        }
        existingPaths.delete(file.azurePath); // Mark as seen
        updated++;
      } else {
        // Insert new with matter_id if we found a match
        try {
          await query(
            `INSERT INTO documents (firm_id, name, original_name, type, size, folder_path, external_path, storage_location, uploaded_by, path, matter_id)
             VALUES ($1, $2, $2, $3, $4, $5, $6, 'azure', $7, $6, $8)`,
            [firmId, file.name, file.type, file.size, file.folderPath, file.azurePath, uploadedBy, file.matterId]
          );
          if (file.matterId) matched++;
        } catch (insertErr) {
          // Fallback without storage_location or matter_id
          try {
            await query(
              `INSERT INTO documents (firm_id, name, original_name, type, size, folder_path, external_path, uploaded_by, path, matter_id)
               VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $6, $8)`,
              [firmId, file.name, file.type, file.size, file.folderPath, file.azurePath, uploadedBy, file.matterId]
            );
            if (file.matterId) matched++;
          } catch (e2) {
            // Final fallback without matter_id column
            await query(
              `INSERT INTO documents (firm_id, name, original_name, type, size, folder_path, external_path, uploaded_by, path)
               VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $6)`,
              [firmId, file.name, file.type, file.size, file.folderPath, file.azurePath, uploadedBy]
            );
          }
        }
        inserted++;
      }
    } catch (err) {
      console.log(`[SYNC] Error processing file ${file.name}: ${err.message}`);
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
    removed: removedPaths.length,
    matched
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
    const firmsResult = await query(`SELECT id FROM firms`);
    
    console.log(`[DRIVE SYNC] Syncing ${firmsResult.rows.length} firms...`);
    
    for (const firm of firmsResult.rows) {
      try {
        const result = await syncFirmFiles(firm.id, shareClient);
        if (result.filesFound > 0) {
          console.log(`[DRIVE SYNC] Firm ${firm.id}: ${result.filesFound} files (${result.inserted} new, ${result.updated} updated, ${result.removed} removed, ${result.matched || 0} matched to matters)`);
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
