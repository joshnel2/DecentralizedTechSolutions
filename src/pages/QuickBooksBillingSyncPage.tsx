import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { integrationsApi } from '../services/api'
import {
  ArrowLeft, RefreshCw, Calculator, Link2, CheckCircle2, AlertCircle,
  Users, FileText, DollarSign, Clock, Settings, ChevronRight,
  ArrowUpRight, ArrowDownRight, Zap, Search, Plus, Trash2, X, Check, AlertTriangle,
  History, Play, Pause
} from 'lucide-react'
import styles from './QuickBooksBillingSyncPage.module.css'

interface SyncStatus {
  isConnected: boolean
  companyName: string
  lastSyncAt: string
  stats: {
    mappedClients: number
    unmappedClients: number
    syncedInvoices: number
    invoiceSyncErrors: number
    unsyncedInvoices: number
    paymentsImported: number
    paymentsApplied: number
  }
  recentLogs: SyncLog[]
}

interface SyncLog {
  id: string
  syncType: string
  direction: string
  startedAt: string
  completedAt: string
  status: string
  itemsSynced: number
  itemsFailed: number
  errorMessage?: string
}

interface ClientMapping {
  id: string
  clientId: string
  clientName: string
  clientEmail: string
  qbCustomerId: string
  qbCustomerName: string
  qbCustomerEmail: string
  syncDirection: string
  lastSyncedAt: string
}

interface QBCustomer {
  id: string
  name: string
  email: string
  balance: number
  active: boolean
}

interface UnmappedClient {
  id: string
  name: string
  email: string
}

interface UnsyncedInvoice {
  id: string
  number: string
  clientId: string
  clientName: string
  amount: number
  status: string
  dueDate: string
}

interface SyncSettings {
  autoSyncEnabled: boolean
  autoSyncInterval: number
  syncInvoicesToQb: boolean
  syncInvoicesFromQb: boolean
  syncPaymentsFromQb: boolean
  syncCustomersToQb: boolean
  syncCustomersFromQb: boolean
  autoPushSentInvoices: boolean
  autoSyncPaidStatus: boolean
  autoCreateCustomers: boolean
  autoCreateClients: boolean
  conflictResolution: string
}

type TabType = 'overview' | 'clients' | 'invoices' | 'payments' | 'settings' | 'logs'

export function QuickBooksBillingSyncPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [settings, setSettings] = useState<SyncSettings | null>(null)
  const [clientMappings, setClientMappings] = useState<ClientMapping[]>([])
  const [unmappedClients, setUnmappedClients] = useState<UnmappedClient[]>([])
  const [qbCustomers, setQbCustomers] = useState<QBCustomer[]>([])
  const [unsyncedInvoices, setUnsyncedInvoices] = useState<UnsyncedInvoice[]>([])
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])

  const [showMappingModal, setShowMappingModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState<UnmappedClient | null>(null)
  const [selectedQbCustomer, setSelectedQbCustomer] = useState<string>('')
  const [searchQbCustomer, setSearchQbCustomer] = useState('')
  const [loadingQbCustomers, setLoadingQbCustomers] = useState(false)

  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([])

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [notification])

  const loadData = async () => {
    setLoading(true)
    try {
      const [statusRes, settingsRes] = await Promise.all([
        integrationsApi.getQuickBooksBillingSyncStatus(),
        integrationsApi.getQuickBooksBillingSyncSettings().catch(() => null),
      ])
      setStatus(statusRes)
      if (settingsRes) setSettings(settingsRes)
      if (statusRes.recentLogs) setSyncLogs(statusRes.recentLogs)
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to load sync status' })
    } finally {
      setLoading(false)
    }
  }

  const loadClientMappings = async () => {
    try {
      const [mappingsRes, unmappedRes] = await Promise.all([
        integrationsApi.getQuickBooksClientMappings(),
        integrationsApi.getUnmappedClients(),
      ])
      setClientMappings(mappingsRes.mappings || [])
      setUnmappedClients(unmappedRes.clients || [])
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to load client mappings' })
    }
  }

  const loadQbCustomers = async () => {
    setLoadingQbCustomers(true)
    try {
      const res = await integrationsApi.getQuickBooksCustomersList()
      setQbCustomers(res.customers || [])
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to load QuickBooks customers' })
    } finally {
      setLoadingQbCustomers(false)
    }
  }

  const loadUnsyncedInvoices = async () => {
    try {
      const res = await integrationsApi.getUnsyncedInvoices()
      setUnsyncedInvoices(res.invoices || [])
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to load invoices' })
    }
  }

  const loadSyncLogs = async () => {
    try {
      const res = await integrationsApi.getQuickBooksSyncLogs(50)
      setSyncLogs(res.logs || [])
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Failed to load sync logs' })
    }
  }

  // Tab change handler
  useEffect(() => {
    if (activeTab === 'clients') {
      loadClientMappings()
    } else if (activeTab === 'invoices') {
      loadUnsyncedInvoices()
    } else if (activeTab === 'logs') {
      loadSyncLogs()
    }
  }, [activeTab])

  const handleFullSync = async () => {
    setSyncing(true)
    try {
      const result = await integrationsApi.runQuickBooksFullSync()
      setNotification({ 
        type: 'success', 
        message: `Sync complete! Pushed ${result.invoicesPushed} invoices, imported ${result.paymentsImported} payments` 
      })
      loadData()
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Sync failed' })
    } finally {
      setSyncing(false)
    }
  }

  const handlePullPayments = async () => {
    setSyncing(true)
    try {
      const result = await integrationsApi.pullPaymentsFromQuickBooks()
      setNotification({ 
        type: 'success', 
        message: `Imported ${result.imported} payments, applied ${result.applied} to invoices` 
      })
      loadData()
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to pull payments' })
    } finally {
      setSyncing(false)
    }
  }

  const handleAutoMapClients = async () => {
    try {
      const result = await integrationsApi.autoMapQuickBooksClients()
      setNotification({ type: 'success', message: `Auto-mapped ${result.mappedCount} clients by email` })
      loadClientMappings()
      loadData()
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Auto-mapping failed' })
    }
  }

  const handleCreateMapping = async () => {
    if (!selectedClient || !selectedQbCustomer) return

    const customer = qbCustomers.find(c => c.id === selectedQbCustomer)
    try {
      await integrationsApi.createQuickBooksClientMapping({
        clientId: selectedClient.id,
        qbCustomerId: selectedQbCustomer,
        qbCustomerName: customer?.name,
        qbCustomerEmail: customer?.email,
      })
      setNotification({ type: 'success', message: 'Client mapped successfully' })
      setShowMappingModal(false)
      setSelectedClient(null)
      setSelectedQbCustomer('')
      loadClientMappings()
      loadData()
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to create mapping' })
    }
  }

  const handleDeleteMapping = async (mappingId: string) => {
    if (!confirm('Remove this client mapping?')) return
    try {
      await integrationsApi.deleteQuickBooksClientMapping(mappingId)
      setNotification({ type: 'success', message: 'Mapping removed' })
      loadClientMappings()
      loadData()
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to remove mapping' })
    }
  }

  const handleCreateQbCustomer = async (clientId: string) => {
    try {
      await integrationsApi.createQuickBooksCustomer(clientId)
      setNotification({ type: 'success', message: 'Customer created in QuickBooks and mapped' })
      loadClientMappings()
      loadData()
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to create customer' })
    }
  }

  const handlePushInvoice = async (invoiceId: string) => {
    try {
      await integrationsApi.pushInvoiceToQuickBooks(invoiceId)
      setNotification({ type: 'success', message: 'Invoice pushed to QuickBooks' })
      loadUnsyncedInvoices()
      loadData()
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to push invoice' })
    }
  }

  const handlePushSelectedInvoices = async () => {
    if (selectedInvoices.length === 0) return
    setSyncing(true)
    try {
      const result = await integrationsApi.pushInvoicesToQuickBooksBulk(selectedInvoices)
      setNotification({ 
        type: 'success', 
        message: `Pushed ${result.successCount} invoices${result.failCount > 0 ? `, ${result.failCount} failed` : ''}` 
      })
      setSelectedInvoices([])
      loadUnsyncedInvoices()
      loadData()
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to push invoices' })
    } finally {
      setSyncing(false)
    }
  }

  const handleSaveSettings = async (newSettings: Partial<SyncSettings>) => {
    try {
      await integrationsApi.updateQuickBooksBillingSyncSettings(newSettings)
      setSettings(prev => prev ? { ...prev, ...newSettings } : null)
      setNotification({ type: 'success', message: 'Settings saved' })
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to save settings' })
    }
  }

  const openMappingModal = (client: UnmappedClient) => {
    setSelectedClient(client)
    setShowMappingModal(true)
    if (qbCustomers.length === 0) {
      loadQbCustomers()
    }
  }

  const filteredQbCustomers = qbCustomers.filter(c =>
    c.name.toLowerCase().includes(searchQbCustomer.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchQbCustomer.toLowerCase())
  )

  if (loading) {
    return (
      <div className={styles.loading}>
        <RefreshCw size={24} className={styles.spinning} />
        <span>Loading QuickBooks sync status...</span>
      </div>
    )
  }

  if (!status?.isConnected) {
    return (
      <div className={styles.notConnected}>
        <Calculator size={64} />
        <h2>QuickBooks Not Connected</h2>
        <p>Connect your QuickBooks account to sync invoices and payments.</p>
        <button className={styles.primaryBtn} onClick={() => navigate('/app/settings/integrations')}>
          <Link2 size={18} />
          Connect QuickBooks
        </button>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Notification */}
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)}>×</button>
        </div>
      )}

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </button>
          <div className={styles.headerIcon}>
            <Calculator size={28} />
          </div>
          <div>
            <h1>QuickBooks Billing Sync</h1>
            <p>Connected to <strong>{status.companyName}</strong></p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.syncBtn}
            onClick={handleFullSync}
            disabled={syncing}
          >
            <RefreshCw size={18} className={syncing ? styles.spinning : ''} />
            {syncing ? 'Syncing...' : 'Full Sync'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {[
          { id: 'overview', label: 'Overview', icon: Calculator },
          { id: 'clients', label: 'Client Mapping', icon: Users },
          { id: 'invoices', label: 'Invoices', icon: FileText },
          { id: 'payments', label: 'Payments', icon: DollarSign },
          { id: 'settings', label: 'Settings', icon: Settings },
          { id: 'logs', label: 'Sync History', icon: History },
        ].map(tab => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => setActiveTab(tab.id as TabType)}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className={styles.content}>
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className={styles.overview}>
            {/* Stats Cards */}
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                  <Users size={24} style={{ color: '#10B981' }} />
                </div>
                <div className={styles.statContent}>
                  <div className={styles.statValue}>{status.stats.mappedClients}</div>
                  <div className={styles.statLabel}>Mapped Clients</div>
                </div>
                {status.stats.unmappedClients > 0 && (
                  <div className={styles.statBadge}>
                    {status.stats.unmappedClients} unmapped
                  </div>
                )}
              </div>

              <div className={styles.statCard}>
                <div className={styles.statIcon} style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
                  <FileText size={24} style={{ color: '#3B82F6' }} />
                </div>
                <div className={styles.statContent}>
                  <div className={styles.statValue}>{status.stats.syncedInvoices}</div>
                  <div className={styles.statLabel}>Synced Invoices</div>
                </div>
                {status.stats.unsyncedInvoices > 0 && (
                  <div className={styles.statBadge} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B' }}>
                    {status.stats.unsyncedInvoices} pending
                  </div>
                )}
              </div>

              <div className={styles.statCard}>
                <div className={styles.statIcon} style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                  <DollarSign size={24} style={{ color: '#F59E0B' }} />
                </div>
                <div className={styles.statContent}>
                  <div className={styles.statValue}>{status.stats.paymentsImported}</div>
                  <div className={styles.statLabel}>Payments Imported</div>
                </div>
                <div className={styles.statBadge} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>
                  {status.stats.paymentsApplied} applied
                </div>
              </div>

              <div className={styles.statCard}>
                <div className={styles.statIcon} style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
                  <Clock size={24} style={{ color: '#8B5CF6' }} />
                </div>
                <div className={styles.statContent}>
                  <div className={styles.statValue}>
                    {status.lastSyncAt 
                      ? new Date(status.lastSyncAt).toLocaleDateString() 
                      : 'Never'}
                  </div>
                  <div className={styles.statLabel}>Last Sync</div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className={styles.section}>
              <h3>Quick Actions</h3>
              <div className={styles.quickActions}>
                <button className={styles.actionCard} onClick={() => setActiveTab('clients')}>
                  <Users size={24} />
                  <div>
                    <strong>Map Clients</strong>
                    <span>Link clients to QuickBooks customers</span>
                  </div>
                  <ChevronRight size={20} />
                </button>
                <button className={styles.actionCard} onClick={() => setActiveTab('invoices')}>
                  <ArrowUpRight size={24} />
                  <div>
                    <strong>Push Invoices</strong>
                    <span>Send invoices to QuickBooks</span>
                  </div>
                  <ChevronRight size={20} />
                </button>
                <button className={styles.actionCard} onClick={handlePullPayments} disabled={syncing}>
                  <ArrowDownRight size={24} />
                  <div>
                    <strong>Pull Payments</strong>
                    <span>Import payments from QuickBooks</span>
                  </div>
                  <ChevronRight size={20} />
                </button>
                <button className={styles.actionCard} onClick={() => setActiveTab('settings')}>
                  <Settings size={24} />
                  <div>
                    <strong>Configure Sync</strong>
                    <span>Set up automatic syncing</span>
                  </div>
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>

            {/* Recent Sync Activity */}
            {syncLogs.length > 0 && (
              <div className={styles.section}>
                <h3>Recent Activity</h3>
                <div className={styles.logsList}>
                  {syncLogs.slice(0, 5).map(log => (
                    <div key={log.id} className={`${styles.logItem} ${styles[log.status]}`}>
                      <div className={styles.logIcon}>
                        {log.status === 'success' ? <CheckCircle2 size={18} /> : 
                         log.status === 'error' ? <AlertCircle size={18} /> : 
                         <RefreshCw size={18} className={styles.spinning} />}
                      </div>
                      <div className={styles.logContent}>
                        <strong>{log.syncType} sync ({log.direction})</strong>
                        <span>{log.itemsSynced} items synced{log.itemsFailed > 0 ? `, ${log.itemsFailed} failed` : ''}</span>
                      </div>
                      <div className={styles.logTime}>
                        {new Date(log.startedAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CLIENTS TAB */}
        {activeTab === 'clients' && (
          <div className={styles.clientsTab}>
            <div className={styles.sectionHeader}>
              <h3>Client ↔ Customer Mapping</h3>
              <div className={styles.sectionActions}>
                <button className={styles.secondaryBtn} onClick={handleAutoMapClients}>
                  <Zap size={16} />
                  Auto-Map by Email
                </button>
              </div>
            </div>

            {/* Unmapped Clients */}
            {unmappedClients.length > 0 && (
              <div className={styles.subsection}>
                <h4>
                  <AlertTriangle size={16} style={{ color: '#F59E0B' }} />
                  Unmapped Clients ({unmappedClients.length})
                </h4>
                <p className={styles.hint}>These clients need to be linked to QuickBooks customers before invoices can sync.</p>
                <div className={styles.clientList}>
                  {unmappedClients.map(client => (
                    <div key={client.id} className={styles.clientItem}>
                      <div className={styles.clientInfo}>
                        <strong>{client.name}</strong>
                        <span>{client.email || 'No email'}</span>
                      </div>
                      <div className={styles.clientActions}>
                        <button 
                          className={styles.linkBtn}
                          onClick={() => openMappingModal(client)}
                        >
                          <Link2 size={14} />
                          Link to Customer
                        </button>
                        <button 
                          className={styles.createBtn}
                          onClick={() => handleCreateQbCustomer(client.id)}
                        >
                          <Plus size={14} />
                          Create in QB
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mapped Clients */}
            <div className={styles.subsection}>
              <h4>
                <CheckCircle2 size={16} style={{ color: '#10B981' }} />
                Mapped Clients ({clientMappings.length})
              </h4>
              <div className={styles.mappingList}>
                {clientMappings.length === 0 ? (
                  <div className={styles.empty}>No clients mapped yet</div>
                ) : (
                  clientMappings.map(mapping => (
                    <div key={mapping.id} className={styles.mappingItem}>
                      <div className={styles.mappingLocal}>
                        <strong>{mapping.clientName}</strong>
                        <span>{mapping.clientEmail || 'No email'}</span>
                      </div>
                      <div className={styles.mappingArrow}>
                        <Link2 size={16} />
                      </div>
                      <div className={styles.mappingQb}>
                        <strong>{mapping.qbCustomerName}</strong>
                        <span>{mapping.qbCustomerEmail || 'No email'}</span>
                      </div>
                      <button 
                        className={styles.deleteBtn}
                        onClick={() => handleDeleteMapping(mapping.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* INVOICES TAB */}
        {activeTab === 'invoices' && (
          <div className={styles.invoicesTab}>
            <div className={styles.sectionHeader}>
              <h3>Invoice Sync</h3>
              {selectedInvoices.length > 0 && (
                <button 
                  className={styles.primaryBtn} 
                  onClick={handlePushSelectedInvoices}
                  disabled={syncing}
                >
                  <ArrowUpRight size={16} />
                  Push {selectedInvoices.length} Selected
                </button>
              )}
            </div>

            {unsyncedInvoices.length === 0 ? (
              <div className={styles.emptyState}>
                <CheckCircle2 size={48} />
                <h4>All invoices synced!</h4>
                <p>All your sent invoices have been pushed to QuickBooks.</p>
              </div>
            ) : (
              <div className={styles.invoiceList}>
                <div className={styles.invoiceHeader}>
                  <label className={styles.checkbox}>
                    <input 
                      type="checkbox"
                      checked={selectedInvoices.length === unsyncedInvoices.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedInvoices(unsyncedInvoices.map(i => i.id))
                        } else {
                          setSelectedInvoices([])
                        }
                      }}
                    />
                    Select All
                  </label>
                  <span>Invoice #</span>
                  <span>Client</span>
                  <span>Amount</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                {unsyncedInvoices.map(invoice => (
                  <div key={invoice.id} className={styles.invoiceItem}>
                    <label className={styles.checkbox}>
                      <input 
                        type="checkbox"
                        checked={selectedInvoices.includes(invoice.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedInvoices([...selectedInvoices, invoice.id])
                          } else {
                            setSelectedInvoices(selectedInvoices.filter(id => id !== invoice.id))
                          }
                        }}
                      />
                    </label>
                    <span className={styles.invoiceNumber}>{invoice.number}</span>
                    <span>{invoice.clientName}</span>
                    <span className={styles.amount}>${invoice.amount.toLocaleString()}</span>
                    <span className={`${styles.status} ${styles[invoice.status]}`}>{invoice.status}</span>
                    <button 
                      className={styles.pushBtn}
                      onClick={() => handlePushInvoice(invoice.id)}
                    >
                      <ArrowUpRight size={14} />
                      Push
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PAYMENTS TAB */}
        {activeTab === 'payments' && (
          <div className={styles.paymentsTab}>
            <div className={styles.sectionHeader}>
              <h3>Payment Sync</h3>
              <button 
                className={styles.primaryBtn}
                onClick={handlePullPayments}
                disabled={syncing}
              >
                <ArrowDownRight size={16} />
                Pull from QuickBooks
              </button>
            </div>

            <div className={styles.paymentInfo}>
              <div className={styles.infoCard}>
                <DollarSign size={24} />
                <div>
                  <strong>{status.stats.paymentsImported}</strong>
                  <span>Total Imported</span>
                </div>
              </div>
              <div className={styles.infoCard}>
                <CheckCircle2 size={24} />
                <div>
                  <strong>{status.stats.paymentsApplied}</strong>
                  <span>Applied to Invoices</span>
                </div>
              </div>
            </div>

            <p className={styles.hint}>
              Payments recorded in QuickBooks will be automatically imported and applied to matching invoices.
              Payments are matched by invoice number.
            </p>
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && settings && (
          <div className={styles.settingsTab}>
            <div className={styles.settingsSection}>
              <h3>Automatic Sync</h3>
              <div className={styles.settingRow}>
                <div className={styles.settingInfo}>
                  <strong>Enable Auto-Sync</strong>
                  <span>Automatically sync invoices and payments on a schedule</span>
                </div>
                <label className={styles.toggle}>
                  <input 
                    type="checkbox" 
                    checked={settings.autoSyncEnabled}
                    onChange={(e) => handleSaveSettings({ autoSyncEnabled: e.target.checked })}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              {settings.autoSyncEnabled && (
                <div className={styles.settingRow}>
                  <div className={styles.settingInfo}>
                    <strong>Sync Interval</strong>
                    <span>How often to sync with QuickBooks</span>
                  </div>
                  <select 
                    value={settings.autoSyncInterval}
                    onChange={(e) => handleSaveSettings({ autoSyncInterval: parseInt(e.target.value) })}
                  >
                    <option value={15}>Every 15 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                    <option value={60}>Every hour</option>
                    <option value={240}>Every 4 hours</option>
                    <option value={1440}>Once daily</option>
                  </select>
                </div>
              )}
            </div>

            <div className={styles.settingsSection}>
              <h3>Invoice Sync</h3>
              <div className={styles.settingRow}>
                <div className={styles.settingInfo}>
                  <strong>Push Invoices to QuickBooks</strong>
                  <span>Create invoices in QuickBooks when sent from Apex</span>
                </div>
                <label className={styles.toggle}>
                  <input 
                    type="checkbox" 
                    checked={settings.syncInvoicesToQb}
                    onChange={(e) => handleSaveSettings({ syncInvoicesToQb: e.target.checked })}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.settingRow}>
                <div className={styles.settingInfo}>
                  <strong>Auto-Push Sent Invoices</strong>
                  <span>Automatically push invoices when they're marked as sent</span>
                </div>
                <label className={styles.toggle}>
                  <input 
                    type="checkbox" 
                    checked={settings.autoPushSentInvoices}
                    onChange={(e) => handleSaveSettings({ autoPushSentInvoices: e.target.checked })}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>

            <div className={styles.settingsSection}>
              <h3>Payment Sync</h3>
              <div className={styles.settingRow}>
                <div className={styles.settingInfo}>
                  <strong>Pull Payments from QuickBooks</strong>
                  <span>Import payments recorded in QuickBooks</span>
                </div>
                <label className={styles.toggle}>
                  <input 
                    type="checkbox" 
                    checked={settings.syncPaymentsFromQb}
                    onChange={(e) => handleSaveSettings({ syncPaymentsFromQb: e.target.checked })}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.settingRow}>
                <div className={styles.settingInfo}>
                  <strong>Auto-Apply Payments</strong>
                  <span>Automatically update invoice status when payments sync</span>
                </div>
                <label className={styles.toggle}>
                  <input 
                    type="checkbox" 
                    checked={settings.autoSyncPaidStatus}
                    onChange={(e) => handleSaveSettings({ autoSyncPaidStatus: e.target.checked })}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>

            <div className={styles.settingsSection}>
              <h3>Customer/Client Sync</h3>
              <div className={styles.settingRow}>
                <div className={styles.settingInfo}>
                  <strong>Auto-Create Customers</strong>
                  <span>Create QuickBooks customers for unmapped clients automatically</span>
                </div>
                <label className={styles.toggle}>
                  <input 
                    type="checkbox" 
                    checked={settings.autoCreateCustomers}
                    onChange={(e) => handleSaveSettings({ autoCreateCustomers: e.target.checked })}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* LOGS TAB */}
        {activeTab === 'logs' && (
          <div className={styles.logsTab}>
            <div className={styles.sectionHeader}>
              <h3>Sync History</h3>
              <button className={styles.secondaryBtn} onClick={loadSyncLogs}>
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>

            {syncLogs.length === 0 ? (
              <div className={styles.emptyState}>
                <History size={48} />
                <h4>No sync history</h4>
                <p>Run a sync to see activity here.</p>
              </div>
            ) : (
              <div className={styles.logsTable}>
                <div className={styles.logsHeader}>
                  <span>Time</span>
                  <span>Type</span>
                  <span>Direction</span>
                  <span>Status</span>
                  <span>Items</span>
                  <span>Details</span>
                </div>
                {syncLogs.map(log => (
                  <div key={log.id} className={`${styles.logRow} ${styles[log.status]}`}>
                    <span>{new Date(log.startedAt).toLocaleString()}</span>
                    <span className={styles.logType}>{log.syncType}</span>
                    <span>
                      {log.direction === 'push' && <ArrowUpRight size={14} />}
                      {log.direction === 'pull' && <ArrowDownRight size={14} />}
                      {log.direction === 'both' && <RefreshCw size={14} />}
                      {log.direction}
                    </span>
                    <span className={`${styles.logStatus} ${styles[log.status]}`}>
                      {log.status === 'success' && <CheckCircle2 size={14} />}
                      {log.status === 'error' && <AlertCircle size={14} />}
                      {log.status === 'partial' && <AlertTriangle size={14} />}
                      {log.status}
                    </span>
                    <span>
                      {log.itemsSynced} synced
                      {log.itemsFailed > 0 && `, ${log.itemsFailed} failed`}
                    </span>
                    <span className={styles.logError}>
                      {log.errorMessage || '-'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mapping Modal */}
      {showMappingModal && selectedClient && (
        <div className={styles.modalOverlay} onClick={() => setShowMappingModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Link to QuickBooks Customer</h2>
              <button onClick={() => setShowMappingModal(false)}><X size={20} /></button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.mappingPreview}>
                <div className={styles.previewClient}>
                  <strong>{selectedClient.name}</strong>
                  <span>{selectedClient.email || 'No email'}</span>
                </div>
                <Link2 size={24} />
                <div className={styles.previewQb}>
                  {selectedQbCustomer ? (
                    <>
                      <strong>{qbCustomers.find(c => c.id === selectedQbCustomer)?.name}</strong>
                      <span>{qbCustomers.find(c => c.id === selectedQbCustomer)?.email || 'No email'}</span>
                    </>
                  ) : (
                    <span>Select a customer...</span>
                  )}
                </div>
              </div>

              <div className={styles.searchBox}>
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search QuickBooks customers..."
                  value={searchQbCustomer}
                  onChange={(e) => setSearchQbCustomer(e.target.value)}
                />
              </div>

              {loadingQbCustomers ? (
                <div className={styles.loading}>
                  <RefreshCw size={20} className={styles.spinning} />
                  Loading customers...
                </div>
              ) : (
                <div className={styles.customerList}>
                  {filteredQbCustomers.map(customer => (
                    <button
                      key={customer.id}
                      className={`${styles.customerItem} ${selectedQbCustomer === customer.id ? styles.selected : ''}`}
                      onClick={() => setSelectedQbCustomer(customer.id)}
                    >
                      <div>
                        <strong>{customer.name}</strong>
                        <span>{customer.email || 'No email'}</span>
                      </div>
                      {selectedQbCustomer === customer.id && <Check size={18} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setShowMappingModal(false)}>
                Cancel
              </button>
              <button 
                className={styles.primaryBtn} 
                onClick={handleCreateMapping}
                disabled={!selectedQbCustomer}
              >
                <Link2 size={16} />
                Link Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
