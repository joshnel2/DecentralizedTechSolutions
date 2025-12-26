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
// VERSION COMPARISON / REDLINE ENDPOINTS
// ============================================

/**
 * Compare two versions and generate redline diff
 * Used for track changes / redline comparison in Word Online style
 */
router.get('/documents/:documentId/redline', authenticate, async (req, res) => {
  try {
    const { version1, version2 } = req.query;
    const documentId = req.params.documentId;

    if (!version1 || !version2) {
      return res.status(400).json({ error: 'Both version1 and version2 are required' });
    }

    // Check access
    const canView = await checkDocumentAccess(documentId, req.user.id, req.user.firmId, req.user.role, 'view');
    if (!canView) {
      return res.status(403).json({ error: 'Access denied' });
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
      [documentId, req.user.firmId, parseInt(version1), parseInt(version2)]
    );

    if (versionsResult.rows.length !== 2) {
      return res.status(404).json({ error: 'One or both versions not found' });
    }

    const [v1, v2] = versionsResult.rows;
    const content1 = v1.content_text || '';
    const content2 = v2.content_text || '';

    // Generate redline diff
    const redline = generateRedlineDiff(content1, content2);

    // Log comparison activity
    await query(
      `INSERT INTO document_activities (document_id, firm_id, action, user_id, user_name, details)
       VALUES ($1, $2, 'redline_compare', $3, $4, $5)`,
      [
        documentId, 
        req.user.firmId, 
        req.user.id, 
        `${req.user.firstName} ${req.user.lastName}`,
        JSON.stringify({ version1: v1.version_number, version2: v2.version_number })
      ]
    );

    res.json({
      documentId,
      version1: {
        number: v1.version_number,
        label: v1.version_label,
        createdBy: v1.created_by_name,
        createdAt: v1.created_at,
        wordCount: v1.word_count,
      },
      version2: {
        number: v2.version_number,
        label: v2.version_label,
        createdBy: v2.created_by_name,
        createdAt: v2.created_at,
        wordCount: v2.word_count,
      },
      redline: {
        html: redline.html,
        changes: redline.changes,
        stats: {
          additions: redline.additions,
          deletions: redline.deletions,
          unchanged: redline.unchanged,
        }
      }
    });
  } catch (error) {
    console.error('Redline comparison error:', error);
    res.status(500).json({ error: 'Failed to generate redline comparison' });
  }
});

/**
 * Open document in Word Online for comparison/redline
 * This uses Microsoft Graph's compare feature if available
 */
router.post('/documents/:documentId/compare-online', authenticate, async (req, res) => {
  try {
    const { version1, version2 } = req.body;
    const documentId = req.params.documentId;

    // Check access
    const canView = await checkDocumentAccess(documentId, req.user.id, req.user.firmId, req.user.role, 'view');
    if (!canView) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get Microsoft integration
    const msIntegration = await query(
      `SELECT access_token, refresh_token, token_expires_at 
       FROM integrations 
       WHERE firm_id = $1 AND provider = 'outlook' AND is_connected = true`,
      [req.user.firmId]
    );

    if (msIntegration.rows.length === 0) {
      return res.json({
        compareUrl: null,
        coAuthoring: false,
        message: 'Connect Microsoft in Integrations to enable Word Online comparison',
        needsMicrosoftAuth: true,
        // Fall back to local redline comparison
        fallbackUrl: `/api/word-online/documents/${documentId}/redline?version1=${version1}&version2=${version2}`
      });
    }

    const accessToken = msIntegration.rows[0].access_token;

    // Get both version files and upload to OneDrive for comparison
    const versions = await query(
      `SELECT dv.version_number, dv.content_text, d.name, d.original_name
       FROM document_versions dv
       JOIN documents d ON dv.document_id = d.id
       WHERE dv.document_id = $1 AND dv.version_number IN ($2, $3)
       ORDER BY dv.version_number`,
      [documentId, version1, version2]
    );

    if (versions.rows.length !== 2) {
      return res.status(404).json({ error: 'Versions not found' });
    }

    const [v1, v2] = versions.rows;
    const baseName = v1.original_name || v1.name;
    const folderName = `ApexDrive-${req.user.firmId}/Comparisons`;

    // Upload both versions to OneDrive
    try {
      // Create comparison folder
      await createOneDriveFolder(accessToken, folderName);

      // Upload v1
      const v1Name = `${baseName.replace(/\.\w+$/, '')}_v${v1.version_number}.docx`;
      const v1Result = await uploadTextToOneDrive(
        accessToken, 
        folderName, 
        v1Name, 
        v1.content_text || ''
      );

      // Upload v2
      const v2Name = `${baseName.replace(/\.\w+$/, '')}_v${v2.version_number}.docx`;
      const v2Result = await uploadTextToOneDrive(
        accessToken, 
        folderName, 
        v2Name, 
        v2.content_text || ''
      );

      // Generate comparison URL using Word Online's compare feature
      const compareUrl = v2Result?.webUrl 
        ? `${v2Result.webUrl}?action=compare&file=${encodeURIComponent(v1Result.id)}`
        : null;

      res.json({
        compareUrl: compareUrl,
        version1: {
          number: v1.version_number,
          graphItemId: v1Result?.id,
          webUrl: v1Result?.webUrl,
        },
        version2: {
          number: v2.version_number,
          graphItemId: v2Result?.id,
          webUrl: v2Result?.webUrl,
        },
        message: compareUrl 
          ? 'Opening comparison in Word Online...'
          : 'Versions uploaded to OneDrive. Open both files in Word to compare.',
        coAuthoring: true,
      });
    } catch (uploadError) {
      console.error('Failed to upload for comparison:', uploadError);
      res.json({
        compareUrl: null,
        message: 'Could not upload to OneDrive. Use local comparison instead.',
        fallbackUrl: `/api/word-online/documents/${documentId}/redline?version1=${version1}&version2=${version2}`
      });
    }
  } catch (error) {
    console.error('Compare online error:', error);
    res.status(500).json({ error: 'Failed to start comparison' });
  }
});

/**
 * Sync document from Word Online back to Apex
 * Called when user saves in Word Online
 */
router.post('/documents/:documentId/sync-from-online', authenticate, async (req, res) => {
  try {
    const documentId = req.params.documentId;

    // Check access
    const canEdit = await checkDocumentAccess(documentId, req.user.id, req.user.firmId, req.user.role, 'edit');
    if (!canEdit) {
      return res.status(403).json({ error: 'No edit access' });
    }

    // Get document info
    const docResult = await query(
      `SELECT d.*, dc.drive_type
       FROM documents d
       LEFT JOIN drive_configurations dc ON d.drive_id = dc.id
       WHERE d.id = $1 AND d.firm_id = $2`,
      [documentId, req.user.firmId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    if (!doc.graph_item_id) {
      return res.status(400).json({ error: 'Document is not linked to OneDrive' });
    }

    // Get Microsoft integration
    const msIntegration = await query(
      `SELECT access_token FROM integrations 
       WHERE firm_id = $1 AND provider = 'outlook' AND is_connected = true`,
      [req.user.firmId]
    );

    if (msIntegration.rows.length === 0) {
      return res.status(400).json({ error: 'Microsoft integration not connected' });
    }

    const accessToken = msIntegration.rows[0].access_token;

    // Download latest content from OneDrive
    const fileContentResponse = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${doc.graph_item_id}/content`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (!fileContentResponse.ok) {
      console.error('Failed to download from OneDrive:', await fileContentResponse.text());
      return res.status(500).json({ error: 'Failed to download from OneDrive' });
    }

    // For DOCX files, we'd need to extract text
    // For simplicity, we'll store the raw content and mark for extraction
    const fileBuffer = await fileContentResponse.arrayBuffer();
    const contentHash = require('crypto').createHash('sha256').update(Buffer.from(fileBuffer)).digest('hex');

    // Check if content changed
    if (doc.content_hash === contentHash) {
      return res.json({ 
        synced: false, 
        message: 'No changes detected',
        versionNumber: doc.version || 1
      });
    }

    // Get next version number
    const versionResult = await query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 as next_version 
       FROM document_versions WHERE document_id = $1`,
      [documentId]
    );
    const nextVersion = versionResult.rows[0].next_version;

    // Extract text from the updated document (if possible)
    let textContent = '';
    try {
      if (doc.type?.includes('word') || doc.original_name?.endsWith('.docx')) {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer: Buffer.from(fileBuffer) });
        textContent = result.value;
      }
    } catch (extractError) {
      console.error('Text extraction error:', extractError);
    }

    // Create new version
    await query(
      `INSERT INTO document_versions (
        document_id, firm_id, version_number, version_label,
        content_text, content_hash, change_summary, change_type,
        word_count, character_count, created_by, created_by_name, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'edit', $8, $9, $10, $11, 'word_online')`,
      [
        documentId,
        req.user.firmId,
        nextVersion,
        `Synced from Word Online`,
        textContent,
        contentHash,
        'Edited in Word Online',
        textContent.split(/\s+/).filter(w => w).length,
        textContent.length,
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
        content_hash = $3,
        last_online_edit = NOW(),
        updated_at = NOW()
       WHERE id = $4`,
      [nextVersion, textContent, contentHash, documentId]
    );

    // Log activity
    await query(
      `INSERT INTO document_activities (document_id, firm_id, action, user_id, user_name, details)
       VALUES ($1, $2, 'sync_from_online', $3, $4, $5)`,
      [
        documentId, 
        req.user.firmId, 
        req.user.id, 
        `${req.user.firstName} ${req.user.lastName}`,
        JSON.stringify({ versionNumber: nextVersion, source: 'word_online' })
      ]
    );

    res.json({
      synced: true,
      versionNumber: nextVersion,
      message: 'Document synced from Word Online'
    });
  } catch (error) {
    console.error('Sync from online error:', error);
    res.status(500).json({ error: 'Failed to sync from Word Online' });
  }
});

/**
 * Get all versions with Word Online edit URLs
 * For displaying version history with edit/compare actions
 */
router.get('/documents/:documentId/versions-online', authenticate, async (req, res) => {
  try {
    const documentId = req.params.documentId;

    // Check access
    const canView = await checkDocumentAccess(documentId, req.user.id, req.user.firmId, req.user.role, 'view');
    if (!canView) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get document and versions
    const docResult = await query(
      `SELECT d.name, d.original_name, d.graph_item_id, d.word_online_url
       FROM documents d
       WHERE d.id = $1 AND d.firm_id = $2`,
      [documentId, req.user.firmId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    const versionsResult = await query(
      `SELECT dv.*, u.first_name || ' ' || u.last_name as created_by_name
       FROM document_versions dv
       LEFT JOIN users u ON dv.created_by = u.id
       WHERE dv.document_id = $1
       ORDER BY dv.version_number DESC`,
      [documentId]
    );

    // Check Microsoft integration
    const msIntegration = await query(
      `SELECT id FROM integrations 
       WHERE firm_id = $1 AND provider = 'outlook' AND is_connected = true`,
      [req.user.firmId]
    );

    const hasMicrosoftIntegration = msIntegration.rows.length > 0;

    res.json({
      document: {
        id: documentId,
        name: doc.name,
        originalName: doc.original_name,
        hasOnlineEdit: !!doc.graph_item_id,
        wordOnlineUrl: doc.word_online_url,
      },
      versions: versionsResult.rows.map(v => ({
        id: v.id,
        versionNumber: v.version_number,
        versionLabel: v.version_label,
        changeSummary: v.change_summary,
        changeType: v.change_type,
        wordCount: v.word_count,
        createdBy: v.created_by,
        createdByName: v.created_by_name,
        createdAt: v.created_at,
        source: v.source,
        canCompare: v.version_number > 1,
      })),
      hasMicrosoftIntegration,
      message: hasMicrosoftIntegration 
        ? 'Click any two versions to compare with redline'
        : 'Connect Microsoft in Integrations for Word Online comparison',
    });
  } catch (error) {
    console.error('Get versions online error:', error);
    res.status(500).json({ error: 'Failed to get versions' });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate redline diff HTML from two text versions
 * Returns HTML with additions in green, deletions in red with strikethrough
 */
function generateRedlineDiff(oldText, newText) {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);
  
  // Simple word-level diff using LCS algorithm
  const lcs = longestCommonSubsequence(oldWords, newWords);
  
  let html = '';
  let changes = [];
  let additions = 0;
  let deletions = 0;
  let unchanged = 0;
  
  let oldIndex = 0;
  let newIndex = 0;
  let lcsIndex = 0;
  
  while (oldIndex < oldWords.length || newIndex < newWords.length) {
    if (lcsIndex < lcs.length) {
      // Handle deletions (in old but not in LCS)
      while (oldIndex < oldWords.length && oldWords[oldIndex] !== lcs[lcsIndex]) {
        if (oldWords[oldIndex].trim()) {
          html += `<del style="color:#dc2626;text-decoration:line-through;background:#fee2e2;">${escapeHtml(oldWords[oldIndex])}</del>`;
          changes.push({ type: 'deletion', text: oldWords[oldIndex], position: oldIndex });
          deletions++;
        } else {
          html += oldWords[oldIndex];
        }
        oldIndex++;
      }
      
      // Handle additions (in new but not in LCS)
      while (newIndex < newWords.length && newWords[newIndex] !== lcs[lcsIndex]) {
        if (newWords[newIndex].trim()) {
          html += `<ins style="color:#16a34a;text-decoration:underline;background:#dcfce7;">${escapeHtml(newWords[newIndex])}</ins>`;
          changes.push({ type: 'addition', text: newWords[newIndex], position: newIndex });
          additions++;
        } else {
          html += newWords[newIndex];
        }
        newIndex++;
      }
      
      // Handle unchanged (in LCS)
      if (lcsIndex < lcs.length && oldIndex < oldWords.length && newIndex < newWords.length) {
        html += escapeHtml(lcs[lcsIndex]);
        if (lcs[lcsIndex].trim()) unchanged++;
        oldIndex++;
        newIndex++;
        lcsIndex++;
      }
    } else {
      // Remaining deletions
      while (oldIndex < oldWords.length) {
        if (oldWords[oldIndex].trim()) {
          html += `<del style="color:#dc2626;text-decoration:line-through;background:#fee2e2;">${escapeHtml(oldWords[oldIndex])}</del>`;
          deletions++;
        } else {
          html += oldWords[oldIndex];
        }
        oldIndex++;
      }
      
      // Remaining additions
      while (newIndex < newWords.length) {
        if (newWords[newIndex].trim()) {
          html += `<ins style="color:#16a34a;text-decoration:underline;background:#dcfce7;">${escapeHtml(newWords[newIndex])}</ins>`;
          additions++;
        } else {
          html += newWords[newIndex];
        }
        newIndex++;
      }
    }
  }
  
  return { html, changes, additions, deletions, unchanged };
}

/**
 * Longest Common Subsequence for diff algorithm
 */
function longestCommonSubsequence(arr1, arr2) {
  const m = arr1.length;
  const n = arr2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // Backtrack to find LCS
  const lcs = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (arr1[i - 1] === arr2[j - 1]) {
      lcs.unshift(arr1[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  
  return lcs;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function createOneDriveFolder(accessToken, folderPath) {
  const parts = folderPath.split('/');
  let currentPath = '';
  
  for (const part of parts) {
    try {
      await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${currentPath}:/children`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: part,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail'
        })
      });
    } catch (e) {
      // Folder might already exist
    }
    currentPath = currentPath ? `${currentPath}/${part}` : part;
  }
}

async function uploadTextToOneDrive(accessToken, folderPath, fileName, textContent) {
  try {
    // For plain text content, we need to convert to DOCX or just upload as text
    // For now, upload as plain text file
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root:/${folderPath}/${fileName}:/content`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'text/plain'
        },
        body: textContent
      }
    );

    if (!response.ok) {
      console.error('OneDrive upload failed:', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Upload to OneDrive error:', error);
    return null;
  }
}

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
