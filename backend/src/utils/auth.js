import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const SALT_ROUNDS = 12;

// Password hashing
export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// JWT tokens
export function generateAccessToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      firmId: user.firm_id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
}

export function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    return null;
  }
}

// Hash tokens for storage
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Generate secure random tokens
export function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

// Role-based permissions
const rolePermissions = {
  owner: [
    'firm:manage', 'firm:billing', 'firm:delete',
    'users:invite', 'users:manage', 'users:delete',
    'groups:manage',
    'matters:create', 'matters:view', 'matters:edit', 'matters:delete', 'matters:assign',
    'clients:create', 'clients:view', 'clients:edit', 'clients:delete',
    'billing:create', 'billing:view', 'billing:edit', 'billing:delete', 'billing:approve',
    'documents:upload', 'documents:view', 'documents:edit', 'documents:delete',
    'calendar:create', 'calendar:view', 'calendar:edit', 'calendar:delete',
    'reports:view', 'reports:create', 'reports:export',
    'integrations:manage',
    'audit:view'
  ],
  admin: [
    'users:invite', 'users:manage',
    'groups:manage',
    'matters:create', 'matters:view', 'matters:edit', 'matters:delete', 'matters:assign',
    'clients:create', 'clients:view', 'clients:edit', 'clients:delete',
    'billing:create', 'billing:view', 'billing:edit', 'billing:approve',
    'documents:upload', 'documents:view', 'documents:edit', 'documents:delete',
    'calendar:create', 'calendar:view', 'calendar:edit', 'calendar:delete',
    'reports:view', 'reports:create', 'reports:export',
    'integrations:manage',
    'audit:view'
  ],
  attorney: [
    'matters:create', 'matters:view', 'matters:edit',
    'clients:create', 'clients:view', 'clients:edit',
    'billing:create', 'billing:view',
    'documents:upload', 'documents:view', 'documents:edit',
    'calendar:create', 'calendar:view', 'calendar:edit',
    'reports:view'
  ],
  paralegal: [
    'matters:view', 'matters:edit',
    'clients:view',
    'billing:view',
    'documents:upload', 'documents:view', 'documents:edit',
    'calendar:create', 'calendar:view', 'calendar:edit'
  ],
  staff: [
    'matters:view',
    'clients:view',
    'documents:view',
    'calendar:view'
  ],
  billing: [
    'matters:view',
    'clients:view',
    'billing:create', 'billing:view', 'billing:edit', 'billing:approve',
    'reports:view', 'reports:create', 'reports:export'
  ],
  readonly: [
    'matters:view',
    'clients:view',
    'documents:view',
    'calendar:view',
    'reports:view'
  ]
};

export function getPermissionsForRole(role) {
  return rolePermissions[role] || rolePermissions.readonly;
}

export function hasPermission(userRole, permission) {
  if (userRole === 'owner') return true;
  const permissions = rolePermissions[userRole] || [];
  return permissions.includes(permission);
}
