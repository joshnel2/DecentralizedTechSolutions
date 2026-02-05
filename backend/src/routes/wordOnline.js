import { Router } from 'express';
import { query, withTransaction } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import { 
  uploadVersion as uploadVersionToBlob, 
  isBlobConfigured 
} from '../utils/azureBlobStorage.js';

const router = Router();

// Microsoft Graph API endpoints
const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

// ============================================
// TOKEN REFRESH FOR LONG EDITING SESSIONS
// ============================================

/**
 * Refresh Microsoft access token using refresh token
 * Called when token is expired or about to expire
 */
async function refreshMicrosoftToken(firmId) {
  try {
    // Get current tokens
    const integration = await query(
      `SELECT id, access_token, refresh_token, token_expires_at 
       FROM integrations 
       WHERE firm_id = $1 AND provider = 'outlook' AND is_connected = true`,
      [firmId]
    );

    if (integration.rows.length === 0) {
      return { success: false, error: 'No Microsoft integration found' };
    }

    const { id, refresh_token, token_expires_at } = integration.rows[0];

    // Check if token is still valid (with 5 min buffer)
    const expiresAt = new Date(token_expires_at);
    const now = new Date();
    const bufferMs = 5 * 60 * 1000; // 5 minutes

    if (expiresAt > new Date(now.getTime() + bufferMs)) {
      // Token still valid
      return { success: true, accessToken: integration.rows[0].access_token, refreshed: false };
    }

    if (!refresh_token) {
      return { success: false, error: 'No refresh token available' };
    }

    // Get Microsoft credentials from platform settings
    const settingsResult = await query(
      `SELECT key, value FROM platform_settings 
       WHERE key IN ('microsoft_client_id', 'microsoft_client_secret', 'microsoft_tenant')`
    );
    
    const settings = {};
    settingsResult.rows.forEach(row => { settings[row.key] = row.value; });

    if (!settings.microsoft_client_id || !settings.microsoft_client_secret) {
      return { success: false, error: 'Microsoft credentials not configured' };
    }

    const tenant = settings.microsoft_tenant || 'common';

    // Refresh the token
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: settings.microsoft_client_id,
          client_secret: settings.microsoft_client_secret,
          refresh_token: refresh_token,
          grant_type: 'refresh_token',
          scope: 'https://graph.microsoft.com/.default offline_access'
        })
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[TOKEN REFRESH] Failed:', errorText);
      return { success: false, error: 'Token refresh failed' };
    }

    const tokenData = await tokenResponse.json();

    // Calculate new expiry
    const newExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

    // Update stored tokens
    await query(
      `UPDATE integrations SET 
        access_token = $1,
        refresh_token = COALESCE($2, refresh_token),
        token_expires_at = $3,
        updated_at = NOW()
       WHERE id = $4`,
      [
        tokenData.access_token,
        tokenData.refresh_token || null,
        newExpiresAt,
        id
      ]
    );

    console.log(`[TOKEN REFRESH] Successfully refreshed token for firm ${firmId}, expires at ${newExpiresAt}`);

    return { 
      success: true, 
      accessToken: tokenData.access_token, 
      refreshed: true,
      expiresAt: newExpiresAt
    };
  } catch (error) {
    console.error('[TOKEN REFRESH] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get a valid access token, refreshing if needed
 */
async function getValidAccessToken(firmId) {
  const result = await refreshMicrosoftToken(firmId);
  if (!result.success) {
    throw new Error(result.error || 'Failed to get valid token');
  }
  return result.accessToken;
}

/**
 * Endpoint to check/refresh token status
 * Called periodically by frontend during long editing sessions
 */
router.post('/token/refresh', authenticate, async (req, res) => {
  try {
    const result = await refreshMicrosoftToken(req.user.firmId);
    
    if (!result.success) {
      return res.status(400).json({ 
        valid: false, 
        error: result.error,
        needsReauth: true,
        message: 'Please reconnect your Microsoft account in Integrations'
      });
    }

    res.json({
      valid: true,
      refreshed: result.refreshed,
      expiresAt: result.expiresAt,
      message: result.refreshed ? 'Token refreshed successfully' : 'Token still valid'
    });
  } catch (error) {
    console.error('Token refresh endpoint error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

/**
 * Get token status without refreshing
 */
router.get('/token/status', authenticate, async (req, res) => {
  try {
    const integration = await query(
      `SELECT token_expires_at, is_connected 
       FROM integrations 
       WHERE firm_id = $1 AND provider = 'outlook'`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0 || !integration.rows[0].is_connected) {
      return res.json({ 
        connected: false, 
        message: 'Microsoft not connected' 
      });
    }

    const expiresAt = new Date(integration.rows[0].token_expires_at);
    const now = new Date();
    const minutesRemaining = Math.floor((expiresAt - now) / 60000);

    res.json({
      connected: true,
      expiresAt: expiresAt,
      minutesRemaining: Math.max(0, minutesRemaining),
      needsRefresh: minutesRemaining < 10,
      expired: minutesRemaining <= 0
    });
  } catch (error) {
    console.error('Token status error:', error);
    res.status(500).json({ error: 'Failed to get token status' });
  }
});

// ============================================
// WORD ONLINE CO-EDITING
// ============================================

// Get Word Online edit URL for a document
// Supports both Word Online (browser) and Desktop Word
router.post('/documents/:documentId/open', authenticate, async (req, res) => {
  try {
    const { documentId } = req.params;
    const { preferDesktop = false } = req.body; // User can prefer desktop Word

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

    // Get valid Microsoft token with automatic refresh if needed
    let accessToken;
    try {
      accessToken = await getValidAccessToken(req.user.firmId);
    } catch (tokenError) {
      console.error('[WORD ONLINE] Token error:', tokenError.message);
      return res.json({
        editUrl: null,
        coAuthoring: false,
        message: 'Connect Microsoft in Integrations to enable Word Online editing',
        fallback: 'desktop',
        needsMicrosoftAuth: true
      });
    }

    // For Azure Files / OneDrive / SharePoint / any document with storage, get Word Online URL
    // Most documents should go through this path - we'll try to upload to OneDrive for editing
    const hasStorageLocation = document.path || document.external_path || document.folder_path || document.azure_path;
    const isCloudDrive = ['azure_files', 'onedrive', 'sharepoint'].includes(document.drive_type);
    
    if (isCloudDrive || hasStorageLocation) {
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
      // Check all possible storage locations: local path, external path, folder path, or azure path
      if (document.path || document.external_path || document.folder_path || document.azure_path) {
        try {
          console.log(`[WORD ONLINE] Opening document ${documentId}: path=${document.path}, folder=${document.folder_path}, azure=${document.azure_path}`);
          const uploadResult = await uploadToOneDriveForEditing(document, accessToken, req.user.firmId);
          if (uploadResult && uploadResult.webUrl) {
            // Save the Graph item ID for future use
            await query(
              `UPDATE documents SET graph_item_id = $1, word_online_url = $2 WHERE id = $3`,
              [uploadResult.id, uploadResult.webUrl, documentId]
            );

            // Record session
            await startEditSession(documentId, req.user.id, req.user.firmId, uploadResult.id, uploadResult.webUrl);

            // Build desktop Word URL using Office URI scheme
            // Format: ms-word:ofe|u|<encoded-url>
            const desktopWordUrl = `ms-word:ofe|u|${encodeURIComponent(uploadResult.webUrl)}`;

            // If user prefers desktop, return that as primary
            if (preferDesktop) {
              return res.json({
                editUrl: desktopWordUrl,
                webUrl: uploadResult.webUrl,
                graphItemId: uploadResult.id,
                coAuthoring: false, // Desktop doesn't have real-time co-authoring indicator
                isDesktop: true,
                message: 'Opening in Microsoft Word desktop app...',
                instructions: 'Save in Word (Ctrl+S) to sync changes back to Apex'
              });
            }

            return res.json({
              editUrl: uploadResult.webUrl,
              desktopUrl: desktopWordUrl, // Also provide desktop option
              graphItemId: uploadResult.id,
              coAuthoring: true,
              message: 'Document ready. Choose Word Online or Desktop Word.',
              options: {
                online: { url: uploadResult.webUrl, label: 'Edit in Browser (Word Online)' },
                desktop: { url: desktopWordUrl, label: 'Edit in Desktop Word' }
              }
            });
          }
          console.log(`[WORD ONLINE] Upload returned null or no webUrl for document ${documentId}`);
        } catch (uploadError) {
          console.error('[WORD ONLINE] Upload exception:', uploadError.message);
          console.error('[WORD ONLINE] Document details:', { 
            documentId, 
            path: document.path, 
            external_path: document.external_path,
            folder_path: document.folder_path,
            azure_path: document.azure_path,
            drive_type: document.drive_type
          });
        }
      }

      // Fallback to desktop
      console.log(`[WORD ONLINE] Returning desktop fallback for document ${documentId}`);
      return res.json({
        editUrl: null,
        coAuthoring: false,
        message: 'Word Online is not available for this document. Would you like to download and edit it locally instead?',
        fallback: 'desktop',
        downloadUrl: `/api/documents/${documentId}/download`
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

// Open document directly in Desktop Microsoft Word
router.post('/documents/:documentId/open-desktop', authenticate, async (req, res) => {
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

    // Check if it's a Word document
    const fileName = document.original_name || document.name || '';
    const isWordDoc = fileName.toLowerCase().endsWith('.docx') || 
                      fileName.toLowerCase().endsWith('.doc') ||
                      document.type?.includes('word');

    if (!isWordDoc) {
      return res.status(400).json({ 
        error: 'This file type cannot be opened in Microsoft Word',
        fileType: document.type,
        fileName
      });
    }

    // Get Microsoft integration with token refresh
    let accessToken;
    try {
      accessToken = await getValidAccessToken(req.user.firmId);
    } catch (tokenError) {
      // No Microsoft connection or token refresh failed
      console.log('[WORD DESKTOP] Token error:', tokenError.message);
      return res.json({
        desktopUrl: null,
        networkPath: document.path ? `\\\\azure-path\\${document.path}` : null,
        needsMicrosoftAuth: true,
        message: 'Connect Microsoft in Integrations for seamless desktop editing, or use the mapped network drive.',
        instructions: [
          '1. Map your firm drive as a network drive (Settings → Apex Drive)',
          '2. Open the file from the mapped drive in Word',
          '3. Save normally - changes sync to Apex'
        ]
      });
    }

    // Upload to OneDrive for editing
    try {
      console.log(`[WORD DESKTOP] Opening document ${documentId}: path=${document.path}, folder=${document.folder_path}, azure=${document.azure_path}`);
      const uploadResult = await uploadToOneDriveForEditing(document, accessToken, req.user.firmId);
      
      if (uploadResult && uploadResult.webUrl) {
        // Save graph item ID
        await query(
          `UPDATE documents SET graph_item_id = $1, word_online_url = $2 WHERE id = $3`,
          [uploadResult.id, uploadResult.webUrl, documentId]
        );

        // Start edit session
        await startEditSession(documentId, req.user.id, req.user.firmId, uploadResult.id, uploadResult.webUrl);

        // Build desktop Word URL
        const desktopUrl = `ms-word:ofe|u|${encodeURIComponent(uploadResult.webUrl)}`;

        return res.json({
          desktopUrl,
          webUrl: uploadResult.webUrl,
          graphItemId: uploadResult.id,
          message: 'Click the link to open in Microsoft Word',
          instructions: [
            '1. Click "Open in Word" - your desktop Word will launch',
            '2. Edit the document normally',
            '3. Save (Ctrl+S) - changes auto-sync to Apex',
            '4. Close Word when done'
          ],
          autoSync: true,
          syncMethod: 'onedrive'
        });
      }
    } catch (uploadError) {
      console.error('Desktop Word - OneDrive upload failed:', uploadError.message);
      console.error('Desktop Word - Document info:', { 
        id: documentId, 
        path: document.path, 
        folder_path: document.folder_path,
        azure_path: document.azure_path,
        drive_type: document.drive_type
      });
    }

    // Fallback: provide download + re-upload instructions
    console.log(`[WORD DESKTOP] Upload failed, returning download fallback for document ${documentId}`);
    res.json({
      desktopUrl: null,
      downloadUrl: `/api/documents/${documentId}/download`,
      message: 'Could not set up auto-sync. Download, edit, and re-upload.',
      instructions: [
        '1. Download the document',
        '2. Open in Word and edit',
        '3. Upload the edited version back to Apex'
      ],
      autoSync: false
    });

  } catch (error) {
    console.error('Open desktop Word error:', error);
    res.status(500).json({ error: 'Failed to open in desktop Word' });
  }
});

// Upload document to OneDrive for Word Online editing
async function uploadToOneDriveForEditing(document, accessToken, firmId) {
  try {
    const fs = await import('fs/promises');
    const pathModule = await import('path');
    
    const fileName = document.original_name || document.name;
    let fileContent = null;
    
    console.log(`[WORD ONLINE] Loading document for OneDrive: ${fileName}`);

    // 1. Try local file first (same logic as download endpoint)
    if (document.path) {
      try {
        await fs.access(document.path);
        fileContent = await fs.readFile(document.path);
        console.log(`[WORD ONLINE] Read ${fileContent.length} bytes from local: ${document.path}`);
      } catch {
        console.log(`[WORD ONLINE] Local file not found: ${document.path}`);
      }
    }

    // 2. Try Azure File Share (same logic as download endpoint)
    if (!fileContent) {
      try {
        const { downloadFile, isAzureConfigured } = await import('../utils/azureStorage.js');
        const azureEnabled = await isAzureConfigured();
        
        if (azureEnabled) {
          // Determine the Azure path
          // Note: external_path may include firm-{firmId}/ prefix already, but downloadFile adds it
          // So we need to strip the prefix if it exists
          let azurePath = document.azure_path || document.external_path || 
            (document.folder_path ? `${document.folder_path}/${fileName}`.replace(/^\//, '') : fileName);
          
          // Strip firm prefix if already present (downloadFile will add it)
          const firmPrefix = `firm-${firmId}/`;
          if (azurePath.startsWith(firmPrefix)) {
            azurePath = azurePath.substring(firmPrefix.length);
          }
          
          console.log(`[WORD ONLINE] Downloading from Azure: ${azurePath}`);
          fileContent = await downloadFile(azurePath, firmId);
          
          if (fileContent && fileContent.length > 0) {
            console.log(`[WORD ONLINE] Downloaded ${fileContent.length} bytes from Azure`);
          }
        }
      } catch (azureErr) {
        console.error(`[WORD ONLINE] Azure download failed:`, azureErr.message);
      }
    }
    
    // If we still don't have content, we can't proceed
    if (!fileContent || fileContent.length === 0) {
      console.error(`[WORD ONLINE] Could not load document from any storage`);
      return null;
    }

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
/**
 * SAVE DOCUMENT FROM WORD ONLINE
 * This is the KEY endpoint that creates a new version when user saves in Word
 * It downloads the latest content from OneDrive and creates a new version
 */
router.post('/documents/:documentId/save', authenticate, async (req, res) => {
  try {
    const documentId = req.params.documentId;

    // Check edit access
    const canEdit = await checkDocumentAccess(documentId, req.user.id, req.user.firmId, req.user.role, 'edit');
    if (!canEdit) {
      return res.status(403).json({ error: 'No edit permission' });
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

    // Get valid access token with automatic refresh for long sessions
    let accessToken;
    try {
      accessToken = await getValidAccessToken(req.user.firmId);
    } catch (tokenError) {
      return res.status(401).json({ 
        error: 'Token expired', 
        needsReauth: true,
        message: 'Please reconnect your Microsoft account in Integrations'
      });
    }

    // Get file metadata from OneDrive to check if it was modified
    const metadataResponse = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${doc.graph_item_id}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (!metadataResponse.ok) {
      console.error('Failed to get file metadata:', await metadataResponse.text());
      return res.status(500).json({ error: 'Failed to check file status' });
    }

    const metadata = await metadataResponse.json();
    const lastModified = new Date(metadata.lastModifiedDateTime);

    // Download the file content from OneDrive
    const contentResponse = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${doc.graph_item_id}/content`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (!contentResponse.ok) {
      console.error('Failed to download file:', await contentResponse.text());
      return res.status(500).json({ error: 'Failed to download file' });
    }

    const fileBuffer = Buffer.from(await contentResponse.arrayBuffer());
    const crypto = require('crypto');
    const contentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Check if content actually changed
    if (doc.content_hash === contentHash) {
      return res.json({ 
        saved: false, 
        message: 'No changes detected',
        versionNumber: doc.version || 1
      });
    }

    // Extract text from the document (DOCX files)
    let textContent = '';
    try {
      const ext = (doc.original_name || doc.name || '').toLowerCase();
      if (ext.endsWith('.docx') || doc.type?.includes('word')) {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        textContent = result.value || '';
      } else if (ext.endsWith('.txt')) {
        textContent = fileBuffer.toString('utf-8');
      }
    } catch (extractError) {
      console.error('Text extraction error:', extractError.message);
    }

    // Get next version number
    const versionResult = await query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 as next_version 
       FROM document_versions WHERE document_id = $1`,
      [documentId]
    );
    const nextVersion = versionResult.rows[0].next_version;

    // Calculate word counts
    const wordCount = textContent ? textContent.split(/\s+/).filter(w => w).length : 0;
    const characterCount = textContent ? textContent.length : 0;

    // Get previous version for diff stats
    const prevVersion = await query(
      `SELECT word_count FROM document_versions 
       WHERE document_id = $1 ORDER BY version_number DESC LIMIT 1`,
      [documentId]
    );
    const prevWordCount = prevVersion.rows[0]?.word_count || 0;
    const wordsAdded = Math.max(0, wordCount - prevWordCount);
    const wordsRemoved = Math.max(0, prevWordCount - wordCount);

    // SAVE VERSION FILE - Store the actual file for version history downloads
    let versionFilePath = null;
    let versionContentUrl = null;
    let storageType = 'database';

    try {
      // Try Azure File Share storage first
      const { uploadFileBuffer, isAzureConfigured } = await import('../utils/azureStorage.js');
      const azureEnabled = await isAzureConfigured();
      
      const originalName = doc.original_name || doc.name || 'document';
      const ext = originalName.includes('.') ? originalName.substring(originalName.lastIndexOf('.')) : '.docx';
      const baseName = originalName.includes('.') ? originalName.substring(0, originalName.lastIndexOf('.')) : originalName;
      const versionFileName = `${baseName}_v${nextVersion}_${Date.now()}${ext}`;

      if (azureEnabled) {
        // Store in Azure File Share using buffer upload
        const azurePath = `versions/${documentId}/${versionFileName}`;
        await uploadFileBuffer(fileBuffer, azurePath, req.user.firmId);
        versionContentUrl = azurePath;
        storageType = 'azure_blob';
        console.log(`[VERSION SAVE] Stored version ${nextVersion} in Azure: ${azurePath}`);
      } else {
        // Store locally in uploads/versions folder
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const versionsDir = path.join(process.cwd(), 'uploads', 'versions', documentId);
        await fs.mkdir(versionsDir, { recursive: true });
        
        versionFilePath = path.join(versionsDir, versionFileName);
        await fs.writeFile(versionFilePath, fileBuffer);
        storageType = 'local';
        console.log(`[VERSION SAVE] Stored version ${nextVersion} locally: ${versionFilePath}`);
      }
    } catch (storageError) {
      console.error(`[VERSION SAVE] Failed to store version file (non-fatal):`, storageError.message);
      // Continue without file storage - text content will still be available
    }

    // CREATE NEW VERSION - This is the key operation!
    await query(
      `INSERT INTO document_versions (
        document_id, firm_id, version_number, version_label,
        content_text, content_hash, change_summary, change_type,
        word_count, character_count, words_added, words_removed,
        file_size, created_by, created_by_name, source,
        file_path, content_url, storage_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'edit', $8, $9, $10, $11, $12, $13, $14, 'word_online', $15, $16, $17)`,
      [
        documentId,
        req.user.firmId,
        nextVersion,
        `Saved from Word Online`,
        textContent,
        contentHash,
        `Saved from Word Online by ${req.user.firstName} ${req.user.lastName}`,
        wordCount,
        characterCount,
        wordsAdded,
        wordsRemoved,
        fileBuffer.length,
        req.user.id,
        `${req.user.firstName} ${req.user.lastName}`,
        versionFilePath,
        versionContentUrl,
        storageType
      ]
    );

    // Update document with new version info
    await query(
      `UPDATE documents SET 
        version = $1,
        version_count = $1,
        content_text = $2,
        content_hash = $3,
        size = $4,
        last_online_edit = NOW(),
        updated_at = NOW()
       WHERE id = $5`,
      [nextVersion, textContent, contentHash, fileBuffer.length, documentId]
    );

    // Update the word online session
    await query(
      `UPDATE word_online_sessions SET last_activity = NOW(), changes_count = changes_count + 1
       WHERE document_id = $1 AND user_id = $2 AND status = 'active'`,
      [documentId, req.user.id]
    );

    // Log activity
    await query(
      `INSERT INTO document_activities (document_id, firm_id, action, user_id, user_name, details)
       VALUES ($1, $2, 'save_from_word_online', $3, $4, $5)`,
      [
        documentId, 
        req.user.firmId, 
        req.user.id, 
        `${req.user.firstName} ${req.user.lastName}`,
        JSON.stringify({ 
          versionNumber: nextVersion, 
          wordCount, 
          wordsAdded, 
          wordsRemoved,
          source: 'word_online' 
        })
      ]
    );

    console.log(`[WORD ONLINE] Created version ${nextVersion} for document ${documentId}`);

    // Create notifications for other editors/interested parties
    try {
      await createDocumentNotification(
        documentId,
        req.user.firmId,
        req.user.id,
        'version_created',
        `${req.user.firstName} ${req.user.lastName} saved version ${nextVersion} in Word Online`
      );
    } catch (notifError) {
      console.error('Notification error (non-fatal):', notifError.message);
    }

    res.json({
      saved: true,
      versionNumber: nextVersion,
      wordCount,
      wordsAdded,
      wordsRemoved,
      message: `Version ${nextVersion} saved successfully`
    });
  } catch (error) {
    console.error('Save from Word Online error:', error);
    res.status(500).json({ error: 'Failed to save document' });
  }
});

/**
 * CHECK FOR CHANGES - Poll to see if document changed in OneDrive
 * Frontend can call this periodically to auto-save versions
 */
router.get('/documents/:documentId/check-changes', authenticate, async (req, res) => {
  try {
    const documentId = req.params.documentId;

    // Get document info
    const docResult = await query(
      `SELECT graph_item_id, content_hash, last_online_edit, version
       FROM documents WHERE id = $1 AND firm_id = $2`,
      [documentId, req.user.firmId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    if (!doc.graph_item_id) {
      return res.json({ hasChanges: false, reason: 'not_linked' });
    }

    // Get valid Microsoft token with automatic refresh
    let accessToken;
    try {
      accessToken = await getValidAccessToken(req.user.firmId);
    } catch (tokenError) {
      return res.json({ hasChanges: false, reason: 'not_connected' });
    }

    // Get file metadata from OneDrive
    const metadataResponse = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${doc.graph_item_id}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (!metadataResponse.ok) {
      return res.json({ hasChanges: false, reason: 'fetch_failed' });
    }

    const metadata = await metadataResponse.json();
    const lastModified = new Date(metadata.lastModifiedDateTime);
    const lastSync = doc.last_online_edit ? new Date(doc.last_online_edit) : null;

    // Check if file was modified after our last sync
    const hasChanges = !lastSync || lastModified > lastSync;

    res.json({
      hasChanges,
      lastModified: metadata.lastModifiedDateTime,
      lastSync: doc.last_online_edit,
      currentVersion: doc.version,
      modifiedBy: metadata.lastModifiedBy?.user?.displayName,
    });
  } catch (error) {
    console.error('Check changes error:', error);
    res.status(500).json({ error: 'Failed to check for changes' });
  }
});

/**
 * CLOSE SESSION - End editing and sync final version
 */
router.post('/documents/:documentId/close', authenticate, async (req, res) => {
  try {
    const documentId = req.params.documentId;

    // First, sync any pending changes from Word Online
    try {
      const syncResult = await syncDocumentFromOneDrive(documentId, req.user, req.user.firmId);
      if (syncResult.saved) {
        console.log(`[WORD ONLINE] Final sync created version ${syncResult.versionNumber} on close`);
      }
    } catch (syncError) {
      console.error('Final sync on close failed:', syncError.message);
      // Continue with close even if sync fails
    }

    // End the session
    await query(
      `UPDATE word_online_sessions 
       SET status = 'ended', ended_at = NOW()
       WHERE document_id = $1 AND user_id = $2 AND status = 'active'`,
      [documentId, req.user.id]
    );

    // Update active_editors on document
    await updateActiveEditors(documentId);

    res.json({ success: true, message: 'Session closed and changes saved' });
  } catch (error) {
    console.error('Close session error:', error);
    res.status(500).json({ error: 'Failed to close session' });
  }
});

/**
 * Helper function to sync document from OneDrive (reusable)
 * Uses token refresh for reliability
 */
async function syncDocumentFromOneDrive(documentId, user, firmId) {
  // Get document info
  const docResult = await query(
    `SELECT * FROM documents WHERE id = $1 AND firm_id = $2`,
    [documentId, firmId]
  );

  if (docResult.rows.length === 0) {
    throw new Error('Document not found');
  }

  const doc = docResult.rows[0];

  if (!doc.graph_item_id) {
    return { saved: false, reason: 'not_linked' };
  }

  // Get valid access token with automatic refresh
  let accessToken;
  try {
    accessToken = await getValidAccessToken(firmId);
  } catch (tokenError) {
    console.error('[SYNC] Token error:', tokenError.message);
    return { saved: false, reason: 'token_error', needsReauth: true };
  }

  // Download content
  const contentResponse = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${doc.graph_item_id}/content`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );

  if (!contentResponse.ok) {
    throw new Error('Failed to download from OneDrive');
  }

  const fileBuffer = Buffer.from(await contentResponse.arrayBuffer());
  const crypto = require('crypto');
  const contentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // Check if content changed
  if (doc.content_hash === contentHash) {
    return { saved: false, reason: 'no_changes', versionNumber: doc.version };
  }

  // Extract text
  let textContent = '';
  try {
    const ext = (doc.original_name || doc.name || '').toLowerCase();
    if (ext.endsWith('.docx') || doc.type?.includes('word')) {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      textContent = result.value || '';
    }
  } catch (e) {
    console.error('Text extraction failed:', e.message);
  }

  // Get next version
  const versionResult = await query(
    `SELECT COALESCE(MAX(version_number), 0) + 1 as next_version 
     FROM document_versions WHERE document_id = $1`,
    [documentId]
  );
  const nextVersion = versionResult.rows[0].next_version;

  // Create version
  await query(
    `INSERT INTO document_versions (
      document_id, firm_id, version_number, version_label,
      content_text, content_hash, change_summary, change_type,
      word_count, character_count, file_size, created_by, created_by_name, source
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'edit', $8, $9, $10, $11, $12, 'word_online')`,
    [
      documentId, firmId, nextVersion, 'Saved from Word Online',
      textContent, contentHash, `Saved from Word Online by ${user.firstName} ${user.lastName}`,
      textContent.split(/\s+/).filter(w => w).length,
      textContent.length, fileBuffer.length,
      user.id, `${user.firstName} ${user.lastName}`
    ]
  );

  // Update document
  await query(
    `UPDATE documents SET 
      version = $1, version_count = $1, content_text = $2, content_hash = $3,
      size = $4, last_online_edit = NOW(), updated_at = NOW()
     WHERE id = $5`,
    [nextVersion, textContent, contentHash, fileBuffer.length, documentId]
  );

  return { saved: true, versionNumber: nextVersion };
}

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

    // Send notifications to shared users
    try {
      // Get document name for notification
      const docInfo = await query(
        `SELECT name, original_name FROM documents WHERE id = $1`,
        [req.params.documentId]
      );
      const documentName = docInfo.rows[0]?.name || docInfo.rows[0]?.original_name || 'Document';
      const sharerName = `${req.user.firstName} ${req.user.lastName}`.trim() || 'Someone';
      
      // Collect all user IDs to notify (direct users + group members)
      const usersToNotify = new Set(userIds);
      
      // Get members of shared groups
      if (groupIds.length > 0) {
        const groupMembers = await query(
          `SELECT DISTINCT user_id FROM user_groups WHERE group_id = ANY($1)`,
          [groupIds]
        );
        groupMembers.rows.forEach(row => usersToNotify.add(row.user_id));
      }
      
      // Remove the sharer from notifications (don't notify yourself)
      usersToNotify.delete(req.user.id);
      
      // Create notifications for each user
      const notificationPromises = Array.from(usersToNotify).map(userId =>
        query(
          `INSERT INTO notifications (
            firm_id, user_id, type, title, message,
            entity_type, entity_id, triggered_by, action_url
          ) VALUES ($1, $2, 'document_shared', $3, $4, 'document', $5, $6, $7)`,
          [
            req.user.firmId,
            userId,
            `${sharerName} shared a document with you`,
            message || `"${documentName}" has been shared with you${permissionLevel === 'edit' ? ' for editing' : ''}.`,
            req.params.documentId,
            req.user.id,
            `/app/documents?preview=${req.params.documentId}`
          ]
        ).catch(err => {
          // Notification table might not exist or other non-critical error
          console.log(`[SHARE] Could not create notification for user ${userId}:`, err.message);
          return null;
        })
      );
      
      await Promise.all(notificationPromises);
      console.log(`[SHARE] Created ${usersToNotify.size} notification(s) for document ${req.params.documentId}`);
    } catch (notifyError) {
      // Don't fail the share operation if notifications fail
      console.error('[SHARE] Error creating notifications:', notifyError.message);
    }

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

    // Get document info
    const docResult = await query(
      `SELECT d.id, d.name, d.original_name, d.path, d.folder_path, d.azure_path
       FROM documents d
       WHERE d.id = $1 AND d.firm_id = $2`,
      [documentId, req.user.firmId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

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
    
    // Get content for each version, extracting from file if needed
    let content1 = v1.content_text || '';
    let content2 = v2.content_text || '';

    // Try to extract content from files if content_text is missing
    if (!content1 || !content2) {
      const { extractTextFromBuffer } = await import('./documents.js').catch(() => ({}));
      const { downloadFile } = await import('../utils/azureStorage.js').catch(() => ({}));
      
      // Helper to get version content
      const getVersionContent = async (version) => {
        if (version.content_text) return version.content_text;
        
        try {
          let fileBuffer = null;
          
          // Try version file_path
          if (version.file_path) {
            const fs = await import('fs/promises');
            try {
              fileBuffer = await fs.readFile(version.file_path);
            } catch (e) {
              console.log(`[REDLINE] Version file not found: ${version.file_path}`);
            }
          }
          
          // Try version content_url (Azure Blob)
          if (!fileBuffer && version.content_url) {
            try {
              const response = await fetch(version.content_url);
              if (response.ok) {
                fileBuffer = Buffer.from(await response.arrayBuffer());
              }
            } catch (e) {
              console.log(`[REDLINE] Failed to fetch from content_url: ${e.message}`);
            }
          }
          
          // If version file not available, try current document file
          // (for version 1, this might be the only option)
          if (!fileBuffer && version.version_number === 1) {
            // Try to get from Azure storage
            if (downloadFile && (doc.folder_path || doc.azure_path || doc.path)) {
              try {
                const downloadPath = doc.folder_path || doc.azure_path || doc.path;
                fileBuffer = await downloadFile(downloadPath);
              } catch (e) {
                console.log(`[REDLINE] Azure download failed: ${e.message}`);
              }
            }
            
            // Try local path
            if (!fileBuffer && doc.path) {
              const fs = await import('fs/promises');
              try {
                fileBuffer = await fs.readFile(doc.path);
              } catch (e) {
                console.log(`[REDLINE] Local file not found: ${doc.path}`);
              }
            }
          }
          
          // Extract text from buffer if we have one
          if (fileBuffer) {
            const fileName = doc.original_name || doc.name;
            const ext = fileName.toLowerCase().split('.').pop();
            
            if (ext === 'docx') {
              try {
                const mammoth = await import('mammoth');
                const result = await mammoth.extractRawText({ buffer: fileBuffer });
                const extractedText = result.value;
                
                // Cache the extracted content for future use
                if (extractedText) {
                  await query(
                    `UPDATE document_versions SET content_text = $1, word_count = $2 WHERE id = $3`,
                    [extractedText, extractedText.split(/\s+/).length, version.id]
                  ).catch(e => console.log('[REDLINE] Failed to cache content:', e.message));
                }
                
                return extractedText || '';
              } catch (e) {
                console.log(`[REDLINE] Mammoth extraction failed: ${e.message}`);
              }
            } else if (ext === 'txt' || ext === 'md') {
              return fileBuffer.toString('utf-8');
            }
          }
        } catch (e) {
          console.error(`[REDLINE] Content extraction error for version ${version.version_number}:`, e);
        }
        
        return '';
      };

      // Get content for both versions if missing
      if (!content1) {
        content1 = await getVersionContent(v1);
      }
      if (!content2) {
        content2 = await getVersionContent(v2);
      }
    }

    // Check if we have content to compare
    if (!content1 && !content2) {
      return res.status(400).json({ 
        error: 'No text content available for comparison',
        message: 'Neither version has extractable text content. Ensure documents are saved with text content.',
        version1HasContent: !!content1,
        version2HasContent: !!content2
      });
    }

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
        wordCount: v1.word_count || content1.split(/\s+/).length,
      },
      version2: {
        number: v2.version_number,
        label: v2.version_label,
        createdBy: v2.created_by_name,
        createdAt: v2.created_at,
        wordCount: v2.word_count || content2.split(/\s+/).length,
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

    // Get valid Microsoft token with automatic refresh
    let accessToken;
    try {
      accessToken = await getValidAccessToken(req.user.firmId);
    } catch (tokenError) {
      return res.status(400).json({ error: 'Microsoft integration not connected' });
    }

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

    // Check if Azure Blob is configured for version storage
    const useBlobStorage = await isBlobConfigured();
    let contentUrl = null;
    let storedInBlob = false;

    if (useBlobStorage && textContent) {
      try {
        const blobResult = await uploadVersionToBlob(
          req.user.firmId,
          documentId,
          nextVersion,
          textContent,
          {
            createdBy: req.user.id,
            changeType: 'edit',
            source: 'word_online',
            contentHash
          }
        );
        contentUrl = blobResult.url;
        storedInBlob = true;
        console.log(`[WORD SYNC] Stored v${nextVersion} in Azure Blob`);
      } catch (blobError) {
        console.error('[WORD SYNC] Blob upload failed, storing in DB:', blobError.message);
      }
    }

    // Create new version
    await query(
      `INSERT INTO document_versions (
        document_id, firm_id, version_number, version_label,
        content_text, content_url, content_hash, change_summary, change_type,
        word_count, character_count, storage_type, created_by, created_by_name, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'edit', $9, $10, $11, $12, $13, 'word_online')`,
      [
        documentId,
        req.user.firmId,
        nextVersion,
        `Synced from Word Online`,
        storedInBlob ? null : textContent, // Only store in DB if blob failed
        contentUrl,
        contentHash,
        'Edited in Word Online',
        textContent.split(/\s+/).filter(w => w).length,
        textContent.length,
        storedInBlob ? 'azure_blob' : 'database',
        req.user.id,
        `${req.user.firstName} ${req.user.lastName}`
      ]
    );

    // Update document - current version stays in documents table (always hot)
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

    // Generate download filenames for each version
    const originalName = doc.original_name || doc.name;
    const ext = originalName.includes('.') ? originalName.substring(originalName.lastIndexOf('.')) : '';
    const baseName = originalName.includes('.') ? originalName.substring(0, originalName.lastIndexOf('.')) : originalName;
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9 \-_]/g, '');

    res.json({
      document: {
        id: documentId,
        name: doc.name,
        originalName: doc.original_name,
        hasOnlineEdit: !!doc.graph_item_id,
        wordOnlineUrl: doc.word_online_url,
      },
      versions: versionsResult.rows.map(v => {
        const editorName = v.created_by_name || 'Unknown';
        const sanitizedEditorName = editorName.replace(/[^a-zA-Z0-9 \-_]/g, '');
        const versionDate = new Date(v.created_at);
        const dateStr = versionDate.toLocaleDateString('en-US', { 
          month: 'short', day: 'numeric', year: 'numeric' 
        });
        const downloadFilename = `${sanitizedBaseName} - ${sanitizedEditorName} - ${dateStr}${ext}`;
        
        return {
          id: v.id,
          versionNumber: v.version_number,
          versionLabel: v.version_label,
          changeSummary: v.change_summary,
          changeType: v.change_type,
          wordCount: v.word_count,
          wordsAdded: v.words_added,
          wordsRemoved: v.words_removed,
          fileSize: v.file_size,
          createdBy: v.created_by,
          createdByName: editorName,
          createdAt: v.created_at,
          source: v.source,
          canCompare: v.version_number > 1,
          // File availability info for downloads
          hasFile: !!(v.file_path || v.content_url),
          hasTextContent: !!v.content_text,
          storageType: v.storage_type || 'database',
          downloadFilename,
          downloadUrl: `/api/word-online/documents/${documentId}/versions/${v.version_number}/download`,
        };
      }),
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

/**
 * DOWNLOAD SPECIFIC VERSION
 * Downloads a specific version of a document with proper naming:
 * Format: {DocumentName} - {EditorName} - {Date}.{extension}
 * Example: "Motion to Dismiss - Sarah Johnson - Jan 6, 2024.docx"
 */
router.get('/documents/:documentId/versions/:versionNumber/download', authenticate, async (req, res) => {
  try {
    const { documentId, versionNumber } = req.params;

    // Check access
    const canView = await checkDocumentAccess(documentId, req.user.id, req.user.firmId, req.user.role, 'view');
    if (!canView) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get document info
    const docResult = await query(
      `SELECT d.name, d.original_name, d.type, d.path, d.graph_item_id, d.folder_path
       FROM documents d
       WHERE d.id = $1 AND d.firm_id = $2`,
      [documentId, req.user.firmId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    // Get the specific version
    const versionResult = await query(
      `SELECT dv.*, u.first_name, u.last_name
       FROM document_versions dv
       LEFT JOIN users u ON dv.created_by = u.id
       WHERE dv.document_id = $1 AND dv.version_number = $2`,
      [documentId, parseInt(versionNumber)]
    );

    if (versionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const version = versionResult.rows[0];
    const editorName = version.created_by_name || 
      (version.first_name && version.last_name ? `${version.first_name} ${version.last_name}` : 'Unknown');
    
    // Format the date
    const versionDate = new Date(version.created_at);
    const dateStr = versionDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });

    // Build the download filename
    // Format: "DocumentName - EditorName - Date.extension"
    const originalName = doc.original_name || doc.name;
    const ext = originalName.includes('.') ? originalName.substring(originalName.lastIndexOf('.')) : '';
    const baseName = originalName.includes('.') ? originalName.substring(0, originalName.lastIndexOf('.')) : originalName;
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9 \-_]/g, '');
    const sanitizedEditorName = editorName.replace(/[^a-zA-Z0-9 \-_]/g, '');
    
    const downloadFilename = `${sanitizedBaseName} - ${sanitizedEditorName} - ${dateStr}${ext}`;

    // Try to get the actual file content
    let fileBuffer = null;

    // 1. Check if version has stored file path
    if (version.file_path) {
      try {
        const fs = await import('fs/promises');
        fileBuffer = await fs.readFile(version.file_path);
      } catch (e) {
        console.log(`[VERSION DOWNLOAD] File path not found: ${version.file_path}`);
      }
    }

    // 2. Check if version has content_url (Azure Blob)
    if (!fileBuffer && version.content_url) {
      try {
        const { downloadFile } = await import('../utils/azureStorage.js');
        fileBuffer = await downloadFile(version.content_url, req.user.firmId);
      } catch (e) {
        console.log(`[VERSION DOWNLOAD] Azure URL not accessible: ${version.content_url}`);
      }
    }

    // 3. If this is the current version, try to get from the main document
    const isCurrentVersion = parseInt(versionNumber) === (await query(
      `SELECT version FROM documents WHERE id = $1`, [documentId]
    )).rows[0]?.version;

    if (!fileBuffer && isCurrentVersion) {
      // Try Azure storage for current document
      try {
        const { downloadFile, isAzureConfigured } = await import('../utils/azureStorage.js');
        const azureEnabled = await isAzureConfigured();
        if (azureEnabled) {
          const azurePath = doc.folder_path 
            ? `${doc.folder_path}/${doc.original_name || doc.name}`
            : doc.path;
          fileBuffer = await downloadFile(azurePath, req.user.firmId);
        }
      } catch (e) {
        console.log(`[VERSION DOWNLOAD] Azure current doc failed: ${e.message}`);
      }

      // Try local file
      if (!fileBuffer && doc.path) {
        try {
          const fs = await import('fs/promises');
          fileBuffer = await fs.readFile(doc.path);
        } catch (e) {
          console.log(`[VERSION DOWNLOAD] Local file not found: ${doc.path}`);
        }
      }
    }

    // 4. If we have content_text but no file, create a text file
    if (!fileBuffer && version.content_text) {
      // For text-based content, create a simple text file
      // Note: For proper Word doc reconstruction, we'd need a DOCX library
      const textContent = version.content_text;
      
      // If it was a Word doc, we'll return as .txt with a note
      if (ext === '.docx' || ext === '.doc') {
        const textWithNote = `[Version ${versionNumber} - Text Content]\n` +
          `Editor: ${editorName}\n` +
          `Date: ${dateStr}\n` +
          `---\n\n` +
          textContent;
        fileBuffer = Buffer.from(textWithNote, 'utf-8');
        
        // Change extension to .txt since we only have text
        const textFilename = `${sanitizedBaseName} - ${sanitizedEditorName} - ${dateStr}.txt`;
        
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(textFilename)}"`);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Length', fileBuffer.length);
        
        // Log the download
        await query(
          `INSERT INTO document_activities (document_id, firm_id, action, user_id, user_name, details)
           VALUES ($1, $2, 'download_version', $3, $4, $5)`,
          [
            documentId, req.user.firmId, req.user.id,
            `${req.user.firstName} ${req.user.lastName}`,
            JSON.stringify({ versionNumber: parseInt(versionNumber), format: 'text' })
          ]
        );

        return res.send(fileBuffer);
      }
    }

    if (!fileBuffer) {
      return res.status(404).json({ 
        error: 'Version file not available',
        message: 'The file for this version is not stored. Only text content is available.',
        hasTextContent: !!version.content_text
      });
    }

    // Determine MIME type
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
    };
    const contentType = mimeTypes[ext.toLowerCase()] || doc.type || 'application/octet-stream';

    // Set headers and send
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFilename)}"`);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileBuffer.length);

    // Log the download
    await query(
      `INSERT INTO document_activities (document_id, firm_id, action, user_id, user_name, details)
       VALUES ($1, $2, 'download_version', $3, $4, $5)`,
      [
        documentId, req.user.firmId, req.user.id,
        `${req.user.firstName} ${req.user.lastName}`,
        JSON.stringify({ versionNumber: parseInt(versionNumber), filename: downloadFilename })
      ]
    );

    console.log(`[VERSION DOWNLOAD] Serving version ${versionNumber}: ${downloadFilename} (${fileBuffer.length} bytes)`);
    res.send(fileBuffer);

  } catch (error) {
    console.error('Download version error:', error);
    res.status(500).json({ error: 'Failed to download version' });
  }
});

/**
 * GET VERSION INFO
 * Returns info about a specific version including download filename
 */
router.get('/documents/:documentId/versions/:versionNumber', authenticate, async (req, res) => {
  try {
    const { documentId, versionNumber } = req.params;

    // Check access
    const canView = await checkDocumentAccess(documentId, req.user.id, req.user.firmId, req.user.role, 'view');
    if (!canView) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get document and version info
    const result = await query(
      `SELECT 
        dv.*,
        d.name as doc_name,
        d.original_name,
        d.type as doc_type,
        u.first_name,
        u.last_name
       FROM document_versions dv
       JOIN documents d ON dv.document_id = d.id
       LEFT JOIN users u ON dv.created_by = u.id
       WHERE dv.document_id = $1 AND dv.version_number = $2 AND d.firm_id = $3`,
      [documentId, parseInt(versionNumber), req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const v = result.rows[0];
    const editorName = v.created_by_name || 
      (v.first_name && v.last_name ? `${v.first_name} ${v.last_name}` : 'Unknown');
    
    // Format the date
    const versionDate = new Date(v.created_at);
    const dateStr = versionDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });

    // Build the download filename
    const originalName = v.original_name || v.doc_name;
    const ext = originalName.includes('.') ? originalName.substring(originalName.lastIndexOf('.')) : '';
    const baseName = originalName.includes('.') ? originalName.substring(0, originalName.lastIndexOf('.')) : originalName;
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9 \-_]/g, '');
    const sanitizedEditorName = editorName.replace(/[^a-zA-Z0-9 \-_]/g, '');
    
    const downloadFilename = `${sanitizedBaseName} - ${sanitizedEditorName} - ${dateStr}${ext}`;

    res.json({
      id: v.id,
      documentId: v.document_id,
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
      createdByName: editorName,
      createdAt: v.created_at,
      source: v.source,
      downloadFilename,
      downloadUrl: `/api/word-online/documents/${documentId}/versions/${versionNumber}/download`,
      hasFile: !!(v.file_path || v.content_url),
      hasTextContent: !!v.content_text,
    });
  } catch (error) {
    console.error('Get version error:', error);
    res.status(500).json({ error: 'Failed to get version' });
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
  try {
    // Call Microsoft Graph API to get the file's webUrl
    const response = await fetch(`${GRAPH_API_BASE}/me/drive/items/${graphItemId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      console.error('[WORD ONLINE URL] Graph API error:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    // The webUrl from OneDrive can be opened in Word Online
    // Adding ?web=1 forces browser viewing, or we can use the native URL
    if (data.webUrl) {
      // For Word documents, append action=edit to open in edit mode
      const editUrl = data.webUrl.includes('?') 
        ? `${data.webUrl}&action=edit`
        : `${data.webUrl}?action=edit`;
      console.log(`[WORD ONLINE URL] Got edit URL: ${editUrl}`);
      return editUrl;
    }
    
    return null;
  } catch (error) {
    console.error('[WORD ONLINE URL] Error:', error.message);
    return null;
  }
}

// ============================================
// MICROSOFT GRAPH WEBHOOK
// ============================================

/**
 * Microsoft Graph sends change notifications to this endpoint
 * When a user saves a document in Word Online, Microsoft calls this
 */
router.post('/webhook', async (req, res) => {
  try {
    // Microsoft sends a validation request first
    if (req.query.validationToken) {
      console.log('[WEBHOOK] Validation request received');
      res.set('Content-Type', 'text/plain');
      return res.send(req.query.validationToken);
    }

    // Process change notifications
    const notifications = req.body?.value || [];
    
    for (const notification of notifications) {
      console.log('[WEBHOOK] Change notification:', JSON.stringify(notification));
      
      const resourceId = notification.resourceData?.id;
      if (!resourceId) continue;

      // Find document by graph_item_id
      const docResult = await query(
        `SELECT d.id, d.firm_id, d.content_hash
         FROM documents d
         WHERE d.graph_item_id = $1`,
        [resourceId]
      );

      if (docResult.rows.length === 0) {
        console.log(`[WEBHOOK] No document found for graph_item_id: ${resourceId}`);
        continue;
      }

      const doc = docResult.rows[0];

      // Get active session user for this document
      const sessionResult = await query(
        `SELECT ws.user_id, u.first_name, u.last_name, u.role
         FROM word_online_sessions ws
         JOIN users u ON ws.user_id = u.id
         WHERE ws.document_id = $1 AND ws.status = 'active'
         ORDER BY ws.last_activity DESC LIMIT 1`,
        [doc.id]
      );

      if (sessionResult.rows.length === 0) {
        console.log(`[WEBHOOK] No active session for document: ${doc.id}`);
        continue;
      }

      const user = sessionResult.rows[0];

      // Sync the document and create new version
      try {
        const syncResult = await syncDocumentFromOneDrive(doc.id, {
          id: user.user_id,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role
        }, doc.firm_id);

        if (syncResult.saved) {
          console.log(`[WEBHOOK] Created version ${syncResult.versionNumber} for document ${doc.id}`);
        }
      } catch (syncError) {
        console.error(`[WEBHOOK] Sync failed for document ${doc.id}:`, syncError.message);
      }
    }

    res.status(202).send(); // Accepted
  } catch (error) {
    console.error('[WEBHOOK] Error processing notification:', error);
    res.status(500).send();
  }
});

// ============================================
// POLLING FALLBACK WHEN WEBHOOKS FAIL
// ============================================

/**
 * Start auto-polling for a document
 * Frontend calls this when webhooks aren't available
 * Returns polling config and initial state
 */
router.post('/documents/:documentId/start-polling', authenticate, async (req, res) => {
  try {
    const documentId = req.params.documentId;
    const { intervalMs = 30000 } = req.body; // Default 30 seconds

    // Get document info
    const docResult = await query(
      `SELECT graph_item_id, content_hash, last_online_edit, version
       FROM documents WHERE id = $1 AND firm_id = $2`,
      [documentId, req.user.firmId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    if (!doc.graph_item_id) {
      return res.json({ 
        polling: false, 
        reason: 'not_linked',
        message: 'Document is not linked to OneDrive'
      });
    }

    // Update session to indicate polling mode
    await query(
      `UPDATE word_online_sessions SET 
        polling_mode = true,
        polling_interval = $1,
        last_poll = NOW()
       WHERE document_id = $2 AND user_id = $3 AND status = 'active'`,
      [intervalMs, documentId, req.user.id]
    );

    res.json({
      polling: true,
      intervalMs: intervalMs,
      currentVersion: doc.version,
      lastSync: doc.last_online_edit,
      contentHash: doc.content_hash,
      message: `Polling for changes every ${intervalMs / 1000} seconds`
    });
  } catch (error) {
    console.error('Start polling error:', error);
    res.status(500).json({ error: 'Failed to start polling' });
  }
});

/**
 * Poll for changes and auto-sync if detected
 * Frontend calls this at regular intervals
 * Automatically creates a new version if changes detected
 */
router.post('/documents/:documentId/poll-sync', authenticate, async (req, res) => {
  try {
    const documentId = req.params.documentId;

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
      return res.json({ hasChanges: false, reason: 'not_linked' });
    }

    // Get valid access token (refresh if needed)
    let accessToken;
    try {
      accessToken = await getValidAccessToken(req.user.firmId);
    } catch (tokenError) {
      return res.json({ 
        hasChanges: false, 
        reason: 'token_error',
        needsReauth: true,
        message: 'Please reconnect Microsoft in Integrations'
      });
    }

    // Get file metadata from OneDrive
    const metadataResponse = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${doc.graph_item_id}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (!metadataResponse.ok) {
      const status = metadataResponse.status;
      if (status === 401) {
        return res.json({ 
          hasChanges: false, 
          reason: 'unauthorized',
          needsReauth: true
        });
      }
      return res.json({ hasChanges: false, reason: 'fetch_failed' });
    }

    const metadata = await metadataResponse.json();
    const lastModified = new Date(metadata.lastModifiedDateTime);
    const lastSync = doc.last_online_edit ? new Date(doc.last_online_edit) : null;

    // Update poll timestamp
    await query(
      `UPDATE word_online_sessions SET last_poll = NOW()
       WHERE document_id = $1 AND user_id = $2 AND status = 'active'`,
      [documentId, req.user.id]
    );

    // Check if file was modified after our last sync
    if (!lastSync || lastModified > lastSync) {
      // Auto-sync: download and create new version
      try {
        const syncResult = await syncDocumentFromOneDrive(documentId, req.user, req.user.firmId);
        
        if (syncResult.saved) {
          // Create notification for other editors
          await createDocumentNotification(
            documentId,
            req.user.firmId,
            req.user.id,
            'version_created',
            `${req.user.firstName} ${req.user.lastName} saved version ${syncResult.versionNumber}`
          );

          return res.json({
            hasChanges: true,
            synced: true,
            versionNumber: syncResult.versionNumber,
            modifiedBy: metadata.lastModifiedBy?.user?.displayName,
            lastModified: metadata.lastModifiedDateTime,
            message: `Version ${syncResult.versionNumber} synced automatically`
          });
        }
      } catch (syncError) {
        console.error('Auto-sync during poll failed:', syncError.message);
      }

      return res.json({
        hasChanges: true,
        synced: false,
        modifiedBy: metadata.lastModifiedBy?.user?.displayName,
        lastModified: metadata.lastModifiedDateTime,
        message: 'Changes detected but sync failed'
      });
    }

    res.json({
      hasChanges: false,
      lastModified: metadata.lastModifiedDateTime,
      lastSync: doc.last_online_edit,
      currentVersion: doc.version
    });
  } catch (error) {
    console.error('Poll-sync error:', error);
    res.status(500).json({ error: 'Failed to poll for changes' });
  }
});

// ============================================
// NOTIFICATIONS
// ============================================

/**
 * Create a document change notification
 */
async function createDocumentNotification(documentId, firmId, triggeredByUserId, type, message) {
  try {
    // Get all users who should be notified (active editors, owner, people with permissions)
    const usersResult = await query(
      `SELECT DISTINCT u.id, u.email, u.first_name
       FROM users u
       WHERE u.firm_id = $1 AND u.id != $2
       AND (
         -- Active editors on this document
         u.id IN (
           SELECT user_id FROM word_online_sessions 
           WHERE document_id = $3 AND status = 'active' 
             AND last_activity > NOW() - INTERVAL '30 minutes'
         )
         -- Document owner
         OR u.id IN (SELECT owner_id FROM documents WHERE id = $3)
         -- Users with explicit permissions
         OR u.id IN (
           SELECT user_id FROM document_permissions 
           WHERE document_id = $3 AND user_id IS NOT NULL
         )
       )`,
      [firmId, triggeredByUserId, documentId]
    );

    if (usersResult.rows.length === 0) {
      return { notified: 0 };
    }

    // Create notifications for each user
    const notificationInserts = usersResult.rows.map(user => 
      query(
        `INSERT INTO notifications (
          firm_id, user_id, type, title, message, 
          entity_type, entity_id, triggered_by
        ) VALUES ($1, $2, $3, $4, $5, 'document', $6, $7)`,
        [
          firmId,
          user.id,
          type,
          'Document Updated',
          message,
          documentId,
          triggeredByUserId
        ]
      ).catch(err => {
        // notifications table might not exist, that's OK
        console.log(`[NOTIFICATION] Could not create notification:`, err.message);
        return null;
      })
    );

    await Promise.all(notificationInserts);

    console.log(`[NOTIFICATION] Created ${usersResult.rows.length} notifications for document ${documentId}`);
    return { notified: usersResult.rows.length };
  } catch (error) {
    console.error('[NOTIFICATION] Error:', error.message);
    return { notified: 0, error: error.message };
  }
}

/**
 * Get notifications for current user
 */
router.get('/notifications', authenticate, async (req, res) => {
  try {
    const { unreadOnly = false, limit = 50 } = req.query;

    let sql = `
      SELECT n.*, d.name as document_name, d.original_name,
             u.first_name || ' ' || u.last_name as triggered_by_name
      FROM notifications n
      LEFT JOIN documents d ON n.entity_type = 'document' AND n.entity_id = d.id
      LEFT JOIN users u ON n.triggered_by = u.id
      WHERE n.user_id = $1 AND n.firm_id = $2
    `;
    
    const params = [req.user.id, req.user.firmId];
    
    if (unreadOnly === 'true') {
      sql += ` AND n.read_at IS NULL`;
    }
    
    sql += ` ORDER BY n.created_at DESC LIMIT $3`;
    params.push(parseInt(limit) || 50);

    const result = await query(sql, params);

    // Get unread count
    const unreadResult = await query(
      `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND firm_id = $2 AND read_at IS NULL`,
      [req.user.id, req.user.firmId]
    );

    res.json({
      notifications: result.rows.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        documentId: n.entity_type === 'document' ? n.entity_id : null,
        documentName: n.document_name || n.original_name,
        triggeredBy: n.triggered_by,
        triggeredByName: n.triggered_by_name,
        read: !!n.read_at,
        createdAt: n.created_at
      })),
      unreadCount: parseInt(unreadResult.rows[0].count)
    });
  } catch (error) {
    // Table might not exist
    if (error.code === '42P01') {
      return res.json({ notifications: [], unreadCount: 0 });
    }
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

/**
 * Mark notification as read
 */
router.put('/notifications/:id/read', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE notifications SET read_at = NOW() 
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

/**
 * Mark all notifications as read
 */
router.put('/notifications/read-all', authenticate, async (req, res) => {
  try {
    const result = await query(
      `UPDATE notifications SET read_at = NOW() 
       WHERE user_id = $1 AND firm_id = $2 AND read_at IS NULL`,
      [req.user.id, req.user.firmId]
    );
    res.json({ success: true, marked: result.rowCount });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

/**
 * Get real-time notifications via Server-Sent Events (SSE)
 * Frontend can use this for live updates
 */
router.get('/notifications/stream', authenticate, async (req, res) => {
  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', userId: req.user.id })}\n\n`);

  // Store the user's SSE connection (in production, use Redis or similar)
  const userId = req.user.id;
  if (!global.sseConnections) global.sseConnections = new Map();
  global.sseConnections.set(userId, res);

  // Send heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'heartbeat', time: new Date().toISOString() })}\n\n`);
  }, 30000);

  // Clean up on close
  req.on('close', () => {
    clearInterval(heartbeat);
    global.sseConnections.delete(userId);
  });
});

/**
 * Send SSE notification to a user (internal helper)
 */
function sendSSENotification(userId, notification) {
  if (global.sseConnections && global.sseConnections.has(userId)) {
    const connection = global.sseConnections.get(userId);
    connection.write(`data: ${JSON.stringify(notification)}\n\n`);
  }
}

/**
 * Subscribe to file change notifications for a document
 * Called when user opens a document in Word Online
 */
router.post('/documents/:documentId/subscribe', authenticate, async (req, res) => {
  try {
    const documentId = req.params.documentId;

    // Get document info
    const docResult = await query(
      `SELECT graph_item_id FROM documents WHERE id = $1 AND firm_id = $2`,
      [documentId, req.user.firmId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    if (!doc.graph_item_id) {
      return res.json({ subscribed: false, reason: 'not_linked' });
    }

    // Get valid Microsoft token with automatic refresh
    let accessToken;
    try {
      accessToken = await getValidAccessToken(req.user.firmId);
    } catch (tokenError) {
      return res.json({ subscribed: false, reason: 'not_connected' });
    }

    const webhookUrl = process.env.API_BASE_URL 
      ? `${process.env.API_BASE_URL}/api/word-online/webhook`
      : null;

    if (!webhookUrl) {
      return res.json({ 
        subscribed: false, 
        reason: 'webhook_url_not_configured',
        message: 'Use polling instead (check-changes endpoint)'
      });
    }

    // Create subscription via Microsoft Graph
    const subscriptionResponse = await fetch(
      'https://graph.microsoft.com/v1.0/subscriptions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          changeType: 'updated',
          notificationUrl: webhookUrl,
          resource: `/me/drive/items/${doc.graph_item_id}`,
          expirationDateTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours
          clientState: `apex_${req.user.firmId}_${documentId}`
        })
      }
    );

    if (!subscriptionResponse.ok) {
      const errorText = await subscriptionResponse.text();
      console.error('[SUBSCRIBE] Failed to create subscription:', errorText);
      return res.json({ 
        subscribed: false, 
        reason: 'subscription_failed',
        message: 'Use polling instead (check-changes endpoint)'
      });
    }

    const subscription = await subscriptionResponse.json();

    // Store subscription ID with the session
    await query(
      `UPDATE word_online_sessions SET 
        graph_subscription_id = $1
       WHERE document_id = $2 AND user_id = $3 AND status = 'active'`,
      [subscription.id, documentId, req.user.id]
    );

    res.json({
      subscribed: true,
      subscriptionId: subscription.id,
      expiresAt: subscription.expirationDateTime,
      message: 'Will receive notifications when document is saved'
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

export { checkDocumentAccess };
export default router;
