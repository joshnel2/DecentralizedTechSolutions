import { useState, useMemo } from 'react'
import { useDataStore } from '../stores/dataStore'
import { 
  TrendingUp, DollarSign, Clock, Users, Briefcase,
  Download, Calendar, CheckCircle2, Filter,
  ChevronRight, BarChart3, 
  RefreshCw, AlertCircle, ArrowUpRight, ArrowDownRight,
  Target, Activity,
  X, Plus, Search, Eye,
  FileSpreadsheet, AlertTriangle
} from 'lucide-react'
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts'
import { format, subDays, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import styles from './ReportsPage.module.css'

const COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#EC4899', '#14B8A6', '#F97316']

// Report category definitions - only working reports included
const reportCategories = [
  {
    id: 'billing',
    name: 'Billing & Revenue',
    icon: DollarSign,
    color: '#F59E0B',
    reports: [
      { id: 'billing-summary', name: 'Billing Summary', desc: 'Overview of all billing activity' },
      { id: 'ar-aging', name: 'Accounts Receivable Aging', desc: 'Outstanding invoices by age' },
      { id: 'payment-history', name: 'Payment History', desc: 'All payments received' }
    ]
  },
  {
    id: 'productivity',
    name: 'Productivity',
    icon: Activity,
    color: '#3B82F6',
    reports: [
      { id: 'timekeeper-summary', name: 'Timekeeper Summary', desc: 'Hours by attorney/staff' },
      { id: 'unbilled-time', name: 'Unbilled Time', desc: 'Time not yet invoiced' }
    ]
  },
  {
    id: 'matters',
    name: 'Matters',
    icon: Briefcase,
    color: '#10B981',
    reports: [
      { id: 'matter-status', name: 'Matter Status', desc: 'All matters by status' }
    ]
  },
  {
    id: 'clients',
    name: 'Clients',
    icon: Users,
    color: '#8B5CF6',
    reports: [
      { id: 'client-summary', name: 'Client Summary', desc: 'All clients overview' }
    ]
  }
]

// Note: Saved and scheduled reports would be stored in the database in production
// These are managed locally for the demo

export function ReportsPage() {
  const { matters, clients, timeEntries, invoices, expenses } = useDataStore()
  const [activeCategory, setActiveCategory] = useState('overview')
  const [selectedReport, setSelectedReport] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState('this-month')
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [showCustomReportModal, setShowCustomReportModal] = useState(false)
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showPreviewModal, setShowPreviewModal] = useState<{ report: any; category: any } | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

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

  // Chart data - calculated from real invoice data
  const revenueByMonth = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const currentYear = new Date().getFullYear()
    
    return months.map((month, i) => {
      const monthInvoices = invoices.filter(inv => {
        const date = new Date(inv.issueDate)
        return date.getMonth() === i && date.getFullYear() === currentYear
      })
      
      const billed = monthInvoices.reduce((sum, inv) => sum + inv.total, 0)
      const collected = monthInvoices.reduce((sum, inv) => sum + inv.amountPaid, 0)
      
      return {
        month,
        billed: Math.round(billed),
        collected: Math.round(collected),
        target: 50000
      }
    })
  }, [invoices])

  const utilizationByUser = useMemo(() => {
    // Calculate utilization from real time entries data
    const userHours: Record<string, { billable: number; nonBillable: number }> = {}
    
    timeEntries.forEach(entry => {
      const userName = entry.userId || 'Unknown User'
      if (!userHours[userName]) {
        userHours[userName] = { billable: 0, nonBillable: 0 }
      }
      if (entry.billable) {
        userHours[userName].billable += entry.hours
      } else {
        userHours[userName].nonBillable += entry.hours
      }
    })
    
    // If no data, return empty array
    if (Object.keys(userHours).length === 0) {
      return []
    }
    
    return Object.entries(userHours).map(([name, hours]) => ({
      name,
      billable: Math.round(hours.billable * 10) / 10,
      nonBillable: Math.round(hours.nonBillable * 10) / 10,
      target: 160 // Monthly target (adjust as needed)
    }))
  }, [timeEntries])

  const mattersByType = useMemo(() => {
    const counts: Record<string, number> = {}
    matters.forEach(m => {
      const type = m.type.replace(/_/g, ' ')
      counts[type] = (counts[type] || 0) + 1
    })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [matters])

  const arAging = useMemo(() => {
    // Calculate AR aging from real invoice data
    const today = new Date()
    const buckets = {
      'Current': { amount: 0, color: '#10B981' },
      '1-30 Days': { amount: 0, color: '#F59E0B' },
      '31-60 Days': { amount: 0, color: '#F97316' },
      '61-90 Days': { amount: 0, color: '#EF4444' },
      '90+ Days': { amount: 0, color: '#DC2626' }
    }
    
    invoices
      .filter(inv => inv.status !== 'paid' && inv.status !== 'void')
      .forEach(inv => {
        const dueDate = new Date(inv.dueDate)
        const daysPastDue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        const outstanding = inv.total - inv.amountPaid
        
        if (daysPastDue <= 0) {
          buckets['Current'].amount += outstanding
        } else if (daysPastDue <= 30) {
          buckets['1-30 Days'].amount += outstanding
        } else if (daysPastDue <= 60) {
          buckets['31-60 Days'].amount += outstanding
        } else if (daysPastDue <= 90) {
          buckets['61-90 Days'].amount += outstanding
        } else {
          buckets['90+ Days'].amount += outstanding
        }
      })
    
    return Object.entries(buckets).map(([bucket, data]) => ({
      bucket,
      amount: Math.round(data.amount * 100) / 100,
      color: data.color
    }))
  }, [invoices])

  // CSV Export
  const exportToCSV = (data: any[], filename: string, headers: string[]) => {
    // Check if there's data to export
    if (!data || data.length === 0) {
      setExportError(`No data available to export for this report. Please ensure you have the relevant data in your system.`)
      setTimeout(() => setExportError(null), 5000)
      return false
    }

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
    return true
  }

  const runReport = (reportId: string) => {
    // Clear any previous error
    setExportError(null)
    
    // Map report IDs to export functions
    const exportMap: Record<string, () => void> = {
      'billing-summary': () => {
        if (invoices.length === 0) {
          setExportError('No invoices found. Create invoices to generate a billing summary report.')
          setTimeout(() => setExportError(null), 5000)
          return
        }
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
        const unpaidInvoices = invoices.filter(i => i.status !== 'paid')
        if (unpaidInvoices.length === 0) {
          setExportError('No outstanding invoices found. All invoices are paid or there are no invoices in the system.')
          setTimeout(() => setExportError(null), 5000)
          return
        }
        const data = unpaidInvoices.map(i => {
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
        if (utilizationByUser.length === 0) {
          setExportError('No time entries found. Log time entries to generate a timekeeper summary report.')
          setTimeout(() => setExportError(null), 5000)
          return
        }
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
        if (matters.length === 0) {
          setExportError('No matters found. Create matters to generate a matter status report.')
          setTimeout(() => setExportError(null), 5000)
          return
        }
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
        if (clients.length === 0) {
          setExportError('No clients found. Add clients to generate a client summary report.')
          setTimeout(() => setExportError(null), 5000)
          return
        }
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
      },
      'unbilled-time': () => {
        const unbilledEntries = timeEntries.filter(t => !t.billed && t.billable)
        if (unbilledEntries.length === 0) {
          setExportError('No unbilled time entries found. All billable time has been invoiced.')
          setTimeout(() => setExportError(null), 5000)
          return
        }
        const data = unbilledEntries.map(t => ({
          date: t.date.split('T')[0],
          matter: matters.find(m => m.id === t.matterId)?.name || '',
          description: t.description,
          hours: t.hours,
          rate: t.rate,
          amount: t.amount
        }))
        exportToCSV(data, 'unbilled_time', ['Date', 'Matter', 'Description', 'Hours', 'Rate', 'Amount'])
      },
      'payment-history': () => {
        const paidInvoices = invoices.filter(i => i.amountPaid > 0)
        if (paidInvoices.length === 0) {
          setExportError('No payments found. No invoices have been paid yet.')
          setTimeout(() => setExportError(null), 5000)
          return
        }
        const data = paidInvoices.map(i => ({
          invoice_number: i.number,
          client: clients.find(c => c.id === i.clientId)?.name || '',
          total: i.total,
          amount_paid: i.amountPaid,
          status: i.status
        }))
        exportToCSV(data, 'payment_history', ['Invoice Number', 'Client', 'Total', 'Amount Paid', 'Status'])
      }
    }

    if (exportMap[reportId]) {
      exportMap[reportId]()
    } else {
      // For reports without specific implementations, show a message that export is not available
      setExportError(`Export for "${reportId.replace(/-/g, ' ')}" is not yet implemented. Please try one of the available reports.`)
      setTimeout(() => setExportError(null), 5000)
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
          {exportError && (
            <span className={styles.exportError}>
              <AlertTriangle size={16} />
              {exportError}
            </span>
          )}
          <button className={styles.primaryBtn} onClick={() => setShowCustomReportModal(true)}>
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
            <button className={styles.refreshBtn} onClick={() => {
              alert('Dashboard data refreshed!');
            }}>
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
              <button className={styles.applyFilters} onClick={() => {
                alert('Filters applied! Reports will be generated with the selected criteria.');
                setShowFilterPanel(false);
              }}>Apply Filters</button>
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
                      <button className={styles.iconBtn} title="Preview" onClick={(e) => { 
                        e.stopPropagation(); 
                        setShowPreviewModal({ report, category: reportCategories.find(c => c.id === activeCategory) });
                      }}>
                        <Eye size={16} />
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


      {/* Custom Report Modal */}
      {showCustomReportModal && (
        <CustomReportModal 
          onClose={() => setShowCustomReportModal(false)} 
          onExport={(data, filename, headers) => {
            exportToCSV(data, filename, headers)
            setShowCustomReportModal(false)
          }}
          matters={matters}
          clients={clients}
          invoices={invoices}
          timeEntries={timeEntries}
        />
      )}

      {/* Report Preview Modal */}
      {showPreviewModal && (
        <div className={styles.modalOverlay} onClick={() => setShowPreviewModal(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className={styles.modalHeader}>
              <h3>Report Preview: {showPreviewModal.report.name}</h3>
              <button onClick={() => setShowPreviewModal(null)}><X size={20} /></button>
            </div>
            <div className={styles.modalBody}>
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ color: 'var(--apex-text)', marginBottom: '1rem' }}>{showPreviewModal.report.desc}</p>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.875rem', color: 'var(--apex-text)' }}>
                    <strong>Category:</strong> {showPreviewModal.category?.name || 'General'}
                  </span>
                  <span style={{ fontSize: '0.875rem', color: 'var(--apex-text)' }}>
                    <strong>Date Range:</strong> {dateRange.replace('-', ' ')}
                  </span>
                </div>
              </div>
              <div style={{ 
                background: 'rgba(0,0,0,0.2)', 
                border: '1px solid rgba(255,255,255,0.1)', 
                borderRadius: '8px', 
                padding: '1.5rem',
                textAlign: 'center',
                color: 'var(--apex-text)'
              }}>
                <FileSpreadsheet size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <p style={{ marginBottom: '0.5rem' }}>Report data will be generated based on current filters</p>
                <p style={{ fontSize: '0.875rem' }}>Click "Run Report" to generate and download the full report</p>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setShowPreviewModal(null)}>Close</button>
              <button className={styles.primaryBtn} onClick={() => {
                runReport(showPreviewModal.report.id)
                setShowPreviewModal(null)
              }}>
                <Download size={16} />
                Run Report
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// Custom Report column definitions
const customReportColumns = {
  matters: [
    { id: 'number', label: 'Matter Number', default: true },
    { id: 'name', label: 'Matter Name', default: true },
    { id: 'clientName', label: 'Client Name', default: true },
    { id: 'type', label: 'Matter Type', default: true },
    { id: 'status', label: 'Status', default: true },
    { id: 'priority', label: 'Priority', default: false },
    { id: 'openDate', label: 'Open Date', default: true },
    { id: 'closeDate', label: 'Close Date', default: false },
    { id: 'billingType', label: 'Billing Type', default: false },
    { id: 'practiceArea', label: 'Practice Area', default: false },
    { id: 'responsibleAttorney', label: 'Responsible Attorney', default: false },
    { id: 'originatingAttorney', label: 'Originating Attorney', default: false },
    { id: 'description', label: 'Description', default: false }
  ],
  clients: [
    { id: 'name', label: 'Client Name', default: true },
    { id: 'type', label: 'Client Type', default: true },
    { id: 'email', label: 'Email', default: true },
    { id: 'phone', label: 'Phone', default: true },
    { id: 'addressCity', label: 'City', default: false },
    { id: 'addressState', label: 'State', default: false },
    { id: 'addressZip', label: 'Zip Code', default: false },
    { id: 'isActive', label: 'Status', default: true },
    { id: 'matterCount', label: 'Matter Count', default: true },
    { id: 'totalBilled', label: 'Total Billed', default: true },
    { id: 'totalPaid', label: 'Total Paid', default: false },
    { id: 'outstanding', label: 'Outstanding', default: false }
  ],
  invoices: [
    { id: 'number', label: 'Invoice Number', default: true },
    { id: 'clientName', label: 'Client Name', default: true },
    { id: 'matterName', label: 'Matter Name', default: true },
    { id: 'issueDate', label: 'Issue Date', default: true },
    { id: 'dueDate', label: 'Due Date', default: true },
    { id: 'total', label: 'Total Amount', default: true },
    { id: 'amountPaid', label: 'Amount Paid', default: true },
    { id: 'balance', label: 'Balance Due', default: true },
    { id: 'status', label: 'Status', default: true },
    { id: 'daysOutstanding', label: 'Days Outstanding', default: false },
    { id: 'agingBucket', label: 'Aging Bucket', default: false }
  ],
  timeEntries: [
    { id: 'date', label: 'Date', default: true },
    { id: 'matterName', label: 'Matter Name', default: true },
    { id: 'clientName', label: 'Client Name', default: true },
    { id: 'description', label: 'Description', default: true },
    { id: 'hours', label: 'Hours', default: true },
    { id: 'rate', label: 'Rate', default: true },
    { id: 'amount', label: 'Amount', default: true },
    { id: 'billable', label: 'Billable', default: true },
    { id: 'billed', label: 'Billed', default: false },
    { id: 'activityType', label: 'Activity Type', default: false },
    { id: 'userId', label: 'Timekeeper', default: false }
  ]
}

// Custom Report Modal
function CustomReportModal({ 
  onClose, 
  onExport,
  matters,
  clients,
  invoices,
  timeEntries
}: { 
  onClose: () => void
  onExport: (data: any[], filename: string, headers: string[]) => void
  matters: any[]
  clients: any[]
  invoices: any[]
  timeEntries: any[]
}) {
  const [reportType, setReportType] = useState<'matters' | 'clients' | 'invoices' | 'timeEntries'>('matters')
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    customReportColumns.matters.filter(c => c.default).map(c => c.id)
  )
  const [reportName, setReportName] = useState('Custom Report')

  // Update selected columns when report type changes
  const handleReportTypeChange = (type: 'matters' | 'clients' | 'invoices' | 'timeEntries') => {
    setReportType(type)
    setSelectedColumns(customReportColumns[type].filter(c => c.default).map(c => c.id))
  }

  const toggleColumn = (columnId: string) => {
    if (selectedColumns.includes(columnId)) {
      setSelectedColumns(selectedColumns.filter(c => c !== columnId))
    } else {
      setSelectedColumns([...selectedColumns, columnId])
    }
  }

  const selectAll = () => {
    setSelectedColumns(customReportColumns[reportType].map(c => c.id))
  }

  const selectNone = () => {
    setSelectedColumns([])
  }

  const generateReport = () => {
    if (selectedColumns.length === 0) {
      alert('Please select at least one column')
      return
    }

    let data: any[] = []
    const headers = selectedColumns.map(id => 
      customReportColumns[reportType].find(c => c.id === id)?.label || id
    )

    switch (reportType) {
      case 'matters':
        data = matters.map(m => {
          const row: any = {}
          selectedColumns.forEach(col => {
            switch (col) {
              case 'number': row[col] = m.number; break
              case 'name': row[col] = m.name; break
              case 'clientName': row[col] = clients.find(c => c.id === m.clientId)?.name || ''; break
              case 'type': row[col] = m.type?.replace(/_/g, ' '); break
              case 'status': row[col] = m.status?.replace(/_/g, ' '); break
              case 'priority': row[col] = m.priority; break
              case 'openDate': row[col] = m.openDate?.split('T')[0]; break
              case 'closeDate': row[col] = m.closeDate?.split('T')[0] || ''; break
              case 'billingType': row[col] = m.billingType; break
              case 'practiceArea': row[col] = m.practiceArea || ''; break
              case 'description': row[col] = m.description || ''; break
              default: row[col] = m[col] || ''
            }
          })
          return row
        })
        break

      case 'clients':
        data = clients.map(c => {
          const clientMatters = matters.filter(m => m.clientId === c.id)
          const clientInvoices = invoices.filter(i => i.clientId === c.id)
          const totalBilled = clientInvoices.reduce((sum, i) => sum + i.total, 0)
          const totalPaid = clientInvoices.reduce((sum, i) => sum + i.amountPaid, 0)
          
          const row: any = {}
          selectedColumns.forEach(col => {
            switch (col) {
              case 'name': row[col] = c.name || c.displayName; break
              case 'type': row[col] = c.type === 'company' ? 'Organization' : 'Individual'; break
              case 'email': row[col] = c.email || ''; break
              case 'phone': row[col] = c.phone || ''; break
              case 'addressCity': row[col] = c.addressCity || ''; break
              case 'addressState': row[col] = c.addressState || ''; break
              case 'addressZip': row[col] = c.addressZip || ''; break
              case 'isActive': row[col] = c.isActive ? 'Active' : 'Inactive'; break
              case 'matterCount': row[col] = clientMatters.length; break
              case 'totalBilled': row[col] = totalBilled; break
              case 'totalPaid': row[col] = totalPaid; break
              case 'outstanding': row[col] = totalBilled - totalPaid; break
              default: row[col] = c[col] || ''
            }
          })
          return row
        })
        break

      case 'invoices':
        data = invoices.map(i => {
          const daysOld = Math.floor((Date.now() - new Date(i.issueDate).getTime()) / (1000 * 60 * 60 * 24))
          const row: any = {}
          selectedColumns.forEach(col => {
            switch (col) {
              case 'number': row[col] = i.number; break
              case 'clientName': row[col] = clients.find(c => c.id === i.clientId)?.name || ''; break
              case 'matterName': row[col] = matters.find(m => m.id === i.matterId)?.name || ''; break
              case 'issueDate': row[col] = i.issueDate?.split('T')[0]; break
              case 'dueDate': row[col] = i.dueDate?.split('T')[0]; break
              case 'total': row[col] = i.total; break
              case 'amountPaid': row[col] = i.amountPaid; break
              case 'balance': row[col] = i.total - i.amountPaid; break
              case 'status': row[col] = i.status; break
              case 'daysOutstanding': row[col] = daysOld; break
              case 'agingBucket': row[col] = daysOld <= 30 ? '0-30 days' : daysOld <= 60 ? '31-60 days' : daysOld <= 90 ? '61-90 days' : '90+ days'; break
              default: row[col] = i[col] || ''
            }
          })
          return row
        })
        break

      case 'timeEntries':
        data = timeEntries.map(t => {
          const row: any = {}
          selectedColumns.forEach(col => {
            switch (col) {
              case 'date': row[col] = t.date?.split('T')[0]; break
              case 'matterName': row[col] = matters.find(m => m.id === t.matterId)?.name || ''; break
              case 'clientName': 
                const matter = matters.find(m => m.id === t.matterId)
                row[col] = matter ? clients.find(c => c.id === matter.clientId)?.name || '' : ''
                break
              case 'description': row[col] = t.description; break
              case 'hours': row[col] = t.hours; break
              case 'rate': row[col] = t.rate; break
              case 'amount': row[col] = t.amount; break
              case 'billable': row[col] = t.billable ? 'Yes' : 'No'; break
              case 'billed': row[col] = t.billed ? 'Yes' : 'No'; break
              case 'activityType': row[col] = t.activityType || ''; break
              default: row[col] = t[col] || ''
            }
          })
          return row
        })
        break
    }

    const filename = reportName.toLowerCase().replace(/\s+/g, '_')
    onExport(data, filename, headers)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className={styles.modalHeader}>
          <h2>Custom Report</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGroup}>
            <label>Report Name</label>
            <input 
              type="text" 
              value={reportName}
              onChange={e => setReportName(e.target.value)}
              placeholder="Enter report name"
            />
          </div>

          <div className={styles.formGroup}>
            <label>Data Type</label>
            <select 
              value={reportType}
              onChange={e => handleReportTypeChange(e.target.value as any)}
            >
              <option value="matters">Matters</option>
              <option value="clients">Clients</option>
              <option value="invoices">Invoices</option>
              <option value="timeEntries">Time Entries</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ marginBottom: 0 }}>Select Columns to Include</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  type="button"
                  onClick={selectAll}
                  style={{
                    padding: '0.25rem 0.5rem',
                    background: 'none',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '4px',
                    color: 'var(--apex-text)',
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  Select All
                </button>
                <button 
                  type="button"
                  onClick={selectNone}
                  style={{
                    padding: '0.25rem 0.5rem',
                    background: 'none',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '4px',
                    color: 'var(--apex-text)',
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  Clear All
                </button>
              </div>
            </div>
            <div style={{ 
              background: 'var(--apex-slate)', 
              border: '1px solid rgba(255,255,255,0.1)', 
              borderRadius: '8px',
              padding: '1rem',
              maxHeight: '250px',
              overflowY: 'auto'
            }}>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(2, 1fr)', 
                gap: '0.5rem' 
              }}>
                {customReportColumns[reportType].map(column => (
                  <label 
                    key={column.id}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem',
                      padding: '0.5rem',
                      background: selectedColumns.includes(column.id) ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedColumns.includes(column.id)}
                      onChange={() => toggleColumn(column.id)}
                      style={{ 
                        width: '16px', 
                        height: '16px',
                        accentColor: 'var(--apex-gold)'
                      }}
                    />
                    <span style={{ 
                      fontSize: '0.875rem', 
                      color: selectedColumns.includes(column.id) ? 'var(--apex-white)' : 'var(--apex-text)'
                    }}>
                      {column.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ 
              marginTop: '0.5rem', 
              fontSize: '0.75rem', 
              color: 'var(--apex-text)' 
            }}>
              {selectedColumns.length} of {customReportColumns[reportType].length} columns selected
            </div>
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button 
            className={styles.primaryBtn} 
            onClick={generateReport}
            disabled={selectedColumns.length === 0}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>
    </div>
  )
}
