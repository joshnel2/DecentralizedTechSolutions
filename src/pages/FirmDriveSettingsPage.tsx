import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, HardDrive, Cloud, Plus, Trash2, Edit2, 
  Check, X, RefreshCw, Settings, FolderOpen, AlertCircle,
  Loader2, Save, ChevronDown, ChevronUp, FileText, Users
} from 'lucide-react'
import { driveApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import styles from './FirmDriveSettingsPage.module.css'

interface DriveConfiguration {
  id: string
  name: string
  driveType: string
  rootPath: string
  syncEnabled: boolean
  syncIntervalMinutes: number
  syncDirection: string
  autoVersionOnSave: boolean
  conflictResolution: string
  isDefault: boolean
  allowPersonalFolders: boolean
  status: string
  lastSyncAt: string | null
  lastSyncStatus: string | null
  lastError: string | null
  isPersonal: boolean
  documentCount: number
  createdAt: string
  createdByName: string | null
}

const DRIVE_TYPES = [
  { value: 'azure_files', label: 'Azure File Share', icon: Cloud, description: 'Your branded cloud drive (recommended)' },
  { value: 'local', label: 'Local/Network Path', icon: HardDrive, description: 'Link to folders on your computer or network drive' },
  { value: 'onedrive', label: 'OneDrive', icon: Cloud, description: 'Microsoft OneDrive for Business' },
  { value: 'google_drive', label: 'Google Drive', icon: Cloud, description: 'Google Drive cloud storage' },
  { value: 'dropbox', label: 'Dropbox', icon: Cloud, description: 'Dropbox cloud storage' },
  { value: 'sharepoint', label: 'SharePoint', icon: Cloud, description: 'Microsoft SharePoint document library' },
  { value: 'network', label: 'Network Share', icon: FolderOpen, description: 'Shared network folder (SMB/CIFS)' },
]

const CONFLICT_RESOLUTIONS = [
  { value: 'ask_user', label: 'Ask User', description: 'Prompt user to choose which version to keep' },
  { value: 'keep_both', label: 'Keep Both', description: 'Save both versions with different names' },
  { value: 'newest_wins', label: 'Newest Wins', description: 'Automatically keep the most recent version' },
  { value: 'apex_wins', label: 'Apex Version Wins', description: 'Always keep the Apex version' },
  { value: 'external_wins', label: 'External Version Wins', description: 'Always keep the external drive version' },
]

const SYNC_DIRECTIONS = [
  { value: 'bidirectional', label: 'Two-way Sync', description: 'Changes sync in both directions' },
  { value: 'to_apex', label: 'Import Only', description: 'Only import files from drive to Apex' },
  { value: 'from_apex', label: 'Export Only', description: 'Only export files from Apex to drive' },
]

export function FirmDriveSettingsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'

  const [drives, setDrives] = useState<DriveConfiguration[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingDrive, setEditingDrive] = useState<DriveConfiguration | null>(null)
  const [expandedDrive, setExpandedDrive] = useState<string | null>(null)
  
  // Form fields
  const [formData, setFormData] = useState({
    name: '',
    driveType: 'local',
    rootPath: '',
    syncEnabled: true,
    syncIntervalMinutes: 5,
    syncDirection: 'bidirectional',
    autoVersionOnSave: true,
    conflictResolution: 'ask_user',
    isDefault: false,
    allowPersonalFolders: true,
    isPersonal: false,
  })

  useEffect(() => {
    loadDrives()
  }, [])

  const loadDrives = async () => {
    setLoading(true)
    try {
      const result = await driveApi.getConfigurations()
      setDrives(result.drives || [])
    } catch (error) {
      console.error('Failed to load drives:', error)
      setNotification({ type: 'error', message: 'Failed to load drive configurations' })
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      driveType: 'local',
      rootPath: '',
      syncEnabled: true,
      syncIntervalMinutes: 5,
      syncDirection: 'bidirectional',
      autoVersionOnSave: true,
      conflictResolution: 'ask_user',
      isDefault: false,
      allowPersonalFolders: true,
      isPersonal: false,
    })
    setEditingDrive(null)
    setShowForm(false)
  }

  const handleEditDrive = (drive: DriveConfiguration) => {
    setEditingDrive(drive)
    setFormData({
      name: drive.name,
      driveType: drive.driveType,
      rootPath: drive.rootPath,
      syncEnabled: drive.syncEnabled,
      syncIntervalMinutes: drive.syncIntervalMinutes,
      syncDirection: drive.syncDirection,
      autoVersionOnSave: drive.autoVersionOnSave,
      conflictResolution: drive.conflictResolution,
      isDefault: drive.isDefault,
      allowPersonalFolders: drive.allowPersonalFolders,
      isPersonal: drive.isPersonal,
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim() || !formData.rootPath.trim()) {
      setNotification({ type: 'error', message: 'Name and path are required' })
      return
    }

    setSaving(true)
    try {
      if (editingDrive) {
        await driveApi.updateConfiguration(editingDrive.id, formData)
        setNotification({ type: 'success', message: 'Drive configuration updated' })
      } else {
        await driveApi.createConfiguration(formData)
        setNotification({ type: 'success', message: 'Drive configuration created' })
      }
      resetForm()
      loadDrives()
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to save drive configuration' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteDrive = async (driveId: string) => {
    if (!confirm('Are you sure you want to remove this drive configuration? Documents will remain but will no longer be synced.')) {
      return
    }

    try {
      await driveApi.deleteConfiguration(driveId)
      setNotification({ type: 'success', message: 'Drive configuration removed' })
      loadDrives()
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to remove drive' })
    }
  }

  const getDriveIcon = (type: string) => {
    const driveType = DRIVE_TYPES.find(d => d.value === type)
    return driveType?.icon || HardDrive
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'var(--success)'
      case 'syncing': return 'var(--primary)'
      case 'error': return 'var(--danger)'
      case 'disconnected': return 'var(--warning)'
      default: return 'var(--muted)'
    }
  }

  const firmDrives = drives.filter(d => !d.isPersonal)
  const personalDrives = drives.filter(d => d.isPersonal)

  return (
    <div className={styles.container}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          {notification.message}
          <button onClick={() => setNotification(null)}>×</button>
        </div>
      )}

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate('/app/settings')}>
            <ArrowLeft size={20} />
          </button>
          <div className={styles.headerIcon}>
            <HardDrive size={28} />
          </div>
          <div>
            <h1>Document Drive Settings</h1>
            <p>Configure firm-wide and personal document drives</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.refreshBtn} onClick={loadDrives} disabled={loading}>
            <RefreshCw size={18} className={loading ? styles.spinning : ''} />
          </button>
          {isAdmin && (
            <button className={styles.addBtn} onClick={() => { resetForm(); setShowForm(true); }}>
              <Plus size={18} />
              Add Drive
            </button>
          )}
        </div>
      </div>

      {/* Info Banner */}
      <div className={styles.infoBanner}>
        <div className={styles.infoIcon}>
          <FileText size={24} />
        </div>
        <div className={styles.infoContent}>
          <h3>Better than Clio Drive</h3>
          <p>
            Configure document drives to sync your files automatically. Unlike Clio, our system:
          </p>
          <ul>
            <li><strong>No stuck locks</strong> - Locks auto-expire after inactivity</li>
            <li><strong>Automatic versioning</strong> - Every save creates a version with your name</li>
            <li><strong>Built-in comparison</strong> - See exactly what changed between versions</li>
            <li><strong>Smart conflict resolution</strong> - Choose how to handle sync conflicts</li>
          </ul>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>
          <Loader2 size={24} className={styles.spinning} />
          <span>Loading drive configurations...</span>
        </div>
      ) : (
        <div className={styles.content}>
          {/* Firm Drives Section */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>
                <Users size={20} />
                Firm Drives
              </h2>
              <span className={styles.badge}>{firmDrives.length}</span>
            </div>
            
            {firmDrives.length === 0 ? (
              <div className={styles.emptyState}>
                <FolderOpen size={48} />
                <h3>No firm drives configured</h3>
                <p>Add a firm-wide drive to sync documents for all users</p>
                {isAdmin && (
                  <button onClick={() => { resetForm(); setShowForm(true); }}>
                    <Plus size={18} />
                    Add Firm Drive
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.driveList}>
                {firmDrives.map(drive => {
                  const DriveIcon = getDriveIcon(drive.driveType)
                  const isExpanded = expandedDrive === drive.id
                  
                  return (
                    <div key={drive.id} className={styles.driveCard}>
                      <div className={styles.driveHeader} onClick={() => setExpandedDrive(isExpanded ? null : drive.id)}>
                        <div className={styles.driveInfo}>
                          <div className={styles.driveIcon}>
                            <DriveIcon size={24} />
                          </div>
                          <div>
                            <h3>
                              {drive.name}
                              {drive.isDefault && <span className={styles.defaultBadge}>Default</span>}
                            </h3>
                            <p className={styles.drivePath}>{drive.rootPath}</p>
                          </div>
                        </div>
                        <div className={styles.driveStatus}>
                          <span 
                            className={styles.statusDot} 
                            style={{ backgroundColor: getStatusColor(drive.status) }}
                          />
                          <span>{drive.status}</span>
                          <span className={styles.docCount}>{drive.documentCount} docs</span>
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className={styles.driveDetails}>
                          <div className={styles.detailGrid}>
                            <div className={styles.detailItem}>
                              <label>Type</label>
                              <span>{DRIVE_TYPES.find(t => t.value === drive.driveType)?.label}</span>
                            </div>
                            <div className={styles.detailItem}>
                              <label>Sync Direction</label>
                              <span>{SYNC_DIRECTIONS.find(s => s.value === drive.syncDirection)?.label}</span>
                            </div>
                            <div className={styles.detailItem}>
                              <label>Sync Interval</label>
                              <span>Every {drive.syncIntervalMinutes} minutes</span>
                            </div>
                            <div className={styles.detailItem}>
                              <label>Conflict Resolution</label>
                              <span>{CONFLICT_RESOLUTIONS.find(c => c.value === drive.conflictResolution)?.label}</span>
                            </div>
                            <div className={styles.detailItem}>
                              <label>Auto Version</label>
                              <span>{drive.autoVersionOnSave ? 'Yes' : 'No'}</span>
                            </div>
                            <div className={styles.detailItem}>
                              <label>Last Sync</label>
                              <span>{drive.lastSyncAt ? new Date(drive.lastSyncAt).toLocaleString() : 'Never'}</span>
                            </div>
                          </div>
                          
                          {drive.lastError && (
                            <div className={styles.errorBox}>
                              <AlertCircle size={16} />
                              {drive.lastError}
                            </div>
                          )}
                          
                          {isAdmin && (
                            <div className={styles.driveActions}>
                              <button onClick={() => handleEditDrive(drive)}>
                                <Edit2 size={16} />
                                Edit
                              </button>
                              <button className={styles.deleteBtn} onClick={() => handleDeleteDrive(drive.id)}>
                                <Trash2 size={16} />
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Personal Drives Section */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>
                <HardDrive size={20} />
                Personal Drives
              </h2>
              <span className={styles.badge}>{personalDrives.length}</span>
            </div>
            
            {personalDrives.length === 0 ? (
              <div className={styles.emptyState}>
                <HardDrive size={48} />
                <h3>No personal drives configured</h3>
                <p>Add a personal drive to sync your own documents</p>
                <button onClick={() => { 
                  resetForm(); 
                  setFormData(prev => ({ ...prev, isPersonal: true })); 
                  setShowForm(true); 
                }}>
                  <Plus size={18} />
                  Add Personal Drive
                </button>
              </div>
            ) : (
              <div className={styles.driveList}>
                {personalDrives.map(drive => {
                  const DriveIcon = getDriveIcon(drive.driveType)
                  
                  return (
                    <div key={drive.id} className={styles.driveCard}>
                      <div className={styles.driveHeader}>
                        <div className={styles.driveInfo}>
                          <div className={styles.driveIcon}>
                            <DriveIcon size={24} />
                          </div>
                          <div>
                            <h3>{drive.name}</h3>
                            <p className={styles.drivePath}>{drive.rootPath}</p>
                          </div>
                        </div>
                        <div className={styles.driveActions}>
                          <button onClick={() => handleEditDrive(drive)}>
                            <Edit2 size={16} />
                          </button>
                          <button className={styles.deleteBtn} onClick={() => handleDeleteDrive(drive.id)}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className={styles.modalOverlay} onClick={() => resetForm()}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{editingDrive ? 'Edit Drive Configuration' : 'Add New Drive'}</h2>
              <button onClick={resetForm}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label>Drive Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Firm Documents, My Drive"
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>Drive Type</label>
                <div className={styles.typeGrid}>
                  {DRIVE_TYPES.map(type => (
                    <button
                      key={type.value}
                      type="button"
                      className={`${styles.typeOption} ${formData.driveType === type.value ? styles.active : ''}`}
                      onClick={() => setFormData({ ...formData, driveType: type.value })}
                    >
                      <type.icon size={20} />
                      <span>{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Root Path / URL *</label>
                <input
                  type="text"
                  value={formData.rootPath}
                  onChange={e => setFormData({ ...formData, rootPath: e.target.value })}
                  placeholder={
                    formData.driveType === 'azure_files' ? '\\\\yourstorage.file.core.windows.net\\firmshare' :
                    formData.driveType === 'local' ? 'C:\\Documents\\LegalFiles or /Users/name/Documents' :
                    formData.driveType === 'network' ? '\\\\server\\share\\legal' :
                    formData.driveType === 'onedrive' ? 'https://onedrive.live.com/...' :
                    formData.driveType === 'google_drive' ? 'https://drive.google.com/...' :
                    formData.driveType === 'dropbox' ? 'https://www.dropbox.com/...' :
                    formData.driveType === 'sharepoint' ? 'https://company.sharepoint.com/sites/...' :
                    'Enter path or URL'
                  }
                  required
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Sync Direction</label>
                  <select
                    value={formData.syncDirection}
                    onChange={e => setFormData({ ...formData, syncDirection: e.target.value })}
                  >
                    {SYNC_DIRECTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Sync Interval</label>
                  <select
                    value={formData.syncIntervalMinutes}
                    onChange={e => setFormData({ ...formData, syncIntervalMinutes: parseInt(e.target.value) })}
                  >
                    <option value={1}>Every 1 minute</option>
                    <option value={5}>Every 5 minutes</option>
                    <option value={15}>Every 15 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                    <option value={60}>Every hour</option>
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Conflict Resolution</label>
                <select
                  value={formData.conflictResolution}
                  onChange={e => setFormData({ ...formData, conflictResolution: e.target.value })}
                >
                  {CONFLICT_RESOLUTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label} - {opt.description}</option>
                  ))}
                </select>
              </div>

              <div className={styles.checkboxGroup}>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={formData.syncEnabled}
                    onChange={e => setFormData({ ...formData, syncEnabled: e.target.checked })}
                  />
                  <span>Enable automatic sync</span>
                </label>

                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={formData.autoVersionOnSave}
                    onChange={e => setFormData({ ...formData, autoVersionOnSave: e.target.checked })}
                  />
                  <span>Create version on every save (recommended)</span>
                </label>

                {!formData.isPersonal && isAdmin && (
                  <>
                    <label className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={formData.isDefault}
                        onChange={e => setFormData({ ...formData, isDefault: e.target.checked })}
                      />
                      <span>Set as default drive for new documents</span>
                    </label>

                    <label className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={formData.allowPersonalFolders}
                        onChange={e => setFormData({ ...formData, allowPersonalFolders: e.target.checked })}
                      />
                      <span>Allow users to create personal folders</span>
                    </label>
                  </>
                )}
              </div>

              <div className={styles.formActions}>
                <button type="button" className={styles.cancelBtn} onClick={resetForm}>
                  Cancel
                </button>
                <button type="submit" className={styles.saveBtn} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 size={16} className={styles.spinning} />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      {editingDrive ? 'Update Drive' : 'Add Drive'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
