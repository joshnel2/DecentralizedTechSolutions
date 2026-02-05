/**
 * Matter Permissions API Routes
 * Manages visibility settings and access permissions for matters
 */

import { Router } from 'express';
import { query, withTransaction } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { 
  canAccessMatter, 
  getMatterAccessList, 
  FULL_ACCESS_ROLES 
} from '../middleware/matterPermissions.js';

const router = Router();

// Maximum users/groups that can be added to a restricted matter
const MAX_PERMISSIONS_PER_MATTER = 20;

/**
 * GET /api/matters/:matterId/permissions
 * Get all permissions for a matter
 */
router.get('/:matterId/permissions', authenticate, async (req, res) => {
  try {
    const { matterId } = req.params;
    
    // Check if user can access this matter
    const access = await canAccessMatter(
      req.user.id, 
      req.user.role, 
      matterId, 
      req.user.firmId
    );
    
    if (!access.hasAccess) {
      return res.status(403).json({ error: 'Access denied to this matter' });
    }

    // Get matter visibility info
    const matterResult = await query(`
      SELECT 
        m.visibility,
        m.responsible_attorney,
        m.originating_attorney,
        ra.first_name || ' ' || ra.last_name as responsible_attorney_name,
        oa.first_name || ' ' || oa.last_name as originating_attorney_name
      FROM matters m
      LEFT JOIN users ra ON m.responsible_attorney = ra.id
      LEFT JOIN users oa ON m.originating_attorney = oa.id
      WHERE m.id = $1 AND m.firm_id = $2
    `, [matterId, req.user.firmId]);

    if (matterResult.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }

    const matter = matterResult.rows[0];
    
    // Get detailed permission list
    const permissions = await getMatterAccessList(matterId, req.user.firmId);

    // Check if current user can manage permissions
    const canManage = FULL_ACCESS_ROLES.includes(req.user.role) || 
                      matter.responsible_attorney === req.user.id;

    res.json({
      matterId,
      visibility: matter.visibility,
      responsibleAttorney: matter.responsible_attorney,
      responsibleAttorneyName: matter.responsible_attorney_name,
      originatingAttorney: matter.originating_attorney,
      originatingAttorneyName: matter.originating_attorney_name,
      permissions,
      permissionCount: permissions.length,
      maxPermissions: MAX_PERMISSIONS_PER_MATTER,
      canManagePermissions: canManage
    });
  } catch (error) {
    console.error('Get matter permissions error:', error);
    res.status(500).json({ error: 'Failed to get matter permissions' });
  }
});

/**
 * PUT /api/matters/:matterId/visibility
 * Update matter visibility (firm_wide or restricted)
 */
router.put('/:matterId/visibility', authenticate, async (req, res) => {
  try {
    const { matterId } = req.params;
    const { visibility } = req.body;

    if (!['firm_wide', 'restricted'].includes(visibility)) {
      return res.status(400).json({ error: 'Invalid visibility value' });
    }

    // Check permission to manage this matter
    const matterResult = await query(`
      SELECT responsible_attorney, visibility FROM matters 
      WHERE id = $1 AND firm_id = $2
    `, [matterId, req.user.firmId]);

    if (matterResult.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }

    const matter = matterResult.rows[0];
    
    // Only admin/owner/billing or responsible attorney can change visibility
    const canChange = FULL_ACCESS_ROLES.includes(req.user.role) || 
                      matter.responsible_attorney === req.user.id;

    if (!canChange) {
      return res.status(403).json({ error: 'Not authorized to change matter visibility' });
    }

    // Update visibility
    await query(`
      UPDATE matters SET visibility = $1, updated_at = NOW() WHERE id = $2
    `, [visibility, matterId]);

    // Log the change
    await query(`
      INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
      VALUES ($1, $2, 'matter.visibility_changed', 'matter', $3, $4)
    `, [
      req.user.firmId, 
      req.user.id, 
      matterId, 
      JSON.stringify({ 
        from: matter.visibility, 
        to: visibility 
      })
    ]);

    res.json({ 
      success: true, 
      visibility,
      message: `Matter visibility changed to ${visibility === 'firm_wide' ? 'Firm Wide' : 'Restricted'}`
    });
  } catch (error) {
    console.error('Update visibility error:', error);
    res.status(500).json({ error: 'Failed to update visibility' });
  }
});

/**
 * POST /api/matters/:matterId/permissions
 * Add a user or group permission to a matter
 */
router.post('/:matterId/permissions', authenticate, async (req, res) => {
  try {
    const { matterId } = req.params;
    const { 
      userId, 
      groupId, 
      permissionLevel = 'view',
      canViewDocuments = true,
      canViewNotes = true,
      canEdit = false
    } = req.body;

    // Validate input
    if (!userId && !groupId) {
      return res.status(400).json({ error: 'Either userId or groupId is required' });
    }
    if (userId && groupId) {
      return res.status(400).json({ error: 'Cannot specify both userId and groupId' });
    }

    // Check permission to manage this matter
    const matterResult = await query(`
      SELECT responsible_attorney, visibility FROM matters 
      WHERE id = $1 AND firm_id = $2
    `, [matterId, req.user.firmId]);

    if (matterResult.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }

    const matter = matterResult.rows[0];
    
    const canManage = FULL_ACCESS_ROLES.includes(req.user.role) || 
                      matter.responsible_attorney === req.user.id;

    if (!canManage) {
      return res.status(403).json({ error: 'Not authorized to manage matter permissions' });
    }

    // Check current permission count
    const countResult = await query(`
      SELECT COUNT(*) FROM matter_permissions WHERE matter_id = $1
    `, [matterId]);

    if (parseInt(countResult.rows[0].count) >= MAX_PERMISSIONS_PER_MATTER) {
      return res.status(400).json({ 
        error: `Maximum ${MAX_PERMISSIONS_PER_MATTER} permissions per matter reached` 
      });
    }

    // Verify the user/group exists and belongs to the same firm
    if (userId) {
      const userCheck = await query(
        'SELECT id FROM users WHERE id = $1 AND firm_id = $2',
        [userId, req.user.firmId]
      );
      if (userCheck.rows.length === 0) {
        return res.status(400).json({ error: 'User not found in your firm' });
      }
    }

    if (groupId) {
      const groupCheck = await query(
        'SELECT id FROM groups WHERE id = $1 AND firm_id = $2',
        [groupId, req.user.firmId]
      );
      if (groupCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Group not found in your firm' });
      }
    }

    // Add permission (upsert)
    const result = await query(`
      INSERT INTO matter_permissions (
        matter_id, user_id, group_id, permission_level, 
        can_view_documents, can_view_notes, can_edit, granted_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (matter_id, user_id) WHERE user_id IS NOT NULL
      DO UPDATE SET 
        permission_level = $4,
        can_view_documents = $5,
        can_view_notes = $6,
        can_edit = $7,
        granted_by = $8,
        granted_at = NOW()
      RETURNING id
    `, [
      matterId, 
      userId || null, 
      groupId || null, 
      permissionLevel,
      canViewDocuments,
      canViewNotes,
      canEdit,
      req.user.id
    ]);

    // If matter is still firm_wide, change to restricted
    if (matter.visibility === 'firm_wide') {
      await query(`
        UPDATE matters SET visibility = 'restricted', updated_at = NOW() WHERE id = $1
      `, [matterId]);
    }

    // Log the action
    await query(`
      INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
      VALUES ($1, $2, 'matter.permission_added', 'matter', $3, $4)
    `, [
      req.user.firmId,
      req.user.id,
      matterId,
      JSON.stringify({ userId, groupId, permissionLevel })
    ]);

    res.status(201).json({ 
      success: true, 
      permissionId: result.rows[0].id,
      message: 'Permission added successfully'
    });
  } catch (error) {
    console.error('Add permission error:', error);
    if (error.code === '23505') { // Unique constraint violation
      res.status(400).json({ error: 'Permission already exists for this user/group' });
    } else {
      res.status(500).json({ error: 'Failed to add permission' });
    }
  }
});

/**
 * DELETE /api/matters/:matterId/permissions/:permissionId
 * Remove a permission from a matter
 */
router.delete('/:matterId/permissions/:permissionId', authenticate, async (req, res) => {
  try {
    const { matterId, permissionId } = req.params;

    // Check permission to manage this matter
    const matterResult = await query(`
      SELECT responsible_attorney FROM matters 
      WHERE id = $1 AND firm_id = $2
    `, [matterId, req.user.firmId]);

    if (matterResult.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }

    const canManage = FULL_ACCESS_ROLES.includes(req.user.role) || 
                      matterResult.rows[0].responsible_attorney === req.user.id;

    if (!canManage) {
      return res.status(403).json({ error: 'Not authorized to manage matter permissions' });
    }

    // Delete the permission
    const result = await query(`
      DELETE FROM matter_permissions 
      WHERE id = $1 AND matter_id = $2
      RETURNING user_id, group_id
    `, [permissionId, matterId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Permission not found' });
    }

    // Log the action
    await query(`
      INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
      VALUES ($1, $2, 'matter.permission_removed', 'matter', $3, $4)
    `, [
      req.user.firmId,
      req.user.id,
      matterId,
      JSON.stringify({ 
        permissionId,
        userId: result.rows[0].user_id,
        groupId: result.rows[0].group_id
      })
    ]);

    res.json({ success: true, message: 'Permission removed successfully' });
  } catch (error) {
    console.error('Remove permission error:', error);
    res.status(500).json({ error: 'Failed to remove permission' });
  }
});

/**
 * POST /api/matters/bulk-permissions
 * Bulk update permissions for multiple matters (Admin only)
 */
router.post('/bulk-permissions', authenticate, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { matterIds, action, userId, groupId, visibility, permissionLevel = 'view' } = req.body;

    if (!Array.isArray(matterIds) || matterIds.length === 0) {
      return res.status(400).json({ error: 'matterIds array is required' });
    }

    if (matterIds.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 matters per bulk operation' });
    }

    // Verify all matters belong to the firm
    const verifyResult = await query(`
      SELECT id FROM matters WHERE id = ANY($1) AND firm_id = $2
    `, [matterIds, req.user.firmId]);

    if (verifyResult.rows.length !== matterIds.length) {
      return res.status(400).json({ error: 'Some matters not found or not in your firm' });
    }

    const results = { success: 0, failed: 0, errors: [] };

    await withTransaction(async (client) => {
      for (const matterId of matterIds) {
        try {
          // Update visibility if provided
          if (visibility) {
            await client.query(`
              UPDATE matters SET visibility = $1, updated_at = NOW() WHERE id = $2
            `, [visibility, matterId]);
          }

          // Add permission if user/group provided
          if (action === 'add' && (userId || groupId)) {
            // Check permission count
            const countResult = await client.query(`
              SELECT COUNT(*) FROM matter_permissions WHERE matter_id = $1
            `, [matterId]);

            if (parseInt(countResult.rows[0].count) < MAX_PERMISSIONS_PER_MATTER) {
              await client.query(`
                INSERT INTO matter_permissions (matter_id, user_id, group_id, permission_level, granted_by)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (matter_id, user_id) WHERE user_id IS NOT NULL DO NOTHING
              `, [matterId, userId || null, groupId || null, permissionLevel, req.user.id]);
            }
          }

          // Remove permission if action is remove
          if (action === 'remove' && (userId || groupId)) {
            if (userId) {
              await client.query(`
                DELETE FROM matter_permissions WHERE matter_id = $1 AND user_id = $2
              `, [matterId, userId]);
            }
            if (groupId) {
              await client.query(`
                DELETE FROM matter_permissions WHERE matter_id = $1 AND group_id = $2
              `, [matterId, groupId]);
            }
          }

          results.success++;
        } catch (err) {
          results.failed++;
          results.errors.push({ matterId, error: err.message });
        }
      }
    });

    // Log the bulk action
    await query(`
      INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
      VALUES ($1, $2, 'matter.bulk_permissions', 'matter', $3, $4)
    `, [
      req.user.firmId,
      req.user.id,
      null,
      JSON.stringify({ 
        matterCount: matterIds.length,
        action,
        visibility,
        userId,
        groupId,
        results
      })
    ]);

    res.json({
      success: true,
      message: `Bulk permissions updated: ${results.success} succeeded, ${results.failed} failed`,
      results
    });
  } catch (error) {
    console.error('Bulk permissions error:', error);
    res.status(500).json({ error: 'Failed to update bulk permissions' });
  }
});

/**
 * GET /api/matters/permissions/users
 * Get list of users available for permission assignment (for user picker)
 */
router.get('/permissions/users', authenticate, async (req, res) => {
  try {
    const { search, excludeMatterId } = req.query;

    let sql = `
      SELECT 
        u.id, 
        u.first_name, 
        u.last_name, 
        u.email, 
        u.role,
        u.avatar_url
      FROM users u
      WHERE u.firm_id = $1 AND u.is_active = true
    `;
    const params = [req.user.firmId];
    let paramIndex = 2;

    if (search) {
      sql += ` AND (
        u.first_name ILIKE $${paramIndex} OR 
        u.last_name ILIKE $${paramIndex} OR 
        u.email ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (excludeMatterId) {
      sql += ` AND u.id NOT IN (
        SELECT user_id FROM matter_permissions WHERE matter_id = $${paramIndex} AND user_id IS NOT NULL
      )`;
      params.push(excludeMatterId);
      paramIndex++;
    }

    sql += ` ORDER BY u.first_name, u.last_name LIMIT 50`;

    const result = await query(sql, params);

    res.json({
      users: result.rows.map(u => ({
        id: u.id,
        name: `${u.first_name} ${u.last_name}`,
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        role: u.role,
        avatar: u.avatar_url
      }))
    });
  } catch (error) {
    console.error('Get users for permissions error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

/**
 * GET /api/matters/permissions/groups
 * Get list of groups available for permission assignment
 */
router.get('/permissions/groups', authenticate, async (req, res) => {
  try {
    const { excludeMatterId } = req.query;

    let sql = `
      SELECT 
        g.id, 
        g.name, 
        g.description,
        g.color,
        (SELECT COUNT(*) FROM user_groups ug WHERE ug.group_id = g.id) as member_count
      FROM groups g
      WHERE g.firm_id = $1
    `;
    const params = [req.user.firmId];

    if (excludeMatterId) {
      sql += ` AND g.id NOT IN (
        SELECT group_id FROM matter_permissions WHERE matter_id = $2 AND group_id IS NOT NULL
      )`;
      params.push(excludeMatterId);
    }

    sql += ` ORDER BY g.name`;

    const result = await query(sql, params);

    res.json({
      groups: result.rows.map(g => ({
        id: g.id,
        name: g.name,
        description: g.description,
        color: g.color,
        memberCount: parseInt(g.member_count)
      }))
    });
  } catch (error) {
    console.error('Get groups for permissions error:', error);
    res.status(500).json({ error: 'Failed to get groups' });
  }
});

export default router;
