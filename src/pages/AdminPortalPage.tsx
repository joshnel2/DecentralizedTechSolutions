import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../services/api'
import { 
  Building2, Users, Plus, Edit, Trash2, Search, 
  BarChart3, FileText, Clock, X,
  Shield, Eye, EyeOff, ArrowLeft, Link2, Save, CheckCircle2, AlertCircle, FolderSync,
  Loader2, StopCircle, RotateCcw, Settings, History, RefreshCw
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './AdminPortalPage.module.css'
import { useToast } from '../components/Toast'

// API helper for secure admin with auth header
const getAdminAuth = () => {
  const stored = localStorage.getItem('secureAdminSession')
  return stored || ''
}

const fetchSecureAdmin = async (endpoint: string, options: RequestInit = {}) => {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
  const response = await fetch(`${baseUrl}/secure-admin${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Auth': getAdminAuth(),
      ...options.headers,
    },
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Request failed')
  }
  return response.json()
}

interface Firm {
  id: string
  name: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zipCode: string
  website: string
  userCount: number
  matterCount: number
  clientCount: number
  createdAt: string
}

interface User {
  id: string
  firmId: string
  firmName: string
  email: string
  firstName: string
  lastName: string
  role: string
  phone: string
  hourlyRate: number
  isActive: boolean
  createdAt: string
}

interface Stats {
  total_firms: number
  total_users: number
  active_users: number
  total_matters: number
  total_clients: number
  total_documents: number
  total_time_entries: number
}

export function AdminPortalPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<'overview' | 'firms' | 'users' | 'integrations'>('overview')
  const [firms, setFirms] = useState<Firm[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFirmId, setSelectedFirmId] = useState<string | null>(null)
  
  // Modal states
  const [showFirmModal, setShowFirmModal] = useState(false)
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingFirm, setEditingFirm] = useState<Firm | null>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  
  // Integration settings state
  const [integrationSettings, setIntegrationSettings] = useState<Record<string, any>>({})
  const [savingIntegrations, setSavingIntegrations] = useState(false)
  const [integrationMessage, setIntegrationMessage] = useState<{type: 'success' | 'error', text: string} | null>(null)
  
  // Document scan state
  const [scanningFirmId, setScanningFirmId] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<{firmId: string, message: string, success: boolean} | null>(null)
  const [showScanModal, setShowScanModal] = useState(false)
  const [scanProgress, setScanProgress] = useState<{
    status: string
    phase: string
    progress: { processed: number; matched: number; created: number; total: number; percent: number }
    results: any
    error: string | null
    startedAt: string
    completedAt?: string
    scanMode?: string
  } | null>(null)
  const scanPollRef = useRef<NodeJS.Timeout | null>(null)
  const [scanSettings, setScanSettings] = useState<{
    autoSyncEnabled: boolean
    syncInterval: number // minutes
    permissionMode: 'inherit' | 'matter' | 'strict'
  }>({
    autoSyncEnabled: false,
    syncInterval: 10,
    permissionMode: 'matter'
  })
  const [scanHistory, setScanHistory] = useState<Array<{
    id: string
    firmId: string
    status: string
    filesProcessed: number
    filesMatched: number
    filesCreated: number
    startedAt: string
    completedAt: string
    scanMode: string
  }>>([])
  const [showScanSettings, setShowScanSettings] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  // Poll scan status
  const pollScanStatus = useCallback(async (firmId: string) => {
    try {
      const status = await fetchSecureAdmin(`/firms/${firmId}/scan-status`)
      setScanProgress(status)
      
      // If scan is complete or errored, stop polling
      if (status.status === 'completed' || status.status === 'error' || status.status === 'cancelled') {
        if (scanPollRef.current) {
          clearInterval(scanPollRef.current)
          scanPollRef.current = null
        }
        setScanningFirmId(null)
        
        // Update scan result for message display
        setScanResult({
          firmId,
          message: status.status === 'completed' 
            ? `Scan completed: ${status.progress?.created || 0} files created, ${status.progress?.matched || 0} matched`
            : status.error || 'Scan failed',
          success: status.status === 'completed'
        })
        
        // Refresh firm data
        loadData()
      }
    } catch (err) {
      console.error('Failed to poll scan status:', err)
    }
  }, [])
  
  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (scanPollRef.current) {
        clearInterval(scanPollRef.current)
      }
    }
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Load data independently so one failure doesn't block others
      const [statsResult, firmsResult, usersResult] = await Promise.allSettled([
        adminApi.getStats(),
        adminApi.getFirms(),
        adminApi.getUsers()
      ])
      
      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value)
      }
      if (firmsResult.status === 'fulfilled') {
        setFirms(firmsResult.value.firms || [])
      }
      if (usersResult.status === 'fulfilled') {
        setUsers(usersResult.value.users || [])
      }
      
      // If all failed, show error
      if (statsResult.status === 'rejected' && firmsResult.status === 'rejected' && usersResult.status === 'rejected') {
        setError(firmsResult.reason?.message || 'Failed to load admin data. You may not have admin access.')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load admin data. You may not have admin access.')
    } finally {
      setLoading(false)
    }
  }

  const loadIntegrationSettings = async () => {
    try {
      const settings = await fetchSecureAdmin('/platform-settings')
      setIntegrationSettings(settings)
    } catch (err: any) {
      console.error('Failed to load integration settings:', err)
    }
  }

  const saveIntegrationSettings = async () => {
    setSavingIntegrations(true)
    setIntegrationMessage(null)
    try {
      // Extract just the values to save
      const toSave: Record<string, string> = {}
      Object.entries(integrationSettings).forEach(([key, val]: [string, any]) => {
        if (typeof val === 'object' && val.value !== undefined) {
          toSave[key] = val.value
        } else if (typeof val === 'string') {
          toSave[key] = val
        }
      })
      
      await fetchSecureAdmin('/platform-settings', {
        method: 'PUT',
        body: JSON.stringify(toSave),
      })
      setIntegrationMessage({ type: 'success', text: 'Integration settings saved successfully!' })
      loadIntegrationSettings()
    } catch (err: any) {
      setIntegrationMessage({ type: 'error', text: err.message || 'Failed to save settings' })
    } finally {
      setSavingIntegrations(false)
    }
  }

  const updateIntegrationSetting = (key: string, value: string) => {
    setIntegrationSettings(prev => ({
      ...prev,
      [key]: { ...prev[key], value }
    }))
  }

  const filteredFirms = firms.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.email?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFirm = !selectedFirmId || u.firmId === selectedFirmId
    return matchesSearch && matchesFirm
  })

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Loading admin portal...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.error}>
        <Shield size={48} />
        <h2>Access Denied</h2>
        <p>{error}</p>
      </div>
    )
  }

  return (
    <div className={styles.adminPage}>
      <button className={styles.backButton} onClick={() => navigate('/app/settings')}>
        <ArrowLeft size={16} />
        Back to Settings
      </button>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Shield size={28} />
          <div>
            <h1>Admin Portal</h1>
            <p>Manage firms and users across the platform</p>
          </div>
        </div>
      </div>

      <div className={styles.tabs}>
        <button 
          className={clsx(styles.tab, activeTab === 'overview' && styles.active)}
          onClick={() => setActiveTab('overview')}
        >
          <BarChart3 size={18} />
          Overview
        </button>
        <button 
          className={clsx(styles.tab, activeTab === 'firms' && styles.active)}
          onClick={() => setActiveTab('firms')}
        >
          <Building2 size={18} />
          Firms ({firms.length})
        </button>
        <button 
          className={clsx(styles.tab, activeTab === 'users' && styles.active)}
          onClick={() => setActiveTab('users')}
        >
          <Users size={18} />
          Users ({users.length})
        </button>
        <button 
          className={clsx(styles.tab, activeTab === 'integrations' && styles.active)}
          onClick={() => { setActiveTab('integrations'); loadIntegrationSettings(); }}
        >
          <Link2 size={18} />
          Integrations
        </button>
      </div>

      {activeTab === 'overview' && stats && (
        <div className={styles.overview}>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <Building2 size={24} />
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{stats.total_firms}</span>
                <span className={styles.statLabel}>Total Firms</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <Users size={24} />
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{stats.total_users}</span>
                <span className={styles.statLabel}>Total Users</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <Users size={24} />
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{stats.active_users}</span>
                <span className={styles.statLabel}>Active Users</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <FileText size={24} />
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{stats.total_matters}</span>
                <span className={styles.statLabel}>Total Matters</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <Users size={24} />
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{stats.total_clients}</span>
                <span className={styles.statLabel}>Total Clients</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <FileText size={24} />
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{stats.total_documents}</span>
                <span className={styles.statLabel}>Documents</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <Clock size={24} />
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{stats.total_time_entries}</span>
                <span className={styles.statLabel}>Time Entries</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'firms' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.searchBox}>
              <Search size={18} />
              <input
                type="text"
                placeholder="Search firms..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className={styles.addBtn} onClick={() => { setEditingFirm(null); setShowFirmModal(true) }}>
              <Plus size={18} />
              Add Firm
            </button>
          </div>

          <div className={styles.table}>
            <table>
              <thead>
                <tr>
                  <th>Firm Name</th>
                  <th>Contact</th>
                  <th>Users</th>
                  <th>Matters</th>
                  <th>Clients</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFirms.map(firm => (
                  <tr key={firm.id}>
                    <td>
                      <div className={styles.firmName}>
                        <Building2 size={16} />
                        <span>{firm.name}</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.contact}>
                        {firm.email && <span>{firm.email}</span>}
                        {firm.phone && <span>{firm.phone}</span>}
                      </div>
                    </td>
                    <td>{firm.userCount}</td>
                    <td>{firm.matterCount}</td>
                    <td>{firm.clientCount}</td>
                    <td>{format(parseISO(firm.createdAt), 'MMM d, yyyy')}</td>
                    <td>
                      <div className={styles.actions}>
                        <button onClick={() => { setEditingFirm(firm); setShowFirmModal(true) }} title="Edit">
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={() => { setSelectedFirmId(firm.id); setActiveTab('users') }} 
                          title="View Users"
                        >
                          <Users size={16} />
                        </button>
                        <button 
                          onClick={() => handleScanDocuments(firm.id)}
                          disabled={scanningFirmId === firm.id}
                          title="Scan Documents & Set Permissions"
                          style={{ color: scanningFirmId === firm.id ? '#888' : '#10B981' }}
                        >
                          {scanningFirmId === firm.id ? <Loader2 size={16} className={styles.spinnerSmall} /> : <FolderSync size={16} />}
                        </button>
                        <button 
                          onClick={() => openScanSettings(firm.id)}
                          title="Scan Settings & History"
                          style={{ color: '#6366F1' }}
                        >
                          <Settings size={16} />
                        </button>
                        <button 
                          className={styles.deleteBtn}
                          onClick={() => handleDeleteFirm(firm.id)}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Scan Result Message */}
          {scanResult && (
            <div style={{
              marginTop: '16px',
              padding: '12px 16px',
              borderRadius: '8px',
              background: scanResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${scanResult.success ? '#10B981' : '#EF4444'}`,
              color: scanResult.success ? '#10B981' : '#EF4444'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {scanResult.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <span>{scanResult.message}</span>
                <button 
                  onClick={() => setScanResult(null)}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'users' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.searchBox}>
              <Search size={18} />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select 
              value={selectedFirmId || ''} 
              onChange={(e) => setSelectedFirmId(e.target.value || null)}
              className={styles.firmFilter}
            >
              <option value="">All Firms</option>
              {firms.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <button className={styles.addBtn} onClick={() => { setEditingUser(null); setShowUserModal(true) }}>
              <Plus size={18} />
              Add User
            </button>
          </div>

          <div className={styles.table}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Firm</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id}>
                    <td>{user.firstName} {user.lastName}</td>
                    <td>{user.email}</td>
                    <td>{user.firmName}</td>
                    <td>
                      <span className={clsx(styles.roleBadge, styles[user.role])}>
                        {user.role}
                      </span>
                    </td>
                    <td>
                      <span className={clsx(styles.statusBadge, user.isActive ? styles.active : styles.inactive)}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{format(parseISO(user.createdAt), 'MMM d, yyyy')}</td>
                    <td>
                      <div className={styles.actions}>
                        <button onClick={() => { setEditingUser(user); setShowUserModal(true) }} title="Edit">
                          <Edit size={16} />
                        </button>
                        <button 
                          className={styles.deleteBtn}
                          onClick={() => handleDeleteUser(user.id)}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'integrations' && (
        <div className={styles.section}>
          <div className={styles.integrationsHeader}>
            <h2>Integration Credentials</h2>
            <p>Configure OAuth credentials for Outlook, QuickBooks, and Google integrations. Users will be able to connect their accounts once these are set up.</p>
          </div>

          {integrationMessage && (
            <div className={`${styles.integrationMessage} ${styles[integrationMessage.type]}`}>
              {integrationMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              {integrationMessage.text}
            </div>
          )}

          {/* Microsoft/Outlook */}
          <div className={styles.integrationCard}>
            <div className={styles.integrationCardHeader}>
              <span className={styles.integrationIcon}>📧</span>
              <div>
                <h3>Microsoft Outlook</h3>
                <p>Email and Calendar integration. <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer">Register app in Azure Portal →</a></p>
              </div>
            </div>
            <div className={styles.integrationFields}>
              <div className={styles.formGroup}>
                <label>Client ID</label>
                <input
                  type="text"
                  value={integrationSettings.microsoft_client_id?.value || ''}
                  onChange={(e) => updateIntegrationSetting('microsoft_client_id', e.target.value)}
                  placeholder="Enter Microsoft Client ID"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Client Secret</label>
                <input
                  type="password"
                  value={integrationSettings.microsoft_client_secret?.value || ''}
                  onChange={(e) => updateIntegrationSetting('microsoft_client_secret', e.target.value)}
                  placeholder={integrationSettings.microsoft_client_secret?.isConfigured ? '••••••••' : 'Enter Client Secret'}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Redirect URI</label>
                <input
                  type="text"
                  value={integrationSettings.microsoft_redirect_uri?.value || ''}
                  onChange={(e) => updateIntegrationSetting('microsoft_redirect_uri', e.target.value)}
                  placeholder="https://your-api.com/api/integrations/outlook/callback"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Tenant</label>
                <input
                  type="text"
                  value={integrationSettings.microsoft_tenant?.value || 'common'}
                  onChange={(e) => updateIntegrationSetting('microsoft_tenant', e.target.value)}
                  placeholder="common"
                />
              </div>
            </div>
          </div>

          {/* QuickBooks */}
          <div className={styles.integrationCard}>
            <div className={styles.integrationCardHeader}>
              <span className={styles.integrationIcon}>📊</span>
              <div>
                <h3>QuickBooks Online</h3>
                <p>Accounting and invoicing. <a href="https://developer.intuit.com/app/developer/dashboard" target="_blank" rel="noopener noreferrer">Register app in Intuit Developer →</a></p>
              </div>
            </div>
            <div className={styles.integrationFields}>
              <div className={styles.formGroup}>
                <label>Client ID</label>
                <input
                  type="text"
                  value={integrationSettings.quickbooks_client_id?.value || ''}
                  onChange={(e) => updateIntegrationSetting('quickbooks_client_id', e.target.value)}
                  placeholder="Enter QuickBooks Client ID"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Client Secret</label>
                <input
                  type="password"
                  value={integrationSettings.quickbooks_client_secret?.value || ''}
                  onChange={(e) => updateIntegrationSetting('quickbooks_client_secret', e.target.value)}
                  placeholder={integrationSettings.quickbooks_client_secret?.isConfigured ? '••••••••' : 'Enter Client Secret'}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Redirect URI</label>
                <input
                  type="text"
                  value={integrationSettings.quickbooks_redirect_uri?.value || ''}
                  onChange={(e) => updateIntegrationSetting('quickbooks_redirect_uri', e.target.value)}
                  placeholder="https://your-api.com/api/integrations/quickbooks/callback"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Environment</label>
                <select
                  value={integrationSettings.quickbooks_environment?.value || 'sandbox'}
                  onChange={(e) => updateIntegrationSetting('quickbooks_environment', e.target.value)}
                >
                  <option value="sandbox">Sandbox (Testing)</option>
                  <option value="production">Production</option>
                </select>
              </div>
            </div>
          </div>

          {/* Google */}
          <div className={styles.integrationCard}>
            <div className={styles.integrationCardHeader}>
              <span className={styles.integrationIcon}>📅</span>
              <div>
                <h3>Google Calendar & Drive</h3>
                <p>Calendar sync and file storage. <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Create credentials in Google Cloud →</a></p>
              </div>
            </div>
            <div className={styles.integrationFields}>
              <div className={styles.formGroup}>
                <label>Client ID</label>
                <input
                  type="text"
                  value={integrationSettings.google_client_id?.value || ''}
                  onChange={(e) => updateIntegrationSetting('google_client_id', e.target.value)}
                  placeholder="Enter Google Client ID"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Client Secret</label>
                <input
                  type="password"
                  value={integrationSettings.google_client_secret?.value || ''}
                  onChange={(e) => updateIntegrationSetting('google_client_secret', e.target.value)}
                  placeholder={integrationSettings.google_client_secret?.isConfigured ? '••••••••' : 'Enter Client Secret'}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Redirect URI</label>
                <input
                  type="text"
                  value={integrationSettings.google_redirect_uri?.value || ''}
                  onChange={(e) => updateIntegrationSetting('google_redirect_uri', e.target.value)}
                  placeholder="https://your-api.com/api/integrations/google/callback"
                />
              </div>
            </div>
          </div>

          {/* Dropbox */}
          <div className={styles.integrationCard}>
            <div className={styles.integrationCardHeader}>
              <span className={styles.integrationIcon}>📦</span>
              <div>
                <h3>Dropbox</h3>
                <p>Cloud file storage. <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noopener noreferrer">Create app in Dropbox App Console →</a></p>
              </div>
            </div>
            <div className={styles.integrationFields}>
              <div className={styles.formGroup}>
                <label>Client ID (App Key)</label>
                <input
                  type="text"
                  value={integrationSettings.dropbox_client_id?.value || ''}
                  onChange={(e) => updateIntegrationSetting('dropbox_client_id', e.target.value)}
                  placeholder="Enter Dropbox App Key"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Client Secret (App Secret)</label>
                <input
                  type="password"
                  value={integrationSettings.dropbox_client_secret?.value || ''}
                  onChange={(e) => updateIntegrationSetting('dropbox_client_secret', e.target.value)}
                  placeholder={integrationSettings.dropbox_client_secret?.isConfigured ? '••••••••' : 'Enter App Secret'}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Redirect URI</label>
                <input
                  type="text"
                  value={integrationSettings.dropbox_redirect_uri?.value || ''}
                  onChange={(e) => updateIntegrationSetting('dropbox_redirect_uri', e.target.value)}
                  placeholder="https://your-api.com/api/integrations/dropbox/callback"
                />
              </div>
            </div>
          </div>

          {/* DocuSign */}
          <div className={styles.integrationCard}>
            <div className={styles.integrationCardHeader}>
              <span className={styles.integrationIcon}>✍️</span>
              <div>
                <h3>DocuSign</h3>
                <p>E-signatures and document signing. <a href="https://admindemo.docusign.com/apps-and-keys" target="_blank" rel="noopener noreferrer">Get keys from DocuSign Admin →</a></p>
              </div>
            </div>
            <div className={styles.integrationFields}>
              <div className={styles.formGroup}>
                <label>Integration Key (Client ID)</label>
                <input
                  type="text"
                  value={integrationSettings.docusign_client_id?.value || ''}
                  onChange={(e) => updateIntegrationSetting('docusign_client_id', e.target.value)}
                  placeholder="Enter DocuSign Integration Key"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Secret Key</label>
                <input
                  type="password"
                  value={integrationSettings.docusign_client_secret?.value || ''}
                  onChange={(e) => updateIntegrationSetting('docusign_client_secret', e.target.value)}
                  placeholder={integrationSettings.docusign_client_secret?.isConfigured ? '••••••••' : 'Enter Secret Key'}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Redirect URI</label>
                <input
                  type="text"
                  value={integrationSettings.docusign_redirect_uri?.value || ''}
                  onChange={(e) => updateIntegrationSetting('docusign_redirect_uri', e.target.value)}
                  placeholder="https://your-api.com/api/integrations/docusign/callback"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Environment</label>
                <select
                  value={integrationSettings.docusign_environment?.value || 'demo'}
                  onChange={(e) => updateIntegrationSetting('docusign_environment', e.target.value)}
                >
                  <option value="demo">Demo (Testing)</option>
                  <option value="production">Production</option>
                </select>
              </div>
            </div>
          </div>

          {/* Slack */}
          <div className={styles.integrationCard}>
            <div className={styles.integrationCardHeader}>
              <span className={styles.integrationIcon}>💬</span>
              <div>
                <h3>Slack</h3>
                <p>Team notifications and messaging. <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer">Create app in Slack API →</a></p>
              </div>
            </div>
            <div className={styles.integrationFields}>
              <div className={styles.formGroup}>
                <label>Client ID</label>
                <input
                  type="text"
                  value={integrationSettings.slack_client_id?.value || ''}
                  onChange={(e) => updateIntegrationSetting('slack_client_id', e.target.value)}
                  placeholder="Enter Slack Client ID"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Client Secret</label>
                <input
                  type="password"
                  value={integrationSettings.slack_client_secret?.value || ''}
                  onChange={(e) => updateIntegrationSetting('slack_client_secret', e.target.value)}
                  placeholder={integrationSettings.slack_client_secret?.isConfigured ? '••••••••' : 'Enter Client Secret'}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Redirect URI</label>
                <input
                  type="text"
                  value={integrationSettings.slack_redirect_uri?.value || ''}
                  onChange={(e) => updateIntegrationSetting('slack_redirect_uri', e.target.value)}
                  placeholder="https://your-api.com/api/integrations/slack/callback"
                />
              </div>
            </div>
          </div>

          {/* Zoom */}
          <div className={styles.integrationCard}>
            <div className={styles.integrationCardHeader}>
              <span className={styles.integrationIcon}>📹</span>
              <div>
                <h3>Zoom</h3>
                <p>Video meetings. <a href="https://marketplace.zoom.us/develop/create" target="_blank" rel="noopener noreferrer">Create app in Zoom Marketplace →</a></p>
              </div>
            </div>
            <div className={styles.integrationFields}>
              <div className={styles.formGroup}>
                <label>Client ID</label>
                <input
                  type="text"
                  value={integrationSettings.zoom_client_id?.value || ''}
                  onChange={(e) => updateIntegrationSetting('zoom_client_id', e.target.value)}
                  placeholder="Enter Zoom Client ID"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Client Secret</label>
                <input
                  type="password"
                  value={integrationSettings.zoom_client_secret?.value || ''}
                  onChange={(e) => updateIntegrationSetting('zoom_client_secret', e.target.value)}
                  placeholder={integrationSettings.zoom_client_secret?.isConfigured ? '••••••••' : 'Enter Client Secret'}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Redirect URI</label>
                <input
                  type="text"
                  value={integrationSettings.zoom_redirect_uri?.value || ''}
                  onChange={(e) => updateIntegrationSetting('zoom_redirect_uri', e.target.value)}
                  placeholder="https://your-api.com/api/integrations/zoom/callback"
                />
              </div>
            </div>
          </div>

          {/* Quicken */}
          <div className={styles.integrationCard}>
            <div className={styles.integrationCardHeader}>
              <span className={styles.integrationIcon}>💰</span>
              <div>
                <h3>Quicken</h3>
                <p>Personal finance and accounting. <a href="https://developer.intuit.com/" target="_blank" rel="noopener noreferrer">Register via Intuit Developer →</a></p>
              </div>
            </div>
            <div className={styles.integrationFields}>
              <div className={styles.formGroup}>
                <label>Client ID</label>
                <input
                  type="text"
                  value={integrationSettings.quicken_client_id?.value || ''}
                  onChange={(e) => updateIntegrationSetting('quicken_client_id', e.target.value)}
                  placeholder="Enter Quicken Client ID"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Client Secret</label>
                <input
                  type="password"
                  value={integrationSettings.quicken_client_secret?.value || ''}
                  onChange={(e) => updateIntegrationSetting('quicken_client_secret', e.target.value)}
                  placeholder={integrationSettings.quicken_client_secret?.isConfigured ? '••••••••' : 'Enter Client Secret'}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Redirect URI</label>
                <input
                  type="text"
                  value={integrationSettings.quicken_redirect_uri?.value || ''}
                  onChange={(e) => updateIntegrationSetting('quicken_redirect_uri', e.target.value)}
                  placeholder="https://your-api.com/api/integrations/quicken/callback"
                />
              </div>
            </div>
          </div>

          <div className={styles.integrationActions}>
            <button 
              className={styles.saveBtn} 
              onClick={saveIntegrationSettings}
              disabled={savingIntegrations}
            >
              <Save size={18} />
              {savingIntegrations ? 'Saving...' : 'Save All Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Firm Modal */}
      {showFirmModal && (
        <FirmModal
          firm={editingFirm}
          onClose={() => setShowFirmModal(false)}
          onSave={async (data) => {
            if (editingFirm) {
              await adminApi.updateFirm(editingFirm.id, data)
            } else {
              await adminApi.createFirm(data)
            }
            loadData()
            setShowFirmModal(false)
          }}
        />
      )}

      {/* User Modal */}
      {showUserModal && (
        <UserModal
          user={editingUser}
          firms={firms}
          onClose={() => setShowUserModal(false)}
          onSave={async (data) => {
            if (editingUser) {
              await adminApi.updateUser(editingUser.id, data)
            } else {
              await adminApi.createUser(data)
            }
            loadData()
            setShowUserModal(false)
          }}
        />
      )}
      
      {/* Scan Progress Modal */}
      {showScanModal && scanningFirmId && (
        <div className={styles.modalOverlay} onClick={() => {
          if (scanProgress?.status !== 'running') {
            setShowScanModal(false)
          }
        }}>
          <div className={styles.scanModal} onClick={e => e.stopPropagation()}>
            <div className={styles.scanModalHeader}>
              <h3>
                <FolderSync size={20} />
                Document Scan
                {scanProgress?.scanMode && (
                  <span className={styles.scanModeBadge}>
                    {scanProgress.scanMode === 'manifest' ? 'API Migration' : 'Folder Scan'}
                  </span>
                )}
              </h3>
              {scanProgress?.status !== 'running' && (
                <button className={styles.modalClose} onClick={() => setShowScanModal(false)}>
                  <X size={18} />
                </button>
              )}
            </div>
            
            <div className={styles.scanModalBody}>
              {/* Progress Phase */}
              <div className={styles.scanPhase}>
                <span className={styles.phaseLabel}>Status:</span>
                <span className={clsx(styles.phaseValue, {
                  [styles.phaseRunning]: scanProgress?.status === 'running',
                  [styles.phaseCompleted]: scanProgress?.status === 'completed',
                  [styles.phaseError]: scanProgress?.status === 'error',
                  [styles.phaseCancelled]: scanProgress?.status === 'cancelled',
                })}>
                  {scanProgress?.status === 'running' && (
                    <Loader2 size={14} className={styles.spinnerSmall} />
                  )}
                  {scanProgress?.status === 'completed' && <CheckCircle2 size={14} />}
                  {scanProgress?.status === 'error' && <AlertCircle size={14} />}
                  {formatPhase(scanProgress?.phase || scanProgress?.status || 'initializing')}
                </span>
              </div>
              
              {/* Progress Bar */}
              <div className={styles.progressContainer}>
                <div className={styles.progressBar}>
                  <div 
                    className={styles.progressFill}
                    style={{ width: `${scanProgress?.progress?.percent || 0}%` }}
                  />
                </div>
                <span className={styles.progressPercent}>
                  {Math.round(scanProgress?.progress?.percent || 0)}%
                </span>
              </div>
              
              {/* Stats Grid */}
              <div className={styles.scanStats}>
                <div className={styles.scanStat}>
                  <span className={styles.statLabel}>Files Processed</span>
                  <span className={styles.statValue}>{scanProgress?.progress?.processed || 0}</span>
                </div>
                <div className={styles.scanStat}>
                  <span className={styles.statLabel}>Matched to Matters</span>
                  <span className={styles.statValue}>{scanProgress?.progress?.matched || 0}</span>
                </div>
                <div className={styles.scanStat}>
                  <span className={styles.statLabel}>Records Created</span>
                  <span className={styles.statValue}>{scanProgress?.progress?.created || 0}</span>
                </div>
                <div className={styles.scanStat}>
                  <span className={styles.statLabel}>Total Found</span>
                  <span className={styles.statValue}>{scanProgress?.progress?.total || 0}</span>
                </div>
              </div>
              
              {/* Error Message */}
              {scanProgress?.error && (
                <div className={styles.scanError}>
                  <AlertCircle size={16} />
                  {scanProgress.error}
                </div>
              )}
              
              {/* Timing */}
              <div className={styles.scanTiming}>
                <span>Started: {scanProgress?.startedAt ? format(parseISO(scanProgress.startedAt), 'h:mm:ss a') : '-'}</span>
                {scanProgress?.completedAt && (
                  <span>Completed: {format(parseISO(scanProgress.completedAt), 'h:mm:ss a')}</span>
                )}
              </div>
            </div>
            
            <div className={styles.scanModalFooter}>
              {scanProgress?.status === 'running' && (
                <button 
                  className={styles.cancelScanBtn}
                  onClick={() => handleCancelScan(scanningFirmId)}
                >
                  <StopCircle size={16} />
                  Cancel Scan
                </button>
              )}
              {(scanProgress?.status === 'error' || scanProgress?.status === 'cancelled') && (
                <button 
                  className={styles.resetScanBtn}
                  onClick={() => handleResetScan(scanningFirmId)}
                >
                  <RotateCcw size={16} />
                  Reset & Try Again
                </button>
              )}
              {scanProgress?.status === 'completed' && (
                <button 
                  className={styles.closeScanBtn}
                  onClick={() => setShowScanModal(false)}
                >
                  <CheckCircle2 size={16} />
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Scan Settings & History Modal */}
      {showScanSettings && selectedFirmId && (
        <div className={styles.modalOverlay} onClick={() => setShowScanSettings(false)}>
          <div className={styles.settingsModal} onClick={e => e.stopPropagation()}>
            <div className={styles.scanModalHeader}>
              <h3>
                <Settings size={20} />
                Scan Settings & History
              </h3>
              <button className={styles.modalClose} onClick={() => setShowScanSettings(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className={styles.settingsContent}>
              {/* Settings Section */}
              <div className={styles.settingsSection}>
                <h4>Auto-Sync Settings</h4>
                
                <div className={styles.settingRow}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={scanSettings.autoSyncEnabled}
                      onChange={(e) => setScanSettings(prev => ({ ...prev, autoSyncEnabled: e.target.checked }))}
                    />
                    <span>Enable automatic sync</span>
                  </label>
                </div>
                
                <div className={styles.settingRow}>
                  <label>Sync Interval</label>
                  <select
                    value={scanSettings.syncInterval}
                    onChange={(e) => setScanSettings(prev => ({ ...prev, syncInterval: parseInt(e.target.value) }))}
                    disabled={!scanSettings.autoSyncEnabled}
                  >
                    <option value={5}>Every 5 minutes</option>
                    <option value={10}>Every 10 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                    <option value={60}>Every hour</option>
                    <option value={360}>Every 6 hours</option>
                    <option value={1440}>Daily</option>
                  </select>
                </div>
              </div>
              
              <div className={styles.settingsSection}>
                <h4>Permission Settings</h4>
                
                <div className={styles.settingRow}>
                  <label>Permission Mode</label>
                  <select
                    value={scanSettings.permissionMode}
                    onChange={(e) => setScanSettings(prev => ({ ...prev, permissionMode: e.target.value as any }))}
                  >
                    <option value="inherit">Inherit from folder</option>
                    <option value="matter">Based on matter assignments</option>
                    <option value="strict">Strict - owner only</option>
                  </select>
                </div>
                
                <p className={styles.settingHint}>
                  {scanSettings.permissionMode === 'inherit' && 'Documents inherit permissions from their parent folder.'}
                  {scanSettings.permissionMode === 'matter' && 'Documents are accessible by users assigned to the matter.'}
                  {scanSettings.permissionMode === 'strict' && 'Only the document owner and admins can access.'}
                </p>
              </div>
              
              {/* History Section */}
              <div className={styles.historySection}>
                <div className={styles.historyHeader}>
                  <h4>
                    <History size={16} />
                    Scan History
                  </h4>
                  <button 
                    className={styles.refreshHistoryBtn}
                    onClick={() => openScanSettings(selectedFirmId)}
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
                
                {scanHistory.length === 0 ? (
                  <p className={styles.noHistory}>No scan history available</p>
                ) : (
                  <div className={styles.historyTable}>
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Status</th>
                          <th>Mode</th>
                          <th>Processed</th>
                          <th>Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scanHistory.map(h => (
                          <tr key={h.id}>
                            <td>{format(parseISO(h.startedAt), 'MMM d, h:mm a')}</td>
                            <td>
                              <span className={clsx(styles.historyStatus, {
                                [styles.statusCompleted]: h.status === 'completed',
                                [styles.statusError]: h.status === 'error',
                                [styles.statusCancelled]: h.status === 'cancelled'
                              })}>
                                {h.status}
                              </span>
                            </td>
                            <td>{h.scanMode}</td>
                            <td>{h.filesProcessed}</td>
                            <td>{h.filesCreated}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            
            <div className={styles.scanModalFooter}>
              <button className={styles.cancelScanBtn} onClick={() => setShowScanSettings(false)}>
                Cancel
              </button>
              <button className={styles.closeScanBtn} onClick={saveScanSettings}>
                <Save size={14} />
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
  
  function formatPhase(phase: string): string {
    const phases: Record<string, string> = {
      'initializing': 'Initializing...',
      'starting': 'Starting scan...',
      'checking_azure': 'Checking Azure connection...',
      'checking_manifest': 'Checking for manifest data...',
      'loading_matters': 'Loading matters...',
      'scanning_azure': 'Scanning Azure files...',
      'processing_manifest': 'Processing manifest...',
      'processing_files': 'Processing files...',
      'creating_records': 'Creating database records...',
      'setting_permissions': 'Setting permissions...',
      'completed': 'Completed',
      'error': 'Error',
      'cancelled': 'Cancelled',
      'running': 'Running...',
      'idle': 'Idle'
    }
    return phases[phase] || phase.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  async function handleDeleteFirm(id: string) {
    if (!confirm('Are you sure you want to delete this firm? This will delete all users, matters, clients, and data associated with this firm.')) {
      return
    }
    try {
      await adminApi.deleteFirm(id)
      loadData()
    } catch (err: any) {
      toast.error('Failed to delete firm', err.message)
    }
  }

  async function handleScanDocuments(firmId: string) {
    setScanningFirmId(firmId)
    setScanResult(null)
    setShowScanModal(true)
    setScanProgress({
      status: 'starting',
      phase: 'initializing',
      progress: { processed: 0, matched: 0, created: 0, total: 0, percent: 0 },
      results: null,
      error: null,
      startedAt: new Date().toISOString()
    })
    
    try {
      const result = await fetchSecureAdmin(`/firms/${firmId}/scan-documents`, {
        method: 'POST',
        body: JSON.stringify({
          dryRun: false,
          mode: 'auto'
        })
      })
      
      // Start polling for progress
      if (result.status === 'started' || result.status === 'already_running') {
        // Poll every second
        scanPollRef.current = setInterval(() => pollScanStatus(firmId), 1000)
        // Also poll immediately
        pollScanStatus(firmId)
      }
    } catch (err: any) {
      setScanProgress(prev => prev ? {
        ...prev,
        status: 'error',
        error: err.message || 'Failed to start scan'
      } : null)
      setScanResult({ firmId, message: err.message || 'Scan failed', success: false })
      setScanningFirmId(null)
    }
  }
  
  async function handleCancelScan(firmId: string) {
    try {
      await fetchSecureAdmin(`/firms/${firmId}/scan-cancel`, { method: 'POST' })
      // Poll will pick up the cancellation
    } catch (err: any) {
      console.error('Failed to cancel scan:', err)
    }
  }
  
  async function handleResetScan(firmId: string) {
    try {
      await fetchSecureAdmin(`/firms/${firmId}/scan-reset`, { method: 'POST' })
      setScanProgress(null)
      setScanningFirmId(null)
      setShowScanModal(false)
    } catch (err: any) {
      console.error('Failed to reset scan:', err)
    }
  }
  
  async function openScanSettings(firmId: string) {
    setSelectedFirmId(firmId)
    setShowScanSettings(true)
    
    // Load settings and history
    try {
      const [settings, historyRes] = await Promise.all([
        fetchSecureAdmin(`/firms/${firmId}/scan-settings`),
        fetchSecureAdmin(`/firms/${firmId}/scan-history?limit=10`)
      ])
      
      setScanSettings({
        autoSyncEnabled: settings.autoSyncEnabled,
        syncInterval: settings.syncIntervalMinutes,
        permissionMode: settings.permissionMode
      })
      
      setScanHistory(historyRes.history || [])
    } catch (err) {
      console.error('Failed to load scan settings:', err)
    }
  }
  
  async function saveScanSettings() {
    if (!selectedFirmId) return
    
    try {
      await fetchSecureAdmin(`/firms/${selectedFirmId}/scan-settings`, {
        method: 'PUT',
        body: JSON.stringify({
          autoSyncEnabled: scanSettings.autoSyncEnabled,
          syncIntervalMinutes: scanSettings.syncInterval,
          permissionMode: scanSettings.permissionMode
        })
      })
      
      setShowScanSettings(false)
    } catch (err: any) {
      console.error('Failed to save scan settings:', err)
      toast.info('Failed to save settings: ' + err.message)
    }
  }

  async function handleDeleteUser(id: string) {
    if (!confirm('Are you sure you want to delete this user?')) {
      return
    }
    try {
      await adminApi.deleteUser(id)
      loadData()
    } catch (err: any) {
      toast.error('Failed to delete user', err.message)
    }
  }
}

// Firm Modal Component
function FirmModal({ firm, onClose, onSave }: { 
  firm: Firm | null
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const toast = useToast()
  const [formData, setFormData] = useState({
    name: firm?.name || '',
    email: firm?.email || '',
    phone: firm?.phone || '',
    address: firm?.address || '',
    city: firm?.city || '',
    state: firm?.state || '',
    zipCode: firm?.zipCode || '',
    website: firm?.website || ''
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(formData)
    } catch (err: any) {
      toast.error('Failed to save firm', err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{firm ? 'Edit Firm' : 'Add New Firm'}</h2>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>Firm Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Phone</label>
              <input
                type="text"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Website</label>
              <input
                type="text"
                value={formData.website}
                onChange={e => setFormData({ ...formData, website: e.target.value })}
              />
            </div>
            <div className={styles.formGroup + ' ' + styles.fullWidth}>
              <label>Address</label>
              <input
                type="text"
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label>City</label>
              <input
                type="text"
                value={formData.city}
                onChange={e => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label>State</label>
              <input
                type="text"
                value={formData.state}
                onChange={e => setFormData({ ...formData, state: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label>ZIP Code</label>
              <input
                type="text"
                value={formData.zipCode}
                onChange={e => setFormData({ ...formData, zipCode: e.target.value })}
              />
            </div>
          </div>
          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving...' : (firm ? 'Update Firm' : 'Create Firm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// User Modal Component
function UserModal({ user, firms, onClose, onSave }: { 
  user: User | null
  firms: Firm[]
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const toast = useToast()
  const [formData, setFormData] = useState({
    firmId: user?.firmId || '',
    email: user?.email || '',
    password: '',
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    role: user?.role || 'staff',
    phone: user?.phone || '',
    hourlyRate: user?.hourlyRate?.toString() || '',
    isActive: user?.isActive ?? true
  })
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const data: any = { ...formData }
      if (data.hourlyRate) data.hourlyRate = parseFloat(data.hourlyRate)
      if (!data.password) delete data.password
      await onSave(data)
    } catch (err: any) {
      toast.error('Failed to save user', err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{user ? 'Edit User' : 'Add New User'}</h2>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup + ' ' + styles.fullWidth}>
              <label>Firm *</label>
              <select
                value={formData.firmId}
                onChange={e => setFormData({ ...formData, firmId: e.target.value })}
                required
                disabled={!!user}
              >
                <option value="">Select a firm</option>
                {firms.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
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
            <div className={styles.formGroup}>
              <label>Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>{user ? 'New Password (leave blank to keep)' : 'Password *'}</label>
              <div className={styles.passwordInput}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  required={!user}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className={styles.formGroup}>
              <label>Role</label>
              <select
                value={formData.role}
                onChange={e => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="attorney">Attorney</option>
                <option value="paralegal">Paralegal</option>
                <option value="staff">Staff</option>
                <option value="billing">Billing</option>
                <option value="readonly">Read Only</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Phone</label>
              <input
                type="text"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Hourly Rate</label>
              <input
                type="number"
                step="0.01"
                value={formData.hourlyRate}
                onChange={e => setFormData({ ...formData, hourlyRate: e.target.value })}
              />
            </div>
            {user && (
              <div className={styles.formGroup}>
                <label>Status</label>
                <select
                  value={formData.isActive ? 'active' : 'inactive'}
                  onChange={e => setFormData({ ...formData, isActive: e.target.value === 'active' })}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            )}
          </div>
          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving...' : (user ? 'Update User' : 'Create User')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
