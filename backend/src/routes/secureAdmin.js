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

// NOTE: Primary scan-documents endpoint is at /firms/:firmId/scan-documents below
// This comment replaces a duplicate endpoint that was removed to avoid route conflicts

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

    if (provider === 'azure_storage') {
      // Actually test the Azure connection by trying to list the root directory
      try {
        const { getShareClient, isAzureConfigured, getAzureConfig } = await import('../utils/azureStorage.js');
        
        const configured = await isAzureConfigured();
        if (!configured) {
          return res.json({ 
            success: false, 
            message: 'Azure Storage credentials not configured. Enter Storage Account Name, Key, and File Share Name.' 
          });
        }
        
        const config = await getAzureConfig();
        console.log('[AZURE TEST] Testing connection to:', config.accountName, '/', config.shareName);
        
        // Try to get the share client and list root directory
        const shareClient = await getShareClient();
        const rootDir = shareClient.getDirectoryClient('');
        
        // Try to list files (this will fail if credentials are wrong)
        let fileCount = 0;
        for await (const item of rootDir.listFilesAndDirectories()) {
          fileCount++;
          if (fileCount >= 5) break; // Just check first few
        }
        
        return res.json({ 
          success: true, 
          message: `Azure Storage connected successfully! Account: ${config.accountName}, Share: ${config.shareName}. Found ${fileCount}+ items in root.`
        });
      } catch (azureError) {
        console.error('[AZURE TEST] Connection failed:', azureError.message);
        return res.json({ 
          success: false, 
          message: `Azure connection failed: ${azureError.message}. Check your credentials.`
        });
      }
    }

    res.status(400).json({ error: 'Unknown provider' });
  } catch (error) {
    console.error('Test integration error:', error);
    res.status(500).json({ error: 'Failed to test integration' });
  }
});

// ============================================
// ROBOCOPY INFO: Get Azure connection details for migration
// ============================================
router.get('/firms/:firmId/robocopy-info', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    
    // Get Azure config
    const { getAzureConfig, isAzureConfigured } = await import('../utils/azureStorage.js');
    
    if (!(await isAzureConfigured())) {
      return res.status(400).json({ error: 'Azure Storage not configured' });
    }
    
    const config = await getAzureConfig();
    const firmFolder = `firm-${firmId}`;
    
    // Build the UNC path for Windows
    const uncPath = `\\\\${config.accountName}.file.core.windows.net\\${config.shareName}\\${firmFolder}`;
    
    // Build mount commands
    const windowsMapCommand = `net use Z: ${uncPath} /user:${config.accountName} [STORAGE_KEY]`;
    const robocopyCommand = `robocopy "C:\\ClioData" "Z:\\" /MIR /COPYALL /MT:16 /R:2 /W:1 /DCOPY:DAT /LOG:migration.log`;
    
    const macMountCommand = `mount_smbfs //${config.accountName}:[STORAGE_KEY]@${config.accountName}.file.core.windows.net/${config.shareName}/${firmFolder} /Volumes/ApexDrive`;
    
    res.json({
      success: true,
      firmId,
      firmFolder,
      azure: {
        accountName: config.accountName,
        shareName: config.shareName,
        uncPath,
        endpoint: `https://${config.accountName}.file.core.windows.net`
      },
      commands: {
        windowsMapDrive: windowsMapCommand,
        robocopy: robocopyCommand,
        robocopyFlags: {
          '/MIR': 'Mirror directory tree (copies new files, deletes removed ones)',
          '/COPYALL': 'Copy ALL file info (data, attributes, timestamps, security, owner, auditing)',
          '/MT:16': 'Multi-threaded copying with 16 threads',
          '/R:2': 'Retry 2 times on failed copies',
          '/W:1': 'Wait 1 second between retries',
          '/DCOPY:DAT': 'Copy directory timestamps and attributes',
          '/LOG:migration.log': 'Log output to file'
        },
        macMount: macMountCommand
      },
      instructions: [
        '1. Get Storage Account Key from Azure Portal or platform admin',
        '2. Map the drive: Replace [STORAGE_KEY] with your actual key',
        '3. Run RoboCopy from your Clio Drive folder to the mapped drive',
        '4. After copy completes, click "Scan Documents" in admin portal',
        '5. Scan will match files to matters and set permissions'
      ],
      note: 'Replace [STORAGE_KEY] with your Azure Storage Account Key from Azure Portal → Storage Account → Access Keys'
    });
  } catch (error) {
    console.error('RoboCopy info error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DEBUG: Check documents in database for a firm
// ============================================
router.get('/firms/:firmId/documents-debug', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    
    // Direct count - no filters
    const countResult = await query('SELECT COUNT(*) as count FROM documents WHERE firm_id = $1', [firmId]);
    
    // Get sample documents
    const sampleResult = await query(`
      SELECT id, name, path, folder_path, matter_id, owner_id, storage_location, status, uploaded_at, created_at
      FROM documents 
      WHERE firm_id = $1 
      ORDER BY uploaded_at DESC NULLS LAST
      LIMIT 20
    `, [firmId]);
    
    res.json({
      totalDocuments: parseInt(countResult.rows[0].count),
      sampleDocuments: sampleResult.rows
    });
  } catch (error) {
    console.error('Documents debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SCAN DOCUMENTS - Simple, scalable document scanner
// ============================================
// How it works:
// 1. Scan files from Azure storage
// 2. Match to matters by folder name
// 3. Create database records with correct permissions
// 4. Done
router.post('/firms/:firmId/scan-documents', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    const { customFolder } = req.body || {}; // Optional: scan a specific folder
    
    console.log(`[SCAN] Starting document scan for firm ${firmId}`);
    if (customFolder) console.log(`[SCAN] Custom folder: ${customFolder}`);
    
    // Results tracker
    const results = { scanned: 0, added: 0, updated: 0, matched: 0, errors: [] };
    
    // 1. Check Azure is configured
    const { getShareClient, isAzureConfigured } = await import('../utils/azureStorage.js');
    if (!(await isAzureConfigured())) {
      return res.status(400).json({ error: 'Azure Storage not configured. Go to Platform Settings.' });
    }
    
    // 2. Load matters once (for matching)
    const mattersResult = await query(`
      SELECT id, LOWER(name) as name, LOWER(number) as number, responsible_attorney
      FROM matters WHERE firm_id = $1
    `, [firmId]);
    
    // Build simple lookup maps - O(1) matching
    const matterByName = new Map();
    const matterByNumber = new Map();
    for (const m of mattersResult.rows) {
      if (m.name) matterByName.set(m.name, m);
      if (m.number) matterByNumber.set(m.number, m);
    }
    console.log(`[SCAN] Loaded ${mattersResult.rows.length} matters`);
    
    // 3. Simple matter matching - just look at folder names
    const matchMatter = (folderPath) => {
      if (!folderPath) return null;
      const parts = folderPath.toLowerCase().split('/').filter(p => p);
      for (const part of parts) {
        // Direct match on matter number or name
        if (matterByNumber.has(part)) return matterByNumber.get(part);
        if (matterByName.has(part)) return matterByName.get(part);
        // Handle "ClientName - MatterName" format (Clio style)
        if (part.includes(' - ')) {
          const suffix = part.split(' - ').pop().trim();
          if (matterByName.has(suffix)) return matterByName.get(suffix);
        }
      }
      return null;
    };
    
    // 4. Get existing documents to avoid duplicate checks in loop
    const existingDocs = await query(
      `SELECT path FROM documents WHERE firm_id = $1`,
      [firmId]
    );
    const existingPaths = new Set(existingDocs.rows.map(d => d.path));
    console.log(`[SCAN] ${existingPaths.size} documents already in database`);
    
    // 5. Determine scan location
    const shareClient = await getShareClient();
    const firmFolder = `firm-${firmId}`;
    let scanFolder = customFolder || firmFolder;
    
    // Check if firm folder exists, if not check root
    if (!customFolder) {
      try {
        const firmDir = shareClient.getDirectoryClient(firmFolder);
        let hasFiles = false;
        for await (const item of firmDir.listFilesAndDirectories()) {
          hasFiles = true;
          break;
        }
        if (!hasFiles) {
          // Check root for files
          console.log(`[SCAN] Firm folder empty, checking root...`);
          const rootDir = shareClient.getDirectoryClient('');
          for await (const item of rootDir.listFilesAndDirectories()) {
            if (item.kind === 'file' || item.kind === 'directory') {
              console.log(`[SCAN] Found files in root, scanning root instead`);
              scanFolder = '';
              break;
            }
          }
        }
      } catch (e) {
        console.log(`[SCAN] Firm folder doesn't exist, scanning root: ${e.message}`);
        scanFolder = '';
      }
    }
    
    console.log(`[SCAN] Scanning folder: ${scanFolder || '(root)'}`);
    const filesToInsert = [];
    
    // 6. Scan Azure - simple recursive scan
    const scanDir = async (dirClient, relativePath = '') => {
      try {
        for await (const item of dirClient.listFilesAndDirectories()) {
          const itemPath = relativePath ? `${relativePath}/${item.name}` : item.name;
          
          if (item.kind === 'directory') {
            await scanDir(dirClient.getDirectoryClient(item.name), itemPath);
          } else {
            results.scanned++;
            // Always store with firm folder prefix for consistency
            const fullPath = scanFolder ? `${scanFolder}/${itemPath}` : `${firmFolder}/${itemPath}`;
            
            // Skip if already exists
            if (existingPaths.has(fullPath)) {
              results.updated++;
              continue;
            }
            
            // Get file size
            let size = 0;
            try {
              const props = await dirClient.getFileClient(item.name).getProperties();
              size = props.contentLength || 0;
            } catch (e) { /* ignore */ }
            
            // Match to matter
            const matter = matchMatter(relativePath);
            if (matter) results.matched++;
            
            // Queue for insert
            filesToInsert.push({
              name: item.name,
              path: fullPath,
              folder: relativePath,
              size,
              matterId: matter?.id || null,
              ownerId: matter?.responsible_attorney || null
            });
            
            // Progress log every 100 files
            if (results.scanned % 100 === 0) {
              console.log(`[SCAN] Progress: ${results.scanned} scanned, ${filesToInsert.length} to add`);
            }
          }
        }
      } catch (err) {
        results.errors.push(`${relativePath}: ${err.message}`);
      }
    };
    
    // Start scan
    try {
      await scanDir(shareClient.getDirectoryClient(scanFolder), '');
    } catch (e) {
      console.log(`[SCAN] Scan folder error: ${e.message}`);
      results.errors.push(`Scan error: ${e.message}`);
    }
    
    console.log(`[SCAN] Scan complete. ${filesToInsert.length} new files to add.`);
    
    // 6. Batch insert new documents (much faster than one-by-one)
    const BATCH_SIZE = 50;
    for (let i = 0; i < filesToInsert.length; i += BATCH_SIZE) {
      const batch = filesToInsert.slice(i, i + BATCH_SIZE);
      
      for (const file of batch) {
        try {
          const ext = file.name.split('.').pop()?.toLowerCase() || '';
          const mimeType = {
            // Documents
            pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            txt: 'text/plain', rtf: 'application/rtf', csv: 'text/csv',
            // Images
            jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', tiff: 'image/tiff', bmp: 'image/bmp',
            // Email
            msg: 'application/vnd.ms-outlook', eml: 'message/rfc822',
            // Archives
            zip: 'application/zip', rar: 'application/x-rar-compressed', '7z': 'application/x-7z-compressed',
            // Other
            html: 'text/html', htm: 'text/html', xml: 'text/xml', json: 'application/json'
          }[ext] || 'application/octet-stream';
          
          await query(`
            INSERT INTO documents (firm_id, matter_id, owner_id, name, original_name, path, folder_path, type, size, privacy_level, status, storage_location, external_path, uploaded_at)
            VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, 'final', 'azure', $5, NOW())
            ON CONFLICT (firm_id, path) DO NOTHING
          `, [firmId, file.matterId, file.ownerId, file.name, file.path, file.folder, mimeType, file.size, file.matterId ? 'team' : 'firm']);
          results.added++;
        } catch (e) {
          results.errors.push(`${file.name}: ${e.message}`);
        }
      }
      
      if (i + BATCH_SIZE < filesToInsert.length) {
        console.log(`[SCAN] Inserted ${i + batch.length}/${filesToInsert.length} documents`);
      }
    }
    
    // 7. Fix ownership for any docs with matter but no owner
    await query(`
      UPDATE documents d SET owner_id = m.responsible_attorney
      FROM matters m
      WHERE d.matter_id = m.id AND d.firm_id = $1 AND d.owner_id IS NULL AND m.responsible_attorney IS NOT NULL
    `, [firmId]);
    
    // 8. Get final counts
    const stats = await query(`SELECT COUNT(*) as total, COUNT(matter_id) as matched FROM documents WHERE firm_id = $1`, [firmId]);
    
    const message = `Scan complete: ${results.scanned} files scanned, ${results.added} added, ${results.matched} matched to matters.`;
    console.log(`[SCAN] ${message}`);
    
    res.json({
      success: true,
      message,
      scanned: results.scanned,
      added: results.added,
      matched: results.matched,
      total: parseInt(stats.rows[0]?.total || 0),
      errors: results.errors.slice(0, 10) // Only return first 10 errors
    });
    
  } catch (error) {
    console.error('[SCAN] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// RESCAN UNMATCHED - Re-match documents after adding new matters
// ============================================
router.post('/firms/:firmId/rescan-unmatched', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    console.log(`[RESCAN] Re-matching unmatched documents for firm ${firmId}`);
    
    // Load current matters
    const mattersResult = await query(`
      SELECT id, LOWER(name) as name, LOWER(number) as number, responsible_attorney
      FROM matters WHERE firm_id = $1
    `, [firmId]);
    
    const matterByName = new Map();
    const matterByNumber = new Map();
    for (const m of mattersResult.rows) {
      if (m.name) matterByName.set(m.name, m);
      if (m.number) matterByNumber.set(m.number, m);
    }
    
    // Simple matcher
    const matchMatter = (folderPath) => {
      if (!folderPath) return null;
      const parts = folderPath.toLowerCase().split('/').filter(p => p);
      for (const part of parts) {
        if (matterByNumber.has(part)) return matterByNumber.get(part);
        if (matterByName.has(part)) return matterByName.get(part);
        if (part.includes(' - ')) {
          const suffix = part.split(' - ').pop().trim();
          if (matterByName.has(suffix)) return matterByName.get(suffix);
        }
      }
      return null;
    };
    
    // Get unmatched documents
    const unmatched = await query(`
      SELECT id, folder_path FROM documents WHERE firm_id = $1 AND matter_id IS NULL
    `, [firmId]);
    
    let matched = 0;
    for (const doc of unmatched.rows) {
      const matter = matchMatter(doc.folder_path);
      if (matter) {
        await query(`
          UPDATE documents SET matter_id = $2, owner_id = COALESCE(owner_id, $3), privacy_level = 'team'
          WHERE id = $1
        `, [doc.id, matter.id, matter.responsible_attorney]);
        matched++;
      }
    }
    
    // Also fix ownership
    await query(`
      UPDATE documents d SET owner_id = m.responsible_attorney
      FROM matters m
      WHERE d.matter_id = m.id AND d.firm_id = $1 AND d.owner_id IS NULL AND m.responsible_attorney IS NOT NULL
    `, [firmId]);
    
    const message = `Rescan complete: checked ${unmatched.rows.length} unmatched documents, matched ${matched} to matters.`;
    console.log(`[RESCAN] ${message}`);
    
    res.json({ success: true, message, checked: unmatched.rows.length, matched });
    
  } catch (error) {
    console.error('[RESCAN] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET UNMATCHED DOCUMENTS - List documents that need manual matching
// ============================================
router.get('/firms/:firmId/unmatched-documents', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    const { limit = 100, offset = 0 } = req.query;
    
    // Get documents without matter assignment
    const result = await query(`
      SELECT 
        d.id, d.name, d.folder_path, d.path, d.size, d.type,
        d.uploaded_at, d.privacy_level, d.storage_location
      FROM documents d
      WHERE d.firm_id = $1 AND d.matter_id IS NULL
      ORDER BY d.folder_path, d.name
      LIMIT $2 OFFSET $3
    `, [firmId, parseInt(limit), parseInt(offset)]);
    
    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) as count FROM documents WHERE firm_id = $1 AND matter_id IS NULL',
      [firmId]
    );
    
    // Group by folder for easier viewing
    const byFolder = {};
    for (const doc of result.rows) {
      const folder = doc.folder_path || '/';
      if (!byFolder[folder]) {
        byFolder[folder] = [];
      }
      byFolder[folder].push({
        id: doc.id,
        name: doc.name,
        size: doc.size,
        type: doc.type,
        uploadedAt: doc.uploaded_at
      });
    }
    
    res.json({
      totalUnmatched: parseInt(countResult.rows[0].count),
      documentsReturned: result.rows.length,
      byFolder,
      hint: 'To match these documents, either: 1) Create matters with matching names, then run rescan-unmatched, or 2) Use the manual-match endpoint to link specific documents to matters'
    });
    
  } catch (error) {
    console.error('Get unmatched documents error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// MANUAL MATCH - Manually link documents to a matter
// ============================================
router.post('/firms/:firmId/manual-match', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    const { documentIds, matterId, folderPath } = req.body;
    
    if (!matterId) {
      return res.status(400).json({ error: 'matterId is required' });
    }
    
    if (!documentIds && !folderPath) {
      return res.status(400).json({ error: 'Either documentIds array or folderPath is required' });
    }
    
    // Verify matter exists
    const matterResult = await query(
      'SELECT id, name, responsible_attorney FROM matters WHERE id = $1 AND firm_id = $2',
      [matterId, firmId]
    );
    
    if (matterResult.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }
    
    const matter = matterResult.rows[0];
    let updatedCount = 0;
    
    if (documentIds && documentIds.length > 0) {
      // Match specific documents by ID
      const updateResult = await query(`
        UPDATE documents SET
          matter_id = $2,
          owner_id = COALESCE(owner_id, $3),
          privacy_level = 'team',
          updated_at = NOW()
        WHERE id = ANY($1) AND firm_id = $4
        RETURNING id
      `, [documentIds, matterId, matter.responsible_attorney, firmId]);
      
      updatedCount = updateResult.rows.length;
    } else if (folderPath) {
      // Match all documents in a folder path
      const updateResult = await query(`
        UPDATE documents SET
          matter_id = $2,
          owner_id = COALESCE(owner_id, $3),
          privacy_level = 'team',
          updated_at = NOW()
        WHERE firm_id = $4 
          AND matter_id IS NULL
          AND (folder_path = $1 OR folder_path LIKE $1 || '/%')
        RETURNING id
      `, [folderPath, matterId, matter.responsible_attorney, firmId]);
      
      updatedCount = updateResult.rows.length;
    }
    
    logAudit('MANUAL_MATCH', `Manually matched ${updatedCount} documents to matter "${matter.name}"`, req.ip);
    
    res.json({
      success: true,
      message: `Matched ${updatedCount} documents to matter "${matter.name}"`,
      updatedCount,
      matterId,
      matterName: matter.name
    });
    
  } catch (error) {
    console.error('Manual match error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
