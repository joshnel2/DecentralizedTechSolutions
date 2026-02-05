import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Folder, Users, User, ChevronRight, Lock, 
  Shield, Eye, Edit3, Download, Share2, Trash2, Plus,
  Check, X, Loader2, AlertCircle, ArrowLeft, FolderOpen,
  Home, HelpCircle
} from 'lucide-react'
import { documentPermissionsApi, teamApi } from '../services/api'
import styles from './FolderPermissionsPage.module.css'

interface FolderPermission {
  id: string
  folderPath: string
  driveId?: string
  userId?: string
  userName?: string
  groupId?: string
  groupName?: string
  groupColor?: string
  permissionLevel: string
  canView: boolean
  canDownload: boolean
  canEdit: boolean
  canDelete: boolean
  canCreate: boolean
  canShare: boolean
  canManagePermissions: boolean
  createdBy: string
  createdAt: string
}

interface TeamMember {
  id: string
  firstName: string
  lastName: string
  email: string
  role: string
}

const PERMISSION_LEVELS = [
  { value: 'view', label: 'View Only', description: 'Can see files but not download', icon: Eye, color: '#6b7280' },
  { value: 'download', label: 'View & Download', description: 'Can view and download files', icon: Download, color: '#10b981' },
  { value: 'edit', label: 'Editor', description: 'Can view, download, and edit files', icon: Edit3, color: '#3b82f6' },
  { value: 'contributor', label: 'Contributor', description: 'Can create, edit, and delete files', icon: FolderOpen, color: '#8b5cf6' },
  { value: 'admin', label: 'Folder Admin', description: 'Full control including managing permissions', icon: Shield, color: '#f59e0b' },
]

export function FolderPermissionsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialPath = searchParams.get('path') || '/'

  const [currentPath, setCurrentPath] = useState(initialPath)
  const [permissions, setPermissions] = useState<FolderPermission[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Add permission form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newPermission, setNewPermission] = useState({
    userId: '',
    groupId: '',
    permissionLevel: 'view',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [currentPath])

  // Auto-dismiss notifications
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [notification])

  const loadData = async () => {
    setLoading(true)
    try {
      const [permResult, teamResult] = await Promise.all([
        documentPermissionsApi.getFolderPermissions(currentPath),
        teamApi.getMembers(),
      ])
      setPermissions(permResult.permissions || [])
      setTeamMembers(teamResult.members || [])
    } catch (error) {
      console.error('Failed to load permissions:', error)
      setPermissions([])
    } finally {
      setLoading(false)
    }
  }

  const handleAddPermission = async () => {
    if (!newPermission.userId && !newPermission.groupId) {
      setNotification({ type: 'error', message: 'Please select a team member' })
      return
    }

    setSaving(true)
    try {
      const preset = getPermissionPreset(newPermission.permissionLevel)
      
      await documentPermissionsApi.setFolderPermission({
        folderPath: currentPath,
        userId: newPermission.userId || undefined,
        groupId: newPermission.groupId || undefined,
        permissionLevel: newPermission.permissionLevel,
        canView: preset.canView,
        canDownload: preset.canDownload,
        canEdit: preset.canEdit,
        canDelete: preset.canDelete,
        canCreate: preset.canCreate,
        canShare: preset.canShare,
        canManagePermissions: preset.canManagePermissions,
      })

      setNotification({ type: 'success', message: 'Permission added successfully' })
      setShowAddForm(false)
      setNewPermission({ userId: '', groupId: '', permissionLevel: 'view' })
      loadData()
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to add permission' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePermission = async (permissionId: string) => {
    try {
      await documentPermissionsApi.deleteFolderPermission(permissionId)
      setPermissions(permissions.filter(p => p.id !== permissionId))
      setNotification({ type: 'success', message: 'Permission removed' })
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to remove permission' })
    }
  }

  const getPermissionPreset = (level: string) => {
    switch (level) {
      case 'view':
        return { canView: true, canDownload: false, canEdit: false, canDelete: false, canCreate: false, canShare: false, canManagePermissions: false }
      case 'download':
        return { canView: true, canDownload: true, canEdit: false, canDelete: false, canCreate: false, canShare: false, canManagePermissions: false }
      case 'edit':
        return { canView: true, canDownload: true, canEdit: true, canDelete: false, canCreate: false, canShare: false, canManagePermissions: false }
      case 'contributor':
        return { canView: true, canDownload: true, canEdit: true, canDelete: true, canCreate: true, canShare: false, canManagePermissions: false }
      case 'admin':
        return { canView: true, canDownload: true, canEdit: true, canDelete: true, canCreate: true, canShare: true, canManagePermissions: true }
      default:
        return { canView: true, canDownload: false, canEdit: false, canDelete: false, canCreate: false, canShare: false, canManagePermissions: false }
    }
  }

  const pathParts = currentPath.split('/').filter(Boolean)
  const availableMembers = teamMembers.filter(m => !permissions.some(p => p.userId === m.id))

  return (
    <div className={styles.page}>
      {/* Header with back button */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/app/documents')}>
          <ArrowLeft size={20} />
          <span>Back to Documents</span>
        </button>
      </header>

      <div className={styles.container}>
        {/* Page Title */}
        <div className={styles.titleSection}>
          <div className={styles.titleIcon}>
            <Shield size={28} />
          </div>
          <div className={styles.titleText}>
            <h1>Folder Permissions</h1>
            <p>Control who can access files in each folder. Permissions set here override default firm-wide access.</p>
          </div>
        </div>

        {/* Notification */}
        {notification && (
          <div className={`${styles.notification} ${styles[notification.type]}`}>
            {notification.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
            <span>{notification.message}</span>
            <button onClick={() => setNotification(null)} className={styles.notificationClose}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* Folder Navigation */}
        <div className={styles.folderNav}>
          <div className={styles.breadcrumb}>
            <button 
              className={`${styles.breadcrumbItem} ${currentPath === '/' ? styles.active : ''}`}
              onClick={() => setCurrentPath('/')}
            >
              <Home size={14} />
              <span>Root</span>
            </button>
            {pathParts.map((part, index) => {
              const path = '/' + pathParts.slice(0, index + 1).join('/')
              const isActive = currentPath === path
              return (
                <span key={path} className={styles.breadcrumbSegment}>
                  <ChevronRight size={14} className={styles.breadcrumbSep} />
                  <button
                    className={`${styles.breadcrumbItem} ${isActive ? styles.active : ''}`}
                    onClick={() => setCurrentPath(path)}
                  >
                    <Folder size={14} />
                    <span>{part}</span>
                  </button>
                </span>
              )
            })}
          </div>
        </div>

        {/* Current Folder Card */}
        <div className={styles.currentFolder}>
          <div className={styles.folderHeader}>
            <div className={styles.folderIconLarge}>
              <Folder size={24} />
            </div>
            <div className={styles.folderInfo}>
              <h2>{currentPath === '/' ? 'Root Folder' : pathParts[pathParts.length - 1]}</h2>
              <code className={styles.folderPath}>{currentPath}</code>
            </div>
            <button 
              className={styles.addPermissionBtn} 
              onClick={() => setShowAddForm(true)}
              disabled={showAddForm}
            >
              <Plus size={18} />
              <span>Add Permission</span>
            </button>
          </div>

          {/* Add Permission Form */}
          {showAddForm && (
            <div className={styles.addForm}>
              <div className={styles.addFormHeader}>
                <h3>Add New Permission</h3>
                <button className={styles.closeFormBtn} onClick={() => setShowAddForm(false)}>
                  <X size={18} />
                </button>
              </div>
              
              <div className={styles.formContent}>
                <div className={styles.formGroup}>
                  <label>Team Member</label>
                  {availableMembers.length === 0 ? (
                    <div className={styles.noMembers}>
                      <Users size={20} />
                      <span>All team members already have permissions for this folder</span>
                    </div>
                  ) : (
                    <select
                      value={newPermission.userId}
                      onChange={e => setNewPermission({ ...newPermission, userId: e.target.value, groupId: '' })}
                      className={styles.select}
                    >
                      <option value="">Select a team member...</option>
                      {availableMembers.map(member => (
                        <option key={member.id} value={member.id}>
                          {member.firstName} {member.lastName} ({member.email})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label>Permission Level</label>
                  <div className={styles.permissionOptions}>
                    {PERMISSION_LEVELS.map(level => {
                      const Icon = level.icon
                      const isSelected = newPermission.permissionLevel === level.value
                      return (
                        <button
                          key={level.value}
                          type="button"
                          className={`${styles.permissionOption} ${isSelected ? styles.selected : ''}`}
                          onClick={() => setNewPermission({ ...newPermission, permissionLevel: level.value })}
                          style={{ '--level-color': level.color } as React.CSSProperties}
                        >
                          <div className={styles.optionIcon}>
                            <Icon size={18} />
                          </div>
                          <div className={styles.optionText}>
                            <span className={styles.optionLabel}>{level.label}</span>
                            <span className={styles.optionDesc}>{level.description}</span>
                          </div>
                          {isSelected && (
                            <div className={styles.optionCheck}>
                              <Check size={16} />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className={styles.formActions}>
                  <button 
                    type="button" 
                    className={styles.cancelBtn} 
                    onClick={() => setShowAddForm(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    className={styles.saveBtn} 
                    onClick={handleAddPermission} 
                    disabled={saving || !newPermission.userId}
                  >
                    {saving ? (
                      <>
                        <Loader2 size={16} className={styles.spinning} />
                        <span>Adding...</span>
                      </>
                    ) : (
                      <>
                        <Check size={16} />
                        <span>Add Permission</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Existing Permissions */}
          <div className={styles.permissionsSection}>
            <div className={styles.sectionHeader}>
              <Lock size={16} />
              <h3>Current Permissions</h3>
              <span className={styles.count}>{permissions.length}</span>
            </div>

            {loading ? (
              <div className={styles.loading}>
                <Loader2 size={24} className={styles.spinning} />
                <span>Loading permissions...</span>
              </div>
            ) : permissions.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <Users size={32} />
                </div>
                <h4>No Specific Permissions</h4>
                <p>This folder uses default firm-wide access settings. Add permissions above to restrict or grant specific access.</p>
              </div>
            ) : (
              <div className={styles.permissionsList}>
                {permissions.map(perm => {
                  const levelInfo = PERMISSION_LEVELS.find(l => l.value === perm.permissionLevel)
                  const LevelIcon = levelInfo?.icon || Eye
                  
                  return (
                    <div key={perm.id} className={styles.permissionItem}>
                      <div className={styles.permissionUser}>
                        <div className={styles.userAvatar}>
                          {perm.userId ? <User size={18} /> : <Users size={18} />}
                        </div>
                        <div className={styles.userDetails}>
                          <span className={styles.userName}>{perm.userName || perm.groupName}</span>
                          <span className={styles.userType}>{perm.userId ? 'Individual' : 'Group'}</span>
                        </div>
                      </div>

                      <div className={styles.permissionCapabilities}>
                        {perm.canView && <span className={styles.capability} title="Can view"><Eye size={14} /></span>}
                        {perm.canDownload && <span className={styles.capability} title="Can download"><Download size={14} /></span>}
                        {perm.canEdit && <span className={styles.capability} title="Can edit"><Edit3 size={14} /></span>}
                        {perm.canShare && <span className={styles.capability} title="Can share"><Share2 size={14} /></span>}
                        {perm.canManagePermissions && <span className={`${styles.capability} ${styles.admin}`} title="Can manage permissions"><Shield size={14} /></span>}
                      </div>

                      <div 
                        className={styles.permissionBadge}
                        style={{ 
                          '--badge-color': levelInfo?.color || '#6b7280'
                        } as React.CSSProperties}
                      >
                        <LevelIcon size={14} />
                        <span>{levelInfo?.label || perm.permissionLevel}</span>
                      </div>

                      <button 
                        className={styles.removeBtn}
                        onClick={() => handleDeletePermission(perm.id)}
                        title="Remove permission"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Help Section */}
        <div className={styles.helpSection}>
          <div className={styles.helpHeader}>
            <HelpCircle size={18} />
            <h4>How Permissions Work</h4>
          </div>
          <div className={styles.helpContent}>
            <div className={styles.helpItem}>
              <strong>Inheritance:</strong> Child folders inherit permissions from parent folders unless overridden.
            </div>
            <div className={styles.helpItem}>
              <strong>Priority:</strong> Specific user permissions take priority over group permissions.
            </div>
            <div className={styles.helpItem}>
              <strong>Admins:</strong> Firm owners and admins always have full access to all folders.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
