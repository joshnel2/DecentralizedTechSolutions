import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  CreditCard, DollarSign, TrendingUp, Clock, CheckCircle2, 
  AlertCircle, ArrowUpRight, ArrowDownRight, Settings, 
  Building2, Wallet, Filter, Download, Search, ExternalLink,
  Shield, Zap, RefreshCw
} from 'lucide-react'
import styles from './ApexPayPage.module.css'

interface Transaction {
  id: string
  clientName: string
  matterName: string
  amount: number
  fee: number
  netAmount: number
  status: 'completed' | 'pending' | 'failed' | 'refunded'
  type: 'credit_card' | 'ach' | 'echeck'
  accountType: 'operating' | 'trust'
  date: string
  invoiceNumber?: string
}

// Demo transactions
const demoTransactions: Transaction[] = [
  {
    id: 'txn_001',
    clientName: 'Johnson Family Trust',
    matterName: 'Estate Planning - 2024',
    amount: 2500.00,
    fee: 72.50,
    netAmount: 2427.50,
    status: 'completed',
    type: 'credit_card',
    accountType: 'operating',
    date: '2024-01-15T10:30:00Z',
    invoiceNumber: 'INV-2024-0042'
  },
  {
    id: 'txn_002',
    clientName: 'Smith & Associates LLC',
    matterName: 'Contract Review',
    amount: 5000.00,
    fee: 40.00,
    netAmount: 4960.00,
    status: 'completed',
    type: 'ach',
    accountType: 'trust',
    date: '2024-01-14T14:22:00Z',
    invoiceNumber: 'INV-2024-0041'
  },
  {
    id: 'txn_003',
    clientName: 'Martinez Holdings',
    matterName: 'Litigation - Thompson v. Martinez',
    amount: 15000.00,
    fee: 435.00,
    netAmount: 14565.00,
    status: 'pending',
    type: 'credit_card',
    accountType: 'trust',
    date: '2024-01-13T09:15:00Z'
  },
  {
    id: 'txn_004',
    clientName: 'Chen Industries',
    matterName: 'IP Registration',
    amount: 750.00,
    fee: 21.75,
    netAmount: 728.25,
    status: 'completed',
    type: 'credit_card',
    accountType: 'operating',
    date: '2024-01-12T16:45:00Z',
    invoiceNumber: 'INV-2024-0039'
  },
  {
    id: 'txn_005',
    clientName: 'Williams Estate',
    matterName: 'Probate Administration',
    amount: 3200.00,
    fee: 25.60,
    netAmount: 3174.40,
    status: 'failed',
    type: 'ach',
    accountType: 'operating',
    date: '2024-01-11T11:00:00Z'
  }
]

export function ApexPayPage() {
  const navigate = useNavigate()
  const [transactions] = useState<Transaction[]>(demoTransactions)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [isConnected] = useState(false) // Will be dynamic based on Stripe connection

  // Calculate stats
  const totalReceived = transactions
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0)
  
  const totalFees = transactions
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + t.fee, 0)
  
  const pendingAmount = transactions
    .filter(t => t.status === 'pending')
    .reduce((sum, t) => sum + t.amount, 0)

  const successRate = transactions.length > 0
    ? (transactions.filter(t => t.status === 'completed').length / transactions.length) * 100
    : 0

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

  const getPaymentTypeLabel = (type: Transaction['type']) => {
    const labels = {
      credit_card: 'Card',
      ach: 'ACH',
      echeck: 'eCheck'
    }
    return labels[type]
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
            <span className={styles.statValue}>{formatCurrency(totalReceived)}</span>
            <span className={styles.statChange}>
              <ArrowUpRight size={14} />
              +12.5% from last month
            </span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <Clock size={20} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Pending</span>
            <span className={styles.statValue}>{formatCurrency(pendingAmount)}</span>
            <span className={styles.statNote}>Processing</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <TrendingUp size={20} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Success Rate</span>
            <span className={styles.statValue}>{successRate.toFixed(1)}%</span>
            <span className={styles.statChange}>
              <ArrowUpRight size={14} />
              +2.3% improvement
            </span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            <Wallet size={20} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Processing Fees</span>
            <span className={styles.statValue}>{formatCurrency(totalFees)}</span>
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
              <span>Operating Account</span>
            </div>
            <div className={styles.accountBalance}>
              {formatCurrency(transactions
                .filter(t => t.status === 'completed' && t.accountType === 'operating')
                .reduce((sum, t) => sum + t.netAmount, 0)
              )}
            </div>
            <div className={styles.accountMeta}>
              {transactions.filter(t => t.accountType === 'operating').length} transactions
            </div>
          </div>

          <div className={styles.accountCard}>
            <div className={styles.accountHeader}>
              <Shield size={18} />
              <span>Trust Account (IOLTA)</span>
            </div>
            <div className={styles.accountBalance}>
              {formatCurrency(transactions
                .filter(t => t.status === 'completed' && t.accountType === 'trust')
                .reduce((sum, t) => sum + t.netAmount, 0)
              )}
            </div>
            <div className={styles.accountMeta}>
              {transactions.filter(t => t.accountType === 'trust').length} transactions
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
                    <span className={styles.typeBadge}>{getPaymentTypeLabel(txn.type)}</span>
                  </td>
                  <td>
                    <span className={`${styles.accountBadge} ${txn.accountType === 'trust' ? styles.trustAccount : ''}`}>
                      {txn.accountType === 'trust' ? 'Trust' : 'Operating'}
                    </span>
                  </td>
                  <td>{getStatusBadge(txn.status)}</td>
                  <td className={styles.dateCell}>{formatDate(txn.date)}</td>
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
