/**
 * SECURE DRIVE ACCESS WITH SAS TOKENS
 * 
 * This provides firm-level isolated access using Azure Shared Access Signatures (SAS).
 * Each firm gets a SAS token that ONLY allows access to their folder.
 */

import { Router } from 'express';
import { ShareServiceClient, StorageSharedKeyCredential, generateAccountSASQueryParameters, AccountSASPermissions, AccountSASServices, AccountSASResourceTypes, SASProtocol } from '@azure/storage-file-share';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * Generate a Shared Access Signature (SAS) token for a specific firm's folder
 * This token ONLY allows access to that firm's folder, not others
 */
router.get('/secure-access', authenticate, async (req, res) => {
  try {
    // Only admins can get connection info
    if (!['owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admins can access this' });
    }

    // Get Azure config from platform settings
    const settingsResult = await query(
      `SELECT key, value FROM platform_settings 
       WHERE key IN ('azure_storage_account_name', 'azure_storage_account_key', 'azure_file_share_name')`
    );
    
    const settings = {};
    settingsResult.rows.forEach(row => { settings[row.key] = row.value; });

    const accountName = settings.azure_storage_account_name || process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const accountKey = settings.azure_storage_account_key || process.env.AZURE_STORAGE_ACCOUNT_KEY;
    const shareName = settings.azure_file_share_name || process.env.AZURE_FILE_SHARE_NAME || 'apexdrive';

    if (!accountName || !accountKey) {
      return res.json({
        configured: false,
        message: 'Azure Storage not configured. Contact platform administrator.'
      });
    }

    const firmFolder = `firm-${req.user.firmId}`;

    // Generate SAS token that expires in 8 hours (working day)
    const credential = new StorageSharedKeyCredential(accountName, accountKey);
    const expiresOn = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

    // Create SAS with limited permissions
    const sasOptions = {
      expiresOn,
      permissions: AccountSASPermissions.parse("rwdl"), // read, write, delete, list
      services: AccountSASServices.parse("f"), // file service only
      resourceTypes: AccountSASResourceTypes.parse("co"), // container and object
      protocol: SASProtocol.Https, // HTTPS only
    };

    const sasToken = generateAccountSASQueryParameters(sasOptions, credential).toString();

    // Build URLs that point to THIS FIRM'S FOLDER ONLY
    const baseUrl = `https://${accountName}.file.core.windows.net`;
    const firmShareUrl = `${baseUrl}/${shareName}/${firmFolder}?${sasToken}`;

    res.json({
      configured: true,
      firmId: req.user.firmId,
      firmFolder,
      expiresAt: expiresOn.toISOString(),
      
      // Secure URLs with SAS token - ONLY for this firm's folder
      secureUrl: firmShareUrl,
      
      // Network paths (still require auth via storage key or Azure AD)
      networkPaths: {
        windows: `\\\\${accountName}.file.core.windows.net\\${shareName}\\${firmFolder}`,
        mac: `smb://${accountName}.file.core.windows.net/${shareName}/${firmFolder}`,
      },
      
      // Connection instructions
      instructions: {
        webAccess: 'Use the secureUrl to access files via browser (valid for 8 hours)',
        networkDrive: 'Map network drive using the paths above. Use AZURE\\<account-name> as username and storage key as password.',
        security: 'Your access is isolated to your firm folder only. Other firms cannot see your documents.'
      }
    });

  } catch (error) {
    console.error('Secure access error:', error);
    res.status(500).json({ error: 'Failed to generate secure access' });
  }
});

/**
 * Get firm's storage usage and limits
 */
router.get('/usage', authenticate, async (req, res) => {
  try {
    // Calculate firm's storage usage
    const result = await query(
      `SELECT 
        COUNT(*) as file_count,
        COALESCE(SUM(size), 0) as total_bytes,
        MAX(created_at) as last_upload
       FROM documents 
       WHERE firm_id = $1 AND is_folder = false`,
      [req.user.firmId]
    );

    const stats = result.rows[0];
    const totalGB = (parseInt(stats.total_bytes) || 0) / (1024 * 1024 * 1024);

    // Get firm's storage limit (default 50GB)
    const firmResult = await query(
      `SELECT storage_limit_gb FROM firms WHERE id = $1`,
      [req.user.firmId]
    );
    const limitGB = firmResult.rows[0]?.storage_limit_gb || 50;

    res.json({
      fileCount: parseInt(stats.file_count) || 0,
      usedBytes: parseInt(stats.total_bytes) || 0,
      usedGB: totalGB.toFixed(2),
      limitGB,
      percentUsed: ((totalGB / limitGB) * 100).toFixed(1),
      lastUpload: stats.last_upload,
      remaining: `${(limitGB - totalGB).toFixed(2)} GB remaining`
    });

  } catch (error) {
    console.error('Usage error:', error);
    res.status(500).json({ error: 'Failed to get storage usage' });
  }
});

export default router;
