import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAuthStore } from '../stores/authStore'
import { 
  Plus, Key, Copy, Trash2, Eye, EyeOff, 
  CheckCircle2, AlertCircle, ArrowLeft, RefreshCw
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import styles from './APIKeysPage.module.css'
import { useToast } from '../components/Toast'

export function APIKeysPage() {
  const _toast = useToast()
  const navigate = useNavigate()
  const { apiKeys, fetchAPIKeys, addAPIKey, deleteAPIKey } = useDataStore()
  const { user: _user } = useAuthStore()
  const [showNewModal, setShowNewModal] = useState(false)
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch API keys on mount
  useEffect(() => {
    const loadKeys = async () => {
      setLoading(true)
      await fetchAPIKeys()
      setLoading(false)
    }
    loadKeys()
  }, [fetchAPIKeys])

  const toggleReveal = (id: string) => {
    setRevealedKeys(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const copyToClipboard = async (key: string, id: string) => {
    await navigator.clipboard.writeText(key)
    setCopiedKey(id)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const maskKey = (key: string) => {
    return key.slice(0, 12) + '••••••••••••••••••••'
  }

  return (
    <div className={styles.apiKeysPage}>
      <button className={styles.backButton} onClick={() => navigate('/app/settings')}>
        <ArrowLeft size={16} />
        Back to Settings
      </button>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>API Keys</h1>
          <p>Manage API keys for external integrations</p>
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.secondaryBtn}
            onClick={() => fetchAPIKeys()}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? styles.spinning : ''} />
          </button>
          <button 
            className={styles.primaryBtn}
            onClick={() => setShowNewModal(true)}
          >
            <Plus size={18} />
            Create New Key
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className={styles.infoBanner}>
        <AlertCircle size={20} />
        <div>
          <strong>Keep your API keys secure</strong>
          <p>API keys provide full access to your Apex account. Never share them publicly or commit them to version control.</p>
        </div>
      </div>

      {/* API Keys List */}
      <div className={styles.keysList}>
        {apiKeys.map(key => (
          <div key={key.id} className={styles.keyCard}>
            <div className={styles.keyHeader}>
              <div className={styles.keyIcon}>
                <Key size={20} />
              </div>
              <div className={styles.keyInfo}>
                <h3>{key.name}</h3>
                <div className={styles.keyMeta}>
                  <span>Created {format(parseISO(key.createdAt), 'MMM d, yyyy')}</span>
                  {key.lastUsed && (
                    <span>Last used {format(parseISO(key.lastUsed), 'MMM d, yyyy h:mm a')}</span>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.keyValue}>
              <code>
                {revealedKeys.has(key.id) ? key.key : maskKey(key.key)}
              </code>
              <div className={styles.keyActions}>
                <button 
                  onClick={() => toggleReveal(key.id)}
                  title={revealedKeys.has(key.id) ? 'Hide' : 'Reveal'}
                >
                  {revealedKeys.has(key.id) ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button 
                  onClick={() => copyToClipboard(key.key, key.id)}
                  title="Copy to clipboard"
                  className={copiedKey === key.id ? styles.copied : ''}
                >
                  {copiedKey === key.id ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                </button>
                <button 
                  onClick={() => deleteAPIKey(key.id)}
                  title="Revoke key"
                  className={styles.deleteBtn}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className={styles.keyPermissions}>
              <span className={styles.permLabel}>Permissions:</span>
              {key.permissions.map(perm => (
                <span key={perm} className={styles.permBadge}>{perm}</span>
              ))}
            </div>
          </div>
        ))}

        {apiKeys.length === 0 && (
          <div className={styles.emptyState}>
            <Key size={48} />
            <h3>No API Keys</h3>
            <p>Create an API key to integrate with external services</p>
            <button onClick={() => setShowNewModal(true)}>
              <Plus size={16} />
              Create Your First Key
            </button>
          </div>
        )}
      </div>

      {showNewModal && (
        <NewKeyModal 
          onClose={() => setShowNewModal(false)}
          onCreate={async (data) => {
            try {
              await addAPIKey(data)
              setShowNewModal(false)
              // Refresh to show the new key
              fetchAPIKeys()
            } catch (err) {
              alert('Failed to create API key')
            }
          }}
        />
      )}
    </div>
  )
}

function NewKeyModal({ onClose, onCreate }: { onClose: () => void; onCreate: (data: any) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    permissions: ['matters:read', 'clients:read', 'documents:read']
  })

  const allPermissions = [
    { value: 'matters:read', label: 'Read Matters' },
    { value: 'matters:write', label: 'Write Matters' },
    { value: 'clients:read', label: 'Read Clients' },
    { value: 'clients:write', label: 'Write Clients' },
    { value: 'documents:read', label: 'Read Documents' },
    { value: 'documents:write', label: 'Write Documents' },
    { value: 'calendar:read', label: 'Read Calendar' },
    { value: 'calendar:write', label: 'Write Calendar' },
    { value: 'billing:read', label: 'Read Billing' },
    { value: 'billing:write', label: 'Write Billing' }
  ]

  const togglePermission = (perm: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm]
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onCreate(formData)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Create API Key</h2>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Key Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="e.g., Document Sync Integration"
              required
            />
            <span className={styles.hint}>A descriptive name to identify this key</span>
          </div>

          <div className={styles.formGroup}>
            <label>Permissions</label>
            <div className={styles.permissionsGrid}>
              {allPermissions.map(perm => (
                <label key={perm.value} className={styles.permissionItem}>
                  <input
                    type="checkbox"
                    checked={formData.permissions.includes(perm.value)}
                    onChange={() => togglePermission(perm.value)}
                  />
                  <span>{perm.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn}>
              <Key size={16} />
              Create Key
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

