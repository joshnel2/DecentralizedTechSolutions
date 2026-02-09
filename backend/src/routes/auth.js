import { Router } from 'express';
import { query, withTransaction } from '../db/connection.js';
import { seedFirmRoles } from '../services/roleService.js';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
  generateSecureToken,
  getPermissionsForRole,
} from '../utils/auth.js';
import { sendPasswordResetEmail } from '../utils/email.js';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = Router();

// Register new user (creates firm too)
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, firstName, lastName, firmName } = req.body;

    // Validation
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if email exists
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const result = await withTransaction(async (client) => {
      // Create firm
      const firmResult = await client.query(
        `INSERT INTO firms (name) VALUES ($1) RETURNING id, name`,
        [firmName || `${firstName}'s Firm`]
      );
      const firm = firmResult.rows[0];

      // Create user
      const passwordHash = await hashPassword(password);
      const userResult = await client.query(
        `INSERT INTO users (firm_id, email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5, 'owner')
         RETURNING id, email, first_name, last_name, role, firm_id`,
        [firm.id, email.toLowerCase(), passwordHash, firstName, lastName]
      );
      const user = userResult.rows[0];

      return { user, firm };
    });

    // Seed default roles for the new firm (non-blocking, best-effort)
    seedFirmRoles(result.firm.id).catch(err => {
      console.log('[AUTH] Role seeding note (will auto-seed on first access):', err.message);
    });

    // Generate tokens
    const accessToken = generateAccessToken(result.user);
    const refreshToken = generateRefreshToken(result.user);

    // Store refresh token
    await query(
      `INSERT INTO user_sessions (user_id, refresh_token_hash, device_info, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
      [result.user.id, hashToken(refreshToken), req.headers['user-agent'], req.ip]
    );

    // Set cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.first_name,
        lastName: result.user.last_name,
        role: result.user.role,
        firmId: result.user.firm_id,
        permissions: getPermissionsForRole(result.user.role),
      },
      firm: result.firm,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Get user
    const result = await query(
      `SELECT u.*, f.name as firm_name, f.id as firm_id
       FROM users u
       LEFT JOIN firms f ON u.firm_id = f.id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is disabled' });
    }

    // Verify password
    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if 2FA is required
    if (user.two_factor_enabled) {
      // Generate temporary token for 2FA flow
      const tempToken = generateSecureToken(16);
      await query(
        `UPDATE users SET two_factor_secret = $1 WHERE id = $2`,
        [hashToken(tempToken), user.id]
      );

      return res.json({
        requires2FA: true,
        tempToken,
        userId: user.id,
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store session
    await query(
      `INSERT INTO user_sessions (user_id, refresh_token_hash, device_info, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
      [user.id, hashToken(refreshToken), req.headers['user-agent'], req.ip]
    );

    // Update last login
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // Get firm data
    const firmResult = await query('SELECT * FROM firms WHERE id = $1', [user.firm_id]);
    const firm = firmResult.rows[0];

    // Set cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Log action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, ip_address, user_agent)
       VALUES ($1, $2, 'auth.login', 'session', $3, $4)`,
      [user.firm_id, user.id, req.ip, req.headers['user-agent']]
    );

    res.json({
      requires2FA: false,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        firmId: user.firm_id,
        permissions: getPermissionsForRole(user.role),
      },
      firm: {
        id: firm.id,
        name: firm.name,
        address: firm.address,
        city: firm.city,
        state: firm.state,
        zipCode: firm.zip_code,
        phone: firm.phone,
        email: firm.email,
        website: firm.website,
        billingDefaults: firm.billing_defaults,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Check if session exists
    const sessionResult = await query(
      `SELECT * FROM user_sessions 
       WHERE user_id = $1 AND refresh_token_hash = $2 AND expires_at > NOW()`,
      [decoded.userId, hashToken(refreshToken)]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: 'Session expired or revoked' });
    }

    // Get user
    const userResult = await query(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Generate new access token
    const accessToken = generateAccessToken(user);

    // Update session activity
    await query(
      'UPDATE user_sessions SET last_activity = NOW() WHERE id = $1',
      [sessionResult.rows[0].id]
    );

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    res.json({ accessToken });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Logout
router.post('/logout', authenticate, async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

    if (refreshToken) {
      // Delete session
      await query(
        'DELETE FROM user_sessions WHERE user_id = $1 AND refresh_token_hash = $2',
        [req.user.id, hashToken(refreshToken)]
      );
    }

    // Log action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, ip_address, user_agent)
       VALUES ($1, $2, 'auth.logout', 'session', $3, $4)`,
      [req.user.firmId, req.user.id, req.ip, req.headers['user-agent']]
    );

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const userResult = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.firm_id, 
              u.phone, u.avatar_url, u.hourly_rate, u.two_factor_enabled,
              u.created_at, u.last_login_at
       FROM users u WHERE u.id = $1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Get firm
    const firmResult = await query('SELECT * FROM firms WHERE id = $1', [user.firm_id]);
    const firm = firmResult.rows[0];

    // Get user's groups
    const groupsResult = await query(
      `SELECT g.* FROM groups g
       JOIN user_groups ug ON g.id = ug.group_id
       WHERE ug.user_id = $1`,
      [user.id]
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        firmId: user.firm_id,
        phone: user.phone,
        avatarUrl: user.avatar_url,
        hourlyRate: user.hourly_rate,
        twoFactorEnabled: user.two_factor_enabled,
        permissions: getPermissionsForRole(user.role),
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
        groupIds: groupsResult.rows.map(g => g.id),
      },
      firm: firm ? {
        id: firm.id,
        name: firm.name,
        address: firm.address,
        city: firm.city,
        state: firm.state,
        zipCode: firm.zip_code,
        phone: firm.phone,
        email: firm.email,
        website: firm.website,
        billingDefaults: firm.billing_defaults,
        createdAt: firm.created_at,
      } : null,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

// Update password
router.put('/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    // Get current password hash
    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];

    // Verify current password
    const validPassword = await verifyPassword(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Update password
    const newHash = await hashPassword(newPassword);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);

    // Log action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, ip_address)
       VALUES ($1, $2, 'user.password_changed', 'user', $2, $3)`,
      [req.user.firmId, req.user.id, req.ip]
    );

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password update error:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// Get active sessions
router.get('/sessions', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, device_info, ip_address, created_at, last_activity, expires_at
       FROM user_sessions
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY last_activity DESC`,
      [req.user.id]
    );

    // Mark current session
    const currentToken = req.cookies?.refreshToken || req.headers['x-refresh-token'];
    const currentHash = currentToken ? hashToken(currentToken) : null;

    const sessions = result.rows.map(s => ({
      ...s,
      isCurrent: false, // We'd need to match the hash to determine current
    }));

    res.json({ sessions });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// Revoke session
router.delete('/sessions/:sessionId', authenticate, async (req, res) => {
  try {
    await query(
      'DELETE FROM user_sessions WHERE id = $1 AND user_id = $2',
      [req.params.sessionId, req.user.id]
    );

    res.json({ message: 'Session revoked' });
  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

// Revoke all other sessions
router.delete('/sessions', authenticate, async (req, res) => {
  try {
    const currentToken = req.cookies?.refreshToken;
    
    if (currentToken) {
      await query(
        'DELETE FROM user_sessions WHERE user_id = $1 AND refresh_token_hash != $2',
        [req.user.id, hashToken(currentToken)]
      );
    } else {
      await query('DELETE FROM user_sessions WHERE user_id = $1', [req.user.id]);
    }

    res.json({ message: 'All other sessions revoked' });
  } catch (error) {
    console.error('Revoke sessions error:', error);
    res.status(500).json({ error: 'Failed to revoke sessions' });
  }
});

// Forgot Password - Request reset email
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Always return success message to prevent email enumeration
    const successMessage = 'If an account with that email exists, we have sent a password reset link.';

    // Check if user exists
    const userResult = await query(
      'SELECT id, email, first_name FROM users WHERE email = $1 AND is_active = true',
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      // Return success even if user not found (prevent email enumeration)
      return res.json({ message: successMessage });
    }

    const user = userResult.rows[0];

    // Invalidate any existing reset tokens for this user
    await query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      [user.id]
    );

    // Generate a secure random token (64 bytes = 128 hex chars)
    const resetToken = generateSecureToken(64);
    const tokenHash = hashToken(resetToken);

    // Token expires in 1 hour
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Store the hashed token
    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, tokenHash, expiresAt, req.ip, req.headers['user-agent']]
    );

    // Send reset email
    try {
      await sendPasswordResetEmail(user.email, resetToken, user.first_name);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      // Don't reveal email sending failure to user
    }

    // Log the action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, ip_address, user_agent)
       VALUES ((SELECT firm_id FROM users WHERE id = $1), $1, 'auth.password_reset_requested', 'user', $1, $2, $3)`,
      [user.id, req.ip, req.headers['user-agent']]
    );

    res.json({ message: successMessage });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// Reset Password - Verify token and set new password
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Hash the provided token to compare with stored hash
    const tokenHash = hashToken(token);

    // Find valid, unused token that hasn't expired
    const tokenResult = await query(
      `SELECT prt.*, u.email, u.first_name, u.firm_id
       FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.id
       WHERE prt.token_hash = $1 
         AND prt.expires_at > NOW() 
         AND prt.used_at IS NULL
         AND u.is_active = true`,
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    const resetRecord = tokenResult.rows[0];

    // Update password and mark token as used
    await withTransaction(async (client) => {
      // Hash new password
      const passwordHash = await hashPassword(newPassword);

      // Update user's password
      await client.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [passwordHash, resetRecord.user_id]
      );

      // Mark token as used
      await client.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
        [resetRecord.id]
      );

      // Invalidate all existing sessions (force re-login)
      await client.query(
        'DELETE FROM user_sessions WHERE user_id = $1',
        [resetRecord.user_id]
      );
    });

    // Log the action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, ip_address, user_agent)
       VALUES ($1, $2, 'auth.password_reset_completed', 'user', $2, $3, $4)`,
      [resetRecord.firm_id, resetRecord.user_id, req.ip, req.headers['user-agent']]
    );

    res.json({ message: 'Password has been reset successfully. You can now log in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Verify reset token - Check if token is valid (used by frontend)
router.get('/verify-reset-token', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ valid: false, error: 'Token is required' });
    }

    const tokenHash = hashToken(token);

    const tokenResult = await query(
      `SELECT prt.id, u.email, u.first_name
       FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.id
       WHERE prt.token_hash = $1 
         AND prt.expires_at > NOW() 
         AND prt.used_at IS NULL
         AND u.is_active = true`,
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      return res.json({ valid: false, error: 'Invalid or expired reset link' });
    }

    // Don't reveal email, just confirm validity
    res.json({ 
      valid: true,
      firstName: tokenResult.rows[0].first_name 
    });
  } catch (error) {
    console.error('Verify reset token error:', error);
    res.status(500).json({ valid: false, error: 'Failed to verify token' });
  }
});

export default router;
