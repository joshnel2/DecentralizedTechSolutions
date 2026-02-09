/**
 * Role Service - Manages firm-specific roles and permissions
 * 
 * This is the single source of truth for "what can this user do?"
 * 
 * Resolution order:
 *   1. Check if user has a REVOKE override → deny
 *   2. Check if user's firm_role grants the permission → allow
 *   3. Check if user has a GRANT override → allow
 *   4. Fall back to hardcoded defaults (backward compatibility)
 *   5. Deny
 */

import { query } from '../db/connection.js';

// ============================================
// DEFAULT ROLE DEFINITIONS
// ============================================
// These are seeded into firm_roles when a firm is created.
// They match the hardcoded permissions in utils/auth.js exactly.

export const DEFAULT_ROLES = [
  {
    name: 'owner',
    display_name: 'Owner',
    description: 'Full access to everything. Cannot be restricted.',
    is_system: true,
    is_editable: false,
    color: '#7C3AED',
    sort_order: 1,
    permissions: [
      'firm:manage', 'firm:billing', 'firm:delete',
      'users:invite', 'users:manage', 'users:delete',
      'groups:manage',
      'matters:create', 'matters:view', 'matters:edit', 'matters:delete', 'matters:assign',
      'clients:create', 'clients:view', 'clients:edit', 'clients:delete',
      'billing:create', 'billing:view', 'billing:edit', 'billing:delete', 'billing:approve',
      'documents:upload', 'documents:view', 'documents:edit', 'documents:delete',
      'calendar:create', 'calendar:view', 'calendar:edit', 'calendar:delete',
      'reports:view', 'reports:create', 'reports:export',
      'analytics:view', 'analytics:export',
      'integrations:manage',
      'audit:view',
      'roles:manage',
    ],
  },
  {
    name: 'admin',
    display_name: 'Admin',
    description: 'Firm administrator with nearly full access.',
    is_system: true,
    is_editable: true,
    color: '#2563EB',
    sort_order: 2,
    permissions: [
      'users:invite', 'users:manage',
      'groups:manage',
      'matters:create', 'matters:view', 'matters:edit', 'matters:delete', 'matters:assign',
      'clients:create', 'clients:view', 'clients:edit', 'clients:delete',
      'billing:create', 'billing:view', 'billing:edit', 'billing:approve',
      'documents:upload', 'documents:view', 'documents:edit', 'documents:delete',
      'calendar:create', 'calendar:view', 'calendar:edit', 'calendar:delete',
      'reports:view', 'reports:create', 'reports:export',
      'analytics:view', 'analytics:export',
      'integrations:manage',
      'audit:view',
      'roles:manage',
    ],
  },
  {
    name: 'attorney',
    display_name: 'Attorney',
    description: 'Licensed attorney with case management and billing access.',
    is_system: false,
    is_editable: true,
    color: '#059669',
    sort_order: 10,
    permissions: [
      'matters:create', 'matters:view', 'matters:edit',
      'clients:create', 'clients:view', 'clients:edit',
      'billing:create', 'billing:view',
      'documents:upload', 'documents:view', 'documents:edit',
      'calendar:create', 'calendar:view', 'calendar:edit',
      'reports:view',
    ],
  },
  {
    name: 'paralegal',
    display_name: 'Paralegal',
    description: 'Paralegal with case support and document access.',
    is_system: false,
    is_editable: true,
    color: '#0891B2',
    sort_order: 20,
    permissions: [
      'matters:create', 'matters:view', 'matters:edit',
      'clients:create', 'clients:view',
      'billing:view', 'billing:create',
      'documents:upload', 'documents:view', 'documents:edit',
      'calendar:create', 'calendar:view', 'calendar:edit',
    ],
  },
  {
    name: 'staff',
    display_name: 'Staff',
    description: 'General staff with basic view and create access.',
    is_system: false,
    is_editable: true,
    color: '#6B7280',
    sort_order: 30,
    permissions: [
      'matters:create', 'matters:view',
      'clients:create', 'clients:view',
      'documents:view',
      'calendar:view',
    ],
  },
  {
    name: 'billing',
    display_name: 'Billing',
    description: 'Billing specialist with full financial access.',
    is_system: false,
    is_editable: true,
    color: '#D97706',
    sort_order: 40,
    permissions: [
      'matters:create', 'matters:view',
      'clients:create', 'clients:view',
      'billing:create', 'billing:view', 'billing:edit', 'billing:approve',
      'reports:view', 'reports:create', 'reports:export',
      'analytics:view',
    ],
  },
  {
    name: 'readonly',
    display_name: 'Read Only',
    description: 'View-only access. Cannot create or modify any data.',
    is_system: false,
    is_editable: true,
    color: '#9CA3AF',
    sort_order: 50,
    permissions: [
      'matters:view',
      'clients:view',
      'documents:view',
      'calendar:view',
      'reports:view',
    ],
  },
];

// All available permissions (for the UI to display as checkboxes)
export const ALL_PERMISSIONS = [
  // Firm
  { key: 'firm:manage', label: 'Manage Firm Settings', category: 'Firm', description: 'Edit firm name, address, branding, and configuration' },
  { key: 'firm:billing', label: 'Manage Firm Billing', category: 'Firm', description: 'Configure payment processors, billing settings' },
  { key: 'firm:delete', label: 'Delete Firm', category: 'Firm', description: 'Permanently delete the firm (owner only)' },
  // Users
  { key: 'users:invite', label: 'Invite Users', category: 'Team', description: 'Send invitations to new team members' },
  { key: 'users:manage', label: 'Manage Users', category: 'Team', description: 'Edit roles, deactivate, and manage team members' },
  { key: 'users:delete', label: 'Remove Users', category: 'Team', description: 'Remove users from the firm' },
  { key: 'groups:manage', label: 'Manage Groups', category: 'Team', description: 'Create and manage practice groups' },
  { key: 'roles:manage', label: 'Manage Roles', category: 'Team', description: 'Create and edit custom roles and permissions' },
  // Matters
  { key: 'matters:create', label: 'Create Matters', category: 'Matters', description: 'Open new matters/cases' },
  { key: 'matters:view', label: 'View Matters', category: 'Matters', description: 'View matter details, notes, and documents' },
  { key: 'matters:edit', label: 'Edit Matters', category: 'Matters', description: 'Modify matter details, status, and assignments' },
  { key: 'matters:delete', label: 'Delete Matters', category: 'Matters', description: 'Permanently delete matters' },
  { key: 'matters:assign', label: 'Assign Matters', category: 'Matters', description: 'Assign attorneys and team members to matters' },
  // Clients
  { key: 'clients:create', label: 'Create Clients', category: 'Clients', description: 'Add new client records' },
  { key: 'clients:view', label: 'View Clients', category: 'Clients', description: 'View client contact info and history' },
  { key: 'clients:edit', label: 'Edit Clients', category: 'Clients', description: 'Modify client records' },
  { key: 'clients:delete', label: 'Delete Clients', category: 'Clients', description: 'Remove client records' },
  // Billing
  { key: 'billing:create', label: 'Create Time/Invoices', category: 'Billing', description: 'Log time entries and create invoices' },
  { key: 'billing:view', label: 'View Billing', category: 'Billing', description: 'View time entries, invoices, and financial data' },
  { key: 'billing:edit', label: 'Edit Billing', category: 'Billing', description: 'Modify time entries, invoices, and record payments' },
  { key: 'billing:delete', label: 'Delete Billing', category: 'Billing', description: 'Delete invoices and time entries' },
  { key: 'billing:approve', label: 'Approve Billing', category: 'Billing', description: 'Approve time entries and invoices for sending' },
  // Documents
  { key: 'documents:upload', label: 'Upload Documents', category: 'Documents', description: 'Upload new documents to the system' },
  { key: 'documents:view', label: 'View Documents', category: 'Documents', description: 'View and download documents' },
  { key: 'documents:edit', label: 'Edit Documents', category: 'Documents', description: 'Modify document metadata and content' },
  { key: 'documents:delete', label: 'Delete Documents', category: 'Documents', description: 'Remove documents from the system' },
  // Calendar
  { key: 'calendar:create', label: 'Create Events', category: 'Calendar', description: 'Schedule meetings, deadlines, and events' },
  { key: 'calendar:view', label: 'View Calendar', category: 'Calendar', description: 'View calendar events and schedules' },
  { key: 'calendar:edit', label: 'Edit Events', category: 'Calendar', description: 'Modify existing calendar events' },
  { key: 'calendar:delete', label: 'Delete Events', category: 'Calendar', description: 'Remove calendar events' },
  // Reports
  { key: 'reports:view', label: 'View Reports', category: 'Reports', description: 'Access firm reports and analytics' },
  { key: 'reports:create', label: 'Create Reports', category: 'Reports', description: 'Generate custom reports' },
  { key: 'reports:export', label: 'Export Reports', category: 'Reports', description: 'Export report data to CSV/PDF' },
  // Analytics
  { key: 'analytics:view', label: 'View Analytics', category: 'Analytics', description: 'Access firm analytics dashboards' },
  { key: 'analytics:export', label: 'Export Analytics', category: 'Analytics', description: 'Export analytics data' },
  // Integrations
  { key: 'integrations:manage', label: 'Manage Integrations', category: 'Integrations', description: 'Connect and configure third-party integrations' },
  // Audit
  { key: 'audit:view', label: 'View Audit Logs', category: 'Audit', description: 'Access the audit trail and activity logs' },
];

// ============================================
// SEED DEFAULT ROLES FOR A FIRM
// ============================================

/**
 * Seed the default roles for a firm. Called when a firm is created.
 * Idempotent - won't duplicate if roles already exist.
 */
export async function seedFirmRoles(firmId) {
  for (const role of DEFAULT_ROLES) {
    try {
      await query(
        `INSERT INTO firm_roles (firm_id, name, display_name, description, permissions, is_system, is_editable, color, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (firm_id, name) DO NOTHING`,
        [firmId, role.name, role.display_name, role.description, role.permissions,
         role.is_system, role.is_editable, role.color, role.sort_order]
      );
    } catch (e) {
      // Ignore duplicates
    }
  }
}

// ============================================
// PERMISSION RESOLUTION
// ============================================

// In-memory cache: firmId -> { roles: Map<roleName, permissions[]>, timestamp }
const roleCache = new Map();
const CACHE_TTL = 60000; // 1 minute

/**
 * Get the role permissions for a firm (with caching)
 */
async function getFirmRolePermissions(firmId) {
  const cached = roleCache.get(firmId);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.roles;
  }

  const result = await query(
    'SELECT name, permissions FROM firm_roles WHERE firm_id = $1',
    [firmId]
  );

  const roles = new Map();
  for (const row of result.rows) {
    roles.set(row.name, row.permissions || []);
  }

  roleCache.set(firmId, { roles, timestamp: Date.now() });
  return roles;
}

/**
 * Invalidate the role cache for a firm (call after role updates)
 */
export function invalidateRoleCache(firmId) {
  roleCache.delete(firmId);
}

/**
 * Resolve the effective permissions for a user.
 * Returns the full set of permissions after applying role + overrides.
 * 
 * @param {string} userId
 * @param {string} userRole - The user's role name
 * @param {string} firmId
 * @returns {Promise<string[]>} Effective permissions
 */
export async function resolveUserPermissions(userId, userRole, firmId) {
  // Owner always has all permissions regardless
  if (userRole === 'owner') {
    return ALL_PERMISSIONS.map(p => p.key);
  }

  // 1. Get role permissions from DB (or fallback to defaults)
  const firmRoles = await getFirmRolePermissions(firmId);
  let rolePerms = firmRoles.get(userRole);

  // Fallback to hardcoded defaults if firm hasn't set up custom roles
  if (!rolePerms) {
    const defaultRole = DEFAULT_ROLES.find(r => r.name === userRole);
    rolePerms = defaultRole ? defaultRole.permissions : [];
  }

  // 2. Get user-specific overrides
  const overrides = await query(
    `SELECT permission, action FROM user_permission_overrides 
     WHERE firm_id = $1 AND user_id = $2 
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [firmId, userId]
  );

  // 3. Apply overrides
  const effectivePerms = new Set(rolePerms);

  for (const override of overrides.rows) {
    if (override.action === 'grant') {
      effectivePerms.add(override.permission);
    } else if (override.action === 'revoke') {
      effectivePerms.delete(override.permission);
    }
  }

  return Array.from(effectivePerms);
}

/**
 * Check if a user has a specific permission.
 * This is the main function used by the auth middleware.
 */
export async function checkPermission(userId, userRole, firmId, permission) {
  if (userRole === 'owner') return true;

  const permissions = await resolveUserPermissions(userId, userRole, firmId);
  return permissions.includes(permission);
}

export default {
  DEFAULT_ROLES,
  ALL_PERMISSIONS,
  seedFirmRoles,
  resolveUserPermissions,
  checkPermission,
  invalidateRoleCache,
};
