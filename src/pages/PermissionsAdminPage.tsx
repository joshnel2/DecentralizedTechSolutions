import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { usePermissionsStore, PERMISSION_CATEGORIES, getRolePermissions } from '../stores/permissionsStore'
import { 
  Shield, Users, FileText, Briefcase, Calendar, DollarSign,
  Settings, ChevronDown, ChevronRight, Check, X, Save, 
  RefreshCw, AlertCircle, Info, Search, Filter, Eye, Edit2,
  Plus, Trash2, Copy, Lock, Unlock, ArrowLeft, Loader2,
  UserPlus, Building2, Sparkles, BarChart3, Key, Zap
} from 'lucide-react'
import { clsx } from 'clsx'
import styles from './PermissionsAdminPage.module.css'
import { useToast } from '../components/Toast'

// Role definitions with metadata
const ROLES = [
  { id: 'owner', name: 'Owner', color: '#F59E0B', icon: Key, description: 'Full administrative control. Cannot be restricted.' },
  { id: 'admin', name: 'Admin', color: '#EF4444', icon: Shield, description: 'Manage users, settings, and most operations.' },
  { id: 'attorney', name: 'Attorney', color: '#8B5CF6', icon: Briefcase, description: 'Full access to matters, clients, and billing.' },
  { id: 'paralegal', name: 'Paralegal', color: '#06B6D4', icon: Users, description: 'Support role with limited billing access.' },
  { id: 'staff', name: 'Staff', color: '#10B981', icon: Building2, description: 'Basic access for administrative staff.' },
  { id: 'billing', name: 'Billing', color: '#F97316', icon: DollarSign, description: 'Financial operations and reporting.' },
  { id: 'readonly', name: 'Read Only', color: '#64748B', icon: Eye, description: 'View-only access across the firm.' }
]

// Permission level access types
type AccessLevel = 'none' | 'own' | 'team' | 'all'

interface MatterAccessRule {
  id: string
  name: string
  description: string
  userIds: string[]
  groupIds: string[]
  accessLevel: 'view' | 'edit' | 'full'
  includeDocuments: boolean
  includeBilling: boolean
  expiresAt?: string
}

interface DocumentAccessRule {
  id: string
  matterId?: string
  folderId?: string
  name: string
  userIds: string[]
  groupIds: string[]
  accessLevel: 'view' | 'edit' | 'full'
  inheritFromMatter: boolean
}

export default function PermissionsAdminPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const toast = useToast()
  const { 
    rolePermissionOverrides, 
    setRolePermission, 
    resetRoleToDefaults,
    loadEffectivePermissions 
  } = usePermissionsStore()
  
  // Active tab
  const [activeTab, setActiveTab] = useState<'roles' | 'matters' | 'documents' | 'users'>('roles')
  
  // Role permissions state
  const [selectedRole, setSelectedRole] = useState<string>('attorney')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['matters', 'documents']))
  const [searchQuery, setSearchQuery] = useState('')
  const [showOnlyCustomized, setShowOnlyCustomized] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  
  // Matter access rules
  const [matterAccessRules, setMatterAccessRules] = useState<MatterAccessRule[]>([
    {
      id: 'rule-1',
      name: 'Personal Injury Team',
      description: 'Access to all PI cases',
      userIds: ['user-1', 'user-2'],
      groupIds: ['group-pi'],
      accessLevel: 'full',
      includeDocuments: true,
      includeBilling: true
    }
  ])
  
  // Document access rules
  const [documentAccessRules, setDocumentAccessRules] = useState<DocumentAccessRule[]>([
    {
      id: 'doc-rule-1',
      name: 'Firm Templates',
      folderId: 'templates',
      userIds: [],
      groupIds: ['all-attorneys'],
      accessLevel: 'view',
      inheritFromMatter: false
    }
  ])
  
  // User override state
  const [userOverrides, setUserOverrides] = useState<{
    userId: string
    userName: string
    userRole: string
    overrides: { permission: string; value: 'granted' | 'denied'; reason?: string }[]
  }[]>([])
  
  // Get role permissions with overrides
  const rolePermissions = useMemo(() => {
    return getRolePermissions(selectedRole, rolePermissionOverrides[selectedRole])
  }, [selectedRole, rolePermissionOverrides])
  
  // Filtered permission categories
  const filteredCategories = useMemo(() => {
    return PERMISSION_CATEGORIES.map(cat => ({
      ...cat,
      permissions: cat.permissions.filter(perm => {
        if (searchQuery) {
          const query = searchQuery.toLowerCase()
          return perm.key.toLowerCase().includes(query) ||
                 perm.name.toLowerCase().includes(query) ||
                 perm.description.toLowerCase().includes(query)
        }
        if (showOnlyCustomized) {
          const overrides = rolePermissionOverrides[selectedRole]
          return overrides && overrides[perm.key] !== undefined
        }
        return true
      })
    })).filter(cat => cat.permissions.length > 0)
  }, [searchQuery, showOnlyCustomized, selectedRole, rolePermissionOverrides])
  
  // Toggle category expansion
  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }
  
  // Handle permission change
  const handlePermissionChange = (permissionKey: string, value: 'granted' | 'denied') => {
    if (selectedRole === 'owner') {
      toast.warning('Owner permissions cannot be modified')
      return
    }
    setRolePermission(selectedRole, permissionKey, value)
    setHasUnsavedChanges(true)
  }
  
  // Reset role to defaults
  const handleResetRole = () => {
    if (window.confirm(`Reset ${selectedRole} permissions to defaults? This will remove all customizations.`)) {
      resetRoleToDefaults(selectedRole)
      setHasUnsavedChanges(true)
      toast.success(`${selectedRole} permissions reset to defaults`)
    }
  }
  
  // Save changes
  const handleSave = async () => {
    setIsSaving(true)
    try {
      // In production, this would save to API
      await new Promise(resolve => setTimeout(resolve, 500))
      loadEffectivePermissions(user?.role || 'staff')
      setHasUnsavedChanges(false)
      toast.success('Permission changes saved')
    } catch (error) {
      toast.error('Failed to save permissions')
    } finally {
      setIsSaving(false)
    }
  }
  
  // Count customized permissions
  const customizedCount = useMemo(() => {
    const overrides = rolePermissionOverrides[selectedRole]
    return overrides ? Object.keys(overrides).length : 0
  }, [selectedRole, rolePermissionOverrides])
  
  // Get icon for category
  const getCategoryIcon = (categoryId: string) => {
    switch (categoryId) {
      case 'matters': return Briefcase
      case 'clients': return Users
      case 'billing': return DollarSign
      case 'documents': return FileText
      case 'calendar': return Calendar
      case 'reports': return BarChart3
      case 'admin': return Settings
      case 'ai': return Sparkles
      case 'security': return Shield
      default: return Settings
    }
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
        </button>
        <div className={styles.title}>
          <Shield size={22} />
          <div>
            <h1>Permissions & Access Control</h1>
            <p>Configure role permissions, matter access, and document sharing</p>
          </div>
        </div>
        {hasUnsavedChanges && (
          <button 
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />}
            Save Changes
          </button>
        )}
      </div>
      
      {/* Tabs */}
      <div className={styles.tabs}>
        <button 
          className={clsx(styles.tab, activeTab === 'roles' && styles.active)}
          onClick={() => setActiveTab('roles')}
        >
          <Shield size={16} />
          Role Permissions
        </button>
        <button 
          className={clsx(styles.tab, activeTab === 'matters' && styles.active)}
          onClick={() => setActiveTab('matters')}
        >
          <Briefcase size={16} />
          Matter Access
        </button>
        <button 
          className={clsx(styles.tab, activeTab === 'documents' && styles.active)}
          onClick={() => setActiveTab('documents')}
        >
          <FileText size={16} />
          Document Sharing
        </button>
        <button 
          className={clsx(styles.tab, activeTab === 'users' && styles.active)}
          onClick={() => setActiveTab('users')}
        >
          <Users size={16} />
          User Overrides
        </button>
      </div>
      
      {/* Role Permissions Tab */}
      {activeTab === 'roles' && (
        <div className={styles.content}>
          {/* Role Selector */}
          <div className={styles.roleSelector}>
            <h3>Select Role to Configure</h3>
            <div className={styles.roleGrid}>
              {ROLES.map(role => {
                const Icon = role.icon
                const isSelected = selectedRole === role.id
                const hasOverrides = rolePermissionOverrides[role.id] && 
                  Object.keys(rolePermissionOverrides[role.id]).length > 0
                
                return (
                  <button
                    key={role.id}
                    className={clsx(styles.roleCard, isSelected && styles.selected)}
                    onClick={() => setSelectedRole(role.id)}
                    style={{ '--role-color': role.color } as React.CSSProperties}
                  >
                    <div className={styles.roleIcon} style={{ backgroundColor: role.color }}>
                      <Icon size={18} />
                    </div>
                    <div className={styles.roleInfo}>
                      <span className={styles.roleName}>{role.name}</span>
                      <span className={styles.roleDesc}>{role.description}</span>
                    </div>
                    {hasOverrides && (
                      <span className={styles.customizedBadge}>Customized</span>
                    )}
                    {role.id === 'owner' && (
                      <Lock size={14} className={styles.lockIcon} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
          
          {/* Permission Editor */}
          <div className={styles.permissionEditor}>
            <div className={styles.editorHeader}>
              <h3>
                Permissions for <span style={{ color: ROLES.find(r => r.id === selectedRole)?.color }}>
                  {ROLES.find(r => r.id === selectedRole)?.name}
                </span>
              </h3>
              <div className={styles.editorActions}>
                <div className={styles.searchBox}>
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="Search permissions..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <label className={styles.filterToggle}>
                  <input
                    type="checkbox"
                    checked={showOnlyCustomized}
                    onChange={e => setShowOnlyCustomized(e.target.checked)}
                  />
                  <span>Show customized only</span>
                </label>
                {customizedCount > 0 && (
                  <button className={styles.resetBtn} onClick={handleResetRole}>
                    <RefreshCw size={14} />
                    Reset to Defaults
                  </button>
                )}
              </div>
            </div>
            
            {selectedRole === 'owner' && (
              <div className={styles.ownerNotice}>
                <Lock size={16} />
                <span>Owner permissions cannot be modified. Owners have full access to all features.</span>
              </div>
            )}
            
            <div className={styles.categoriesList}>
              {filteredCategories.map(category => {
                const Icon = getCategoryIcon(category.id)
                const isExpanded = expandedCategories.has(category.id)
                
                return (
                  <div key={category.id} className={styles.category}>
                    <button 
                      className={styles.categoryHeader}
                      onClick={() => toggleCategory(category.id)}
                    >
                      <Icon size={18} />
                      <span className={styles.categoryName}>{category.name}</span>
                      <span className={styles.categoryDesc}>{category.description}</span>
                      <span className={styles.permissionCount}>
                        {category.permissions.filter(p => rolePermissions[p.key] === 'granted').length} / {category.permissions.length}
                      </span>
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    
                    {isExpanded && (
                      <div className={styles.permissionsList}>
                        {category.permissions.map(perm => {
                          const isGranted = rolePermissions[perm.key] === 'granted'
                          const isCustomized = rolePermissionOverrides[selectedRole]?.[perm.key] !== undefined
                          const isSensitive = perm.sensitive
                          
                          return (
                            <div 
                              key={perm.key} 
                              className={clsx(
                                styles.permissionRow,
                                isCustomized && styles.customized,
                                isSensitive && styles.sensitive
                              )}
                            >
                              <div className={styles.permissionInfo}>
                                <span className={styles.permissionName}>
                                  {perm.name}
                                  {isSensitive && (
                                    <span className={styles.sensitiveBadge}>Sensitive</span>
                                  )}
                                </span>
                                <span className={styles.permissionDesc}>{perm.description}</span>
                                <span className={styles.permissionKey}>{perm.key}</span>
                              </div>
                              <div className={styles.permissionToggle}>
                                <button
                                  className={clsx(styles.toggleBtn, styles.deny, !isGranted && styles.active)}
                                  onClick={() => handlePermissionChange(perm.key, 'denied')}
                                  disabled={selectedRole === 'owner'}
                                >
                                  <X size={14} />
                                  Deny
                                </button>
                                <button
                                  className={clsx(styles.toggleBtn, styles.grant, isGranted && styles.active)}
                                  onClick={() => handlePermissionChange(perm.key, 'granted')}
                                  disabled={selectedRole === 'owner'}
                                >
                                  <Check size={14} />
                                  Grant
                                </button>
                              </div>
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
        </div>
      )}
      
      {/* Matter Access Tab */}
      {activeTab === 'matters' && (
        <div className={styles.content}>
          <div className={styles.accessSection}>
            <div className={styles.sectionHeader}>
              <h3>Matter Access Configuration</h3>
              <p>Control who can see and work on specific matters. By default, users only see matters they're assigned to.</p>
              <button className={styles.addRuleBtn}>
                <Plus size={16} />
                Create Access Rule
              </button>
            </div>
            
            {/* Default Access Settings */}
            <div className={styles.defaultSettings}>
              <h4>Default Access Behavior</h4>
              <div className={styles.settingGroup}>
                <label className={styles.settingRow}>
                  <div className={styles.settingInfo}>
                    <span className={styles.settingName}>Users see only assigned matters</span>
                    <span className={styles.settingDesc}>Staff, paralegals, and attorneys only see matters where they are explicitly assigned</span>
                  </div>
                  <div className={styles.toggleSwitch}>
                    <input type="checkbox" defaultChecked />
                    <span className={styles.slider}></span>
                  </div>
                </label>
                
                <label className={styles.settingRow}>
                  <div className={styles.settingInfo}>
                    <span className={styles.settingName}>Admins see all matters</span>
                    <span className={styles.settingDesc}>Admin role has visibility into all firm matters</span>
                  </div>
                  <div className={styles.toggleSwitch}>
                    <input type="checkbox" defaultChecked />
                    <span className={styles.slider}></span>
                  </div>
                </label>
                
                <label className={styles.settingRow}>
                  <div className={styles.settingInfo}>
                    <span className={styles.settingName}>Billing sees matters with unbilled time</span>
                    <span className={styles.settingDesc}>Billing role can view matters that have billable entries</span>
                  </div>
                  <div className={styles.toggleSwitch}>
                    <input type="checkbox" defaultChecked />
                    <span className={styles.slider}></span>
                  </div>
                </label>
                
                <label className={styles.settingRow}>
                  <div className={styles.settingInfo}>
                    <span className={styles.settingName}>Matter assignment grants document access</span>
                    <span className={styles.settingDesc}>When assigned to a matter, users automatically get access to its documents</span>
                  </div>
                  <div className={styles.toggleSwitch}>
                    <input type="checkbox" defaultChecked />
                    <span className={styles.slider}></span>
                  </div>
                </label>
              </div>
            </div>
            
            {/* Access Rules */}
            <div className={styles.rulesSection}>
              <h4>Access Rules</h4>
              <p>Create rules to grant access to groups of matters based on type, client, or other criteria.</p>
              
              {matterAccessRules.length === 0 ? (
                <div className={styles.emptyRules}>
                  <Briefcase size={32} />
                  <span>No custom access rules defined</span>
                  <p>By default, users see only matters where they're assigned as team members.</p>
                </div>
              ) : (
                <div className={styles.rulesList}>
                  {matterAccessRules.map(rule => (
                    <div key={rule.id} className={styles.ruleCard}>
                      <div className={styles.ruleHeader}>
                        <Briefcase size={18} />
                        <span className={styles.ruleName}>{rule.name}</span>
                        <span className={clsx(styles.accessBadge, styles[rule.accessLevel])}>
                          {rule.accessLevel}
                        </span>
                        <div className={styles.ruleActions}>
                          <button className={styles.iconBtn}><Edit2 size={14} /></button>
                          <button className={styles.iconBtn}><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <p className={styles.ruleDesc}>{rule.description}</p>
                      <div className={styles.ruleMeta}>
                        <span><Users size={12} /> {rule.userIds.length} users</span>
                        <span>{rule.includeDocuments && '📄 Documents'}</span>
                        <span>{rule.includeBilling && '💰 Billing'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Document Sharing Tab */}
      {activeTab === 'documents' && (
        <div className={styles.content}>
          <div className={styles.accessSection}>
            <div className={styles.sectionHeader}>
              <h3>Document Access Configuration</h3>
              <p>Configure how documents are shared and who can access them.</p>
              <button className={styles.addRuleBtn}>
                <Plus size={16} />
                Create Sharing Rule
              </button>
            </div>
            
            {/* Document Default Settings */}
            <div className={styles.defaultSettings}>
              <h4>Default Document Access</h4>
              <div className={styles.settingGroup}>
                <label className={styles.settingRow}>
                  <div className={styles.settingInfo}>
                    <span className={styles.settingName}>Inherit access from matter</span>
                    <span className={styles.settingDesc}>Documents in a matter folder are accessible to anyone assigned to that matter</span>
                  </div>
                  <div className={styles.toggleSwitch}>
                    <input type="checkbox" defaultChecked />
                    <span className={styles.slider}></span>
                  </div>
                </label>
                
                <label className={styles.settingRow}>
                  <div className={styles.settingInfo}>
                    <span className={styles.settingName}>Restrict confidential documents</span>
                    <span className={styles.settingDesc}>Documents marked "Confidential" require additional permission</span>
                  </div>
                  <div className={styles.toggleSwitch}>
                    <input type="checkbox" defaultChecked />
                    <span className={styles.slider}></span>
                  </div>
                </label>
                
                <label className={styles.settingRow}>
                  <div className={styles.settingInfo}>
                    <span className={styles.settingName}>Allow external sharing</span>
                    <span className={styles.settingDesc}>Users with permission can create links to share documents externally</span>
                  </div>
                  <div className={styles.toggleSwitch}>
                    <input type="checkbox" defaultChecked />
                    <span className={styles.slider}></span>
                  </div>
                </label>
                
                <label className={styles.settingRow}>
                  <div className={styles.settingInfo}>
                    <span className={styles.settingName}>Require access request for restricted</span>
                    <span className={styles.settingDesc}>Users can request access to documents they can't view</span>
                  </div>
                  <div className={styles.toggleSwitch}>
                    <input type="checkbox" defaultChecked />
                    <span className={styles.slider}></span>
                  </div>
                </label>
              </div>
            </div>
            
            {/* Folder Permissions */}
            <div className={styles.rulesSection}>
              <h4>Folder Sharing Rules</h4>
              <p>Set up sharing rules for specific folders that apply regardless of matter assignment.</p>
              
              {documentAccessRules.length === 0 ? (
                <div className={styles.emptyRules}>
                  <FileText size={32} />
                  <span>No folder sharing rules defined</span>
                </div>
              ) : (
                <div className={styles.rulesList}>
                  {documentAccessRules.map(rule => (
                    <div key={rule.id} className={styles.ruleCard}>
                      <div className={styles.ruleHeader}>
                        <FileText size={18} />
                        <span className={styles.ruleName}>{rule.name}</span>
                        <span className={clsx(styles.accessBadge, styles[rule.accessLevel])}>
                          {rule.accessLevel}
                        </span>
                        <div className={styles.ruleActions}>
                          <button className={styles.iconBtn}><Edit2 size={14} /></button>
                          <button className={styles.iconBtn}><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <div className={styles.ruleMeta}>
                        <span><Users size={12} /> {rule.groupIds.length} groups</span>
                        <span>{rule.inheritFromMatter ? '🔗 Inherits from matter' : '🔒 Independent'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* User Overrides Tab */}
      {activeTab === 'users' && (
        <div className={styles.content}>
          <div className={styles.accessSection}>
            <div className={styles.sectionHeader}>
              <h3>Individual User Overrides</h3>
              <p>Grant or deny specific permissions for individual users, overriding their role defaults.</p>
              <button className={styles.addRuleBtn}>
                <UserPlus size={16} />
                Add User Override
              </button>
            </div>
            
            <div className={styles.overrideNotice}>
              <AlertCircle size={16} />
              <span>User overrides take precedence over role permissions. Use sparingly.</span>
            </div>
            
            {userOverrides.length === 0 ? (
              <div className={styles.emptyRules}>
                <Users size={32} />
                <span>No individual user overrides</span>
                <p>All users are using their role's default permissions.</p>
              </div>
            ) : (
              <div className={styles.rulesList}>
                {userOverrides.map(override => (
                  <div key={override.userId} className={styles.userOverrideCard}>
                    <div className={styles.ruleHeader}>
                      <div className={styles.userAvatar}>
                        {override.userName.charAt(0)}
                      </div>
                      <div className={styles.userInfo}>
                        <span className={styles.userName}>{override.userName}</span>
                        <span className={styles.userRole}>{override.userRole}</span>
                      </div>
                      <span className={styles.overrideCount}>
                        {override.overrides.length} overrides
                      </span>
                      <div className={styles.ruleActions}>
                        <button className={styles.iconBtn}><Edit2 size={14} /></button>
                        <button className={styles.iconBtn}><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className={styles.overridesList}>
                      {override.overrides.map(o => (
                        <div key={o.permission} className={styles.overrideItem}>
                          <span className={styles.overridePermission}>{o.permission}</span>
                          <span className={clsx(styles.overrideValue, styles[o.value])}>
                            {o.value === 'granted' ? <Check size={12} /> : <X size={12} />}
                            {o.value}
                          </span>
                          {o.reason && <span className={styles.overrideReason}>{o.reason}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
