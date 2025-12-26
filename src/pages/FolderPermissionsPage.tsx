import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Folder, Users, User, ChevronRight, ChevronDown, Lock, 
  Shield, Eye, Edit3, Download, Share2, Trash2, Plus,
  Check, X, Loader2, AlertCircle, Settings
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
  { value: 'view', label: 'View Only', description: 'Can view files', color: '#6b7280' },
  { value: 'download', label: 'View & Download', description: 'Can view and download files', color: '#10b981' },
  { value: 'edit', label: 'Editor', description: 'Can view, download, and edit files', color: '#3b82f6' },
  { value: 'contributor', label: 'Contributor', description: 'Can create and edit files', color: '#8b5cf6' },
  { value: 'admin', label: 'Folder Admin', description: 'Full control including permissions', color: '#f59e0b' },
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
    } finally {
      setLoading(false)
    }
  }

  const handleAddPermission = async () => {
    if (!newPermission.userId && !newPermission.groupId) {
      setNotification({ type: 'error', message: 'Please select a user or group' })
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

      setNotification({ type: 'success', message: 'Permission added' })
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

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.icon}>
            <Shield size={24} />
          </div>
          <div>
            <h1>Folder Permissions</h1>
            <p>Manage who can access files in each folder</p>
          </div>
        </div>
        <button className={styles.settingsBtn} onClick={() => navigate('/app/settings/drives')}>
          <Settings size={18} />
          Drive Settings
        </button>
      </header>

      {/* Notification */}
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          {notification.message}
          <button onClick={() => setNotification(null)}>×</button>
        </div>
      )}

      {/* Breadcrumb */}
      <div className={styles.breadcrumb}>
        <button 
          className={`${styles.breadcrumbItem} ${currentPath === '/' ? styles.active : ''}`}
          onClick={() => setCurrentPath('/')}
        >
          <Folder size={16} />
          Root
        </button>
        {pathParts.map((part, index) => {
          const path = '/' + pathParts.slice(0, index + 1).join('/')
          return (
            <span key={path}>
              <ChevronRight size={14} className={styles.breadcrumbSep} />
              <button
                className={`${styles.breadcrumbItem} ${currentPath === path ? styles.active : ''}`}
                onClick={() => setCurrentPath(path)}
              >
                {part}
              </button>
            </span>
          )
        })}
      </div>

      {/* Current Folder Info */}
      <div className={styles.folderInfo}>
        <Folder size={28} className={styles.folderIcon} />
        <div className={styles.folderDetails}>
          <h2>{currentPath === '/' ? 'Root Folder' : pathParts[pathParts.length - 1] || 'Folder'}</h2>
          <span className={styles.folderPath}>{currentPath}</span>
        </div>
        <button className={styles.addBtn} onClick={() => setShowAddForm(true)}>
          <Plus size={16} />
          Add Permission
        </button>
      </div>

      {/* Add Permission Form */}
      {showAddForm && (
        <div className={styles.addForm}>
          <h3>Add Permission</h3>
          
          <div className={styles.formGroup}>
            <label>Grant access to:</label>
            <select
              value={newPermission.userId}
              onChange={e => setNewPermission({ ...newPermission, userId: e.target.value, groupId: '' })}
            >
              <option value="">Select a team member...</option>
              {teamMembers
                .filter(m => !permissions.some(p => p.userId === m.id))
                .map(member => (
                  <option key={member.id} value={member.id}>
                    {member.firstName} {member.lastName} ({member.email})
                  </option>
                ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Permission level:</label>
            <div className={styles.permissionLevels}>
              {PERMISSION_LEVELS.map(level => (
                <button
                  key={level.value}
                  className={`${styles.levelBtn} ${newPermission.permissionLevel === level.value ? styles.active : ''}`}
                  onClick={() => setNewPermission({ ...newPermission, permissionLevel: level.value })}
                  style={{ '--level-color': level.color } as React.CSSProperties}
                >
                  <span className={styles.levelDot} />
                  <div className={styles.levelInfo}>
                    <span className={styles.levelLabel}>{level.label}</span>
                    <span className={styles.levelDesc}>{level.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.formActions}>
            <button className={styles.cancelBtn} onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
            <button className={styles.saveBtn} onClick={handleAddPermission} disabled={saving}>
              {saving ? <Loader2 size={16} className={styles.spinning} /> : <Check size={16} />}
              Add Permission
            </button>
          </div>
        </div>
      )}

      {/* Permissions List */}
      <div className={styles.permissionsList}>
        <h3>
          <Lock size={16} />
          Current Permissions ({permissions.length})
        </h3>

        {loading ? (
          <div className={styles.loading}>
            <Loader2 size={24} className={styles.spinning} />
            Loading...
          </div>
        ) : permissions.length === 0 ? (
          <div className={styles.empty}>
            <Users size={32} />
            <p>No specific permissions set for this folder</p>
            <span>Folder will use inherited permissions from parent folders, or default firm-wide access</span>
          </div>
        ) : (
          <div className={styles.permissionsGrid}>
            {permissions.map(perm => (
              <div key={perm.id} className={styles.permissionCard}>
                <div className={styles.permissionUser}>
                  <div className={styles.avatar}>
                    {perm.userId ? <User size={16} /> : <Users size={16} />}
                  </div>
                  <div className={styles.userInfo}>
                    <span className={styles.userName}>{perm.userName || perm.groupName}</span>
                    <span className={styles.userType}>{perm.userId ? 'User' : 'Group'}</span>
                  </div>
                </div>

                <div className={styles.permissionBadges}>
                  {perm.canView && <span className={styles.badge} title="Can view"><Eye size={12} /></span>}
                  {perm.canDownload && <span className={styles.badge} title="Can download"><Download size={12} /></span>}
                  {perm.canEdit && <span className={styles.badge} title="Can edit"><Edit3 size={12} /></span>}
                  {perm.canShare && <span className={styles.badge} title="Can share"><Share2 size={12} /></span>}
                  {perm.canManagePermissions && <span className={`${styles.badge} ${styles.admin}`} title="Admin"><Shield size={12} /></span>}
                </div>

                <div className={styles.permissionLevel}>
                  <span 
                    className={styles.levelTag}
                    style={{ 
                      background: PERMISSION_LEVELS.find(l => l.value === perm.permissionLevel)?.color + '20',
                      color: PERMISSION_LEVELS.find(l => l.value === perm.permissionLevel)?.color 
                    }}
                  >
                    {PERMISSION_LEVELS.find(l => l.value === perm.permissionLevel)?.label || perm.permissionLevel}
                  </span>
                </div>

                <button 
                  className={styles.removeBtn}
                  onClick={() => handleDeletePermission(perm.id)}
                  title="Remove permission"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Permission Legend */}
      <div className={styles.legend}>
        <h4>Permission Levels Explained</h4>
        <div className={styles.legendGrid}>
          {PERMISSION_LEVELS.map(level => (
            <div key={level.value} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: level.color }} />
              <span className={styles.legendLabel}>{level.label}</span>
              <span className={styles.legendDesc}>{level.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
