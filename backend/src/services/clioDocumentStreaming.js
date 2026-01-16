import { Readable } from 'stream';
import { uploadFileBuffer, ensureDirectory, isAzureConfigured, getShareClient } from '../utils/azureStorage.js';
import { query } from '../db/connection.js';

// ============================================
// CLIO DOCUMENT STREAMING SERVICE
// ============================================
// Streams documents directly from Clio API to Azure Storage
// using MemoryStream - NO local disk storage!
//
// Flow:
// 1. Fetch document metadata from Clio
// 2. Get download URL from Clio document versions endpoint
// 3. Stream directly to Azure Blob/File Share using Buffer
// 4. Create document record with proper permissions

const CLIO_API_BASE = 'https://app.clio.com/api/v4';

/**
 * Rate-limited delay helper
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Make Clio API request with retry logic
 */
async function clioApiRequest(accessToken, endpoint, retryCount = 0) {
  const MAX_RETRIES = 3;
  const url = `${CLIO_API_BASE}${endpoint}`;
  
  console.log(`[CLIO DOC] GET ${endpoint}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      
      // Handle rate limiting with automatic retry
      if (response.status === 429) {
        if (retryCount >= MAX_RETRIES) {
          throw new Error('Clio rate limit exceeded after maximum retries.');
        }
        let waitTime = 60;
        try {
          const errorObj = JSON.parse(errorText);
          const match = errorObj?.error?.message?.match(/Retry in (\d+) seconds/);
          if (match) {
            waitTime = parseInt(match[1], 10) + 5;
          }
        } catch (e) {}
        console.log(`[CLIO DOC] Rate limited. Waiting ${waitTime}s...`);
        await delay(waitTime * 1000);
        return clioApiRequest(accessToken, endpoint, retryCount + 1);
      }
      
      throw new Error(`Clio API error: ${response.status} - ${errorText}`);
    }
    
    return response.json();
  } catch (error) {
    console.error(`[CLIO DOC] Request failed:`, error.message);
    throw error;
  }
}

/**
 * Stream file content from Clio download URL directly to memory buffer
 * NO disk storage - pure memory streaming
 */
async function streamFromClioToBuffer(downloadUrl, accessToken) {
  console.log(`[CLIO DOC] Streaming from Clio...`);
  
  const response = await fetch(downloadUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to download from Clio: ${response.status}`);
  }
  
  // Read the response body as ArrayBuffer and convert to Buffer
  // This keeps everything in memory without touching disk
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  console.log(`[CLIO DOC] Streamed ${buffer.length} bytes to memory`);
  return buffer;
}

/**
 * Get document download URL from Clio
 * Clio documents have versions, we get the latest version's download URL
 */
async function getDocumentDownloadUrl(accessToken, documentId) {
  // Get document with latest version info
  const docData = await clioApiRequest(
    accessToken, 
    `/documents/${documentId}.json?fields=id,name,latest_document_version{id,size,download_url,content_type}`
  );
  
  if (!docData.data?.latest_document_version?.download_url) {
    throw new Error(`No download URL available for document ${documentId}`);
  }
  
  return {
    downloadUrl: docData.data.latest_document_version.download_url,
    size: docData.data.latest_document_version.size,
    contentType: docData.data.latest_document_version.content_type
  };
}

/**
 * Build folder path for document in Azure
 * Maps Clio structure to our structure
 */
function buildAzurePath(doc, matterId, clientId, matterNumber, clioPath) {
  // If linked to matter, put in matter folder
  if (matterId) {
    const subfolder = clioPath ? `/${clioPath.split('/').slice(1).join('/')}` : '';
    return `matters/matter-${matterId}${subfolder}/${doc.name}`;
  }
  
  // If linked to client but not matter, put in client folder
  if (clientId) {
    return `clients/client-${clientId}/documents/${doc.name}`;
  }
  
  // Otherwise, put in imported folder
  return `documents/Imported/Clio/${doc.name}`;
}

/**
 * Map Clio permission users to our user IDs
 */
async function mapClioUserToOurUser(clioUserId, firmId, clioUserIdMap) {
  // Check if we already have this mapping
  if (clioUserIdMap.has(clioUserId)) {
    return clioUserIdMap.get(clioUserId);
  }
  
  // Try to find by clio_id in our users table (from previous migration)
  try {
    const result = await query(
      `SELECT id FROM users WHERE firm_id = $1 AND clio_id = $2`,
      [firmId, clioUserId]
    );
    if (result.rows.length > 0) {
      clioUserIdMap.set(clioUserId, result.rows[0].id);
      return result.rows[0].id;
    }
  } catch (e) {
    // Column might not exist
  }
  
  return null;
}

/**
 * Stream a single document from Clio to Azure
 * 
 * @param {string} accessToken - Clio OAuth access token
 * @param {object} manifest - Document manifest record from clio_document_manifest
 * @param {string} firmId - Target firm ID
 * @param {object} options - Additional options
 * @returns {Promise<{success: boolean, documentId?: string, error?: string}>}
 */
export async function streamDocumentToAzure(accessToken, manifest, firmId, options = {}) {
  const { matterIdMap = new Map(), clientIdMap = new Map(), userIdMap = new Map() } = options;
  
  try {
    console.log(`[CLIO DOC] Streaming document: ${manifest.name} (Clio ID: ${manifest.clio_id})`);
    
    // 1. Get download URL from Clio
    const { downloadUrl, size, contentType } = await getDocumentDownloadUrl(accessToken, manifest.clio_id);
    
    // 2. Stream content to memory buffer
    const buffer = await streamFromClioToBuffer(downloadUrl, accessToken);
    
    // 3. Map Clio IDs to our IDs
    const matterId = manifest.matter_id || (manifest.clio_matter_id ? matterIdMap.get(manifest.clio_matter_id) : null);
    const clientId = manifest.client_id || (manifest.clio_client_id ? clientIdMap.get(manifest.clio_client_id) : null);
    const ownerId = manifest.owner_id || (manifest.clio_created_by_id ? userIdMap.get(manifest.clio_created_by_id) : null);
    
    // 4. Build target path in Azure
    const targetPath = buildAzurePath(
      manifest,
      matterId,
      clientId,
      null,
      manifest.clio_path
    );
    
    // 5. Ensure directory exists
    const dirPath = targetPath.split('/').slice(0, -1).join('/');
    await ensureDirectory(`firm-${firmId}/${dirPath}`);
    
    // 6. Upload buffer to Azure (no disk!)
    const uploadResult = await uploadFileBuffer(buffer, targetPath, firmId);
    
    // 7. Create document record with permissions
    const docResult = await query(`
      INSERT INTO documents (
        firm_id, matter_id, name, original_name, path, folder_path,
        type, size, uploaded_by, owner_id, privacy_level, status,
        storage_location, external_path, clio_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (firm_id, path) DO UPDATE SET
        matter_id = COALESCE(EXCLUDED.matter_id, documents.matter_id),
        size = EXCLUDED.size,
        updated_at = NOW()
      RETURNING id
    `, [
      firmId,
      matterId,
      manifest.name,
      manifest.name,
      uploadResult.path,
      dirPath,
      contentType || manifest.content_type || 'application/octet-stream',
      buffer.length,
      ownerId,
      ownerId,
      matterId ? 'team' : 'firm',  // Matter docs = team access, general = firm-wide
      'final',
      'azure',
      uploadResult.path,
      manifest.clio_id,
      manifest.clio_created_at || new Date()
    ]);
    
    const documentId = docResult.rows[0].id;
    
    // 8. Update manifest status
    await query(`
      UPDATE clio_document_manifest SET
        match_status = 'imported',
        matched_azure_path = $1,
        matched_document_id = $2,
        match_confidence = 100,
        match_method = 'streamed',
        updated_at = NOW()
      WHERE id = $3
    `, [uploadResult.path, documentId, manifest.id]);
    
    // 9. Set up document permissions if we have an owner
    if (ownerId) {
      await query(`
        INSERT INTO document_permissions (
          document_id, firm_id, user_id, permission_level,
          can_view, can_download, can_edit, can_delete, can_share, can_manage_permissions
        ) VALUES ($1, $2, $3, 'full', true, true, true, true, true, true)
        ON CONFLICT DO NOTHING
      `, [documentId, firmId, ownerId]);
    }
    
    console.log(`[CLIO DOC] Successfully imported: ${manifest.name} -> ${uploadResult.path}`);
    
    return {
      success: true,
      documentId,
      path: uploadResult.path,
      size: buffer.length
    };
    
  } catch (error) {
    console.error(`[CLIO DOC] Failed to stream ${manifest.name}:`, error.message);
    
    // Update manifest with error status
    await query(`
      UPDATE clio_document_manifest SET
        match_status = 'error',
        updated_at = NOW()
      WHERE id = $1
    `, [manifest.id]).catch(() => {});
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Batch stream documents from Clio to Azure
 * Processes documents with rate limiting and progress tracking
 * 
 * @param {string} accessToken - Clio OAuth access token
 * @param {string} firmId - Target firm ID
 * @param {object} options - Options including batchSize, onProgress callback
 * @returns {Promise<{success: number, failed: number, errors: array}>}
 */
export async function batchStreamDocuments(accessToken, firmId, options = {}) {
  const { 
    batchSize = 10, 
    onProgress = () => {},
    limit = null,  // Optional limit for testing
    matterIdMap = new Map(),
    clientIdMap = new Map(),
    userIdMap = new Map()
  } = options;
  
  console.log(`[CLIO DOC] Starting batch document stream for firm ${firmId}`);
  
  // Check Azure configuration
  const azureConfigured = await isAzureConfigured();
  if (!azureConfigured) {
    throw new Error('Azure Storage not configured. Configure it in Admin Portal first.');
  }
  
  // Get pending documents from manifest
  let queryStr = `
    SELECT * FROM clio_document_manifest 
    WHERE firm_id = $1 AND match_status = 'pending'
    ORDER BY clio_id
  `;
  const queryParams = [firmId];
  
  if (limit) {
    queryStr += ' LIMIT $2';
    queryParams.push(limit);
  }
  
  const manifestResult = await query(queryStr, queryParams);
  const documents = manifestResult.rows;
  
  console.log(`[CLIO DOC] Found ${documents.length} pending documents to stream`);
  onProgress({ total: documents.length, processed: 0, success: 0, failed: 0, status: 'starting' });
  
  if (documents.length === 0) {
    return { success: 0, failed: 0, errors: [], message: 'No pending documents to import' };
  }
  
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };
  
  // Process in batches to avoid memory issues
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    
    // Process batch concurrently
    const batchPromises = batch.map(async (doc) => {
      try {
        const result = await streamDocumentToAzure(accessToken, doc, firmId, {
          matterIdMap,
          clientIdMap,
          userIdMap
        });
        
        if (result.success) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push({ id: doc.clio_id, name: doc.name, error: result.error });
        }
      } catch (err) {
        results.failed++;
        results.errors.push({ id: doc.clio_id, name: doc.name, error: err.message });
      }
    });
    
    await Promise.all(batchPromises);
    
    // Progress update
    const processed = Math.min(i + batchSize, documents.length);
    onProgress({
      total: documents.length,
      processed,
      success: results.success,
      failed: results.failed,
      status: processed < documents.length ? 'processing' : 'complete',
      currentBatch: Math.floor(i / batchSize) + 1,
      totalBatches: Math.ceil(documents.length / batchSize)
    });
    
    // Rate limiting delay between batches
    if (i + batchSize < documents.length) {
      await delay(500); // 500ms between batches
    }
  }
  
  console.log(`[CLIO DOC] Batch complete: ${results.success} success, ${results.failed} failed`);
  
  return results;
}

/**
 * Fetch document metadata from Clio and populate manifest table
 * This prepares documents for streaming without downloading them yet
 */
export async function fetchDocumentManifestFromClio(accessToken, firmId, options = {}) {
  const { onProgress = () => {}, matterIdMap = new Map() } = options;
  
  console.log(`[CLIO DOC] Fetching document manifest from Clio...`);
  
  let allDocuments = [];
  let nextUrl = `${CLIO_API_BASE}/documents.json?fields=id,name,parent,matter,created_at,updated_at,content_type,latest_document_version{id,size}&limit=200&order=id(asc)`;
  
  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const text = await response.text();
      if (response.status === 429) {
        // Rate limited - wait and retry
        console.log('[CLIO DOC] Rate limited, waiting 60s...');
        await delay(60000);
        continue;
      }
      throw new Error(`Failed to fetch documents: ${response.status} - ${text}`);
    }
    
    const data = await response.json();
    allDocuments = allDocuments.concat(data.data || []);
    
    onProgress({ fetched: allDocuments.length, status: 'fetching' });
    console.log(`[CLIO DOC] Fetched ${allDocuments.length} documents...`);
    
    // Check for next page
    nextUrl = data.meta?.paging?.next || null;
    
    // Small delay between pages
    if (nextUrl) await delay(200);
  }
  
  console.log(`[CLIO DOC] Fetched total ${allDocuments.length} documents`);
  
  // Also fetch folders for path reconstruction
  let allFolders = [];
  let folderNextUrl = `${CLIO_API_BASE}/folders.json?fields=id,name,parent,matter&limit=200&order=id(asc)`;
  
  while (folderNextUrl) {
    try {
      const response = await fetch(folderNextUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          await delay(60000);
          continue;
        }
        break;
      }
      
      const data = await response.json();
      allFolders = allFolders.concat(data.data || []);
      folderNextUrl = data.meta?.paging?.next || null;
      
      if (folderNextUrl) await delay(200);
    } catch (e) {
      console.log(`[CLIO DOC] Could not fetch folders: ${e.message}`);
      break;
    }
  }
  
  console.log(`[CLIO DOC] Fetched ${allFolders.length} folders`);
  
  // Build folder path lookup
  const folderById = new Map();
  for (const f of allFolders) {
    folderById.set(f.id, f);
  }
  
  const buildFolderPath = (folderId, visited = new Set()) => {
    if (!folderId || visited.has(folderId)) return '';
    visited.add(folderId);
    
    const folder = folderById.get(folderId);
    if (!folder) return '';
    
    const parentPath = folder.parent?.id ? buildFolderPath(folder.parent.id, visited) : '';
    return parentPath ? `${parentPath}/${folder.name}` : folder.name;
  };
  
  // Store folders in manifest
  for (const f of allFolders) {
    try {
      const path = buildFolderPath(f.id);
      const matterIdForFolder = f.matter?.id ? matterIdMap.get(f.matter.id) : null;
      
      await query(`
        INSERT INTO clio_folder_manifest (firm_id, clio_id, clio_parent_id, clio_matter_id, name, full_path, matter_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (firm_id, clio_id) DO UPDATE SET
          name = EXCLUDED.name,
          full_path = EXCLUDED.full_path,
          matter_id = COALESCE(EXCLUDED.matter_id, clio_folder_manifest.matter_id)
      `, [firmId, f.id, f.parent?.id || null, f.matter?.id || null, f.name, path, matterIdForFolder]);
    } catch (err) {
      // Skip folder errors
    }
  }
  
  // Store documents in manifest
  let stored = 0;
  for (const doc of allDocuments) {
    try {
      const folderPath = doc.parent?.id ? buildFolderPath(doc.parent.id) : '';
      const fullPath = folderPath ? `${folderPath}/${doc.name}` : doc.name;
      const matterId = doc.matter?.id ? matterIdMap.get(doc.matter.id) : null;
      const fileSize = doc.latest_document_version?.size || null;
      
      await query(`
        INSERT INTO clio_document_manifest 
          (firm_id, clio_id, clio_matter_id, clio_folder_id, name, clio_path, content_type, size, 
           matter_id, clio_created_at, clio_updated_at, match_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
         ON CONFLICT (firm_id, clio_id) DO UPDATE SET
           name = EXCLUDED.name,
           clio_path = EXCLUDED.clio_path,
           content_type = EXCLUDED.content_type,
           size = EXCLUDED.size,
           matter_id = COALESCE(EXCLUDED.matter_id, clio_document_manifest.matter_id),
           updated_at = NOW()
      `, [
        firmId,
        doc.id,
        doc.matter?.id || null,
        doc.parent?.id || null,
        doc.name,
        fullPath,
        doc.content_type,
        fileSize,
        matterId,
        doc.created_at,
        doc.updated_at
      ]);
      
      stored++;
      if (stored % 100 === 0) {
        onProgress({ fetched: allDocuments.length, stored, status: 'storing' });
      }
    } catch (err) {
      if (!err.message.includes('duplicate')) {
        console.log(`[CLIO DOC] Manifest error: ${err.message}`);
      }
    }
  }
  
  console.log(`[CLIO DOC] Stored ${stored} documents in manifest`);
  
  return {
    documentsFound: allDocuments.length,
    foldersFound: allFolders.length,
    stored
  };
}

/**
 * Get document migration status for a firm
 */
export async function getDocumentMigrationStatus(firmId) {
  const stats = await query(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN match_status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN match_status = 'imported' THEN 1 ELSE 0 END) as imported,
      SUM(CASE WHEN match_status = 'error' THEN 1 ELSE 0 END) as errors,
      SUM(CASE WHEN matter_id IS NOT NULL THEN 1 ELSE 0 END) as linked_to_matters,
      SUM(COALESCE(size, 0)) as total_size
    FROM clio_document_manifest
    WHERE firm_id = $1
  `, [firmId]);
  
  return {
    total: parseInt(stats.rows[0].total) || 0,
    pending: parseInt(stats.rows[0].pending) || 0,
    imported: parseInt(stats.rows[0].imported) || 0,
    errors: parseInt(stats.rows[0].errors) || 0,
    linkedToMatters: parseInt(stats.rows[0].linked_to_matters) || 0,
    totalSize: parseInt(stats.rows[0].total_size) || 0,
    totalSizeMB: ((parseInt(stats.rows[0].total_size) || 0) / 1024 / 1024).toFixed(2)
  };
}

export default {
  streamDocumentToAzure,
  batchStreamDocuments,
  fetchDocumentManifestFromClio,
  getDocumentMigrationStatus
};
