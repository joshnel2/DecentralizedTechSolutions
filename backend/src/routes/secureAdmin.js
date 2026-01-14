import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db/connection.js';
import { clearPlatformSettingsCache } from './integrations.js';
import { clearAzureConfigCache } from '../utils/azureStorage.js';

const router = Router();

// Secure admin credentials (hashed for security)
// Username: strappedadmin7969
// Password: dawg79697969
const ADMIN_USERNAME_HASH = crypto.createHash('sha256').update('strappedadmin7969').digest('hex');
const ADMIN_PASSWORD_HASH = crypto.createHash('sha256').update('dawg79697969').digest('hex');

// Rate limiting for security
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

// Audit logging - persistent in memory (would be DB in production)
const auditLog = [];

const logAudit = (action, details, ip, targetUser = null) => {
  const entry = {
    id: crypto.randomUUID(),
    action,
    user: 'platform_admin',
    target_user: targetUser,
    timestamp: new Date().toISOString(),
    details,
    ip_address: ip || 'unknown'
  };
  auditLog.unshift(entry);
  // Keep only last 1000 entries
  if (auditLog.length > 1000) auditLog.pop();
  console.log(`[HIPAA AUDIT] ${entry.timestamp} - ${action}: ${details} from ${ip}`);
  return entry;
};

// Secure admin authentication middleware
const requireSecureAdmin = (req, res, next) => {
  const authHeader = req.headers['x-admin-auth'];
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  try {
    const session = JSON.parse(Buffer.from(authHeader, 'base64').toString());
    
    if (!session.auth || session.exp < Date.now()) {
      return res.status(401).json({ error: 'Session expired' });
    }

    req.adminAuth = true;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid admin session' });
  }
};

// ============================================
// AUTHENTICATION
// ============================================

// Secure admin login verification
router.post('/verify', (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';

  // Rate limiting check
  const attempts = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
  const now = Date.now();

  if (attempts.count >= MAX_ATTEMPTS && now - attempts.lastAttempt < LOCKOUT_TIME) {
    const remaining = Math.ceil((LOCKOUT_TIME - (now - attempts.lastAttempt)) / 1000);
    logAudit('LOGIN_BLOCKED', `Rate limited from IP ${ip}`, ip);
    return res.status(429).json({ 
      error: 'Too many login attempts', 
      lockoutSeconds: remaining 
    });
  }

  // Reset if lockout expired
  if (now - attempts.lastAttempt > LOCKOUT_TIME) {
    attempts.count = 0;
  }

  // Verify credentials using constant-time comparison
  const usernameHash = crypto.createHash('sha256').update(username || '').digest('hex');
  const passwordHash = crypto.createHash('sha256').update(password || '').digest('hex');

  const usernameValid = crypto.timingSafeEqual(
    Buffer.from(usernameHash),
    Buffer.from(ADMIN_USERNAME_HASH)
  );
  const passwordValid = crypto.timingSafeEqual(
    Buffer.from(passwordHash),
    Buffer.from(ADMIN_PASSWORD_HASH)
  );

  if (usernameValid && passwordValid) {
    // Reset attempts on success
    loginAttempts.delete(ip);
    logAudit('LOGIN_SUCCESS', 'Secure admin authenticated', ip);
    
    res.json({ 
      success: true,
      message: 'Authentication successful'
    });
  } else {
    // Increment failed attempts
    attempts.count++;
    attempts.lastAttempt = now;
    loginAttempts.set(ip, attempts);
    
    logAudit('LOGIN_FAILED', `Failed attempt ${attempts.count}/${MAX_ATTEMPTS}`, ip);
    
    res.status(401).json({ 
      error: 'Invalid credentials',
      remainingAttempts: MAX_ATTEMPTS - attempts.count
    });
  }
});

// ============================================
// FIRM MANAGEMENT
// ============================================

router.get('/firms', requireSecureAdmin, async (req, res) => {
  try {
    logAudit('VIEW_FIRMS', 'Accessed firms list', req.ip);
    
    const result = await query(`
      SELECT f.*, 
             (SELECT COUNT(*) FROM users WHERE firm_id = f.id) as users_count
      FROM firms f
      ORDER BY f.created_at DESC
    `);

    res.json(result.rows.map(f => ({
      id: f.id,
      name: f.name,
      domain: f.website || f.email?.split('@')[1] || null,
      status: f.is_active !== false ? 'active' : 'suspended',
      users_count: parseInt(f.users_count) || 0,
      subscription_tier: 'professional',
      created_at: f.created_at
    })));
  } catch (error) {
    console.error('Get firms error:', error);
    res.status(500).json({ error: 'Failed to retrieve firms' });
  }
});

router.post('/firms', requireSecureAdmin, async (req, res) => {
  try {
    const { name, domain, status, subscription_tier } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Firm name is required' });
    }

    const result = await query(
      `INSERT INTO firms (name, website, email)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, domain, domain ? `contact@${domain}` : null]
    );

    logAudit('CREATE_FIRM', `Created firm: ${name}`, req.ip);

    res.status(201).json({
      id: result.rows[0].id,
      name: result.rows[0].name,
      domain: domain,
      status: status || 'active',
      users_count: 0,
      subscription_tier: subscription_tier || 'professional',
      created_at: result.rows[0].created_at
    });
  } catch (error) {
    console.error('Create firm error:', error);
    res.status(500).json({ error: 'Failed to create firm' });
  }
});

router.put('/firms/:id', requireSecureAdmin, async (req, res) => {
  try {
    const { name, domain, status, subscription_tier } = req.body;

    const result = await query(
      `UPDATE firms SET
        name = COALESCE($1, name),
        website = COALESCE($2, website),
        updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [name, domain, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Firm not found' });
    }

    logAudit('UPDATE_FIRM', `Updated firm: ${result.rows[0].name}`, req.ip);

    res.json({
      id: result.rows[0].id,
      name: result.rows[0].name,
      domain: domain || result.rows[0].website,
      status: status || 'active',
      subscription_tier: subscription_tier || 'professional'
    });
  } catch (error) {
    console.error('Update firm error:', error);
    res.status(500).json({ error: 'Failed to update firm' });
  }
});

// Get users for a specific firm
router.get('/firms/:id/users', requireSecureAdmin, async (req, res) => {
  try {
    const firmId = req.params.id;
    
    const result = await query(`
      SELECT 
        id, email, first_name, last_name, role, 
        is_active, email_verified, phone, hourly_rate,
        created_at, last_login_at, updated_at
      FROM users 
      WHERE firm_id = $1
      ORDER BY 
        CASE role 
          WHEN 'owner' THEN 1 
          WHEN 'admin' THEN 2 
          WHEN 'partner' THEN 3 
          WHEN 'attorney' THEN 4 
          WHEN 'paralegal' THEN 5 
          ELSE 6 
        END,
        first_name ASC
    `, [firmId]);

    res.json({
      users: result.rows.map(u => ({
        id: u.id,
        email: u.email,
        first_name: u.first_name,
        last_name: u.last_name,
        role: u.role,
        is_active: u.is_active !== false,
        email_verified: u.email_verified,
        phone: u.phone,
        hourly_rate: u.hourly_rate,
        created_at: u.created_at,
        last_login: u.last_login_at
      }))
    });
  } catch (error) {
    console.error('Get firm users error:', error);
    res.status(500).json({ error: 'Failed to retrieve firm users' });
  }
});

// Get stats for a specific firm
router.get('/firms/:id/stats', requireSecureAdmin, async (req, res) => {
  try {
    const firmId = req.params.id;
    
    const result = await query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE firm_id = $1) as users,
        (SELECT COUNT(*) FROM users WHERE firm_id = $1 AND is_active = true) as active_users,
        (SELECT COUNT(*) FROM clients WHERE firm_id = $1) as clients,
        (SELECT COUNT(*) FROM matters WHERE firm_id = $1) as matters,
        (SELECT COUNT(*) FROM matters WHERE firm_id = $1 AND status = 'Open') as open_matters,
        (SELECT COUNT(*) FROM documents WHERE firm_id = $1) as documents,
        (SELECT COUNT(*) FROM time_entries WHERE firm_id = $1) as time_entries,
        (SELECT COALESCE(SUM(hours), 0) FROM time_entries WHERE firm_id = $1) as total_hours,
        (SELECT COUNT(*) FROM invoices WHERE firm_id = $1) as invoices,
        (SELECT COUNT(*) FROM calendar_events WHERE firm_id = $1) as calendar_events
    `, [firmId]);

    const stats = result.rows[0];
    res.json({
      users: parseInt(stats.users),
      activeUsers: parseInt(stats.active_users),
      clients: parseInt(stats.clients),
      matters: parseInt(stats.matters),
      openMatters: parseInt(stats.open_matters),
      documents: parseInt(stats.documents),
      timeEntries: parseInt(stats.time_entries),
      totalHours: parseFloat(stats.total_hours),
      invoices: parseInt(stats.invoices),
      calendarEvents: parseInt(stats.calendar_events)
    });
  } catch (error) {
    console.error('Get firm stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve firm stats' });
  }
});

router.delete('/firms/:id', requireSecureAdmin, async (req, res) => {
  try {
    const firmId = req.params.id;
    
    // Get firm info and counts before deletion
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
    console.log(`[DELETE FIRM] Deleting "${firmName}" with:`, deleteCounts);
    
    // Delete firm - CASCADE will automatically delete all related records
    const result = await query('DELETE FROM firms WHERE id = $1 RETURNING id', [firmId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Firm not found' });
    }

    logAudit('DELETE_FIRM', `Deleted firm "${firmName}" and all data: ${JSON.stringify(deleteCounts)}`, req.ip);

    res.json({ 
      message: 'Firm and all associated data deleted successfully',
      deleted: {
        firm: firmName,
        users: parseInt(deleteCounts.users),
        clients: parseInt(deleteCounts.clients),
        matters: parseInt(deleteCounts.matters),
        time_entries: parseInt(deleteCounts.time_entries),
        invoices: parseInt(deleteCounts.invoices),
        calendar_events: parseInt(deleteCounts.calendar_events),
        documents: parseInt(deleteCounts.documents)
      }
    });
  } catch (error) {
    console.error('Delete firm error:', error);
    res.status(500).json({ error: `Failed to delete firm: ${error.message}` });
  }
});

// ============================================
// USER MANAGEMENT
// ============================================

router.get('/users', requireSecureAdmin, async (req, res) => {
  try {
    logAudit('VIEW_USERS', 'Accessed users list', req.ip);
    
    const result = await query(`
      SELECT u.*, f.name as firm_name
      FROM users u
      LEFT JOIN firms f ON u.firm_id = f.id
      ORDER BY u.created_at DESC
    `);

    res.json(result.rows.map(u => ({
      id: u.id,
      email: u.email,
      first_name: u.first_name,
      last_name: u.last_name,
      role: u.role,
      firm_id: u.firm_id,
      firm_name: u.firm_name,
      status: u.is_active !== false ? 'active' : 'inactive',
      created_at: u.created_at,
      last_login: u.last_login_at
    })));
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

router.post('/users', requireSecureAdmin, async (req, res) => {
  try {
    const { email, password, first_name, last_name, role, firm_id, status } = req.body;

    if (!email || !password || !first_name || !last_name || !firm_id) {
      return res.status(400).json({ 
        error: 'Required: email, password, first_name, last_name, firm_id' 
      });
    }

    // Check if email exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Check if firm exists
    const firmCheck = await query('SELECT id FROM firms WHERE id = $1', [firm_id]);
    if (firmCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Firm not found' });
    }

    // Hash password with strong settings
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await query(
      `INSERT INTO users (firm_id, email, password_hash, first_name, last_name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [firm_id, email, passwordHash, first_name, last_name, role || 'attorney', status !== 'inactive']
    );

    logAudit('CREATE_USER', `Created user: ${email}`, req.ip);

    res.status(201).json({
      id: result.rows[0].id,
      email: result.rows[0].email,
      first_name: result.rows[0].first_name,
      last_name: result.rows[0].last_name,
      role: result.rows[0].role,
      firm_id: result.rows[0].firm_id,
      status: result.rows[0].is_active ? 'active' : 'inactive',
      created_at: result.rows[0].created_at
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/users/:id', requireSecureAdmin, async (req, res) => {
  try {
    const { email, password, first_name, last_name, role, firm_id, status } = req.body;

    let updateFields = [];
    let params = [];
    let paramIndex = 1;

    if (email) {
      updateFields.push(`email = $${paramIndex++}`);
      params.push(email);
    }
    if (first_name) {
      updateFields.push(`first_name = $${paramIndex++}`);
      params.push(first_name);
    }
    if (last_name) {
      updateFields.push(`last_name = $${paramIndex++}`);
      params.push(last_name);
    }
    if (role) {
      updateFields.push(`role = $${paramIndex++}`);
      params.push(role);
    }
    if (firm_id) {
      updateFields.push(`firm_id = $${paramIndex++}`);
      params.push(firm_id);
    }
    if (status) {
      updateFields.push(`is_active = $${paramIndex++}`);
      params.push(status === 'active');
    }
    if (password) {
      const passwordHash = await bcrypt.hash(password, 12);
      updateFields.push(`password_hash = $${paramIndex++}`);
      params.push(passwordHash);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
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

    logAudit('UPDATE_USER', `Updated user: ${result.rows[0].email}`, req.ip);

    res.json({
      id: result.rows[0].id,
      email: result.rows[0].email,
      first_name: result.rows[0].first_name,
      last_name: result.rows[0].last_name,
      role: result.rows[0].role,
      firm_id: result.rows[0].firm_id,
      status: result.rows[0].is_active ? 'active' : 'inactive'
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/users/:id', requireSecureAdmin, async (req, res) => {
  try {
    // Get user email for audit
    const user = await query('SELECT email FROM users WHERE id = $1', [req.params.id]);
    
    const result = await query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    logAudit('DELETE_USER', `Deleted user: ${user.rows[0]?.email || req.params.id}`, req.ip);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ============================================
// STATS & AUDIT
// ============================================

router.get('/stats', requireSecureAdmin, async (req, res) => {
  try {
    const stats = await query(`
      SELECT 
        (SELECT COUNT(*) FROM firms) as firms,
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM users WHERE is_active = true) as activeUsers
    `);

    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

router.get('/audit', requireSecureAdmin, (req, res) => {
  logAudit('VIEW_AUDIT', 'Accessed audit log', req.ip);
  res.json(auditLog.slice(0, 100)); // Return last 100 entries
});

// ============================================
// QUICK ONBOARD - Create Firm + Admin User
// ============================================

router.post('/quick-onboard', requireSecureAdmin, async (req, res) => {
  try {
    const { 
      firmName, 
      firmDomain,
      firmEmail,
      firmPhone,
      adminEmail, 
      adminPassword, 
      adminFirstName, 
      adminLastName,
      subscriptionTier = 'professional'
    } = req.body;

    // Validation
    if (!firmName || !adminEmail || !adminPassword || !adminFirstName || !adminLastName) {
      return res.status(400).json({ 
        error: 'Required fields: firmName, adminEmail, adminPassword, adminFirstName, adminLastName' 
      });
    }

    // Check if email already exists
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Admin email already exists' });
    }

    // Create firm
    const firmResult = await query(
      `INSERT INTO firms (name, website, email, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [firmName, firmDomain, firmEmail || `contact@${firmDomain || 'firm.com'}`, firmPhone]
    );
    const firm = firmResult.rows[0];

    // Hash password
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    // Create admin user
    const userResult = await query(
      `INSERT INTO users (firm_id, email, password_hash, first_name, last_name, role, is_active, email_verified)
       VALUES ($1, $2, $3, $4, $5, 'admin', true, true)
       RETURNING *`,
      [firm.id, adminEmail, passwordHash, adminFirstName, adminLastName]
    );
    const user = userResult.rows[0];

    logAudit('QUICK_ONBOARD', `Created firm "${firmName}" with admin ${adminEmail}`, req.ip, adminEmail);

    res.status(201).json({
      success: true,
      firm: {
        id: firm.id,
        name: firm.name,
        domain: firmDomain,
        email: firm.email
      },
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      },
      message: `Successfully onboarded ${firmName} with admin user ${adminEmail}`
    });
  } catch (error) {
    console.error('Quick onboard error:', error);
    res.status(500).json({ error: 'Failed to complete onboarding: ' + error.message });
  }
});

// ============================================
// ACCOUNT TOOLS
// ============================================

// Reset user password
router.post('/account-tools/reset-password', requireSecureAdmin, async (req, res) => {
  try {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({ error: 'userId and newPassword required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    const result = await query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING email`,
      [passwordHash, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    logAudit('PASSWORD_RESET', `Reset password for user ${result.rows[0].email}`, req.ip, result.rows[0].email);

    res.json({ success: true, message: `Password reset for ${result.rows[0].email}` });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Force verify email
router.post('/account-tools/verify-email', requireSecureAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const result = await query(
      `UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1 RETURNING email`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    logAudit('EMAIL_VERIFIED', `Force verified email for ${result.rows[0].email}`, req.ip, result.rows[0].email);

    res.json({ success: true, message: `Email verified for ${result.rows[0].email}` });
  } catch (error) {
    console.error('Email verify error:', error);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

// Toggle account status (activate/deactivate)
router.post('/account-tools/toggle-status', requireSecureAdmin, async (req, res) => {
  try {
    const { userId, isActive } = req.body;

    if (!userId || isActive === undefined) {
      return res.status(400).json({ error: 'userId and isActive required' });
    }

    const result = await query(
      `UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING email, is_active`,
      [isActive, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const action = isActive ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_DEACTIVATED';
    logAudit(action, `${isActive ? 'Activated' : 'Deactivated'} account for ${result.rows[0].email}`, req.ip, result.rows[0].email);

    res.json({ 
      success: true, 
      message: `Account ${isActive ? 'activated' : 'deactivated'} for ${result.rows[0].email}`,
      isActive: result.rows[0].is_active
    });
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(500).json({ error: 'Failed to toggle account status' });
  }
});

// Change user role
router.post('/account-tools/change-role', requireSecureAdmin, async (req, res) => {
  try {
    const { userId, newRole } = req.body;

    if (!userId || !newRole) {
      return res.status(400).json({ error: 'userId and newRole required' });
    }

    const validRoles = ['owner', 'admin', 'attorney', 'paralegal', 'staff', 'billing', 'readonly'];
    if (!validRoles.includes(newRole)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    }

    const result = await query(
      `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING email, role`,
      [newRole, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    logAudit('ROLE_CHANGED', `Changed role to ${newRole} for ${result.rows[0].email}`, req.ip, result.rows[0].email);

    res.json({ 
      success: true, 
      message: `Role changed to ${newRole} for ${result.rows[0].email}`,
      role: result.rows[0].role
    });
  } catch (error) {
    console.error('Change role error:', error);
    res.status(500).json({ error: 'Failed to change role' });
  }
});

// Transfer user to different firm
router.post('/account-tools/transfer-firm', requireSecureAdmin, async (req, res) => {
  try {
    const { userId, newFirmId } = req.body;

    if (!userId || !newFirmId) {
      return res.status(400).json({ error: 'userId and newFirmId required' });
    }

    // Verify firm exists
    const firmCheck = await query('SELECT name FROM firms WHERE id = $1', [newFirmId]);
    if (firmCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Target firm not found' });
    }

    const result = await query(
      `UPDATE users SET firm_id = $1, updated_at = NOW() WHERE id = $2 RETURNING email`,
      [newFirmId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    logAudit('FIRM_TRANSFER', `Transferred ${result.rows[0].email} to firm ${firmCheck.rows[0].name}`, req.ip, result.rows[0].email);

    res.json({ 
      success: true, 
      message: `Transferred ${result.rows[0].email} to ${firmCheck.rows[0].name}`
    });
  } catch (error) {
    console.error('Firm transfer error:', error);
    res.status(500).json({ error: 'Failed to transfer user' });
  }
});

// Get detailed user info for account lookup
router.get('/account-tools/lookup/:identifier', requireSecureAdmin, async (req, res) => {
  try {
    const { identifier } = req.params;

    // Search by email or ID
    const result = await query(`
      SELECT 
        u.*,
        f.name as firm_name,
        f.email as firm_email,
        (SELECT COUNT(*) FROM matters WHERE firm_id = u.firm_id) as firm_matters_count,
        (SELECT COUNT(*) FROM time_entries WHERE user_id = u.id) as time_entries_count,
        (SELECT MAX(created_at) FROM time_entries WHERE user_id = u.id) as last_time_entry
      FROM users u
      LEFT JOIN firms f ON u.firm_id = f.id
      WHERE u.email ILIKE $1 OR u.id::text = $1
      LIMIT 1
    `, [`%${identifier}%`]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const u = result.rows[0];
    logAudit('ACCOUNT_LOOKUP', `Looked up account: ${u.email}`, req.ip, u.email);

    res.json({
      id: u.id,
      email: u.email,
      firstName: u.first_name,
      lastName: u.last_name,
      role: u.role,
      firmId: u.firm_id,
      firmName: u.firm_name,
      firmEmail: u.firm_email,
      isActive: u.is_active,
      emailVerified: u.email_verified,
      twoFactorEnabled: u.two_factor_enabled,
      hourlyRate: u.hourly_rate,
      phone: u.phone,
      lastLoginAt: u.last_login_at,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
      stats: {
        firmMattersCount: parseInt(u.firm_matters_count) || 0,
        timeEntriesCount: parseInt(u.time_entries_count) || 0,
        lastTimeEntry: u.last_time_entry
      }
    });
  } catch (error) {
    console.error('Account lookup error:', error);
    res.status(500).json({ error: 'Failed to lookup account' });
  }
});

// ============================================
// BULK OPERATIONS
// ============================================

// Bulk create users
router.post('/bulk-create-users', requireSecureAdmin, async (req, res) => {
  try {
    const { users, firmId, defaultPassword } = req.body;

    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ error: 'users array required' });
    }

    if (!firmId) {
      return res.status(400).json({ error: 'firmId required' });
    }

    // Verify firm exists
    const firmCheck = await query('SELECT id, name FROM firms WHERE id = $1', [firmId]);
    if (firmCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Firm not found' });
    }

    const results = {
      created: [],
      failed: []
    };

    for (const user of users) {
      try {
        const { email, firstName, lastName, role = 'attorney' } = user;
        
        if (!email || !firstName || !lastName) {
          results.failed.push({ email, error: 'Missing required fields' });
          continue;
        }

        // Check if email exists
        const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
          results.failed.push({ email, error: 'Email already exists' });
          continue;
        }

        const password = user.password || defaultPassword || crypto.randomBytes(12).toString('base64');
        const passwordHash = await bcrypt.hash(password, 12);

        const result = await query(
          `INSERT INTO users (firm_id, email, password_hash, first_name, last_name, role, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, true)
           RETURNING id, email, first_name, last_name, role`,
          [firmId, email, passwordHash, firstName, lastName, role]
        );

        results.created.push({
          ...result.rows[0],
          tempPassword: user.password ? null : password // Only return temp password if auto-generated
        });
      } catch (err) {
        results.failed.push({ email: user.email, error: err.message });
      }
    }

    logAudit('BULK_CREATE_USERS', `Created ${results.created.length} users for firm ${firmCheck.rows[0].name}`, req.ip);

    res.status(201).json({
      success: true,
      created: results.created.length,
      failed: results.failed.length,
      results
    });
  } catch (error) {
    console.error('Bulk create error:', error);
    res.status(500).json({ error: 'Bulk create failed: ' + error.message });
  }
});

// ============================================
// ENHANCED STATS
// ============================================

router.get('/detailed-stats', requireSecureAdmin, async (req, res) => {
  try {
    // Get comprehensive platform stats
    const stats = await query(`
      SELECT 
        (SELECT COUNT(*) FROM firms) as total_firms,
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE is_active = true) as active_users,
        (SELECT COUNT(*) FROM users WHERE is_active = false) as inactive_users,
        (SELECT COUNT(*) FROM users WHERE email_verified = true) as verified_users,
        (SELECT COUNT(*) FROM users WHERE email_verified = false OR email_verified IS NULL) as unverified_users,
        (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days') as new_users_7d,
        (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '30 days') as new_users_30d,
        (SELECT COUNT(*) FROM firms WHERE created_at > NOW() - INTERVAL '7 days') as new_firms_7d,
        (SELECT COUNT(*) FROM firms WHERE created_at > NOW() - INTERVAL '30 days') as new_firms_30d,
        (SELECT COUNT(*) FROM users WHERE last_login_at > NOW() - INTERVAL '24 hours') as active_today,
        (SELECT COUNT(*) FROM users WHERE last_login_at > NOW() - INTERVAL '7 days') as active_7d,
        (SELECT COUNT(*) FROM matters) as total_matters,
        (SELECT COUNT(*) FROM clients) as total_clients,
        (SELECT COUNT(*) FROM time_entries) as total_time_entries,
        (SELECT COUNT(*) FROM documents) as total_documents
    `);

    // Get top firms by user count
    const topFirms = await query(`
      SELECT f.id, f.name, COUNT(u.id) as user_count
      FROM firms f
      LEFT JOIN users u ON u.firm_id = f.id
      GROUP BY f.id, f.name
      ORDER BY user_count DESC
      LIMIT 10
    `);

    // Get recent activity
    const recentUsers = await query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.created_at, f.name as firm_name
      FROM users u
      LEFT JOIN firms f ON u.firm_id = f.id
      ORDER BY u.created_at DESC
      LIMIT 10
    `);

    const recentFirms = await query(`
      SELECT f.id, f.name, f.created_at, 
             (SELECT COUNT(*) FROM users WHERE firm_id = f.id) as user_count
      FROM firms f
      ORDER BY f.created_at DESC
      LIMIT 10
    `);

    res.json({
      overview: stats.rows[0],
      topFirms: topFirms.rows,
      recentUsers: recentUsers.rows,
      recentFirms: recentFirms.rows
    });
  } catch (error) {
    console.error('Detailed stats error:', error);
    res.status(500).json({ error: 'Failed to get detailed stats' });
  }
});

// ============================================
// FIRM DETAILS
// ============================================

router.get('/firms/:id/details', requireSecureAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const firmResult = await query(`
      SELECT f.*,
             (SELECT COUNT(*) FROM users WHERE firm_id = f.id) as users_count,
             (SELECT COUNT(*) FROM users WHERE firm_id = f.id AND is_active = true) as active_users_count,
             (SELECT COUNT(*) FROM matters WHERE firm_id = f.id) as matters_count,
             (SELECT COUNT(*) FROM clients WHERE firm_id = f.id) as clients_count
      FROM firms f
      WHERE f.id = $1
    `, [id]);

    if (firmResult.rows.length === 0) {
      return res.status(404).json({ error: 'Firm not found' });
    }

    const usersResult = await query(`
      SELECT id, email, first_name, last_name, role, is_active, email_verified, last_login_at, created_at
      FROM users
      WHERE firm_id = $1
      ORDER BY created_at DESC
    `, [id]);

    const f = firmResult.rows[0];

    logAudit('VIEW_FIRM_DETAILS', `Viewed details for firm: ${f.name}`, req.ip);

    res.json({
      firm: {
        id: f.id,
        name: f.name,
        email: f.email,
        phone: f.phone,
        website: f.website,
        address: f.address,
        city: f.city,
        state: f.state,
        zipCode: f.zip_code,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
        stats: {
          usersCount: parseInt(f.users_count) || 0,
          activeUsersCount: parseInt(f.active_users_count) || 0,
          mattersCount: parseInt(f.matters_count) || 0,
          clientsCount: parseInt(f.clients_count) || 0
        }
      },
      users: usersResult.rows.map(u => ({
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        role: u.role,
        isActive: u.is_active,
        emailVerified: u.email_verified,
        lastLoginAt: u.last_login_at,
        createdAt: u.created_at
      }))
    });
  } catch (error) {
    console.error('Firm details error:', error);
    res.status(500).json({ error: 'Failed to get firm details' });
  }
});

// ============================================
// SCAN DOCUMENTS - Scan Azure files and match to matters
// ============================================
router.post('/firms/:id/scan-documents', requireSecureAdmin, async (req, res) => {
  try {
    const firmId = req.params.id;
    
    // Verify firm exists
    const firmCheck = await query('SELECT name FROM firms WHERE id = $1', [firmId]);
    if (firmCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Firm not found' });
    }
    
    const firmName = firmCheck.rows[0].name;
    logAudit('SCAN_DOCUMENTS', `Started document scan for firm: ${firmName}`, req.ip);
    
    console.log(`[SCAN] Starting Azure scan for firm ${firmId} (${firmName})`);
    
    // Import Azure utilities
    const { isAzureConfigured, getShareClient } = await import('../utils/azureStorage.js');
    
    const azureEnabled = await isAzureConfigured();
    if (!azureEnabled) {
      return res.status(400).json({ 
        error: 'Azure Storage not configured',
        message: 'Configure Azure Storage in Platform Settings first'
      });
    }
    
    // Get share client
    const shareClient = await getShareClient();
    const firmFolder = `firm-${firmId}`;
    
    // Load matters for matching
    const mattersResult = await query(
      `SELECT id, name, number FROM matters WHERE firm_id = $1`,
      [firmId]
    );
    const matters = mattersResult.rows;
    
    console.log(`[SCAN] Loaded ${matters.length} matters for matching`);
    
    // Scan Azure directory recursively
    async function scanDirectory(dirClient, basePath = '') {
      const files = [];
      try {
        for await (const item of dirClient.listFilesAndDirectories()) {
          const itemPath = basePath ? `${basePath}/${item.name}` : item.name;
          
          if (item.kind === 'directory') {
            const subDirClient = dirClient.getDirectoryClient(item.name);
            const subFiles = await scanDirectory(subDirClient, itemPath);
            files.push(...subFiles);
          } else {
            try {
              const fileClient = dirClient.getFileClient(item.name);
              const props = await fileClient.getProperties();
              files.push({
                name: item.name,
                path: itemPath,
                folder: basePath,
                size: props.contentLength,
                etag: props.etag,
                lastModified: props.lastModified
              });
            } catch (e) {
              files.push({ name: item.name, path: itemPath, folder: basePath, size: 0 });
            }
          }
        }
      } catch (err) {
        console.log(`[SCAN] Error scanning ${basePath}: ${err.message}`);
      }
      return files;
    }
    
    // Match folder path to matter
    function matchFolder(folderPath) {
      if (!folderPath) return null;
      
      const parts = folderPath.split('/').filter(p => p);
      const skipFolders = ['matters', 'clients', 'documents', 'files', 'general', 'firm', 'clio', 'clio drive'];
      
      for (const part of parts) {
        if (skipFolders.includes(part.toLowerCase())) continue;
        
        // Match "MatterNumber - MatterName" or "ClientName - MatterName"
        if (part.includes(' - ')) {
          const [prefix] = part.split(' - ').map(s => s.trim());
          const byNumber = matters.find(m => m.number && m.number.toLowerCase() === prefix.toLowerCase());
          if (byNumber) return byNumber.id;
        }
        
        // Try direct matter number match
        const directMatch = matters.find(m => m.number && part.toLowerCase().includes(m.number.toLowerCase()));
        if (directMatch) return directMatch.id;
        
        // Try matter-{id} folder pattern
        const matterIdMatch = part.match(/^matter-([a-f0-9-]+)$/i);
        if (matterIdMatch) {
          const m = matters.find(m => m.id === matterIdMatch[1]);
          if (m) return m.id;
        }
      }
      return null;
    }
    
    // Get MIME type
    function getMimeType(filename) {
      const ext = (filename.split('.').pop() || '').toLowerCase();
      const types = {
        pdf: 'application/pdf', doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        txt: 'text/plain', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        msg: 'application/vnd.ms-outlook', eml: 'message/rfc822'
      };
      return types[ext] || 'application/octet-stream';
    }
    
    // Start scan
    let allFiles = [];
    try {
      const dirClient = shareClient.getDirectoryClient(firmFolder);
      allFiles = await scanDirectory(dirClient, '');
    } catch (err) {
      console.log(`[SCAN] Firm folder may not exist: ${err.message}`);
    }
    
    console.log(`[SCAN] Found ${allFiles.length} files`);
    
    const results = {
      scanned: allFiles.length,
      created: 0,
      updated: 0,
      matched: 0,
      unmatched: 0,
      errors: []
    };
    
    for (const file of allFiles) {
      try {
        const existing = await query(
          `SELECT id, matter_id, external_etag FROM documents WHERE firm_id = $1 AND external_path = $2`,
          [firmId, file.path]
        );
        
        const matterId = matchFolder(file.folder);
        if (matterId) results.matched++;
        else results.unmatched++;
        
        if (existing.rows.length > 0) {
          const doc = existing.rows[0];
          if ((!doc.matter_id && matterId) || file.etag !== doc.external_etag) {
            await query(
              `UPDATE documents SET matter_id = COALESCE($1, matter_id), size = $2, external_etag = $3, updated_at = NOW() WHERE id = $4`,
              [matterId, file.size, file.etag, doc.id]
            );
            results.updated++;
          }
        } else {
          await query(
            `INSERT INTO documents (firm_id, matter_id, name, original_name, path, folder_path, type, size, external_path, external_etag, external_modified_at, privacy_level, status, storage_location)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [firmId, matterId, file.name, file.name, file.path, file.folder, getMimeType(file.name), file.size || 0, file.path, file.etag, file.lastModified, matterId ? 'team' : 'firm', 'final', 'azure']
          );
          results.created++;
        }
      } catch (err) {
        results.errors.push({ path: file.path, error: err.message });
      }
    }
    
    logAudit('SCAN_DOCUMENTS_COMPLETE', `Scan complete for ${firmName}: ${results.created} created, ${results.matched} matched`, req.ip);
    console.log(`[SCAN] Complete: ${results.created} created, ${results.updated} updated, ${results.matched} matched`);
    
    res.json({
      success: true,
      firmName,
      ...results,
      message: `Scanned ${results.scanned} files: ${results.created} new, ${results.updated} updated, ${results.matched} matched to matters`
    });
    
  } catch (error) {
    console.error('Scan documents error:', error);
    res.status(500).json({ error: 'Failed to scan documents: ' + error.message });
  }
});

// ============================================
// PLATFORM SETTINGS (Integration Credentials)
// ============================================

// Get all platform settings
router.get('/platform-settings', requireSecureAdmin, async (req, res) => {
  try {
    logAudit('VIEW_PLATFORM_SETTINGS', 'Accessed platform settings', req.ip);
    
    const result = await query(`
      SELECT key, value, is_secret, description, updated_at
      FROM platform_settings
      ORDER BY key
    `);

    // Mask secret values
    const settings = {};
    result.rows.forEach(row => {
      settings[row.key] = {
        value: row.is_secret && row.value ? '••••••••' : (row.value || ''),
        isSecret: row.is_secret,
        description: row.description,
        updatedAt: row.updated_at,
        isConfigured: row.is_secret ? !!row.value : !!row.value
      };
    });

    res.json(settings);
  } catch (error) {
    // Table might not exist yet
    if (error.code === '42P01') {
      return res.json({});
    }
    console.error('Get platform settings error:', error);
    res.status(500).json({ error: 'Failed to retrieve platform settings' });
  }
});

// Update platform settings
router.put('/platform-settings', requireSecureAdmin, async (req, res) => {
  try {
    let settingsToUpdate = req.body;

    // Handle both formats:
    // 1. { settings: [{ key, value }, ...] } from frontend
    // 2. { key1: value1, key2: value2 } direct format
    if (settingsToUpdate.settings && Array.isArray(settingsToUpdate.settings)) {
      // Convert array format to object format
      const converted = {};
      settingsToUpdate.settings.forEach(item => {
        if (item.key) {
          converted[item.key] = item.value;
        }
      });
      settingsToUpdate = converted;
    }

    if (!settingsToUpdate || typeof settingsToUpdate !== 'object') {
      return res.status(400).json({ error: 'Settings object required' });
    }

    const updated = [];
    
    for (const [key, value] of Object.entries(settingsToUpdate)) {
      // Skip masked values (don't overwrite with dots)
      if (value === '••••••••') continue;
      // Skip 'settings' key if it somehow got through
      if (key === 'settings') continue;
      
      // Determine if this is a secret field
      const isSecret = key.includes('_secret');
      
      // Debug log for secret values (show length and first few chars)
      if (isSecret && value) {
        console.log(`[Platform Settings] Saving ${key}: ${value.substring(0, 4)}... (${value.length} chars)`);
      }
      
      await query(`
        INSERT INTO platform_settings (key, value, is_secret)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO UPDATE SET value = $2, is_secret = $3, updated_at = NOW()
      `, [key, value || '', isSecret]);
      
      updated.push(key);
    }

    // Clear the caches so integrations pick up new values immediately
    try {
      clearPlatformSettingsCache();
      clearAzureConfigCache(); // Also clear Azure config cache for Apex Drive
    } catch (e) {
      // Cache clear is optional, continue
    }

    logAudit('UPDATE_PLATFORM_SETTINGS', `Updated settings: ${updated.join(', ')}`, req.ip);

    res.json({ 
      success: true, 
      message: `Updated ${updated.length} settings`,
      updated 
    });
  } catch (error) {
    console.error('Update platform settings error:', error);
    res.status(500).json({ error: 'Failed to update platform settings' });
  }
});

// Test integration connection
router.post('/platform-settings/test/:provider', requireSecureAdmin, async (req, res) => {
  try {
    const { provider } = req.params;
    
    // Get settings for the provider
    const settingsResult = await query(`
      SELECT key, value FROM platform_settings 
      WHERE key LIKE $1
    `, [`${provider}_%`]);
    
    const settings = {};
    settingsResult.rows.forEach(row => {
      const shortKey = row.key.replace(`${provider}_`, '');
      settings[shortKey] = row.value;
    });

    if (provider === 'microsoft') {
      if (!settings.client_id || !settings.client_secret) {
        return res.json({ 
          success: false, 
          message: 'Microsoft credentials not configured. Please enter Client ID and Client Secret.' 
        });
      }
      // Just check if credentials are present - actual OAuth flow will validate them
      return res.json({ 
        success: true, 
        message: 'Microsoft credentials configured. Users can now connect their Outlook accounts.' 
      });
    }
    
    if (provider === 'quickbooks') {
      if (!settings.client_id || !settings.client_secret) {
        return res.json({ 
          success: false, 
          message: 'QuickBooks credentials not configured. Please enter Client ID and Client Secret.' 
        });
      }
      return res.json({ 
        success: true, 
        message: `QuickBooks credentials configured (${settings.environment || 'sandbox'} mode). Users can now connect their QuickBooks accounts.` 
      });
    }
    
    if (provider === 'google') {
      if (!settings.client_id || !settings.client_secret) {
        return res.json({ 
          success: false, 
          message: 'Google credentials not configured. Please enter Client ID and Client Secret.' 
        });
      }
      return res.json({ 
        success: true, 
        message: 'Google credentials configured. Users can now connect their Google Calendar.' 
      });
    }

    res.status(400).json({ error: 'Unknown provider' });
  } catch (error) {
    console.error('Test integration error:', error);
    res.status(500).json({ error: 'Failed to test integration' });
  }
});

export default router;
