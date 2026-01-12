import { useState, useMemo, useEffect, useCallback } from 'react'
import { useDataStore } from '../stores/dataStore'
import { useAuthStore } from '../stores/authStore'
import { analyticsApi } from '../services/api'
import { 
  TrendingUp, DollarSign, Clock, Users,
  Download, Briefcase, CreditCard,
  ArrowUpRight, ArrowDownRight, AlertTriangle, Target, Percent, RefreshCw, BarChart3
} from 'lucide-react'
import { format, parseISO, startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns'
import { parseAsLocalDate } from '../utils/dateUtils'
import { AreaChart, Area, PieChart as RechartsPie, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from 'recharts'
import { AIButton } from '../components/AIButton'
import styles from './FirmAnalyticsPage.module.css'

const COLORS = ['#D4AF37', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444']

// Time period mapping for backend API
const TIME_PERIOD_MAP: Record<string, string> = {
  'thisMonth': 'current_month',
  'lastMonth': 'last_month',
  'last3Months': 'last_quarter',
  'last6Months': 'last_6_months',
  'thisYear': 'year_to_date',
  'allTime': 'all_time'
}

export function FirmAnalyticsPage() {
  const { timeEntries, invoices, matters, clients } = useDataStore()
  const { user } = useAuthStore()
  const [dateRange, setDateRange] = useState('thisMonth')
  const [selectedTab, setSelectedTab] = useState('overview')
  
  // Backend analytics state
  const [analytics, setAnalytics] = useState<any>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  
  // Attorney production data (for billing analytics from time entries)
  const [attorneyProduction, setAttorneyProduction] = useState<any>(null)

  // Fetch analytics from backend
  const fetchAnalytics = useCallback(async () => {
    try {
      setAnalyticsLoading(true)
      const timePeriod = TIME_PERIOD_MAP[dateRange] || 'current_month'
      
      // Fetch both dashboard and attorney production in parallel
      const [dashboardResponse, productionResponse] = await Promise.all([
        analyticsApi.getFirmDashboard(timePeriod),
        analyticsApi.getAttorneyProduction()
      ])
      
      if (dashboardResponse.success) {
        setAnalytics(dashboardResponse.data)
      }
      if (productionResponse.success) {
        setAttorneyProduction(productionResponse.data)
      }
    } catch (error) {
      console.error('Failed to fetch firm analytics:', error)
    } finally {
      setAnalyticsLoading(false)
    }
  }, [dateRange])

  // Fetch on mount and when date range changes
  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  // Calculate date range for local fallback
  const dateFilter = useMemo(() => {
    const now = new Date()
    switch (dateRange) {
      case 'thisMonth':
        return { start: startOfMonth(now), end: endOfMonth(now) }
      case 'lastMonth':
        return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) }
      case 'last3Months':
        return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) }
      case 'last6Months':
        return { start: startOfMonth(subMonths(now, 5)), end: endOfMonth(now) }
      case 'thisYear':
        return { start: new Date(now.getFullYear(), 0, 1), end: now }
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) }
    }
  }, [dateRange])

  // Revenue metrics - use backend data if available
  const revenueMetrics = useMemo(() => {
    if (analytics) {
      return {
        totalInvoiced: analytics.invoices.total_invoiced,
        totalCollected: analytics.invoices.total_collected,
        outstanding: analytics.invoices.total_outstanding,
        overdue: analytics.invoices.total_overdue,
        growthRate: analytics.changes.revenue_change_percent,
        collectionRate: analytics.invoices.collection_rate
      }
    }

    // Fallback to local data
    const filteredInvoices = invoices.filter(inv => {
      const date = parseISO(inv.issueDate)
      return isWithinInterval(date, dateFilter)
    })

    const totalInvoiced = filteredInvoices.reduce((sum, inv) => sum + inv.total, 0)
    const totalCollected = filteredInvoices.reduce((sum, inv) => sum + inv.amountPaid, 0)
    const outstanding = totalInvoiced - totalCollected
    const overdue = filteredInvoices.filter(inv => inv.status === 'overdue').reduce((sum, inv) => sum + (inv.total - inv.amountPaid), 0)
    const prevPeriodInvoiced = totalInvoiced * 0.85
    const growthRate = prevPeriodInvoiced > 0 ? ((totalInvoiced - prevPeriodInvoiced) / prevPeriodInvoiced) * 100 : 0

    return { totalInvoiced, totalCollected, outstanding, overdue, growthRate, collectionRate: 0 }
  }, [invoices, dateFilter, analytics])

  // Billable hours metrics - use backend data if available
  const hoursMetrics = useMemo(() => {
    if (analytics) {
      return {
        totalHours: analytics.summary.total_hours,
        billableHours: analytics.summary.billable_hours,
        billedAmount: analytics.summary.billable_amount,
        utilizationRate: analytics.productivity.utilization_rate,
        unbilledHours: analytics.summary.unbilled_hours,
        unbilledAmount: analytics.summary.unbilled_amount
      }
    }

    // Fallback to local data
    const filteredEntries = timeEntries.filter(entry => {
      const date = parseAsLocalDate(entry.date)
      return isWithinInterval(date, dateFilter)
    })

    const totalHours = filteredEntries.reduce((sum, e) => sum + e.hours, 0)
    const billableHours = filteredEntries.filter(e => e.billable).reduce((sum, e) => sum + e.hours, 0)
    const billedAmount = filteredEntries.filter(e => e.billable).reduce((sum, e) => sum + e.amount, 0)
    const utilizationRate = totalHours > 0 ? (billableHours / totalHours) * 100 : 0

    return { totalHours, billableHours, billedAmount, utilizationRate, unbilledHours: 0, unbilledAmount: 0 }
  }, [timeEntries, dateFilter, analytics])

  // Additional metrics - use backend data if available
  const additionalMetrics = useMemo(() => {
    if (analytics) {
      return {
        activeMatters: analytics.matters.active,
        avgMatterValue: analytics.matters.total > 0 ? revenueMetrics.totalInvoiced / analytics.matters.total : 0,
        realizationRate: hoursMetrics.billedAmount > 0 ? (revenueMetrics.totalCollected / hoursMetrics.billedAmount) * 100 : 0,
        effectiveRate: hoursMetrics.billableHours > 0 ? revenueMetrics.totalCollected / hoursMetrics.billableHours : 0,
        totalMatters: analytics.matters.total,
        totalClients: analytics.clients.total
      }
    }

    // Fallback
    const activeMatters = matters.filter(m => m.status === 'active').length
    const avgMatterValue = matters.length > 0 ? revenueMetrics.totalInvoiced / matters.length : 0
    const realizationRate = hoursMetrics.billedAmount > 0 ? (revenueMetrics.totalCollected / hoursMetrics.billedAmount) * 100 : 0
    const effectiveRate = hoursMetrics.billableHours > 0 ? revenueMetrics.totalCollected / hoursMetrics.billableHours : 0

    return { activeMatters, avgMatterValue, realizationRate, effectiveRate, totalMatters: matters.length, totalClients: clients.length }
  }, [matters, clients, revenueMetrics, hoursMetrics, analytics])

  // Team productivity from backend
  const teamProductivity = useMemo(() => {
    if (analytics?.team_productivity) {
      return analytics.team_productivity.filter((t: any) => t.total_hours > 0)
    }
    return []
  }, [analytics])

  // Revenue by practice area - use backend data if available
  const revenueByPracticeArea = useMemo(() => {
    if (analytics?.revenue_by_practice_area) {
      return analytics.revenue_by_practice_area.map((r: any) => ({
        name: (r.type || 'unassigned').replace(/_/g, ' '),
        value: r.total_amount
      }))
    }

    // Fallback to local data
    const practiceRevenue: Record<string, number> = {}
    
    timeEntries.forEach(entry => {
      const date = parseAsLocalDate(entry.date)
      if (isWithinInterval(date, dateFilter) && entry.billable) {
        const matter = matters.find(m => m.id === entry.matterId)
        if (matter) {
          const type = (matter.type || 'other').replace(/_/g, ' ')
          practiceRevenue[type] = (practiceRevenue[type] || 0) + entry.amount
        }
      }
    })

    return Object.entries(practiceRevenue)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [timeEntries, matters, dateFilter])

  // Monthly revenue trend (last 6 months)
  // Monthly revenue trend - use backend data if available
  const revenueTrend = useMemo(() => {
    if (analytics?.monthly_trend && analytics.monthly_trend.length > 0) {
      return analytics.monthly_trend.map((m: any) => ({
        month: format(new Date(m.month), 'MMM'),
        invoiced: Math.round(m.billable_amount),
        collected: Math.round(m.total_amount),
        hours: Math.round(m.billable_hours)
      }))
    }

    // Fallback to local data
    const months = []
    for (let i = 5; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(new Date(), i))
      const monthEnd = endOfMonth(subMonths(new Date(), i))
      
      const monthInvoices = invoices.filter(inv => {
        const date = parseISO(inv.issueDate)
        return isWithinInterval(date, { start: monthStart, end: monthEnd })
      })

      const invoiced = monthInvoices.reduce((sum, inv) => sum + inv.total, 0)
      const collected = monthInvoices.reduce((sum, inv) => sum + inv.amountPaid, 0)

      months.push({
        month: format(monthStart, 'MMM'),
        invoiced,
        collected,
        hours: 0
      })
    }
    return months
  }, [invoices, analytics])

  // Export function
  const exportReport = () => {
    const reportDate = format(new Date(), 'yyyy-MM-dd')
    const dateRangeLabel = dateRange.replace(/([A-Z])/g, ' $1').trim()
    
    // Build CSV content
    const lines = [
      `Firm Analytics Report - ${reportDate}`,
      `Period: ${dateRangeLabel}`,
      '',
      'KEY METRICS',
      `Total Invoiced,$${revenueMetrics.totalInvoiced.toLocaleString()}`,
      `Total Collected,$${revenueMetrics.totalCollected.toLocaleString()}`,
      `Outstanding,$${revenueMetrics.outstanding.toLocaleString()}`,
      `Overdue,$${revenueMetrics.overdue.toLocaleString()}`,
      `Collection Rate,${revenueMetrics.totalInvoiced > 0 ? ((revenueMetrics.totalCollected / revenueMetrics.totalInvoiced) * 100).toFixed(1) : 0}%`,
      '',
      'TIME METRICS',
      `Total Hours,${hoursMetrics.totalHours.toFixed(1)}`,
      `Billable Hours,${hoursMetrics.billableHours.toFixed(1)}`,
      `Utilization Rate,${hoursMetrics.utilizationRate.toFixed(1)}%`,
      `Effective Hourly Rate,$${additionalMetrics.effectiveRate.toFixed(2)}`,
      '',
      'MATTER METRICS',
      `Active Matters,${additionalMetrics.activeMatters}`,
      `Total Clients,${clients.length}`,
      `Avg Matter Value,$${additionalMetrics.avgMatterValue.toFixed(2)}`,
      `Realization Rate,${additionalMetrics.realizationRate.toFixed(1)}%`,
      '',
      'REVENUE BY PRACTICE AREA',
      ...revenueByPracticeArea.map((p: { name: string; value: number }) => `${p.name},$${p.value.toLocaleString()}`),
      '',
      'MONTHLY TREND',
      'Month,Invoiced,Collected',
      ...revenueTrend.map((m: { month: string; invoiced: number; collected: number }) => `${m.month},$${m.invoiced.toLocaleString()},$${m.collected.toLocaleString()}`)
    ]
    
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `firm-analytics-${reportDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isAdmin = user?.role === 'admin' || user?.role === 'owner'

  if (!isAdmin) {
    return (
      <div className={styles.noAccess}>
        <AlertTriangle size={48} />
        <h2>Access Denied</h2>
        <p>Only firm administrators can access analytics.</p>
      </div>
    )
  }

  return (
    <div className={styles.analyticsPage}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Firm Analytics</h1>
          <p>
            {analyticsLoading ? 'Loading firm data...' : 
             analytics ? 'Comprehensive firm-wide analytics' :
             'Revenue, productivity, and team performance insights'}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.exportBtn} 
            onClick={fetchAnalytics}
            disabled={analyticsLoading}
            style={{ marginRight: '8px' }}
          >
            <RefreshCw size={18} className={analyticsLoading ? styles.spinning : ''} />
            {analyticsLoading ? 'Loading...' : 'Refresh'}
          </button>
          <select 
            className={styles.dateFilter}
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
          >
            <option value="thisMonth">This Month</option>
            <option value="lastMonth">Last Month</option>
            <option value="last3Months">Last 3 Months</option>
            <option value="last6Months">Last 6 Months</option>
            <option value="thisYear">Year to Date</option>
            <option value="allTime">All Time</option>
          </select>
          <AIButton 
            context="Firm Analytics"
            label="AI Insights"
            prompts={[
              { label: 'Summary', prompt: 'Summarize performance' },
              { label: 'Trends', prompt: 'Identify trends' },
              { label: 'Recommendations', prompt: 'Provide recommendations' },
              { label: 'Forecast', prompt: 'Revenue forecast' }
            ]}
          />
          <button className={styles.exportBtn} onClick={exportReport}>
            <Download size={18} />
            Export
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {['overview', 'revenue', 'team', 'matters'].map(tab => (
          <button
            key={tab}
            className={`${styles.tab} ${selectedTab === tab ? styles.active : ''}`}
            onClick={() => setSelectedTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {selectedTab === 'overview' && (
        <>
          {/* No Data Warning */}
          {!analyticsLoading && revenueMetrics.totalInvoiced === 0 && hoursMetrics.totalHours === 0 && (
            <div style={{
              background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
              color: 'white',
              padding: '1.5rem',
              borderRadius: '12px',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '1rem'
            }}>
              <AlertTriangle size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ fontSize: '1.1rem' }}>No Data to Display</strong>
                <p style={{ margin: '0.5rem 0 0 0', opacity: 0.95 }}>
                  Analytics require <strong>time entries</strong> and <strong>invoices</strong> to calculate metrics. 
                  To see data here:
                </p>
                <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0 }}>
                  <li>Record billable time entries for matters</li>
                  <li>Create and send invoices to clients</li>
                  <li>Try changing the date range to "All Time"</li>
                </ul>
              </div>
            </div>
          )}

          {/* KPI Cards */}
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiIcon} style={{ background: 'rgba(212, 175, 55, 0.1)' }}>
                <DollarSign size={24} style={{ color: 'var(--gold-primary)' }} />
              </div>
              <div className={styles.kpiContent}>
                <span className={styles.kpiLabel}>Total Invoiced</span>
                <span className={styles.kpiValue}>${revenueMetrics.totalInvoiced.toLocaleString()}</span>
                <span className={`${styles.kpiChange} ${revenueMetrics.growthRate >= 0 ? styles.positive : styles.negative}`}>
                  {revenueMetrics.growthRate >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {Math.abs(revenueMetrics.growthRate).toFixed(1)}% vs last period
                </span>
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiIcon} style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                <CreditCard size={24} style={{ color: 'var(--success)' }} />
              </div>
              <div className={styles.kpiContent}>
                <span className={styles.kpiLabel}>Collected</span>
                <span className={styles.kpiValue}>${revenueMetrics.totalCollected.toLocaleString()}</span>
                <span className={styles.kpiSubtext}>
                  {revenueMetrics.totalInvoiced > 0 
                    ? `${((revenueMetrics.totalCollected / revenueMetrics.totalInvoiced) * 100).toFixed(0)}% collection rate`
                    : 'No invoices'
                  }
                </span>
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiIcon} style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
                <Clock size={24} style={{ color: 'var(--ai-purple)' }} />
              </div>
              <div className={styles.kpiContent}>
                <span className={styles.kpiLabel}>Billable Hours</span>
                <span className={styles.kpiValue}>{hoursMetrics.billableHours.toFixed(1)}h</span>
                <span className={styles.kpiSubtext}>
                  {hoursMetrics.utilizationRate.toFixed(0)}% utilization rate
                </span>
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiIcon} style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
                <AlertTriangle size={24} style={{ color: '#ef4444' }} />
              </div>
              <div className={styles.kpiContent}>
                <span className={styles.kpiLabel}>Outstanding</span>
                <span className={styles.kpiValue}>${revenueMetrics.outstanding.toLocaleString()}</span>
                <span className={styles.kpiSubtext}>
                  ${revenueMetrics.overdue.toLocaleString()} overdue
                </span>
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiIcon} style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
                <Target size={24} style={{ color: '#3B82F6' }} />
              </div>
              <div className={styles.kpiContent}>
                <span className={styles.kpiLabel}>Effective Rate</span>
                <span className={styles.kpiValue}>${additionalMetrics.effectiveRate.toFixed(0)}/hr</span>
                <span className={styles.kpiSubtext}>
                  Based on collected revenue
                </span>
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiIcon} style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                <Percent size={24} style={{ color: '#F59E0B' }} />
              </div>
              <div className={styles.kpiContent}>
                <span className={styles.kpiLabel}>Realization Rate</span>
                <span className={styles.kpiValue}>{additionalMetrics.realizationRate.toFixed(0)}%</span>
                <span className={styles.kpiSubtext}>
                  Collected vs billed
                </span>
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiIcon} style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                <Briefcase size={24} style={{ color: '#10B981' }} />
              </div>
              <div className={styles.kpiContent}>
                <span className={styles.kpiLabel}>Active Matters</span>
                <span className={styles.kpiValue}>{additionalMetrics.activeMatters}</span>
                <span className={styles.kpiSubtext}>
                  {clients.length} clients
                </span>
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiIcon} style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
                <TrendingUp size={24} style={{ color: '#8B5CF6' }} />
              </div>
              <div className={styles.kpiContent}>
                <span className={styles.kpiLabel}>Avg Matter Value</span>
                <span className={styles.kpiValue}>${additionalMetrics.avgMatterValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                <span className={styles.kpiSubtext}>
                  Per matter invoiced
                </span>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className={styles.chartsRow}>
            <div className={styles.chartCard}>
              <div className={styles.chartHeader}>
                <h3>Revenue Trend</h3>
                <span className={styles.chartSubtitle}>Last 6 months</span>
              </div>
              <div className={styles.chartBody}>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={revenueTrend}>
                    <defs>
                      <linearGradient id="invoicedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#D4AF37" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="collectedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                    <XAxis dataKey="month" stroke="var(--text-tertiary)" fontSize={12} />
                    <YAxis stroke="var(--text-tertiary)" fontSize={12} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip 
                      contentStyle={{ 
                        background: 'var(--bg-secondary)', 
                        border: '1px solid var(--border-primary)',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="invoiced" name="Invoiced" stroke="#D4AF37" fillOpacity={1} fill="url(#invoicedGradient)" />
                    <Area type="monotone" dataKey="collected" name="Collected" stroke="#10B981" fillOpacity={1} fill="url(#collectedGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.chartCard}>
              <div className={styles.chartHeader}>
                <h3>Revenue by Practice Area</h3>
                <AIButton context="Practice Area Revenue" variant="icon" size="sm" />
              </div>
              <div className={styles.chartBody}>
                <ResponsiveContainer width="100%" height={280}>
                  <RechartsPie>
                    <Pie
                      data={revenueByPracticeArea}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {revenueByPracticeArea.map((_entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                      contentStyle={{ 
                        background: 'var(--bg-secondary)', 
                        border: '1px solid var(--border-primary)',
                        borderRadius: '8px'
                      }}
                    />
                  </RechartsPie>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Production Value by Attorney - Uses billable time entries */}
          {attorneyProduction && (
            <div className={styles.chartsRow}>
              <div className={styles.chartCard} style={{ flex: 1 }}>
                <div className={styles.chartHeader}>
                  <h3>Production Value by Attorney</h3>
                  <span className={styles.chartSubtitle}>
                    Last 12 months • Total: ${attorneyProduction.summary?.total_production_value?.toLocaleString() || '0'}
                  </span>
                </div>
                <div className={styles.chartBody}>
                  <ResponsiveContainer width="100%" height={Math.max(300, attorneyProduction.by_attorney.length * 45)}>
                    <BarChart 
                      data={attorneyProduction.by_attorney} 
                      layout="vertical"
                      margin={{ left: 20, right: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                      <XAxis 
                        type="number" 
                        stroke="var(--text-tertiary)" 
                        fontSize={12} 
                        tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
                      />
                      <YAxis 
                        type="category" 
                        dataKey="name" 
                        stroke="var(--text-tertiary)" 
                        fontSize={12} 
                        width={140}
                        tick={{ fill: 'var(--text-secondary)' }}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          background: 'var(--bg-secondary)', 
                          border: '1px solid var(--border-primary)',
                          borderRadius: '8px'
                        }}
                        formatter={(value: number, name: string) => {
                          if (name === 'production_value') {
                            return [`$${value.toLocaleString()}`, 'Production Value']
                          }
                          return [value, name]
                        }}
                        labelFormatter={(label) => label}
                      />
                      <Bar 
                        dataKey="production_value" 
                        fill="#D4AF37" 
                        radius={[0, 4, 4, 0]}
                        name="Production Value"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ 
                  padding: '12px 16px', 
                  borderTop: '1px solid var(--border-primary)',
                  fontSize: '13px',
                  color: 'var(--text-secondary)'
                }}>
                  <strong>How it's calculated:</strong> Billable Hours × Hourly Rate = Production Value. 
                  Non-billable entries are excluded.
                </div>
              </div>
            </div>
          )}

        </>
      )}

      {selectedTab === 'revenue' && (
        <div className={styles.revenueTab}>
          <div className={styles.revenueCards}>
            <div className={styles.revenueCard}>
              <h4>Invoices Sent</h4>
              <span className={styles.bigNumber}>{invoices.filter(i => i.status === 'sent').length}</span>
              <p>${invoices.filter(i => i.status === 'sent').reduce((s, i) => s + i.total, 0).toLocaleString()}</p>
            </div>
            <div className={styles.revenueCard}>
              <h4>Invoices Paid</h4>
              <span className={styles.bigNumber}>{invoices.filter(i => i.status === 'paid').length}</span>
              <p>${invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0).toLocaleString()}</p>
            </div>
            <div className={styles.revenueCard}>
              <h4>Overdue</h4>
              <span className={`${styles.bigNumber} ${styles.danger}`}>{invoices.filter(i => i.status === 'overdue').length}</span>
              <p>${invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0).toLocaleString()}</p>
            </div>
          </div>

          <div className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <h3>Recent Invoices</h3>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Client</th>
                  <th>Issue Date</th>
                  <th>Due Date</th>
                  <th>Amount</th>
                  <th>Paid</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.slice(0, 10).map(inv => {
                  const client = clients.find(c => c.id === inv.clientId)
                  return (
                    <tr key={inv.id}>
                      <td>{inv.number}</td>
                      <td>{client?.name || 'Unknown'}</td>
                      <td>{format(parseISO(inv.issueDate), 'MMM d, yyyy')}</td>
                      <td>{format(parseISO(inv.dueDate), 'MMM d, yyyy')}</td>
                      <td>${inv.total.toLocaleString()}</td>
                      <td>${inv.amountPaid.toLocaleString()}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${styles[inv.status]}`}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedTab === 'team' && (
        <div className={styles.mattersTab}>
          {teamProductivity.length > 0 ? (
            <>
              <div className={styles.matterStats}>
                <div className={styles.matterStatCard}>
                  <Users size={24} />
                  <div>
                    <span className={styles.matterStatValue}>{teamProductivity.length}</span>
                    <span className={styles.matterStatLabel}>Active Team Members</span>
                  </div>
                </div>
                <div className={styles.matterStatCard}>
                  <Clock size={24} />
                  <div>
                    <span className={styles.matterStatValue}>
                      {teamProductivity.reduce((sum: number, t: any) => sum + t.billable_hours, 0).toFixed(1)}h
                    </span>
                    <span className={styles.matterStatLabel}>Total Billable Hours</span>
                  </div>
                </div>
                <div className={styles.matterStatCard}>
                  <DollarSign size={24} />
                  <div>
                    <span className={styles.matterStatValue}>
                      ${(teamProductivity.reduce((sum: number, t: any) => sum + t.billable_amount, 0) / 1000).toFixed(1)}k
                    </span>
                    <span className={styles.matterStatLabel}>Total Billable Revenue</span>
                  </div>
                </div>
              </div>

              <div className={styles.tableCard}>
                <div className={styles.tableHeader}>
                  <h3>Team Productivity Rankings</h3>
                  <AIButton context="Team Productivity" variant="icon" size="sm" />
                </div>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Team Member</th>
                      <th>Role</th>
                      <th>Billable Hours</th>
                      <th>Utilization</th>
                      <th>Revenue</th>
                      <th>Effective Rate</th>
                      <th>Matters</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamProductivity.map((member: any, index: number) => (
                      <tr key={member.id}>
                        <td>
                          <div className={styles.matterCell}>
                            <span className={styles.matterName}>
                              {index === 0 && '🥇 '}
                              {index === 1 && '🥈 '}
                              {index === 2 && '🥉 '}
                              {member.name}
                            </span>
                          </div>
                        </td>
                        <td>{member.role}</td>
                        <td>{member.billable_hours.toFixed(1)}h</td>
                        <td>
                          <span 
                            className={`${styles.statusBadge} ${member.utilization_rate >= 80 ? styles.active : member.utilization_rate >= 60 ? styles.pending : styles.closed}`}
                          >
                            {member.utilization_rate.toFixed(0)}%
                          </span>
                        </td>
                        <td className={styles.revenue}>${member.billable_amount.toLocaleString()}</td>
                        <td>
                          ${member.billable_hours > 0 
                            ? (member.billable_amount / member.billable_hours).toFixed(0) 
                            : 0}/hr
                        </td>
                        <td>{member.matter_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Team Hours Chart */}
              <div className={styles.chartsRow}>
                <div className={styles.chartCard} style={{ flex: 1 }}>
                  <div className={styles.chartHeader}>
                    <h3>Billable Hours by Team Member</h3>
                  </div>
                  <div className={styles.chartBody}>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={teamProductivity.slice(0, 10)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                        <XAxis type="number" stroke="var(--text-tertiary)" fontSize={12} />
                        <YAxis 
                          type="category" 
                          dataKey="name" 
                          stroke="var(--text-tertiary)" 
                          fontSize={12} 
                          width={120}
                          tick={{ fill: 'var(--text-secondary)' }}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            background: 'var(--bg-secondary)', 
                            border: '1px solid var(--border-primary)',
                            borderRadius: '8px'
                          }}
                          formatter={(value: number) => [`${value.toFixed(1)}h`, 'Hours']}
                        />
                        <Bar dataKey="billable_hours" fill="#D4AF37" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          ) : analyticsLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
              <RefreshCw size={32} className={styles.spinning} style={{ marginBottom: '16px' }} />
              <p>Loading team productivity data...</p>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
              <Users size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
              <h3>No Team Data Available</h3>
              <p>Team productivity data will appear here once time entries are recorded.</p>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'matters' && (
        <div className={styles.mattersTab}>
          <div className={styles.matterStats}>
            <div className={styles.matterStatCard}>
              <Briefcase size={24} />
              <div>
                <span className={styles.matterStatValue}>{analytics?.matters?.total || matters.length}</span>
                <span className={styles.matterStatLabel}>Total Matters</span>
              </div>
            </div>
            <div className={styles.matterStatCard}>
              <TrendingUp size={24} />
              <div>
                <span className={styles.matterStatValue}>{matters.filter(m => m.status === 'active').length}</span>
                <span className={styles.matterStatLabel}>Active</span>
              </div>
            </div>
            <div className={styles.matterStatCard}>
              <Users size={24} />
              <div>
                <span className={styles.matterStatValue}>{clients.length}</span>
                <span className={styles.matterStatLabel}>Clients</span>
              </div>
            </div>
          </div>

          <div className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <h3>Matters by Revenue</h3>
              <AIButton context="Matters Revenue" variant="icon" size="sm" />
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Matter</th>
                  <th>Client</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Hours</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {matters.map(matter => {
                  const client = clients.find(c => c.id === matter.clientId)
                  const matterEntries = timeEntries.filter(e => e.matterId === matter.id)
                  const hours = matterEntries.reduce((s, e) => s + e.hours, 0)
                  const revenue = matterEntries.filter(e => e.billable).reduce((s, e) => s + e.amount, 0)
                  
                  return (
                    <tr key={matter.id}>
                      <td>
                        <div className={styles.matterCell}>
                          <span className={styles.matterName}>{matter.name}</span>
                          <span className={styles.matterNumber}>{matter.number}</span>
                        </div>
                      </td>
                      <td>{client?.name || 'Unknown'}</td>
                      <td>{(matter.type || 'other').replace(/_/g, ' ')}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${styles[matter.status]}`}>
                          {matter.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>{hours.toFixed(1)}h</td>
                      <td className={styles.revenue}>${revenue.toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
