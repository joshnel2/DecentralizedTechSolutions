import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { buildDocumentAccessFilter, FULL_ACCESS_ROLES, canAccessDocument } from '../middleware/documentAccess.js';
import { ensureDirectory, isAzureConfigured, getAzureConfig } from '../utils/azureStorage.js';
import { 
  uploadVersion as uploadVersionToBlob, 
  downloadVersion as downloadVersionFromBlob,
  rehydrateVersion,
  isBlobConfigured,
  listVersions as listBlobVersions
} from '../utils/azureBlobStorage.js';
import crypto from 'crypto';
import path from 'path';

const router = Router();

// Azure Storage configuration - loaded dynamically from platform settings or env vars
// Use getAzureConfig() for actual values to support admin portal configuration
const AZURE_FILE_SHARE_DEFAULT = process.env.AZURE_FILE_SHARE_NAME || 'apexdrive';

// Helper: Get firm folder path
function getFirmFolderPath(firmId) {
  return `firm-${firmId}`;
}

// Helper: Get matter folder path
function getMatterFolderPath(firmId, matterId) {
  return `firm-${firmId}/matter-${matterId}`;
}

// Helper: Create folder in Azure File Share using the actual Azure SDK
async function ensureFirmFolder(firmId) {
  const folderPath = getFirmFolderPath(firmId);
  try {
    const azureConfigured = await isAzureConfigured();
    if (azureConfigured) {
      await ensureDirectory(folderPath);
      console.log(`[AZURE] Created folder: ${folderPath}`);
    } else {
      console.log(`[AZURE] Not configured, would create folder: ${folderPath}`);
    }
  } catch (error) {
    console.error(`[AZURE] Failed to create folder ${folderPath}:`, error.message);
  }
  return folderPath;
}

async function ensureMatterFolder(firmId, matterId) {
  const folderPath = getMatterFolderPath(firmId, matterId);
  try {
    const azureConfigured = await isAzureConfigured();
    if (azureConfigured) {
      await ensureDirectory(folderPath);
      console.log(`[AZURE] Created matter folder: ${folderPath}`);
    } else {
      console.log(`[AZURE] Not configured, would create folder: ${folderPath}`);
    }
  } catch (error) {
    console.error(`[AZURE] Failed to create matter folder ${folderPath}:`, error.message);
  }
  return folderPath;
}

// ============================================
// DRIVE CONFIGURATION ENDPOINTS
// ============================================

// Get all drive configurations for the firm
router.get('/configurations', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT dc.*, 
              u.first_name || ' ' || u.last_name as created_by_name,
              (SELECT COUNT(*) FROM documents WHERE drive_id = dc.id) as document_count
       FROM drive_configurations dc
       LEFT JOIN users u ON dc.created_by = u.id
       WHERE dc.firm_id = $1
         AND (dc.user_id IS NULL OR dc.user_id = $2)
       ORDER BY dc.is_default DESC, dc.created_at ASC`,
      [req.user.firmId, req.user.id]
    );

    res.json({
      drives: result.rows.map(d => ({
        id: d.id,
        name: d.name,
        driveType: d.drive_type,
        rootPath: d.root_path,
        syncEnabled: d.sync_enabled,
        syncIntervalMinutes: d.sync_interval_minutes,
        syncDirection: d.sync_direction,
        autoVersionOnSave: d.auto_version_on_save,
        conflictResolution: d.conflict_resolution,
        isDefault: d.is_default,
        allowPersonalFolders: d.allow_personal_folders,
        status: d.status,
        lastSyncAt: d.last_sync_at,
        lastSyncStatus: d.last_sync_status,
        lastError: d.last_error,
        isPersonal: !!d.user_id,
        documentCount: parseInt(d.document_count) || 0,
        settings: d.settings,
        createdAt: d.created_at,
        createdBy: d.created_by,
        createdByName: d.created_by_name,
      }))
    });
  } catch (error) {
    console.error('Get drive configurations error:', error);
    res.status(500).json({ error: 'Failed to get drive configurations' });
  }
});

// Get a single drive configuration
router.get('/configurations/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM drive_configurations 
       WHERE id = $1 AND firm_id = $2`,
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Drive configuration not found' });
    }

    const d = result.rows[0];
    res.json({
      id: d.id,
      name: d.name,
      driveType: d.drive_type,
      rootPath: d.root_path,
      syncEnabled: d.sync_enabled,
      syncIntervalMinutes: d.sync_interval_minutes,
      syncDirection: d.sync_direction,
      autoVersionOnSave: d.auto_version_on_save,
      conflictResolution: d.conflict_resolution,
      isDefault: d.is_default,
      status: d.status,
      lastSyncAt: d.last_sync_at,
      settings: d.settings,
    });
  } catch (error) {
    console.error('Get drive configuration error:', error);
    res.status(500).json({ error: 'Failed to get drive configuration' });
  }
});

// ============================================
// GET AZURE FILE SHARE CONNECTION INFO (Admin only)
// ============================================
// Returns the direct path for admins to map their firm's folder
router.get('/connection-info', authenticate, async (req, res) => {
  try {
    // Only admins can get connection info
    if (!['admin', 'owner', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get Azure config from platform settings or env vars
    const azureConfig = await getAzureConfig();
    
    if (!azureConfig) {
      return res.json({
        configured: false,
        message: 'Azure File Share is not configured. Documents are stored locally on the server.',
      });
    }

    const { accountName, accountKey, shareName } = azureConfig;
    const firmId = req.user.firmId;
    const firmFolder = `firm-${firmId}`;

    // Get firm name for display
    const firmResult = await query(
      `SELECT name FROM firms WHERE id = $1`,
      [firmId]
    );
    const firmName = firmResult.rows[0]?.name || 'Your Firm';

    res.json({
      configured: true,
      firmId,
      firmName,
      firmFolder,
      storageAccount: accountName,
      shareName: shareName,
      
      // Direct paths for mapping the drive
      paths: {
        windows: `\\\\${accountName}.file.core.windows.net\\${shareName}\\${firmFolder}`,
        mac: `smb://${accountName}.file.core.windows.net/${shareName}/${firmFolder}`,
        linux: `//${accountName}.file.core.windows.net/${shareName}/${firmFolder}`,
        azurePortal: `https://portal.azure.com/#view/Microsoft_Azure_Storage/FileShareMenuBlade/~/overview/storageAccountId/%2Fsubscriptions%2F{subscriptionId}%2FresourceGroups%2F{resourceGroup}%2Fproviders%2FMicrosoft.Storage%2FstorageAccounts%2F${accountName}/path/${shareName}/protocol/SMB`,
      },
      
      // Folder structure info
      structure: {
        root: firmFolder,
        matters: `${firmFolder}/Matters/{ClientName}/{MatterNumber - MatterName}`,
        clients: `${firmFolder}/Clients/{ClientName}`,
        versions: `${firmFolder}/versions/{documentId}`,
      },
      
      // Connection instructions
      instructions: {
        windows: [
          '1. Open File Explorer',
          '2. Right-click "This PC" → "Map network drive"',
          '3. Choose a drive letter (e.g., Z:)',
          `4. Folder: \\\\${accountName}.file.core.windows.net\\${shareName}\\${firmFolder}`,
          '5. Check "Connect using different credentials"',
          '6. Click "Finish"',
          `7. Username: AZURE\\${accountName}`,
          '8. Password: (Your storage account access key)',
        ],
        mac: [
          '1. Open Finder',
          '2. Press Cmd+K (Connect to Server)',
          `3. Enter: smb://${accountName}.file.core.windows.net/${shareName}/${firmFolder}`,
          '4. Click "Connect"',
          `5. Username: ${accountName}`,
          '6. Password: (Your storage account access key)',
        ],
        powershell: [
          '# Run in PowerShell as Admin:',
          `$connectTestResult = Test-NetConnection -ComputerName ${accountName}.file.core.windows.net -Port 445`,
          `cmd.exe /C "cmdkey /add:\`"${accountName}.file.core.windows.net\`" /user:\`"AZURE\\${accountName}\`" /pass:\`"YOUR_STORAGE_KEY\`""`,
          `New-PSDrive -Name Z -PSProvider FileSystem -Root "\\\\${accountName}.file.core.windows.net\\${shareName}\\${firmFolder}" -Persist`,
        ],
      },
      
      // Note about credentials
      credentialNote: 'The storage account access key can be found in Azure Portal → Storage Account → Access keys. Share this only with authorized admins.',
    });
  } catch (error) {
    console.error('Get connection info error:', error);
    res.status(500).json({ error: 'Failed to get connection info' });
  }
});

// Create a new drive configuration (admin only for firm drives)
router.post('/configurations', authenticate, async (req, res) => {
  try {
    const {
      name,
      driveType = 'local',
      rootPath,
      syncEnabled = true,
      syncIntervalMinutes = 5,
      syncDirection = 'bidirectional',
      autoVersionOnSave = true,
      conflictResolution = 'ask_user',
      isDefault = false,
      allowPersonalFolders = true,
      isPersonal = false,
      settings = {}
    } = req.body;

    if (!name || !rootPath) {
      return res.status(400).json({ error: 'Name and root path are required' });
    }

    // Only admins can create firm-wide drives
    if (!isPersonal && !['owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admins can create firm-wide drives' });
    }

    // If setting as default, unset any existing default first
    if (isDefault && !isPersonal) {
      await query(
        `UPDATE drive_configurations SET is_default = false 
         WHERE firm_id = $1 AND is_default = true AND user_id IS NULL`,
        [req.user.firmId]
      );
    }

    const result = await query(
      `INSERT INTO drive_configurations (
        firm_id, user_id, name, drive_type, root_path,
        sync_enabled, sync_interval_minutes, sync_direction,
        auto_version_on_save, conflict_resolution, is_default,
        allow_personal_folders, settings, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        req.user.firmId,
        isPersonal ? req.user.id : null,
        name,
        driveType,
        rootPath,
        syncEnabled,
        syncIntervalMinutes,
        syncDirection,
        autoVersionOnSave,
        conflictResolution,
        isDefault && !isPersonal,
        allowPersonalFolders,
        JSON.stringify(settings),
        req.user.id
      ]
    );

    const d = result.rows[0];

    // Create firm folder in Azure when enabling Apex Drive
    if (driveType === 'azure_files' && !isPersonal) {
      try {
        await ensureFirmFolder(req.user.firmId);
        console.log(`[APEX DRIVE] Created folder for firm ${req.user.firmId}`);
      } catch (folderError) {
        console.error('[APEX DRIVE] Failed to create firm folder:', folderError);
        // Don't fail the whole request, folder can be created later
      }
    }

    // Log action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'drive.configured', 'drive', $3, $4)`,
      [req.user.firmId, req.user.id, d.id, JSON.stringify({ name, driveType, isPersonal })]
    );

    res.status(201).json({
      id: d.id,
      name: d.name,
      driveType: d.drive_type,
      rootPath: d.root_path,
      status: d.status,
      isDefault: d.is_default,
      createdAt: d.created_at,
      firmFolder: getFirmFolderPath(req.user.firmId),
    });
  } catch (error) {
    console.error('Create drive configuration error:', error);
    res.status(500).json({ error: 'Failed to create drive configuration' });
  }
});

// Update drive configuration
router.put('/configurations/:id', authenticate, async (req, res) => {
  try {
    const existing = await query(
      `SELECT * FROM drive_configurations WHERE id = $1 AND firm_id = $2`,
      [req.params.id, req.user.firmId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Drive configuration not found' });
    }

    const drive = existing.rows[0];

    // Only admins can update firm-wide drives, users can update their own
    if (!drive.user_id && !['owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admins can update firm-wide drives' });
    }

    if (drive.user_id && drive.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Cannot update another user\'s drive' });
    }

    const {
      name,
      rootPath,
      syncEnabled,
      syncIntervalMinutes,
      syncDirection,
      autoVersionOnSave,
      conflictResolution,
      isDefault,
      allowPersonalFolders,
      settings
    } = req.body;

    // If setting as default, unset any existing default
    if (isDefault && !drive.user_id) {
      await query(
        `UPDATE drive_configurations SET is_default = false 
         WHERE firm_id = $1 AND is_default = true AND user_id IS NULL AND id != $2`,
        [req.user.firmId, req.params.id]
      );
    }

    const result = await query(
      `UPDATE drive_configurations SET
        name = COALESCE($1, name),
        root_path = COALESCE($2, root_path),
        sync_enabled = COALESCE($3, sync_enabled),
        sync_interval_minutes = COALESCE($4, sync_interval_minutes),
        sync_direction = COALESCE($5, sync_direction),
        auto_version_on_save = COALESCE($6, auto_version_on_save),
        conflict_resolution = COALESCE($7, conflict_resolution),
        is_default = COALESCE($8, is_default),
        allow_personal_folders = COALESCE($9, allow_personal_folders),
        settings = COALESCE($10, settings),
        updated_at = NOW()
      WHERE id = $11
      RETURNING *`,
      [
        name, rootPath, syncEnabled, syncIntervalMinutes, syncDirection,
        autoVersionOnSave, conflictResolution, 
        isDefault !== undefined && !drive.user_id ? isDefault : drive.is_default,
        allowPersonalFolders,
        settings ? JSON.stringify(settings) : null,
        req.params.id
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update drive configuration error:', error);
    res.status(500).json({ error: 'Failed to update drive configuration' });
  }
});

// Delete drive configuration
router.delete('/configurations/:id', authenticate, async (req, res) => {
  try {
    const existing = await query(
      `SELECT * FROM drive_configurations WHERE id = $1 AND firm_id = $2`,
      [req.params.id, req.user.firmId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Drive configuration not found' });
    }

    const drive = existing.rows[0];

    // Only admins can delete firm-wide drives
    if (!drive.user_id && !['owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admins can delete firm-wide drives' });
    }

    // Remove drive_id reference from documents (don't delete documents)
    await query(
      `UPDATE documents SET drive_id = NULL WHERE drive_id = $1`,
      [req.params.id]
    );

    await query(
      `DELETE FROM drive_configurations WHERE id = $1`,
      [req.params.id]
    );

    res.json({ message: 'Drive configuration deleted' });
  } catch (error) {
    console.error('Delete drive configuration error:', error);
    res.status(500).json({ error: 'Failed to delete drive configuration' });
  }
});

// ============================================
// DOCUMENT VERSION ENDPOINTS
// ============================================

// Get version history for a document
// Cloud-native: Uses Clio-style permission inheritance but with efficient single-query checks
router.get('/documents/:documentId/versions', authenticate, async (req, res) => {
  try {
    const documentId = req.params.documentId;
    
    // Check document access using Clio-style permission system
    // This checks: admin role, uploader, owner, matter permissions, explicit permissions, group permissions
    const access = await canAccessDocument(
      req.user.id,
      req.user.role,
      documentId,
      req.user.firmId,
      'view'
    );

    if (!access.hasAccess) {
      // Return 404 instead of 403 to avoid leaking document existence
      return res.status(404).json({ error: 'Document not found' });
    }

    // Get document name
    const docResult = await query(
      `SELECT id, name FROM documents WHERE id = $1 AND firm_id = $2`,
      [documentId, req.user.firmId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const result = await query(
      `SELECT dv.*, 
              u.first_name || ' ' || u.last_name as created_by_name
       FROM document_versions dv
       LEFT JOIN users u ON dv.created_by = u.id
       WHERE dv.document_id = $1
       ORDER BY dv.version_number DESC`,
      [documentId]
    );

    // Get blob tier info if using Azure Blob storage
    let blobTiers = {};
    const useBlobStorage = await isBlobConfigured();
    if (useBlobStorage) {
      try {
        const blobVersions = await listBlobVersions(req.user.firmId, documentId);
        blobVersions.forEach(bv => {
          blobTiers[bv.versionNumber] = {
            tier: bv.tier,
            archived: bv.tier === 'Archive',
            rehydrating: bv.archiveStatus === 'rehydrate-pending-to-hot'
          };
        });
      } catch (e) {
        // Blob listing failed, just don't include tier info
        console.log('[VERSIONS] Could not get blob tiers:', e.message);
      }
    }

    res.json({
      documentId,
      documentName: docResult.rows[0].name,
      accessReason: access.reason, // Helps debugging/auditing
      versions: result.rows.map(v => {
        const tierInfo = blobTiers[v.version_number] || {};
        return {
          id: v.id,
          versionNumber: v.version_number,
          versionLabel: v.version_label,
          changeSummary: v.change_summary,
          changeType: v.change_type,
          wordCount: v.word_count,
          characterCount: v.character_count,
          wordsAdded: v.words_added,
          wordsRemoved: v.words_removed,
          fileSize: v.file_size,
          createdBy: v.created_by,
          createdByName: v.created_by_name,
          createdAt: v.created_at,
          source: v.source,
          // Storage tier info (only for blob-stored versions)
          storageType: v.storage_type || 'database',
          tier: tierInfo.tier || (v.storage_type === 'azure_blob' ? 'Hot' : null),
          archived: tierInfo.archived || false,
          rehydrating: tierInfo.rehydrating || false
        };
      })
    });
  } catch (error) {
    console.error('Get versions error:', error);
    res.status(500).json({ error: 'Failed to get document versions' });
  }
});

// Get a specific version's content
// Cloud-native: Fetches from Azure Blob if stored there, handles archive tier gracefully
router.get('/documents/:documentId/versions/:versionId/content', authenticate, async (req, res) => {
  try {
    const documentId = req.params.documentId;
    const firmId = req.user.firmId;
    
    // Check document access - need 'view' permission to read version content
    const access = await canAccessDocument(
      req.user.id,
      req.user.role,
      documentId,
      firmId,
      'view'
    );

    if (!access.hasAccess) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const result = await query(
      `SELECT dv.* FROM document_versions dv
       JOIN documents d ON dv.document_id = d.id
       WHERE dv.id = $1 AND d.firm_id = $2 AND dv.document_id = $3`,
      [req.params.versionId, firmId, documentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const v = result.rows[0];

    // Check where content is stored
    if (v.storage_type === 'azure_blob' && v.content_url) {
      // Fetch from Azure Blob Storage
      try {
        const blobResult = await downloadVersionFromBlob(firmId, documentId, v.version_number);
        
        if (blobResult.needsRehydration) {
          // Version is in archive tier - needs to be retrieved
          return res.status(202).json({
            id: v.id,
            versionNumber: v.version_number,
            contentHash: v.content_hash,
            content: null,
            archived: true,
            rehydrationPending: blobResult.rehydrationPending || false,
            message: blobResult.message,
            tier: blobResult.tier,
            // Provide action to initiate retrieval
            rehydrateUrl: `/api/drive/documents/${documentId}/versions/${v.version_number}/rehydrate`
          });
        }

        if (blobResult.notFound) {
          // Blob missing but DB says it should be there - try DB fallback
          if (v.content_text) {
            return res.json({
              id: v.id,
              versionNumber: v.version_number,
              content: v.content_text,
              contentHash: v.content_hash,
              tier: 'database_fallback'
            });
          }
          return res.status(404).json({ error: 'Version content not found' });
        }

        // Successfully retrieved from blob
        const content = blobResult.content.toString('utf-8');
        return res.json({
          id: v.id,
          versionNumber: v.version_number,
          content,
          contentHash: v.content_hash,
          tier: blobResult.tier,
          size: blobResult.size
        });
      } catch (blobError) {
        console.error('[VERSION] Blob download failed:', blobError.message);
        // Fall back to database if available
        if (v.content_text) {
          return res.json({
            id: v.id,
            versionNumber: v.version_number,
            content: v.content_text,
            contentHash: v.content_hash,
            tier: 'database_fallback'
          });
        }
        throw blobError;
      }
    }

    // Content is in database
    res.json({
      id: v.id,
      versionNumber: v.version_number,
      content: v.content_text,
      contentHash: v.content_hash,
      tier: 'database'
    });
  } catch (error) {
    console.error('Get version content error:', error);
    res.status(500).json({ error: 'Failed to get version content' });
  }
});

// Initiate rehydration for an archived version
router.post('/documents/:documentId/versions/:versionNumber/rehydrate', authenticate, async (req, res) => {
  try {
    const { documentId, versionNumber } = req.params;
    const firmId = req.user.firmId;

    // Check document access
    const access = await canAccessDocument(
      req.user.id,
      req.user.role,
      documentId,
      firmId,
      'view'
    );

    if (!access.hasAccess) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Initiate rehydration
    const result = await rehydrateVersion(firmId, documentId, parseInt(versionNumber));

    // Log activity
    await query(
      `INSERT INTO document_activities (document_id, firm_id, action, user_id, user_name, details)
       VALUES ($1, $2, 'version_rehydrate', $3, $4, $5)`,
      [
        documentId,
        firmId,
        req.user.id,
        `${req.user.firstName} ${req.user.lastName}`,
        JSON.stringify({ versionNumber: parseInt(versionNumber) })
      ]
    );

    // TODO: Create notification for when rehydration completes
    // This would use Azure Event Grid or polling

    res.json({
      success: result.initiated,
      message: result.message,
      estimatedTime: '1-15 hours',
      versionNumber: parseInt(versionNumber)
    });
  } catch (error) {
    console.error('Rehydration error:', error);
    res.status(500).json({ error: 'Failed to initiate version retrieval' });
  }
});

// Create a new version (called on save)
// Cloud-native: Stores content in Azure Blob (cheap, tiered), metadata in PostgreSQL (fast queries)
router.post('/documents/:documentId/versions', authenticate, async (req, res) => {
  try {
    const { content, versionLabel, changeSummary, changeType = 'edit' } = req.body;
    const documentId = req.params.documentId;
    const firmId = req.user.firmId;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Verify document access (outside transaction for early exit)
    const docResult = await query(
      `SELECT * FROM documents WHERE id = $1 AND firm_id = $2`,
      [documentId, firmId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    // Calculate content hash
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');

    // Check if content actually changed (outside transaction for early exit)
    const latestVersionCheck = await query(
      `SELECT content_hash FROM document_versions 
       WHERE document_id = $1 ORDER BY version_number DESC LIMIT 1`,
      [documentId]
    );

    if (latestVersionCheck.rows.length > 0 && latestVersionCheck.rows[0].content_hash === contentHash) {
      return res.json({ 
        message: 'No changes detected',
        versionNumber: doc.version || 1,
        skipped: true 
      });
    }

    // Calculate word counts
    const words = content.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const characterCount = content.length;

    // Check if Azure Blob is configured for version storage
    const useBlobStorage = await isBlobConfigured();

    // Use transaction for atomic version creation
    const result = await withTransaction(async (client) => {
      // Get next version number with lock to prevent race conditions
      const versionResult = await client.query(
        `SELECT COALESCE(MAX(version_number), 0) + 1 as next_version 
         FROM document_versions WHERE document_id = $1
         FOR UPDATE`,
        [documentId]
      );
      const nextVersion = versionResult.rows[0].next_version;

      // Calculate diff stats if previous version exists
      let wordsAdded = wordCount;
      let wordsRemoved = 0;

      const prevContent = await client.query(
        `SELECT word_count FROM document_versions 
         WHERE document_id = $1 ORDER BY version_number DESC LIMIT 1`,
        [documentId]
      );
      if (prevContent.rows[0]?.word_count) {
        const diff = wordCount - prevContent.rows[0].word_count;
        wordsAdded = diff > 0 ? diff : 0;
        wordsRemoved = diff < 0 ? Math.abs(diff) : 0;
      }

      // Store version content
      let contentUrl = null;
      let storedInBlob = false;

      if (useBlobStorage) {
        // Upload to Azure Blob Storage (cheap, tiered)
        try {
          const blobResult = await uploadVersionToBlob(
            firmId,
            documentId,
            nextVersion,
            content,
            {
              createdBy: req.user.id,
              changeType,
              contentHash
            }
          );
          contentUrl = blobResult.url;
          storedInBlob = true;
          console.log(`[VERSION] Stored v${nextVersion} in Azure Blob: ${blobResult.blobName}`);
        } catch (blobError) {
          console.error('[VERSION] Blob upload failed, falling back to DB:', blobError.message);
          // Fall through to store in database
        }
      }

      // Create version record
      // If blob storage worked, don't store content_text (save DB space)
      // If blob failed or not configured, store in content_text as fallback
      const versionInsertResult = await client.query(
        `INSERT INTO document_versions (
          document_id, firm_id, version_number, version_label,
          content_text, content_url, content_hash, change_summary, change_type,
          word_count, character_count, words_added, words_removed,
          file_size, storage_type, created_by, created_by_name
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *`,
        [
          documentId,
          firmId,
          nextVersion,
          versionLabel || null,
          storedInBlob ? null : content, // Only store in DB if blob failed
          contentUrl, // URL to blob if stored there
          contentHash,
          changeSummary || null,
          changeType,
          wordCount,
          characterCount,
          wordsAdded,
          wordsRemoved,
          content.length,
          storedInBlob ? 'azure_blob' : 'database', // Track where content is stored
          req.user.id,
          `${req.user.firstName} ${req.user.lastName}`
        ]
      );

      // Update document - current version content stays in documents table (always hot)
      await client.query(
        `UPDATE documents SET 
          version = $1, 
          version_count = $1,
          content_text = $2,
          content_hash = $3,
          size = $4,
          updated_at = NOW()
         WHERE id = $5`,
        [nextVersion, content, contentHash, content.length, documentId]
      );

      // Log activity
      await client.query(
        `INSERT INTO document_activities (document_id, firm_id, action, user_id, user_name, details)
         VALUES ($1, $2, 'version_create', $3, $4, $5)`,
        [
          documentId, 
          firmId, 
          req.user.id, 
          `${req.user.firstName} ${req.user.lastName}`,
          JSON.stringify({ versionNumber: nextVersion, changeType, storedInBlob })
        ]
      );

      return {
        version: versionInsertResult.rows[0],
        nextVersion,
        wordsAdded,
        wordsRemoved,
        storedInBlob
      };
    });

    res.status(201).json({
      id: result.version.id,
      versionNumber: result.version.version_number,
      versionLabel: result.version.version_label,
      createdAt: result.version.created_at,
      wordsAdded: result.wordsAdded,
      wordsRemoved: result.wordsRemoved,
      storageType: result.storedInBlob ? 'azure_blob' : 'database'
    });
  } catch (error) {
    console.error('Create version error:', error);
    res.status(500).json({ error: 'Failed to create version' });
  }
});

// Restore a previous version
router.post('/documents/:documentId/versions/:versionId/restore', authenticate, async (req, res) => {
  try {
    // Get the version to restore (outside transaction for early exit)
    const versionResult = await query(
      `SELECT dv.* FROM document_versions dv
       JOIN documents d ON dv.document_id = d.id
       WHERE dv.id = $1 AND d.firm_id = $2`,
      [req.params.versionId, req.user.firmId]
    );

    if (versionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const versionToRestore = versionResult.rows[0];

    // Use transaction for atomic restore operation
    const result = await withTransaction(async (client) => {
      // Get next version number with lock
      const nextVersionResult = await client.query(
        `SELECT COALESCE(MAX(version_number), 0) + 1 as next_version 
         FROM document_versions WHERE document_id = $1
         FOR UPDATE`,
        [req.params.documentId]
      );
      const nextVersion = nextVersionResult.rows[0].next_version;

      // Create a new version with the restored content
      await client.query(
        `INSERT INTO document_versions (
          document_id, firm_id, version_number, version_label,
          content_text, content_hash, change_summary, change_type,
          word_count, character_count, created_by, created_by_name
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'restore', $8, $9, $10, $11)`,
        [
          req.params.documentId,
          req.user.firmId,
          nextVersion,
          `Restored from v${versionToRestore.version_number}`,
          versionToRestore.content_text,
          versionToRestore.content_hash,
          `Restored from version ${versionToRestore.version_number}`,
          versionToRestore.word_count,
          versionToRestore.character_count,
          req.user.id,
          `${req.user.firstName} ${req.user.lastName}`
        ]
      );

      // Update document
      await client.query(
        `UPDATE documents SET 
          version = $1, 
          version_count = $1,
          content_text = $2,
          content_hash = $3,
          updated_at = NOW()
         WHERE id = $4`,
        [nextVersion, versionToRestore.content_text, versionToRestore.content_hash, req.params.documentId]
      );

      // Log activity
      await client.query(
        `INSERT INTO document_activities (document_id, firm_id, action, user_id, user_name, details)
         VALUES ($1, $2, 'version_restore', $3, $4, $5)`,
        [
          req.params.documentId, 
          req.user.firmId, 
          req.user.id, 
          `${req.user.firstName} ${req.user.lastName}`,
          JSON.stringify({ restoredFrom: versionToRestore.version_number, newVersion: nextVersion })
        ]
      );

      return { nextVersion };
    });

    res.json({
      message: 'Version restored successfully',
      newVersionNumber: result.nextVersion,
      restoredFromVersion: versionToRestore.version_number,
    });
  } catch (error) {
    console.error('Restore version error:', error);
    res.status(500).json({ error: 'Failed to restore version' });
  }
});

// ============================================
// DOCUMENT COMPARISON ENDPOINTS
// ============================================

// Compare two versions
router.get('/documents/:documentId/compare', authenticate, async (req, res) => {
  try {
    const { version1, version2 } = req.query;

    if (!version1 || !version2) {
      return res.status(400).json({ error: 'Both version1 and version2 are required' });
    }

    // Get both versions
    const versionsResult = await query(
      `SELECT dv.*, u.first_name || ' ' || u.last_name as created_by_name
       FROM document_versions dv
       JOIN documents d ON dv.document_id = d.id
       LEFT JOIN users u ON dv.created_by = u.id
       WHERE dv.document_id = $1 
         AND d.firm_id = $2
         AND dv.version_number IN ($3, $4)
       ORDER BY dv.version_number ASC`,
      [req.params.documentId, req.user.firmId, parseInt(version1), parseInt(version2)]
    );

    if (versionsResult.rows.length !== 2) {
      return res.status(404).json({ error: 'One or both versions not found' });
    }

    const [v1, v2] = versionsResult.rows;

    // Log comparison activity
    await query(
      `INSERT INTO document_activities (document_id, firm_id, action, user_id, user_name, details)
       VALUES ($1, $2, 'compare', $3, $4, $5)`,
      [
        req.params.documentId, 
        req.user.firmId, 
        req.user.id, 
        `${req.user.firstName} ${req.user.lastName}`,
        JSON.stringify({ version1: v1.version_number, version2: v2.version_number })
      ]
    );

    res.json({
      documentId: req.params.documentId,
      version1: {
        versionNumber: v1.version_number,
        versionLabel: v1.version_label,
        content: v1.content_text,
        wordCount: v1.word_count,
        createdBy: v1.created_by_name,
        createdAt: v1.created_at,
      },
      version2: {
        versionNumber: v2.version_number,
        versionLabel: v2.version_label,
        content: v2.content_text,
        wordCount: v2.word_count,
        createdBy: v2.created_by_name,
        createdAt: v2.created_at,
      }
    });
  } catch (error) {
    console.error('Compare versions error:', error);
    res.status(500).json({ error: 'Failed to compare versions' });
  }
});

// ============================================
// DOCUMENT LOCKING ENDPOINTS
// ============================================

// Acquire lock on a document
// Cloud-native approach: Uses atomic database operations to prevent race conditions
// Better than Clio's approach which uses file-system locks that don't scale
router.post('/documents/:documentId/lock', authenticate, async (req, res) => {
  try {
    const { lockType = 'edit', sessionId } = req.body;
    const documentId = req.params.documentId;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const userName = `${req.user.firstName} ${req.user.lastName}`;
    const newSessionId = sessionId || uuidv4();

    // Check if document exists and is accessible
    const docResult = await query(
      `SELECT id, name FROM documents WHERE id = $1 AND firm_id = $2`,
      [documentId, req.user.firmId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Use a single atomic transaction to prevent race conditions
    // This is more efficient than Clio's multi-step lock acquisition
    const result = await withTransaction(async (client) => {
      // First, expire any old locks and get current lock state in one query
      // Use FOR UPDATE to lock the row and prevent concurrent modifications
      await client.query(
        `UPDATE document_locks SET 
          is_active = false, 
          released_at = NOW(),
          release_reason = 'expired'
         WHERE document_id = $1 AND is_active = true AND expires_at <= NOW()`,
        [documentId]
      );

      // Check for active lock with row lock to prevent race condition
      const existingLock = await client.query(
        `SELECT dl.*, u.first_name || ' ' || u.last_name as locked_by_name
         FROM document_locks dl
         JOIN users u ON dl.locked_by = u.id
         WHERE dl.document_id = $1 
           AND dl.is_active = true 
           AND dl.expires_at > NOW()
         FOR UPDATE`,
        [documentId]
      );

      if (existingLock.rows.length > 0) {
        const lock = existingLock.rows[0];
        
        // If the same user already has the lock, extend it
        if (lock.locked_by === req.user.id) {
          await client.query(
            `UPDATE document_locks SET 
              expires_at = $1, 
              last_heartbeat = NOW(),
              session_id = COALESCE($2, session_id)
             WHERE id = $3`,
            [expiresAt, sessionId, lock.id]
          );

          await client.query(
            `UPDATE documents SET lock_expires_at = $1 WHERE id = $2`,
            [expiresAt, documentId]
          );

          return {
            success: true,
            extended: true,
            lockId: lock.id,
            expiresAt
          };
        }

        // Someone else has the lock - return conflict info
        return {
          success: false,
          conflict: true,
          lockedBy: lock.locked_by_name,
          lockedAt: lock.locked_at,
          expiresAt: lock.expires_at
        };
      }

      // No active lock - create new one atomically
      const lockResult = await client.query(
        `INSERT INTO document_locks (
          document_id, firm_id, locked_by, locked_by_name,
          lock_type, expires_at, session_id, client_info
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          documentId,
          req.user.firmId,
          req.user.id,
          userName,
          lockType,
          expiresAt,
          newSessionId,
          req.headers['user-agent']
        ]
      );

      // Update document with editor info
      await client.query(
        `UPDATE documents SET 
          current_editor_id = $1,
          current_editor_name = $2,
          lock_expires_at = $3
         WHERE id = $4`,
        [req.user.id, userName, expiresAt, documentId]
      );

      // Log activity
      await client.query(
        `INSERT INTO document_activities (document_id, firm_id, action, user_id, user_name, details)
         VALUES ($1, $2, 'lock', $3, $4, $5)`,
        [documentId, req.user.firmId, req.user.id, userName, JSON.stringify({ lockType })]
      );

      return {
        success: true,
        extended: false,
        lockId: lockResult.rows[0].id,
        sessionId: lockResult.rows[0].session_id,
        expiresAt
      };
    });

    // Handle the transaction result
    if (result.conflict) {
      return res.status(423).json({ 
        error: 'Document is locked',
        lockedBy: result.lockedBy,
        lockedAt: result.lockedAt,
        expiresAt: result.expiresAt,
        message: `This document is currently being edited by ${result.lockedBy}. Try again later or wait for the lock to expire.`
      });
    }

    if (result.extended) {
      return res.json({
        lockId: result.lockId,
        extended: true,
        expiresAt: result.expiresAt,
        message: 'Lock extended'
      });
    }

    res.status(201).json({
      lockId: result.lockId,
      expiresAt: result.expiresAt,
      sessionId: result.sessionId,
      message: 'Lock acquired successfully'
    });
  } catch (error) {
    console.error('Acquire lock error:', error);
    res.status(500).json({ error: 'Failed to acquire lock' });
  }
});

// Send heartbeat to keep lock alive
router.post('/documents/:documentId/lock/heartbeat', authenticate, async (req, res) => {
  try {
    const result = await query(
      `UPDATE document_locks SET 
        last_heartbeat = NOW(),
        expires_at = $1
       WHERE document_id = $2 
         AND locked_by = $3 
         AND is_active = true
       RETURNING *`,
      [new Date(Date.now() + 10 * 60 * 1000), req.params.documentId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No active lock found' });
    }

    // Update document lock expiry
    await query(
      `UPDATE documents SET lock_expires_at = $1 WHERE id = $2`,
      [result.rows[0].expires_at, req.params.documentId]
    );

    res.json({ 
      expiresAt: result.rows[0].expires_at,
      message: 'Heartbeat received' 
    });
  } catch (error) {
    console.error('Lock heartbeat error:', error);
    res.status(500).json({ error: 'Failed to update heartbeat' });
  }
});

// Release lock on a document
router.delete('/documents/:documentId/lock', authenticate, async (req, res) => {
  try {
    const { reason = 'user_released' } = req.body || {};

    // Users can release their own locks, admins can release any
    const isAdmin = ['owner', 'admin'].includes(req.user.role);
    
    let result;
    if (isAdmin) {
      result = await query(
        `UPDATE document_locks SET 
          is_active = false, 
          released_at = NOW(),
          release_reason = $1
         WHERE document_id = $2 AND is_active = true
         RETURNING *`,
        [reason, req.params.documentId]
      );
    } else {
      result = await query(
        `UPDATE document_locks SET 
          is_active = false, 
          released_at = NOW(),
          release_reason = $1
         WHERE document_id = $2 AND locked_by = $3 AND is_active = true
         RETURNING *`,
        [reason, req.params.documentId, req.user.id]
      );
    }

    // Clear document editor info
    await query(
      `UPDATE documents SET 
        current_editor_id = NULL,
        current_editor_name = NULL,
        lock_expires_at = NULL
       WHERE id = $1`,
      [req.params.documentId]
    );

    // Log activity
    if (result.rows.length > 0) {
      await query(
        `INSERT INTO document_activities (document_id, firm_id, action, user_id, user_name, details)
         VALUES ($1, $2, 'unlock', $3, $4, $5)`,
        [req.params.documentId, req.user.firmId, req.user.id, `${req.user.firstName} ${req.user.lastName}`,
         JSON.stringify({ reason })]
      );
    }

    res.json({ 
      message: result.rows.length > 0 ? 'Lock released' : 'No active lock found',
      released: result.rows.length > 0 
    });
  } catch (error) {
    console.error('Release lock error:', error);
    res.status(500).json({ error: 'Failed to release lock' });
  }
});

// Get current lock status
router.get('/documents/:documentId/lock', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT dl.*, u.first_name || ' ' || u.last_name as locked_by_name
       FROM document_locks dl
       JOIN users u ON dl.locked_by = u.id
       WHERE dl.document_id = $1 
         AND dl.is_active = true 
         AND dl.expires_at > NOW()`,
      [req.params.documentId]
    );

    if (result.rows.length === 0) {
      return res.json({ locked: false });
    }

    const lock = result.rows[0];
    res.json({
      locked: true,
      lockId: lock.id,
      lockedBy: lock.locked_by,
      lockedByName: lock.locked_by_name,
      lockType: lock.lock_type,
      lockedAt: lock.locked_at,
      expiresAt: lock.expires_at,
      isOwnLock: lock.locked_by === req.user.id,
    });
  } catch (error) {
    console.error('Get lock status error:', error);
    res.status(500).json({ error: 'Failed to get lock status' });
  }
});

// ============================================
// DOCUMENT ACTIVITY LOG
// ============================================

// Get document activities
router.get('/documents/:documentId/activities', authenticate, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    // Verify document access
    const docResult = await query(
      `SELECT id FROM documents WHERE id = $1 AND firm_id = $2`,
      [req.params.documentId, req.user.firmId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const result = await query(
      `SELECT * FROM document_activities
       WHERE document_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.documentId, parseInt(limit), parseInt(offset)]
    );

    res.json({
      activities: result.rows.map(a => ({
        id: a.id,
        action: a.action,
        userId: a.user_id,
        userName: a.user_name,
        details: a.details,
        createdAt: a.created_at,
      }))
    });
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ error: 'Failed to get activities' });
  }
});

// ============================================
// FOLDER MANAGEMENT
// ============================================

// Get folder structure
router.get('/folders', authenticate, async (req, res) => {
  try {
    const { driveId, path = '/' } = req.query;

    let sql = `
      SELECT DISTINCT folder_path, 
             COUNT(CASE WHEN is_folder = false THEN 1 END) as file_count,
             MAX(updated_at) as last_modified
      FROM documents
      WHERE firm_id = $1
    `;
    const params = [req.user.firmId];
    let paramIndex = 2;

    if (driveId) {
      sql += ` AND drive_id = $${paramIndex}`;
      params.push(driveId);
      paramIndex++;
    }

    sql += ` GROUP BY folder_path ORDER BY folder_path`;

    const result = await query(sql, params);

    // Build folder tree
    const folders = result.rows.map(r => ({
      path: r.folder_path,
      fileCount: parseInt(r.file_count),
      lastModified: r.last_modified,
    }));

    res.json({ folders });
  } catch (error) {
    console.error('Get folders error:', error);
    res.status(500).json({ error: 'Failed to get folders' });
  }
});

// Create folder
router.post('/folders', authenticate, async (req, res) => {
  try {
    const { name, parentPath = '/', driveId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const folderPath = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;

    // Create a folder entry
    const result = await query(
      `INSERT INTO documents (
        firm_id, name, folder_path, is_folder, drive_id, uploaded_by, type
      ) VALUES ($1, $2, $3, true, $4, $5, 'folder')
      RETURNING *`,
      [req.user.firmId, name, folderPath, driveId || null, req.user.id]
    );

    res.status(201).json({
      id: result.rows[0].id,
      name: result.rows[0].name,
      path: result.rows[0].folder_path,
    });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// ============================================
// DRIVE BROWSER - View firm's drive contents
// ============================================

/**
 * Browse drive with Clio-style permissions:
 * - Admins (owner/admin roles): See ALL documents in the firm
 * - Regular users: See only documents they can access:
 *   1. Documents they uploaded
 *   2. Documents they own
 *   3. Documents in matters they have permission to
 *   4. Documents explicitly shared with them
 */
router.get('/browse', authenticate, async (req, res) => {
  try {
    const { path: folderPath = '', source = 'auto' } = req.query;
    const firmFolder = getFirmFolderPath(req.user.firmId);
    const isAdmin = FULL_ACCESS_ROLES.includes(req.user.role);
    
    // For admins, browse Azure directly - shows real-time view of files
    if (isAdmin && source !== 'db-only') {
      try {
        const { isAzureConfigured, getShareClient } = await import('../utils/azureStorage.js');
        
        if (await isAzureConfigured()) {
          const shareClient = await getShareClient();
          
          // Build the Azure path to browse
          // folderPath is relative to firm folder (e.g., "Smith - Personal Injury/Pleadings")
          const azurePath = folderPath ? `${firmFolder}/${folderPath}` : firmFolder;
          
          console.log(`[DRIVE BROWSE] Browsing Azure path: ${azurePath}`);
          
          const files = [];
          const subfolders = [];
          
          try {
            const dirClient = shareClient.getDirectoryClient(azurePath);
            
            for await (const item of dirClient.listFilesAndDirectories()) {
              if (item.kind === 'directory') {
                // Return full path for navigation
                const fullFolderPath = folderPath ? `${folderPath}/${item.name}` : item.name;
                subfolders.push(fullFolderPath);
              } else {
                // It's a file
                const ext = item.name.split('.').pop()?.toLowerCase() || '';
                const mimeTypes = {
                  'pdf': 'application/pdf', 'doc': 'application/msword',
                  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  'xls': 'application/vnd.ms-excel', 'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  'ppt': 'application/vnd.ms-powerpoint', 'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                  'txt': 'text/plain', 'rtf': 'application/rtf', 'csv': 'text/csv',
                  'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif',
                  'msg': 'application/vnd.ms-outlook', 'eml': 'message/rfc822',
                  'zip': 'application/zip', 'html': 'text/html'
                };
                
                // Get file size
                let fileSize = 0;
                try {
                  const fileClient = dirClient.getFileClient(item.name);
                  const props = await fileClient.getProperties();
                  fileSize = props.contentLength || 0;
                } catch (e) { /* ignore */ }
                
                files.push({
                  id: `azure-${Buffer.from(`${azurePath}/${item.name}`).toString('base64').substring(0, 36)}`,
                  name: item.name,
                  originalName: item.name,
                  contentType: mimeTypes[ext] || 'application/octet-stream',
                  size: fileSize,
                  folderPath: folderPath || '',
                  path: `${azurePath}/${item.name}`,
                  uploadedAt: new Date().toISOString(),
                  storageLocation: 'azure',
                  isFromAzure: true
                });
              }
            }
          } catch (dirErr) {
            console.log(`[DRIVE BROWSE] Directory not found or error: ${azurePath}`, dirErr.message);
          }
          
          console.log(`[DRIVE BROWSE] Found ${files.length} files, ${subfolders.length} subfolders at ${folderPath || 'root'}`);
          
          return res.json({
            firmFolder,
            currentPath: folderPath,
            isAdmin: true,
            files,
            folders: subfolders.sort(),
            matters: [],
            stats: {
              totalFiles: files.length,
              totalSize: files.reduce((sum, f) => sum + (f.size || 0), 0),
              mattersWithFiles: 0
            },
            source: 'azure-live'
          });
        }
      } catch (azureErr) {
        console.log(`[DRIVE BROWSE] Azure error, falling back to DB:`, azureErr.message);
      }
    }
    
    // Fallback: Use database (for non-admins or if Azure fails)
    // Build permission-based filter
    const accessFilter = await buildDocumentAccessFilter(
      req.user.id, 
      req.user.role, 
      req.user.firmId, 
      'd',
      1
    );
    
    // Build the main query with permission filtering
    let sql = `
      SELECT 
        d.id,
        d.name,
        d.original_name,
        d.type as content_type,
        d.size,
        d.folder_path,
        d.matter_id,
        m.name as matter_name,
        m.case_number as matter_number,
        d.uploaded_at,
        d.uploaded_by,
        u.first_name || ' ' || u.last_name as uploaded_by_name,
        d.is_folder,
        d.version_count,
        d.owner_id,
        d.privacy_level,
        CASE 
          WHEN d.uploaded_by = $${accessFilter.nextParamIndex} THEN true
          WHEN d.owner_id = $${accessFilter.nextParamIndex} THEN true
          ELSE false
        END as is_owned
       FROM documents d
       LEFT JOIN matters m ON d.matter_id = m.id
       LEFT JOIN users u ON d.uploaded_by = u.id
       WHERE ${accessFilter.whereClause}
    `;
    
    let params = [...accessFilter.params, req.user.id];
    let paramIndex = accessFilter.nextParamIndex + 1;
    
    // Add folder path filter
    if (folderPath) {
      sql += ` AND (d.folder_path = $${paramIndex} OR d.folder_path LIKE $${paramIndex + 1})`;
      params.push(folderPath, folderPath + '/%');
      paramIndex += 2;
    }
    
    sql += ` ORDER BY d.is_folder DESC, d.name ASC`;
    
    const result = await query(sql, params);

    // Get accessible folders for this user
    let foldersResult;
    if (isAdmin) {
      foldersResult = await query(
        `SELECT DISTINCT folder_path 
         FROM documents 
         WHERE firm_id = $1 AND folder_path IS NOT NULL AND folder_path != ''
         ORDER BY folder_path`,
        [req.user.firmId]
      );
    } else {
      // Only show folders containing accessible documents
      const folderAccessFilter = await buildDocumentAccessFilter(
        req.user.id, req.user.role, req.user.firmId, 'd', 1
      );
      foldersResult = await query(
        `SELECT DISTINCT d.folder_path 
         FROM documents d
         WHERE ${folderAccessFilter.whereClause}
           AND d.folder_path IS NOT NULL AND d.folder_path != ''
         ORDER BY d.folder_path`,
        folderAccessFilter.params
      );
    }

    // Get accessible matters for this user
    let mattersResult;
    if (isAdmin) {
      mattersResult = await query(
        `SELECT id, name, case_number 
         FROM matters 
         WHERE firm_id = $1 AND status != 'closed'
         ORDER BY name`,
        [req.user.firmId]
      );
    } else {
      // Only show matters user has access to
      mattersResult = await query(
        `SELECT DISTINCT m.id, m.name, m.case_number 
         FROM matters m
         WHERE m.firm_id = $1 AND m.status != 'closed'
           AND (
             m.visibility = 'firm_wide'
             OR m.responsible_attorney = $2
             OR m.originating_attorney = $2
             OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $2)
             OR EXISTS (SELECT 1 FROM matter_permissions mp WHERE mp.matter_id = m.id AND mp.user_id = $2)
             OR EXISTS (
               SELECT 1 FROM matter_permissions mp
               JOIN user_groups ug ON mp.group_id = ug.group_id
               WHERE mp.matter_id = m.id AND ug.user_id = $2
             )
           )
         ORDER BY m.name`,
        [req.user.firmId, req.user.id]
      );
    }

    // Build stats (scoped to accessible documents)
    let statsResult;
    if (isAdmin) {
      statsResult = await query(
        `SELECT 
          COUNT(*) as total_files,
          COALESCE(SUM(size), 0) as total_size,
          COUNT(DISTINCT matter_id) as matters_with_files
         FROM documents 
         WHERE firm_id = $1`,
        [req.user.firmId]
      );
    } else {
      const statsAccessFilter = await buildDocumentAccessFilter(
        req.user.id, req.user.role, req.user.firmId, 'd', 1
      );
      statsResult = await query(
        `SELECT 
          COUNT(*) as total_files,
          COALESCE(SUM(d.size), 0) as total_size,
          COUNT(DISTINCT d.matter_id) as matters_with_files
         FROM documents d
         WHERE ${statsAccessFilter.whereClause}`,
        statsAccessFilter.params
      );
    }

    const stats = statsResult.rows[0];

    res.json({
      firmFolder,
      currentPath: folderPath,
      isAdmin,
      files: result.rows.map(f => ({
        id: f.id,
        name: f.name,
        originalName: f.original_name,
        contentType: f.content_type,
        size: f.size,
        folderPath: f.folder_path,
        matterId: f.matter_id,
        matterName: f.matter_name,
        matterNumber: f.matter_number,
        uploadedAt: f.uploaded_at,
        uploadedBy: f.uploaded_by,
        uploadedByName: f.uploaded_by_name,
        isFolder: f.is_folder,
        versionCount: f.version_count || 1,
        isOwned: f.is_owned,
        privacyLevel: f.privacy_level,
      })),
      folders: foldersResult.rows.map(f => f.folder_path),
      matters: mattersResult.rows.map(m => ({
        id: m.id,
        name: m.name,
        caseNumber: m.case_number,
        folderPath: getMatterFolderPath(req.user.firmId, m.id),
      })),
      stats: {
        totalFiles: parseInt(stats.total_files) || 0,
        totalSize: parseInt(stats.total_size) || 0,
        mattersWithFiles: parseInt(stats.matters_with_files) || 0,
      },
      // Only show Azure config to admins
      azureConfig: isAdmin ? await (async () => {
        const config = await getAzureConfig();
        return config ? {
          configured: true,
          shareName: config.shareName,
          connectionPath: `\\\\${config.accountName}.file.core.windows.net\\${config.shareName}\\${firmFolder}`,
        } : { configured: false };
      })() : { configured: false }
    });
  } catch (error) {
    console.error('Browse drive error:', error);
    res.status(500).json({ error: 'Failed to browse drive' });
  }
});

/**
 * My Documents - View only user's own documents
 * This is the default view for non-admin users
 * Shows: documents uploaded by user + documents user owns + documents shared with user
 */
router.get('/my-documents', authenticate, async (req, res) => {
  try {
    const { search, limit = 100, offset = 0 } = req.query;
    
    let sql = `
      SELECT 
        d.id,
        d.name,
        d.original_name,
        d.type as content_type,
        d.size,
        d.folder_path,
        d.matter_id,
        m.name as matter_name,
        m.case_number as matter_number,
        d.uploaded_at,
        d.version_count,
        d.privacy_level,
        CASE 
          WHEN d.uploaded_by = $1 THEN 'uploaded'
          WHEN d.owner_id = $1 THEN 'owned'
          ELSE 'shared'
        END as access_type
       FROM documents d
       LEFT JOIN matters m ON d.matter_id = m.id
       WHERE d.firm_id = $2
         AND (
           d.uploaded_by = $1
           OR d.owner_id = $1
           OR EXISTS (
             SELECT 1 FROM document_permissions dp
             WHERE dp.document_id = d.id AND dp.user_id = $1
               AND dp.can_view = true
               AND (dp.expires_at IS NULL OR dp.expires_at > NOW())
           )
         )
    `;
    const params = [req.user.id, req.user.firmId];
    let paramIndex = 3;
    
    if (search) {
      sql += ` AND d.name ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    sql += ` ORDER BY d.uploaded_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await query(sql, params);
    
    // Get counts by access type
    const statsResult = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE uploaded_by = $1) as uploaded_count,
        COUNT(*) FILTER (WHERE owner_id = $1 AND uploaded_by != $1) as owned_count,
        COALESCE(SUM(size) FILTER (WHERE uploaded_by = $1 OR owner_id = $1), 0) as total_size
      FROM documents
      WHERE firm_id = $2
        AND (uploaded_by = $1 OR owner_id = $1)
    `, [req.user.id, req.user.firmId]);
    
    const stats = statsResult.rows[0];
    
    res.json({
      documents: result.rows.map(d => ({
        id: d.id,
        name: d.name,
        originalName: d.original_name,
        contentType: d.content_type,
        size: d.size,
        folderPath: d.folder_path,
        matterId: d.matter_id,
        matterName: d.matter_name,
        matterNumber: d.matter_number,
        uploadedAt: d.uploaded_at,
        versionCount: d.version_count || 1,
        privacyLevel: d.privacy_level,
        accessType: d.access_type, // 'uploaded', 'owned', or 'shared'
      })),
      stats: {
        uploadedCount: parseInt(stats.uploaded_count) || 0,
        ownedCount: parseInt(stats.owned_count) || 0,
        totalSize: parseInt(stats.total_size) || 0,
      },
      isPersonalView: true,
    });
  } catch (error) {
    console.error('Get my documents error:', error);
    res.status(500).json({ error: 'Failed to get your documents' });
  }
});

// Get Azure connection info for admin to map drive (secondary endpoint for backwards compat)
// Note: Primary endpoint is earlier in file with more detailed response

// Download desktop shortcut to access drive (Windows .bat file)
router.get('/download-shortcut/windows', authenticate, async (req, res) => {
  try {
    if (!['owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admins can download shortcuts' });
    }

    // Get Azure config from platform settings or env vars (auto from admin portal)
    const azureConfig = await getAzureConfig();
    if (!azureConfig) {
      return res.status(400).json({ error: 'Azure Storage not configured' });
    }

    const { accountName, accountKey, shareName } = azureConfig;
    const firmFolder = getFirmFolderPath(req.user.firmId);
    const drivePath = `\\\\${accountName}.file.core.windows.net\\${shareName}\\${firmFolder}`;
    
    // Get firm name for the shortcut
    const firmResult = await query('SELECT name FROM firms WHERE id = $1', [req.user.firmId]);
    const firmName = firmResult.rows[0]?.name || 'Apex Drive';
    const safeFirmName = firmName.replace(/[^a-zA-Z0-9 ]/g, '');

    // Create a batch file that maps the drive and opens it
    // Uses cmdkey to store credentials so it connects automatically
    const batchContent = `@echo off
:: ${safeFirmName} - Apex Drive Shortcut
:: This script maps your firm's document drive

echo.
echo ========================================
echo   ${safeFirmName} - Apex Drive
echo ========================================
echo.

:: Check if drive Z: is already mapped and accessible
if exist Z:\\ (
    echo Drive Z: is already connected. Opening...
    explorer Z:\\
    goto end
)

echo Connecting to your firm's document drive...

:: Store credentials in Windows Credential Manager (silent)
cmdkey /add:${accountName}.file.core.windows.net /user:AZURE\\${accountName} /pass:${accountKey} >nul 2>&1

:: Map the drive with stored credentials
net use Z: "${drivePath}" /persistent:yes >nul 2>&1

if %errorlevel% neq 0 (
    :: Try with explicit credentials if credential store failed
    net use Z: "${drivePath}" /user:AZURE\\${accountName} "${accountKey}" /persistent:yes >nul 2>&1
)

if %errorlevel% neq 0 (
    echo.
    echo Failed to connect. This may be due to:
    echo   - Network/firewall blocking port 445
    echo   - Corporate VPN restrictions
    echo.
    echo Try accessing via web browser instead:
    echo   https://your-apex-url/app/documents
    echo.
    pause
    goto end
)

echo Successfully connected!
echo.
echo Your firm drive is now mapped to Z:\\
echo Opening drive...
explorer Z:\\

:end
`;

    res.setHeader('Content-Type', 'application/x-batch');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFirmName} Drive.bat"`);
    res.send(batchContent);

  } catch (error) {
    console.error('Download shortcut error:', error);
    res.status(500).json({ error: 'Failed to generate shortcut' });
  }
});

// Download desktop shortcut for Mac (.command file)
router.get('/download-shortcut/mac', authenticate, async (req, res) => {
  try {
    if (!['owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admins can download shortcuts' });
    }

    // Get Azure config from platform settings or env vars (auto from admin portal)
    const azureConfig = await getAzureConfig();
    if (!azureConfig) {
      return res.status(400).json({ error: 'Azure Storage not configured' });
    }

    const { accountName, accountKey, shareName } = azureConfig;
    const firmFolder = getFirmFolderPath(req.user.firmId);
    const drivePath = `smb://${accountName}.file.core.windows.net/${shareName}/${firmFolder}`;
    
    // Get firm name for the shortcut
    const firmResult = await query('SELECT name FROM firms WHERE id = $1', [req.user.firmId]);
    const firmName = firmResult.rows[0]?.name || 'Apex Drive';
    const safeFirmName = firmName.replace(/[^a-zA-Z0-9 ]/g, '');

    // Create a shell script that mounts and opens the drive
    // Includes credentials for automatic connection
    // URL-encode the storage key for the SMB URL
    const encodedKey = encodeURIComponent(accountKey);
    
    const scriptContent = `#!/bin/bash
# ${safeFirmName} - Apex Drive Shortcut
# This script connects to your firm's document drive

echo ""
echo "========================================"
echo "  ${safeFirmName} - Apex Drive"
echo "========================================"
echo ""

MOUNT_POINT="/Volumes/${safeFirmName}"

# Check if already mounted
if [ -d "$MOUNT_POINT" ] && mount | grep -q "$MOUNT_POINT"; then
    echo "Drive already connected. Opening..."
    open "$MOUNT_POINT"
    exit 0
fi

echo "Connecting to your firm's document drive..."

# Create mount point if needed
mkdir -p "$MOUNT_POINT" 2>/dev/null

# Mount with credentials embedded
mount_smbfs "//${accountName}:${encodedKey}@${accountName}.file.core.windows.net/${shareName}/${firmFolder}" "$MOUNT_POINT" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "Successfully connected!"
    echo ""
    echo "Your firm drive is mounted at: $MOUNT_POINT"
    echo "Opening drive..."
    open "$MOUNT_POINT"
else
    echo ""
    echo "Could not connect automatically."
    echo ""
    echo "This may be due to:"
    echo "  - Firewall blocking port 445"
    echo "  - macOS security settings"
    echo ""
    echo "Try manually in Finder:"
    echo "  1. Press Cmd+K"
    echo "  2. Enter: ${drivePath}"
    echo "  3. Username: ${accountName}"
    echo "  4. Password: (contact your admin)"
    echo ""
    rmdir "$MOUNT_POINT" 2>/dev/null
fi
`;

    res.setHeader('Content-Type', 'application/x-sh');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFirmName} Drive.command"`);
    res.send(scriptContent);

  } catch (error) {
    console.error('Download Mac shortcut error:', error);
    res.status(500).json({ error: 'Failed to generate shortcut' });
  }
});

// ============================================
// DOWNLOAD FILE FROM AZURE BY PATH
// ============================================

/**
 * Download a file directly from Azure File Share by path
 * Used for files that don't have database records (browsed from Azure)
 * 
 * Query params:
 * - path: The relative path within the firm's folder (e.g., "Matters/Client/document.pdf")
 */
router.get('/download-azure', authenticate, async (req, res) => {
  try {
    const { path: filePath } = req.query;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    const { isAzureConfigured, getShareClient } = await import('../utils/azureStorage.js');
    
    const azureEnabled = await isAzureConfigured();
    if (!azureEnabled) {
      return res.status(400).json({ error: 'Azure Storage is not configured' });
    }
    
    // Normalize the path
    let cleanPath = filePath
      .replace(/\\/g, '/')
      .replace(/\/{2,}/g, '/')
      .replace(/^\/+/, '')
      .trim();
    
    console.log(`[AZURE DOWNLOAD] Downloading: "${cleanPath}"`);
    
    try {
      const shareClient = await getShareClient();
      
      // Get directory and file from path
      const lastSlash = cleanPath.lastIndexOf('/');
      const dirPath = lastSlash > 0 ? cleanPath.substring(0, lastSlash) : '';
      const fileName = lastSlash > 0 ? cleanPath.substring(lastSlash + 1) : cleanPath;
      
      const dirClient = shareClient.getDirectoryClient(dirPath);
      const fileClient = dirClient.getFileClient(fileName);
      
      // Download the file
      const downloadResponse = await fileClient.download(0);
      const chunks = [];
      
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(chunk);
      }
      
      const fileBuffer = Buffer.concat(chunks);
      
      if (!fileBuffer || fileBuffer.length === 0) {
        return res.status(404).json({ error: 'File is empty or not found' });
      }
      
      // Determine content type
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      const mimeTypes = {
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'txt': 'text/plain',
        'csv': 'text/csv',
        'rtf': 'application/rtf',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'zip': 'application/zip',
        'msg': 'application/vnd.ms-outlook',
        'eml': 'message/rfc822',
        'html': 'text/html',
        'tiff': 'image/tiff',
        'tif': 'image/tiff',
        'webp': 'image/webp'
      };
      
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      
      // Set headers and send file
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', fileBuffer.length);
      
      console.log(`[AZURE DOWNLOAD] Serving "${fileName}" (${fileBuffer.length} bytes)`);
      return res.send(fileBuffer);
      
    } catch (downloadError) {
      console.error('[AZURE DOWNLOAD] Download failed:', downloadError.message);
      return res.status(404).json({ error: 'File not found: ' + downloadError.message });
    }
    
  } catch (error) {
    console.error('Azure download error:', error);
    res.status(500).json({ error: 'Failed to download file from Azure' });
  }
});

/**
 * APEX DRIVE - Get files from database (instant load)
 * 
 * Clio-style permission filtering:
 * - Admins (owner/admin): See ALL documents in the firm
 * - Regular users: See only documents they can access:
 *   1. Documents they uploaded
 *   2. Documents they own
 *   3. Documents in matters they have permission to
 *   4. Documents explicitly shared with them
 *   5. Firm-wide privacy level documents
 */
router.get('/browse-all', authenticate, async (req, res) => {
  try {
    const { search } = req.query;
    const firmId = req.user.firmId;
    const firmFolder = `firm-${firmId}`;
    const isAdmin = FULL_ACCESS_ROLES.includes(req.user.role);
    
    console.log(`[BROWSE-ALL] User: ${req.user.email}, Role: ${req.user.role}, isAdmin: ${isAdmin}`);
    
    let sql;
    let params;
    
    if (isAdmin) {
      // Admins see all documents
      sql = `
        SELECT d.id, d.name, d.original_name, d.type, d.size, d.folder_path, 
               d.matter_id, m.name as matter_name, m.case_number as matter_number,
               d.uploaded_by, d.owner_id, d.privacy_level,
               COALESCE(d.external_path, d.path) as azure_path,
               d.uploaded_at
        FROM documents d
        LEFT JOIN matters m ON d.matter_id = m.id
        WHERE d.firm_id = $1
      `;
      params = [firmId];
      
      if (search) {
        sql += ` AND (d.name ILIKE $2 OR d.folder_path ILIKE $2)`;
        params.push(`%${search}%`);
      }
    } else {
      // Non-admins: Apply Clio-style permission filtering
      // Get user's accessible matter IDs first (efficient query)
      const userMattersResult = await query(`
        SELECT DISTINCT m.id FROM matters m
        WHERE m.firm_id = $1 AND m.status != 'archived' AND (
          m.visibility = 'firm_wide'
          OR m.responsible_attorney = $2
          OR m.originating_attorney = $2
          OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $2)
          OR EXISTS (SELECT 1 FROM matter_permissions mp WHERE mp.matter_id = m.id AND mp.user_id = $2)
        )
      `, [firmId, req.user.id]);
      
      const userMatterIds = userMattersResult.rows.map(r => r.id);
      console.log(`[BROWSE-ALL] User ${req.user.email} has access to ${userMatterIds.length} matters`);
      
      sql = `
        SELECT d.id, d.name, d.original_name, d.type, d.size, d.folder_path, 
               d.matter_id, m.name as matter_name, m.case_number as matter_number,
               d.uploaded_by, d.owner_id, d.privacy_level,
               COALESCE(d.external_path, d.path) as azure_path,
               d.uploaded_at,
               CASE 
                 WHEN d.uploaded_by = $2 THEN true
                 WHEN d.owner_id = $2 THEN true
                 ELSE false
               END as is_owned
        FROM documents d
        LEFT JOIN matters m ON d.matter_id = m.id
        WHERE d.firm_id = $1
          AND (
            -- Document they uploaded
            d.uploaded_by = $2
            -- Document they own
            OR d.owner_id = $2
            -- Firm-wide privacy level
            OR d.privacy_level = 'firm'
            -- Document in accessible matter
            ${userMatterIds.length > 0 ? `OR d.matter_id = ANY($3)` : ''}
            -- Has explicit document permission
            OR EXISTS (
              SELECT 1 FROM document_permissions dp
              WHERE dp.document_id = d.id AND dp.user_id = $2 AND dp.can_view = true
                AND (dp.expires_at IS NULL OR dp.expires_at > NOW())
            )
          )
      `;
      params = [firmId, req.user.id];
      
      if (userMatterIds.length > 0) {
        params.push(userMatterIds);
      }
      
      // Add search filter
      if (search) {
        const searchParamIdx = params.length + 1;
        sql += ` AND (d.name ILIKE $${searchParamIdx} OR d.folder_path ILIKE $${searchParamIdx})`;
        params.push(`%${search}%`);
      }
    }
    
    sql += ` ORDER BY d.folder_path, d.name LIMIT 10000`;
    
    const result = await query(sql, params);
    
    // Build folder tree (only from accessible documents)
    const folderSet = new Set();
    const files = result.rows.map(row => {
      if (row.folder_path) {
        folderSet.add(row.folder_path);
        // Add parent folders
        const parts = row.folder_path.split('/');
        for (let i = 1; i < parts.length; i++) {
          folderSet.add(parts.slice(0, i).join('/'));
        }
      }
      return {
        id: row.id,
        name: row.name,
        originalName: row.original_name || row.name,
        contentType: row.type,
        size: row.size || 0,
        folderPath: row.folder_path || '',
        path: row.azure_path,
        azurePath: row.azure_path,
        matterId: row.matter_id,
        matterName: row.matter_name,
        matterNumber: row.matter_number,
        uploadedAt: row.uploaded_at,
        isOwned: row.is_owned || false,
        privacyLevel: row.privacy_level,
        storageLocation: 'azure',
        isFromAzure: true
      };
    });
    
    // Get accessible matters for folder navigation
    let mattersResult;
    if (isAdmin) {
      mattersResult = await query(
        `SELECT id, name, case_number FROM matters WHERE firm_id = $1 AND status != 'closed' ORDER BY name`,
        [firmId]
      );
    } else {
      mattersResult = await query(`
        SELECT DISTINCT m.id, m.name, m.case_number FROM matters m
        WHERE m.firm_id = $1 AND m.status != 'closed' AND (
          m.visibility = 'firm_wide'
          OR m.responsible_attorney = $2
          OR m.originating_attorney = $2
          OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $2)
          OR EXISTS (SELECT 1 FROM matter_permissions mp WHERE mp.matter_id = m.id AND mp.user_id = $2)
        )
        ORDER BY m.name
      `, [firmId, req.user.id]);
    }
    
    console.log(`[BROWSE-ALL] Returning ${files.length} files for user ${req.user.email}`);
    
    return res.json({
      configured: true,
      isAdmin,
      firmFolder,
      files,
      folders: Array.from(folderSet).sort(),
      matters: mattersResult.rows.map(m => ({
        id: m.id,
        name: m.name,
        caseNumber: m.case_number,
        folderPath: `Matters/${m.name.replace(/[^a-zA-Z0-9 -]/g, '_')}`
      })),
      stats: { 
        totalFiles: files.length, 
        totalFolders: folderSet.size,
        totalSize: files.reduce((sum, f) => sum + (f.size || 0), 0)
      },
      source: 'database',
      userScoped: !isAdmin,
      message: isAdmin 
        ? 'Showing all firm documents' 
        : `Showing your documents and documents from ${mattersResult.rows.length} matters you have access to`
    });
    
  } catch (error) {
    console.error('Browse error:', error);
    res.status(500).json({ error: 'Failed to load files', files: [], folders: [] });
  }
});

/**
 * Manually trigger sync for current firm (runs in background)
 */
router.post('/sync-azure', authenticate, async (req, res) => {
  try {
    const { syncFirm } = await import('../services/driveSync.js');
    const firmId = req.user.firmId;
    const firmFolder = `firm-${firmId}`;
    
    console.log(`[MANUAL SYNC] Starting background sync for firm ${firmId}, folder: ${firmFolder}`);
    
    // Return immediately, run sync in background
    res.json({ 
      started: true, 
      firmId,
      firmFolder,
      message: 'Sync started in background. Refresh the page in a few minutes to see new files.'
    });
    
    // Run sync in background (don't await)
    syncFirm(firmId).then(result => {
      console.log(`[MANUAL SYNC] Firm ${firmId} completed:`, result);
    }).catch(err => {
      console.error(`[MANUAL SYNC] Firm ${firmId} error:`, err.message);
    });
    
  } catch (error) {
    console.error('Manual sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Debug endpoint to test Azure connection
 */
router.get('/debug-azure', authenticate, async (req, res) => {
  try {
    const { isAzureConfigured, getShareClient } = await import('../utils/azureStorage.js');
    
    const configured = await isAzureConfigured();
    if (!configured) {
      return res.json({ configured: false, error: 'Azure not configured' });
    }
    
    const shareClient = await getShareClient();
    const firmId = req.user.firmId;
    const firmFolder = `firm-${firmId}`;
    
    // Try to list root directory
    const rootFiles = [];
    try {
      const rootDir = shareClient.getDirectoryClient('');
      for await (const item of rootDir.listFilesAndDirectories()) {
        rootFiles.push({ name: item.name, kind: item.kind });
        if (rootFiles.length >= 20) break;
      }
    } catch (err) {
      rootFiles.push({ error: err.message });
    }
    
    // Try to list firm folder
    const firmFiles = [];
    try {
      const firmDir = shareClient.getDirectoryClient(firmFolder);
      for await (const item of firmDir.listFilesAndDirectories()) {
        firmFiles.push({ name: item.name, kind: item.kind });
        if (firmFiles.length >= 20) break;
      }
    } catch (err) {
      firmFiles.push({ error: err.message });
    }
    
    res.json({
      configured: true,
      firmId,
      firmFolder,
      rootFolders: rootFiles,
      firmFolderContents: firmFiles
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DRIVE SETUP SCRIPTS
// Generate downloadable setup scripts for Windows/Mac
// ============================================

/**
 * Generate Windows PowerShell setup script
 * This script:
 * - Checks if port 445 is accessible
 * - Removes any existing drive mapping
 * - Stores Azure credentials securely with cmdkey
 * - Maps the drive with the selected letter
 * - Makes it persist after reboot
 * - Registers the firmdocs:// protocol handler
 * - Opens the drive in File Explorer
 */
router.get('/setup-script/windows', authenticate, async (req, res) => {
  try {
    // Only admins can download setup scripts
    if (!['admin', 'owner', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { driveLetter = 'Z' } = req.query;
    
    // Get Azure config
    const azureConfig = await getAzureConfig();
    if (!azureConfig) {
      return res.status(400).json({ error: 'Azure Storage not configured' });
    }

    const { accountName, accountKey, shareName } = azureConfig;
    const firmId = req.user.firmId;
    const firmFolder = `firm-${firmId}`;
    
    // Get firm name
    const firmResult = await query('SELECT name FROM firms WHERE id = $1', [firmId]);
    const firmName = firmResult.rows[0]?.name || 'Apex Drive';
    const safeFirmName = firmName.replace(/[^a-zA-Z0-9 ]/g, '').trim();
    
    const drivePath = `\\\\${accountName}.file.core.windows.net\\${shareName}\\${firmFolder}`;
    
    // Generate unique setup token for logging
    const setupToken = crypto.randomBytes(16).toString('hex');
    
    // Log the script generation
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, details)
       VALUES ($1, $2, 'drive_script.generated', 'drive', $3)`,
      [firmId, req.user.id, JSON.stringify({ 
        platform: 'windows', 
        driveLetter, 
        setupToken,
        generatedAt: new Date().toISOString()
      })]
    );

    const powershellScript = `#Requires -RunAsAdministrator
<#
.SYNOPSIS
    ${safeFirmName} - Apex Drive Setup Script
.DESCRIPTION
    This script connects your computer to your firm's document drive.
    Generated for: ${req.user.email}
    Generated at: ${new Date().toISOString()}
#>

# Configuration
$StorageAccount = "${accountName}"
$ShareName = "${shareName}"
$FirmFolder = "${firmFolder}"
$DriveLetter = "${driveLetter}"
$StorageKey = "${accountKey}"
$DrivePath = "${drivePath}"

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  ${safeFirmName} - Apex Drive Setup" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""

# Step 1: Check if port 445 is accessible
Write-Host "[1/6] Checking network connectivity..." -ForegroundColor Cyan
$connectTest = Test-NetConnection -ComputerName "$StorageAccount.file.core.windows.net" -Port 445 -WarningAction SilentlyContinue

if (-not $connectTest.TcpTestSucceeded) {
    Write-Host ""
    Write-Host "ERROR: Port 445 is blocked by your firewall or ISP." -ForegroundColor Red
    Write-Host ""
    Write-Host "This is common on home networks and some corporate networks."
    Write-Host "You can still access documents through the web app at:"
    Write-Host "  https://your-apex-url/app/documents" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To resolve this, contact your IT administrator or ISP."
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "  Port 445 is accessible!" -ForegroundColor Green

# Step 2: Remove existing mapping if present
Write-Host "[2/6] Checking for existing drive mapping..." -ForegroundColor Cyan
$existingDrive = Get-PSDrive -Name $DriveLetter -ErrorAction SilentlyContinue
if ($existingDrive) {
    Write-Host "  Removing existing $DriveLetter: drive..." -ForegroundColor Yellow
    try {
        net use ${DriveLetter}: /delete /y 2>$null | Out-Null
        Remove-PSDrive -Name $DriveLetter -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Host "  Warning: Could not remove existing drive" -ForegroundColor Yellow
    }
}
Write-Host "  Drive letter $DriveLetter: is available" -ForegroundColor Green

# Step 3: Store credentials securely
Write-Host "[3/6] Storing Azure credentials..." -ForegroundColor Cyan
try {
    # Remove any existing credential
    cmdkey /delete:$StorageAccount.file.core.windows.net 2>$null | Out-Null
    
    # Add new credential
    $cmdkeyResult = cmdkey /add:"$StorageAccount.file.core.windows.net" /user:"AZURE\\$StorageAccount" /pass:"$StorageKey" 2>&1
    Write-Host "  Credentials stored in Windows Credential Manager" -ForegroundColor Green
} catch {
    Write-Host "  Warning: Could not store credentials automatically" -ForegroundColor Yellow
}

# Step 4: Map the drive
Write-Host "[4/6] Mapping drive $DriveLetter:..." -ForegroundColor Cyan
try {
    $result = net use ${DriveLetter}: "$DrivePath" /persistent:yes /user:AZURE\\$StorageAccount "$StorageKey" 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Drive $DriveLetter: successfully mapped!" -ForegroundColor Green
    } else {
        throw "Net use failed: $result"
    }
} catch {
    Write-Host "  Error mapping drive: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Trying alternative method..." -ForegroundColor Yellow
    try {
        New-PSDrive -Name $DriveLetter -PSProvider FileSystem -Root "$DrivePath" -Persist -Credential (New-Object System.Management.Automation.PSCredential ("AZURE\\$StorageAccount", (ConvertTo-SecureString $StorageKey -AsPlainText -Force))) -ErrorAction Stop
        Write-Host "  Drive $DriveLetter: successfully mapped (alternative method)!" -ForegroundColor Green
    } catch {
        Write-Host "  Failed to map drive. Please try manual mapping." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Step 5: Register firmdocs:// protocol handler
Write-Host "[5/6] Registering firmdocs:// protocol handler..." -ForegroundColor Cyan
try {
    $protocolPath = "HKCU:\\Software\\Classes\\firmdocs"
    
    # Create protocol key
    New-Item -Path $protocolPath -Force | Out-Null
    Set-ItemProperty -Path $protocolPath -Name "(Default)" -Value "URL:Firm Documents Protocol"
    Set-ItemProperty -Path $protocolPath -Name "URL Protocol" -Value ""
    
    # Create shell/open/command
    New-Item -Path "$protocolPath\\shell\\open\\command" -Force | Out-Null
    $commandValue = "explorer.exe \`"${DriveLetter}:\%1\`""
    Set-ItemProperty -Path "$protocolPath\\shell\\open\\command" -Name "(Default)" -Value $commandValue
    
    Write-Host "  Protocol handler registered!" -ForegroundColor Green
    Write-Host "  You can now click 'Open in Explorer' links in Apex Drive" -ForegroundColor Gray
} catch {
    Write-Host "  Warning: Could not register protocol handler" -ForegroundColor Yellow
    Write-Host "  Open in Explorer links may not work automatically" -ForegroundColor Gray
}

# Step 6: Open the drive
Write-Host "[6/6] Opening drive in File Explorer..." -ForegroundColor Cyan
Start-Sleep -Seconds 1
try {
    Start-Process explorer.exe -ArgumentList "${DriveLetter}:\\"
    Write-Host "  File Explorer opened!" -ForegroundColor Green
} catch {
    Write-Host "  Could not open Explorer automatically" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Your firm's documents are now available at:" -ForegroundColor White
Write-Host "  $DriveLetter:\\" -ForegroundColor Cyan
Write-Host ""
Write-Host "This drive will automatically reconnect when you restart your computer."
Write-Host ""
Write-Host "Folder Structure:" -ForegroundColor White
Write-Host "  $DriveLetter:\\Matters\\       - Client matters" -ForegroundColor Gray
Write-Host "  $DriveLetter:\\Clients\\       - Client documents" -ForegroundColor Gray
Write-Host "  $DriveLetter:\\Templates\\     - Document templates" -ForegroundColor Gray
Write-Host ""
Write-Host "Files saved here sync automatically with Apex Drive web app."
Write-Host ""
Read-Host "Press Enter to close this window"
`;

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFirmName.replace(/ /g, '')}_Setup.ps1"`);
    res.send(powershellScript);

  } catch (error) {
    console.error('Generate Windows script error:', error);
    res.status(500).json({ error: 'Failed to generate setup script' });
  }
});

/**
 * Generate Mac shell setup script
 * This script:
 * - Creates mount point in /Volumes
 * - Mounts the Azure SMB share
 * - Adds to Login Items for persistence
 * - Opens the drive in Finder
 */
router.get('/setup-script/mac', authenticate, async (req, res) => {
  try {
    // Only admins can download setup scripts
    if (!['admin', 'owner', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Get Azure config
    const azureConfig = await getAzureConfig();
    if (!azureConfig) {
      return res.status(400).json({ error: 'Azure Storage not configured' });
    }

    const { accountName, accountKey, shareName } = azureConfig;
    const firmId = req.user.firmId;
    const firmFolder = `firm-${firmId}`;
    
    // Get firm name
    const firmResult = await query('SELECT name FROM firms WHERE id = $1', [firmId]);
    const firmName = firmResult.rows[0]?.name || 'Apex Drive';
    const safeFirmName = firmName.replace(/[^a-zA-Z0-9 ]/g, '').trim();
    const mountName = safeFirmName.replace(/ /g, '');
    
    // URL-encode the storage key for SMB URL
    const encodedKey = encodeURIComponent(accountKey);
    
    // Log the script generation
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, details)
       VALUES ($1, $2, 'drive_script.generated', 'drive', $3)`,
      [firmId, req.user.id, JSON.stringify({ 
        platform: 'mac',
        generatedAt: new Date().toISOString()
      })]
    );

    const shellScript = `#!/bin/bash
#
# ${safeFirmName} - Apex Drive Setup Script for Mac
# Generated for: ${req.user.email}
# Generated at: ${new Date().toISOString()}
#

# Configuration
STORAGE_ACCOUNT="${accountName}"
SHARE_NAME="${shareName}"
FIRM_FOLDER="${firmFolder}"
STORAGE_KEY="${accountKey}"
MOUNT_NAME="${mountName}"
MOUNT_POINT="/Volumes/$MOUNT_NAME"

echo ""
echo "========================================"
echo "  ${safeFirmName} - Apex Drive Setup"
echo "========================================"
echo ""

# Step 1: Check if already mounted
echo "[1/5] Checking current mount status..."
if mount | grep -q "$MOUNT_POINT"; then
    echo "  Drive is already mounted at $MOUNT_POINT"
    echo "  Opening in Finder..."
    open "$MOUNT_POINT"
    echo ""
    echo "Setup complete! Your drive is ready."
    exit 0
fi
echo "  Drive not currently mounted"

# Step 2: Create mount point
echo "[2/5] Creating mount point..."
if [ ! -d "$MOUNT_POINT" ]; then
    sudo mkdir -p "$MOUNT_POINT"
    if [ $? -ne 0 ]; then
        echo "  Error: Could not create mount point. Run this script with sudo."
        exit 1
    fi
fi
echo "  Mount point ready: $MOUNT_POINT"

# Step 3: Test connectivity
echo "[3/5] Testing network connectivity..."
if ! nc -z -w5 $STORAGE_ACCOUNT.file.core.windows.net 445 2>/dev/null; then
    echo ""
    echo "  WARNING: Port 445 may be blocked by your network."
    echo "  The mount might fail. If so, try from a different network."
    echo ""
fi

# Step 4: Mount the drive
echo "[4/5] Mounting Azure File Share..."

# URL-encode the storage key
ENCODED_KEY=\$(python3 -c "import urllib.parse; print(urllib.parse.quote('$STORAGE_KEY', safe=''))" 2>/dev/null || echo "${encodedKey}")

# Build the SMB URL
SMB_URL="smb://$STORAGE_ACCOUNT:\${ENCODED_KEY}@$STORAGE_ACCOUNT.file.core.windows.net/$SHARE_NAME/$FIRM_FOLDER"

# Mount with credentials
mount_smbfs "$SMB_URL" "$MOUNT_POINT" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "  Successfully mounted!"
else
    echo "  Mount failed with credentials in URL, trying interactive..."
    
    # Try mounting with interactive authentication
    echo ""
    echo "  Please enter credentials when prompted:"
    echo "    Username: $STORAGE_ACCOUNT"
    echo "    Password: (the storage account key)"
    echo ""
    
    mount_smbfs "//$STORAGE_ACCOUNT@$STORAGE_ACCOUNT.file.core.windows.net/$SHARE_NAME/$FIRM_FOLDER" "$MOUNT_POINT"
    
    if [ $? -ne 0 ]; then
        echo ""
        echo "  ERROR: Could not mount the drive."
        echo ""
        echo "  This may be due to:"
        echo "    - Port 445 blocked by firewall/ISP"
        echo "    - macOS security restrictions"
        echo ""
        echo "  You can still access documents at:"
        echo "    https://your-apex-url/app/documents"
        echo ""
        sudo rmdir "$MOUNT_POINT" 2>/dev/null
        exit 1
    fi
fi

# Step 5: Add to Login Items (optional, may require user interaction)
echo "[5/5] Setting up auto-mount on login..."

# Create a LaunchAgent plist for auto-mount
PLIST_PATH="$HOME/Library/LaunchAgents/com.apexdrive.mount.plist"

cat > "$PLIST_PATH" << 'PLIST_EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.apexdrive.mount</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-c</string>
        <string>sleep 10 &amp;&amp; mount | grep -q "MOUNT_POINT" || mount_smbfs "SMB_URL" "MOUNT_POINT"</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>
PLIST_EOF

# Replace placeholders in the plist
sed -i '' "s|MOUNT_POINT|$MOUNT_POINT|g" "$PLIST_PATH"
sed -i '' "s|SMB_URL|$SMB_URL|g" "$PLIST_PATH"

# Load the LaunchAgent
launchctl load "$PLIST_PATH" 2>/dev/null

echo "  Auto-mount configured"

# Open Finder to the mounted drive
echo ""
echo "Opening drive in Finder..."
open "$MOUNT_POINT"

echo ""
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "Your firm's documents are now available at:"
echo "  $MOUNT_POINT"
echo ""
echo "Or in Finder sidebar under 'Locations'"
echo ""
echo "Folder Structure:"
echo "  $MOUNT_POINT/Matters/       - Client matters"
echo "  $MOUNT_POINT/Clients/       - Client documents"
echo "  $MOUNT_POINT/Templates/     - Document templates"
echo ""
echo "Files saved here sync automatically with Apex Drive web app."
echo ""
echo "The drive will automatically reconnect when you log in."
echo ""
`;

    res.setHeader('Content-Type', 'application/x-sh');
    res.setHeader('Content-Disposition', `attachment; filename="${mountName}_Setup.sh"`);
    res.send(shellScript);

  } catch (error) {
    console.error('Generate Mac script error:', error);
    res.status(500).json({ error: 'Failed to generate setup script' });
  }
});

/**
 * Get the user's configured drive letter preference
 * Used by documents page to generate correct Open in Explorer links
 */
router.get('/user-drive-preference', authenticate, async (req, res) => {
  try {
    // Check user settings for drive letter preference
    const result = await query(
      `SELECT settings FROM user_settings WHERE user_id = $1`,
      [req.user.id]
    );
    
    const settings = result.rows[0]?.settings || {};
    
    res.json({
      driveLetter: settings.driveLetter || 'Z',
      setupCompleted: settings.driveSetupCompleted || false,
      setupCompletedAt: settings.driveSetupCompletedAt || null,
      os: settings.driveOs || null,
      firmFolder: `firm-${req.user.firmId}`
    });
  } catch (error) {
    console.error('Get drive preference error:', error);
    res.json({ 
      driveLetter: 'Z', 
      setupCompleted: false,
      firmFolder: `firm-${req.user.firmId}` 
    });
  }
});

/**
 * Update user's drive letter preference and setup status
 */
router.put('/user-drive-preference', authenticate, async (req, res) => {
  try {
    const { driveLetter, setupCompleted, setupCompletedAt, os } = req.body;
    
    // Build the settings update object
    const settingsUpdate = {};
    
    if (driveLetter) {
      if (!/^[A-Z]$/.test(driveLetter)) {
        return res.status(400).json({ error: 'Invalid drive letter' });
      }
      settingsUpdate.driveLetter = driveLetter;
    }
    
    if (setupCompleted !== undefined) {
      settingsUpdate.driveSetupCompleted = setupCompleted;
    }
    
    if (setupCompletedAt) {
      settingsUpdate.driveSetupCompletedAt = setupCompletedAt;
    }
    
    if (os) {
      settingsUpdate.driveOs = os;
    }
    
    await query(
      `INSERT INTO user_settings (user_id, firm_id, settings)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE 
       SET settings = user_settings.settings || $3`,
      [req.user.id, req.user.firmId, JSON.stringify(settingsUpdate)]
    );
    
    res.json({ 
      driveLetter: driveLetter || 'Z',
      setupCompleted: setupCompleted || false,
      setupCompletedAt,
      os
    });
  } catch (error) {
    console.error('Update drive preference error:', error);
    res.status(500).json({ error: 'Failed to update preference' });
  }
});

export default router;
