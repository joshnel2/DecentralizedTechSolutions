import { useState, useMemo } from 'react'
import { useDataStore } from '../stores/dataStore'
import { 
  TrendingUp, DollarSign, Clock, Users, Briefcase,
  Download, Calendar, FileText, CheckCircle2, Filter,
  ChevronRight, BarChart3, PieChart as PieChartIcon, 
  RefreshCw, Settings, AlertCircle, ArrowUpRight, ArrowDownRight,
  Wallet, CreditCard, Scale, Target, Activity, Layers,
  Building2, Star, X, Plus, Search, Eye, Mail, Printer
} from 'lucide-react'
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts'
import { format, subDays, subMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import styles from './ReportsPage.module.css'

const COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#EC4899', '#14B8A6', '#F97316']

// Report category definitions (like Clio)
const reportCategories = [
  {
    id: 'billing',
    name: 'Billing & Revenue',
    icon: DollarSign,
    color: '#F59E0B',
    reports: [
      { id: 'billing-summary', name: 'Billing Summary', desc: 'Overview of all billing activity' },
      { id: 'ar-aging', name: 'Accounts Receivable Aging', desc: 'Outstanding invoices by age' },
      { id: 'invoice-detail', name: 'Invoice Detail', desc: 'Detailed invoice breakdown' },
      { id: 'payment-history', name: 'Payment History', desc: 'All payments received' },
      { id: 'writeoffs', name: 'Write-offs & Discounts', desc: 'Time and expense adjustments' },
      { id: 'revenue-by-client', name: 'Revenue by Client', desc: 'Client revenue analysis' },
      { id: 'revenue-by-matter', name: 'Revenue by Matter', desc: 'Matter revenue breakdown' },
      { id: 'revenue-trend', name: 'Revenue Trend', desc: 'Monthly revenue over time' }
    ]
  },
  {
    id: 'productivity',
    name: 'Productivity',
    icon: Activity,
    color: '#3B82F6',
    reports: [
      { id: 'utilization', name: 'Utilization Report', desc: 'Billable vs non-billable hours' },
      { id: 'realization', name: 'Realization Report', desc: 'Billed vs worked hours' },
      { id: 'timekeeper-summary', name: 'Timekeeper Summary', desc: 'Hours by attorney/staff' },
      { id: 'timekeeper-detail', name: 'Timekeeper Detail', desc: 'Detailed time entries' },
      { id: 'activity-code', name: 'Activity Code Report', desc: 'Time by activity type' },
      { id: 'daily-time', name: 'Daily Time Report', desc: 'Time entries by day' },
      { id: 'unbilled-time', name: 'Unbilled Time', desc: 'Time not yet invoiced' },
      { id: 'non-billable', name: 'Non-Billable Time', desc: 'Non-billable hours analysis' }
    ]
  },
  {
    id: 'matters',
    name: 'Matters',
    icon: Briefcase,
    color: '#10B981',
    reports: [
      { id: 'matter-status', name: 'Matter Status', desc: 'All matters by status' },
      { id: 'matter-workload', name: 'Matter Workload', desc: 'Hours by matter' },
      { id: 'matter-profitability', name: 'Matter Profitability', desc: 'Revenue vs cost analysis' },
      { id: 'matter-budget', name: 'Budget vs Actual', desc: 'Budget tracking report' },
      { id: 'matter-pipeline', name: 'Matter Pipeline', desc: 'Intake and new matters' },
      { id: 'practice-area', name: 'Practice Area Summary', desc: 'Matters by practice area' },
      { id: 'matter-aging', name: 'Matter Aging', desc: 'Time since last activity' },
      { id: 'matter-timeline', name: 'Matter Timeline', desc: 'Key dates and milestones' }
    ]
  },
  {
    id: 'clients',
    name: 'Clients',
    icon: Users,
    color: '#8B5CF6',
    reports: [
      { id: 'client-summary', name: 'Client Summary', desc: 'All clients overview' },
      { id: 'client-billing', name: 'Client Billing History', desc: 'Billing by client' },
      { id: 'client-collection', name: 'Collection History', desc: 'Payment patterns' },
      { id: 'client-profitability', name: 'Client Profitability', desc: 'Revenue analysis by client' },
      { id: 'client-retention', name: 'Client Retention', desc: 'Repeat client analysis' },
      { id: 'referral-source', name: 'Referral Sources', desc: 'Client acquisition analysis' },
      { id: 'client-activity', name: 'Client Activity', desc: 'Recent client interactions' }
    ]
  },
  {
    id: 'trust',
    name: 'Trust Accounting',
    icon: Wallet,
    color: '#14B8A6',
    reports: [
      { id: 'trust-balance', name: 'Trust Balance', desc: 'Current trust account balances' },
      { id: 'trust-ledger', name: 'Trust Ledger', desc: 'All trust transactions' },
      { id: 'trust-reconciliation', name: 'Trust Reconciliation', desc: 'Bank reconciliation report' },
      { id: 'trust-three-way', name: 'Three-Way Reconciliation', desc: 'Complete trust audit' },
      { id: 'trust-shortage', name: 'Trust Shortage Alert', desc: 'Low balance warnings' }
    ]
  },
  {
    id: 'expenses',
    name: 'Expenses',
    icon: CreditCard,
    color: '#EC4899',
    reports: [
      { id: 'expense-summary', name: 'Expense Summary', desc: 'All expenses overview' },
      { id: 'expense-by-matter', name: 'Expenses by Matter', desc: 'Costs per matter' },
      { id: 'expense-by-category', name: 'Expenses by Category', desc: 'Costs by type' },
      { id: 'unbilled-expenses', name: 'Unbilled Expenses', desc: 'Expenses not invoiced' },
      { id: 'reimbursable', name: 'Reimbursable Expenses', desc: 'Pending reimbursements' }
    ]
  }
]

// Saved reports
const savedReports = [
  { id: 'saved-1', name: 'Monthly Billing Summary', category: 'billing', lastRun: '2024-11-25' },
  { id: 'saved-2', name: 'Weekly Productivity', category: 'productivity', lastRun: '2024-11-24' },
  { id: 'saved-3', name: 'AR Aging 30+ Days', category: 'billing', lastRun: '2024-11-20' }
]

// Scheduled reports
const scheduledReports = [
  { id: 'sched-1', name: 'Weekly Billing Summary', frequency: 'Weekly', nextRun: 'Mon 9:00 AM', recipients: ['john@apex.law'] },
  { id: 'sched-2', name: 'Monthly Client Report', frequency: 'Monthly', nextRun: 'Dec 1, 9:00 AM', recipients: ['john@apex.law', 'sarah@apex.law'] }
]

export function ReportsPage() {
  const { matters, clients, timeEntries, invoices, expenses } = useDataStore()
  const [activeCategory, setActiveCategory] = useState('overview')
  const [selectedReport, setSelectedReport] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState('this-month')
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Date range calculations
  const getDateRange = () => {
    const today = new Date()
    switch (dateRange) {
      case 'today':
        return { start: today, end: today }
      case 'this-week':
        return { start: subDays(today, 7), end: today }
      case 'this-month':
        return { start: startOfMonth(today), end: endOfMonth(today) }
      case 'last-month':
        return { start: startOfMonth(subMonths(today, 1)), end: endOfMonth(subMonths(today, 1)) }
      case 'this-quarter':
        return { start: subMonths(today, 3), end: today }
      case 'this-year':
        return { start: new Date(today.getFullYear(), 0, 1), end: today }
      default:
        return { start: startOfMonth(today), end: endOfMonth(today) }
    }
  }

  // KPI calculations
  const kpis = useMemo(() => {
    const totalRevenue = invoices.reduce((sum, i) => sum + i.total, 0)
    const totalCollected = invoices.reduce((sum, i) => sum + i.amountPaid, 0)
    const totalHours = timeEntries.reduce((sum, t) => sum + t.hours, 0)
    const billableHours = timeEntries.filter(t => t.billable).reduce((sum, t) => sum + t.hours, 0)
    const billedHours = timeEntries.filter(t => t.billed).reduce((sum, t) => sum + t.hours, 0)
    const activeMatters = matters.filter(m => m.status === 'active').length
    const outstandingAR = invoices.filter(i => i.status !== 'paid').reduce((sum, i) => sum + (i.total - i.amountPaid), 0)
    const overdueAR = invoices.filter(i => i.status === 'overdue').reduce((sum, i) => sum + (i.total - i.amountPaid), 0)

    return {
      totalRevenue,
      totalCollected,
      collectionRate: totalRevenue > 0 ? ((totalCollected / totalRevenue) * 100).toFixed(1) : 0,
      totalHours,
      billableHours,
      utilizationRate: totalHours > 0 ? ((billableHours / totalHours) * 100).toFixed(1) : 0,
      realizationRate: billableHours > 0 ? ((billedHours / billableHours) * 100).toFixed(1) : 0,
      activeMatters,
      activeClients: clients.filter(c => c.isActive).length,
      outstandingAR,
      overdueAR,
      avgDaysToPay: 28
    }
  }, [invoices, timeEntries, matters, clients])

  // Chart data
  const revenueByMonth = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return months.map((month, i) => ({
      month,
      billed: Math.round(35000 + Math.random() * 45000),
      collected: Math.round(30000 + Math.random() * 40000),
      target: 50000
    }))
  }, [])

  const utilizationByUser = useMemo(() => {
    return [
      { name: 'John Mitchell', billable: 156, nonBillable: 24, target: 160 },
      { name: 'Sarah Chen', billable: 142, nonBillable: 28, target: 160 },
      { name: 'Michael Roberts', billable: 168, nonBillable: 12, target: 160 },
      { name: 'Emily Davis', billable: 134, nonBillable: 46, target: 160 },
      { name: 'James Wilson', billable: 152, nonBillable: 28, target: 160 }
    ]
  }, [])

  const mattersByType = useMemo(() => {
    const counts: Record<string, number> = {}
    matters.forEach(m => {
      const type = m.type.replace(/_/g, ' ')
      counts[type] = (counts[type] || 0) + 1
    })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [matters])

  const arAging = useMemo(() => {
    return [
      { bucket: 'Current', amount: 24750, color: '#10B981' },
      { bucket: '1-30 Days', amount: 15200, color: '#F59E0B' },
      { bucket: '31-60 Days', amount: 8500, color: '#F97316' },
      { bucket: '61-90 Days', amount: 5200, color: '#EF4444' },
      { bucket: '90+ Days', amount: 3100, color: '#DC2626' }
    ]
  }, [])

  // CSV Export
  const exportToCSV = (data: any[], filename: string, headers: string[]) => {
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const key = h.toLowerCase().replace(/ /g, '_')
        const val = row[key] ?? row[h] ?? ''
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`
        }
        return val
      }).join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`
    link.click()
    
    setExportMessage(`${filename}.csv exported successfully!`)
    setTimeout(() => setExportMessage(null), 3000)
  }

  const runReport = (reportId: string) => {
    // Map report IDs to export functions
    const exportMap: Record<string, () => void> = {
      'billing-summary': () => {
        const data = invoices.map(i => ({
          invoice_number: i.number,
          client: clients.find(c => c.id === i.clientId)?.name || '',
          matter: matters.find(m => m.id === i.matterId)?.name || '',
          issue_date: i.issueDate.split('T')[0],
          due_date: i.dueDate.split('T')[0],
          total: i.total,
          paid: i.amountPaid,
          balance: i.total - i.amountPaid,
          status: i.status
        }))
        exportToCSV(data, 'billing_summary', ['Invoice Number', 'Client', 'Matter', 'Issue Date', 'Due Date', 'Total', 'Paid', 'Balance', 'Status'])
      },
      'ar-aging': () => {
        const data = invoices.filter(i => i.status !== 'paid').map(i => {
          const daysOld = Math.floor((Date.now() - new Date(i.issueDate).getTime()) / (1000 * 60 * 60 * 24))
          return {
            invoice_number: i.number,
            client: clients.find(c => c.id === i.clientId)?.name || '',
            issue_date: i.issueDate.split('T')[0],
            due_date: i.dueDate.split('T')[0],
            days_outstanding: daysOld,
            amount: i.total - i.amountPaid,
            aging_bucket: daysOld <= 30 ? '0-30 days' : daysOld <= 60 ? '31-60 days' : daysOld <= 90 ? '61-90 days' : '90+ days'
          }
        })
        exportToCSV(data, 'ar_aging', ['Invoice Number', 'Client', 'Issue Date', 'Due Date', 'Days Outstanding', 'Amount', 'Aging Bucket'])
      },
      'timekeeper-summary': () => {
        const data = utilizationByUser.map(u => ({
          timekeeper: u.name,
          billable_hours: u.billable,
          non_billable_hours: u.nonBillable,
          total_hours: u.billable + u.nonBillable,
          utilization: ((u.billable / (u.billable + u.nonBillable)) * 100).toFixed(1) + '%',
          target: u.target
        }))
        exportToCSV(data, 'timekeeper_summary', ['Timekeeper', 'Billable Hours', 'Non Billable Hours', 'Total Hours', 'Utilization', 'Target'])
      },
      'matter-status': () => {
        const data = matters.map(m => ({
          number: m.number,
          name: m.name,
          client: clients.find(c => c.id === m.clientId)?.name || '',
          type: m.type.replace(/_/g, ' '),
          status: m.status.replace(/_/g, ' '),
          priority: m.priority,
          open_date: m.openDate.split('T')[0],
          billing_type: m.billingType
        }))
        exportToCSV(data, 'matter_status', ['Number', 'Name', 'Client', 'Type', 'Status', 'Priority', 'Open Date', 'Billing Type'])
      },
      'client-summary': () => {
        const data = clients.map(c => ({
          name: c.name,
          type: c.type === 'company' ? 'Organization' : 'Individual',
          email: c.email,
          phone: c.phone,
          city: c.addressCity,
          state: c.addressState,
          status: c.isActive ? 'Active' : 'Inactive',
          matters_count: matters.filter(m => m.clientId === c.id).length,
          total_billed: invoices.filter(i => i.clientId === c.id).reduce((sum, i) => sum + i.total, 0)
        }))
        exportToCSV(data, 'client_summary', ['Name', 'Type', 'Email', 'Phone', 'City', 'State', 'Status', 'Matters Count', 'Total Billed'])
      }
    }

    if (exportMap[reportId]) {
      exportMap[reportId]()
    } else {
      setExportMessage(`Report ${reportId} generated`)
      setTimeout(() => setExportMessage(null), 3000)
    }
  }

  // Filter reports by search
  const filteredCategories = useMemo(() => {
    if (!searchQuery) return reportCategories
    return reportCategories.map(cat => ({
      ...cat,
      reports: cat.reports.filter(r => 
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.desc.toLowerCase().includes(searchQuery.toLowerCase())
      )
    })).filter(cat => cat.reports.length > 0)
  }, [searchQuery])

  return (
    <div className={styles.reportsPage}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Reports</h1>
          <p>Comprehensive reporting and analytics for your firm</p>
        </div>
        <div className={styles.headerActions}>
          {exportMessage && (
            <span className={styles.exportSuccess}>
              <CheckCircle2 size={16} />
              {exportMessage}
            </span>
          )}
          <button className={styles.secondaryBtn} onClick={() => setShowScheduleModal(true)}>
            <Calendar size={18} />
            Schedule Report
          </button>
          <button className={styles.primaryBtn}>
            <Plus size={18} />
            Custom Report
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button 
          className={`${styles.tab} ${activeCategory === 'overview' ? styles.active : ''}`}
          onClick={() => setActiveCategory('overview')}
        >
          <BarChart3 size={18} />
          Overview
        </button>
        {reportCategories.map(cat => (
          <button 
            key={cat.id}
            className={`${styles.tab} ${activeCategory === cat.id ? styles.active : ''}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            <cat.icon size={18} />
            {cat.name}
          </button>
        ))}
        <button 
          className={`${styles.tab} ${activeCategory === 'saved' ? styles.active : ''}`}
          onClick={() => setActiveCategory('saved')}
        >
          <Star size={18} />
          Saved
        </button>
      </div>

      {/* Overview Tab */}
      {activeCategory === 'overview' && (
        <div className={styles.overview}>
          {/* Date Range Selector */}
          <div className={styles.controlBar}>
            <div className={styles.dateRangeSelector}>
              <Calendar size={16} />
              <select value={dateRange} onChange={e => setDateRange(e.target.value)}>
                <option value="today">Today</option>
                <option value="this-week">This Week</option>
                <option value="this-month">This Month</option>
                <option value="last-month">Last Month</option>
                <option value="this-quarter">This Quarter</option>
                <option value="this-year">This Year</option>
              </select>
            </div>
            <button className={styles.refreshBtn}>
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>

          {/* KPI Cards */}
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <div className={styles.kpiIcon} style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B' }}>
                  <DollarSign size={22} />
                </div>
                <span className={styles.kpiTrend} data-positive="true">
                  <ArrowUpRight size={14} /> 12.5%
                </span>
              </div>
              <div className={styles.kpiValue}>${(kpis.totalRevenue / 1000).toFixed(0)}k</div>
              <div className={styles.kpiLabel}>Total Revenue</div>
              <div className={styles.kpiSubtext}>vs ${((kpis.totalRevenue * 0.89) / 1000).toFixed(0)}k last period</div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <div className={styles.kpiIcon} style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>
                  <TrendingUp size={22} />
                </div>
                <span className={styles.kpiTrend} data-positive="true">
                  <ArrowUpRight size={14} /> 8.3%
                </span>
              </div>
              <div className={styles.kpiValue}>{kpis.collectionRate}%</div>
              <div className={styles.kpiLabel}>Collection Rate</div>
              <div className={styles.kpiSubtext}>${(kpis.totalCollected / 1000).toFixed(0)}k collected</div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <div className={styles.kpiIcon} style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3B82F6' }}>
                  <Clock size={22} />
                </div>
              </div>
              <div className={styles.kpiValue}>{kpis.utilizationRate}%</div>
              <div className={styles.kpiLabel}>Utilization Rate</div>
              <div className={styles.kpiSubtext}>{kpis.billableHours.toFixed(1)}h billable of {kpis.totalHours.toFixed(1)}h</div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <div className={styles.kpiIcon} style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8B5CF6' }}>
                  <Target size={22} />
                </div>
              </div>
              <div className={styles.kpiValue}>{kpis.realizationRate}%</div>
              <div className={styles.kpiLabel}>Realization Rate</div>
              <div className={styles.kpiSubtext}>Target: 90%</div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <div className={styles.kpiIcon} style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444' }}>
                  <AlertCircle size={22} />
                </div>
                <span className={styles.kpiTrend} data-positive="false">
                  <ArrowDownRight size={14} /> 5.2%
                </span>
              </div>
              <div className={styles.kpiValue}>${(kpis.outstandingAR / 1000).toFixed(0)}k</div>
              <div className={styles.kpiLabel}>Outstanding A/R</div>
              <div className={styles.kpiSubtext}>${(kpis.overdueAR / 1000).toFixed(0)}k overdue</div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <div className={styles.kpiIcon} style={{ background: 'rgba(20, 184, 166, 0.15)', color: '#14B8A6' }}>
                  <Briefcase size={22} />
                </div>
              </div>
              <div className={styles.kpiValue}>{kpis.activeMatters}</div>
              <div className={styles.kpiLabel}>Active Matters</div>
              <div className={styles.kpiSubtext}>{kpis.activeClients} active clients</div>
            </div>
          </div>

          {/* Charts Grid */}
          <div className={styles.chartsGrid}>
            {/* Revenue Trend */}
            <div className={styles.chartCard}>
              <div className={styles.chartHeader}>
                <h3>Revenue Trend</h3>
                <div className={styles.chartLegend}>
                  <span><span className={styles.dot} style={{ background: '#F59E0B' }}></span> Billed</span>
                  <span><span className={styles.dot} style={{ background: '#10B981' }}></span> Collected</span>
                </div>
              </div>
              <div className={styles.chartContainer}>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={revenueByMonth}>
                    <defs>
                      <linearGradient id="billedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="collectedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="month" 
                      axisLine={false} 
                      tickLine={false}
                      tick={{ fill: '#64748B', fontSize: 12 }}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false}
                      tick={{ fill: '#64748B', fontSize: 12 }}
                      tickFormatter={(val) => `$${val/1000}k`}
                    />
                    <Tooltip 
                      contentStyle={{
                        background: '#1E293B',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        color: '#F1F5F9'
                      }}
                      formatter={(val: number) => [`$${val.toLocaleString()}`, '']}
                    />
                    <Area type="monotone" dataKey="billed" stroke="#F59E0B" fill="url(#billedGrad)" strokeWidth={2} />
                    <Area type="monotone" dataKey="collected" stroke="#10B981" fill="url(#collectedGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* AR Aging */}
            <div className={styles.chartCard}>
              <div className={styles.chartHeader}>
                <h3>A/R Aging</h3>
                <button className={styles.viewReportBtn} onClick={() => runReport('ar-aging')}>
                  View Report <ChevronRight size={14} />
                </button>
              </div>
              <div className={styles.chartContainer}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={arAging} layout="vertical">
                    <XAxis 
                      type="number"
                      axisLine={false} 
                      tickLine={false}
                      tick={{ fill: '#64748B', fontSize: 12 }}
                      tickFormatter={(val) => `$${val/1000}k`}
                    />
                    <YAxis 
                      type="category"
                      dataKey="bucket"
                      axisLine={false} 
                      tickLine={false}
                      tick={{ fill: '#64748B', fontSize: 12 }}
                      width={80}
                    />
                    <Tooltip 
                      contentStyle={{
                        background: '#1E293B',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        color: '#F1F5F9'
                      }}
                      formatter={(val: number) => [`$${val.toLocaleString()}`, 'Amount']}
                    />
                    <Bar 
                      dataKey="amount" 
                      radius={[0, 4, 4, 0]}
                    >
                      {arAging.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Utilization by Timekeeper */}
            <div className={styles.chartCard}>
              <div className={styles.chartHeader}>
                <h3>Utilization by Timekeeper</h3>
                <button className={styles.viewReportBtn} onClick={() => runReport('timekeeper-summary')}>
                  View Report <ChevronRight size={14} />
                </button>
              </div>
              <div className={styles.chartContainer}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={utilizationByUser} layout="vertical">
                    <XAxis 
                      type="number"
                      axisLine={false} 
                      tickLine={false}
                      tick={{ fill: '#64748B', fontSize: 12 }}
                    />
                    <YAxis 
                      type="category"
                      dataKey="name"
                      axisLine={false} 
                      tickLine={false}
                      tick={{ fill: '#64748B', fontSize: 12 }}
                      width={100}
                    />
                    <Tooltip 
                      contentStyle={{
                        background: '#1E293B',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        color: '#F1F5F9'
                      }}
                    />
                    <Bar dataKey="billable" stackId="a" fill="#3B82F6" radius={[0, 0, 0, 0]} name="Billable" />
                    <Bar dataKey="nonBillable" stackId="a" fill="#64748B" radius={[0, 4, 4, 0]} name="Non-Billable" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Matters by Type */}
            <div className={styles.chartCard}>
              <div className={styles.chartHeader}>
                <h3>Matters by Practice Area</h3>
              </div>
              <div className={styles.pieContainer}>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={mattersByType}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {mattersByType.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{
                        background: '#1E293B',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        color: '#F1F5F9'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className={styles.pieLegend}>
                  {mattersByType.map((item, index) => (
                    <div key={item.name} className={styles.legendItem}>
                      <span className={styles.legendDot} style={{ background: COLORS[index % COLORS.length] }} />
                      <span className={styles.legendLabel}>{item.name}</span>
                      <span className={styles.legendValue}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Reports */}
          <div className={styles.quickReports}>
            <h3>Quick Reports</h3>
            <div className={styles.quickReportsGrid}>
              {reportCategories.flatMap(cat => 
                cat.reports.slice(0, 2).map(report => (
                  <div key={report.id} className={styles.quickReportCard} onClick={() => runReport(report.id)}>
                    <div className={styles.quickReportIcon} style={{ color: cat.color }}>
                      <cat.icon size={20} />
                    </div>
                    <div className={styles.quickReportInfo}>
                      <span className={styles.quickReportName}>{report.name}</span>
                      <span className={styles.quickReportDesc}>{report.desc}</span>
                    </div>
                    <button className={styles.runBtn}>
                      <Download size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Category Reports Tab */}
      {activeCategory !== 'overview' && activeCategory !== 'saved' && (
        <div className={styles.categoryView}>
          <div className={styles.categoryHeader}>
            <div className={styles.searchBox}>
              <Search size={18} />
              <input 
                type="text" 
                placeholder="Search reports..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className={styles.categoryActions}>
              <button className={styles.filterBtn} onClick={() => setShowFilterPanel(!showFilterPanel)}>
                <Filter size={16} />
                Filters
              </button>
            </div>
          </div>

          {/* Filter Panel */}
          {showFilterPanel && (
            <div className={styles.filterPanel}>
              <div className={styles.filterGroup}>
                <label>Date Range</label>
                <select value={dateRange} onChange={e => setDateRange(e.target.value)}>
                  <option value="today">Today</option>
                  <option value="this-week">This Week</option>
                  <option value="this-month">This Month</option>
                  <option value="last-month">Last Month</option>
                  <option value="this-quarter">This Quarter</option>
                  <option value="this-year">This Year</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label>Timekeeper</label>
                <select>
                  <option value="all">All Timekeepers</option>
                  <option value="user-1">John Mitchell</option>
                  <option value="user-2">Sarah Chen</option>
                  <option value="user-3">Michael Roberts</option>
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label>Client</label>
                <select>
                  <option value="all">All Clients</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className={styles.filterGroup}>
                <label>Matter</label>
                <select>
                  <option value="all">All Matters</option>
                  {matters.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <button className={styles.applyFilters}>Apply Filters</button>
            </div>
          )}

          {/* Reports List */}
          <div className={styles.reportsList}>
            {filteredCategories.filter(c => c.id === activeCategory).map(cat => (
              <div key={cat.id}>
                {cat.reports.map(report => (
                  <div 
                    key={report.id} 
                    className={`${styles.reportItem} ${selectedReport === report.id ? styles.selected : ''}`}
                    onClick={() => setSelectedReport(report.id)}
                  >
                    <div className={styles.reportItemIcon} style={{ background: `${cat.color}20`, color: cat.color }}>
                      <cat.icon size={20} />
                    </div>
                    <div className={styles.reportItemInfo}>
                      <span className={styles.reportItemName}>{report.name}</span>
                      <span className={styles.reportItemDesc}>{report.desc}</span>
                    </div>
                    <div className={styles.reportItemActions}>
                      <button className={styles.iconBtn} title="Preview" onClick={(e) => { e.stopPropagation(); }}>
                        <Eye size={16} />
                      </button>
                      <button className={styles.iconBtn} title="Email" onClick={(e) => { e.stopPropagation(); }}>
                        <Mail size={16} />
                      </button>
                      <button className={styles.iconBtn} title="Print" onClick={(e) => { e.stopPropagation(); }}>
                        <Printer size={16} />
                      </button>
                      <button 
                        className={styles.runReportBtn} 
                        onClick={(e) => { e.stopPropagation(); runReport(report.id); }}
                      >
                        <Download size={14} />
                        Export
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved Reports Tab */}
      {activeCategory === 'saved' && (
        <div className={styles.savedView}>
          <div className={styles.savedSection}>
            <h3>
              <Star size={18} />
              Saved Reports
            </h3>
            <div className={styles.savedList}>
              {savedReports.map(report => (
                <div key={report.id} className={styles.savedItem}>
                  <div className={styles.savedItemInfo}>
                    <span className={styles.savedItemName}>{report.name}</span>
                    <span className={styles.savedItemMeta}>Last run: {report.lastRun}</span>
                  </div>
                  <div className={styles.savedItemActions}>
                    <button className={styles.runReportBtn} onClick={() => runReport(report.id)}>
                      <Download size={14} />
                      Run
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.savedSection}>
            <h3>
              <Calendar size={18} />
              Scheduled Reports
            </h3>
            <div className={styles.savedList}>
              {scheduledReports.map(report => (
                <div key={report.id} className={styles.scheduledItem}>
                  <div className={styles.scheduledItemInfo}>
                    <span className={styles.scheduledItemName}>{report.name}</span>
                    <span className={styles.scheduledItemMeta}>
                      {report.frequency} • Next: {report.nextRun}
                    </span>
                    <span className={styles.scheduledItemRecipients}>
                      Recipients: {report.recipients.join(', ')}
                    </span>
                  </div>
                  <div className={styles.scheduledItemActions}>
                    <button className={styles.iconBtn}>
                      <Settings size={16} />
                    </button>
                    <button className={styles.iconBtnDanger}>
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Schedule Report Modal */}
      {showScheduleModal && (
        <ScheduleReportModal onClose={() => setShowScheduleModal(false)} />
      )}
    </div>
  )
}

// Schedule Report Modal
function ScheduleReportModal({ onClose }: { onClose: () => void }) {
  const [formData, setFormData] = useState({
    report: '',
    frequency: 'weekly',
    dayOfWeek: 'monday',
    dayOfMonth: '1',
    time: '09:00',
    format: 'pdf',
    recipients: ''
  })

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Schedule Report</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGroup}>
            <label>Report</label>
            <select 
              value={formData.report}
              onChange={e => setFormData({ ...formData, report: e.target.value })}
            >
              <option value="">Select a report...</option>
              {reportCategories.flatMap(cat => 
                cat.reports.map(r => (
                  <option key={r.id} value={r.id}>{cat.name} - {r.name}</option>
                ))
              )}
            </select>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Frequency</label>
              <select
                value={formData.frequency}
                onChange={e => setFormData({ ...formData, frequency: e.target.value })}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
            {formData.frequency === 'weekly' && (
              <div className={styles.formGroup}>
                <label>Day of Week</label>
                <select
                  value={formData.dayOfWeek}
                  onChange={e => setFormData({ ...formData, dayOfWeek: e.target.value })}
                >
                  <option value="monday">Monday</option>
                  <option value="tuesday">Tuesday</option>
                  <option value="wednesday">Wednesday</option>
                  <option value="thursday">Thursday</option>
                  <option value="friday">Friday</option>
                </select>
              </div>
            )}
            {formData.frequency === 'monthly' && (
              <div className={styles.formGroup}>
                <label>Day of Month</label>
                <select
                  value={formData.dayOfMonth}
                  onChange={e => setFormData({ ...formData, dayOfMonth: e.target.value })}
                >
                  {[...Array(28)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Time</label>
              <input 
                type="time" 
                value={formData.time}
                onChange={e => setFormData({ ...formData, time: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Format</label>
              <select
                value={formData.format}
                onChange={e => setFormData({ ...formData, format: e.target.value })}
              >
                <option value="pdf">PDF</option>
                <option value="csv">CSV</option>
                <option value="excel">Excel</option>
              </select>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Recipients (comma-separated emails)</label>
            <input 
              type="text" 
              value={formData.recipients}
              onChange={e => setFormData({ ...formData, recipients: e.target.value })}
              placeholder="john@apex.law, sarah@apex.law"
            />
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.primaryBtn} onClick={onClose}>
            <Calendar size={16} />
            Schedule Report
          </button>
        </div>
      </div>
    </div>
  )
}
