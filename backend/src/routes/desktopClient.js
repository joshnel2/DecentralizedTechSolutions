import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const router = Router();

// ============================================
// APEX DRIVE DESKTOP CLIENT ENDPOINTS
// ============================================
// 
// These endpoints support the desktop client download,
// connection setup, and device management.

const JWT_SECRET = process.env.JWT_SECRET || 'apex-jwt-secret-change-me';

// Desktop client download info
const DOWNLOAD_URL_WINDOWS = process.env.APEX_DESKTOP_DOWNLOAD_URL || 'https://github.com/joshnel2/DecentralizedTechSolutions/releases/download/v1.0.3/Apex.Drive.Setup.1.0.0.exe';

const DESKTOP_CLIENT_INFO = {
  version: '1.0.0',
  releaseDate: '2024-01-26',
  downloadUrl: {
    windows: DOWNLOAD_URL_WINDOWS,
    mac: null, // Mac version coming soon
  },
  requirements: {
    windows: 'Windows 10 or later (64-bit)',
    mac: 'macOS 10.15 (Catalina) or later',
  },
  features: [
    'Virtual drive letter in File Explorer',
    'Real-time sync with Azure storage',
    'Offline file caching',
    'Matter-organized folders',
    'Desktop app integration (Word, Excel, etc.)',
  ],
  releaseNotes: [
    'Initial release',
    'WinFsp integration for virtual drive',
    'Local file caching',
    'System tray integration',
  ],
};

/**
 * Direct download redirect - /installdrive
 * Public endpoint - no auth required
 */
router.get('/download', (req, res) => {
  res.redirect(DOWNLOAD_URL_WINDOWS);
});

/**
 * Get desktop client info and download links
 */
router.get('/info', authenticate, async (req, res) => {
  try {
    // Check if user's firm has Apex Drive enabled
    const firmDrive = await query(`
      SELECT dc.*, 
             (SELECT COUNT(*) FROM documents WHERE firm_id = dc.firm_id AND storage_location = 'azure') as doc_count
      FROM drive_configurations dc
      WHERE dc.firm_id = $1 AND dc.is_default = true
      LIMIT 1
    `, [req.user.firmId]);

    const isApexDriveEnabled = firmDrive.rows.length > 0;
    const documentCount = firmDrive.rows[0]?.doc_count || 0;

    // Get user's registered devices
    let registeredDevices = [];
    try {
      const devicesResult = await query(`
        SELECT id, device_name, platform, app_version, last_seen_at, created_at
        FROM desktop_clients
        WHERE user_id = $1
        ORDER BY last_seen_at DESC
      `, [req.user.id]);
      registeredDevices = devicesResult.rows;
    } catch (err) {
      // Table might not exist
    }

    res.json({
      ...DESKTOP_CLIENT_INFO,
      isAvailable: isApexDriveEnabled,
      documentCount,
      registeredDevices,
      serverUrl: process.env.BACKEND_URL || process.env.API_URL || 'https://api.apexlegal.com',
      message: isApexDriveEnabled 
        ? 'Apex Drive is enabled for your firm. Download the desktop client to get started.'
        : 'Apex Drive must be enabled by your administrator before you can use the desktop client.',
    });
  } catch (error) {
    console.error('[DESKTOP CLIENT] Info error:', error);
    res.status(500).json({ error: 'Failed to get desktop client info' });
  }
});

/**
 * Generate a connection token for the desktop client
 * This allows one-click setup from the web app
 */
router.post('/connection-token', authenticate, async (req, res) => {
  try {
    const { deviceName } = req.body;

    // Generate a short-lived connection token (valid for 10 minutes)
    const connectionToken = jwt.sign({
      type: 'desktop-connection',
      userId: req.user.id,
      firmId: req.user.firmId,
      email: req.user.email,
      deviceName: deviceName || 'Unknown Device',
    }, JWT_SECRET, { expiresIn: '10m' });

    // Also generate a unique connection code (easier to type manually)
    const connectionCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    
    // Store the connection code temporarily
    try {
      await query(`
        INSERT INTO desktop_connection_codes (
          code, user_id, firm_id, token, expires_at
        ) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')
        ON CONFLICT (code) DO UPDATE SET
          user_id = $2, firm_id = $3, token = $4, expires_at = NOW() + INTERVAL '10 minutes'
      `, [connectionCode, req.user.id, req.user.firmId, connectionToken]);
    } catch (err) {
      // Table might not exist - that's okay, token still works
      console.log('[DESKTOP CLIENT] Connection codes table not available');
    }

    // Build the connection URL for the desktop app
    const serverUrl = process.env.BACKEND_URL || process.env.API_URL || 'https://api.apexlegal.com';
    const connectionUrl = `apexdrive://connect?token=${encodeURIComponent(connectionToken)}&server=${encodeURIComponent(serverUrl)}`;

    res.json({
      connectionToken,
      connectionCode,
      connectionUrl,
      serverUrl,
      expiresIn: 600, // 10 minutes in seconds
      instructions: [
        '1. Download and install Apex Drive',
        '2. Open Apex Drive and click "Connect to Firm"',
        `3. Enter the code: ${connectionCode}`,
        '4. Or click the connection link below',
      ],
    });
  } catch (error) {
    console.error('[DESKTOP CLIENT] Connection token error:', error);
    res.status(500).json({ error: 'Failed to generate connection token' });
  }
});

/**
 * Validate a connection code and return auth token
 * Called by desktop client during setup
 */
router.post('/validate-code', async (req, res) => {
  try {
    const { code, deviceName, platform, version } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Connection code is required' });
    }

    // Look up the connection code
    let codeData = null;
    try {
      const codeResult = await query(`
        SELECT * FROM desktop_connection_codes
        WHERE code = $1 AND expires_at > NOW()
      `, [code.toUpperCase()]);
      
      if (codeResult.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired connection code' });
      }
      
      codeData = codeResult.rows[0];
    } catch (err) {
      // Table doesn't exist - try to validate as JWT directly
      try {
        const decoded = jwt.verify(code, JWT_SECRET);
        if (decoded.type !== 'desktop-connection') {
          return res.status(400).json({ error: 'Invalid connection code' });
        }
        codeData = {
          user_id: decoded.userId,
          firm_id: decoded.firmId,
        };
      } catch (jwtErr) {
        return res.status(400).json({ error: 'Invalid or expired connection code' });
      }
    }

    // Get user details
    const userResult = await query(`
      SELECT u.*, f.name as firm_name
      FROM users u
      LEFT JOIN firms f ON f.id = u.firm_id
      WHERE u.id = $1
    `, [codeData.user_id]);

    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Generate long-lived auth token for desktop client
    const authToken = jwt.sign({
      id: user.id,
      email: user.email,
      firmId: user.firm_id,
      role: user.role,
      type: 'desktop',
    }, JWT_SECRET, { expiresIn: '30d' });

    // Generate refresh token
    const refreshToken = jwt.sign({
      id: user.id,
      type: 'desktop-refresh',
    }, JWT_SECRET, { expiresIn: '90d' });

    // Register the device
    let clientId = null;
    try {
      const deviceResult = await query(`
        INSERT INTO desktop_clients (
          user_id, firm_id, device_name, platform, app_version, last_seen_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (user_id, device_name) DO UPDATE SET
          platform = $4,
          app_version = $5,
          last_seen_at = NOW()
        RETURNING id
      `, [user.id, user.firm_id, deviceName || 'Unknown', platform || 'windows', version || '1.0.0']);
      clientId = deviceResult.rows[0]?.id;
    } catch (err) {
      // Table might not exist
      clientId = `${user.id}-${Date.now()}`;
    }

    // Delete the used connection code
    try {
      await query('DELETE FROM desktop_connection_codes WHERE code = $1', [code.toUpperCase()]);
    } catch (err) {
      // Table might not exist
    }

    res.json({
      success: true,
      token: authToken,
      refreshToken,
      clientId,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        firmId: user.firm_id,
        firmName: user.firm_name,
      },
      serverUrl: process.env.BACKEND_URL || process.env.API_URL || 'https://api.apexlegal.com',
    });
  } catch (error) {
    console.error('[DESKTOP CLIENT] Validate code error:', error);
    res.status(500).json({ error: 'Failed to validate connection code' });
  }
});

/**
 * Validate a connection token (JWT)
 * Called by desktop client when using deep link
 */
router.post('/validate-token', async (req, res) => {
  try {
    const { token, deviceName, platform, version } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Connection token is required' });
    }

    // Verify the token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid or expired connection token' });
    }

    if (decoded.type !== 'desktop-connection') {
      return res.status(400).json({ error: 'Invalid token type' });
    }

    // Get user details
    const userResult = await query(`
      SELECT u.*, f.name as firm_name
      FROM users u
      LEFT JOIN firms f ON f.id = u.firm_id
      WHERE u.id = $1
    `, [decoded.userId]);

    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Generate long-lived auth token for desktop client
    const authToken = jwt.sign({
      id: user.id,
      email: user.email,
      firmId: user.firm_id,
      role: user.role,
      type: 'desktop',
    }, JWT_SECRET, { expiresIn: '30d' });

    // Generate refresh token
    const refreshToken = jwt.sign({
      id: user.id,
      type: 'desktop-refresh',
    }, JWT_SECRET, { expiresIn: '90d' });

    // Register the device
    let clientId = null;
    try {
      const deviceResult = await query(`
        INSERT INTO desktop_clients (
          user_id, firm_id, device_name, platform, app_version, last_seen_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (user_id, device_name) DO UPDATE SET
          platform = $4,
          app_version = $5,
          last_seen_at = NOW()
        RETURNING id
      `, [user.id, user.firm_id, deviceName || decoded.deviceName || 'Unknown', platform || 'windows', version || '1.0.0']);
      clientId = deviceResult.rows[0]?.id;
    } catch (err) {
      clientId = `${user.id}-${Date.now()}`;
    }

    res.json({
      success: true,
      token: authToken,
      refreshToken,
      clientId,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        firmId: user.firm_id,
        firmName: user.firm_name,
      },
      serverUrl: process.env.BACKEND_URL || process.env.API_URL || 'https://api.apexlegal.com',
    });
  } catch (error) {
    console.error('[DESKTOP CLIENT] Validate token error:', error);
    res.status(500).json({ error: 'Failed to validate connection token' });
  }
});

/**
 * Get list of user's registered devices
 */
router.get('/devices', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT id, device_name, platform, app_version, last_seen_at, created_at
      FROM desktop_clients
      WHERE user_id = $1
      ORDER BY last_seen_at DESC
    `, [req.user.id]);

    res.json({ devices: result.rows });
  } catch (error) {
    // Table might not exist
    res.json({ devices: [] });
  }
});

/**
 * Remove a registered device
 */
router.delete('/devices/:deviceId', authenticate, async (req, res) => {
  try {
    const { deviceId } = req.params;

    await query(`
      DELETE FROM desktop_clients
      WHERE id = $1 AND user_id = $2
    `, [deviceId, req.user.id]);

    res.json({ success: true });
  } catch (error) {
    res.json({ success: true });
  }
});

/**
 * Check latest version
 */
router.get('/check-update', async (req, res) => {
  try {
    const { currentVersion, platform } = req.query;

    // In production, this would check against a release server
    const latestVersion = DESKTOP_CLIENT_INFO.version;
    const updateAvailable = currentVersion !== latestVersion;

    res.json({
      updateAvailable,
      currentVersion: currentVersion || 'unknown',
      latestVersion,
      releaseNotes: updateAvailable ? DESKTOP_CLIENT_INFO.releaseNotes : [],
      downloadUrl: DESKTOP_CLIENT_INFO.downloadUrl[platform] || DESKTOP_CLIENT_INFO.downloadUrl.windows,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check for updates' });
  }
});

export default router;
