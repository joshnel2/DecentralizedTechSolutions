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
             (SELECT COUNT(*) FROM users WHERE firm_id = f.id) as users_count,
             (SELECT COUNT(*) FROM documents WHERE firm_id = f.id) as documents_count
      FROM firms f
      ORDER BY f.created_at DESC
    `);

    res.json(result.rows.map(f => ({
      id: f.id,
      name: f.name,
      domain: f.website || f.email?.split('@')[1] || null,
      status: f.is_active !== false ? 'active' : 'suspended',
      users_count: parseInt(f.users_count) || 0,
      documents_count: parseInt(f.documents_count) || 0,
      subscription_tier: 'professional',
      created_at: f.created_at,
      azure_folder: f.azure_folder || `firm-${f.id}`,
      drive_settings: f.drive_settings || {}
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
// SCAN JOB STORAGE - Track background scan progress
// ============================================
const scanJobs = new Map(); // firmId -> { status, progress, results, startedAt, ... }

// Get scan job status
router.get('/firms/:firmId/scan-status', requireSecureAdmin, async (req, res) => {
  const { firmId } = req.params;
  const job = scanJobs.get(firmId);
  
  if (!job) {
    return res.json({ status: 'idle', message: 'No scan running or completed' });
  }
  
  res.json(job);
});

// Cancel a running scan
router.post('/firms/:firmId/scan-cancel', requireSecureAdmin, async (req, res) => {
  const { firmId } = req.params;
  const job = scanJobs.get(firmId);
  
  if (job && job.status === 'running') {
    job.cancelled = true;
    job.status = 'cancelled';
    res.json({ success: true, message: 'Scan cancellation requested' });
  } else {
    res.json({ success: false, message: 'No running scan to cancel' });
  }
});

// Clear/reset scan job (for stuck scans)
router.post('/firms/:firmId/scan-reset', requireSecureAdmin, async (req, res) => {
  const { firmId } = req.params;
  scanJobs.delete(firmId);
  console.log(`[SCAN] Reset scan job for firm ${firmId}`);
  res.json({ success: true, message: 'Scan job cleared. You can start a new scan.' });
});

// ============================================
// SCAN DOCUMENTS - Simple Manifest-Based Scanner
// ============================================
// Uses Clio document manifest (from API) as source of truth
// The manifest already has matter_id mapped from Clio
// 
// How it works:
// 1. Get document list from clio_document_manifest (already has matter_id)
// 2. Find matching files in Azure by filename + size
// 3. Create document records with matter_id FROM MANIFEST
// 4. No folder name guessing - Clio told us the relationships
router.post('/firms/:firmId/scan-documents', requireSecureAdmin, async (req, res) => {
  const { firmId } = req.params;
  const { dryRun } = req.body || {};
  
  // Check if a scan is already running for this firm
  const existingJob = scanJobs.get(firmId);
  if (existingJob && existingJob.status === 'running') {
    return res.json({
      success: false,
      message: 'A scan is already running for this firm',
      status: 'already_running',
      job: existingJob
    });
  }
  
  // Initialize scan job
  const job = {
    status: 'running',
    startedAt: new Date().toISOString(),
    phase: 'initializing',
    progress: { processed: 0, matched: 0, created: 0, total: 0, percent: 0 },
    results: null,
    error: null,
    cancelled: false,
    dryRun: !!dryRun
  };
  scanJobs.set(firmId, job);
  
  console.log(`[SCAN] Starting manifest-based scan for firm ${firmId}`);
  console.log(`[SCAN] Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  
  // Return immediately - scan runs in background
  res.json({
    success: true,
    message: 'Scan started. Uses Clio manifest for matter assignments.',
    status: 'started',
    job
  });
  
  // Run scan in background
  runManifestScan(firmId, dryRun, job).catch(err => {
    console.error('[SCAN] Manifest scan error:', err);
    job.status = 'error';
    job.error = err.message;
  });
});

// ============================================
// ENTERPRISE-SCALE SCAN - Handles 1M+ files
// ============================================
// - Uses database temp table instead of memory
// - Streams Azure files directly to database
// - SQL-based matching (no memory limits)
// - Resumable (stores progress in database)
async function runManifestScan(firmId, dryRun, job) {
  // Replace dashes with underscores for valid PostgreSQL table name
  const safeId = firmId.replace(/-/g, '_');
  const tempTable = `azure_files_${safeId}_${Date.now()}`;
  
  try {
    const results = { 
      processed: 0, 
      matched: 0, 
      created: 0, 
      skipped: 0,
      alreadyMatched: 0,
      missing: 0,
      errors: [] 
    };
    
    // ============================================
    // 1. CHECK AZURE CONFIGURATION
    // ============================================
    job.phase = 'checking_azure';
    const { getShareClient, isAzureConfigured } = await import('../utils/azureStorage.js');
    if (!(await isAzureConfigured())) {
      throw new Error('Azure Storage not configured. Go to Platform Settings.');
    }
    
    // ============================================
    // 2. GET MANIFEST STATS
    // ============================================
    job.phase = 'loading_manifest';
    const statsResult = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE match_status = 'matched') as already_matched,
        COUNT(*) FILTER (WHERE match_status IS NULL OR match_status != 'matched') as pending
      FROM clio_document_manifest
      WHERE firm_id = $1
    `, [firmId]);
    
    const manifestStats = statsResult.rows[0];
    const totalManifest = parseInt(manifestStats.total);
    const alreadyMatched = parseInt(manifestStats.already_matched);
    const pendingCount = parseInt(manifestStats.pending);
    
    job.progress.manifestTotal = totalManifest;
    job.progress.alreadyMatched = alreadyMatched;
    job.progress.pending = pendingCount;
    
    console.log(`[SCAN] Manifest: ${totalManifest.toLocaleString()} total, ${alreadyMatched.toLocaleString()} already matched, ${pendingCount.toLocaleString()} pending`);
    
    if (totalManifest === 0) {
      throw new Error('No documents in manifest. Run "Fetch Document List" from Clio first.');
    }
    
    if (pendingCount === 0) {
      job.status = 'completed';
      job.phase = 'done';
      job.results = {
        success: true,
        message: `All ${alreadyMatched.toLocaleString()} documents already matched. Nothing to do.`,
        alreadyMatched,
        processed: 0
      };
      return;
    }
    
    // ============================================
    // 3. CREATE TEMP TABLE FOR AZURE FILES
    // ============================================
    job.phase = 'preparing';
    console.log(`[SCAN] Creating temp table ${tempTable}...`);
    
    await query(`
      CREATE UNLOGGED TABLE ${tempTable} (
        id SERIAL PRIMARY KEY,
        name_lower VARCHAR(500),
        path TEXT,
        name VARCHAR(500)
      )
    `);
    
    // ============================================
    // 4. STREAM AZURE FILES TO DATABASE
    // ============================================
    job.phase = 'scanning_azure';
    const shareClient = await getShareClient();
    const firmFolder = `firm-${firmId}`;
    
    let azureFileCount = 0;
    let insertBatch = [];
    const BATCH_SIZE = 1000; // Insert 1000 rows at a time
    let lastProgressUpdate = Date.now();
    
    const flushBatch = async () => {
      if (insertBatch.length === 0) return;
      
      // Bulk insert using VALUES
      const values = insertBatch.map((f, i) => 
        `($${i*3+1}, $${i*3+2}, $${i*3+3})`
      ).join(',');
      const params = insertBatch.flatMap(f => [f.nameLower, f.path, f.name]);
      
      await query(`
        INSERT INTO ${tempTable} (name_lower, path, name) VALUES ${values}
      `, params);
      
      insertBatch = [];
    };
    
    const scanAzureDir = async (dirClient, basePath = '') => {
      if (job.cancelled) return;
      try {
        for await (const item of dirClient.listFilesAndDirectories()) {
          if (job.cancelled) return;
          const itemPath = basePath ? `${basePath}/${item.name}` : item.name;
          
          if (item.kind === 'directory') {
            await scanAzureDir(dirClient.getDirectoryClient(item.name), itemPath);
          } else {
            azureFileCount++;
            
            insertBatch.push({
              nameLower: item.name.toLowerCase(),
              path: `${firmFolder}/${itemPath}`,
              name: item.name
            });
            
            // Flush batch when full
            if (insertBatch.length >= BATCH_SIZE) {
              await flushBatch();
            }
            
            // Progress update every 3 seconds
            if (Date.now() - lastProgressUpdate > 3000) {
              job.progress.azureScanned = azureFileCount;
              console.log(`[SCAN] Azure: ${azureFileCount.toLocaleString()} files indexed...`);
              lastProgressUpdate = Date.now();
            }
          }
        }
      } catch (e) {
        console.log(`[SCAN] Error scanning ${basePath}: ${e.message}`);
      }
    };
    
    console.log(`[SCAN] Scanning Azure files in ${firmFolder}...`);
    await scanAzureDir(shareClient.getDirectoryClient(firmFolder));
    await flushBatch(); // Final batch
    
    job.progress.azureTotal = azureFileCount;
    console.log(`[SCAN] Indexed ${azureFileCount.toLocaleString()} Azure files to database`);
    
    // Create index for fast lookups
    console.log(`[SCAN] Creating index...`);
    await query(`CREATE INDEX ON ${tempTable} (name_lower)`);
    
    // ============================================
    // 5. SQL-BASED MATCHING (no memory limits!)
    // ============================================
    job.phase = 'matching';
    console.log(`[SCAN] Matching manifest entries to Azure files...`);
    
    // MIME type lookup
    const getMimeType = (filename) => {
      const ext = filename?.split('.').pop()?.toLowerCase() || '';
      return {
        pdf: 'application/pdf', doc: 'application/msword', 
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel', 
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ppt: 'application/vnd.ms-powerpoint', 
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        txt: 'text/plain', rtf: 'application/rtf', csv: 'text/csv',
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
        msg: 'application/vnd.ms-outlook', eml: 'message/rfc822',
        zip: 'application/zip', html: 'text/html', xml: 'text/xml', json: 'application/json'
      }[ext] || 'application/octet-stream';
    };
    
    // Process in chunks - no OFFSET needed since processed rows get filtered out
    const CHUNK_SIZE = 1000;
    let hasMore = true;
    
    while (hasMore && !job.cancelled) {
      // Get next chunk of unmatched manifest entries WITH their Azure matches
      // Rows get filtered out after processing (match_status updated), so always LIMIT from start
      const chunkResult = await query(`
        SELECT 
          m.id, m.name, m.size, m.matter_id, m.owner_id, m.content_type,
          af.path as azure_path, af.name as azure_name
        FROM clio_document_manifest m
        LEFT JOIN ${tempTable} af ON LOWER(m.name) = af.name_lower
        WHERE m.firm_id = $1 
          AND (m.match_status IS NULL OR m.match_status NOT IN ('matched', 'not_found'))
        ORDER BY m.id
        LIMIT $2
      `, [firmId, CHUNK_SIZE]);
      
      const chunk = chunkResult.rows;
      if (chunk.length === 0) {
        hasMore = false;
        break;
      }
      
      // No offset increment needed - processed rows get filtered out by match_status
      
      for (const entry of chunk) {
        if (job.cancelled) throw new Error('Scan cancelled by user');
        results.processed++;
        
        try {
          if (!entry.azure_path) {
            // No match found in Azure
            results.missing++;
            if (!dryRun) {
              await query(`
                UPDATE clio_document_manifest SET match_status = 'not_found' WHERE id = $1
              `, [entry.id]);
            }
            continue;
          }
          
          results.matched++;
          
          if (!dryRun) {
            const mimeType = entry.content_type || getMimeType(entry.name);
            const folderPath = entry.azure_path.split('/').slice(0, -1).join('/');
            
            // Ensure UUIDs are valid or null (not "0" or empty string)
            const isValidUuid = (val) => val && typeof val === 'string' && val.length > 10 && val !== '0';
            const matterId = isValidUuid(entry.matter_id) ? entry.matter_id : null;
            const ownerId = isValidUuid(entry.owner_id) ? entry.owner_id : null;
            
            // Upsert document
            const insertResult = await query(`
              INSERT INTO documents (
                firm_id, matter_id, owner_id, name, original_name,
                path, folder_path, type, size, privacy_level,
                status, storage_location, external_path, uploaded_at
              ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, 'final', 'azure', $5, NOW())
              ON CONFLICT (firm_id, path) DO UPDATE SET
                matter_id = COALESCE(EXCLUDED.matter_id, documents.matter_id),
                updated_at = NOW()
              RETURNING (xmax = 0) as was_inserted
            `, [
              firmId,
              matterId,
              ownerId,
              entry.name,
              entry.azure_path,
              folderPath,
              mimeType,
              entry.size || 0,
              matterId ? 'team' : 'firm'
            ]);
            
            if (insertResult.rows[0]?.was_inserted) {
              results.created++;
            } else {
              results.skipped++;
            }
            
            // Mark manifest as matched
            await query(`
              UPDATE clio_document_manifest 
              SET match_status = 'matched', matched_azure_path = $1 
              WHERE id = $2
            `, [entry.azure_path, entry.id]);
          }
        } catch (e) {
          if (results.errors.length < 50) {
            results.errors.push(`${entry.name}: ${e.message}`);
          }
        }
      }
      
      // Progress update
      job.progress.processed = results.processed;
      job.progress.matched = results.matched;
      job.progress.created = results.created;
      job.progress.percent = Math.round((results.processed / pendingCount) * 100);
      
      console.log(`[SCAN] Progress: ${results.processed.toLocaleString()}/${pendingCount.toLocaleString()} (${job.progress.percent}%)`);
    }
    
    results.alreadyMatched = alreadyMatched;
    
    // ============================================
    // 6. CLEANUP & FINAL STATS
    // ============================================
    job.phase = 'finalizing';
    
    // Drop temp table
    console.log(`[SCAN] Cleaning up temp table...`);
    await query(`DROP TABLE IF EXISTS ${tempTable}`);
    
    const finalStats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(matter_id) as with_matter,
        COUNT(*) - COUNT(matter_id) as without_matter
      FROM documents WHERE firm_id = $1
    `, [firmId]);
    
    const stats = finalStats.rows[0];
    
    const message = dryRun
      ? `DRY RUN: Would process ${results.processed.toLocaleString()} entries. ${results.matched.toLocaleString()} matched, ${results.missing.toLocaleString()} not found.`
      : `Scan complete: ${results.created.toLocaleString()} documents created, ${results.matched.toLocaleString()} matched to Azure files.`;
    
    console.log(`[SCAN] ${message}`);
    
    // Update job with final results
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.phase = 'done';
    job.progress.percent = 100;
    job.results = {
      success: true,
      message,
      dryRun: !!dryRun,
      manifestTotal: totalManifest,
      azureFiles: azureFileCount,
      alreadyMatched: results.alreadyMatched,
      processed: results.processed,
      matched: results.matched,
      created: results.created,
      skipped: results.skipped,
      missing: results.missing,
      totalInDatabase: parseInt(stats.total || 0),
      withMatter: parseInt(stats.with_matter || 0),
      withoutMatter: parseInt(stats.without_matter || 0),
      errors: results.errors.slice(0, 20)
    };
    
    console.log(`[SCAN] Enterprise scan completed for firm ${firmId}`);
    
  } catch (error) {
    console.error('[SCAN] Scan error:', error);
    job.status = error.message === 'Scan cancelled by user' ? 'cancelled' : 'error';
    job.error = error.message;
    job.completedAt = new Date().toISOString();
    
    // Clean up temp table on error
    try {
      await query(`DROP TABLE IF EXISTS ${tempTable}`);
    } catch (e) {
      console.log('[SCAN] Failed to clean up temp table:', e.message);
    }
  }
}

// ============================================
// FOLDER-BASED SCAN - Simple scan matching folders to matters
// ============================================
// This is the simpler approach: each folder = a matter name
// No Clio manifest required - just scans Azure and matches by folder name
router.post('/firms/:firmId/scan-azure-folders', requireSecureAdmin, async (req, res) => {
  const { firmId } = req.params;
  const { dryRun, includeMetadata } = req.body || {};
  
  // Check if a scan is already running
  const existingJob = scanJobs.get(firmId);
  if (existingJob && existingJob.status === 'running') {
    return res.json({
      success: false,
      message: 'A scan is already running for this firm',
      status: 'already_running'
    });
  }
  
  // Initialize scan job
  const job = {
    status: 'running',
    startedAt: new Date().toISOString(),
    phase: 'initializing',
    progress: { scanned: 0, matched: 0, created: 0, total: 0, percent: 0 },
    results: null,
    error: null,
    cancelled: false,
    dryRun: !!dryRun,
    scanType: 'folder-based'
  };
  scanJobs.set(firmId, job);
  
  console.log(`[FOLDER SCAN] Starting folder-based scan for firm ${firmId}`);
  console.log(`[FOLDER SCAN] Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}, Include metadata: ${includeMetadata}`);
  
  // Return immediately - scan runs in background
  res.json({
    success: true,
    message: 'Folder-based scan started. Matches folder names to matter names.',
    status: 'started',
    job
  });
  
  // Run scan in background
  runFolderBasedScan(firmId, dryRun, includeMetadata, job).catch(err => {
    console.error('[FOLDER SCAN] Error:', err);
    job.status = 'error';
    job.error = err.message;
  });
});

// ============================================
// BEST PRACTICES FOR CLIO MIGRATIONS (Industry Research)
// ============================================
// 
// How top case management systems migrate from Clio:
//
// 1. FILEVINE / SMOKEBALL APPROACH (Full API):
//    - Fetch ALL metadata via Clio API first
//    - Build complete manifest with matter/document relationships
//    - Stream files directly via API
//    - Preserves: versions, timestamps, permissions, custom fields
//    - Con: Slow due to API rate limits (5 req/sec)
//
// 2. MYCASE / PRACTICEPANTHER APPROACH (Hybrid):
//    - API for structured data (matters, contacts, time)
//    - Robocopy/rsync for bulk file transfer
//    - Post-scan to match files to matters
//    - Pro: Fast for large volumes (100K+ files)
//    - Con: Relies on folder naming conventions
//
// 3. OUR APPROACH (Best of Both):
//    - OPTION A: Full API streaming (scan-documents endpoint)
//      Uses clio_document_manifest for precise matching
//    - OPTION B: Folder-based scan (scan-azure-folders endpoint)
//      Simple folder=matter matching, no API needed
//
// KEY METADATA TO PRESERVE:
//    - matter_id: Which matter the document belongs to
//    - owner_id: Who uploaded/created it (responsible attorney)
//    - timestamps: created_at, updated_at from Clio
//    - versions: Document version history (if available)
//    - content_type: MIME type for proper viewing
//    - original_path: Folder structure from source system
//
// ============================================

// Background folder-based scan function
async function runFolderBasedScan(firmId, dryRun, includeMetadata, job) {
  try {
    const results = {
      scanned: 0,
      matched: 0,
      created: 0,
      skipped: 0,
      unmatched: 0,
      errors: [],
      matchedFolders: [],
      unmatchedFolders: new Set()
    };
    
    // ============================================
    // 1. CHECK AZURE CONFIGURATION
    // ============================================
    job.phase = 'checking_azure';
    const { getShareClient, isAzureConfigured } = await import('../utils/azureStorage.js');
    if (!(await isAzureConfigured())) {
      throw new Error('Azure Storage not configured. Go to Platform Settings.');
    }
    
    // ============================================
    // 2. LOAD MATTERS FOR MATCHING
    // ============================================
    job.phase = 'loading_matters';
    const mattersResult = await query(`
      SELECT m.id, m.name, m.number, m.responsible_attorney,
             c.display_name as client_name
      FROM matters m
      LEFT JOIN clients c ON m.client_id = c.id
      WHERE m.firm_id = $1
    `, [firmId]);
    
    if (mattersResult.rows.length === 0) {
      throw new Error('No matters found. Import matters first, then scan documents.');
    }
    
    console.log(`[FOLDER SCAN] Loaded ${mattersResult.rows.length} matters for matching`);
    
    // Normalize function for Windows character handling
    const normalize = (str) => {
      if (!str) return '';
      return str.toLowerCase().replace(/[:\\/\*\?"<>\|]/g, '').replace(/\s+/g, ' ').trim();
    };
    
    // Build lookup maps for matching
    const matterByExactName = new Map();
    const matterByNormalizedName = new Map();
    const matterByNumber = new Map();
    const matterByClientMatter = new Map();
    
    for (const m of mattersResult.rows) {
      if (m.name) {
        matterByExactName.set(m.name.toLowerCase(), m);
        matterByNormalizedName.set(normalize(m.name), m);
      }
      if (m.number) {
        matterByNumber.set(m.number.toLowerCase(), m);
        matterByNormalizedName.set(normalize(m.number), m);
      }
      if (m.client_name && m.name) {
        // Clio format: "Client Name - Matter Name"
        const clioFormat = `${m.client_name} - ${m.name}`.toLowerCase();
        matterByClientMatter.set(clioFormat, m);
        matterByNormalizedName.set(normalize(clioFormat), m);
        
        // Also try just client name for root folders
        const clientLower = m.client_name.toLowerCase();
        if (!matterByExactName.has(clientLower)) {
          // Store first matter for this client (useful for client-level folders)
          matterByExactName.set(clientLower, m);
        }
      }
    }
    
    // Function to match a folder name to a matter
    const matchFolderToMatter = (folderName) => {
      if (!folderName) return null;
      
      const folderLower = folderName.toLowerCase();
      const folderNorm = normalize(folderName);
      
      // Try exact name match
      if (matterByExactName.has(folderLower)) return matterByExactName.get(folderLower);
      
      // Try "Client - Matter" format
      if (matterByClientMatter.has(folderLower)) return matterByClientMatter.get(folderLower);
      
      // Try matter number
      if (matterByNumber.has(folderLower)) return matterByNumber.get(folderLower);
      
      // Try normalized
      if (matterByNormalizedName.has(folderNorm)) return matterByNormalizedName.get(folderNorm);
      
      // Try after " - " separator (for "Client - Matter" format)
      if (folderName.includes(' - ')) {
        const afterDash = folderName.split(' - ').slice(1).join(' - ').trim();
        const afterDashLower = afterDash.toLowerCase();
        const afterDashNorm = normalize(afterDash);
        
        if (matterByExactName.has(afterDashLower)) return matterByExactName.get(afterDashLower);
        if (matterByNormalizedName.has(afterDashNorm)) return matterByNormalizedName.get(afterDashNorm);
      }
      
      return null;
    };
    
    // Function to extract matter folder from path
    // Path structure: firm-{id}/CLIENT/MATTER/file.pdf or firm-{id}/MATTER/file.pdf
    const getMatterFolderFromPath = (filePath, firmFolder) => {
      const parts = filePath.split('/').filter(p => p && p !== firmFolder);
      if (parts.length < 1) return null;
      
      // Try each folder level for a match (usually it's the first or second folder)
      for (let i = 0; i < Math.min(parts.length - 1, 3); i++) {
        const folder = parts[i];
        const matter = matchFolderToMatter(folder);
        if (matter) {
          return { folder, matter, folderPath: parts.slice(0, i + 1).join('/') };
        }
      }
      
      // If no direct match, return the first folder as unmatched
      return { folder: parts[0], matter: null, folderPath: parts[0] };
    };
    
    // ============================================
    // 3. OPTIONALLY LOAD CLIO METADATA
    // ============================================
    let clioMetadata = new Map();
    if (includeMetadata) {
      job.phase = 'loading_metadata';
      try {
        const metaResult = await query(`
          SELECT name, content_type, size, clio_created_at, clio_updated_at, owner_id
          FROM clio_document_manifest
          WHERE firm_id = $1
        `, [firmId]);
        
        for (const row of metaResult.rows) {
          clioMetadata.set(row.name.toLowerCase(), row);
        }
        console.log(`[FOLDER SCAN] Loaded ${clioMetadata.size} metadata entries from Clio manifest`);
      } catch (e) {
        console.log(`[FOLDER SCAN] No Clio metadata available: ${e.message}`);
      }
    }
    
    // ============================================
    // 4. SCAN AZURE AND CREATE DOCUMENTS
    // ============================================
    job.phase = 'scanning_azure';
    const shareClient = await getShareClient();
    const firmFolder = `firm-${firmId}`;
    
    // MIME type lookup
    const getMimeType = (filename) => {
      const ext = filename?.split('.').pop()?.toLowerCase() || '';
      return {
        pdf: 'application/pdf', doc: 'application/msword', 
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel', 
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ppt: 'application/vnd.ms-powerpoint', 
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        txt: 'text/plain', rtf: 'application/rtf', csv: 'text/csv',
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
        msg: 'application/vnd.ms-outlook', eml: 'message/rfc822',
        zip: 'application/zip', html: 'text/html', xml: 'text/xml', json: 'application/json'
      }[ext] || 'application/octet-stream';
    };
    
    let lastProgressUpdate = Date.now();
    const folderMatchCounts = new Map(); // Track files per matched folder
    
    // Recursive function to scan directories
    const scanDirectory = async (dirClient, basePath = '') => {
      if (job.cancelled) return;
      
      try {
        for await (const item of dirClient.listFilesAndDirectories()) {
          if (job.cancelled) return;
          const itemPath = basePath ? `${basePath}/${item.name}` : item.name;
          
          if (item.kind === 'directory') {
            // Recurse into subdirectory
            await scanDirectory(dirClient.getDirectoryClient(item.name), itemPath);
          } else {
            // Process file
            results.scanned++;
            const fullPath = `${firmFolder}/${itemPath}`;
            const fileName = item.name;
            
            // Find matter from folder structure
            const matchInfo = getMatterFolderFromPath(itemPath, firmFolder);
            
            if (matchInfo && matchInfo.matter) {
              results.matched++;
              
              // Track folder match counts
              const folderKey = matchInfo.folderPath;
              folderMatchCounts.set(folderKey, (folderMatchCounts.get(folderKey) || 0) + 1);
              
              if (!dryRun) {
                try {
                  // Get optional metadata from Clio manifest
                  const meta = clioMetadata.get(fileName.toLowerCase()) || {};
                  const mimeType = meta.content_type || getMimeType(fileName);
                  const folderPath = fullPath.split('/').slice(0, -1).join('/');
                  
                  // Upsert document
                  const insertResult = await query(`
                    INSERT INTO documents (
                      firm_id, matter_id, owner_id, name, original_name,
                      path, folder_path, type, size, privacy_level,
                      status, storage_location, external_path, uploaded_at
                    ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, 'team', 'final', 'azure', $5, NOW())
                    ON CONFLICT (firm_id, path) DO UPDATE SET
                      matter_id = COALESCE(EXCLUDED.matter_id, documents.matter_id),
                      updated_at = NOW()
                    RETURNING (xmax = 0) as was_inserted
                  `, [
                    firmId,
                    matchInfo.matter.id,
                    meta.owner_id || matchInfo.matter.responsible_attorney,
                    fileName,
                    fullPath,
                    folderPath,
                    mimeType,
                    meta.size || item.properties?.contentLength || 0
                  ]);
                  
                  if (insertResult.rows[0]?.was_inserted) {
                    results.created++;
                  } else {
                    results.skipped++;
                  }
                } catch (e) {
                  if (results.errors.length < 50) {
                    results.errors.push(`${fileName}: ${e.message}`);
                  }
                }
              }
            } else {
              results.unmatched++;
              if (matchInfo && matchInfo.folder) {
                results.unmatchedFolders.add(matchInfo.folder);
              }
            }
            
            // Progress update every 2 seconds
            if (Date.now() - lastProgressUpdate > 2000) {
              job.progress.scanned = results.scanned;
              job.progress.matched = results.matched;
              job.progress.created = results.created;
              console.log(`[FOLDER SCAN] Progress: ${results.scanned} scanned, ${results.matched} matched, ${results.created} created`);
              lastProgressUpdate = Date.now();
            }
          }
        }
      } catch (e) {
        console.log(`[FOLDER SCAN] Error scanning ${basePath}: ${e.message}`);
      }
    };
    
    console.log(`[FOLDER SCAN] Scanning Azure folder: ${firmFolder}`);
    await scanDirectory(shareClient.getDirectoryClient(firmFolder));
    
    // ============================================
    // 5. BUILD RESULTS
    // ============================================
    job.phase = 'finalizing';
    
    // Build matched folders summary
    const matchedFoldersSummary = [];
    for (const [folder, count] of folderMatchCounts.entries()) {
      const matter = matchFolderToMatter(folder.split('/')[0]) || matchFolderToMatter(folder);
      matchedFoldersSummary.push({
        folder,
        matterName: matter?.name || 'Unknown',
        fileCount: count
      });
    }
    matchedFoldersSummary.sort((a, b) => b.fileCount - a.fileCount);
    
    // Build unmatched folders summary
    const unmatchedFoldersSummary = Array.from(results.unmatchedFolders).map(folder => ({
      folder,
      hint: 'Create a matter with this name, then rescan'
    }));
    
    // Get final document counts
    const finalStats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(matter_id) as with_matter,
        COUNT(*) - COUNT(matter_id) as without_matter
      FROM documents WHERE firm_id = $1
    `, [firmId]);
    
    const stats = finalStats.rows[0];
    
    const message = dryRun
      ? `DRY RUN: Would create ${results.matched} documents from ${results.scanned} files. ${results.unmatched} files have no matching matter.`
      : `Scan complete: ${results.created} documents created, ${results.matched} matched to matters. ${results.unmatched} files unmatched.`;
    
    console.log(`[FOLDER SCAN] ${message}`);
    
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.phase = 'done';
    job.results = {
      success: true,
      message,
      dryRun: !!dryRun,
      scanned: results.scanned,
      matched: results.matched,
      created: results.created,
      skipped: results.skipped,
      unmatched: results.unmatched,
      mattersAvailable: mattersResult.rows.length,
      totalInDatabase: parseInt(stats.total || 0),
      withMatter: parseInt(stats.with_matter || 0),
      withoutMatter: parseInt(stats.without_matter || 0),
      matchedFolders: matchedFoldersSummary.slice(0, 20),
      unmatchedFolders: unmatchedFoldersSummary.slice(0, 20),
      errors: results.errors.slice(0, 20)
    };
    
  } catch (error) {
    console.error('[FOLDER SCAN] Error:', error);
    job.status = error.message === 'Scan cancelled by user' ? 'cancelled' : 'error';
    job.error = error.message;
    job.completedAt = new Date().toISOString();
  }
}

// ============================================
// RESCAN UNMATCHED - Re-match documents after adding new matters
// ============================================
// Uses the same improved matching logic as the main scan
router.post('/firms/:firmId/rescan-unmatched', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    console.log(`[RESCAN] Re-matching unmatched documents for firm ${firmId}`);
    
    // Load matters with client info for better matching
    const mattersResult = await query(`
      SELECT m.id, m.name, m.number, m.responsible_attorney,
             c.display_name as client_name
      FROM matters m
      LEFT JOIN clients c ON m.client_id = c.id
      WHERE m.firm_id = $1
    `, [firmId]);
    
    // Normalize function for Windows character handling
    const normalize = (str) => {
      if (!str) return '';
      return str.toLowerCase().replace(/[:\\/\*\?"<>\|]/g, '').replace(/\s+/g, ' ').trim();
    };
    
    // Build lookup maps
    const matterByExactName = new Map();
    const matterByNormalizedName = new Map();
    const matterByNumber = new Map();
    const matterByClientMatter = new Map();
    
    for (const m of mattersResult.rows) {
      if (m.name) {
        matterByExactName.set(m.name.toLowerCase(), m);
        matterByNormalizedName.set(normalize(m.name), m);
      }
      if (m.number) {
        matterByNumber.set(m.number.toLowerCase(), m);
        matterByNormalizedName.set(normalize(m.number), m);
      }
      if (m.client_name && m.name) {
        const clioFormat = `${m.client_name} - ${m.name}`.toLowerCase();
        matterByClientMatter.set(clioFormat, m);
        matterByNormalizedName.set(normalize(clioFormat), m);
      }
    }
    
    // Matching function - tries folder path parts
    const matchFolderPath = (folderPath) => {
      if (!folderPath) return null;
      
      // Get all path parts and try to match each
      const parts = folderPath.split('/').filter(p => p);
      
      for (const part of parts) {
        const partLower = part.toLowerCase();
        const partNorm = normalize(part);
        
        // Try all matching strategies
        if (matterByExactName.has(partLower)) return matterByExactName.get(partLower);
        if (matterByClientMatter.has(partLower)) return matterByClientMatter.get(partLower);
        if (matterByNumber.has(partLower)) return matterByNumber.get(partLower);
        if (matterByNormalizedName.has(partNorm)) return matterByNormalizedName.get(partNorm);
        
        // Try after " - " separator
        if (part.includes(' - ')) {
          const afterDash = part.split(' - ').slice(1).join(' - ').trim();
          const afterDashLower = afterDash.toLowerCase();
          const afterDashNorm = normalize(afterDash);
          
          if (matterByExactName.has(afterDashLower)) return matterByExactName.get(afterDashLower);
          if (matterByNormalizedName.has(afterDashNorm)) return matterByNormalizedName.get(afterDashNorm);
        }
      }
      
      return null;
    };
    
    // Get unmatched documents
    const unmatched = await query(`
      SELECT id, folder_path, path FROM documents 
      WHERE firm_id = $1 AND matter_id IS NULL
    `, [firmId]);
    
    console.log(`[RESCAN] Found ${unmatched.rows.length} unmatched documents`);
    
    let matched = 0;
    const matchDetails = [];
    
    for (const doc of unmatched.rows) {
      // Try folder_path first, then extract from path
      let folderToMatch = doc.folder_path;
      if (!folderToMatch && doc.path) {
        // Extract folder from path (remove filename)
        const parts = doc.path.split('/');
        parts.pop(); // Remove filename
        folderToMatch = parts.join('/');
      }
      
      const matter = matchFolderPath(folderToMatch);
      if (matter) {
        await query(`
          UPDATE documents 
          SET matter_id = $2, owner_id = COALESCE(owner_id, $3), privacy_level = 'team', updated_at = NOW()
          WHERE id = $1
        `, [doc.id, matter.id, matter.responsible_attorney]);
        matched++;
        
        if (matchDetails.length < 10) {
          matchDetails.push({ folder: folderToMatch, matterName: matter.name });
        }
      }
    }
    
    // Fix ownership for any docs with matter but no owner
    await query(`
      UPDATE documents d SET owner_id = m.responsible_attorney
      FROM matters m
      WHERE d.matter_id = m.id AND d.firm_id = $1 
        AND d.owner_id IS NULL AND m.responsible_attorney IS NOT NULL
    `, [firmId]);
    
    // Get updated stats
    const stats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(matter_id) as with_matter,
        COUNT(*) - COUNT(matter_id) as without_matter
      FROM documents WHERE firm_id = $1
    `, [firmId]);
    
    const message = `Rescan complete: checked ${unmatched.rows.length} unmatched documents, matched ${matched} to matters.`;
    console.log(`[RESCAN] ${message}`);
    
    res.json({ 
      success: true, 
      message, 
      checked: unmatched.rows.length, 
      matched,
      stillUnmatched: unmatched.rows.length - matched,
      totalDocuments: parseInt(stats.rows[0].total),
      withMatter: parseInt(stats.rows[0].with_matter),
      withoutMatter: parseInt(stats.rows[0].without_matter),
      sampleMatches: matchDetails
    });
    
  } catch (error) {
    console.error('[RESCAN] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET ORPHAN REPORT - Download list of unmatched files
// ============================================
router.get('/firms/:firmId/orphan-report', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    
    // Get all documents without matter assignment, grouped by folder
    const result = await query(`
      SELECT 
        folder_path,
        COUNT(*) as file_count,
        array_agg(name ORDER BY name) as files
      FROM documents 
      WHERE firm_id = $1 AND matter_id IS NULL
      GROUP BY folder_path
      ORDER BY folder_path
    `, [firmId]);
    
    // Get total counts
    const stats = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE matter_id IS NULL) as orphan_count,
        COUNT(*) as total_count
      FROM documents WHERE firm_id = $1
    `, [firmId]);
    
    res.json({
      firmId,
      summary: {
        orphanCount: parseInt(stats.rows[0].orphan_count),
        totalDocuments: parseInt(stats.rows[0].total_count),
        orphanFolders: result.rows.length
      },
      folders: result.rows.map(r => ({
        folder: r.folder_path || '(root)',
        fileCount: parseInt(r.file_count),
        files: r.files.slice(0, 20), // First 20 files per folder
        hasMore: r.files.length > 20
      }))
    });
    
  } catch (error) {
    console.error('[ORPHAN REPORT] Error:', error);
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

// ============================================
// MIGRATION STATUS - Industry Best Practice Report
// ============================================
// Shows what data has been migrated and what metadata was preserved
// Similar to migration reports from Filevine, Smokeball, etc.
router.get('/firms/:firmId/migration-status', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    
    // Get comprehensive migration stats
    const [
      firmResult,
      documentStats,
      manifestStats,
      matterStats,
      userStats,
      clientStats
    ] = await Promise.all([
      query('SELECT name, created_at FROM firms WHERE id = $1', [firmId]),
      
      // Document statistics
      query(`
        SELECT 
          COUNT(*) as total,
          COUNT(matter_id) as linked_to_matter,
          COUNT(owner_id) as with_owner,
          COUNT(CASE WHEN storage_location = 'azure' THEN 1 END) as in_azure,
          COUNT(CASE WHEN type IS NOT NULL AND type != 'application/octet-stream' THEN 1 END) as with_mime_type,
          COUNT(CASE WHEN size > 0 THEN 1 END) as with_size,
          COUNT(CASE WHEN folder_path IS NOT NULL THEN 1 END) as with_folder_path,
          COALESCE(SUM(size), 0) as total_size_bytes,
          MIN(uploaded_at) as first_upload,
          MAX(uploaded_at) as last_upload
        FROM documents WHERE firm_id = $1
      `, [firmId]),
      
      // Clio manifest statistics (if API migration was used)
      query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN match_status = 'matched' THEN 1 END) as matched,
          COUNT(CASE WHEN match_status = 'imported' THEN 1 END) as imported,
          COUNT(CASE WHEN match_status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN match_status = 'missing' THEN 1 END) as missing,
          COUNT(matter_id) as with_matter_id,
          COUNT(owner_id) as with_owner_id,
          COUNT(clio_created_at) as with_created_date,
          COUNT(content_type) as with_content_type
        FROM clio_document_manifest WHERE firm_id = $1
      `, [firmId]).catch(() => ({ rows: [{ total: 0 }] })),
      
      // Matter statistics
      query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'Open' THEN 1 END) as open,
          COUNT(responsible_attorney) as with_attorney,
          COUNT(client_id) as with_client
        FROM matters WHERE firm_id = $1
      `, [firmId]),
      
      // User statistics
      query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN is_active THEN 1 END) as active
        FROM users WHERE firm_id = $1
      `, [firmId]),
      
      // Client statistics
      query('SELECT COUNT(*) as total FROM clients WHERE firm_id = $1', [firmId])
    ]);
    
    if (firmResult.rows.length === 0) {
      return res.status(404).json({ error: 'Firm not found' });
    }
    
    const docs = documentStats.rows[0];
    const manifest = manifestStats.rows[0];
    const matters = matterStats.rows[0];
    const users = userStats.rows[0];
    const clients = clientStats.rows[0];
    
    // Calculate metadata completeness percentages
    const totalDocs = parseInt(docs.total) || 0;
    const metadataCompleteness = totalDocs > 0 ? {
      matterLink: Math.round((parseInt(docs.linked_to_matter) / totalDocs) * 100),
      ownerAssigned: Math.round((parseInt(docs.with_owner) / totalDocs) * 100),
      mimeType: Math.round((parseInt(docs.with_mime_type) / totalDocs) * 100),
      fileSize: Math.round((parseInt(docs.with_size) / totalDocs) * 100),
      folderPath: Math.round((parseInt(docs.with_folder_path) / totalDocs) * 100)
    } : null;
    
    // Determine migration method used
    const usedApiMigration = parseInt(manifest.total) > 0;
    const usedFolderScan = totalDocs > 0 && !usedApiMigration;
    
    res.json({
      firmId,
      firmName: firmResult.rows[0].name,
      
      // Migration Summary
      summary: {
        migrationMethod: usedApiMigration ? 'Clio API + Manifest' : (usedFolderScan ? 'Folder-Based Scan' : 'Not Started'),
        totalDocuments: totalDocs,
        totalMatters: parseInt(matters.total),
        totalUsers: parseInt(users.total),
        totalClients: parseInt(clients.total),
        storageSizeMB: Math.round(parseInt(docs.total_size_bytes) / (1024 * 1024))
      },
      
      // Document Details
      documents: {
        total: totalDocs,
        linkedToMatter: parseInt(docs.linked_to_matter),
        withOwner: parseInt(docs.with_owner),
        inAzureStorage: parseInt(docs.in_azure),
        firstUpload: docs.first_upload,
        lastUpload: docs.last_upload,
        orphaned: totalDocs - parseInt(docs.linked_to_matter)
      },
      
      // Metadata Completeness (Industry KPI)
      metadataCompleteness,
      
      // Clio Manifest Details (if API migration used)
      clioManifest: usedApiMigration ? {
        totalFetched: parseInt(manifest.total),
        matched: parseInt(manifest.matched),
        imported: parseInt(manifest.imported),
        pending: parseInt(manifest.pending),
        missing: parseInt(manifest.missing),
        withMatterId: parseInt(manifest.with_matter_id),
        withOwnerId: parseInt(manifest.with_owner_id),
        withCreatedDate: parseInt(manifest.with_created_date),
        withContentType: parseInt(manifest.with_content_type)
      } : null,
      
      // Matters Summary
      matters: {
        total: parseInt(matters.total),
        open: parseInt(matters.open),
        withAttorney: parseInt(matters.with_attorney),
        withClient: parseInt(matters.with_client)
      },
      
      // Best Practices Checklist
      bestPracticesChecklist: {
        mattersImported: parseInt(matters.total) > 0,
        documentsScanned: totalDocs > 0,
        documentsLinkedToMatters: parseInt(docs.linked_to_matter) > 0,
        ownersAssigned: parseInt(docs.with_owner) > 0,
        usersCreated: parseInt(users.total) > 0,
        metadataPreserved: metadataCompleteness && metadataCompleteness.matterLink > 80
      },
      
      // Recommendations
      recommendations: [
        ...(parseInt(matters.total) === 0 ? ['Import matters from Clio first using the API migration'] : []),
        ...(totalDocs === 0 ? ['Run a document scan after copying files to Azure'] : []),
        ...(metadataCompleteness && metadataCompleteness.matterLink < 80 ? ['Run "Rescan Unmatched" to link more documents to matters'] : []),
        ...(metadataCompleteness && metadataCompleteness.ownerAssigned < 50 ? ['Assign document owners for better access control'] : []),
        ...(parseInt(manifest.pending) > 0 ? [`${manifest.pending} documents pending in Clio manifest - run sync`] : [])
      ].filter(Boolean)
    });
    
  } catch (error) {
    console.error('Migration status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DRIVE STORAGE MANAGEMENT - Firm Azure Folder Configuration
// ============================================

// Get storage overview for all firms
router.get('/storage-overview', requireSecureAdmin, async (req, res) => {
  try {
    logAudit('VIEW_STORAGE_OVERVIEW', 'Accessed storage overview', req.ip);
    
    const result = await query(`
      SELECT 
        f.id,
        f.name,
        f.azure_folder,
        f.drive_settings,
        f.created_at,
        (SELECT COUNT(*) FROM users WHERE firm_id = f.id) as users_count,
        (SELECT COUNT(*) FROM documents WHERE firm_id = f.id) as documents_count,
        (SELECT COALESCE(SUM(size), 0) FROM documents WHERE firm_id = f.id) as total_size_bytes,
        (SELECT COUNT(*) FROM documents WHERE firm_id = f.id AND matter_id IS NOT NULL) as matched_documents,
        (SELECT COUNT(*) FROM documents WHERE firm_id = f.id AND matter_id IS NULL) as unmatched_documents,
        (SELECT MAX(uploaded_at) FROM documents WHERE firm_id = f.id) as last_document_upload
      FROM firms f
      ORDER BY f.name ASC
    `);

    const { isAzureConfigured, getAzureConfig } = await import('../utils/azureStorage.js');
    const azureConfigured = await isAzureConfigured();
    let azureInfo = null;
    
    if (azureConfigured) {
      const config = await getAzureConfig();
      azureInfo = {
        accountName: config.accountName,
        shareName: config.shareName,
        baseUrl: `https://${config.accountName}.file.core.windows.net/${config.shareName}`
      };
    }

    res.json({
      azureConfigured,
      azureInfo,
      firms: result.rows.map(f => ({
        id: f.id,
        name: f.name,
        azureFolder: f.azure_folder || `firm-${f.id}`,
        customFolder: !!f.azure_folder,
        driveSettings: f.drive_settings || {},
        usersCount: parseInt(f.users_count) || 0,
        documentsCount: parseInt(f.documents_count) || 0,
        totalSizeMB: Math.round((parseInt(f.total_size_bytes) || 0) / (1024 * 1024)),
        matchedDocuments: parseInt(f.matched_documents) || 0,
        unmatchedDocuments: parseInt(f.unmatched_documents) || 0,
        lastDocumentUpload: f.last_document_upload,
        createdAt: f.created_at
      }))
    });
  } catch (error) {
    console.error('Storage overview error:', error);
    res.status(500).json({ error: 'Failed to get storage overview' });
  }
});

// Get storage settings for a specific firm
router.get('/firms/:firmId/storage', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    logAudit('VIEW_FIRM_STORAGE', `Viewed storage settings for firm ${firmId}`, req.ip);
    
    const firmResult = await query(`
      SELECT 
        f.id, f.name, f.azure_folder, f.drive_settings,
        (SELECT COUNT(*) FROM users WHERE firm_id = f.id) as users_count,
        (SELECT COUNT(*) FROM documents WHERE firm_id = f.id) as documents_count,
        (SELECT COALESCE(SUM(size), 0) FROM documents WHERE firm_id = f.id) as total_size_bytes,
        (SELECT COUNT(*) FROM documents WHERE firm_id = f.id AND matter_id IS NOT NULL) as matched_documents,
        (SELECT COUNT(*) FROM documents WHERE firm_id = f.id AND matter_id IS NULL) as unmatched_documents,
        (SELECT COUNT(DISTINCT folder_path) FROM documents WHERE firm_id = f.id) as unique_folders
      FROM firms f
      WHERE f.id = $1
    `, [firmId]);
    
    if (firmResult.rows.length === 0) {
      return res.status(404).json({ error: 'Firm not found' });
    }
    
    const firm = firmResult.rows[0];
    const { isAzureConfigured, getAzureConfig } = await import('../utils/azureStorage.js');
    const azureConfigured = await isAzureConfigured();
    const azureFolder = firm.azure_folder || `firm-${firmId}`;
    
    let connectionInfo = null;
    if (azureConfigured) {
      const config = await getAzureConfig();
      connectionInfo = {
        accountName: config.accountName,
        shareName: config.shareName,
        folder: azureFolder,
        windowsPath: `\\\\${config.accountName}.file.core.windows.net\\${config.shareName}\\${azureFolder}`,
        macPath: `smb://${config.accountName}.file.core.windows.net/${config.shareName}/${azureFolder}`,
        webUrl: `https://${config.accountName}.file.core.windows.net/${config.shareName}/${azureFolder}`
      };
    }
    
    // Get document folder breakdown
    const foldersResult = await query(`
      SELECT 
        COALESCE(folder_path, 'Root') as folder,
        COUNT(*) as file_count,
        COUNT(*) FILTER (WHERE matter_id IS NOT NULL) as matched_count,
        COALESCE(SUM(size), 0) as folder_size
      FROM documents 
      WHERE firm_id = $1
      GROUP BY folder_path
      ORDER BY file_count DESC
      LIMIT 20
    `, [firmId]);
    
    res.json({
      firmId: firm.id,
      firmName: firm.name,
      azureFolder,
      customFolder: !!firm.azure_folder,
      driveSettings: firm.drive_settings || {
        autoScanEnabled: true,
        scanIntervalMinutes: 60,
        defaultDocumentPrivacy: 'team',
        inheritMatterPermissions: true,
        preserveFolderStructure: true
      },
      stats: {
        usersCount: parseInt(firm.users_count) || 0,
        documentsCount: parseInt(firm.documents_count) || 0,
        totalSizeMB: Math.round((parseInt(firm.total_size_bytes) || 0) / (1024 * 1024)),
        matchedDocuments: parseInt(firm.matched_documents) || 0,
        unmatchedDocuments: parseInt(firm.unmatched_documents) || 0,
        uniqueFolders: parseInt(firm.unique_folders) || 0
      },
      connectionInfo,
      folderBreakdown: foldersResult.rows.map(f => ({
        folder: f.folder,
        fileCount: parseInt(f.file_count),
        matchedCount: parseInt(f.matched_count),
        sizeMB: Math.round((parseInt(f.folder_size) || 0) / (1024 * 1024))
      }))
    });
  } catch (error) {
    console.error('Firm storage error:', error);
    res.status(500).json({ error: 'Failed to get firm storage settings' });
  }
});

// Update storage settings for a firm
router.put('/firms/:firmId/storage', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    const { azureFolder, driveSettings } = req.body;
    
    // Validate azure folder name if provided
    if (azureFolder !== undefined) {
      if (azureFolder && !/^[a-zA-Z0-9_-]+$/.test(azureFolder)) {
        return res.status(400).json({ 
          error: 'Invalid folder name. Use only letters, numbers, hyphens, and underscores.' 
        });
      }
      
      // Check for folder name conflicts
      if (azureFolder) {
        const conflictCheck = await query(
          `SELECT id, name FROM firms WHERE azure_folder = $1 AND id != $2`,
          [azureFolder, firmId]
        );
        if (conflictCheck.rows.length > 0) {
          return res.status(400).json({ 
            error: `Folder "${azureFolder}" is already used by firm "${conflictCheck.rows[0].name}"` 
          });
        }
      }
    }
    
    const updateFields = [];
    const values = [];
    let paramIndex = 1;
    
    if (azureFolder !== undefined) {
      updateFields.push(`azure_folder = $${paramIndex++}`);
      values.push(azureFolder || null); // null means use default firm-{id}
    }
    
    if (driveSettings !== undefined) {
      updateFields.push(`drive_settings = $${paramIndex++}`);
      values.push(JSON.stringify(driveSettings));
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updateFields.push('updated_at = NOW()');
    values.push(firmId);
    
    const result = await query(`
      UPDATE firms SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, name, azure_folder, drive_settings
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Firm not found' });
    }
    
    const firm = result.rows[0];
    logAudit('UPDATE_FIRM_STORAGE', `Updated storage settings for firm "${firm.name}"`, req.ip);
    
    res.json({
      success: true,
      message: `Storage settings updated for ${firm.name}`,
      firmId: firm.id,
      firmName: firm.name,
      azureFolder: firm.azure_folder || `firm-${firm.id}`,
      customFolder: !!firm.azure_folder,
      driveSettings: firm.drive_settings || {}
    });
  } catch (error) {
    console.error('Update firm storage error:', error);
    res.status(500).json({ error: 'Failed to update storage settings' });
  }
});

// Bulk update document permissions for a firm
router.post('/firms/:firmId/bulk-permissions', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    const { 
      action, // 'match_all', 'set_privacy', 'assign_owner', 'clear_orphans'
      privacyLevel,
      ownerId,
      folderPath
    } = req.body;
    
    let result;
    let message;
    
    switch (action) {
      case 'match_all':
        // Try to match all unmatched documents to matters by folder name
        result = await query(`
          WITH folder_matches AS (
            SELECT DISTINCT ON (d.id)
              d.id as doc_id,
              m.id as matter_id,
              m.responsible_attorney
            FROM documents d
            CROSS JOIN matters m
            WHERE d.firm_id = $1 
              AND m.firm_id = $1
              AND d.matter_id IS NULL
              AND (
                d.folder_path ILIKE '%' || m.name || '%'
                OR d.name ILIKE '%' || m.name || '%'
                OR d.folder_path ILIKE '%' || m.matter_number || '%'
              )
          )
          UPDATE documents SET
            matter_id = fm.matter_id,
            owner_id = COALESCE(owner_id, fm.responsible_attorney),
            privacy_level = 'team',
            updated_at = NOW()
          FROM folder_matches fm
          WHERE documents.id = fm.doc_id
          RETURNING documents.id
        `, [firmId]);
        message = `Matched ${result.rows.length} documents to matters`;
        break;
        
      case 'set_privacy':
        if (!privacyLevel || !['private', 'team', 'public'].includes(privacyLevel)) {
          return res.status(400).json({ error: 'Invalid privacy level' });
        }
        const whereClause = folderPath 
          ? `AND (folder_path = $2 OR folder_path LIKE $2 || '/%')`
          : '';
        const params = folderPath ? [firmId, folderPath, privacyLevel] : [firmId, privacyLevel];
        
        result = await query(`
          UPDATE documents SET
            privacy_level = $${folderPath ? 3 : 2},
            updated_at = NOW()
          WHERE firm_id = $1 ${whereClause}
          RETURNING id
        `, params);
        message = `Set privacy to "${privacyLevel}" for ${result.rows.length} documents`;
        break;
        
      case 'assign_owner':
        if (!ownerId) {
          return res.status(400).json({ error: 'Owner ID required' });
        }
        // Verify user exists in firm
        const userCheck = await query(
          'SELECT id FROM users WHERE id = $1 AND firm_id = $2',
          [ownerId, firmId]
        );
        if (userCheck.rows.length === 0) {
          return res.status(400).json({ error: 'User not found in this firm' });
        }
        
        const ownerWhereClause = folderPath 
          ? `AND (folder_path = $2 OR folder_path LIKE $2 || '/%')`
          : '';
        const ownerParams = folderPath ? [firmId, folderPath, ownerId] : [firmId, ownerId];
        
        result = await query(`
          UPDATE documents SET
            owner_id = $${folderPath ? 3 : 2},
            updated_at = NOW()
          WHERE firm_id = $1 AND owner_id IS NULL ${ownerWhereClause}
          RETURNING id
        `, ownerParams);
        message = `Assigned owner to ${result.rows.length} documents`;
        break;
        
      case 'clear_orphans':
        // Remove documents with no matter AND no recent access
        result = await query(`
          DELETE FROM documents 
          WHERE firm_id = $1 
            AND matter_id IS NULL
            AND created_at < NOW() - INTERVAL '30 days'
          RETURNING id
        `, [firmId]);
        message = `Removed ${result.rows.length} orphaned documents older than 30 days`;
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
    
    logAudit('BULK_PERMISSIONS', `${action}: ${message} for firm ${firmId}`, req.ip);
    
    res.json({
      success: true,
      message,
      affectedCount: result.rows.length
    });
  } catch (error) {
    console.error('Bulk permissions error:', error);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

// Create Azure folder for firm (ensure it exists)
router.post('/firms/:firmId/create-folder', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    const { folderName } = req.body;
    
    const firmResult = await query('SELECT id, name, azure_folder FROM firms WHERE id = $1', [firmId]);
    if (firmResult.rows.length === 0) {
      return res.status(404).json({ error: 'Firm not found' });
    }
    
    const firm = firmResult.rows[0];
    const targetFolder = folderName || firm.azure_folder || `firm-${firmId}`;
    
    const { isAzureConfigured, getAzureConfig, ensureFirmFolder } = await import('../utils/azureStorage.js');
    
    if (!(await isAzureConfigured())) {
      return res.status(400).json({ error: 'Azure Storage not configured' });
    }
    
    // Create the folder
    const folderResult = await ensureFirmFolder(targetFolder.replace('firm-', ''));
    
    // Update firm record if custom folder provided
    if (folderName && folderName !== `firm-${firmId}`) {
      await query(
        'UPDATE firms SET azure_folder = $1, updated_at = NOW() WHERE id = $2',
        [folderName, firmId]
      );
    }
    
    const config = await getAzureConfig();
    
    logAudit('CREATE_FOLDER', `Created Azure folder "${targetFolder}" for firm "${firm.name}"`, req.ip);
    
    res.json({
      success: true,
      message: `Folder "${targetFolder}" created/verified in Azure`,
      folder: targetFolder,
      connectionInfo: {
        windowsPath: `\\\\${config.accountName}.file.core.windows.net\\${config.shareName}\\${targetFolder}`,
        macPath: `smb://${config.accountName}.file.core.windows.net/${config.shareName}/${targetFolder}`
      }
    });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

export default router;
