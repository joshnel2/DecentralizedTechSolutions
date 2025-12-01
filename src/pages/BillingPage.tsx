import { useState, useMemo, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { useAuthStore } from '../stores/authStore'
import { useAIChat } from '../contexts/AIChatContext'
import { invoicesApi } from '../services/api'
import { 
  Plus, Search, DollarSign, FileText, TrendingUp, AlertCircle,
  CheckCircle2, Clock, Send, MoreVertical, Sparkles, Download,
  CreditCard, XCircle, Eye, Edit2, Trash2
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './BillingPage.module.css'

export function BillingPage() {
  const { invoices, clients, matters, timeEntries, expenses, fetchInvoices, fetchClients, fetchMatters, fetchTimeEntries, addInvoice, updateInvoice } = useDataStore()
  const { firm } = useAuthStore()
  const { openChat } = useAIChat()
  
  // Fetch data from API on mount
  useEffect(() => {
    fetchInvoices()
    fetchClients()
    fetchMatters()
    fetchTimeEntries()
  }, [fetchInvoices, fetchClients, fetchMatters, fetchTimeEntries])
  
  const [activeTab, setActiveTab] = useState('invoices')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showNewModal, setShowNewModal] = useState(false)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

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

  const handleStatusChange = async (invoiceId: string, newStatus: 'draft' | 'sent' | 'paid' | 'overdue' | 'void' | 'partial') => {
    try {
      await updateInvoice(invoiceId, { status: newStatus })
      setOpenDropdownId(null)
      fetchInvoices()
    } catch (error) {
      console.error('Failed to update invoice status:', error)
      alert('Failed to update invoice status')
    }
  }

  const handleRecordPayment = (invoice: any) => {
    setSelectedInvoice(invoice)
    setShowPaymentModal(true)
    setOpenDropdownId(null)
  }

  const handleDownloadInvoice = async (invoice: any) => {
    setOpenDropdownId(null)
    const client = clients.find(c => c.id === invoice.clientId)
    const matter = matters.find(m => m.id === invoice.matterId)
    
    // Get firm details
    const firmName = firm?.name || 'Law Firm'
    const firmAddress = firm?.address ? `${firm.address}${firm.city ? `, ${firm.city}` : ''}${firm.state ? `, ${firm.state}` : ''} ${firm.zipCode || ''}` : ''
    const firmPhone = firm?.phone || ''
    const firmEmail = firm?.email || ''
    
    // Get client details
    const clientName = client?.name || client?.displayName || 'Client'
    const clientAddress = client?.addressStreet 
      ? `${client.addressStreet}${client.addressCity ? `, ${client.addressCity}` : ''}${client.addressState ? `, ${client.addressState}` : ''} ${client.addressZip || ''}`.trim()
      : ''
    const clientEmail = client?.email || ''
    
    // Generate PDF content
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
          .invoice-number { font-size: 14px; color: #666; margin-bottom: 10px; }
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
          @media print {
            body { margin: 20px; }
          }
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
            <div class="invoice-number">${invoice.number}</div>
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
    
    // Open print dialog which allows saving as PDF
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(invoiceHtml)
      printWindow.document.close()
      printWindow.print()
    }
  }

  const stats = useMemo(() => {
    const totalBilled = invoices.reduce((sum, i) => sum + i.total, 0)
    const totalPaid = invoices.reduce((sum, i) => sum + i.amountPaid, 0)
    const outstanding = invoices
      .filter(i => i.status === 'sent' || i.status === 'overdue')
      .reduce((sum, i) => sum + (i.total - i.amountPaid), 0)
    const overdue = invoices
      .filter(i => i.status === 'overdue')
      .reduce((sum, i) => sum + (i.total - i.amountPaid), 0)
    const unbilledTime = timeEntries
      .filter(t => t.billable && !t.billed)
      .reduce((sum, t) => sum + t.amount, 0)
    const unbilledExpenses = expenses
      .filter(e => e.billable && !e.billed)
      .reduce((sum, e) => sum + e.amount, 0)
    
    return { totalBilled, totalPaid, outstanding, overdue, unbilledTime, unbilledExpenses }
  }, [invoices, timeEntries, expenses])

  const filteredInvoices = useMemo(() => {
    return invoices.filter(invoice => {
      const client = clients.find(c => c.id === invoice.clientId)
      const matchesSearch = 
        invoice.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client?.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter
      return matchesSearch && matchesStatus
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [invoices, clients, searchQuery, statusFilter])

  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || 'Unknown'
  const getMatterName = (matterId: string) => matters.find(m => m.id === matterId)?.name || 'Unknown'

  return (
    <div className={styles.billingPage}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Billing</h1>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.aiBtn} onClick={() => openChat()}>
            <Sparkles size={16} />
            AI Insights
          </button>
          <button className={styles.primaryBtn} onClick={() => setShowNewModal(true)}>
            <Plus size={18} />
            Create Invoice
          </button>
        </div>
      </div>

      {showNewModal && (
        <NewInvoiceModal
          onClose={() => setShowNewModal(false)}
          onSave={async (data) => {
            try {
              await addInvoice(data)
              setShowNewModal(false)
              fetchInvoices()
            } catch (error) {
              console.error('Failed to create invoice:', error)
              alert('Failed to create invoice. Please try again.')
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

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <span className={styles.statValue}>${stats.totalPaid.toLocaleString()}</span>
            <span className={styles.statLabel}>Collected</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' }}>
            <Send size={22} />
          </div>
          <div>
            <span className={styles.statValue}>${stats.outstanding.toLocaleString()}</span>
            <span className={styles.statLabel}>Outstanding</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }}>
            <AlertCircle size={22} />
          </div>
          <div>
            <span className={styles.statValue}>${stats.overdue.toLocaleString()}</span>
            <span className={styles.statLabel}>Overdue</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B' }}>
            <Clock size={22} />
          </div>
          <div>
            <span className={styles.statValue}>${(stats.unbilledTime + stats.unbilledExpenses).toLocaleString()}</span>
            <span className={styles.statLabel}>Unbilled Work</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {['invoices', 'unbilled'].map(tab => (
          <button
            key={tab}
            className={clsx(styles.tab, activeTab === tab && styles.active)}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'invoices' ? 'Invoices' : 'Unbilled Time & Expenses'}
          </button>
        ))}
      </div>

      {activeTab === 'invoices' && (
        <>
          <div className={styles.filters}>
            <div className={styles.searchBox}>
              <Search size={18} />
              <input
                type="text"
                placeholder="Search invoices..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="void">Void</option>
            </select>
          </div>

          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Client</th>
                  <th>Matter</th>
                  <th>Issue Date</th>
                  <th>Due Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map(invoice => (
                  <tr key={invoice.id}>
                    <td>
                      <div className={styles.invoiceNum}>
                        <FileText size={16} />
                        {invoice.number}
                      </div>
                    </td>
                    <td>
                      <Link to={`/app/clients/${invoice.clientId}`}>
                        {getClientName(invoice.clientId)}
                      </Link>
                    </td>
                    <td>
                      <Link to={`/app/matters/${invoice.matterId}`}>
                        {getMatterName(invoice.matterId)}
                      </Link>
                    </td>
                    <td>{format(parseISO(invoice.issueDate), 'MMM d, yyyy')}</td>
                    <td>{format(parseISO(invoice.dueDate), 'MMM d, yyyy')}</td>
                    <td className={styles.amountCell}>
                      <span className={styles.amount}>${invoice.total.toLocaleString()}</span>
                      {invoice.amountPaid > 0 && invoice.amountPaid < invoice.total && (
                        <span className={styles.paid}>
                          ${invoice.amountPaid.toLocaleString()} paid
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={clsx(styles.statusBadge, styles[invoice.status])}>
                        {invoice.status}
                      </span>
                    </td>
                    <td>
                      <div className={styles.menuWrapper} ref={openDropdownId === invoice.id ? dropdownRef : null}>
                        <button 
                          className={styles.menuBtn}
                          onClick={() => setOpenDropdownId(openDropdownId === invoice.id ? null : invoice.id)}
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openDropdownId === invoice.id && (
                          <div className={styles.dropdown}>
                            <button 
                              className={styles.dropdownItem}
                              onClick={() => handleDownloadInvoice(invoice)}
                            >
                              <Download size={14} />
                              Download PDF
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
                            {invoice.status !== 'void' && invoice.status !== 'paid' && (
                              <button 
                                className={clsx(styles.dropdownItem, styles.danger)}
                                onClick={() => handleStatusChange(invoice.id, 'void')}
                              >
                                <XCircle size={14} />
                                Void Invoice
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'unbilled' && (
        <div className={styles.unbilledSection}>
          <div className={styles.unbilledCard}>
            <div className={styles.unbilledHeader}>
              <h3>
                <Clock size={18} />
                Unbilled Time Entries
              </h3>
              <span className={styles.unbilledTotal}>${stats.unbilledTime.toLocaleString()}</span>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Matter</th>
                  <th>Description</th>
                  <th>Hours</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {timeEntries.filter(t => t.billable && !t.billed).slice(0, 10).map(entry => (
                  <tr key={entry.id}>
                    <td>{format(parseISO(entry.date), 'MMM d, yyyy')}</td>
                    <td>
                      <Link to={`/app/matters/${entry.matterId}`}>
                        {getMatterName(entry.matterId)}
                      </Link>
                    </td>
                    <td>{entry.description}</td>
                    <td>{entry.hours}h</td>
                    <td>${entry.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.unbilledCard}>
            <div className={styles.unbilledHeader}>
              <h3>
                <DollarSign size={18} />
                Unbilled Expenses
              </h3>
              <span className={styles.unbilledTotal}>${stats.unbilledExpenses.toLocaleString()}</span>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Matter</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.filter(e => e.billable && !e.billed).map(expense => (
                  <tr key={expense.id}>
                    <td>{format(parseISO(expense.date), 'MMM d, yyyy')}</td>
                    <td>
                      <Link to={`/app/matters/${expense.matterId}`}>
                        {getMatterName(expense.matterId)}
                      </Link>
                    </td>
                    <td>{expense.description}</td>
                    <td>{expense.category}</td>
                    <td>${expense.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function NewInvoiceModal({ onClose, onSave, clients, matters }: { 
  onClose: () => void
  onSave: (data: any) => Promise<void>
  clients: any[]
  matters: any[]
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    clientId: clients[0]?.id || '',
    matterId: '',
    issueDate: format(new Date(), 'yyyy-MM-dd'),
    dueDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    notes: '',
    lineItems: [
      { description: 'Professional Legal Services', quantity: 1, rate: 0, amount: 0 }
    ] as any[]
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
    // If amount is directly edited, update rate (assuming quantity is 1 or calculate)
    if (field === 'amount' && newLineItems[index].quantity > 0) {
      newLineItems[index].rate = value / newLineItems[index].quantity
    }
    
    setFormData({ ...formData, lineItems: newLineItems })
  }

  const totalAmount = formData.lineItems.reduce((sum, item) => sum + (item.amount || 0), 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    if (!formData.clientId) {
      alert('Please select a client')
      return
    }
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
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
        <div className={styles.modalHeader}>
          <h2>Create Invoice</h2>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Client</label>
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

          {/* Line Items Section */}
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
              
              {formData.lineItems.map((item, index) => (
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
              {isSubmitting ? 'Creating...' : `Create Invoice ($${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})})`}
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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    amount: invoice.total - invoice.amountPaid,
    paymentMethod: 'check',
    reference: '',
    paymentDate: format(new Date(), 'yyyy-MM-dd'),
    notes: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    if (formData.amount <= 0) {
      alert('Please enter a valid payment amount')
      return
    }
    setIsSubmitting(true)
    try {
      await onSave(invoice.id, formData)
      onClose()
    } catch (error) {
      console.error('Failed to record payment:', error)
      alert('Failed to record payment')
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
