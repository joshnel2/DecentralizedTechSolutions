/**
 * Apex Drive Background Sync Service
 * 
 * Syncs Azure File Share to database so documents saved from mapped drives
 * appear on the Documents page and are accessible by AI.
 * 
 * KEY DESIGN:
 * - Each user has their own Azure folder: firm-{firmId}/users/{userId}/
 * - When the sync finds a file in a user's folder, it attributes it to that user
 * - Privacy is 'private' by default (only the user who saved it can see it)
 * - Text content is extracted for AI access
 * - Runs every 60 seconds to catch files saved from Word quickly
 * - Also syncs legacy firm-wide folders for backward compatibility
 */

import { query } from '../db/connection.js';
import path from 'path';

let syncInterval = null;
const SYNC_INTERVAL_MS = 60 * 1000; // 60 seconds - fast enough to feel "instant"
const TEXT_EXTRACT_BATCH_SIZE = 5; // Extract text for max 5 docs per sync cycle

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

// File extensions we can extract text from
const TEXT_EXTRACTABLE = new Set([
  '.pdf', '.docx', '.doc', '.txt', '.md', '.json', '.csv', '.xml', '.html',
  '.rtf', '.msg', '.eml', '.htm'
]);

/**
 * Scan a directory in Azure File Share recursively
 */
async function scanAzureDirectory(shareClient, dirPath, relativePath = '') {
  const files = [];
  
  try {
    const dirClient = shareClient.getDirectoryClient(dirPath);
    
    for await (const item of dirClient.listFilesAndDirectories()) {
      const fullPath = dirPath ? `${dirPath}/${item.name}` : item.name;
      const relPath = relativePath ? `${relativePath}/${item.name}` : item.name;
      
      if (item.kind === 'directory') {
        const subFiles = await scanAzureDirectory(shareClient, fullPath, relPath);
        files.push(...subFiles);
      } else {
        files.push({
          name: item.name,
          fullAzurePath: fullPath,
          relativePath: relPath,
          folderPath: relativePath,
          size: item.properties?.contentLength || 0,
          lastModified: item.properties?.lastModified || null,
          etag: item.properties?.etag || null,
        });
      }
    }
  } catch (err) {
    // Directory might not exist - that's OK
    const isNotFound = err.message?.includes('ResourceNotFound') || 
                       err.message?.includes('does not exist') ||
                       err.statusCode === 404;
    if (!isNotFound) {
      console.log(`[DRIVE SYNC] Could not scan ${dirPath}: ${err.message}`);
    }
  }
  
  return files;
}

/**
 * Try to match a folder path to a matter
 */
function matchFolderToMatter(folderPath, mattersByName, mattersByNumber) {
  if (!folderPath) return null;
  
  const parts = folderPath.split('/').filter(p => p);
  
  for (const part of parts) {
    const partLower = part.toLowerCase();
    
    // Skip known non-matter folders
    if (['my documents', 'matters', 'clients', 'users'].includes(partLower)) continue;
    
    // Try "matter-{uuid}" format
    if (partLower.startsWith('matter-')) {
      const matterId = part.substring(7);
      // We'd need a matterById map for this, skip for now
    }
    
    // Try direct name match
    if (mattersByName.has(partLower)) {
      return mattersByName.get(partLower);
    }
    
    // Try number match
    if (mattersByNumber.has(partLower)) {
      return mattersByNumber.get(partLower);
    }
    
    // Try "Number - Name" format (e.g., "2024-001 - Smith Case")
    const dashMatch = part.match(/^([^\s-]+)\s*-\s*(.+)$/);
    if (dashMatch) {
      const possibleNumber = dashMatch[1].toLowerCase();
      const possibleName = dashMatch[2].toLowerCase().trim();
      if (mattersByNumber.has(possibleNumber)) {
        return mattersByNumber.get(possibleNumber);
      }
      if (mattersByName.has(possibleName)) {
        return mattersByName.get(possibleName);
      }
    }
    
    // Try normalized match (remove special characters)
    const normalized = partLower.replace(/[^a-z0-9]/g, '');
    if (normalized.length > 3 && mattersByName.has(normalized)) {
      return mattersByName.get(normalized);
    }
  }
  
  return null;
}

/**
 * Sync a single firm's per-user folders from Azure to database.
 * This is the primary sync path - scans firm-{firmId}/users/{userId}/ folders.
 */
async function syncFirmUserFolders(firmId, shareClient) {
  const firmFolder = `firm-${firmId}`;
  const usersPath = `${firmFolder}/users`;
  
  const results = { 
    firmId, 
    usersScanned: 0,
    filesFound: 0, 
    inserted: 0, 
    updated: 0, 
    unchanged: 0,
    matched: 0,
    textExtracted: 0,
  };
  
  // Pre-load matters for folder-to-matter matching
  const mattersResult = await query(
    `SELECT id, name, number FROM matters WHERE firm_id = $1`,
    [firmId]
  );
  const mattersByName = new Map();
  const mattersByNumber = new Map();
  for (const m of mattersResult.rows) {
    if (m.name) {
      mattersByName.set(m.name.toLowerCase(), m);
      mattersByName.set(m.name.toLowerCase().replace(/[^a-z0-9]/g, ''), m);
    }
    if (m.number) mattersByNumber.set(m.number.toLowerCase(), m);
  }
  
  // List user folders under firm-{firmId}/users/
  let userFolders = [];
  try {
    const usersDirClient = shareClient.getDirectoryClient(usersPath);
    for await (const item of usersDirClient.listFilesAndDirectories()) {
      if (item.kind === 'directory') {
        userFolders.push(item.name); // This is the userId
      }
    }
  } catch (err) {
    // users/ directory might not exist yet - that's fine
    const isNotFound = err.message?.includes('ResourceNotFound') || 
                       err.message?.includes('does not exist') ||
                       err.statusCode === 404;
    if (!isNotFound) {
      console.log(`[DRIVE SYNC] Error listing user folders for firm ${firmId}: ${err.message}`);
    }
    return results;
  }
  
  // Validate these are real user IDs
  if (userFolders.length > 0) {
    const userCheck = await query(
      `SELECT id FROM users WHERE firm_id = $1 AND id = ANY($2)`,
      [firmId, userFolders]
    );
    const validUserIds = new Set(userCheck.rows.map(r => r.id));
    userFolders = userFolders.filter(id => validUserIds.has(id));
  }
  
  results.usersScanned = userFolders.length;
  
  // Get all existing Azure-synced documents for this firm in one query
  let existingDocs;
  try {
    existingDocs = await query(
      `SELECT id, external_path, matter_id, size, external_etag, owner_id, content_text IS NOT NULL as has_content
       FROM documents WHERE firm_id = $1 AND external_path LIKE $2`,
      [firmId, `${firmFolder}/users/%`]
    );
  } catch (err) {
    existingDocs = await query(
      `SELECT id, external_path, matter_id, size, owner_id
       FROM documents WHERE firm_id = $1 AND external_path LIKE $2`,
      [firmId, `${firmFolder}/users/%`]
    );
  }
  const existingByPath = new Map(existingDocs.rows.map(r => [r.external_path, r]));
  
  // Process each user's folder
  for (const userId of userFolders) {
    const userDirPath = `${usersPath}/${userId}`;
    
    // Scan all files in this user's folder
    const files = await scanAzureDirectory(shareClient, userDirPath, '');
    results.filesFound += files.length;
    
    for (const file of files) {
      try {
        const ext = path.extname(file.name).toLowerCase();
        const mimeType = MIME_TYPES[ext.replace('.', '')] || 'application/octet-stream';
        
        // Try to match folder to a matter
        const matchedMatter = matchFolderToMatter(file.folderPath, mattersByName, mattersByNumber);
        const matterId = matchedMatter?.id || null;
        if (matterId) results.matched++;
        
        // Full Azure path for this file
        const azurePath = file.fullAzurePath;
        const existing = existingByPath.get(azurePath);
        
        // Determine folder path relative to user root (for display)
        const displayFolderPath = file.folderPath || 'My Documents';
        
        if (existing) {
          // File already in DB - check if it changed
          const hasChanged = (
            (file.etag && existing.external_etag && file.etag !== existing.external_etag) ||
            (file.size && existing.size && file.size !== existing.size)
          );
          
          if (hasChanged) {
            // File changed - update metadata and clear content for re-extraction
            await query(
              `UPDATE documents SET 
                name = $1, size = $2, external_etag = $3, 
                folder_path = $4, matter_id = COALESCE($5, matter_id),
                content_text = NULL, content_extracted_at = NULL,
                updated_at = NOW(),
                version = COALESCE(version, 0) + 1,
                version_count = COALESCE(version_count, 0) + 1
               WHERE id = $6`,
              [file.name, file.size, file.etag, displayFolderPath, matterId, existing.id]
            );
            
            // Create a version record for the change
            try {
              const currentVersion = await query(
                `SELECT COALESCE(MAX(version_number), 0) + 1 as next FROM document_versions WHERE document_id = $1`,
                [existing.id]
              );
              const nextVersion = currentVersion.rows[0]?.next || 1;
              
              await query(
                `INSERT INTO document_versions (
                  document_id, firm_id, version_number, change_summary, change_type,
                  file_size, storage_type, created_by, created_by_name, source
                ) VALUES ($1, $2, $3, 'File updated on drive', 'drive_save', $4, 'azure', $5, 'Drive Sync', 'drive_sync')`,
                [existing.id, firmId, nextVersion, file.size, userId]
              );
            } catch (vErr) {
              // Version creation is non-critical
              console.log(`[DRIVE SYNC] Could not create version for ${file.name}: ${vErr.message}`);
            }
            
            results.updated++;
          } else if (matterId && !existing.matter_id) {
            // Not changed but we found a matter match
            await query(
              `UPDATE documents SET matter_id = $1, privacy_level = 'team', updated_at = NOW() WHERE id = $2`,
              [matterId, existing.id]
            );
            results.matched++;
          } else {
            results.unchanged++;
          }
          
          // Remove from map so we know it still exists
          existingByPath.delete(azurePath);
        } else {
          // New file - create document record attributed to this user
          const privacyLevel = matterId ? 'team' : 'private';
          
          try {
            await query(
              `INSERT INTO documents (
                firm_id, name, original_name, type, size, path, folder_path,
                external_path, external_etag, storage_location,
                uploaded_by, owner_id, privacy_level, status, matter_id
              ) VALUES ($1, $2, $2, $3, $4, $5, $6, $5, $7, 'azure', $8, $8, $9, 'final', $10)`,
              [
                firmId, file.name, mimeType, file.size,
                azurePath, displayFolderPath, file.etag,
                userId, // attributed to the user whose folder it's in
                privacyLevel, matterId
              ]
            );
          } catch (insertErr) {
            // Fallback without storage_location column
            await query(
              `INSERT INTO documents (
                firm_id, name, original_name, type, size, path, folder_path,
                external_path, external_etag,
                uploaded_by, owner_id, privacy_level, status, matter_id
              ) VALUES ($1, $2, $2, $3, $4, $5, $6, $5, $7, $8, $8, $9, 'final', $10)`,
              [
                firmId, file.name, mimeType, file.size,
                azurePath, displayFolderPath, file.etag,
                userId, privacyLevel, matterId
              ]
            );
          }
          results.inserted++;
        }
      } catch (err) {
        console.log(`[DRIVE SYNC] Error processing ${file.fullAzurePath}: ${err.message}`);
      }
    }
  }
  
  // Don't delete docs that were in user folders but are now missing -
  // they might have been moved, and deleting DB records is destructive.
  // Instead, just log if there are orphaned records.
  const orphanedCount = Array.from(existingByPath.values()).length;
  if (orphanedCount > 0) {
    console.log(`[DRIVE SYNC] Firm ${firmId}: ${orphanedCount} documents in DB no longer found in Azure user folders`);
  }
  
  return results;
}

/**
 * Also sync legacy firm-wide folders (backward compatibility).
 * Files in firm-{firmId}/documents/, firm-{firmId}/Matters/, etc.
 * These get attributed to a firm admin.
 */
async function syncFirmLegacyFolders(firmId, shareClient) {
  const firmFolder = `firm-${firmId}`;
  const results = { filesFound: 0, inserted: 0, updated: 0, matched: 0 };
  
  // Pre-load matters
  const mattersResult = await query(
    `SELECT id, name, number FROM matters WHERE firm_id = $1`,
    [firmId]
  );
  const mattersByName = new Map();
  const mattersByNumber = new Map();
  for (const m of mattersResult.rows) {
    if (m.name) {
      mattersByName.set(m.name.toLowerCase(), m);
      mattersByName.set(m.name.toLowerCase().replace(/[^a-z0-9]/g, ''), m);
    }
    if (m.number) mattersByNumber.set(m.number.toLowerCase(), m);
  }
  
  // Scan top-level directories that are NOT "users"
  const topLevelDirs = [];
  try {
    const firmDirClient = shareClient.getDirectoryClient(firmFolder);
    for await (const item of firmDirClient.listFilesAndDirectories()) {
      if (item.kind === 'directory' && item.name.toLowerCase() !== 'users') {
        topLevelDirs.push(item.name);
      }
      // Also handle files directly in firm root
      if (item.kind === 'file') {
        topLevelDirs.push(null); // Signal to scan firm root for files
      }
    }
  } catch (err) {
    return results;
  }
  
  // Get admin user for attribution
  const adminResult = await query(
    `SELECT id FROM users WHERE firm_id = $1 AND role IN ('owner', 'admin') ORDER BY role ASC LIMIT 1`,
    [firmId]
  );
  const adminId = adminResult.rows[0]?.id || null;
  if (!adminId) return results; // No admin, skip
  
  // Scan each legacy directory
  for (const dirName of topLevelDirs) {
    if (!dirName) continue; // Skip root file signal for now
    
    const dirPath = `${firmFolder}/${dirName}`;
    const files = await scanAzureDirectory(shareClient, dirPath, dirName);
    results.filesFound += files.length;
    
    // Get existing docs for these paths
    const existingResult = await query(
      `SELECT id, external_path, matter_id FROM documents WHERE firm_id = $1 AND external_path LIKE $2`,
      [firmId, `${dirPath}/%`]
    );
    const existingByPath = new Map(existingResult.rows.map(r => [r.external_path, r]));
    
    for (const file of files) {
      try {
        const ext = path.extname(file.name).toLowerCase();
        const mimeType = MIME_TYPES[ext.replace('.', '')] || 'application/octet-stream';
        const matchedMatter = matchFolderToMatter(file.folderPath, mattersByName, mattersByNumber);
        const matterId = matchedMatter?.id || null;
        
        const azurePath = file.fullAzurePath;
        const existing = existingByPath.get(azurePath);
        
        if (existing) {
          // Update matter if newly matched
          if (matterId && !existing.matter_id) {
            await query(
              `UPDATE documents SET matter_id = $1, updated_at = NOW() WHERE id = $2`,
              [matterId, existing.id]
            );
            results.matched++;
          }
          results.updated++;
        } else {
          // New file in legacy location - attribute to admin
          const privacyLevel = matterId ? 'team' : 'firm';
          try {
            await query(
              `INSERT INTO documents (
                firm_id, name, original_name, type, size, path, folder_path,
                external_path, external_etag, storage_location,
                uploaded_by, owner_id, privacy_level, status, matter_id
              ) VALUES ($1, $2, $2, $3, $4, $5, $6, $5, $7, 'azure', $8, $8, $9, 'final', $10)`,
              [
                firmId, file.name, mimeType, file.size,
                azurePath, file.folderPath, file.etag,
                adminId, privacyLevel, matterId
              ]
            );
          } catch {
            await query(
              `INSERT INTO documents (
                firm_id, name, original_name, type, size, path, folder_path,
                external_path, external_etag,
                uploaded_by, owner_id, privacy_level, status, matter_id
              ) VALUES ($1, $2, $2, $3, $4, $5, $6, $5, $7, $8, $8, $9, 'final', $10)`,
              [
                firmId, file.name, mimeType, file.size,
                azurePath, file.folderPath, file.etag,
                adminId, privacyLevel, matterId
              ]
            );
          }
          results.inserted++;
          if (matterId) results.matched++;
        }
      } catch (err) {
        // Skip individual errors
      }
    }
  }
  
  return results;
}

/**
 * Extract text content for recently synced documents that don't have content yet.
 * This makes them searchable by AI.
 */
async function extractTextForSyncedDocuments() {
  let extracted = 0;
  
  try {
    // Find documents synced from Azure that don't have text content yet
    const docsResult = await query(
      `SELECT id, name, original_name, external_path, firm_id, type
       FROM documents 
       WHERE content_text IS NULL 
         AND content_extracted_at IS NULL
         AND external_path IS NOT NULL
         AND external_path LIKE '%/users/%'
       ORDER BY uploaded_at DESC
       LIMIT $1`,
      [TEXT_EXTRACT_BATCH_SIZE]
    );
    
    if (docsResult.rows.length === 0) return 0;
    
    // Lazy-load extraction tools
    const { downloadFile, isAzureConfigured } = await import('../utils/azureStorage.js');
    const { extractTextFromFile } = await import('../routes/documents.js');
    
    if (!(await isAzureConfigured())) return 0;
    
    const fs = await import('fs/promises');
    const os = await import('os');
    const pathModule = await import('path');
    
    for (const doc of docsResult.rows) {
      try {
        const ext = pathModule.default.extname(doc.name || '').toLowerCase();
        
        // Skip non-extractable formats
        if (!TEXT_EXTRACTABLE.has(ext)) {
          // Mark as attempted so we don't retry
          await query(
            `UPDATE documents SET content_extracted_at = NOW() WHERE id = $1`,
            [doc.id]
          );
          continue;
        }
        
        // Extract firm ID from the external path to get the correct download path
        // external_path format: firm-{firmId}/users/{userId}/...
        const firmPrefix = `firm-${doc.firm_id}/`;
        let downloadPath = doc.external_path;
        if (downloadPath.startsWith(firmPrefix)) {
          downloadPath = downloadPath.substring(firmPrefix.length);
        }
        
        // Download from Azure to temp file
        const buffer = await downloadFile(downloadPath, doc.firm_id);
        
        if (!buffer || buffer.length === 0) {
          await query(
            `UPDATE documents SET content_extracted_at = NOW() WHERE id = $1`,
            [doc.id]
          );
          continue;
        }
        
        // Write to temp file for extraction
        const tempDir = os.default.tmpdir();
        const tempPath = pathModule.default.join(tempDir, `apex-extract-${doc.id}${ext}`);
        await fs.default.writeFile(tempPath, buffer);
        
        // Extract text
        const textContent = await extractTextFromFile(tempPath, doc.name || doc.original_name);
        
        // Clean up temp file
        try { await fs.default.unlink(tempPath); } catch {}
        
        if (textContent && textContent.trim().length > 0) {
          // Store extracted text (limit to 200K chars)
          const limitedContent = textContent.substring(0, 200000);
          await query(
            `UPDATE documents SET content_text = $1, content_extracted_at = NOW(), size = COALESCE(NULLIF(size, 0), $2) WHERE id = $3`,
            [limitedContent, buffer.length, doc.id]
          );
          extracted++;
          console.log(`[DRIVE SYNC] Extracted text from "${doc.name}" (${limitedContent.length} chars)`);
        } else {
          // Mark as attempted
          await query(
            `UPDATE documents SET content_extracted_at = NOW() WHERE id = $1`,
            [doc.id]
          );
        }
      } catch (err) {
        console.log(`[DRIVE SYNC] Text extraction failed for "${doc.name}": ${err.message}`);
        // Mark as attempted so we don't retry forever
        try {
          await query(
            `UPDATE documents SET content_extracted_at = NOW() WHERE id = $1`,
            [doc.id]
          );
        } catch {}
      }
    }
  } catch (err) {
    console.error('[DRIVE SYNC] Text extraction batch error:', err.message);
  }
  
  return extracted;
}

/**
 * Run sync for all firms
 */
async function runSync() {
  try {
    // Check if Azure is configured
    const { isAzureConfigured, getShareClient } = await import('../utils/azureStorage.js');
    
    if (!(await isAzureConfigured())) {
      return; // Silently skip - no need to log every 60s
    }
    
    const shareClient = await getShareClient();
    
    // Get all firms
    const firmsResult = await query(`SELECT id FROM firms`);
    
    for (const firm of firmsResult.rows) {
      try {
        // Primary: sync per-user folders
        const userResults = await syncFirmUserFolders(firm.id, shareClient);
        
        // Secondary: sync legacy firm-wide folders (backward compat)
        const legacyResults = await syncFirmLegacyFolders(firm.id, shareClient);
        
        const totalNew = userResults.inserted + legacyResults.inserted;
        const totalUpdated = userResults.updated + legacyResults.updated;
        const totalFiles = userResults.filesFound + legacyResults.filesFound;
        
        // Only log when there's something interesting
        if (totalNew > 0 || totalUpdated > 0) {
          console.log(`[DRIVE SYNC] Firm ${firm.id}: ${totalFiles} files (${totalNew} new, ${totalUpdated} updated, ${userResults.usersScanned} user folders, ${userResults.matched + legacyResults.matched} matched to matters)`);
        }
      } catch (err) {
        console.error(`[DRIVE SYNC] Error syncing firm ${firm.id}:`, err.message);
      }
    }
    
    // Extract text for recently synced documents (for AI access)
    const textExtracted = await extractTextForSyncedDocuments();
    if (textExtracted > 0) {
      console.log(`[DRIVE SYNC] Extracted text from ${textExtracted} documents for AI access`);
    }
    
  } catch (error) {
    console.error('[DRIVE SYNC] Sync error:', error.message);
  }
}

/**
 * Start the background sync service
 */
export function startDriveSync() {
  console.log('[DRIVE SYNC] Starting per-user drive sync service (every 60s)...');
  
  // Run initial sync after a short delay (let server start first)
  setTimeout(() => {
    runSync().catch(err => console.error('[DRIVE SYNC] Initial sync error:', err));
  }, 5000);
  
  // Schedule periodic sync - every 60 seconds
  syncInterval = setInterval(() => {
    runSync().catch(err => console.error('[DRIVE SYNC] Periodic sync error:', err));
  }, SYNC_INTERVAL_MS);
  
  console.log(`[DRIVE SYNC] Scheduled to run every ${SYNC_INTERVAL_MS / 1000} seconds`);
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
    const userResults = await syncFirmUserFolders(firmId, shareClient);
    const legacyResults = await syncFirmLegacyFolders(firmId, shareClient);
    
    return {
      usersScanned: userResults.usersScanned,
      filesFound: userResults.filesFound + legacyResults.filesFound,
      inserted: userResults.inserted + legacyResults.inserted,
      updated: userResults.updated + legacyResults.updated,
      matched: userResults.matched + legacyResults.matched,
      textExtracted: userResults.textExtracted || 0,
    };
  } catch (error) {
    return { error: error.message };
  }
}

export default { startDriveSync, stopDriveSync, syncFirm };
