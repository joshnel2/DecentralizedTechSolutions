import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query } from '../db/connection.js';

const router = Router();

// Admin credentials from environment variables (set these in production!)
// To generate a password hash: node -e "require('bcryptjs').hash('yourpassword', 12).then(console.log)"
const ADMIN_USERNAME = process.env.SECURE_ADMIN_USERNAME;
const ADMIN_PASSWORD_HASH = process.env.SECURE_ADMIN_PASSWORD_HASH;
const ADMIN_JWT_SECRET = process.env.SECURE_ADMIN_JWT_SECRET || process.env.JWT_SECRET;

// Validate admin configuration on startup
if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH) {
  console.warn('[SECURITY WARNING] Secure admin credentials not configured. Set SECURE_ADMIN_USERNAME and SECURE_ADMIN_PASSWORD_HASH environment variables.');
}

// Rate limiting for security
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

// Cleanup old rate limit entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, attempts] of loginAttempts.entries()) {
    if (now - attempts.lastAttempt > LOCKOUT_TIME) {
      loginAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000);

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

// Secure admin authentication middleware - now uses JWT
const requireSecureAdmin = (req, res, next) => {
  const authHeader = req.headers['x-admin-auth'];
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(authHeader, ADMIN_JWT_SECRET);
    
    if (decoded.type !== 'secure_admin') {
      return res.status(401).json({ error: 'Invalid admin token' });
    }

    req.adminAuth = true;
    req.adminUser = decoded.username;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired' });
    }
    return res.status(401).json({ error: 'Invalid admin session' });
  }
};

// ============================================
// AUTHENTICATION
// ============================================

// Secure admin login verification
router.post('/verify', async (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';

  // Check if admin is configured
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH) {
    logAudit('LOGIN_FAILED', 'Admin credentials not configured', ip);
    return res.status(503).json({ error: 'Admin access not configured' });
  }

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

  // Verify username using constant-time comparison
  const usernameValid = username && username.length === ADMIN_USERNAME.length &&
    crypto.timingSafeEqual(Buffer.from(username), Buffer.from(ADMIN_USERNAME));

  // Verify password using bcrypt (secure password hashing)
  let passwordValid = false;
  if (password && usernameValid) {
    try {
      passwordValid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    } catch (e) {
      // Invalid hash format
      passwordValid = false;
    }
  }

  if (usernameValid && passwordValid) {
    // Reset attempts on success
    loginAttempts.delete(ip);
    logAudit('LOGIN_SUCCESS', 'Secure admin authenticated', ip);
    
    // Generate signed JWT token
    const token = jwt.sign(
      { 
        type: 'secure_admin',
        username: username,
        iat: Math.floor(Date.now() / 1000)
      },
      ADMIN_JWT_SECRET,
      { expiresIn: '2h' } // Token expires in 2 hours
    );
    
    res.json({ 
      success: true,
      message: 'Authentication successful',
      token: token
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

router.delete('/firms/:id', requireSecureAdmin, async (req, res) => {
  try {
    // First get firm name for audit
    const firm = await query('SELECT name FROM firms WHERE id = $1', [req.params.id]);
    
    const result = await query(
      'DELETE FROM firms WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Firm not found' });
    }

    logAudit('DELETE_FIRM', `Deleted firm: ${firm.rows[0]?.name || req.params.id}`, req.ip);

    res.json({ message: 'Firm deleted successfully' });
  } catch (error) {
    console.error('Delete firm error:', error);
    res.status(500).json({ error: 'Failed to delete firm. It may have associated users.' });
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

export default router;
