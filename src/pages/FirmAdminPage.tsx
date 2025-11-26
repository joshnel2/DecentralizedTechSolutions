import { useState, useMemo } from 'react'
import { useAuthStore, rolePermissions } from '../stores/authStore'
import { useDataStore } from '../stores/dataStore'
import { 
  Building2, Users, Shield, Activity, FileText, 
  Settings, Workflow, Tag, Database, Key,
  Plus, Search, Filter, MoreVertical, Edit2, Trash2,
  Mail, UserPlus, UserMinus, Check, X, Eye, EyeOff,
  ChevronRight, ChevronDown, Clock, Calendar, Download,
  AlertTriangle, CheckCircle2, XCircle, Info, RefreshCw,
  Briefcase, Lock, Unlock, Copy, ExternalLink
} from 'lucide-react'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { clsx } from 'clsx'
import styles from './FirmAdminPage.module.css'

// Permission categories for the matrix
const permissionCategories = [
  {
    id: 'matters',
    name: 'Matters',
    permissions: [
      { id: 'matters:create', name: 'Create', desc: 'Create new matters' },
      { id: 'matters:view', name: 'View', desc: 'View matter details' },
      { id: 'matters:edit', name: 'Edit', desc: 'Edit matter information' },
      { id: 'matters:delete', name: 'Delete', desc: 'Delete matters' },
      { id: 'matters:assign', name: 'Assign', desc: 'Assign team members' }
    ]
  },
  {
    id: 'clients',
    name: 'Clients',
    permissions: [
      { id: 'clients:create', name: 'Create', desc: 'Create new clients' },
      { id: 'clients:view', name: 'View', desc: 'View client details' },
      { id: 'clients:edit', name: 'Edit', desc: 'Edit client information' },
      { id: 'clients:delete', name: 'Delete', desc: 'Delete clients' }
    ]
  },
  {
    id: 'billing',
    name: 'Billing',
    permissions: [
      { id: 'billing:create', name: 'Create', desc: 'Create invoices/entries' },
      { id: 'billing:view', name: 'View', desc: 'View billing information' },
      { id: 'billing:edit', name: 'Edit', desc: 'Edit billing entries' },
      { id: 'billing:delete', name: 'Delete', desc: 'Delete billing entries' },
      { id: 'billing:approve', name: 'Approve', desc: 'Approve time & expenses' }
    ]
  },
  {
    id: 'documents',
    name: 'Documents',
    permissions: [
      { id: 'documents:upload', name: 'Upload', desc: 'Upload documents' },
      { id: 'documents:view', name: 'View', desc: 'View documents' },
      { id: 'documents:edit', name: 'Edit', desc: 'Edit documents' },
      { id: 'documents:delete', name: 'Delete', desc: 'Delete documents' }
    ]
  },
  {
    id: 'calendar',
    name: 'Calendar',
    permissions: [
      { id: 'calendar:create', name: 'Create', desc: 'Create events' },
      { id: 'calendar:view', name: 'View', desc: 'View calendar' },
      { id: 'calendar:edit', name: 'Edit', desc: 'Edit events' },
      { id: 'calendar:delete', name: 'Delete', desc: 'Delete events' }
    ]
  },
  {
    id: 'reports',
    name: 'Reports',
    permissions: [
      { id: 'reports:view', name: 'View', desc: 'View reports' },
      { id: 'reports:create', name: 'Create', desc: 'Create custom reports' },
      { id: 'reports:export', name: 'Export', desc: 'Export report data' }
    ]
  },
  {
    id: 'admin',
    name: 'Administration',
    permissions: [
      { id: 'firm:manage', name: 'Firm Settings', desc: 'Manage firm settings' },
      { id: 'firm:billing', name: 'Firm Billing', desc: 'Manage firm billing' },
      { id: 'users:invite', name: 'Invite Users', desc: 'Invite new users' },
      { id: 'users:manage', name: 'Manage Users', desc: 'Edit user permissions' },
      { id: 'users:delete', name: 'Delete Users', desc: 'Remove users' },
      { id: 'groups:manage', name: 'Manage Groups', desc: 'Manage groups' },
      { id: 'integrations:manage', name: 'Integrations', desc: 'Manage integrations' },
      { id: 'audit:view', name: 'Audit Logs', desc: 'View audit logs' }
    ]
  }
]

// Role definitions
const roles = [
  { id: 'owner', name: 'Owner', color: '#F59E0B', desc: 'Full access to all features' },
  { id: 'admin', name: 'Admin', color: '#8B5CF6', desc: 'Administrative access' },
  { id: 'attorney', name: 'Attorney', color: '#3B82F6', desc: 'Standard attorney access' },
  { id: 'paralegal', name: 'Paralegal', color: '#10B981', desc: 'Paralegal access' },
  { id: 'staff', name: 'Staff', color: '#64748B', desc: 'Limited access' },
  { id: 'billing', name: 'Billing', color: '#EC4899', desc: 'Billing-focused access' },
  { id: 'readonly', name: 'Read Only', color: '#94A3B8', desc: 'View-only access' }
]

// Demo audit logs
const demoAuditLogs = [
  { id: '1', action: 'user.login', user: 'John Mitchell', resource: 'Session', timestamp: new Date().toISOString(), ip: '192.168.1.100', details: 'Successful login' },
  { id: '2', action: 'matter.created', user: 'John Mitchell', resource: 'Matter', resourceId: 'MTR-2024-007', timestamp: new Date(Date.now() - 3600000).toISOString(), ip: '192.168.1.100', details: 'Created new matter' },
  { id: '3', action: 'document.uploaded', user: 'Sarah Chen', resource: 'Document', resourceId: 'Motion_to_Dismiss.pdf', timestamp: new Date(Date.now() - 7200000).toISOString(), ip: '192.168.1.101', details: 'Uploaded to Matter MTR-2024-001' },
  { id: '4', action: 'invoice.sent', user: 'John Mitchell', resource: 'Invoice', resourceId: 'INV-2024-0043', timestamp: new Date(Date.now() - 10800000).toISOString(), ip: '192.168.1.100', details: 'Sent to Quantum Technologies' },
  { id: '5', action: 'user.permission_changed', user: 'John Mitchell', resource: 'User', resourceId: 'Emily Davis', timestamp: new Date(Date.now() - 86400000).toISOString(), ip: '192.168.1.100', details: 'Updated role to Senior Paralegal' },
  { id: '6', action: 'client.updated', user: 'Michael Roberts', resource: 'Client', resourceId: 'Quantum Technologies', timestamp: new Date(Date.now() - 172800000).toISOString(), ip: '192.168.1.102', details: 'Updated contact information' },
  { id: '7', action: 'time_entry.approved', user: 'Sarah Chen', resource: 'Time Entry', resourceId: '5 entries', timestamp: new Date(Date.now() - 259200000).toISOString(), ip: '192.168.1.101', details: 'Approved 5 time entries' },
  { id: '8', action: 'group.created', user: 'John Mitchell', resource: 'Group', resourceId: 'Real Estate Team', timestamp: new Date(Date.now() - 345600000).toISOString(), ip: '192.168.1.100', details: 'Created new practice group' }
]

// Matter templates
const matterTemplates = [
  { id: '1', name: 'Personal Injury', practiceArea: 'Litigation', stages: ['Intake', 'Investigation', 'Discovery', 'Settlement/Trial', 'Closing'], tasks: 12, documents: 8 },
  { id: '2', name: 'Corporate Formation', practiceArea: 'Corporate', stages: ['Consultation', 'Documentation', 'Filing', 'Post-Formation'], tasks: 8, documents: 15 },
  { id: '3', name: 'Real Estate Closing', practiceArea: 'Real Estate', stages: ['Contract', 'Due Diligence', 'Title Review', 'Closing', 'Post-Closing'], tasks: 15, documents: 20 },
  { id: '4', name: 'Estate Planning', practiceArea: 'Estate Planning', stages: ['Consultation', 'Drafting', 'Review', 'Signing', 'Funding'], tasks: 10, documents: 12 }
]

// Custom field definitions
const customFieldDefs = [
  { id: '1', name: 'SSN/Tax ID', entity: 'Client', type: 'text', required: true },
  { id: '2', name: 'Date of Birth', entity: 'Client', type: 'date', required: false },
  { id: '3', name: 'Referral Source', entity: 'Client', type: 'select', options: ['Website', 'Referral', 'Advertisement', 'Other'], required: true },
  { id: '4', name: 'Case Value', entity: 'Matter', type: 'currency', required: false },
  { id: '5', name: 'Court Deadline', entity: 'Matter', type: 'date', required: false },
  { id: '6', name: 'Document Category', entity: 'Document', type: 'select', options: ['Pleading', 'Discovery', 'Correspondence', 'Contract', 'Other'], required: true }
]

export function FirmAdminPage() {
  const { user, firm, teamMembers, invitations, getAuditLog, inviteUser, updateTeamMember, removeTeamMember, revokeInvitation, resendInvitation } = useAuthStore()
  const { groups, addGroup, updateGroup, deleteGroup } = useDataStore()
  
  const [activeTab, setActiveTab] = useState('users')
  const [searchQuery, setSearchQuery] = useState('')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showPermissionsModal, setShowPermissionsModal] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [showCustomFieldModal, setShowCustomFieldModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [auditFilters, setAuditFilters] = useState({ action: 'all', user: 'all', dateRange: 'week' })

  // Tabs
  const tabs = [
    { id: 'users', name: 'Users', icon: Users },
    { id: 'groups', name: 'Groups & Roles', icon: Shield },
    { id: 'permissions', name: 'Permissions', icon: Lock },
    { id: 'audit', name: 'Audit Log', icon: Activity },
    { id: 'templates', name: 'Matter Templates', icon: Briefcase },
    { id: 'custom-fields', name: 'Custom Fields', icon: Tag },
    { id: 'workflows', name: 'Workflows', icon: Workflow }
  ]

  // Filter users
  const filteredUsers = useMemo(() => {
    return teamMembers.filter(u => 
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [teamMembers, searchQuery])

  // Get role color
  const getRoleColor = (role: string) => {
    return roles.find(r => r.id === role)?.color || '#64748B'
  }

  // Check if user has permission
  const hasPermission = (role: string, permission: string) => {
    const perms = rolePermissions[role as keyof typeof rolePermissions] || []
    return perms.includes(permission)
  }

  const isAdmin = user?.role === 'admin' || user?.role === 'owner'

  if (!isAdmin) {
    return (
      <div className={styles.noAccess}>
        <AlertTriangle size={48} />
        <h2>Access Denied</h2>
        <p>You need administrator privileges to access firm administration.</p>
      </div>
    )
  }

  return (
    <div className={styles.firmAdminPage}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Firm Administration</h1>
          <p>Manage users, permissions, and firm-wide settings</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondaryBtn}>
            <Download size={18} />
            Export
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {tabs.map(tab => (
          <button 
            key={tab.id}
            className={clsx(styles.tab, activeTab === tab.id && styles.active)}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={18} />
            {tab.name}
          </button>
        ))}
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className={styles.tabContent}>
          <div className={styles.toolbar}>
            <div className={styles.searchBox}>
              <Search size={18} />
              <input 
                type="text" 
                placeholder="Search users..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <button className={styles.primaryBtn} onClick={() => setShowInviteModal(true)}>
              <UserPlus size={18} />
              Invite User
            </button>
          </div>

          {/* Users Table */}
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Groups</th>
                  <th>Status</th>
                  <th>Last Active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className={styles.userCell}>
                        <div className={styles.userAvatar} style={{ borderColor: getRoleColor(u.role) }}>
                          {u.firstName?.[0]}{u.lastName?.[0]}
                        </div>
                        <div className={styles.userInfo}>
                          <span className={styles.userName}>{u.firstName} {u.lastName}</span>
                          <span className={styles.userEmail}>{u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={styles.roleBadge} style={{ background: `${getRoleColor(u.role)}20`, color: getRoleColor(u.role) }}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <div className={styles.groupTags}>
                        {u.groupIds?.slice(0, 2).map(gId => {
                          const group = groups.find(g => g.id === gId)
                          return group ? (
                            <span key={gId} className={styles.groupTag} style={{ borderColor: group.color }}>
                              {group.name}
                            </span>
                          ) : null
                        })}
                        {(u.groupIds?.length || 0) > 2 && (
                          <span className={styles.moreGroups}>+{u.groupIds.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={clsx(styles.statusBadge, styles.active)}>
                        <span className={styles.statusDot}></span>
                        Active
                      </span>
                    </td>
                    <td className={styles.lastActive}>
                      {u.lastLoginAt ? formatDistanceToNow(parseISO(u.lastLoginAt), { addSuffix: true }) : 'Never'}
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <button 
                          className={styles.iconBtn} 
                          title="Edit"
                          onClick={() => {
                            setSelectedUser(u)
                            setShowPermissionsModal(true)
                          }}
                        >
                          <Edit2 size={16} />
                        </button>
                        {u.role !== 'owner' && (
                          <button 
                            className={styles.iconBtnDanger} 
                            title="Remove"
                            onClick={() => removeTeamMember(u.id)}
                          >
                            <UserMinus size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pending Invitations */}
          {invitations.filter(i => i.status === 'pending').length > 0 && (
            <div className={styles.invitationsSection}>
              <h3>Pending Invitations</h3>
              <div className={styles.invitationsList}>
                {invitations.filter(i => i.status === 'pending').map(inv => (
                  <div key={inv.id} className={styles.invitationItem}>
                    <div className={styles.invitationInfo}>
                      <span className={styles.invitationEmail}>{inv.email}</span>
                      <span className={styles.invitationMeta}>
                        Invited {formatDistanceToNow(parseISO(inv.invitedAt), { addSuffix: true })} • Expires {format(parseISO(inv.expiresAt), 'MMM d, yyyy')}
                      </span>
                    </div>
                    <span className={styles.roleBadge} style={{ background: `${getRoleColor(inv.role)}20`, color: getRoleColor(inv.role) }}>
                      {inv.role}
                    </span>
                    <div className={styles.invitationActions}>
                      <button className={styles.textBtn} onClick={() => resendInvitation(inv.id)}>
                        <RefreshCw size={14} />
                        Resend
                      </button>
                      <button className={styles.textBtnDanger} onClick={() => revokeInvitation(inv.id)}>
                        <X size={14} />
                        Revoke
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Groups & Roles Tab */}
      {activeTab === 'groups' && (
        <div className={styles.tabContent}>
          <div className={styles.twoColumn}>
            {/* Groups */}
            <div className={styles.column}>
              <div className={styles.columnHeader}>
                <h3>Groups</h3>
                <button className={styles.addBtn} onClick={() => addGroup({ name: 'New Group', description: '', memberIds: [], permissions: [], color: '#3B82F6', updatedAt: new Date().toISOString() })}>
                  <Plus size={16} />
                  Add Group
                </button>
              </div>
              <div className={styles.groupsList}>
                {groups.map(group => (
                  <div key={group.id} className={styles.groupCard}>
                    <div className={styles.groupColor} style={{ background: group.color }}></div>
                    <div className={styles.groupContent}>
                      <div className={styles.groupHeader}>
                        <span className={styles.groupName}>{group.name}</span>
                        <span className={styles.memberCount}>{group.memberIds.length} members</span>
                      </div>
                      <p className={styles.groupDesc}>{group.description || 'No description'}</p>
                      <div className={styles.groupPermissions}>
                        {group.permissions.slice(0, 3).map(p => (
                          <span key={p} className={styles.permTag}>{p.split(':')[0]}</span>
                        ))}
                        {group.permissions.length > 3 && (
                          <span className={styles.permTag}>+{group.permissions.length - 3}</span>
                        )}
                      </div>
                    </div>
                    <div className={styles.groupActions}>
                      <button className={styles.iconBtn}><Edit2 size={16} /></button>
                      <button className={styles.iconBtnDanger} onClick={() => deleteGroup(group.id)}><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Roles */}
            <div className={styles.column}>
              <div className={styles.columnHeader}>
                <h3>Roles</h3>
                <span className={styles.hint}>System-defined roles</span>
              </div>
              <div className={styles.rolesList}>
                {roles.map(role => (
                  <div key={role.id} className={styles.roleCard}>
                    <div className={styles.roleColor} style={{ background: role.color }}></div>
                    <div className={styles.roleContent}>
                      <span className={styles.roleName}>{role.name}</span>
                      <span className={styles.roleDesc}>{role.desc}</span>
                    </div>
                    <div className={styles.roleStats}>
                      <span>{teamMembers.filter(u => u.role === role.id).length} users</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Permissions Matrix Tab */}
      {activeTab === 'permissions' && (
        <div className={styles.tabContent}>
          <div className={styles.permissionsHeader}>
            <h3>Permissions Matrix</h3>
            <p>View and compare permissions across roles</p>
          </div>
          <div className={styles.permissionsMatrix}>
            <table className={styles.matrixTable}>
              <thead>
                <tr>
                  <th className={styles.categoryHeader}>Permission</th>
                  {roles.filter(r => r.id !== 'readonly').map(role => (
                    <th key={role.id} style={{ color: role.color }}>{role.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissionCategories.map(cat => (
                  <>
                    <tr key={cat.id} className={styles.categoryRow}>
                      <td colSpan={7} className={styles.categoryName}>{cat.name}</td>
                    </tr>
                    {cat.permissions.map(perm => (
                      <tr key={perm.id}>
                        <td className={styles.permName}>
                          <span>{perm.name}</span>
                          <span className={styles.permDesc}>{perm.desc}</span>
                        </td>
                        {roles.filter(r => r.id !== 'readonly').map(role => (
                          <td key={role.id} className={styles.permCell}>
                            {hasPermission(role.id, perm.id) ? (
                              <CheckCircle2 size={18} className={styles.hasPermission} />
                            ) : (
                              <XCircle size={18} className={styles.noPermission} />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit Log Tab */}
      {activeTab === 'audit' && (
        <div className={styles.tabContent}>
          <div className={styles.auditHeader}>
            <div className={styles.auditFilters}>
              <select 
                value={auditFilters.action} 
                onChange={e => setAuditFilters({ ...auditFilters, action: e.target.value })}
              >
                <option value="all">All Actions</option>
                <option value="user">User Actions</option>
                <option value="matter">Matter Actions</option>
                <option value="document">Document Actions</option>
                <option value="billing">Billing Actions</option>
              </select>
              <select 
                value={auditFilters.user}
                onChange={e => setAuditFilters({ ...auditFilters, user: e.target.value })}
              >
                <option value="all">All Users</option>
                {teamMembers.map(u => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
              <select 
                value={auditFilters.dateRange}
                onChange={e => setAuditFilters({ ...auditFilters, dateRange: e.target.value })}
              >
                <option value="today">Today</option>
                <option value="week">Last 7 Days</option>
                <option value="month">Last 30 Days</option>
                <option value="quarter">Last 90 Days</option>
              </select>
            </div>
            <button className={styles.secondaryBtn}>
              <Download size={16} />
              Export Log
            </button>
          </div>

          <div className={styles.auditList}>
            {demoAuditLogs.map(log => (
              <div key={log.id} className={styles.auditItem}>
                <div className={styles.auditIcon}>
                  {log.action.includes('user') && <Users size={18} />}
                  {log.action.includes('matter') && <Briefcase size={18} />}
                  {log.action.includes('document') && <FileText size={18} />}
                  {log.action.includes('invoice') && <Activity size={18} />}
                  {log.action.includes('client') && <Users size={18} />}
                  {log.action.includes('time') && <Clock size={18} />}
                  {log.action.includes('group') && <Shield size={18} />}
                </div>
                <div className={styles.auditContent}>
                  <div className={styles.auditAction}>
                    <span className={styles.auditUser}>{log.user}</span>
                    <span className={styles.auditVerb}>{log.action.replace('.', ' ').replace('_', ' ')}</span>
                    {log.resourceId && <span className={styles.auditResource}>{log.resourceId}</span>}
                  </div>
                  <div className={styles.auditMeta}>
                    <span><Clock size={12} /> {formatDistanceToNow(parseISO(log.timestamp), { addSuffix: true })}</span>
                    <span>IP: {log.ip}</span>
                  </div>
                </div>
                <button className={styles.detailsBtn}>
                  <Info size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Matter Templates Tab */}
      {activeTab === 'templates' && (
        <div className={styles.tabContent}>
          <div className={styles.toolbar}>
            <div className={styles.searchBox}>
              <Search size={18} />
              <input type="text" placeholder="Search templates..." />
            </div>
            <button className={styles.primaryBtn} onClick={() => setShowTemplateModal(true)}>
              <Plus size={18} />
              New Template
            </button>
          </div>

          <div className={styles.templatesGrid}>
            {matterTemplates.map(template => (
              <div key={template.id} className={styles.templateCard}>
                <div className={styles.templateHeader}>
                  <Briefcase size={24} />
                  <span className={styles.practiceArea}>{template.practiceArea}</span>
                </div>
                <h3 className={styles.templateName}>{template.name}</h3>
                <div className={styles.templateMeta}>
                  <span>{template.stages.length} stages</span>
                  <span>{template.tasks} tasks</span>
                  <span>{template.documents} docs</span>
                </div>
                <div className={styles.templateStages}>
                  {template.stages.map((stage, i) => (
                    <div key={i} className={styles.stageStep}>
                      <span className={styles.stageNumber}>{i + 1}</span>
                      <span className={styles.stageName}>{stage}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.templateActions}>
                  <button className={styles.textBtn}><Edit2 size={14} /> Edit</button>
                  <button className={styles.textBtn}><Copy size={14} /> Duplicate</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom Fields Tab */}
      {activeTab === 'custom-fields' && (
        <div className={styles.tabContent}>
          <div className={styles.toolbar}>
            <div className={styles.entityTabs}>
              <button className={clsx(styles.entityTab, styles.active)}>All</button>
              <button className={styles.entityTab}>Client</button>
              <button className={styles.entityTab}>Matter</button>
              <button className={styles.entityTab}>Document</button>
            </div>
            <button className={styles.primaryBtn} onClick={() => setShowCustomFieldModal(true)}>
              <Plus size={18} />
              Add Field
            </button>
          </div>

          <div className={styles.fieldsTable}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Field Name</th>
                  <th>Entity</th>
                  <th>Type</th>
                  <th>Required</th>
                  <th>Options</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {customFieldDefs.map(field => (
                  <tr key={field.id}>
                    <td>
                      <span className={styles.fieldName}>{field.name}</span>
                    </td>
                    <td>
                      <span className={styles.entityBadge}>{field.entity}</span>
                    </td>
                    <td className={styles.typeCell}>{field.type}</td>
                    <td>
                      {field.required ? (
                        <Check size={16} className={styles.checkIcon} />
                      ) : (
                        <X size={16} className={styles.xIcon} />
                      )}
                    </td>
                    <td>
                      {field.options ? (
                        <span className={styles.optionsPreview}>{field.options.slice(0, 2).join(', ')}{field.options.length > 2 ? `, +${field.options.length - 2}` : ''}</span>
                      ) : (
                        <span className={styles.noOptions}>—</span>
                      )}
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <button className={styles.iconBtn}><Edit2 size={16} /></button>
                        <button className={styles.iconBtnDanger}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Workflows Tab */}
      {activeTab === 'workflows' && (
        <div className={styles.tabContent}>
          <div className={styles.workflowsIntro}>
            <Workflow size={48} />
            <h3>Workflow Automation</h3>
            <p>Create automated workflows to streamline your practice</p>
            <button className={styles.primaryBtn}>
              <Plus size={18} />
              Create Workflow
            </button>
          </div>

          <div className={styles.workflowExamples}>
            <h4>Example Workflows</h4>
            <div className={styles.workflowGrid}>
              <div className={styles.workflowCard}>
                <div className={styles.workflowIcon}><Mail size={24} /></div>
                <h5>Client Intake</h5>
                <p>Automatically send welcome emails and create tasks when a new client is added</p>
              </div>
              <div className={styles.workflowCard}>
                <div className={styles.workflowIcon}><Calendar size={24} /></div>
                <h5>Deadline Reminders</h5>
                <p>Send automated reminders before court deadlines and statute of limitations</p>
              </div>
              <div className={styles.workflowCard}>
                <div className={styles.workflowIcon}><Activity size={24} /></div>
                <h5>Invoice Follow-up</h5>
                <p>Automatically send payment reminders for overdue invoices</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite User Modal */}
      {showInviteModal && (
        <InviteUserModal 
          onClose={() => setShowInviteModal(false)} 
          onInvite={(data) => {
            inviteUser(data)
            setShowInviteModal(false)
          }}
          groups={groups}
        />
      )}

      {/* Permissions Modal */}
      {showPermissionsModal && selectedUser && (
        <UserPermissionsModal 
          user={selectedUser}
          onClose={() => {
            setShowPermissionsModal(false)
            setSelectedUser(null)
          }}
          onSave={(data) => {
            updateTeamMember(selectedUser.id, data)
            setShowPermissionsModal(false)
            setSelectedUser(null)
          }}
          groups={groups}
        />
      )}
    </div>
  )
}

// Invite User Modal
function InviteUserModal({ onClose, onInvite, groups }: { onClose: () => void; onInvite: (data: any) => void; groups: any[] }) {
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'attorney' as const,
    groupIds: [] as string[]
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onInvite(formData)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Invite Team Member</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Email Address *</label>
            <input 
              type="email" 
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              placeholder="colleague@lawfirm.com"
              required 
            />
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>First Name *</label>
              <input 
                type="text" 
                value={formData.firstName}
                onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                required 
              />
            </div>
            <div className={styles.formGroup}>
              <label>Last Name *</label>
              <input 
                type="text" 
                value={formData.lastName}
                onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                required 
              />
            </div>
          </div>
          <div className={styles.formGroup}>
            <label>Role *</label>
            <select 
              value={formData.role}
              onChange={e => setFormData({ ...formData, role: e.target.value as any })}
            >
              {roles.filter(r => r.id !== 'owner').map(role => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>Groups</label>
            <div className={styles.checkboxGroup}>
              {groups.map(group => (
                <label key={group.id} className={styles.checkboxLabel}>
                  <input 
                    type="checkbox"
                    checked={formData.groupIds.includes(group.id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setFormData({ ...formData, groupIds: [...formData.groupIds, group.id] })
                      } else {
                        setFormData({ ...formData, groupIds: formData.groupIds.filter(id => id !== group.id) })
                      }
                    }}
                  />
                  <span style={{ borderColor: group.color }}>{group.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
            <button type="submit" className={styles.primaryBtn}>
              <Mail size={16} />
              Send Invitation
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// User Permissions Modal
function UserPermissionsModal({ user, onClose, onSave, groups }: { user: any; onClose: () => void; onSave: (data: any) => void; groups: any[] }) {
  const [formData, setFormData] = useState({
    role: user.role,
    groupIds: user.groupIds || []
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Edit User Permissions</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.userPreview}>
            <div className={styles.userAvatar}>
              {user.firstName?.[0]}{user.lastName?.[0]}
            </div>
            <div>
              <span className={styles.userName}>{user.firstName} {user.lastName}</span>
              <span className={styles.userEmail}>{user.email}</span>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Role</label>
            <select 
              value={formData.role}
              onChange={e => setFormData({ ...formData, role: e.target.value })}
              disabled={user.role === 'owner'}
            >
              {roles.map(role => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Groups</label>
            <div className={styles.checkboxGroup}>
              {groups.map(group => (
                <label key={group.id} className={styles.checkboxLabel}>
                  <input 
                    type="checkbox"
                    checked={formData.groupIds.includes(group.id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setFormData({ ...formData, groupIds: [...formData.groupIds, group.id] })
                      } else {
                        setFormData({ ...formData, groupIds: formData.groupIds.filter((id: string) => id !== group.id) })
                      }
                    }}
                  />
                  <span style={{ borderColor: group.color }}>{group.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.permissionsPreview}>
            <h4>Current Permissions</h4>
            <div className={styles.permissionsList}>
              {(rolePermissions[formData.role as keyof typeof rolePermissions] || []).slice(0, 8).map(p => (
                <span key={p} className={styles.permissionItem}>
                  <Check size={12} /> {p}
                </span>
              ))}
              {(rolePermissions[formData.role as keyof typeof rolePermissions] || []).length > 8 && (
                <span className={styles.morePerms}>+{(rolePermissions[formData.role as keyof typeof rolePermissions] || []).length - 8} more</span>
              )}
            </div>
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
            <button type="submit" className={styles.primaryBtn}>Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  )
}
