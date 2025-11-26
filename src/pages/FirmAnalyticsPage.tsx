import { useState, useMemo } from 'react'
import { useDataStore } from '../stores/dataStore'
import { useAuthStore } from '../stores/authStore'
import { 
  TrendingUp, DollarSign, Clock, Users, Calendar,
  Download, Filter, ChevronDown, Sparkles, BarChart3,
  ArrowUpRight, ArrowDownRight, Briefcase, CreditCard,
  PieChart, AlertTriangle
} from 'lucide-react'
import { format, parseISO, startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns'
import { AreaChart, Area, BarChart, Bar, PieChart as RechartsPie, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { AIButton } from '../components/AIButton'
import styles from './FirmAnalyticsPage.module.css'

// Demo team members
const teamMembers = [
  { id: 'user-1', name: 'John Mitchell', role: 'Managing Partner', rate: 550, avatar: 'JM' },
  { id: 'user-2', name: 'Sarah Chen', role: 'Partner', rate: 500, avatar: 'SC' },
  { id: 'user-3', name: 'Michael Roberts', role: 'Associate', rate: 350, avatar: 'MR' },
  { id: 'user-4', name: 'Emily Davis', role: 'Paralegal', rate: 150, avatar: 'ED' },
  { id: 'user-5', name: 'James Wilson', role: 'Associate', rate: 325, avatar: 'JW' },
  { id: 'user-6', name: 'Lisa Thompson', role: 'Legal Assistant', rate: 100, avatar: 'LT' }
]

const COLORS = ['#D4AF37', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444']

export function FirmAnalyticsPage() {
  const { timeEntries, invoices, matters, clients } = useDataStore()
  const { user } = useAuthStore()
  const [dateRange, setDateRange] = useState('thisMonth')
  const [selectedTab, setSelectedTab] = useState('overview')

  // Calculate date range
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

  // Revenue metrics
  const revenueMetrics = useMemo(() => {
    const filteredInvoices = invoices.filter(inv => {
      const date = parseISO(inv.issueDate)
      return isWithinInterval(date, dateFilter)
    })

    const totalInvoiced = filteredInvoices.reduce((sum, inv) => sum + inv.total, 0)
    const totalCollected = filteredInvoices.reduce((sum, inv) => sum + inv.amountPaid, 0)
    const outstanding = totalInvoiced - totalCollected
    const overdue = filteredInvoices.filter(inv => inv.status === 'overdue').reduce((sum, inv) => sum + (inv.total - inv.amountPaid), 0)

    // Simulated previous period for comparison
    const prevPeriodInvoiced = totalInvoiced * 0.85
    const growthRate = prevPeriodInvoiced > 0 ? ((totalInvoiced - prevPeriodInvoiced) / prevPeriodInvoiced) * 100 : 0

    return { totalInvoiced, totalCollected, outstanding, overdue, growthRate }
  }, [invoices, dateFilter])

  // Billable hours metrics
  const hoursMetrics = useMemo(() => {
    const filteredEntries = timeEntries.filter(entry => {
      const date = parseISO(entry.date)
      return isWithinInterval(date, dateFilter)
    })

    const totalHours = filteredEntries.reduce((sum, e) => sum + e.hours, 0)
    const billableHours = filteredEntries.filter(e => e.billable).reduce((sum, e) => sum + e.hours, 0)
    const billedAmount = filteredEntries.filter(e => e.billable).reduce((sum, e) => sum + e.amount, 0)
    const utilizationRate = totalHours > 0 ? (billableHours / totalHours) * 100 : 0

    return { totalHours, billableHours, billedAmount, utilizationRate }
  }, [timeEntries, dateFilter])

  // Team productivity
  const teamProductivity = useMemo(() => {
    return teamMembers.map(member => {
      const memberEntries = timeEntries.filter(e => {
        const date = parseISO(e.date)
        return e.userId === member.id && isWithinInterval(date, dateFilter)
      })
      
      const totalHours = memberEntries.reduce((sum, e) => sum + e.hours, 0)
      const billableHours = memberEntries.filter(e => e.billable).reduce((sum, e) => sum + e.hours, 0)
      const revenue = memberEntries.filter(e => e.billable).reduce((sum, e) => sum + e.amount, 0)
      const utilization = totalHours > 0 ? (billableHours / totalHours) * 100 : 0

      return {
        ...member,
        totalHours,
        billableHours,
        revenue,
        utilization
      }
    }).sort((a, b) => b.revenue - a.revenue)
  }, [timeEntries, dateFilter])

  // Revenue by practice area
  const revenueByPracticeArea = useMemo(() => {
    const practiceRevenue: Record<string, number> = {}
    
    timeEntries.forEach(entry => {
      const date = parseISO(entry.date)
      if (isWithinInterval(date, dateFilter) && entry.billable) {
        const matter = matters.find(m => m.id === entry.matterId)
        if (matter) {
          const type = matter.type.replace(/_/g, ' ')
          practiceRevenue[type] = (practiceRevenue[type] || 0) + entry.amount
        }
      }
    })

    return Object.entries(practiceRevenue)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [timeEntries, matters, dateFilter])

  // Monthly revenue trend (last 6 months)
  const revenueTrend = useMemo(() => {
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
        collected
      })
    }
    return months
  }, [invoices])

  // Export function
  const exportReport = () => {
    const data = teamProductivity.map(m => ({
      Name: m.name,
      Role: m.role,
      'Total Hours': m.totalHours.toFixed(1),
      'Billable Hours': m.billableHours.toFixed(1),
      'Utilization %': m.utilization.toFixed(0),
      'Revenue': m.revenue.toFixed(2)
    }))
    
    const headers = Object.keys(data[0]).join(',')
    const rows = data.map(row => Object.values(row).join(','))
    const csv = [headers, ...rows].join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `firm-analytics-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
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
          <p>Revenue, productivity, and team performance insights</p>
        </div>
        <div className={styles.headerActions}>
          <select 
            className={styles.dateFilter}
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
          >
            <option value="thisMonth">This Month</option>
            <option value="lastMonth">Last Month</option>
            <option value="last3Months">Last 3 Months</option>
            <option value="last6Months">Last 6 Months</option>
            <option value="thisYear">This Year</option>
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
                      {revenueByPracticeArea.map((entry, index) => (
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

          {/* Team Performance Table */}
          <div className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <h3>Team Performance</h3>
              <AIButton 
                context="Team Performance"
                label="AI Analyze"
                prompts={[
                  { label: 'Summary', prompt: 'Summarize team performance' },
                  { label: 'Top Performers', prompt: 'Identify top performers' },
                  { label: 'Improvements', prompt: 'Suggest improvements' }
                ]}
              />
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Team Member</th>
                  <th>Role</th>
                  <th>Total Hours</th>
                  <th>Billable Hours</th>
                  <th>Utilization</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {teamProductivity.map(member => (
                  <tr key={member.id}>
                    <td>
                      <div className={styles.memberCell}>
                        <div className={styles.memberAvatar}>{member.avatar}</div>
                        <span>{member.name}</span>
                      </div>
                    </td>
                    <td>{member.role}</td>
                    <td>{member.totalHours.toFixed(1)}h</td>
                    <td>{member.billableHours.toFixed(1)}h</td>
                    <td>
                      <div className={styles.utilizationBar}>
                        <div 
                          className={styles.utilizationFill}
                          style={{ 
                            width: `${Math.min(member.utilization, 100)}%`,
                            background: member.utilization >= 80 ? 'var(--success)' : member.utilization >= 60 ? 'var(--warning)' : '#ef4444'
                          }}
                        />
                        <span>{member.utilization.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className={styles.revenue}>${member.revenue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}><strong>Total</strong></td>
                  <td><strong>{teamProductivity.reduce((s, m) => s + m.totalHours, 0).toFixed(1)}h</strong></td>
                  <td><strong>{teamProductivity.reduce((s, m) => s + m.billableHours, 0).toFixed(1)}h</strong></td>
                  <td>
                    <strong>
                      {(teamProductivity.reduce((s, m) => s + m.billableHours, 0) / 
                        Math.max(teamProductivity.reduce((s, m) => s + m.totalHours, 0), 1) * 100).toFixed(0)}%
                    </strong>
                  </td>
                  <td className={styles.revenue}>
                    <strong>${teamProductivity.reduce((s, m) => s + m.revenue, 0).toLocaleString()}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
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
        <div className={styles.teamTab}>
          <div className={styles.teamGrid}>
            {teamProductivity.map(member => (
              <div key={member.id} className={styles.teamCard}>
                <div className={styles.teamCardHeader}>
                  <div className={styles.teamAvatar}>{member.avatar}</div>
                  <div>
                    <h4>{member.name}</h4>
                    <span>{member.role}</span>
                  </div>
                  <AIButton context={member.name} variant="icon" size="sm" />
                </div>
                <div className={styles.teamStats}>
                  <div className={styles.teamStat}>
                    <span className={styles.teamStatLabel}>Hours</span>
                    <span className={styles.teamStatValue}>{member.totalHours.toFixed(1)}h</span>
                  </div>
                  <div className={styles.teamStat}>
                    <span className={styles.teamStatLabel}>Billable</span>
                    <span className={styles.teamStatValue}>{member.billableHours.toFixed(1)}h</span>
                  </div>
                  <div className={styles.teamStat}>
                    <span className={styles.teamStatLabel}>Revenue</span>
                    <span className={styles.teamStatValue}>${member.revenue.toLocaleString()}</span>
                  </div>
                </div>
                <div className={styles.teamUtilization}>
                  <div className={styles.utilizationHeader}>
                    <span>Utilization</span>
                    <span>{member.utilization.toFixed(0)}%</span>
                  </div>
                  <div className={styles.utilizationTrack}>
                    <div 
                      className={styles.utilizationProgress}
                      style={{ 
                        width: `${Math.min(member.utilization, 100)}%`,
                        background: member.utilization >= 80 ? 'var(--success)' : member.utilization >= 60 ? 'var(--warning)' : '#ef4444'
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedTab === 'matters' && (
        <div className={styles.mattersTab}>
          <div className={styles.matterStats}>
            <div className={styles.matterStatCard}>
              <Briefcase size={24} />
              <div>
                <span className={styles.matterStatValue}>{matters.length}</span>
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
                      <td>{matter.type.replace(/_/g, ' ')}</td>
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
