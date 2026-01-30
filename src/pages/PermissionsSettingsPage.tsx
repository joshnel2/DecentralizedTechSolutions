import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { 
  ArrowLeft, Shield, Users, Plus, Save, X, Check, ChevronRight, 
  Crown, Briefcase, FileText, User, CreditCard, Eye, Edit, Trash2,
  AlertTriangle, Info, Lock, Settings, Layers, Copy, Search,
  ChevronDown, ChevronUp, ToggleLeft, ToggleRight
} from 'lucide-react'
import styles from './PermissionsSettingsPage.module.css'
import { useToast } from '../components/Toast'
import { useAuthStore } from '../stores/authStore'

// Permission category icons
const categoryIcons: Record<string, LucideIcon> = {
  admin: Settings,
  matters: Briefcase,
  clients: Users,
  billing: CreditCard,
  documents: FileText,
  calendar: FileText,
  reports: FileText,
  integrations: Settings,
  ai: Shield,
  security: Lock
}

// Role icons
const roleIcons: Record<string, LucideIcon> = {
  owner: Crown,
  admin: Shield,
  attorney: Briefcase,
  paralegal: FileText,
  staff: User,
  billing: CreditCard,
  readonly: Eye
}

// Default role colors
const roleColors: Record<string, string> = {
  owner: '#F59E0B',
  admin: '#8B5CF6',
  attorney: '#3B82F6',
  paralegal: '#10B981',
  staff: '#64748B',
  billing: '#EC4899',
  readonly: '#94A3B8'
}

interface Permission {
  key: string
  name: string
  description: string
  isSensitive: boolean
  requires?: string[]
}

interface PermissionCategory {
  id: string
  name: string
  permissions: Permission[]
}

interface Role {
  id?: string
  slug: string
  name: string
  description: string
  color: string
  icon: string
  isSystem: boolean
  inheritsFrom?: string
  userCount: number
}

interface RolePermission {
  key: string
  value: 'granted' | 'denied' | 'inherited'
  source: 'default' | 'custom'
  conditions?: Record<string, any>
}

interface PermissionTemplate {
  id: string
  name: string
  description: string
  type: string
  permissions: Record<string, any>
  icon: string
  color: string
  isSystem: boolean
}

export function PermissionsSettingsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuthStore()
  
  // State
  const [activeTab, setActiveTab] = useState<'roles' | 'matrix' | 'templates' | 'inheritance'>('roles')
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [categories, setCategories] = useState<PermissionCategory[]>([])
  const [rolePermissions, setRolePermissions] = useState<Record<string, RolePermission>>({})
  const [templates, setTemplates] = useState<PermissionTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [showNewRoleModal, setShowNewRoleModal] = useState(false)
  const [showNewTemplateModal, setShowNewTemplateModal] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [pendingChanges, setPendingChanges] = useState<Record<string, 'granted' | 'denied' | 'inherited'>>({})

  // Tabs
  const tabs = [
    { id: 'roles', name: 'Roles & Permissions', icon: Shield },
    { id: 'matrix', name: 'Permission Matrix', icon: Layers },
    { id: 'templates', name: 'Templates', icon: Copy },
    { id: 'inheritance', name: 'Inheritance Rules', icon: ChevronRight }
  ]

  // Load initial data
  useEffect(() => {
    loadData()
  }, [])

  // Load role permissions when role changes
  useEffect(() => {
    if (selectedRole) {
      loadRolePermissions(selectedRole)
    }
  }, [selectedRole])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load roles
      const rolesData = getDefaultRoles()
      setRoles(rolesData)
      if (rolesData.length > 0 && !selectedRole) {
        setSelectedRole(rolesData[0].slug)
      }

      // Load permission categories
      const categoriesData = getDefaultCategories()
      setCategories(categoriesData)

      // Load templates
      setTemplates(getDefaultTemplates())
    } catch (error) {
      console.error('Failed to load permissions data:', error)
      toast.error('Failed to load permissions')
    } finally {
      setLoading(false)
    }
  }

  const loadRolePermissions = async (roleSlug: string) => {
    try {
      const perms = getDefaultRolePermissions(roleSlug)
      setRolePermissions(perms)
      setPendingChanges({})
      setHasUnsavedChanges(false)
    } catch (error) {
      console.error('Failed to load role permissions:', error)
    }
  }

  // Default data functions (would be API calls in production)
  const getDefaultRoles = (): Role[] => [
    { slug: 'owner', name: 'Owner', description: 'Full access to all features and settings', color: '#F59E0B', icon: 'crown', isSystem: true, userCount: 1 },
    { slug: 'admin', name: 'Administrator', description: 'Administrative access to firm settings', color: '#8B5CF6', icon: 'shield', isSystem: true, userCount: 2 },
    { slug: 'attorney', name: 'Attorney', description: 'Standard attorney with case management', color: '#3B82F6', icon: 'briefcase', isSystem: true, userCount: 5 },
    { slug: 'paralegal', name: 'Paralegal', description: 'Paralegal with document and case support', color: '#10B981', icon: 'file-text', isSystem: true, userCount: 3 },
    { slug: 'staff', name: 'Staff', description: 'General staff with limited access', color: '#64748B', icon: 'user', isSystem: true, userCount: 4 },
    { slug: 'billing', name: 'Billing Specialist', description: 'Focus on billing and financial operations', color: '#EC4899', icon: 'credit-card', isSystem: true, userCount: 1 },
    { slug: 'readonly', name: 'Read Only', description: 'View-only access to permitted items', color: '#94A3B8', icon: 'eye', isSystem: true, userCount: 0 }
  ]

  const getDefaultCategories = (): PermissionCategory[] => [
    {
      id: 'matters',
      name: 'Matters',
      permissions: [
        { key: 'matters:create', name: 'Create Matters', description: 'Create new matters', isSensitive: false },
        { key: 'matters:view', name: 'View Matters', description: 'View matter details', isSensitive: false },
        { key: 'matters:view_restricted', name: 'View Restricted Matters', description: 'View matters marked as restricted', isSensitive: false },
        { key: 'matters:edit', name: 'Edit Matters', description: 'Modify matter information', isSensitive: false },
        { key: 'matters:delete', name: 'Delete Matters', description: 'Delete or archive matters', isSensitive: true },
        { key: 'matters:assign', name: 'Assign Team Members', description: 'Add team members to matters', isSensitive: false },
        { key: 'matters:manage_permissions', name: 'Manage Permissions', description: 'Control who can access matters', isSensitive: false },
        { key: 'matters:close', name: 'Close Matters', description: 'Close/reopen matters', isSensitive: false },
        { key: 'matters:transfer', name: 'Transfer Matters', description: 'Transfer matters between clients', isSensitive: true }
      ]
    },
    {
      id: 'clients',
      name: 'Clients',
      permissions: [
        { key: 'clients:create', name: 'Create Clients', description: 'Create new client records', isSensitive: false },
        { key: 'clients:view', name: 'View Clients', description: 'View client information', isSensitive: false },
        { key: 'clients:view_restricted', name: 'View Restricted Clients', description: 'View clients marked as restricted', isSensitive: false },
        { key: 'clients:edit', name: 'Edit Clients', description: 'Modify client information', isSensitive: false },
        { key: 'clients:delete', name: 'Delete Clients', description: 'Delete client records', isSensitive: true },
        { key: 'clients:merge', name: 'Merge Clients', description: 'Merge duplicate client records', isSensitive: true },
        { key: 'clients:view_confidential', name: 'View Confidential', description: 'View SSN, financial details', isSensitive: true }
      ]
    },
    {
      id: 'billing',
      name: 'Billing',
      permissions: [
        { key: 'billing:create', name: 'Create Time Entries', description: 'Record time and expenses', isSensitive: false },
        { key: 'billing:view', name: 'View Billing', description: 'View time entries and invoices', isSensitive: false },
        { key: 'billing:view_all', name: 'View All Billing', description: 'View billing for all users', isSensitive: false },
        { key: 'billing:edit', name: 'Edit Billing', description: 'Modify time entries and expenses', isSensitive: false },
        { key: 'billing:edit_others', name: "Edit Others' Billing", description: 'Edit other users time entries', isSensitive: true },
        { key: 'billing:delete', name: 'Delete Billing', description: 'Delete time entries and expenses', isSensitive: true },
        { key: 'billing:approve', name: 'Approve Time', description: 'Approve time entries for billing', isSensitive: false },
        { key: 'billing:create_invoices', name: 'Create Invoices', description: 'Generate and send invoices', isSensitive: false },
        { key: 'billing:void_invoices', name: 'Void Invoices', description: 'Void sent invoices', isSensitive: true },
        { key: 'billing:apply_discounts', name: 'Apply Discounts', description: 'Add discounts to invoices', isSensitive: false },
        { key: 'billing:view_trust', name: 'View Trust Accounts', description: 'View IOLTA trust balances', isSensitive: false },
        { key: 'billing:manage_trust', name: 'Manage Trust', description: 'Deposit/withdraw from trust', isSensitive: true }
      ]
    },
    {
      id: 'documents',
      name: 'Documents',
      permissions: [
        { key: 'documents:upload', name: 'Upload Documents', description: 'Upload new documents', isSensitive: false },
        { key: 'documents:view', name: 'View Documents', description: 'View and download documents', isSensitive: false },
        { key: 'documents:view_confidential', name: 'View Confidential', description: 'Access confidential documents', isSensitive: false },
        { key: 'documents:edit', name: 'Edit Documents', description: 'Edit and version documents', isSensitive: false },
        { key: 'documents:delete', name: 'Delete Documents', description: 'Delete documents', isSensitive: true },
        { key: 'documents:share_external', name: 'Share External', description: 'Share documents outside firm', isSensitive: false },
        { key: 'documents:manage_folders', name: 'Manage Folders', description: 'Create/delete folders', isSensitive: false },
        { key: 'documents:manage_permissions', name: 'Manage Permissions', description: 'Set document access rights', isSensitive: false }
      ]
    },
    {
      id: 'calendar',
      name: 'Calendar',
      permissions: [
        { key: 'calendar:create', name: 'Create Events', description: 'Create calendar events', isSensitive: false },
        { key: 'calendar:view', name: 'View Calendar', description: 'View calendar and events', isSensitive: false },
        { key: 'calendar:view_all', name: 'View All Calendars', description: 'See all users calendars', isSensitive: false },
        { key: 'calendar:edit', name: 'Edit Events', description: 'Modify calendar events', isSensitive: false },
        { key: 'calendar:delete', name: 'Delete Events', description: 'Remove calendar events', isSensitive: false },
        { key: 'calendar:manage_deadlines', name: 'Manage Deadlines', description: 'Set and modify legal deadlines', isSensitive: false }
      ]
    },
    {
      id: 'reports',
      name: 'Reports',
      permissions: [
        { key: 'reports:view', name: 'View Reports', description: 'Access reporting dashboard', isSensitive: false },
        { key: 'reports:view_financial', name: 'View Financial Reports', description: 'Access financial/revenue reports', isSensitive: false },
        { key: 'reports:view_productivity', name: 'View Productivity', description: 'View user productivity metrics', isSensitive: false },
        { key: 'reports:create', name: 'Create Reports', description: 'Generate custom reports', isSensitive: false },
        { key: 'reports:export', name: 'Export Reports', description: 'Export report data', isSensitive: false },
        { key: 'reports:schedule', name: 'Schedule Reports', description: 'Set up automated reports', isSensitive: false }
      ]
    },
    {
      id: 'admin',
      name: 'Administration',
      permissions: [
        { key: 'firm:manage', name: 'Manage Firm Settings', description: 'Access and modify firm-wide settings', isSensitive: true },
        { key: 'firm:billing', name: 'Manage Firm Billing', description: 'Manage firm subscription and billing', isSensitive: true },
        { key: 'firm:delete', name: 'Delete Firm', description: 'Permanently delete the firm account', isSensitive: true },
        { key: 'users:invite', name: 'Invite Users', description: 'Send invitations to new team members', isSensitive: false },
        { key: 'users:manage', name: 'Manage Users', description: 'Edit user profiles and settings', isSensitive: true },
        { key: 'users:delete', name: 'Delete Users', description: 'Remove users from the firm', isSensitive: true },
        { key: 'users:view_rates', name: 'View Billing Rates', description: 'See hourly rates for all users', isSensitive: false },
        { key: 'users:edit_rates', name: 'Edit Billing Rates', description: 'Modify hourly rates for users', isSensitive: true },
        { key: 'groups:manage', name: 'Manage Groups', description: 'Create and manage team groups', isSensitive: false },
        { key: 'integrations:manage', name: 'Manage Integrations', description: 'Connect/disconnect integrations', isSensitive: true },
        { key: 'audit:view', name: 'View Audit Logs', description: 'Access activity audit logs', isSensitive: true }
      ]
    },
    {
      id: 'ai',
      name: 'AI Features',
      permissions: [
        { key: 'ai:use_assistant', name: 'Use AI Assistant', description: 'Chat with AI assistant', isSensitive: false },
        { key: 'ai:use_drafting', name: 'AI Document Drafting', description: 'Generate documents with AI', isSensitive: false },
        { key: 'ai:use_analysis', name: 'AI Analysis', description: 'Use AI for analysis tasks', isSensitive: false },
        { key: 'ai:view_suggestions', name: 'View AI Suggestions', description: 'See AI-generated suggestions', isSensitive: false },
        { key: 'ai:train_model', name: 'Train AI', description: 'Provide feedback to improve AI', isSensitive: false }
      ]
    },
    {
      id: 'security',
      name: 'Security',
      permissions: [
        { key: 'audit:view', name: 'View Audit Logs', description: 'Access activity audit logs', isSensitive: true },
        { key: 'audit:export', name: 'Export Audit Logs', description: 'Export audit log data', isSensitive: true },
        { key: 'security:manage_sessions', name: 'Manage Sessions', description: 'Force logout sessions', isSensitive: true },
        { key: 'security:manage_2fa', name: 'Manage 2FA', description: 'Configure 2FA requirements', isSensitive: true },
        { key: 'security:manage_api_keys', name: 'Manage API Keys', description: 'Create/revoke API keys', isSensitive: true }
      ]
    }
  ]

  const getDefaultRolePermissions = (roleSlug: string): Record<string, RolePermission> => {
    const defaultPerms: Record<string, string[]> = {
      owner: [
        'firm:manage', 'firm:billing', 'firm:delete',
        'users:invite', 'users:manage', 'users:delete', 'users:view_rates', 'users:edit_rates',
        'groups:manage', 'matters:create', 'matters:view', 'matters:view_restricted', 'matters:edit',
        'matters:delete', 'matters:assign', 'matters:manage_permissions', 'matters:close', 'matters:transfer',
        'clients:create', 'clients:view', 'clients:view_restricted', 'clients:edit', 'clients:delete',
        'clients:merge', 'clients:view_confidential',
        'billing:create', 'billing:view', 'billing:view_all', 'billing:edit', 'billing:edit_others',
        'billing:delete', 'billing:approve', 'billing:create_invoices', 'billing:void_invoices',
        'billing:apply_discounts', 'billing:view_trust', 'billing:manage_trust',
        'documents:upload', 'documents:view', 'documents:view_confidential', 'documents:edit',
        'documents:delete', 'documents:share_external', 'documents:manage_folders', 'documents:manage_permissions',
        'calendar:create', 'calendar:view', 'calendar:view_all', 'calendar:edit', 'calendar:delete', 'calendar:manage_deadlines',
        'reports:view', 'reports:view_financial', 'reports:view_productivity', 'reports:create', 'reports:export', 'reports:schedule',
        'integrations:manage', 'ai:use_assistant', 'ai:use_drafting', 'ai:use_analysis', 'ai:view_suggestions', 'ai:train_model',
        'audit:view', 'audit:export', 'security:manage_sessions', 'security:manage_2fa', 'security:manage_api_keys'
      ],
      admin: [
        'users:invite', 'users:manage', 'users:view_rates', 'users:edit_rates',
        'groups:manage', 'matters:create', 'matters:view', 'matters:view_restricted', 'matters:edit',
        'matters:delete', 'matters:assign', 'matters:manage_permissions', 'matters:close',
        'clients:create', 'clients:view', 'clients:view_restricted', 'clients:edit', 'clients:delete',
        'billing:create', 'billing:view', 'billing:view_all', 'billing:edit', 'billing:edit_others',
        'billing:approve', 'billing:create_invoices', 'billing:apply_discounts', 'billing:view_trust',
        'documents:upload', 'documents:view', 'documents:view_confidential', 'documents:edit',
        'documents:delete', 'documents:manage_folders', 'documents:manage_permissions',
        'calendar:create', 'calendar:view', 'calendar:view_all', 'calendar:edit', 'calendar:delete', 'calendar:manage_deadlines',
        'reports:view', 'reports:view_financial', 'reports:view_productivity', 'reports:create', 'reports:export',
        'integrations:manage', 'ai:use_assistant', 'ai:use_drafting', 'ai:use_analysis', 'ai:view_suggestions',
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

    const granted = defaultPerms[roleSlug] || []
    const result: Record<string, RolePermission> = {}

    // Set all permissions for categories
    categories.forEach(cat => {
      cat.permissions.forEach(perm => {
        result[perm.key] = {
          key: perm.key,
          value: granted.includes(perm.key) ? 'granted' : 'denied',
          source: 'default'
        }
      })
    })

    return result
  }

  const getDefaultTemplates = (): PermissionTemplate[] => [
    { id: '1', name: 'Full Access', description: 'Complete access to matter', type: 'matter', permissions: { level: 'admin', canEdit: true, canViewDocs: true, canViewNotes: true }, icon: 'shield-check', color: '#10B981', isSystem: true },
    { id: '2', name: 'Read Only', description: 'View-only access', type: 'matter', permissions: { level: 'view', canEdit: false, canViewDocs: true, canViewNotes: true }, icon: 'eye', color: '#64748B', isSystem: true },
    { id: '3', name: 'Collaborator', description: 'Can view and edit', type: 'matter', permissions: { level: 'edit', canEdit: true, canViewDocs: true, canViewNotes: true }, icon: 'users', color: '#3B82F6', isSystem: true },
    { id: '4', name: 'Billing Only', description: 'Access to billing info only', type: 'matter', permissions: { level: 'view', canEdit: false, canViewDocs: false, canViewNotes: false, canViewBilling: true }, icon: 'credit-card', color: '#EC4899', isSystem: true }
  ]

  // Toggle permission
  const togglePermission = (permKey: string) => {
    const currentValue = pendingChanges[permKey] ?? rolePermissions[permKey]?.value ?? 'denied'
    let newValue: 'granted' | 'denied' | 'inherited'
    
    if (currentValue === 'granted') {
      newValue = 'denied'
    } else if (currentValue === 'denied') {
      newValue = 'granted'
    } else {
      newValue = 'granted'
    }

    setPendingChanges(prev => ({ ...prev, [permKey]: newValue }))
    setHasUnsavedChanges(true)
  }

  // Get effective permission value
  const getEffectiveValue = (permKey: string): 'granted' | 'denied' | 'inherited' => {
    return pendingChanges[permKey] ?? rolePermissions[permKey]?.value ?? 'denied'
  }

  // Save changes
  const saveChanges = async () => {
    if (!selectedRole) return
    
    setSaving(true)
    try {
      // In production, this would be an API call
      // await api.put(`/permissions/roles/${selectedRole}/permissions`, { permissions: ... })
      
      // Apply pending changes to role permissions
      const updatedPerms = { ...rolePermissions }
      Object.entries(pendingChanges).forEach(([key, value]) => {
        updatedPerms[key] = { key, value, source: 'custom' }
      })
      setRolePermissions(updatedPerms)
      setPendingChanges({})
      setHasUnsavedChanges(false)
      toast.success('Permissions saved', 'Role permissions have been updated')
    } catch (error) {
      console.error('Failed to save permissions:', error)
      toast.error('Failed to save permissions')
    } finally {
      setSaving(false)
    }
  }

  // Reset changes
  const resetChanges = () => {
    setPendingChanges({})
    setHasUnsavedChanges(false)
  }

  // Toggle category expansion
  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId)
    } else {
      newExpanded.add(categoryId)
    }
    setExpandedCategories(newExpanded)
  }

  // Expand all categories
  const expandAll = () => {
    setExpandedCategories(new Set(categories.map(c => c.id)))
  }

  // Collapse all categories
  const collapseAll = () => {
    setExpandedCategories(new Set())
  }

  // Filter permissions by search
  const filteredCategories = useMemo(() => {
    if (!searchQuery) return categories
    const query = searchQuery.toLowerCase()
    return categories.map(cat => ({
      ...cat,
      permissions: cat.permissions.filter(p => 
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.key.toLowerCase().includes(query)
      )
    })).filter(cat => cat.permissions.length > 0)
  }, [categories, searchQuery])

  // Count granted permissions for a role
  const getGrantedCount = (roleSlug: string): number => {
    const perms = getDefaultRolePermissions(roleSlug)
    return Object.values(perms).filter(p => p.value === 'granted').length
  }

  // Get total permission count
  const getTotalPermissions = (): number => {
    return categories.reduce((sum, cat) => sum + cat.permissions.length, 0)
  }

  // Check if user can edit permissions
  const canEdit = user?.role === 'owner' || user?.role === 'admin'

  // Render roles list
  const renderRolesList = () => (
    <div className={styles.rolesPanel}>
      <div className={styles.rolesPanelHeader}>
        <h3>Roles</h3>
        {canEdit && (
          <button 
            className={styles.addRoleButton}
            onClick={() => setShowNewRoleModal(true)}
          >
            <Plus size={16} />
            New Role
          </button>
        )}
      </div>
      <div className={styles.rolesList}>
        {roles.map(role => {
          const RoleIcon = roleIcons[role.slug] || User
          const isSelected = selectedRole === role.slug
          const grantedCount = getGrantedCount(role.slug)
          const totalCount = getTotalPermissions()
          
          return (
            <button
              key={role.slug}
              className={`${styles.roleItem} ${isSelected ? styles.selected : ''}`}
              onClick={() => setSelectedRole(role.slug)}
            >
              <div 
                className={styles.roleIcon}
                style={{ backgroundColor: `${role.color}20`, color: role.color }}
              >
                <RoleIcon size={18} />
              </div>
              <div className={styles.roleInfo}>
                <span className={styles.roleName}>{role.name}</span>
                <span className={styles.roleStats}>
                  {grantedCount} / {totalCount} permissions
                </span>
              </div>
              <div className={styles.roleUserCount}>
                <Users size={14} />
                <span>{role.userCount}</span>
              </div>
              <ChevronRight size={16} className={styles.chevron} />
            </button>
          )
        })}
      </div>
    </div>
  )

  // Render permissions panel
  const renderPermissionsPanel = () => {
    const role = roles.find(r => r.slug === selectedRole)
    if (!role) return null

    const RoleIcon = roleIcons[role.slug] || User

    return (
      <div className={styles.permissionsPanel}>
        <div className={styles.permissionsPanelHeader}>
          <div className={styles.selectedRoleInfo}>
            <div 
              className={styles.selectedRoleIcon}
              style={{ backgroundColor: `${role.color}20`, color: role.color }}
            >
              <RoleIcon size={24} />
            </div>
            <div>
              <h2>{role.name} Permissions</h2>
              <p>{role.description}</p>
            </div>
          </div>
          {canEdit && (
            <div className={styles.permissionActions}>
              {hasUnsavedChanges && (
                <>
                  <button className={styles.resetButton} onClick={resetChanges}>
                    <X size={16} />
                    Reset
                  </button>
                  <button 
                    className={styles.saveButton} 
                    onClick={saveChanges}
                    disabled={saving}
                  >
                    <Save size={16} />
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className={styles.permissionsToolbar}>
          <div className={styles.searchBox}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search permissions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className={styles.expandControls}>
            <button onClick={expandAll}>Expand All</button>
            <button onClick={collapseAll}>Collapse All</button>
          </div>
        </div>

        {role.isSystem && role.slug === 'owner' && (
          <div className={styles.ownerWarning}>
            <AlertTriangle size={16} />
            <span>Owner role has full access. Permissions cannot be modified.</span>
          </div>
        )}

        <div className={styles.permissionCategories}>
          {filteredCategories.map(category => {
            const isExpanded = expandedCategories.has(category.id)
            const CategoryIcon = categoryIcons[category.id] || Shield
            const grantedInCategory = category.permissions.filter(
              p => getEffectiveValue(p.key) === 'granted'
            ).length

            return (
              <div key={category.id} className={styles.permissionCategory}>
                <button 
                  className={styles.categoryHeader}
                  onClick={() => toggleCategory(category.id)}
                >
                  <CategoryIcon size={18} />
                  <span className={styles.categoryName}>{category.name}</span>
                  <span className={styles.categoryCount}>
                    {grantedInCategory} / {category.permissions.length}
                  </span>
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {isExpanded && (
                  <div className={styles.permissionList}>
                    {category.permissions.map(perm => {
                      const value = getEffectiveValue(perm.key)
                      const isGranted = value === 'granted'
                      const hasChange = pendingChanges[perm.key] !== undefined
                      const isOwner = role.slug === 'owner'

                      return (
                        <div 
                          key={perm.key} 
                          className={`${styles.permissionRow} ${hasChange ? styles.changed : ''}`}
                        >
                          <div className={styles.permissionInfo}>
                            <span className={styles.permissionName}>
                              {perm.name}
                              {perm.isSensitive && (
                                <AlertTriangle size={12} className={styles.sensitiveIcon} />
                              )}
                            </span>
                            <span className={styles.permissionDesc}>{perm.description}</span>
                          </div>
                          <button
                            className={`${styles.permissionToggle} ${isGranted ? styles.granted : styles.denied}`}
                            onClick={() => !isOwner && canEdit && togglePermission(perm.key)}
                            disabled={isOwner || !canEdit}
                            title={isOwner ? 'Owner has full access' : isGranted ? 'Revoke' : 'Grant'}
                          >
                            {isGranted ? (
                              <>
                                <ToggleRight size={20} />
                                <span>Granted</span>
                              </>
                            ) : (
                              <>
                                <ToggleLeft size={20} />
                                <span>Denied</span>
                              </>
                            )}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Render permission matrix (all roles vs all permissions)
  const renderMatrix = () => (
    <div className={styles.matrixContainer}>
      <div className={styles.matrixInfo}>
        <Info size={16} />
        <span>This matrix shows all permissions across all roles. Click a cell to toggle.</span>
      </div>
      <div className={styles.matrixScroll}>
        <table className={styles.matrix}>
          <thead>
            <tr>
              <th className={styles.matrixCorner}>Permission</th>
              {roles.map(role => (
                <th key={role.slug} style={{ color: role.color }}>
                  {role.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map(category => (
              <>
                <tr key={`cat-${category.id}`} className={styles.categoryRow}>
                  <td colSpan={roles.length + 1} className={styles.matrixCategoryCell}>
                    {category.name}
                  </td>
                </tr>
                {category.permissions.map(perm => (
                  <tr key={perm.key}>
                    <td className={styles.matrixPermCell}>
                      <span>{perm.name}</span>
                      {perm.isSensitive && <AlertTriangle size={12} />}
                    </td>
                    {roles.map(role => {
                      const perms = getDefaultRolePermissions(role.slug)
                      const isGranted = perms[perm.key]?.value === 'granted'
                      
                      return (
                        <td 
                          key={`${role.slug}-${perm.key}`}
                          className={`${styles.matrixCell} ${isGranted ? styles.granted : styles.denied}`}
                        >
                          {isGranted ? <Check size={14} /> : <X size={14} />}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  // Render templates
  const renderTemplates = () => (
    <div className={styles.templatesContainer}>
      <div className={styles.templatesHeader}>
        <div>
          <h3>Permission Templates</h3>
          <p>Pre-configured permission sets for quick application to matters, clients, or documents</p>
        </div>
        {canEdit && (
          <button 
            className={styles.addTemplateButton}
            onClick={() => setShowNewTemplateModal(true)}
          >
            <Plus size={16} />
            New Template
          </button>
        )}
      </div>
      <div className={styles.templatesList}>
        {templates.map(template => (
          <div key={template.id} className={styles.templateCard}>
            <div 
              className={styles.templateIcon}
              style={{ backgroundColor: `${template.color}20`, color: template.color }}
            >
              <Shield size={24} />
            </div>
            <div className={styles.templateInfo}>
              <h4>{template.name}</h4>
              <p>{template.description}</p>
              <span className={styles.templateType}>{template.type} template</span>
            </div>
            <div className={styles.templateActions}>
              {template.isSystem && (
                <span className={styles.systemBadge}>System</span>
              )}
              {canEdit && !template.isSystem && (
                <>
                  <button title="Edit"><Edit size={16} /></button>
                  <button title="Delete"><Trash2 size={16} /></button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // Render inheritance rules
  const renderInheritance = () => (
    <div className={styles.inheritanceContainer}>
      <div className={styles.inheritanceHeader}>
        <h3>Permission Inheritance Rules</h3>
        <p>Configure how permissions cascade from parent entities to children</p>
      </div>
      <div className={styles.inheritanceRules}>
        {[
          { source: 'Client', target: 'Matter', mode: 'additive', description: 'Matters inherit client permissions plus their own' },
          { source: 'Matter', target: 'Document', mode: 'inherit', description: 'Documents inherit matter permissions by default' },
          { source: 'Folder', target: 'Document', mode: 'inherit', description: 'Documents in folders inherit folder permissions' },
          { source: 'Group', target: 'User', mode: 'additive', description: 'Users get group permissions plus their own' },
          { source: 'Role', target: 'User', mode: 'inherit', description: 'Users inherit base permissions from their role' }
        ].map((rule, idx) => (
          <div key={idx} className={styles.inheritanceRule}>
            <div className={styles.ruleFlow}>
              <span className={styles.ruleEntity}>{rule.source}</span>
              <ChevronRight size={16} />
              <span className={styles.ruleEntity}>{rule.target}</span>
            </div>
            <div className={styles.ruleDetails}>
              <select 
                value={rule.mode}
                disabled={!canEdit}
                className={styles.modeSelect}
              >
                <option value="inherit">Inherit</option>
                <option value="additive">Additive</option>
                <option value="override">Override</option>
                <option value="none">None</option>
              </select>
              <p>{rule.description}</p>
            </div>
          </div>
        ))}
      </div>
      <div className={styles.inheritanceNote}>
        <Info size={16} />
        <span>
          <strong>Inherit:</strong> Child uses parent permissions. 
          <strong> Additive:</strong> Child gets parent + own permissions. 
          <strong> Override:</strong> Child permissions replace parent. 
          <strong> None:</strong> No inheritance.
        </span>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className={styles.loading}>
        <Shield size={48} />
        <p>Loading permissions...</p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <button className={styles.backButton} onClick={() => navigate('/app/settings')}>
        <ArrowLeft size={16} />
        Back to Settings
      </button>

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Shield size={32} />
          <div>
            <h1>Permissions & Access Control</h1>
            <p>Configure roles, permissions, and access rules for your firm</p>
          </div>
        </div>
      </div>

      <div className={styles.tabs}>
        {tabs.map(tab => {
          const TabIcon = tab.icon
          return (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => setActiveTab(tab.id as any)}
            >
              <TabIcon size={16} />
              {tab.name}
            </button>
          )
        })}
      </div>

      <div className={styles.content}>
        {activeTab === 'roles' && (
          <div className={styles.rolesLayout}>
            {renderRolesList()}
            {renderPermissionsPanel()}
          </div>
        )}
        {activeTab === 'matrix' && renderMatrix()}
        {activeTab === 'templates' && renderTemplates()}
        {activeTab === 'inheritance' && renderInheritance()}
      </div>
    </div>
  )
}

export default PermissionsSettingsPage
