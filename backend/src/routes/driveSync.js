import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

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
  // Azure File Share sync
  // In production, this would use the Azure Storage SDK
  // For now, it works with mounted network paths
  
  const rootPath = driveConfig.root_path;
  const results = { synced: 0, updated: 0, errors: [] };

  try {
    // Check if path is accessible (assumes Azure Files is mounted)
    await fs.access(rootPath);
    
    // Recursively scan for documents
    const files = await scanDirectory(rootPath, rootPath);
    
    for (const file of files) {
      try {
        // Check if document already exists
        const existing = await query(
          `SELECT id, content_hash FROM documents 
           WHERE drive_id = $1 AND external_id = $2`,
          [driveConfig.id, file.relativePath]
        );

        // Calculate file hash for change detection
        const fileBuffer = await fs.readFile(file.fullPath);
        const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');

        if (existing.rows.length > 0) {
          // Update if changed
          if (existing.rows[0].content_hash !== hash) {
            await query(
              `UPDATE documents SET 
                content_hash = $1, 
                external_modified_at = $2,
                size = $3
               WHERE id = $4`,
              [hash, file.mtime, file.size, existing.rows[0].id]
            );
            results.updated++;
          }
        } else {
          // Create new document record
          await query(
            `INSERT INTO documents (
              firm_id, name, original_name, type, size, path,
              drive_id, external_id, folder_path, content_hash,
              external_modified_at, uploaded_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              user.firmId,
              file.name,
              file.name,
              file.type,
              file.size,
              file.fullPath,
              driveConfig.id,
              file.relativePath,
              file.folderPath,
              hash,
              file.mtime,
              user.id
            ]
          );
          results.synced++;
        }
      } catch (fileError) {
        results.errors.push({ file: file.relativePath, error: fileError.message });
      }
    }
  } catch (error) {
    results.errors.push({ error: `Cannot access drive: ${error.message}` });
  }

  return results;
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
