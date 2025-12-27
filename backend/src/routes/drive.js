import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { buildDocumentAccessFilter, FULL_ACCESS_ROLES } from '../middleware/documentAccess.js';
import { ensureDirectory, isAzureConfigured } from '../utils/azureStorage.js';
import crypto from 'crypto';
import path from 'path';

const router = Router();

// Azure Storage configuration from environment
const AZURE_STORAGE_ACCOUNT = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const AZURE_STORAGE_KEY = process.env.AZURE_STORAGE_ACCOUNT_KEY;
const AZURE_FILE_SHARE = process.env.AZURE_FILE_SHARE_NAME || 'apexdrive';

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
router.get('/documents/:documentId/versions', authenticate, async (req, res) => {
  try {
    // Verify document access
    const docResult = await query(
      `SELECT id, name FROM documents WHERE id = $1 AND firm_id = $2`,
      [req.params.documentId, req.user.firmId]
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
      [req.params.documentId]
    );

    res.json({
      documentId: req.params.documentId,
      documentName: docResult.rows[0].name,
      versions: result.rows.map(v => ({
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
      }))
    });
  } catch (error) {
    console.error('Get versions error:', error);
    res.status(500).json({ error: 'Failed to get document versions' });
  }
});

// Get a specific version's content
router.get('/documents/:documentId/versions/:versionId/content', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT dv.* FROM document_versions dv
       JOIN documents d ON dv.document_id = d.id
       WHERE dv.id = $1 AND d.firm_id = $2`,
      [req.params.versionId, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const v = result.rows[0];
    res.json({
      id: v.id,
      versionNumber: v.version_number,
      content: v.content_text,
      contentHash: v.content_hash,
    });
  } catch (error) {
    console.error('Get version content error:', error);
    res.status(500).json({ error: 'Failed to get version content' });
  }
});

// Create a new version (called on save)
router.post('/documents/:documentId/versions', authenticate, async (req, res) => {
  try {
    const { content, versionLabel, changeSummary, changeType = 'edit' } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Verify document access
    const docResult = await query(
      `SELECT * FROM documents WHERE id = $1 AND firm_id = $2`,
      [req.params.documentId, req.user.firmId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    // Calculate content hash
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');

    // Check if content actually changed
    const latestVersion = await query(
      `SELECT content_hash FROM document_versions 
       WHERE document_id = $1 ORDER BY version_number DESC LIMIT 1`,
      [req.params.documentId]
    );

    if (latestVersion.rows.length > 0 && latestVersion.rows[0].content_hash === contentHash) {
      return res.json({ 
        message: 'No changes detected',
        versionNumber: doc.version || 1,
        skipped: true 
      });
    }

    // Get next version number
    const versionResult = await query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 as next_version 
       FROM document_versions WHERE document_id = $1`,
      [req.params.documentId]
    );
    const nextVersion = versionResult.rows[0].next_version;

    // Calculate word counts
    const words = content.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const characterCount = content.length;

    // Calculate diff stats if previous version exists
    let wordsAdded = wordCount;
    let wordsRemoved = 0;

    if (latestVersion.rows.length > 0) {
      const prevContent = await query(
        `SELECT content_text, word_count FROM document_versions 
         WHERE document_id = $1 ORDER BY version_number DESC LIMIT 1`,
        [req.params.documentId]
      );
      if (prevContent.rows[0]?.word_count) {
        const diff = wordCount - prevContent.rows[0].word_count;
        wordsAdded = diff > 0 ? diff : 0;
        wordsRemoved = diff < 0 ? Math.abs(diff) : 0;
      }
    }

    // Create version
    const result = await query(
      `INSERT INTO document_versions (
        document_id, firm_id, version_number, version_label,
        content_text, content_hash, change_summary, change_type,
        word_count, character_count, words_added, words_removed,
        file_size, created_by, created_by_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        req.params.documentId,
        req.user.firmId,
        nextVersion,
        versionLabel || null,
        content,
        contentHash,
        changeSummary || null,
        changeType,
        wordCount,
        characterCount,
        wordsAdded,
        wordsRemoved,
        content.length,
        req.user.id,
        `${req.user.firstName} ${req.user.lastName}`
      ]
    );

    // Update document version count and content
    await query(
      `UPDATE documents SET 
        version = $1, 
        version_count = $1,
        content_text = $2,
        content_hash = $3,
        size = $4,
        updated_at = NOW()
       WHERE id = $5`,
      [nextVersion, content, contentHash, content.length, req.params.documentId]
    );

    // Log activity
    await query(
      `INSERT INTO document_activities (document_id, firm_id, action, user_id, user_name, details)
       VALUES ($1, $2, 'version_create', $3, $4, $5)`,
      [
        req.params.documentId, 
        req.user.firmId, 
        req.user.id, 
        `${req.user.firstName} ${req.user.lastName}`,
        JSON.stringify({ versionNumber: nextVersion, changeType })
      ]
    );

    const v = result.rows[0];
    res.status(201).json({
      id: v.id,
      versionNumber: v.version_number,
      versionLabel: v.version_label,
      createdAt: v.created_at,
      wordsAdded,
      wordsRemoved,
    });
  } catch (error) {
    console.error('Create version error:', error);
    res.status(500).json({ error: 'Failed to create version' });
  }
});

// Restore a previous version
router.post('/documents/:documentId/versions/:versionId/restore', authenticate, async (req, res) => {
  try {
    // Get the version to restore
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

    // Create a new version with the restored content
    const nextVersionResult = await query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 as next_version 
       FROM document_versions WHERE document_id = $1`,
      [req.params.documentId]
    );
    const nextVersion = nextVersionResult.rows[0].next_version;

    const result = await query(
      `INSERT INTO document_versions (
        document_id, firm_id, version_number, version_label,
        content_text, content_hash, change_summary, change_type,
        word_count, character_count, created_by, created_by_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'restore', $8, $9, $10, $11)
      RETURNING *`,
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
    await query(
      `UPDATE documents SET 
        version = $1, 
        version_count = $1,
        content_text = $2,
        updated_at = NOW()
       WHERE id = $3`,
      [nextVersion, versionToRestore.content_text, req.params.documentId]
    );

    res.json({
      message: 'Version restored successfully',
      newVersionNumber: nextVersion,
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
router.post('/documents/:documentId/lock', authenticate, async (req, res) => {
  try {
    const { lockType = 'edit', sessionId } = req.body;

    // Check if document exists and is accessible
    const docResult = await query(
      `SELECT id, name, current_editor_id, current_editor_name, lock_expires_at
       FROM documents WHERE id = $1 AND firm_id = $2`,
      [req.params.documentId, req.user.firmId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    // Check for existing active lock (that hasn't expired)
    const existingLock = await query(
      `SELECT dl.*, u.first_name || ' ' || u.last_name as locked_by_name
       FROM document_locks dl
       JOIN users u ON dl.locked_by = u.id
       WHERE dl.document_id = $1 
         AND dl.is_active = true 
         AND dl.expires_at > NOW()`,
      [req.params.documentId]
    );

    if (existingLock.rows.length > 0) {
      const lock = existingLock.rows[0];
      
      // If the same user already has the lock, extend it
      if (lock.locked_by === req.user.id) {
        const newExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        await query(
          `UPDATE document_locks SET 
            expires_at = $1, 
            last_heartbeat = NOW(),
            session_id = COALESCE($2, session_id)
           WHERE id = $3`,
          [newExpiry, sessionId, lock.id]
        );

        await query(
          `UPDATE documents SET lock_expires_at = $1 WHERE id = $2`,
          [newExpiry, req.params.documentId]
        );

        return res.json({
          lockId: lock.id,
          extended: true,
          expiresAt: newExpiry,
          message: 'Lock extended'
        });
      }

      // Someone else has the lock
      return res.status(423).json({ 
        error: 'Document is locked',
        lockedBy: lock.locked_by_name,
        lockedAt: lock.locked_at,
        expiresAt: lock.expires_at,
        message: `This document is currently being edited by ${lock.locked_by_name}. Try again later or wait for the lock to expire.`
      });
    }

    // Release any expired locks first
    await query(
      `UPDATE document_locks SET 
        is_active = false, 
        released_at = NOW(),
        release_reason = 'expired'
       WHERE document_id = $1 AND is_active = true AND expires_at <= NOW()`,
      [req.params.documentId]
    );

    // Create new lock
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const lockResult = await query(
      `INSERT INTO document_locks (
        document_id, firm_id, locked_by, locked_by_name,
        lock_type, expires_at, session_id, client_info
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        req.params.documentId,
        req.user.firmId,
        req.user.id,
        `${req.user.firstName} ${req.user.lastName}`,
        lockType,
        expiresAt,
        sessionId || uuidv4(),
        req.headers['user-agent']
      ]
    );

    // Update document with editor info
    await query(
      `UPDATE documents SET 
        current_editor_id = $1,
        current_editor_name = $2,
        lock_expires_at = $3
       WHERE id = $4`,
      [req.user.id, `${req.user.firstName} ${req.user.lastName}`, expiresAt, req.params.documentId]
    );

    // Log activity
    await query(
      `INSERT INTO document_activities (document_id, firm_id, action, user_id, user_name, details)
       VALUES ($1, $2, 'lock', $3, $4, $5)`,
      [req.params.documentId, req.user.firmId, req.user.id, `${req.user.firstName} ${req.user.lastName}`,
       JSON.stringify({ lockType })]
    );

    res.status(201).json({
      lockId: lockResult.rows[0].id,
      expiresAt: expiresAt,
      sessionId: lockResult.rows[0].session_id,
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
    const { path: folderPath = '' } = req.query;
    const firmFolder = getFirmFolderPath(req.user.firmId);
    const isAdmin = FULL_ACCESS_ROLES.includes(req.user.role);
    
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
      azureConfig: isAdmin ? {
        configured: !!(AZURE_STORAGE_ACCOUNT && AZURE_STORAGE_KEY),
        shareName: AZURE_FILE_SHARE,
        connectionPath: AZURE_STORAGE_ACCOUNT 
          ? `\\\\${AZURE_STORAGE_ACCOUNT}.file.core.windows.net\\${AZURE_FILE_SHARE}\\${firmFolder}`
          : null,
      } : { configured: false }
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

// Get Azure connection info for admin to map drive
router.get('/connection-info', authenticate, async (req, res) => {
  try {
    if (!['owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admins can view connection info' });
    }

    const firmFolder = getFirmFolderPath(req.user.firmId);

    if (!AZURE_STORAGE_ACCOUNT || !AZURE_STORAGE_KEY) {
      return res.json({
        configured: false,
        message: 'Azure Storage is not configured. Contact platform administrator.'
      });
    }

    res.json({
      configured: true,
      firmFolder,
      // Windows path for mapping network drive
      windowsPath: `\\\\${AZURE_STORAGE_ACCOUNT}.file.core.windows.net\\${AZURE_FILE_SHARE}\\${firmFolder}`,
      // Mac/Linux path
      macPath: `smb://${AZURE_STORAGE_ACCOUNT}.file.core.windows.net/${AZURE_FILE_SHARE}/${firmFolder}`,
      // Instructions
      instructions: {
        windows: [
          'Open File Explorer',
          'Right-click "This PC" and select "Map network drive"',
          'Choose a drive letter (e.g., Z:)',
          'Enter the Windows path shown above',
          'Check "Connect using different credentials"',
          'Username: AZURE\\' + AZURE_STORAGE_ACCOUNT,
          'Password: Your storage account key'
        ],
        mac: [
          'Open Finder',
          'Press Cmd+K (Go → Connect to Server)',
          'Enter the Mac path shown above',
          'Click Connect',
          'Username: ' + AZURE_STORAGE_ACCOUNT,
          'Password: Your storage account key'
        ]
      },
      // Note: Don't expose the actual key, admin gets it from Azure portal or platform admin
      note: 'Contact your platform administrator for the storage account key.'
    });
  } catch (error) {
    console.error('Get connection info error:', error);
    res.status(500).json({ error: 'Failed to get connection info' });
  }
});

// Download desktop shortcut to access drive (Windows .bat file)
router.get('/download-shortcut/windows', authenticate, async (req, res) => {
  try {
    if (!['owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admins can download shortcuts' });
    }

    if (!AZURE_STORAGE_ACCOUNT || !AZURE_STORAGE_KEY) {
      return res.status(400).json({ error: 'Azure Storage not configured' });
    }

    const firmFolder = getFirmFolderPath(req.user.firmId);
    const drivePath = `\\\\${AZURE_STORAGE_ACCOUNT}.file.core.windows.net\\${AZURE_FILE_SHARE}\\${firmFolder}`;
    
    // Get firm name for the shortcut
    const firmResult = await query('SELECT name FROM firms WHERE id = $1', [req.user.firmId]);
    const firmName = firmResult.rows[0]?.name || 'Apex Drive';
    const safeFirmName = firmName.replace(/[^a-zA-Z0-9 ]/g, '');

    // Create a batch file that maps the drive and opens it
    const batchContent = `@echo off
:: ${safeFirmName} - Apex Drive Shortcut
:: This script maps your firm's document drive

echo.
echo ========================================
echo   ${safeFirmName} - Apex Drive
echo ========================================
echo.

:: Check if drive Z: is already mapped
if exist Z:\\ (
    echo Drive Z: is already mapped. Opening...
    explorer Z:\\
    goto end
)

echo Connecting to your firm's document drive...
echo.
echo You will be prompted for credentials:
echo   Username: AZURE\\${AZURE_STORAGE_ACCOUNT}
echo   Password: (get from your platform admin)
echo.

:: Map the drive
net use Z: "${drivePath}" /persistent:yes

if %errorlevel% neq 0 (
    echo.
    echo Failed to connect. Please check your credentials.
    echo.
    echo Manual connection:
    echo   Path: ${drivePath}
    echo   User: AZURE\\${AZURE_STORAGE_ACCOUNT}
    echo.
    pause
    goto end
)

echo.
echo Successfully connected! Opening drive...
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

    if (!AZURE_STORAGE_ACCOUNT || !AZURE_STORAGE_KEY) {
      return res.status(400).json({ error: 'Azure Storage not configured' });
    }

    const firmFolder = getFirmFolderPath(req.user.firmId);
    const drivePath = `smb://${AZURE_STORAGE_ACCOUNT}.file.core.windows.net/${AZURE_FILE_SHARE}/${firmFolder}`;
    
    // Get firm name for the shortcut
    const firmResult = await query('SELECT name FROM firms WHERE id = $1', [req.user.firmId]);
    const firmName = firmResult.rows[0]?.name || 'Apex Drive';
    const safeFirmName = firmName.replace(/[^a-zA-Z0-9 ]/g, '');

    // Create a shell script that mounts and opens the drive
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
if [ -d "$MOUNT_POINT" ]; then
    echo "Drive already connected. Opening..."
    open "$MOUNT_POINT"
    exit 0
fi

echo "Connecting to your firm's document drive..."
echo ""
echo "When prompted for credentials:"
echo "  Username: ${AZURE_STORAGE_ACCOUNT}"
echo "  Password: (get from your platform admin)"
echo ""

# Create mount point
mkdir -p "$MOUNT_POINT"

# Mount the drive (will prompt for password)
mount_smbfs "//${AZURE_STORAGE_ACCOUNT}@${AZURE_STORAGE_ACCOUNT}.file.core.windows.net/${AZURE_FILE_SHARE}/${firmFolder}" "$MOUNT_POINT"

if [ $? -eq 0 ]; then
    echo ""
    echo "Successfully connected! Opening drive..."
    open "$MOUNT_POINT"
else
    echo ""
    echo "Failed to connect. Please try manually:"
    echo "  1. Open Finder"
    echo "  2. Press Cmd+K"
    echo "  3. Enter: ${drivePath}"
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

export default router;
