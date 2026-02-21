import { useState, useMemo, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAuthStore } from '../stores/authStore'
import { invoicesApi } from '../services/api'
import { 
  Plus, Search, FileText, AlertCircle,
  CheckCircle2, Clock, Send, MoreVertical, Download,
  CreditCard, XCircle, Eye, ChevronRight,
  Trash2, Edit2, User, Users, Mail,
  Merge, Square, CheckSquare
} from 'lucide-react'
import { useEmailCompose } from '../contexts/EmailComposeContext'
import { format, parseISO, differenceInDays, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { clsx } from 'clsx'
import styles from './BillingPage.module.css'
import { ConfirmationModal } from '../components/ConfirmationModal'
import { useToast } from '../components/Toast'

const viewOptions = [
  { value: 'my', label: 'My Billing' },
  { value: 'all', label: 'All Billing' }
]

export function BillingPage() {
  const { invoices, clients, matters, timeEntries, expenses, fetchInvoices, fetchClients, fetchMatters, fetchTimeEntries, addInvoice, updateInvoice } = useDataStore()
  const { firm, user } = useAuthStore()
  const { emailInvoice } = useEmailCompose()
  const _navigate = useNavigate()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  
  // Only certain roles can see all firm billing (owner, admin, billing specialist)
  const canViewAllBilling = user?.role === 'owner' || user?.role === 'admin' || user?.role === 'billing'
  const [viewFilter, setViewFilter] = useState<'my' | 'all'>('my')
  
  // Fetch data from API on mount or when view filter changes
  // Only privileged roles (owner, admin, billing) can see all firm billing
  useEffect(() => {
    const effectiveView = canViewAllBilling ? viewFilter : 'my'
    fetchInvoices({ view: effectiveView })
    fetchClients({ view: effectiveView })
    fetchMatters({ view: effectiveView })
    fetchTimeEntries({})
  }, [viewFilter, canViewAllBilling])
  
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [showNewModal, setShowNewModal] = useState(false)
  const [prefilledClientId, setPrefilledClientId] = useState<string | null>(null)
  const [showEditModal, setShowEditModal] = useState<any>(null)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [showInvoicePreview, setShowInvoicePreview] = useState<any>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  // Confirmation modal state for voiding invoices
  const [confirmVoid, setConfirmVoid] = useState<{ isOpen: boolean; invoiceId: string; invoiceNumber: string }>({
    isOpen: false,
    invoiceId: '',
    invoiceNumber: ''
  })

  // Selected invoices for merge
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([])
  const [showMergeModal, setShowMergeModal] = useState(false)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdownId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  // Handle URL query parameters for opening new invoice modal
  useEffect(() => {
    const action = searchParams.get('action')
    const clientId = searchParams.get('clientId')
    
    if (action === 'new') {
      setShowNewModal(true)
      if (clientId) {
        setPrefilledClientId(clientId)
      }
      // Clear query params after processing
      setSearchParams({})
    }
  }, [searchParams, setSearchParams])

  const handleStatusChange = async (invoiceId: string, newStatus: 'draft' | 'sent' | 'paid' | 'overdue' | 'void' | 'partial') => {
    try {
      await updateInvoice(invoiceId, { status: newStatus })
      setOpenDropdownId(null)
      fetchInvoices()
    } catch (error) {
      console.error('Failed to update invoice status:', error)
      toast.error('Failed to update invoice status')
    }
  }

  const handleRecordPayment = (invoice: any) => {
    setSelectedInvoice(invoice)
    setShowPaymentModal(true)
    setOpenDropdownId(null)
  }

  const handleEditInvoice = (invoice: any) => {
    setShowEditModal(invoice)
    setOpenDropdownId(null)
  }

  const handleEmailInvoice = (invoice: any) => {
    const client = clients.find(c => c.id === invoice.clientId)
    emailInvoice({
      id: invoice.id,
      invoiceNumber: invoice.number,
      clientName: client?.displayName || client?.name || 'Client',
      total: invoice.total
    })
    setOpenDropdownId(null)
  }

  const handleDownloadInvoice = async (invoice: any) => {
    setOpenDropdownId(null)
    // Open server-rendered printable invoice (includes time entries, expenses, payments)
    const token = localStorage.getItem('token') || localStorage.getItem('accessToken')
    const printUrl = `/api/invoices/${invoice.id}/print`
    const printWindow = window.open(printUrl, '_blank')
    if (!printWindow) {
      toast.error('Please allow popups to print invoices')
    }
    return // Skip legacy client-side generation below
    
    const client = clients.find(c => c.id === invoice.clientId)
    const matter = matters.find(m => m.id === invoice.matterId)
    
    const firmName = firm?.name || 'Law Firm'
    const firmAddress = firm?.address ? `${firm.address}${firm.city ? `, ${firm.city}` : ''}${firm.state ? `, ${firm.state}` : ''} ${firm.zipCode || ''}` : ''
    const firmPhone = firm?.phone || ''
    const firmEmail = firm?.email || ''
    
    const clientName = client?.name || client?.displayName || 'Client'
    const clientAddress = client?.addressStreet 
      ? `${client.addressStreet}${client.addressCity ? `, ${client.addressCity}` : ''}${client.addressState ? `, ${client.addressState}` : ''} ${client.addressZip || ''}`.trim()
      : ''
    const clientEmail = client?.email || ''
    
    const invoiceHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Georgia', serif; margin: 40px; color: #333; }
          .header { display: flex; justify-content: space-between; margin-bottom: 40px; border-bottom: 3px solid #1a1a2e; padding-bottom: 20px; }
          .company { font-size: 28px; font-weight: bold; color: #1a1a2e; margin-bottom: 8px; }
          .company-details { font-size: 12px; color: #666; line-height: 1.6; }
          .invoice-title { font-size: 36px; color: #F59E0B; margin-bottom: 10px; font-weight: bold; }
          .invoice-number { font-size: 16px; color: #1a1a2e; margin-bottom: 10px; font-weight: 600; }
          .info-section { display: flex; justify-content: space-between; margin-bottom: 40px; }
          .info-block { flex: 1; }
          .info-label { font-size: 11px; color: #888; text-transform: uppercase; margin-bottom: 5px; letter-spacing: 1px; }
          .info-value { font-size: 14px; margin-bottom: 15px; line-height: 1.5; }
          .client-name { font-size: 16px; font-weight: bold; color: #1a1a2e; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: #1a1a2e; color: white; text-align: left; padding: 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
          th.amount { text-align: right; }
          td { padding: 14px; border-bottom: 1px solid #eee; }
          td.amount { text-align: right; }
          .totals { margin-left: auto; width: 280px; background: #f9f9f9; padding: 20px; border-radius: 8px; }
          .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
          .total-row.final { font-size: 20px; font-weight: bold; border-top: 2px solid #1a1a2e; padding-top: 15px; margin-top: 10px; color: #1a1a2e; }
          .status { display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
          .status.paid { background: #d4edda; color: #155724; }
          .status.sent { background: #cce5ff; color: #004085; }
          .status.draft { background: #e2e3e5; color: #383d41; }
          .status.overdue { background: #f8d7da; color: #721c24; }
          .status.partial { background: #fff3cd; color: #856404; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee; font-size: 12px; color: #666; }
          .footer p { margin: 8px 0; }
          @media print { body { margin: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="company">${firmName}</div>
            <div class="company-details">
              ${firmAddress ? `${firmAddress}<br>` : ''}
              ${firmPhone ? `Tel: ${firmPhone}<br>` : ''}
              ${firmEmail ? `Email: ${firmEmail}` : ''}
            </div>
          </div>
          <div style="text-align: right;">
            <div class="invoice-title">INVOICE</div>
            <div class="invoice-number">Invoice #${invoice.number}</div>
            <span class="status ${invoice.status}">${invoice.status.toUpperCase()}</span>
          </div>
        </div>
        
        <div class="info-section">
          <div class="info-block">
            <div class="info-label">Bill To</div>
            <div class="info-value">
              <span class="client-name">${clientName}</span><br>
              ${clientAddress ? `${clientAddress}<br>` : ''}
              ${clientEmail ? clientEmail : ''}
            </div>
          </div>
          <div class="info-block">
            <div class="info-label">Matter</div>
            <div class="info-value">
              <strong>${matter?.name || 'General Legal Services'}</strong><br>
              ${matter?.number ? `Matter #: ${matter.number}` : ''}
            </div>
          </div>
          <div class="info-block" style="text-align: right;">
            <div class="info-label">Issue Date</div>
            <div class="info-value">${format(parseISO(invoice.issueDate), 'MMMM d, yyyy')}</div>
            <div class="info-label">Due Date</div>
            <div class="info-value">${format(parseISO(invoice.dueDate), 'MMMM d, yyyy')}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Quantity</th>
              <th>Rate</th>
              <th class="amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.lineItems?.length > 0 
              ? invoice.lineItems.map((item: any) => `
                <tr>
                  <td>${item.description || 'Legal Services'}</td>
                  <td>${item.quantity || 1}</td>
                  <td>$${(item.rate || 0).toFixed(2)}</td>
                  <td class="amount">$${(item.amount || item.quantity * item.rate || 0).toFixed(2)}</td>
                </tr>
              `).join('')
              : `
                <tr>
                  <td>Professional Legal Services for ${matter?.name || 'Legal Matter'}</td>
                  <td>1</td>
                  <td>$${invoice.total.toFixed(2)}</td>
                  <td class="amount">$${invoice.total.toFixed(2)}</td>
                </tr>
              `
            }
          </tbody>
        </table>

        <div class="totals">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>$${(invoice.subtotal || invoice.total).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
          </div>
          ${invoice.taxAmount ? `
          <div class="total-row">
            <span>Tax:</span>
            <span>$${invoice.taxAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
          </div>
          ` : ''}
          ${invoice.amountPaid > 0 ? `
          <div class="total-row">
            <span>Payments Received:</span>
            <span style="color: #10B981;">-$${invoice.amountPaid.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
          </div>
          ` : ''}
          <div class="total-row final">
            <span>Amount Due:</span>
            <span>$${(invoice.total - invoice.amountPaid).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
          </div>
        </div>

        <div class="footer">
          <p><strong>Payment Terms:</strong> Net 30 days</p>
          <p><strong>Make checks payable to:</strong> ${firmName}</p>
          <p>Thank you for your business. Please include the invoice number (${invoice.number}) with your payment.</p>
        </div>
      </body>
      </html>
    `
    
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(invoiceHtml)
      printWindow.document.close()
      printWindow.print()
    }
  }

  // Calculate comprehensive stats
  const stats = useMemo(() => {
    const now = new Date()
    const thisMonth = invoices.filter(i => {
      const date = parseISO(i.issueDate)
      return date >= startOfMonth(now) && date <= endOfMonth(now)
    })
    const lastMonth = invoices.filter(i => {
      const date = parseISO(i.issueDate)
      const lastMonthStart = startOfMonth(subMonths(now, 1))
      const lastMonthEnd = endOfMonth(subMonths(now, 1))
      return date >= lastMonthStart && date <= lastMonthEnd
    })

    // Calculate from invoices
    const invoiceTotalBilled = invoices.reduce((sum, i) => sum + i.total, 0)
    const totalPaid = invoices.reduce((sum, i) => sum + i.amountPaid, 0)
    const invoiceThisMonthBilled = thisMonth.reduce((sum, i) => sum + i.total, 0)
    const thisMonthCollected = thisMonth.reduce((sum, i) => sum + i.amountPaid, 0)
    const invoiceLastMonthBilled = lastMonth.reduce((sum, i) => sum + i.total, 0)
    
    // Also calculate from billed time entries (for migrated data that may not have invoice links)
    const billedTimeEntries = timeEntries.filter(t => t.billed)
    const timeEntryTotalBilled = billedTimeEntries.reduce((sum, t) => sum + (t.amount || t.hours * t.rate), 0)
    const timeEntryThisMonth = billedTimeEntries.filter(t => {
      const date = parseISO(t.date)
      return date >= startOfMonth(now) && date <= endOfMonth(now)
    })
    const timeEntryLastMonth = billedTimeEntries.filter(t => {
      const date = parseISO(t.date)
      const lastMonthStart = startOfMonth(subMonths(now, 1))
      const lastMonthEnd = endOfMonth(subMonths(now, 1))
      return date >= lastMonthStart && date <= lastMonthEnd
    })
    const timeEntryThisMonthBilled = timeEntryThisMonth.reduce((sum, t) => sum + (t.amount || t.hours * t.rate), 0)
    const timeEntryLastMonthBilled = timeEntryLastMonth.reduce((sum, t) => sum + (t.amount || t.hours * t.rate), 0)
    
    // Use invoice data if available, otherwise fall back to time entry data
    const totalBilled = invoiceTotalBilled > 0 ? invoiceTotalBilled : timeEntryTotalBilled
    const thisMonthBilled = invoiceThisMonthBilled > 0 ? invoiceThisMonthBilled : timeEntryThisMonthBilled
    const lastMonthBilled = invoiceLastMonthBilled > 0 ? invoiceLastMonthBilled : timeEntryLastMonthBilled
    
    const outstanding = invoices
      .filter(i => i.status === 'sent' || i.status === 'overdue' || i.status === 'partial')
      .reduce((sum, i) => sum + (i.total - i.amountPaid), 0)
    
    // Aging buckets
    const aging = {
      current: 0,
      thirtyDays: 0,
      sixtyDays: 0,
      ninetyDays: 0,
      ninetyPlus: 0
    }
    
    invoices.filter(i => i.status === 'sent' || i.status === 'overdue' || i.status === 'partial').forEach(inv => {
      const daysPastDue = differenceInDays(now, parseISO(inv.dueDate))
      const outstanding = inv.total - inv.amountPaid
      
      if (daysPastDue <= 0) {
        aging.current += outstanding
      } else if (daysPastDue <= 30) {
        aging.thirtyDays += outstanding
      } else if (daysPastDue <= 60) {
        aging.sixtyDays += outstanding
      } else if (daysPastDue <= 90) {
        aging.ninetyDays += outstanding
      } else {
        aging.ninetyPlus += outstanding
      }
    })

    const unbilledTime = timeEntries
      .filter(t => t.billable && !t.billed)
      .reduce((sum, t) => sum + t.amount, 0)
    const unbilledExpenses = expenses
      .filter(e => e.billable && !e.billed)
      .reduce((sum, e) => sum + e.amount, 0)

    // Calculate trend
    const trend = lastMonthBilled > 0 
      ? ((thisMonthBilled - lastMonthBilled) / lastMonthBilled) * 100 
      : 0
    
    return { 
      totalBilled, totalPaid, outstanding, 
      thisMonthBilled, thisMonthCollected, lastMonthBilled,
      aging, unbilledTime, unbilledExpenses, trend
    }
  }, [invoices, timeEntries, expenses])

  const filteredInvoices = useMemo(() => {
    return invoices.filter(invoice => {
      const client = clients.find(c => c.id === invoice.clientId)
      const matter = matters.find(m => m.id === invoice.matterId)
      const matchesSearch = 
        invoice.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        matter?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter
      
      // Date filter
      let matchesDate = true
      if (dateFilter !== 'all') {
        const issueDate = parseISO(invoice.issueDate)
        const now = new Date()
        if (dateFilter === 'thisMonth') {
          matchesDate = issueDate >= startOfMonth(now) && issueDate <= endOfMonth(now)
        } else if (dateFilter === 'lastMonth') {
          matchesDate = issueDate >= startOfMonth(subMonths(now, 1)) && issueDate <= endOfMonth(subMonths(now, 1))
        }
      }
      
      return matchesSearch && matchesStatus && matchesDate
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [invoices, clients, matters, searchQuery, statusFilter, dateFilter])

  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || 'Unknown'
  const getMatterName = (matterId: string) => matters.find(m => m.id === matterId)?.name || 'Unknown'

  // Selected invoices for merging
  const selectedInvoices = invoices.filter(i => selectedInvoiceIds.includes(i.id))
  
  // Check if selected invoices can be merged (same matter, not paid/void)
  const canMergeSelected = useMemo(() => {
    if (selectedInvoices.length < 2) return false
    
    // All must have the same matter
    const matterIds = [...new Set(selectedInvoices.map(i => i.matterId))]
    if (matterIds.length !== 1 || !matterIds[0]) return false
    
    // None can be paid or void
    return selectedInvoices.every(i => i.status !== 'paid' && i.status !== 'void')
  }, [selectedInvoices])

  const toggleInvoiceSelection = (invoiceId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedInvoiceIds(prev => 
      prev.includes(invoiceId) 
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    )
  }

  const clearSelection = () => {
    setSelectedInvoiceIds([])
  }

  return (
    <div className={styles.billingPage}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>{canViewAllBilling && viewFilter === 'all' ? 'All Billing' : 'My Billing'}</h1>
          <p className={styles.headerSubtitle}>{canViewAllBilling && viewFilter === 'all' ? 'Manage all firm invoices, payments, and billing' : 'Your invoices, payments, and billing'}</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryBtn} onClick={() => setShowNewModal(true)}>
            <Plus size={18} />
            New Invoice
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className={styles.metricsRow}>
        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <div className={styles.metricIcon} style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
              <CheckCircle2 size={20} style={{ color: '#10B981' }} />
            </div>
          </div>
          <div className={styles.metricValue}>${stats.totalPaid.toLocaleString()}</div>
          <div className={styles.metricLabel}>Total Collected</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <div className={styles.metricIcon} style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
              <Send size={20} style={{ color: '#3B82F6' }} />
            </div>
          </div>
          <div className={styles.metricValue}>${stats.thisMonthBilled.toLocaleString()}</div>
          <div className={styles.metricLabel}>Billed This Month</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <div className={styles.metricIcon} style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
              <Clock size={20} style={{ color: '#F59E0B' }} />
            </div>
          </div>
          <div className={styles.metricValue}>${stats.outstanding.toLocaleString()}</div>
          <div className={styles.metricLabel}>Outstanding</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <div className={styles.metricIcon} style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
              <AlertCircle size={20} style={{ color: '#EF4444' }} />
            </div>
          </div>
          <div className={styles.metricValue}>${(stats.aging.thirtyDays + stats.aging.sixtyDays + stats.aging.ninetyDays + stats.aging.ninetyPlus).toLocaleString()}</div>
          <div className={styles.metricLabel}>Overdue</div>
        </div>
      </div>

      {/* Selection Bar - Shows when invoices are selected */}
      {selectedInvoiceIds.length > 0 && (
        <div className={styles.selectionBar}>
          <div className={styles.selectionInfo}>
            <CheckSquare size={20} />
            <span><strong>{selectedInvoiceIds.length}</strong> invoice{selectedInvoiceIds.length > 1 ? 's' : ''} selected</span>
            {canMergeSelected && (
              <span className={styles.mergeHint}>
                (Same matter - can merge)
              </span>
            )}
          </div>
          <div className={styles.selectionActions}>
            <button className={styles.clearSelectionBtn} onClick={clearSelection}>
              Clear
            </button>
            {canMergeSelected && (
              <button 
                className={styles.mergeBtn}
                onClick={() => setShowMergeModal(true)}
              >
                <Merge size={18} />
                Merge Invoices
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabs}>
        {[
          { id: 'all', label: 'All Invoices', count: invoices.length },
          { id: 'draft', label: 'Draft', count: invoices.filter(i => i.status === 'draft').length },
          { id: 'sent', label: 'Sent', count: invoices.filter(i => i.status === 'sent').length },
          { id: 'overdue', label: 'Overdue', count: invoices.filter(i => i.status === 'overdue').length },
          { id: 'paid', label: 'Paid', count: invoices.filter(i => i.status === 'paid').length },
        ].map(tab => (
          <button
            key={tab.id}
            className={clsx(styles.tab, statusFilter === tab.id && styles.active)}
            onClick={() => setStatusFilter(tab.id === 'all' ? 'all' : tab.id)}
          >
            {tab.label}
            <span className={styles.tabCount}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        {/* View Toggle - Only for admins */}
        {canViewAllBilling && (
          <div className={styles.viewToggle}>
            {viewOptions.map(opt => (
              <button
                key={opt.value}
                className={clsx(styles.viewToggleBtn, viewFilter === opt.value && styles.active)}
                onClick={() => setViewFilter(opt.value as 'my' | 'all')}
              >
                {opt.value === 'my' ? <User size={14} /> : <Users size={14} />}
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <div className={styles.searchBox}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search by invoice #, client, or matter..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <select 
            value={dateFilter} 
            onChange={(e) => setDateFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="all">All Time</option>
            <option value="thisMonth">This Month</option>
            <option value="lastMonth">Last Month</option>
          </select>
        </div>
      </div>

      {/* Invoice List */}
      <div className={styles.invoiceList}>
        {filteredInvoices.length === 0 ? (
          <div className={styles.emptyState}>
            <FileText size={48} />
            <h3>No invoices found</h3>
            <p>Create your first invoice to get started</p>
            <button className={styles.primaryBtn} onClick={() => setShowNewModal(true)}>
              <Plus size={18} />
              Create Invoice
            </button>
          </div>
        ) : (
          filteredInvoices.map(invoice => {
            const client = clients.find(c => c.id === invoice.clientId)
            const matter = matters.find(m => m.id === invoice.matterId)
            const daysUntilDue = differenceInDays(parseISO(invoice.dueDate), new Date())
            const isPastDue = daysUntilDue < 0 && invoice.status !== 'paid'
            
            return (
              <div 
                key={invoice.id} 
                className={clsx(
                  styles.invoiceCard, 
                  isPastDue && styles.pastDue,
                  selectedInvoiceIds.includes(invoice.id) && styles.selectedCard
                )}
                onClick={() => setShowInvoicePreview(invoice)}
                style={{ cursor: 'pointer', zIndex: openDropdownId === invoice.id ? 100 : 1, position: 'relative' }}
              >
                <div className={styles.invoiceMain}>
                  {/* Checkbox for selection */}
                  <div 
                    className={styles.invoiceCheckbox}
                    onClick={(e) => toggleInvoiceSelection(invoice.id, e)}
                  >
                    {selectedInvoiceIds.includes(invoice.id) ? (
                      <CheckSquare size={20} className={styles.checkedIcon} />
                    ) : (
                      <Square size={20} className={styles.uncheckedIcon} />
                    )}
                  </div>

                  <div className={styles.invoiceInfo}>
                    <div className={styles.invoiceNumber}>
                      <FileText size={16} />
                      {invoice.number}
                    </div>
                    <div className={styles.invoiceClient} onClick={(e) => e.stopPropagation()}>
                      <Link to={`/app/clients/${invoice.clientId}`}>
                        {client?.name || 'Unknown Client'}
                      </Link>
                      {matter && (
                        <span className={styles.invoiceMatter}>
                          <ChevronRight size={12} />
                          <Link to={`/app/matters/${invoice.matterId}`}>
                            {matter.name}
                          </Link>
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className={styles.invoiceDates}>
                    <div className={styles.invoiceDate}>
                      <span>Issued:</span>
                      {format(parseISO(invoice.issueDate), 'MMM d, yyyy')}
                    </div>
                    <div className={clsx(styles.invoiceDate, isPastDue && styles.overdue)}>
                      <span>Due:</span>
                      {format(parseISO(invoice.dueDate), 'MMM d, yyyy')}
                      {isPastDue && (
                        <span className={styles.daysOverdue}>
                          {Math.abs(daysUntilDue)} days overdue
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={styles.invoiceAmount}>
                    <div className={styles.totalAmount}>${invoice.total.toLocaleString()}</div>
                    {invoice.amountPaid > 0 && invoice.amountPaid < invoice.total && (
                      <div className={styles.paidAmount}>
                        ${invoice.amountPaid.toLocaleString()} paid
                      </div>
                    )}
                    {invoice.status !== 'paid' && invoice.amountPaid < invoice.total && (
                      <div className={styles.dueAmount}>
                        ${(invoice.total - invoice.amountPaid).toLocaleString()} due
                      </div>
                    )}
                  </div>

                  <div className={styles.invoiceStatus}>
                    <span className={clsx(styles.statusBadge, styles[invoice.status])}>
                      {invoice.status}
                    </span>
                  </div>

                  <div className={styles.invoiceActions} onClick={(e) => e.stopPropagation()}>
                    <button 
                      className={styles.actionBtn}
                      onClick={(e) => { e.stopPropagation(); setShowInvoicePreview(invoice); }}
                      title="Preview"
                    >
                      <Eye size={16} />
                    </button>
                    <button 
                      className={styles.actionBtn}
                      onClick={(e) => { e.stopPropagation(); handleEditInvoice(invoice); }}
                      title="Edit"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      className={styles.actionBtn}
                      onClick={(e) => { e.stopPropagation(); handleDownloadInvoice(invoice); }}
                      title="Download PDF"
                    >
                      <Download size={16} />
                    </button>
                    <button 
                      className={styles.actionBtn}
                      onClick={(e) => { e.stopPropagation(); handleEmailInvoice(invoice); }}
                      title="Email Invoice"
                    >
                      <Mail size={16} />
                    </button>
                    <div className={styles.menuWrapper} ref={openDropdownId === invoice.id ? dropdownRef : null}>
                      <button 
                        className={styles.actionBtn}
                        onClick={(e) => { e.stopPropagation(); setOpenDropdownId(openDropdownId === invoice.id ? null : invoice.id); }}
                      >
                        <MoreVertical size={16} />
                      </button>
                      {openDropdownId === invoice.id && (
                        <div className={styles.dropdown}>
                          <button 
                            className={styles.dropdownItem}
                            onClick={() => handleEditInvoice(invoice)}
                          >
                            <Edit2 size={14} />
                            Edit Invoice
                          </button>
                          <button 
                            className={styles.dropdownItem}
                            onClick={() => setShowInvoicePreview(invoice)}
                          >
                            <Eye size={14} />
                            Preview
                          </button>
                          <button 
                            className={styles.dropdownItem}
                            onClick={() => handleEmailInvoice(invoice)}
                          >
                            <Mail size={14} />
                            Email Invoice
                          </button>
                          {invoice.status === 'draft' && (
                            <button 
                              className={styles.dropdownItem}
                              onClick={() => handleStatusChange(invoice.id, 'sent')}
                            >
                              <Send size={14} />
                              Mark as Sent
                            </button>
                          )}
                          {(invoice.status === 'sent' || invoice.status === 'overdue' || invoice.status === 'partial') && (
                            <>
                              <button 
                                className={styles.dropdownItem}
                                onClick={() => handleRecordPayment(invoice)}
                              >
                                <CreditCard size={14} />
                                Record Payment
                              </button>
                              <button 
                                className={clsx(styles.dropdownItem, styles.success)}
                                onClick={() => handleStatusChange(invoice.id, 'paid')}
                              >
                                <CheckCircle2 size={14} />
                                Mark as Paid
                              </button>
                            </>
                          )}
                          <div className={styles.dropdownDivider} />
                          {invoice.status !== 'void' && invoice.status !== 'paid' && (
                            <button 
                              className={clsx(styles.dropdownItem, styles.danger)}
                              onClick={() => {
                                setConfirmVoid({ isOpen: true, invoiceId: invoice.id, invoiceNumber: invoice.number })
                                setOpenDropdownId(null)
                              }}
                            >
                              <XCircle size={14} />
                              Void Invoice
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Invoice Preview Modal */}
      {showInvoicePreview && (
        <InvoicePreviewModal
          invoice={showInvoicePreview}
          client={clients.find(c => c.id === showInvoicePreview.clientId)}
          matter={matters.find(m => m.id === showInvoicePreview.matterId)}
          firm={firm}
          onClose={() => setShowInvoicePreview(null)}
          onDownload={() => handleDownloadInvoice(showInvoicePreview)}
          onEdit={() => {
            setShowEditModal(showInvoicePreview)
            setShowInvoicePreview(null)
          }}
          onRecordPayment={() => {
            setSelectedInvoice(showInvoicePreview)
            setShowPaymentModal(true)
            setShowInvoicePreview(null)
          }}
          onEmail={() => {
            handleEmailInvoice(showInvoicePreview)
            setShowInvoicePreview(null)
          }}
          onDelete={async () => {
            if (confirm(`Are you sure you want to delete invoice ${showInvoicePreview.number}? This action cannot be undone.`)) {
              try {
                await invoicesApi.delete(showInvoicePreview.id)
                setShowInvoicePreview(null)
                fetchInvoices()
              } catch (error) {
                console.error('Failed to delete invoice:', error)
                toast.error('Failed to delete invoice')
              }
            }
          }}
        />
      )}

      {showNewModal && (
        <InvoiceModal
          onClose={() => {
            setShowNewModal(false)
            setPrefilledClientId(null)
          }}
          onSave={async (data) => {
            try {
              await addInvoice({
                ...data,
                status: 'draft',
                amountPaid: 0,
                subtotal: data.total
              })
              setShowNewModal(false)
              setPrefilledClientId(null)
              fetchInvoices()
            } catch (error) {
              console.error('Failed to create invoice:', error)
              toast.error('Failed to create invoice', 'Please try again.')
            }
          }}
          clients={clients}
          matters={matters}
          prefilledClientId={prefilledClientId}
        />
      )}

      {showEditModal && (
        <InvoiceModal
          invoice={showEditModal}
          onClose={() => setShowEditModal(null)}
          onSave={async (data) => {
            try {
              await updateInvoice(showEditModal.id, data)
              setShowEditModal(null)
              fetchInvoices()
            } catch (error) {
              console.error('Failed to update invoice:', error)
              toast.error('Failed to update invoice', 'Please try again.')
            }
          }}
          clients={clients}
          matters={matters}
        />
      )}

      {showPaymentModal && selectedInvoice && (
        <PaymentModal
          invoice={selectedInvoice}
          onClose={() => {
            setShowPaymentModal(false)
            setSelectedInvoice(null)
          }}
          onSave={async (invoiceId, data) => {
            try {
              await invoicesApi.recordPayment(invoiceId, data)
              setShowPaymentModal(false)
              setSelectedInvoice(null)
              fetchInvoices()
            } catch (error) {
              console.error('Failed to record payment:', error)
              throw error
            }
          }}
        />
      )}

      {/* Void Invoice Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmVoid.isOpen}
        onClose={() => setConfirmVoid({ isOpen: false, invoiceId: '', invoiceNumber: '' })}
        onConfirm={async () => {
          await handleStatusChange(confirmVoid.invoiceId, 'void')
          setConfirmVoid({ isOpen: false, invoiceId: '', invoiceNumber: '' })
        }}
        title="Void Invoice"
        message={`Are you sure you want to void invoice ${confirmVoid.invoiceNumber}? This action will mark the invoice as voided and cannot be undone.`}
        confirmText="Void Invoice"
        type="danger"
      />

      {/* Merge Invoices Modal */}
      {showMergeModal && selectedInvoices.length >= 2 && (
        <MergeInvoicesModal
          invoices={selectedInvoices}
          matter={matters.find(m => m.id === selectedInvoices[0]?.matterId)}
          client={clients.find(c => c.id === selectedInvoices[0]?.clientId)}
          onClose={() => setShowMergeModal(false)}
          onMerge={async (keepInvoiceId) => {
            try {
              // Call backend to merge invoices
              await invoicesApi.merge(keepInvoiceId, selectedInvoiceIds.filter(id => id !== keepInvoiceId))
              setShowMergeModal(false)
              setSelectedInvoiceIds([])
              fetchInvoices()
            } catch (error) {
              console.error('Failed to merge invoices:', error)
              toast.error('Failed to merge invoices', 'Please try again.')
            }
          }}
        />
      )}
    </div>
  )
}

// Invoice Preview Modal
function InvoicePreviewModal({ invoice, client, matter, firm, onClose, onDownload, onEdit, onRecordPayment, onEmail, onDelete }: {
  invoice: any
  client: any
  matter: any
  firm: any
  onClose: () => void
  onDownload: () => void
  onEdit: () => void
  onRecordPayment: () => void
  onEmail: () => void
  onDelete: () => void
}) {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.previewModal} onClick={e => e.stopPropagation()}>
        <div className={styles.previewHeader}>
          <div className={styles.previewTitle}>
            <h2>Invoice {invoice.number}</h2>
            <span className={clsx(styles.statusBadge, styles[invoice.status])}>
              {invoice.status}
            </span>
          </div>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>
        
        <div className={styles.previewContent}>
          <div className={styles.previewSection}>
            <div className={styles.previewRow}>
              <div className={styles.previewColumn}>
                <label>From</label>
                <strong>{firm?.name || 'Your Law Firm'}</strong>
                {firm?.address && <p>{firm.address}</p>}
              </div>
              <div className={styles.previewColumn}>
                <label>Bill To</label>
                <strong>{client?.name || 'Client'}</strong>
                {client?.email && <p>{client.email}</p>}
              </div>
            </div>
            
            <div className={styles.previewRow}>
              <div className={styles.previewColumn}>
                <label>Matter</label>
                <strong>{matter?.name || 'General Services'}</strong>
              </div>
              <div className={styles.previewColumn}>
                <label>Issue Date</label>
                <strong>{format(parseISO(invoice.issueDate), 'MMMM d, yyyy')}</strong>
              </div>
              <div className={styles.previewColumn}>
                <label>Due Date</label>
                <strong>{format(parseISO(invoice.dueDate), 'MMMM d, yyyy')}</strong>
              </div>
            </div>
          </div>

          <div className={styles.previewItems}>
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems?.length > 0 ? (
                  invoice.lineItems.map((item: any, i: number) => (
                    <tr key={i}>
                      <td>{item.description}</td>
                      <td>{item.quantity}</td>
                      <td>${item.rate?.toFixed(2)}</td>
                      <td>${item.amount?.toFixed(2)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td>Legal Services</td>
                    <td>1</td>
                    <td>${invoice.total.toFixed(2)}</td>
                    <td>${invoice.total.toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.previewTotals}>
            <div className={styles.previewTotalRow}>
              <span>Subtotal</span>
              <span>${(invoice.subtotal || invoice.total).toLocaleString()}</span>
            </div>
            {invoice.amountPaid > 0 && (
              <div className={styles.previewTotalRow}>
                <span>Payments</span>
                <span className={styles.paymentAmount}>-${invoice.amountPaid.toLocaleString()}</span>
              </div>
            )}
            <div className={clsx(styles.previewTotalRow, styles.final)}>
              <span>Amount Due</span>
              <span>${(invoice.total - invoice.amountPaid).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className={styles.previewActions}>
          <button 
            className={styles.cancelBtn} 
            onClick={onDelete}
            style={{ color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
          >
            <Trash2 size={16} />
            Delete
          </button>
          <button className={styles.secondaryBtn} onClick={onEdit}>
            <Edit2 size={16} />
            Edit Invoice
          </button>
          {invoice.status !== 'paid' && invoice.status !== 'void' && (
            <button className={styles.secondaryBtn} onClick={onRecordPayment}>
              <CreditCard size={16} />
              Record Payment
            </button>
          )}
          <button className={styles.secondaryBtn} onClick={onEmail}>
            <Mail size={16} />
            Email Invoice
          </button>
          <button className={styles.primaryBtn} onClick={onDownload}>
            <Download size={16} />
            Download PDF
          </button>
        </div>
      </div>
    </div>
  )
}

// Combined Invoice Modal for Create/Edit
function InvoiceModal({ invoice, onClose, onSave, clients, matters, prefilledClientId }: { 
  invoice?: any
  onClose: () => void
  onSave: (data: any) => Promise<void>
  clients: any[]
  matters: any[]
  prefilledClientId?: string | null
}) {
  const toast = useToast()
  const isEditing = !!invoice
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    clientId: invoice?.clientId || prefilledClientId || clients[0]?.id || '',
    matterId: invoice?.matterId || '',
    issueDate: invoice?.issueDate ? format(parseISO(invoice.issueDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
    dueDate: invoice?.dueDate ? format(parseISO(invoice.dueDate), 'yyyy-MM-dd') : format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    notes: invoice?.notes || '',
    lineItems: invoice?.lineItems?.length > 0 
      ? invoice.lineItems 
      : [{ description: 'Professional Legal Services', quantity: 1, rate: 0, amount: 0 }]
  })

  const addLineItem = () => {
    setFormData({
      ...formData,
      lineItems: [...formData.lineItems, { description: '', quantity: 1, rate: 0, amount: 0 }]
    })
  }

  const removeLineItem = (index: number) => {
    setFormData({
      ...formData,
      lineItems: formData.lineItems.filter((_: any, i: number) => i !== index)
    })
  }

  const updateLineItem = (index: number, field: string, value: any) => {
    const newLineItems = [...formData.lineItems]
    newLineItems[index] = { ...newLineItems[index], [field]: value }
    
    if (field === 'quantity' || field === 'rate') {
      newLineItems[index].amount = newLineItems[index].quantity * newLineItems[index].rate
    }
    if (field === 'amount' && newLineItems[index].quantity > 0) {
      newLineItems[index].rate = value / newLineItems[index].quantity
    }
    
    setFormData({ ...formData, lineItems: newLineItems })
  }

  const totalAmount = formData.lineItems.reduce((sum: number, item: any) => sum + (item.amount || 0), 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    if (!formData.clientId) {
      toast.warning('Please select a client')
      return
    }
    if (totalAmount <= 0) {
      toast.warning('Please add at least one line item with an amount')
      return
    }
    setIsSubmitting(true)
    try {
      await onSave({ 
        ...formData, 
        total: totalAmount,
        issueDate: new Date(formData.issueDate).toISOString(),
        dueDate: new Date(formData.dueDate).toISOString()
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
        <div className={styles.modalHeader}>
          <h2>{isEditing ? 'Edit Invoice' : 'New Invoice'}</h2>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Client *</label>
            <select
              value={formData.clientId}
              onChange={(e) => setFormData({...formData, clientId: e.target.value, matterId: ''})}
              required
            >
              <option value="">Select a client</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name || c.displayName}</option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Matter (optional)</label>
            <select
              value={formData.matterId}
              onChange={(e) => setFormData({...formData, matterId: e.target.value})}
            >
              <option value="">No specific matter</option>
              {matters.filter(m => !formData.clientId || m.clientId === formData.clientId).map(m => (
                <option key={m.id} value={m.id}>{m.name || m.title}</option>
              ))}
            </select>
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

          <div className={styles.lineItemsSection}>
            <div className={styles.lineItemsHeader}>
              <label>Line Items</label>
              <button type="button" onClick={addLineItem} className={styles.addLineItemBtn}>
                <Plus size={14} />
                Add Item
              </button>
            </div>
            
            <div className={styles.lineItemsTable}>
              <div className={styles.lineItemsTableHeader}>
                <span style={{ flex: 2 }}>Description</span>
                <span style={{ width: '80px', textAlign: 'center' }}>Qty</span>
                <span style={{ width: '100px', textAlign: 'right' }}>Rate</span>
                <span style={{ width: '120px', textAlign: 'right' }}>Amount</span>
                <span style={{ width: '40px' }}></span>
              </div>
              
              {formData.lineItems.map((item: any, index: number) => (
                <div key={index} className={styles.lineItemRow}>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                    placeholder="Description"
                    style={{ flex: 2 }}
                    required
                  />
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                    min="0"
                    step="0.5"
                    style={{ width: '80px', textAlign: 'center' }}
                  />
                  <div style={{ width: '100px', position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#666' }}>$</span>
                    <input
                      type="number"
                      value={item.rate}
                      onChange={(e) => updateLineItem(index, 'rate', parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                      style={{ width: '100%', textAlign: 'right', paddingLeft: '20px' }}
                    />
                  </div>
                  <div style={{ width: '120px', position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#666' }}>$</span>
                    <input
                      type="number"
                      value={item.amount}
                      onChange={(e) => updateLineItem(index, 'amount', parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                      style={{ width: '100%', textAlign: 'right', paddingLeft: '20px', fontWeight: 'bold' }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLineItem(index)}
                    className={styles.removeLineItemBtn}
                    disabled={formData.lineItems.length === 1}
                    style={{ width: '40px' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              
              <div className={styles.lineItemsTotal}>
                <span>Total:</span>
                <span className={styles.totalAmount}>${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
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
              {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : `Create Invoice ($${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PaymentModal({ invoice, onClose, onSave }: { 
  invoice: any
  onClose: () => void
  onSave: (invoiceId: string, data: any) => Promise<void>
}) {
  const toast = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    amount: invoice.total - invoice.amountPaid,
    paymentMethod: 'check',
    reference: '',
    paymentDate: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
    syncToQuickBooks: true
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    if (formData.amount <= 0) {
      toast.warning('Please enter a valid payment amount')
      return
    }
    setIsSubmitting(true)
    try {
      await onSave(invoice.id, formData)
      onClose()
    } catch (error) {
      console.error('Failed to record payment:', error)
      toast.error('Failed to record payment')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Record Payment</h2>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.paymentInfo}>
            <div className={styles.paymentInfoRow}>
              <span>Invoice:</span>
              <strong>{invoice.number}</strong>
            </div>
            <div className={styles.paymentInfoRow}>
              <span>Total:</span>
              <strong>${invoice.total.toLocaleString()}</strong>
            </div>
            <div className={styles.paymentInfoRow}>
              <span>Previously Paid:</span>
              <strong>${invoice.amountPaid.toLocaleString()}</strong>
            </div>
            <div className={clsx(styles.paymentInfoRow, styles.highlight)}>
              <span>Amount Due:</span>
              <strong>${(invoice.total - invoice.amountPaid).toLocaleString()}</strong>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Payment Amount</label>
            <input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value) || 0})}
              required
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Payment Method</label>
              <select
                value={formData.paymentMethod}
                onChange={(e) => setFormData({...formData, paymentMethod: e.target.value})}
              >
                <option value="check">Check</option>
                <option value="wire">Wire Transfer</option>
                <option value="ach">ACH</option>
                <option value="credit_card">Credit Card</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Payment Date</label>
              <input
                type="date"
                value={formData.paymentDate}
                onChange={(e) => setFormData({...formData, paymentDate: e.target.value})}
                required
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Reference / Check #</label>
            <input
              type="text"
              value={formData.reference}
              onChange={(e) => setFormData({...formData, reference: e.target.value})}
              placeholder="e.g., Check #1234"
            />
          </div>

          <div className={styles.formGroup}>
            <label>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              placeholder="Payment notes..."
              rows={2}
            />
          </div>

          <div className={styles.formGroup}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.syncToQuickBooks}
                onChange={(e) => setFormData({...formData, syncToQuickBooks: e.target.checked})}
                style={{ width: '16px', height: '16px', accentColor: 'var(--apex-gold)' }}
              />
              <span style={{ fontWeight: 400 }}>Sync payment to QuickBooks</span>
            </label>
            <p style={{ fontSize: '0.75rem', color: 'var(--apex-muted)', marginTop: '4px' }}>
              If connected, this payment will be automatically recorded in QuickBooks
            </p>
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
              {isSubmitting ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Merge Invoices Modal
function MergeInvoicesModal({ invoices, matter, client, onClose, onMerge }: {
  invoices: any[]
  matter: any
  client: any
  onClose: () => void
  onMerge: (keepInvoiceId: string) => Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [keepInvoiceId, setKeepInvoiceId] = useState(invoices[0]?.id || '')

  const totalAmount = invoices.reduce((sum, inv) => sum + inv.total, 0)
  const totalPaid = invoices.reduce((sum, inv) => sum + inv.amountPaid, 0)
  const totalLineItems = invoices.reduce((sum, inv) => sum + (inv.lineItems?.length || 0), 0)

  const handleMerge = async () => {
    if (!keepInvoiceId) return
    setIsSubmitting(true)
    try {
      await onMerge(keepInvoiceId)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.mergeModal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.mergeModalTitle}>
            <Merge size={20} />
            <h2>Merge Invoices</h2>
          </div>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>

        <div className={styles.mergeModalContent}>
          <div className={styles.mergeInfo}>
            <p>
              Combine <strong>{invoices.length} invoices</strong> for matter <strong>{matter?.name || 'Unknown'}</strong> into one invoice.
            </p>
          </div>

          <div className={styles.mergeSummary}>
            <div className={styles.mergeSummaryItem}>
              <span>Total Amount</span>
              <strong>${totalAmount.toLocaleString()}</strong>
            </div>
            <div className={styles.mergeSummaryItem}>
              <span>Already Paid</span>
              <strong>${totalPaid.toLocaleString()}</strong>
            </div>
            <div className={styles.mergeSummaryItem}>
              <span>Line Items</span>
              <strong>{totalLineItems}</strong>
            </div>
          </div>

          <div className={styles.mergeSelectSection}>
            <label>Keep invoice number:</label>
            <p className={styles.mergeSelectHint}>
              The selected invoice number will be kept. All line items from other invoices will be merged into this one.
            </p>
            <div className={styles.mergeInvoiceList}>
              {invoices.map(inv => (
                <label 
                  key={inv.id} 
                  className={clsx(styles.mergeInvoiceOption, keepInvoiceId === inv.id && styles.selected)}
                >
                  <input
                    type="radio"
                    name="keepInvoice"
                    value={inv.id}
                    checked={keepInvoiceId === inv.id}
                    onChange={(e) => setKeepInvoiceId(e.target.value)}
                  />
                  <div className={styles.mergeInvoiceDetails}>
                    <span className={styles.mergeInvoiceNumber}>{inv.number}</span>
                    <span className={styles.mergeInvoiceAmount}>${inv.total.toLocaleString()}</span>
                    <span className={styles.mergeInvoiceDate}>
                      {format(parseISO(inv.issueDate), 'MMM d, yyyy')}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.mergeWarning}>
            <AlertCircle size={16} />
            <span>Other invoices will be voided after merging. This action cannot be undone.</span>
          </div>
        </div>

        <div className={styles.mergeModalFooter}>
          <button onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
            Cancel
          </button>
          <button 
            onClick={handleMerge} 
            className={styles.mergeConfirmBtn}
            disabled={isSubmitting || !keepInvoiceId}
          >
            {isSubmitting ? 'Merging...' : `Merge ${invoices.length} Invoices`}
          </button>
        </div>
      </div>
    </div>
  )
}

