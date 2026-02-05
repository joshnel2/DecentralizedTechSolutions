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

// Restrict visibility of a user's matters (useful after migration)
// This makes matters where the user is responsible attorney visible only to that user
router.post('/account-tools/restrict-user-matters', requireSecureAdmin, async (req, res) => {
  try {
    const { userId, firmId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    // Get user info
    const userCheck = await query(
      'SELECT email, firm_id, first_name, last_name FROM users WHERE id = $1', 
      [userId]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userCheck.rows[0];
    const targetFirmId = firmId || user.firm_id;

    // Count matters that will be affected
    const countResult = await query(`
      SELECT COUNT(*) as count FROM matters 
      WHERE firm_id = $1 
      AND responsible_attorney = $2 
      AND visibility = 'firm_wide'
    `, [targetFirmId, userId]);
    
    const mattersCount = parseInt(countResult.rows[0].count);
    
    if (mattersCount === 0) {
      return res.json({
        success: true,
        message: 'No firm_wide matters found for this user to restrict',
        mattersUpdated: 0
      });
    }

    // Update matters to restricted visibility
    const updateResult = await query(`
      UPDATE matters 
      SET visibility = 'restricted', updated_at = NOW()
      WHERE firm_id = $1 
      AND responsible_attorney = $2 
      AND visibility = 'firm_wide'
      RETURNING id
    `, [targetFirmId, userId]);

    logAudit('RESTRICT_USER_MATTERS', 
      `Restricted ${updateResult.rowCount} matters for ${user.email} (${user.first_name} ${user.last_name})`, 
      req.ip, user.email
    );

    res.json({
      success: true,
      message: `Restricted ${updateResult.rowCount} matters for ${user.email}`,
      mattersUpdated: updateResult.rowCount,
      userName: `${user.first_name} ${user.last_name}`,
      userEmail: user.email
    });
  } catch (error) {
    console.error('Restrict user matters error:', error);
    res.status(500).json({ error: 'Failed to restrict user matters' });
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
// SCAN DIAGNOSTIC - Comprehensive check of scan data
// ============================================
router.get('/firms/:firmId/scan-diagnostic', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    console.log(`[DIAGNOSTIC] Running scan diagnostic for firm ${firmId}`);
    
    // 1. Check firm exists
    const firmResult = await query('SELECT id, name FROM firms WHERE id = $1', [firmId]);
    if (firmResult.rows.length === 0) {
      return res.status(404).json({ error: 'Firm not found' });
    }
    
    // 2. Check matters and how they're stored
    const mattersResult = await query(`
      SELECT id, number, name, 
             CASE WHEN number ~ '-\\d+$' THEN SUBSTRING(number FROM '-([0-9]+)$') ELSE NULL END as extracted_clio_id
      FROM matters 
      WHERE firm_id = $1 
      ORDER BY created_at DESC 
      LIMIT 10
    `, [firmId]);
    
    const mattersWithClioId = mattersResult.rows.filter(m => m.extracted_clio_id);
    
    // 3. Check manifest stats
    let manifestStats = { total: 0, matched: 0, pending: 0, withMatterId: 0, withClioMatterId: 0 };
    try {
      const manifestResult = await query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE match_status = 'matched') as matched,
          COUNT(*) FILTER (WHERE match_status IS NULL OR match_status = 'pending') as pending,
          COUNT(*) FILTER (WHERE matter_id IS NOT NULL) as with_matter_id,
          COUNT(*) FILTER (WHERE clio_matter_id IS NOT NULL) as with_clio_matter_id
        FROM clio_document_manifest
        WHERE firm_id = $1
      `, [firmId]);
      manifestStats = {
        total: parseInt(manifestResult.rows[0].total),
        matched: parseInt(manifestResult.rows[0].matched),
        pending: parseInt(manifestResult.rows[0].pending),
        withMatterId: parseInt(manifestResult.rows[0].with_matter_id),
        withClioMatterId: parseInt(manifestResult.rows[0].with_clio_matter_id)
      };
    } catch (e) {
      manifestStats.error = e.message;
    }
    
    // 4. Sample manifest entries
    let manifestSamples = [];
    try {
      const sampleResult = await query(`
        SELECT id, name, clio_matter_id, clio_folder_id, matter_id, clio_path, match_status
        FROM clio_document_manifest
        WHERE firm_id = $1
        ORDER BY clio_matter_id NULLS LAST
        LIMIT 10
      `, [firmId]);
      manifestSamples = sampleResult.rows;
    } catch (e) {
      // Table might not exist
    }
    
    // 5. Check folder manifest
    let folderManifest = { total: 0, withMatterId: 0, samples: [] };
    try {
      const folderResult = await query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE clio_matter_id IS NOT NULL OR matter_id IS NOT NULL) as with_matter
        FROM clio_folder_manifest
        WHERE firm_id = $1
      `, [firmId]);
      folderManifest.total = parseInt(folderResult.rows[0].total);
      folderManifest.withMatterId = parseInt(folderResult.rows[0].with_matter);
      
      const folderSamples = await query(`
        SELECT clio_id, name, full_path, clio_matter_id, matter_id
        FROM clio_folder_manifest
        WHERE firm_id = $1 AND (clio_matter_id IS NOT NULL OR matter_id IS NOT NULL)
        LIMIT 5
      `, [firmId]);
      folderManifest.samples = folderSamples.rows;
    } catch (e) {
      folderManifest.error = e.message;
    }
    
    // 6. Check documents in database
    const docsResult = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(matter_id) as with_matter,
        COUNT(*) - COUNT(matter_id) as without_matter,
        COUNT(*) FILTER (WHERE storage_location = 'azure') as azure_docs
      FROM documents
      WHERE firm_id = $1
    `, [firmId]);
    
    // 7. Sample documents with their folder paths
    const docSamples = await query(`
      SELECT d.id, d.name, d.folder_path, d.path, d.matter_id, m.name as matter_name
      FROM documents d
      LEFT JOIN matters m ON d.matter_id = m.id
      WHERE d.firm_id = $1
      ORDER BY d.created_at DESC
      LIMIT 10
    `, [firmId]);
    
    // 8. Check Azure folder
    let azureStatus = { configured: false, firmFolderExists: false, fileCount: 0 };
    try {
      const { isAzureConfigured, getShareClient } = await import('../utils/azureStorage.js');
      azureStatus.configured = await isAzureConfigured();
      
      if (azureStatus.configured) {
        const shareClient = await getShareClient();
        const firmFolder = `firm-${firmId}`;
        const dirClient = shareClient.getDirectoryClient(firmFolder);
        
        try {
          let count = 0;
          for await (const item of dirClient.listFilesAndDirectories()) {
            count++;
            if (count >= 100) break; // Just check if folder has files
          }
          azureStatus.firmFolderExists = true;
          azureStatus.fileCount = count;
        } catch (e) {
          azureStatus.firmFolderExists = false;
          azureStatus.error = e.message;
        }
      }
    } catch (e) {
      azureStatus.error = e.message;
    }
    
    res.json({
      firm: firmResult.rows[0],
      matters: {
        total: mattersResult.rows.length,
        withClioId: mattersWithClioId.length,
        samples: mattersResult.rows
      },
      manifest: manifestStats,
      manifestSamples,
      folderManifest,
      documents: {
        total: parseInt(docsResult.rows[0].total),
        withMatter: parseInt(docsResult.rows[0].with_matter),
        withoutMatter: parseInt(docsResult.rows[0].without_matter),
        azureDocs: parseInt(docsResult.rows[0].azure_docs)
      },
      documentSamples: docSamples.rows,
      azure: azureStatus,
      diagnosis: {
        hasManifest: manifestStats.total > 0,
        hasMattersWithClioId: mattersWithClioId.length > 0,
        manifestHasClioMatterIds: manifestStats.withClioMatterId > 0,
        canMatchByClioId: mattersWithClioId.length > 0 && manifestStats.withClioMatterId > 0,
        documentsMatchedToMatters: parseInt(docsResult.rows[0].with_matter)
      }
    });
  } catch (error) {
    console.error('Scan diagnostic error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SCAN HISTORY & SETTINGS
// ============================================

// Get scan history for a firm
router.get('/firms/:firmId/scan-history', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    
    const result = await query(
      `SELECT * FROM scan_history 
       WHERE firm_id = $1 
       ORDER BY started_at DESC 
       LIMIT $2 OFFSET $3`,
      [firmId, parseInt(limit), parseInt(offset)]
    );
    
    const countResult = await query(
      `SELECT COUNT(*) FROM scan_history WHERE firm_id = $1`,
      [firmId]
    );
    
    res.json({
      history: result.rows.map(h => ({
        id: h.id,
        status: h.status,
        scanMode: h.scan_mode,
        filesProcessed: h.files_processed,
        filesMatched: h.files_matched,
        filesCreated: h.files_created,
        filesSkipped: h.files_skipped,
        totalFiles: h.total_files,
        errorsCount: h.errors_count,
        startedAt: h.started_at,
        completedAt: h.completed_at,
        durationSeconds: h.duration_seconds,
        errorMessage: h.error_message,
        triggeredBy: h.triggered_by,
        triggeredByUser: h.triggered_by_user
      })),
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    // Table might not exist yet
    if (error.code === '42P01') {
      return res.json({ history: [], total: 0 });
    }
    console.error('Get scan history error:', error);
    res.status(500).json({ error: 'Failed to get scan history' });
  }
});

// Get scan settings for a firm
router.get('/firms/:firmId/scan-settings', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    
    const result = await query(
      `SELECT * FROM scan_settings WHERE firm_id = $1`,
      [firmId]
    );
    
    if (result.rows.length === 0) {
      // Return defaults
      return res.json({
        autoSyncEnabled: false,
        syncIntervalMinutes: 10,
        permissionMode: 'matter',
        defaultPrivacyLevel: 'team',
        autoAssignToResponsibleAttorney: true,
        notifyOnCompletion: true,
        notifyOnError: true,
        notificationEmails: [],
        dryRunFirst: false,
        skipExisting: true
      });
    }
    
    const s = result.rows[0];
    res.json({
      autoSyncEnabled: s.auto_sync_enabled,
      syncIntervalMinutes: s.sync_interval_minutes,
      lastAutoSyncAt: s.last_auto_sync_at,
      permissionMode: s.permission_mode,
      defaultPrivacyLevel: s.default_privacy_level,
      autoAssignToResponsibleAttorney: s.auto_assign_to_responsible_attorney,
      notifyOnCompletion: s.notify_on_completion,
      notifyOnError: s.notify_on_error,
      notificationEmails: s.notification_emails || [],
      dryRunFirst: s.dry_run_first,
      skipExisting: s.skip_existing
    });
  } catch (error) {
    // Table might not exist yet
    if (error.code === '42P01') {
      return res.json({
        autoSyncEnabled: false,
        syncIntervalMinutes: 10,
        permissionMode: 'matter',
        defaultPrivacyLevel: 'team',
        autoAssignToResponsibleAttorney: true,
        notifyOnCompletion: true,
        notifyOnError: true,
        notificationEmails: [],
        dryRunFirst: false,
        skipExisting: true
      });
    }
    console.error('Get scan settings error:', error);
    res.status(500).json({ error: 'Failed to get scan settings' });
  }
});

// Update scan settings for a firm
router.put('/firms/:firmId/scan-settings', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    const {
      autoSyncEnabled,
      syncIntervalMinutes,
      permissionMode,
      defaultPrivacyLevel,
      autoAssignToResponsibleAttorney,
      notifyOnCompletion,
      notifyOnError,
      notificationEmails,
      dryRunFirst,
      skipExisting
    } = req.body;
    
    // Upsert settings
    const result = await query(
      `INSERT INTO scan_settings (
        firm_id, auto_sync_enabled, sync_interval_minutes, permission_mode,
        default_privacy_level, auto_assign_to_responsible_attorney,
        notify_on_completion, notify_on_error, notification_emails,
        dry_run_first, skip_existing, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (firm_id) DO UPDATE SET
        auto_sync_enabled = COALESCE($2, scan_settings.auto_sync_enabled),
        sync_interval_minutes = COALESCE($3, scan_settings.sync_interval_minutes),
        permission_mode = COALESCE($4, scan_settings.permission_mode),
        default_privacy_level = COALESCE($5, scan_settings.default_privacy_level),
        auto_assign_to_responsible_attorney = COALESCE($6, scan_settings.auto_assign_to_responsible_attorney),
        notify_on_completion = COALESCE($7, scan_settings.notify_on_completion),
        notify_on_error = COALESCE($8, scan_settings.notify_on_error),
        notification_emails = COALESCE($9, scan_settings.notification_emails),
        dry_run_first = COALESCE($10, scan_settings.dry_run_first),
        skip_existing = COALESCE($11, scan_settings.skip_existing),
        updated_at = NOW()
      RETURNING *`,
      [
        firmId,
        autoSyncEnabled,
        syncIntervalMinutes,
        permissionMode,
        defaultPrivacyLevel,
        autoAssignToResponsibleAttorney,
        notifyOnCompletion,
        notifyOnError,
        notificationEmails,
        dryRunFirst,
        skipExisting
      ]
    );
    
    logAudit('UPDATE_SCAN_SETTINGS', `Updated scan settings for firm ${firmId}`, req.ip);
    
    const s = result.rows[0];
    res.json({
      success: true,
      settings: {
        autoSyncEnabled: s.auto_sync_enabled,
        syncIntervalMinutes: s.sync_interval_minutes,
        permissionMode: s.permission_mode,
        defaultPrivacyLevel: s.default_privacy_level,
        autoAssignToResponsibleAttorney: s.auto_assign_to_responsible_attorney,
        notifyOnCompletion: s.notify_on_completion,
        notifyOnError: s.notify_on_error,
        notificationEmails: s.notification_emails,
        dryRunFirst: s.dry_run_first,
        skipExisting: s.skip_existing
      }
    });
  } catch (error) {
    console.error('Update scan settings error:', error);
    res.status(500).json({ error: 'Failed to update scan settings' });
  }
});

// Helper function to save scan to history
async function saveScanToHistory(firmId, job, triggeredBy = 'manual', triggeredByUser = null) {
  try {
    const startedAt = job.startedAt ? new Date(job.startedAt) : new Date();
    const completedAt = job.completedAt ? new Date(job.completedAt) : new Date();
    const durationSeconds = Math.round((completedAt - startedAt) / 1000);
    
    await query(
      `INSERT INTO scan_history (
        firm_id, status, scan_mode, files_processed, files_matched,
        files_created, files_skipped, total_files, errors_count,
        started_at, completed_at, duration_seconds, error_message,
        scan_results, triggered_by, triggered_by_user
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        firmId,
        job.status,
        job.scanMode || 'auto',
        job.progress?.processed || 0,
        job.progress?.matched || 0,
        job.progress?.created || 0,
        job.results?.skipped || 0,
        job.progress?.total || 0,
        job.results?.errors?.length || 0,
        startedAt,
        completedAt,
        durationSeconds,
        job.error || null,
        job.results ? JSON.stringify(job.results) : null,
        triggeredBy,
        triggeredByUser
      ]
    );
  } catch (error) {
    console.error('Failed to save scan to history:', error);
  }
}

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
// SCAN DOCUMENTS - Smart Scanner (works for both API and Robocopy migrations)
// ============================================
// Two modes:
// 1. If manifest exists (API migration) → Uses clio_matter_id from manifest
// 2. If no manifest (Robocopy) → Scans Azure directly and matches by folder names
//
// Clio folder structure: /A/Adams - Personal Injury/Pleadings/doc.pdf
// where A is alphabetical index, "Adams - Personal Injury" is matter folder
router.post('/firms/:firmId/scan-documents', requireSecureAdmin, async (req, res) => {
  const { firmId } = req.params;
  const { dryRun, mode } = req.body || {};
  
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
    dryRun: !!dryRun,
    mode: mode || 'auto' // 'auto', 'manifest', or 'folder'
  };
  scanJobs.set(firmId, job);
  
  console.log(`[SCAN] Starting smart scan for firm ${firmId}`);
  console.log(`[SCAN] Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}, Scan mode: ${job.mode}`);
  
  // Return immediately - scan runs in background
  res.json({
    success: true,
    message: 'Scan started. Will auto-detect best matching strategy.',
    status: 'started',
    job
  });
  
  // Run scan in background
  runSmartScan(firmId, dryRun, job).catch(err => {
    console.error('[SCAN] Smart scan error:', err);
    job.status = 'error';
    job.error = err.message;
  });
});

// ============================================
// SMART SCAN - Works for both API and Robocopy migrations
// ============================================
// Auto-detects which mode to use:
// - If manifest has data → Use manifest-based matching
// - If no manifest → Scan Azure directly and match by folder names
async function runSmartScan(firmId, dryRun, job) {
  try {
    // Check Azure configuration first
    job.phase = 'checking_azure';
    const { getShareClient, isAzureConfigured } = await import('../utils/azureStorage.js');
    if (!(await isAzureConfigured())) {
      throw new Error('Azure Storage not configured. Go to Platform Settings.');
    }
    
    // Check if we have manifest data
    job.phase = 'checking_manifest';
    let hasManifest = false;
    try {
      const manifestCheck = await query(
        `SELECT COUNT(*) as count FROM clio_document_manifest WHERE firm_id = $1`,
        [firmId]
      );
      hasManifest = parseInt(manifestCheck.rows[0].count) > 0;
    } catch (e) {
      // Table might not exist
      hasManifest = false;
    }
    
    console.log(`[SCAN] Manifest check: ${hasManifest ? 'HAS DATA' : 'EMPTY'}`);
    
    if (hasManifest && job.mode !== 'folder') {
      // Use manifest-based scan
      console.log(`[SCAN] Using MANIFEST-BASED scan (API migration mode)`);
      job.scanMode = 'manifest';
      await runManifestScan(firmId, dryRun, job);
    } else {
      // Use folder-based scan (direct Azure scan)
      console.log(`[SCAN] Using FOLDER-BASED scan (Robocopy migration mode)`);
      job.scanMode = 'folder';
      await runFolderBasedScan(firmId, dryRun, job);
    }
  } catch (error) {
    console.error('[SCAN] Smart scan error:', error);
    job.status = 'error';
    job.error = error.message;
    job.completedAt = new Date().toISOString();
  }
}

// ============================================
// FOLDER-BASED SCAN - For Robocopy migrations (no manifest)
// ============================================
// Scans Azure directly and matches folders to matters by name
// Clio folder structure: /A/Adams - Personal Injury/Pleadings/doc.pdf
async function runFolderBasedScan(firmId, dryRun, job) {
  const results = {
    processed: 0,
    matched: 0,
    created: 0,
    skipped: 0,
    noMatter: 0,
    errors: []
  };
  
  try {
    const { getShareClient } = await import('../utils/azureStorage.js');
    const shareClient = await getShareClient();
    const firmFolder = `firm-${firmId}`;
    
    // ============================================
    // 1. BUILD MATTER LOOKUP MAPS
    // ============================================
    job.phase = 'loading_matters';
    console.log(`[SCAN] Building matter lookup maps...`);
    
    const matterByName = new Map();
    const matterByNumber = new Map();
    const matterByClientMatter = new Map();
    const matterByNormalizedName = new Map();
    const allMatters = [];
    
    const normalizeName = (str) => {
      if (!str) return '';
      return str.toLowerCase().replace(/[:\\/\*\?"<>\|_-]/g, ' ').replace(/\s+/g, ' ').trim();
    };
    
    const isIndexFolder = (name) => {
      if (!name) return false;
      const trimmed = name.trim();
      return /^[A-Za-z0-9]$/.test(trimmed) || 
             ['firm', 'matters', 'clients', 'templates', 'documents', 'firm-'].some(s => 
               trimmed.toLowerCase() === s || trimmed.toLowerCase().startsWith('firm-'));
    };
    
    const mattersResult = await query(`
      SELECT m.id, m.number, m.name, m.responsible_attorney, c.display_name as client_name
      FROM matters m
      LEFT JOIN clients c ON m.client_id = c.id
      WHERE m.firm_id = $1
    `, [firmId]);
    
    for (const m of mattersResult.rows) {
      allMatters.push(m);
      
      if (m.name) {
        matterByName.set(m.name.toLowerCase(), m);
        matterByNormalizedName.set(normalizeName(m.name), m);
      }
      if (m.number) {
        matterByNumber.set(m.number.toLowerCase(), m);
        matterByNormalizedName.set(normalizeName(m.number), m);
      }
      if (m.client_name && m.name) {
        // "Client - Matter" format (Clio's folder naming)
        const clioFormat = `${m.client_name} - ${m.name}`.toLowerCase();
        matterByClientMatter.set(clioFormat, m);
        matterByNormalizedName.set(normalizeName(`${m.client_name} - ${m.name}`), m);
        
        // Also try just client name
        matterByNormalizedName.set(normalizeName(m.client_name), m);
      }
    }
    
    console.log(`[SCAN] Loaded ${allMatters.length} matters, ${matterByClientMatter.size} client-matter pairs`);
    job.progress.mattersLoaded = allMatters.length;
    
    // ============================================
    // 2. MATCH FOLDER TO MATTER FUNCTION
    // ============================================
    const matchFolderToMatter = (folderPath) => {
      if (!folderPath) return null;
      
      // Split and filter out index/system folders
      const parts = folderPath.split('/').filter(p => p && !isIndexFolder(p));
      
      for (const part of parts) {
        const partLower = part.toLowerCase();
        const partNorm = normalizeName(part);
        
        // Strategy 1: Exact match on matter name
        if (matterByName.has(partLower)) return matterByName.get(partLower);
        
        // Strategy 2: "Client - Matter" format
        if (matterByClientMatter.has(partLower)) return matterByClientMatter.get(partLower);
        
        // Strategy 3: Matter number
        if (matterByNumber.has(partLower)) return matterByNumber.get(partLower);
        
        // Strategy 4: Normalized name (fuzzy)
        if (matterByNormalizedName.has(partNorm)) return matterByNormalizedName.get(partNorm);
        
        // Strategy 5: Parse "Client - Matter" format in folder name
        if (part.includes(' - ')) {
          const [clientPart, ...matterParts] = part.split(' - ');
          const afterDash = matterParts.join(' - ').trim().toLowerCase();
          const afterDashNorm = normalizeName(afterDash);
          
          if (matterByName.has(afterDash)) return matterByName.get(afterDash);
          if (matterByNormalizedName.has(afterDashNorm)) return matterByNormalizedName.get(afterDashNorm);
          
          // Try matching by client name
          const clientNorm = normalizeName(clientPart);
          if (matterByNormalizedName.has(clientNorm)) return matterByNormalizedName.get(clientNorm);
        }
        
        // Strategy 6: Extract matter number from start (e.g., "2024-001 Smith Case")
        const numberMatch = part.match(/^(\d{4}[-_]\d+|\d+[-_]\d+)/);
        if (numberMatch && matterByNumber.has(numberMatch[1].toLowerCase())) {
          return matterByNumber.get(numberMatch[1].toLowerCase());
        }
        
        // Strategy 7: Fuzzy match - check if folder contains matter name
        for (const [name, matter] of matterByName) {
          if (partLower.includes(name) || name.includes(partLower)) {
            return matter;
          }
        }
      }
      
      return null;
    };
    
    // ============================================
    // 3. SCAN AZURE AND CREATE DOCUMENTS
    // ============================================
    job.phase = 'scanning_azure';
    console.log(`[SCAN] Scanning Azure folder: ${firmFolder}`);
    
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
    
    // Recursive scan function
    const scanDirectory = async (dirClient, basePath = '') => {
      if (job.cancelled) return;
      
      try {
        for await (const item of dirClient.listFilesAndDirectories()) {
          if (job.cancelled) return;
          
          const itemPath = basePath ? `${basePath}/${item.name}` : item.name;
          
          if (item.kind === 'directory') {
            await scanDirectory(dirClient.getDirectoryClient(item.name), itemPath);
          } else {
            results.processed++;
            
            // Progress update every 100 files
            if (results.processed % 100 === 0) {
              job.progress.processed = results.processed;
              job.progress.matched = results.matched;
              job.progress.created = results.created;
              console.log(`[SCAN] Progress: ${results.processed} files processed, ${results.matched} matched to matters`);
            }
            
            const fullAzurePath = `${firmFolder}/${itemPath}`;
            const folderPath = itemPath.split('/').slice(0, -1).join('/');
            
            // Try to match folder to matter
            const matchedMatter = matchFolderToMatter(folderPath);
            const matterId = matchedMatter?.id || null;
            const ownerId = matchedMatter?.responsible_attorney || null;
            
            if (matterId) {
              results.matched++;
            } else {
              results.noMatter++;
            }
            
            if (!dryRun) {
              try {
                // Upsert document
                const insertResult = await query(`
                  INSERT INTO documents (
                    firm_id, matter_id, owner_id, name, original_name,
                    path, folder_path, type, size, privacy_level,
                    status, storage_location, external_path, uploaded_at
                  ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, 'final', 'azure', $5, NOW())
                  ON CONFLICT (firm_id, path) DO UPDATE SET
                    matter_id = COALESCE(EXCLUDED.matter_id, documents.matter_id),
                    folder_path = EXCLUDED.folder_path,
                    updated_at = NOW()
                  RETURNING (xmax = 0) as was_inserted
                `, [
                  firmId,
                  matterId,
                  ownerId,
                  item.name,
                  fullAzurePath,
                  folderPath,
                  getMimeType(item.name),
                  item.properties?.contentLength || 0,
                  matterId ? 'team' : 'firm'
                ]);
                
                if (insertResult.rows[0]?.was_inserted) {
                  results.created++;
                } else {
                  results.skipped++;
                }
              } catch (e) {
                if (results.errors.length < 50) {
                  results.errors.push(`${item.name}: ${e.message}`);
                }
              }
            }
          }
        }
      } catch (e) {
        // Directory might not exist
        if (!e.message?.includes('does not exist') && !e.message?.includes('ResourceNotFound')) {
          console.log(`[SCAN] Error scanning ${basePath}: ${e.message}`);
        }
      }
    };
    
    // Start scanning from firm folder
    await scanDirectory(shareClient.getDirectoryClient(firmFolder));
    
    // ============================================
    // 4. FINAL STATS
    // ============================================
    job.phase = 'finalizing';
    
    const finalStats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(matter_id) as with_matter,
        COUNT(*) - COUNT(matter_id) as without_matter
      FROM documents WHERE firm_id = $1
    `, [firmId]);
    
    const stats = finalStats.rows[0];
    
    const message = dryRun
      ? `DRY RUN: Found ${results.processed} files. ${results.matched} would match to matters.`
      : `Scan complete: ${results.created} documents created, ${results.matched} matched to matters.`;
    
    console.log(`[SCAN] ${message}`);
    
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.phase = 'done';
    job.progress.percent = 100;
    job.scanMode = 'folder';
    job.results = {
      success: true,
      message,
      scanMode: 'folder',
      dryRun: !!dryRun,
      processed: results.processed,
      matched: results.matched,
      created: results.created,
      skipped: results.skipped,
      noMatter: results.noMatter,
      mattersLoaded: allMatters.length,
      totalInDatabase: parseInt(stats.total || 0),
      withMatter: parseInt(stats.with_matter || 0),
      withoutMatter: parseInt(stats.without_matter || 0),
      errors: results.errors.slice(0, 20)
    };
    
    // Save to history
    await saveScanToHistory(firmId, job, 'manual');
    
  } catch (error) {
    console.error('[SCAN] Folder scan error:', error);
    job.status = 'error';
    job.error = error.message;
    job.completedAt = new Date().toISOString();
    
    // Save error to history
    await saveScanToHistory(firmId, job, 'manual');
  }
}

// ============================================
// MANIFEST-BASED SCAN - For API migrations (has manifest)
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
    // 2. BUILD MATTER LOOKUP MAPS
    // ============================================
    job.phase = 'loading_matters';
    console.log(`[SCAN] Building matter lookup maps...`);
    
    // Multiple lookup strategies for maximum matching:
    // 1. clioMatterIdToApexId: Clio ID (from manifest) -> Apex matter ID
    // 2. matterByName: Matter name -> Apex matter
    // 3. matterByNumber: Matter number -> Apex matter
    // 4. matterByClientMatter: "Client - Matter" format -> Apex matter
    
    const clioMatterIdToApexId = new Map();
    const matterByName = new Map();
    const matterByNumber = new Map();
    const matterByClientMatter = new Map();
    const matterByNormalizedName = new Map();
    
    // Normalize function for Windows character handling and fuzzy matching
    const normalizeName = (str) => {
      if (!str) return '';
      return str.toLowerCase().replace(/[:\\/\*\?"<>\|_-]/g, ' ').replace(/\s+/g, ' ').trim();
    };
    
    // Check if folder is an alphabetical/numerical index (Clio structure)
    const isIndexFolder = (name) => {
      if (!name) return false;
      const trimmed = name.trim();
      return /^[A-Za-z0-9]$/.test(trimmed) || 
             ['firm', 'matters', 'clients', 'templates', 'documents'].includes(trimmed.toLowerCase()) ||
             trimmed.startsWith('firm-');
    };
    
    try {
      // Get matters with client names for full matching capability
      const mattersResult = await query(`
        SELECT m.id, m.number, m.name, m.responsible_attorney, c.display_name as client_name
        FROM matters m
        LEFT JOIN clients c ON m.client_id = c.id
        WHERE m.firm_id = $1
      `, [firmId]);
      
      for (const m of mattersResult.rows) {
        // Map by Clio ID (extracted from matter number)
        if (m.number) {
          const match = m.number.match(/-(\d+)$/);
          if (match) {
            clioMatterIdToApexId.set(parseInt(match[1]), m.id);
          }
          // Also map by full matter number
          matterByNumber.set(m.number.toLowerCase(), m);
          matterByNormalizedName.set(normalizeName(m.number), m);
        }
        
        // Map by matter name
        if (m.name) {
          matterByName.set(m.name.toLowerCase(), m);
          matterByNormalizedName.set(normalizeName(m.name), m);
        }
        
        // Map by "Client - Matter" format (Clio's common folder naming)
        if (m.client_name && m.name) {
          const clioFormat = `${m.client_name} - ${m.name}`.toLowerCase();
          matterByClientMatter.set(clioFormat, m);
          matterByNormalizedName.set(normalizeName(clioFormat), m);
        }
      }
      
      console.log(`[SCAN] Built mappings: ${clioMatterIdToApexId.size} Clio IDs, ${matterByName.size} names, ${matterByClientMatter.size} client-matter pairs`);
    } catch (e) {
      console.log(`[SCAN] Could not build matter mappings: ${e.message}`);
    }
    
    // Also load Clio folder manifest for folder->matter mapping
    // In Clio, folders can be directly linked to matters
    const clioFolderIdToMatterId = new Map();
    const clioFolderPathToMatterId = new Map();
    try {
      const foldersResult = await query(`
        SELECT clio_id, clio_matter_id, full_path, matter_id 
        FROM clio_folder_manifest 
        WHERE firm_id = $1 AND (clio_matter_id IS NOT NULL OR matter_id IS NOT NULL)
      `, [firmId]);
      
      for (const f of foldersResult.rows) {
        // If folder has a direct matter_id, use it
        let matterId = f.matter_id;
        // Otherwise try to resolve via clio_matter_id
        if (!matterId && f.clio_matter_id) {
          matterId = clioMatterIdToApexId.get(parseInt(f.clio_matter_id));
        }
        
        if (matterId) {
          if (f.clio_id) clioFolderIdToMatterId.set(parseInt(f.clio_id), matterId);
          if (f.full_path) clioFolderPathToMatterId.set(f.full_path.toLowerCase(), matterId);
        }
      }
      console.log(`[SCAN] Loaded ${clioFolderIdToMatterId.size} Clio folder->matter mappings`);
    } catch (e) {
      console.log(`[SCAN] Could not load folder manifest: ${e.message}`);
    }
    
    // Function to match a folder path to a matter
    const matchFolderToMatter = (folderPath) => {
      if (!folderPath) return null;
      
      // Split path and filter out index folders
      const parts = folderPath.split('/').filter(p => p && !isIndexFolder(p));
      
      for (const part of parts) {
        const partLower = part.toLowerCase();
        const partNorm = normalizeName(part);
        
        // Try exact matches first
        if (matterByName.has(partLower)) return matterByName.get(partLower);
        if (matterByClientMatter.has(partLower)) return matterByClientMatter.get(partLower);
        if (matterByNumber.has(partLower)) return matterByNumber.get(partLower);
        if (matterByNormalizedName.has(partNorm)) return matterByNormalizedName.get(partNorm);
        
        // Try "Client - Matter" format parsing
        if (part.includes(' - ')) {
          const [clientPart, ...matterParts] = part.split(' - ');
          const afterDash = matterParts.join(' - ').trim();
          
          if (matterByName.has(afterDash.toLowerCase())) return matterByName.get(afterDash.toLowerCase());
          if (matterByNormalizedName.has(normalizeName(afterDash))) return matterByNormalizedName.get(normalizeName(afterDash));
        }
        
        // Try extracting matter number (e.g., "2024-001 Smith Case")
        const numberMatch = part.match(/^(\d{4}[-_]\d+|\d+[-_]\d+)/);
        if (numberMatch && matterByNumber.has(numberMatch[1].toLowerCase())) {
          return matterByNumber.get(numberMatch[1].toLowerCase());
        }
      }
      
      return null;
    };
    
    // ============================================
    // 3. GET MANIFEST STATS
    // ============================================
    job.phase = 'loading_manifest';
    const statsResult = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE match_status = 'matched') as already_matched,
        COUNT(*) FILTER (WHERE match_status IS NULL OR match_status NOT IN ('matched', 'not_found')) as pending
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
    job.progress.matterMappings = clioMatterIdToApexId.size;
    
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
    // 4. CREATE TEMP TABLE FOR AZURE FILES
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
    // 5. STREAM AZURE FILES TO DATABASE
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
    // 6. SQL-BASED MATCHING (no memory limits!)
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
    let matterLookupHits = 0;
    let matterLookupMisses = 0;
    
    while (hasMore && !job.cancelled) {
      // Get next chunk of unmatched manifest entries WITH their Azure matches
      // IMPORTANT: Also fetch clio_matter_id and clio_folder_id to look up matters via our mappings
      // Rows get filtered out after processing (match_status updated), so always LIMIT from start
      const chunkResult = await query(`
        SELECT 
          m.id, m.name, m.size, m.matter_id, m.clio_matter_id, m.clio_folder_id, m.clio_path,
          m.owner_id, m.content_type,
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
            
            // Resolve matter_id using multiple strategies:
            // 1. Pre-mapped value from manifest
            // 2. Lookup via clio_matter_id
            // 3. Folder path matching (for Robocopy migrations)
            let matterId = isValidUuid(entry.matter_id) ? entry.matter_id : null;
            let matchMethod = matterId ? 'manifest' : null;
            
            // Strategy 2: If matter_id is not set but we have clio_matter_id, try to resolve it
            if (!matterId && entry.clio_matter_id) {
              const resolvedMatterId = clioMatterIdToApexId.get(parseInt(entry.clio_matter_id));
              if (resolvedMatterId) {
                matterId = resolvedMatterId;
                matchMethod = 'clio_matter_id';
                matterLookupHits++;
                // Also update the manifest record for future scans
                await query(`
                  UPDATE clio_document_manifest SET matter_id = $1 WHERE id = $2
                `, [matterId, entry.id]);
              }
            }
            
            // Strategy 3: Try Clio folder manifest (folder may be linked to a matter)
            if (!matterId && entry.clio_folder_id) {
              const folderMatterId = clioFolderIdToMatterId.get(parseInt(entry.clio_folder_id));
              if (folderMatterId) {
                matterId = folderMatterId;
                matchMethod = 'clio_folder_id';
                matterLookupHits++;
                await query(`
                  UPDATE clio_document_manifest SET matter_id = $1 WHERE id = $2
                `, [matterId, entry.id]);
              }
            }
            
            // Strategy 4: Try matching by clio_path in folder manifest
            if (!matterId && entry.clio_path) {
              // Try matching the folder portion of the clio_path
              const pathParts = entry.clio_path.split('/');
              pathParts.pop(); // Remove filename
              const folderPath = pathParts.join('/').toLowerCase();
              
              if (clioFolderPathToMatterId.has(folderPath)) {
                matterId = clioFolderPathToMatterId.get(folderPath);
                matchMethod = 'clio_folder_path';
                matterLookupHits++;
                await query(`
                  UPDATE clio_document_manifest SET matter_id = $1 WHERE id = $2
                `, [matterId, entry.id]);
              }
            }
            
            // Strategy 5: Try Azure folder path matching (for Robocopy-migrated files or when all Clio lookups fail)
            if (!matterId && entry.azure_path) {
              const matchedMatter = matchFolderToMatter(folderPath);
              if (matchedMatter) {
                matterId = matchedMatter.id;
                matchMethod = 'azure_folder_path';
                matterLookupHits++;
                // Update manifest for future scans
                await query(`
                  UPDATE clio_document_manifest SET matter_id = $1 WHERE id = $2
                `, [matterId, entry.id]);
              } else if (entry.clio_matter_id || entry.clio_folder_id) {
                // Count as a miss if we had Clio metadata but couldn't resolve
                matterLookupMisses++;
                if (matterLookupMisses <= 10) {
                  console.log(`[SCAN] Warning: Could not match matter for document "${entry.name}" (clio_matter_id: ${entry.clio_matter_id}, clio_folder_id: ${entry.clio_folder_id}, folder: "${folderPath}")`);
                }
              }
            }
            
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
    results.matterLookupHits = matterLookupHits;
    results.matterLookupMisses = matterLookupMisses;
    
    console.log(`[SCAN] Matter lookup stats: ${matterLookupHits} resolved via clio_matter_id, ${matterLookupMisses} could not be resolved`);
    
    // ============================================
    // 7. CLEANUP & FINAL STATS
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
    job.scanMode = 'manifest';
    job.results = {
      success: true,
      message,
      scanMode: 'manifest',
      dryRun: !!dryRun,
      manifestTotal: totalManifest,
      azureFiles: azureFileCount,
      alreadyMatched: results.alreadyMatched,
      processed: results.processed,
      matched: results.matched,
      created: results.created,
      skipped: results.skipped,
      missing: results.missing,
      matterMappings: clioMatterIdToApexId.size,
      matterLookupHits: results.matterLookupHits,
      matterLookupMisses: results.matterLookupMisses,
      totalInDatabase: parseInt(stats.total || 0),
      withMatter: parseInt(stats.with_matter || 0),
      withoutMatter: parseInt(stats.without_matter || 0),
      errors: results.errors.slice(0, 20)
    };
    
    // Save to history
    await saveScanToHistory(firmId, job, 'manual');
    
    console.log(`[SCAN] Manifest-based scan completed for firm ${firmId}`);
    
  } catch (error) {
    console.error('[SCAN] Scan error:', error);
    job.status = error.message === 'Scan cancelled by user' ? 'cancelled' : 'error';
    job.error = error.message;
    job.completedAt = new Date().toISOString();
    
    // Save error to history
    await saveScanToHistory(firmId, job, 'manual');
    
    // Clean up temp table on error
    try {
      await query(`DROP TABLE IF EXISTS ${tempTable}`);
    } catch (e) {
      console.log('[SCAN] Failed to clean up temp table:', e.message);
    }
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
    
    // Validate firmId
    if (!firmId) {
      return res.status(400).json({ error: 'Firm ID is required' });
    }
    
    // Check if the firm exists
    const firmCheck = await query('SELECT id, name FROM firms WHERE id = $1', [firmId]);
    if (firmCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Firm not found' });
    }
    console.log(`[RESCAN] Processing firm: ${firmCheck.rows[0].name}`);
    
    // Check which columns exist in the documents table
    const columnsCheck = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'documents' AND column_name IN ('folder_path', 'owner_id', 'privacy_level')
    `);
    const existingColumns = new Set(columnsCheck.rows.map(r => r.column_name));
    const hasFolderPath = existingColumns.has('folder_path');
    const hasOwnerIdColumn = existingColumns.has('owner_id');
    const hasPrivacyLevel = existingColumns.has('privacy_level');
    
    console.log(`[RESCAN] Column check - folder_path: ${hasFolderPath}, owner_id: ${hasOwnerIdColumn}, privacy_level: ${hasPrivacyLevel}`);
    
    // Load matters with client info for better matching
    const mattersResult = await query(`
      SELECT m.id, m.name, m.number, m.responsible_attorney,
             c.display_name as client_name
      FROM matters m
      LEFT JOIN clients c ON m.client_id = c.id
      WHERE m.firm_id = $1
    `, [firmId]);
    
    console.log(`[RESCAN] Found ${mattersResult.rows.length} matters to match against`);
    
    if (mattersResult.rows.length === 0) {
      return res.json({
        success: true,
        message: 'No matters found for this firm. Please add matters before rescanning.',
        checked: 0,
        matched: 0,
        stillUnmatched: 0,
        totalDocuments: 0,
        withMatter: 0,
        withoutMatter: 0,
        sampleMatches: []
      });
    }
    
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
    
    // Helper: Check if a folder name is a Clio alphabetical/numerical index folder
    // Clio uses single letters (A, B, C) or numbers (1, 2, 3) as top-level index folders
    const isIndexFolder = (name) => {
      if (!name) return false;
      const trimmed = name.trim();
      // Single letter A-Z, single digit 0-9, or common folder names to skip
      return /^[A-Za-z0-9]$/.test(trimmed) || 
             trimmed.toLowerCase() === 'firm' ||
             trimmed.toLowerCase() === 'matters' ||
             trimmed.toLowerCase() === 'clients' ||
             trimmed.toLowerCase() === 'templates' ||
             trimmed.toLowerCase() === 'documents' ||
             trimmed.startsWith('firm-');
    };
    
    // Matching function - tries folder path parts
    // Understands Clio's structure: /A/Adams - Personal Injury/Pleadings/file.pdf
    // where A is an alphabetical index folder, Adams - Personal Injury is the matter
    let matchAttempts = 0;
    const matchFolderPath = (folderPath) => {
      if (!folderPath) return null;
      
      // Get all path parts and try to match each
      const parts = folderPath.split('/').filter(p => p && !isIndexFolder(p));
      
      // Only log for first few documents to avoid spam
      matchAttempts++;
      if (matchAttempts <= 5) {
        console.log(`[RESCAN] Matching path "${folderPath}" - candidate parts: ${parts.join(', ')}`);
      }
      
      for (const part of parts) {
        const partLower = part.toLowerCase();
        const partNorm = normalize(part);
        
        // Try all matching strategies
        if (matterByExactName.has(partLower)) {
          return matterByExactName.get(partLower);
        }
        if (matterByClientMatter.has(partLower)) {
          return matterByClientMatter.get(partLower);
        }
        if (matterByNumber.has(partLower)) {
          return matterByNumber.get(partLower);
        }
        if (matterByNormalizedName.has(partNorm)) {
          return matterByNormalizedName.get(partNorm);
        }
        
        // Try after " - " separator (Clio format: "Client Name - Matter Description")
        if (part.includes(' - ')) {
          const [clientPart, ...matterParts] = part.split(' - ');
          const afterDash = matterParts.join(' - ').trim();
          const afterDashLower = afterDash.toLowerCase();
          const afterDashNorm = normalize(afterDash);
          
          // Try just the matter description part
          if (matterByExactName.has(afterDashLower)) {
            return matterByExactName.get(afterDashLower);
          }
          if (matterByNormalizedName.has(afterDashNorm)) {
            return matterByNormalizedName.get(afterDashNorm);
          }
          
          // Also try matching the client name to find their matters
          const clientLower = clientPart.trim().toLowerCase();
          
          // Check if any matter has this client and similar description
          for (const [key, m] of matterByClientMatter) {
            if (key.startsWith(clientLower + ' - ')) {
              return m;
            }
          }
        }
        
        // Try extracting matter number from beginning (e.g., "2024-001 Smith Case")
        const numberMatch = part.match(/^(\d{4}[-_]\d+|\d+[-_]\d+)/);
        if (numberMatch) {
          const extractedNumber = numberMatch[1].toLowerCase();
          if (matterByNumber.has(extractedNumber)) {
            return matterByNumber.get(extractedNumber);
          }
        }
      }
      
      return null;
    };
    
    // Get unmatched documents - handle case where folder_path column might not exist
    let unmatched;
    try {
      if (hasFolderPath) {
        unmatched = await query(`
          SELECT id, folder_path, path FROM documents 
          WHERE firm_id = $1 AND matter_id IS NULL
        `, [firmId]);
      } else {
        // Fallback query without folder_path
        unmatched = await query(`
          SELECT id, path FROM documents 
          WHERE firm_id = $1 AND matter_id IS NULL
        `, [firmId]);
      }
    } catch (queryError) {
      console.error('[RESCAN] Error querying documents:', queryError.message);
      // Try the simplest possible query
      unmatched = await query(`
        SELECT id, path FROM documents 
        WHERE firm_id = $1 AND matter_id IS NULL
      `, [firmId]);
    }
    
    console.log(`[RESCAN] Found ${unmatched.rows.length} unmatched documents`);
    
    if (unmatched.rows.length === 0) {
      // Get total document count
      const totalDocs = await query('SELECT COUNT(*) as total FROM documents WHERE firm_id = $1', [firmId]);
      const total = parseInt(totalDocs.rows[0].total) || 0;
      
      return res.json({
        success: true,
        message: total === 0 
          ? 'No documents found. Please run a Full Scan first to import documents.'
          : 'All documents are already matched to matters.',
        checked: 0,
        matched: 0,
        stillUnmatched: 0,
        totalDocuments: total,
        withMatter: total,
        withoutMatter: 0,
        sampleMatches: []
      });
    }
    
    let matched = 0;
    const matchDetails = [];
    const errors = [];
    
    for (const doc of unmatched.rows) {
      try {
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
          // Build dynamic update query based on available columns
          let updateQuery = 'UPDATE documents SET matter_id = $2';
          const updateParams = [doc.id, matter.id];
          let paramIndex = 3;
          
          if (hasOwnerIdColumn && matter.responsible_attorney) {
            updateQuery += `, owner_id = COALESCE(owner_id, $${paramIndex})`;
            updateParams.push(matter.responsible_attorney);
            paramIndex++;
          }
          
          if (hasPrivacyLevel) {
            updateQuery += `, privacy_level = 'team'`;
          }
          
          updateQuery += ', updated_at = NOW() WHERE id = $1';
          
          await query(updateQuery, updateParams);
          matched++;
          
          if (matchDetails.length < 10) {
            matchDetails.push({ folder: folderToMatch, matterName: matter.name, docId: doc.id });
          }
        }
      } catch (docError) {
        console.error(`[RESCAN] Error processing document ${doc.id}:`, docError.message);
        if (errors.length < 5) {
          errors.push({ docId: doc.id, error: docError.message });
        }
      }
    }
    
    // Fix ownership for any docs with matter but no owner (if owner_id column exists)
    if (hasOwnerIdColumn) {
      try {
        await query(`
          UPDATE documents d SET owner_id = m.responsible_attorney
          FROM matters m
          WHERE d.matter_id = m.id AND d.firm_id = $1 
            AND d.owner_id IS NULL AND m.responsible_attorney IS NOT NULL
        `, [firmId]);
      } catch (ownerError) {
        console.error('[RESCAN] Error updating ownership:', ownerError.message);
      }
    }
    
    // Get updated stats
    const stats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(matter_id) as with_matter,
        COUNT(*) - COUNT(matter_id) as without_matter
      FROM documents WHERE firm_id = $1
    `, [firmId]);
    
    const message = matched > 0
      ? `Rescan complete: matched ${matched} of ${unmatched.rows.length} unmatched documents to matters.`
      : `Rescan complete: checked ${unmatched.rows.length} unmatched documents, but none could be matched. Check that folder names match matter names.`;
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
      sampleMatches: matchDetails,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('[RESCAN] Error:', error);
    // Provide more helpful error messages
    let errorMessage = error.message;
    if (error.message.includes('column') && error.message.includes('does not exist')) {
      errorMessage = 'Database schema needs updating. Please contact your administrator.';
    } else if (error.message.includes('permission denied')) {
      errorMessage = 'Database permission error. Please contact your administrator.';
    } else if (error.message.includes('connection')) {
      errorMessage = 'Database connection error. Please try again.';
    }
    res.status(500).json({ error: errorMessage, details: error.message });
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
