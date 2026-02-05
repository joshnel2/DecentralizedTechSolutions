/**
 * Advanced Permissions API Routes
 * Manages roles, permissions, templates, and inheritance rules
 */

import { Router } from 'express';
import { query, withTransaction } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Default role permissions (fallback when no custom configuration exists)
const DEFAULT_ROLE_PERMISSIONS = {
  owner: [
    'firm:manage', 'firm:billing', 'firm:delete',
    'users:invite', 'users:manage', 'users:delete', 'users:view_rates', 'users:edit_rates',
    'groups:manage', 'groups:assign',
    'matters:create', 'matters:view', 'matters:view_restricted', 'matters:edit', 'matters:delete', 
    'matters:assign', 'matters:manage_permissions', 'matters:close', 'matters:transfer',
    'clients:create', 'clients:view', 'clients:view_restricted', 'clients:edit', 'clients:delete', 
    'clients:merge', 'clients:view_confidential',
    'billing:create', 'billing:view', 'billing:view_all', 'billing:edit', 'billing:edit_others',
    'billing:delete', 'billing:approve', 'billing:create_invoices', 'billing:void_invoices',
    'billing:apply_discounts', 'billing:view_trust', 'billing:manage_trust',
    'documents:upload', 'documents:view', 'documents:view_confidential', 'documents:edit',
    'documents:delete', 'documents:share_external', 'documents:manage_folders', 'documents:manage_permissions',
    'calendar:create', 'calendar:view', 'calendar:view_all', 'calendar:edit', 'calendar:delete', 'calendar:manage_deadlines',
    'reports:view', 'reports:view_financial', 'reports:view_productivity', 'reports:create', 'reports:export', 'reports:schedule',
    'integrations:view', 'integrations:manage', 'integrations:sync',
    'ai:use_assistant', 'ai:use_drafting', 'ai:use_analysis', 'ai:view_suggestions', 'ai:train_model',
    'audit:view', 'audit:export', 'security:manage_sessions', 'security:manage_2fa', 'security:manage_api_keys'
  ],
  admin: [
    'users:invite', 'users:manage', 'users:view_rates', 'users:edit_rates',
    'groups:manage', 'groups:assign',
    'matters:create', 'matters:view', 'matters:view_restricted', 'matters:edit', 'matters:delete', 
    'matters:assign', 'matters:manage_permissions', 'matters:close',
    'clients:create', 'clients:view', 'clients:view_restricted', 'clients:edit', 'clients:delete',
    'billing:create', 'billing:view', 'billing:view_all', 'billing:edit', 'billing:edit_others',
    'billing:approve', 'billing:create_invoices', 'billing:apply_discounts', 'billing:view_trust',
    'documents:upload', 'documents:view', 'documents:view_confidential', 'documents:edit',
    'documents:delete', 'documents:manage_folders', 'documents:manage_permissions',
    'calendar:create', 'calendar:view', 'calendar:view_all', 'calendar:edit', 'calendar:delete', 'calendar:manage_deadlines',
    'reports:view', 'reports:view_financial', 'reports:view_productivity', 'reports:create', 'reports:export',
    'integrations:view', 'integrations:manage', 'integrations:sync',
    'ai:use_assistant', 'ai:use_drafting', 'ai:use_analysis', 'ai:view_suggestions',
    'audit:view', 'security:manage_sessions'
  ],
  attorney: [
    'matters:create', 'matters:view', 'matters:edit', 'matters:assign', 'matters:close',
    'clients:create', 'clients:view', 'clients:edit',
    'billing:create', 'billing:view', 'billing:edit', 'billing:create_invoices',
    'documents:upload', 'documents:view', 'documents:edit', 'documents:manage_folders',
    'calendar:create', 'calendar:view', 'calendar:edit', 'calendar:delete', 'calendar:manage_deadlines',
    'reports:view', 'reports:view_productivity',
    'ai:use_assistant', 'ai:use_drafting', 'ai:use_analysis', 'ai:view_suggestions'
  ],
  paralegal: [
    'matters:view', 'matters:edit',
    'clients:view',
    'billing:create', 'billing:view', 'billing:edit',
    'documents:upload', 'documents:view', 'documents:edit',
    'calendar:create', 'calendar:view', 'calendar:edit',
    'ai:use_assistant', 'ai:view_suggestions'
  ],
  staff: [
    'matters:view',
    'clients:view',
    'billing:view',
    'documents:view',
    'calendar:create', 'calendar:view', 'calendar:edit',
    'ai:use_assistant'
  ],
  billing: [
    'matters:view',
    'clients:view',
    'billing:create', 'billing:view', 'billing:view_all', 'billing:edit', 'billing:approve',
    'billing:create_invoices', 'billing:apply_discounts', 'billing:view_trust', 'billing:manage_trust',
    'reports:view', 'reports:view_financial', 'reports:create', 'reports:export',
    'ai:use_assistant'
  ],
  readonly: [
    'matters:view',
    'clients:view',
    'billing:view',
    'documents:view',
    'calendar:view',
    'reports:view'
  ]
};

// ============================================
// PERMISSION DEFINITIONS
// ============================================

/**
 * GET /api/permissions/definitions
 * Get all permission definitions organized by category
 */
router.get('/definitions', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        permission_key,
        category,
        name,
        description,
        is_sensitive,
        requires,
        sort_order
      FROM permission_definitions
      WHERE is_active = true
      ORDER BY category, sort_order
    `);

    // Group by category
    const categories = {};
    for (const perm of result.rows) {
      if (!categories[perm.category]) {
        categories[perm.category] = {
          id: perm.category,
          name: perm.category.charAt(0).toUpperCase() + perm.category.slice(1),
          permissions: []
        };
      }
      categories[perm.category].permissions.push({
        key: perm.permission_key,
        name: perm.name,
        description: perm.description,
        isSensitive: perm.is_sensitive,
        requires: perm.requires
      });
    }

    res.json({ 
      categories: Object.values(categories),
      totalPermissions: result.rows.length
    });
  } catch (error) {
    console.error('Get permission definitions error:', error);
    res.status(500).json({ error: 'Failed to get permission definitions' });
  }
});

// ============================================
// ROLES
// ============================================

/**
 * GET /api/permissions/roles
 * Get all roles for the firm
 */
router.get('/roles', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        cr.id,
        cr.slug,
        cr.name,
        cr.description,
        cr.color,
        cr.icon,
        cr.is_system,
        cr.inherits_from,
        cr.priority,
        cr.is_active,
        (SELECT COUNT(*) FROM users u WHERE u.firm_id = cr.firm_id AND u.role = cr.slug) as user_count
      FROM custom_roles cr
      WHERE cr.firm_id = $1
      ORDER BY cr.priority DESC, cr.name
    `, [req.user.firmId]);

    // If no custom roles exist, return defaults
    if (result.rows.length === 0) {
      const defaultRoles = [
        { slug: 'owner', name: 'Owner', description: 'Full access', color: '#F59E0B', icon: 'crown', isSystem: true, priority: 100 },
        { slug: 'admin', name: 'Administrator', description: 'Admin access', color: '#8B5CF6', icon: 'shield', isSystem: true, priority: 90 },
        { slug: 'attorney', name: 'Attorney', description: 'Attorney access', color: '#3B82F6', icon: 'briefcase', isSystem: true, priority: 70 },
        { slug: 'paralegal', name: 'Paralegal', description: 'Paralegal access', color: '#10B981', icon: 'file-text', isSystem: true, priority: 60 },
        { slug: 'staff', name: 'Staff', description: 'Staff access', color: '#64748B', icon: 'user', isSystem: true, priority: 40 },
        { slug: 'billing', name: 'Billing', description: 'Billing access', color: '#EC4899', icon: 'credit-card', isSystem: true, priority: 50 },
        { slug: 'readonly', name: 'Read Only', description: 'View only', color: '#94A3B8', icon: 'eye', isSystem: true, priority: 10 }
      ];
      return res.json({ roles: defaultRoles });
    }

    res.json({
      roles: result.rows.map(r => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        description: r.description,
        color: r.color,
        icon: r.icon,
        isSystem: r.is_system,
        inheritsFrom: r.inherits_from,
        priority: r.priority,
        isActive: r.is_active,
        userCount: parseInt(r.user_count)
      }))
    });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Failed to get roles' });
  }
});

/**
 * POST /api/permissions/roles
 * Create a new custom role
 */
router.post('/roles', authenticate, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { name, description, color, icon, inheritsFrom, permissions } = req.body;

    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Role name is required (min 2 characters)' });
    }

    // Generate slug from name
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    // Check if slug already exists
    const existing = await query(
      'SELECT id FROM custom_roles WHERE firm_id = $1 AND slug = $2',
      [req.user.firmId, slug]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'A role with this name already exists' });
    }

    // Create the role
    const result = await query(`
      INSERT INTO custom_roles (firm_id, slug, name, description, color, icon, inherits_from, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      req.user.firmId,
      slug,
      name,
      description || null,
      color || '#64748B',
      icon || 'user',
      inheritsFrom || null,
      req.user.id
    ]);

    const role = result.rows[0];

    // If permissions provided, set them
    if (permissions && Array.isArray(permissions)) {
      for (const perm of permissions) {
        await query(`
          INSERT INTO role_permissions (firm_id, role_slug, permission_key, permission_value)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (firm_id, role_slug, permission_key) DO UPDATE SET permission_value = $4
        `, [req.user.firmId, slug, perm.key, perm.value || 'granted']);
      }
    }

    // Log
    await query(`
      INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
      VALUES ($1, $2, 'role.created', 'role', $3, $4)
    `, [req.user.firmId, req.user.id, role.id, JSON.stringify({ name, slug })]);

    res.status(201).json({
      success: true,
      role: {
        id: role.id,
        slug: role.slug,
        name: role.name,
        description: role.description,
        color: role.color,
        icon: role.icon,
        inheritsFrom: role.inherits_from,
        isSystem: false,
        userCount: 0
      }
    });
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

/**
 * PUT /api/permissions/roles/:roleSlug
 * Update a role
 */
router.put('/roles/:roleSlug', authenticate, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { roleSlug } = req.params;
    const { name, description, color, icon, isActive } = req.body;

    // Check if role exists and is not a system role (unless just updating color/description)
    const existing = await query(
      'SELECT * FROM custom_roles WHERE firm_id = $1 AND slug = $2',
      [req.user.firmId, roleSlug]
    );

    if (existing.rows.length === 0) {
      // For system roles that don't exist in custom_roles yet, create them
      if (['owner', 'admin', 'attorney', 'paralegal', 'staff', 'billing', 'readonly'].includes(roleSlug)) {
        // Allow updates to system roles (just appearance, not permissions)
        await query(`
          INSERT INTO custom_roles (firm_id, slug, name, description, color, icon, is_system)
          VALUES ($1, $2, $3, $4, $5, $6, true)
        `, [req.user.firmId, roleSlug, name || roleSlug, description, color, icon]);
      } else {
        return res.status(404).json({ error: 'Role not found' });
      }
    }

    const role = existing.rows[0];

    // Update the role
    await query(`
      UPDATE custom_roles 
      SET 
        name = COALESCE($3, name),
        description = COALESCE($4, description),
        color = COALESCE($5, color),
        icon = COALESCE($6, icon),
        is_active = COALESCE($7, is_active),
        updated_at = NOW()
      WHERE firm_id = $1 AND slug = $2
    `, [req.user.firmId, roleSlug, name, description, color, icon, isActive]);

    res.json({ success: true, message: 'Role updated' });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

/**
 * DELETE /api/permissions/roles/:roleSlug
 * Delete a custom role
 */
router.delete('/roles/:roleSlug', authenticate, requireRole('owner'), async (req, res) => {
  try {
    const { roleSlug } = req.params;

    // Check if it's a system role
    const role = await query(
      'SELECT * FROM custom_roles WHERE firm_id = $1 AND slug = $2',
      [req.user.firmId, roleSlug]
    );

    if (role.rows.length > 0 && role.rows[0].is_system) {
      return res.status(400).json({ error: 'Cannot delete system roles' });
    }

    // Check if users have this role
    const userCheck = await query(
      'SELECT COUNT(*) FROM users WHERE firm_id = $1 AND role = $2',
      [req.user.firmId, roleSlug]
    );

    if (parseInt(userCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete role with assigned users. Reassign users first.',
        userCount: parseInt(userCheck.rows[0].count)
      });
    }

    // Delete role permissions first
    await query('DELETE FROM role_permissions WHERE firm_id = $1 AND role_slug = $2', [req.user.firmId, roleSlug]);

    // Delete the role
    await query('DELETE FROM custom_roles WHERE firm_id = $1 AND slug = $2', [req.user.firmId, roleSlug]);

    res.json({ success: true, message: 'Role deleted' });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

// ============================================
// ROLE PERMISSIONS
// ============================================

/**
 * GET /api/permissions/roles/:roleSlug/permissions
 * Get permissions for a specific role
 */
router.get('/roles/:roleSlug/permissions', authenticate, async (req, res) => {
  try {
    const { roleSlug } = req.params;

    // Get custom permissions for this role
    const customPerms = await query(`
      SELECT permission_key, permission_value, conditions
      FROM role_permissions
      WHERE firm_id = $1 AND role_slug = $2
    `, [req.user.firmId, roleSlug]);

    // Get default permissions for this role
    const defaults = DEFAULT_ROLE_PERMISSIONS[roleSlug] || [];

    // Build the permission map
    const permissions = {};
    
    // First, set all to denied
    const allPerms = await query('SELECT permission_key FROM permission_definitions WHERE is_active = true');
    for (const p of allPerms.rows) {
      permissions[p.permission_key] = {
        key: p.permission_key,
        value: 'denied',
        source: 'default',
        conditions: {}
      };
    }

    // Apply default permissions
    for (const permKey of defaults) {
      permissions[permKey] = {
        key: permKey,
        value: 'granted',
        source: 'default',
        conditions: {}
      };
    }

    // Apply custom permissions (override defaults)
    for (const cp of customPerms.rows) {
      permissions[cp.permission_key] = {
        key: cp.permission_key,
        value: cp.permission_value,
        source: 'custom',
        conditions: cp.conditions || {}
      };
    }

    res.json({
      roleSlug,
      permissions: Object.values(permissions),
      customCount: customPerms.rows.length,
      defaultCount: defaults.length
    });
  } catch (error) {
    console.error('Get role permissions error:', error);
    res.status(500).json({ error: 'Failed to get role permissions' });
  }
});

/**
 * PUT /api/permissions/roles/:roleSlug/permissions
 * Update permissions for a role
 */
router.put('/roles/:roleSlug/permissions', authenticate, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { roleSlug } = req.params;
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Permissions must be an array' });
    }

    // Validate role exists
    if (!DEFAULT_ROLE_PERMISSIONS[roleSlug]) {
      const custom = await query(
        'SELECT id FROM custom_roles WHERE firm_id = $1 AND slug = $2',
        [req.user.firmId, roleSlug]
      );
      if (custom.rows.length === 0) {
        return res.status(404).json({ error: 'Role not found' });
      }
    }

    await withTransaction(async (client) => {
      for (const perm of permissions) {
        if (!perm.key) continue;

        if (perm.value === 'inherited' || perm.value === 'default') {
          // Remove custom override to use default
          await client.query(`
            DELETE FROM role_permissions 
            WHERE firm_id = $1 AND role_slug = $2 AND permission_key = $3
          `, [req.user.firmId, roleSlug, perm.key]);
        } else {
          // Set custom permission
          await client.query(`
            INSERT INTO role_permissions (firm_id, role_slug, permission_key, permission_value, conditions, modified_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (firm_id, role_slug, permission_key) 
            DO UPDATE SET 
              permission_value = $4,
              conditions = $5,
              modified_by = $6,
              updated_at = NOW()
          `, [
            req.user.firmId,
            roleSlug,
            perm.key,
            perm.value,
            perm.conditions ? JSON.stringify(perm.conditions) : '{}',
            req.user.id
          ]);
        }
      }
    });

    // Log the change
    await query(`
      INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
      VALUES ($1, $2, 'role.permissions_updated', 'role', $3, $4)
    `, [
      req.user.firmId,
      req.user.id,
      roleSlug,
      JSON.stringify({ updatedCount: permissions.length })
    ]);

    res.json({ success: true, message: 'Role permissions updated' });
  } catch (error) {
    console.error('Update role permissions error:', error);
    res.status(500).json({ error: 'Failed to update role permissions' });
  }
});

// ============================================
// USER PERMISSION OVERRIDES
// ============================================

/**
 * GET /api/permissions/users/:userId/overrides
 * Get permission overrides for a specific user
 */
router.get('/users/:userId/overrides', authenticate, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await query(`
      SELECT 
        upo.id,
        upo.permission_key,
        upo.permission_value,
        upo.reason,
        upo.expires_at,
        upo.created_at,
        setter.first_name || ' ' || setter.last_name as set_by_name
      FROM user_permission_overrides upo
      LEFT JOIN users setter ON upo.set_by = setter.id
      WHERE upo.user_id = $1 AND upo.firm_id = $2
      ORDER BY upo.created_at DESC
    `, [userId, req.user.firmId]);

    res.json({ overrides: result.rows });
  } catch (error) {
    console.error('Get user overrides error:', error);
    res.status(500).json({ error: 'Failed to get user overrides' });
  }
});

/**
 * POST /api/permissions/users/:userId/overrides
 * Add a permission override for a user
 */
router.post('/users/:userId/overrides', authenticate, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissionKey, permissionValue, reason, expiresAt } = req.body;

    if (!permissionKey || !['granted', 'denied'].includes(permissionValue)) {
      return res.status(400).json({ error: 'Invalid permission key or value' });
    }

    const result = await query(`
      INSERT INTO user_permission_overrides (user_id, firm_id, permission_key, permission_value, reason, expires_at, set_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id, permission_key) DO UPDATE SET
        permission_value = $4,
        reason = $5,
        expires_at = $6,
        set_by = $7,
        created_at = NOW()
      RETURNING id
    `, [userId, req.user.firmId, permissionKey, permissionValue, reason, expiresAt, req.user.id]);

    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Add user override error:', error);
    res.status(500).json({ error: 'Failed to add override' });
  }
});

/**
 * DELETE /api/permissions/users/:userId/overrides/:overrideId
 * Remove a permission override
 */
router.delete('/users/:userId/overrides/:overrideId', authenticate, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { userId, overrideId } = req.params;

    await query(`
      DELETE FROM user_permission_overrides 
      WHERE id = $1 AND user_id = $2 AND firm_id = $3
    `, [overrideId, userId, req.user.firmId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete user override error:', error);
    res.status(500).json({ error: 'Failed to delete override' });
  }
});

// ============================================
// PERMISSION TEMPLATES
// ============================================

/**
 * GET /api/permissions/templates
 * Get all permission templates
 */
router.get('/templates', authenticate, async (req, res) => {
  try {
    const { type } = req.query;

    let sql = `
      SELECT 
        pt.id,
        pt.name,
        pt.description,
        pt.template_type,
        pt.permissions,
        pt.icon,
        pt.color,
        pt.is_system,
        pt.created_at,
        creator.first_name || ' ' || creator.last_name as created_by_name
      FROM permission_templates pt
      LEFT JOIN users creator ON pt.created_by = creator.id
      WHERE pt.firm_id = $1
    `;
    const params = [req.user.firmId];

    if (type) {
      sql += ` AND pt.template_type = $2`;
      params.push(type);
    }

    sql += ` ORDER BY pt.is_system DESC, pt.name`;

    const result = await query(sql, params);

    res.json({
      templates: result.rows.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        type: t.template_type,
        permissions: t.permissions,
        icon: t.icon,
        color: t.color,
        isSystem: t.is_system,
        createdAt: t.created_at,
        createdByName: t.created_by_name
      }))
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Failed to get templates' });
  }
});

/**
 * POST /api/permissions/templates
 * Create a new permission template
 */
router.post('/templates', authenticate, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { name, description, type, permissions, icon, color } = req.body;

    if (!name || !type || !permissions) {
      return res.status(400).json({ error: 'Name, type, and permissions are required' });
    }

    const result = await query(`
      INSERT INTO permission_templates (firm_id, name, description, template_type, permissions, icon, color, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      req.user.firmId,
      name,
      description,
      type,
      JSON.stringify(permissions),
      icon || 'shield',
      color || '#3B82F6',
      req.user.id
    ]);

    res.status(201).json({
      success: true,
      template: result.rows[0]
    });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

/**
 * DELETE /api/permissions/templates/:id
 * Delete a permission template
 */
router.delete('/templates/:id', authenticate, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if it's a system template
    const template = await query(
      'SELECT is_system FROM permission_templates WHERE id = $1 AND firm_id = $2',
      [id, req.user.firmId]
    );

    if (template.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    if (template.rows[0].is_system) {
      return res.status(400).json({ error: 'Cannot delete system templates' });
    }

    await query('DELETE FROM permission_templates WHERE id = $1', [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ============================================
// CLIENT PERMISSIONS
// ============================================

/**
 * GET /api/permissions/clients/:clientId
 * Get permissions for a specific client
 */
router.get('/clients/:clientId', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;

    // Get client info
    const clientResult = await query(`
      SELECT 
        c.visibility,
        c.assigned_attorney,
        aa.first_name || ' ' || aa.last_name as assigned_attorney_name
      FROM clients c
      LEFT JOIN users aa ON c.assigned_attorney = aa.id
      WHERE c.id = $1 AND c.firm_id = $2
    `, [clientId, req.user.firmId]);

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Get permissions
    const permsResult = await query(`
      SELECT 
        cp.id,
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
        u.first_name || ' ' || u.last_name as user_name,
        u.email as user_email,
        g.name as group_name,
        g.color as group_color,
        grantor.first_name || ' ' || grantor.last_name as granted_by_name
      FROM client_permissions cp
      LEFT JOIN users u ON cp.user_id = u.id
      LEFT JOIN groups g ON cp.group_id = g.id
      LEFT JOIN users grantor ON cp.granted_by = grantor.id
      WHERE cp.client_id = $1 AND cp.firm_id = $2
      ORDER BY cp.granted_at DESC
    `, [clientId, req.user.firmId]);

    res.json({
      clientId,
      visibility: clientResult.rows[0].visibility,
      assignedAttorney: clientResult.rows[0].assigned_attorney,
      assignedAttorneyName: clientResult.rows[0].assigned_attorney_name,
      permissions: permsResult.rows.map(p => ({
        id: p.id,
        userId: p.user_id,
        groupId: p.group_id,
        roleSlug: p.role_slug,
        permissionLevel: p.permission_level,
        canView: p.can_view,
        canEdit: p.can_edit,
        canViewMatters: p.can_view_matters,
        canCreateMatters: p.can_create_matters,
        canViewBilling: p.can_view_billing,
        canEditBilling: p.can_edit_billing,
        canViewDocuments: p.can_view_documents,
        canShare: p.can_share,
        grantedAt: p.granted_at,
        expiresAt: p.expires_at,
        notes: p.notes,
        userName: p.user_name,
        userEmail: p.user_email,
        groupName: p.group_name,
        groupColor: p.group_color,
        grantedByName: p.granted_by_name
      }))
    });
  } catch (error) {
    console.error('Get client permissions error:', error);
    res.status(500).json({ error: 'Failed to get client permissions' });
  }
});

/**
 * PUT /api/permissions/clients/:clientId/visibility
 * Update client visibility
 */
router.put('/clients/:clientId/visibility', authenticate, requireRole('owner', 'admin', 'attorney'), async (req, res) => {
  try {
    const { clientId } = req.params;
    const { visibility } = req.body;

    if (!['firm_wide', 'restricted'].includes(visibility)) {
      return res.status(400).json({ error: 'Invalid visibility value' });
    }

    await query(`
      UPDATE clients SET visibility = $1, updated_at = NOW()
      WHERE id = $2 AND firm_id = $3
    `, [visibility, clientId, req.user.firmId]);

    res.json({ success: true, visibility });
  } catch (error) {
    console.error('Update client visibility error:', error);
    res.status(500).json({ error: 'Failed to update visibility' });
  }
});

/**
 * POST /api/permissions/clients/:clientId
 * Add permission to a client
 */
router.post('/clients/:clientId', authenticate, requireRole('owner', 'admin', 'attorney'), async (req, res) => {
  try {
    const { clientId } = req.params;
    const { userId, groupId, roleSlug, permissionLevel, ...granularPerms } = req.body;

    if (!userId && !groupId && !roleSlug) {
      return res.status(400).json({ error: 'userId, groupId, or roleSlug is required' });
    }

    const result = await query(`
      INSERT INTO client_permissions (
        client_id, firm_id, user_id, group_id, role_slug, permission_level,
        can_view, can_edit, can_view_matters, can_create_matters,
        can_view_billing, can_edit_billing, can_view_documents, can_share,
        granted_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `, [
      clientId,
      req.user.firmId,
      userId || null,
      groupId || null,
      roleSlug || null,
      permissionLevel || 'view',
      granularPerms.canView !== false,
      granularPerms.canEdit || false,
      granularPerms.canViewMatters !== false,
      granularPerms.canCreateMatters || false,
      granularPerms.canViewBilling || false,
      granularPerms.canEditBilling || false,
      granularPerms.canViewDocuments !== false,
      granularPerms.canShare || false,
      req.user.id
    ]);

    res.status(201).json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Add client permission error:', error);
    res.status(500).json({ error: 'Failed to add permission' });
  }
});

/**
 * DELETE /api/permissions/clients/:clientId/:permissionId
 * Remove a client permission
 */
router.delete('/clients/:clientId/:permissionId', authenticate, requireRole('owner', 'admin', 'attorney'), async (req, res) => {
  try {
    const { clientId, permissionId } = req.params;

    await query(`
      DELETE FROM client_permissions 
      WHERE id = $1 AND client_id = $2 AND firm_id = $3
    `, [permissionId, clientId, req.user.firmId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete client permission error:', error);
    res.status(500).json({ error: 'Failed to delete permission' });
  }
});

// ============================================
// INHERITANCE RULES
// ============================================

/**
 * GET /api/permissions/inheritance
 * Get inheritance rules for the firm
 */
router.get('/inheritance', authenticate, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const result = await query(`
      SELECT *
      FROM permission_inheritance_rules
      WHERE firm_id = $1
      ORDER BY priority DESC
    `, [req.user.firmId]);

    res.json({ rules: result.rows });
  } catch (error) {
    console.error('Get inheritance rules error:', error);
    res.status(500).json({ error: 'Failed to get inheritance rules' });
  }
});

/**
 * PUT /api/permissions/inheritance/:ruleId
 * Update an inheritance rule
 */
router.put('/inheritance/:ruleId', authenticate, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { ruleId } = req.params;
    const { inheritanceMode, cascadeDenials, isActive } = req.body;

    await query(`
      UPDATE permission_inheritance_rules
      SET 
        inheritance_mode = COALESCE($2, inheritance_mode),
        cascade_denials = COALESCE($3, cascade_denials),
        is_active = COALESCE($4, is_active),
        updated_at = NOW()
      WHERE id = $1 AND firm_id = $5
    `, [ruleId, inheritanceMode, cascadeDenials, isActive, req.user.firmId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Update inheritance rule error:', error);
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

// ============================================
// PERMISSION CHECK
// ============================================

/**
 * POST /api/permissions/check
 * Check if current user has a specific permission
 */
router.post('/check', authenticate, async (req, res) => {
  try {
    const { permission, resourceType, resourceId } = req.body;

    if (!permission) {
      return res.status(400).json({ error: 'Permission key is required' });
    }

    // Get user's role
    const userRole = req.user.role;

    // Check user overrides first
    const override = await query(`
      SELECT permission_value FROM user_permission_overrides
      WHERE user_id = $1 AND permission_key = $2
      AND (expires_at IS NULL OR expires_at > NOW())
    `, [req.user.id, permission]);

    if (override.rows.length > 0) {
      return res.json({ 
        hasPermission: override.rows[0].permission_value === 'granted',
        source: 'user_override'
      });
    }

    // Check custom role permissions
    const rolePerms = await query(`
      SELECT permission_value FROM role_permissions
      WHERE firm_id = $1 AND role_slug = $2 AND permission_key = $3
    `, [req.user.firmId, userRole, permission]);

    if (rolePerms.rows.length > 0) {
      return res.json({ 
        hasPermission: rolePerms.rows[0].permission_value === 'granted',
        source: 'role_permission'
      });
    }

    // Fall back to default permissions
    const defaults = DEFAULT_ROLE_PERMISSIONS[userRole] || [];
    const hasPermission = defaults.includes(permission);

    res.json({ 
      hasPermission,
      source: 'default'
    });
  } catch (error) {
    console.error('Permission check error:', error);
    res.status(500).json({ error: 'Failed to check permission' });
  }
});

/**
 * GET /api/permissions/effective
 * Get all effective permissions for the current user
 */
router.get('/effective', authenticate, async (req, res) => {
  try {
    const userRole = req.user.role;
    const permissions = {};

    // Get all permission definitions
    const allPerms = await query('SELECT permission_key FROM permission_definitions WHERE is_active = true');

    // Start with all denied
    for (const p of allPerms.rows) {
      permissions[p.permission_key] = { value: 'denied', source: 'default' };
    }

    // Apply default role permissions
    const defaults = DEFAULT_ROLE_PERMISSIONS[userRole] || [];
    for (const permKey of defaults) {
      permissions[permKey] = { value: 'granted', source: 'default' };
    }

    // Apply custom role permissions
    const rolePerms = await query(`
      SELECT permission_key, permission_value FROM role_permissions
      WHERE firm_id = $1 AND role_slug = $2
    `, [req.user.firmId, userRole]);

    for (const rp of rolePerms.rows) {
      permissions[rp.permission_key] = { value: rp.permission_value, source: 'role' };
    }

    // Apply user overrides
    const overrides = await query(`
      SELECT permission_key, permission_value FROM user_permission_overrides
      WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
    `, [req.user.id]);

    for (const o of overrides.rows) {
      permissions[o.permission_key] = { value: o.permission_value, source: 'override' };
    }

    res.json({
      role: userRole,
      permissions,
      grantedCount: Object.values(permissions).filter(p => p.value === 'granted').length,
      totalCount: Object.keys(permissions).length
    });
  } catch (error) {
    console.error('Get effective permissions error:', error);
    res.status(500).json({ error: 'Failed to get effective permissions' });
  }
});

export default router;
