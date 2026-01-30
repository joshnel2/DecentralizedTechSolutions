/**
 * Client Permissions Middleware (RBAC)
 * Implements visibility system for clients, similar to matters
 * 
 * Rules:
 * - Admin/Owner/Billing: See ALL clients (no restrictions)
 * - All other roles: See "Firm Wide" clients + "Restricted" clients they're explicitly added to
 * - Assigned Attorney always has access to their clients
 */

import { query } from '../db/connection.js';

// Roles that bypass all permission checks
export const FULL_ACCESS_ROLES = ['owner', 'admin', 'billing'];

/**
 * Check if user has access to a specific client
 */
export async function canAccessClient(userId, userRole, clientId, firmId) {
  // Admin, Owner, Billing always have full access
  if (FULL_ACCESS_ROLES.includes(userRole)) {
    return { hasAccess: true, accessLevel: 'full' };
  }

  try {
    // Check client visibility and user's relationship to it
    const result = await query(`
      SELECT 
        c.visibility,
        c.assigned_attorney,
        c.created_by,
        EXISTS(SELECT 1 FROM client_permissions cp WHERE cp.client_id = c.id AND cp.user_id = $2) as has_direct_permission,
        EXISTS(
          SELECT 1 FROM client_permissions cp 
          JOIN user_groups ug ON cp.group_id = ug.group_id 
          WHERE cp.client_id = c.id AND ug.user_id = $2
        ) as has_group_permission,
        EXISTS(
          SELECT 1 FROM client_permissions cp 
          WHERE cp.client_id = c.id AND cp.role_slug = $4
        ) as has_role_permission
      FROM clients c
      WHERE c.id = $1 AND c.firm_id = $3
    `, [clientId, userId, firmId, userRole]);

    if (result.rows.length === 0) {
      return { hasAccess: false, reason: 'Client not found' };
    }

    const client = result.rows[0];

    // Firm-wide clients are accessible to everyone with clients:view permission
    if (!client.visibility || client.visibility === 'firm_wide') {
      return { hasAccess: true, accessLevel: 'standard' };
    }

    // For restricted clients, check various access paths
    if (client.visibility === 'restricted') {
      // Assigned attorney always has access
      if (client.assigned_attorney === userId) {
        return { hasAccess: true, accessLevel: 'assigned' };
      }

      // Creator always has access
      if (client.created_by === userId) {
        return { hasAccess: true, accessLevel: 'creator' };
      }

      // Check direct user permission
      if (client.has_direct_permission) {
        return { hasAccess: true, accessLevel: 'permitted' };
      }

      // Check group-based permission
      if (client.has_group_permission) {
        return { hasAccess: true, accessLevel: 'group' };
      }

      // Check role-based permission
      if (client.has_role_permission) {
        return { hasAccess: true, accessLevel: 'role' };
      }

      // No access
      return { hasAccess: false, reason: 'Restricted client - no permission' };
    }

    // Default: no access
    return { hasAccess: false, reason: 'Unknown visibility setting' };
  } catch (error) {
    console.error('Error checking client access:', error);
    return { hasAccess: false, reason: 'Error checking permissions' };
  }
}

/**
 * Get permission details for a user on a specific client
 */
export async function getClientPermissionDetails(userId, userRole, clientId) {
  if (FULL_ACCESS_ROLES.includes(userRole)) {
    return {
      canView: true,
      canEdit: true,
      canViewMatters: true,
      canCreateMatters: true,
      canViewBilling: true,
      canEditBilling: true,
      canViewDocuments: true,
      canShare: true,
      canManagePermissions: true,
      accessLevel: 'full'
    };
  }

  try {
    const result = await query(`
      SELECT 
        cp.permission_level,
        cp.can_view,
        cp.can_edit,
        cp.can_view_matters,
        cp.can_create_matters,
        cp.can_view_billing,
        cp.can_edit_billing,
        cp.can_view_documents,
        cp.can_share
      FROM client_permissions cp
      WHERE cp.client_id = $1 AND cp.user_id = $2
    `, [clientId, userId]);

    if (result.rows.length > 0) {
      const perm = result.rows[0];
      return {
        canView: perm.can_view,
        canEdit: perm.can_edit,
        canViewMatters: perm.can_view_matters,
        canCreateMatters: perm.can_create_matters,
        canViewBilling: perm.can_view_billing,
        canEditBilling: perm.can_edit_billing,
        canViewDocuments: perm.can_view_documents,
        canShare: perm.can_share,
        canManagePermissions: perm.permission_level === 'full' || perm.permission_level === 'manage',
        accessLevel: perm.permission_level
      };
    }

    // Default permissions for assigned users without explicit permission record
    return {
      canView: true,
      canEdit: false,
      canViewMatters: true,
      canCreateMatters: false,
      canViewBilling: false,
      canEditBilling: false,
      canViewDocuments: true,
      canShare: false,
      canManagePermissions: false,
      accessLevel: 'view'
    };
  } catch (error) {
    console.error('Error getting client permission details:', error);
    return null;
  }
}

/**
 * Build SQL WHERE clause for filtering clients by visibility
 * Returns { clause: string, params: any[] }
 */
export function buildClientVisibilityFilter(userId, userRole, firmId, startParamIndex = 1) {
  // Admin, Owner, Billing see everything
  if (FULL_ACCESS_ROLES.includes(userRole)) {
    return {
      clause: `c.firm_id = $${startParamIndex}`,
      params: [firmId],
      nextParamIndex: startParamIndex + 1
    };
  }

  // Others see: firm_wide OR (restricted AND has access)
  const clause = `
    c.firm_id = $${startParamIndex} AND (
      c.visibility IS NULL
      OR c.visibility = 'firm_wide'
      OR c.assigned_attorney = $${startParamIndex + 1}
      OR c.created_by = $${startParamIndex + 1}
      OR EXISTS (SELECT 1 FROM client_permissions cp WHERE cp.client_id = c.id AND cp.user_id = $${startParamIndex + 1})
      OR EXISTS (
        SELECT 1 FROM client_permissions cp 
        JOIN user_groups ug ON cp.group_id = ug.group_id 
        WHERE cp.client_id = c.id AND ug.user_id = $${startParamIndex + 1}
      )
      OR EXISTS (
        SELECT 1 FROM client_permissions cp 
        WHERE cp.client_id = c.id AND cp.role_slug = $${startParamIndex + 2}
      )
    )
  `;

  return {
    clause,
    params: [firmId, userId, userRole],
    nextParamIndex: startParamIndex + 3
  };
}

/**
 * Middleware to check client access for routes with :clientId parameter
 */
export function requireClientAccess(options = {}) {
  const { allowedLevels = ['full', 'standard', 'assigned', 'creator', 'permitted', 'group', 'role'] } = options;

  return async (req, res, next) => {
    const clientId = req.params.clientId || req.params.id;
    
    if (!clientId) {
      return res.status(400).json({ error: 'Client ID required' });
    }

    const access = await canAccessClient(
      req.user.id,
      req.user.role,
      clientId,
      req.user.firmId
    );

    if (!access.hasAccess) {
      return res.status(403).json({ 
        error: 'Access denied to this client',
        reason: access.reason 
      });
    }

    if (!allowedLevels.includes(access.accessLevel)) {
      return res.status(403).json({ 
        error: 'Insufficient permission level for this action' 
      });
    }

    // Attach access info to request for use in route handlers
    req.clientAccess = access;
    next();
  };
}

/**
 * Get list of users who have access to a client
 */
export async function getClientAccessList(clientId, firmId) {
  try {
    const result = await query(`
      SELECT 
        cp.id as permission_id,
        cp.user_id,
        cp.group_id,
        cp.role_slug,
        cp.permission_level,
        cp.can_view,
        cp.can_edit,
        cp.can_view_matters,
        cp.can_create_matters,
        cp.can_view_billing,
        cp.can_edit_billing,
        cp.can_view_documents,
        cp.can_share,
        cp.granted_at,
        cp.expires_at,
        cp.notes,
        u.first_name,
        u.last_name,
        u.email,
        u.role as user_role,
        g.name as group_name,
        g.color as group_color,
        grantor.first_name || ' ' || grantor.last_name as granted_by_name
      FROM client_permissions cp
      LEFT JOIN users u ON cp.user_id = u.id
      LEFT JOIN groups g ON cp.group_id = g.id
      LEFT JOIN users grantor ON cp.granted_by = grantor.id
      JOIN clients c ON cp.client_id = c.id
      WHERE cp.client_id = $1 AND c.firm_id = $2
      ORDER BY cp.granted_at DESC
    `, [clientId, firmId]);

    return result.rows.map(row => ({
      permissionId: row.permission_id,
      userId: row.user_id,
      groupId: row.group_id,
      roleSlug: row.role_slug,
      permissionLevel: row.permission_level,
      canView: row.can_view,
      canEdit: row.can_edit,
      canViewMatters: row.can_view_matters,
      canCreateMatters: row.can_create_matters,
      canViewBilling: row.can_view_billing,
      canEditBilling: row.can_edit_billing,
      canViewDocuments: row.can_view_documents,
      canShare: row.can_share,
      grantedAt: row.granted_at,
      expiresAt: row.expires_at,
      notes: row.notes,
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
    console.error('Error getting client access list:', error);
    return [];
  }
}

export default {
  canAccessClient,
  getClientPermissionDetails,
  buildClientVisibilityFilter,
  requireClientAccess,
  getClientAccessList,
  FULL_ACCESS_ROLES
};
