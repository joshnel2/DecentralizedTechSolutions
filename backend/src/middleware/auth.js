import { verifyAccessToken, hasPermission, hashToken } from '../utils/auth.js';
import { query } from '../db/connection.js';

// Authentication middleware - supports both JWT and API key
export async function authenticate(req, res, next) {
  try {
    // Get token from header or cookie
    let token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    // Check for API key authentication (format: apex_...)
    if (token && token.startsWith('apex_')) {
      return authenticateApiKey(req, res, next, token);
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = verifyAccessToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Get user from database
    const result = await query(
      `SELECT id, email, first_name, last_name, role, firm_id, is_active, two_factor_enabled
       FROM users WHERE id = $1`,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is disabled' });
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      firmId: user.firm_id,
      twoFactorEnabled: user.two_factor_enabled,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
}

// API Key authentication helper
async function authenticateApiKey(req, res, next, apiKey) {
  try {
    const keyHash = hashToken(apiKey);
    
    // Find API key in database
    const result = await query(
      `SELECT ak.id, ak.firm_id, ak.permissions, ak.expires_at, ak.is_active, ak.created_by,
              f.name as firm_name, f.subdomain
       FROM api_keys ak
       JOIN firms f ON ak.firm_id = f.id
       WHERE ak.key_hash = $1`,
      [keyHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const key = result.rows[0];

    if (!key.is_active) {
      return res.status(401).json({ error: 'API key has been revoked' });
    }

    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return res.status(401).json({ error: 'API key has expired' });
    }

    // Update last used timestamp
    await query(
      'UPDATE api_keys SET last_used = NOW() WHERE id = $1',
      [key.id]
    );

    // Attach API key info to request
    req.user = {
      id: key.created_by,
      firmId: key.firm_id,
      role: 'api', // Special role for API key access
      isApiKey: true,
      apiKeyId: key.id,
      apiKeyPermissions: key.permissions || [],
    };

    next();
  } catch (error) {
    console.error('API key auth error:', error);
    return res.status(500).json({ error: 'API key authentication error' });
  }
}

// Permission check middleware factory
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // For API key requests, check the key's permissions
    if (req.user.isApiKey) {
      const apiPerms = req.user.apiKeyPermissions || [];
      // Map permission to API key format (e.g., 'matters:view' -> 'matters:read')
      const permParts = permission.split(':');
      const resource = permParts[0];
      const action = permParts[1];
      
      // Check if API key has required permission
      const hasReadPerm = apiPerms.includes(`${resource}:read`);
      const hasWritePerm = apiPerms.includes(`${resource}:write`);
      
      const isReadAction = ['view', 'read', 'list'].includes(action);
      const isWriteAction = ['create', 'edit', 'delete', 'write', 'manage'].includes(action);
      
      if (isReadAction && !hasReadPerm && !hasWritePerm) {
        return res.status(403).json({ error: 'API key lacks required permission' });
      }
      if (isWriteAction && !hasWritePerm) {
        return res.status(403).json({ error: 'API key lacks write permission' });
      }
      
      return next();
    }

    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

// Require specific roles
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient role' });
    }

    next();
  };
}

// Optional authentication (for public routes that can optionally have auth)
export async function optionalAuth(req, res, next) {
  try {
    let token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (token) {
      const decoded = verifyAccessToken(token);
      if (decoded) {
        const result = await query(
          `SELECT id, email, first_name, last_name, role, firm_id, is_active
           FROM users WHERE id = $1 AND is_active = true`,
          [decoded.userId]
        );

        if (result.rows.length > 0) {
          const user = result.rows[0];
          req.user = {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role,
            firmId: user.firm_id,
          };
        }
      }
    }

    next();
  } catch (error) {
    // Silently continue without auth
    next();
  }
}
