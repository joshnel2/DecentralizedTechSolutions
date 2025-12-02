import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Shield, LogOut, Building2, Users, Plus, Edit2, Trash2, 
  Search, AlertTriangle, CheckCircle, Clock, Activity,
  Lock, Eye, EyeOff, RefreshCw, Download, Upload, FileJson,
  ChevronRight, XCircle, CheckCircle2, Info
} from 'lucide-react'
import styles from './SecureAdminDashboard.module.css'

interface Firm {
  id: string
  name: string
  domain: string
  status: 'active' | 'suspended' | 'pending'
  users_count: number
  created_at: string
  subscription_tier: string
}

interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  role: string
  firm_id: string
  firm_name?: string
  status: 'active' | 'inactive' | 'pending'
  created_at: string
  last_login?: string
}

interface AuditLog {
  id: string
  action: string
  user: string
  timestamp: string
  details: string
  ip_address: string
}

interface MigrationValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
  summary: {
    firm: string | null
    users: number
    contacts: number
    matters: number
    activities: number
    calendar_entries: number
  }
}

interface MigrationResult {
  success: boolean
  firm_id: string | null
  firm_name: string | null
  imported: {
    users: number
    contacts: number
    matters: number
    time_entries: number
    expenses: number
    calendar_entries: number
  }
  errors: string[]
  warnings: string[]
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export default function SecureAdminDashboard() {
  const [activeTab, setActiveTab] = useState<'firms' | 'users' | 'audit' | 'migration'>('firms')
  const [firms, setFirms] = useState<Firm[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [showFirmModal, setShowFirmModal] = useState(false)
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingFirm, setEditingFirm] = useState<Firm | null>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [sessionTimeout, setSessionTimeout] = useState(1800) // 30 minutes in seconds
  const [stats, setStats] = useState({ firms: 0, users: 0, activeUsers: 0 })
  const navigate = useNavigate()

  // Migration state
  const [migrationData, setMigrationData] = useState<string>('')
  const [migrationStep, setMigrationStep] = useState<'input' | 'validate' | 'import' | 'complete'>('input')
  const [validationResult, setValidationResult] = useState<MigrationValidation | null>(null)
  const [importResult, setImportResult] = useState<MigrationResult | null>(null)
  const [isMigrating, setIsMigrating] = useState(false)

  // Session validation
  const validateSession = useCallback(() => {
    const adminSession = sessionStorage.getItem('_sap_auth')
    if (!adminSession) {
      navigate('/rx760819')
      return false
    }
    
    try {
      const session = JSON.parse(atob(adminSession))
      if (session.exp < Date.now()) {
        sessionStorage.removeItem('_sap_auth')
        navigate('/rx760819')
        return false
      }
      return true
    } catch {
      sessionStorage.removeItem('_sap_auth')
      navigate('/rx760819')
      return false
    }
  }, [navigate])

  // Session timeout countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setSessionTimeout(prev => {
        if (prev <= 1) {
          handleLogout()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Reset timeout on activity
  useEffect(() => {
    const resetTimeout = () => setSessionTimeout(1800)
    window.addEventListener('mousemove', resetTimeout)
    window.addEventListener('keypress', resetTimeout)
    return () => {
      window.removeEventListener('mousemove', resetTimeout)
      window.removeEventListener('keypress', resetTimeout)
    }
  }, [])

  // Initial data load
  useEffect(() => {
    if (validateSession()) {
      loadData()
    }
  }, [validateSession])

  const loadData = async () => {
    setIsLoading(true)
    try {
      // Load firms
      const firmsRes = await fetch(`${API_URL}/secure-admin/firms`, {
        headers: getAuthHeaders()
      })
      if (firmsRes.ok) {
        const firmsData = await firmsRes.json()
        setFirms(firmsData)
      }

      // Load users
      const usersRes = await fetch(`${API_URL}/secure-admin/users`, {
        headers: getAuthHeaders()
      })
      if (usersRes.ok) {
        const usersData = await usersRes.json()
        setUsers(usersData)
      }

      // Load stats
      const statsRes = await fetch(`${API_URL}/secure-admin/stats`, {
        headers: getAuthHeaders()
      })
      if (statsRes.ok) {
        const statsData = await statsRes.json()
        setStats(statsData)
      }

      // Generate mock audit logs for display
      setAuditLogs([
        { id: '1', action: 'LOGIN', user: 'platform_admin', timestamp: new Date().toISOString(), details: 'Successful admin login', ip_address: '192.168.1.1' },
        { id: '2', action: 'VIEW_FIRMS', user: 'platform_admin', timestamp: new Date().toISOString(), details: 'Accessed firms list', ip_address: '192.168.1.1' },
      ])
    } catch (error) {
      console.error('Failed to load data:', error)
    }
    setIsLoading(false)
  }

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token')
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
      'X-Admin-Auth': sessionStorage.getItem('_sap_auth') || ''
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem('_sap_auth')
    console.log(`[AUDIT] Admin logout at ${new Date().toISOString()}`)
    navigate('/rx760819')
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Firm CRUD operations
  const handleSaveFirm = async (firmData: Partial<Firm>) => {
    try {
      const url = editingFirm 
        ? `${API_URL}/secure-admin/firms/${editingFirm.id}`
        : `${API_URL}/secure-admin/firms`
      
      const res = await fetch(url, {
        method: editingFirm ? 'PUT' : 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(firmData)
      })

      if (res.ok) {
        await loadData()
        setShowFirmModal(false)
        setEditingFirm(null)
      }
    } catch (error) {
      console.error('Failed to save firm:', error)
    }
  }

  const handleDeleteFirm = async (firmId: string) => {
    if (!confirm('Are you sure you want to delete this firm? This action cannot be undone.')) return
    
    try {
      const res = await fetch(`${API_URL}/secure-admin/firms/${firmId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })

      if (res.ok) {
        await loadData()
      }
    } catch (error) {
      console.error('Failed to delete firm:', error)
    }
  }

  // User CRUD operations
  const handleSaveUser = async (userData: Partial<User> & { password?: string }) => {
    try {
      const url = editingUser 
        ? `${API_URL}/secure-admin/users/${editingUser.id}`
        : `${API_URL}/secure-admin/users`
      
      const res = await fetch(url, {
        method: editingUser ? 'PUT' : 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(userData)
      })

      if (res.ok) {
        await loadData()
        setShowUserModal(false)
        setEditingUser(null)
      }
    } catch (error) {
      console.error('Failed to save user:', error)
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return
    
    try {
      const res = await fetch(`${API_URL}/secure-admin/users/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })

      if (res.ok) {
        await loadData()
      }
    } catch (error) {
      console.error('Failed to delete user:', error)
    }
  }

  // Migration functions
  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch(`${API_URL}/migration/template`, {
        headers: getAuthHeaders()
      })
      if (res.ok) {
        const template = await res.json()
        const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'clio-migration-template.json'
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Failed to download template:', error)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const content = event.target?.result as string
        setMigrationData(content)
      }
      reader.readAsText(file)
    }
  }

  const handleValidateMigration = async () => {
    if (!migrationData.trim()) {
      alert('Please enter or upload migration data')
      return
    }

    setIsMigrating(true)
    try {
      const parsedData = JSON.parse(migrationData)
      
      const res = await fetch(`${API_URL}/migration/validate`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ data: parsedData })
      })

      const result = await res.json()
      setValidationResult(result)
      setMigrationStep('validate')
    } catch (error) {
      if (error instanceof SyntaxError) {
        setValidationResult({
          valid: false,
          errors: ['Invalid JSON format. Please check your data.'],
          warnings: [],
          summary: { firm: null, users: 0, contacts: 0, matters: 0, activities: 0, calendar_entries: 0 }
        })
        setMigrationStep('validate')
      } else {
        console.error('Validation failed:', error)
        alert('Validation failed. Please try again.')
      }
    }
    setIsMigrating(false)
  }

  const handleExecuteMigration = async () => {
    if (!validationResult?.valid) return

    setIsMigrating(true)
    try {
      const parsedData = JSON.parse(migrationData)
      
      const res = await fetch(`${API_URL}/migration/import`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ data: parsedData })
      })

      const result = await res.json()
      setImportResult(result)
      setMigrationStep('complete')
      
      // Refresh data if successful
      if (result.success) {
        await loadData()
      }
    } catch (error) {
      console.error('Migration failed:', error)
      setImportResult({
        success: false,
        firm_id: null,
        firm_name: null,
        imported: { users: 0, contacts: 0, matters: 0, time_entries: 0, expenses: 0, calendar_entries: 0 },
        errors: ['Migration failed. Please try again.'],
        warnings: []
      })
      setMigrationStep('complete')
    }
    setIsMigrating(false)
  }

  const resetMigration = () => {
    setMigrationData('')
    setMigrationStep('input')
    setValidationResult(null)
    setImportResult(null)
  }

  const filteredFirms = firms.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.domain?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.last_name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className={styles.container}>
      {/* Security Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logo}>
            <Shield size={24} />
            <span>APEX Admin Console</span>
          </div>
          <div className={styles.securityIndicator}>
            <Lock size={14} />
            <span>Secure Session</span>
          </div>
        </div>
        
        <div className={styles.headerRight}>
          <div className={styles.sessionTimer}>
            <Clock size={14} />
            <span>Session: {formatTime(sessionTimeout)}</span>
          </div>
          <button onClick={loadData} className={styles.refreshBtn}>
            <RefreshCw size={16} />
          </button>
          <button onClick={handleLogout} className={styles.logoutBtn}>
            <LogOut size={16} />
            <span>Secure Logout</span>
          </button>
        </div>
      </header>

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <Building2 size={24} />
          <div>
            <span className={styles.statValue}>{stats.firms || firms.length}</span>
            <span className={styles.statLabel}>Total Firms</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <Users size={24} />
          <div>
            <span className={styles.statValue}>{stats.users || users.length}</span>
            <span className={styles.statLabel}>Total Users</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <Activity size={24} />
          <div>
            <span className={styles.statValue}>{stats.activeUsers || users.filter(u => u.status === 'active').length}</span>
            <span className={styles.statLabel}>Active Users</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* Tabs */}
        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${activeTab === 'firms' ? styles.active : ''}`}
            onClick={() => setActiveTab('firms')}
          >
            <Building2 size={18} />
            Firms
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'users' ? styles.active : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <Users size={18} />
            Users
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'migration' ? styles.active : ''}`}
            onClick={() => setActiveTab('migration')}
          >
            <Upload size={18} />
            Migration
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'audit' ? styles.active : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            <Activity size={18} />
            Audit Log
          </button>
        </div>

        {/* Toolbar */}
        {activeTab !== 'migration' && (
          <div className={styles.toolbar}>
            <div className={styles.searchBox}>
              <Search size={18} />
              <input
                type="text"
                placeholder={`Search ${activeTab}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            {activeTab !== 'audit' && (
              <button 
                className={styles.addBtn}
                onClick={() => {
                  if (activeTab === 'firms') {
                    setEditingFirm(null)
                    setShowFirmModal(true)
                  } else {
                    setEditingUser(null)
                    setShowUserModal(true)
                  }
                }}
              >
                <Plus size={18} />
                Add {activeTab === 'firms' ? 'Firm' : 'User'}
              </button>
            )}
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className={styles.loading}>Loading...</div>
        ) : (
          <>
            {/* Firms Table */}
            {activeTab === 'firms' && (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Firm Name</th>
                      <th>Domain</th>
                      <th>Status</th>
                      <th>Users</th>
                      <th>Subscription</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFirms.map(firm => (
                      <tr key={firm.id}>
                        <td className={styles.firmName}>{firm.name}</td>
                        <td>{firm.domain || '—'}</td>
                        <td>
                          <span className={`${styles.badge} ${styles[firm.status || 'active']}`}>
                            {firm.status || 'active'}
                          </span>
                        </td>
                        <td>{firm.users_count || 0}</td>
                        <td>{firm.subscription_tier || 'Professional'}</td>
                        <td>{new Date(firm.created_at).toLocaleDateString()}</td>
                        <td className={styles.actions}>
                          <button 
                            onClick={() => { setEditingFirm(firm); setShowFirmModal(true) }}
                            className={styles.editBtn}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            onClick={() => handleDeleteFirm(firm.id)}
                            className={styles.deleteBtn}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredFirms.length === 0 && (
                  <div className={styles.emptyState}>No firms found</div>
                )}
              </div>
            )}

            {/* Users Table */}
            {activeTab === 'users' && (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Firm</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Last Login</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(user => (
                      <tr key={user.id}>
                        <td className={styles.userName}>
                          {user.first_name} {user.last_name}
                        </td>
                        <td>{user.email}</td>
                        <td>{user.firm_name || firms.find(f => f.id === user.firm_id)?.name || '—'}</td>
                        <td>
                          <span className={`${styles.roleBadge} ${styles[user.role]}`}>
                            {user.role}
                          </span>
                        </td>
                        <td>
                          <span className={`${styles.badge} ${styles[user.status || 'active']}`}>
                            {user.status || 'active'}
                          </span>
                        </td>
                        <td>{user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}</td>
                        <td className={styles.actions}>
                          <button 
                            onClick={() => { setEditingUser(user); setShowUserModal(true) }}
                            className={styles.editBtn}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(user.id)}
                            className={styles.deleteBtn}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredUsers.length === 0 && (
                  <div className={styles.emptyState}>No users found</div>
                )}
              </div>
            )}

            {/* Migration Tab */}
            {activeTab === 'migration' && (
              <div className={styles.migrationContainer}>
                {/* Progress Steps */}
                <div className={styles.migrationSteps}>
                  <div className={`${styles.step} ${migrationStep === 'input' ? styles.activeStep : ''} ${['validate', 'import', 'complete'].includes(migrationStep) ? styles.completedStep : ''}`}>
                    <div className={styles.stepNumber}>1</div>
                    <span>Upload Data</span>
                  </div>
                  <ChevronRight size={20} className={styles.stepArrow} />
                  <div className={`${styles.step} ${migrationStep === 'validate' ? styles.activeStep : ''} ${['import', 'complete'].includes(migrationStep) ? styles.completedStep : ''}`}>
                    <div className={styles.stepNumber}>2</div>
                    <span>Validate</span>
                  </div>
                  <ChevronRight size={20} className={styles.stepArrow} />
                  <div className={`${styles.step} ${migrationStep === 'complete' ? styles.activeStep : ''}`}>
                    <div className={styles.stepNumber}>3</div>
                    <span>Import</span>
                  </div>
                </div>

                {/* Step 1: Input */}
                {migrationStep === 'input' && (
                  <div className={styles.migrationInput}>
                    <div className={styles.migrationHeader}>
                      <h3>Import Firm Data (Clio Format)</h3>
                      <p>Upload a JSON file or paste data in Clio export format to migrate a firm with all its data.</p>
                    </div>

                    <div className={styles.templateDownload}>
                      <button onClick={handleDownloadTemplate} className={styles.templateBtn}>
                        <FileJson size={18} />
                        Download Clio Format Template
                      </button>
                      <span className={styles.templateHint}>
                        Use this template as a reference for the expected data format
                      </span>
                    </div>

                    <div className={styles.uploadArea}>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleFileUpload}
                        id="migration-file"
                        className={styles.fileInput}
                      />
                      <label htmlFor="migration-file" className={styles.uploadLabel}>
                        <Upload size={32} />
                        <span>Drop JSON file here or click to upload</span>
                      </label>
                    </div>

                    <div className={styles.orDivider}>
                      <span>OR</span>
                    </div>

                    <div className={styles.jsonInput}>
                      <label>Paste JSON Data:</label>
                      <textarea
                        value={migrationData}
                        onChange={(e) => setMigrationData(e.target.value)}
                        placeholder='{"firm": {"name": "..."}, "users": [...], "contacts": [...], ...}'
                        rows={12}
                      />
                    </div>

                    <div className={styles.migrationActions}>
                      <button 
                        onClick={handleValidateMigration}
                        disabled={!migrationData.trim() || isMigrating}
                        className={styles.primaryBtn}
                      >
                        {isMigrating ? 'Validating...' : 'Validate Data'}
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 2: Validation Results */}
                {migrationStep === 'validate' && validationResult && (
                  <div className={styles.validationResults}>
                    <div className={`${styles.validationHeader} ${validationResult.valid ? styles.valid : styles.invalid}`}>
                      {validationResult.valid ? (
                        <>
                          <CheckCircle2 size={32} />
                          <div>
                            <h3>Validation Passed</h3>
                            <p>Your data is ready to import</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <XCircle size={32} />
                          <div>
                            <h3>Validation Failed</h3>
                            <p>Please fix the errors below before importing</p>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Summary */}
                    <div className={styles.summaryCard}>
                      <h4>Migration Summary</h4>
                      <div className={styles.summaryGrid}>
                        <div className={styles.summaryItem}>
                          <Building2 size={20} />
                          <span>Firm: {validationResult.summary.firm || 'N/A'}</span>
                        </div>
                        <div className={styles.summaryItem}>
                          <Users size={20} />
                          <span>{validationResult.summary.users} Users</span>
                        </div>
                        <div className={styles.summaryItem}>
                          <span className={styles.summaryIcon}>👤</span>
                          <span>{validationResult.summary.contacts} Contacts</span>
                        </div>
                        <div className={styles.summaryItem}>
                          <span className={styles.summaryIcon}>📁</span>
                          <span>{validationResult.summary.matters} Matters</span>
                        </div>
                        <div className={styles.summaryItem}>
                          <Clock size={20} />
                          <span>{validationResult.summary.activities} Activities</span>
                        </div>
                        <div className={styles.summaryItem}>
                          <span className={styles.summaryIcon}>📅</span>
                          <span>{validationResult.summary.calendar_entries} Calendar Entries</span>
                        </div>
                      </div>
                    </div>

                    {/* Errors */}
                    {validationResult.errors.length > 0 && (
                      <div className={styles.errorList}>
                        <h4><XCircle size={18} /> Errors ({validationResult.errors.length})</h4>
                        <ul>
                          {validationResult.errors.map((error, i) => (
                            <li key={i}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Warnings */}
                    {validationResult.warnings.length > 0 && (
                      <div className={styles.warningList}>
                        <h4><AlertTriangle size={18} /> Warnings ({validationResult.warnings.length})</h4>
                        <ul>
                          {validationResult.warnings.map((warning, i) => (
                            <li key={i}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className={styles.migrationActions}>
                      <button onClick={resetMigration} className={styles.secondaryBtn}>
                        ← Back to Edit
                      </button>
                      {validationResult.valid && (
                        <button 
                          onClick={handleExecuteMigration}
                          disabled={isMigrating}
                          className={styles.primaryBtn}
                        >
                          {isMigrating ? 'Importing...' : 'Import Data'}
                          <ChevronRight size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 3: Import Complete */}
                {migrationStep === 'complete' && importResult && (
                  <div className={styles.importComplete}>
                    <div className={`${styles.importHeader} ${importResult.success ? styles.success : styles.failed}`}>
                      {importResult.success ? (
                        <>
                          <CheckCircle size={48} />
                          <div>
                            <h3>Migration Complete!</h3>
                            <p>Firm "{importResult.firm_name}" has been successfully created</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <XCircle size={48} />
                          <div>
                            <h3>Migration Failed</h3>
                            <p>An error occurred during import</p>
                          </div>
                        </>
                      )}
                    </div>

                    {importResult.success && (
                      <div className={styles.importSummary}>
                        <h4>Imported Records</h4>
                        <div className={styles.importGrid}>
                          <div className={styles.importItem}>
                            <span className={styles.importCount}>{importResult.imported.users}</span>
                            <span>Users</span>
                          </div>
                          <div className={styles.importItem}>
                            <span className={styles.importCount}>{importResult.imported.contacts}</span>
                            <span>Contacts</span>
                          </div>
                          <div className={styles.importItem}>
                            <span className={styles.importCount}>{importResult.imported.matters}</span>
                            <span>Matters</span>
                          </div>
                          <div className={styles.importItem}>
                            <span className={styles.importCount}>{importResult.imported.time_entries}</span>
                            <span>Time Entries</span>
                          </div>
                          <div className={styles.importItem}>
                            <span className={styles.importCount}>{importResult.imported.expenses}</span>
                            <span>Expenses</span>
                          </div>
                          <div className={styles.importItem}>
                            <span className={styles.importCount}>{importResult.imported.calendar_entries}</span>
                            <span>Calendar Events</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {importResult.errors.length > 0 && (
                      <div className={styles.errorList}>
                        <h4><XCircle size={18} /> Errors</h4>
                        <ul>
                          {importResult.errors.map((error, i) => (
                            <li key={i}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {importResult.warnings.length > 0 && (
                      <div className={styles.warningList}>
                        <h4><AlertTriangle size={18} /> Warnings</h4>
                        <ul>
                          {importResult.warnings.map((warning, i) => (
                            <li key={i}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className={styles.migrationActions}>
                      <button onClick={resetMigration} className={styles.primaryBtn}>
                        <Plus size={18} />
                        Start New Migration
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Audit Log */}
            {activeTab === 'audit' && (
              <div className={styles.tableWrapper}>
                <div className={styles.auditHeader}>
                  <h3>Security Audit Trail</h3>
                  <button className={styles.exportBtn}>
                    <Download size={16} />
                    Export Logs
                  </button>
                </div>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Action</th>
                      <th>User</th>
                      <th>Details</th>
                      <th>IP Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map(log => (
                      <tr key={log.id}>
                        <td>{new Date(log.timestamp).toLocaleString()}</td>
                        <td>
                          <span className={styles.actionBadge}>{log.action}</span>
                        </td>
                        <td>{log.user}</td>
                        <td>{log.details}</td>
                        <td className={styles.ipAddress}>{log.ip_address}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Firm Modal */}
      {showFirmModal && (
        <FirmModal
          firm={editingFirm}
          onSave={handleSaveFirm}
          onClose={() => { setShowFirmModal(false); setEditingFirm(null) }}
        />
      )}

      {/* User Modal */}
      {showUserModal && (
        <UserModal
          user={editingUser}
          firms={firms}
          onSave={handleSaveUser}
          onClose={() => { setShowUserModal(false); setEditingUser(null) }}
        />
      )}

      {/* HIPAA Footer */}
      <footer className={styles.footer}>
        <div className={styles.hipaaNotice}>
          <AlertTriangle size={14} />
          <span>HIPAA Notice: All access and modifications are logged for compliance. PHI handling requires authorization.</span>
        </div>
      </footer>
    </div>
  )
}

// Firm Modal Component
function FirmModal({ 
  firm, 
  onSave, 
  onClose 
}: { 
  firm: Firm | null
  onSave: (data: Partial<Firm>) => void
  onClose: () => void 
}) {
  const [formData, setFormData] = useState({
    name: firm?.name || '',
    domain: firm?.domain || '',
    status: firm?.status || 'active',
    subscription_tier: firm?.subscription_tier || 'professional'
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2>{firm ? 'Edit Firm' : 'Create New Firm'}</h2>
        <form onSubmit={handleSubmit}>
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
            <label>Domain</label>
            <input
              type="text"
              value={formData.domain}
              onChange={e => setFormData({ ...formData, domain: e.target.value })}
              placeholder="e.g., firmname.com"
            />
          </div>
          <div className={styles.formGroup}>
            <label>Status</label>
            <select
              value={formData.status}
              onChange={e => setFormData({ ...formData, status: e.target.value as Firm['status'] })}
            >
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>Subscription Tier</label>
            <select
              value={formData.subscription_tier}
              onChange={e => setFormData({ ...formData, subscription_tier: e.target.value })}
            >
              <option value="starter">Starter</option>
              <option value="professional">Professional</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn}>
              {firm ? 'Update Firm' : 'Create Firm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// User Modal Component
function UserModal({ 
  user, 
  firms,
  onSave, 
  onClose 
}: { 
  user: User | null
  firms: Firm[]
  onSave: (data: Partial<User> & { password?: string }) => void
  onClose: () => void 
}) {
  const [formData, setFormData] = useState({
    email: user?.email || '',
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    role: user?.role || 'attorney',
    firm_id: user?.firm_id || '',
    status: user?.status || 'active',
    password: ''
  })
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const dataToSave = { ...formData }
    if (!dataToSave.password) {
      delete (dataToSave as any).password
    }
    onSave(dataToSave)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2>{user ? 'Edit User' : 'Create New User'}</h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>First Name *</label>
              <input
                type="text"
                value={formData.first_name}
                onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>Last Name *</label>
              <input
                type="text"
                value={formData.last_name}
                onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                required
              />
            </div>
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
            <label>{user ? 'New Password (leave blank to keep current)' : 'Password *'}</label>
            <div className={styles.passwordInput}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                required={!user}
                minLength={8}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className={styles.formGroup}>
            <label>Firm *</label>
            <select
              value={formData.firm_id}
              onChange={e => setFormData({ ...formData, firm_id: e.target.value })}
              required
            >
              <option value="">Select a firm...</option>
              {firms.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Role</label>
              <select
                value={formData.role}
                onChange={e => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="attorney">Attorney</option>
                <option value="paralegal">Paralegal</option>
                <option value="admin">Admin</option>
                <option value="partner">Partner</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Status</label>
              <select
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value as User['status'] })}
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn}>
              {user ? 'Update User' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
