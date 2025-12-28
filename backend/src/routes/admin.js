import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Middleware to check if user is platform admin
const requirePlatformAdmin = async (req, res, next) => {
  try {
    // Check if user's email is in the platform_admins list or has platform_admin flag
    const result = await query(
      `SELECT id FROM users WHERE id = $1 AND (email = 'admin@apex.legal' OR role = 'platform_admin')`,
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Platform admin access required' });
    }
    
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Authorization check failed' });
  }
};

// ============================================
// FIRM MANAGEMENT
// ============================================

// Get all firms
router.get('/firms', authenticate, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT f.*, 
             (SELECT COUNT(*) FROM users WHERE firm_id = f.id) as user_count,
             (SELECT COUNT(*) FROM matters WHERE firm_id = f.id) as matter_count,
             (SELECT COUNT(*) FROM clients WHERE firm_id = f.id) as client_count
      FROM firms f
      ORDER BY f.created_at DESC
    `);

    res.json({
      firms: result.rows.map(f => ({
        id: f.id,
        name: f.name,
        email: f.email,
        phone: f.phone,
        address: f.address,
        city: f.city,
        state: f.state,
        zipCode: f.zip_code,
        website: f.website,
        userCount: parseInt(f.user_count),
        matterCount: parseInt(f.matter_count),
        clientCount: parseInt(f.client_count),
        createdAt: f.created_at,
        updatedAt: f.updated_at
      }))
    });
  } catch (error) {
    console.error('Get firms error:', error);
    res.status(500).json({ error: 'Failed to get firms' });
  }
});

// Create a new firm
router.post('/firms', authenticate, requirePlatformAdmin, async (req, res) => {
  try {
    const { name, email, phone, address, city, state, zipCode, website } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Firm name is required' });
    }

    const result = await query(
      `INSERT INTO firms (name, email, phone, address, city, state, zip_code, website)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name, email, phone, address, city, state, zipCode, website]
    );

    const f = result.rows[0];
    res.status(201).json({
      id: f.id,
      name: f.name,
      email: f.email,
      phone: f.phone,
      address: f.address,
      city: f.city,
      state: f.state,
      zipCode: f.zip_code,
      website: f.website,
      createdAt: f.created_at
    });
  } catch (error) {
    console.error('Create firm error:', error);
    res.status(500).json({ error: 'Failed to create firm' });
  }
});

// Update a firm
router.put('/firms/:id', authenticate, requirePlatformAdmin, async (req, res) => {
  try {
    const { name, email, phone, address, city, state, zipCode, website } = req.body;

    const result = await query(
      `UPDATE firms SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        address = COALESCE($4, address),
        city = COALESCE($5, city),
        state = COALESCE($6, state),
        zip_code = COALESCE($7, zip_code),
        website = COALESCE($8, website),
        updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [name, email, phone, address, city, state, zipCode, website, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Firm not found' });
    }

    const f = result.rows[0];
    res.json({
      id: f.id,
      name: f.name,
      email: f.email,
      phone: f.phone,
      address: f.address,
      city: f.city,
      state: f.state,
      zipCode: f.zip_code,
      website: f.website,
      updatedAt: f.updated_at
    });
  } catch (error) {
    console.error('Update firm error:', error);
    res.status(500).json({ error: 'Failed to update firm' });
  }
});

// Delete a firm and ALL associated data
router.delete('/firms/:id', authenticate, requirePlatformAdmin, async (req, res) => {
  try {
    const firmId = req.params.id;
    
    // Get firm info before deletion
    const firm = await query('SELECT name FROM firms WHERE id = $1', [firmId]);
    if (firm.rows.length === 0) {
      return res.status(404).json({ error: 'Firm not found' });
    }
    
    const firmName = firm.rows[0].name;
    
    // Get counts of what will be deleted (for logging)
    const counts = await query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE firm_id = $1) as users,
        (SELECT COUNT(*) FROM clients WHERE firm_id = $1) as clients,
        (SELECT COUNT(*) FROM matters WHERE firm_id = $1) as matters,
        (SELECT COUNT(*) FROM time_entries WHERE firm_id = $1) as time_entries,
        (SELECT COUNT(*) FROM invoices WHERE firm_id = $1) as invoices,
        (SELECT COUNT(*) FROM calendar_events WHERE firm_id = $1) as calendar_events,
        (SELECT COUNT(*) FROM documents WHERE firm_id = $1) as documents
    `, [firmId]);
    
    const deleteCounts = counts.rows[0];
    console.log(`[DELETE FIRM] Starting deletion of "${firmName}" with:`, deleteCounts);
    
    // Helper function to safely delete from a table (ignores if table doesn't exist)
    const safeDelete = async (sql, params) => {
      try {
        await query(sql, params);
      } catch (err) {
        // Ignore "relation does not exist" errors (table might not exist if migration wasn't run)
        if (err.code !== '42P01') {
          console.warn(`[DELETE FIRM] Warning during deletion: ${err.message}`);
        }
      }
    };

    // Explicitly delete all related data in correct order (deepest dependencies first)
    // This ensures complete cleanup even if CASCADE doesn't work for some reason
    
    // 1. Delete document-related tables first (deepest level)
    await safeDelete('DELETE FROM word_online_sessions WHERE firm_id = $1', [firmId]);
    await safeDelete('DELETE FROM document_permissions WHERE firm_id = $1', [firmId]);
    await safeDelete('DELETE FROM document_activities WHERE firm_id = $1', [firmId]);
    await safeDelete('DELETE FROM document_versions WHERE firm_id = $1', [firmId]);
    await safeDelete('DELETE FROM document_locks WHERE firm_id = $1', [firmId]);
    await safeDelete('DELETE FROM folder_permissions WHERE firm_id = $1', [firmId]);
    
    // 2. Delete sync queue and drive configurations
    await safeDelete('DELETE FROM document_sync_queue WHERE firm_id = $1', [firmId]);
    await safeDelete('DELETE FROM drive_configurations WHERE firm_id = $1', [firmId]);
    
    // 3. Delete sharing groups and related tables
    await safeDelete(`DELETE FROM sharing_group_hidden_items WHERE sharing_group_id IN 
                 (SELECT id FROM sharing_groups WHERE firm_id = $1)`, [firmId]);
    await safeDelete(`DELETE FROM sharing_group_members WHERE sharing_group_id IN 
                 (SELECT id FROM sharing_groups WHERE firm_id = $1)`, [firmId]);
    await safeDelete('DELETE FROM sharing_groups WHERE firm_id = $1', [firmId]);
    await safeDelete('DELETE FROM user_sharing_preferences WHERE firm_id = $1', [firmId]);
    
    // 4. Delete matter-related tables
    await safeDelete('DELETE FROM matter_permissions WHERE matter_id IN (SELECT id FROM matters WHERE firm_id = $1)', [firmId]);
    await safeDelete('DELETE FROM matter_assignments WHERE matter_id IN (SELECT id FROM matters WHERE firm_id = $1)', [firmId]);
    await safeDelete('DELETE FROM matter_notes WHERE firm_id = $1', [firmId]);
    
    // 5. Delete billing-related tables
    await safeDelete('DELETE FROM payments WHERE firm_id = $1', [firmId]);
    await safeDelete('DELETE FROM trust_transactions WHERE trust_account_id IN (SELECT id FROM trust_accounts WHERE firm_id = $1)', [firmId]);
    await safeDelete('DELETE FROM trust_accounts WHERE firm_id = $1', [firmId]);
    await safeDelete('DELETE FROM expenses WHERE firm_id = $1', [firmId]);
    await safeDelete('DELETE FROM time_entries WHERE firm_id = $1', [firmId]);
    await safeDelete('DELETE FROM invoices WHERE firm_id = $1', [firmId]);
    
    // 6. Delete calendar events and email links
    await safeDelete('DELETE FROM calendar_events WHERE firm_id = $1', [firmId]);
    await safeDelete('DELETE FROM email_links WHERE firm_id = $1', [firmId]);
    
    // 7. Delete documents
    await safeDelete('DELETE FROM documents WHERE firm_id = $1', [firmId]);
    
    // 8. Delete matters and clients
    await safeDelete('DELETE FROM matters WHERE firm_id = $1', [firmId]);
    await safeDelete('DELETE FROM clients WHERE firm_id = $1', [firmId]);
    
    // 9. Delete AI tasks
    await safeDelete('DELETE FROM ai_tasks WHERE firm_id = $1', [firmId]);
    
    // 10. Delete user-related tables
    await safeDelete('DELETE FROM user_document_preferences WHERE firm_id = $1', [firmId]);
    await safeDelete('DELETE FROM notification_preferences WHERE firm_id = $1', [firmId]);
    await safeDelete('DELETE FROM notifications WHERE firm_id = $1', [firmId]);
    await safeDelete('DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE firm_id = $1)', [firmId]);
    await safeDelete('DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE firm_id = $1)', [firmId]);
    await safeDelete('DELETE FROM user_groups WHERE user_id IN (SELECT id FROM users WHERE firm_id = $1)', [firmId]);
    
    // 11. Delete integrations
    await safeDelete('DELETE FROM integrations WHERE firm_id = $1', [firmId]);
    
    // 12. Delete groups
    await safeDelete('DELETE FROM groups WHERE firm_id = $1', [firmId]);
    
    // 13. Delete invitations and API keys
    await safeDelete('DELETE FROM invitations WHERE firm_id = $1', [firmId]);
    await safeDelete('DELETE FROM api_keys WHERE firm_id = $1', [firmId]);
    
    // 14. Delete audit logs
    await safeDelete('DELETE FROM audit_logs WHERE firm_id = $1', [firmId]);
    
    // 15. Delete users
    await safeDelete('DELETE FROM users WHERE firm_id = $1', [firmId]);
    
    // 16. Finally delete the firm itself
    const result = await query('DELETE FROM firms WHERE id = $1 RETURNING id', [firmId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Firm not found' });
    }

    console.log(`[DELETE FIRM] Successfully deleted "${firmName}" and all associated data`);

    res.json({ 
      message: 'Firm and all associated data deleted successfully',
      deleted: {
        firm: firmName,
        users: parseInt(deleteCounts.users),
        clients: parseInt(deleteCounts.clients),
        matters: parseInt(deleteCounts.matters),
        timeEntries: parseInt(deleteCounts.time_entries),
        invoices: parseInt(deleteCounts.invoices),
        calendarEvents: parseInt(deleteCounts.calendar_events),
        documents: parseInt(deleteCounts.documents)
      }
    });
  } catch (error) {
    console.error('Delete firm error:', error);
    console.error('Delete firm error stack:', error.stack);
    res.status(500).json({ error: `Failed to delete firm: ${error.message}` });
  }
});

// ============================================
// USER MANAGEMENT
// ============================================

// Get all users (across all firms)
router.get('/users', authenticate, requirePlatformAdmin, async (req, res) => {
  try {
    const { firmId } = req.query;
    
    let sql = `
      SELECT u.*, f.name as firm_name
      FROM users u
      LEFT JOIN firms f ON u.firm_id = f.id
    `;
    const params = [];

    if (firmId) {
      sql += ' WHERE u.firm_id = $1';
      params.push(firmId);
    }

    sql += ' ORDER BY u.created_at DESC';

    const result = await query(sql, params);

    res.json({
      users: result.rows.map(u => ({
        id: u.id,
        firmId: u.firm_id,
        firmName: u.firm_name,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        role: u.role,
        phone: u.phone,
        hourlyRate: u.hourly_rate,
        isActive: u.is_active,
        emailVerified: u.email_verified,
        twoFactorEnabled: u.two_factor_enabled,
        lastLoginAt: u.last_login_at,
        createdAt: u.created_at
      }))
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Create a new user
router.post('/users', authenticate, requirePlatformAdmin, async (req, res) => {
  try {
    const { firmId, email, password, firstName, lastName, role, phone, hourlyRate } = req.body;

    if (!firmId || !email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'Required fields: firmId, email, password, firstName, lastName' });
    }

    // Check if email already exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    // Check if firm exists
    const firmCheck = await query('SELECT id FROM firms WHERE id = $1', [firmId]);
    if (firmCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Firm not found' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await query(
      `INSERT INTO users (firm_id, email, password_hash, first_name, last_name, role, phone, hourly_rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [firmId, email, passwordHash, firstName, lastName, role || 'staff', phone, hourlyRate]
    );

    const u = result.rows[0];
    res.status(201).json({
      id: u.id,
      firmId: u.firm_id,
      email: u.email,
      firstName: u.first_name,
      lastName: u.last_name,
      role: u.role,
      phone: u.phone,
      hourlyRate: u.hourly_rate,
      isActive: u.is_active,
      createdAt: u.created_at
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update a user
router.put('/users/:id', authenticate, requirePlatformAdmin, async (req, res) => {
  try {
    const { email, firstName, lastName, role, phone, hourlyRate, isActive, password } = req.body;

    let updateFields = [];
    let params = [];
    let paramIndex = 1;

    if (email !== undefined) {
      updateFields.push(`email = $${paramIndex++}`);
      params.push(email);
    }
    if (firstName !== undefined) {
      updateFields.push(`first_name = $${paramIndex++}`);
      params.push(firstName);
    }
    if (lastName !== undefined) {
      updateFields.push(`last_name = $${paramIndex++}`);
      params.push(lastName);
    }
    if (role !== undefined) {
      updateFields.push(`role = $${paramIndex++}`);
      params.push(role);
    }
    if (phone !== undefined) {
      updateFields.push(`phone = $${paramIndex++}`);
      params.push(phone);
    }
    if (hourlyRate !== undefined) {
      updateFields.push(`hourly_rate = $${paramIndex++}`);
      params.push(hourlyRate);
    }
    if (isActive !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      params.push(isActive);
    }
    if (password) {
      const passwordHash = await bcrypt.hash(password, 12);
      updateFields.push(`password_hash = $${paramIndex++}`);
      params.push(passwordHash);
    }

    updateFields.push('updated_at = NOW()');
    params.push(req.params.id);

    const result = await query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const u = result.rows[0];
    res.json({
      id: u.id,
      firmId: u.firm_id,
      email: u.email,
      firstName: u.first_name,
      lastName: u.last_name,
      role: u.role,
      phone: u.phone,
      hourlyRate: u.hourly_rate,
      isActive: u.is_active,
      updatedAt: u.updated_at
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete a user
router.delete('/users/:id', authenticate, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ============================================
// PLATFORM STATS
// ============================================

router.get('/stats', authenticate, requirePlatformAdmin, async (req, res) => {
  try {
    const stats = await query(`
      SELECT 
        (SELECT COUNT(*) FROM firms) as total_firms,
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE is_active = true) as active_users,
        (SELECT COUNT(*) FROM matters) as total_matters,
        (SELECT COUNT(*) FROM clients) as total_clients,
        (SELECT COUNT(*) FROM documents) as total_documents,
        (SELECT COUNT(*) FROM time_entries) as total_time_entries
    `);

    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
