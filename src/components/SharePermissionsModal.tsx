import { useState, useEffect, useMemo } from 'react'
import type { LucideIcon } from 'lucide-react'
import { 
  X, Users, Search, Check, ChevronDown, Shield, 
  Eye, Edit, Lock, Crown, UserPlus, Building2,
  Clock, Trash2, AlertTriangle
} from 'lucide-react'
import styles from './SharePermissionsModal.module.css'
import { useToast } from './Toast'

interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  role: string
  avatar?: string
}

interface Group {
  id: string
  name: string
  color: string
  memberCount: number
}

interface Permission {
  id?: string
  userId?: string
  groupId?: string
  roleSlug?: string
  userName?: string
  userEmail?: string
  groupName?: string
  groupColor?: string
  permissionLevel: 'view' | 'edit' | 'manage' | 'full'
  grantedAt?: string
  expiresAt?: string
  grantedByName?: string
  canViewDocuments?: boolean
  canViewNotes?: boolean
  canEdit?: boolean
}

interface PermissionLevel {
  id: 'view' | 'edit' | 'manage' | 'full'
  name: string
  description: string
  icon: LucideIcon
  color: string
}

interface SharePermissionsModalProps {
  isOpen: boolean
  onClose: () => void
  
  /**
   * Type of resource being shared
   */
  resourceType: 'matter' | 'client' | 'document' | 'folder'
  
  /**
   * Resource ID
   */
  resourceId: string
  
  /**
   * Resource name for display
   */
  resourceName: string
  
  /**
   * Current visibility setting
   */
  visibility?: 'firm_wide' | 'restricted'
  
  /**
   * Current permissions list
   */
  currentPermissions?: Permission[]
  
  /**
   * Available users to grant access to
   */
  availableUsers?: User[]
  
  /**
   * Available groups to grant access to
   */
  availableGroups?: Group[]
  
  /**
   * Callback when permissions are updated
   */
  onSave?: (permissions: Permission[], visibility: 'firm_wide' | 'restricted') => Promise<void>
  
  /**
   * Callback when a permission is removed
   */
  onRemovePermission?: (permissionId: string) => Promise<void>
  
  /**
   * Maximum number of permissions allowed
   */
  maxPermissions?: number
}

const PERMISSION_LEVELS: PermissionLevel[] = [
  { id: 'view', name: 'View Only', description: 'Can view but not edit', icon: Eye, color: '#64748B' },
  { id: 'edit', name: 'Collaborator', description: 'Can view and edit', icon: Edit, color: '#3B82F6' },
  { id: 'manage', name: 'Manager', description: 'Can manage permissions', icon: Shield, color: '#8B5CF6' },
  { id: 'full', name: 'Full Access', description: 'Complete control', icon: Crown, color: '#F59E0B' }
]

// Demo data
const DEMO_USERS: User[] = [
  { id: '1', firstName: 'Sarah', lastName: 'Johnson', email: 'sarah.johnson@firm.com', role: 'attorney' },
  { id: '2', firstName: 'Michael', lastName: 'Chen', email: 'michael.chen@firm.com', role: 'paralegal' },
  { id: '3', firstName: 'Emily', lastName: 'Rodriguez', email: 'emily.rodriguez@firm.com', role: 'staff' },
  { id: '4', firstName: 'David', lastName: 'Kim', email: 'david.kim@firm.com', role: 'attorney' },
  { id: '5', firstName: 'Jessica', lastName: 'Williams', email: 'jessica.williams@firm.com', role: 'billing' }
]

const DEMO_GROUPS: Group[] = [
  { id: 'g1', name: 'Litigation Team', color: '#3B82F6', memberCount: 5 },
  { id: 'g2', name: 'Corporate Team', color: '#10B981', memberCount: 3 },
  { id: 'g3', name: 'Real Estate Team', color: '#F59E0B', memberCount: 4 }
]

export function SharePermissionsModal({
  isOpen,
  onClose,
  resourceType,
  resourceId: _resourceId,
  resourceName,
  visibility: initialVisibility = 'firm_wide',
  currentPermissions = [],
  availableUsers = DEMO_USERS,
  availableGroups = DEMO_GROUPS,
  onSave,
  onRemovePermission,
  maxPermissions = 20
}: SharePermissionsModalProps) {
  const toast = useToast()
  
  // State
  const [visibility, setVisibility] = useState(initialVisibility)
  const [permissions, setPermissions] = useState<Permission[]>(currentPermissions)
  const [searchQuery, setSearchQuery] = useState('')
  const [showUserPicker, setShowUserPicker] = useState(false)
  const [selectedLevel, setSelectedLevel] = useState<PermissionLevel['id']>('view')
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'users' | 'groups' | 'roles'>('users')
  
  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setVisibility(initialVisibility)
      setPermissions(currentPermissions)
      setSearchQuery('')
      setShowUserPicker(false)
    }
  }, [isOpen, initialVisibility, currentPermissions])
  
  // Filter users/groups by search
  const filteredUsers = useMemo(() => {
    if (!searchQuery) return availableUsers
    const query = searchQuery.toLowerCase()
    return availableUsers.filter(u => 
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(query) ||
      u.email.toLowerCase().includes(query)
    )
  }, [availableUsers, searchQuery])
  
  const filteredGroups = useMemo(() => {
    if (!searchQuery) return availableGroups
    const query = searchQuery.toLowerCase()
    return availableGroups.filter(g => 
      g.name.toLowerCase().includes(query)
    )
  }, [availableGroups, searchQuery])
  
  // Users already with permission
  const usersWithPermission = useMemo(() => {
    return new Set(permissions.filter(p => p.userId).map(p => p.userId))
  }, [permissions])
  
  // Groups already with permission
  const groupsWithPermission = useMemo(() => {
    return new Set(permissions.filter(p => p.groupId).map(p => p.groupId))
  }, [permissions])
  
  // Add user permission
  const addUserPermission = (user: User) => {
    if (usersWithPermission.has(user.id)) return
    if (permissions.length >= maxPermissions) {
      toast.warning('Maximum permissions reached', `You can add up to ${maxPermissions} permissions`)
      return
    }
    
    const newPermission: Permission = {
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      userEmail: user.email,
      permissionLevel: selectedLevel,
      canViewDocuments: true,
      canViewNotes: true,
      canEdit: selectedLevel !== 'view'
    }
    
    setPermissions([...permissions, newPermission])
    setShowUserPicker(false)
    setSearchQuery('')
  }
  
  // Add group permission
  const addGroupPermission = (group: Group) => {
    if (groupsWithPermission.has(group.id)) return
    if (permissions.length >= maxPermissions) {
      toast.warning('Maximum permissions reached', `You can add up to ${maxPermissions} permissions`)
      return
    }
    
    const newPermission: Permission = {
      groupId: group.id,
      groupName: group.name,
      groupColor: group.color,
      permissionLevel: selectedLevel,
      canViewDocuments: true,
      canViewNotes: true,
      canEdit: selectedLevel !== 'view'
    }
    
    setPermissions([...permissions, newPermission])
    setShowUserPicker(false)
    setSearchQuery('')
  }
  
  // Remove permission
  const removePermission = async (index: number) => {
    const perm = permissions[index]
    if (perm.id && onRemovePermission) {
      try {
        await onRemovePermission(perm.id)
      } catch (error) {
        toast.error('Failed to remove permission')
        return
      }
    }
    setPermissions(permissions.filter((_, i) => i !== index))
  }
  
  // Update permission level
  const updatePermissionLevel = (index: number, level: PermissionLevel['id']) => {
    const updated = [...permissions]
    updated[index] = {
      ...updated[index],
      permissionLevel: level,
      canEdit: level !== 'view'
    }
    setPermissions(updated)
  }
  
  // Save changes
  const handleSave = async () => {
    if (!onSave) {
      onClose()
      return
    }
    
    setSaving(true)
    try {
      await onSave(permissions, visibility)
      toast.success('Permissions saved', 'Access settings have been updated')
      onClose()
    } catch (error) {
      toast.error('Failed to save permissions')
    } finally {
      setSaving(false)
    }
  }
  
  if (!isOpen) return null
  
  const resourceTypeLabel = resourceType.charAt(0).toUpperCase() + resourceType.slice(1)
  
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <Shield size={20} className={styles.headerIcon} />
            <div>
              <h2>Share {resourceTypeLabel}</h2>
              <p className={styles.resourceName}>{resourceName}</p>
            </div>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        
        <div className={styles.content}>
          {/* Visibility Toggle */}
          <div className={styles.visibilitySection}>
            <h3>Visibility</h3>
            <div className={styles.visibilityOptions}>
              <button
                className={`${styles.visibilityOption} ${visibility === 'firm_wide' ? styles.active : ''}`}
                onClick={() => setVisibility('firm_wide')}
              >
                <Building2 size={18} />
                <div>
                  <span>Firm Wide</span>
                  <p>Everyone in the firm can access</p>
                </div>
                {visibility === 'firm_wide' && <Check size={16} className={styles.checkIcon} />}
              </button>
              <button
                className={`${styles.visibilityOption} ${visibility === 'restricted' ? styles.active : ''}`}
                onClick={() => setVisibility('restricted')}
              >
                <Lock size={18} />
                <div>
                  <span>Restricted</span>
                  <p>Only selected people can access</p>
                </div>
                {visibility === 'restricted' && <Check size={16} className={styles.checkIcon} />}
              </button>
            </div>
          </div>
          
          {/* Add People Section */}
          {visibility === 'restricted' && (
            <>
              <div className={styles.addSection}>
                <div className={styles.addHeader}>
                  <h3>People with access</h3>
                  <span className={styles.permissionCount}>
                    {permissions.length} / {maxPermissions}
                  </span>
                </div>
                
                <div className={styles.addControl}>
                  <div className={styles.searchWrapper}>
                    <Search size={16} />
                    <input
                      type="text"
                      placeholder="Search people or groups..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value)
                        setShowUserPicker(true)
                      }}
                      onFocus={() => setShowUserPicker(true)}
                    />
                  </div>
                  
                  <div className={styles.levelSelector}>
                    <button 
                      className={styles.levelButton}
                      onClick={() => {
                        const currentIdx = PERMISSION_LEVELS.findIndex(l => l.id === selectedLevel)
                        const nextIdx = (currentIdx + 1) % PERMISSION_LEVELS.length
                        setSelectedLevel(PERMISSION_LEVELS[nextIdx].id)
                      }}
                    >
                      {(() => {
                        const level = PERMISSION_LEVELS.find(l => l.id === selectedLevel)!
                        const Icon = level.icon
                        return (
                          <>
                            <Icon size={14} />
                            <span>{level.name}</span>
                            <ChevronDown size={14} />
                          </>
                        )
                      })()}
                    </button>
                  </div>
                </div>
                
                {/* User/Group Picker Dropdown */}
                {showUserPicker && (
                  <div className={styles.pickerDropdown}>
                    <div className={styles.pickerTabs}>
                      <button 
                        className={activeTab === 'users' ? styles.active : ''}
                        onClick={() => setActiveTab('users')}
                      >
                        <Users size={14} />
                        Users
                      </button>
                      <button 
                        className={activeTab === 'groups' ? styles.active : ''}
                        onClick={() => setActiveTab('groups')}
                      >
                        <Building2 size={14} />
                        Groups
                      </button>
                    </div>
                    
                    <div className={styles.pickerList}>
                      {activeTab === 'users' && filteredUsers.map(user => (
                        <button
                          key={user.id}
                          className={styles.pickerItem}
                          onClick={() => addUserPermission(user)}
                          disabled={usersWithPermission.has(user.id)}
                        >
                          <div className={styles.userAvatar}>
                            {user.firstName[0]}{user.lastName[0]}
                          </div>
                          <div className={styles.userInfo}>
                            <span>{user.firstName} {user.lastName}</span>
                            <span className={styles.userEmail}>{user.email}</span>
                          </div>
                          {usersWithPermission.has(user.id) ? (
                            <Check size={16} className={styles.addedIcon} />
                          ) : (
                            <UserPlus size={16} className={styles.addIcon} />
                          )}
                        </button>
                      ))}
                      
                      {activeTab === 'groups' && filteredGroups.map(group => (
                        <button
                          key={group.id}
                          className={styles.pickerItem}
                          onClick={() => addGroupPermission(group)}
                          disabled={groupsWithPermission.has(group.id)}
                        >
                          <div 
                            className={styles.groupIcon}
                            style={{ backgroundColor: `${group.color}20`, color: group.color }}
                          >
                            <Users size={14} />
                          </div>
                          <div className={styles.userInfo}>
                            <span>{group.name}</span>
                            <span className={styles.userEmail}>{group.memberCount} members</span>
                          </div>
                          {groupsWithPermission.has(group.id) ? (
                            <Check size={16} className={styles.addedIcon} />
                          ) : (
                            <UserPlus size={16} className={styles.addIcon} />
                          )}
                        </button>
                      ))}
                      
                      {activeTab === 'users' && filteredUsers.length === 0 && (
                        <div className={styles.noResults}>No users found</div>
                      )}
                      {activeTab === 'groups' && filteredGroups.length === 0 && (
                        <div className={styles.noResults}>No groups found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Current Permissions List */}
              <div className={styles.permissionsList}>
                {permissions.length === 0 ? (
                  <div className={styles.emptyState}>
                    <Lock size={24} />
                    <p>No one has been granted access yet.</p>
                    <span>Search for people or groups above to add them.</span>
                  </div>
                ) : (
                  permissions.map((perm, index) => {
                    const level = PERMISSION_LEVELS.find(l => l.id === perm.permissionLevel) || PERMISSION_LEVELS[0]
                    const _LevelIcon = level.icon
                    
                    return (
                      <div key={index} className={styles.permissionItem}>
                        <div className={styles.permissionUser}>
                          {perm.userId ? (
                            <div className={styles.userAvatar}>
                              {perm.userName?.split(' ').map(n => n[0]).join('')}
                            </div>
                          ) : (
                            <div 
                              className={styles.groupIcon}
                              style={{ backgroundColor: `${perm.groupColor}20`, color: perm.groupColor }}
                            >
                              <Users size={14} />
                            </div>
                          )}
                          <div className={styles.permissionUserInfo}>
                            <span>{perm.userName || perm.groupName}</span>
                            {perm.userEmail && <span className={styles.userEmail}>{perm.userEmail}</span>}
                            {perm.grantedAt && (
                              <span className={styles.grantedInfo}>
                                <Clock size={10} /> Added {new Date(perm.grantedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className={styles.permissionActions}>
                          <select
                            value={perm.permissionLevel}
                            onChange={(e) => updatePermissionLevel(index, e.target.value as PermissionLevel['id'])}
                            className={styles.levelSelect}
                          >
                            {PERMISSION_LEVELS.map(l => (
                              <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                          </select>
                          
                          <button 
                            className={styles.removeButton}
                            onClick={() => removePermission(index)}
                            title="Remove access"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </>
          )}
          
          {/* Info message for firm-wide */}
          {visibility === 'firm_wide' && (
            <div className={styles.infoMessage}>
              <AlertTriangle size={16} />
              <p>
                This {resourceType} is visible to everyone in your firm. 
                Switch to "Restricted" to limit access to specific people or groups.
              </p>
            </div>
          )}
        </div>
        
        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button 
            className={styles.saveButton} 
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SharePermissionsModal
