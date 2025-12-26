import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Microsoft Graph API endpoints
const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

// ============================================
// WORD ONLINE CO-EDITING
// ============================================

// Get Word Online edit URL for a document
router.post('/documents/:documentId/open', authenticate, async (req, res) => {
  try {
    const { documentId } = req.params;

    // Get document info
    const doc = await query(
      `SELECT d.*, dc.drive_type, dc.root_path
       FROM documents d
       LEFT JOIN drive_configurations dc ON d.drive_id = dc.id
       WHERE d.id = $1 AND d.firm_id = $2`,
      [documentId, req.user.firmId]
    );

    if (doc.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = doc.rows[0];

    // Check if user has permission to edit
    const canEdit = await checkDocumentAccess(documentId, req.user.id, req.user.firmId, req.user.role, 'edit');
    if (!canEdit) {
      return res.status(403).json({ error: 'You do not have permission to edit this document' });
    }

    // Get Microsoft integration token (same as Outlook - uses Files.ReadWrite.All scope)
    const msIntegration = await query(
      `SELECT access_token, refresh_token, token_expires_at 
       FROM integrations 
       WHERE firm_id = $1 AND provider = 'outlook' AND is_connected = true`,
      [req.user.firmId]
    );

    if (msIntegration.rows.length === 0) {
      return res.json({
        editUrl: null,
        coAuthoring: false,
        message: 'Connect Microsoft in Integrations to enable Word Online editing',
        fallback: 'desktop',
        needsMicrosoftAuth: true
      });
    }

    const accessToken = msIntegration.rows[0].access_token;

    // For Azure Files / OneDrive / SharePoint, get Word Online URL
    if (['azure_files', 'onedrive', 'sharepoint'].includes(document.drive_type) || document.external_path) {
      // If we already have a Graph item ID, use it
      if (document.graph_item_id) {
        const editUrl = await getWordOnlineUrl(document.graph_item_id, accessToken);
        
        if (editUrl) {
          // Record session
          await startEditSession(documentId, req.user.id, req.user.firmId, document.graph_item_id, editUrl);
          
          return res.json({
            editUrl,
            graphItemId: document.graph_item_id,
            coAuthoring: true,
            message: 'Open in Word Online for real-time co-editing'
          });
        }
      }

      // Try to upload the document to OneDrive for Word Online editing
      if (document.path || document.external_path) {
        try {
          const uploadResult = await uploadToOneDriveForEditing(document, accessToken, req.user.firmId);
          if (uploadResult && uploadResult.webUrl) {
            // Save the Graph item ID for future use
            await query(
              `UPDATE documents SET graph_item_id = $1, word_online_url = $2 WHERE id = $3`,
              [uploadResult.id, uploadResult.webUrl, documentId]
            );

            // Record session
            await startEditSession(documentId, req.user.id, req.user.firmId, uploadResult.id, uploadResult.webUrl);

            return res.json({
              editUrl: uploadResult.webUrl,
              graphItemId: uploadResult.id,
              coAuthoring: true,
              message: 'Document uploaded to OneDrive. Opening in Word Online...'
            });
          }
        } catch (uploadError) {
          console.error('Failed to upload to OneDrive:', uploadError.message);
        }
      }

      // Fallback to desktop
      return res.json({
        editUrl: null,
        coAuthoring: false,
        message: 'Could not open in Word Online. Use desktop Word instead.',
        fallback: 'desktop'
      });
    }

    // For local/network files, provide desktop Word path
    res.json({
      editUrl: null,
      localPath: document.path,
      coAuthoring: false,
      message: 'Open with desktop Microsoft Word',
      fallback: 'desktop'
    });

  } catch (error) {
    console.error('Open Word Online error:', error);
    res.status(500).json({ error: 'Failed to open document' });
  }
});

// Upload document to OneDrive for Word Online editing
async function uploadToOneDriveForEditing(document, accessToken, firmId) {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Read file content
    let fileContent;
    if (document.path) {
      fileContent = await fs.readFile(document.path);
    } else {
      // For external files, we'd need to download from Azure first
      // For now, skip
      return null;
    }

    const fileName = document.original_name || document.name;
    const folderName = `ApexDrive-${firmId}`;

    // Create folder in OneDrive if it doesn't exist
    try {
      await fetch(`https://graph.microsoft.com/v1.0/me/drive/root/children`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: folderName,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail'
        })
      });
    } catch (e) {
      // Folder might already exist, that's OK
    }

    // Upload file to OneDrive
    const uploadResponse = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root:/${folderName}/${fileName}:/content`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/octet-stream'
        },
        body: fileContent
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('OneDrive upload failed:', errorText);
      return null;
    }

    const uploadResult = await uploadResponse.json();
    console.log(`[WORD ONLINE] Uploaded ${fileName} to OneDrive, id: ${uploadResult.id}`);

    return {
      id: uploadResult.id,
      webUrl: uploadResult.webUrl
    };
  } catch (error) {
    console.error('Upload to OneDrive error:', error);
    return null;
  }
}

// Get active editors for a document (who's currently editing)
router.get('/documents/:documentId/editors', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT ws.user_id, ws.user_name, ws.started_at, ws.last_activity
       FROM word_online_sessions ws
       WHERE ws.document_id = $1 
         AND ws.status = 'active'
         AND ws.last_activity > NOW() - INTERVAL '5 minutes'
       ORDER BY ws.started_at`,
      [req.params.documentId]
    );

    // Also get from document's active_editors JSON
    const docResult = await query(
      `SELECT active_editors FROM documents WHERE id = $1`,
      [req.params.documentId]
    );

    const activeEditors = result.rows.map(e => ({
      userId: e.user_id,
      userName: e.user_name,
      startedAt: e.started_at,
      lastActivity: e.last_activity,
    }));

    res.json({ 
      editors: activeEditors,
      count: activeEditors.length 
    });
  } catch (error) {
    console.error('Get editors error:', error);
    res.status(500).json({ error: 'Failed to get active editors' });
  }
});

// Update editing session (heartbeat)
router.post('/documents/:documentId/heartbeat', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE word_online_sessions 
       SET last_activity = NOW()
       WHERE document_id = $1 AND user_id = $2 AND status = 'active'`,
      [req.params.documentId, req.user.id]
    );

    // Update active_editors on document
    await updateActiveEditors(req.params.documentId);

    res.json({ success: true });
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// End editing session
router.post('/documents/:documentId/close', authenticate, async (req, res) => {
  try {
    const { changesCount = 0 } = req.body;

    await query(
      `UPDATE word_online_sessions 
       SET status = 'ended', ended_at = NOW(), changes_count = $1
       WHERE document_id = $2 AND user_id = $3 AND status = 'active'`,
      [changesCount, req.params.documentId, req.user.id]
    );

    // Update active_editors on document
    await updateActiveEditors(req.params.documentId);

    // If changes were made, create a version
    if (changesCount > 0) {
      await query(
        `INSERT INTO document_versions (
          document_id, firm_id, version_number, change_type,
          change_summary, created_by, created_by_name, source
        ) SELECT 
          $1, firm_id, 
          COALESCE((SELECT MAX(version_number) FROM document_versions WHERE document_id = $1), 0) + 1,
          'edit', $2, $3, $4, 'apex'
        FROM documents WHERE id = $1`,
        [
          req.params.documentId,
          `Edited in Word Online (${changesCount} changes)`,
          req.user.id,
          `${req.user.firstName} ${req.user.lastName}`
        ]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Close session error:', error);
    res.status(500).json({ error: 'Failed to close session' });
  }
});

// ============================================
// SHARING ENDPOINTS
// ============================================

// Quick share document with users
router.post('/documents/:documentId/share', authenticate, async (req, res) => {
  try {
    const { 
      userIds = [], 
      groupIds = [],
      permissionLevel = 'view',
      canEdit = false,
      canDownload = true,
      canShare = false,
      message,
      expiresAt 
    } = req.body;

    if (userIds.length === 0 && groupIds.length === 0) {
      return res.status(400).json({ error: 'Select at least one user or group to share with' });
    }

    // Check if user can share this document
    const doc = await query(
      `SELECT owner_id, uploaded_by, privacy_level FROM documents 
       WHERE id = $1 AND firm_id = $2`,
      [req.params.documentId, req.user.firmId]
    );

    if (doc.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const isOwner = doc.rows[0].owner_id === req.user.id || doc.rows[0].uploaded_by === req.user.id;
    const isAdmin = ['owner', 'admin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      // Check if user has share permission
      const canShareDoc = await checkDocumentAccess(req.params.documentId, req.user.id, req.user.firmId, req.user.role, 'share');
      if (!canShareDoc) {
        return res.status(403).json({ error: 'You do not have permission to share this document' });
      }
    }

    const sharedWith = [];

    // Add permissions for each user
    for (const userId of userIds) {
      const result = await query(
        `INSERT INTO document_permissions (
          document_id, firm_id, user_id, permission_level,
          can_view, can_download, can_edit, can_share,
          expires_at, created_by
        ) VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, $9)
        ON CONFLICT (document_id, user_id) WHERE user_id IS NOT NULL
        DO UPDATE SET 
          permission_level = EXCLUDED.permission_level,
          can_download = EXCLUDED.can_download,
          can_edit = EXCLUDED.can_edit,
          can_share = EXCLUDED.can_share,
          expires_at = EXCLUDED.expires_at
        RETURNING *`,
        [
          req.params.documentId, req.user.firmId, userId, permissionLevel,
          canDownload, canEdit, canShare, expiresAt || null, req.user.id
        ]
      ).catch(() => 
        // If constraint doesn't exist, just insert
        query(
          `INSERT INTO document_permissions (
            document_id, firm_id, user_id, permission_level,
            can_view, can_download, can_edit, can_share,
            expires_at, created_by
          ) VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, $9)
          RETURNING *`,
          [
            req.params.documentId, req.user.firmId, userId, permissionLevel,
            canDownload, canEdit, canShare, expiresAt || null, req.user.id
          ]
        )
      );

      if (result.rows.length > 0) {
        sharedWith.push({ type: 'user', id: userId });
      }
    }

    // Add permissions for each group
    for (const groupId of groupIds) {
      const result = await query(
        `INSERT INTO document_permissions (
          document_id, firm_id, group_id, permission_level,
          can_view, can_download, can_edit, can_share,
          expires_at, created_by
        ) VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          req.params.documentId, req.user.firmId, groupId, permissionLevel,
          canDownload, canEdit, canShare, expiresAt || null, req.user.id
        ]
      );

      if (result.rows.length > 0) {
        sharedWith.push({ type: 'group', id: groupId });
      }
    }

    // Update document privacy to 'shared' if it was private
    if (doc.rows[0].privacy_level === 'private') {
      await query(
        `UPDATE documents SET privacy_level = 'shared' WHERE id = $1`,
        [req.params.documentId]
      );
    }

    // Log activity
    await query(
      `INSERT INTO document_activities (document_id, firm_id, action, user_id, user_name, details)
       VALUES ($1, $2, 'share', $3, $4, $5)`,
      [
        req.params.documentId, req.user.firmId, req.user.id,
        `${req.user.firstName} ${req.user.lastName}`,
        JSON.stringify({ sharedWith, permissionLevel, message })
      ]
    );

    // TODO: Send notification to shared users

    res.json({
      success: true,
      sharedWith,
      message: `Document shared with ${sharedWith.length} ${sharedWith.length === 1 ? 'recipient' : 'recipients'}`
    });

  } catch (error) {
    console.error('Share document error:', error);
    res.status(500).json({ error: 'Failed to share document' });
  }
});

// Get users/groups document is shared with
router.get('/documents/:documentId/shared', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        dp.*,
        u.first_name, u.last_name, u.email, u.avatar_url,
        g.name as group_name, g.color as group_color
       FROM document_permissions dp
       LEFT JOIN users u ON dp.user_id = u.id
       LEFT JOIN groups g ON dp.group_id = g.id
       WHERE dp.document_id = $1
       ORDER BY dp.created_at DESC`,
      [req.params.documentId]
    );

    const shares = result.rows.map(r => ({
      id: r.id,
      type: r.user_id ? 'user' : 'group',
      userId: r.user_id,
      userName: r.first_name ? `${r.first_name} ${r.last_name}` : null,
      userEmail: r.email,
      userAvatar: r.avatar_url,
      groupId: r.group_id,
      groupName: r.group_name,
      groupColor: r.group_color,
      permissionLevel: r.permission_level,
      canView: r.can_view,
      canDownload: r.can_download,
      canEdit: r.can_edit,
      canShare: r.can_share,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
    }));

    res.json({ shares });
  } catch (error) {
    console.error('Get shares error:', error);
    res.status(500).json({ error: 'Failed to get shares' });
  }
});

// Remove share
router.delete('/documents/:documentId/share/:shareId', authenticate, async (req, res) => {
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
      return res.status(403).json({ error: 'Only the owner can remove shares' });
    }

    await query(
      `DELETE FROM document_permissions WHERE id = $1 AND document_id = $2`,
      [req.params.shareId, req.params.documentId]
    );

    // Check if any shares remain, if not revert to private
    const remaining = await query(
      `SELECT COUNT(*) FROM document_permissions WHERE document_id = $1`,
      [req.params.documentId]
    );

    if (parseInt(remaining.rows[0].count) === 0) {
      await query(
        `UPDATE documents SET privacy_level = 'private' WHERE id = $1`,
        [req.params.documentId]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Remove share error:', error);
    res.status(500).json({ error: 'Failed to remove share' });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

async function checkDocumentAccess(documentId, userId, firmId, userRole, requiredAccess = 'view') {
  // Admins always have access
  if (['owner', 'admin'].includes(userRole)) {
    return true;
  }

  // Get document info
  const doc = await query(
    `SELECT owner_id, uploaded_by, privacy_level, is_private, matter_id 
     FROM documents WHERE id = $1 AND firm_id = $2`,
    [documentId, firmId]
  );

  if (doc.rows.length === 0) return false;

  const document = doc.rows[0];

  // Owner always has full access
  if (document.owner_id === userId || document.uploaded_by === userId) {
    return true;
  }

  // Check privacy level
  if (document.privacy_level === 'firm') {
    // Everyone in firm can access
    return requiredAccess === 'view' || requiredAccess === 'download';
  }

  if (document.privacy_level === 'team' && document.matter_id) {
    // Check if user is on the matter team
    const matterAccess = await query(
      `SELECT 1 FROM matter_assignments WHERE matter_id = $1 AND user_id = $2
       UNION
       SELECT 1 FROM matters WHERE id = $1 AND (responsible_attorney = $2 OR originating_attorney = $2)`,
      [document.matter_id, userId]
    );
    if (matterAccess.rows.length > 0) {
      return true;
    }
  }

  // Check explicit permissions
  const perm = await query(
    `SELECT * FROM document_permissions 
     WHERE document_id = $1 AND user_id = $2
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [documentId, userId]
  );

  if (perm.rows.length > 0) {
    const p = perm.rows[0];
    switch (requiredAccess) {
      case 'view': return p.can_view;
      case 'download': return p.can_download;
      case 'edit': return p.can_edit;
      case 'delete': return p.can_delete;
      case 'share': return p.can_share;
      default: return p.can_view;
    }
  }

  // Check group permissions
  const groupPerm = await query(
    `SELECT dp.* FROM document_permissions dp
     JOIN user_groups ug ON dp.group_id = ug.group_id
     WHERE dp.document_id = $1 AND ug.user_id = $2
       AND (dp.expires_at IS NULL OR dp.expires_at > NOW())`,
    [documentId, userId]
  );

  if (groupPerm.rows.length > 0) {
    const p = groupPerm.rows[0];
    switch (requiredAccess) {
      case 'view': return p.can_view;
      case 'download': return p.can_download;
      case 'edit': return p.can_edit;
      case 'delete': return p.can_delete;
      case 'share': return p.can_share;
      default: return p.can_view;
    }
  }

  return false;
}

async function startEditSession(documentId, userId, firmId, graphItemId, editUrl) {
  // End any existing session for this user on this document
  await query(
    `UPDATE word_online_sessions SET status = 'ended', ended_at = NOW()
     WHERE document_id = $1 AND user_id = $2 AND status = 'active'`,
    [documentId, userId]
  );

  // Get user name
  const user = await query(`SELECT first_name, last_name FROM users WHERE id = $1`, [userId]);
  const userName = user.rows[0] ? `${user.rows[0].first_name} ${user.rows[0].last_name}` : 'Unknown';

  // Create new session
  await query(
    `INSERT INTO word_online_sessions (
      document_id, firm_id, user_id, user_name, graph_item_id, edit_url
    ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [documentId, firmId, userId, userName, graphItemId, editUrl]
  );

  // Update active editors on document
  await updateActiveEditors(documentId);
}

async function updateActiveEditors(documentId) {
  const editors = await query(
    `SELECT user_id, user_name, last_activity
     FROM word_online_sessions
     WHERE document_id = $1 
       AND status = 'active'
       AND last_activity > NOW() - INTERVAL '5 minutes'`,
    [documentId]
  );

  const activeEditors = editors.rows.map(e => ({
    userId: e.user_id,
    userName: e.user_name,
    lastActivity: e.last_activity
  }));

  await query(
    `UPDATE documents SET active_editors = $1 WHERE id = $2`,
    [JSON.stringify(activeEditors), documentId]
  );
}

async function getWordOnlineUrl(graphItemId, accessToken) {
  // This would call Microsoft Graph API to get the edit URL
  // For now, return a placeholder
  // In production, this would be:
  // const response = await fetch(`${GRAPH_API_BASE}/me/drive/items/${graphItemId}`, {
  //   headers: { 'Authorization': `Bearer ${accessToken}` }
  // });
  // const data = await response.json();
  // return data.webUrl + '?action=edit';
  
  return `https://office.com/edit/${graphItemId}`;
}

export { checkDocumentAccess };
export default router;
