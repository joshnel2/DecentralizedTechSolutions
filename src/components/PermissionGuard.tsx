import { ReactNode } from 'react'
import { useAuthStore } from '../stores/authStore'
import { Lock } from 'lucide-react'
import styles from './PermissionGuard.module.css'

// Default role permissions (must match backend)
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

interface PermissionGuardProps {
  /**
   * Single permission or array of permissions to check
   */
  permission?: string | string[]
  
  /**
   * If true, user must have ALL permissions. If false, ANY permission grants access.
   * Default: false (any permission)
   */
  requireAll?: boolean
  
  /**
   * Role(s) that are always allowed, regardless of permissions
   */
  allowedRoles?: string[]
  
  /**
   * Content to render when permission is granted
   */
  children: ReactNode
  
  /**
   * Content to render when permission is denied
   * If not provided, nothing is rendered
   */
  fallback?: ReactNode
  
  /**
   * If true, show a "no access" message instead of hiding
   */
  showDeniedMessage?: boolean
  
  /**
   * Custom denied message
   */
  deniedMessage?: string
  
  /**
   * If true, just hides content visually but keeps in DOM
   */
  hideOnly?: boolean
  
  /**
   * Disable the element instead of hiding it
   */
  disableOnly?: boolean
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: string, permission: string): boolean {
  const permissions = DEFAULT_ROLE_PERMISSIONS[role] || []
  return permissions.includes(permission)
}

/**
 * Check if a role has any of the given permissions
 */
export function hasAnyPermission(role: string, permissions: string[]): boolean {
  return permissions.some(p => hasPermission(role, p))
}

/**
 * Check if a role has all of the given permissions
 */
export function hasAllPermissions(role: string, permissions: string[]): boolean {
  return permissions.every(p => hasPermission(role, p))
}

/**
 * PermissionGuard Component
 * 
 * Wrap any content that should only be visible/accessible to users with specific permissions.
 * 
 * @example
 * // Single permission
 * <PermissionGuard permission="matters:create">
 *   <button>Create Matter</button>
 * </PermissionGuard>
 * 
 * @example
 * // Any of multiple permissions
 * <PermissionGuard permission={['matters:edit', 'matters:delete']}>
 *   <ActionMenu />
 * </PermissionGuard>
 * 
 * @example
 * // All permissions required
 * <PermissionGuard permission={['billing:view', 'billing:edit']} requireAll>
 *   <EditBillingForm />
 * </PermissionGuard>
 * 
 * @example
 * // With fallback
 * <PermissionGuard 
 *   permission="audit:view" 
 *   fallback={<span>Upgrade to access audit logs</span>}
 * >
 *   <AuditLogViewer />
 * </PermissionGuard>
 * 
 * @example
 * // Allow specific roles
 * <PermissionGuard allowedRoles={['owner', 'admin']}>
 *   <AdminPanel />
 * </PermissionGuard>
 */
export function PermissionGuard({
  permission,
  requireAll = false,
  allowedRoles,
  children,
  fallback,
  showDeniedMessage = false,
  deniedMessage = 'You do not have permission to access this feature.',
  hideOnly = false,
  disableOnly = false
}: PermissionGuardProps) {
  const { user } = useAuthStore()
  
  // If no user, deny access
  if (!user) {
    if (hideOnly) {
      return <div style={{ visibility: 'hidden' }}>{children}</div>
    }
    return fallback ? <>{fallback}</> : null
  }
  
  const userRole = user.role || 'readonly'
  
  // Check if user's role is in allowed roles
  if (allowedRoles && allowedRoles.includes(userRole)) {
    return <>{children}</>
  }
  
  // Check permissions
  let hasAccess = true
  
  if (permission) {
    const permissionArray = Array.isArray(permission) ? permission : [permission]
    
    if (requireAll) {
      hasAccess = hasAllPermissions(userRole, permissionArray)
    } else {
      hasAccess = hasAnyPermission(userRole, permissionArray)
    }
  }
  
  // If access granted
  if (hasAccess) {
    return <>{children}</>
  }
  
  // If access denied
  if (disableOnly) {
    return (
      <div className={styles.disabled}>
        {children}
      </div>
    )
  }
  
  if (hideOnly) {
    return <div style={{ visibility: 'hidden' }}>{children}</div>
  }
  
  if (showDeniedMessage) {
    return (
      <div className={styles.deniedMessage}>
        <Lock size={16} />
        <span>{deniedMessage}</span>
      </div>
    )
  }
  
  if (fallback) {
    return <>{fallback}</>
  }
  
  return null
}

/**
 * Hook to check permissions
 */
export function usePermission(permission: string | string[], requireAll = false): boolean {
  const { user } = useAuthStore()
  
  if (!user) return false
  
  const userRole = user.role || 'readonly'
  const permissionArray = Array.isArray(permission) ? permission : [permission]
  
  if (requireAll) {
    return hasAllPermissions(userRole, permissionArray)
  }
  
  return hasAnyPermission(userRole, permissionArray)
}

/**
 * Hook to check if user has a specific role
 */
export function useHasRole(roles: string | string[]): boolean {
  const { user } = useAuthStore()
  
  if (!user) return false
  
  const roleArray = Array.isArray(roles) ? roles : [roles]
  return roleArray.includes(user.role || 'readonly')
}

/**
 * Hook to check if user is admin or owner
 */
export function useIsAdmin(): boolean {
  return useHasRole(['owner', 'admin'])
}

/**
 * Hook to check if user can access billing features
 */
export function useCanAccessBilling(): boolean {
  return useHasRole(['owner', 'admin', 'billing']) || usePermission('billing:view')
}

/**
 * Get all permissions for the current user's role
 */
export function useUserPermissions(): string[] {
  const { user } = useAuthStore()
  
  if (!user) return []
  
  return DEFAULT_ROLE_PERMISSIONS[user.role || 'readonly'] || []
}

export default PermissionGuard
