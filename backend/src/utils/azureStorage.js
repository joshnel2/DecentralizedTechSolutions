import { ShareServiceClient, StorageSharedKeyCredential } from '@azure/storage-file-share';
import fs from 'fs/promises';
import path from 'path';

// ============================================
// AZURE FILE SHARE STORAGE HELPER
// ============================================

// Get Azure credentials from environment or platform settings
let azureConfig = null;

function normalizeAzurePath(remotePath) {
  if (!remotePath) return '';
  const normalized = remotePath
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .trim()
    .replace(/^\/+/, '');
  return normalized;
}

export async function getAzureConfig() {
  if (azureConfig) return azureConfig;
  
  // Try environment variables first
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  const shareName = process.env.AZURE_FILE_SHARE_NAME || 'apexdrive';
  
  if (accountName && accountKey) {
    azureConfig = { accountName, accountKey, shareName };
    return azureConfig;
  }
  
  // Try platform settings from database
  try {
    const { query } = await import('../db/connection.js');
    const result = await query(
      `SELECT key, value FROM platform_settings WHERE key IN ('azure_storage_account_name', 'azure_storage_account_key', 'azure_file_share_name')`
    );
    
    const settings = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }
    
    if (settings.azure_storage_account_name && settings.azure_storage_account_key) {
      azureConfig = {
        accountName: settings.azure_storage_account_name,
        accountKey: settings.azure_storage_account_key,
        shareName: settings.azure_file_share_name || 'apexdrive'
      };
      return azureConfig;
    }
  } catch (err) {
    console.log('[AZURE] Could not load platform settings:', err.message);
  }
  
  return null;
}

// Clear cached config (call when settings change)
export function clearAzureConfigCache() {
  azureConfig = null;
}

// Get Azure File Share client
export async function getShareClient() {
  const config = await getAzureConfig();
  if (!config) {
    throw new Error('Azure Storage not configured. Set AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY.');
  }
  
  const credential = new StorageSharedKeyCredential(config.accountName, config.accountKey);
  const serviceClient = new ShareServiceClient(
    `https://${config.accountName}.file.core.windows.net`,
    credential
  );
  
  return serviceClient.getShareClient(config.shareName);
}

// Ensure a directory exists in Azure File Share
export async function ensureDirectory(directoryPath) {
  try {
    const shareClient = await getShareClient();
    
    // Split path and create each level
    const parts = directoryPath.split('/').filter(p => p);
    let currentPath = '';
    
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const dirClient = shareClient.getDirectoryClient(currentPath);
      
      try {
        await dirClient.create();
        console.log(`[AZURE] Created directory: ${currentPath}`);
      } catch (err) {
        // Directory might already exist, that's fine
        if (err.statusCode !== 409) {
          throw err;
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('[AZURE] Failed to ensure directory:', error.message);
    throw error;
  }
}

// Upload a file to Azure File Share
export async function uploadFile(localPath, remotePath, firmId) {
  try {
    const shareClient = await getShareClient();
    
    // Build the full path: firm-{firmId}/{remotePath}
    const safePath = normalizeAzurePath(remotePath);
    if (!safePath) {
      throw new Error('Invalid remote path for Azure upload');
    }
    const fullPath = `firm-${firmId}/${safePath}`;
    const dirPath = path.dirname(fullPath);
    const fileName = path.basename(fullPath);
    
    // Ensure directory exists
    await ensureDirectory(dirPath);
    
    // Get directory and file clients
    const dirClient = shareClient.getDirectoryClient(dirPath);
    const fileClient = dirClient.getFileClient(fileName);
    
    // Read local file
    const fileContent = await fs.readFile(localPath);
    const fileSize = fileContent.length;
    
    // Upload to Azure
    await fileClient.create(fileSize);
    await fileClient.uploadRange(fileContent, 0, fileSize);
    
    console.log(`[AZURE] Uploaded: ${fullPath} (${fileSize} bytes)`);
    
    return {
      success: true,
      path: fullPath,
      size: fileSize,
      url: fileClient.url
    };
  } catch (error) {
    console.error('[AZURE] Upload failed:', error.message);
    throw error;
  }
}

// Upload file content directly (from buffer)
export async function uploadFileBuffer(buffer, remotePath, firmId) {
  try {
    const shareClient = await getShareClient();
    
    // Build the full path: firm-{firmId}/{remotePath}
    const safePath = normalizeAzurePath(remotePath);
    if (!safePath) {
      throw new Error('Invalid remote path for Azure upload');
    }
    const fullPath = `firm-${firmId}/${safePath}`;
    const dirPath = path.dirname(fullPath);
    const fileName = path.basename(fullPath);
    
    // Ensure directory exists
    await ensureDirectory(dirPath);
    
    // Get directory and file clients
    const dirClient = shareClient.getDirectoryClient(dirPath);
    const fileClient = dirClient.getFileClient(fileName);
    
    // Upload to Azure
    const fileSize = buffer.length;
    await fileClient.create(fileSize);
    await fileClient.uploadRange(buffer, 0, fileSize);
    
    console.log(`[AZURE] Uploaded buffer: ${fullPath} (${fileSize} bytes)`);
    
    return {
      success: true,
      path: fullPath,
      size: fileSize,
      url: fileClient.url
    };
  } catch (error) {
    console.error('[AZURE] Buffer upload failed:', error.message);
    throw error;
  }
}

// Download a file from Azure File Share
export async function downloadFile(remotePath, firmId) {
  try {
    const shareClient = await getShareClient();
    
    // Build the full path: firm-{firmId}/{remotePath}
    const safePath = normalizeAzurePath(remotePath);
    if (!safePath) {
      throw new Error('Invalid remote path for Azure download');
    }
    const fullPath = `firm-${firmId}/${safePath}`;
    const dirPath = path.dirname(fullPath);
    const fileName = path.basename(fullPath);
    
    // Get file client
    const dirClient = shareClient.getDirectoryClient(dirPath);
    const fileClient = dirClient.getFileClient(fileName);
    
    // Download
    const downloadResponse = await fileClient.download(0);
    const chunks = [];
    
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(chunk);
    }
    
    const buffer = Buffer.concat(chunks);
    console.log(`[AZURE] Downloaded: ${fullPath} (${buffer.length} bytes)`);
    
    return buffer;
  } catch (error) {
    console.error('[AZURE] Download failed:', error.message);
    throw error;
  }
}

// Delete a file from Azure File Share
export async function deleteFile(remotePath, firmId) {
  try {
    const shareClient = await getShareClient();
    
    const fullPath = `firm-${firmId}/${remotePath}`;
    const dirPath = path.dirname(fullPath);
    const fileName = path.basename(fullPath);
    
    const dirClient = shareClient.getDirectoryClient(dirPath);
    const fileClient = dirClient.getFileClient(fileName);
    
    await fileClient.delete();
    console.log(`[AZURE] Deleted: ${fullPath}`);
    
    return { success: true };
  } catch (error) {
    console.error('[AZURE] Delete failed:', error.message);
    throw error;
  }
}

/**
 * Move a file within Azure File Share (copy + delete)
 * Azure File Share doesn't support native move, so we copy then delete
 * 
 * @param {string} sourcePath - Source path relative to firm folder
 * @param {string} destPath - Destination path relative to firm folder
 * @param {string} firmId - Firm ID
 * @returns {Promise<{success: boolean}>}
 */
export async function moveFile(sourcePath, destPath, firmId) {
  try {
    const shareClient = await getShareClient();
    
    const fullSourcePath = `firm-${firmId}/${sourcePath}`;
    const fullDestPath = `firm-${firmId}/${destPath}`;
    
    // Ensure destination directory exists
    const destDirPath = path.dirname(fullDestPath);
    await ensureDirectory(destDirPath);
    
    // Get source file client
    const sourceDirClient = shareClient.getDirectoryClient(path.dirname(fullSourcePath));
    const sourceFileClient = sourceDirClient.getFileClient(path.basename(fullSourcePath));
    
    // Get destination file client
    const destDirClient = shareClient.getDirectoryClient(destDirPath);
    const destFileClient = destDirClient.getFileClient(path.basename(fullDestPath));
    
    // Download source file content
    const downloadResponse = await sourceFileClient.download();
    const chunks = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks);
    
    // Get source file properties for metadata
    const properties = await sourceFileClient.getProperties();
    
    // Create destination file
    await destFileClient.create(content.length);
    
    // Upload content to destination
    await destFileClient.uploadRange(content, 0, content.length);
    
    // Delete source file
    await sourceFileClient.delete();
    
    console.log(`[AZURE] Moved: ${fullSourcePath} -> ${fullDestPath}`);
    
    return { success: true };
  } catch (error) {
    console.error('[AZURE] Move failed:', error.message);
    throw error;
  }
}

/**
 * Rename a file (move to same directory with new name)
 * 
 * @param {string} currentPath - Current path relative to firm folder
 * @param {string} newName - New file name
 * @param {string} firmId - Firm ID
 * @returns {Promise<{success: boolean, newPath: string}>}
 */
export async function renameFile(currentPath, newName, firmId) {
  const dirPath = path.dirname(currentPath);
  const newPath = dirPath === '.' ? newName : `${dirPath}/${newName}`;
  await moveFile(currentPath, newPath, firmId);
  return { success: true, newPath };
}

/**
 * Move all files in a folder to a new folder path
 * Used when renaming folders
 * 
 * @param {string} oldFolderPath - Old folder path (full path including firm-)
 * @param {string} newFolderPath - New folder path (full path including firm-)
 * @returns {Promise<{success: boolean, movedCount: number, errors: Array}>}
 */
export async function moveFolderContents(oldFolderPath, newFolderPath) {
  try {
    const shareClient = await getShareClient();
    const results = { success: true, movedCount: 0, errors: [] };
    
    // Ensure new folder exists
    await ensureDirectory(newFolderPath);
    
    // Get all files in the old folder recursively
    const filesToMove = [];
    
    async function collectFiles(dirPath) {
      try {
        const dirClient = shareClient.getDirectoryClient(dirPath);
        
        for await (const item of dirClient.listFilesAndDirectories()) {
          const itemPath = `${dirPath}/${item.name}`;
          
          if (item.kind === 'directory') {
            await collectFiles(itemPath);
          } else {
            filesToMove.push({
              sourcePath: itemPath,
              relativePath: itemPath.replace(oldFolderPath + '/', '')
            });
          }
        }
      } catch (err) {
        // Directory might not exist
        console.log(`[AZURE] Directory not found during folder move: ${dirPath}`);
      }
    }
    
    await collectFiles(oldFolderPath);
    
    console.log(`[AZURE] Moving ${filesToMove.length} files from ${oldFolderPath} to ${newFolderPath}`);
    
    // Move each file
    for (const file of filesToMove) {
      try {
        const destPath = `${newFolderPath}/${file.relativePath}`;
        
        // Ensure destination subdirectory exists
        const destDir = path.dirname(destPath);
        await ensureDirectory(destDir);
        
        // Get source and dest clients
        const sourceDirClient = shareClient.getDirectoryClient(path.dirname(file.sourcePath));
        const sourceFileClient = sourceDirClient.getFileClient(path.basename(file.sourcePath));
        
        const destDirClient = shareClient.getDirectoryClient(destDir);
        const destFileClient = destDirClient.getFileClient(path.basename(destPath));
        
        // Download content
        const downloadResponse = await sourceFileClient.download();
        const chunks = [];
        for await (const chunk of downloadResponse.readableStreamBody) {
          chunks.push(chunk);
        }
        const content = Buffer.concat(chunks);
        
        // Create and upload to destination
        await destFileClient.create(content.length);
        await destFileClient.uploadRange(content, 0, content.length);
        
        // Delete source
        await sourceFileClient.delete();
        
        results.movedCount++;
      } catch (fileError) {
        console.error(`[AZURE] Failed to move file ${file.sourcePath}:`, fileError.message);
        results.errors.push({ file: file.sourcePath, error: fileError.message });
      }
    }
    
    // Try to delete old empty directories (best effort)
    try {
      await deleteEmptyDirectories(oldFolderPath);
    } catch (err) {
      // Non-fatal, directories might not be empty or might not exist
    }
    
    console.log(`[AZURE] Folder move complete: ${results.movedCount} files moved, ${results.errors.length} errors`);
    
    return results;
  } catch (error) {
    console.error('[AZURE] Folder move failed:', error.message);
    throw error;
  }
}

/**
 * Delete empty directories recursively (best effort)
 */
async function deleteEmptyDirectories(dirPath) {
  try {
    const shareClient = await getShareClient();
    const dirClient = shareClient.getDirectoryClient(dirPath);
    
    // Check if directory is empty
    let isEmpty = true;
    for await (const item of dirClient.listFilesAndDirectories()) {
      if (item.kind === 'directory') {
        // Try to delete subdirectory first
        await deleteEmptyDirectories(`${dirPath}/${item.name}`);
      } else {
        isEmpty = false;
        break;
      }
    }
    
    // If empty, delete the directory
    if (isEmpty) {
      await dirClient.delete();
      console.log(`[AZURE] Deleted empty directory: ${dirPath}`);
    }
  } catch (err) {
    // Ignore errors - directories might not be empty or might not exist
  }
}

// List files in a directory
export async function listFiles(remotePath, firmId) {
  try {
    const shareClient = await getShareClient();
    
    const fullPath = firmId ? `firm-${firmId}/${remotePath || ''}` : remotePath;
    const dirClient = shareClient.getDirectoryClient(fullPath);
    
    const files = [];
    const folders = [];
    
    for await (const item of dirClient.listFilesAndDirectories()) {
      if (item.kind === 'directory') {
        folders.push({
          name: item.name,
          path: `${fullPath}/${item.name}`,
          isFolder: true
        });
      } else {
        files.push({
          name: item.name,
          path: `${fullPath}/${item.name}`,
          isFolder: false,
          size: item.properties?.contentLength
        });
      }
    }
    
    return { files, folders };
  } catch (error) {
    console.error('[AZURE] List files failed:', error.message);
    throw error;
  }
}

// Check if Azure is configured
export async function isAzureConfigured() {
  const config = await getAzureConfig();
  return config !== null;
}

// Create firm folder if it doesn't exist
export async function ensureFirmFolder(firmId) {
  try {
    await ensureDirectory(`firm-${firmId}`);
    return { success: true, path: `firm-${firmId}` };
  } catch (error) {
    console.error('[AZURE] Failed to create firm folder:', error.message);
    return { success: false, error: error.message };
  }
}

// List all files recursively in a directory path
export async function listFilesRecursive(directoryPath) {
  try {
    const shareClient = await getShareClient();
    const files = [];
    
    async function scanDirectory(dirPath) {
      try {
        const dirClient = shareClient.getDirectoryClient(dirPath);
        
        for await (const item of dirClient.listFilesAndDirectories()) {
          const itemPath = dirPath ? `${dirPath}/${item.name}` : item.name;
          
          if (item.kind === 'directory') {
            // Recursively scan subdirectory
            await scanDirectory(itemPath);
          } else {
            files.push({
              name: itemPath,
              size: item.properties?.contentLength || 0,
              lastModified: item.properties?.lastModified || null,
              etag: item.properties?.etag || null
            });
          }
        }
      } catch (err) {
        // Directory might not exist, that's OK
        console.log(`[AZURE] Could not scan ${dirPath}: ${err.message}`);
      }
    }
    
    await scanDirectory(directoryPath);
    console.log(`[AZURE] Found ${files.length} files in ${directoryPath}`);
    return files;
  } catch (error) {
    console.error('[AZURE] List files recursive failed:', error.message);
    throw error;
  }
}

// Get Azure connection info for mapping drive
export async function getConnectionInfo(firmId) {
  const config = await getAzureConfig();
  if (!config) {
    return { configured: false };
  }
  
  const firmFolder = `firm-${firmId}`;
  
  return {
    configured: true,
    storageAccount: config.accountName,
    shareName: config.shareName,
    firmFolder,
    windowsPath: `\\\\${config.accountName}.file.core.windows.net\\${config.shareName}\\${firmFolder}`,
    macPath: `smb://${config.accountName}.file.core.windows.net/${config.shareName}/${firmFolder}`,
    instructions: {
      windows: [
        'Open File Explorer',
        'Right-click "This PC" and select "Map network drive"',
        'Enter the Windows Path shown above',
        'Check "Connect using different credentials"',
        `Username: AZURE\\${config.accountName}`,
        'Password: Get the storage account key from your platform admin'
      ],
      mac: [
        'Open Finder',
        'Press Cmd+K to open "Connect to Server"',
        'Enter the Mac Path shown above',
        `Username: ${config.accountName}`,
        'Password: Get the storage account key from your platform admin'
      ]
    }
  };
}

export default {
  getAzureConfig,
  clearAzureConfigCache,
  getShareClient,
  ensureDirectory,
  uploadFile,
  uploadFileBuffer,
  downloadFile,
  deleteFile,
  listFiles,
  listFilesRecursive,
  isAzureConfigured,
  ensureFirmFolder,
  getConnectionInfo
};
