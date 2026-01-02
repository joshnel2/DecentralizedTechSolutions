import { useState, useEffect } from 'react'
import { Calculator, RefreshCw, Search, ArrowLeft, DollarSign, Users, TrendingUp, FileText, Upload, Download, CreditCard, Settings, Check, AlertCircle, ArrowUpRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { integrationsApi } from '../services/api'
import styles from './IntegrationDataPage.module.css'

interface Invoice {
  id: string
  number: string
  customerName: string
  customerId: string
  date: string
  dueDate: string
  total: number
  balance: number
  status: string
  lineItems?: Array<{
    description: string
    amount: number
    quantity?: number
    unitPrice?: number
  }>
}

interface Customer {
  id: string
  name: string
  email: string
  phone?: string
  balance: number
  companyName?: string
  active: boolean
  createdAt?: string
}

interface Payment {
  id: string
  date: string
  amount: number
  customerName: string
  customerId: string
  paymentMethod?: string
  memo?: string
}

interface SyncSettings {
  syncBilling?: boolean
  syncCustomers?: boolean
  autoSync?: boolean
  twoWaySync?: boolean
}

export function QuickBooksIntegrationPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'invoices' | 'customers' | 'payments' | 'settings'>('invoices')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [fullSyncing, setFullSyncing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [settings, setSettings] = useState<SyncSettings>({
    syncBilling: true,
    syncCustomers: true,
    autoSync: false,
    twoWaySync: true,
  })
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean
    accountName?: string
    lastSyncAt?: string
  } | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      
      // Load all data in parallel
      const [statusRes, invoicesRes, customersRes, paymentsRes] = await Promise.all([
        integrationsApi.getQuickBooksStatus().catch(() => ({ connected: false })),
        integrationsApi.getQuickBooksInvoices().catch(() => ({ invoices: [] })),
        integrationsApi.getQuickBooksCustomers().catch(() => ({ customers: [] })),
        integrationsApi.getQuickBooksPayments().catch(() => ({ payments: [] })),
      ])

      setConnectionStatus(statusRes)
      setInvoices(invoicesRes.invoices || [])
      setCustomers(customersRes.customers || [])
      setPayments(paymentsRes.payments || [])
      
      if (statusRes.settings) {
        setSettings(statusRes.settings)
      }
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to load QuickBooks data' })
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await integrationsApi.syncQuickBooks()
      await loadData() // Reload all data
      setNotification({ type: 'success', message: result.message || 'QuickBooks synced successfully' })
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Sync failed' })
    } finally {
      setSyncing(false)
    }
  }

  const handleFullSync = async () => {
    setFullSyncing(true)
    setNotification({ type: 'info', message: 'Starting two-way sync with QuickBooks...' })
    try {
      const result = await integrationsApi.fullSyncQuickBooks()
      await loadData() // Reload all data
      setNotification({ 
        type: 'success', 
        message: result.message || `Sync complete: ${result.customersImported} customers imported, ${result.invoicesImported} invoices imported`
      })
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Full sync failed' })
    } finally {
      setFullSyncing(false)
    }
  }

  const handleSaveSettings = async () => {
    try {
      await integrationsApi.updateQuickBooksSettings(settings)
      setNotification({ type: 'success', message: 'Settings saved' })
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to save settings' })
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString()
  }

  const filteredInvoices = invoices.filter(inv =>
    inv.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.number?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredCustomers = customers.filter(cust =>
    cust.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cust.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredPayments = payments.filter(p =>
    p.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Stats calculations
  const totalOutstanding = invoices.reduce((sum, inv) => sum + (inv.balance || 0), 0)
  const totalPaid = invoices.filter(inv => inv.balance === 0).length
  const totalOverdue = invoices.filter(inv => inv.status === 'overdue').length
  const activeCustomers = customers.filter(c => c.active).length
  const totalPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0)

  if (!connectionStatus?.connected && !loading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <button className={styles.backBtn} onClick={() => navigate(-1)}>
              <ArrowLeft size={20} />
            </button>
            <div className={styles.headerIcon}>
              <Calculator size={28} />
            </div>
            <div>
              <h1>QuickBooks</h1>
              <p>Connect to QuickBooks Online</p>
            </div>
          </div>
        </div>
        <div className={styles.empty} style={{ marginTop: '2rem' }}>
          <Calculator size={64} />
          <h3>QuickBooks Not Connected</h3>
          <p>Go to Settings → Integrations to connect your QuickBooks account</p>
          <button 
            className={styles.syncBtn}
            onClick={() => navigate('/app/settings/integrations')}
            style={{ marginTop: '1rem' }}
          >
            Go to Integrations
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.type === 'info' && <RefreshCw size={18} className={styles.spinning} />}
          {notification.message}
          <button onClick={() => setNotification(null)}>×</button>
        </div>
      )}

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </button>
          <div className={styles.headerIcon} style={{ background: 'linear-gradient(135deg, #2CA01C 0%, #1E7B14 100%)' }}>
            <Calculator size={28} />
          </div>
          <div>
            <h1>QuickBooks Online</h1>
            <p>
              {connectionStatus?.accountName || 'Connected'} 
              {connectionStatus?.lastSyncAt && (
                <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>
                  • Last synced {formatDate(connectionStatus.lastSyncAt)}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.syncBtn}
            onClick={handleFullSync}
            disabled={fullSyncing || syncing}
            style={{ marginRight: '0.5rem', background: 'linear-gradient(135deg, #2CA01C 0%, #1E7B14 100%)' }}
            title="Two-way sync: Import from QuickBooks and export local data"
          >
            <Download size={18} />
            <Upload size={18} style={{ marginLeft: '-8px' }} />
            {fullSyncing ? 'Syncing...' : 'Full Sync'}
          </button>
          <button 
            className={styles.syncBtn}
            onClick={handleSync}
            disabled={syncing || fullSyncing}
          >
            <RefreshCw size={18} className={syncing ? styles.spinning : ''} />
            {syncing ? 'Syncing...' : 'Import'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs} style={{ marginBottom: 'var(--spacing-lg)', display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
        {[
          { id: 'invoices', label: 'Invoices', icon: FileText, count: invoices.length },
          { id: 'customers', label: 'Customers', icon: Users, count: customers.length },
          { id: 'payments', label: 'Payments', icon: CreditCard, count: payments.length },
          { id: 'settings', label: 'Settings', icon: Settings },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1rem',
              background: activeTab === tab.id ? 'var(--gold-primary)' : 'transparent',
              color: activeTab === tab.id ? '#000' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: activeTab === tab.id ? 600 : 400,
              transition: 'all 0.2s',
            }}
          >
            <tab.icon size={18} />
            {tab.label}
            {tab.count !== undefined && (
              <span style={{
                background: activeTab === tab.id ? 'rgba(0,0,0,0.2)' : 'var(--bg-tertiary)',
                padding: '0.15rem 0.5rem',
                borderRadius: '12px',
                fontSize: '0.75rem',
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Stats Cards - different for each tab */}
      {activeTab === 'invoices' && (
        <div className={styles.dataGrid} style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div className={styles.dataCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Outstanding</span>
              <DollarSign size={20} style={{ color: 'var(--gold-primary)' }} />
            </div>
            <div className={styles.cardAmount}>{formatCurrency(totalOutstanding)}</div>
            <div className={styles.cardMeta}>{invoices.length} total invoices</div>
          </div>
          <div className={styles.dataCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Paid</span>
              <Check size={20} style={{ color: 'var(--success)' }} />
            </div>
            <div className={styles.cardAmount}>{totalPaid}</div>
            <div className={styles.cardMeta}>invoices fully paid</div>
          </div>
          <div className={styles.dataCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Overdue</span>
              <AlertCircle size={20} style={{ color: 'var(--error)' }} />
            </div>
            <div className={styles.cardAmount}>{totalOverdue}</div>
            <div className={styles.cardMeta}>need attention</div>
          </div>
        </div>
      )}

      {activeTab === 'customers' && (
        <div className={styles.dataGrid} style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div className={styles.dataCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Total Customers</span>
              <Users size={20} style={{ color: 'var(--gold-primary)' }} />
            </div>
            <div className={styles.cardAmount}>{customers.length}</div>
            <div className={styles.cardMeta}>in QuickBooks</div>
          </div>
          <div className={styles.dataCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Active</span>
              <Check size={20} style={{ color: 'var(--success)' }} />
            </div>
            <div className={styles.cardAmount}>{activeCustomers}</div>
            <div className={styles.cardMeta}>active customers</div>
          </div>
          <div className={styles.dataCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Total Balance</span>
              <DollarSign size={20} style={{ color: 'var(--warning)' }} />
            </div>
            <div className={styles.cardAmount}>{formatCurrency(customers.reduce((sum, c) => sum + (c.balance || 0), 0))}</div>
            <div className={styles.cardMeta}>across all customers</div>
          </div>
        </div>
      )}

      {activeTab === 'payments' && (
        <div className={styles.dataGrid} style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div className={styles.dataCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Total Received</span>
              <TrendingUp size={20} style={{ color: 'var(--success)' }} />
            </div>
            <div className={styles.cardAmount}>{formatCurrency(totalPayments)}</div>
            <div className={styles.cardMeta}>{payments.length} payments</div>
          </div>
        </div>
      )}

      {/* Search and content */}
      {activeTab !== 'settings' && (
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={18} />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className={styles.loading}>
          <RefreshCw size={24} className={styles.spinning} />
          <span>Loading QuickBooks data...</span>
        </div>
      ) : (
        <>
          {/* Invoices Tab */}
          {activeTab === 'invoices' && (
            <div className={styles.dataGrid}>
              {filteredInvoices.length === 0 ? (
                <div className={styles.empty}>
                  <FileText size={48} />
                  <h3>No invoices found</h3>
                  <p>Your QuickBooks invoices will appear here</p>
                </div>
              ) : (
                filteredInvoices.map(invoice => (
                  <div key={invoice.id} className={styles.dataCard}>
                    <div className={styles.cardHeader}>
                      <span className={styles.cardTitle}>#{invoice.number}</span>
                      <span className={`${styles.cardBadge} ${styles[invoice.status]}`}>
                        {invoice.status}
                      </span>
                    </div>
                    <div className={styles.cardAmount}>{formatCurrency(invoice.total)}</div>
                    <div className={styles.cardMeta}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Users size={14} />
                        {invoice.customerName}
                      </div>
                      <div>Due: {formatDate(invoice.dueDate)}</div>
                      {invoice.balance > 0 && (
                        <div style={{ color: 'var(--gold-primary)', fontWeight: 500 }}>
                          Balance: {formatCurrency(invoice.balance)}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Customers Tab */}
          {activeTab === 'customers' && (
            <div className={styles.dataGrid}>
              {filteredCustomers.length === 0 ? (
                <div className={styles.empty}>
                  <Users size={48} />
                  <h3>No customers found</h3>
                  <p>Your QuickBooks customers will appear here</p>
                </div>
              ) : (
                filteredCustomers.map(customer => (
                  <div key={customer.id} className={styles.dataCard}>
                    <div className={styles.cardHeader}>
                      <span className={styles.cardTitle}>{customer.name}</span>
                      <span className={`${styles.cardBadge} ${customer.active ? styles.paid : styles.overdue}`}>
                        {customer.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {customer.balance > 0 && (
                      <div className={styles.cardAmount}>{formatCurrency(customer.balance)}</div>
                    )}
                    <div className={styles.cardMeta}>
                      {customer.email && <div>{customer.email}</div>}
                      {customer.phone && <div>{customer.phone}</div>}
                      {customer.companyName && customer.companyName !== customer.name && (
                        <div style={{ opacity: 0.7 }}>{customer.companyName}</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Payments Tab */}
          {activeTab === 'payments' && (
            <div className={styles.dataGrid}>
              {filteredPayments.length === 0 ? (
                <div className={styles.empty}>
                  <CreditCard size={48} />
                  <h3>No payments found</h3>
                  <p>Your QuickBooks payments will appear here</p>
                </div>
              ) : (
                filteredPayments.map(payment => (
                  <div key={payment.id} className={styles.dataCard}>
                    <div className={styles.cardHeader}>
                      <span className={styles.cardTitle}>{formatDate(payment.date)}</span>
                      <span className={`${styles.cardBadge} ${styles.paid}`}>
                        {payment.paymentMethod || 'Payment'}
                      </span>
                    </div>
                    <div className={styles.cardAmount}>{formatCurrency(payment.amount)}</div>
                    <div className={styles.cardMeta}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Users size={14} />
                        {payment.customerName}
                      </div>
                      {payment.memo && <div style={{ opacity: 0.7 }}>{payment.memo}</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div style={{ maxWidth: '600px' }}>
              <div className={styles.dataCard} style={{ padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Settings size={20} />
                  Sync Settings
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.syncBilling}
                      onChange={(e) => setSettings(s => ({ ...s, syncBilling: e.target.checked }))}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <div>
                      <div style={{ fontWeight: 500 }}>Sync Invoices</div>
                      <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Import invoices from QuickBooks to Apex Billing</div>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.syncCustomers}
                      onChange={(e) => setSettings(s => ({ ...s, syncCustomers: e.target.checked }))}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <div>
                      <div style={{ fontWeight: 500 }}>Sync Customers</div>
                      <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Import QuickBooks customers as Apex clients</div>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.twoWaySync}
                      onChange={(e) => setSettings(s => ({ ...s, twoWaySync: e.target.checked }))}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <div>
                      <div style={{ fontWeight: 500 }}>Two-Way Sync</div>
                      <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Also push Apex data to QuickBooks during full sync</div>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.autoSync}
                      onChange={(e) => setSettings(s => ({ ...s, autoSync: e.target.checked }))}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <div>
                      <div style={{ fontWeight: 500 }}>Auto-Sync</div>
                      <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>Automatically sync every hour (coming soon)</div>
                    </div>
                  </label>
                </div>

                <button
                  onClick={handleSaveSettings}
                  className={styles.syncBtn}
                  style={{ marginTop: '1.5rem' }}
                >
                  <Check size={18} />
                  Save Settings
                </button>
              </div>

              <div className={styles.dataCard} style={{ padding: '1.5rem', marginTop: '1rem' }}>
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ArrowUpRight size={20} />
                  QuickBooks Write Access
                </h3>
                <p style={{ opacity: 0.8, marginBottom: '1rem' }}>
                  Apex can create invoices, customers, and payments directly in QuickBooks. 
                  Use the API or the Push to QuickBooks feature in Billing.
                </p>
                <div style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                  <strong>Enabled capabilities:</strong>
                  <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0 }}>
                    <li>Create customers in QuickBooks</li>
                    <li>Create invoices in QuickBooks</li>
                    <li>Record payments in QuickBooks</li>
                    <li>Two-way sync between Apex and QuickBooks</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
