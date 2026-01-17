import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Shield, LogOut, Building2, Users, Plus, Edit2, Trash2, 
  Search, AlertTriangle, CheckCircle, Clock, Activity,
  Lock, Eye, EyeOff, RefreshCw, Download, Upload, FileJson,
  ChevronRight, XCircle, CheckCircle2, UserPlus, Key,
  Mail, ToggleLeft, ToggleRight, ArrowRightLeft, Zap,
  TrendingUp, UserCheck, AlertCircle, BarChart3, Copy,
  Settings, ChevronDown, ExternalLink, Briefcase, FileText,
  ShieldCheck, Check, X, Sparkles, Brain, Wand2, FolderSync,
  HardDrive, FileSearch, ArrowRight
} from 'lucide-react'
import styles from './SecureAdminDashboard.module.css'

interface Firm {
  id: string
  name: string
  domain: string
  email?: string
  phone?: string
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
  is_active?: boolean
  email_verified?: boolean
  created_at: string
  last_login?: string
}

interface AuditLog {
  id: string
  action: string
  user: string
  target_user?: string
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

interface UserCredential {
  email: string
  name: string
  password: string
  role: string
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
  user_credentials: UserCredential[]
  errors: string[]
  warnings: string[]
}

interface DetailedStats {
  overview: {
    total_firms: string
    total_users: string
    active_users: string
    inactive_users: string
    verified_users: string
    unverified_users: string
    new_users_7d: string
    new_users_30d: string
    new_firms_7d: string
    new_firms_30d: string
    active_today: string
    active_7d: string
    total_matters: string
    total_clients: string
    total_time_entries: string
    total_documents: string
  }
  topFirms: { id: string; name: string; user_count: string }[]
  recentUsers: { id: string; email: string; first_name: string; last_name: string; created_at: string; firm_name: string }[]
  recentFirms: { id: string; name: string; created_at: string; user_count: string }[]
}

interface AccountLookupResult {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  firmId: string
  firmName: string
  firmEmail: string
  isActive: boolean
  emailVerified: boolean
  twoFactorEnabled: boolean
  hourlyRate: number
  phone: string
  lastLoginAt: string
  createdAt: string
  updatedAt: string
  stats: {
    firmMattersCount: number
    timeEntriesCount: number
    lastTimeEntry: string
  }
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

const getAuthToken = () => sessionStorage.getItem('_sap_auth') || ''

export default function SecureAdminDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'quick-onboard' | 'firms' | 'users' | 'account-tools' | 'migration' | 'audit' | 'integrations'>('overview')
  const [firms, setFirms] = useState<Firm[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [showFirmModal, setShowFirmModal] = useState(false)
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingFirm, setEditingFirm] = useState<Firm | null>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [sessionTimeout, setSessionTimeout] = useState(14400) // 4 hours in seconds
  const [detailedStats, setDetailedStats] = useState<DetailedStats | null>(null)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const navigate = useNavigate()

  // Quick Onboard state
  const [onboardForm, setOnboardForm] = useState({
    firmName: '',
    firmDomain: '',
    firmEmail: '',
    firmPhone: '',
    adminEmail: '',
    adminPassword: '',
    adminFirstName: '',
    adminLastName: ''
  })
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [onboardResult, setOnboardResult] = useState<{ success: boolean; message: string; firm?: any; user?: any } | null>(null)

  // Account Tools state
  const [accountLookup, setAccountLookup] = useState('')
  const [lookupResult, setLookupResult] = useState<AccountLookupResult | null>(null)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [selectedFirmForTransfer, setSelectedFirmForTransfer] = useState('')
  const [selectedRole, setSelectedRole] = useState('')

  // Migration state
  const [migrationData, setMigrationData] = useState<string>('')
  const [migrationStep, setMigrationStep] = useState<'input' | 'validate' | 'import' | 'complete'>('input')
  const [validationResult, setValidationResult] = useState<MigrationValidation | null>(null)
  const [importResult, setImportResult] = useState<MigrationResult | null>(null)
  const [isMigrating, setIsMigrating] = useState(false)
  
  // Migration mode: 'csv' | 'clio'
  const [migrationMode, setMigrationMode] = useState<'csv' | 'clio'>('clio')
  
  // AI Transformation state - default to CSV Import mode (aiMode = true)
  const [aiMode, setAiMode] = useState(true)
  const [rawDataInput, setRawDataInput] = useState('')
  const [dataFormatHint, setDataFormatHint] = useState('')
  
  // Clio API state
  const [clioClientId, setClioClientId] = useState('')
  const [clioClientSecret, setClioClientSecret] = useState('')
  const [clioConnectionId, setClioConnectionId] = useState<string | null>(null)
  const [clioUser, setClioUser] = useState<{ name: string; email: string } | null>(null)
  const [clioImporting, setClioImporting] = useState(false)
  
  // Data to include (default all true = import everything)
  const [includeUsers, setIncludeUsers] = useState(() => sessionStorage.getItem('clio_includeUsers') !== 'false')
  const [includeContacts, setIncludeContacts] = useState(() => sessionStorage.getItem('clio_includeContacts') !== 'false')
  const [includeMatters, setIncludeMatters] = useState(() => sessionStorage.getItem('clio_includeMatters') !== 'false')
  const [includeActivities, setIncludeActivities] = useState(() => sessionStorage.getItem('clio_includeActivities') !== 'false')
  const [includeBills, setIncludeBills] = useState(() => sessionStorage.getItem('clio_includeBills') !== 'false')
  const [includeCalendar, setIncludeCalendar] = useState(() => sessionStorage.getItem('clio_includeCalendar') !== 'false')
  const [includeDocuments, setIncludeDocuments] = useState(() => sessionStorage.getItem('clio_includeDocuments') !== 'false')
  
  // Migrate to existing firm option
  const [useExistingFirm, setUseExistingFirm] = useState(() => sessionStorage.getItem('clio_useExistingFirm') === 'true')
  const [selectedExistingFirmId, setSelectedExistingFirmId] = useState(() => sessionStorage.getItem('clio_existingFirmId') || '')
  
  // User-specific migration (filter by user email, only migrate their matters)
  const [filterByUser, setFilterByUser] = useState(() => sessionStorage.getItem('clio_filterByUser') === 'true')
  const [filterUserEmail, setFilterUserEmail] = useState(() => sessionStorage.getItem('clio_filterUserEmail') || '')
  
  // Sync options to sessionStorage so they persist through OAuth redirect
  useEffect(() => { sessionStorage.setItem('clio_includeUsers', String(includeUsers)) }, [includeUsers])
  useEffect(() => { sessionStorage.setItem('clio_includeContacts', String(includeContacts)) }, [includeContacts])
  useEffect(() => { sessionStorage.setItem('clio_includeMatters', String(includeMatters)) }, [includeMatters])
  useEffect(() => { sessionStorage.setItem('clio_includeActivities', String(includeActivities)) }, [includeActivities])
  useEffect(() => { sessionStorage.setItem('clio_includeBills', String(includeBills)) }, [includeBills])
  useEffect(() => { sessionStorage.setItem('clio_includeCalendar', String(includeCalendar)) }, [includeCalendar])
  useEffect(() => { sessionStorage.setItem('clio_includeDocuments', String(includeDocuments)) }, [includeDocuments])
  useEffect(() => { sessionStorage.setItem('clio_useExistingFirm', String(useExistingFirm)) }, [useExistingFirm])
  useEffect(() => { sessionStorage.setItem('clio_existingFirmId', selectedExistingFirmId) }, [selectedExistingFirmId])
  useEffect(() => { sessionStorage.setItem('clio_filterByUser', String(filterByUser)) }, [filterByUser])
  useEffect(() => { sessionStorage.setItem('clio_filterUserEmail', filterUserEmail) }, [filterUserEmail])
  
  const [clioProgress, setClioProgress] = useState<{
    status: string;
    steps?: Record<string, { status: string; count: number; error?: string }>;
    summary?: {
      users?: number;
      contacts?: number;
      matters?: number;
      activities?: number;
      bills?: number;
      calendar?: number;
      calendar_entries?: number;
      notes?: number;
      warnings?: string[];
      userCredentials?: { email: string; firstName: string; lastName: string; name: string; password: string; role: string }[];
    };
    logs?: string[];
    error?: string;
  } | null>(() => {
    // Load migration history from sessionStorage on mount
    const saved = sessionStorage.getItem('clio_migration_progress')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return null
      }
    }
    return null
  })
  
  // Persist migration progress to sessionStorage
  useEffect(() => {
    if (clioProgress) {
      sessionStorage.setItem('clio_migration_progress', JSON.stringify(clioProgress))
    }
  }, [clioProgress])
  
  // Check for Clio OAuth callback on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const clioConnected = params.get('clio_connected')
    const clioError = params.get('clio_error')
    const firmName = params.get('firm')
    
    // First verify we have a valid admin session
    const adminSession = sessionStorage.getItem('_sap_auth')
    let sessionValid = false
    
    if (adminSession) {
      try {
        const session = JSON.parse(atob(adminSession))
        sessionValid = session.exp > Date.now()
      } catch {
        sessionValid = false
      }
    }
    
    console.log('[CLIO OAUTH] Callback check - connected:', clioConnected, 'session valid:', sessionValid)
    
    if (clioConnected) {
      setClioConnectionId(clioConnected)
      setActiveTab('migration')
      setMigrationMode('clio')
      if (firmName) {
        setMigrationInputs(prev => ({ ...prev, firmName: decodeURIComponent(firmName) }))
      }
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
      
      if (!sessionValid) {
        console.error('[CLIO OAUTH] Admin session expired during OAuth flow')
        showNotification('error', 'Admin session expired. Please log in again and reconnect to Clio.')
        return
      }
      
      showNotification('success', 'Connected to Clio! Starting import...')
      // Fetch user info
      fetchClioUser(clioConnected)
      // Auto-start import after a short delay to ensure state is updated
      setTimeout(() => {
        console.log('[CLIO OAUTH] Auto-starting import for connection:', clioConnected)
        autoStartClioImport(clioConnected, firmName ? decodeURIComponent(firmName) : 'Imported from Clio')
      }, 1500) // Slightly longer delay to ensure everything is ready
    }
    
    if (clioError) {
      setActiveTab('migration')
      setMigrationMode('clio')
      window.history.replaceState({}, '', window.location.pathname)
      showNotification('error', `Clio connection failed: ${decodeURIComponent(clioError)}`)
    }
  }, [])
  
  const fetchClioUser = async (connectionId: string) => {
    try {
      // Try to get user info from the connection
      const res = await fetch(`${API_URL}/migration/clio/user/${connectionId}`, {
        headers: getAuthHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.user) {
          setClioUser(data.user)
        } else {
          setClioUser({ name: 'Clio User', email: 'Connected via OAuth' })
        }
      } else {
        setClioUser({ name: 'Clio User', email: 'Connected via OAuth' })
      }
    } catch (e) {
      console.error('Failed to fetch Clio user:', e)
      setClioUser({ name: 'Clio User', email: 'Connected via OAuth' })
    }
  }
  const [isTransforming, setIsTransforming] = useState(false)
  const [transformResult, setTransformResult] = useState<{ success: boolean; transformedData?: any; summary?: any; error?: string } | null>(null)
  
  // Structured migration inputs
  const [migrationInputs, setMigrationInputs] = useState({
    firmName: '',
    firmEmail: '',
    firmPhone: '',
    firmAddress: '',
    users: '',
    clients: '',
    matters: '',
    timeEntries: '',
    calendarEvents: '',
    bills: ''
  })

  // Bulk Import state
  const [showBulkModal, setShowBulkModal] = useState(false)
  
  // Scan Documents state
  const [scanningFirmId, setScanningFirmId] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<{ firmId: string; message: string; success: boolean } | null>(null)
  
  // Firm Detail state
  const [selectedFirmDetail, setSelectedFirmDetail] = useState<Firm | null>(null)
  const [firmManifestStats, setFirmManifestStats] = useState<any>(null)
  const [loadingManifest, setLoadingManifest] = useState(false)
  const [matchingDocuments, setMatchingDocuments] = useState(false)
  const [importingDocuments, setImportingDocuments] = useState(false)
  const [firmDetailTab, setFirmDetailTab] = useState<'overview' | 'users' | 'documents'>('overview')
  
  // Document streaming state
  const [streamingStatus, setStreamingStatus] = useState<{
    total: number
    pending: number
    imported: number
    errors: number
    linkedToMatters: number
    totalSizeMB: string
  } | null>(null)
  const [fetchingManifest, setFetchingManifest] = useState(false)
  const [streamingDocuments, setStreamingDocuments] = useState(false)
  const [streamProgress, setStreamProgress] = useState<{
    status: string
    processed?: number
    total?: number
    success?: number
    failed?: number
  } | null>(null)
  const [firmUsers, setFirmUsers] = useState<User[]>([])
  const [firmStats, setFirmStats] = useState<{ 
    users: number; 
    activeUsers: number; 
    matters: number; 
    openMatters: number;
    clients: number; 
    documents: number; 
    timeEntries: number;
    totalHours: number;
    invoices: number;
    calendarEvents: number;
  } | null>(null)
  const [loadingFirmData, setLoadingFirmData] = useState(false)
  const [bulkUsers, setBulkUsers] = useState('')
  const [bulkFirmId, setBulkFirmId] = useState('')
  const [bulkDefaultPassword, setBulkDefaultPassword] = useState('')

  // Integration Settings state
  const [integrationSettings, setIntegrationSettings] = useState<Record<string, any>>({})
  const [savingIntegrations, setSavingIntegrations] = useState(false)
  const [loadingIntegrations, setLoadingIntegrations] = useState(false)

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
    const resetTimeout = () => setSessionTimeout(14400) // 4 hours
    window.addEventListener('mousemove', resetTimeout)
    window.addEventListener('keypress', resetTimeout)
    return () => {
      window.removeEventListener('mousemove', resetTimeout)
      window.removeEventListener('keypress', resetTimeout)
    }
  }, [])

  // Auto-hide notifications
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [notification])

  // Initial data load
  useEffect(() => {
    if (validateSession()) {
      loadData()
    }
  }, [validateSession])

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
  }

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

      // Load detailed stats
      const statsRes = await fetch(`${API_URL}/secure-admin/detailed-stats`, {
        headers: getAuthHeaders()
      })
      if (statsRes.ok) {
        const statsData = await statsRes.json()
        setDetailedStats(statsData)
      }

      // Load audit logs
      const auditRes = await fetch(`${API_URL}/secure-admin/audit`, {
        headers: getAuthHeaders()
      })
      if (auditRes.ok) {
        const auditData = await auditRes.json()
        setAuditLogs(auditData)
      }
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

  // Quick Onboard
  const handleQuickOnboard = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsOnboarding(true)
    setOnboardResult(null)

    try {
      const res = await fetch(`${API_URL}/secure-admin/quick-onboard`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(onboardForm)
      })

      const data = await res.json()

      if (res.ok) {
        setOnboardResult({ success: true, message: data.message, firm: data.firm, user: data.user })
        showNotification('success', data.message)
        setOnboardForm({
          firmName: '',
          firmDomain: '',
          firmEmail: '',
          firmPhone: '',
          adminEmail: '',
          adminPassword: '',
          adminFirstName: '',
          adminLastName: ''
        })
        await loadData()
      } else {
        setOnboardResult({ success: false, message: data.error })
        showNotification('error', data.error)
      }
    } catch (error) {
      setOnboardResult({ success: false, message: 'Failed to complete onboarding' })
      showNotification('error', 'Failed to complete onboarding')
    }

    setIsOnboarding(false)
  }

  // Integration Settings
  const loadIntegrationSettings = async () => {
    setLoadingIntegrations(true)
    try {
      const response = await fetch(`${API_URL}/secure-admin/platform-settings`, {
        headers: { 'X-Admin-Auth': getAuthToken() }
      })
      if (response.ok) {
        const data = await response.json()
        // Backend returns object directly: { key: { value, isConfigured, ... }, ... }
        // Handle both formats for compatibility
        if (data.settings && Array.isArray(data.settings)) {
          // Old array format
          const settings: Record<string, any> = {}
          data.settings.forEach((s: any) => {
            settings[s.key] = { value: s.value || '', isConfigured: !!s.value, isSecret: s.is_secret }
          })
          setIntegrationSettings(settings)
        } else {
          // New object format - directly from backend
          setIntegrationSettings(data)
        }
      }
    } catch (err) {
      console.error('Failed to load integration settings:', err)
    }
    setLoadingIntegrations(false)
  }

  const updateIntegrationSetting = (key: string, value: string) => {
    setIntegrationSettings(prev => ({
      ...prev,
      [key]: { ...prev[key], value, isConfigured: !!value }
    }))
  }

  const saveIntegrationSettings = async () => {
    setSavingIntegrations(true)
    try {
      const updates: { key: string; value: string }[] = []
      Object.entries(integrationSettings).forEach(([key, val]: [string, any]) => {
        if (val.value !== undefined) {
          updates.push({ key, value: val.value })
        }
      })

      const response = await fetch(`${API_URL}/secure-admin/platform-settings`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'X-Admin-Auth': getAuthToken() 
        },
        body: JSON.stringify({ settings: updates })
      })

      if (response.ok) {
        setNotification({ type: 'success', message: 'Integration settings saved successfully!' })
        loadIntegrationSettings()
      } else {
        throw new Error('Failed to save')
      }
    } catch (err) {
      setNotification({ type: 'error', message: 'Failed to save integration settings' })
    }
    setSavingIntegrations(false)
  }

  // Account Lookup
  const handleAccountLookup = async () => {
    if (!accountLookup.trim()) return

    setIsLookingUp(true)
    setLookupResult(null)

    try {
      const res = await fetch(`${API_URL}/secure-admin/account-tools/lookup/${encodeURIComponent(accountLookup)}`, {
        headers: getAuthHeaders()
      })

      if (res.ok) {
        const data = await res.json()
        setLookupResult(data)
        setSelectedRole(data.role)
      } else {
        const error = await res.json()
        showNotification('error', error.error || 'User not found')
      }
    } catch (error) {
      showNotification('error', 'Failed to lookup account')
    }

    setIsLookingUp(false)
  }

  // Account Tools Actions
  const handleResetPassword = async () => {
    if (!lookupResult || !newPassword) return

    try {
      const res = await fetch(`${API_URL}/secure-admin/account-tools/reset-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId: lookupResult.id, newPassword })
      })

      const data = await res.json()
      if (res.ok) {
        showNotification('success', data.message)
        setNewPassword('')
      } else {
        showNotification('error', data.error)
      }
    } catch (error) {
      showNotification('error', 'Failed to reset password')
    }
  }

  const handleVerifyEmail = async () => {
    if (!lookupResult) return

    try {
      const res = await fetch(`${API_URL}/secure-admin/account-tools/verify-email`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId: lookupResult.id })
      })

      const data = await res.json()
      if (res.ok) {
        showNotification('success', data.message)
        setLookupResult({ ...lookupResult, emailVerified: true })
      } else {
        showNotification('error', data.error)
      }
    } catch (error) {
      showNotification('error', 'Failed to verify email')
    }
  }

  const handleToggleStatus = async () => {
    if (!lookupResult) return

    try {
      const res = await fetch(`${API_URL}/secure-admin/account-tools/toggle-status`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId: lookupResult.id, isActive: !lookupResult.isActive })
      })

      const data = await res.json()
      if (res.ok) {
        showNotification('success', data.message)
        setLookupResult({ ...lookupResult, isActive: data.isActive })
        await loadData()
      } else {
        showNotification('error', data.error)
      }
    } catch (error) {
      showNotification('error', 'Failed to toggle status')
    }
  }

  const handleChangeRole = async () => {
    if (!lookupResult || !selectedRole || selectedRole === lookupResult.role) return

    try {
      const res = await fetch(`${API_URL}/secure-admin/account-tools/change-role`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId: lookupResult.id, newRole: selectedRole })
      })

      const data = await res.json()
      if (res.ok) {
        showNotification('success', data.message)
        setLookupResult({ ...lookupResult, role: data.role })
        await loadData()
      } else {
        showNotification('error', data.error)
      }
    } catch (error) {
      showNotification('error', 'Failed to change role')
    }
  }

  const handleTransferFirm = async () => {
    if (!lookupResult || !selectedFirmForTransfer) return

    try {
      const res = await fetch(`${API_URL}/secure-admin/account-tools/transfer-firm`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId: lookupResult.id, newFirmId: selectedFirmForTransfer })
      })

      const data = await res.json()
      if (res.ok) {
        showNotification('success', data.message)
        // Refresh lookup
        await handleAccountLookup()
        await loadData()
      } else {
        showNotification('error', data.error)
      }
    } catch (error) {
      showNotification('error', 'Failed to transfer firm')
    }
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
        showNotification('success', editingFirm ? 'Firm updated successfully' : 'Firm created successfully')
      }
    } catch (error) {
      console.error('Failed to save firm:', error)
      showNotification('error', 'Failed to save firm')
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
        showNotification('success', 'Firm deleted successfully')
      } else {
        const error = await res.json()
        showNotification('error', error.error || 'Failed to delete firm')
      }
    } catch (error) {
      console.error('Failed to delete firm:', error)
      showNotification('error', 'Failed to delete firm')
    }
  }

  // Scan documents for a firm
  const handleScanDocuments = async (firmId: string) => {
    setScanningFirmId(firmId)
    setScanResult(null)
    try {
      const res = await fetch(`${API_URL}/secure-admin/firms/${firmId}/scan-documents`, {
        method: 'POST',
        headers: getAuthHeaders()
      })
      const data = await res.json()
      if (res.ok) {
        setScanResult({ firmId, message: data.message, success: true })
        showNotification('success', data.message)
      } else {
        setScanResult({ firmId, message: data.error || 'Scan failed', success: false })
        showNotification('error', data.error || 'Scan failed')
      }
    } catch (error) {
      setScanResult({ firmId, message: 'Scan failed', success: false })
      showNotification('error', 'Failed to scan documents')
    } finally {
      setScanningFirmId(null)
    }
  }

  // Open firm detail view with document manifest info
  const handleViewFirmDetail = async (firm: Firm) => {
    setSelectedFirmDetail(firm)
    setFirmDetailTab('overview')
    setLoadingFirmData(true)
    setLoadingManifest(true)
    setFirmUsers([])
    setFirmStats(null)
    setFirmManifestStats(null)
    
    // Fetch all firm data in parallel
    try {
      const [usersRes, statsRes, manifestRes] = await Promise.all([
        // Fetch users for this firm
        fetch(`${API_URL}/secure-admin/firms/${firm.id}/users`, { headers: getAuthHeaders() }),
        // Fetch firm stats
        fetch(`${API_URL}/secure-admin/firms/${firm.id}/stats`, { headers: getAuthHeaders() }),
        // Fetch document manifest
        fetch(`${API_URL}/migration/documents/manifest/${firm.id}`, { headers: getAuthHeaders() })
      ])
      
      if (usersRes.ok) {
        const usersData = await usersRes.json()
        setFirmUsers(usersData.users || usersData || [])
      }
      
      if (statsRes.ok) {
        const statsData = await statsRes.json()
        setFirmStats(statsData)
      }
      
      if (manifestRes.ok) {
        const manifestData = await manifestRes.json()
        setFirmManifestStats(manifestData)
      }
      
      // Also fetch streaming status
      try {
        const streamRes = await fetch(`${API_URL}/migration/documents/stream-status/${firm.id}`, {
          headers: getAuthHeaders()
        })
        if (streamRes.ok) {
          const streamData = await streamRes.json()
          if (streamData.success) {
            setStreamingStatus(streamData.status)
          }
        }
      } catch (e) {
        console.log('Streaming status not available:', e)
      }
    } catch (error) {
      console.error('Failed to load firm data:', error)
    }
    
    setLoadingFirmData(false)
    setLoadingManifest(false)
  }

  // Match Azure files to Clio document manifest
  const handleMatchDocuments = async () => {
    if (!selectedFirmDetail) return
    setMatchingDocuments(true)
    try {
      const res = await fetch(`${API_URL}/migration/documents/match-manifest`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ firmId: selectedFirmDetail.id })
      })
      const data = await res.json()
      if (res.ok) {
        showNotification('success', data.message)
        // Reload manifest stats
        handleViewFirmDetail(selectedFirmDetail)
      } else {
        showNotification('error', data.error || 'Match failed')
      }
    } catch (error) {
      showNotification('error', 'Failed to match documents')
    }
    setMatchingDocuments(false)
  }

  // Import matched documents
  const handleImportMatchedDocuments = async () => {
    if (!selectedFirmDetail) return
    setImportingDocuments(true)
    try {
      const res = await fetch(`${API_URL}/migration/documents/import-matched`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ firmId: selectedFirmDetail.id })
      })
      const data = await res.json()
      if (res.ok) {
        showNotification('success', data.message)
        // Reload manifest stats
        handleViewFirmDetail(selectedFirmDetail)
      } else {
        showNotification('error', data.error || 'Import failed')
      }
    } catch (error) {
      showNotification('error', 'Failed to import documents')
    }
    setImportingDocuments(false)
  }

  // Fetch document streaming status
  const fetchStreamingStatus = async (firmId: string) => {
    try {
      const res = await fetch(`${API_URL}/migration/documents/stream-status/${firmId}`, {
        headers: getAuthHeaders()
      })
      const data = await res.json()
      if (data.success) {
        setStreamingStatus(data.status)
      }
    } catch (e) {
      console.error('Failed to fetch streaming status:', e)
    }
  }

  // Fetch document manifest from Clio (metadata only)
  const handleFetchDocumentManifest = async () => {
    if (!selectedFirmDetail || !clioConnectionId) {
      showNotification('error', 'Please connect to Clio first from the Migration tab')
      return
    }
    
    setFetchingManifest(true)
    try {
      const res = await fetch(`${API_URL}/migration/documents/fetch-manifest`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ 
          firmId: selectedFirmDetail.id,
          connectionId: clioConnectionId
        })
      })
      const data = await res.json()
      if (data.success) {
        showNotification('success', data.message)
        await fetchStreamingStatus(selectedFirmDetail.id)
      } else {
        showNotification('error', data.error || 'Failed to fetch manifest')
      }
    } catch {
      showNotification('error', 'Failed to fetch document manifest from Clio')
    }
    setFetchingManifest(false)
  }

  // Stream documents from Clio to Azure
  const handleStreamDocumentsToAzure = async () => {
    if (!selectedFirmDetail || !clioConnectionId) {
      showNotification('error', 'Please connect to Clio first from the Migration tab')
      return
    }
    
    setStreamingDocuments(true)
    setStreamProgress({ status: 'starting', processed: 0, total: streamingStatus?.pending || 0 })
    
    try {
      const res = await fetch(`${API_URL}/migration/documents/stream-to-azure`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ 
          firmId: selectedFirmDetail.id,
          connectionId: clioConnectionId,
          batchSize: 5  // Process 5 documents at a time
        })
      })
      const data = await res.json()
      if (data.success) {
        showNotification('success', data.message)
        setStreamProgress({ 
          status: 'complete', 
          processed: data.success + data.failed, 
          total: data.success + data.failed,
          success: data.success,
          failed: data.failed
        })
        await fetchStreamingStatus(selectedFirmDetail.id)
        // Reload manifest stats
        handleViewFirmDetail(selectedFirmDetail)
      } else {
        showNotification('error', data.error || 'Streaming failed')
        setStreamProgress({ status: 'error' })
      }
    } catch (e) {
      showNotification('error', 'Failed to stream documents')
      setStreamProgress({ status: 'error' })
    }
    setStreamingDocuments(false)
  }

  // Reset failed documents to pending
  const handleResetFailedDocuments = async () => {
    if (!selectedFirmDetail) return
    
    try {
      const res = await fetch(`${API_URL}/migration/documents/reset-failed`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ firmId: selectedFirmDetail.id })
      })
      const data = await res.json()
      if (data.success) {
        showNotification('success', data.message)
        await fetchStreamingStatus(selectedFirmDetail.id)
      } else {
        showNotification('error', data.error || 'Reset failed')
      }
    } catch {
      showNotification('error', 'Failed to reset documents')
    }
  }

  // Sync document permissions
  const handleSyncPermissions = async () => {
    if (!selectedFirmDetail) return
    
    try {
      const res = await fetch(`${API_URL}/migration/documents/sync-permissions`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ firmId: selectedFirmDetail.id })
      })
      const data = await res.json()
      if (data.success) {
        showNotification('success', data.message)
      } else {
        showNotification('error', data.error || 'Sync failed')
      }
    } catch {
      showNotification('error', 'Failed to sync permissions')
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
        showNotification('success', editingUser ? 'User updated successfully' : 'User created successfully')
      }
    } catch (error) {
      console.error('Failed to save user:', error)
      showNotification('error', 'Failed to save user')
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
        showNotification('success', 'User deleted successfully')
      }
    } catch (error) {
      console.error('Failed to delete user:', error)
      showNotification('error', 'Failed to delete user')
    }
  }

  // Bulk Import
  const handleBulkImport = async () => {
    if (!bulkUsers.trim() || !bulkFirmId) {
      showNotification('error', 'Please provide users and select a firm')
      return
    }

    try {
      // Parse CSV/JSON input
      const lines = bulkUsers.trim().split('\n')
      const usersToCreate = lines.map(line => {
        const parts = line.split(',').map(p => p.trim())
        return {
          email: parts[0],
          firstName: parts[1],
          lastName: parts[2],
          role: parts[3] || 'attorney'
        }
      }).filter(u => u.email && u.firstName && u.lastName)

      const res = await fetch(`${API_URL}/secure-admin/bulk-create-users`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          users: usersToCreate,
          firmId: bulkFirmId,
          defaultPassword: bulkDefaultPassword || undefined
        })
      })

      const data = await res.json()

      if (res.ok) {
        showNotification('success', `Created ${data.created} users. ${data.failed} failed.`)
        setShowBulkModal(false)
        setBulkUsers('')
        setBulkFirmId('')
        setBulkDefaultPassword('')
        await loadData()
      } else {
        showNotification('error', data.error)
      }
    } catch (error) {
      showNotification('error', 'Failed to bulk import users')
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
    // Allow importing even if validation failed - the backend handles duplicates gracefully
    if (!migrationData.trim()) {
      showNotification('error', 'No data to import')
      return
    }

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
        showNotification('success', `Migration complete! Created firm "${result.firm_name}"`)
      } else {
        showNotification('error', `Import had issues - check results below`)
      }
    } catch (error) {
      console.error('Migration failed:', error)
      setImportResult({
        success: false,
        firm_id: null,
        firm_name: null,
        imported: { users: 0, contacts: 0, matters: 0, time_entries: 0, expenses: 0, calendar_entries: 0 },
        user_credentials: [],
        errors: ['Migration failed. Please check the JSON format and try again.'],
        warnings: []
      })
      setMigrationStep('complete')
      showNotification('error', 'Migration failed - check JSON format')
    }
    setIsMigrating(false)
  }

  const resetMigration = () => {
    setMigrationData('')
    setMigrationStep('input')
    setValidationResult(null)
    setImportResult(null)
    setTransformResult(null)
    setRawDataInput('')
    setDataFormatHint('')
  }

  // Helper to split data into chunks
  const splitIntoChunks = (data: string, linesPerChunk: number = 500): string[] => {
    if (!data || !data.trim()) return []
    const lines = data.trim().split('\n')
    const header = lines[0]
    const chunks: string[] = []
    
    for (let i = 1; i < lines.length; i += linesPerChunk) {
      const chunkLines = lines.slice(i, i + linesPerChunk)
      // Include header only in first chunk
      if (i === 1) {
        chunks.push([header, ...chunkLines].join('\n'))
      } else {
        chunks.push(chunkLines.join('\n'))
      }
    }
    return chunks
  }

  // CSV Parse / Transform function - uses chunked uploads for large data
  const handleAITransform = async () => {
    // Check if any data is entered
    const hasData = migrationInputs.firmName.trim() || 
                    migrationInputs.users.trim() || 
                    migrationInputs.clients.trim() || 
                    migrationInputs.matters.trim() ||
                    migrationInputs.timeEntries.trim() ||
                    migrationInputs.calendarEvents.trim()
    
    if (!hasData) {
      showNotification('error', 'Please enter data in at least one section')
      return
    }

    if (!migrationInputs.firmName.trim()) {
      showNotification('error', 'Please enter a firm name')
      return
    }

    setIsTransforming(true)
    setTransformResult(null)

    try {
      // Step 1: Start migration session
      showNotification('success', 'Starting migration session...')
      const startRes = await fetch(`${API_URL}/migration/start-session`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          firmName: migrationInputs.firmName,
          firmEmail: migrationInputs.firmEmail,
          firmPhone: migrationInputs.firmPhone,
          firmAddress: migrationInputs.firmAddress
        })
      })
      
      const startResult = await startRes.json()
      if (!startResult.success) {
        throw new Error(startResult.error || 'Failed to start session')
      }
      
      const sessionId = startResult.sessionId
      
      // Step 2: Send data in chunks
      const dataTypes = [
        { key: 'users', data: migrationInputs.users },
        { key: 'clients', data: migrationInputs.clients },
        { key: 'matters', data: migrationInputs.matters },
        { key: 'timeEntries', data: migrationInputs.timeEntries },
        { key: 'calendarEvents', data: migrationInputs.calendarEvents },
        { key: 'bills', data: migrationInputs.bills }
      ]
      
      let totalChunks = 0
      let processedChunks = 0
      
      // Count total chunks
      for (const dt of dataTypes) {
        if (dt.data.trim()) {
          totalChunks += splitIntoChunks(dt.data).length
        }
      }
      
      // Send each data type in chunks
      for (const dt of dataTypes) {
        if (!dt.data.trim()) continue
        
        const chunks = splitIntoChunks(dt.data)
        for (let i = 0; i < chunks.length; i++) {
          processedChunks++
          // Progress is logged to console, not shown as notification to avoid spam
          console.log(`Processing ${dt.key} chunk ${i + 1}/${chunks.length} (${processedChunks}/${totalChunks} total)`)
          
          const chunkRes = await fetch(`${API_URL}/migration/add-chunk`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              sessionId,
              dataType: dt.key,
              data: chunks[i]
            })
          })
          
          const chunkResult = await chunkRes.json()
          if (!chunkResult.success) {
            console.error(`Chunk error for ${dt.key}:`, chunkResult.error)
          }
        }
      }
      
      // Step 3: Finalize and get results
      showNotification('success', 'Finalizing migration data...')
      const finalRes = await fetch(`${API_URL}/migration/finalize-session`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ sessionId })
      })
      
      const result = await finalRes.json()

      if (finalRes.ok && result.success) {
        setTransformResult(result)
        // Auto-populate the migration data field with the transformed JSON
        setMigrationData(JSON.stringify(result.transformedData, null, 2))
        showNotification('success', `Parsed successfully: ${result.summary.users} users, ${result.summary.contacts} contacts, ${result.summary.matters} matters, ${result.summary.activities} time entries`)
      } else {
        setTransformResult({ success: false, error: result.error || 'Parsing failed' })
        showNotification('error', result.error || 'CSV parsing failed - check your data format')
      }
    } catch (error) {
      console.error('CSV parsing error:', error)
      setTransformResult({ success: false, error: 'Failed to connect to server' })
      showNotification('error', error instanceof Error ? error.message : 'Failed to connect to server')
    }

    setIsTransforming(false)
  }

  // Clio API Functions
  const connectToClio = async () => {
    if (!clioClientId.trim() || !clioClientSecret.trim()) {
      showNotification('error', 'Please enter both Client ID and Client Secret')
      return
    }
    
    if (!migrationInputs.firmName.trim()) {
      showNotification('error', 'Please enter a firm name before connecting')
      return
    }
    
    setClioImporting(true)
    try {
      const res = await fetch(`${API_URL}/migration/clio/oauth-start`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ 
          clientId: clioClientId.trim(),
          clientSecret: clioClientSecret.trim(),
          firmName: migrationInputs.firmName.trim()
        })
      })
      
      const result = await res.json()
      
      if (result.success && result.authUrl) {
        // Redirect to Clio authorization page
        window.location.href = result.authUrl
      } else {
        showNotification('error', result.error || 'Failed to start Clio authorization')
        setClioImporting(false)
      }
    } catch (error) {
      showNotification('error', 'Failed to connect to Clio')
      setClioImporting(false)
    }
  }
  
  // Auto-start import after OAuth callback
  const autoStartClioImport = async (connectionId: string, firmName: string) => {
    setClioImporting(true)
    setClioProgress({ status: 'starting' })
    
    // Read options directly from sessionStorage since React state may not be synced yet after OAuth redirect
    const storedUseExistingFirm = sessionStorage.getItem('clio_useExistingFirm') === 'true'
    const storedExistingFirmId = sessionStorage.getItem('clio_existingFirmId') || ''
    const storedIncludeUsers = sessionStorage.getItem('clio_includeUsers') !== 'false'
    const storedIncludeContacts = sessionStorage.getItem('clio_includeContacts') !== 'false'
    const storedIncludeMatters = sessionStorage.getItem('clio_includeMatters') !== 'false'
    const storedIncludeActivities = sessionStorage.getItem('clio_includeActivities') !== 'false'
    const storedIncludeBills = sessionStorage.getItem('clio_includeBills') !== 'false'
    const storedIncludeCalendar = sessionStorage.getItem('clio_includeCalendar') !== 'false'
    const storedIncludeDocuments = sessionStorage.getItem('clio_includeDocuments') !== 'false'
    const storedFilterByUser = sessionStorage.getItem('clio_filterByUser') === 'true'
    const storedFilterUserEmail = sessionStorage.getItem('clio_filterUserEmail') || ''
    
    console.log('[CLIO] Import options from sessionStorage:', {
      useExistingFirm: storedUseExistingFirm,
      existingFirmId: storedExistingFirmId,
      includeUsers: storedIncludeUsers,
      includeContacts: storedIncludeContacts,
      includeMatters: storedIncludeMatters,
      includeActivities: storedIncludeActivities,
      includeBills: storedIncludeBills,
      includeCalendar: storedIncludeCalendar,
      includeDocuments: storedIncludeDocuments,
      filterByUser: storedFilterByUser,
      filterUserEmail: storedFilterUserEmail
    })
    
    try {
      console.log('[CLIO] Starting import for connection:', connectionId)
      const res = await fetch(`${API_URL}/migration/clio/import`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ 
          connectionId, 
          firmName,
          existingFirmId: storedUseExistingFirm ? storedExistingFirmId : null,
          includeUsers: storedIncludeUsers,
          includeContacts: storedIncludeContacts,
          includeMatters: storedIncludeMatters,
          includeActivities: storedIncludeActivities,
          includeBills: storedIncludeBills,
          includeCalendar: storedIncludeCalendar,
          includeDocuments: storedIncludeDocuments,
          filterByUser: storedFilterByUser,
          filterUserEmail: storedFilterByUser ? storedFilterUserEmail : null
        })
      })
      
      const result = await res.json()
      console.log('[CLIO] Import response:', result)
      
      if (result.success) {
        showNotification('success', 'Import started! Pulling all data from Clio...')
        // Pass connectionId directly to avoid closure issues
        pollClioProgress(connectionId)
      } else {
        showNotification('error', result.error || 'Failed to start import')
        setClioImporting(false)
      }
    } catch (error) {
      console.error('[CLIO] Import error:', error)
      showNotification('error', 'Failed to start Clio import')
      setClioImporting(false)
    }
  }
  
  const startClioImport = async () => {
    if (!clioConnectionId) {
      showNotification('error', 'Please connect to Clio first')
      return
    }
    
    if (!migrationInputs.firmName.trim()) {
      showNotification('error', 'Please enter a firm name')
      return
    }
    
    setClioImporting(true)
    setClioProgress({ status: 'starting' })
    
    try {
      console.log('[CLIO] Starting manual import for connection:', clioConnectionId)
      const res = await fetch(`${API_URL}/migration/clio/import`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ 
          connectionId: clioConnectionId,
          firmName: migrationInputs.firmName,
          existingFirmId: useExistingFirm ? selectedExistingFirmId : null,
          includeUsers,
          includeContacts,
          includeMatters,
          includeActivities,
          includeBills,
          includeCalendar,
          filterByUser,
          filterUserEmail: filterByUser ? filterUserEmail : null
        })
      })
      
      const result = await res.json()
      console.log('[CLIO] Manual import response:', result)
      
      if (result.success) {
        showNotification('success', 'Import started! Pulling data from Clio...')
        // Start polling for progress - pass connectionId directly
        pollClioProgress(clioConnectionId)
      } else {
        showNotification('error', result.error || 'Failed to start import')
        setClioImporting(false)
      }
    } catch (error) {
      console.error('[CLIO] Manual import error:', error)
      showNotification('error', 'Failed to start Clio import')
      setClioImporting(false)
    }
  }
  
  // Poll for Clio import progress - connectionId passed as parameter to avoid closure issues
  const pollClioProgress = async (connectionId?: string) => {
    // Use passed connectionId or fall back to state
    const connId = connectionId || clioConnectionId
    if (!connId) {
      console.error('[CLIO] No connection ID available for polling')
      return
    }
    
    console.log('[CLIO] Starting progress polling for:', connId)
    
    const checkProgress = async () => {
      try {
        const res = await fetch(`${API_URL}/migration/clio/progress/${connId}`, {
          headers: getAuthHeaders()
        })
        const progress = await res.json()
        console.log('[CLIO] Progress update:', progress)
        if (progress.summary?.userCredentials) {
          console.log('[CLIO] User credentials found:', progress.summary.userCredentials.length)
        }
        setClioProgress(progress)
        
        if (progress.status === 'completed') {
          // Fetch the result
          console.log('[CLIO] Clio data fetch completed, getting results...')
          const resultRes = await fetch(`${API_URL}/migration/clio/result/${connId}`, {
            headers: getAuthHeaders()
          })
          const result = await resultRes.json()
          console.log('[CLIO] Fetched data:', result)
          
          if (result.success && result.transformedData) {
            setTransformResult(result)
            const dataJson = JSON.stringify(result.transformedData, null, 2)
            setMigrationData(dataJson)
            
            showNotification('success', `✅ Data fetched from Clio! ${result.summary.users} users, ${result.summary.contacts} contacts, ${result.summary.matters} matters. Review the data below and click "Validate & Import" when ready.`)
            
            // DON'T AUTO-IMPORT - Let user review and edit data first
            // The user can now:
            // 1. Click "Edit Data" to modify the JSON if needed
            // 2. Click "Validate Data" to check for issues
            // 3. Click "Execute Import" to save to database
            console.log('[CLIO] Data fetched - waiting for user to review and import')
          } else {
            showNotification('error', result.error || 'Failed to fetch import results')
          }
          setClioImporting(false)
          return
        } else if (progress.status === 'error') {
          showNotification('error', progress.error || 'Import failed')
          setClioImporting(false)
          return
        }
        
        // Continue polling
        setTimeout(checkProgress, 2000)
      } catch (error) {
        console.error('[CLIO] Progress poll error:', error)
        setTimeout(checkProgress, 3000)
      }
    }
    
    checkProgress()
  }
  
  const disconnectClio = async () => {
    console.log('[CLIO] Disconnecting and resetting migration state...')
    if (clioConnectionId) {
      try {
        await fetch(`${API_URL}/migration/clio/disconnect`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ connectionId: clioConnectionId })
        })
      } catch (e) {
        // Ignore
      }
    }
    // Reset all Clio-related state
    setClioConnectionId(null)
    setClioUser(null)
    setClioClientId('')
    setClioClientSecret('')
    setClioProgress(null)
    setClioImporting(false)
    setUseExistingFirm(false)
    setSelectedExistingFirmId('')
    setFilterByUser(false)
    setFilterUserEmail('')
    setMigrationInputs(prev => ({ ...prev, firmName: '' }))
    
    // Clear sessionStorage for Clio-related settings
    sessionStorage.removeItem('clio_useExistingFirm')
    sessionStorage.removeItem('clio_existingFirmId')
    sessionStorage.removeItem('clio_filterByUser')
    sessionStorage.removeItem('clio_filterUserEmail')
    sessionStorage.removeItem('clio_migration_progress')
    
    // Clear URL params if any
    const url = new URL(window.location.href)
    if (url.searchParams.has('clio_connected') || url.searchParams.has('clio_error')) {
      url.searchParams.delete('clio_connected')
      url.searchParams.delete('clio_error')
      url.searchParams.delete('firm')
      window.history.replaceState({}, '', url.pathname)
    }
    
    showNotification('success', 'Migration reset. You can now start a new migration.')
    console.log('[CLIO] Migration state reset complete')
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    showNotification('success', 'Copied to clipboard')
  }

  // Generate random password
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%'
    let password = ''
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return password
  }

  // Reset password and copy credentials for a user
  const resetPasswordAndCopy = async (user: User) => {
    const newPass = generateRandomPassword()
    
    try {
      const res = await fetch(`${API_URL}/secure-admin/account-tools/reset-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId: user.id, newPassword: newPass })
      })

      if (res.ok) {
        const welcomeMessage = `Dear ${user.first_name},

\tWelcome to Strapped AI! Your login details are below. Get comfortable with your Apex AI, and navigate to the integrations page to link your email account and your calendar. If you have any questions feel free to reach out to us at admin@strappedai.com.

Username: ${user.email}
Password: ${newPass}`
        
        await navigator.clipboard.writeText(welcomeMessage)
        showNotification('success', `Password reset for ${user.email}. Welcome email copied to clipboard!`)
      } else {
        const data = await res.json()
        showNotification('error', data.error || 'Failed to reset password')
      }
    } catch (error) {
      showNotification('error', 'Failed to reset password')
    }
  }

  return (
    <div className={styles.container}>
      {/* Notification Toast */}
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)}>×</button>
        </div>
      )}

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
          <button onClick={loadData} className={styles.refreshBtn} title="Refresh data">
            <RefreshCw size={16} />
          </button>
          <button onClick={handleLogout} className={styles.logoutBtn}>
            <LogOut size={16} />
            <span>Secure Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className={styles.mainContainer}>
        {/* Sidebar Navigation */}
        <aside className={styles.sidebar}>
          <nav className={styles.sidebarNav}>
            <button 
              className={`${styles.navItem} ${activeTab === 'overview' ? styles.active : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <BarChart3 size={18} />
              <span>Overview</span>
            </button>
            <button 
              className={`${styles.navItem} ${activeTab === 'quick-onboard' ? styles.active : ''}`}
              onClick={() => setActiveTab('quick-onboard')}
            >
              <Zap size={18} />
              <span>Quick Onboard</span>
            </button>
            <button 
              className={`${styles.navItem} ${activeTab === 'account-tools' ? styles.active : ''}`}
              onClick={() => setActiveTab('account-tools')}
            >
              <Settings size={18} />
              <span>Account Tools</span>
            </button>
            <div className={styles.navDivider} />
            <button 
              className={`${styles.navItem} ${activeTab === 'firms' ? styles.active : ''}`}
              onClick={() => setActiveTab('firms')}
            >
              <Building2 size={18} />
              <span>Firms</span>
              <span className={styles.navBadge}>{firms.length}</span>
            </button>
            <button 
              className={`${styles.navItem} ${activeTab === 'users' ? styles.active : ''}`}
              onClick={() => setActiveTab('users')}
            >
              <Users size={18} />
              <span>Users</span>
              <span className={styles.navBadge}>{users.length}</span>
            </button>
            <div className={styles.navDivider} />
            <button 
              className={`${styles.navItem} ${activeTab === 'migration' ? styles.active : ''}`}
              onClick={() => setActiveTab('migration')}
            >
              <Upload size={18} />
              <span>Migration</span>
            </button>
            <button 
              className={`${styles.navItem} ${activeTab === 'audit' ? styles.active : ''}`}
              onClick={() => setActiveTab('audit')}
            >
              <Activity size={18} />
              <span>Audit Log</span>
            </button>
            <button 
              className={`${styles.navItem} ${activeTab === 'integrations' ? styles.active : ''}`}
              onClick={() => { setActiveTab('integrations'); loadIntegrationSettings(); }}
            >
              <Key size={18} />
              <span>Integrations</span>
            </button>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className={styles.mainContent}>
          {isLoading ? (
            <div className={styles.loading}>
              <RefreshCw size={32} className={styles.spinner} />
              <span>Loading...</span>
            </div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && detailedStats && (
                <div className={styles.overviewTab}>
                  <h2 className={styles.pageTitle}>Platform Overview</h2>
                  
                  {/* Key Metrics */}
                  <div className={styles.metricsGrid}>
                    <div className={styles.metricCard}>
                      <div className={styles.metricIcon} style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
                        <Building2 size={24} style={{ color: '#3b82f6' }} />
                      </div>
                      <div className={styles.metricContent}>
                        <span className={styles.metricValue}>{detailedStats.overview.total_firms}</span>
                        <span className={styles.metricLabel}>Total Firms</span>
                        <span className={styles.metricTrend}>
                          <TrendingUp size={14} />
                          +{detailedStats.overview.new_firms_30d} this month
                        </span>
                      </div>
                    </div>
                    <div className={styles.metricCard}>
                      <div className={styles.metricIcon} style={{ background: 'rgba(34, 197, 94, 0.1)' }}>
                        <Users size={24} style={{ color: '#22c55e' }} />
                      </div>
                      <div className={styles.metricContent}>
                        <span className={styles.metricValue}>{detailedStats.overview.total_users}</span>
                        <span className={styles.metricLabel}>Total Users</span>
                        <span className={styles.metricTrend}>
                          <TrendingUp size={14} />
                          +{detailedStats.overview.new_users_30d} this month
                        </span>
                      </div>
                    </div>
                    <div className={styles.metricCard}>
                      <div className={styles.metricIcon} style={{ background: 'rgba(251, 191, 36, 0.1)' }}>
                        <UserCheck size={24} style={{ color: '#fbbf24' }} />
                      </div>
                      <div className={styles.metricContent}>
                        <span className={styles.metricValue}>{detailedStats.overview.active_users}</span>
                        <span className={styles.metricLabel}>Active Users</span>
                        <span className={styles.metricSubtext}>
                          {detailedStats.overview.active_today} active today
                        </span>
                      </div>
                    </div>
                    <div className={styles.metricCard}>
                      <div className={styles.metricIcon} style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
                        <AlertCircle size={24} style={{ color: '#ef4444' }} />
                      </div>
                      <div className={styles.metricContent}>
                        <span className={styles.metricValue}>{detailedStats.overview.unverified_users}</span>
                        <span className={styles.metricLabel}>Unverified Users</span>
                        <span className={styles.metricSubtext}>
                          Need email verification
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Secondary Stats */}
                  <div className={styles.secondaryStats}>
                    <div className={styles.statItem}>
                      <Briefcase size={16} />
                      <span>{detailedStats.overview.total_matters} Matters</span>
                    </div>
                    <div className={styles.statItem}>
                      <Users size={16} />
                      <span>{detailedStats.overview.total_clients} Clients</span>
                    </div>
                    <div className={styles.statItem}>
                      <Clock size={16} />
                      <span>{detailedStats.overview.total_time_entries} Time Entries</span>
                    </div>
                    <div className={styles.statItem}>
                      <FileText size={16} />
                      <span>{detailedStats.overview.total_documents} Documents</span>
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div className={styles.recentGrid}>
                    <div className={styles.recentCard}>
                      <h3>Recent Firms</h3>
                      <div className={styles.recentList}>
                        {detailedStats.recentFirms.slice(0, 5).map(firm => (
                          <div key={firm.id} className={styles.recentItem}>
                            <div className={styles.recentIcon}>
                              <Building2 size={16} />
                            </div>
                            <div className={styles.recentInfo}>
                              <span className={styles.recentName}>{firm.name}</span>
                              <span className={styles.recentMeta}>{firm.user_count} users</span>
                            </div>
                            <span className={styles.recentDate}>
                              {new Date(firm.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className={styles.recentCard}>
                      <h3>Recent Users</h3>
                      <div className={styles.recentList}>
                        {detailedStats.recentUsers.slice(0, 5).map(user => (
                          <div key={user.id} className={styles.recentItem}>
                            <div className={styles.recentIcon}>
                              <Users size={16} />
                            </div>
                            <div className={styles.recentInfo}>
                              <span className={styles.recentName}>{user.first_name} {user.last_name}</span>
                              <span className={styles.recentMeta}>{user.firm_name || 'No firm'}</span>
                            </div>
                            <span className={styles.recentDate}>
                              {new Date(user.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Top Firms */}
                  <div className={styles.topFirmsCard}>
                    <h3>Top Firms by User Count</h3>
                    <div className={styles.topFirmsList}>
                      {detailedStats.topFirms.slice(0, 5).map((firm, index) => (
                        <div key={firm.id} className={styles.topFirmItem}>
                          <span className={styles.topFirmRank}>#{index + 1}</span>
                          <span className={styles.topFirmName}>{firm.name}</span>
                          <span className={styles.topFirmCount}>{firm.user_count} users</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Onboard Tab */}
              {activeTab === 'quick-onboard' && (
                <div className={styles.quickOnboardTab}>
                  <h2 className={styles.pageTitle}>
                    <Zap size={24} />
                    Quick Onboard
                  </h2>
                  <p className={styles.pageSubtitle}>Create a new firm with an admin user in one step</p>

                  <form onSubmit={handleQuickOnboard} className={styles.onboardForm}>
                    <div className={styles.formSection}>
                      <h3><Building2 size={18} /> Firm Information</h3>
                      <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                          <label>Firm Name *</label>
                          <input
                            type="text"
                            value={onboardForm.firmName}
                            onChange={e => setOnboardForm({ ...onboardForm, firmName: e.target.value })}
                            placeholder="Smith & Associates LLC"
                            required
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Domain</label>
                          <input
                            type="text"
                            value={onboardForm.firmDomain}
                            onChange={e => setOnboardForm({ ...onboardForm, firmDomain: e.target.value })}
                            placeholder="smithlaw.com"
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Firm Email</label>
                          <input
                            type="email"
                            value={onboardForm.firmEmail}
                            onChange={e => setOnboardForm({ ...onboardForm, firmEmail: e.target.value })}
                            placeholder="contact@smithlaw.com"
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Phone</label>
                          <input
                            type="tel"
                            value={onboardForm.firmPhone}
                            onChange={e => setOnboardForm({ ...onboardForm, firmPhone: e.target.value })}
                            placeholder="(555) 123-4567"
                          />
                        </div>
                      </div>
                    </div>

                    <div className={styles.formSection}>
                      <h3><UserPlus size={18} /> Admin User</h3>
                      <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                          <label>First Name *</label>
                          <input
                            type="text"
                            value={onboardForm.adminFirstName}
                            onChange={e => setOnboardForm({ ...onboardForm, adminFirstName: e.target.value })}
                            placeholder="John"
                            required
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Last Name *</label>
                          <input
                            type="text"
                            value={onboardForm.adminLastName}
                            onChange={e => setOnboardForm({ ...onboardForm, adminLastName: e.target.value })}
                            placeholder="Smith"
                            required
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Email *</label>
                          <input
                            type="email"
                            value={onboardForm.adminEmail}
                            onChange={e => setOnboardForm({ ...onboardForm, adminEmail: e.target.value })}
                            placeholder="john@smithlaw.com"
                            required
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Password *</label>
                          <input
                            type="password"
                            value={onboardForm.adminPassword}
                            onChange={e => setOnboardForm({ ...onboardForm, adminPassword: e.target.value })}
                            placeholder="••••••••"
                            minLength={8}
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div className={styles.formActions}>
                      <button type="submit" className={styles.primaryBtn} disabled={isOnboarding}>
                        {isOnboarding ? (
                          <>
                            <RefreshCw size={18} className={styles.spinner} />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Zap size={18} />
                            Create Firm & Admin
                          </>
                        )}
                      </button>
                    </div>
                  </form>

                  {onboardResult && (
                    <div className={`${styles.resultCard} ${onboardResult.success ? styles.success : styles.error}`}>
                      {onboardResult.success ? (
                        <>
                          <CheckCircle2 size={24} />
                          <div>
                            <h4>Onboarding Complete!</h4>
                            <p>{onboardResult.message}</p>
                            {onboardResult.firm && onboardResult.user && (
                              <div className={styles.resultDetails}>
                                <div>
                                  <strong>Firm ID:</strong> {onboardResult.firm.id}
                                  <button onClick={() => copyToClipboard(onboardResult.firm.id)} className={styles.copyBtn}>
                                    <Copy size={14} />
                                  </button>
                                </div>
                                <div>
                                  <strong>User ID:</strong> {onboardResult.user.id}
                                  <button onClick={() => copyToClipboard(onboardResult.user.id)} className={styles.copyBtn}>
                                    <Copy size={14} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <XCircle size={24} />
                          <div>
                            <h4>Onboarding Failed</h4>
                            <p>{onboardResult.message}</p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Account Tools Tab */}
              {activeTab === 'account-tools' && (
                <div className={styles.accountToolsTab}>
                  <h2 className={styles.pageTitle}>
                    <Settings size={24} />
                    Account Tools
                  </h2>
                  <p className={styles.pageSubtitle}>Search for a user and perform administrative actions</p>

                  {/* Lookup Section */}
                  <div className={styles.lookupSection}>
                    <div className={styles.lookupInput}>
                      <Search size={18} />
                      <input
                        type="text"
                        value={accountLookup}
                        onChange={e => setAccountLookup(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAccountLookup()}
                        placeholder="Search by email or user ID..."
                      />
                      <button onClick={handleAccountLookup} disabled={isLookingUp}>
                        {isLookingUp ? <RefreshCw size={16} className={styles.spinner} /> : 'Lookup'}
                      </button>
                    </div>
                  </div>

                  {lookupResult && (
                    <div className={styles.lookupResult}>
                      {/* User Info Card */}
                      <div className={styles.userInfoCard}>
                        <div className={styles.userInfoHeader}>
                          <div className={styles.userAvatar}>
                            {lookupResult.firstName[0]}{lookupResult.lastName[0]}
                          </div>
                          <div className={styles.userBasicInfo}>
                            <h3>{lookupResult.firstName} {lookupResult.lastName}</h3>
                            <p>{lookupResult.email}</p>
                            <div className={styles.userBadges}>
                              <span className={`${styles.badge} ${lookupResult.isActive ? styles.active : styles.inactive}`}>
                                {lookupResult.isActive ? 'Active' : 'Inactive'}
                              </span>
                              <span className={`${styles.badge} ${styles.role}`}>{lookupResult.role}</span>
                              {lookupResult.emailVerified ? (
                                <span className={`${styles.badge} ${styles.verified}`}>
                                  <Mail size={12} /> Verified
                                </span>
                              ) : (
                                <span className={`${styles.badge} ${styles.unverified}`}>
                                  <Mail size={12} /> Unverified
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className={styles.userDetails}>
                          <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>User ID</span>
                            <span className={styles.detailValue}>
                              {lookupResult.id}
                              <button onClick={() => copyToClipboard(lookupResult.id)} className={styles.copyBtn}>
                                <Copy size={14} />
                              </button>
                            </span>
                          </div>
                          <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Firm</span>
                            <span className={styles.detailValue}>{lookupResult.firmName || 'N/A'}</span>
                          </div>
                          <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Firm ID</span>
                            <span className={styles.detailValue}>
                              {lookupResult.firmId}
                              <button onClick={() => copyToClipboard(lookupResult.firmId)} className={styles.copyBtn}>
                                <Copy size={14} />
                              </button>
                            </span>
                          </div>
                          <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Last Login</span>
                            <span className={styles.detailValue}>
                              {lookupResult.lastLoginAt ? new Date(lookupResult.lastLoginAt).toLocaleString() : 'Never'}
                            </span>
                          </div>
                          <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Created</span>
                            <span className={styles.detailValue}>
                              {new Date(lookupResult.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>Time Entries</span>
                            <span className={styles.detailValue}>{lookupResult.stats.timeEntriesCount}</span>
                          </div>
                        </div>
                      </div>

                      {/* Action Cards */}
                      <div className={styles.actionCards}>
                        {/* Reset Password */}
                        <div className={styles.actionCard}>
                          <h4><Key size={16} /> Reset Password</h4>
                          <div className={styles.actionContent}>
                            <div className={styles.passwordInputWrapper}>
                              <input
                                type={showNewPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="New password (min 8 chars)"
                                minLength={8}
                              />
                              <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}>
                                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            </div>
                            <button 
                              onClick={handleResetPassword} 
                              disabled={!newPassword || newPassword.length < 8}
                              className={styles.actionBtn}
                            >
                              Reset Password
                            </button>
                          </div>
                        </div>

                        {/* Verify Email */}
                        <div className={styles.actionCard}>
                          <h4><Mail size={16} /> Email Verification</h4>
                          <div className={styles.actionContent}>
                            <p>
                              Status: {lookupResult.emailVerified ? (
                                <span className={styles.statusVerified}>Verified</span>
                              ) : (
                                <span className={styles.statusUnverified}>Not Verified</span>
                              )}
                            </p>
                            <button 
                              onClick={handleVerifyEmail} 
                              disabled={lookupResult.emailVerified}
                              className={styles.actionBtn}
                            >
                              Force Verify Email
                            </button>
                          </div>
                        </div>

                        {/* Toggle Status */}
                        <div className={styles.actionCard}>
                          <h4>
                            {lookupResult.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                            Account Status
                          </h4>
                          <div className={styles.actionContent}>
                            <p>
                              Current: {lookupResult.isActive ? (
                                <span className={styles.statusActive}>Active</span>
                              ) : (
                                <span className={styles.statusInactive}>Inactive</span>
                              )}
                            </p>
                            <button 
                              onClick={handleToggleStatus}
                              className={`${styles.actionBtn} ${lookupResult.isActive ? styles.danger : ''}`}
                            >
                              {lookupResult.isActive ? 'Deactivate Account' : 'Activate Account'}
                            </button>
                          </div>
                        </div>

                        {/* Change Role */}
                        <div className={styles.actionCard}>
                          <h4><UserPlus size={16} /> Change Role</h4>
                          <div className={styles.actionContent}>
                            <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)}>
                              <option value="owner">Owner</option>
                              <option value="admin">Admin</option>
                              <option value="attorney">Attorney</option>
                              <option value="paralegal">Paralegal</option>
                              <option value="staff">Staff</option>
                              <option value="billing">Billing</option>
                              <option value="readonly">Read Only</option>
                            </select>
                            <button 
                              onClick={handleChangeRole}
                              disabled={selectedRole === lookupResult.role}
                              className={styles.actionBtn}
                            >
                              Update Role
                            </button>
                          </div>
                        </div>

                        {/* Transfer Firm */}
                        <div className={styles.actionCard}>
                          <h4><ArrowRightLeft size={16} /> Transfer to Firm</h4>
                          <div className={styles.actionContent}>
                            <select 
                              value={selectedFirmForTransfer} 
                              onChange={e => setSelectedFirmForTransfer(e.target.value)}
                            >
                              <option value="">Select firm...</option>
                              {firms.filter(f => f.id !== lookupResult.firmId).map(firm => (
                                <option key={firm.id} value={firm.id}>{firm.name}</option>
                              ))}
                            </select>
                            <button 
                              onClick={handleTransferFirm}
                              disabled={!selectedFirmForTransfer}
                              className={styles.actionBtn}
                            >
                              Transfer User
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Firms Tab */}
              {activeTab === 'firms' && (
                <div className={styles.listTab}>
                  <div className={styles.listHeader}>
                    <h2 className={styles.pageTitle}>
                      <Building2 size={24} />
                      Firms ({firms.length})
                    </h2>
                    <div className={styles.listActions}>
                      <div className={styles.searchBox}>
                        <Search size={18} />
                        <input
                          type="text"
                          placeholder="Search firms..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                      <button 
                        className={styles.addBtn}
                        onClick={() => { setEditingFirm(null); setShowFirmModal(true) }}
                      >
                        <Plus size={18} />
                        Add Firm
                      </button>
                    </div>
                  </div>

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
                            <td className={styles.firmName}>
                              <button 
                                onClick={() => handleViewFirmDetail(firm)}
                                style={{ 
                                  background: 'none', 
                                  border: 'none', 
                                  color: '#3B82F6', 
                                  cursor: 'pointer',
                                  padding: 0,
                                  fontWeight: 500,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                                title="Click to view firm details & document migration"
                              >
                                <Building2 size={14} />
                                {firm.name}
                                <ArrowRight size={12} style={{ opacity: 0.5 }} />
                              </button>
                            </td>
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
                                onClick={() => handleViewFirmDetail(firm)}
                                className={styles.viewBtn}
                                title="View firm details & document migration"
                                style={{ background: '#3B82F6' }}
                              >
                                <HardDrive size={14} />
                              </button>
                              <button 
                                onClick={() => handleScanDocuments(firm.id)}
                                disabled={scanningFirmId === firm.id}
                                className={styles.editBtn}
                                title="Quick scan Azure files"
                                style={{ background: scanningFirmId === firm.id ? '#6B7280' : '#10B981' }}
                              >
                                {scanningFirmId === firm.id ? <Clock size={14} className="animate-spin" /> : <FolderSync size={14} />}
                              </button>
                              <button 
                                onClick={() => { setEditingFirm(firm); setShowFirmModal(true) }}
                                className={styles.editBtn}
                                title="Edit firm"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeleteFirm(firm.id)}
                                className={styles.deleteBtn}
                                title="Delete firm"
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
                </div>
              )}

              {/* Users Tab */}
              {activeTab === 'users' && (
                <div className={styles.listTab}>
                  <div className={styles.listHeader}>
                    <h2 className={styles.pageTitle}>
                      <Users size={24} />
                      Users ({users.length})
                    </h2>
                    <div className={styles.listActions}>
                      <div className={styles.searchBox}>
                        <Search size={18} />
                        <input
                          type="text"
                          placeholder="Search users..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                      <button 
                        className={styles.secondaryBtn}
                        onClick={() => setShowBulkModal(true)}
                      >
                        <Upload size={18} />
                        Bulk Import
                      </button>
                      <button 
                        className={styles.addBtn}
                        onClick={() => { setEditingUser(null); setShowUserModal(true) }}
                      >
                        <Plus size={18} />
                        Add User
                      </button>
                    </div>
                  </div>

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
                                onClick={() => { 
                                  setAccountLookup(user.email)
                                  setActiveTab('account-tools')
                                  setTimeout(() => handleAccountLookup(), 100)
                                }}
                                className={styles.viewBtn}
                                title="View in Account Tools"
                              >
                                <ExternalLink size={14} />
                              </button>
                              <button 
                                onClick={() => resetPasswordAndCopy(user)}
                                className={styles.viewBtn}
                                title="Reset password & copy welcome email"
                                style={{ background: '#8B5CF6' }}
                              >
                                <Key size={14} />
                              </button>
                              <button 
                                onClick={() => { setEditingUser(user); setShowUserModal(true) }}
                                className={styles.editBtn}
                                title="Edit user"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeleteUser(user.id)}
                                className={styles.deleteBtn}
                                title="Delete user"
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
                </div>
              )}

              {/* Migration Tab */}
              {activeTab === 'migration' && (
                <div className={styles.migrationContainer}>
                  <h2 className={styles.pageTitle}>
                    <Upload size={24} />
                    Data Migration
                  </h2>

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
                        <h3>Import Firm Data from Clio</h3>
                        <p>Migrate a law firm's data from Clio to Apex Legal. Use AI to automatically transform any data format, or upload pre-formatted JSON.</p>
                      </div>

                      {/* Mode Toggle */}
                      <div className={styles.aiModeToggle}>
                        <button 
                          className={`${styles.modeBtn} ${migrationMode === 'clio' ? styles.activeMode : ''}`}
                          onClick={() => setMigrationMode('clio')}
                        >
                          <Zap size={18} />
                          Clio API
                          <span className={styles.aiLabel}>Recommended</span>
                        </button>
                        <button 
                          className={`${styles.modeBtn} ${migrationMode === 'csv' && aiMode ? styles.activeMode : ''}`}
                          onClick={() => { setMigrationMode('csv'); setAiMode(true); }}
                        >
                          <Upload size={18} />
                          CSV Import
                        </button>
                        <button 
                          className={`${styles.modeBtn} ${migrationMode === 'csv' && !aiMode ? styles.activeMode : ''}`}
                          onClick={() => { setMigrationMode('csv'); setAiMode(false); }}
                        >
                          <FileJson size={18} />
                          Manual JSON
                        </button>
                      </div>

                      {/* Clio API Mode */}
                      {migrationMode === 'clio' ? (
                        <div className={styles.aiTransformSection}>
                          <div className={styles.aiHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                              <Zap size={24} />
                              <div>
                                <h4>Connect to Clio API (Recommended)</h4>
                                <p>
                                  Direct API connection pulls all your data automatically with intact relationships.
                                  No CSV exports needed - just connect and import.
                                </p>
                              </div>
                            </div>
                            {/* Reset button - always visible */}
                            {(clioConnectionId || clioProgress) && (
                              <button 
                                onClick={disconnectClio}
                                className={styles.secondaryBtn}
                                style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                              >
                                <RefreshCw size={16} />
                                Reset & Start New
                              </button>
                            )}
                          </div>

                          {/* Clio Connection */}
                          <div className={styles.migrationSection}>
                            <div className={styles.sectionHeader}>
                              <Key size={18} />
                              <h4>1. Connect to Clio</h4>
                            </div>
                            
                            {!clioConnectionId ? (
                              <div className={styles.clioConnect}>
                                {/* Option to use existing firm */}
                                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '8px' }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.5rem' }}>
                                    <input 
                                      type="checkbox" 
                                      checked={useExistingFirm} 
                                      onChange={(e) => {
                                        setUseExistingFirm(e.target.checked)
                                        if (!e.target.checked) setSelectedExistingFirmId('')
                                      }} 
                                    />
                                    <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#4ade80' }}>
                                      Migrate to Existing Firm
                                    </span>
                                  </label>
                                  {useExistingFirm && (
                                    <select
                                      value={selectedExistingFirmId}
                                      onChange={(e) => {
                                        setSelectedExistingFirmId(e.target.value)
                                        const firm = firms.find(f => f.id === e.target.value)
                                        if (firm) {
                                          setMigrationInputs(prev => ({ ...prev, firmName: firm.name }))
                                        }
                                      }}
                                      style={{ 
                                        width: '100%', 
                                        padding: '0.5rem', 
                                        borderRadius: '6px', 
                                        background: '#1a1a2e', 
                                        border: '1px solid #2d2d4a',
                                        color: '#e5e7eb'
                                      }}
                                    >
                                      <option value="">Select a firm...</option>
                                      {firms.map(f => (
                                        <option key={f.id} value={f.id}>{f.name} ({f.users_count} users)</option>
                                      ))}
                                    </select>
                                  )}
                                </div>

                                {!useExistingFirm && (
                                  <div className={styles.inputField}>
                                    <label htmlFor="clio-firm-name">New Firm Name *</label>
                                    <input
                                      id="clio-firm-name"
                                      type="text"
                                      value={migrationInputs.firmName}
                                      onChange={(e) => setMigrationInputs(prev => ({ ...prev, firmName: e.target.value }))}
                                      placeholder="Enter the firm name for this import"
                                    />
                                  </div>
                                )}
                                
                                <p className={styles.sectionDescription} style={{ marginTop: '1rem' }}>
                                  Get your credentials from <strong>Clio → Settings → Developer Applications</strong> → Create an app.
                                  <br />Use these values:
                                  <br />• <strong>Website URL:</strong> https://strappedai.com
                                  <br />• <strong>Redirect URI:</strong> https://strappedai-gpfra9f8gsg9d9hy.canadacentral-01.azurewebsites.net/api/migration/clio/callback
                                </p>
                                <div className={styles.inputField}>
                                  <label htmlFor="clio-client-id">Client ID</label>
                                  <input
                                    id="clio-client-id"
                                    type="text"
                                    value={clioClientId}
                                    onChange={(e) => setClioClientId(e.target.value)}
                                    placeholder="Paste your Clio Client ID"
                                  />
                                </div>
                                <div className={styles.inputField}>
                                  <label htmlFor="clio-client-secret">Client Secret</label>
                                  <input
                                    id="clio-client-secret"
                                    type="password"
                                    value={clioClientSecret}
                                    onChange={(e) => setClioClientSecret(e.target.value)}
                                    placeholder="Paste your Clio Client Secret"
                                  />
                                </div>
                                
                                {/* Data to Import */}
                                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px' }}>
                                  <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem', color: '#93c5fd' }}>
                                    <strong>Select Data to Import:</strong>
                                  </p>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                      <input type="checkbox" checked={includeUsers} onChange={(e) => setIncludeUsers(e.target.checked)} />
                                      <span style={{ fontSize: '0.85rem' }}>Users</span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                      <input type="checkbox" checked={includeContacts} onChange={(e) => setIncludeContacts(e.target.checked)} />
                                      <span style={{ fontSize: '0.85rem' }}>Contacts</span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                      <input type="checkbox" checked={includeMatters} onChange={(e) => setIncludeMatters(e.target.checked)} />
                                      <span style={{ fontSize: '0.85rem' }}>Matters</span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                      <input type="checkbox" checked={includeActivities} onChange={(e) => setIncludeActivities(e.target.checked)} />
                                      <span style={{ fontSize: '0.85rem' }}>Time Entries</span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                      <input type="checkbox" checked={includeBills} onChange={(e) => setIncludeBills(e.target.checked)} />
                                      <span style={{ fontSize: '0.85rem' }}>Bills</span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                      <input type="checkbox" checked={includeCalendar} onChange={(e) => setIncludeCalendar(e.target.checked)} />
                                      <span style={{ fontSize: '0.85rem' }}>Calendar</span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', background: 'rgba(124, 58, 237, 0.1)', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(124, 58, 237, 0.3)' }}>
                                      <input type="checkbox" checked={includeDocuments} onChange={(e) => setIncludeDocuments(e.target.checked)} />
                                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#7C3AED' }}>Documents (Stream to Azure)</span>
                                    </label>
                                  </div>
                                  {includeDocuments && (
                                    <div style={{ 
                                      marginTop: '0.75rem', 
                                      padding: '0.75rem 1rem', 
                                      background: 'rgba(124, 58, 237, 0.08)', 
                                      borderRadius: '8px',
                                      border: '1px solid rgba(124, 58, 237, 0.2)',
                                      fontSize: '0.8rem',
                                      color: '#6B7280'
                                    }}>
                                      <strong style={{ color: '#7C3AED' }}>Requires Azure Storage:</strong> Go to{' '}
                                      <strong>Platform Settings → Azure Storage (Apex Drive)</strong> and enter your storage account name, key, and file share name.
                                      Without this, documents will be skipped during migration.
                                    </div>
                                  )}
                                </div>
                                
                                {/* User-Specific Migration */}
                                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.5rem' }}>
                                    <input 
                                      type="checkbox" 
                                      checked={filterByUser} 
                                      onChange={(e) => {
                                        setFilterByUser(e.target.checked)
                                        if (!e.target.checked) setFilterUserEmail('')
                                      }} 
                                    />
                                    <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#F59E0B' }}>
                                      Migrate Specific User Only
                                    </span>
                                  </label>
                                  <p style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.5rem' }}>
                                    Only migrate matters where this user is the responsible attorney, plus their time entries, bills, and calendar events.
                                  </p>
                                  {filterByUser && (
                                    <input
                                      type="email"
                                      value={filterUserEmail}
                                      onChange={(e) => setFilterUserEmail(e.target.value)}
                                      placeholder="Enter user email from Clio (e.g. john@firm.com)"
                                      style={{ 
                                        width: '100%', 
                                        padding: '0.5rem', 
                                        borderRadius: '6px', 
                                        background: '#1a1a2e', 
                                        border: '1px solid #2d2d4a',
                                        color: '#e5e7eb',
                                        fontSize: '0.85rem'
                                      }}
                                    />
                                  )}
                                </div>
                                
                                <button 
                                  onClick={connectToClio}
                                  disabled={clioImporting || !clioClientId.trim() || !clioClientSecret.trim() || !migrationInputs.firmName.trim() || (filterByUser && !filterUserEmail.trim())}
                                  className={styles.primaryBtn}
                                  style={{ marginTop: '1rem' }}
                                >
                                  {clioImporting ? (
                                    <><RefreshCw size={18} className={styles.spinner} /> Connecting...</>
                                  ) : (
                                    <><Zap size={18} /> Connect & Import from Clio</>
                                  )}
                                </button>
                              </div>
                            ) : (
                              <div className={styles.clioConnected}>
                                <div className={styles.connectedBadge}>
                                  <CheckCircle2 size={20} />
                                  <span>Connected as <strong>{clioUser?.name}</strong> ({clioUser?.email})</span>
                                </div>
                                <button onClick={disconnectClio} className={styles.secondaryBtn}>
                                  Disconnect
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Firm Name */}
                          {clioConnectionId && (
                            <>
                              <div className={styles.migrationSection}>
                                <div className={styles.sectionHeader}>
                                  <Building2 size={18} />
                                  <h4>2. Firm Name for Import</h4>
                                </div>
                                <div className={styles.inputField}>
                                  <label htmlFor="clio-firm-name">Firm Name *</label>
                                  <input
                                    id="clio-firm-name"
                                    type="text"
                                    value={migrationInputs.firmName}
                                    onChange={(e) => setMigrationInputs(prev => ({ ...prev, firmName: e.target.value }))}
                                    placeholder="Enter firm name for the import"
                                  />
                                </div>
                              </div>

                              {/* Import Button */}
                              <div className={styles.migrationSection}>
                                <div className={styles.sectionHeader}>
                                  <Download size={18} />
                                  <h4>3. Start Import</h4>
                                </div>
                                <p className={styles.sectionDescription}>
                                  This will pull all data from Clio: Users, Contacts, Matters, Time Entries, Bills, and Calendar Events.
                                  The process runs in the background and may take several minutes for large firms.
                                </p>
                                <button 
                                  onClick={startClioImport}
                                  disabled={clioImporting || !migrationInputs.firmName.trim()}
                                  className={styles.primaryBtn}
                                >
                                  {clioImporting ? (
                                    <><RefreshCw size={18} className={styles.spinner} /> Importing from Clio...</>
                                  ) : (
                                    <><Download size={18} /> Start Clio Import</>
                                  )}
                                </button>
                              </div>

                              {/* Progress */}
                              {clioProgress && clioProgress.steps && (
                                <div className={styles.migrationSection}>
                                  <div className={styles.sectionHeader}>
                                    <Activity size={18} />
                                    <h4>Import Progress</h4>
                                  </div>
                                  <div className={styles.clioProgress}>
                                    {Object.entries(clioProgress.steps).map(([step, info]) => (
                                      <div key={step} className={`${styles.progressItem} ${styles[info.status]}`}>
                                        <span className={styles.progressLabel}>{step}</span>
                                        <span className={styles.progressStatus}>
                                          {info.status === 'done' ? (
                                            <><CheckCircle2 size={16} /> {info.count}</>
                                          ) : info.status === 'running' ? (
                                            <><RefreshCw size={16} className={styles.spinner} /> {info.count}...</>
                                          ) : info.status === 'error' ? (
                                            <><XCircle size={16} /> Error: {info.error || 'Unknown'}</>
                                          ) : info.status === 'skipped' ? (
                                            <><X size={16} /> Skipped</>
                                          ) : (
                                            <><Clock size={16} /> Pending</>
                                          )}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                  
                                  {/* Migration Logs */}
                                  {clioProgress.logs && clioProgress.logs.length > 0 && (
                                    <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#1a1a2e', borderRadius: '8px', maxHeight: '200px', overflow: 'auto' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <strong style={{ fontSize: '0.875rem', color: '#888' }}>Migration Log</strong>
                                        <button 
                                          onClick={() => copyToClipboard(clioProgress.logs?.join('\n') || '')}
                                          style={{ background: 'none', border: 'none', color: '#8B5CF6', cursor: 'pointer', fontSize: '0.75rem' }}
                                        >
                                          <Copy size={12} /> Copy
                                        </button>
                                      </div>
                                      <pre style={{ fontSize: '0.75rem', color: '#ccc', margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                                        {clioProgress.logs.slice(-50).join('\n')}
                                      </pre>
                                    </div>
                                  )}
                                  {clioProgress.status === 'completed' && clioProgress.summary && (
                                    <>
                                      <div className={styles.clioSummary} style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', padding: '1.5rem', borderRadius: '12px', marginBottom: '1rem' }}>
                                        <CheckCircle2 size={32} />
                                        <div>
                                          <strong style={{ fontSize: '1.25rem' }}>🎉 Migration Complete!</strong>
                                          <p style={{ marginTop: '0.5rem', opacity: 0.9 }}>
                                            Successfully imported: {clioProgress.summary.users} users, {clioProgress.summary.contacts} contacts, 
                                            {clioProgress.summary.matters} matters, {clioProgress.summary.activities} time entries,
                                            {clioProgress.summary.bills} bills, {clioProgress.summary.calendar_entries || clioProgress.summary.calendar} calendar events
                                          </p>
                                        </div>
                                      </div>
                                      
                                      {/* Start New Migration Button */}
                                      <div style={{ marginBottom: '1rem', textAlign: 'right' }}>
                                        <button 
                                          onClick={disconnectClio}
                                          className={styles.secondaryBtn}
                                          style={{ marginRight: '0.5rem' }}
                                        >
                                          <Plus size={16} /> Start New Migration
                                        </button>
                                      </div>
                                      
                                      {/* User Credentials Section */}
                                      {Array.isArray(clioProgress.summary.userCredentials) && clioProgress.summary.userCredentials.length > 0 ? (
                                        <div className={styles.credentialsSection} style={{ marginTop: '1rem', border: '2px solid #F59E0B', background: 'rgba(245, 158, 11, 0.1)' }}>
                                          <div className={styles.credentialsHeader}>
                                            <Key size={20} />
                                            <h4>🔐 User Login Credentials ({clioProgress.summary.userCredentials.length} users)</h4>
                                            <button 
                                              onClick={() => {
                                                const creds = clioProgress.summary?.userCredentials as { email: string; firstName: string; name: string; password: string; role: string }[]
                                                const credText = creds.map(u => 
                                                  `${u.name} (${u.role})\nEmail: ${u.email}\nPassword: ${u.password}\n`
                                                ).join('\n---\n')
                                                copyToClipboard(credText)
                                              }}
                                              className={styles.copyAllBtn}
                                            >
                                              <Copy size={14} />
                                              Copy All
                                            </button>
                                          </div>
                                          <p className={styles.credentialsNote} style={{ background: '#FEF3C7', color: '#92400E', padding: '0.75rem', borderRadius: '8px', fontWeight: 600 }}>
                                            ⚠️ IMPORTANT: Save these passwords now! They cannot be retrieved later.
                                          </p>
                                          <div className={styles.credentialsList}>
                                            {(clioProgress.summary.userCredentials as { email: string; firstName: string; lastName: string; name: string; password: string; role: string }[]).map((cred, idx) => (
                                              <div key={idx} className={styles.credentialCard}>
                                                <div className={styles.credentialName}>
                                                  <span>{cred.name}</span>
                                                  <span className={styles.credentialRole}>{cred.role}</span>
                                                </div>
                                                <div className={styles.credentialDetails}>
                                                  <div className={styles.credentialRow}>
                                                    <Mail size={14} />
                                                    <span>{cred.email}</span>
                                                    <button onClick={() => copyToClipboard(cred.email)} title="Copy email">
                                                      <Copy size={12} />
                                                    </button>
                                                  </div>
                                                  <div className={styles.credentialRow}>
                                                    <Key size={14} />
                                                    <code>{cred.password}</code>
                                                    <button onClick={() => copyToClipboard(cred.password)} title="Copy password">
                                                      <Copy size={12} />
                                                    </button>
                                                  </div>
                                                  <div className={styles.credentialRow} style={{ marginTop: '0.5rem' }}>
                                                    <button 
                                                      onClick={() => {
                                                        const welcomeEmail = `Dear ${cred.firstName},

\tWelcome to Strapped AI! Your login details are below. Get comfortable with your Apex AI, and navigate to the integrations page to link your email account and your calendar. If you have any questions feel free to reach out to us at admin@strappedai.com.

Username: ${cred.email}
Password: ${cred.password}`
                                                        copyToClipboard(welcomeEmail)
                                                        showNotification('success', 'Welcome email copied to clipboard!')
                                                      }}
                                                      className={styles.secondaryBtn}
                                                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                                      title="Copy welcome email"
                                                    >
                                                      <Mail size={12} />
                                                      Copy Welcome Email
                                                    </button>
                                                  </div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ) : (
                                        <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(100, 100, 100, 0.1)', borderRadius: '8px' }}>
                                          <p style={{ color: '#888', margin: 0 }}>
                                            ℹ️ No new user accounts were created. Users may have been skipped due to missing email addresses, 
                                            or imported to an existing firm where accounts already existed.
                                          </p>
                                          <p style={{ color: '#888', marginTop: '0.5rem', fontSize: '0.875rem' }}>
                                            To reset a user's password, go to the <strong>Users</strong> tab and click the 🔑 key icon next to any user.
                                          </p>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </>
                          )}

                          {/* Show data review and import options when Clio data is fetched */}
                          {transformResult?.success && (
                            <div className={styles.migrationSection}>
                              <div className={styles.sectionHeader}>
                                <CheckCircle2 size={18} />
                                <h4>Data Ready for Import</h4>
                              </div>
                              
                              <div className={styles.clioDataSummary}>
                                <p>
                                  <strong>{transformResult.summary?.users || 0}</strong> users, 
                                  <strong> {transformResult.summary?.contacts || 0}</strong> contacts, 
                                  <strong> {transformResult.summary?.matters || 0}</strong> matters, 
                                  <strong> {transformResult.summary?.activities || 0}</strong> time entries, 
                                  <strong> {transformResult.summary?.calendar_entries || 0}</strong> calendar events
                                </p>
                              </div>

                              {/* Data Editor Toggle */}
                              <div className={styles.dataEditorSection}>
                                <button 
                                  onClick={() => {
                                    const editor = document.getElementById('clio-data-editor')
                                    if (editor) {
                                      editor.style.display = editor.style.display === 'none' ? 'block' : 'none'
                                    }
                                  }}
                                  className={styles.secondaryBtn}
                                  style={{ marginBottom: '0.5rem' }}
                                >
                                  <FileJson size={16} />
                                  Edit Data (Advanced)
                                </button>
                                <textarea
                                  id="clio-data-editor"
                                  style={{ display: 'none', width: '100%', height: '300px', fontFamily: 'monospace', fontSize: '12px' }}
                                  value={migrationData}
                                  onChange={(e) => setMigrationData(e.target.value)}
                                />
                                <p className={styles.sectionDescription} style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                                  Edit the JSON data to remove users or fix any issues before importing.
                                </p>
                              </div>

                              <div className={styles.aiActions}>
                                <button 
                                  onClick={handleValidateMigration}
                                  className={styles.secondaryBtn}
                                >
                                  <AlertTriangle size={18} />
                                  Validate First (Optional)
                                </button>
                                <button 
                                  onClick={async () => {
                                    if (!migrationData.trim()) {
                                      showNotification('error', 'No data to import')
                                      return
                                    }
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
                                      if (result.success) {
                                        showNotification('success', `✅ Migration complete! Created firm "${result.firm_name}"`)
                                        await loadData()
                                      } else {
                                        showNotification('error', `Import had issues: ${result.errors?.slice(0, 2).join(', ') || 'Check results'}`)
                                      }
                                    } catch (error) {
                                      console.error('Import error:', error)
                                      showNotification('error', 'Failed to import. Check JSON format.')
                                    }
                                    setIsMigrating(false)
                                  }}
                                  disabled={isMigrating}
                                  className={styles.primaryBtn}
                                >
                                  {isMigrating ? (
                                    <><RefreshCw size={18} className={styles.spinner} /> Importing...</>
                                  ) : (
                                    <><Upload size={18} /> Import to Database</>
                                  )}
                                </button>
                              </div>
                              
                              <p className={styles.sectionDescription} style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
                                <strong>Note:</strong> Duplicate users/matters are handled automatically - 
                                existing users will be linked, and matter numbers will be made unique.
                              </p>
                            </div>
                          )}
                        </div>
                      ) : aiMode ? (
                        <div className={styles.aiTransformSection}>
                          <div className={styles.aiHeader}>
                            <Upload size={24} />
                            <div>
                              <h4>Import from Clio (or any Case Management Software)</h4>
                              <p>
                                <strong>Step 1:</strong> Fill in firm info and paste your CSV exports below<br />
                                <strong>Step 2:</strong> Click "Parse CSV Data" to convert<br />
                                <strong>Step 3:</strong> Click "Validate Data" to check for errors<br />
                                <strong>Step 4:</strong> Click "Execute Import" to save to database
                              </p>
                            </div>
                          </div>

                          {/* Firm Information */}
                          <div className={styles.migrationSection}>
                            <div className={styles.sectionHeader}>
                              <Building2 size={18} />
                              <h4>1. Firm Information</h4>
                            </div>
                            <div className={styles.firmInputGrid}>
                              <div className={styles.inputField}>
                                <label htmlFor="mig-firm-name">Firm Name *</label>
                                <input
                                  id="mig-firm-name"
                                  name="firmName"
                                  type="text"
                                  autoComplete="organization"
                                  value={migrationInputs.firmName}
                                  onChange={(e) => setMigrationInputs(prev => ({ ...prev, firmName: e.target.value }))}
                                  placeholder="Smith & Associates LLP"
                                />
                              </div>
                              <div className={styles.inputField}>
                                <label htmlFor="mig-firm-email">Firm Email</label>
                                <input
                                  id="mig-firm-email"
                                  name="firmEmail"
                                  type="email"
                                  autoComplete="email"
                                  value={migrationInputs.firmEmail}
                                  onChange={(e) => setMigrationInputs(prev => ({ ...prev, firmEmail: e.target.value }))}
                                  placeholder="info@smithlaw.com"
                                />
                              </div>
                              <div className={styles.inputField}>
                                <label htmlFor="mig-firm-phone">Firm Phone</label>
                                <input
                                  id="mig-firm-phone"
                                  name="firmPhone"
                                  type="tel"
                                  autoComplete="tel"
                                  value={migrationInputs.firmPhone}
                                  onChange={(e) => setMigrationInputs(prev => ({ ...prev, firmPhone: e.target.value }))}
                                  placeholder="555-123-4567"
                                />
                              </div>
                              <div className={styles.inputField}>
                                <label htmlFor="mig-firm-address">Firm Address</label>
                                <input
                                  id="mig-firm-address"
                                  name="firmAddress"
                                  type="text"
                                  autoComplete="street-address"
                                  value={migrationInputs.firmAddress}
                                  onChange={(e) => setMigrationInputs(prev => ({ ...prev, firmAddress: e.target.value }))}
                                  placeholder="123 Legal Way, Boston, MA 02101"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Users */}
                          <div className={styles.migrationSection}>
                            <div className={styles.sectionHeader}>
                              <Users size={18} />
                              <h4>2. Users / Team Members</h4>
                            </div>
                            <p className={styles.sectionDescription}>
                              Copy the user list from <strong>Clio → Settings → Firm → Users</strong> and paste below. 
                              Passwords will be auto-generated and shown after import.
                            </p>
                            <textarea
                              value={migrationInputs.users}
                              onChange={(e) => setMigrationInputs(prev => ({ ...prev, users: e.target.value }))}
                              placeholder={`Name, Email, Role, Rate
Jane Smith, jane@smithlaw.com, Attorney, $400
Bob Johnson, bob@smithlaw.com, Paralegal, $150`}
                              rows={5}
                            />
                            <div className={styles.userAiButton}>
                              <button 
                                onClick={async () => {
                                  if (!migrationInputs.users.trim()) {
                                    showNotification('error', 'Please paste user data first')
                                    return
                                  }
                                  setIsTransforming(true)
                                  try {
                                    const res = await fetch(`${API_URL}/migration/ai-format-users`, {
                                      method: 'POST',
                                      headers: getAuthHeaders(),
                                      body: JSON.stringify({ rawUsers: migrationInputs.users })
                                    })
                                    const result = await res.json()
                                    if (res.ok && result.success) {
                                      setMigrationInputs(prev => ({ ...prev, users: result.formattedCsv }))
                                      showNotification('success', `Formatted ${result.userCount} users into CSV format`)
                                    } else {
                                      showNotification('error', result.error || 'Failed to format users')
                                    }
                                  } catch (err) {
                                    showNotification('error', 'Failed to format users')
                                  }
                                  setIsTransforming(false)
                                }}
                                disabled={isTransforming || !migrationInputs.users.trim()}
                                className={styles.formatUsersBtn}
                              >
                                <Sparkles size={14} />
                                {isTransforming ? 'Formatting...' : 'AI Format to CSV'}
                              </button>
                              <span className={styles.formatHint}>Click to convert messy data into proper CSV format</span>
                            </div>
                          </div>

                          {/* Clients */}
                          <div className={styles.migrationSection}>
                            <div className={styles.sectionHeader}>
                              <UserPlus size={18} />
                              <h4>3. Clients / Contacts</h4>
                              <span className={styles.sectionHint}>From Clio: Contacts → Export → CSV</span>
                            </div>
                            <div className={styles.csvUploadArea}>
                              <input
                                type="file"
                                accept=".csv,.txt"
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) {
                                    const reader = new FileReader()
                                    reader.onload = (evt) => {
                                      setMigrationInputs(prev => ({ ...prev, clients: evt.target?.result as string }))
                                    }
                                    reader.readAsText(file)
                                  }
                                }}
                                id="clients-csv"
                                className={styles.fileInput}
                              />
                              <label htmlFor="clients-csv" className={styles.csvUploadLabel}>
                                <Upload size={20} />
                                <span>{migrationInputs.clients ? '✓ CSV Loaded' : 'Upload Contacts CSV'}</span>
                              </label>
                              {migrationInputs.clients && (
                                <button 
                                  className={styles.clearBtn}
                                  onClick={() => setMigrationInputs(prev => ({ ...prev, clients: '' }))}
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                            {migrationInputs.clients && (
                              <div className={styles.csvPreview}>
                                <span>{migrationInputs.clients.split('\n').length} rows loaded</span>
                              </div>
                            )}
                          </div>

                          {/* Matters */}
                          <div className={styles.migrationSection}>
                            <div className={styles.sectionHeader}>
                              <Briefcase size={18} />
                              <h4>4. Matters / Cases</h4>
                              <span className={styles.sectionHint}>From Clio: Matters → Export → CSV</span>
                            </div>
                            <div className={styles.csvUploadArea}>
                              <input
                                type="file"
                                accept=".csv,.txt"
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) {
                                    const reader = new FileReader()
                                    reader.onload = (evt) => {
                                      setMigrationInputs(prev => ({ ...prev, matters: evt.target?.result as string }))
                                    }
                                    reader.readAsText(file)
                                  }
                                }}
                                id="matters-csv"
                                className={styles.fileInput}
                              />
                              <label htmlFor="matters-csv" className={styles.csvUploadLabel}>
                                <Upload size={20} />
                                <span>{migrationInputs.matters ? '✓ CSV Loaded' : 'Upload Matters CSV'}</span>
                              </label>
                              {migrationInputs.matters && (
                                <button 
                                  className={styles.clearBtn}
                                  onClick={() => setMigrationInputs(prev => ({ ...prev, matters: '' }))}
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                            {migrationInputs.matters && (
                              <div className={styles.csvPreview}>
                                <span>{migrationInputs.matters.split('\n').length} rows loaded</span>
                              </div>
                            )}
                          </div>

                          {/* Time Entries */}
                          <div className={styles.migrationSection}>
                            <div className={styles.sectionHeader}>
                              <Clock size={18} />
                              <h4>5. Time Entries (Optional)</h4>
                              <span className={styles.sectionHint}>From Clio: Activities → Export → CSV</span>
                            </div>
                            <div className={styles.csvUploadArea}>
                              <input
                                type="file"
                                accept=".csv,.txt"
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) {
                                    const reader = new FileReader()
                                    reader.onload = (evt) => {
                                      setMigrationInputs(prev => ({ ...prev, timeEntries: evt.target?.result as string }))
                                    }
                                    reader.readAsText(file)
                                  }
                                }}
                                id="time-csv"
                                className={styles.fileInput}
                              />
                              <label htmlFor="time-csv" className={styles.csvUploadLabel}>
                                <Upload size={20} />
                                <span>{migrationInputs.timeEntries ? '✓ CSV Loaded' : 'Upload Time Entries CSV'}</span>
                              </label>
                              {migrationInputs.timeEntries && (
                                <button 
                                  className={styles.clearBtn}
                                  onClick={() => setMigrationInputs(prev => ({ ...prev, timeEntries: '' }))}
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                            {migrationInputs.timeEntries && (
                              <div className={styles.csvPreview}>
                                <span>{migrationInputs.timeEntries.split('\n').length} rows loaded</span>
                              </div>
                            )}
                          </div>

                          {/* Calendar */}
                          <div className={styles.migrationSection}>
                            <div className={styles.sectionHeader}>
                              <Activity size={18} />
                              <h4>6. Calendar Events (Optional)</h4>
                              <span className={styles.sectionHint}>From Clio: Calendar → Export → CSV</span>
                            </div>
                            <div className={styles.csvUploadArea}>
                              <input
                                type="file"
                                accept=".csv,.txt"
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) {
                                    const reader = new FileReader()
                                    reader.onload = (evt) => {
                                      setMigrationInputs(prev => ({ ...prev, calendarEvents: evt.target?.result as string }))
                                    }
                                    reader.readAsText(file)
                                  }
                                }}
                                id="calendar-csv"
                                className={styles.fileInput}
                              />
                              <label htmlFor="calendar-csv" className={styles.csvUploadLabel}>
                                <Upload size={20} />
                                <span>{migrationInputs.calendarEvents ? '✓ CSV Loaded' : 'Upload Calendar CSV'}</span>
                              </label>
                              {migrationInputs.calendarEvents && (
                                <button 
                                  className={styles.clearBtn}
                                  onClick={() => setMigrationInputs(prev => ({ ...prev, calendarEvents: '' }))}
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                            {migrationInputs.calendarEvents && (
                              <div className={styles.csvPreview}>
                                <span>{migrationInputs.calendarEvents.split('\n').length} rows loaded</span>
                              </div>
                            )}
                          </div>

                          {/* Bills Section */}
                          <div className={styles.migrationSection}>
                            <div className={styles.sectionHeader}>
                              <FileText size={18} />
                              <h4>7. Bills / Invoices</h4>
                            </div>
                            <p className={styles.sectionDescription}>
                              Export from <strong>Clio → Reports → Bills</strong>. 
                              Columns: Invoice#, Matter, Client, Date, Amount, Status, Due Date, Balance
                            </p>
                            <div className={styles.csvUploadArea}>
                              <input
                                type="file"
                                accept=".csv,.txt"
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) {
                                    const reader = new FileReader()
                                    reader.onload = (evt) => {
                                      setMigrationInputs(prev => ({ ...prev, bills: evt.target?.result as string }))
                                    }
                                    reader.readAsText(file)
                                  }
                                }}
                                id="bills-csv"
                                className={styles.fileInput}
                              />
                              <label htmlFor="bills-csv" className={styles.csvUploadLabel}>
                                <Upload size={20} />
                                <span>{migrationInputs.bills ? '✓ CSV Loaded' : 'Upload Bills CSV'}</span>
                              </label>
                              {migrationInputs.bills && (
                                <button 
                                  className={styles.clearBtn}
                                  onClick={() => setMigrationInputs(prev => ({ ...prev, bills: '' }))}
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                            {migrationInputs.bills && (
                              <div className={styles.csvPreview}>
                                <span>{migrationInputs.bills.split('\n').length} rows loaded</span>
                              </div>
                            )}
                          </div>

                          <div className={styles.aiActions}>
                            <button 
                              onClick={handleAITransform}
                              disabled={!migrationInputs.firmName.trim() || isTransforming}
                              className={styles.aiTransformBtn}
                            >
                              {isTransforming ? (
                                <>
                                  <RefreshCw size={18} className={styles.spinner} />
                                  Processing...
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 size={18} />
                                  Parse CSV Data
                                </>
                              )}
                            </button>
                          </div>

                          {/* AI Transform Result */}
                          {transformResult && (
                            <div className={`${styles.transformResult} ${transformResult.success ? styles.success : styles.error}`}>
                              {transformResult.success ? (
                                <>
                                  <div className={styles.transformHeader}>
                                    <CheckCircle2 size={24} />
                                    <div>
                                      <h4>Transformation Successful!</h4>
                                      <p>AI has converted your data to the migration format.</p>
                                    </div>
                                  </div>
                                  <div className={styles.transformSummary}>
                                    <div className={styles.summaryItem}>
                                      <Building2 size={16} />
                                      <span>Firm: {transformResult.summary?.firm}</span>
                                    </div>
                                    <div className={styles.summaryItem}>
                                      <Users size={16} />
                                      <span>{transformResult.summary?.users} Users</span>
                                    </div>
                                    <div className={styles.summaryItem}>
                                      <span>👤</span>
                                      <span>{transformResult.summary?.contacts} Contacts</span>
                                    </div>
                                    <div className={styles.summaryItem}>
                                      <span>📁</span>
                                      <span>{transformResult.summary?.matters} Matters</span>
                                    </div>
                                    <div className={styles.summaryItem}>
                                      <Clock size={16} />
                                      <span>{transformResult.summary?.activities} Activities</span>
                                    </div>
                                    <div className={styles.summaryItem}>
                                      <span>📅</span>
                                      <span>{transformResult.summary?.calendar_entries} Events</span>
                                    </div>
                                  </div>
                                  <p className={styles.transformNote}>The transformed data has been loaded below. Review and proceed to validation.</p>
                                </>
                              ) : (
                                <>
                                  <div className={styles.transformHeader}>
                                    <XCircle size={24} />
                                    <div>
                                      <h4>Transformation Failed</h4>
                                      <p>{transformResult.error}</p>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          )}

                          {/* Show transformed JSON if successful */}
                          {transformResult?.success && migrationData && (
                            <div className={styles.jsonPreview}>
                              <div className={styles.previewHeader}>
                                <h4>Transformed JSON Data</h4>
                                <button onClick={() => copyToClipboard(migrationData)} className={styles.copyBtn}>
                                  <Copy size={14} />
                                  Copy
                                </button>
                              </div>
                              <textarea
                                value={migrationData}
                                onChange={(e) => setMigrationData(e.target.value)}
                                rows={10}
                                className={styles.jsonPreviewText}
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Manual JSON Mode */
                        <>
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
                        </>
                      )}

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
                        <button 
                          onClick={handleExecuteMigration}
                          disabled={isMigrating}
                          className={styles.primaryBtn}
                        >
                          {isMigrating ? 'Importing...' : validationResult.valid ? 'Import Data' : 'Import Anyway (Skip Errors)'}
                          <ChevronRight size={18} />
                        </button>
                      </div>
                      {!validationResult.valid && (
                        <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
                          <strong>Note:</strong> Duplicates and some errors are handled automatically. 
                          Existing users will be linked, matter numbers will be made unique.
                        </p>
                      )}
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
                        <>
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

                          {/* User Credentials */}
                          {importResult.user_credentials && importResult.user_credentials.length > 0 && (
                            <div className={styles.credentialsSection}>
                              <div className={styles.credentialsHeader}>
                                <Key size={20} />
                                <h4>User Login Credentials</h4>
                                <button 
                                  onClick={() => {
                                    const credText = importResult.user_credentials.map(u => 
                                      `${u.name} (${u.role})\nEmail: ${u.email}\nPassword: ${u.password}\n`
                                    ).join('\n---\n')
                                    copyToClipboard(credText)
                                  }}
                                  className={styles.copyAllBtn}
                                >
                                  <Copy size={14} />
                                  Copy All
                                </button>
                              </div>
                              <p className={styles.credentialsNote}>
                                ⚠️ Save these passwords now! They cannot be retrieved later.
                              </p>
                              <div className={styles.credentialsList}>
                                {importResult.user_credentials.map((cred, idx) => (
                                  <div key={idx} className={styles.credentialCard}>
                                    <div className={styles.credentialName}>
                                      <span>{cred.name}</span>
                                      <span className={styles.credentialRole}>{cred.role}</span>
                                    </div>
                                    <div className={styles.credentialDetails}>
                                      <div className={styles.credentialRow}>
                                        <Mail size={14} />
                                        <span>{cred.email}</span>
                                        <button onClick={() => copyToClipboard(cred.email)} title="Copy email">
                                          <Copy size={12} />
                                        </button>
                                      </div>
                                      <div className={styles.credentialRow}>
                                        <Key size={14} />
                                        <code>{cred.password}</code>
                                        <button onClick={() => copyToClipboard(cred.password)} title="Copy password">
                                          <Copy size={12} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
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

              {/* Audit Log Tab */}
              {activeTab === 'audit' && (
                <div className={styles.listTab}>
                  <div className={styles.listHeader}>
                    <h2 className={styles.pageTitle}>
                      <Activity size={24} />
                      Audit Log
                    </h2>
                    <div className={styles.listActions}>
                      <button className={styles.secondaryBtn} onClick={() => {
                        const logData = auditLogs.map(l => `${new Date(l.timestamp).toISOString()},${l.action},${l.user},${l.details},${l.ip_address}`).join('\n');
                        const blob = new Blob([`Timestamp,Action,User,Details,IP Address\n${logData}`], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'audit-logs.csv';
                        a.click();
                        URL.revokeObjectURL(url);
                      }}>
                        <Download size={16} />
                        Export CSV
                      </button>
                    </div>
                  </div>

                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Timestamp</th>
                          <th>Action</th>
                          <th>Admin</th>
                          <th>Target</th>
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
                            <td>{log.target_user || '—'}</td>
                            <td>{log.details}</td>
                            <td className={styles.ipAddress}>{log.ip_address}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {auditLogs.length === 0 && (
                      <div className={styles.emptyState}>No audit logs found</div>
                    )}
                  </div>
                </div>
              )}

              {/* Integrations Tab */}
              {activeTab === 'integrations' && (
                <div className={styles.listTab}>
                  <div className={styles.listHeader}>
                    <h2 className={styles.pageTitle}>
                      <Key size={24} />
                      Integration OAuth Credentials
                    </h2>
                  </div>
                  <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
                    Configure OAuth Client IDs and Secrets for all integrations. Users will be able to connect their accounts once these are configured.
                  </p>

                  {loadingIntegrations ? (
                    <div className={styles.emptyState}>Loading settings...</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      {/* Microsoft/Outlook */}
                      <div className={styles.card} style={{ 
                        borderColor: integrationSettings.microsoft_client_id?.isConfigured && integrationSettings.microsoft_client_secret?.isConfigured ? '#10b981' : undefined, 
                        borderWidth: integrationSettings.microsoft_client_id?.isConfigured && integrationSettings.microsoft_client_secret?.isConfigured ? '2px' : undefined,
                        background: integrationSettings.microsoft_client_id?.isConfigured && integrationSettings.microsoft_client_secret?.isConfigured ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(30, 41, 59, 1) 100%)' : undefined
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                            <span style={{ fontSize: '1.5rem' }}>📧</span> Microsoft (Outlook + Word + OneDrive)
                          </h3>
                          {integrationSettings.microsoft_client_id?.isConfigured && integrationSettings.microsoft_client_secret?.isConfigured && (
                            <span style={{ 
                              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                              color: 'white', 
                              padding: '0.25rem 0.75rem', 
                              borderRadius: '9999px', 
                              fontSize: '0.75rem', 
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}>
                              ✓ Configured
                            </span>
                          )}
                        </div>
                        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
                          <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer" style={{ color: '#d4af37' }}>Register app in Azure Portal →</a>
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div className={styles.formGroup}>
                            <label>Client ID {integrationSettings.microsoft_client_id?.isConfigured && <span style={{ color: '#10b981' }}>✓</span>}</label>
                            <input type="text" value={integrationSettings.microsoft_client_id?.value || ''} onChange={(e) => updateIntegrationSetting('microsoft_client_id', e.target.value)} placeholder="Enter Client ID" style={integrationSettings.microsoft_client_id?.isConfigured ? { borderColor: '#10b981' } : undefined} />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Client Secret {integrationSettings.microsoft_client_secret?.isConfigured && <span style={{ color: '#10b981' }}>✓</span>}</label>
                            <input type="password" value={integrationSettings.microsoft_client_secret?.value || ''} onChange={(e) => updateIntegrationSetting('microsoft_client_secret', e.target.value)} placeholder={integrationSettings.microsoft_client_secret?.isConfigured ? '••••••••' : 'Enter Secret'} style={integrationSettings.microsoft_client_secret?.isConfigured ? { borderColor: '#10b981' } : undefined} />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Redirect URI {integrationSettings.microsoft_redirect_uri?.isConfigured && <span style={{ color: '#10b981' }}>✓</span>}</label>
                            <input type="text" value={integrationSettings.microsoft_redirect_uri?.value || ''} onChange={(e) => updateIntegrationSetting('microsoft_redirect_uri', e.target.value)} placeholder="https://your-api/api/integrations/outlook/callback" style={integrationSettings.microsoft_redirect_uri?.isConfigured ? { borderColor: '#10b981' } : undefined} />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Tenant {integrationSettings.microsoft_tenant?.isConfigured && <span style={{ color: '#10b981' }}>✓</span>}</label>
                            <input type="text" value={integrationSettings.microsoft_tenant?.value || 'common'} onChange={(e) => updateIntegrationSetting('microsoft_tenant', e.target.value)} placeholder="common" style={integrationSettings.microsoft_tenant?.isConfigured ? { borderColor: '#10b981' } : undefined} />
                          </div>
                        </div>
                        {integrationSettings.microsoft_client_id?.isConfigured && integrationSettings.microsoft_client_secret?.isConfigured && (
                          <p style={{ color: '#10b981', fontSize: '0.75rem', marginTop: '1rem', fontWeight: '500' }}>
                            ✓ Microsoft integration is configured. Users can connect Outlook, Word Online, and OneDrive.
                          </p>
                        )}
                      </div>

                      {/* Google */}
                      <div className={styles.card}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                          <span style={{ fontSize: '1.5rem' }}>📅</span> Google (Calendar + Drive)
                        </h3>
                        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
                          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ color: '#d4af37' }}>Create credentials in Google Cloud →</a>
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div className={styles.formGroup}>
                            <label>Client ID</label>
                            <input type="text" value={integrationSettings.google_client_id?.value || ''} onChange={(e) => updateIntegrationSetting('google_client_id', e.target.value)} placeholder="Enter Client ID" />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Client Secret</label>
                            <input type="password" value={integrationSettings.google_client_secret?.value || ''} onChange={(e) => updateIntegrationSetting('google_client_secret', e.target.value)} placeholder={integrationSettings.google_client_secret?.isConfigured ? '••••••••' : 'Enter Secret'} />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Redirect URI</label>
                            <input type="text" value={integrationSettings.google_redirect_uri?.value || ''} onChange={(e) => updateIntegrationSetting('google_redirect_uri', e.target.value)} placeholder="https://your-api/api/integrations/google/callback" />
                          </div>
                        </div>
                      </div>

                      {/* QuickBooks */}
                      <div className={styles.card} style={{ 
                        borderColor: integrationSettings.quickbooks_client_id?.isConfigured && integrationSettings.quickbooks_client_secret?.isConfigured ? '#10b981' : undefined, 
                        borderWidth: integrationSettings.quickbooks_client_id?.isConfigured && integrationSettings.quickbooks_client_secret?.isConfigured ? '2px' : undefined,
                        background: integrationSettings.quickbooks_client_id?.isConfigured && integrationSettings.quickbooks_client_secret?.isConfigured ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(30, 41, 59, 1) 100%)' : undefined
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                            <span style={{ fontSize: '1.5rem' }}>📊</span> QuickBooks
                          </h3>
                          {integrationSettings.quickbooks_client_id?.isConfigured && integrationSettings.quickbooks_client_secret?.isConfigured && (
                            <span style={{ 
                              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                              color: 'white', 
                              padding: '0.25rem 0.75rem', 
                              borderRadius: '9999px', 
                              fontSize: '0.75rem', 
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}>
                              ✓ Configured
                            </span>
                          )}
                        </div>
                        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
                          <a href="https://developer.intuit.com/app/developer/dashboard" target="_blank" rel="noopener noreferrer" style={{ color: '#d4af37' }}>Register in Intuit Developer →</a>
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div className={styles.formGroup}>
                            <label>Client ID {integrationSettings.quickbooks_client_id?.isConfigured && <span style={{ color: '#10b981' }}>✓</span>}</label>
                            <input type="text" value={integrationSettings.quickbooks_client_id?.value || ''} onChange={(e) => updateIntegrationSetting('quickbooks_client_id', e.target.value)} placeholder="Enter Client ID" style={integrationSettings.quickbooks_client_id?.isConfigured ? { borderColor: '#10b981' } : undefined} />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Client Secret {integrationSettings.quickbooks_client_secret?.isConfigured && <span style={{ color: '#10b981' }}>✓</span>}</label>
                            <input type="password" value={integrationSettings.quickbooks_client_secret?.value || ''} onChange={(e) => updateIntegrationSetting('quickbooks_client_secret', e.target.value)} placeholder={integrationSettings.quickbooks_client_secret?.isConfigured ? '••••••••' : 'Enter Secret'} style={integrationSettings.quickbooks_client_secret?.isConfigured ? { borderColor: '#10b981' } : undefined} />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Redirect URI {integrationSettings.quickbooks_redirect_uri?.isConfigured && <span style={{ color: '#10b981' }}>✓</span>}</label>
                            <input type="text" value={integrationSettings.quickbooks_redirect_uri?.value || ''} onChange={(e) => updateIntegrationSetting('quickbooks_redirect_uri', e.target.value)} placeholder="https://your-api/api/integrations/quickbooks/callback" style={integrationSettings.quickbooks_redirect_uri?.isConfigured ? { borderColor: '#10b981' } : undefined} />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Environment {integrationSettings.quickbooks_environment?.isConfigured && <span style={{ color: '#10b981' }}>✓</span>}</label>
                            <select value={integrationSettings.quickbooks_environment?.value || 'sandbox'} onChange={(e) => updateIntegrationSetting('quickbooks_environment', e.target.value)} style={integrationSettings.quickbooks_environment?.isConfigured ? { borderColor: '#10b981' } : undefined}>
                              <option value="sandbox">Sandbox</option>
                              <option value="production">Production</option>
                            </select>
                          </div>
                        </div>
                        {integrationSettings.quickbooks_client_id?.isConfigured && integrationSettings.quickbooks_client_secret?.isConfigured && (
                          <p style={{ color: '#10b981', fontSize: '0.75rem', marginTop: '1rem', fontWeight: '500' }}>
                            ✓ QuickBooks integration is configured. Users can connect their QuickBooks accounts.
                          </p>
                        )}
                      </div>

                      {/* Dropbox */}
                      <div className={styles.card}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                          <span style={{ fontSize: '1.5rem' }}>📦</span> Dropbox
                        </h3>
                        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
                          <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noopener noreferrer" style={{ color: '#d4af37' }}>Create app in Dropbox →</a>
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div className={styles.formGroup}>
                            <label>App Key (Client ID)</label>
                            <input type="text" value={integrationSettings.dropbox_client_id?.value || ''} onChange={(e) => updateIntegrationSetting('dropbox_client_id', e.target.value)} placeholder="Enter App Key" />
                          </div>
                          <div className={styles.formGroup}>
                            <label>App Secret</label>
                            <input type="password" value={integrationSettings.dropbox_client_secret?.value || ''} onChange={(e) => updateIntegrationSetting('dropbox_client_secret', e.target.value)} placeholder={integrationSettings.dropbox_client_secret?.isConfigured ? '••••••••' : 'Enter Secret'} />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Redirect URI</label>
                            <input type="text" value={integrationSettings.dropbox_redirect_uri?.value || ''} onChange={(e) => updateIntegrationSetting('dropbox_redirect_uri', e.target.value)} placeholder="https://your-api/api/integrations/dropbox/callback" />
                          </div>
                        </div>
                      </div>

                      {/* DocuSign */}
                      <div className={styles.card}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                          <span style={{ fontSize: '1.5rem' }}>✍️</span> DocuSign
                        </h3>
                        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
                          <a href="https://admindemo.docusign.com/apps-and-keys" target="_blank" rel="noopener noreferrer" style={{ color: '#d4af37' }}>Get keys from DocuSign →</a>
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div className={styles.formGroup}>
                            <label>Integration Key</label>
                            <input type="text" value={integrationSettings.docusign_client_id?.value || ''} onChange={(e) => updateIntegrationSetting('docusign_client_id', e.target.value)} placeholder="Enter Integration Key" />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Secret Key</label>
                            <input type="password" value={integrationSettings.docusign_client_secret?.value || ''} onChange={(e) => updateIntegrationSetting('docusign_client_secret', e.target.value)} placeholder={integrationSettings.docusign_client_secret?.isConfigured ? '••••••••' : 'Enter Secret'} />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Redirect URI</label>
                            <input type="text" value={integrationSettings.docusign_redirect_uri?.value || ''} onChange={(e) => updateIntegrationSetting('docusign_redirect_uri', e.target.value)} placeholder="https://your-api/api/integrations/docusign/callback" />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Environment</label>
                            <select value={integrationSettings.docusign_environment?.value || 'demo'} onChange={(e) => updateIntegrationSetting('docusign_environment', e.target.value)}>
                              <option value="demo">Demo</option>
                              <option value="production">Production</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Slack */}
                      <div className={styles.card}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                          <span style={{ fontSize: '1.5rem' }}>💬</span> Slack
                        </h3>
                        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
                          <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" style={{ color: '#d4af37' }}>Create app in Slack →</a>
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div className={styles.formGroup}>
                            <label>Client ID</label>
                            <input type="text" value={integrationSettings.slack_client_id?.value || ''} onChange={(e) => updateIntegrationSetting('slack_client_id', e.target.value)} placeholder="Enter Client ID" />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Client Secret</label>
                            <input type="password" value={integrationSettings.slack_client_secret?.value || ''} onChange={(e) => updateIntegrationSetting('slack_client_secret', e.target.value)} placeholder={integrationSettings.slack_client_secret?.isConfigured ? '••••••••' : 'Enter Secret'} />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Redirect URI</label>
                            <input type="text" value={integrationSettings.slack_redirect_uri?.value || ''} onChange={(e) => updateIntegrationSetting('slack_redirect_uri', e.target.value)} placeholder="https://your-api/api/integrations/slack/callback" />
                          </div>
                        </div>
                      </div>

                      {/* Zoom */}
                      <div className={styles.card}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                          <span style={{ fontSize: '1.5rem' }}>📹</span> Zoom
                        </h3>
                        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
                          <a href="https://marketplace.zoom.us/develop/create" target="_blank" rel="noopener noreferrer" style={{ color: '#d4af37' }}>Create app in Zoom Marketplace →</a>
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div className={styles.formGroup}>
                            <label>Client ID</label>
                            <input type="text" value={integrationSettings.zoom_client_id?.value || ''} onChange={(e) => updateIntegrationSetting('zoom_client_id', e.target.value)} placeholder="Enter Client ID" />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Client Secret</label>
                            <input type="password" value={integrationSettings.zoom_client_secret?.value || ''} onChange={(e) => updateIntegrationSetting('zoom_client_secret', e.target.value)} placeholder={integrationSettings.zoom_client_secret?.isConfigured ? '••••••••' : 'Enter Secret'} />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Redirect URI</label>
                            <input type="text" value={integrationSettings.zoom_redirect_uri?.value || ''} onChange={(e) => updateIntegrationSetting('zoom_redirect_uri', e.target.value)} placeholder="https://your-api/api/integrations/zoom/callback" />
                          </div>
                        </div>
                      </div>

                      {/* Quicken */}
                      <div className={styles.card}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                          <span style={{ fontSize: '1.5rem' }}>💰</span> Quicken
                        </h3>
                        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
                          <a href="https://developer.intuit.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#d4af37' }}>Register via Intuit Developer →</a>
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div className={styles.formGroup}>
                            <label>Client ID</label>
                            <input type="text" value={integrationSettings.quicken_client_id?.value || ''} onChange={(e) => updateIntegrationSetting('quicken_client_id', e.target.value)} placeholder="Enter Client ID" />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Client Secret</label>
                            <input type="password" value={integrationSettings.quicken_client_secret?.value || ''} onChange={(e) => updateIntegrationSetting('quicken_client_secret', e.target.value)} placeholder={integrationSettings.quicken_client_secret?.isConfigured ? '••••••••' : 'Enter Secret'} />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Redirect URI</label>
                            <input type="text" value={integrationSettings.quicken_redirect_uri?.value || ''} onChange={(e) => updateIntegrationSetting('quicken_redirect_uri', e.target.value)} placeholder="https://your-api/api/integrations/quicken/callback" />
                          </div>
                        </div>
                      </div>

                      {/* Azure Storage (Apex Drive) */}
                      <div className={styles.card} style={{ 
                        borderColor: integrationSettings.azure_storage_account_name?.isConfigured && integrationSettings.azure_storage_account_key?.isConfigured ? '#10b981' : '#0078d4', 
                        borderWidth: '2px',
                        background: integrationSettings.azure_storage_account_name?.isConfigured && integrationSettings.azure_storage_account_key?.isConfigured ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(30, 41, 59, 1) 100%)' : undefined
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                            <span style={{ fontSize: '1.5rem' }}>☁️</span> Azure Storage (Apex Drive)
                          </h3>
                          {integrationSettings.azure_storage_account_name?.isConfigured && integrationSettings.azure_storage_account_key?.isConfigured && (
                            <span style={{ 
                              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                              color: 'white', 
                              padding: '0.25rem 0.75rem', 
                              borderRadius: '9999px', 
                              fontSize: '0.75rem', 
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}>
                              ✓ Configured
                            </span>
                          )}
                        </div>
                        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
                          Document storage for all firms. <a href="https://portal.azure.com/#browse/Microsoft.Storage%2FStorageAccounts" target="_blank" rel="noopener noreferrer" style={{ color: '#d4af37' }}>Create Storage Account in Azure →</a>
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div className={styles.formGroup}>
                            <label>Storage Account Name {integrationSettings.azure_storage_account_name?.isConfigured && <span style={{ color: '#10b981' }}>✓</span>}</label>
                            <input type="text" value={integrationSettings.azure_storage_account_name?.value || ''} onChange={(e) => updateIntegrationSetting('azure_storage_account_name', e.target.value)} placeholder="mystorageaccount" style={integrationSettings.azure_storage_account_name?.isConfigured ? { borderColor: '#10b981' } : undefined} />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Storage Account Key {integrationSettings.azure_storage_account_key?.isConfigured && <span style={{ color: '#10b981' }}>✓</span>}</label>
                            <input type="password" value={integrationSettings.azure_storage_account_key?.value || ''} onChange={(e) => updateIntegrationSetting('azure_storage_account_key', e.target.value)} placeholder={integrationSettings.azure_storage_account_key?.isConfigured ? '••••••••' : 'Enter Key'} style={integrationSettings.azure_storage_account_key?.isConfigured ? { borderColor: '#10b981' } : undefined} />
                          </div>
                          <div className={styles.formGroup}>
                            <label>File Share Name {integrationSettings.azure_file_share_name?.isConfigured && <span style={{ color: '#10b981' }}>✓</span>}</label>
                            <input type="text" value={integrationSettings.azure_file_share_name?.value || ''} onChange={(e) => updateIntegrationSetting('azure_file_share_name', e.target.value)} placeholder="apexdrive" style={integrationSettings.azure_file_share_name?.isConfigured ? { borderColor: '#10b981' } : undefined} />
                          </div>
                        </div>
                        {integrationSettings.azure_storage_account_name?.isConfigured && integrationSettings.azure_storage_account_key?.isConfigured ? (
                          <p style={{ color: '#10b981', fontSize: '0.75rem', marginTop: '1rem', fontWeight: '500' }}>
                            ✓ Azure Storage is configured and ready. Firm admins can now enable Apex Drive from their Settings.
                          </p>
                        ) : (
                          <p style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '1rem' }}>
                            After saving, firm admins can enable Apex Drive from their Settings. Documents will be stored in this Azure File Share.
                          </p>
                        )}
                      </div>

                      {/* Save Button */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                        <button onClick={saveIntegrationSettings} disabled={savingIntegrations} className={styles.saveBtn} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {savingIntegrations ? <RefreshCw size={18} className={styles.spinning} /> : <CheckCircle size={18} />}
                          {savingIntegrations ? 'Saving...' : 'Save All Settings'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
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

      {/* Bulk Import Modal */}
      {showBulkModal && (
        <div className={styles.modalOverlay} onClick={() => setShowBulkModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2>Bulk Import Users</h2>
            <p className={styles.modalSubtitle}>Import multiple users at once using CSV format</p>
            
            <div className={styles.formGroup}>
              <label>Select Firm *</label>
              <select value={bulkFirmId} onChange={e => setBulkFirmId(e.target.value)} required>
                <option value="">Select a firm...</option>
                {firms.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Default Password (optional)</label>
              <input
                type="text"
                value={bulkDefaultPassword}
                onChange={e => setBulkDefaultPassword(e.target.value)}
                placeholder="Leave blank to auto-generate"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Users (CSV format: email, firstName, lastName, role)</label>
              <textarea
                value={bulkUsers}
                onChange={e => setBulkUsers(e.target.value)}
                placeholder="john@example.com, John, Doe, attorney
jane@example.com, Jane, Smith, paralegal
bob@example.com, Bob, Wilson, partner"
                rows={8}
              />
            </div>

            <div className={styles.modalActions}>
              <button type="button" onClick={() => setShowBulkModal(false)} className={styles.cancelBtn}>
                Cancel
              </button>
              <button onClick={handleBulkImport} className={styles.saveBtn}>
                Import Users
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL PAGE Firm Detail View */}
      {selectedFirmDetail && (
        <div style={{ 
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: '#F8FAFC',
          zIndex: 100,
          overflow: 'auto'
        }}>
          {/* Top Navigation Bar */}
          <div style={{ 
            background: 'white',
            borderBottom: '1px solid #E2E8F0',
            padding: '16px 32px',
            position: 'sticky',
            top: 0,
            zIndex: 10
          }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button 
                onClick={() => setSelectedFirmDetail(null)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  background: 'none',
                  border: 'none',
                  color: '#3B82F6',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  padding: '8px 0'
                }}
              >
                <ChevronRight size={18} style={{ transform: 'rotate(180deg)' }} />
                Back to Firms
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={() => { setEditingFirm(selectedFirmDetail); setShowFirmModal(true) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    background: '#F1F5F9',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#475569',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  <Edit2 size={16} />
                  Edit Firm
                </button>
              </div>
            </div>
          </div>

          {/* Hero Header */}
          <div style={{ 
            background: 'linear-gradient(135deg, #1E293B 0%, #334155 50%, #475569 100%)',
            padding: '48px 32px',
            color: 'white'
          }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                    <div style={{ 
                      width: '64px', 
                      height: '64px', 
                      borderRadius: '16px', 
                      background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                      fontWeight: 700
                    }}>
                      {selectedFirmDetail.name.charAt(0)}
                    </div>
                    <div>
                      <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 700 }}>{selectedFirmDetail.name}</h1>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                        <span style={{ 
                          background: selectedFirmDetail.status === 'active' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: selectedFirmDetail.status === 'active' ? '#6EE7B7' : '#FCD34D',
                          padding: '4px 12px', 
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: 500
                        }}>
                          {selectedFirmDetail.status || 'active'}
                        </span>
                        {selectedFirmDetail.domain && (
                          <span style={{ opacity: 0.7, fontSize: '14px' }}>{selectedFirmDetail.domain}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Firm ID - Prominently displayed */}
                  <div style={{ 
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: 'rgba(255,255,255,0.1)',
                    padding: '12px 20px',
                    borderRadius: '12px',
                    marginTop: '8px'
                  }}>
                    <span style={{ opacity: 0.7, fontSize: '13px' }}>Firm ID:</span>
                    <code style={{ 
                      background: 'rgba(0,0,0,0.2)', 
                      padding: '6px 12px', 
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                      letterSpacing: '0.5px'
                    }}>
                      {selectedFirmDetail.id}
                    </code>
                    <button 
                      onClick={() => { navigator.clipboard.writeText(selectedFirmDetail.id); showNotification('success', 'Firm ID copied!') }}
                      style={{ 
                        background: 'rgba(255,255,255,0.1)', 
                        border: 'none', 
                        borderRadius: '6px',
                        padding: '6px 10px',
                        cursor: 'pointer', 
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px'
                      }}
                    >
                      <Copy size={14} />
                      Copy
                    </button>
                  </div>
                </div>

                {/* Quick Stats in Header */}
                <div style={{ display: 'flex', gap: '24px' }}>
                  {[
                    { icon: Users, value: firmUsers.length, label: 'Users' },
                    { icon: Briefcase, value: firmStats?.matters || 0, label: 'Matters' },
                    { icon: FileText, value: firmStats?.documents || 0, label: 'Documents' }
                  ].map((stat, i) => (
                    <div key={i} style={{ textAlign: 'center' }}>
                      <div style={{ 
                        width: '48px', 
                        height: '48px', 
                        borderRadius: '12px', 
                        background: 'rgba(255,255,255,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 8px'
                      }}>
                        <stat.icon size={24} style={{ opacity: 0.9 }} />
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 700 }}>{stat.value}</div>
                      <div style={{ fontSize: '12px', opacity: 0.7 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ 
            background: 'white',
            borderBottom: '1px solid #E2E8F0',
            position: 'sticky',
            top: '65px',
            zIndex: 9
          }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 32px' }}>
              <div style={{ display: 'flex', gap: '0' }}>
                {[
                  { id: 'overview', icon: BarChart3, label: 'Overview' },
                  { id: 'users', icon: Users, label: 'Users' },
                  { id: 'documents', icon: HardDrive, label: 'Documents' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setFirmDetailTab(tab.id as any)}
                    style={{
                      padding: '20px 28px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: firmDetailTab === tab.id ? '3px solid #3B82F6' : '3px solid transparent',
                      color: firmDetailTab === tab.id ? '#1E293B' : '#64748B',
                      fontWeight: firmDetailTab === tab.id ? 600 : 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontSize: '15px',
                      transition: 'all 0.15s'
                    }}
                  >
                    <tab.icon size={20} />
                    {tab.label}
                    {tab.id === 'users' && <span style={{ background: '#E2E8F0', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' }}>{firmUsers.length}</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
            
            {/* Overview Tab */}
            {firmDetailTab === 'overview' && (
              <div>
                {loadingFirmData ? (
                  <div style={{ textAlign: 'center', padding: '80px', color: '#64748B' }}>
                    <RefreshCw size={40} className="animate-spin" style={{ marginBottom: '20px', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: '16px' }}>Loading firm data...</p>
                  </div>
                ) : firmStats ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
                    {[
                      { label: 'Total Users', value: firmStats.users, sub: `${firmStats.activeUsers} active`, color: '#3B82F6', bg: '#EFF6FF', icon: Users },
                      { label: 'Matters', value: firmStats.matters, sub: `${firmStats.openMatters} open`, color: '#10B981', bg: '#ECFDF5', icon: Briefcase },
                      { label: 'Clients', value: firmStats.clients, color: '#F59E0B', bg: '#FFFBEB', icon: Building2 },
                      { label: 'Documents', value: firmStats.documents, color: '#8B5CF6', bg: '#F5F3FF', icon: FileText },
                      { label: 'Time Entries', value: firmStats.timeEntries, sub: `${firmStats.totalHours?.toFixed(0) || 0} hours`, color: '#EF4444', bg: '#FEF2F2', icon: Clock },
                      { label: 'Invoices', value: firmStats.invoices, color: '#06B6D4', bg: '#ECFEFF', icon: FileText },
                      { label: 'Calendar Events', value: firmStats.calendarEvents, color: '#EC4899', bg: '#FDF2F8', icon: Activity }
                    ].map((stat, i) => (
                      <div key={i} style={{ 
                        background: 'white',
                        border: '1px solid #E2E8F0',
                        borderRadius: '16px',
                        padding: '24px',
                        transition: 'box-shadow 0.2s'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                          <div style={{ 
                            width: '44px', 
                            height: '44px', 
                            borderRadius: '12px', 
                            background: stat.bg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <stat.icon size={22} style={{ color: stat.color }} />
                          </div>
                        </div>
                        <div style={{ fontSize: '36px', fontWeight: 700, color: '#1E293B', marginBottom: '4px' }}>{stat.value}</div>
                        <div style={{ fontSize: '14px', color: '#64748B', fontWeight: 500 }}>{stat.label}</div>
                        {stat.sub && <div style={{ fontSize: '13px', color: '#94A3B8', marginTop: '4px' }}>{stat.sub}</div>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '80px', color: '#64748B' }}>
                    <AlertCircle size={40} style={{ marginBottom: '20px', opacity: 0.3 }} />
                    <p style={{ margin: 0 }}>Could not load firm statistics</p>
                  </div>
                )}
              </div>
            )}

            {/* Users Tab */}
            {firmDetailTab === 'users' && (
              <div>
                {loadingFirmData ? (
                  <div style={{ textAlign: 'center', padding: '80px', color: '#64748B' }}>
                    <RefreshCw size={40} className="animate-spin" style={{ marginBottom: '20px', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: '16px' }}>Loading users...</p>
                  </div>
                ) : firmUsers.length > 0 ? (
                  <div style={{ 
                    background: 'white', 
                    borderRadius: '16px', 
                    border: '1px solid #E2E8F0',
                    overflow: 'hidden'
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                          <th style={{ padding: '16px 24px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>User</th>
                          <th style={{ padding: '16px 24px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email</th>
                          <th style={{ padding: '16px 24px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Role</th>
                          <th style={{ padding: '16px 24px', textAlign: 'center', fontWeight: 600, color: '#475569', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                          <th style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 600, color: '#475569', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Last Login</th>
                        </tr>
                      </thead>
                      <tbody>
                        {firmUsers.map((user, idx) => (
                          <tr key={user.id} style={{ borderBottom: idx < firmUsers.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                            <td style={{ padding: '20px 24px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                <div style={{ 
                                  width: '42px', 
                                  height: '42px', 
                                  borderRadius: '50%', 
                                  background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'white',
                                  fontWeight: 600,
                                  fontSize: '15px'
                                }}>
                                  {user.first_name?.[0]}{user.last_name?.[0]}
                                </div>
                                <span style={{ fontWeight: 600, color: '#1E293B' }}>{user.first_name} {user.last_name}</span>
                              </div>
                            </td>
                            <td style={{ padding: '20px 24px', color: '#64748B' }}>{user.email}</td>
                            <td style={{ padding: '20px 24px' }}>
                              <span style={{
                                padding: '6px 14px',
                                borderRadius: '20px',
                                fontSize: '13px',
                                fontWeight: 500,
                                background: user.role === 'owner' ? '#FEF3C7' : user.role === 'admin' ? '#DBEAFE' : user.role === 'partner' ? '#E0E7FF' : '#F1F5F9',
                                color: user.role === 'owner' ? '#B45309' : user.role === 'admin' ? '#1D4ED8' : user.role === 'partner' ? '#4338CA' : '#475569'
                              }}>
                                {user.role}
                              </span>
                            </td>
                            <td style={{ padding: '20px 24px', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 14px',
                                borderRadius: '20px',
                                fontSize: '13px',
                                fontWeight: 500,
                                background: user.is_active ? '#DCFCE7' : '#FEE2E2',
                                color: user.is_active ? '#166534' : '#991B1B'
                              }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
                                {user.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td style={{ padding: '20px 24px', textAlign: 'right', color: '#64748B', fontSize: '14px' }}>
                              {user.last_login ? new Date(user.last_login).toLocaleDateString() : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '80px', color: '#64748B', background: 'white', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                    <Users size={56} style={{ marginBottom: '20px', opacity: 0.2 }} />
                    <p style={{ margin: 0, fontSize: '18px', fontWeight: 500 }}>No users in this firm</p>
                  </div>
                )}
              </div>
            )}

            {/* Documents Tab */}
            {firmDetailTab === 'documents' && (
              <div>
                {/* Stream from Clio Card - NEW FEATURE */}
                <div style={{ 
                  background: 'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)',
                  borderRadius: '20px',
                  padding: '40px 48px',
                  color: 'white',
                  marginBottom: '32px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <div style={{ maxWidth: '500px' }}>
                      <h2 style={{ margin: '0 0 12px 0', fontSize: '28px', fontWeight: 700 }}>
                        Stream Documents from Clio
                      </h2>
                      <p style={{ margin: 0, opacity: 0.9, fontSize: '16px', lineHeight: 1.6 }}>
                        Stream documents directly from Clio API to Azure Storage. No local disk required - files are transferred using memory streaming for maximum efficiency.
                      </p>
                    </div>
                    {clioConnectionId ? (
                      <div style={{ 
                        background: 'rgba(255,255,255,0.2)', 
                        padding: '8px 16px', 
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 500
                      }}>
                        Clio Connected
                      </div>
                    ) : (
                      <div style={{ 
                        background: 'rgba(255,255,255,0.15)', 
                        padding: '8px 16px', 
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 500
                      }}>
                        Connect via Migration tab first
                      </div>
                    )}
                  </div>
                  
                  {/* Streaming Status */}
                  {streamingStatus && (
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(4, 1fr)', 
                      gap: '16px',
                      marginBottom: '24px'
                    }}>
                      <div style={{ background: 'rgba(255,255,255,0.15)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '28px', fontWeight: 700 }}>{streamingStatus.total}</div>
                        <div style={{ fontSize: '13px', opacity: 0.9 }}>Total</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.15)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '28px', fontWeight: 700 }}>{streamingStatus.pending}</div>
                        <div style={{ fontSize: '13px', opacity: 0.9 }}>Pending</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.15)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '28px', fontWeight: 700 }}>{streamingStatus.imported}</div>
                        <div style={{ fontSize: '13px', opacity: 0.9 }}>Imported</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.15)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '28px', fontWeight: 700 }}>{streamingStatus.totalSizeMB} MB</div>
                        <div style={{ fontSize: '13px', opacity: 0.9 }}>Total Size</div>
                      </div>
                    </div>
                  )}
                  
                  {/* Progress Bar */}
                  {streamProgress && streamProgress.status !== 'complete' && (
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                        <span>Streaming in progress...</span>
                        <span>{streamProgress.processed || 0} / {streamProgress.total || 0}</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '8px', height: '8px', overflow: 'hidden' }}>
                        <div style={{ 
                          background: 'white', 
                          height: '100%', 
                          width: `${streamProgress.total ? ((streamProgress.processed || 0) / streamProgress.total) * 100 : 0}%`,
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    </div>
                  )}
                  
                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button
                      onClick={handleFetchDocumentManifest}
                      disabled={fetchingManifest || !clioConnectionId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '14px 24px',
                        background: 'white',
                        color: '#7C3AED',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: fetchingManifest || !clioConnectionId ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                        fontSize: '15px',
                        opacity: fetchingManifest || !clioConnectionId ? 0.7 : 1
                      }}
                    >
                      {fetchingManifest ? (
                        <><RefreshCw size={18} className="animate-spin" /> Fetching...</>
                      ) : (
                        <>1. Fetch Document List</>
                      )}
                    </button>
                    
                    <button
                      onClick={handleStreamDocumentsToAzure}
                      disabled={streamingDocuments || !clioConnectionId || !streamingStatus?.pending}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '14px 24px',
                        background: 'white',
                        color: '#7C3AED',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: streamingDocuments || !clioConnectionId || !streamingStatus?.pending ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                        fontSize: '15px',
                        opacity: streamingDocuments || !clioConnectionId || !streamingStatus?.pending ? 0.7 : 1
                      }}
                    >
                      {streamingDocuments ? (
                        <><RefreshCw size={18} className="animate-spin" /> Streaming...</>
                      ) : (
                        <>2. Stream to Azure ({streamingStatus?.pending || 0} pending)</>
                      )}
                    </button>
                    
                    <button
                      onClick={handleSyncPermissions}
                      disabled={!streamingStatus?.imported}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '14px 24px',
                        background: 'rgba(255,255,255,0.2)',
                        color: 'white',
                        border: '1px solid rgba(255,255,255,0.3)',
                        borderRadius: '10px',
                        cursor: !streamingStatus?.imported ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                        fontSize: '15px',
                        opacity: !streamingStatus?.imported ? 0.7 : 1
                      }}
                    >
                      3. Sync Permissions
                    </button>
                    
                    {streamingStatus && streamingStatus.errors > 0 && (
                      <button
                        onClick={handleResetFailedDocuments}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '14px 24px',
                          background: 'rgba(239, 68, 68, 0.2)',
                          color: 'white',
                          border: '1px solid rgba(239, 68, 68, 0.5)',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: '15px'
                        }}
                      >
                        Reset {streamingStatus.errors} Failed
                      </button>
                    )}
                  </div>
                </div>

                {/* OR Divider */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '16px', 
                  marginBottom: '32px',
                  color: '#94A3B8'
                }}>
                  <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
                  <span style={{ fontWeight: 500, fontSize: '14px' }}>OR MANUAL MIGRATION</span>
                  <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
                </div>

                {/* Big Scan Button Card */}
                <div style={{ 
                  background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
                  borderRadius: '20px',
                  padding: '40px 48px',
                  color: 'white',
                  marginBottom: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ maxWidth: '500px' }}>
                    <h2 style={{ margin: '0 0 12px 0', fontSize: '28px', fontWeight: 700 }}>
                      Scan Documents
                    </h2>
                    <p style={{ margin: 0, opacity: 0.9, fontSize: '16px', lineHeight: 1.6 }}>
                      After copying files from Clio Drive to Azure, click this button to scan and import them into the system. Documents will be automatically matched to matters.
                    </p>
                  </div>
                  <button
                    onClick={() => handleScanDocuments(selectedFirmDetail.id)}
                    disabled={scanningFirmId === selectedFirmDetail.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '20px 40px',
                      background: 'white',
                      color: '#059669',
                      border: 'none',
                      borderRadius: '14px',
                      cursor: scanningFirmId === selectedFirmDetail.id ? 'not-allowed' : 'pointer',
                      fontWeight: 700,
                      fontSize: '18px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      opacity: scanningFirmId === selectedFirmDetail.id ? 0.8 : 1
                    }}
                    onMouseOver={e => { if (scanningFirmId !== selectedFirmDetail.id) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.2)' }}}
                    onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)' }}
                  >
                    {scanningFirmId === selectedFirmDetail.id ? (
                      <>
                        <RefreshCw size={24} className="animate-spin" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        <FolderSync size={24} />
                        Scan Documents
                      </>
                    )}
                  </button>
                </div>

                {/* Status Cards */}
                {firmManifestStats?.stats && (
                  <div style={{ marginBottom: '32px' }}>
                    <h3 style={{ margin: '0 0 20px 0', color: '#1E293B', fontSize: '18px', fontWeight: 600 }}>
                      Migration Status
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                      <div style={{ background: 'white', border: '1px solid #E2E8F0', padding: '28px', borderRadius: '16px' }}>
                        <div style={{ fontSize: '40px', fontWeight: 700, color: '#3B82F6', marginBottom: '8px' }}>{firmManifestStats.stats.total || 0}</div>
                        <div style={{ fontSize: '15px', color: '#64748B', fontWeight: 500 }}>Total Documents</div>
                      </div>
                      <div style={{ background: 'white', border: '1px solid #E2E8F0', padding: '28px', borderRadius: '16px' }}>
                        <div style={{ fontSize: '40px', fontWeight: 700, color: '#10B981', marginBottom: '8px' }}>{firmManifestStats.stats.imported || 0}</div>
                        <div style={{ fontSize: '15px', color: '#64748B', fontWeight: 500 }}>Imported</div>
                      </div>
                      <div style={{ background: 'white', border: '1px solid #E2E8F0', padding: '28px', borderRadius: '16px' }}>
                        <div style={{ fontSize: '40px', fontWeight: 700, color: '#F59E0B', marginBottom: '8px' }}>{firmManifestStats.stats.pending || 0}</div>
                        <div style={{ fontSize: '15px', color: '#64748B', fontWeight: 500 }}>Pending</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Instructions */}
                <div style={{ 
                  background: 'white', 
                  border: '1px solid #E2E8F0', 
                  borderRadius: '16px',
                  padding: '28px'
                }}>
                  <h3 style={{ margin: '0 0 20px 0', color: '#1E293B', fontSize: '18px', fontWeight: 600 }}>
                    How to Migrate Documents
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
                    {[
                      { step: '1', title: 'Copy Files', desc: 'Copy documents from Clio Drive to Azure File Share' },
                      { step: '2', title: 'Scan', desc: 'Click the Scan Documents button above' },
                      { step: '3', title: 'Done', desc: 'Documents are matched to matters automatically' }
                    ].map((item, i) => (
                      <div key={i} style={{ display: 'flex', gap: '16px' }}>
                        <div style={{ 
                          width: '36px', 
                          height: '36px', 
                          borderRadius: '50%', 
                          background: '#EFF6FF',
                          color: '#3B82F6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '14px',
                          flexShrink: 0
                        }}>
                          {item.step}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: '#1E293B', marginBottom: '4px' }}>{item.title}</div>
                          <div style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.5 }}>{item.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
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
