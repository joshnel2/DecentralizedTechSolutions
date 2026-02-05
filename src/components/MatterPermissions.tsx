/**
 * MatterPermissions Component
 * Displays and manages matter visibility and access permissions
 * Clio-like permission system
 */

import { useState, useEffect } from 'react'
import { 
  Globe, Lock, Users, UserPlus, X, Search, 
  Shield, Eye, Edit2, Trash2, Loader2, Check,
  AlertCircle
} from 'lucide-react'
import { clsx } from 'clsx'
import { mattersApi } from '../services/api'
import styles from './MatterPermissions.module.css'

interface Permission {
  permissionId: string
  userId: string | null
  groupId: string | null
  permissionLevel: string
  canViewDocuments: boolean
  canViewNotes: boolean
  canEdit: boolean
  grantedAt: string
  userName: string | null
  userEmail: string | null
  userRole: string | null
  groupName: string | null
  groupColor: string | null
  grantedByName: string | null
}

interface User {
  id: string
  name: string
  firstName: string
  lastName: string
  email: string
  role: string
  avatar?: string
}

interface Group {
  id: string
  name: string
  description: string
  color: string
  memberCount: number
}

interface MatterPermissionsProps {
  matterId: string
  matterName?: string
  canManagePermissions: boolean
  onClose?: () => void
  compact?: boolean
}

export function MatterPermissions({ 
  matterId, 
  matterName: _matterName,
  canManagePermissions, 
  onClose,
  compact = false 
}: MatterPermissionsProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Permission data
  const [visibility, setVisibility] = useState<'firm_wide' | 'restricted'>('firm_wide')
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [permissionCount, setPermissionCount] = useState(0)
  const [maxPermissions] = useState(20)
  
  // Attorney info
  const [_responsibleAttorney, setResponsibleAttorney] = useState<string | null>(null)
  const [responsibleAttorneyName, setResponsibleAttorneyName] = useState<string | null>(null)
  
  // User/Group picker
  const [showPicker, setShowPicker] = useState(false)
  const [pickerTab, setPickerTab] = useState<'users' | 'groups'>('users')
  const [searchQuery, setSearchQuery] = useState('')
  const [availableUsers, setAvailableUsers] = useState<User[]>([])
  const [availableGroups, setAvailableGroups] = useState<Group[]>([])
  const [loadingPicker, setLoadingPicker] = useState(false)

  // Load permissions data
  useEffect(() => {
    loadPermissions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId])

  async function loadPermissions() {
    try {
      setLoading(true)
      setError(null)
      const data = await mattersApi.getPermissions(matterId)
      setVisibility(data.visibility || 'firm_wide')
      setPermissions(data.permissions || [])
      setPermissionCount(data.permissionCount || 0)
      setResponsibleAttorney(data.responsibleAttorney)
      setResponsibleAttorneyName(data.responsibleAttorneyName)
    } catch (err: any) {
      setError(err.message || 'Failed to load permissions')
    } finally {
      setLoading(false)
    }
  }

  // Load available users/groups when picker opens
  useEffect(() => {
    if (showPicker) {
      loadAvailableUsersAndGroups()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPicker, searchQuery])

  async function loadAvailableUsersAndGroups() {
    try {
      setLoadingPicker(true)
      const [usersData, groupsData] = await Promise.all([
        mattersApi.getAvailableUsers(matterId, searchQuery || undefined),
        mattersApi.getAvailableGroups(matterId)
      ])
      setAvailableUsers(usersData.users || [])
      setAvailableGroups(groupsData.groups || [])
    } catch (err) {
      console.error('Failed to load users/groups:', err)
    } finally {
      setLoadingPicker(false)
    }
  }

  async function handleVisibilityChange(newVisibility: 'firm_wide' | 'restricted') {
    if (!canManagePermissions) return
    
    try {
      setSaving(true)
      await mattersApi.updateVisibility(matterId, newVisibility)
      setVisibility(newVisibility)
    } catch (err: any) {
      setError(err.message || 'Failed to update visibility')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddPermission(userId?: string, groupId?: string) {
    if (!canManagePermissions) return
    if (permissionCount >= maxPermissions) {
      setError(`Maximum ${maxPermissions} permissions reached`)
      return
    }

    try {
      setSaving(true)
      await mattersApi.addPermission(matterId, { userId, groupId })
      await loadPermissions()
      setShowPicker(false)
      setSearchQuery('')
    } catch (err: any) {
      setError(err.message || 'Failed to add permission')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemovePermission(permissionId: string) {
    if (!canManagePermissions) return

    try {
      setSaving(true)
      await mattersApi.removePermission(matterId, permissionId)
      await loadPermissions()
    } catch (err: any) {
      setError(err.message || 'Failed to remove permission')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className={clsx(styles.container, compact && styles.compact)}>
        <div className={styles.loading}>
          <Loader2 className={styles.spinner} size={24} />
          <span>Loading permissions...</span>
        </div>
      </div>
    )
  }

  return (
    <div className={clsx(styles.container, compact && styles.compact)}>
      {onClose && (
        <div className={styles.header}>
          <h3>
            <Shield size={20} />
            Matter Permissions
          </h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
      )}

      {error && (
        <div className={styles.error}>
          <AlertCircle size={16} />
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Visibility Toggle */}
      <div className={styles.section}>
        <label className={styles.sectionLabel}>Visibility</label>
        <div className={styles.visibilityToggle}>
          <button
            className={clsx(
              styles.visibilityOption,
              visibility === 'firm_wide' && styles.active
            )}
            onClick={() => handleVisibilityChange('firm_wide')}
            disabled={!canManagePermissions || saving}
          >
            <Globe size={18} />
            <div className={styles.optionContent}>
              <span className={styles.optionTitle}>Firm Wide</span>
              <span className={styles.optionDesc}>All users can access</span>
            </div>
            {visibility === 'firm_wide' && <Check size={18} className={styles.checkIcon} />}
          </button>
          
          <button
            className={clsx(
              styles.visibilityOption,
              visibility === 'restricted' && styles.active
            )}
            onClick={() => handleVisibilityChange('restricted')}
            disabled={!canManagePermissions || saving}
          >
            <Lock size={18} />
            <div className={styles.optionContent}>
              <span className={styles.optionTitle}>Restricted</span>
              <span className={styles.optionDesc}>Only selected users</span>
            </div>
            {visibility === 'restricted' && <Check size={18} className={styles.checkIcon} />}
          </button>
        </div>
      </div>

      {/* Responsible Attorney Info */}
      {responsibleAttorneyName && (
        <div className={styles.section}>
          <label className={styles.sectionLabel}>Responsible Attorney</label>
          <div className={styles.responsibleAttorney}>
            <div className={styles.userAvatar}>
              {responsibleAttorneyName.split(' ').map(n => n[0]).join('')}
            </div>
            <span>{responsibleAttorneyName}</span>
            <span className={styles.badge}>Always has access</span>
          </div>
        </div>
      )}

      {/* Permissions List (only show for restricted matters) */}
      {visibility === 'restricted' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <label className={styles.sectionLabel}>
              Who Has Access ({permissionCount}/{maxPermissions})
            </label>
            {canManagePermissions && permissionCount < maxPermissions && (
              <button 
                className={styles.addBtn}
                onClick={() => setShowPicker(true)}
                disabled={saving}
              >
                <UserPlus size={16} />
                Add
              </button>
            )}
          </div>

          {permissions.length === 0 ? (
            <div className={styles.emptyPermissions}>
              <Users size={24} />
              <p>No additional users or groups have access yet.</p>
              {canManagePermissions && (
                <button 
                  className={styles.addFirstBtn}
                  onClick={() => setShowPicker(true)}
                >
                  <UserPlus size={16} />
                  Add Users or Groups
                </button>
              )}
            </div>
          ) : (
            <div className={styles.permissionsList}>
              {permissions.map((perm) => (
                <div key={perm.permissionId} className={styles.permissionItem}>
                  {perm.userId ? (
                    <>
                      <div className={styles.userAvatar}>
                        {perm.userName?.split(' ').map(n => n[0]).join('') || '?'}
                      </div>
                      <div className={styles.permInfo}>
                        <span className={styles.permName}>{perm.userName}</span>
                        <span className={styles.permMeta}>{perm.userEmail}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div 
                        className={styles.groupAvatar}
                        style={{ backgroundColor: perm.groupColor || '#3B82F6' }}
                      >
                        <Users size={14} />
                      </div>
                      <div className={styles.permInfo}>
                        <span className={styles.permName}>{perm.groupName}</span>
                        <span className={styles.permMeta}>Group</span>
                      </div>
                    </>
                  )}
                  
                  <div className={styles.permActions}>
                    <span className={clsx(styles.permLevel, styles[perm.permissionLevel])}>
                      {perm.permissionLevel === 'view' && <Eye size={12} />}
                      {perm.permissionLevel === 'edit' && <Edit2 size={12} />}
                      {perm.permissionLevel === 'admin' && <Shield size={12} />}
                      {perm.permissionLevel}
                    </span>
                    {canManagePermissions && (
                      <button 
                        className={styles.removeBtn}
                        onClick={() => handleRemovePermission(perm.permissionId)}
                        disabled={saving}
                        title="Remove access"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* User/Group Picker Modal */}
      {showPicker && (
        <div className={styles.pickerOverlay} onClick={() => setShowPicker(false)}>
          <div className={styles.picker} onClick={(e) => e.stopPropagation()}>
            <div className={styles.pickerHeader}>
              <h4>Add Access</h4>
              <button onClick={() => setShowPicker(false)}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.pickerTabs}>
              <button
                className={clsx(pickerTab === 'users' && styles.activeTab)}
                onClick={() => setPickerTab('users')}
              >
                <Users size={16} />
                Users
              </button>
              <button
                className={clsx(pickerTab === 'groups' && styles.activeTab)}
                onClick={() => setPickerTab('groups')}
              >
                <Shield size={16} />
                Groups
              </button>
            </div>

            {pickerTab === 'users' && (
              <div className={styles.searchBox}>
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            <div className={styles.pickerList}>
              {loadingPicker ? (
                <div className={styles.pickerLoading}>
                  <Loader2 className={styles.spinner} size={20} />
                </div>
              ) : pickerTab === 'users' ? (
                availableUsers.length === 0 ? (
                  <div className={styles.pickerEmpty}>
                    No users available to add
                  </div>
                ) : (
                  availableUsers.map((user) => (
                    <button
                      key={user.id}
                      className={styles.pickerItem}
                      onClick={() => handleAddPermission(user.id)}
                      disabled={saving}
                    >
                      <div className={styles.userAvatar}>
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className={styles.pickerItemInfo}>
                        <span className={styles.pickerItemName}>{user.name}</span>
                        <span className={styles.pickerItemMeta}>{user.email}</span>
                      </div>
                      <span className={clsx(styles.roleBadge, styles[user.role])}>
                        {user.role}
                      </span>
                    </button>
                  ))
                )
              ) : (
                availableGroups.length === 0 ? (
                  <div className={styles.pickerEmpty}>
                    No groups available to add
                  </div>
                ) : (
                  availableGroups.map((group) => (
                    <button
                      key={group.id}
                      className={styles.pickerItem}
                      onClick={() => handleAddPermission(undefined, group.id)}
                      disabled={saving}
                    >
                      <div 
                        className={styles.groupAvatar}
                        style={{ backgroundColor: group.color }}
                      >
                        <Users size={14} />
                      </div>
                      <div className={styles.pickerItemInfo}>
                        <span className={styles.pickerItemName}>{group.name}</span>
                        <span className={styles.pickerItemMeta}>
                          {group.memberCount} member{group.memberCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </button>
                  ))
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MatterPermissions
