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
  // Cloud-Native Architecture:
  // 1. Use delta queries to get only changed files (efficient incremental sync)
  // 2. Store delta link for subsequent syncs
  // 3. Process changes incrementally instead of full scans
  //
  // Required setup:
  // - Microsoft Graph API permissions: Files.Read.All, Sites.Read.All
  // - User's OAuth tokens stored in integrations table
  
  const results = { synced: 0, updated: 0, deleted: 0, matched: 0, errors: [] };

  try {
    // Check if user has Microsoft integration set up
    const integration = await query(
      `SELECT id, access_token, refresh_token, token_expires_at, settings
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

    let { id: integrationId, access_token, refresh_token, token_expires_at, settings } = integration.rows[0];
    settings = settings || {};

    // Check if token is expired and refresh if needed
    if (new Date(token_expires_at) < new Date()) {
      const refreshResult = await refreshMicrosoftToken(integrationId, refresh_token, user.firmId);
      if (!refreshResult.success) {
        results.errors.push({ 
          error: 'Microsoft access token expired',
          action: 'Re-authenticate in Settings → Integrations → Microsoft 365',
          code: 'TOKEN_EXPIRED'
        });
        return results;
      }
      access_token = refreshResult.access_token;
    }

    // Determine sync source (OneDrive or SharePoint)
    const syncSource = driveConfig.settings?.sync_source || 'onedrive';
    const syncPath = driveConfig.settings?.sync_path || '/';
    
    console.log(`[SYNC] Starting Microsoft ${syncSource} delta sync for firm ${user.firmId}`);
    
    // Get the delta link from previous sync (if any)
    const deltaLink = settings.delta_link || null;
    
    // Build the Graph API URL
    let graphUrl;
    if (syncSource === 'sharepoint' && driveConfig.settings?.site_id) {
      // SharePoint site sync
      const siteId = driveConfig.settings.site_id;
      const driveId = driveConfig.settings.drive_id || 'root';
      graphUrl = deltaLink || `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root/delta`;
    } else {
      // OneDrive sync
      if (syncPath && syncPath !== '/') {
        graphUrl = deltaLink || `https://graph.microsoft.com/v1.0/me/drive/root:${syncPath}:/delta`;
      } else {
        graphUrl = deltaLink || 'https://graph.microsoft.com/v1.0/me/drive/root/delta';
      }
    }
    
    // Fetch changes using delta query
    let hasMorePages = true;
    let newDeltaLink = null;
    
    while (hasMorePages) {
      const response = await fetch(graphUrl, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SYNC] Graph API error:', response.status, errorText);
        
        // If delta link is invalid, reset and do full sync
        if (response.status === 410 || response.status === 404) {
          console.log('[SYNC] Delta link expired, starting fresh sync');
          // Clear delta link and retry with fresh URL
          await query(
            `UPDATE integrations SET settings = settings - 'delta_link' WHERE id = $1`,
            [integrationId]
          );
          results.errors.push({
            error: 'Sync state reset',
            message: 'Previous sync state expired. Please sync again for a full refresh.',
            code: 'DELTA_RESET'
          });
          return results;
        }
        
        results.errors.push({ 
          error: `Graph API error: ${response.status}`,
          details: errorText.substring(0, 200)
        });
        return results;
      }
      
      const data = await response.json();
      const items = data.value || [];
      
      console.log(`[SYNC] Processing ${items.length} items from Microsoft Graph`);
      
      // Process each item (file or folder)
      for (const item of items) {
        try {
          // Skip folders
          if (item.folder) continue;
          
          // Skip items that are not files we care about
          if (!item.file) continue;
          
          const fileName = item.name;
          const ext = path.extname(fileName).toLowerCase();
          const documentTypes = [
            '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
            '.txt', '.rtf', '.odt', '.ods', '.odp', '.csv', '.md',
            '.jpg', '.jpeg', '.png', '.gif', '.tiff', '.bmp'
          ];
          
          if (!documentTypes.includes(ext)) continue;
          
          // Handle deleted items
          if (item.deleted) {
            // Mark document as deleted in our system
            await query(
              `UPDATE documents 
               SET status = 'deleted', updated_at = NOW()
               WHERE firm_id = $1 AND external_id = $2 AND external_source = 'microsoft'`,
              [user.firmId, item.id]
            );
            results.deleted++;
            continue;
          }
          
          // Get the file path
          const filePath = item.parentReference?.path?.replace('/drive/root:', '') || '/';
          const fullPath = filePath === '/' ? `/${fileName}` : `${filePath}/${fileName}`;
          
          // Check if document already exists
          const existingDoc = await query(
            `SELECT id, external_etag FROM documents 
             WHERE firm_id = $1 AND external_id = $2 AND external_source = 'microsoft'`,
            [user.firmId, item.id]
          );
          
          if (existingDoc.rows.length > 0) {
            // Update existing document if changed
            const doc = existingDoc.rows[0];
            if (doc.external_etag !== item.eTag) {
              await query(
                `UPDATE documents SET
                   name = $1,
                   file_size = $2,
                   external_etag = $3,
                   external_path = $4,
                   external_download_url = $5,
                   updated_at = NOW()
                 WHERE id = $6`,
                [
                  fileName,
                  item.size || 0,
                  item.eTag,
                  fullPath,
                  item['@microsoft.graph.downloadUrl'] || null,
                  doc.id
                ]
              );
              results.updated++;
            }
          } else {
            // Try to match to a matter based on folder path
            const matterId = await matchPathToMatter(fullPath, user.firmId);
            
            // Create new document record
            await query(
              `INSERT INTO documents (
                 firm_id, matter_id, name, original_name, file_size, mime_type,
                 folder_path, external_id, external_source, external_path, 
                 external_etag, external_download_url, status, uploaded_by, uploaded_at
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'microsoft', $9, $10, $11, 'active', $12, NOW())`,
              [
                user.firmId,
                matterId,
                fileName,
                fileName,
                item.size || 0,
                item.file?.mimeType || getFileType(ext),
                filePath,
                item.id,
                fullPath,
                item.eTag,
                item['@microsoft.graph.downloadUrl'] || null,
                user.id
              ]
            );
            results.synced++;
            if (matterId) results.matched++;
          }
        } catch (itemError) {
          console.error(`[SYNC] Error processing item ${item.name}:`, itemError.message);
          results.errors.push({ file: item.name, error: itemError.message });
        }
      }
      
      // Check for more pages or save delta link
      if (data['@odata.nextLink']) {
        graphUrl = data['@odata.nextLink'];
      } else {
        hasMorePages = false;
        newDeltaLink = data['@odata.deltaLink'];
      }
    }
    
    // Save the new delta link for next sync
    if (newDeltaLink) {
      await query(
        `UPDATE integrations 
         SET settings = COALESCE(settings, '{}'::jsonb) || $1::jsonb
         WHERE id = $2`,
        [JSON.stringify({ delta_link: newDeltaLink }), integrationId]
      );
    }
    
    console.log(`[SYNC] Microsoft sync completed: ${results.synced} new, ${results.updated} updated, ${results.deleted} deleted`);

  } catch (error) {
    console.error('[SYNC] Microsoft Cloud sync error:', error);
    results.errors.push({ error: error.message });
  }

  return results;
}

/**
 * Refresh Microsoft OAuth token
 */
async function refreshMicrosoftToken(integrationId, refreshToken, firmId) {
  try {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      console.error('[SYNC] Microsoft OAuth credentials not configured');
      return { success: false };
    }
    
    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'Files.Read.All Sites.Read.All offline_access'
      })
    });
    
    if (!response.ok) {
      console.error('[SYNC] Token refresh failed:', response.status);
      return { success: false };
    }
    
    const data = await response.json();
    
    // Update tokens in database
    const expiresAt = new Date(Date.now() + (data.expires_in * 1000));
    await query(
      `UPDATE integrations SET
         access_token = $1,
         refresh_token = COALESCE($2, refresh_token),
         token_expires_at = $3
       WHERE id = $4`,
      [data.access_token, data.refresh_token, expiresAt, integrationId]
    );
    
    return { success: true, access_token: data.access_token };
  } catch (error) {
    console.error('[SYNC] Token refresh error:', error);
    return { success: false };
  }
}

/**
 * Try to match a file path to a matter
 */
async function matchPathToMatter(filePath, firmId) {
  try {
    // Extract potential matter name from path
    // Common patterns: /ClientName/MatterName/..., /Matters/MatterName/...
    const pathParts = filePath.split('/').filter(p => p);
    
    if (pathParts.length === 0) return null;
    
    // Try matching the first few path segments against matter names
    for (let i = 0; i < Math.min(pathParts.length, 3); i++) {
      const segment = pathParts[i];
      
      // Skip common folder names
      if (['documents', 'files', 'matters', 'clients', 'legal'].includes(segment.toLowerCase())) {
        continue;
      }
      
      // Try to find a matching matter
      const matterResult = await query(
        `SELECT id FROM matters 
         WHERE firm_id = $1 AND (
           LOWER(name) LIKE $2 OR 
           LOWER(number) = $3 OR
           LOWER(name) = $4
         )
         LIMIT 1`,
        [firmId, `%${segment.toLowerCase()}%`, segment.toLowerCase(), segment.toLowerCase()]
      );
      
      if (matterResult.rows.length > 0) {
        return matterResult.rows[0].id;
      }
    }
    
    return null;
  } catch (error) {
    console.error('[SYNC] Matter matching error:', error.message);
    return null;
  }
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
