import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const router = Router();

// ============================================
// FOLDER PERMISSIONS
// ============================================

// Get permissions for a folder
router.get('/folders', authenticate, async (req, res) => {
  try {
    const { folderPath, driveId } = req.query;

    let sql = `
      SELECT fp.*, 
             u.first_name || ' ' || u.last_name as user_name,
             u.email as user_email,
             g.name as group_name
      FROM folder_permissions fp
      LEFT JOIN users u ON fp.user_id = u.id
      LEFT JOIN groups g ON fp.group_id = g.id
      WHERE fp.firm_id = $1
    `;
    const params = [req.user.firmId];
    let paramIndex = 2;

    if (folderPath) {
      sql += ` AND fp.folder_path = $${paramIndex}`;
      params.push(folderPath);
      paramIndex++;
    }

    if (driveId) {
      sql += ` AND fp.drive_id = $${paramIndex}`;
      params.push(driveId);
      paramIndex++;
    }

    sql += ` ORDER BY fp.folder_path, fp.created_at`;

    const result = await query(sql, params);

    res.json({
      permissions: result.rows.map(p => ({
        id: p.id,
        folderPath: p.folder_path,
        driveId: p.drive_id,
        userId: p.user_id,
        userName: p.user_name,
        userEmail: p.user_email,
        groupId: p.group_id,
        groupName: p.group_name,
        permissionLevel: p.permission_level,
        isInherited: p.is_inherited,
        inheritedFrom: p.inherited_from,
        canView: p.can_view,
        canDownload: p.can_download,
        canEdit: p.can_edit,
        canDelete: p.can_delete,
        canCreate: p.can_create,
        canShare: p.can_share,
        canManagePermissions: p.can_manage_permissions,
        createdAt: p.created_at,
      }))
    });
  } catch (error) {
    console.error('Get folder permissions error:', error);
    res.status(500).json({ error: 'Failed to get folder permissions' });
  }
});

// Set folder permissions
router.post('/folders', authenticate, async (req, res) => {
  try {
    const {
      folderPath,
      driveId,
      userId,
      groupId,
      permissionLevel = 'view',
      canView = true,
      canDownload = true,
      canEdit = false,
      canDelete = false,
      canCreate = false,
      canShare = false,
      canManagePermissions = false,
    } = req.body;

    if (!folderPath) {
      return res.status(400).json({ error: 'Folder path is required' });
    }

    if (!userId && !groupId) {
      return res.status(400).json({ error: 'Either userId or groupId is required' });
    }

    // Check if user has permission to manage this folder
    const canManage = await checkFolderPermission(req.user.firmId, req.user.id, folderPath, 'manage');
    const isAdmin = ['owner', 'admin'].includes(req.user.role);
    
    if (!canManage && !isAdmin) {
      return res.status(403).json({ error: 'You do not have permission to manage this folder' });
    }

    // Upsert permission
    const result = await query(
      `INSERT INTO folder_permissions (
        firm_id, folder_path, drive_id, user_id, group_id,
        permission_level, can_view, can_download, can_edit,
        can_delete, can_create, can_share, can_manage_permissions,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT ON CONSTRAINT folder_permissions_unique 
      DO UPDATE SET
        permission_level = EXCLUDED.permission_level,
        can_view = EXCLUDED.can_view,
        can_download = EXCLUDED.can_download,
        can_edit = EXCLUDED.can_edit,
        can_delete = EXCLUDED.can_delete,
        can_create = EXCLUDED.can_create,
        can_share = EXCLUDED.can_share,
        can_manage_permissions = EXCLUDED.can_manage_permissions,
        updated_at = NOW()
      RETURNING *`,
      [
        req.user.firmId, folderPath, driveId || null, userId || null, groupId || null,
        permissionLevel, canView, canDownload, canEdit,
        canDelete, canCreate, canShare, canManagePermissions,
        req.user.id
      ]
    ).catch(async () => {
      // If constraint doesn't exist, just insert
      return query(
        `INSERT INTO folder_permissions (
          firm_id, folder_path, drive_id, user_id, group_id,
          permission_level, can_view, can_download, can_edit,
          can_delete, can_create, can_share, can_manage_permissions,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          req.user.firmId, folderPath, driveId || null, userId || null, groupId || null,
          permissionLevel, canView, canDownload, canEdit,
          canDelete, canCreate, canShare, canManagePermissions,
          req.user.id
        ]
      );
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Set folder permission error:', error);
    res.status(500).json({ error: 'Failed to set folder permission' });
  }
});

// Delete folder permission
router.delete('/folders/:permissionId', authenticate, async (req, res) => {
  try {
    const isAdmin = ['owner', 'admin'].includes(req.user.role);
    
    // Get the permission to check folder
    const perm = await query(
      `SELECT folder_path FROM folder_permissions WHERE id = $1 AND firm_id = $2`,
      [req.params.permissionId, req.user.firmId]
    );

    if (perm.rows.length === 0) {
      return res.status(404).json({ error: 'Permission not found' });
    }

    if (!isAdmin) {
      const canManage = await checkFolderPermission(req.user.firmId, req.user.id, perm.rows[0].folder_path, 'manage');
      if (!canManage) {
        return res.status(403).json({ error: 'You do not have permission to manage this folder' });
      }
    }

    await query(
      `DELETE FROM folder_permissions WHERE id = $1`,
      [req.params.permissionId]
    );

    res.json({ message: 'Permission removed' });
  } catch (error) {
    console.error('Delete folder permission error:', error);
    res.status(500).json({ error: 'Failed to delete folder permission' });
  }
});

// ============================================
// DOCUMENT PERMISSIONS
// ============================================

// Get permissions for a document
router.get('/documents/:documentId', authenticate, async (req, res) => {
  try {
    // Verify document access
    const doc = await query(
      `SELECT id, name, is_private, privacy_level, owner_id, uploaded_by 
       FROM documents WHERE id = $1 AND firm_id = $2`,
      [req.params.documentId, req.user.firmId]
    );

    if (doc.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const result = await query(
      `SELECT dp.*, 
              u.first_name || ' ' || u.last_name as user_name,
              u.email as user_email,
              g.name as group_name
       FROM document_permissions dp
       LEFT JOIN users u ON dp.user_id = u.id
       LEFT JOIN groups g ON dp.group_id = g.id
       WHERE dp.document_id = $1
       ORDER BY dp.created_at`,
      [req.params.documentId]
    );

    res.json({
      document: {
        id: doc.rows[0].id,
        name: doc.rows[0].name,
        isPrivate: doc.rows[0].is_private,
        privacyLevel: doc.rows[0].privacy_level,
        ownerId: doc.rows[0].owner_id,
      },
      permissions: result.rows.map(p => ({
        id: p.id,
        userId: p.user_id,
        userName: p.user_name,
        userEmail: p.user_email,
        groupId: p.group_id,
        groupName: p.group_name,
        permissionLevel: p.permission_level,
        canView: p.can_view,
        canDownload: p.can_download,
        canEdit: p.can_edit,
        canDelete: p.can_delete,
        canShare: p.can_share,
        expiresAt: p.expires_at,
        createdAt: p.created_at,
      }))
    });
  } catch (error) {
    console.error('Get document permissions error:', error);
    res.status(500).json({ error: 'Failed to get document permissions' });
  }
});

// Set document permission
router.post('/documents/:documentId', authenticate, async (req, res) => {
  try {
    const {
      userId,
      groupId,
      permissionLevel = 'view',
      canView = true,
      canDownload = true,
      canEdit = false,
      canDelete = false,
      canShare = false,
      expiresAt,
    } = req.body;

    if (!userId && !groupId) {
      return res.status(400).json({ error: 'Either userId or groupId is required' });
    }

    // Check if user owns the document or is admin
    const doc = await query(
      `SELECT owner_id, uploaded_by FROM documents WHERE id = $1 AND firm_id = $2`,
      [req.params.documentId, req.user.firmId]
    );

    if (doc.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const isOwner = doc.rows[0].owner_id === req.user.id || doc.rows[0].uploaded_by === req.user.id;
    const isAdmin = ['owner', 'admin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Only the document owner can manage permissions' });
    }

    const result = await query(
      `INSERT INTO document_permissions (
        document_id, firm_id, user_id, group_id,
        permission_level, can_view, can_download, can_edit,
        can_delete, can_share, expires_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        req.params.documentId, req.user.firmId, userId || null, groupId || null,
        permissionLevel, canView, canDownload, canEdit,
        canDelete, canShare, expiresAt || null, req.user.id
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Set document permission error:', error);
    res.status(500).json({ error: 'Failed to set document permission' });
  }
});

// Update document privacy
router.put('/documents/:documentId/privacy', authenticate, async (req, res) => {
  try {
    const { isPrivate, privacyLevel } = req.body;

    // Check ownership
    const doc = await query(
      `SELECT owner_id, uploaded_by FROM documents WHERE id = $1 AND firm_id = $2`,
      [req.params.documentId, req.user.firmId]
    );

    if (doc.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const isOwner = doc.rows[0].owner_id === req.user.id || doc.rows[0].uploaded_by === req.user.id;
    const isAdmin = ['owner', 'admin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Only the document owner can change privacy settings' });
    }

    const result = await query(
      `UPDATE documents SET 
        is_private = COALESCE($1, is_private),
        privacy_level = COALESCE($2, privacy_level),
        owner_id = COALESCE(owner_id, $3),
        updated_at = NOW()
       WHERE id = $4
       RETURNING id, is_private, privacy_level, owner_id`,
      [isPrivate, privacyLevel, req.user.id, req.params.documentId]
    );

    // Log activity
    await query(
      `INSERT INTO document_activities (document_id, firm_id, action, user_id, user_name, details)
       VALUES ($1, $2, 'privacy_change', $3, $4, $5)`,
      [
        req.params.documentId,
        req.user.firmId,
        req.user.id,
        `${req.user.firstName} ${req.user.lastName}`,
        JSON.stringify({ isPrivate, privacyLevel })
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update privacy error:', error);
    res.status(500).json({ error: 'Failed to update privacy settings' });
  }
});

// Delete document permission
router.delete('/documents/:documentId/permissions/:permissionId', authenticate, async (req, res) => {
  try {
    // Check ownership
    const doc = await query(
      `SELECT owner_id, uploaded_by FROM documents WHERE id = $1 AND firm_id = $2`,
      [req.params.documentId, req.user.firmId]
    );

    if (doc.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const isOwner = doc.rows[0].owner_id === req.user.id || doc.rows[0].uploaded_by === req.user.id;
    const isAdmin = ['owner', 'admin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Only the document owner can manage permissions' });
    }

    await query(
      `DELETE FROM document_permissions WHERE id = $1 AND document_id = $2`,
      [req.params.permissionId, req.params.documentId]
    );

    res.json({ message: 'Permission removed' });
  } catch (error) {
    console.error('Delete document permission error:', error);
    res.status(500).json({ error: 'Failed to delete permission' });
  }
});

// ============================================
// USER PREFERENCES
// ============================================

// Get user's document preferences
router.get('/preferences', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM user_document_preferences WHERE user_id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.json({
        defaultPrivacy: 'inherited',
        privateFolderPatterns: [],
        notifyOnAccess: false,
        notifyOnEdit: true,
        preferWordOnline: true,
        autoSaveInterval: 30,
      });
    }

    const p = result.rows[0];
    res.json({
      defaultPrivacy: p.default_privacy,
      privateFolderPatterns: p.private_folder_patterns || [],
      notifyOnAccess: p.notify_on_access,
      notifyOnEdit: p.notify_on_edit,
      preferWordOnline: p.prefer_word_online,
      autoSaveInterval: p.auto_save_interval,
    });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

// Update user's document preferences
router.put('/preferences', authenticate, async (req, res) => {
  try {
    const {
      defaultPrivacy,
      privateFolderPatterns,
      notifyOnAccess,
      notifyOnEdit,
      preferWordOnline,
      autoSaveInterval,
    } = req.body;

    const result = await query(
      `INSERT INTO user_document_preferences (
        user_id, firm_id, default_privacy, private_folder_patterns,
        notify_on_access, notify_on_edit, prefer_word_online, auto_save_interval
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id) DO UPDATE SET
        default_privacy = COALESCE(EXCLUDED.default_privacy, user_document_preferences.default_privacy),
        private_folder_patterns = COALESCE(EXCLUDED.private_folder_patterns, user_document_preferences.private_folder_patterns),
        notify_on_access = COALESCE(EXCLUDED.notify_on_access, user_document_preferences.notify_on_access),
        notify_on_edit = COALESCE(EXCLUDED.notify_on_edit, user_document_preferences.notify_on_edit),
        prefer_word_online = COALESCE(EXCLUDED.prefer_word_online, user_document_preferences.prefer_word_online),
        auto_save_interval = COALESCE(EXCLUDED.auto_save_interval, user_document_preferences.auto_save_interval),
        updated_at = NOW()
      RETURNING *`,
      [
        req.user.id, req.user.firmId,
        defaultPrivacy || 'inherited',
        privateFolderPatterns || [],
        notifyOnAccess ?? false,
        notifyOnEdit ?? true,
        preferWordOnline ?? true,
        autoSaveInterval || 30
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

async function checkFolderPermission(firmId, userId, folderPath, requiredLevel) {
  // Check direct permission
  const result = await query(
    `SELECT permission_level, can_manage_permissions FROM folder_permissions
     WHERE firm_id = $1 AND user_id = $2 AND folder_path = $3`,
    [firmId, userId, folderPath]
  );

  if (result.rows.length > 0) {
    const perm = result.rows[0];
    if (requiredLevel === 'manage') {
      return perm.can_manage_permissions || perm.permission_level === 'full';
    }
    return true;
  }

  // Check inherited permissions from parent folders
  const pathParts = folderPath.split('/').filter(p => p);
  for (let i = pathParts.length - 1; i >= 0; i--) {
    const parentPath = '/' + pathParts.slice(0, i).join('/');
    const parentResult = await query(
      `SELECT permission_level, can_manage_permissions FROM folder_permissions
       WHERE firm_id = $1 AND user_id = $2 AND folder_path = $3`,
      [firmId, userId, parentPath || '/']
    );

    if (parentResult.rows.length > 0) {
      const perm = parentResult.rows[0];
      if (requiredLevel === 'manage') {
        return perm.can_manage_permissions || perm.permission_level === 'full';
      }
      return true;
    }
  }

  return false;
}

export default router;
