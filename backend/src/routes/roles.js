/**
 * Custom Roles & Permissions Management Routes
 * 
 * Allows firm admins to:
 * - View all roles and their permissions
 * - Edit permissions on existing roles
 * - Create custom roles
 * - Delete custom roles (not system roles)
 * - Set per-user permission overrides
 * - View the full permission catalog
 */

import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { 
  DEFAULT_ROLES, ALL_PERMISSIONS, seedFirmRoles, 
  resolveUserPermissions, invalidateRoleCache 
} from '../services/roleService.js';

const router = Router();

// ============================================
// PERMISSION CATALOG
// ============================================

// Get all available permissions (for rendering checkboxes)
router.get('/permissions-catalog', authenticate, async (req, res) => {
  // Group permissions by category
  const categories = {};
  for (const perm of ALL_PERMISSIONS) {
    if (!categories[perm.category]) {
      categories[perm.category] = [];
    }
    categories[perm.category].push(perm);
  }

  res.json({ permissions: ALL_PERMISSIONS, categories });
});

// ============================================
// FIRM ROLES CRUD
// ============================================

// Get all roles for the firm
router.get('/', authenticate, async (req, res) => {
  try {
    // Ensure firm has roles seeded (backward compatibility)
    await seedFirmRoles(req.user.firmId);

    const result = await query(
      `SELECT * FROM firm_roles WHERE firm_id = $1 ORDER BY sort_order, created_at`,
      [req.user.firmId]
    );

    // Also get user counts per role
    const userCounts = await query(
      `SELECT role, COUNT(*) as count FROM users WHERE firm_id = $1 AND is_active = true GROUP BY role`,
      [req.user.firmId]
    );
    const countMap = {};
    for (const row of userCounts.rows) {
      countMap[row.role] = parseInt(row.count);
    }

    res.json({
      roles: result.rows.map(r => ({
        id: r.id,
        name: r.name,
        displayName: r.display_name,
        description: r.description,
        permissions: r.permissions || [],
        isSystem: r.is_system,
        isEditable: r.is_editable,
        isDefault: r.is_default,
        color: r.color,
        sortOrder: r.sort_order,
        userCount: countMap[r.name] || 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      totalPermissions: ALL_PERMISSIONS.length,
    });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Failed to get roles' });
  }
});

// Get a single role with full details
router.get('/:roleId', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM firm_roles WHERE id = $1 AND firm_id = $2',
      [req.params.roleId, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const r = result.rows[0];

    // Get users assigned to this role
    const users = await query(
      `SELECT id, first_name, last_name, email, is_active 
       FROM users WHERE firm_id = $1 AND role = $2 ORDER BY first_name`,
      [req.user.firmId, r.name]
    );

    res.json({
      id: r.id,
      name: r.name,
      displayName: r.display_name,
      description: r.description,
      permissions: r.permissions || [],
      isSystem: r.is_system,
      isEditable: r.is_editable,
      isDefault: r.is_default,
      color: r.color,
      sortOrder: r.sort_order,
      users: users.rows.map(u => ({
        id: u.id,
        name: `${u.first_name} ${u.last_name}`,
        email: u.email,
        isActive: u.is_active,
      })),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  } catch (error) {
    console.error('Get role error:', error);
    res.status(500).json({ error: 'Failed to get role' });
  }
});

// Create a new custom role
router.post('/', authenticate, requirePermission('roles:manage'), async (req, res) => {
  try {
    const { name, displayName, description, permissions = [], color = '#6B7280', isDefault = false } = req.body;

    if (!name || !displayName) {
      return res.status(400).json({ error: 'name and displayName are required' });
    }

    // Validate name format (slug-style)
    const slug = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    // Check for duplicate name
    const existing = await query(
      'SELECT 1 FROM firm_roles WHERE firm_id = $1 AND name = $2',
      [req.user.firmId, slug]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A role with this name already exists' });
    }

    // Validate permissions against the catalog
    const validPerms = new Set(ALL_PERMISSIONS.map(p => p.key));
    const cleanPerms = permissions.filter(p => validPerms.has(p));

    // If setting as default, unset other defaults
    if (isDefault) {
      await query(
        'UPDATE firm_roles SET is_default = false WHERE firm_id = $1',
        [req.user.firmId]
      );
    }

    const result = await query(
      `INSERT INTO firm_roles (firm_id, name, display_name, description, permissions, color, is_default, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM firm_roles WHERE firm_id = $1))
       RETURNING *`,
      [req.user.firmId, slug, displayName, description, cleanPerms, color, isDefault]
    );

    const r = result.rows[0];
    invalidateRoleCache(req.user.firmId);

    // Audit log
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'role.created', 'role', $3, $4)`,
      [req.user.firmId, req.user.id, r.id, JSON.stringify({ name: slug, displayName, permissionCount: cleanPerms.length })]
    );

    res.status(201).json({
      id: r.id,
      name: r.name,
      displayName: r.display_name,
      description: r.description,
      permissions: r.permissions,
      isSystem: r.is_system,
      isEditable: r.is_editable,
      isDefault: r.is_default,
      color: r.color,
      sortOrder: r.sort_order,
      userCount: 0,
      createdAt: r.created_at,
    });
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

// Update a role's permissions and metadata
router.put('/:roleId', authenticate, requirePermission('roles:manage'), async (req, res) => {
  try {
    const existing = await query(
      'SELECT * FROM firm_roles WHERE id = $1 AND firm_id = $2',
      [req.params.roleId, req.user.firmId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const role = existing.rows[0];

    // Can't edit non-editable roles (owner)
    if (!role.is_editable) {
      return res.status(403).json({ error: 'This role cannot be modified' });
    }

    const { displayName, description, permissions, color, isDefault, sortOrder } = req.body;

    // Validate permissions if provided
    let cleanPerms = role.permissions;
    if (permissions !== undefined) {
      const validPerms = new Set(ALL_PERMISSIONS.map(p => p.key));
      cleanPerms = permissions.filter(p => validPerms.has(p));
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await query(
        'UPDATE firm_roles SET is_default = false WHERE firm_id = $1 AND id != $2',
        [req.user.firmId, req.params.roleId]
      );
    }

    const result = await query(
      `UPDATE firm_roles SET
        display_name = COALESCE($1, display_name),
        description = COALESCE($2, description),
        permissions = $3,
        color = COALESCE($4, color),
        is_default = COALESCE($5, is_default),
        sort_order = COALESCE($6, sort_order),
        updated_at = NOW()
      WHERE id = $7 AND firm_id = $8
      RETURNING *`,
      [displayName, description, cleanPerms, color, isDefault, sortOrder, req.params.roleId, req.user.firmId]
    );

    const r = result.rows[0];
    invalidateRoleCache(req.user.firmId);

    // Audit log
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'role.updated', 'role', $3, $4)`,
      [req.user.firmId, req.user.id, r.id, JSON.stringify({ name: r.name, permissionCount: cleanPerms.length })]
    );

    res.json({
      id: r.id,
      name: r.name,
      displayName: r.display_name,
      description: r.description,
      permissions: r.permissions,
      isSystem: r.is_system,
      isEditable: r.is_editable,
      isDefault: r.is_default,
      color: r.color,
      sortOrder: r.sort_order,
      updatedAt: r.updated_at,
    });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Delete a custom role
router.delete('/:roleId', authenticate, requirePermission('roles:manage'), async (req, res) => {
  try {
    const existing = await query(
      'SELECT * FROM firm_roles WHERE id = $1 AND firm_id = $2',
      [req.params.roleId, req.user.firmId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const role = existing.rows[0];

    // Can't delete system roles
    if (role.is_system) {
      return res.status(403).json({ error: 'System roles cannot be deleted' });
    }

    // Check if any users are assigned to this role
    const userCheck = await query(
      'SELECT COUNT(*) as count FROM users WHERE firm_id = $1 AND role = $2 AND is_active = true',
      [req.user.firmId, role.name]
    );

    if (parseInt(userCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: `Cannot delete role "${role.display_name}" - ${userCheck.rows[0].count} active user(s) are assigned to it. Reassign them first.` 
      });
    }

    await query('DELETE FROM firm_roles WHERE id = $1', [req.params.roleId]);
    invalidateRoleCache(req.user.firmId);

    // Audit log
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'role.deleted', 'role', $3, $4)`,
      [req.user.firmId, req.user.id, req.params.roleId, JSON.stringify({ name: role.name, displayName: role.display_name })]
    );

    res.json({ message: `Role "${role.display_name}" deleted` });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

// ============================================
// PER-USER PERMISSION OVERRIDES
// ============================================

// Get overrides for a specific user
router.get('/users/:userId/overrides', authenticate, requirePermission('users:manage'), async (req, res) => {
  try {
    const result = await query(
      `SELECT upo.*, u.first_name || ' ' || u.last_name as granted_by_name
       FROM user_permission_overrides upo
       LEFT JOIN users u ON upo.granted_by = u.id
       WHERE upo.firm_id = $1 AND upo.user_id = $2
       ORDER BY upo.permission`,
      [req.user.firmId, req.params.userId]
    );

    // Also get the user's role and effective permissions
    const userResult = await query(
      'SELECT role FROM users WHERE id = $1 AND firm_id = $2',
      [req.params.userId, req.user.firmId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const effectivePermissions = await resolveUserPermissions(
      req.params.userId, userResult.rows[0].role, req.user.firmId
    );

    res.json({
      overrides: result.rows.map(o => ({
        id: o.id,
        permission: o.permission,
        action: o.action,
        reason: o.reason,
        expiresAt: o.expires_at,
        grantedBy: o.granted_by,
        grantedByName: o.granted_by_name,
        createdAt: o.created_at,
      })),
      effectivePermissions,
      userRole: userResult.rows[0].role,
    });
  } catch (error) {
    console.error('Get user overrides error:', error);
    res.status(500).json({ error: 'Failed to get user permission overrides' });
  }
});

// Add a permission override for a user
router.post('/users/:userId/overrides', authenticate, requirePermission('users:manage'), async (req, res) => {
  try {
    const { permission, action, reason, expiresAt } = req.body;

    if (!permission || !action) {
      return res.status(400).json({ error: 'permission and action are required' });
    }

    if (!['grant', 'revoke'].includes(action)) {
      return res.status(400).json({ error: 'action must be "grant" or "revoke"' });
    }

    // Validate permission exists
    const validPerms = new Set(ALL_PERMISSIONS.map(p => p.key));
    if (!validPerms.has(permission)) {
      return res.status(400).json({ error: 'Invalid permission key' });
    }

    // Can't override owner permissions
    const targetUser = await query(
      'SELECT role FROM users WHERE id = $1 AND firm_id = $2',
      [req.params.userId, req.user.firmId]
    );
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (targetUser.rows[0].role === 'owner') {
      return res.status(403).json({ error: 'Cannot override owner permissions' });
    }

    const result = await query(
      `INSERT INTO user_permission_overrides (firm_id, user_id, permission, action, granted_by, reason, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (firm_id, user_id, permission) DO UPDATE SET
         action = $4, granted_by = $5, reason = $6, expires_at = $7, created_at = NOW()
       RETURNING *`,
      [req.user.firmId, req.params.userId, permission, action, req.user.id, reason, expiresAt]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'permission.override', 'user', $3, $4)`,
      [req.user.firmId, req.user.id, req.params.userId, 
       JSON.stringify({ permission, action, reason })]
    );

    const o = result.rows[0];
    res.status(201).json({
      id: o.id,
      permission: o.permission,
      action: o.action,
      reason: o.reason,
      expiresAt: o.expires_at,
      createdAt: o.created_at,
    });
  } catch (error) {
    console.error('Add user override error:', error);
    res.status(500).json({ error: 'Failed to add permission override' });
  }
});

// Remove a permission override
router.delete('/users/:userId/overrides/:overrideId', authenticate, requirePermission('users:manage'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM user_permission_overrides WHERE id = $1 AND firm_id = $2 AND user_id = $3 RETURNING id',
      [req.params.overrideId, req.user.firmId, req.params.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Override not found' });
    }

    res.json({ message: 'Permission override removed' });
  } catch (error) {
    console.error('Remove user override error:', error);
    res.status(500).json({ error: 'Failed to remove permission override' });
  }
});

// Get effective permissions for a user (resolved view)
router.get('/users/:userId/effective', authenticate, async (req, res) => {
  try {
    // Users can view their own permissions; admins can view anyone's
    const isOwnProfile = req.params.userId === req.user.id;
    const isAdmin = ['owner', 'admin'].includes(req.user.role);
    
    if (!isOwnProfile && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const userResult = await query(
      'SELECT id, role, first_name, last_name FROM users WHERE id = $1 AND firm_id = $2',
      [req.params.userId, req.user.firmId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const effectivePermissions = await resolveUserPermissions(user.id, user.role, req.user.firmId);

    res.json({
      userId: user.id,
      userName: `${user.first_name} ${user.last_name}`,
      role: user.role,
      effectivePermissions,
      permissionCount: effectivePermissions.length,
      totalAvailable: ALL_PERMISSIONS.length,
    });
  } catch (error) {
    console.error('Get effective permissions error:', error);
    res.status(500).json({ error: 'Failed to get effective permissions' });
  }
});

export default router;
