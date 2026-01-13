import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { apiKeysApi } from '../../services/api'
import { 
  Plus, Key, Copy, Trash2, Eye, EyeOff, 
  CheckCircle2, LogIn, RefreshCw
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import styles from './DeveloperPortal.module.css'

interface ApiKey {
  id: string
  name: string
  key: string
  keyPrefix: string
  permissions: string[]
  lastUsed: string | null
  createdAt: string
}

export function DeveloperApps() {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuthStore()
  const isAdmin = isAuthenticated && ['owner', 'admin'].includes(user?.role || '')
  
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    if (isAdmin) {
      fetchApiKeys()
    } else {
      setLoading(false)
    }
  }, [isAdmin])

  const fetchApiKeys = async () => {
    try {
      setLoading(true)
      const response = await apiKeysApi.getAll()
      setApiKeys(response.apiKeys || [])
    } catch (error) {
      console.error('Failed to fetch API keys:', error)
    } finally {
      setLoading(false)
    }
  }

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

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to revoke the API key "${name}"? This cannot be undone.`)) {
      try {
        await apiKeysApi.revoke(id)
        setApiKeys(prev => prev.filter(k => k.id !== id))
      } catch (error) {
        alert('Failed to revoke API key')
      }
    }
  }

  const maskKey = (key: string) => {
    if (key.includes('•')) return key
    return key.slice(0, 12) + '•'.repeat(20)
  }

  // Not logged in
  if (!isAuthenticated) {
    return (
      <div className={styles.docPage}>
        <div className={styles.loginRequired}>
          <Key size={64} style={{ opacity: 0.3, marginBottom: '24px' }} />
          <h2>Sign In Required</h2>
          <p>
            You need to sign in with an admin account to create and manage API keys.
          </p>
          <Link to="/login" className={styles.signInBtn} style={{ display: 'inline-flex', marginTop: '16px' }}>
            <LogIn size={18} />
            Sign In to Apex
          </Link>
        </div>
      </div>
    )
  }

  // Logged in but not admin
  if (!isAdmin) {
    return (
      <div className={styles.docPage}>
        <div className={styles.loginRequired}>
          <Key size={64} style={{ opacity: 0.3, marginBottom: '24px' }} />
          <h2>Admin Access Required</h2>
          <p>
            Only firm administrators can create and manage API keys. 
            Contact your firm administrator if you need API access.
          </p>
          <Link to="/app" className={styles.signInBtn} style={{ display: 'inline-flex', marginTop: '16px', background: 'var(--apex-slate)', color: 'var(--apex-light)' }}>
            Back to Apex
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.appsPage}>
      <div className={styles.appsHeader}>
        <div>
          <h1>My Apps</h1>
          <p>Create and manage API keys for your integrations</p>
        </div>
        <button 
          className={styles.createAppBtn}
          onClick={() => setShowCreateModal(true)}
        >
          <Plus size={18} />
          Create New App
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--apex-text)' }}>
          <RefreshCw size={24} className={styles.spinning} style={{ marginBottom: '16px' }} />
          <p>Loading your apps...</p>
        </div>
      ) : apiKeys.length === 0 ? (
        <div className={styles.emptyState}>
          <Key size={64} />
          <h3>No Apps Yet</h3>
          <p>Create your first app to get an API key and start building integrations.</p>
          <button 
            className={styles.createAppBtn}
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={18} />
            Create Your First App
          </button>
        </div>
      ) : (
        <div className={styles.appsList}>
          {apiKeys.map(apiKey => (
            <div key={apiKey.id} className={styles.appCard}>
              <div className={styles.appCardHeader}>
                <div className={styles.appInfo}>
                  <h3>{apiKey.name}</h3>
                  <p>Created {format(parseISO(apiKey.createdAt), 'MMM d, yyyy')}</p>
                </div>
                <div className={styles.appMeta}>
                  {apiKey.lastUsed && (
                    <span>Last used: {format(parseISO(apiKey.lastUsed), 'MMM d, yyyy h:mm a')}</span>
                  )}
                </div>
              </div>

              <div className={styles.appKeySection}>
                <div className={styles.appKeyLabel}>API Key</div>
                <div className={styles.appKeyValue}>
                  <code>
                    {revealedKeys.has(apiKey.id) ? apiKey.key : maskKey(apiKey.key)}
                  </code>
                  <div className={styles.appKeyActions}>
                    <button 
                      onClick={() => toggleReveal(apiKey.id)}
                      title={revealedKeys.has(apiKey.id) ? 'Hide' : 'Reveal'}
                    >
                      {revealedKeys.has(apiKey.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button 
                      onClick={() => copyToClipboard(apiKey.key, apiKey.id)}
                      title="Copy"
                      style={copiedKey === apiKey.id ? { background: 'var(--apex-success)', color: 'white' } : {}}
                    >
                      {copiedKey === apiKey.id ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.appPermissions}>
                {apiKey.permissions.map(perm => (
                  <span key={perm} className={styles.permBadge}>{perm}</span>
                ))}
              </div>

              <div className={styles.appActions}>
                <button 
                  className={styles.deleteBtn}
                  onClick={() => handleDelete(apiKey.id, apiKey.name)}
                >
                  <Trash2 size={16} />
                  Revoke Key
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateAppModal 
          onClose={() => setShowCreateModal(false)}
          onCreate={async (data) => {
            try {
              await apiKeysApi.create(data)
              setShowCreateModal(false)
              fetchApiKeys()
            } catch (error) {
              alert('Failed to create API key')
            }
          }}
        />
      )}
    </div>
  )
}

function CreateAppModal({ onClose, onCreate }: { onClose: () => void; onCreate: (data: any) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    permissions: ['matters:read', 'clients:read']
  })
  const [creating, setCreating] = useState(false)

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    await onCreate(formData)
    setCreating(false)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Create New App</h2>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>App Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="e.g., Document Sync Integration"
              required
            />
            <span className={styles.hint}>A descriptive name to identify this app</span>
          </div>

          <div className={styles.formGroup}>
            <label>Permissions</label>
            <p style={{ fontSize: '0.8125rem', color: 'var(--apex-subtle)', marginBottom: '12px' }}>
              Select the minimum permissions your app needs
            </p>
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
            <button type="submit" className={styles.saveBtn} disabled={creating}>
              <Key size={16} />
              {creating ? 'Creating...' : 'Create App'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
