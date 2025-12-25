import { useMemo, useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAIChat } from '../contexts/AIChatContext'
import { useTimer, formatElapsedTime } from '../contexts/TimerContext'
import { invoicesApi, teamApi, mattersApi } from '../services/api'
import { 
  Briefcase, Calendar, DollarSign, Clock, FileText,
  ChevronLeft, Sparkles, Edit2, MoreVertical, Plus,
  CheckCircle2, Scale, Building2, Brain, Loader2, 
  Copy, RefreshCw, AlertTriangle, TrendingUp,
  ListTodo, Users, Circle, Upload, Download, X, 
  Trash2, Archive, XCircle, Eye, Play, Pause, StopCircle,
  MessageSquare, Settings, Share2, Globe, Lock, Shield,
  Search, Filter
} from 'lucide-react'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { parseAsLocalDate, localDateToISO } from '../utils/dateUtils'
import { clsx } from 'clsx'
import styles from './DetailPage.module.css'
import { ConfirmationModal } from '../components/ConfirmationModal'
import { MatterTypesManager } from '../components/MatterTypesManager'
import { ShareMatterModal } from '../components/ShareMatterModal'
import { MatterPermissions } from '../components/MatterPermissions'
import { useAuthStore } from '../stores/authStore'

// Task interface
interface Task {
  id: string
  name: string
  status: 'pending' | 'in_progress' | 'completed'
  dueDate: string
  assignee: string
  description?: string
}

// Matter Update interface for case progressions
interface MatterUpdate {
  id: string
  date: string
  title: string
  description: string
  category: 'general' | 'court' | 'client_communication' | 'document' | 'billing' | 'milestone'
  createdAt: string
  updatedAt: string
}

// Related contacts - loaded from localStorage per matter (no mock data)

export function MatterDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { openChat } = useAIChat()
  const { timer, startTimer, stopTimer, discardTimer } = useTimer()
  const { 
    matters, clients, timeEntries, invoices, events, documents, 
    updateMatter, addTimeEntry, addInvoice, addEvent, addDocument,
    fetchMatters, fetchClients, fetchTimeEntries, fetchInvoices, fetchEvents, fetchDocuments,
    deleteTimeEntry, updateTimeEntry, deleteEvent, updateEvent, deleteMatter,
    matterTypes
  } = useDataStore()
  
  // Generate type options from the store's matterTypes
  const typeOptions = useMemo(() => {
    return matterTypes
      .filter(t => t.active)
      .map(t => ({ value: t.value, label: t.label }))
  }, [matterTypes])
  const [activeTab, setActiveTab] = useState('overview')
  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [showAiPanel, setShowAiPanel] = useState(false)
  
  // Modal states
  const [showDocumentModal, setShowDocumentModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [showTimeEntryModal, setShowTimeEntryModal] = useState(false)
  const [showEventModal, setShowEventModal] = useState(false)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showDocPreview, setShowDocPreview] = useState<any>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [showEditMatterModal, setShowEditMatterModal] = useState(false)
  const [showMatterDropdown, setShowMatterDropdown] = useState(false)
  const [editingTimeEntry, setEditingTimeEntry] = useState<any>(null)
  const [editingEvent, setEditingEvent] = useState<any>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [attorneys, setAttorneys] = useState<any[]>([])
  const [showContactModal, setShowContactModal] = useState(false)
  const [matterContacts, setMatterContacts] = useState<any[]>([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [loadingUpdates, setLoadingUpdates] = useState(true)
  const [loadingContacts, setLoadingContacts] = useState(true)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showPermissionsPanel, setShowPermissionsPanel] = useState(false)
  const { user } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  // Quick time entry state
  const [quickTimeMinutes, setQuickTimeMinutes] = useState(5)
  const [quickTimeNotes, setQuickTimeNotes] = useState('')
  const [quickTimeSaving, setQuickTimeSaving] = useState(false)
  
  // Time entry selection for billing
  const [selectedTimeEntries, setSelectedTimeEntries] = useState<string[]>([])
  const [showBillEntriesModal, setShowBillEntriesModal] = useState(false)
  
  // Time entries filter state
  const [timeEntriesSearch, setTimeEntriesSearch] = useState('')
  const [timeEntriesFilterStatus, setTimeEntriesFilterStatus] = useState<'all' | 'billed' | 'unbilled'>('all')
  
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    confirmText: string
    type: 'danger' | 'warning' | 'success' | 'info'
    onConfirm: () => void
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    type: 'danger',
    onConfirm: () => {}
  })
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowMatterDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  // Task state - loaded from API
  const [tasks, setTasks] = useState<Task[]>([])
  
  // Updates state - loaded from API
  const [matterUpdates, setMatterUpdates] = useState<MatterUpdate[]>([])
  
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [editingUpdate, setEditingUpdate] = useState<MatterUpdate | null>(null)
  const [showTypesManager, setShowTypesManager] = useState(false)
  
  // Load tasks from API
  useEffect(() => {
    if (id) {
      setLoadingTasks(true)
      mattersApi.getTasks(id)
        .then(data => {
          setTasks(data.tasks || [])
        })
        .catch(err => console.error('Failed to load tasks:', err))
        .finally(() => setLoadingTasks(false))
    }
  }, [id])
  
  // Load updates from API
  useEffect(() => {
    if (id) {
      setLoadingUpdates(true)
      mattersApi.getUpdates(id)
        .then(data => {
          setMatterUpdates(data.updates || [])
        })
        .catch(err => console.error('Failed to load updates:', err))
        .finally(() => setLoadingUpdates(false))
    }
  }, [id])
  
  // Load contacts from API
  useEffect(() => {
    if (id) {
      setLoadingContacts(true)
      mattersApi.getContacts(id)
        .then(data => {
          setMatterContacts(data.contacts || [])
        })
        .catch(err => console.error('Failed to load contacts:', err))
        .finally(() => setLoadingContacts(false))
    }
  }, [id])
  
  const addContact = async (contact: { name: string; role: string; firm?: string; email?: string; phone?: string }) => {
    if (!id) return
    try {
      const newContact = await mattersApi.createContact(id, contact)
      setMatterContacts(prev => [...prev, newContact])
    } catch (err) {
      console.error('Failed to add contact:', err)
    }
  }
  
  const deleteContact = (contactId: string) => {
    const contact = matterContacts.find(c => c.id === contactId)
    setConfirmModal({
      isOpen: true,
      title: 'Remove Contact',
      message: `Are you sure you want to remove "${contact?.name || 'this contact'}" from this matter?`,
      confirmText: 'Remove',
      type: 'danger',
      onConfirm: async () => {
        if (!id) return
        try {
          await mattersApi.deleteContact(id, contactId)
          setMatterContacts(prev => prev.filter(c => c.id !== contactId))
        } catch (err) {
          console.error('Failed to delete contact:', err)
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }))
      }
    })
  }
  
  const addTask = async (task: Omit<Task, 'id'>) => {
    if (!id) return
    try {
      const newTask = await mattersApi.createTask(id, task)
      setTasks(prev => [...prev, newTask])
    } catch (err) {
      console.error('Failed to add task:', err)
    }
  }
  
  const updateTask = async (taskId: string, updates: Partial<Task>) => {
    if (!id) return
    try {
      const updatedTask = await mattersApi.updateTask(id, taskId, updates)
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t))
    } catch (err) {
      console.error('Failed to update task:', err)
    }
  }
  
  const deleteTask = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    setConfirmModal({
      isOpen: true,
      title: 'Delete Task',
      message: `Are you sure you want to delete "${task?.name || 'this task'}"?`,
      confirmText: 'Delete',
      type: 'danger',
      onConfirm: async () => {
        if (!id) return
        try {
          await mattersApi.deleteTask(id, taskId)
          setTasks(prev => prev.filter(t => t.id !== taskId))
        } catch (err) {
          console.error('Failed to delete task:', err)
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }))
      }
    })
  }
  
  const toggleTaskStatus = async (taskId: string) => {
    if (!id) return
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const newStatus = task.status === 'completed' ? 'pending' : 'completed'
    try {
      const updatedTask = await mattersApi.updateTask(id, taskId, { status: newStatus })
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t))
    } catch (err) {
      console.error('Failed to toggle task status:', err)
    }
  }
  
  // Matter Update handlers
  const addMatterUpdate = async (update: Omit<MatterUpdate, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!id) return
    try {
      const newUpdate = await mattersApi.createUpdate(id, update)
      setMatterUpdates(prev => [newUpdate, ...prev].sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      ))
    } catch (err) {
      console.error('Failed to add update:', err)
    }
  }
  
  const updateMatterUpdate = async (updateId: string, updates: Partial<MatterUpdate>) => {
    if (!id) return
    try {
      const updatedRecord = await mattersApi.updateUpdate(id, updateId, updates)
      setMatterUpdates(prev => prev.map(u => 
        u.id === updateId ? updatedRecord : u
      ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()))
    } catch (err) {
      console.error('Failed to update record:', err)
    }
  }
  
  const deleteMatterUpdate = (updateId: string) => {
    const update = matterUpdates.find(u => u.id === updateId)
    setConfirmModal({
      isOpen: true,
      title: 'Delete Update',
      message: `Are you sure you want to delete "${update?.title || 'this update'}"?`,
      confirmText: 'Delete',
      type: 'danger',
      onConfirm: async () => {
        if (!id) return
        try {
          await mattersApi.deleteUpdate(id, updateId)
          setMatterUpdates(prev => prev.filter(u => u.id !== updateId))
        } catch (err) {
          console.error('Failed to delete update:', err)
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }))
      }
    })
  }

  // Fetch data on mount
  useEffect(() => {
    fetchMatters()
    fetchClients()
    fetchTimeEntries({ matterId: id })
    fetchInvoices()
    fetchEvents()
    fetchDocuments({ matterId: id })
    
    // Fetch attorneys for edit modal
    teamApi.getAttorneys()
      .then(data => setAttorneys(data.attorneys || []))
      .catch(err => console.log('Could not fetch attorneys:', err))
  }, [id])
  
  // AI Helper - opens side panel with context-specific questions
  const openAIWithContext = (contextLabel: string, questions: string[]) => {
    openChat({
      label: contextLabel,
      contextType: 'matter-detail',
      suggestedQuestions: questions,
      additionalContext: { matterId: id, matterName: matter?.name }
    })
  }
  
  // Handle matter status change
  const handleStatusChange = async (newStatus: 'intake' | 'pending_conflict' | 'active' | 'pending' | 'on_hold' | 'closed_won' | 'closed_lost' | 'closed_settled' | 'closed_dismissed' | 'closed_transferred' | 'closed_abandoned' | 'closed_other') => {
    try {
      await updateMatter(id!, { status: newStatus })
      setShowMatterDropdown(false)
      fetchMatters()
    } catch (error) {
      console.error('Failed to update matter status:', error)
      alert('Failed to update matter status')
    }
  }

  // Handle quick time entry save
  const handleQuickTimeSave = async () => {
    if (quickTimeMinutes <= 0) return
    setQuickTimeSaving(true)
    try {
      await addTimeEntry({
        matterId: id!,
        date: new Date().toISOString(),
        hours: quickTimeMinutes / 60, // Convert minutes to hours
        description: quickTimeNotes || `Quick time entry - ${quickTimeMinutes} minutes`,
        billable: true,
        billed: false,
        rate: matter?.billingRate || 0,
        aiGenerated: false,
        status: 'pending',
        entryType: 'manual',
        updatedAt: new Date().toISOString()
      } as any)
      // Reset form
      setQuickTimeMinutes(10)
      setQuickTimeNotes('')
      // Refresh time entries
      await fetchTimeEntries({ matterId: id })
    } catch (error) {
      console.error('Failed to save quick time entry:', error)
      alert('Failed to save time entry')
    } finally {
      setQuickTimeSaving(false)
    }
  }

  // Handle matter delete
  const handleDeleteMatter = async () => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Matter',
      message: `Are you sure you want to delete "${matter?.name}"? This action cannot be undone and will remove all associated time entries, documents, and invoices.`,
      confirmText: 'Delete Matter',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteMatter(id!)
          setConfirmModal(prev => ({ ...prev, isOpen: false }))
          navigate('/app/matters')
        } catch (error) {
          console.error('Failed to delete matter:', error)
          alert('Failed to delete matter')
        }
      }
    })
  }
  
  // Handle time entry delete
  const handleDeleteTimeEntry = async (entryId: string) => {
    const entry = matterTimeEntries.find(e => e.id === entryId)
    setConfirmModal({
      isOpen: true,
      title: 'Delete Time Entry',
      message: `Are you sure you want to delete this time entry? (${entry?.hours || 0} hours - $${entry?.amount?.toLocaleString() || 0})`,
      confirmText: 'Delete',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteTimeEntry(entryId)
          await fetchTimeEntries({ matterId: id })
          setConfirmModal(prev => ({ ...prev, isOpen: false }))
        } catch (error) {
          console.error('Failed to delete time entry:', error)
          alert('Failed to delete time entry')
        }
      }
    })
  }

  // Toggle time entry selection for billing
  const toggleTimeEntrySelection = (entryId: string) => {
    setSelectedTimeEntries(prev => 
      prev.includes(entryId) 
        ? prev.filter(id => id !== entryId)
        : [...prev, entryId]
    )
  }
  
  // Handle event delete
  const handleDeleteEvent = async (eventId: string) => {
    const event = matterEvents.find(e => e.id === eventId)
    setConfirmModal({
      isOpen: true,
      title: 'Delete Event',
      message: `Are you sure you want to delete "${event?.title || 'this event'}"?`,
      confirmText: 'Delete',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteEvent(eventId)
          fetchEvents()
          setConfirmModal(prev => ({ ...prev, isOpen: false }))
        } catch (error) {
          console.error('Failed to delete event:', error)
          alert('Failed to delete event')
        }
      }
    })
  }
  
  // Download document
  const downloadDocument = async (doc: any) => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
    const token = localStorage.getItem('token')
    try {
      const response = await fetch(`${apiUrl}/documents/${doc.id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = doc.name
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        alert('Failed to download document')
      }
    } catch (error) {
      console.error('Download error:', error)
      alert('Failed to download document')
    }
  }

  const matter = useMemo(() => matters.find(m => m.id === id), [matters, id])
  const client = useMemo(() => clients.find(c => c.id === matter?.clientId), [clients, matter])
  
  const matterTimeEntries = useMemo(() => 
    timeEntries.filter(t => t.matterId === id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [timeEntries, id]
  )

  // Filtered time entries based on search and filters
  const filteredTimeEntries = useMemo(() => {
    return matterTimeEntries.filter(entry => {
      // Search filter
      if (timeEntriesSearch) {
        const searchLower = timeEntriesSearch.toLowerCase()
        const description = (entry.description || '').toLowerCase()
        
        if (!description.includes(searchLower)) return false
      }
      
      // Status filter
      if (timeEntriesFilterStatus === 'billed' && !entry.billed) return false
      if (timeEntriesFilterStatus === 'unbilled' && entry.billed) return false
      
      return true
    })
  }, [matterTimeEntries, timeEntriesSearch, timeEntriesFilterStatus])

  // Get selected entries total
  const selectedEntriesTotal = useMemo(() => {
    return matterTimeEntries
      .filter(e => selectedTimeEntries.includes(e.id))
      .reduce((sum, e) => sum + e.amount, 0)
  }, [matterTimeEntries, selectedTimeEntries])

  const selectedEntriesHours = useMemo(() => {
    return matterTimeEntries
      .filter(e => selectedTimeEntries.includes(e.id))
      .reduce((sum, e) => sum + e.hours, 0)
  }, [matterTimeEntries, selectedTimeEntries])

  const unbilledEntries = useMemo(() => {
    return filteredTimeEntries.filter(e => !e.billed && e.billable)
  }, [filteredTimeEntries])

  // Select all unbilled entries
  const toggleAllUnbilledEntries = () => {
    const unbilledIds = matterTimeEntries.filter(e => !e.billed && e.billable).map(e => e.id)
    const allSelected = unbilledIds.every(id => selectedTimeEntries.includes(id))
    if (allSelected) {
      setSelectedTimeEntries([])
    } else {
      setSelectedTimeEntries(unbilledIds)
    }
  }
  
  const matterInvoices = useMemo(() => 
    invoices.filter(i => i.matterId === id),
    [invoices, id]
  )
  
  const matterEvents = useMemo(() => 
    events.filter(e => e.matterId === id)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [events, id]
  )
  
  const matterDocuments = useMemo(() => 
    documents.filter(d => d.matterId === id),
    [documents, id]
  )

  const stats = useMemo(() => {
    const totalHours = matterTimeEntries.reduce((sum, t) => sum + t.hours, 0)
    const totalBilled = matterTimeEntries.filter(t => t.billed).reduce((sum, t) => sum + t.amount, 0)
    const totalUnbilled = matterTimeEntries.filter(t => !t.billed).reduce((sum, t) => sum + t.amount, 0)
    const invoicedAmount = matterInvoices.reduce((sum, i) => sum + i.total, 0)
    const paidAmount = matterInvoices.reduce((sum, i) => sum + i.amountPaid, 0)
    
    return { totalHours, totalBilled, totalUnbilled, invoicedAmount, paidAmount }
  }, [matterTimeEntries, matterInvoices])

  const generateAISummary = async () => {
    setAiAnalyzing(true)
    setShowAiPanel(true)
    
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${import.meta.env.VITE_API_URL}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: `Analyze this specific matter thoroughly. Focus ONLY on this matter's data - do not provide generic advice. Include:
1) STATUS: Current stage, what has been completed, what remains
2) FINANCIALS: Hours billed, unbilled time, total value, collection status
3) TIMELINE: Upcoming deadlines, events, and critical dates
4) RISKS: Specific concerns based on this matter's actual data
5) NEXT STEPS: 3-5 specific, actionable tasks based on this matter's current state

Be direct and specific. Reference actual numbers, dates, and details from this matter.`,
          page: 'matter-detail',
          context: { matterId: id }
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to get AI response')
      }
      
      const data = await response.json()
      setAiSummary(data.response)
    } catch (error) {
      console.error('AI analysis error:', error)
      setAiSummary('Unable to generate AI analysis. Please check your connection and try again.')
    } finally {
      setAiAnalyzing(false)
    }
  }

  const runQuickAIAction = async (actionType: string) => {
    setAiAnalyzing(true)
    setShowAiPanel(true)
    
    const prompts: Record<string, string> = {
      'risk': `RISK ANALYSIS for this specific matter only. Based on the actual data:
- List specific risks with HIGH/MEDIUM/LOW severity
- Reference actual deadlines, missing items, or billing gaps from this matter
- Identify statute of limitations concerns if applicable
- Note any gaps in documentation or communication
- Provide 2-3 specific mitigation actions for each risk
Do NOT give generic legal advice. Only analyze what you see in this matter's data.`,
      'billing': `BILLING ANALYSIS for this specific matter only. Based on the actual data:
- Total hours logged and their value
- Unbilled time that should be invoiced
- Comparison to budget if set
- Revenue collected vs outstanding
- Specific recommendation: Should we invoice now? How much?
- Projected final value based on current trajectory
Reference actual numbers from this matter only.`,
      'deadline': `DEADLINE ANALYSIS for this specific matter only. Based on the actual data:
- List ALL upcoming events and deadlines chronologically
- Flag anything due within 7 days as URGENT
- Flag anything due within 30 days as UPCOMING
- Note any statute of limitations dates
- Identify gaps where deadlines might be missing
- Recommend specific calendar items to add
Only reference dates that exist in this matter's data.`,
      'documents': `DOCUMENT ANALYSIS for this specific matter only. Based on the actual data:
- List all documents currently on file
- For this matter type, identify what documents are typically needed
- Flag any missing critical documents
- Note documents that may need updating
- Recommend specific documents to request or create
Only analyze documents actually associated with this matter.`
    }
    
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${import.meta.env.VITE_API_URL}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: prompts[actionType] || 'Analyze this matter.',
          page: 'matter-detail',
          context: { matterId: id }
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to get AI response')
      }
      
      const data = await response.json()
      setAiSummary(data.response)
    } catch (error) {
      console.error('AI action error:', error)
      setAiSummary('Unable to complete AI analysis. Please check your connection and try again.')
    } finally {
      setAiAnalyzing(false)
    }
  }

  if (!matter) {
    return (
      <div className={styles.notFound}>
        <Briefcase size={48} />
        <h2>Matter not found</h2>
        <Link to="/app/matters">Back to Matters</Link>
      </div>
    )
  }

  return (
    <div className={styles.detailPage}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <Link to="/app/matters" className={styles.backLink}>
            <ChevronLeft size={18} />
            Back to Matters
          </Link>
          <div className={styles.headerActions}>
            {/* Visibility Badge */}
            <button 
              className={clsx(
                styles.visibilityBadge,
                matter.visibility === 'restricted' && styles.restricted
              )}
              onClick={() => setShowPermissionsPanel(true)}
              title={matter.visibility === 'restricted' ? 'Restricted - Click to manage access' : 'Firm Wide - Click to manage access'}
            >
              {matter.visibility === 'restricted' ? (
                <><Lock size={14} /> Restricted</>
              ) : (
                <><Globe size={14} /> Firm Wide</>
              )}
            </button>
            <button 
              className={styles.shareBtn}
              onClick={() => setShowShareModal(true)}
              title="Share Matter"
            >
              <Share2 size={16} />
              Share
            </button>
            <button 
              className={styles.aiBtn}
              onClick={() => openAIWithContext(`Matter: ${matter.name}`, [
                'Summarize this matter including current status and key details',
                'What are the potential risks in this matter?',
                'Review the timeline and upcoming deadlines',
                'Analyze the billing and financials for this matter',
                'What are the recommended next steps?'
              ])}
            >
              <Sparkles size={16} />
              AI Analysis
            </button>
            <button 
              className={styles.iconBtn}
              onClick={() => setShowEditMatterModal(true)}
              title="Edit Matter"
            >
              <Edit2 size={18} />
            </button>
            <div className={styles.menuWrapper} ref={dropdownRef}>
              <button 
                className={styles.iconBtn}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setShowMatterDropdown(!showMatterDropdown)}
                title="More Options"
              >
                <MoreVertical size={18} />
              </button>
              {showMatterDropdown && (
                <div className={styles.dropdown}>
                  <button 
                    className={styles.dropdownItem}
                    onClick={() => {
                      setShowMatterDropdown(false)
                      setShowEditMatterModal(true)
                    }}
                  >
                    <Edit2 size={14} />
                    Edit Matter
                  </button>
                  {matter.status === 'active' && (
                    <>
                      <button 
                        className={styles.dropdownItem}
                        onClick={() => handleStatusChange('on_hold')}
                      >
                        <XCircle size={14} />
                        Put On Hold
                      </button>
                      <button 
                        className={clsx(styles.dropdownItem, styles.success)}
                        onClick={() => handleStatusChange('closed_won')}
                      >
                        <CheckCircle2 size={14} />
                        Close - Won
                      </button>
                    </>
                  )}
                  {matter.status === 'on_hold' && (
                    <button 
                      className={styles.dropdownItem}
                      onClick={() => handleStatusChange('active')}
                    >
                      <Briefcase size={14} />
                      Reactivate
                    </button>
                  )}
                  {!matter.status.startsWith('closed') && (
                    <button 
                      className={styles.dropdownItem}
                      onClick={() => handleStatusChange('closed_other')}
                    >
                      <Archive size={14} />
                      Archive / Close
                    </button>
                  )}
                  <div className={styles.dropdownDivider} />
                  <button 
                    className={clsx(styles.dropdownItem, styles.danger)}
                    onClick={handleDeleteMatter}
                  >
                    <Trash2 size={14} />
                    Delete Matter
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.headerMain}>
          <div className={styles.headerIcon}>
            <Briefcase size={28} />
          </div>
          <div className={styles.headerInfo}>
            <div className={styles.headerMeta}>
              <span className={styles.matterNumber}>{matter.number}</span>
              <span className={clsx(styles.statusBadge, styles[matter.status])}>
                {matter.status.replace(/_/g, ' ')}
              </span>
              <span className={clsx(styles.priorityBadge, styles[matter.priority])}>
                {matter.priority}
              </span>
            </div>
            <h1>{matter.name}</h1>
            <p className={styles.description}>{matter.description}</p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className={styles.quickStats}>
          <div className={styles.quickStat}>
            <Clock size={18} />
            <div>
              <span className={styles.statValue}>{stats.totalHours.toFixed(1)}</span>
              <span className={styles.statLabel}>Hours</span>
            </div>
          </div>
          <div className={styles.quickStat}>
            <DollarSign size={18} />
            <div>
              <span className={styles.statValue}>${stats.totalUnbilled.toLocaleString()}</span>
              <span className={styles.statLabel}>Unbilled</span>
            </div>
          </div>
          <div className={styles.quickStat}>
            <FileText size={18} />
            <div>
              <span className={styles.statValue}>${stats.invoicedAmount.toLocaleString()}</span>
              <span className={styles.statLabel}>Invoiced</span>
            </div>
          </div>
          <div className={styles.quickStat}>
            <CheckCircle2 size={18} />
            <div>
              <span className={styles.statValue}>${stats.paidAmount.toLocaleString()}</span>
              <span className={styles.statLabel}>Collected</span>
            </div>
          </div>
        </div>

        {/* Quick Time Entry */}
        <div className={styles.quickTimeWidget}>
          <span className={styles.quickTimeLabel}>
            <Plus size={14} />
            Quick Time
          </span>
          <div className={styles.quickTimeControls}>
            <button 
              className={styles.quickTimeBtn}
              onClick={() => setQuickTimeMinutes(Math.max(0, quickTimeMinutes - 5))}
            >
              −
            </button>
            <div className={styles.quickTimeDisplay}>
              <Clock size={14} />
              {quickTimeMinutes} min
            </div>
            <button 
              className={styles.quickTimeBtn}
              onClick={() => setQuickTimeMinutes(quickTimeMinutes + 5)}
            >
              +
            </button>
          </div>
          <input
            type="text"
            className={styles.quickTimeNotes}
            placeholder="What did you work on?"
            value={quickTimeNotes}
            onChange={(e) => setQuickTimeNotes(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleQuickTimeSave()}
          />
          <button 
            className={styles.quickTimeSave}
            onClick={handleQuickTimeSave}
            disabled={quickTimeMinutes <= 0 || quickTimeSaving}
          >
            {quickTimeSaving ? 'Saving...' : 'Add Time'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {['overview', 'notes', 'updates', 'tasks', 'time', 'billing', 'documents', 'calendar', 'contacts'].map(tab => (
          <button
            key={tab}
            className={clsx(styles.tab, activeTab === tab && styles.active)}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={styles.content}>
        {activeTab === 'overview' && (
          <div className={styles.overviewGrid}>
            {/* Matter Details */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3>Matter Details</h3>
              </div>
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Client</span>
                  <Link to={`/app/clients/${client?.id}`} className={styles.detailLink}>
                    <Building2 size={14} />
                    {client?.name}
                  </Link>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Practice Area</span>
                  <span className={styles.detailValue}>{(matter.type || 'other').replace(/_/g, ' ')}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Responsible Attorney</span>
                  <span className={styles.detailValue}>
                    {matter.responsibleAttorneyName || 'Unassigned'}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Originating Attorney</span>
                  <span className={styles.detailValue}>
                    {matter.originatingAttorneyName || 'Unassigned'}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Opened</span>
                  <span className={styles.detailValue}>{matter.openDate ? format(parseISO(matter.openDate), 'MMM d, yyyy') : '—'}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Billing Type</span>
                  <span className={styles.detailValue}>
                    {matter.billingType === 'hourly' && `Hourly ($${matter.billingRate}/hr)`}
                    {matter.billingType === 'flat' && `Flat Fee ($${matter.flatFee?.toLocaleString()})`}
                    {matter.billingType === 'contingency' && `${matter.contingencyPercent}% Contingency`}
                    {matter.billingType === 'retainer' && `Retainer ($${matter.retainerAmount?.toLocaleString()})`}
                  </span>
                </div>
                {matter.budget && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Budget</span>
                    <span className={styles.detailValue}>${matter.budget.toLocaleString()}</span>
                  </div>
                )}
                {matter.statuteOfLimitations && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Statute of Limitations</span>
                    <span className={styles.detailValue}>
                      {format(parseISO(matter.statuteOfLimitations), 'MMM d, yyyy')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Court Info */}
            {matter.courtInfo && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3>
                    <Scale size={18} />
                    Court Information
                  </h3>
                </div>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Court</span>
                    <span className={styles.detailValue}>{matter.courtInfo.courtName}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Case Number</span>
                    <span className={styles.detailValue}>{matter.courtInfo.caseNumber}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Judge</span>
                    <span className={styles.detailValue}>{matter.courtInfo.judge}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Jurisdiction</span>
                    <span className={styles.detailValue}>{matter.courtInfo.jurisdiction}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Recent Updates */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3>
                  <MessageSquare size={18} />
                  Recent Updates
                </h3>
                <div className={styles.cardActions}>
                  <button className={styles.addBtn} onClick={() => setShowUpdateModal(true)}>
                    <Plus size={14} />
                    Add
                  </button>
                </div>
              </div>
              <div className={styles.updatesList}>
                {matterUpdates.slice(0, 3).map(update => (
                  <div key={update.id} className={styles.updateItem} onClick={() => { setEditingUpdate(update); setShowUpdateModal(true); }}>
                    <div className={styles.updateDate}>
                      <span className={styles.updateDay}>{format(parseISO(update.date), 'd')}</span>
                      <span className={styles.updateMonth}>{format(parseISO(update.date), 'MMM')}</span>
                    </div>
                    <div className={styles.updateContent}>
                      <span className={styles.updateTitle}>{update.title}</span>
                      <span className={styles.updateCategory}>{update.category.replace(/_/g, ' ')}</span>
                    </div>
                    <button 
                      className={styles.iconBtn}
                      onClick={(e) => { e.stopPropagation(); deleteMatterUpdate(update.id); }}
                      style={{ padding: '4px', opacity: 0.6 }}
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {matterUpdates.length === 0 && (
                  <p className={styles.noData}>No updates yet</p>
                )}
                {matterUpdates.length > 3 && (
                  <button 
                    className={styles.viewAllBtn}
                    onClick={() => setActiveTab('updates')}
                  >
                    View all {matterUpdates.length} updates →
                  </button>
                )}
              </div>
            </div>

            {/* Upcoming Events */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3>
                  <Calendar size={18} />
                  Upcoming Events
                </h3>
                <div className={styles.cardActions}>
                  <button className={styles.addBtn} onClick={() => setShowEventModal(true)}>
                    <Plus size={14} />
                    Add
                  </button>
                </div>
              </div>
              <div className={styles.eventsList}>
                {matterEvents.slice(0, 3).map(event => (
                  <div key={event.id} className={styles.eventItem} style={{ cursor: 'pointer' }} onClick={() => setEditingEvent(event)}>
                    <div 
                      className={styles.eventDot} 
                      style={{ background: event.color }}
                    />
                    <div style={{ flex: 1 }}>
                      <span className={styles.eventTitle}>{event.title}</span>
                      <span className={styles.eventDate}>
                        {format(parseISO(event.startTime), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                    <button 
                      className={styles.iconBtn}
                      onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event.id); }}
                      style={{ padding: '4px', opacity: 0.6 }}
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {matterEvents.length === 0 && (
                  <p className={styles.noData}>No upcoming events</p>
                )}
              </div>
            </div>

            {/* Recent Time Entries */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3>
                  <Clock size={18} />
                  Recent Time Entries
                </h3>
                <div className={styles.cardActions}>
                  <button className={styles.addBtn} onClick={() => setShowTimeEntryModal(true)}>
                    <Plus size={14} />
                    Add
                  </button>
                </div>
              </div>
              <div className={styles.timeList}>
                {matterTimeEntries.slice(0, 5).map(entry => (
                  <div key={entry.id} className={styles.timeItem} style={{ cursor: 'pointer' }} onClick={() => setEditingTimeEntry(entry)}>
                    <div style={{ flex: 1 }}>
                      <span className={styles.timeDesc}>{entry.description}</span>
                      <span className={styles.timeDate}>
                        {format(parseAsLocalDate(entry.date), 'MMM d, yyyy')}
                      </span>
                    </div>
                    <div className={styles.timeHours}>
                      <span>{entry.hours}h</span>
                      <span className={styles.timeAmount}>${entry.amount.toLocaleString()}</span>
                    </div>
                    <button 
                      className={styles.iconBtn}
                      onClick={(e) => { e.stopPropagation(); handleDeleteTimeEntry(entry.id); }}
                      style={{ padding: '4px', opacity: 0.6 }}
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {matterTimeEntries.length === 0 && (
                  <p className={styles.noData}>No time entries</p>
                )}
              </div>
            </div>

          </div>
        )}

        {/* Notes Tab */}
        {activeTab === 'notes' && (
          <NotesSection 
            notes={matter.notes || ''}
            onSave={async (notes: string) => {
              await updateMatter(id!, { notes })
              await fetchMatters()
            }}
            entityType="matter"
          />
        )}

        {/* Updates Tab */}
        {activeTab === 'updates' && (
          <div className={styles.updatesTab}>
            <div className={styles.tabHeader}>
              <h2>Case Updates & Progress</h2>
              <div className={styles.tabActions}>
                <button 
                  className={styles.primaryBtn}
                  onClick={() => { setEditingUpdate(null); setShowUpdateModal(true); }}
                >
                  <Plus size={18} />
                  Add Update
                </button>
              </div>
            </div>

            {matterUpdates.length === 0 ? (
              <div className={styles.emptyUpdates}>
                <MessageSquare size={48} />
                <p>No updates yet</p>
                <p style={{ fontSize: '0.875rem', color: 'var(--apex-muted)', marginTop: '8px' }}>
                  Track case progress, client communications, and key milestones
                </p>
                <button 
                  className={styles.primaryBtn} 
                  onClick={() => setShowUpdateModal(true)}
                  style={{ marginTop: '1rem' }}
                >
                  <Plus size={18} />
                  Add First Update
                </button>
              </div>
            ) : (
              <div className={styles.updatesTimeline}>
                {matterUpdates.map((update, index) => (
                  <div key={update.id} className={styles.updateCard}>
                    <div className={styles.updateTimelineMarker}>
                      <div className={clsx(styles.updateDot, styles[update.category])} />
                      {index < matterUpdates.length - 1 && <div className={styles.updateLine} />}
                    </div>
                    <div className={styles.updateCardContent}>
                      <div className={styles.updateCardHeader}>
                        <div>
                          <span className={clsx(styles.updateCategoryBadge, styles[update.category])}>
                            {update.category.replace(/_/g, ' ')}
                          </span>
                          <span className={styles.updateCardDate}>
                            {format(parseISO(update.date), 'MMMM d, yyyy')}
                          </span>
                        </div>
                        <div className={styles.cardActions}>
                          <button 
                            className={styles.iconBtn}
                            onClick={() => { setEditingUpdate(update); setShowUpdateModal(true); }}
                            title="Edit"
                            style={{ padding: '6px' }}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            className={styles.iconBtn}
                            onClick={() => deleteMatterUpdate(update.id)}
                            title="Delete"
                            style={{ padding: '6px', color: 'var(--apex-error)' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <h4 className={styles.updateCardTitle}>{update.title}</h4>
                      <p className={styles.updateCardDescription}>{update.description}</p>
                      <span className={styles.updateCardTimestamp}>
                        Added {formatDistanceToNow(parseISO(update.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'time' && (
          <div className={styles.timeTab}>
            <div className={styles.tabHeader}>
              <h2>Time Entries</h2>
              <div className={styles.tabActions}>
                {timer.isRunning && timer.matterId === id ? (
                  <div className={styles.activeTimerBadge}>
                    <Clock size={16} />
                    <span className={styles.timerDisplay}>{formatElapsedTime(timer.elapsed)}</span>
                    <button 
                      className={styles.timerControlBtn}
                      onClick={stopTimer}
                      title="Pause Timer"
                    >
                      <Pause size={16} />
                    </button>
                    <button 
                      className={clsx(styles.timerControlBtn, styles.danger)}
                      onClick={discardTimer}
                      title="Discard Timer"
                    >
                      <StopCircle size={16} />
                    </button>
                  </div>
                ) : timer.isRunning ? (
                  <span className={styles.timerOnOtherMatter}>Timer active on another matter</span>
                ) : null}
                <button 
                  className={styles.primaryBtn}
                  onClick={() => setShowTimeEntryModal(true)}
                >
                  <Plus size={18} />
                  New Time Entry
                </button>
              </div>
            </div>

            {/* Time Stats */}
            <div className={styles.timeStats}>
              <div className={styles.timeStat}>
                <Clock size={20} />
                <div>
                  <span className={styles.timeStatValue}>{stats.totalHours.toFixed(1)}h</span>
                  <span className={styles.timeStatLabel}>Total Hours</span>
                </div>
              </div>
              <div className={styles.timeStat}>
                <DollarSign size={20} />
                <div>
                  <span className={styles.timeStatValue}>${stats.totalUnbilled.toLocaleString()}</span>
                  <span className={styles.timeStatLabel}>Unbilled</span>
                </div>
              </div>
              <div className={styles.timeStat}>
                <CheckCircle2 size={20} />
                <div>
                  <span className={styles.timeStatValue}>${stats.totalBilled.toLocaleString()}</span>
                  <span className={styles.timeStatLabel}>Billed</span>
                </div>
              </div>
            </div>

            {/* Selection Bar */}
            {selectedTimeEntries.length > 0 && (
              <div className={styles.selectionBar}>
                <div className={styles.selectionInfo}>
                  <CheckCircle2 size={18} />
                  <span>{selectedTimeEntries.length} entries selected</span>
                  <span className={styles.selectionAmount}>
                    {selectedEntriesHours.toFixed(1)}h • ${selectedEntriesTotal.toLocaleString()}
                  </span>
                </div>
                <div className={styles.selectionActions}>
                  <button 
                    className={styles.clearSelectionBtn}
                    onClick={() => setSelectedTimeEntries([])}
                  >
                    Clear
                  </button>
                  <button 
                    className={styles.createInvoiceBtn}
                    onClick={() => setShowBillEntriesModal(true)}
                  >
                    <FileText size={16} />
                    Create Invoice
                  </button>
                </div>
              </div>
            )}

            {/* Select All Unbilled */}
            {unbilledEntries.length > 0 && selectedTimeEntries.length === 0 && (
              <div className={styles.selectAllBar}>
                <button 
                  className={styles.selectAllBtn}
                  onClick={toggleAllUnbilledEntries}
                >
                  Select All Unbilled ({unbilledEntries.length})
                </button>
              </div>
            )}

            {/* Search and Filter Bar */}
            {matterTimeEntries.length > 0 && (
              <div className={styles.filterBar}>
                <div className={styles.searchInputWrapper}>
                  <Search size={16} className={styles.searchIcon} />
                  <input
                    type="text"
                    placeholder="Search by description..."
                    value={timeEntriesSearch}
                    onChange={(e) => setTimeEntriesSearch(e.target.value)}
                    className={styles.searchInput}
                  />
                  {timeEntriesSearch && (
                    <button 
                      className={styles.clearSearchBtn}
                      onClick={() => setTimeEntriesSearch('')}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className={styles.filterControls}>
                  <select
                    value={timeEntriesFilterStatus}
                    onChange={(e) => setTimeEntriesFilterStatus(e.target.value as 'all' | 'billed' | 'unbilled')}
                    className={styles.filterSelect}
                  >
                    <option value="all">All Status</option>
                    <option value="unbilled">Unbilled</option>
                    <option value="billed">Billed</option>
                  </select>
                  {(timeEntriesSearch || timeEntriesFilterStatus !== 'all') && (
                    <button 
                      className={styles.clearFiltersBtn}
                      onClick={() => {
                        setTimeEntriesSearch('')
                        setTimeEntriesFilterStatus('all')
                      }}
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
                {filteredTimeEntries.length !== matterTimeEntries.length && (
                  <span className={styles.filterCount}>
                    Showing {filteredTimeEntries.length} of {matterTimeEntries.length} entries
                  </span>
                )}
              </div>
            )}

            {matterTimeEntries.length === 0 ? (
              <div className={styles.emptyTime}>
                <Clock size={48} />
                <p>No time entries yet</p>
                <button 
                  className={styles.primaryBtn} 
                  onClick={() => setShowTimeEntryModal(true)}
                >
                  <Plus size={18} />
                  Log First Time Entry
                </button>
              </div>
            ) : filteredTimeEntries.length === 0 ? (
              <div className={styles.emptyTime}>
                <Filter size={48} />
                <p>No entries match your filters</p>
                <button 
                  className={styles.primaryBtn} 
                  onClick={() => {
                    setTimeEntriesSearch('')
                    setTimeEntriesFilterStatus('all')
                  }}
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <div className={styles.timeEntryCards}>
                {filteredTimeEntries.map(entry => (
                  <div 
                    key={entry.id} 
                    className={clsx(
                      styles.timeEntryCard,
                      selectedTimeEntries.includes(entry.id) && styles.selected
                    )}
                  >
                    {/* Checkbox for unbilled entries */}
                    {!entry.billed && entry.billable && (
                      <div className={styles.entryCheckbox}>
                        <input
                          type="checkbox"
                          checked={selectedTimeEntries.includes(entry.id)}
                          onChange={() => toggleTimeEntrySelection(entry.id)}
                        />
                      </div>
                    )}
                    <div className={styles.timeEntryDate}>
                      <span className={styles.timeEntryDay}>
                        {format(parseAsLocalDate(entry.date), 'd')}
                      </span>
                      <span className={styles.timeEntryMonth}>
                        {format(parseAsLocalDate(entry.date), 'MMM')}
                      </span>
                    </div>
                    <div className={styles.timeEntryContent}>
                      <span className={styles.timeEntryDesc}>{entry.description || 'No description'}</span>
                      <div className={styles.timeEntryMeta}>
                        <span>{entry.hours}h @ ${entry.rate}/hr</span>
                      </div>
                    </div>
                    <div className={styles.timeEntryRight}>
                      <span className={styles.timeEntryAmount}>${entry.amount.toLocaleString()}</span>
                      <span className={clsx(styles.badge, entry.billed ? styles.billed : styles.unbilled)}>
                        {entry.billed ? 'Billed' : 'Unbilled'}
                      </span>
                    </div>
                    <div className={styles.cardActions} style={{ marginLeft: '12px' }}>
                      <button 
                        className={styles.iconBtn}
                        onClick={() => setEditingTimeEntry(entry)}
                        title="Edit"
                        style={{ padding: '6px' }}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        className={styles.iconBtn}
                        onClick={() => handleDeleteTimeEntry(entry.id)}
                        title="Delete"
                        style={{ padding: '6px', color: 'var(--apex-error)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'billing' && (
          <div className={styles.billingTab}>
            <div className={styles.tabHeader}>
              <h2>Invoices</h2>
              <div className={styles.tabActions}>
                <button 
                  className={styles.primaryBtn}
                  onClick={() => setShowInvoiceModal(true)}
                >
                  <Plus size={18} />
                  Create Invoice
                </button>
              </div>
            </div>
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Issue Date</th>
                    <th>Due Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {matterInvoices.map(invoice => (
                    <tr key={invoice.id}>
                      <td>{invoice.number}</td>
                      <td>{format(parseISO(invoice.issueDate), 'MMM d, yyyy')}</td>
                      <td>{format(parseISO(invoice.dueDate), 'MMM d, yyyy')}</td>
                      <td>${invoice.total.toLocaleString()}</td>
                      <td>
                        <span className={clsx(styles.badge, styles[invoice.status])}>
                          {invoice.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {matterInvoices.length === 0 && (
                <div className={styles.emptyTable}>No invoices yet</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className={styles.documentsTab}>
            <div className={styles.tabHeader}>
              <h2>Documents</h2>
              <div className={styles.tabActions}>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setIsUploading(true)
                    try {
                      await addDocument(file, { matterId: id, clientId: matter?.clientId })
                      fetchDocuments({ matterId: id })
                    } catch (error) {
                      console.error('Upload failed:', error)
                      alert('Failed to upload document. Please try again.')
                    } finally {
                      setIsUploading(false)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }
                  }}
                />
                <button 
                  className={styles.primaryBtn}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 size={18} className={styles.spinner} />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload size={18} />
                      Upload Document
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className={styles.docGrid}>
              {matterDocuments.map(doc => (
                <div 
                  key={doc.id} 
                  className={styles.docCard}
                  onClick={() => setShowDocPreview(doc)}
                >
                  <div className={styles.docIcon}>
                    <FileText size={24} />
                  </div>
                  <div className={styles.docInfo}>
                    <span className={styles.docName}>{doc.name}</span>
                    <span className={styles.docMeta}>
                      {format(parseISO(doc.uploadedAt), 'MMM d, yyyy')} · 
                      {(doc.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                  <div className={styles.docActions} onClick={e => e.stopPropagation()}>
                    <button 
                      className={styles.docDownloadBtn}
                      onClick={() => downloadDocument(doc)}
                      title="Download"
                    >
                      <Download size={16} />
                    </button>
                  </div>
                  {doc.aiSummary && (
                    <span className={styles.docAi}>
                      <Sparkles size={12} />
                      AI Summary
                    </span>
                  )}
                </div>
              ))}
              {matterDocuments.length === 0 && (
                <div className={styles.emptyDocs}>
                  <FileText size={48} />
                  <p>No documents uploaded</p>
                  <button 
                    className={styles.primaryBtn} 
                    onClick={() => fileInputRef.current?.click()}
                    style={{ marginTop: '1rem' }}
                  >
                    <Upload size={18} />
                    Upload First Document
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className={styles.calendarTab}>
            <div className={styles.tabHeader}>
              <h2>Events & Deadlines</h2>
              <div className={styles.tabActions}>
                <button 
                  className={styles.primaryBtn}
                  onClick={() => setShowEventModal(true)}
                >
                  <Plus size={18} />
                  Add Event
                </button>
              </div>
            </div>
            <div className={styles.eventCards}>
              {matterEvents.map(event => (
                <div 
                  key={event.id} 
                  className={styles.eventCard}
                  style={{ borderLeftColor: event.color }}
                >
                  <div className={styles.eventHeader}>
                    <span className={styles.eventType} style={{ color: event.color }}>
                      {event.type.replace('_', ' ')}
                    </span>
                    <div className={styles.eventCardActions}>
                      <button 
                        className={styles.iconBtn}
                        onClick={() => setEditingEvent(event)}
                        title="Edit"
                        style={{ padding: '4px' }}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        className={styles.iconBtn}
                        onClick={() => handleDeleteEvent(event.id)}
                        title="Delete"
                        style={{ padding: '4px', color: 'var(--apex-error)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                      <span className={styles.eventTime}>
                        {format(parseISO(event.startTime), 'h:mm a')}
                      </span>
                    </div>
                  </div>
                  <h4>{event.title}</h4>
                  <p>{format(parseISO(event.startTime), 'EEEE, MMMM d, yyyy')}</p>
                  {event.location && (
                    <span className={styles.eventLocation}>{event.location}</span>
                  )}
                </div>
              ))}
              {matterEvents.length === 0 && (
                <div className={styles.emptyEvents}>
                  <Calendar size={48} />
                  <p>No events scheduled</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tasks Tab - Clio Style */}
        {activeTab === 'tasks' && (
          <div className={styles.tasksTab}>
            <div className={styles.tabHeader}>
              <h2>Tasks</h2>
              <div className={styles.tabActions}>
                <button className={styles.primaryBtn} onClick={() => setShowTaskModal(true)}>
                  <Plus size={18} />
                  Add Task
                </button>
              </div>
            </div>
            
            <div className={styles.tasksSummary}>
              <div className={styles.taskStat}>
                <span className={styles.taskStatValue}>{tasks.filter(t => t.status === 'completed').length}</span>
                <span className={styles.taskStatLabel}>Completed</span>
              </div>
              <div className={styles.taskStat}>
                <span className={styles.taskStatValue}>{tasks.filter(t => t.status === 'in_progress').length}</span>
                <span className={styles.taskStatLabel}>In Progress</span>
              </div>
              <div className={styles.taskStat}>
                <span className={styles.taskStatValue}>{tasks.filter(t => t.status === 'pending').length}</span>
                <span className={styles.taskStatLabel}>Pending</span>
              </div>
            </div>

            {tasks.length === 0 ? (
              <div className={styles.emptyTasks}>
                <ListTodo size={48} />
                <p>No tasks yet</p>
                <button className={styles.primaryBtn} onClick={() => setShowTaskModal(true)}>
                  <Plus size={18} />
                  Create First Task
                </button>
              </div>
            ) : (
              <div className={styles.tasksList}>
                {tasks.map(task => (
                  <div 
                    key={task.id} 
                    className={clsx(styles.taskCard, styles[task.status])}
                  >
                    <div 
                      className={styles.taskCheckbox}
                      onClick={() => toggleTaskStatus(task.id)}
                    >
                      {task.status === 'completed' ? (
                        <CheckCircle2 size={20} className={styles.taskCompleted} />
                      ) : (
                        <Circle size={20} />
                      )}
                    </div>
                    <div className={styles.taskContent}>
                      <span className={styles.taskName}>{task.name}</span>
                      <div className={styles.taskMeta}>
                        <span className={styles.taskAssignee}>
                          <Users size={12} />
                          {task.assignee}
                        </span>
                        <span className={styles.taskDue}>
                          <Calendar size={12} />
                          Due: {format(parseISO(task.dueDate), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                    <div className={styles.taskStatus}>
                      <span className={clsx(styles.taskStatusBadge, styles[task.status])}>
                        {task.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className={styles.cardActions} style={{ marginLeft: '12px' }}>
                      <button 
                        className={styles.iconBtn}
                        onClick={() => setEditingTask(task)}
                        title="Edit"
                        style={{ padding: '6px' }}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        className={styles.iconBtn}
                        onClick={() => deleteTask(task.id)}
                        title="Delete"
                        style={{ padding: '6px', color: 'var(--apex-error)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Contacts Tab - Clio Style */}
        {activeTab === 'contacts' && (
          <div className={styles.contactsTab}>
            <div className={styles.tabHeader}>
              <h2>Related Contacts</h2>
              <div className={styles.tabActions}>
                <button className={styles.primaryBtn} onClick={() => setShowContactModal(true)}>
                  <Plus size={18} />
                  Add Contact
                </button>
              </div>
            </div>

            <div className={styles.contactsGrid}>
              {/* Client Info Card */}
              <div className={clsx(styles.contactCard, styles.clientCard)}>
                <div className={styles.contactCardHeader}>
                  <span className={styles.contactRole}>Client</span>
                </div>
                <div className={styles.contactInfo}>
                  <div className={styles.contactAvatar}>
                    {client?.name?.[0]}
                  </div>
                  <div>
                    <Link to={`/app/clients/${client?.id}`} className={styles.contactName}>
                      {client?.name}
                    </Link>
                    <span className={styles.contactEmail}>{client?.email}</span>
                  </div>
                </div>
                {client?.phone && (
                  <div className={styles.contactDetail}>
                    <span>Phone:</span> {client.phone}
                  </div>
                )}
                {client?.addressStreet && (
                  <div className={styles.contactDetail}>
                    <span>Address:</span> {client.addressStreet}
                  </div>
                )}
              </div>

              {/* Matter Contacts (saved) */}
              {matterContacts.map(contact => (
                <div key={contact.id} className={styles.contactCard}>
                  <div className={styles.contactCardHeader}>
                    <span className={styles.contactRole}>{contact.role}</span>
                    <button 
                      className={styles.iconBtn}
                      onClick={() => deleteContact(contact.id)}
                      title="Remove Contact"
                      style={{ padding: '4px', color: 'var(--apex-text)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className={styles.contactInfo}>
                    <div className={styles.contactAvatar}>
                      {contact.name[0]}
                    </div>
                    <div>
                      <span className={styles.contactName}>{contact.name}</span>
                      {contact.firm && <span className={styles.contactFirm}>{contact.firm}</span>}
                    </div>
                  </div>
                  {contact.email && (
                    <div className={styles.contactDetail}>
                      <span>Email:</span> {contact.email}
                    </div>
                  )}
                  {contact.phone && (
                    <div className={styles.contactDetail}>
                      <span>Phone:</span> {contact.phone}
                    </div>
                  )}
                </div>
              ))}

            </div>
          </div>
        )}
      </div>

      {/* Time Entry Modal */}
      {showTimeEntryModal && (
        <div className={styles.modalOverlay} onClick={() => setShowTimeEntryModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>New Time Entry</h2>
              <button onClick={() => setShowTimeEntryModal(false)} className={styles.closeBtn}>×</button>
            </div>
            <TimeEntryForm 
              matterId={id!}
              matterName={matter?.name || ''}
              defaultRate={matter?.billingRate || 450}
              onClose={() => setShowTimeEntryModal(false)}
              onSave={async (data) => {
                try {
                  await addTimeEntry(data)
                  setShowTimeEntryModal(false)
                  await fetchTimeEntries({ matterId: id })
                } catch (error) {
                  console.error('Failed to save time entry:', error)
                  alert('Failed to save time entry. Please try again.')
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {showInvoiceModal && (
        <div className={styles.modalOverlay} onClick={() => setShowInvoiceModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Create Invoice</h2>
              <button onClick={() => setShowInvoiceModal(false)} className={styles.closeBtn}>×</button>
            </div>
            <InvoiceForm 
              matterId={id!}
              clientId={matter?.clientId || ''}
              clientName={client?.name || ''}
              matterName={matter?.name || ''}
              unbilledAmount={stats.totalUnbilled}
              onClose={() => setShowInvoiceModal(false)}
              onSave={async (data) => {
                try {
                  await addInvoice(data)
                  setShowInvoiceModal(false)
                  fetchInvoices()
                } catch (error) {
                  console.error('Failed to create invoice:', error)
                  alert('Failed to create invoice. Please try again.')
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Event Modal */}
      {showEventModal && (
        <div className={styles.modalOverlay} onClick={() => setShowEventModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Add Event</h2>
              <button onClick={() => setShowEventModal(false)} className={styles.closeBtn}>×</button>
            </div>
            <EventForm 
              matterId={id!}
              matterName={matter?.name || ''}
              onClose={() => setShowEventModal(false)}
              onSave={async (data) => {
                try {
                  await addEvent(data)
                  setShowEventModal(false)
                  fetchEvents()
                } catch (error) {
                  console.error('Failed to create event:', error)
                  alert('Failed to create event. Please try again.')
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Task Modal */}
      {showTaskModal && (
        <div className={styles.modalOverlay} onClick={() => setShowTaskModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Add Task</h2>
              <button onClick={() => setShowTaskModal(false)} className={styles.closeBtn}>×</button>
            </div>
            <TaskForm 
              matterName={matter?.name || ''}
              onClose={() => setShowTaskModal(false)}
              onSave={(data) => {
                addTask(data)
                setShowTaskModal(false)
              }}
            />
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {showDocPreview && (
        <div className={styles.modalOverlay} onClick={() => setShowDocPreview(null)}>
          <div className={styles.docPreviewModal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{showDocPreview.name}</h2>
              <button onClick={() => setShowDocPreview(null)} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.docPreviewContent}>
              <div className={styles.docPreviewInfo}>
                <div className={styles.docPreviewIcon}>
                  <FileText size={48} />
                </div>
                <div className={styles.docPreviewMeta}>
                  <h3>{showDocPreview.name}</h3>
                  <p>Uploaded: {format(parseISO(showDocPreview.uploadedAt), 'MMMM d, yyyy h:mm a')}</p>
                  <p>Size: {(showDocPreview.size / 1024 / 1024).toFixed(2)} MB</p>
                  <p>Type: {showDocPreview.type || 'Document'}</p>
                </div>
              </div>
              {showDocPreview.aiSummary && (
                <div className={styles.docPreviewSummary}>
                  <h4><Sparkles size={16} /> AI Summary</h4>
                  <p>{showDocPreview.aiSummary}</p>
                </div>
              )}
              <div className={styles.docPreviewActions}>
                <button 
                  className={styles.primaryBtn}
                  onClick={() => downloadDocument(showDocPreview)}
                >
                  <Download size={18} />
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Edit Matter Modal */}
      {showEditMatterModal && matter && (
        <div className={styles.modalOverlay} onClick={() => setShowEditMatterModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className={styles.modalHeader}>
              <h2>Edit Matter</h2>
              <button onClick={() => setShowEditMatterModal(false)} className={styles.closeBtn}>×</button>
            </div>
            <EditMatterForm 
              matter={matter}
              attorneys={attorneys}
              typeOptions={typeOptions}
              onClose={() => setShowEditMatterModal(false)}
              onSave={async (data) => {
                try {
                  await updateMatter(id!, data)
                  setShowEditMatterModal(false)
                  fetchMatters()
                } catch (error) {
                  console.error('Failed to update matter:', error)
                  alert('Failed to update matter. Please try again.')
                }
              }}
              onManageTypes={() => {
                setShowEditMatterModal(false)
                setShowTypesManager(true)
              }}
            />
          </div>
        </div>
      )}
      
      {/* Edit Time Entry Modal */}
      {editingTimeEntry && (
        <div className={styles.modalOverlay} onClick={() => setEditingTimeEntry(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Edit Time Entry</h2>
              <button onClick={() => setEditingTimeEntry(null)} className={styles.closeBtn}>×</button>
            </div>
            <TimeEntryForm 
              matterId={id!}
              matterName={matter?.name || ''}
              defaultRate={matter?.billingRate || 450}
              existingEntry={editingTimeEntry}
              onClose={() => setEditingTimeEntry(null)}
              onSave={async (data) => {
                try {
                  await updateTimeEntry(editingTimeEntry.id, data)
                  setEditingTimeEntry(null)
                  await fetchTimeEntries({ matterId: id })
                } catch (error) {
                  console.error('Failed to update time entry:', error)
                  alert('Failed to update time entry. Please try again.')
                }
              }}
            />
          </div>
        </div>
      )}
      
      {/* Edit Event Modal */}
      {editingEvent && (
        <div className={styles.modalOverlay} onClick={() => setEditingEvent(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Edit Event</h2>
              <button onClick={() => setEditingEvent(null)} className={styles.closeBtn}>×</button>
            </div>
            <EventForm 
              matterId={id!}
              matterName={matter?.name || ''}
              existingEvent={editingEvent}
              onClose={() => setEditingEvent(null)}
              onSave={async (data) => {
                try {
                  await updateEvent(editingEvent.id, data)
                  setEditingEvent(null)
                  fetchEvents()
                } catch (error) {
                  console.error('Failed to update event:', error)
                  alert('Failed to update event. Please try again.')
                }
              }}
            />
          </div>
        </div>
      )}
      
      {/* Edit Task Modal */}
      {editingTask && (
        <div className={styles.modalOverlay} onClick={() => setEditingTask(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Edit Task</h2>
              <button onClick={() => setEditingTask(null)} className={styles.closeBtn}>×</button>
            </div>
            <TaskForm 
              matterName={matter?.name || ''}
              existingTask={editingTask}
              onClose={() => setEditingTask(null)}
              onSave={(data) => {
                updateTask(editingTask.id, data)
                setEditingTask(null)
              }}
            />
          </div>
        </div>
      )}
      
      {/* Add Contact Modal */}
      {showContactModal && (
        <div className={styles.modalOverlay} onClick={() => setShowContactModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Add Contact</h2>
              <button onClick={() => setShowContactModal(false)} className={styles.closeBtn}>×</button>
            </div>
            <ContactForm 
              matterName={matter?.name || ''}
              onClose={() => setShowContactModal(false)}
              onSave={(data) => {
                addContact(data)
                setShowContactModal(false)
              }}
            />
          </div>
        </div>
      )}

      {/* Update Modal */}
      {showUpdateModal && (
        <div className={styles.modalOverlay} onClick={() => { setShowUpdateModal(false); setEditingUpdate(null); }}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{editingUpdate ? 'Edit Update' : 'Add Update'}</h2>
              <button onClick={() => { setShowUpdateModal(false); setEditingUpdate(null); }} className={styles.closeBtn}>×</button>
            </div>
            <MatterUpdateForm 
              matterName={matter?.name || ''}
              existingUpdate={editingUpdate}
              onClose={() => { setShowUpdateModal(false); setEditingUpdate(null); }}
              onSave={(data) => {
                if (editingUpdate) {
                  updateMatterUpdate(editingUpdate.id, data)
                } else {
                  addMatterUpdate(data)
                }
                setShowUpdateModal(false)
                setEditingUpdate(null)
              }}
            />
          </div>
        </div>
      )}

      {/* Bill Time Entries Modal */}
      {showBillEntriesModal && client && (
        <BillEntriesModal
          onClose={() => {
            setShowBillEntriesModal(false)
            setSelectedTimeEntries([])
          }}
          selectedEntries={matterTimeEntries.filter(e => selectedTimeEntries.includes(e.id))}
          matter={matter}
          client={client}
          onCreateInvoice={async (invoiceData) => {
            try {
              await addInvoice(invoiceData)
              // Mark entries as billed
              for (const entryId of selectedTimeEntries) {
                await updateTimeEntry(entryId, { billed: true })
              }
              await fetchTimeEntries({ matterId: id })
              await fetchInvoices()
              setSelectedTimeEntries([])
              setShowBillEntriesModal(false)
            } catch (error) {
              console.error('Failed to create invoice:', error)
              alert('Failed to create invoice. Please try again.')
            }
          }}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        type={confirmModal.type}
      />

      {/* Matter Types Manager */}
      <MatterTypesManager 
        isOpen={showTypesManager}
        onClose={() => setShowTypesManager(false)}
      />

      {/* Share Matter Modal */}
      <ShareMatterModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        matterId={id || ''}
        matterName={matter.name}
        currentVisibility={matter.visibility || 'firm_wide'}
        onPermissionsChanged={() => {
          // Refresh matter data after permissions changed
          fetchMatters()
        }}
      />

      {/* Permissions Panel (Slide-out) */}
      {showPermissionsPanel && (
        <div className={styles.permissionsPanelOverlay} onClick={() => setShowPermissionsPanel(false)}>
          <div className={styles.permissionsPanel} onClick={(e) => e.stopPropagation()}>
            <MatterPermissions
              matterId={id || ''}
              matterName={matter.name}
              canManagePermissions={
                ['owner', 'admin', 'billing'].includes(user?.role || '') ||
                matter.responsibleAttorney === user?.id
              }
              onClose={() => setShowPermissionsPanel(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// Task Form Component
function TaskForm({ matterName, onClose, onSave, existingTask }: {
  matterName: string
  onClose: () => void
  onSave: (data: Omit<Task, 'id'>) => void
  existingTask?: Task
}) {
  const [formData, setFormData] = useState({
    name: existingTask?.name || '',
    status: existingTask?.status || 'pending' as 'pending' | 'in_progress' | 'completed',
    dueDate: existingTask?.dueDate || format(new Date(), 'yyyy-MM-dd'),
    assignee: existingTask?.assignee || '',
    description: existingTask?.description || ''
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      alert('Please enter a task name')
      return
    }
    if (!formData.assignee.trim()) {
      alert('Please enter an assignee')
      return
    }
    onSave(formData)
  }

  return (
    <form onSubmit={handleSubmit} className={styles.modalForm}>
      <div className={styles.formInfo}>
        <strong>Matter:</strong> {matterName}
      </div>

      <div className={styles.formGroup}>
        <label>Task Name *</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})}
          placeholder="Enter task name..."
          required
        />
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Due Date</label>
          <input
            type="date"
            value={formData.dueDate}
            onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label>Status</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({...formData, status: e.target.value as any})}
          >
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label>Assignee *</label>
        <input
          type="text"
          value={formData.assignee}
          onChange={(e) => setFormData({...formData, assignee: e.target.value})}
          placeholder="Who is responsible for this task?"
          required
        />
      </div>

      <div className={styles.formGroup}>
        <label>Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          placeholder="Task details..."
          rows={3}
        />
      </div>

      <div className={styles.modalActions}>
        <button type="button" onClick={onClose} className={styles.cancelBtn}>
          Cancel
        </button>
        <button type="submit" className={styles.saveBtn}>
          {existingTask ? 'Update Task' : 'Create Task'}
        </button>
      </div>
    </form>
  )
}

// Bill Entries Modal - Creates invoice from selected time entries
function BillEntriesModal({ 
  onClose, 
  selectedEntries, 
  matter,
  client,
  onCreateInvoice 
}: { 
  onClose: () => void
  selectedEntries: any[]
  matter: any
  client: any
  onCreateInvoice: (data: any) => Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const totalAmount = selectedEntries.reduce((sum, e) => sum + e.amount, 0)
  const totalHours = selectedEntries.reduce((sum, e) => sum + e.hours, 0)

  const handleCreateInvoice = async () => {
    setIsSubmitting(true)
    try {
      const lineItems = selectedEntries.map(entry => ({
        description: entry.description || 'Legal services',
        quantity: entry.hours,
        rate: entry.rate,
        amount: entry.amount
      }))
      
      await onCreateInvoice({
        clientId: client.id,
        matterId: matter.id,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'draft',
        subtotal: totalAmount,
        total: totalAmount,
        amountPaid: 0,
        lineItems,
        timeEntryIds: selectedEntries.map(e => e.id)
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.billModal} onClick={e => e.stopPropagation()}>
        <div className={styles.billModalHeader}>
          <div className={styles.billModalTitle}>
            <FileText size={20} />
            <h2>Create Invoice</h2>
          </div>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        
        <div className={styles.billModalContent}>
          {/* Client & Matter Info */}
          <div className={styles.billClientInfo}>
            <div><strong>Client:</strong> {client.name}</div>
            <div><strong>Matter:</strong> {matter.name}</div>
          </div>

          {/* Summary Stats */}
          <div className={styles.billSummaryCompact}>
            <div className={styles.billStatItem}>
              <span className={styles.billStatValue}>{selectedEntries.length}</span>
              <span className={styles.billStatLabel}>Entries</span>
            </div>
            <div className={styles.billStatDivider} />
            <div className={styles.billStatItem}>
              <span className={styles.billStatValue}>{totalHours.toFixed(1)}h</span>
              <span className={styles.billStatLabel}>Hours</span>
            </div>
            <div className={styles.billStatDivider} />
            <div className={styles.billStatItem}>
              <span className={styles.billStatValue}>${totalAmount.toLocaleString()}</span>
              <span className={styles.billStatLabel}>Total</span>
            </div>
          </div>

          {/* Preview List */}
          <div className={styles.billPreviewList}>
            <div className={styles.billPreviewHeader}>Line Items</div>
            <div className={styles.billPreviewItems}>
              {selectedEntries.map((entry, i) => (
                <div key={i} className={styles.billPreviewItem}>
                  <div className={styles.billPreviewItemLeft}>
                    <span className={styles.billPreviewDesc}>{entry.description || 'Legal services'}</span>
                    <span className={styles.billPreviewMeta}>{format(parseAsLocalDate(entry.date), 'MMM d, yyyy')}</span>
                  </div>
                  <div className={styles.billPreviewItemRight}>
                    <span className={styles.billPreviewHours}>{entry.hours}h</span>
                    <span className={styles.billPreviewAmount}>${entry.amount.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info Note */}
          <div className={styles.billNote}>
            <span>Invoice created as draft • Time entries marked as billed</span>
          </div>
        </div>

        <div className={styles.billModalFooter}>
          <button onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
            Cancel
          </button>
          <button 
            onClick={handleCreateInvoice} 
            className={styles.saveBtn}
            disabled={isSubmitting || selectedEntries.length === 0}
          >
            {isSubmitting ? 'Creating...' : `Create Invoice ($${totalAmount.toLocaleString()})`}
          </button>
        </div>
      </div>
    </div>
  )
}

// Time Entry Form Component
function TimeEntryForm({ matterId, matterName, defaultRate, onClose, onSave, existingEntry }: {
  matterId: string
  matterName: string
  defaultRate: number
  onClose: () => void
  onSave: (data: any) => Promise<void>
  existingEntry?: any
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    matterId,
    date: existingEntry?.date ? format(parseAsLocalDate(existingEntry.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
    hours: existingEntry?.hours || 1,
    rate: existingEntry?.rate || defaultRate,
    description: existingEntry?.description || '',
    billable: existingEntry?.billable !== undefined ? existingEntry.billable : true
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSave(formData)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.modalForm}>
      <div className={styles.formInfo}>
        <strong>Matter:</strong> {matterName}
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({...formData, date: e.target.value})}
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label>Hours</label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={formData.hours}
            onChange={(e) => setFormData({...formData, hours: parseFloat(e.target.value) || 0})}
            required
          />
        </div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Rate ($/hr)</label>
          <input
            type="number"
            value={formData.rate}
            onChange={(e) => setFormData({...formData, rate: parseFloat(e.target.value) || 0})}
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label>Total</label>
          <div className={styles.formValue}>${(formData.hours * formData.rate).toFixed(2)}</div>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label>Description (optional)</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          placeholder="Describe the work performed..."
          rows={3}
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={formData.billable}
            onChange={(e) => setFormData({...formData, billable: e.target.checked})}
          />
          Billable
        </label>
      </div>

      <div className={styles.modalActions}>
        <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
          Cancel
        </button>
        <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : (existingEntry ? 'Update Time Entry' : 'Save Time Entry')}
        </button>
      </div>
    </form>
  )
}

// Invoice Form Component
function InvoiceForm({ matterId, clientId, clientName, matterName, unbilledAmount, onClose, onSave }: {
  matterId: string
  clientId: string
  clientName: string
  matterName: string
  unbilledAmount: number
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    matterId,
    clientId,
    issueDate: format(new Date(), 'yyyy-MM-dd'),
    dueDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    notes: '',
    lineItems: [
      { type: 'fee', description: `Legal Services - ${matterName}`, quantity: 1, rate: unbilledAmount, amount: unbilledAmount }
    ]
  })

  const addLineItem = () => {
    setFormData({
      ...formData,
      lineItems: [...formData.lineItems, { type: 'fee', description: '', quantity: 1, rate: 0, amount: 0 }]
    })
  }

  const removeLineItem = (index: number) => {
    setFormData({
      ...formData,
      lineItems: formData.lineItems.filter((_, i) => i !== index)
    })
  }

  const updateLineItem = (index: number, field: string, value: any) => {
    const newLineItems = [...formData.lineItems]
    newLineItems[index] = { ...newLineItems[index], [field]: value }
    
    // Auto-calculate amount when quantity or rate changes
    if (field === 'quantity' || field === 'rate') {
      newLineItems[index].amount = newLineItems[index].quantity * newLineItems[index].rate
    }
    // If amount is directly edited, update rate
    if (field === 'amount' && newLineItems[index].quantity > 0) {
      newLineItems[index].rate = value / newLineItems[index].quantity
    }
    
    setFormData({ ...formData, lineItems: newLineItems })
  }

  const totalAmount = formData.lineItems.reduce((sum, item) => sum + (item.amount || 0), 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    if (totalAmount <= 0) {
      alert('Please add at least one line item with an amount')
      return
    }
    setIsSubmitting(true)
    try {
      await onSave({ ...formData, total: totalAmount })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.modalForm}>
      <div className={styles.formInfo}>
        <div><strong>Client:</strong> {clientName}</div>
        <div><strong>Matter:</strong> {matterName}</div>
        <div><strong>Unbilled Amount:</strong> ${unbilledAmount.toLocaleString()}</div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Issue Date</label>
          <input
            type="date"
            value={formData.issueDate}
            onChange={(e) => setFormData({...formData, issueDate: e.target.value})}
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label>Due Date</label>
          <input
            type="date"
            value={formData.dueDate}
            onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
            required
          />
        </div>
      </div>

      {/* Line Items Section */}
      <div className={styles.formGroup}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <label style={{ marginBottom: 0 }}>Line Items</label>
          <button 
            type="button" 
            onClick={addLineItem}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.25rem 0.5rem',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid var(--apex-gold)',
              borderRadius: '4px',
              color: 'var(--apex-gold)',
              fontSize: '0.75rem',
              cursor: 'pointer'
            }}
          >
            + Add Item
          </button>
        </div>
        
        <div style={{ 
          background: 'var(--apex-slate)', 
          border: '1px solid rgba(255, 255, 255, 0.1)', 
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 80px 100px 120px 40px',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'rgba(0, 0, 0, 0.2)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            fontSize: '0.7rem',
            fontWeight: '600',
            color: 'var(--apex-text)',
            textTransform: 'uppercase'
          }}>
            <span>Description</span>
            <span style={{ textAlign: 'center' }}>Qty</span>
            <span style={{ textAlign: 'right' }}>Rate</span>
            <span style={{ textAlign: 'right' }}>Amount</span>
            <span></span>
          </div>
          
          {/* Line Items */}
          {formData.lineItems.map((item, index) => (
            <div 
              key={index}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 80px 100px 120px 40px',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                borderBottom: index < formData.lineItems.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none'
              }}
            >
              <input
                type="text"
                value={item.description}
                onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                placeholder="Description"
                style={{ 
                  padding: '0.375rem 0.5rem',
                  background: 'var(--apex-deep)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px',
                  color: 'var(--apex-white)',
                  fontSize: '0.875rem'
                }}
                required
              />
              <input
                type="number"
                value={item.quantity}
                onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                min="0"
                step="0.5"
                style={{ 
                  padding: '0.375rem 0.5rem',
                  background: 'var(--apex-deep)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px',
                  color: 'var(--apex-white)',
                  fontSize: '0.875rem',
                  textAlign: 'center'
                }}
              />
              <input
                type="number"
                value={item.rate}
                onChange={(e) => updateLineItem(index, 'rate', parseFloat(e.target.value) || 0)}
                min="0"
                step="0.01"
                placeholder="0.00"
                style={{ 
                  padding: '0.375rem 0.5rem',
                  background: 'var(--apex-deep)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px',
                  color: 'var(--apex-white)',
                  fontSize: '0.875rem',
                  textAlign: 'right'
                }}
              />
              <input
                type="number"
                value={item.amount}
                onChange={(e) => updateLineItem(index, 'amount', parseFloat(e.target.value) || 0)}
                min="0"
                step="0.01"
                placeholder="0.00"
                style={{ 
                  padding: '0.375rem 0.5rem',
                  background: 'var(--apex-deep)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px',
                  color: 'var(--apex-white)',
                  fontSize: '0.875rem',
                  textAlign: 'right',
                  fontWeight: 'bold'
                }}
              />
              <button
                type="button"
                onClick={() => removeLineItem(index)}
                disabled={formData.lineItems.length === 1}
                style={{
                  background: 'none',
                  border: 'none',
                  color: formData.lineItems.length === 1 ? 'rgba(255,255,255,0.2)' : 'var(--apex-text)',
                  cursor: formData.lineItems.length === 1 ? 'not-allowed' : 'pointer',
                  padding: '0.25rem'
                }}
              >
                ×
              </button>
            </div>
          ))}
          
          {/* Total */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '2rem',
            padding: '0.75rem 1rem',
            background: 'rgba(0, 0, 0, 0.2)',
            fontWeight: '600'
          }}>
            <span style={{ color: 'var(--apex-text)' }}>Total:</span>
            <span style={{ color: 'var(--apex-gold-bright)', fontSize: '1.125rem' }}>
              ${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label>Notes</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({...formData, notes: e.target.value})}
          placeholder="Invoice notes..."
          rows={3}
        />
      </div>

      <div className={styles.modalActions}>
        <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
          Cancel
        </button>
        <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : `Create Invoice ($${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})})`}
        </button>
      </div>
    </form>
  )
}

// Event Form Component
function EventForm({ matterId, matterName, onClose, onSave, existingEvent }: {
  matterId: string
  matterName: string
  onClose: () => void
  onSave: (data: any) => Promise<void>
  existingEvent?: any
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    matterId,
    title: existingEvent?.title || '',
    type: existingEvent?.type || 'meeting',
    startTime: existingEvent?.startTime ? format(parseISO(existingEvent.startTime), "yyyy-MM-dd'T'HH:mm") : format(new Date(), "yyyy-MM-dd'T'10:00"),
    endTime: existingEvent?.endTime ? format(parseISO(existingEvent.endTime), "yyyy-MM-dd'T'HH:mm") : format(new Date(), "yyyy-MM-dd'T'11:00"),
    location: existingEvent?.location || '',
    description: existingEvent?.description || '',
    allDay: existingEvent?.allDay || false
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSave({
        ...formData,
        startTime: new Date(formData.startTime).toISOString(),
        endTime: new Date(formData.endTime).toISOString()
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.modalForm}>
      <div className={styles.formInfo}>
        <strong>Matter:</strong> {matterName}
      </div>

      <div className={styles.formGroup}>
        <label>Title</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({...formData, title: e.target.value})}
          placeholder="Event title..."
          required
        />
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Type</label>
          <select
            value={formData.type}
            onChange={(e) => setFormData({...formData, type: e.target.value})}
          >
            <option value="meeting">Meeting</option>
            <option value="court_date">Court Date</option>
            <option value="hearing">Hearing</option>
            <option value="deposition">Deposition</option>
            <option value="deadline">Deadline</option>
            <option value="filing_deadline">Filing Deadline</option>
            <option value="appointment">Appointment</option>
            <option value="conference_call">Conference Call</option>
          </select>
        </div>
        <div className={styles.formGroup}>
          <label>Location</label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({...formData, location: e.target.value})}
            placeholder="Location (optional)"
          />
        </div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Start</label>
          <input
            type="datetime-local"
            value={formData.startTime}
            onChange={(e) => setFormData({...formData, startTime: e.target.value})}
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label>End</label>
          <input
            type="datetime-local"
            value={formData.endTime}
            onChange={(e) => setFormData({...formData, endTime: e.target.value})}
            required
          />
        </div>
      </div>

      <div className={styles.formGroup}>
        <label>Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          placeholder="Event details..."
          rows={2}
        />
      </div>

      <div className={styles.modalActions}>
        <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
          Cancel
        </button>
        <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : (existingEvent ? 'Update Event' : 'Create Event')}
        </button>
      </div>
    </form>
  )
}

// Contact Form Component
function ContactForm({ matterName, onClose, onSave }: {
  matterName: string
  onClose: () => void
  onSave: (data: { name: string; role: string; firm?: string; email?: string; phone?: string }) => void
}) {
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    firm: '',
    email: '',
    phone: ''
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      alert('Please enter a contact name')
      return
    }
    if (!formData.role.trim()) {
      alert('Please enter a role')
      return
    }
    onSave(formData)
  }

  return (
    <form onSubmit={handleSubmit} className={styles.modalForm}>
      <div className={styles.formInfo}>
        <strong>Matter:</strong> {matterName}
      </div>

      <div className={styles.formGroup}>
        <label>Contact Name *</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})}
          placeholder="Enter contact name..."
          required
        />
      </div>

      <div className={styles.formGroup}>
        <label>Role *</label>
        <select
          value={formData.role}
          onChange={(e) => setFormData({...formData, role: e.target.value})}
          required
        >
          <option value="">Select a role...</option>
          <option value="Opposing Counsel">Opposing Counsel</option>
          <option value="Co-Counsel">Co-Counsel</option>
          <option value="Expert Witness">Expert Witness</option>
          <option value="Witness">Witness</option>
          <option value="Insurance Adjuster">Insurance Adjuster</option>
          <option value="Mediator">Mediator</option>
          <option value="Arbitrator">Arbitrator</option>
          <option value="Court Clerk">Court Clerk</option>
          <option value="Judge's Chambers">Judge's Chambers</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <div className={styles.formGroup}>
        <label>Firm / Organization</label>
        <input
          type="text"
          value={formData.firm}
          onChange={(e) => setFormData({...formData, firm: e.target.value})}
          placeholder="Enter firm or organization..."
        />
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
            placeholder="email@example.com"
          />
        </div>
        <div className={styles.formGroup}>
          <label>Phone</label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({...formData, phone: e.target.value})}
            placeholder="(555) 555-5555"
          />
        </div>
      </div>

      <div className={styles.modalActions}>
        <button type="button" onClick={onClose} className={styles.cancelBtn}>
          Cancel
        </button>
        <button type="submit" className={styles.saveBtn}>
          Add Contact
        </button>
      </div>
    </form>
  )
}

// Matter Update Form Component
function MatterUpdateForm({ matterName, existingUpdate, onClose, onSave }: {
  matterName: string
  existingUpdate?: MatterUpdate | null
  onClose: () => void
  onSave: (data: Omit<MatterUpdate, 'id' | 'createdAt' | 'updatedAt'>) => void
}) {
  const [formData, setFormData] = useState({
    date: existingUpdate?.date ? format(parseISO(existingUpdate.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
    title: existingUpdate?.title || '',
    description: existingUpdate?.description || '',
    category: existingUpdate?.category || 'general' as 'general' | 'court' | 'client_communication' | 'document' | 'billing' | 'milestone'
  })

  // Convert date string to ISO format preserving the local date
  const dateToISO = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day, 12, 0, 0)
    return date.toISOString()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) {
      alert('Please enter a title')
      return
    }
    onSave({
      ...formData,
      date: dateToISO(formData.date)
    })
  }

  return (
    <form onSubmit={handleSubmit} className={styles.modalForm}>
      <div className={styles.formInfo}>
        <strong>Matter:</strong> {matterName}
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({...formData, date: e.target.value})}
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label>Category</label>
          <select
            value={formData.category}
            onChange={(e) => setFormData({...formData, category: e.target.value as any})}
          >
            <option value="general">General Update</option>
            <option value="court">Court Filing/Ruling</option>
            <option value="client_communication">Client Communication</option>
            <option value="document">Document</option>
            <option value="billing">Billing</option>
            <option value="milestone">Milestone</option>
          </select>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label>Title *</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({...formData, title: e.target.value})}
          placeholder="Brief summary of the update..."
          required
        />
      </div>

      <div className={styles.formGroup}>
        <label>Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          placeholder="Detailed notes about what happened..."
          rows={5}
        />
      </div>

      <div className={styles.modalActions}>
        <button type="button" onClick={onClose} className={styles.cancelBtn}>
          Cancel
        </button>
        <button type="submit" className={styles.saveBtn}>
          {existingUpdate ? 'Update' : 'Add Update'}
        </button>
      </div>
    </form>
  )
}

// Edit Matter Form Component
function EditMatterForm({ matter, attorneys, typeOptions, onClose, onSave, onManageTypes }: {
  matter: any
  attorneys: any[]
  typeOptions: { value: string; label: string }[]
  onClose: () => void
  onSave: (data: any) => Promise<void>
  onManageTypes?: () => void
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    name: matter.name || '',
    description: matter.description || '',
    notes: matter.notes || '',
    type: matter.type || (typeOptions.length > 0 ? typeOptions[0].value : 'other'),
    status: matter.status || 'active',
    priority: matter.priority || 'medium',
    billingType: matter.billingType || 'hourly',
    billingRate: matter.billingRate || 450,
    responsibleAttorney: matter.responsibleAttorney || '',
    originatingAttorney: matter.originatingAttorney || ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSave(formData)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.modalForm}>
      <div className={styles.formGroup}>
        <label>Matter Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})}
          placeholder="Enter matter name"
          required
        />
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            Type
            {onManageTypes && (
              <button 
                type="button"
                onClick={onManageTypes}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--apex-gold-bright)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: 0
                }}
              >
                <Settings size={12} />
                Manage
              </button>
            )}
          </label>
          <select
            value={formData.type}
            onChange={(e) => setFormData({...formData, type: e.target.value})}
          >
            {typeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className={styles.formGroup}>
          <label>Priority</label>
          <select
            value={formData.priority}
            onChange={(e) => setFormData({...formData, priority: e.target.value})}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Status</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({...formData, status: e.target.value})}
          >
            <option value="intake">Intake</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="on_hold">On Hold</option>
            <option value="closed">Closed</option>
            <option value="closed_won">Closed - Won</option>
            <option value="closed_lost">Closed - Lost</option>
            <option value="closed_settled">Closed - Settled</option>
            <option value="closed_other">Closed - Other</option>
          </select>
        </div>
        <div className={styles.formGroup}>
          <label>Billing Type</label>
          <select
            value={formData.billingType}
            onChange={(e) => setFormData({...formData, billingType: e.target.value})}
          >
            <option value="hourly">Hourly</option>
            <option value="flat">Flat Fee</option>
            <option value="contingency">Contingency</option>
            <option value="retainer">Retainer</option>
          </select>
        </div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Responsible Attorney</label>
          <select
            value={formData.responsibleAttorney}
            onChange={(e) => setFormData({...formData, responsibleAttorney: e.target.value})}
          >
            <option value="">Select responsible attorney...</option>
            {attorneys.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} {a.role ? `(${a.role})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.formGroup}>
          <label>Originating Attorney</label>
          <select
            value={formData.originatingAttorney}
            onChange={(e) => setFormData({...formData, originatingAttorney: e.target.value})}
          >
            <option value="">Select originating attorney...</option>
            {attorneys.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} {a.role ? `(${a.role})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {formData.billingType === 'hourly' && (
        <div className={styles.formGroup}>
          <label>Default Rate ($/hr)</label>
          <input
            type="number"
            value={formData.billingRate}
            onChange={(e) => setFormData({...formData, billingRate: Number(e.target.value)})}
          />
        </div>
      )}

      <div className={styles.formGroup}>
        <label>Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          placeholder="Brief description of the matter"
          rows={3}
        />
      </div>

      <div className={styles.formGroup}>
        <label>Notes</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({...formData, notes: e.target.value})}
          placeholder="Internal notes about this matter (not shown on invoices)"
          rows={4}
        />
      </div>

      <div className={styles.modalActions}>
        <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
          Cancel
        </button>
        <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Update Matter'}
        </button>
      </div>
    </form>
  )
}

// Notes Section Component - allows editing and saving notes
function NotesSection({ 
  notes, 
  onSave, 
  entityType 
}: { 
  notes: string
  onSave: (notes: string) => Promise<void>
  entityType: 'matter' | 'client'
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedNotes, setEditedNotes] = useState(notes)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Update local state when notes prop changes
  useEffect(() => {
    if (!isEditing) {
      setEditedNotes(notes)
    }
  }, [notes, isEditing])

  const handleSave = async () => {
    setIsSaving(true)
    setSaveSuccess(false)
    try {
      await onSave(editedNotes)
      setIsEditing(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      console.error('Failed to save notes:', error)
      alert('Failed to save notes. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setEditedNotes(notes)
    setIsEditing(false)
  }

  return (
    <div className={styles.notesTab}>
      <div className={styles.tabHeader}>
        <h2>Notes</h2>
        <div className={styles.tabActions}>
          {!isEditing ? (
            <button 
              className={styles.primaryBtn}
              onClick={() => setIsEditing(true)}
            >
              <Edit2 size={18} />
              Edit Notes
            </button>
          ) : (
            <>
              <button 
                className={styles.cancelBtn}
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button 
                className={styles.primaryBtn}
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save Notes'}
              </button>
            </>
          )}
        </div>
      </div>

      {saveSuccess && (
        <div className={styles.successMessage}>
          <CheckCircle2 size={18} />
          Notes saved successfully!
        </div>
      )}

      <div className={styles.notesCard}>
        {isEditing ? (
          <textarea
            className={styles.notesTextarea}
            value={editedNotes}
            onChange={(e) => setEditedNotes(e.target.value)}
            placeholder={`Add internal notes about this ${entityType}...`}
            autoFocus
          />
        ) : (
          <div className={styles.notesDisplay}>
            {notes ? (
              <p style={{ 
                whiteSpace: 'pre-wrap', 
                color: 'var(--apex-white)',
                lineHeight: '1.8',
                margin: 0,
                fontSize: '0.95rem'
              }}>
                {notes}
              </p>
            ) : (
              <div className={styles.emptyNotes}>
                <FileText size={48} />
                <p>No notes yet</p>
                <span>Click "Edit Notes" to add internal notes about this {entityType}.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
