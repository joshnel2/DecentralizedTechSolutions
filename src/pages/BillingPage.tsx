import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDataStore } from '../stores/dataStore'
import { 
  Plus, Search, DollarSign, FileText, TrendingUp, AlertCircle,
  CheckCircle2, Clock, Send, MoreVertical
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import styles from './BillingPage.module.css'

export function BillingPage() {
  const { invoices, clients, matters, timeEntries, expenses } = useDataStore()
  const [activeTab, setActiveTab] = useState('invoices')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

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
        <button className={styles.primaryBtn}>
          <Plus size={18} />
          Create Invoice
        </button>
      </div>

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
                      <button className={styles.menuBtn}>
                        <MoreVertical size={16} />
                      </button>
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
