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
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
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
// Billing permissions follow Clio Manage's model:
//   billing:create    - Create time entries, expenses (own only for non-admin)
//   billing:view      - View billing data (scoped by role)
//   billing:edit      - Edit time entries, expenses, invoices
//   billing:delete    - Delete draft invoices, unbilled time entries
//   billing:approve   - Approve/reject time entries and expenses in approval workflow
//   billing:finalize  - Finalize invoices (lock for sending), void invoices
//   billing:trust     - Manage trust accounts, deposits, withdrawals (IOLTA)
//   billing:settings  - Modify firm-wide billing settings
//   billing:writeoff  - Create write-offs and credit notes
//   billing:export    - Export billing data (LEDES, CSV, PDF)
const rolePermissions = {
  owner: [
    'firm:manage', 'firm:billing', 'firm:delete',
    'users:invite', 'users:manage', 'users:delete',
    'groups:manage',
    'matters:create', 'matters:view', 'matters:edit', 'matters:delete', 'matters:assign',
    'clients:create', 'clients:view', 'clients:edit', 'clients:delete',
    'billing:create', 'billing:view', 'billing:edit', 'billing:delete', 'billing:approve',
    'billing:finalize', 'billing:trust', 'billing:settings', 'billing:writeoff', 'billing:export',
    'documents:upload', 'documents:view', 'documents:edit', 'documents:delete',
    'calendar:create', 'calendar:view', 'calendar:edit', 'calendar:delete',
    'reports:view', 'reports:create', 'reports:export',
    'analytics:view', 'analytics:export',
    'integrations:manage',
    'audit:view'
  ],
  admin: [
    'users:invite', 'users:manage',
    'groups:manage',
    'matters:create', 'matters:view', 'matters:edit', 'matters:delete', 'matters:assign',
    'clients:create', 'clients:view', 'clients:edit', 'clients:delete',
    'billing:create', 'billing:view', 'billing:edit', 'billing:approve',
    'billing:finalize', 'billing:trust', 'billing:settings', 'billing:writeoff', 'billing:export',
    'documents:upload', 'documents:view', 'documents:edit', 'documents:delete',
    'calendar:create', 'calendar:view', 'calendar:edit', 'calendar:delete',
    'reports:view', 'reports:create', 'reports:export',
    'analytics:view', 'analytics:export',
    'integrations:manage',
    'audit:view'
  ],
  partner: [
    'matters:create', 'matters:view', 'matters:edit', 'matters:delete', 'matters:assign',
    'clients:create', 'clients:view', 'clients:edit', 'clients:delete',
    'billing:create', 'billing:view', 'billing:edit', 'billing:approve',
    'billing:finalize', 'billing:writeoff', 'billing:export',
    'documents:upload', 'documents:view', 'documents:edit', 'documents:delete',
    'calendar:create', 'calendar:view', 'calendar:edit', 'calendar:delete',
    'reports:view', 'reports:create', 'reports:export',
    'analytics:view', 'analytics:export',
    'audit:view'
  ],
  attorney: [
    'matters:create', 'matters:view', 'matters:edit',
    'clients:create', 'clients:view', 'clients:edit',
    'billing:create', 'billing:view', 'billing:export',
    'documents:upload', 'documents:view', 'documents:edit',
    'calendar:create', 'calendar:view', 'calendar:edit',
    'reports:view'
  ],
  paralegal: [
    'matters:create', 'matters:view', 'matters:edit',
    'clients:create', 'clients:view',
    'billing:view', 'billing:create',
    'documents:upload', 'documents:view', 'documents:edit',
    'calendar:create', 'calendar:view', 'calendar:edit'
  ],
  staff: [
    'matters:create', 'matters:view',
    'clients:create', 'clients:view',
    'billing:view',
    'documents:view',
    'calendar:view'
  ],
  billing: [
    'matters:create', 'matters:view',
    'clients:create', 'clients:view',
    'billing:create', 'billing:view', 'billing:edit', 'billing:approve',
    'billing:finalize', 'billing:trust', 'billing:settings', 'billing:writeoff', 'billing:export',
    'reports:view', 'reports:create', 'reports:export',
    'analytics:view'
  ],
  readonly: [
    'matters:view',
    'clients:view',
    'billing:view',
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
