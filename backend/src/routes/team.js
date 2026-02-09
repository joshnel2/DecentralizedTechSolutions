import { Router } from 'express';
import { query, withTransaction } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { hashPassword, generateSecureToken, hashToken, getPermissionsForRole } from '../utils/auth.js';

const router = Router();

// Get attorneys/team members for matter assignment (all authenticated users can access)
router.get('/attorneys', authenticate, async (req, res) => {
  try {
    // All authenticated users can get the attorney/team list for matter assignment
    // This is needed for editing matters, assigning responsible/originating attorneys
    const result = await query(
      `SELECT id, email, first_name, last_name, role, hourly_rate, is_active
       FROM users
       WHERE firm_id = $1 AND is_active = true
       ORDER BY first_name, last_name`,
      [req.user.firmId]
    );

    res.json({
      attorneys: result.rows.map(u => ({
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
        role: u.role,
        hourlyRate: parseFloat(u.hourly_rate) || 0,
        isActive: u.is_active,
      })),
    });
  } catch (error) {
    console.error('Get attorneys error:', error);
    res.status(500).json({ error: 'Failed to get attorneys' });
  }
});

// Get team members
router.get('/', authenticate, requirePermission('users:manage'), async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.phone,
              u.avatar_url, u.hourly_rate, u.is_active, u.two_factor_enabled,
              u.created_at, u.last_login_at,
              array_agg(DISTINCT ug.group_id) FILTER (WHERE ug.group_id IS NOT NULL) as group_ids
       FROM users u
       LEFT JOIN user_groups ug ON u.id = ug.user_id
       WHERE u.firm_id = $1
       GROUP BY u.id
       ORDER BY u.created_at`,
      [req.user.firmId]
    );

    res.json({
      teamMembers: result.rows.map(u => ({
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        role: u.role,
        phone: u.phone,
        avatarUrl: u.avatar_url,
        hourlyRate: u.hourly_rate,
        isActive: u.is_active,
        twoFactorEnabled: u.two_factor_enabled,
        groupIds: u.group_ids || [],
        permissions: getPermissionsForRole(u.role),
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at,
      })),
    });
  } catch (error) {
    console.error('Get team members error:', error);
    res.status(500).json({ error: 'Failed to get team members' });
  }
});

// Update team member
router.put('/:id', authenticate, requirePermission('users:manage'), async (req, res) => {
  try {
    // Can't edit yourself through this endpoint (use /auth/me)
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Use /auth/me to update your own profile' });
    }

    const existing = await query(
      'SELECT id, role FROM users WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only owners can change roles to/from owner
    const targetUser = existing.rows[0];
    if ((targetUser.role === 'owner' || req.body.role === 'owner') && req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can modify owner accounts' });
    }

    const { role, isActive, hourlyRate, phone, groupIds } = req.body;

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE users SET
          role = COALESCE($1, role),
          is_active = COALESCE($2, is_active),
          hourly_rate = COALESCE($3, hourly_rate),
          phone = COALESCE($4, phone)
        WHERE id = $5`,
        [role, isActive, hourlyRate, phone, req.params.id]
      );

      // Update group memberships if provided
      if (groupIds !== undefined) {
        await client.query('DELETE FROM user_groups WHERE user_id = $1', [req.params.id]);
        for (const groupId of groupIds) {
          await client.query(
            'INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [req.params.id, groupId]
          );
        }
      }
    });

    // Log action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'user.updated', 'user', $3, $4)`,
      [req.user.firmId, req.user.id, req.params.id, JSON.stringify({ role, isActive })]
    );

    res.json({ message: 'Team member updated' });
  } catch (error) {
    console.error('Update team member error:', error);
    res.status(500).json({ error: 'Failed to update team member' });
  }
});

// Remove team member
router.delete('/:id', authenticate, requirePermission('users:delete'), async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot remove yourself' });
    }

    const existing = await query(
      'SELECT id, role FROM users WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (existing.rows[0].role === 'owner' && req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Cannot remove owner account' });
    }

    // Soft delete - just deactivate
    await query('UPDATE users SET is_active = false WHERE id = $1', [req.params.id]);

    // Delete sessions
    await query('DELETE FROM user_sessions WHERE user_id = $1', [req.params.id]);

    // Log action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id)
       VALUES ($1, $2, 'user.removed', 'user', $3)`,
      [req.user.firmId, req.user.id, req.params.id]
    );

    res.json({ message: 'Team member removed' });
  } catch (error) {
    console.error('Remove team member error:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

// Get invitations
router.get('/invitations', authenticate, requirePermission('users:invite'), async (req, res) => {
  try {
    const result = await query(
      `SELECT i.*, u.first_name || ' ' || u.last_name as invited_by_name
       FROM invitations i
       LEFT JOIN users u ON i.invited_by = u.id
       WHERE i.firm_id = $1
       ORDER BY i.created_at DESC`,
      [req.user.firmId]
    );

    res.json({
      invitations: result.rows.map(i => ({
        id: i.id,
        email: i.email,
        firstName: i.first_name,
        lastName: i.last_name,
        role: i.role,
        status: i.status,
        invitedBy: i.invited_by,
        invitedByName: i.invited_by_name,
        expiresAt: i.expires_at,
        createdAt: i.created_at,
      })),
    });
  } catch (error) {
    console.error('Get invitations error:', error);
    res.status(500).json({ error: 'Failed to get invitations' });
  }
});

// Invite user
router.post('/invitations', authenticate, requirePermission('users:invite'), async (req, res) => {
  try {
    const { email, firstName, lastName, role = 'staff' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if email already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Check for pending invitation
    const existingInvite = await query(
      `SELECT id FROM invitations WHERE email = $1 AND firm_id = $2 AND status = 'pending'`,
      [email.toLowerCase(), req.user.firmId]
    );

    if (existingInvite.rows.length > 0) {
      return res.status(400).json({ error: 'Invitation already pending for this email' });
    }

    // Only owners can invite as owner
    if (role === 'owner' && req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can invite new owners' });
    }

    const token = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const result = await query(
      `INSERT INTO invitations (
        firm_id, email, first_name, last_name, role, token_hash, invited_by, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, email, first_name, last_name, role, status, expires_at, created_at`,
      [
        req.user.firmId, email.toLowerCase(), firstName, lastName, role,
        hashToken(token), req.user.id, expiresAt
      ]
    );

    const invitation = result.rows[0];

    // Log action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'user.invited', 'invitation', $3, $4)`,
      [req.user.firmId, req.user.id, invitation.id, JSON.stringify({ email, role })]
    );

    // In production, the invitation link should be sent via email, not returned in the response
    const responseData = {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        firstName: invitation.first_name,
        lastName: invitation.last_name,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expires_at,
        createdAt: invitation.created_at,
      },
    };

    // Only include invite link in development mode
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev') {
      responseData.inviteLink = `${process.env.FRONTEND_URL}/accept-invite?token=${token}`;
    }

    res.status(201).json(responseData);
  } catch (error) {
    console.error('Invite user error:', error);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

// Revoke invitation
router.delete('/invitations/:id', authenticate, requirePermission('users:invite'), async (req, res) => {
  try {
    const result = await query(
      `UPDATE invitations SET status = 'revoked' 
       WHERE id = $1 AND firm_id = $2 AND status = 'pending'
       RETURNING id`,
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invitation not found or already processed' });
    }

    res.json({ message: 'Invitation revoked' });
  } catch (error) {
    console.error('Revoke invitation error:', error);
    res.status(500).json({ error: 'Failed to revoke invitation' });
  }
});

// Accept invitation (public route)
router.post('/accept-invitation', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Find invitation
    const inviteResult = await query(
      `SELECT * FROM invitations 
       WHERE token_hash = $1 AND status = 'pending' AND expires_at > NOW()`,
      [hashToken(token)]
    );

    if (inviteResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired invitation' });
    }

    const invitation = inviteResult.rows[0];

    const result = await withTransaction(async (client) => {
      // Create user
      const passwordHash = await hashPassword(password);
      const userResult = await client.query(
        `INSERT INTO users (firm_id, email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          invitation.firm_id, invitation.email, passwordHash,
          invitation.first_name, invitation.last_name, invitation.role
        ]
      );

      // Update invitation
      await client.query(
        `UPDATE invitations SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
        [invitation.id]
      );

      return userResult.rows[0];
    });

    res.json({
      message: 'Account created successfully',
      user: {
        id: result.id,
        email: result.email,
        firstName: result.first_name,
        lastName: result.last_name,
        role: result.role,
      },
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// Get groups
router.get('/groups', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT g.*, array_agg(ug.user_id) FILTER (WHERE ug.user_id IS NOT NULL) as member_ids
       FROM groups g
       LEFT JOIN user_groups ug ON g.id = ug.group_id
       WHERE g.firm_id = $1
       GROUP BY g.id
       ORDER BY g.name`,
      [req.user.firmId]
    );

    res.json({
      groups: result.rows.map(g => ({
        id: g.id,
        name: g.name,
        description: g.description,
        color: g.color,
        permissions: g.permissions,
        memberIds: g.member_ids || [],
        createdAt: g.created_at,
        updatedAt: g.updated_at,
      })),
    });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Failed to get groups' });
  }
});

// Create group
router.post('/groups', authenticate, requirePermission('groups:manage'), async (req, res) => {
  try {
    const { name, description, color = '#3B82F6', permissions = [], memberIds = [] } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const result = await withTransaction(async (client) => {
      const groupResult = await client.query(
        `INSERT INTO groups (firm_id, name, description, color, permissions)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [req.user.firmId, name, description, color, permissions]
      );

      const group = groupResult.rows[0];

      // Add members
      for (const userId of memberIds) {
        await client.query(
          'INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, group.id]
        );
      }

      return group;
    });

    res.status(201).json({
      id: result.id,
      name: result.name,
      description: result.description,
      color: result.color,
      permissions: result.permissions,
      memberIds,
      createdAt: result.created_at,
    });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Update group
router.put('/groups/:id', authenticate, requirePermission('groups:manage'), async (req, res) => {
  try {
    const { name, description, color, permissions, memberIds } = req.body;

    const existing = await query(
      'SELECT id FROM groups WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE groups SET
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          color = COALESCE($3, color),
          permissions = COALESCE($4, permissions)
        WHERE id = $5`,
        [name, description, color, permissions, req.params.id]
      );

      if (memberIds !== undefined) {
        await client.query('DELETE FROM user_groups WHERE group_id = $1', [req.params.id]);
        for (const userId of memberIds) {
          await client.query(
            'INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2)',
            [userId, req.params.id]
          );
        }
      }
    });

    res.json({ message: 'Group updated' });
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// Delete group
router.delete('/groups/:id', authenticate, requirePermission('groups:manage'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM groups WHERE id = $1 AND firm_id = $2 RETURNING id',
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json({ message: 'Group deleted' });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

export default router;
