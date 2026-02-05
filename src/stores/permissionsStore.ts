import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Default role permissions (same as backend)
const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: [
    'firm:manage', 'firm:billing', 'firm:delete',
    'users:invite', 'users:manage', 'users:delete', 'users:view_rates', 'users:edit_rates',
    'groups:manage', 'groups:assign',
    'matters:create', 'matters:view', 'matters:view_restricted', 'matters:edit', 'matters:delete', 
    'matters:assign', 'matters:manage_permissions', 'matters:close', 'matters:transfer',
    'clients:create', 'clients:view', 'clients:view_restricted', 'clients:edit', 'clients:delete', 
    'clients:merge', 'clients:view_confidential',
    'billing:create', 'billing:view', 'billing:view_all', 'billing:edit', 'billing:edit_others',
    'billing:delete', 'billing:approve', 'billing:create_invoices', 'billing:void_invoices',
    'billing:apply_discounts', 'billing:view_trust', 'billing:manage_trust',
    'documents:upload', 'documents:view', 'documents:view_confidential', 'documents:edit',
    'documents:delete', 'documents:share_external', 'documents:manage_folders', 'documents:manage_permissions',
    'calendar:create', 'calendar:view', 'calendar:view_all', 'calendar:edit', 'calendar:delete', 'calendar:manage_deadlines',
    'reports:view', 'reports:view_financial', 'reports:view_productivity', 'reports:create', 'reports:export', 'reports:schedule',
    'integrations:view', 'integrations:manage', 'integrations:sync',
    'ai:use_assistant', 'ai:use_drafting', 'ai:use_analysis', 'ai:view_suggestions', 'ai:train_model',
    'audit:view', 'audit:export', 'security:manage_sessions', 'security:manage_2fa', 'security:manage_api_keys'
  ],
  admin: [
    'users:invite', 'users:manage', 'users:view_rates', 'users:edit_rates',
    'groups:manage', 'groups:assign',
    'matters:create', 'matters:view', 'matters:view_restricted', 'matters:edit', 'matters:delete', 
    'matters:assign', 'matters:manage_permissions', 'matters:close',
    'clients:create', 'clients:view', 'clients:view_restricted', 'clients:edit', 'clients:delete',
    'billing:create', 'billing:view', 'billing:view_all', 'billing:edit', 'billing:edit_others',
    'billing:approve', 'billing:create_invoices', 'billing:apply_discounts', 'billing:view_trust',
    'documents:upload', 'documents:view', 'documents:view_confidential', 'documents:edit',
    'documents:delete', 'documents:manage_folders', 'documents:manage_permissions',
    'calendar:create', 'calendar:view', 'calendar:view_all', 'calendar:edit', 'calendar:delete', 'calendar:manage_deadlines',
    'reports:view', 'reports:view_financial', 'reports:view_productivity', 'reports:create', 'reports:export',
    'integrations:view', 'integrations:manage', 'integrations:sync',
    'ai:use_assistant', 'ai:use_drafting', 'ai:use_analysis', 'ai:view_suggestions',
    'audit:view', 'security:manage_sessions'
  ],
  attorney: [
    'matters:create', 'matters:view', 'matters:edit', 'matters:assign', 'matters:close',
    'clients:create', 'clients:view', 'clients:edit',
    'billing:create', 'billing:view', 'billing:edit', 'billing:create_invoices',
    'documents:upload', 'documents:view', 'documents:edit', 'documents:manage_folders',
    'calendar:create', 'calendar:view', 'calendar:edit', 'calendar:delete', 'calendar:manage_deadlines',
    'reports:view', 'reports:view_productivity',
    'ai:use_assistant', 'ai:use_drafting', 'ai:use_analysis', 'ai:view_suggestions'
  ],
  paralegal: [
    'matters:view', 'matters:edit',
    'clients:view',
    'billing:create', 'billing:view', 'billing:edit',
    'documents:upload', 'documents:view', 'documents:edit',
    'calendar:create', 'calendar:view', 'calendar:edit',
    'ai:use_assistant', 'ai:view_suggestions'
  ],
  staff: [
    'matters:view',
    'clients:view',
    'billing:view',
    'documents:view',
    'calendar:create', 'calendar:view', 'calendar:edit',
    'ai:use_assistant'
  ],
  billing: [
    'matters:view',
    'clients:view',
    'billing:create', 'billing:view', 'billing:view_all', 'billing:edit', 'billing:approve',
    'billing:create_invoices', 'billing:apply_discounts', 'billing:view_trust', 'billing:manage_trust',
    'reports:view', 'reports:view_financial', 'reports:create', 'reports:export',
    'ai:use_assistant'
  ],
  readonly: [
    'matters:view',
    'clients:view',
    'billing:view',
    'documents:view',
    'calendar:view',
    'reports:view'
  ]
}

// Permission categories for UI
export const PERMISSION_CATEGORIES = [
  {
    id: 'matters',
    name: 'Matters',
    description: 'Case and matter management',
    permissions: [
      { key: 'matters:create', name: 'Create Matters', description: 'Create new matters' },
      { key: 'matters:view', name: 'View Matters', description: 'View matter details' },
      { key: 'matters:view_restricted', name: 'View Restricted', description: 'View restricted matters' },
      { key: 'matters:edit', name: 'Edit Matters', description: 'Modify matter information' },
      { key: 'matters:delete', name: 'Delete Matters', description: 'Delete/archive matters', sensitive: true },
      { key: 'matters:assign', name: 'Assign Team', description: 'Assign team members' },
      { key: 'matters:manage_permissions', name: 'Manage Permissions', description: 'Control matter access' },
      { key: 'matters:close', name: 'Close Matters', description: 'Close/reopen matters' },
      { key: 'matters:transfer', name: 'Transfer Matters', description: 'Transfer between clients', sensitive: true }
    ]
  },
  {
    id: 'clients',
    name: 'Clients',
    description: 'Client relationship management',
    permissions: [
      { key: 'clients:create', name: 'Create Clients', description: 'Create new clients' },
      { key: 'clients:view', name: 'View Clients', description: 'View client information' },
      { key: 'clients:view_restricted', name: 'View Restricted', description: 'View restricted clients' },
      { key: 'clients:edit', name: 'Edit Clients', description: 'Modify client information' },
      { key: 'clients:delete', name: 'Delete Clients', description: 'Delete client records', sensitive: true },
      { key: 'clients:merge', name: 'Merge Clients', description: 'Merge duplicates', sensitive: true },
      { key: 'clients:view_confidential', name: 'View Confidential', description: 'SSN, financial info', sensitive: true }
    ]
  },
  {
    id: 'billing',
    name: 'Billing',
    description: 'Time tracking and invoicing',
    permissions: [
      { key: 'billing:create', name: 'Create Entries', description: 'Record time/expenses' },
      { key: 'billing:view', name: 'View Billing', description: 'View own billing' },
      { key: 'billing:view_all', name: 'View All', description: 'View all users billing' },
      { key: 'billing:edit', name: 'Edit Billing', description: 'Modify own entries' },
      { key: 'billing:edit_others', name: 'Edit Others', description: 'Modify others entries', sensitive: true },
      { key: 'billing:delete', name: 'Delete Billing', description: 'Delete entries', sensitive: true },
      { key: 'billing:approve', name: 'Approve Time', description: 'Approve for billing' },
      { key: 'billing:create_invoices', name: 'Create Invoices', description: 'Generate invoices' },
      { key: 'billing:void_invoices', name: 'Void Invoices', description: 'Void sent invoices', sensitive: true },
      { key: 'billing:apply_discounts', name: 'Apply Discounts', description: 'Add discounts' },
      { key: 'billing:view_trust', name: 'View Trust', description: 'View trust accounts' },
      { key: 'billing:manage_trust', name: 'Manage Trust', description: 'Manage trust', sensitive: true }
    ]
  },
  {
    id: 'documents',
    name: 'Documents',
    description: 'Document management',
    permissions: [
      { key: 'documents:upload', name: 'Upload', description: 'Upload documents' },
      { key: 'documents:view', name: 'View', description: 'View/download documents' },
      { key: 'documents:view_confidential', name: 'View Confidential', description: 'Access confidential' },
      { key: 'documents:edit', name: 'Edit', description: 'Edit documents' },
      { key: 'documents:delete', name: 'Delete', description: 'Delete documents', sensitive: true },
      { key: 'documents:share_external', name: 'Share External', description: 'Share outside firm' },
      { key: 'documents:manage_folders', name: 'Manage Folders', description: 'Create/delete folders' },
      { key: 'documents:manage_permissions', name: 'Manage Permissions', description: 'Set access rights' }
    ]
  },
  {
    id: 'calendar',
    name: 'Calendar',
    description: 'Calendar and scheduling',
    permissions: [
      { key: 'calendar:create', name: 'Create Events', description: 'Create events' },
      { key: 'calendar:view', name: 'View Calendar', description: 'View own calendar' },
      { key: 'calendar:view_all', name: 'View All', description: 'View all calendars' },
      { key: 'calendar:edit', name: 'Edit Events', description: 'Modify events' },
      { key: 'calendar:delete', name: 'Delete Events', description: 'Remove events' },
      { key: 'calendar:manage_deadlines', name: 'Manage Deadlines', description: 'Legal deadlines' }
    ]
  },
  {
    id: 'reports',
    name: 'Reports',
    description: 'Analytics and reporting',
    permissions: [
      { key: 'reports:view', name: 'View Reports', description: 'Access reports' },
      { key: 'reports:view_financial', name: 'Financial Reports', description: 'Revenue reports' },
      { key: 'reports:view_productivity', name: 'Productivity', description: 'Productivity metrics' },
      { key: 'reports:create', name: 'Create Reports', description: 'Custom reports' },
      { key: 'reports:export', name: 'Export', description: 'Export data' },
      { key: 'reports:schedule', name: 'Schedule', description: 'Automated reports' }
    ]
  },
  {
    id: 'admin',
    name: 'Administration',
    description: 'Firm administration',
    permissions: [
      { key: 'firm:manage', name: 'Firm Settings', description: 'Manage firm', sensitive: true },
      { key: 'firm:billing', name: 'Firm Billing', description: 'Subscription', sensitive: true },
      { key: 'firm:delete', name: 'Delete Firm', description: 'Delete account', sensitive: true },
      { key: 'users:invite', name: 'Invite Users', description: 'Send invitations' },
      { key: 'users:manage', name: 'Manage Users', description: 'Edit users', sensitive: true },
      { key: 'users:delete', name: 'Delete Users', description: 'Remove users', sensitive: true },
      { key: 'users:view_rates', name: 'View Rates', description: 'See billing rates' },
      { key: 'users:edit_rates', name: 'Edit Rates', description: 'Modify rates', sensitive: true },
      { key: 'groups:manage', name: 'Manage Groups', description: 'Team groups' },
      { key: 'groups:assign', name: 'Assign Groups', description: 'Group membership' },
      { key: 'integrations:view', name: 'View Integrations', description: 'See integrations' },
      { key: 'integrations:manage', name: 'Manage Integrations', description: 'Connect apps', sensitive: true },
      { key: 'integrations:sync', name: 'Trigger Sync', description: 'Manual sync' }
    ]
  },
  {
    id: 'ai',
    name: 'AI Features',
    description: 'AI-powered capabilities',
    permissions: [
      { key: 'ai:use_assistant', name: 'AI Assistant', description: 'Chat with AI' },
      { key: 'ai:use_drafting', name: 'AI Drafting', description: 'Generate documents' },
      { key: 'ai:use_analysis', name: 'AI Analysis', description: 'Analysis tasks' },
      { key: 'ai:view_suggestions', name: 'AI Suggestions', description: 'See suggestions' },
      { key: 'ai:train_model', name: 'Train AI', description: 'Provide feedback' }
    ]
  },
  {
    id: 'security',
    name: 'Security',
    description: 'Security and audit',
    permissions: [
      { key: 'audit:view', name: 'View Audit Logs', description: 'Activity logs', sensitive: true },
      { key: 'audit:export', name: 'Export Logs', description: 'Export audit data', sensitive: true },
      { key: 'security:manage_sessions', name: 'Manage Sessions', description: 'Force logout', sensitive: true },
      { key: 'security:manage_2fa', name: 'Manage 2FA', description: '2FA settings', sensitive: true },
      { key: 'security:manage_api_keys', name: 'API Keys', description: 'Manage keys', sensitive: true }
    ]
  }
]

interface PermissionOverride {
  permissionKey: string
  value: 'granted' | 'denied'
  expiresAt?: string
  reason?: string
}

interface PermissionsState {
  // Effective permissions for current user
  effectivePermissions: Record<string, 'granted' | 'denied'>
  
  // Custom role permissions (firm-specific overrides)
  rolePermissionOverrides: Record<string, Record<string, 'granted' | 'denied'>>
  
  // User-specific overrides
  userOverrides: PermissionOverride[]
  
  // Cache timestamp
  lastFetched: number | null
  
  // Actions
  hasPermission: (permission: string, userRole?: string) => boolean
  hasAnyPermission: (permissions: string[], userRole?: string) => boolean
  hasAllPermissions: (permissions: string[], userRole?: string) => boolean
  
  // Permission checking for resources
  canAccessMatter: (matterId: string, userRole?: string) => boolean
  canAccessClient: (clientId: string, userRole?: string) => boolean
  canAccessDocument: (documentId: string, userRole?: string) => boolean
  
  // Load/refresh
  loadEffectivePermissions: (userRole: string) => void
  loadRoleOverrides: (firmId: string) => Promise<void>
  addUserOverride: (override: PermissionOverride) => void
  removeUserOverride: (permissionKey: string) => void
  
  // Role permission management
  setRolePermission: (roleSlug: string, permissionKey: string, value: 'granted' | 'denied') => void
  resetRoleToDefaults: (roleSlug: string) => void
  
  // Clear
  clearPermissions: () => void
}

export const usePermissionsStore = create<PermissionsState>()(
  persist(
    (set, get) => ({
      effectivePermissions: {},
      rolePermissionOverrides: {},
      userOverrides: [],
      lastFetched: null,

      // Check if user has a specific permission
      hasPermission: (permission: string, userRole?: string) => {
        const { effectivePermissions, userOverrides, rolePermissionOverrides } = get()
        
        // First check user-specific overrides
        const userOverride = userOverrides.find(o => o.permissionKey === permission)
        if (userOverride) {
          // Check if expired
          if (userOverride.expiresAt && new Date(userOverride.expiresAt) < new Date()) {
            // Expired, ignore
          } else {
            return userOverride.value === 'granted'
          }
        }
        
        // Check cached effective permissions
        if (effectivePermissions[permission]) {
          return effectivePermissions[permission] === 'granted'
        }
        
        // Fall back to role defaults
        if (userRole) {
          // Check firm-specific role overrides
          const roleOverrides = rolePermissionOverrides[userRole]
          if (roleOverrides && roleOverrides[permission]) {
            return roleOverrides[permission] === 'granted'
          }
          
          // Check default permissions
          const defaults = DEFAULT_ROLE_PERMISSIONS[userRole] || []
          return defaults.includes(permission)
        }
        
        return false
      },

      // Check if user has any of the permissions
      hasAnyPermission: (permissions: string[], userRole?: string) => {
        return permissions.some(p => get().hasPermission(p, userRole))
      },

      // Check if user has all permissions
      hasAllPermissions: (permissions: string[], userRole?: string) => {
        return permissions.every(p => get().hasPermission(p, userRole))
      },

      // Check matter access (simplified - would need API call for full check)
      canAccessMatter: (matterId: string, userRole?: string) => {
        // Full access roles always have access
        if (userRole && ['owner', 'admin', 'billing'].includes(userRole)) {
          return true
        }
        // Other roles need matters:view at minimum
        return get().hasPermission('matters:view', userRole)
      },

      // Check client access
      canAccessClient: (clientId: string, userRole?: string) => {
        if (userRole && ['owner', 'admin', 'billing'].includes(userRole)) {
          return true
        }
        return get().hasPermission('clients:view', userRole)
      },

      // Check document access
      canAccessDocument: (documentId: string, userRole?: string) => {
        if (userRole && ['owner', 'admin'].includes(userRole)) {
          return true
        }
        return get().hasPermission('documents:view', userRole)
      },

      // Load effective permissions for a user role
      loadEffectivePermissions: (userRole: string) => {
        const { rolePermissionOverrides } = get()
        const effective: Record<string, 'granted' | 'denied'> = {}
        
        // Get all permission keys
        PERMISSION_CATEGORIES.forEach(cat => {
          cat.permissions.forEach(perm => {
            // Start with default
            const defaults = DEFAULT_ROLE_PERMISSIONS[userRole] || []
            const isGrantedByDefault = defaults.includes(perm.key)
            
            // Apply role overrides
            const roleOverrides = rolePermissionOverrides[userRole]
            if (roleOverrides && roleOverrides[perm.key]) {
              effective[perm.key] = roleOverrides[perm.key]
            } else {
              effective[perm.key] = isGrantedByDefault ? 'granted' : 'denied'
            }
          })
        })
        
        set({ 
          effectivePermissions: effective,
          lastFetched: Date.now()
        })
      },

      // Load role overrides from API
      loadRoleOverrides: async (_firmId: string) => {
        try {
          // In production, this would be an API call
          // const response = await api.get(`/permissions/roles`)
          // set({ rolePermissionOverrides: response.data })
          
          // For now, use empty (defaults apply)
          set({ rolePermissionOverrides: {} })
        } catch (error) {
          console.error('Failed to load role overrides:', error)
        }
      },

      // Add user override
      addUserOverride: (override: PermissionOverride) => {
        set(state => ({
          userOverrides: [
            ...state.userOverrides.filter(o => o.permissionKey !== override.permissionKey),
            override
          ]
        }))
      },

      // Remove user override
      removeUserOverride: (permissionKey: string) => {
        set(state => ({
          userOverrides: state.userOverrides.filter(o => o.permissionKey !== permissionKey)
        }))
      },

      // Set role permission
      setRolePermission: (roleSlug: string, permissionKey: string, value: 'granted' | 'denied') => {
        set(state => ({
          rolePermissionOverrides: {
            ...state.rolePermissionOverrides,
            [roleSlug]: {
              ...state.rolePermissionOverrides[roleSlug],
              [permissionKey]: value
            }
          }
        }))
      },

      // Reset role to defaults
      resetRoleToDefaults: (roleSlug: string) => {
        set(state => {
          const newOverrides = { ...state.rolePermissionOverrides }
          delete newOverrides[roleSlug]
          return { rolePermissionOverrides: newOverrides }
        })
      },

      // Clear all permissions
      clearPermissions: () => {
        set({
          effectivePermissions: {},
          rolePermissionOverrides: {},
          userOverrides: [],
          lastFetched: null
        })
      }
    }),
    {
      name: 'apex-permissions',
      partialize: (state) => ({
        rolePermissionOverrides: state.rolePermissionOverrides,
        userOverrides: state.userOverrides
      })
    }
  )
)

// Helper hook to check permission inline
export function useHasPermission(permission: string): boolean {
  const hasPermission = usePermissionsStore(state => state.hasPermission)
  // We'd need to get current user role from auth store
  // For now, return the check result
  return hasPermission(permission)
}

// Get all permissions for a role (defaults + overrides)
export function getRolePermissions(roleSlug: string, overrides?: Record<string, 'granted' | 'denied'>): Record<string, 'granted' | 'denied'> {
  const result: Record<string, 'granted' | 'denied'> = {}
  const defaults = DEFAULT_ROLE_PERMISSIONS[roleSlug] || []
  
  PERMISSION_CATEGORIES.forEach(cat => {
    cat.permissions.forEach(perm => {
      const isGrantedByDefault = defaults.includes(perm.key)
      if (overrides && overrides[perm.key]) {
        result[perm.key] = overrides[perm.key]
      } else {
        result[perm.key] = isGrantedByDefault ? 'granted' : 'denied'
      }
    })
  })
  
  return result
}

export default usePermissionsStore
