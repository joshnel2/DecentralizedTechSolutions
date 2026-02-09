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
import { createCache } from '../utils/cache.js';

// Roles that have full access to all documents
export const FULL_ACCESS_ROLES = ['owner', 'admin'];

// Cache for accessible matter IDs -- avoids re-querying on every document list request.
// TTL 30s: if a matter permission changes, the user sees the update within 30 seconds.
const matterIdCache = createCache({ ttlMs: 30000, maxSize: 200 });

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

  // OPTIMIZED: Single query checks all access paths at once instead of 8 sequential queries.
  // Returns a row with boolean flags for each access path so we can evaluate in JS.
  const accessResult = await query(`
    SELECT
      d.id,
      d.uploaded_by,
      d.owner_id,
      d.matter_id,
      d.privacy_level,
      d.folder_path,
      -- Check 1 & 2: Uploader or owner
      (d.uploaded_by = $2) AS is_uploader,
      (d.owner_id = $2) AS is_owner,
      -- Check 3: Matter access (firm_wide, responsible/originating attorney, assigned, permitted)
      CASE WHEN d.matter_id IS NOT NULL THEN (
        SELECT CASE
          WHEN m.visibility = 'firm_wide' THEN 'firm_wide'
          WHEN m.responsible_attorney = $2 OR m.originating_attorney = $2 THEN 'attorney'
          WHEN EXISTS(SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $2) THEN 'assigned'
          WHEN EXISTS(SELECT 1 FROM matter_permissions mp WHERE mp.matter_id = m.id AND mp.user_id = $2 AND mp.can_view_documents != false) THEN 'permitted'
          WHEN EXISTS(SELECT 1 FROM matter_permissions mp JOIN user_groups ug ON mp.group_id = ug.group_id WHERE mp.matter_id = m.id AND ug.user_id = $2 AND mp.can_view_documents != false) THEN 'group'
          ELSE NULL
        END
        FROM matters m WHERE m.id = d.matter_id AND m.firm_id = $3
      ) ELSE NULL END AS matter_access,
      -- Check 3b: Can edit via matter (attorney/assigned have edit, firm_wide does not)
      CASE WHEN d.matter_id IS NOT NULL THEN (
        SELECT CASE
          WHEN m.responsible_attorney = $2 OR m.originating_attorney = $2 THEN true
          WHEN EXISTS(SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $2) THEN true
          WHEN EXISTS(SELECT 1 FROM matter_permissions mp WHERE mp.matter_id = m.id AND mp.user_id = $2 AND mp.can_edit = true) THEN true
          WHEN EXISTS(SELECT 1 FROM matter_permissions mp JOIN user_groups ug ON mp.group_id = ug.group_id WHERE mp.matter_id = m.id AND ug.user_id = $2 AND mp.can_edit = true) THEN true
          ELSE false
        END
        FROM matters m WHERE m.id = d.matter_id AND m.firm_id = $3
      ) ELSE false END AS matter_can_edit,
      -- Check 4: Explicit document permission
      (SELECT row_to_json(dp.*) FROM document_permissions dp
       WHERE dp.document_id = d.id AND dp.user_id = $2
       AND (dp.expires_at IS NULL OR dp.expires_at > NOW())
       LIMIT 1) AS explicit_perm,
      -- Check 5: Group document permission
      (SELECT row_to_json(dp.*) FROM document_permissions dp
       JOIN user_groups ug ON dp.group_id = ug.group_id
       WHERE dp.document_id = d.id AND ug.user_id = $2
       AND (dp.expires_at IS NULL OR dp.expires_at > NOW())
       LIMIT 1) AS group_perm,
      -- Check 7: Privacy level (firm-wide)
      (d.privacy_level = 'firm') AS is_firm_wide,
      -- Check 8: Sharing group access
      (SELECT json_build_object(
        'has_access', true,
        'can_edit', sg.default_permission_level != 'view'
       ) FROM sharing_groups sg
       JOIN sharing_group_members sgm1 ON sg.id = sgm1.sharing_group_id AND sgm1.user_id = $2
       JOIN sharing_group_members sgm2 ON sg.id = sgm2.sharing_group_id
         AND (sgm2.user_id = d.uploaded_by OR sgm2.user_id = d.owner_id)
       WHERE sg.firm_id = $3 AND sg.is_active = true AND sg.share_documents = true
       AND NOT EXISTS (
         SELECT 1 FROM sharing_group_hidden_items shi
         WHERE shi.sharing_group_id = sg.id
           AND shi.user_id = COALESCE(d.uploaded_by, d.owner_id)
           AND shi.item_type = 'document' AND shi.item_id = d.id
       )
       LIMIT 1) AS sharing_group_access
    FROM documents d
    WHERE d.id = $1 AND d.firm_id = $3
  `, [documentId, userId, firmId]);

  if (accessResult.rows.length === 0) {
    return { hasAccess: false, reason: 'document_not_found' };
  }

  const r = accessResult.rows[0];

  // Evaluate access paths in priority order (same logic as before, now from one query)
  if (r.is_uploader) return { hasAccess: true, reason: 'uploader' };
  if (r.is_owner) return { hasAccess: true, reason: 'owner' };

  // Matter access
  if (r.matter_access) {
    if (requiredAccess === 'view' || requiredAccess === 'download') {
      return { hasAccess: true, reason: 'matter_permission' };
    }
    if (requiredAccess === 'edit' && r.matter_can_edit) {
      return { hasAccess: true, reason: 'matter_permission_edit' };
    }
  }

  // Explicit document permission
  if (r.explicit_perm && checkPermissionLevel(r.explicit_perm, requiredAccess)) {
    return { hasAccess: true, reason: 'explicit_permission' };
  }

  // Group document permission
  if (r.group_perm && checkPermissionLevel(r.group_perm, requiredAccess)) {
    return { hasAccess: true, reason: 'group_permission' };
  }

  // Folder permissions -- still requires separate queries for parent traversal.
  // This is the one area we can't fully collapse into the main query.
  if (r.folder_path) {
    const folderAccess = await checkFolderAccess(userId, firmId, r.folder_path, requiredAccess);
    if (folderAccess) {
      return { hasAccess: true, reason: 'folder_permission' };
    }
  }

  // Firm-wide privacy
  if (r.is_firm_wide && (requiredAccess === 'view' || requiredAccess === 'download')) {
    return { hasAccess: true, reason: 'firm_wide' };
  }

  // Sharing group access
  if (r.sharing_group_access) {
    const sg = r.sharing_group_access;
    if (requiredAccess === 'view' || requiredAccess === 'download') {
      return { hasAccess: true, reason: 'sharing_group' };
    }
    if (requiredAccess === 'edit' && sg.can_edit) {
      return { hasAccess: true, reason: 'sharing_group_edit' };
    }
  }

  return { hasAccess: false, reason: 'no_permission' };
}

/**
 * Check if two users share a sharing group that shares the specified item type
 */
async function checkSharingGroupAccess(userId, ownerId, itemId, firmId, itemType = 'document') {
  if (!ownerId || userId === ownerId) {
    return { hasAccess: false };
  }

  // Find sharing groups where both users are members
  const groupsResult = await query(`
    SELECT sg.id, sg.default_permission_level, sg.share_documents, sg.share_matters,
           sg.share_clients, sg.share_calendar, sg.share_tasks, sg.share_notes
    FROM sharing_groups sg
    JOIN sharing_group_members sgm1 ON sg.id = sgm1.sharing_group_id AND sgm1.user_id = $1
    JOIN sharing_group_members sgm2 ON sg.id = sgm2.sharing_group_id AND sgm2.user_id = $2
    WHERE sg.firm_id = $3 AND sg.is_active = true
  `, [userId, ownerId, firmId]);

  if (groupsResult.rows.length === 0) {
    return { hasAccess: false };
  }

  // Check if any group shares this item type
  for (const group of groupsResult.rows) {
    let sharesItemType = false;
    switch (itemType) {
      case 'document':
        sharesItemType = group.share_documents;
        break;
      case 'matter':
        sharesItemType = group.share_matters;
        break;
      case 'client':
        sharesItemType = group.share_clients;
        break;
      case 'calendar':
        sharesItemType = group.share_calendar;
        break;
      case 'task':
        sharesItemType = group.share_tasks;
        break;
      case 'note':
        sharesItemType = group.share_notes;
        break;
      default:
        sharesItemType = false;
    }

    if (!sharesItemType) continue;

    // Check if item is hidden from this group
    const hiddenCheck = await query(`
      SELECT 1 FROM sharing_group_hidden_items
      WHERE sharing_group_id = $1 AND user_id = $2 AND item_type = $3 AND item_id = $4
    `, [group.id, ownerId, itemType, itemId]);

    if (hiddenCheck.rows.length > 0) continue; // Owner hid this item

    // Access granted through this group
    return {
      hasAccess: true,
      canEdit: group.default_permission_level !== 'view',
      groupId: group.id,
      permissionLevel: group.default_permission_level
    };
  }

  return { hasAccess: false };
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
 * OPTIMIZED: Single query checks direct + all parent paths + group permissions
 * instead of looping one query per parent folder.
 */
async function checkFolderAccess(userId, firmId, folderPath, requiredAccess) {
  // Build all ancestor paths: /a/b/c -> ['/a/b/c', '/a/b', '/a', '/']
  const pathParts = folderPath.split('/').filter(p => p);
  const allPaths = [folderPath];
  for (let i = pathParts.length - 1; i >= 0; i--) {
    allPaths.push('/' + pathParts.slice(0, i).join('/') || '/');
  }

  // Single query: check user permissions on this folder or any ancestor,
  // plus group permissions via user_groups. Return the most specific match.
  const result = await query(`
    (
      SELECT fp.*, LENGTH(fp.folder_path) AS specificity
      FROM folder_permissions fp
      WHERE fp.firm_id = $1 AND fp.user_id = $2 AND fp.folder_path = ANY($3)
    )
    UNION ALL
    (
      SELECT fp.*, LENGTH(fp.folder_path) AS specificity
      FROM folder_permissions fp
      JOIN user_groups ug ON fp.group_id = ug.group_id
      WHERE fp.firm_id = $1 AND ug.user_id = $2
        AND (fp.folder_path = $4 OR $4 LIKE fp.folder_path || '/%')
    )
    ORDER BY specificity DESC
    LIMIT 1
  `, [firmId, userId, allPaths, folderPath]);

  if (result.rows.length > 0) {
    return checkPermissionLevel(result.rows[0], requiredAccess);
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
      -- Owner is in a sharing group with user that shares documents
      OR EXISTS (
        SELECT 1 FROM sharing_groups sg
        JOIN sharing_group_members sgm1 ON sg.id = sgm1.sharing_group_id AND sgm1.user_id = $${startParamIndex + 1}
        JOIN sharing_group_members sgm2 ON sg.id = sgm2.sharing_group_id 
          AND (sgm2.user_id = ${tableAlias}.uploaded_by OR sgm2.user_id = ${tableAlias}.owner_id)
        WHERE sg.firm_id = $${startParamIndex}
          AND sg.is_active = true
          AND sg.share_documents = true
          AND NOT EXISTS (
            SELECT 1 FROM sharing_group_hidden_items shi
            WHERE shi.sharing_group_id = sg.id
              AND shi.user_id = COALESCE(${tableAlias}.uploaded_by, ${tableAlias}.owner_id)
              AND shi.item_type = 'document'
              AND shi.item_id = ${tableAlias}.id
          )
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
  // Check cache first
  const cacheKey = `matters:${firmId}:${userId}:${userRole}`;
  const cached = matterIdCache.get(cacheKey);
  if (cached !== undefined) return cached;

  // Billing role has special access
  const isBillingOrAdmin = FULL_ACCESS_ROLES.includes(userRole) || userRole === 'billing';
  
  if (isBillingOrAdmin) {
    // Return all matter IDs for this firm
    const result = await query(
      'SELECT id FROM matters WHERE firm_id = $1',
      [firmId]
    );
    const ids = result.rows.map(r => r.id);
    matterIdCache.set(cacheKey, ids);
    return ids;
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

  const ids = result.rows.map(r => r.id);
  matterIdCache.set(cacheKey, ids);
  return ids;
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
