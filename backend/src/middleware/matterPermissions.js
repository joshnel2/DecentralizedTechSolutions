/**
 * Matter Permissions Middleware (RBAC)
 * Implements Clio-like visibility system for matters
 * 
 * Rules:
 * - Admin/Owner/Billing: See ALL matters, documents, notes (no restrictions)
 * - All other roles: See "Firm Wide" matters + "Restricted" matters they're explicitly added to
 * - Responsible Attorney always has access to their matters
 * - Originating Attorney always has access (for credit tracking)
 */

import { query } from '../db/connection.js';

// Roles that bypass all permission checks
export const FULL_ACCESS_ROLES = ['owner', 'admin', 'billing'];

/**
 * Check if user has access to a specific matter
 */
export async function canAccessMatter(userId, userRole, matterId, firmId) {
  // Admin, Owner, Billing always have full access
  if (FULL_ACCESS_ROLES.includes(userRole)) {
    return { hasAccess: true, accessLevel: 'full' };
  }

  try {
    // Check matter visibility and user's relationship to it
    const result = await query(`
      SELECT 
        m.visibility,
        m.responsible_attorney,
        m.originating_attorney,
        EXISTS(SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $2) as is_assigned,
        EXISTS(SELECT 1 FROM matter_permissions mp WHERE mp.matter_id = m.id AND mp.user_id = $2) as has_direct_permission,
        EXISTS(
          SELECT 1 FROM matter_permissions mp 
          JOIN user_groups ug ON mp.group_id = ug.group_id 
          WHERE mp.matter_id = m.id AND ug.user_id = $2
        ) as has_group_permission
      FROM matters m
      WHERE m.id = $1 AND m.firm_id = $3
    `, [matterId, userId, firmId]);

    if (result.rows.length === 0) {
      return { hasAccess: false, reason: 'Matter not found' };
    }

    const matter = result.rows[0];

    // Firm-wide matters are accessible to everyone
    if (matter.visibility === 'firm_wide') {
      return { hasAccess: true, accessLevel: 'standard' };
    }

    // For restricted matters, check various access paths
    if (matter.visibility === 'restricted') {
      // Responsible attorney always has access
      if (matter.responsible_attorney === userId) {
        return { hasAccess: true, accessLevel: 'responsible' };
      }

      // Originating attorney always has access
      if (matter.originating_attorney === userId) {
        return { hasAccess: true, accessLevel: 'originating' };
      }

      // Check if user is assigned to the matter
      if (matter.is_assigned) {
        return { hasAccess: true, accessLevel: 'assigned' };
      }

      // Check direct user permission
      if (matter.has_direct_permission) {
        return { hasAccess: true, accessLevel: 'permitted' };
      }

      // Check group-based permission
      if (matter.has_group_permission) {
        return { hasAccess: true, accessLevel: 'group' };
      }

      // No access
      return { hasAccess: false, reason: 'Restricted matter - no permission' };
    }

    // Default: no access
    return { hasAccess: false, reason: 'Unknown visibility setting' };
  } catch (error) {
    console.error('Error checking matter access:', error);
    return { hasAccess: false, reason: 'Error checking permissions' };
  }
}

/**
 * Get permission details for a user on a specific matter
 */
export async function getMatterPermissionDetails(userId, userRole, matterId) {
  if (FULL_ACCESS_ROLES.includes(userRole)) {
    return {
      canView: true,
      canEdit: true,
      canViewDocuments: true,
      canViewNotes: true,
      canManagePermissions: true,
      accessLevel: 'full'
    };
  }

  try {
    const result = await query(`
      SELECT 
        mp.permission_level,
        mp.can_view_documents,
        mp.can_view_notes,
        mp.can_edit
      FROM matter_permissions mp
      WHERE mp.matter_id = $1 AND mp.user_id = $2
    `, [matterId, userId]);

    if (result.rows.length > 0) {
      const perm = result.rows[0];
      return {
        canView: true,
        canEdit: perm.can_edit || perm.permission_level === 'edit' || perm.permission_level === 'admin',
        canViewDocuments: perm.can_view_documents,
        canViewNotes: perm.can_view_notes,
        canManagePermissions: perm.permission_level === 'admin',
        accessLevel: perm.permission_level
      };
    }

    // Default permissions for assigned users without explicit permission record
    return {
      canView: true,
      canEdit: false,
      canViewDocuments: true,
      canViewNotes: true,
      canManagePermissions: false,
      accessLevel: 'view'
    };
  } catch (error) {
    console.error('Error getting permission details:', error);
    return null;
  }
}

/**
 * Build SQL WHERE clause for filtering matters by visibility
 * Returns { clause: string, params: any[] }
 */
export function buildVisibilityFilter(userId, userRole, firmId, startParamIndex = 1) {
  // Admin, Owner, Billing see everything
  if (FULL_ACCESS_ROLES.includes(userRole)) {
    return {
      clause: `m.firm_id = $${startParamIndex}`,
      params: [firmId],
      nextParamIndex: startParamIndex + 1
    };
  }

  // Others see: firm_wide OR (restricted AND has access), excluding blocked users
  const clause = `
    m.firm_id = $${startParamIndex} AND (
      m.visibility = 'firm_wide'
      OR m.responsible_attorney = $${startParamIndex + 1}
      OR m.originating_attorney = $${startParamIndex + 1}
      OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $${startParamIndex + 1})
      OR EXISTS (SELECT 1 FROM matter_permissions mp WHERE mp.matter_id = m.id AND mp.user_id = $${startParamIndex + 1})
      OR EXISTS (
        SELECT 1 FROM matter_permissions mp 
        JOIN user_groups ug ON mp.group_id = ug.group_id 
        WHERE mp.matter_id = m.id AND ug.user_id = $${startParamIndex + 1}
      )
    )
    AND NOT ($${startParamIndex + 1} = ANY(COALESCE(m.blocked_user_ids, '{}')))
  `;

  return {
    clause,
    params: [firmId, userId],
    nextParamIndex: startParamIndex + 2
  };
}

/**
 * Middleware to check matter access for routes with :matterId parameter
 */
export function requireMatterAccess(options = {}) {
  const { allowedLevels = ['full', 'standard', 'responsible', 'originating', 'assigned', 'permitted', 'group'] } = options;

  return async (req, res, next) => {
    const matterId = req.params.matterId || req.params.id;
    
    if (!matterId) {
      return res.status(400).json({ error: 'Matter ID required' });
    }

    const access = await canAccessMatter(
      req.user.id,
      req.user.role,
      matterId,
      req.user.firmId
    );

    if (!access.hasAccess) {
      return res.status(403).json({ 
        error: 'Access denied to this matter',
        reason: access.reason 
      });
    }

    if (!allowedLevels.includes(access.accessLevel)) {
      return res.status(403).json({ 
        error: 'Insufficient permission level for this action' 
      });
    }

    // Attach access info to request for use in route handlers
    req.matterAccess = access;
    next();
  };
}

/**
 * Get list of users who have access to a matter
 */
export async function getMatterAccessList(matterId, firmId) {
  try {
    const result = await query(`
      SELECT 
        mp.id as permission_id,
        mp.user_id,
        mp.group_id,
        mp.permission_level,
        mp.can_view_documents,
        mp.can_view_notes,
        mp.can_edit,
        mp.granted_at,
        u.first_name,
        u.last_name,
        u.email,
        u.role as user_role,
        g.name as group_name,
        g.color as group_color,
        grantor.first_name || ' ' || grantor.last_name as granted_by_name
      FROM matter_permissions mp
      LEFT JOIN users u ON mp.user_id = u.id
      LEFT JOIN groups g ON mp.group_id = g.id
      LEFT JOIN users grantor ON mp.granted_by = grantor.id
      JOIN matters m ON mp.matter_id = m.id
      WHERE mp.matter_id = $1 AND m.firm_id = $2
      ORDER BY mp.granted_at DESC
    `, [matterId, firmId]);

    return result.rows.map(row => ({
      permissionId: row.permission_id,
      userId: row.user_id,
      groupId: row.group_id,
      permissionLevel: row.permission_level,
      canViewDocuments: row.can_view_documents,
      canViewNotes: row.can_view_notes,
      canEdit: row.can_edit,
      grantedAt: row.granted_at,
      // User info (if user permission)
      userName: row.user_id ? `${row.first_name} ${row.last_name}` : null,
      userEmail: row.email,
      userRole: row.user_role,
      // Group info (if group permission)
      groupName: row.group_name,
      groupColor: row.group_color,
      // Who granted it
      grantedByName: row.granted_by_name
    }));
  } catch (error) {
    console.error('Error getting matter access list:', error);
    return [];
  }
}

export default {
  canAccessMatter,
  getMatterPermissionDetails,
  buildVisibilityFilter,
  requireMatterAccess,
  getMatterAccessList,
  FULL_ACCESS_ROLES
};
