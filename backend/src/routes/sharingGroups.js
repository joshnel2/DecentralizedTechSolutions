/**
 * Sharing Groups API
 * 
 * Flexible permission groups where members automatically share work with each other.
 * Users can create groups, add members, and control what gets shared.
 */

import { Router } from 'express';
import { query, withTransaction } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// ============================================
// SHARING GROUPS CRUD
// ============================================

/**
 * Get all sharing groups for the current user
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        sg.*,
        sgm.role as my_role,
        sgm.permission_override as my_permission_override,
        (SELECT COUNT(*) FROM sharing_group_members WHERE sharing_group_id = sg.id) as member_count,
        creator.first_name || ' ' || creator.last_name as created_by_name
      FROM sharing_groups sg
      JOIN sharing_group_members sgm ON sg.id = sgm.sharing_group_id
      LEFT JOIN users creator ON sg.created_by = creator.id
      WHERE sgm.user_id = $1 AND sg.firm_id = $2 AND sg.is_active = true
      ORDER BY sg.name
    `, [req.user.id, req.user.firmId]);

    res.json({
      groups: result.rows.map(g => ({
        id: g.id,
        name: g.name,
        description: g.description,
        color: g.color,
        icon: g.icon,
        myRole: g.my_role,
        memberCount: parseInt(g.member_count),
        shareDocuments: g.share_documents,
        shareMatters: g.share_matters,
        shareClients: g.share_clients,
        shareCalendar: g.share_calendar,
        shareTasks: g.share_tasks,
        shareTimeEntries: g.share_time_entries,
        shareNotes: g.share_notes,
        defaultPermissionLevel: g.default_permission_level,
        createdByName: g.created_by_name,
        createdAt: g.created_at,
      }))
    });
  } catch (error) {
    console.error('Get sharing groups error:', error);
    res.status(500).json({ error: 'Failed to get sharing groups' });
  }
});

/**
 * Get a specific sharing group with members
 */
router.get('/:groupId', authenticate, async (req, res) => {
  try {
    // Verify membership
    const memberCheck = await query(`
      SELECT role FROM sharing_group_members 
      WHERE sharing_group_id = $1 AND user_id = $2
    `, [req.params.groupId, req.user.id]);

    if (memberCheck.rows.length === 0 && !['owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    // Get group details
    const groupResult = await query(`
      SELECT sg.*, creator.first_name || ' ' || creator.last_name as created_by_name
      FROM sharing_groups sg
      LEFT JOIN users creator ON sg.created_by = creator.id
      WHERE sg.id = $1 AND sg.firm_id = $2
    `, [req.params.groupId, req.user.firmId]);

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const group = groupResult.rows[0];

    // Get members
    const membersResult = await query(`
      SELECT 
        sgm.*,
        u.first_name, u.last_name, u.email, u.avatar_url, u.role as user_role,
        inviter.first_name || ' ' || inviter.last_name as invited_by_name
      FROM sharing_group_members sgm
      JOIN users u ON sgm.user_id = u.id
      LEFT JOIN users inviter ON sgm.invited_by = inviter.id
      WHERE sgm.sharing_group_id = $1
      ORDER BY sgm.role DESC, u.first_name
    `, [req.params.groupId]);

    res.json({
      id: group.id,
      name: group.name,
      description: group.description,
      color: group.color,
      icon: group.icon,
      myRole: memberCheck.rows[0]?.role || 'viewer',
      settings: {
        shareDocuments: group.share_documents,
        shareMatters: group.share_matters,
        shareClients: group.share_clients,
        shareCalendar: group.share_calendar,
        shareTasks: group.share_tasks,
        shareTimeEntries: group.share_time_entries,
        shareNotes: group.share_notes,
        defaultPermissionLevel: group.default_permission_level,
        allowExternalSharing: group.allow_external_sharing,
        requireApprovalToJoin: group.require_approval_to_join,
        allowMemberInvite: group.allow_member_invite,
      },
      members: membersResult.rows.map(m => ({
        id: m.id,
        oderId: m.user_id,
        name: `${m.first_name} ${m.last_name}`,
        email: m.email,
        avatar: m.avatar_url,
        userRole: m.user_role,
        groupRole: m.role,
        permissionOverride: m.permission_override,
        canHideItems: m.can_hide_items,
        joinedAt: m.joined_at,
        invitedByName: m.invited_by_name,
      })),
      createdByName: group.created_by_name,
      createdAt: group.created_at,
    });
  } catch (error) {
    console.error('Get sharing group error:', error);
    res.status(500).json({ error: 'Failed to get sharing group' });
  }
});

/**
 * Create a new sharing group
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      name,
      description,
      color = '#3b82f6',
      icon = 'users',
      shareDocuments = true,
      shareMatters = true,
      shareClients = true,
      shareCalendar = true,
      shareTasks = true,
      shareTimeEntries = false,
      shareNotes = true,
      defaultPermissionLevel = 'view',
      allowExternalSharing = true,
      requireApprovalToJoin = false,
      allowMemberInvite = true,
      initialMembers = [], // Array of user IDs to add
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    // Check firm settings
    const firmResult = await query('SELECT sharing_settings FROM firms WHERE id = $1', [req.user.firmId]);
    const firmSettings = firmResult.rows[0]?.sharing_settings || {};
    
    if (firmSettings.allowSharingGroups === false && !['owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Sharing groups are disabled for this firm' });
    }

    // Create group
    const groupResult = await query(`
      INSERT INTO sharing_groups (
        firm_id, name, description, color, icon,
        share_documents, share_matters, share_clients, share_calendar,
        share_tasks, share_time_entries, share_notes,
        default_permission_level, allow_external_sharing,
        require_approval_to_join, allow_member_invite, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `, [
      req.user.firmId, name, description, color, icon,
      shareDocuments, shareMatters, shareClients, shareCalendar,
      shareTasks, shareTimeEntries, shareNotes,
      defaultPermissionLevel, allowExternalSharing,
      requireApprovalToJoin, allowMemberInvite, req.user.id
    ]);

    const group = groupResult.rows[0];

    // Add creator as owner
    await query(`
      INSERT INTO sharing_group_members (sharing_group_id, user_id, role, invited_by)
      VALUES ($1, $2, 'owner', $2)
    `, [group.id, req.user.id]);

    // Add initial members
    for (const userId of initialMembers) {
      if (userId !== req.user.id) {
        try {
          await query(`
            INSERT INTO sharing_group_members (sharing_group_id, user_id, role, invited_by)
            VALUES ($1, $2, 'member', $3)
          `, [group.id, userId, req.user.id]);
        } catch (e) {
          console.log(`Could not add member ${userId}:`, e.message);
        }
      }
    }

    // Log action
    await query(`
      INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
      VALUES ($1, $2, 'sharing_group.created', 'sharing_group', $3, $4)
    `, [req.user.firmId, req.user.id, group.id, JSON.stringify({ name, memberCount: initialMembers.length + 1 })]);

    res.status(201).json({
      id: group.id,
      name: group.name,
      message: `Sharing group "${name}" created successfully`
    });
  } catch (error) {
    console.error('Create sharing group error:', error);
    res.status(500).json({ error: 'Failed to create sharing group' });
  }
});

/**
 * Update sharing group settings
 */
router.put('/:groupId', authenticate, async (req, res) => {
  try {
    // Check if user is owner or admin of group
    const memberCheck = await query(`
      SELECT role FROM sharing_group_members 
      WHERE sharing_group_id = $1 AND user_id = $2
    `, [req.params.groupId, req.user.id]);

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const userGroupRole = memberCheck.rows[0].role;
    if (!['owner', 'admin'].includes(userGroupRole) && !['owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only group owners and admins can update settings' });
    }

    const {
      name,
      description,
      color,
      icon,
      shareDocuments,
      shareMatters,
      shareClients,
      shareCalendar,
      shareTasks,
      shareTimeEntries,
      shareNotes,
      defaultPermissionLevel,
      allowExternalSharing,
      requireApprovalToJoin,
      allowMemberInvite,
    } = req.body;

    const result = await query(`
      UPDATE sharing_groups SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        color = COALESCE($3, color),
        icon = COALESCE($4, icon),
        share_documents = COALESCE($5, share_documents),
        share_matters = COALESCE($6, share_matters),
        share_clients = COALESCE($7, share_clients),
        share_calendar = COALESCE($8, share_calendar),
        share_tasks = COALESCE($9, share_tasks),
        share_time_entries = COALESCE($10, share_time_entries),
        share_notes = COALESCE($11, share_notes),
        default_permission_level = COALESCE($12, default_permission_level),
        allow_external_sharing = COALESCE($13, allow_external_sharing),
        require_approval_to_join = COALESCE($14, require_approval_to_join),
        allow_member_invite = COALESCE($15, allow_member_invite),
        updated_at = NOW()
      WHERE id = $16 AND firm_id = $17
      RETURNING *
    `, [
      name, description, color, icon,
      shareDocuments, shareMatters, shareClients, shareCalendar,
      shareTasks, shareTimeEntries, shareNotes,
      defaultPermissionLevel, allowExternalSharing,
      requireApprovalToJoin, allowMemberInvite,
      req.params.groupId, req.user.firmId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json({ success: true, message: 'Group settings updated' });
  } catch (error) {
    console.error('Update sharing group error:', error);
    res.status(500).json({ error: 'Failed to update sharing group' });
  }
});

/**
 * Delete/deactivate a sharing group
 */
router.delete('/:groupId', authenticate, async (req, res) => {
  try {
    // Only owner can delete
    const memberCheck = await query(`
      SELECT role FROM sharing_group_members 
      WHERE sharing_group_id = $1 AND user_id = $2
    `, [req.params.groupId, req.user.id]);

    if (memberCheck.rows[0]?.role !== 'owner' && !['owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only the group owner can delete this group' });
    }

    await query(`
      UPDATE sharing_groups SET is_active = false, updated_at = NOW()
      WHERE id = $1 AND firm_id = $2
    `, [req.params.groupId, req.user.firmId]);

    res.json({ success: true, message: 'Sharing group deleted' });
  } catch (error) {
    console.error('Delete sharing group error:', error);
    res.status(500).json({ error: 'Failed to delete sharing group' });
  }
});

// ============================================
// MEMBER MANAGEMENT
// ============================================

/**
 * Add members to a sharing group
 */
router.post('/:groupId/members', authenticate, async (req, res) => {
  try {
    const { userIds, role = 'member' } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs array is required' });
    }

    // Check if user can add members
    const memberCheck = await query(`
      SELECT sgm.role, sg.allow_member_invite
      FROM sharing_group_members sgm
      JOIN sharing_groups sg ON sgm.sharing_group_id = sg.id
      WHERE sgm.sharing_group_id = $1 AND sgm.user_id = $2
    `, [req.params.groupId, req.user.id]);

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const { role: userRole, allow_member_invite } = memberCheck.rows[0];
    const canInvite = ['owner', 'admin'].includes(userRole) || allow_member_invite;

    if (!canInvite && !['owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'You cannot add members to this group' });
    }

    // Can only add admin role if user is owner
    const addRole = role === 'admin' && userRole !== 'owner' ? 'member' : role;

    const added = [];
    for (const userId of userIds) {
      try {
        // Verify user is in same firm
        const userCheck = await query('SELECT id FROM users WHERE id = $1 AND firm_id = $2', [userId, req.user.firmId]);
        if (userCheck.rows.length === 0) continue;

        await query(`
          INSERT INTO sharing_group_members (sharing_group_id, user_id, role, invited_by)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (sharing_group_id, user_id) DO NOTHING
        `, [req.params.groupId, userId, addRole, req.user.id]);
        added.push(userId);
      } catch (e) {
        console.log(`Could not add member ${userId}:`, e.message);
      }
    }

    res.json({ success: true, addedCount: added.length, addedUserIds: added });
  } catch (error) {
    console.error('Add members error:', error);
    res.status(500).json({ error: 'Failed to add members' });
  }
});

/**
 * Update a member's role or permissions
 */
router.put('/:groupId/members/:userId', authenticate, async (req, res) => {
  try {
    const { role, permissionOverride, canHideItems } = req.body;

    // Check if user is owner or admin
    const memberCheck = await query(`
      SELECT role FROM sharing_group_members 
      WHERE sharing_group_id = $1 AND user_id = $2
    `, [req.params.groupId, req.user.id]);

    if (!['owner', 'admin'].includes(memberCheck.rows[0]?.role) && !['owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only group owners and admins can update members' });
    }

    // Can't change owner role unless you're the owner
    if (role === 'owner' && memberCheck.rows[0]?.role !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can transfer ownership' });
    }

    await query(`
      UPDATE sharing_group_members SET
        role = COALESCE($1, role),
        permission_override = COALESCE($2, permission_override),
        can_hide_items = COALESCE($3, can_hide_items)
      WHERE sharing_group_id = $4 AND user_id = $5
    `, [role, permissionOverride, canHideItems, req.params.groupId, req.params.userId]);

    res.json({ success: true, message: 'Member updated' });
  } catch (error) {
    console.error('Update member error:', error);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

/**
 * Remove a member from a sharing group
 */
router.delete('/:groupId/members/:userId', authenticate, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const isLeavingGroup = targetUserId === req.user.id;

    if (!isLeavingGroup) {
      // Check if user can remove others
      const memberCheck = await query(`
        SELECT role FROM sharing_group_members 
        WHERE sharing_group_id = $1 AND user_id = $2
      `, [req.params.groupId, req.user.id]);

      if (!['owner', 'admin'].includes(memberCheck.rows[0]?.role) && !['owner', 'admin'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Only group owners and admins can remove members' });
      }
    }

    // Can't remove the owner
    const targetCheck = await query(`
      SELECT role FROM sharing_group_members 
      WHERE sharing_group_id = $1 AND user_id = $2
    `, [req.params.groupId, targetUserId]);

    if (targetCheck.rows[0]?.role === 'owner') {
      return res.status(400).json({ error: 'Cannot remove the group owner. Transfer ownership first.' });
    }

    await query(`
      DELETE FROM sharing_group_members 
      WHERE sharing_group_id = $1 AND user_id = $2
    `, [req.params.groupId, targetUserId]);

    res.json({ success: true, message: isLeavingGroup ? 'Left group' : 'Member removed' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// ============================================
// ITEM HIDING (OPT-OUT)
// ============================================

/**
 * Hide an item from being shared with a group
 */
router.post('/:groupId/hide', authenticate, async (req, res) => {
  try {
    const { itemType, itemId, reason } = req.body;

    if (!itemType || !itemId) {
      return res.status(400).json({ error: 'itemType and itemId are required' });
    }

    // Verify membership
    const memberCheck = await query(`
      SELECT can_hide_items FROM sharing_group_members 
      WHERE sharing_group_id = $1 AND user_id = $2
    `, [req.params.groupId, req.user.id]);

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    if (!memberCheck.rows[0].can_hide_items) {
      return res.status(403).json({ error: 'You cannot hide items from this group' });
    }

    await query(`
      INSERT INTO sharing_group_hidden_items (sharing_group_id, user_id, item_type, item_id, reason)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (sharing_group_id, user_id, item_type, item_id) DO UPDATE SET reason = $5
    `, [req.params.groupId, req.user.id, itemType, itemId, reason]);

    res.json({ success: true, message: 'Item hidden from group' });
  } catch (error) {
    console.error('Hide item error:', error);
    res.status(500).json({ error: 'Failed to hide item' });
  }
});

/**
 * Unhide an item
 */
router.delete('/:groupId/hide/:itemType/:itemId', authenticate, async (req, res) => {
  try {
    await query(`
      DELETE FROM sharing_group_hidden_items 
      WHERE sharing_group_id = $1 AND user_id = $2 AND item_type = $3 AND item_id = $4
    `, [req.params.groupId, req.user.id, req.params.itemType, req.params.itemId]);

    res.json({ success: true, message: 'Item unhidden' });
  } catch (error) {
    console.error('Unhide item error:', error);
    res.status(500).json({ error: 'Failed to unhide item' });
  }
});

// ============================================
// USER SHARING PREFERENCES
// ============================================

/**
 * Get user's sharing preferences
 */
router.get('/preferences/my', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM user_sharing_preferences WHERE user_id = $1
    `, [req.user.id]);

    if (result.rows.length === 0) {
      // Return defaults
      return res.json({
        autoShareDocuments: true,
        autoShareMatters: false,
        autoShareCalendar: true,
        autoShareTasks: true,
        autoShareNotes: true,
        defaultDocumentPrivacy: 'team',
        defaultMatterVisibility: 'restricted',
        notifyOnShareAccess: false,
        notifyOnGroupActivity: true,
        quickShareUsers: [],
      });
    }

    const p = result.rows[0];
    res.json({
      autoShareDocuments: p.auto_share_documents,
      autoShareMatters: p.auto_share_matters,
      autoShareCalendar: p.auto_share_calendar,
      autoShareTasks: p.auto_share_tasks,
      autoShareNotes: p.auto_share_notes,
      defaultDocumentPrivacy: p.default_document_privacy,
      defaultMatterVisibility: p.default_matter_visibility,
      notifyOnShareAccess: p.notify_on_share_access,
      notifyOnGroupActivity: p.notify_on_group_activity,
      quickShareUsers: p.quick_share_users || [],
    });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

/**
 * Update user's sharing preferences
 */
router.put('/preferences/my', authenticate, async (req, res) => {
  try {
    const {
      autoShareDocuments,
      autoShareMatters,
      autoShareCalendar,
      autoShareTasks,
      autoShareNotes,
      defaultDocumentPrivacy,
      defaultMatterVisibility,
      notifyOnShareAccess,
      notifyOnGroupActivity,
      quickShareUsers,
    } = req.body;

    await query(`
      INSERT INTO user_sharing_preferences (
        user_id, firm_id,
        auto_share_documents, auto_share_matters, auto_share_calendar,
        auto_share_tasks, auto_share_notes,
        default_document_privacy, default_matter_visibility,
        notify_on_share_access, notify_on_group_activity, quick_share_users
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (user_id) DO UPDATE SET
        auto_share_documents = COALESCE($3, user_sharing_preferences.auto_share_documents),
        auto_share_matters = COALESCE($4, user_sharing_preferences.auto_share_matters),
        auto_share_calendar = COALESCE($5, user_sharing_preferences.auto_share_calendar),
        auto_share_tasks = COALESCE($6, user_sharing_preferences.auto_share_tasks),
        auto_share_notes = COALESCE($7, user_sharing_preferences.auto_share_notes),
        default_document_privacy = COALESCE($8, user_sharing_preferences.default_document_privacy),
        default_matter_visibility = COALESCE($9, user_sharing_preferences.default_matter_visibility),
        notify_on_share_access = COALESCE($10, user_sharing_preferences.notify_on_share_access),
        notify_on_group_activity = COALESCE($11, user_sharing_preferences.notify_on_group_activity),
        quick_share_users = COALESCE($12, user_sharing_preferences.quick_share_users),
        updated_at = NOW()
    `, [
      req.user.id, req.user.firmId,
      autoShareDocuments, autoShareMatters, autoShareCalendar,
      autoShareTasks, autoShareNotes,
      defaultDocumentPrivacy, defaultMatterVisibility,
      notifyOnShareAccess, notifyOnGroupActivity, quickShareUsers
    ]);

    res.json({ success: true, message: 'Preferences updated' });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// ============================================
// FIRM SHARING SETTINGS (Admin only)
// ============================================

/**
 * Get firm's sharing settings
 */
router.get('/settings/firm', authenticate, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const result = await query('SELECT sharing_settings FROM firms WHERE id = $1', [req.user.firmId]);
    
    const defaults = {
      allowSharingGroups: true,
      allowUserToUserSharing: true,
      allowExternalSharing: false,
      requireApprovalForExternalShare: true,
      defaultDocumentPrivacy: 'team',
      defaultMatterVisibility: 'restricted',
      maxSharingGroupSize: 50,
      allowTimeEntrySharing: false,
      enforceMatterPermissions: true,
    };

    res.json({ ...defaults, ...(result.rows[0]?.sharing_settings || {}) });
  } catch (error) {
    console.error('Get firm settings error:', error);
    res.status(500).json({ error: 'Failed to get firm settings' });
  }
});

/**
 * Update firm's sharing settings
 */
router.put('/settings/firm', authenticate, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const currentResult = await query('SELECT sharing_settings FROM firms WHERE id = $1', [req.user.firmId]);
    const current = currentResult.rows[0]?.sharing_settings || {};

    const updated = { ...current, ...req.body };

    await query(`
      UPDATE firms SET sharing_settings = $1, updated_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(updated), req.user.firmId]);

    // Log action
    await query(`
      INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
      VALUES ($1, $2, 'firm.sharing_settings_updated', 'firm', $1, $3)
    `, [req.user.firmId, req.user.id, JSON.stringify({ changes: req.body })]);

    res.json({ success: true, message: 'Firm sharing settings updated' });
  } catch (error) {
    console.error('Update firm settings error:', error);
    res.status(500).json({ error: 'Failed to update firm settings' });
  }
});

// ============================================
// QUICK SHARE
// ============================================

/**
 * Quick share an item with specific users
 */
router.post('/quick-share', authenticate, async (req, res) => {
  try {
    const { itemType, itemId, userIds, permissionLevel = 'view' } = req.body;

    if (!itemType || !itemId || !userIds || !Array.isArray(userIds)) {
      return res.status(400).json({ error: 'itemType, itemId, and userIds array are required' });
    }

    const sharedWith = [];

    for (const userId of userIds) {
      try {
        // Verify user is in same firm
        const userCheck = await query('SELECT id FROM users WHERE id = $1 AND firm_id = $2', [userId, req.user.firmId]);
        if (userCheck.rows.length === 0) continue;

        // Create permission based on item type
        if (itemType === 'document') {
          await query(`
            INSERT INTO document_permissions (
              document_id, firm_id, user_id, permission_level,
              can_view, can_download, can_edit, can_share, created_by
            ) VALUES ($1, $2, $3, $4, true, true, $5, false, $6)
            ON CONFLICT DO NOTHING
          `, [itemId, req.user.firmId, userId, permissionLevel, permissionLevel !== 'view', req.user.id]);
        } else if (itemType === 'matter') {
          await query(`
            INSERT INTO matter_permissions (
              matter_id, user_id, permission_level, can_view_documents, can_view_notes, can_edit, granted_by
            ) VALUES ($1, $2, $3, true, true, $4, $5)
            ON CONFLICT DO NOTHING
          `, [itemId, userId, permissionLevel, permissionLevel !== 'view', req.user.id]);
        }

        sharedWith.push(userId);
      } catch (e) {
        console.log(`Could not share with ${userId}:`, e.message);
      }
    }

    res.json({ 
      success: true, 
      sharedWithCount: sharedWith.length,
      message: `Shared with ${sharedWith.length} user(s)`
    });
  } catch (error) {
    console.error('Quick share error:', error);
    res.status(500).json({ error: 'Failed to share' });
  }
});

/**
 * Get users for quick share picker
 */
router.get('/users/available', authenticate, async (req, res) => {
  try {
    const { search, excludeGroupId } = req.query;

    let sql = `
      SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url, u.role
      FROM users u
      WHERE u.firm_id = $1 AND u.is_active = true AND u.id != $2
    `;
    const params = [req.user.firmId, req.user.id];
    let paramIdx = 3;

    if (search) {
      sql += ` AND (u.first_name ILIKE $${paramIdx} OR u.last_name ILIKE $${paramIdx} OR u.email ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (excludeGroupId) {
      sql += ` AND u.id NOT IN (SELECT user_id FROM sharing_group_members WHERE sharing_group_id = $${paramIdx})`;
      params.push(excludeGroupId);
      paramIdx++;
    }

    sql += ` ORDER BY u.first_name, u.last_name LIMIT 50`;

    const result = await query(sql, params);

    res.json({
      users: result.rows.map(u => ({
        id: u.id,
        name: `${u.first_name} ${u.last_name}`,
        email: u.email,
        avatar: u.avatar_url,
        role: u.role,
      }))
    });
  } catch (error) {
    console.error('Get available users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

export default router;
