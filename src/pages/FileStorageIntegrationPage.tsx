import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  ArrowLeft, HardDrive, Cloud, FolderOpen, Link2, 
  Plus, Trash2, ExternalLink, RefreshCw, Check,
  AlertCircle, Search, FileText, Loader2
} from 'lucide-react'
import { documentsApi, mattersApi } from '../services/api'
import styles from './FileStorageIntegrationPage.module.css'

interface LinkedFile {
  id: string
  name: string
  externalPath: string
  externalType: string
  matterId?: string
  matterName?: string
  size?: number
  uploadedAt: string
}

interface Matter {
  id: string
  name: string
  number: string
}

type StorageType = 'local_path' | 'google_drive' | 'onedrive' | 'dropbox' | 'sharepoint' | 'url'

const STORAGE_TYPES: { value: StorageType; label: string; icon: any; description: string }[] = [
  { value: 'local_path', label: 'Local/Network Path', icon: HardDrive, description: 'Link to files on your computer or network drive' },
  { value: 'google_drive', label: 'Google Drive', icon: Cloud, description: 'Link to files stored in Google Drive' },
  { value: 'onedrive', label: 'OneDrive', icon: Cloud, description: 'Link to files stored in Microsoft OneDrive' },
  { value: 'dropbox', label: 'Dropbox', icon: Cloud, description: 'Link to files stored in Dropbox' },
  { value: 'sharepoint', label: 'SharePoint', icon: Cloud, description: 'Link to files stored in SharePoint' },
  { value: 'url', label: 'Web URL', icon: ExternalLink, description: 'Link to any file accessible via URL' },
]

export function FileStorageIntegrationPage() {
  const navigate = useNavigate()
  
  const [linkedFiles, setLinkedFiles] = useState<LinkedFile[]>([])
  const [matters, setMatters] = useState<Matter[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Add new link modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [newLinkType, setNewLinkType] = useState<StorageType>('local_path')
  const [newLinkPath, setNewLinkPath] = useState('')
  const [newLinkName, setNewLinkName] = useState('')
  const [newLinkMatter, setNewLinkMatter] = useState('')
  const [saving, setSaving] = useState(false)
  
  // Notifications
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [docsData, mattersData] = await Promise.all([
        documentsApi.getAll(),
        mattersApi.getAll()
      ])
      
      // Filter to only show documents with external paths
      const linked = (docsData.documents || []).filter((d: any) => d.externalPath)
      setLinkedFiles(linked.map((d: any) => ({
        id: d.id,
        name: d.name,
        externalPath: d.externalPath,
        externalType: d.externalType || 'url',
        matterId: d.matterId,
        matterName: d.matterName,
        size: d.size,
        uploadedAt: d.uploadedAt
      })))
      
      setMatters(mattersData.matters || [])
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddLink = async () => {
    if (!newLinkPath.trim()) {
      setNotification({ type: 'error', message: 'Please enter a file path or URL' })
      return
    }

    setSaving(true)
    try {
      // Create a new document entry with external path
      const fileName = newLinkName.trim() || newLinkPath.split('/').pop() || newLinkPath.split('\\').pop() || 'Linked File'
      
      // Use a placeholder file for the document creation
      const blob = new Blob(['External file link'], { type: 'text/plain' })
      const file = new File([blob], `${fileName}.link`, { type: 'text/plain' })
      
      // Upload minimal file then update with external path
      const result = await documentsApi.upload(file, { 
        matterId: newLinkMatter || undefined,
        tags: ['external-link']
      })
      
      // Update with external path info
      await documentsApi.update(result.document.id, {
        name: fileName,
        externalPath: newLinkPath,
        externalType: newLinkType
      })

      setNotification({ type: 'success', message: 'File linked successfully' })
      setShowAddModal(false)
      resetForm()
      loadData()
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to link file' })
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveLink = async (fileId: string) => {
    if (!confirm('Remove this file link?')) return
    
    try {
      await documentsApi.delete(fileId)
      setLinkedFiles(linkedFiles.filter(f => f.id !== fileId))
      setNotification({ type: 'success', message: 'Link removed' })
    } catch (error) {
      setNotification({ type: 'error', message: 'Failed to remove link' })
    }
  }

  const openExternalFile = (file: LinkedFile) => {
    if (file.externalType === 'url' || file.externalPath.startsWith('http')) {
      window.open(file.externalPath, '_blank')
    } else {
      // For local paths, copy to clipboard
      navigator.clipboard.writeText(file.externalPath)
      setNotification({ type: 'success', message: 'Path copied to clipboard' })
    }
  }

  const resetForm = () => {
    setNewLinkType('local_path')
    setNewLinkPath('')
    setNewLinkName('')
    setNewLinkMatter('')
  }

  const getStorageIcon = (type: string) => {
    const storage = STORAGE_TYPES.find(s => s.value === type)
    const Icon = storage?.icon || FileText
    return <Icon size={18} />
  }

  const getStorageLabel = (type: string) => {
    return STORAGE_TYPES.find(s => s.value === type)?.label || type
  }

  const filteredFiles = linkedFiles.filter(f =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.externalPath.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.matterName?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
  }

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
          <button className={styles.backBtn} onClick={() => navigate('/app/integrations')}>
            <ArrowLeft size={20} />
          </button>
          <div className={styles.headerIcon}>
            <HardDrive size={28} />
          </div>
          <div>
            <h1>File Storage</h1>
            <p>Link documents from your computer or cloud storage</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.refreshBtn} onClick={loadData} disabled={loading}>
            <RefreshCw size={18} className={loading ? styles.spinning : ''} />
          </button>
          <button className={styles.addBtn} onClick={() => setShowAddModal(true)}>
            <Plus size={18} />
            Link File
          </button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search linked files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className={styles.stats}>
          <span>{linkedFiles.length} linked files</span>
        </div>
      </div>

      <div className={styles.content}>
        {/* Storage Types Info */}
        <div className={styles.storageTypes}>
          <h3>Supported Storage Locations</h3>
          <div className={styles.storageGrid}>
            {STORAGE_TYPES.map(storage => (
              <div key={storage.value} className={styles.storageCard}>
                <storage.icon size={24} />
                <span>{storage.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Linked Files List */}
        <div className={styles.filesSection}>
          <h3>Linked Files</h3>
          
          {loading ? (
            <div className={styles.loading}>
              <Loader2 size={24} className={styles.spinning} />
              <span>Loading...</span>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className={styles.empty}>
              <FolderOpen size={48} />
              <h4>No linked files yet</h4>
              <p>Link files from your computer or cloud storage to access them here</p>
              <button onClick={() => setShowAddModal(true)}>
                <Plus size={18} />
                Link Your First File
              </button>
            </div>
          ) : (
            <div className={styles.filesList}>
              {filteredFiles.map(file => (
                <div key={file.id} className={styles.fileItem}>
                  <div className={styles.fileIcon}>
                    {getStorageIcon(file.externalType)}
                  </div>
                  <div className={styles.fileInfo}>
                    <div className={styles.fileName}>{file.name}</div>
                    <div className={styles.filePath}>{file.externalPath}</div>
                    <div className={styles.fileMeta}>
                      <span className={styles.fileType}>{getStorageLabel(file.externalType)}</span>
                      {file.matterName && <span className={styles.fileMatter}>{file.matterName}</span>}
                      <span className={styles.fileDate}>{formatDate(file.uploadedAt)}</span>
                    </div>
                  </div>
                  <div className={styles.fileActions}>
                    <button onClick={() => openExternalFile(file)} title="Open / Copy Path">
                      <ExternalLink size={16} />
                    </button>
                    <button onClick={() => handleRemoveLink(file.id)} title="Remove Link" className={styles.deleteBtn}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Link Modal */}
      {showAddModal && (
        <div className={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2>Link External File</h2>
            <p className={styles.modalDesc}>Connect a file from your computer or cloud storage</p>

            <div className={styles.formGroup}>
              <label>Storage Type</label>
              <div className={styles.storageTypeSelect}>
                {STORAGE_TYPES.map(storage => (
                  <button
                    key={storage.value}
                    className={`${styles.storageOption} ${newLinkType === storage.value ? styles.active : ''}`}
                    onClick={() => setNewLinkType(storage.value)}
                  >
                    <storage.icon size={20} />
                    <span>{storage.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>File Path / URL</label>
              <input
                type="text"
                value={newLinkPath}
                onChange={(e) => setNewLinkPath(e.target.value)}
                placeholder={
                  newLinkType === 'local_path' ? 'C:\\Documents\\contract.pdf or /Users/name/Documents/file.pdf' :
                  newLinkType === 'google_drive' ? 'https://drive.google.com/file/d/...' :
                  newLinkType === 'onedrive' ? 'https://onedrive.live.com/...' :
                  newLinkType === 'dropbox' ? 'https://www.dropbox.com/...' :
                  newLinkType === 'sharepoint' ? 'https://company.sharepoint.com/...' :
                  'https://example.com/document.pdf'
                }
              />
            </div>

            <div className={styles.formGroup}>
              <label>Display Name (optional)</label>
              <input
                type="text"
                value={newLinkName}
                onChange={(e) => setNewLinkName(e.target.value)}
                placeholder="My Contract Document"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Link to Matter (optional)</label>
              <select
                value={newLinkMatter}
                onChange={(e) => setNewLinkMatter(e.target.value)}
              >
                <option value="">No matter selected</option>
                {matters.map(m => (
                  <option key={m.id} value={m.id}>{m.number} - {m.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => { setShowAddModal(false); resetForm(); }}>
                Cancel
              </button>
              <button 
                className={styles.confirmBtn}
                onClick={handleAddLink}
                disabled={saving || !newLinkPath.trim()}
              >
                {saving ? <Loader2 size={16} className={styles.spinning} /> : <Link2 size={16} />}
                {saving ? 'Linking...' : 'Link File'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
