import { verifyAccessToken, hasPermission } from '../utils/auth.js';
import { query } from '../db/connection.js';

// Authentication middleware
export async function authenticate(req, res, next) {
  try {
    // Get token from header or cookie
    let token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken;
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

// Permission check middleware factory
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
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
