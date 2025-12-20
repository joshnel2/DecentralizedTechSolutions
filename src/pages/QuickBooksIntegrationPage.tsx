import { useState, useEffect } from 'react'
import { Calculator, RefreshCw, Search, ArrowLeft, DollarSign, Users, TrendingUp, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { integrationsApi } from '../services/api'
import styles from './IntegrationDataPage.module.css'

interface Invoice {
  id: string
  number: string
  customerName: string
  date: string
  dueDate: string
  total: number
  balance: number
  status: string
}

interface Customer {
  id: string
  name: string
  email: string
  balance: number
}

export function QuickBooksIntegrationPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'invoices' | 'customers'>('invoices')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const syncResult = await integrationsApi.syncQuickBooks()
      setInvoices(syncResult.invoices || [])
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
      setInvoices(result.invoices || [])
      setNotification({ type: 'success', message: result.message || 'QuickBooks synced successfully' })
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Sync failed' })
    } finally {
      setSyncing(false)
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

  const totalOutstanding = invoices.reduce((sum, inv) => sum + (inv.balance || 0), 0)
  const totalPaid = invoices.filter(inv => inv.balance === 0).length
  const totalOverdue = invoices.filter(inv => inv.status === 'overdue').length

  return (
    <div className={styles.container}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.message}
          <button onClick={() => setNotification(null)}>×</button>
        </div>
      )}

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
            <p>View invoices and customers from QuickBooks</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.syncBtn}
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw size={18} className={syncing ? styles.spinning : ''} />
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className={styles.dataGrid} style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className={styles.dataCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Outstanding</span>
            <DollarSign size={20} style={{ color: 'var(--gold-primary)' }} />
          </div>
          <div className={styles.cardAmount}>{formatCurrency(totalOutstanding)}</div>
          <div className={styles.cardMeta}>{invoices.length} invoices</div>
        </div>
        <div className={styles.dataCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Paid</span>
            <TrendingUp size={20} style={{ color: 'var(--success)' }} />
          </div>
          <div className={styles.cardAmount}>{totalPaid}</div>
          <div className={styles.cardMeta}>invoices paid</div>
        </div>
        <div className={styles.dataCard}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Overdue</span>
            <FileText size={20} style={{ color: 'var(--error)' }} />
          </div>
          <div className={styles.cardAmount}>{totalOverdue}</div>
          <div className={styles.cardMeta}>need attention</div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search invoices..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>
          <RefreshCw size={24} className={styles.spinning} />
          <span>Loading QuickBooks data...</span>
        </div>
      ) : (
        <div className={styles.dataGrid}>
          {filteredInvoices.length === 0 ? (
            <div className={styles.empty}>
              <Calculator size={48} />
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
                  <div>{invoice.customerName}</div>
                  <div>Due: {formatDate(invoice.dueDate)}</div>
                  {invoice.balance > 0 && (
                    <div style={{ color: 'var(--gold-primary)' }}>
                      Balance: {formatCurrency(invoice.balance)}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
