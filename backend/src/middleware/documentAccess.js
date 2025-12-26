/**
 * Document Access Middleware
 * 
 * Clio-style permissions:
 * - Documents in matter folders inherit matter permissions
 * - Admins (owner/admin roles) see ALL documents
 * - Regular users see:
 *   1. Documents they uploaded
 *   2. Documents they own
 *   3. Documents linked to matters they have permission to
 *   4. Documents explicitly shared with them
 */

import { query } from '../db/connection.js';

// Roles that have full access to all documents
export const FULL_ACCESS_ROLES = ['owner', 'admin'];

/**
 * Check if a user can access a specific document
 * @param {string} userId - User ID
 * @param {string} userRole - User role
 * @param {string} documentId - Document ID
 * @param {string} firmId - Firm ID
 * @param {string} requiredAccess - 'view', 'download', 'edit', 'delete', 'share'
 * @returns {Promise<{hasAccess: boolean, reason: string}>}
 */
export async function canAccessDocument(userId, userRole, documentId, firmId, requiredAccess = 'view') {
  // Admins always have full access
  if (FULL_ACCESS_ROLES.includes(userRole)) {
    return { hasAccess: true, reason: 'admin_role' };
  }

  // Get document info
  const docResult = await query(`
    SELECT 
      d.id, d.uploaded_by, d.owner_id, d.matter_id, d.client_id,
      d.privacy_level, d.is_private, d.folder_path
    FROM documents d
    WHERE d.id = $1 AND d.firm_id = $2
  `, [documentId, firmId]);

  if (docResult.rows.length === 0) {
    return { hasAccess: false, reason: 'document_not_found' };
  }

  const doc = docResult.rows[0];

  // 1. User uploaded this document
  if (doc.uploaded_by === userId) {
    return { hasAccess: true, reason: 'uploader' };
  }

  // 2. User owns this document
  if (doc.owner_id === userId) {
    return { hasAccess: true, reason: 'owner' };
  }

  // 3. Check matter permissions (Clio-style folder inheritance)
  if (doc.matter_id) {
    const matterAccess = await checkMatterAccess(userId, userRole, doc.matter_id, firmId);
    if (matterAccess.hasAccess) {
      // Check if matter permission allows the required access level
      if (requiredAccess === 'view' || requiredAccess === 'download') {
        return { hasAccess: true, reason: 'matter_permission' };
      }
      if (requiredAccess === 'edit' && matterAccess.canEdit) {
        return { hasAccess: true, reason: 'matter_permission_edit' };
      }
    }
  }

  // 4. Check explicit document permissions
  const permResult = await query(`
    SELECT dp.* FROM document_permissions dp
    WHERE dp.document_id = $1 
      AND dp.user_id = $2
      AND (dp.expires_at IS NULL OR dp.expires_at > NOW())
  `, [documentId, userId]);

  if (permResult.rows.length > 0) {
    const perm = permResult.rows[0];
    if (checkPermissionLevel(perm, requiredAccess)) {
      return { hasAccess: true, reason: 'explicit_permission' };
    }
  }

  // 5. Check group permissions
  const groupPermResult = await query(`
    SELECT dp.* FROM document_permissions dp
    JOIN user_groups ug ON dp.group_id = ug.group_id
    WHERE dp.document_id = $1 
      AND ug.user_id = $2
      AND (dp.expires_at IS NULL OR dp.expires_at > NOW())
  `, [documentId, userId]);

  if (groupPermResult.rows.length > 0) {
    const perm = groupPermResult.rows[0];
    if (checkPermissionLevel(perm, requiredAccess)) {
      return { hasAccess: true, reason: 'group_permission' };
    }
  }

  // 6. Check folder permissions (inherited from parent folder)
  if (doc.folder_path) {
    const folderAccess = await checkFolderAccess(userId, firmId, doc.folder_path, requiredAccess);
    if (folderAccess) {
      return { hasAccess: true, reason: 'folder_permission' };
    }
  }

  // 7. Check privacy level for firm-wide access
  if (doc.privacy_level === 'firm' && (requiredAccess === 'view' || requiredAccess === 'download')) {
    return { hasAccess: true, reason: 'firm_wide' };
  }

  return { hasAccess: false, reason: 'no_permission' };
}

/**
 * Check if user has access to a matter (Clio-style)
 */
async function checkMatterAccess(userId, userRole, matterId, firmId) {
  // Check if matter is firm_wide (everyone can access)
  const matterResult = await query(`
    SELECT visibility, responsible_attorney, originating_attorney
    FROM matters WHERE id = $1 AND firm_id = $2
  `, [matterId, firmId]);

  if (matterResult.rows.length === 0) {
    return { hasAccess: false };
  }

  const matter = matterResult.rows[0];

  // Firm-wide visibility
  if (matter.visibility === 'firm_wide') {
    return { hasAccess: true, canEdit: false };
  }

  // User is responsible or originating attorney
  if (matter.responsible_attorney === userId || matter.originating_attorney === userId) {
    return { hasAccess: true, canEdit: true };
  }

  // Check matter assignments
  const assignResult = await query(`
    SELECT role, billing_rate FROM matter_assignments
    WHERE matter_id = $1 AND user_id = $2
  `, [matterId, userId]);

  if (assignResult.rows.length > 0) {
    return { hasAccess: true, canEdit: true };
  }

  // Check matter permissions table
  const permResult = await query(`
    SELECT permission_level, can_view_documents, can_edit
    FROM matter_permissions
    WHERE matter_id = $1 AND user_id = $2
  `, [matterId, userId]);

  if (permResult.rows.length > 0) {
    const perm = permResult.rows[0];
    return {
      hasAccess: perm.can_view_documents !== false,
      canEdit: perm.can_edit === true
    };
  }

  // Check group-based matter permissions
  const groupPermResult = await query(`
    SELECT mp.permission_level, mp.can_view_documents, mp.can_edit
    FROM matter_permissions mp
    JOIN user_groups ug ON mp.group_id = ug.group_id
    WHERE mp.matter_id = $1 AND ug.user_id = $2
  `, [matterId, userId]);

  if (groupPermResult.rows.length > 0) {
    const perm = groupPermResult.rows[0];
    return {
      hasAccess: perm.can_view_documents !== false,
      canEdit: perm.can_edit === true
    };
  }

  return { hasAccess: false };
}

/**
 * Check folder permission (with inheritance from parent folders)
 */
async function checkFolderAccess(userId, firmId, folderPath, requiredAccess) {
  // Check direct permission on this folder
  const result = await query(`
    SELECT * FROM folder_permissions
    WHERE firm_id = $1 AND user_id = $2 AND folder_path = $3
  `, [firmId, userId, folderPath]);

  if (result.rows.length > 0) {
    return checkPermissionLevel(result.rows[0], requiredAccess);
  }

  // Check parent folders (inheritance)
  const pathParts = folderPath.split('/').filter(p => p);
  for (let i = pathParts.length - 1; i >= 0; i--) {
    const parentPath = '/' + pathParts.slice(0, i).join('/');
    const parentResult = await query(`
      SELECT * FROM folder_permissions
      WHERE firm_id = $1 AND user_id = $2 AND folder_path = $3
    `, [firmId, userId, parentPath || '/']);

    if (parentResult.rows.length > 0) {
      return checkPermissionLevel(parentResult.rows[0], requiredAccess);
    }
  }

  // Check group folder permissions
  const groupResult = await query(`
    SELECT fp.* FROM folder_permissions fp
    JOIN user_groups ug ON fp.group_id = ug.group_id
    WHERE fp.firm_id = $1 AND ug.user_id = $2 
      AND (fp.folder_path = $3 OR $3 LIKE fp.folder_path || '/%')
    ORDER BY LENGTH(fp.folder_path) DESC
    LIMIT 1
  `, [firmId, userId, folderPath]);

  if (groupResult.rows.length > 0) {
    return checkPermissionLevel(groupResult.rows[0], requiredAccess);
  }

  return false;
}

/**
 * Check if permission level allows the required access
 */
function checkPermissionLevel(perm, requiredAccess) {
  switch (requiredAccess) {
    case 'view':
      return perm.can_view === true;
    case 'download':
      return perm.can_download === true;
    case 'edit':
      return perm.can_edit === true;
    case 'delete':
      return perm.can_delete === true;
    case 'share':
      return perm.can_share === true;
    case 'manage':
      return perm.can_manage_permissions === true || perm.permission_level === 'full';
    default:
      return perm.can_view === true;
  }
}

/**
 * Build SQL WHERE clause for document access filtering
 * Used by list endpoints to only return accessible documents
 * 
 * @param {string} userId - User ID
 * @param {string} userRole - User role  
 * @param {string} firmId - Firm ID
 * @param {string} tableAlias - SQL table alias for documents (default 'd')
 * @returns {Promise<{whereClause: string, params: any[], paramOffset: number}>}
 */
export async function buildDocumentAccessFilter(userId, userRole, firmId, tableAlias = 'd', startParamIndex = 1) {
  // Admins see everything in their firm
  if (FULL_ACCESS_ROLES.includes(userRole)) {
    return {
      whereClause: `${tableAlias}.firm_id = $${startParamIndex}`,
      params: [firmId],
      nextParamIndex: startParamIndex + 1
    };
  }

  // Get matters user has access to
  const accessibleMatters = await getAccessibleMatterIds(userId, userRole, firmId);
  
  // Build the filter:
  // 1. User uploaded OR
  // 2. User owns OR
  // 3. Linked to accessible matter OR
  // 4. Has explicit document permission OR
  // 5. Has group document permission OR
  // 6. Is firm-wide
  
  let paramIndex = startParamIndex;
  const params = [firmId, userId];
  paramIndex += 2;
  
  let matterFilter = 'FALSE';
  if (accessibleMatters.length > 0) {
    matterFilter = `${tableAlias}.matter_id = ANY($${paramIndex})`;
    params.push(accessibleMatters);
    paramIndex++;
  }

  const whereClause = `
    ${tableAlias}.firm_id = $${startParamIndex}
    AND (
      -- User uploaded this document
      ${tableAlias}.uploaded_by = $${startParamIndex + 1}
      -- User owns this document
      OR ${tableAlias}.owner_id = $${startParamIndex + 1}
      -- Document is in an accessible matter
      OR (${matterFilter})
      -- Firm-wide document
      OR ${tableAlias}.privacy_level = 'firm'
      -- Has explicit permission
      OR EXISTS (
        SELECT 1 FROM document_permissions dp
        WHERE dp.document_id = ${tableAlias}.id
          AND dp.user_id = $${startParamIndex + 1}
          AND dp.can_view = true
          AND (dp.expires_at IS NULL OR dp.expires_at > NOW())
      )
      -- Has group permission
      OR EXISTS (
        SELECT 1 FROM document_permissions dp
        JOIN user_groups ug ON dp.group_id = ug.group_id
        WHERE dp.document_id = ${tableAlias}.id
          AND ug.user_id = $${startParamIndex + 1}
          AND dp.can_view = true
          AND (dp.expires_at IS NULL OR dp.expires_at > NOW())
      )
    )
  `;

  return {
    whereClause,
    params,
    nextParamIndex: paramIndex
  };
}

/**
 * Get list of matter IDs the user can access
 */
async function getAccessibleMatterIds(userId, userRole, firmId) {
  // Billing role has special access
  const isBillingOrAdmin = FULL_ACCESS_ROLES.includes(userRole) || userRole === 'billing';
  
  if (isBillingOrAdmin) {
    // Return all matter IDs for this firm
    const result = await query(
      'SELECT id FROM matters WHERE firm_id = $1',
      [firmId]
    );
    return result.rows.map(r => r.id);
  }

  // Get matters user can access:
  // 1. Firm-wide matters
  // 2. User is responsible/originating attorney
  // 3. User is assigned to matter
  // 4. User has explicit matter permission
  // 5. User's group has matter permission
  
  const result = await query(`
    SELECT DISTINCT m.id FROM matters m
    WHERE m.firm_id = $1 AND m.status != 'archived'
      AND (
        -- Firm-wide visibility
        m.visibility = 'firm_wide'
        -- User is responsible or originating attorney
        OR m.responsible_attorney = $2
        OR m.originating_attorney = $2
        -- User is assigned to matter
        OR EXISTS (
          SELECT 1 FROM matter_assignments ma
          WHERE ma.matter_id = m.id AND ma.user_id = $2
        )
        -- Has explicit matter permission
        OR EXISTS (
          SELECT 1 FROM matter_permissions mp
          WHERE mp.matter_id = m.id AND mp.user_id = $2
        )
        -- Has group matter permission
        OR EXISTS (
          SELECT 1 FROM matter_permissions mp
          JOIN user_groups ug ON mp.group_id = ug.group_id
          WHERE mp.matter_id = m.id AND ug.user_id = $2
        )
      )
  `, [firmId, userId]);

  return result.rows.map(r => r.id);
}

/**
 * Express middleware to check document access
 * Adds `req.documentAccess` with access info
 */
export function requireDocumentAccess(requiredAccess = 'view') {
  return async (req, res, next) => {
    try {
      const documentId = req.params.documentId || req.params.id;
      
      if (!documentId) {
        return res.status(400).json({ error: 'Document ID required' });
      }

      const access = await canAccessDocument(
        req.user.id,
        req.user.role,
        documentId,
        req.user.firmId,
        requiredAccess
      );

      if (!access.hasAccess) {
        return res.status(403).json({ 
          error: 'Access denied',
          reason: access.reason 
        });
      }

      req.documentAccess = access;
      next();
    } catch (error) {
      console.error('Document access check error:', error);
      res.status(500).json({ error: 'Failed to check document access' });
    }
  };
}

export default {
  canAccessDocument,
  buildDocumentAccessFilter,
  requireDocumentAccess,
  FULL_ACCESS_ROLES
};
