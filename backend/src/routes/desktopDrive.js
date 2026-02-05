import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import { downloadFile, uploadFileBuffer, deleteFile, ensureDirectory, listFiles, moveFile, moveFolderContents, renameFile } from '../utils/azureStorage.js';
import { analyzeDocument } from '../services/documentAI.js';

const router = Router();

// ============================================
// APEX DRIVE DESKTOP CLIENT API
// ============================================
// 
// These endpoints are specifically designed for the Apex Drive
// desktop client to provide a virtual file system experience.

// ============================================
// MATTER ENDPOINTS (Filtered by user access)
// ============================================

/**
 * Get all matters the user has access to
 * Returns matter list organized by first letter (Clio-style)
 * Structure: /A/Anderson - Personal Injury/, /B/Baker v Smith/, etc.
 */
router.get('/matters', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const firmId = req.user.firmId;
    
    console.log(`[DRIVE API] Get matters for user ${req.user.email}, firmId: ${firmId}`);
    
    // Get matters where user is assigned (via matter_permissions or as responsible attorney)
    const result = await query(`
      SELECT DISTINCT
        m.id,
        m.name,
        m.number,
        m.description,
        m.status,
        m.client_id as "clientId",
        c.display_name as "clientName",
        m.created_at as "createdAt",
        m.updated_at as "updatedAt"
      FROM matters m
      LEFT JOIN clients c ON c.id = m.client_id
      LEFT JOIN matter_permissions mp ON mp.matter_id = m.id
      WHERE m.firm_id = $1
        AND m.status != 'closed'
        AND (
          m.responsible_attorney = $2
          OR m.originating_attorney = $2
          OR m.created_by = $2
          OR mp.user_id = $2
          OR EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = $2 
            AND u.firm_id = m.firm_id 
            AND u.role IN ('owner', 'admin')
          )
        )
      ORDER BY m.name ASC
    `, [firmId, userId]);

    console.log(`[DRIVE API] Found ${result.rows.length} matters for user`);

    // Build Clio-style folder structure: first letter of MATTER NAME -> matter folders
    const letterFolders = {};
    
    result.rows.forEach(matter => {
      // Get folder name: "ClientName - MatterName" or just "MatterName"
      const folderName = matter.clientName 
        ? `${matter.clientName} - ${matter.name}`
        : matter.name;
      
      // Get first letter of MATTER NAME (not client name) - Clio-style
      const firstLetter = (matter.name.charAt(0) || 'Z').toUpperCase();
      
      if (!letterFolders[firstLetter]) {
        letterFolders[firstLetter] = [];
      }
      
      letterFolders[firstLetter].push({
        id: matter.id,
        name: matter.name,
        number: matter.number,
        folderName: folderName,
        clientName: matter.clientName,
        status: matter.status,
        createdAt: matter.createdAt,
        updatedAt: matter.updatedAt
      });
    });

    // Convert to array sorted by letter
    const structure = Object.keys(letterFolders)
      .sort()
      .map(letter => ({
        letter,
        matters: letterFolders[letter]
      }));

    res.json({ 
      matters: result.rows,
      structure,
      totalMatters: result.rows.length
    });
  } catch (error) {
    console.error('[DRIVE API] Get matters error:', error);
    res.status(500).json({ error: 'Failed to fetch matters' });
  }
});

// ============================================
// FILE LISTING ENDPOINTS
// ============================================

/**
 * List files in a matter (for virtual drive directory listing)
 * Browses Azure File Share directly to show actual files
 */
router.get('/matters/:matterId/files', authenticate, async (req, res) => {
  try {
    const { matterId } = req.params;
    const { path: subFolderPath } = req.query;
    const firmId = req.user.firmId;
    
    console.log(`[DRIVE API] List files for matter ${matterId}, firmId: ${firmId}, user: ${req.user.email}`);
    
    // Verify user has access to this matter
    const hasAccess = await verifyMatterAccess(req.user.id, matterId, firmId);
    if (!hasAccess) {
      console.log(`[DRIVE API] Access denied for user ${req.user.email} to matter ${matterId}`);
      return res.status(403).json({ error: 'Access denied to this matter' });
    }

    // Get matter info to find its folder path
    const matterResult = await query(`
      SELECT m.name, m.number, c.display_name as client_name
      FROM matters m
      LEFT JOIN clients c ON m.client_id = c.id
      WHERE m.id = $1 AND m.firm_id = $2
    `, [matterId, firmId]);

    if (matterResult.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }

    const matter = matterResult.rows[0];
    
    // Build the expected folder name (matching how matters are stored in Azure)
    const matterFolderName = matter.client_name 
      ? `${matter.client_name} - ${matter.name}`
      : (matter.number ? `${matter.number} - ${matter.name}` : matter.name);
    
    console.log(`[DRIVE API] Looking for matter folder: ${matterFolderName}`);

    // Try to browse Azure directly
    try {
      const { isAzureConfigured, getShareClient } = await import('../utils/azureStorage.js');
      
      if (await isAzureConfigured()) {
        const shareClient = await getShareClient();
        const firmFolder = `firm-${firmId}`;
        
        // Build Azure path - try multiple possible locations
        const possiblePaths = [
          `${firmFolder}/${matterFolderName}`,
          `${firmFolder}/Clients/${matter.client_name}/${matterFolderName}`,
          `${firmFolder}/Matters/${matterFolderName}`,
          matter.client_name ? `${firmFolder}/${matter.client_name}` : null,
        ].filter(Boolean);
        
        let files = [];
        let foundPath = null;
        
        for (const azurePath of possiblePaths) {
          const fullPath = subFolderPath ? `${azurePath}/${subFolderPath}` : azurePath;
          console.log(`[DRIVE API] Trying Azure path: ${fullPath}`);
          
          try {
            const dirClient = shareClient.getDirectoryClient(fullPath);
            const tempFiles = [];
            
            for await (const item of dirClient.listFilesAndDirectories()) {
              if (item.kind === 'directory') {
                tempFiles.push({
                  id: `folder-${Buffer.from(`${fullPath}/${item.name}`).toString('base64').substring(0, 32)}`,
                  name: item.name,
                  path: item.name,
                  azurePath: `${fullPath}/${item.name}`,
                  isFolder: true,
                  size: 0,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
              } else {
                let fileSize = 0;
                try {
                  const fileClient = dirClient.getFileClient(item.name);
                  const props = await fileClient.getProperties();
                  fileSize = props.contentLength || 0;
                } catch (e) { /* ignore */ }
                
                const ext = item.name.split('.').pop()?.toLowerCase() || '';
                const mimeTypes = {
                  'pdf': 'application/pdf', 'doc': 'application/msword',
                  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  'xls': 'application/vnd.ms-excel', 'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  'txt': 'text/plain', 'rtf': 'application/rtf',
                  'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
                };
                
                tempFiles.push({
                  id: `azure-${Buffer.from(`${fullPath}/${item.name}`).toString('base64').substring(0, 32)}`,
                  name: item.name,
                  path: `${fullPath}/${item.name}`,
                  azurePath: `${fullPath}/${item.name}`,
                  isFolder: false,
                  size: fileSize,
                  type: mimeTypes[ext] || 'application/octet-stream',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
              }
            }
            
            if (tempFiles.length > 0) {
              files = tempFiles;
              foundPath = fullPath;
              console.log(`[DRIVE API] Found ${files.length} items at ${fullPath}`);
              break;
            }
          } catch (e) {
            console.log(`[DRIVE API] Path ${fullPath} not found: ${e.message}`);
          }
        }
        
        if (files.length > 0) {
          return res.json({ files, source: 'azure', path: foundPath });
        }
      }
    } catch (azureErr) {
      console.log(`[DRIVE API] Azure browse failed:`, azureErr.message);
    }

    // Fallback: Get files from database
    console.log(`[DRIVE API] Falling back to database for matter ${matterId}`);
    
    const filesQuery = `
      SELECT 
        id,
        name,
        folder_path as "folderPath",
        type,
        size,
        COALESCE(external_path, path, azure_path) as "azurePath",
        uploaded_at as "createdAt",
        updated_at as "updatedAt",
        false as "isFolder"
      FROM documents
      WHERE firm_id = $1
        AND matter_id = $2
        AND status != 'deleted'
      ORDER BY folder_path ASC, name ASC
    `;

    const result = await query(filesQuery, [firmId, matterId]);
    console.log(`[DRIVE API] Found ${result.rows.length} files in database`);
    
    const files = buildFileTree(result.rows);
    res.json({ files, source: 'database' });
  } catch (error) {
    console.error('[DRIVE API] List files error:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

/**
 * Download a file (supports both database IDs and Azure paths)
 */
router.get('/files/:documentId/download', authenticate, async (req, res) => {
  try {
    const { documentId } = req.params;
    const { path: azurePathParam } = req.query;
    const firmId = req.user.firmId;

    console.log(`[DRIVE API] Download: ${documentId}, azurePath: ${azurePathParam}`);

    // If it's an Azure-direct file or has path param
    if (documentId.startsWith('azure-') || documentId.startsWith('folder-') || azurePathParam) {
      const azurePath = azurePathParam;
      if (!azurePath) {
        return res.status(400).json({ error: 'Azure path required for direct Azure files' });
      }
      
      const firmFolder = `firm-${firmId}`;
      if (!azurePath.startsWith(firmFolder)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      try {
        const relativePath = azurePath.replace(`${firmFolder}/`, '');
        const content = await downloadFile(relativePath, firmId);
        
        const fileName = azurePath.split('/').pop() || 'download';
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const mimeTypes = {
          'pdf': 'application/pdf', 'doc': 'application/msword',
          'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'xls': 'application/vnd.ms-excel', 'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'txt': 'text/plain', 'jpg': 'image/jpeg', 'png': 'image/png',
        };
        
        res.set({
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'Content-Length': content.length,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        });
        return res.send(content);
      } catch (azureErr) {
        console.error(`[DRIVE API] Azure download failed:`, azureErr);
        return res.status(404).json({ error: 'File not found' });
      }
    }

    // Standard database document download
    const docResult = await query(`
      SELECT d.*, m.id as matter_id
      FROM documents d
      LEFT JOIN matters m ON m.id = d.matter_id
      WHERE d.id = $1 AND d.firm_id = $2
    `, [documentId, firmId]);

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    // Verify access
    if (doc.matter_id) {
      const hasAccess = await verifyMatterAccess(req.user.id, doc.matter_id, firmId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Download from Azure
    const azurePath = doc.external_path || doc.azure_path || doc.path;
    if (!azurePath) {
      return res.status(404).json({ error: 'File not found in storage' });
    }

    const relativePath = azurePath.replace(`firm-${firmId}/`, '');
    const content = await downloadFile(relativePath, firmId);

    res.set({
      'Content-Type': doc.type || 'application/octet-stream',
      'Content-Length': content.length,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.name)}"`,
    });

    res.send(content);
  } catch (error) {
    console.error('[DRIVE API] Download error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

/**
 * Upload/update file content
 */
router.put('/files/:documentId/upload', authenticate, async (req, res) => {
  try {
    const { documentId } = req.params;
    const firmId = req.user.firmId;

    // Get document info
    const docResult = await query(`
      SELECT d.*, m.id as matter_id
      FROM documents d
      LEFT JOIN matters m ON m.id = d.matter_id
      WHERE d.id = $1 AND d.firm_id = $2
    `, [documentId, firmId]);

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    // Verify access
    if (doc.matter_id) {
      const hasAccess = await verifyMatterAccess(req.user.id, doc.matter_id, firmId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Get content from request body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks);

    // Upload to Azure
    const azurePath = doc.external_path || doc.path;
    const relativePath = azurePath.replace(`firm-${firmId}/`, '');
    
    await uploadFileBuffer(content, relativePath, firmId);

    // Update database
    await query(`
      UPDATE documents 
      SET size = $1, updated_at = NOW()
      WHERE id = $2
    `, [content.length, documentId]);

    // Trigger AI analysis in background (don't wait)
    analyzeDocument(documentId, firmId, req.user.id).catch(err => {
      console.log('[DRIVE API] AI analysis queued (or skipped):', err?.message || 'ok');
    });

    res.json({ success: true, size: content.length });
  } catch (error) {
    console.error('[DRIVE API] Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

/**
 * Create a new file
 */
router.post('/matters/:matterId/files', authenticate, async (req, res) => {
  try {
    const { matterId } = req.params;
    const { name, path: folderPath } = req.body;
    const firmId = req.user.firmId;

    // Verify access
    const hasAccess = await verifyMatterAccess(req.user.id, matterId, firmId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build Azure path
    const azurePath = folderPath 
      ? `firm-${firmId}/${folderPath}/${name}`
      : `firm-${firmId}/${name}`;

    // Ensure directory exists
    const dirPath = folderPath 
      ? `firm-${firmId}/${folderPath}`
      : `firm-${firmId}`;
    await ensureDirectory(dirPath);

    // Create empty file in Azure
    await uploadFileBuffer(Buffer.alloc(0), folderPath ? `${folderPath}/${name}` : name, firmId);

    // Get MIME type from extension
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const mimeType = getMimeType(ext);

    // Create database record
    const result = await query(`
      INSERT INTO documents (
        firm_id, matter_id, name, original_name, type, size,
        folder_path, external_path, uploaded_by, status, storage_location
      ) VALUES ($1, $2, $3, $3, $4, 0, $5, $6, $7, 'draft', 'azure')
      RETURNING id
    `, [firmId, matterId, name, mimeType, folderPath || '', azurePath, req.user.id]);

    const newDocId = result.rows[0].id;

    // Queue for AI analysis when content is added
    analyzeDocument(newDocId, firmId, req.user.id).catch(() => {});

    res.json({
      documentId: newDocId,
      azurePath,
      name,
    });
  } catch (error) {
    console.error('[DRIVE API] Create file error:', error);
    res.status(500).json({ error: 'Failed to create file' });
  }
});

/**
 * Delete a file
 */
router.delete('/files/:documentId', authenticate, async (req, res) => {
  try {
    const { documentId } = req.params;
    const firmId = req.user.firmId;

    // Get document info
    const docResult = await query(`
      SELECT d.*, m.id as matter_id
      FROM documents d
      LEFT JOIN matters m ON m.id = d.matter_id
      WHERE d.id = $1 AND d.firm_id = $2
    `, [documentId, firmId]);

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    // Verify access
    if (doc.matter_id) {
      const hasAccess = await verifyMatterAccess(req.user.id, doc.matter_id, firmId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Delete from Azure
    const azurePath = doc.external_path || doc.path;
    if (azurePath) {
      try {
        const relativePath = azurePath.replace(`firm-${firmId}/`, '');
        await deleteFile(relativePath, firmId);
      } catch (err) {
        console.log('[DRIVE API] Azure delete error (may not exist):', err.message);
      }
    }

    // Mark as deleted in database
    await query(`
      UPDATE documents SET status = 'deleted', updated_at = NOW()
      WHERE id = $1
    `, [documentId]);

    res.json({ success: true });
  } catch (error) {
    console.error('[DRIVE API] Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

/**
 * Rename/update a file
 */
router.patch('/files/:documentId', authenticate, async (req, res) => {
  try {
    const { documentId } = req.params;
    const { name, path: newPath } = req.body;
    const firmId = req.user.firmId;

    // Get document info
    const docResult = await query(`
      SELECT * FROM documents WHERE id = $1 AND firm_id = $2
    `, [documentId, firmId]);

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];
    const oldExternalPath = doc.external_path;

    // Build update
    const updates = [];
    const values = [];
    let paramIndex = 1;
    let newExternalPath = oldExternalPath;

    // Handle rename
    if (name && name !== doc.name) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
      
      // Update external path with new filename
      if (oldExternalPath) {
        const pathParts = oldExternalPath.split('/');
        pathParts[pathParts.length - 1] = name;
        newExternalPath = pathParts.join('/');
      }
    }

    // Handle move to new folder
    if (newPath !== undefined && newPath !== doc.folder_path) {
      updates.push(`folder_path = $${paramIndex++}`);
      values.push(newPath);
      
      // Build new external path
      const fileName = name || doc.name;
      newExternalPath = newPath 
        ? `firm-${firmId}/${newPath}/${fileName}`
        : `firm-${firmId}/${fileName}`;
    }

    // Move file in Azure if path changed
    if (oldExternalPath && newExternalPath !== oldExternalPath) {
      try {
        // Extract paths relative to firm folder
        const oldRelativePath = oldExternalPath.replace(`firm-${firmId}/`, '');
        const newRelativePath = newExternalPath.replace(`firm-${firmId}/`, '');
        
        console.log(`[DRIVE API] Moving file in Azure: ${oldRelativePath} -> ${newRelativePath}`);
        await moveFile(oldRelativePath, newRelativePath, firmId);
        
        // Update external path in database
        updates.push(`external_path = $${paramIndex++}`);
        values.push(newExternalPath);
      } catch (azureError) {
        console.error('[DRIVE API] Azure move failed:', azureError.message);
        // Continue with database update even if Azure move fails
        // The file might not exist in Azure (externally stored)
      }
    }

    if (updates.length === 0) {
      return res.json({ success: true });
    }

    updates.push('updated_at = NOW()');
    values.push(documentId);

    await query(`
      UPDATE documents SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
    `, values);

    res.json({ success: true, newPath: newExternalPath });
  } catch (error) {
    console.error('[DRIVE API] Update file error:', error);
    res.status(500).json({ error: 'Failed to update file' });
  }
});

// ============================================
// FOLDER ENDPOINTS
// ============================================

/**
 * Create a folder
 */
router.post('/matters/:matterId/folders', authenticate, async (req, res) => {
  try {
    const { matterId } = req.params;
    const { name, path: parentPath } = req.body;
    const firmId = req.user.firmId;

    // Verify access
    const hasAccess = await verifyMatterAccess(req.user.id, matterId, firmId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build folder path
    const folderPath = parentPath 
      ? `firm-${firmId}/${parentPath}/${name}`
      : `firm-${firmId}/${name}`;

    // Create in Azure
    await ensureDirectory(folderPath);

    res.json({
      folderId: null, // Folders are virtual in Azure File Share
      path: folderPath,
    });
  } catch (error) {
    console.error('[DRIVE API] Create folder error:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

/**
 * Delete a folder
 */
router.delete('/matters/:matterId/folders', authenticate, async (req, res) => {
  try {
    const { matterId } = req.params;
    const { path: folderPath } = req.body;
    const firmId = req.user.firmId;

    // Verify access
    const hasAccess = await verifyMatterAccess(req.user.id, matterId, firmId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if folder is empty
    const filesInFolder = await query(`
      SELECT COUNT(*) FROM documents
      WHERE firm_id = $1 AND matter_id = $2 AND folder_path LIKE $3
    `, [firmId, matterId, `${folderPath}%`]);

    if (parseInt(filesInFolder.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Folder is not empty' });
    }

    // Azure folders are virtual - they're deleted when empty
    res.json({ success: true });
  } catch (error) {
    console.error('[DRIVE API] Delete folder error:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

/**
 * Rename/move a folder
 */
router.patch('/matters/:matterId/folders', authenticate, async (req, res) => {
  try {
    const { matterId } = req.params;
    const { oldPath, newPath } = req.body;
    const firmId = req.user.firmId;

    // Verify access
    const hasAccess = await verifyMatterAccess(req.user.id, matterId, firmId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get all documents that will be affected
    const docsResult = await query(`
      SELECT id, name, folder_path, external_path
      FROM documents
      WHERE firm_id = $1 AND matter_id = $2 AND folder_path LIKE $3
    `, [firmId, matterId, `${oldPath}%`]);

    console.log(`[DRIVE API] Renaming folder affects ${docsResult.rows.length} documents`);

    // Move files in Azure first
    const oldAzurePath = `firm-${firmId}/${oldPath}`;
    const newAzurePath = `firm-${firmId}/${newPath}`;
    
    let azureMoveResult = { success: true, movedCount: 0, errors: [] };
    try {
      azureMoveResult = await moveFolderContents(oldAzurePath, newAzurePath);
      console.log(`[DRIVE API] Azure folder move: ${azureMoveResult.movedCount} files moved`);
    } catch (azureError) {
      console.error('[DRIVE API] Azure folder move failed:', azureError.message);
      // Continue with database update - files might be external or not in Azure
    }

    // Update all documents in the folder (database)
    await query(`
      UPDATE documents
      SET folder_path = REPLACE(folder_path, $1, $2),
          external_path = REPLACE(external_path, $1, $2),
          updated_at = NOW()
      WHERE firm_id = $3 AND matter_id = $4 AND folder_path LIKE $5
    `, [oldPath, newPath, firmId, matterId, `${oldPath}%`]);

    res.json({ 
      success: true, 
      documentsUpdated: docsResult.rows.length,
      azureFilesMoved: azureMoveResult.movedCount,
      azureErrors: azureMoveResult.errors.length
    });
  } catch (error) {
    console.error('[DRIVE API] Rename folder error:', error);
    res.status(500).json({ error: 'Failed to rename folder' });
  }
});

// ============================================
// SYNC ENDPOINTS
// ============================================

/**
 * Get sync status
 */
router.get('/sync/status', authenticate, async (req, res) => {
  try {
    const firmId = req.user.firmId;

    // Get last sync time for this user
    const syncResult = await query(`
      SELECT last_sync_at FROM drive_sync_status
      WHERE firm_id = $1 AND user_id = $2
    `, [firmId, req.user.id]);

    res.json({
      lastSync: syncResult.rows[0]?.last_sync_at || null,
      pendingChanges: 0,
      syncInProgress: false,
    });
  } catch (error) {
    console.error('[DRIVE API] Sync status error:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

/**
 * Get changes since timestamp
 */
router.get('/sync/changes', authenticate, async (req, res) => {
  try {
    const { since } = req.query;
    const firmId = req.user.firmId;

    // Get documents changed since the given timestamp
    const changesResult = await query(`
      SELECT 
        id as "documentId",
        matter_id as "matterId",
        external_path as "path",
        CASE 
          WHEN status = 'deleted' THEN 'delete'
          WHEN uploaded_at > $1 THEN 'create'
          ELSE 'update'
        END as type,
        updated_at as timestamp
      FROM documents
      WHERE firm_id = $2 AND updated_at > $1
      ORDER BY updated_at ASC
      LIMIT 1000
    `, [since || '1970-01-01', firmId]);

    res.json({ changes: changesResult.rows });
  } catch (error) {
    console.error('[DRIVE API] Get changes error:', error);
    res.status(500).json({ error: 'Failed to get changes' });
  }
});

/**
 * Report local changes
 */
router.post('/sync/changes', authenticate, async (req, res) => {
  try {
    const { changes } = req.body;
    
    // Process changes (if needed for tracking)
    console.log(`[DRIVE API] Received ${changes?.length || 0} local changes`);

    res.json({ success: true });
  } catch (error) {
    console.error('[DRIVE API] Report changes error:', error);
    res.status(500).json({ error: 'Failed to report changes' });
  }
});

// ============================================
// DESKTOP CLIENT REGISTRATION
// ============================================

/**
 * Register desktop client
 */
router.post('/desktop/register', authenticate, async (req, res) => {
  try {
    const { deviceName, platform, version } = req.body;
    const userId = req.user.id;
    const firmId = req.user.firmId;

    // Insert or update client registration
    const result = await query(`
      INSERT INTO desktop_clients (
        user_id, firm_id, device_name, platform, app_version, last_seen_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id, device_name) DO UPDATE SET
        platform = $4,
        app_version = $5,
        last_seen_at = NOW()
      RETURNING id
    `, [userId, firmId, deviceName, platform, version]);

    res.json({ clientId: result.rows[0].id });
  } catch (error) {
    // If table doesn't exist, just return a generated ID
    console.log('[DRIVE API] Desktop client registration (table may not exist):', error.message);
    res.json({ clientId: `${req.user.id}-${Date.now()}` });
  }
});

/**
 * Heartbeat
 */
router.post('/desktop/:clientId/heartbeat', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;

    await query(`
      UPDATE desktop_clients SET last_seen_at = NOW()
      WHERE id = $1 AND user_id = $2
    `, [clientId, req.user.id]).catch(() => {});

    res.json({ success: true });
  } catch (error) {
    res.json({ success: true });
  }
});

/**
 * Deregister desktop client
 */
router.delete('/desktop/:clientId', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;

    await query(`
      DELETE FROM desktop_clients
      WHERE id = $1 AND user_id = $2
    `, [clientId, req.user.id]).catch(() => {});

    res.json({ success: true });
  } catch (error) {
    res.json({ success: true });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

async function verifyMatterAccess(userId, matterId, firmId) {
  const result = await query(`
    SELECT 1 FROM matters m
    LEFT JOIN matter_permissions mp ON mp.matter_id = m.id
    WHERE m.id = $1 AND m.firm_id = $2
      AND (
        m.responsible_attorney = $3
        OR m.originating_attorney = $3
        OR m.created_by = $3
        OR mp.user_id = $3
        OR EXISTS (
          SELECT 1 FROM users u 
          WHERE u.id = $3 
          AND u.firm_id = m.firm_id 
          AND u.role IN ('owner', 'admin')
        )
      )
    LIMIT 1
  `, [matterId, firmId, userId]);

  return result.rows.length > 0;
}

function buildFileTree(files) {
  // Group files by folder path
  const folderMap = new Map();
  const rootFiles = [];

  for (const file of files) {
    const folderPath = file.folderPath || '';
    
    if (!folderPath) {
      rootFiles.push({
        id: file.id,
        name: file.name,
        path: file.azurePath,
        azurePath: file.azurePath,
        size: file.size,
        type: file.type,
        isFolder: false,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      });
      continue;
    }

    // Get or create folder structure
    const pathParts = folderPath.split('/').filter(p => p);
    let currentPath = '';
    
    for (const part of pathParts) {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (!folderMap.has(currentPath)) {
        folderMap.set(currentPath, {
          id: currentPath,
          name: part,
          path: currentPath,
          isFolder: true,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
          children: [],
          parentPath,
        });
      }
    }

    // Add file to its folder
    const folder = folderMap.get(folderPath);
    if (folder) {
      folder.children.push({
        id: file.id,
        name: file.name,
        path: file.azurePath,
        azurePath: file.azurePath,
        size: file.size,
        type: file.type,
        isFolder: false,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      });
    }
  }

  // Build tree from folder map
  const result = [...rootFiles];
  
  for (const [path, folder] of folderMap) {
    if (!folder.parentPath) {
      result.push(folder);
    } else {
      const parent = folderMap.get(folder.parentPath);
      if (parent) {
        parent.children.push(folder);
      }
    }
  }

  return result;
}

function getMimeType(ext) {
  const types = {
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
  };
  return types[ext] || 'application/octet-stream';
}

export default router;
