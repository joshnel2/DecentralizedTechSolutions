import { Readable } from 'stream';
import { ShareServiceClient, StorageSharedKeyCredential } from '@azure/storage-file-share';
import { query } from '../db/connection.js';

// ============================================
// CLIO DOCUMENT STREAMING SERVICE
// ============================================
// Streams documents directly from Clio API to Azure File Share
// using MemoryStream - NO local disk storage!
//
// IMPORTANT: This uses STREAMING to transfer files:
// 1. Fetch with stream=true equivalent (chunked response)
// 2. Pipe directly to Azure File Share
// 3. Never saves to local filesystem
//
// Flow:
// 1. Fetch document metadata from Clio (with pagination)
// 2. Get download URL from Clio document versions endpoint
// 3. Stream directly to Azure File Share using Buffer (memory only)
// 4. Preserve original filename and extension
// 5. Create document record with proper permissions

const CLIO_API_BASE = 'https://app.clio.com/api/v4';

// ============================================
// AZURE FILE SHARE CONFIGURATION
// ============================================
// Placeholders - these will be loaded from platform_settings or env
let AZURE_CONNECTION_STRING = null;
let CLIO_ACCESS_TOKEN = null;

// Azure File Share settings
const AZURE_SHARE_NAME = 'apexdrive';

/**
 * Get Azure File Share configuration from database or environment
 */
async function getAzureFileShareConfig() {
  // Try environment variables first
  const connString = process.env.AZURE_CONNECTION_STRING;
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  const shareName = process.env.AZURE_FILE_SHARE_NAME || 'apexdrive';
  
  if (connString) {
    return { connectionString: connString, shareName };
  }
  
  if (accountName && accountKey) {
    return { accountName, accountKey, shareName };
  }
  
  // Try platform settings from database
  try {
    const result = await query(
      `SELECT key, value FROM platform_settings WHERE key IN ('azure_storage_account_name', 'azure_storage_account_key', 'azure_connection_string', 'azure_file_share_name')`
    );
    
    const settings = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }
    
    if (settings.azure_connection_string) {
      return { 
        connectionString: settings.azure_connection_string,
        shareName: settings.azure_file_share_name || 'apexdrive'
      };
    }
    
    if (settings.azure_storage_account_name && settings.azure_storage_account_key) {
      return { 
        accountName: settings.azure_storage_account_name, 
        accountKey: settings.azure_storage_account_key,
        shareName: settings.azure_file_share_name || 'apexdrive'
      };
    }
  } catch (err) {
    console.log('[AZURE] Could not load platform settings:', err.message);
  }
  
  return null;
}

/**
 * Check if Azure Storage is configured
 */
async function isAzureConfigured() {
  const config = await getAzureFileShareConfig();
  return config !== null;
}

/**
 * Get Azure File Share client
 */
async function getShareClient() {
  const config = await getAzureFileShareConfig();
  
  if (!config) {
    console.error('[AZURE] NO AZURE CONFIG FOUND - check env vars or platform_settings');
    throw new Error('Azure Storage not configured. Set AZURE_CONNECTION_STRING or account name/key.');
  }
  
  let serviceClient;
  
  if (config.connectionString) {
    console.log('[AZURE] Using connection string');
    serviceClient = ShareServiceClient.fromConnectionString(config.connectionString);
  } else {
    console.log(`[AZURE] Using account: ${config.accountName}`);
    const credential = new StorageSharedKeyCredential(config.accountName, config.accountKey);
    serviceClient = new ShareServiceClient(
      `https://${config.accountName}.file.core.windows.net`,
      credential
    );
  }
  
  // Get share name from config or default to 'apexdrive'
  const shareName = config.shareName || AZURE_SHARE_NAME;
  console.log(`[AZURE] Using share: ${shareName}`);
  return serviceClient.getShareClient(shareName);
}

/**
 * Ensure a directory exists in Azure File Share
 */
async function ensureAzureDirectory(shareClient, directoryPath) {
  const parts = directoryPath.split('/').filter(p => p);
  let currentPath = '';
  
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    const dirClient = shareClient.getDirectoryClient(currentPath);
    
    try {
      await dirClient.create();
    } catch (err) {
      // Directory might already exist (409 Conflict), that's fine
      if (err.statusCode !== 409) {
        throw err;
      }
    }
  }
}

/**
 * Rate-limited delay helper
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Make Clio API request with retry logic
 */
async function clioApiRequest(accessToken, endpoint, retryCount = 0) {
  const MAX_RETRIES = 3;
  const url = endpoint.startsWith('http') ? endpoint : `${CLIO_API_BASE}${endpoint}`;
  
  console.log(`[CLIO DOC] GET ${url.substring(0, 80)}...`);
  
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
 * Stream file content from Clio download URL directly to Azure File Share
 * NO disk storage - pure memory streaming using chunked transfer
 * 
 * @param {string} downloadUrl - Clio download URL
 * @param {string} accessToken - Clio access token
 * @param {ShareClient} shareClient - Azure File Share client
 * @param {string} targetPath - Full path in Azure including filename
 * @returns {Promise<{size: number, path: string}>}
 */
async function streamFromClioToAzure(downloadUrl, accessToken, shareClient, targetPath) {
  console.log(`[CLIO DOC] Streaming to Azure: ${targetPath}`);
  
  // Fetch from Clio with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout
  
  try {
    const response = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Clio download failed: ${response.status} - ${errorText.substring(0, 200)}`);
    }
    
    // Get the content as ArrayBuffer (stays in memory, never touches disk)
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileSize = buffer.length;
    
    if (fileSize === 0) {
      throw new Error('Downloaded file is empty (0 bytes)');
    }
    
    console.log(`[CLIO DOC] Downloaded ${fileSize} bytes from Clio, uploading to Azure...`);
    
    // Ensure parent directory exists
    const dirPath = targetPath.split('/').slice(0, -1).join('/');
    const fileName = targetPath.split('/').pop();
    
    if (dirPath) {
      await ensureAzureDirectory(shareClient, dirPath);
    }
    
    // Get directory and file clients
    const dirClient = dirPath ? shareClient.getDirectoryClient(dirPath) : shareClient.rootDirectoryClient;
    const fileClient = dirClient.getFileClient(fileName);
    
    // Upload buffer directly to Azure File Share
    await fileClient.create(fileSize);
    await fileClient.uploadRange(buffer, 0, fileSize);
    
    console.log(`[CLIO DOC] SUCCESS: ${fileSize} bytes -> ${targetPath}`);
    
    return {
      size: fileSize,
      path: targetPath,
      url: fileClient.url
    };
  } catch (error) {
    clearTimeout(timeout);
    console.error(`[CLIO DOC] FAILED upload to ${targetPath}:`, error.message);
    throw error;
  }
}

/**
 * Legacy function for backward compatibility - uses memory buffer
 */
async function streamFromClioToBuffer(downloadUrl, accessToken) {
  console.log(`[CLIO DOC] Streaming from Clio to memory...`);
  
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
 * Get document download URL and metadata from Clio
 * Extracts original filename with extension for proper storage
 */
async function getDocumentDownloadInfo(accessToken, documentId) {
  // Get document with latest version info including filename
  const docData = await clioApiRequest(
    accessToken, 
    `/documents/${documentId}.json?fields=id,name,filename,latest_document_version{id,size,download_url,content_type,filename}`
  );
  
  const doc = docData.data;
  const latestVersion = doc?.latest_document_version;
  
  if (!latestVersion?.download_url) {
    throw new Error(`No download URL available for document ${documentId}`);
  }
  
  // Extract original filename with extension
  // Priority: version filename > document filename > document name
  let originalFilename = latestVersion.filename || doc.filename || doc.name;
  
  // Ensure we have a filename
  if (!originalFilename) {
    originalFilename = `document_${documentId}`;
  }
  
  // Clean filename of invalid characters
  originalFilename = originalFilename.replace(/[<>:"/\\|?*]/g, '_');
  
  return {
    downloadUrl: latestVersion.download_url,
    size: latestVersion.size,
    contentType: latestVersion.content_type,
    originalFilename,
    documentName: doc.name
  };
}

// Keep old function name for backward compatibility
const getDocumentDownloadUrl = getDocumentDownloadInfo;

/**
 * Build folder path for document in Azure File Share
 * Maps Clio structure to our structure
 * CRITICAL: Preserves original filename with extension
 * 
 * @param {object} doc - Document manifest record
 * @param {string} originalFilename - Original filename with extension from Clio
 * @param {string} matterId - Our local matter ID
 * @param {string} clientId - Our local client ID
 * @param {string} clioPath - Original path from Clio
 * @returns {string} Full path in Azure including filename
 */
function buildAzurePath(doc, originalFilename, matterId, clientId, clioPath) {
  // Use original filename from Clio to preserve extension
  const filename = originalFilename || doc.name;
  
  // If linked to matter, put in matter folder
  if (matterId) {
    // Preserve subfolder structure from Clio
    let subfolder = '';
    if (clioPath) {
      const pathParts = clioPath.split('/');
      // Remove the filename from the path to get just folders
      if (pathParts.length > 1) {
        subfolder = '/' + pathParts.slice(0, -1).join('/');
      }
    }
    return `matters/matter-${matterId}${subfolder}/${filename}`;
  }
  
  // If linked to client but not matter, put in client folder
  if (clientId) {
    return `clients/client-${clientId}/documents/${filename}`;
  }
  
  // Otherwise, put in imported folder with Clio path structure
  if (clioPath) {
    return `documents/Imported/Clio/${clioPath}`;
  }
  
  return `documents/Imported/Clio/${filename}`;
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
 * Stream a single document from Clio directly to Azure File Share
 * 
 * STREAMING APPROACH:
 * - Fetches from Clio using streaming (chunked response)
 * - Buffers in memory only (never touches disk)
 * - Uploads directly to Azure File Share
 * - Preserves original filename with extension
 * 
 * @param {string} accessToken - Clio OAuth access token
 * @param {object} manifest - Document manifest record from clio_document_manifest
 * @param {string} firmId - Target firm ID
 * @param {object} options - Additional options
 * @returns {Promise<{success: boolean, documentId?: string, error?: string}>}
 */
export async function streamDocumentToAzure(accessToken, manifest, firmId, options = {}) {
  const { 
    matterIdMap = new Map(), 
    clientIdMap = new Map(), 
    userIdMap = new Map(),
    customFirmFolder = null  // Allow override of the firm folder path
  } = options;
  
  // Determine the firm folder - use custom if provided, otherwise default to firm-{firmId}
  const firmFolder = customFirmFolder || `firm-${firmId}`;
  
  try {
    console.log(`[CLIO DOC] Streaming document: ${manifest.name} (Clio ID: ${manifest.clio_id}) -> ${firmFolder}`);
    
    // 1. Get download URL and original filename from Clio
    const { downloadUrl, size, contentType, originalFilename } = await getDocumentDownloadInfo(accessToken, manifest.clio_id);
    
    console.log(`[CLIO DOC] Original filename: ${originalFilename}, Size: ${size}, Type: ${contentType}`);
    
    // 2. Map Clio IDs to our IDs
    const matterId = manifest.matter_id || (manifest.clio_matter_id ? matterIdMap.get(manifest.clio_matter_id) : null);
    const clientId = manifest.client_id || (manifest.clio_client_id ? clientIdMap.get(manifest.clio_client_id) : null);
    const ownerId = manifest.owner_id || (manifest.clio_created_by_id ? userIdMap.get(manifest.clio_created_by_id) : null);
    
    // 3. Build target path in Azure - CRITICAL: use original filename with extension
    const relativePath = buildAzurePath(
      manifest,
      originalFilename,  // Pass original filename with extension
      matterId,
      clientId,
      manifest.clio_path
    );
    
    // Full path includes firm directory (uses custom folder if provided)
    const fullAzurePath = `${firmFolder}/${relativePath}`;
    
    // 4. Get Azure File Share client and stream directly
    const shareClient = await getShareClient();
    
    // 5. Stream from Clio directly to Azure (NO DISK!)
    const uploadResult = await streamFromClioToAzure(
      downloadUrl,
      accessToken,
      shareClient,
      fullAzurePath
    );
    
    // 6. Create document record with permissions
    const dirPath = relativePath.split('/').slice(0, -1).join('/');
    
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
      originalFilename,  // Use original filename
      originalFilename,
      fullAzurePath,
      dirPath,
      contentType || manifest.content_type || 'application/octet-stream',
      uploadResult.size,
      ownerId,
      ownerId,
      matterId ? 'team' : 'firm',  // Matter docs = team access, general = firm-wide
      'final',
      'azure',
      fullAzurePath,
      manifest.clio_id,
      manifest.clio_created_at || new Date()
    ]);
    
    const documentId = docResult.rows[0].id;
    
    // 7. Update manifest status
    await query(`
      UPDATE clio_document_manifest SET
        match_status = 'imported',
        matched_azure_path = $1,
        matched_document_id = $2,
        match_confidence = 100,
        match_method = 'streamed',
        updated_at = NOW()
      WHERE id = $3
    `, [fullAzurePath, documentId, manifest.id]);
    
    // 8. Set up document permissions if we have an owner
    if (ownerId) {
      await query(`
        INSERT INTO document_permissions (
          document_id, firm_id, user_id, permission_level,
          can_view, can_download, can_edit, can_delete, can_share, can_manage_permissions
        ) VALUES ($1, $2, $3, 'full', true, true, true, true, true, true)
        ON CONFLICT DO NOTHING
      `, [documentId, firmId, ownerId]);
    }
    
    console.log(`[CLIO DOC] Successfully streamed: ${originalFilename} -> ${fullAzurePath} (${uploadResult.size} bytes)`);
    
    return {
      success: true,
      documentId,
      path: fullAzurePath,
      size: uploadResult.size,
      filename: originalFilename
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
 * Simple semaphore for limiting concurrent operations
 */
class Semaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }
  
  async acquire() {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    await new Promise(resolve => this.queue.push(resolve));
    this.current++;
  }
  
  release() {
    this.current--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    }
  }
}

/**
 * Batch stream documents from Clio to Azure
 * 
 * RATE LIMITING STRATEGY:
 * - Clio allows ~50 API requests per minute (not concurrent!)
 * - Each document requires 2 API calls: metadata + download
 * - So we can safely do ~25 documents per minute
 * - We use concurrency of 5-10 with delays between batches
 * 
 * MEMORY STRATEGY:
 * - Max 10 concurrent downloads to limit memory usage
 * - Large files (>50MB) are processed one at a time
 * - Average 5MB file * 10 concurrent = 50MB RAM max
 * 
 * @param {string} accessToken - Clio OAuth access token
 * @param {string} firmId - Target firm ID
 * @param {object} options - Options including batchSize, onProgress callback
 * @returns {Promise<{success: number, failed: number, errors: array}>}
 */
export async function batchStreamDocuments(accessToken, firmId, options = {}) {
  const { 
    batchSize = 10,  // FIXED: Reduced from 50 to 10 for rate limit safety
    onProgress = () => {},
    limit = null,  // Optional limit for testing
    matterIdMap = new Map(),
    clientIdMap = new Map(),
    userIdMap = new Map(),
    customFirmFolder = null,  // Allow override of the firm folder path
    maxRetries = 3,  // Retry failed uploads
    sortBySize = true,  // Process smaller files first for faster progress
    delayBetweenBatches = 3000,  // 3 second delay between batches for rate limiting
    maxConcurrent = 5,  // Max concurrent uploads (memory safety)
    largeFileThreshold = 50 * 1024 * 1024  // 50MB - process large files one at a time
  } = options;
  
  const firmFolder = customFirmFolder || `firm-${firmId}`;
  console.log(`[CLIO DOC] Starting batch document stream for firm ${firmId} -> ${firmFolder}`);
  console.log(`[CLIO DOC] Rate-limited: batchSize=${batchSize}, maxConcurrent=${maxConcurrent}, delay=${delayBetweenBatches}ms`);
  
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
    errors: [],
    retried: 0,
    bytesTransferred: 0
  };
  
  // Separate large files from small files
  const smallDocs = [];
  const largeDocs = [];
  for (const doc of documents) {
    if ((doc.size || 0) > largeFileThreshold) {
      largeDocs.push(doc);
    } else {
      smallDocs.push(doc);
    }
  }
  
  console.log(`[CLIO DOC] ${smallDocs.length} small files (<50MB), ${largeDocs.length} large files (>50MB)`);
  
  // Sort small docs by size (smallest first for faster progress feedback)
  if (sortBySize) {
    smallDocs.sort((a, b) => (a.size || 0) - (b.size || 0));
    console.log(`[CLIO DOC] Sorted small documents by size (smallest first)`);
  }
  
  // Create semaphore for concurrent upload limiting
  const semaphore = new Semaphore(maxConcurrent);
  
  // Helper to check if error is retryable
  const isRetryableError = (error) => {
    if (!error) return false;
    const retryable = ['timeout', 'ETIMEDOUT', 'ECONNRESET', 'socket hang up', '429', '503', '502', 'rate limit'];
    return retryable.some(r => error.toLowerCase().includes(r.toLowerCase()));
  };
  
  // Helper function to stream with retry and rate limiting
  const streamWithRetry = async (doc, retriesLeft) => {
    await semaphore.acquire();
    try {
      const result = await streamDocumentToAzure(accessToken, doc, firmId, {
        matterIdMap,
        clientIdMap,
        userIdMap,
        customFirmFolder
      });
      
      if (result.success) {
        return { success: true, size: result.size || 0 };
      } else if (retriesLeft > 0 && isRetryableError(result.error)) {
        results.retried++;
        // Exponential backoff: 2s, 4s, 8s
        const backoffMs = Math.pow(2, maxRetries - retriesLeft + 1) * 1000;
        console.log(`[CLIO DOC] Retrying ${doc.name} in ${backoffMs}ms (${retriesLeft} retries left)`);
        await delay(backoffMs);
        semaphore.release();
        return streamWithRetry(doc, retriesLeft - 1);
      } else {
        return { success: false, error: result.error };
      }
    } catch (err) {
      if (retriesLeft > 0 && isRetryableError(err.message)) {
        results.retried++;
        const backoffMs = Math.pow(2, maxRetries - retriesLeft + 1) * 1000;
        console.log(`[CLIO DOC] Retrying ${doc.name} after error in ${backoffMs}ms`);
        await delay(backoffMs);
        semaphore.release();
        return streamWithRetry(doc, retriesLeft - 1);
      }
      return { success: false, error: err.message };
    } finally {
      semaphore.release();
    }
  };
  
  // Process small documents in batches with concurrency control
  const startTime = Date.now();
  let totalProcessed = 0;
  
  console.log(`[CLIO DOC] Processing ${smallDocs.length} small documents in batches of ${batchSize}...`);
  
  for (let i = 0; i < smallDocs.length; i += batchSize) {
    const batch = smallDocs.slice(i, i + batchSize);
    const batchStartTime = Date.now();
    
    // Process batch with controlled concurrency (semaphore limits actual concurrent uploads)
    const batchResults = await Promise.all(
      batch.map(doc => streamWithRetry(doc, maxRetries))
    );
    
    // Count results
    for (let j = 0; j < batchResults.length; j++) {
      if (batchResults[j].success) {
        results.success++;
        results.bytesTransferred += batchResults[j].size || 0;
      } else {
        results.failed++;
        results.errors.push({ 
          id: batch[j].clio_id, 
          name: batch[j].name, 
          error: batchResults[j].error 
        });
      }
    }
    
    totalProcessed += batch.length;
    
    // Progress update with ETA
    const elapsed = Date.now() - startTime;
    const rate = totalProcessed / (elapsed / 1000); // docs per second
    const remaining = documents.length - totalProcessed;
    const etaSeconds = rate > 0 ? remaining / rate : 0;
    const batchTime = Date.now() - batchStartTime;
    
    onProgress({
      total: documents.length,
      processed: totalProcessed,
      success: results.success,
      failed: results.failed,
      retried: results.retried,
      bytesTransferred: results.bytesTransferred,
      status: 'processing',
      currentBatch: Math.floor(i / batchSize) + 1,
      totalBatches: Math.ceil(smallDocs.length / batchSize) + largeDocs.length,
      docsPerSecond: rate.toFixed(2),
      etaMinutes: Math.ceil(etaSeconds / 60),
      batchTimeMs: batchTime,
      phase: 'small_files'
    });
    
    // Rate limiting delay between batches
    // This prevents hitting Clio's 50 requests/minute limit
    if (i + batchSize < smallDocs.length) {
      console.log(`[CLIO DOC] Batch ${Math.floor(i / batchSize) + 1} complete (${batchTime}ms). Waiting ${delayBetweenBatches}ms for rate limiting...`);
      await delay(delayBetweenBatches);
    }
  }
  
  // Process large documents one at a time (memory safety)
  if (largeDocs.length > 0) {
    console.log(`[CLIO DOC] Processing ${largeDocs.length} large documents (>50MB) one at a time...`);
    
    for (let i = 0; i < largeDocs.length; i++) {
      const doc = largeDocs[i];
      const sizeMB = ((doc.size || 0) / 1024 / 1024).toFixed(1);
      console.log(`[CLIO DOC] Large file ${i + 1}/${largeDocs.length}: ${doc.name} (${sizeMB}MB)`);
      
      const result = await streamWithRetry(doc, maxRetries);
      
      if (result.success) {
        results.success++;
        results.bytesTransferred += result.size || 0;
      } else {
        results.failed++;
        results.errors.push({ 
          id: doc.clio_id, 
          name: doc.name, 
          error: result.error,
          large: true
        });
      }
      
      totalProcessed++;
      
      // Progress update
      const elapsed = Date.now() - startTime;
      const rate = totalProcessed / (elapsed / 1000);
      const remaining = documents.length - totalProcessed;
      const etaSeconds = rate > 0 ? remaining / rate : 0;
      
      onProgress({
        total: documents.length,
        processed: totalProcessed,
        success: results.success,
        failed: results.failed,
        retried: results.retried,
        bytesTransferred: results.bytesTransferred,
        status: 'processing',
        currentLargeFile: i + 1,
        totalLargeFiles: largeDocs.length,
        docsPerSecond: rate.toFixed(2),
        etaMinutes: Math.ceil(etaSeconds / 60),
        phase: 'large_files'
      });
      
      // Delay between large files for rate limiting
      if (i < largeDocs.length - 1) {
        await delay(delayBetweenBatches);
      }
    }
  }
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalMB = (results.bytesTransferred / 1024 / 1024).toFixed(1);
  
  console.log(`[CLIO DOC] Migration complete in ${totalTime}s: ${results.success} success, ${results.failed} failed, ${totalMB}MB transferred`);
  
  onProgress({
    total: documents.length,
    processed: totalProcessed,
    success: results.success,
    failed: results.failed,
    retried: results.retried,
    bytesTransferred: results.bytesTransferred,
    status: 'complete',
    totalTimeSeconds: parseFloat(totalTime),
    totalMB: parseFloat(totalMB)
  });
  
  return results;
}

/**
 * Fetch ALL document metadata from Clio with proper pagination
 * Handles Clio's pagination using the 'next' URL in meta.paging
 * 
 * PAGINATION APPROACH:
 * - Uses limit=200 per page (Clio's max)
 * - Follows meta.paging.next URL for next page
 * - Handles rate limiting with automatic retry
 * - Returns ALL documents across all pages
 * 
 * @param {string} accessToken - Clio access token
 * @param {string} firmId - Target firm ID
 * @param {object} options - Options including onProgress callback
 * @returns {Promise<{documentsFound: number, foldersFound: number, stored: number}>}
 */
export async function fetchDocumentManifestFromClio(accessToken, firmId, options = {}) {
  const { onProgress = () => {}, matterIdMap = new Map() } = options;
  
  console.log(`[CLIO DOC] Fetching ALL document metadata from Clio with pagination...`);
  
  // ============================================
  // STEP 1: Fetch ALL documents with pagination
  // ============================================
  let allDocuments = [];
  let pageNum = 1;
  
  // Include filename in fields to get original filename with extension
  let nextUrl = `${CLIO_API_BASE}/documents.json?fields=id,name,filename,parent,matter,created_at,updated_at,content_type,latest_document_version{id,size,filename}&limit=200&order=id(asc)`;
  
  while (nextUrl) {
    console.log(`[CLIO DOC] Fetching documents page ${pageNum}...`);
    
    try {
      const response = await fetch(nextUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const text = await response.text();
        
        // Handle rate limiting
        if (response.status === 429) {
          let waitTime = 60;
          try {
            const errorObj = JSON.parse(text);
            const match = errorObj?.error?.message?.match(/Retry in (\d+) seconds/);
            if (match) {
              waitTime = parseInt(match[1], 10) + 5;
            }
          } catch (e) {}
          console.log(`[CLIO DOC] Rate limited on page ${pageNum}. Waiting ${waitTime}s...`);
          await delay(waitTime * 1000);
          continue; // Retry same page
        }
        
        throw new Error(`Failed to fetch documents page ${pageNum}: ${response.status} - ${text}`);
      }
      
      const data = await response.json();
      const pageDocuments = data.data || [];
      allDocuments = allDocuments.concat(pageDocuments);
      
      onProgress({ 
        fetched: allDocuments.length, 
        status: 'fetching_documents',
        page: pageNum
      });
      
      console.log(`[CLIO DOC] Page ${pageNum}: got ${pageDocuments.length} documents (total: ${allDocuments.length})`);
      
      // Get next page URL from Clio's paging metadata
      nextUrl = data.meta?.paging?.next || null;
      pageNum++;
      
      // Small delay between pages to be nice to the API
      if (nextUrl) {
        await delay(200);
      }
      
    } catch (fetchError) {
      console.error(`[CLIO DOC] Error fetching page ${pageNum}:`, fetchError.message);
      throw fetchError;
    }
  }
  
  console.log(`[CLIO DOC] Fetched total ${allDocuments.length} documents across ${pageNum - 1} pages`);
  
  // ============================================
  // STEP 2: Fetch ALL folders with pagination
  // ============================================
  let allFolders = [];
  let folderPageNum = 1;
  let folderNextUrl = `${CLIO_API_BASE}/folders.json?fields=id,name,parent,matter&limit=200&order=id(asc)`;
  
  while (folderNextUrl) {
    try {
      console.log(`[CLIO DOC] Fetching folders page ${folderPageNum}...`);
      
      const response = await fetch(folderNextUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const text = await response.text();
        
        if (response.status === 429) {
          let waitTime = 60;
          try {
            const errorObj = JSON.parse(text);
            const match = errorObj?.error?.message?.match(/Retry in (\d+) seconds/);
            if (match) {
              waitTime = parseInt(match[1], 10) + 5;
            }
          } catch (e) {}
          console.log(`[CLIO DOC] Rate limited on folders page ${folderPageNum}. Waiting ${waitTime}s...`);
          await delay(waitTime * 1000);
          continue;
        }
        
        console.log(`[CLIO DOC] Could not fetch folders: ${response.status}`);
        break;
      }
      
      const data = await response.json();
      const pageFolders = data.data || [];
      allFolders = allFolders.concat(pageFolders);
      
      console.log(`[CLIO DOC] Folders page ${folderPageNum}: got ${pageFolders.length} (total: ${allFolders.length})`);
      
      folderNextUrl = data.meta?.paging?.next || null;
      folderPageNum++;
      
      if (folderNextUrl) await delay(200);
      
    } catch (e) {
      console.log(`[CLIO DOC] Could not fetch folders: ${e.message}`);
      break;
    }
  }
  
  console.log(`[CLIO DOC] Fetched ${allFolders.length} folders across ${folderPageNum - 1} pages`);
  onProgress({ 
    fetched: allDocuments.length, 
    folders: allFolders.length,
    status: 'processing' 
  });
  
  // ============================================
  // STEP 3: Build folder path lookup
  // ============================================
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
  
  // ============================================
  // STEP 4: Store folders in manifest
  // ============================================
  let foldersSaved = 0;
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
      foldersSaved++;
    } catch (err) {
      // Skip folder errors
    }
  }
  console.log(`[CLIO DOC] Saved ${foldersSaved} folders to manifest`);
  
  // ============================================
  // STEP 5: Store documents in manifest
  // ============================================
  let stored = 0;
  let errors = 0;
  
  for (const doc of allDocuments) {
    try {
      const folderPath = doc.parent?.id ? buildFolderPath(doc.parent.id) : '';
      
      // Get original filename with extension
      const originalFilename = doc.latest_document_version?.filename || doc.filename || doc.name;
      const fullPath = folderPath ? `${folderPath}/${originalFilename}` : originalFilename;
      
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
        originalFilename,  // Store original filename
        fullPath,
        doc.content_type,
        fileSize,
        matterId,
        doc.created_at,
        doc.updated_at
      ]);
      
      stored++;
      
      if (stored % 100 === 0) {
        onProgress({ 
          fetched: allDocuments.length, 
          stored, 
          status: 'storing',
          percent: Math.round((stored / allDocuments.length) * 100)
        });
        console.log(`[CLIO DOC] Stored ${stored}/${allDocuments.length} documents...`);
      }
    } catch (err) {
      if (!err.message.includes('duplicate')) {
        console.log(`[CLIO DOC] Manifest error for ${doc.name}: ${err.message}`);
        errors++;
      }
    }
  }
  
  console.log(`[CLIO DOC] Stored ${stored} documents in manifest (${errors} errors)`);
  onProgress({ 
    fetched: allDocuments.length, 
    stored, 
    status: 'complete',
    errors
  });
  
  return {
    documentsFound: allDocuments.length,
    foldersFound: allFolders.length,
    stored,
    errors
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
