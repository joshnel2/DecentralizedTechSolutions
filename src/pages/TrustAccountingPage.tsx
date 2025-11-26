import { useState, useMemo } from 'react'
import { useDataStore } from '../stores/dataStore'
import {
  Landmark, Plus, Search, Download, Upload, ArrowUpRight, ArrowDownLeft,
  Filter, Calendar, AlertTriangle, CheckCircle2, Clock, ChevronDown,
  DollarSign, RefreshCw, FileText, X, Users
} from 'lucide-react'
import { format, parseISO, subDays } from 'date-fns'
import { clsx } from 'clsx'
import styles from './TrustAccountingPage.module.css'

interface TrustTransaction {
  id: string
  clientId: string
  clientName: string
  matterId?: string
  matterName?: string
  type: 'deposit' | 'disbursement' | 'transfer' | 'refund'
  amount: number
  balance: number
  description: string
  reference?: string
  method: string
  date: string
  status: 'pending' | 'cleared' | 'void'
  createdBy: string
}

const demoTransactions: TrustTransaction[] = [
  { id: '1', clientId: 'c1', clientName: 'Quantum Technologies', matterId: 'm1', matterName: 'Patent Infringement', type: 'deposit', amount: 25000, balance: 45000, description: 'Initial retainer deposit', reference: 'CHK-10234', method: 'check', date: subDays(new Date(), 1).toISOString(), status: 'cleared', createdBy: 'John Mitchell' },
  { id: '2', clientId: 'c2', clientName: 'Anderson Family', matterId: 'm2', matterName: 'Estate Planning', type: 'deposit', amount: 10000, balance: 10000, description: 'Retainer for estate planning services', reference: 'WIRE-8821', method: 'wire', date: subDays(new Date(), 3).toISOString(), status: 'cleared', createdBy: 'Sarah Chen' },
  { id: '3', clientId: 'c1', clientName: 'Quantum Technologies', matterId: 'm1', matterName: 'Patent Infringement', type: 'disbursement', amount: -5000, balance: 40000, description: 'Court filing fees - USPTO', reference: 'DBT-001', method: 'check', date: subDays(new Date(), 5).toISOString(), status: 'cleared', createdBy: 'John Mitchell' },
  { id: '4', clientId: 'c3', clientName: 'Metro Development Corp', matterId: 'm3', matterName: 'Commercial Lease', type: 'deposit', amount: 15000, balance: 15000, description: 'Retainer deposit', reference: 'ACH-7742', method: 'ach', date: subDays(new Date(), 7).toISOString(), status: 'cleared', createdBy: 'Michael Roberts' },
  { id: '5', clientId: 'c1', clientName: 'Quantum Technologies', matterId: 'm1', matterName: 'Patent Infringement', type: 'transfer', amount: -8500, balance: 31500, description: 'Transfer to operating - Invoice INV-2024-0041', reference: 'TRF-112', method: 'transfer', date: subDays(new Date(), 10).toISOString(), status: 'cleared', createdBy: 'John Mitchell' },
]

const clientBalances = [
  { clientId: 'c1', clientName: 'Quantum Technologies', balance: 31500, lastActivity: subDays(new Date(), 1).toISOString() },
  { clientId: 'c3', clientName: 'Metro Development Corp', balance: 15000, lastActivity: subDays(new Date(), 7).toISOString() },
  { clientId: 'c2', clientName: 'Anderson Family', balance: 10000, lastActivity: subDays(new Date(), 3).toISOString() },
  { clientId: 'c4', clientName: 'Sarah Johnson', balance: 5000, lastActivity: subDays(new Date(), 14).toISOString() },
]

export function TrustAccountingPage() {
  const { clients } = useDataStore()
  const [transactions] = useState(demoTransactions)
  const [activeTab, setActiveTab] = useState<'ledger' | 'balances' | 'reconciliation'>('ledger')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [showDisbursementModal, setShowDisbursementModal] = useState(false)

  const totalBalance = useMemo(() => clientBalances.reduce((sum, c) => sum + c.balance, 0), [])

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchesSearch = t.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           t.description.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesType = typeFilter === 'all' || t.type === typeFilter
      return matchesSearch && matchesType
    })
  }, [transactions, searchQuery, typeFilter])

  return (
    <div className={styles.trustPage}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}><Landmark size={28} /></div>
          <div>
            <h1>Trust Accounting (IOLTA)</h1>
            <p>Manage client trust funds and maintain compliance</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondaryBtn} onClick={() => setShowDisbursementModal(true)}>
            <ArrowUpRight size={18} /> Disbursement
          </button>
          <button className={styles.primaryBtn} onClick={() => setShowDepositModal(true)}>
            <ArrowDownLeft size={18} /> Deposit
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}><DollarSign size={24} /></div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>${totalBalance.toLocaleString()}</span>
            <span className={styles.statLabel}>Total Trust Balance</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}><Users size={24} /></div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{clientBalances.length}</span>
            <span className={styles.statLabel}>Clients with Funds</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}><ArrowDownLeft size={24} /></div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>$50,000</span>
            <span className={styles.statLabel}>Deposits This Month</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}><ArrowUpRight size={24} /></div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>$13,500</span>
            <span className={styles.statLabel}>Disbursements This Month</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button className={clsx(styles.tab, activeTab === 'ledger' && styles.active)} onClick={() => setActiveTab('ledger')}>
          <FileText size={18} /> Transaction Ledger
        </button>
        <button className={clsx(styles.tab, activeTab === 'balances' && styles.active)} onClick={() => setActiveTab('balances')}>
          <Users size={18} /> Client Balances
        </button>
        <button className={clsx(styles.tab, activeTab === 'reconciliation' && styles.active)} onClick={() => setActiveTab('reconciliation')}>
          <RefreshCw size={18} /> Reconciliation
        </button>
      </div>

      {activeTab === 'ledger' && (
        <>
          <div className={styles.toolbar}>
            <div className={styles.searchBox}>
              <Search size={18} />
              <input type="text" placeholder="Search transactions..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <select className={styles.filterSelect} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="all">All Types</option>
              <option value="deposit">Deposits</option>
              <option value="disbursement">Disbursements</option>
              <option value="transfer">Transfers</option>
              <option value="refund">Refunds</option>
            </select>
            <button className={styles.exportBtn}><Download size={16} /> Export</button>
          </div>

          <div className={styles.transactionsList}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Client / Matter</th>
                  <th>Description</th>
                  <th>Reference</th>
                  <th>Type</th>
                  <th className={styles.alignRight}>Amount</th>
                  <th className={styles.alignRight}>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map(t => (
                  <tr key={t.id}>
                    <td className={styles.dateCell}>{format(parseISO(t.date), 'MMM d, yyyy')}</td>
                    <td>
                      <div className={styles.clientCell}>
                        <span className={styles.clientName}>{t.clientName}</span>
                        {t.matterName && <span className={styles.matterName}>{t.matterName}</span>}
                      </div>
                    </td>
                    <td>{t.description}</td>
                    <td className={styles.refCell}>{t.reference || '—'}</td>
                    <td>
                      <span className={clsx(styles.typeBadge, styles[t.type])}>
                        {t.type === 'deposit' && <ArrowDownLeft size={12} />}
                        {t.type === 'disbursement' && <ArrowUpRight size={12} />}
                        {t.type === 'transfer' && <RefreshCw size={12} />}
                        {t.type}
                      </span>
                    </td>
                    <td className={clsx(styles.alignRight, t.amount > 0 ? styles.positive : styles.negative)}>
                      {t.amount > 0 ? '+' : ''}{t.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </td>
                    <td className={styles.alignRight}>${t.balance.toLocaleString()}</td>
                    <td>
                      <span className={clsx(styles.statusBadge, styles[t.status])}>
                        {t.status === 'cleared' && <CheckCircle2 size={12} />}
                        {t.status === 'pending' && <Clock size={12} />}
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'balances' && (
        <div className={styles.balancesList}>
          {clientBalances.map(client => (
            <div key={client.clientId} className={styles.balanceCard}>
              <div className={styles.balanceInfo}>
                <span className={styles.balanceClientName}>{client.clientName}</span>
                <span className={styles.lastActivity}>Last activity: {format(parseISO(client.lastActivity), 'MMM d, yyyy')}</span>
              </div>
              <div className={styles.balanceAmount}>${client.balance.toLocaleString()}</div>
              <div className={styles.balanceActions}>
                <button className={styles.smallBtn}>View Ledger</button>
                <button className={styles.smallBtn}>Statement</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'reconciliation' && (
        <div className={styles.reconciliationSection}>
          <div className={styles.reconcileCard}>
            <div className={styles.reconcileHeader}>
              <RefreshCw size={24} />
              <div>
                <h3>Account Reconciliation</h3>
                <p>Last reconciled: November 1, 2024</p>
              </div>
            </div>
            <div className={styles.reconcileStats}>
              <div className={styles.reconcileStat}>
                <span className={styles.reconcileLabel}>Bank Statement Balance</span>
                <span className={styles.reconcileValue}>$61,500.00</span>
              </div>
              <div className={styles.reconcileStat}>
                <span className={styles.reconcileLabel}>Ledger Balance</span>
                <span className={styles.reconcileValue}>$61,500.00</span>
              </div>
              <div className={styles.reconcileStat}>
                <span className={styles.reconcileLabel}>Difference</span>
                <span className={clsx(styles.reconcileValue, styles.success)}>$0.00</span>
              </div>
            </div>
            <button className={styles.primaryBtn}><RefreshCw size={16} /> Start New Reconciliation</button>
          </div>
        </div>
      )}

      {showDepositModal && (
        <div className={styles.modalOverlay} onClick={() => setShowDepositModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Record Trust Deposit</h2>
              <button onClick={() => setShowDepositModal(false)} className={styles.closeBtn}><X size={20} /></button>
            </div>
            <form className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label>Client *</label>
                <select><option>Select client...</option>{clients.map(c => <option key={c.id} value={c.id}>{c.displayName}</option>)}</select>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label>Amount *</label><input type="number" placeholder="0.00" /></div>
                <div className={styles.formGroup}><label>Date *</label><input type="date" defaultValue={new Date().toISOString().split('T')[0]} /></div>
              </div>
              <div className={styles.formGroup}><label>Payment Method</label>
                <select><option value="check">Check</option><option value="wire">Wire Transfer</option><option value="ach">ACH</option><option value="cash">Cash</option></select>
              </div>
              <div className={styles.formGroup}><label>Reference/Check Number</label><input type="text" placeholder="CHK-10234" /></div>
              <div className={styles.formGroup}><label>Description *</label><textarea rows={2} placeholder="Retainer deposit for..." /></div>
              <div className={styles.modalActions}>
                <button type="button" onClick={() => setShowDepositModal(false)} className={styles.cancelBtn}>Cancel</button>
                <button type="submit" className={styles.primaryBtn}><ArrowDownLeft size={16} /> Record Deposit</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
