import { useState, useMemo } from 'react'
import { useDataStore } from '../stores/dataStore'
import {
  Landmark, Search, Download, ArrowUpRight, ArrowDownLeft,
  AlertTriangle, CheckCircle2, Clock, ChevronDown,
  DollarSign, RefreshCw, FileText, X, Users
} from 'lucide-react'
import { format, parseISO, subDays } from 'date-fns'
import { clsx } from 'clsx'
import styles from './TrustAccountingPage.module.css'
import { useToast } from '../components/Toast'

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

export function TrustAccountingPage() {
  const { clients } = useDataStore()
  const toast = useToast()
  const [transactions, setTransactions] = useState<TrustTransaction[]>([])
  const [clientBalances, setClientBalances] = useState<{ clientId: string; clientName: string; balance: number; lastActivity: string }[]>([])
  const [activeTab, setActiveTab] = useState<'ledger' | 'balances' | 'reconciliation'>('ledger')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [showDisbursementModal, setShowDisbursementModal] = useState(false)
  const [bankStatementBalance, setBankStatementBalance] = useState('')
  const [lastReconcileDate, setLastReconcileDate] = useState<string | null>(null)

  const totalBalance = useMemo(() => clientBalances.reduce((sum, c) => sum + c.balance, 0), [clientBalances])

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
            <h1>Linked Accounts</h1>
            <p>Manage linked accounts and transactions</p>
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
            <span className={styles.statValue}>${transactions.filter(t => t.type === 'deposit' && parseISO(t.date) >= subDays(new Date(), 30)).reduce((sum, t) => sum + t.amount, 0).toLocaleString()}</span>
            <span className={styles.statLabel}>Deposits This Month</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}><ArrowUpRight size={24} /></div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>${transactions.filter(t => t.type === 'disbursement' && parseISO(t.date) >= subDays(new Date(), 30)).reduce((sum, t) => sum + Math.abs(t.amount), 0).toLocaleString()}</span>
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
            <button className={styles.exportBtn} onClick={() => {
              const txData = transactions.map(t => `${t.date},${t.type},${t.clientName},${t.matterName || 'N/A'},${t.description},$${t.amount}`).join('\n');
              const blob = new Blob([`Date,Type,Client,Matter,Description,Amount\n${txData}`], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'trust-transactions.csv';
              a.click();
              URL.revokeObjectURL(url);
            }}><Download size={16} /> Export</button>
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
          {clientBalances.length > 0 ? (
            clientBalances.map(client => (
              <div key={client.clientId} className={styles.balanceCard}>
                <div className={styles.balanceInfo}>
                  <span className={styles.balanceClientName}>{client.clientName}</span>
                  <span className={styles.lastActivity}>Last activity: {format(parseISO(client.lastActivity), 'MMM d, yyyy')}</span>
                </div>
                <div className={styles.balanceAmount}>${client.balance.toLocaleString()}</div>
                <div className={styles.balanceActions}>
                  <button className={styles.smallBtn} onClick={() => toast.info(`Ledger for ${client.clientName}:\n\nShowing all trust transactions for this client.\nBalance: $${client.balance.toLocaleString()}`)}>View Ledger</button>
                  <button className={styles.smallBtn} onClick={() => toast.info(`Statement generated for ${client.clientName}\n\nA PDF statement will be available for download.`)}>Statement</button>
                </div>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--apex-text)' }}>
              <DollarSign size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <h3 style={{ color: 'var(--apex-white)', marginBottom: '0.5rem' }}>No Client Balances</h3>
              <p>Record a deposit to see client balances here.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'reconciliation' && (
        <div className={styles.reconciliationSection}>
          <div className={styles.reconcileCard}>
            <div className={styles.reconcileHeader}>
              <RefreshCw size={24} />
              <div>
                <h3>Account Reconciliation</h3>
                <p>Last reconciled: {lastReconcileDate ? format(parseISO(lastReconcileDate), 'MMMM d, yyyy') : 'Never'}</p>
              </div>
            </div>
            <div className={styles.reconcileStats}>
              <div className={styles.reconcileStat}>
                <span className={styles.reconcileLabel}>Bank Statement Balance</span>
                <span className={styles.reconcileValue}>{bankStatementBalance ? `$${parseFloat(bankStatementBalance).toLocaleString()}` : 'Not set'}</span>
              </div>
              <div className={styles.reconcileStat}>
                <span className={styles.reconcileLabel}>Ledger Balance</span>
                <span className={styles.reconcileValue}>${totalBalance.toLocaleString()}</span>
              </div>
              <div className={styles.reconcileStat}>
                <span className={styles.reconcileLabel}>Difference</span>
                <span className={clsx(styles.reconcileValue, bankStatementBalance && parseFloat(bankStatementBalance) === totalBalance ? styles.success : '')}>
                  {bankStatementBalance ? `$${Math.abs(parseFloat(bankStatementBalance) - totalBalance).toLocaleString()}` : '—'}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
              <input 
                type="number" 
                placeholder="Enter bank statement balance..." 
                value={bankStatementBalance}
                onChange={(e) => setBankStatementBalance(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  background: 'var(--apex-slate)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: 'var(--apex-white)',
                  fontSize: '1rem'
                }}
              />
            </div>
            <button className={styles.primaryBtn} onClick={() => {
              if (!bankStatementBalance) {
                toast.info('Please enter the bank statement balance first.');
                return;
              }
              setLastReconcileDate(new Date().toISOString());
              toast.info(`Reconciliation completed!\n\nBank Balance: $${parseFloat(bankStatementBalance).toLocaleString()}\nLedger Balance: $${totalBalance.toLocaleString()}\nDifference: $${Math.abs(parseFloat(bankStatementBalance) - totalBalance).toLocaleString()}`);
            }}><RefreshCw size={16} /> Complete Reconciliation</button>
          </div>
        </div>
      )}

      {showDepositModal && (
        <DepositModal 
          clients={clients}
          onClose={() => setShowDepositModal(false)}
          onSave={(data) => {
            const client = clients.find(c => c.id === data.clientId);
            const newTransaction: TrustTransaction = {
              id: crypto.randomUUID(),
              clientId: data.clientId,
              clientName: client?.displayName || client?.name || 'Unknown',
              type: 'deposit',
              amount: data.amount,
              balance: totalBalance + data.amount,
              description: data.description,
              reference: data.reference,
              method: data.method,
              date: data.date,
              status: 'cleared',
              createdBy: 'user'
            };
            setTransactions([newTransaction, ...transactions]);
            
            // Update or add client balance
            const existingIdx = clientBalances.findIndex(cb => cb.clientId === data.clientId);
            if (existingIdx >= 0) {
              const updated = [...clientBalances];
              updated[existingIdx] = {
                ...updated[existingIdx],
                balance: updated[existingIdx].balance + data.amount,
                lastActivity: data.date
              };
              setClientBalances(updated);
            } else {
              setClientBalances([...clientBalances, {
                clientId: data.clientId,
                clientName: client?.displayName || client?.name || 'Unknown',
                balance: data.amount,
                lastActivity: data.date
              }]);
            }
            setShowDepositModal(false);
          }}
        />
      )}

      {showDisbursementModal && (
        <DisbursementModal 
          clients={clients}
          clientBalances={clientBalances}
          onClose={() => setShowDisbursementModal(false)}
          onSave={(data) => {
            const client = clients.find(c => c.id === data.clientId);
            const clientBal = clientBalances.find(cb => cb.clientId === data.clientId);
            
            if (!clientBal || clientBal.balance < data.amount) {
              toast.info('Insufficient funds for this client');
              return;
            }
            
            const newTransaction: TrustTransaction = {
              id: crypto.randomUUID(),
              clientId: data.clientId,
              clientName: client?.displayName || client?.name || 'Unknown',
              type: 'disbursement',
              amount: -data.amount,
              balance: totalBalance - data.amount,
              description: data.description,
              reference: data.reference,
              method: data.method,
              date: data.date,
              status: 'cleared',
              createdBy: 'user'
            };
            setTransactions([newTransaction, ...transactions]);
            
            // Update client balance
            const updated = clientBalances.map(cb => 
              cb.clientId === data.clientId 
                ? { ...cb, balance: cb.balance - data.amount, lastActivity: data.date }
                : cb
            );
            setClientBalances(updated);
            setShowDisbursementModal(false);
          }}
        />
      )}
    </div>
  )
}

// Deposit Modal Component
function DepositModal({ clients, onClose, onSave }: { 
  clients: any[]; 
  onClose: () => void; 
  onSave: (data: { clientId: string; amount: number; date: string; method: string; reference: string; description: string }) => void 
}) {
  const toast = useToast()
  const [formData, setFormData] = useState({
    clientId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    method: 'check',
    reference: '',
    description: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId || !formData.amount || !formData.description) {
      toast.info('Please fill in all required fields');
      return;
    }
    onSave({
      ...formData,
      amount: parseFloat(formData.amount)
    });
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Record Trust Deposit</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label>Client *</label>
            <select value={formData.clientId} onChange={e => setFormData({...formData, clientId: e.target.value})} required>
              <option value="">Select client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.displayName || c.name}</option>)}
            </select>
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Amount *</label>
              <input type="number" step="0.01" placeholder="0.00" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} required />
            </div>
            <div className={styles.formGroup}>
              <label>Date *</label>
              <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required />
            </div>
          </div>
          <div className={styles.formGroup}>
            <label>Payment Method</label>
            <select value={formData.method} onChange={e => setFormData({...formData, method: e.target.value})}>
              <option value="check">Check</option>
              <option value="wire">Wire Transfer</option>
              <option value="ach">ACH</option>
              <option value="cash">Cash</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>Reference/Check Number</label>
            <input type="text" placeholder="CHK-10234" value={formData.reference} onChange={e => setFormData({...formData, reference: e.target.value})} />
          </div>
          <div className={styles.formGroup}>
            <label>Description *</label>
            <textarea rows={2} placeholder="Retainer deposit for..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} required />
          </div>
          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
            <button type="submit" className={styles.primaryBtn}><ArrowDownLeft size={16} /> Record Deposit</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Disbursement Modal Component
function DisbursementModal({ clients, clientBalances, onClose, onSave }: { 
  clients: any[];
  clientBalances: { clientId: string; clientName: string; balance: number; lastActivity: string }[];
  onClose: () => void; 
  onSave: (data: { clientId: string; amount: number; date: string; method: string; reference: string; description: string }) => void 
}) {
  const toast = useToast()
  const [formData, setFormData] = useState({
    clientId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    method: 'check',
    reference: '',
    description: ''
  });

  const selectedClientBalance = clientBalances.find(cb => cb.clientId === formData.clientId)?.balance || 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId || !formData.amount || !formData.description) {
      toast.info('Please fill in all required fields');
      return;
    }
    const amount = parseFloat(formData.amount);
    if (amount > selectedClientBalance) {
      toast.info(`Insufficient funds. Available balance: $${selectedClientBalance.toLocaleString()}`);
      return;
    }
    onSave({
      ...formData,
      amount
    });
  };

  // Only show clients with a balance
  const clientsWithBalance = clients.filter(c => 
    clientBalances.some(cb => cb.clientId === c.id && cb.balance > 0)
  );

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Record Disbursement</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label>Client *</label>
            <select value={formData.clientId} onChange={e => setFormData({...formData, clientId: e.target.value})} required>
              <option value="">Select client...</option>
              {clientsWithBalance.length > 0 ? (
                clientsWithBalance.map(c => {
                  const bal = clientBalances.find(cb => cb.clientId === c.id)?.balance || 0;
                  return <option key={c.id} value={c.id}>{c.displayName || c.name} (${bal.toLocaleString()})</option>
                })
              ) : (
                <option value="" disabled>No clients with funds</option>
              )}
            </select>
          </div>
          {formData.clientId && (
            <div style={{ padding: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px', marginBottom: '1rem' }}>
              <span style={{ color: 'var(--apex-gold-bright)' }}>Available Balance: ${selectedClientBalance.toLocaleString()}</span>
            </div>
          )}
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Amount *</label>
              <input type="number" step="0.01" placeholder="0.00" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} max={selectedClientBalance} required />
            </div>
            <div className={styles.formGroup}>
              <label>Date *</label>
              <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required />
            </div>
          </div>
          <div className={styles.formGroup}>
            <label>Payment Method</label>
            <select value={formData.method} onChange={e => setFormData({...formData, method: e.target.value})}>
              <option value="check">Check</option>
              <option value="wire">Wire Transfer</option>
              <option value="ach">ACH</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>Reference/Check Number</label>
            <input type="text" placeholder="CHK-10234" value={formData.reference} onChange={e => setFormData({...formData, reference: e.target.value})} />
          </div>
          <div className={styles.formGroup}>
            <label>Description *</label>
            <textarea rows={2} placeholder="Payment to vendor for..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} required />
          </div>
          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
            <button type="submit" className={styles.primaryBtn} disabled={clientsWithBalance.length === 0}><ArrowUpRight size={16} /> Record Disbursement</button>
          </div>
        </form>
      </div>
    </div>
  );
}
