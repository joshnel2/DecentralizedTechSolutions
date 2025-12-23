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
  ShieldCheck, Check, X, Sparkles, Brain, Wand2
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
  const [sessionTimeout, setSessionTimeout] = useState(1800) // 30 minutes in seconds
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
  
  // AI Transformation state - default to CSV Import mode (aiMode = true)
  const [aiMode, setAiMode] = useState(true)
  const [rawDataInput, setRawDataInput] = useState('')
  const [dataFormatHint, setDataFormatHint] = useState('')
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
    calendarEvents: ''
  })

  // Bulk Import state
  const [showBulkModal, setShowBulkModal] = useState(false)
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
    const resetTimeout = () => setSessionTimeout(1800)
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
        const settings: Record<string, any> = {}
        data.settings?.forEach((s: any) => {
          settings[s.key] = { value: s.value || '', isConfigured: !!s.value, isSecret: s.is_secret }
        })
        setIntegrationSettings(settings)
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
        user_credentials: [],
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
        { key: 'calendarEvents', data: migrationInputs.calendarEvents }
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
                          className={`${styles.modeBtn} ${!aiMode ? styles.activeMode : ''}`}
                          onClick={() => setAiMode(false)}
                        >
                          <FileJson size={18} />
                          Manual JSON
                        </button>
                        <button 
                          className={`${styles.modeBtn} ${aiMode ? styles.activeMode : ''}`}
                          onClick={() => setAiMode(true)}
                        >
                          <Upload size={18} />
                          CSV Import
                          <span className={styles.aiLabel}>Easy</span>
                        </button>
                      </div>

                      {/* AI Transform Mode */}
                      {aiMode ? (
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
                      <div className={styles.card}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                          <span style={{ fontSize: '1.5rem' }}>📧</span> Microsoft (Outlook + OneDrive)
                        </h3>
                        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
                          <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer" style={{ color: '#d4af37' }}>Register app in Azure Portal →</a>
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div className={styles.formGroup}>
                            <label>Client ID</label>
                            <input type="text" value={integrationSettings.microsoft_client_id?.value || ''} onChange={(e) => updateIntegrationSetting('microsoft_client_id', e.target.value)} placeholder="Enter Client ID" />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Client Secret</label>
                            <input type="password" value={integrationSettings.microsoft_client_secret?.value || ''} onChange={(e) => updateIntegrationSetting('microsoft_client_secret', e.target.value)} placeholder={integrationSettings.microsoft_client_secret?.isConfigured ? '••••••••' : 'Enter Secret'} />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Redirect URI</label>
                            <input type="text" value={integrationSettings.microsoft_redirect_uri?.value || ''} onChange={(e) => updateIntegrationSetting('microsoft_redirect_uri', e.target.value)} placeholder="https://your-api/api/integrations/outlook/callback" />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Tenant</label>
                            <input type="text" value={integrationSettings.microsoft_tenant?.value || 'common'} onChange={(e) => updateIntegrationSetting('microsoft_tenant', e.target.value)} placeholder="common" />
                          </div>
                        </div>
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
                      <div className={styles.card}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                          <span style={{ fontSize: '1.5rem' }}>📊</span> QuickBooks
                        </h3>
                        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
                          <a href="https://developer.intuit.com/app/developer/dashboard" target="_blank" rel="noopener noreferrer" style={{ color: '#d4af37' }}>Register in Intuit Developer →</a>
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div className={styles.formGroup}>
                            <label>Client ID</label>
                            <input type="text" value={integrationSettings.quickbooks_client_id?.value || ''} onChange={(e) => updateIntegrationSetting('quickbooks_client_id', e.target.value)} placeholder="Enter Client ID" />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Client Secret</label>
                            <input type="password" value={integrationSettings.quickbooks_client_secret?.value || ''} onChange={(e) => updateIntegrationSetting('quickbooks_client_secret', e.target.value)} placeholder={integrationSettings.quickbooks_client_secret?.isConfigured ? '••••••••' : 'Enter Secret'} />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Redirect URI</label>
                            <input type="text" value={integrationSettings.quickbooks_redirect_uri?.value || ''} onChange={(e) => updateIntegrationSetting('quickbooks_redirect_uri', e.target.value)} placeholder="https://your-api/api/integrations/quickbooks/callback" />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Environment</label>
                            <select value={integrationSettings.quickbooks_environment?.value || 'sandbox'} onChange={(e) => updateIntegrationSetting('quickbooks_environment', e.target.value)}>
                              <option value="sandbox">Sandbox</option>
                              <option value="production">Production</option>
                            </select>
                          </div>
                        </div>
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
