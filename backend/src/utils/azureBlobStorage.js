import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { getAzureConfig, clearAzureConfigCache as clearFileShareCache } from './azureStorage.js';

// ============================================
// AZURE BLOB STORAGE FOR DOCUMENT VERSIONS
// ============================================
// 
// Uses the SAME Azure credentials as Azure File Share (from admin portal /rx760819)
// 
// Architecture:
// - Current documents: Azure File Share (SMB mount) - always HOT
// - Document versions: Azure Blob Storage with lifecycle tiering
//   - Days 0-30:  HOT (instant access)
//   - Days 31-90: COOL (instant access, cheaper)
//   - Days 91+:   ARCHIVE (delayed access, very cheap)
//
// This is more efficient than Clio's approach because:
// 1. Versions are stored in cheap blob storage, not expensive database
// 2. Automatic tiering moves old versions to cheaper tiers
// 3. Current documents stay fast in File Share

let blobConfig = null;

// Default container name for versions
const DEFAULT_CONTAINER = 'apex-versions';

/**
 * Get Azure Blob Storage configuration
 * Reuses the same credentials from admin portal (platform_settings)
 */
export async function getBlobConfig() {
  if (blobConfig) return blobConfig;
  
  // Get config from the same source as Azure File Share (admin portal)
  const azureConfig = await getAzureConfig();
  
  if (azureConfig && azureConfig.accountName && azureConfig.accountKey) {
    // Try to get blob-specific container name from platform settings
    let containerName = DEFAULT_CONTAINER;
    try {
      const { query } = await import('../db/connection.js');
      const result = await query(
        `SELECT value FROM platform_settings WHERE key = 'azure_blob_container_name'`
      );
      if (result.rows.length > 0 && result.rows[0].value) {
        containerName = result.rows[0].value;
      }
    } catch (err) {
      // Use default container name
    }
    
    blobConfig = {
      accountName: azureConfig.accountName,
      accountKey: azureConfig.accountKey,
      containerName
    };
    return blobConfig;
  }
  
  return null;
}

/**
 * Clear cached config (call when settings change in admin portal)
 * Also clears the file share cache to keep them in sync
 */
export function clearBlobConfigCache() {
  blobConfig = null;
  clearFileShareCache(); // Keep both caches in sync
}

/**
 * Get Blob Service Client
 */
export async function getBlobServiceClient() {
  const config = await getBlobConfig();
  if (!config) {
    throw new Error('Azure Blob Storage not configured. Set AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY.');
  }
  
  const credential = new StorageSharedKeyCredential(config.accountName, config.accountKey);
  return new BlobServiceClient(
    `https://${config.accountName}.blob.core.windows.net`,
    credential
  );
}

/**
 * Get container client for versions
 */
export async function getVersionsContainer() {
  const config = await getBlobConfig();
  const blobService = await getBlobServiceClient();
  return blobService.getContainerClient(config.containerName);
}

/**
 * Ensure the versions container exists with lifecycle policy
 */
export async function ensureVersionsContainer() {
  try {
    const container = await getVersionsContainer();
    
    // Create container if it doesn't exist
    await container.createIfNotExists({
      access: 'private' // No public access to versions
    });
    
    console.log('[AZURE BLOB] Versions container ready');
    return true;
  } catch (error) {
    console.error('[AZURE BLOB] Failed to ensure container:', error.message);
    throw error;
  }
}

/**
 * Upload document version content to blob storage
 * 
 * @param {string} firmId - Firm ID
 * @param {string} documentId - Document ID
 * @param {number} versionNumber - Version number
 * @param {Buffer|string} content - Version content
 * @param {object} metadata - Optional metadata
 * @returns {Promise<{url: string, blobName: string}>}
 */
export async function uploadVersion(firmId, documentId, versionNumber, content, metadata = {}) {
  try {
    const container = await getVersionsContainer();
    
    // Blob path: versions/{firmId}/{documentId}/v{version}.dat
    const blobName = `versions/${firmId}/${documentId}/v${versionNumber}.dat`;
    const blockBlob = container.getBlockBlobClient(blobName);
    
    // Convert string to buffer if needed
    const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
    
    // Upload with metadata
    await blockBlob.upload(contentBuffer, contentBuffer.length, {
      blobHTTPHeaders: {
        blobContentType: 'application/octet-stream'
      },
      metadata: {
        firmId,
        documentId,
        versionNumber: String(versionNumber),
        uploadedAt: new Date().toISOString(),
        ...metadata
      },
      // Start in HOT tier
      tier: 'Hot'
    });
    
    console.log(`[AZURE BLOB] Uploaded version: ${blobName} (${contentBuffer.length} bytes)`);
    
    return {
      url: blockBlob.url,
      blobName,
      size: contentBuffer.length
    };
  } catch (error) {
    console.error('[AZURE BLOB] Upload version failed:', error.message);
    throw error;
  }
}

/**
 * Download document version content from blob storage
 * 
 * @param {string} firmId - Firm ID
 * @param {string} documentId - Document ID
 * @param {number} versionNumber - Version number
 * @returns {Promise<{content: Buffer, tier: string, needsRehydration: boolean}>}
 */
export async function downloadVersion(firmId, documentId, versionNumber) {
  try {
    const container = await getVersionsContainer();
    const blobName = `versions/${firmId}/${documentId}/v${versionNumber}.dat`;
    const blockBlob = container.getBlockBlobClient(blobName);
    
    // Get blob properties first to check tier
    const properties = await blockBlob.getProperties();
    const tier = properties.accessTier || 'Hot';
    
    // If blob is in archive tier, it needs rehydration
    if (tier === 'Archive' && properties.archiveStatus !== 'rehydrate-pending-to-hot') {
      return {
        content: null,
        tier,
        needsRehydration: true,
        message: 'This version is archived. Initiating retrieval - please check back in 1-15 hours.',
        blobName
      };
    }
    
    // If rehydration is pending, return status
    if (properties.archiveStatus === 'rehydrate-pending-to-hot') {
      return {
        content: null,
        tier,
        needsRehydration: true,
        rehydrationPending: true,
        message: 'This version is being retrieved from archive. Please check back shortly.',
        blobName
      };
    }
    
    // Download content
    const downloadResponse = await blockBlob.download(0);
    const chunks = [];
    
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(chunk);
    }
    
    const content = Buffer.concat(chunks);
    console.log(`[AZURE BLOB] Downloaded version: ${blobName} (${content.length} bytes, tier: ${tier})`);
    
    return {
      content,
      tier,
      needsRehydration: false,
      size: content.length
    };
  } catch (error) {
    if (error.statusCode === 404) {
      return { content: null, notFound: true };
    }
    console.error('[AZURE BLOB] Download version failed:', error.message);
    throw error;
  }
}

/**
 * Initiate rehydration for an archived blob
 * 
 * @param {string} firmId - Firm ID
 * @param {string} documentId - Document ID
 * @param {number} versionNumber - Version number
 * @returns {Promise<{initiated: boolean, message: string}>}
 */
export async function rehydrateVersion(firmId, documentId, versionNumber) {
  try {
    const container = await getVersionsContainer();
    const blobName = `versions/${firmId}/${documentId}/v${versionNumber}.dat`;
    const blockBlob = container.getBlockBlobClient(blobName);
    
    // Set tier to Hot to trigger rehydration
    await blockBlob.setAccessTier('Hot');
    
    console.log(`[AZURE BLOB] Initiated rehydration for: ${blobName}`);
    
    return {
      initiated: true,
      message: 'Retrieval initiated. Version will be available within 1-15 hours. We\'ll notify you when ready.'
    };
  } catch (error) {
    console.error('[AZURE BLOB] Rehydration failed:', error.message);
    throw error;
  }
}

/**
 * Delete a version from blob storage
 * 
 * @param {string} firmId - Firm ID
 * @param {string} documentId - Document ID
 * @param {number} versionNumber - Version number
 */
export async function deleteVersion(firmId, documentId, versionNumber) {
  try {
    const container = await getVersionsContainer();
    const blobName = `versions/${firmId}/${documentId}/v${versionNumber}.dat`;
    const blockBlob = container.getBlockBlobClient(blobName);
    
    await blockBlob.delete();
    console.log(`[AZURE BLOB] Deleted version: ${blobName}`);
    
    return { success: true };
  } catch (error) {
    if (error.statusCode === 404) {
      return { success: true, notFound: true };
    }
    console.error('[AZURE BLOB] Delete version failed:', error.message);
    throw error;
  }
}

/**
 * Delete all versions for a document
 * 
 * @param {string} firmId - Firm ID
 * @param {string} documentId - Document ID
 */
export async function deleteAllVersions(firmId, documentId) {
  try {
    const container = await getVersionsContainer();
    const prefix = `versions/${firmId}/${documentId}/`;
    
    let deletedCount = 0;
    for await (const blob of container.listBlobsFlat({ prefix })) {
      const blockBlob = container.getBlockBlobClient(blob.name);
      await blockBlob.delete();
      deletedCount++;
    }
    
    console.log(`[AZURE BLOB] Deleted ${deletedCount} versions for document ${documentId}`);
    return { success: true, deletedCount };
  } catch (error) {
    console.error('[AZURE BLOB] Delete all versions failed:', error.message);
    throw error;
  }
}

/**
 * List all versions for a document with their storage tiers
 * 
 * @param {string} firmId - Firm ID
 * @param {string} documentId - Document ID
 * @returns {Promise<Array<{versionNumber: number, tier: string, size: number}>>}
 */
export async function listVersions(firmId, documentId) {
  try {
    const container = await getVersionsContainer();
    const prefix = `versions/${firmId}/${documentId}/`;
    
    const versions = [];
    for await (const blob of container.listBlobsFlat({ prefix, includeMetadata: true })) {
      // Extract version number from blob name (v1.dat, v2.dat, etc.)
      const match = blob.name.match(/v(\d+)\.dat$/);
      if (match) {
        versions.push({
          versionNumber: parseInt(match[1]),
          tier: blob.properties.accessTier || 'Hot',
          size: blob.properties.contentLength,
          createdAt: blob.properties.createdOn,
          lastModified: blob.properties.lastModified,
          archiveStatus: blob.properties.archiveStatus || null
        });
      }
    }
    
    // Sort by version number descending
    versions.sort((a, b) => b.versionNumber - a.versionNumber);
    
    return versions;
  } catch (error) {
    console.error('[AZURE BLOB] List versions failed:', error.message);
    throw error;
  }
}

/**
 * Check if Azure Blob Storage is configured
 */
export async function isBlobConfigured() {
  const config = await getBlobConfig();
  return config !== null;
}

/**
 * Check the access tier of a specific version blob
 * Used to determine if rehydration is complete
 * 
 * @param {string} firmId - Firm ID
 * @param {string} documentId - Document ID
 * @param {number} versionNumber - Version number
 * @returns {Promise<string|null>} - Tier name ('Hot', 'Cool', 'Archive') or null if not found
 */
export async function checkVersionTier(firmId, documentId, versionNumber) {
  try {
    const container = await getVersionsContainer();
    const blobName = `versions/${firmId}/${documentId}/v${versionNumber}`;
    const blockBlobClient = container.getBlockBlobClient(blobName);
    
    const properties = await blockBlobClient.getProperties();
    
    // The accessTier property indicates current tier
    // During rehydration, archiveStatus will be 'rehydrate-pending-to-hot' or 'rehydrate-pending-to-cool'
    const tier = properties.accessTier;
    const archiveStatus = properties.archiveStatus;
    
    console.log(`[AZURE BLOB] Version tier check: ${blobName} - tier=${tier}, archiveStatus=${archiveStatus}`);
    
    // If still rehydrating, return 'Archive' to indicate not ready
    if (archiveStatus && archiveStatus.includes('rehydrate-pending')) {
      return 'Archive';
    }
    
    return tier || 'Hot';
  } catch (error) {
    if (error.statusCode === 404) {
      console.log(`[AZURE BLOB] Version not found: ${firmId}/${documentId}/v${versionNumber}`);
      return null;
    }
    console.error('[AZURE BLOB] Check version tier failed:', error.message);
    return null;
  }
}

/**
 * Get storage tier statistics for a firm
 * 
 * @param {string} firmId - Firm ID
 * @returns {Promise<{hot: number, cool: number, archive: number, total: number}>}
 */
export async function getStorageStats(firmId) {
  try {
    const container = await getVersionsContainer();
    const prefix = `versions/${firmId}/`;
    
    const stats = {
      hot: { count: 0, size: 0 },
      cool: { count: 0, size: 0 },
      archive: { count: 0, size: 0 },
      total: { count: 0, size: 0 }
    };
    
    for await (const blob of container.listBlobsFlat({ prefix })) {
      const tier = (blob.properties.accessTier || 'Hot').toLowerCase();
      const size = blob.properties.contentLength || 0;
      
      stats.total.count++;
      stats.total.size += size;
      
      if (stats[tier]) {
        stats[tier].count++;
        stats[tier].size += size;
      }
    }
    
    return stats;
  } catch (error) {
    console.error('[AZURE BLOB] Get storage stats failed:', error.message);
    throw error;
  }
}

/**
 * Setup lifecycle management policy for the container
 * This should be called once during initial setup
 * 
 * Policy:
 * - Move to Cool tier after 30 days
 * - Move to Archive tier after 90 days
 */
export async function setupLifecyclePolicy() {
  try {
    const config = await getBlobConfig();
    const blobService = await getBlobServiceClient();
    
    // Lifecycle management is set at the account level
    // This policy applies to blobs with prefix "versions/"
    const policy = {
      rules: [
        {
          enabled: true,
          name: 'apex-versions-tiering',
          type: 'Lifecycle',
          definition: {
            actions: {
              baseBlob: {
                tierToCool: { daysAfterModificationGreaterThan: 30 },
                tierToArchive: { daysAfterModificationGreaterThan: 90 }
              }
            },
            filters: {
              blobTypes: ['blockBlob'],
              prefixMatch: ['versions/']
            }
          }
        }
      ]
    };
    
    // Note: This requires Storage Account Contributor role
    // The policy is set via Azure Portal or ARM template in production
    console.log('[AZURE BLOB] Lifecycle policy should be configured in Azure Portal:');
    console.log(JSON.stringify(policy, null, 2));
    
    return {
      message: 'Lifecycle policy configuration logged. Apply via Azure Portal or ARM template.',
      policy
    };
  } catch (error) {
    console.error('[AZURE BLOB] Setup lifecycle policy failed:', error.message);
    throw error;
  }
}

export default {
  getBlobConfig,
  clearBlobConfigCache,
  getBlobServiceClient,
  getVersionsContainer,
  ensureVersionsContainer,
  uploadVersion,
  downloadVersion,
  rehydrateVersion,
  deleteVersion,
  deleteAllVersions,
  listVersions,
  isBlobConfigured,
  getStorageStats,
  setupLifecyclePolicy
};
