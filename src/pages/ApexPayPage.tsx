import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  CreditCard, DollarSign, TrendingUp, Clock, CheckCircle2, 
  AlertCircle, ArrowUpRight, Settings, 
  Building2, Wallet, Download, Search, ExternalLink,
  Shield, Zap, RefreshCw, Loader2
} from 'lucide-react'
import { stripeApi } from '../services/api'
import styles from './ApexPayPage.module.css'

interface Transaction {
  id: string
  clientName: string
  matterName: string
  amount: number
  fee: number
  netAmount: number
  status: 'completed' | 'pending' | 'failed' | 'refunded'
  paymentMethod: 'card' | 'ach_debit' | 'apple_pay' | 'google_pay'
  accountType: 'operating' | 'trust'
  createdAt: string
  invoiceNumber?: string
}

interface Stats {
  totalReceived: number
  totalFees: number
  pendingAmount: number
  successRate: number
  operatingBalance: number
  trustBalance: number
  transactionCount: number
}

export function ApexPayPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [isConnected, setIsConnected] = useState(false)
  const [connectionDetails, setConnectionDetails] = useState<any>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      
      // Check connection status
      const statusData = await stripeApi.getConnectionStatus()
      setIsConnected(statusData.connected)
      setConnectionDetails(statusData.connection)

      if (statusData.connected) {
        // Load stats and transactions
        const [statsData, txnData] = await Promise.all([
          stripeApi.getStats(),
          stripeApi.getTransactions({ limit: 50 })
        ])
        setStats(statsData)
        setTransactions(txnData.transactions || [])
      }
    } catch (error) {
      console.error('Error loading Apex Pay data:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = 
      t.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.matterName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesFilter = filterStatus === 'all' || t.status === filterStatus

    return matchesSearch && matchesFilter
  })

  const getStatusBadge = (status: Transaction['status']) => {
    const config = {
      completed: { icon: CheckCircle2, label: 'Completed', className: styles.statusCompleted },
      pending: { icon: Clock, label: 'Pending', className: styles.statusPending },
      failed: { icon: AlertCircle, label: 'Failed', className: styles.statusFailed },
      refunded: { icon: RefreshCw, label: 'Refunded', className: styles.statusRefunded }
    }
    const { icon: Icon, label, className } = config[status]
    return (
      <span className={`${styles.statusBadge} ${className}`}>
        <Icon size={12} />
        {label}
      </span>
    )
  }

  const getPaymentTypeLabel = (type: Transaction['paymentMethod']) => {
    const labels: Record<string, string> = {
      card: 'Card',
      ach_debit: 'ACH',
      apple_pay: 'Apple Pay',
      google_pay: 'Google Pay'
    }
    return labels[type] || type
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--gold-primary)' }} />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerIcon}>
            <CreditCard size={28} />
          </div>
          <div>
            <h1>Apex Pay</h1>
            <p>Accept payments securely • Powered by industry-leading encryption</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.settingsBtn}
            onClick={() => navigate('/app/settings/apex-pay')}
          >
            <Settings size={18} />
            Configure
          </button>
        </div>
      </div>

      {/* Connection Status */}
      {!isConnected ? (
        <div className={styles.setupBanner}>
          <div className={styles.setupContent}>
            <div className={styles.setupIcon}>
              <Zap size={24} />
            </div>
            <div className={styles.setupText}>
              <h3>Set Up Apex Pay</h3>
              <p>Connect your payment processor to start accepting online payments from clients.</p>
            </div>
          </div>
          <button 
            className={styles.setupBtn}
            onClick={() => navigate('/app/settings/apex-pay')}
          >
            Get Started
            <ArrowUpRight size={16} />
          </button>
        </div>
      ) : null}

      {/* Stats Grid */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <DollarSign size={20} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Total Received</span>
            <span className={styles.statValue}>{formatCurrency(stats?.totalReceived || 0)}</span>
            {stats?.transactionCount ? (
              <span className={styles.statNote}>{stats.transactionCount} transactions</span>
            ) : null}
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <Clock size={20} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Pending</span>
            <span className={styles.statValue}>{formatCurrency(stats?.pendingAmount || 0)}</span>
            <span className={styles.statNote}>Processing</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <TrendingUp size={20} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Success Rate</span>
            <span className={styles.statValue}>{(stats?.successRate || 0).toFixed(1)}%</span>
            <span className={styles.statNote}>All time</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            <Wallet size={20} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Processing Fees</span>
            <span className={styles.statValue}>{formatCurrency(stats?.totalFees || 0)}</span>
            <span className={styles.statNote}>2.9% + $0.30 avg</span>
          </div>
        </div>
      </div>

      {/* Account Summary */}
      <div className={styles.accountsSection}>
        <h2>Account Summary</h2>
        <div className={styles.accountsGrid}>
          <div className={styles.accountCard}>
            <div className={styles.accountHeader}>
              <Building2 size={18} />
              <span>{connectionDetails?.settings?.operatingAccountLabel || 'Operating Account'}</span>
            </div>
            <div className={styles.accountBalance}>
              {formatCurrency(stats?.operatingBalance || 0)}
            </div>
            <div className={styles.accountMeta}>
              Net received
            </div>
          </div>

          <div className={styles.accountCard}>
            <div className={styles.accountHeader}>
              <Shield size={18} />
              <span>{connectionDetails?.settings?.trustAccountLabel || 'Trust Account (IOLTA)'}</span>
            </div>
            <div className={styles.accountBalance}>
              {formatCurrency(stats?.trustBalance || 0)}
            </div>
            <div className={styles.accountMeta}>
              Net received
            </div>
          </div>
        </div>
      </div>

      {/* Transactions */}
      <div className={styles.transactionsSection}>
        <div className={styles.transactionsHeader}>
          <h2>Recent Transactions</h2>
          <div className={styles.transactionsActions}>
            <div className={styles.searchBox}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search transactions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select 
              className={styles.filterSelect}
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
            <button className={styles.exportBtn}>
              <Download size={16} />
              Export
            </button>
          </div>
        </div>

        <div className={styles.transactionsTable}>
          <table>
            <thead>
              <tr>
                <th>Client / Matter</th>
                <th>Amount</th>
                <th>Fee</th>
                <th>Net</th>
                <th>Type</th>
                <th>Account</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((txn) => (
                <tr key={txn.id}>
                  <td>
                    <div className={styles.clientCell}>
                      <span className={styles.clientName}>{txn.clientName}</span>
                      <span className={styles.matterName}>{txn.matterName}</span>
                      {txn.invoiceNumber && (
                        <span className={styles.invoiceNum}>{txn.invoiceNumber}</span>
                      )}
                    </div>
                  </td>
                  <td className={styles.amountCell}>{formatCurrency(txn.amount)}</td>
                  <td className={styles.feeCell}>-{formatCurrency(txn.fee)}</td>
                  <td className={styles.netCell}>{formatCurrency(txn.netAmount)}</td>
                  <td>
                    <span className={styles.typeBadge}>{getPaymentTypeLabel(txn.paymentMethod)}</span>
                  </td>
                  <td>
                    <span className={`${styles.accountBadge} ${txn.accountType === 'trust' ? styles.trustAccount : ''}`}>
                      {txn.accountType === 'trust' ? 'Trust' : 'Operating'}
                    </span>
                  </td>
                  <td>{getStatusBadge(txn.status)}</td>
                  <td className={styles.dateCell}>{formatDate(txn.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredTransactions.length === 0 && (
            <div className={styles.emptyState}>
              <CreditCard size={48} />
              <h3>No transactions found</h3>
              <p>Transactions will appear here once clients make payments.</p>
            </div>
          )}
        </div>
      </div>

      {/* Compliance Footer */}
      <div className={styles.complianceFooter}>
        <div className={styles.complianceBadges}>
          <span><Shield size={14} /> PCI DSS Compliant</span>
          <span><Shield size={14} /> 256-bit Encryption</span>
          <span><Shield size={14} /> SOC 2 Type II</span>
        </div>
        <p>
          Payment processing services are provided by Stripe, Inc. and are subject to the 
          <a href="https://stripe.com/legal/connect-account" target="_blank" rel="noopener noreferrer">
            Stripe Connected Account Agreement <ExternalLink size={12} />
          </a>
        </p>
      </div>
    </div>
  )
}
