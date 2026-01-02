import { useMemo, useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useDataStore } from '../stores/dataStore'
import { useAIChat } from '../contexts/AIChatContext'
import { useTimer, formatElapsedTime, secondsToHours } from '../contexts/TimerContext'
import { analyticsApi } from '../services/api'
import { 
  Briefcase, Users, Clock, DollarSign, Calendar, TrendingUp,
  AlertCircle, ArrowRight, Sparkles, FileText, CheckCircle2,
  Play, Pause, StopCircle, X, Save, Target, Percent, ArrowUpRight, ArrowDownRight
} from 'lucide-react'
import { format, isAfter, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { parseAsLocalDate } from '../utils/dateUtils'
import { 
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import styles from './DashboardPage.module.css'

const COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444']

// Analytics data type
interface DashboardAnalytics {
  summary: {
    total_hours: number;
    billable_hours: number;
    non_billable_hours: number;
    total_amount: number;
    billable_amount: number;
    billed_amount: number;
    unbilled_amount: number;
    entry_count: number;
    days_with_entries: number;
  };
  productivity: {
    utilization_rate: number;
    realization_rate: number;
    effective_hourly_rate: number;
    standard_rate: number;
  };
  targets: {
    monthly_target_hours: number;
    current_progress_percent: number;
    hours_remaining: number;
    on_track: boolean;
  };
  comparison: {
    firm_avg_billable_hours: number;
    vs_avg_percent: number;
    rank_estimate: string;
  };
  unbilled: {
    hours: number;
    amount: number;
    entries: number;
    oldest_date: string;
  };
  monthly_trend: Array<{
    month: string;
    total_hours: number;
    billable_hours: number;
    billable_amount: number;
  }>;
  daily_activity: Array<{
    date: string;
    hours: number;
    amount: number;
  }>;
  matters_workload: Array<{
    id: string;
    name: string;
    number: string;
    client_name: string;
    total_hours: number;
    total_amount: number;
  }>;
  top_clients: Array<{
    id: string;
    name: string;
    total_hours: number;
    total_amount: number;
    matter_count: number;
  }>;
}

export function DashboardPage() {
  const { user } = useAuthStore()
  const { matters, clients, timeEntries, invoices, events, fetchMatters, fetchClients, fetchTimeEntries, fetchInvoices, fetchEvents, addTimeEntry } = useDataStore()
  const { openChat } = useAIChat()
  const { timer, startTimer: globalStartTimer, pauseTimer, resumeTimer, stopTimer, discardTimer } = useTimer()
  
  // Timer selection state
  const [selectedMatterId, setSelectedMatterId] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [showSaveTimerModal, setShowSaveTimerModal] = useState(false)
  
  // Analytics state - fetched from backend for accurate data including migrations
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)

  // Filter matters based on selected client
  const filteredMatters = useMemo(() => {
    if (!selectedClientId) return matters.filter(m => m.status === 'active')
    return matters.filter(m => m.status === 'active' && m.clientId === selectedClientId)
  }, [matters, selectedClientId])

  const handleStartTimer = () => {
    const matter = selectedMatterId ? matters.find(m => m.id === selectedMatterId) : null
    const client = selectedClientId ? clients.find(c => c.id === selectedClientId) : null
    
    globalStartTimer({ 
      matterId: selectedMatterId || undefined, 
      matterName: matter?.name,
      clientId: selectedClientId || undefined,
      clientName: client?.name || client?.displayName
    })
  }

  const handleStopTimer = () => {
    stopTimer()
    setShowSaveTimerModal(true)
  }

  // Fetch analytics from backend - includes ALL data (migrated entries, etc.)
  const fetchAnalytics = useCallback(async () => {
    try {
      setAnalyticsLoading(true)
      setAnalyticsError(null)
      const response = await analyticsApi.getMyDashboard('current_month')
      if (response.success) {
        setAnalytics(response.data)
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
      setAnalyticsError('Failed to load analytics')
    } finally {
      setAnalyticsLoading(false)
    }
  }, [])

  // Fetch all data when component mounts
  useEffect(() => {
    fetchClients()
    fetchMatters()
    fetchTimeEntries({ limit: 500 })
    fetchInvoices()
    fetchEvents({})
    fetchAnalytics()
  }, [fetchAnalytics])

  // Use analytics data if available, otherwise fallback to local store
  const stats = useMemo(() => {
    // If we have backend analytics, use those (includes migrated data)
    if (analytics) {
      const activeMatters = matters.filter(m => m.status === 'active').length
      const totalClients = clients.filter(c => c.isActive).length
      
      const outstandingAmount = invoices
        .filter(i => i.status === 'sent' || i.status === 'overdue')
        .reduce((sum, i) => sum + (i.total - i.amountPaid), 0)

      const now = new Date()
      const upcomingDeadlines = events.filter(e => {
        const eventDate = parseISO(e.startTime)
        return isAfter(eventDate, now) && e.type === 'deadline'
      }).length

      return {
        activeMatters,
        totalClients,
        billableHours: analytics.summary.billable_hours,
        monthlyRevenue: analytics.summary.billable_amount,
        outstandingAmount,
        upcomingDeadlines,
        // Additional analytics-powered stats
        utilizationRate: analytics.productivity.utilization_rate,
        effectiveRate: analytics.productivity.effective_hourly_rate,
        targetProgress: analytics.targets.current_progress_percent,
        unbilledAmount: analytics.unbilled.amount,
        hoursRemaining: analytics.targets.hours_remaining,
        vsAverage: analytics.comparison.vs_avg_percent,
        rankEstimate: analytics.comparison.rank_estimate
      }
    }

    // Fallback to local store calculations
    const now = new Date()
    const monthStart = startOfMonth(now)
    const monthEnd = endOfMonth(now)

    const activeMatters = matters.filter(m => m.status === 'active').length
    const totalClients = clients.filter(c => c.isActive).length
    
    const monthlyEntries = timeEntries.filter(t => {
      const date = parseAsLocalDate(t.date)
      return date >= monthStart && date <= monthEnd
    })
    const billableHours = monthlyEntries.filter(t => t.billable).reduce((sum, t) => sum + t.hours, 0)
    const monthlyRevenue = monthlyEntries.reduce((sum, t) => sum + t.amount, 0)
    
    const outstandingAmount = invoices
      .filter(i => i.status === 'sent' || i.status === 'overdue')
      .reduce((sum, i) => sum + (i.total - i.amountPaid), 0)

    const upcomingDeadlines = events.filter(e => {
      const eventDate = parseISO(e.startTime)
      return isAfter(eventDate, now) && e.type === 'deadline'
    }).length

    return {
      activeMatters,
      totalClients,
      billableHours,
      monthlyRevenue,
      outstandingAmount,
      upcomingDeadlines,
      utilizationRate: 0,
      effectiveRate: 0,
      targetProgress: 0,
      unbilledAmount: 0,
      hoursRemaining: 0,
      vsAverage: 0,
      rankEstimate: ''
    }
  }, [matters, clients, timeEntries, invoices, events, analytics])

  const recentMatters = useMemo(() => {
    return [...matters]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
  }, [matters])

  const upcomingEvents = useMemo(() => {
    const now = new Date()
    return events
      .filter(e => isAfter(parseISO(e.startTime), now))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, 5)
  }, [events])

  const mattersByType = useMemo(() => {
    const counts: Record<string, number> = {}
    matters.forEach(m => {
      counts[m.type] = (counts[m.type] || 0) + 1
    })
    return Object.entries(counts)
      .map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
  }, [matters])

  // Use analytics trend data if available, otherwise compute from local store
  const revenueData = useMemo(() => {
    // If we have analytics trend data, use it (12 months from backend)
    if (analytics?.monthly_trend && analytics.monthly_trend.length > 0) {
      return analytics.monthly_trend.map(m => ({
        month: format(new Date(m.month), 'MMM'),
        revenue: Math.round(m.billable_amount),
        hours: Math.round(m.billable_hours)
      })).reverse().slice(-12)
    }

    // Fallback to local store calculations
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const currentYear = new Date().getFullYear()
    
    return months.map((month, i) => {
      const monthEntries = timeEntries.filter(t => {
        const date = parseAsLocalDate(t.date)
        return date.getMonth() === i && date.getFullYear() === currentYear
      })
      
      const revenue = monthEntries.reduce((sum, t) => sum + (t.amount || 0), 0)
      const hours = monthEntries.reduce((sum, t) => sum + (t.hours || 0), 0)
      
      return { month, revenue: Math.round(revenue), hours: Math.round(hours) }
    })
  }, [timeEntries, analytics])
  
  // Calculate real growth percentage
  const revenueGrowth = useMemo(() => {
    const currentMonth = new Date().getMonth()
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1
    
    const currentRev = revenueData[currentMonth]?.revenue || 0
    const prevRev = revenueData[prevMonth]?.revenue || 0
    
    if (prevRev === 0) return currentRev > 0 ? 100 : 0
    return ((currentRev - prevRev) / prevRev) * 100
  }, [revenueData])

  const pendingInvoices = useMemo(() => {
    return invoices
      .filter(i => i.status === 'sent' || i.status === 'overdue')
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 4)
  }, [invoices])

  return (
    <div className={styles.dashboard}>
      {/* Welcome Section */}
      <section className={styles.welcome}>
        <div>
          <h1 className={styles.greeting}>
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.firstName}
          </h1>
          <p className={styles.date}>{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <button onClick={() => openChat({
          label: 'Dashboard',
          contextType: 'dashboard',
          suggestedQuestions: [
            'Give me a summary of my practice today',
            'What matters need my attention this week?',
            'Analyze my billing and collection trends',
            'What deadlines are coming up?',
            'Summarize my workload by client'
          ]
        })} className={styles.aiPrompt}>
          <Sparkles size={20} />
          <span>Ask AI Assistant</span>
          <ArrowRight size={16} />
        </button>
      </section>

      {/* Stats Grid */}
      <section className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>
            <Clock size={22} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{stats.billableHours.toFixed(1)}</span>
            <span className={styles.statLabel}>Billable Hours (MTD)</span>
            {analytics && (
              <span className={styles.statSubtext}>
                {stats.hoursRemaining.toFixed(1)}h to target
              </span>
            )}
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8B5CF6' }}>
            <DollarSign size={22} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>${(stats.monthlyRevenue / 1000).toFixed(1)}k</span>
            <span className={styles.statLabel}>Billable Revenue (MTD)</span>
          </div>
        </div>

        {analytics && (
          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' }}>
              <Target size={22} />
            </div>
            <div className={styles.statContent}>
              <span className={styles.statValue}>{stats.targetProgress.toFixed(0)}%</span>
              <span className={styles.statLabel}>Monthly Target</span>
              <span className={styles.statSubtext}>
                {stats.targetProgress >= 100 ? '✓ Goal reached' : `${(160 - stats.billableHours).toFixed(0)}h remaining`}
              </span>
            </div>
          </div>
        )}

        {analytics && (
          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B' }}>
              <Percent size={22} />
            </div>
            <div className={styles.statContent}>
              <span className={styles.statValue}>{stats.utilizationRate.toFixed(0)}%</span>
              <span className={styles.statLabel}>Utilization Rate</span>
              <span className={styles.statSubtext}>
                Billable / Total hours
              </span>
            </div>
          </div>
        )}

        {analytics && (
          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: stats.vsAverage >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: stats.vsAverage >= 0 ? '#10B981' : '#EF4444' }}>
              <TrendingUp size={22} style={{ transform: stats.vsAverage < 0 ? 'rotate(180deg)' : 'none' }} />
            </div>
            <div className={styles.statContent}>
              <span className={styles.statValue}>
                {stats.vsAverage >= 0 ? '+' : ''}{stats.vsAverage.toFixed(0)}%
              </span>
              <span className={styles.statLabel}>vs Firm Average</span>
              <span className={styles.statSubtext}>{stats.rankEstimate}</span>
            </div>
          </div>
        )}

        {analytics && stats.unbilledAmount > 0 && (
          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }}>
              <AlertCircle size={22} />
            </div>
            <div className={styles.statContent}>
              <span className={styles.statValue}>${(stats.unbilledAmount / 1000).toFixed(1)}k</span>
              <span className={styles.statLabel}>Unbilled Time</span>
              <span className={styles.statSubtext}>Ready to invoice</span>
            </div>
          </div>
        )}

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B' }}>
            <Briefcase size={22} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{stats.activeMatters}</span>
            <span className={styles.statLabel}>Active Matters</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' }}>
            <Users size={22} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{stats.totalClients}</span>
            <span className={styles.statLabel}>Active Clients</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>
            <Calendar size={22} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{stats.upcomingDeadlines}</span>
            <span className={styles.statLabel}>Upcoming Deadlines</span>
          </div>
        </div>
      </section>

      {/* Quick Timer Section */}
      <section className={styles.timerSection}>
        {timer.isRunning || timer.elapsed > 0 ? (
          <div className={styles.activeTimer}>
            <div className={styles.activeTimerInfo}>
              <div className={styles.timerPulse}>
                <Clock size={20} />
              </div>
              <div className={styles.timerDetails}>
                <span className={styles.timerMatterName}>
                  {timer.matterName || 'General Time'}
                  {timer.clientName && <span className={styles.timerClientName}> • {timer.clientName}</span>}
                </span>
                <span className={styles.timerElapsed}>{formatElapsedTime(timer.elapsed)}</span>
              </div>
            </div>
            <div className={styles.timerActions}>
              {timer.isPaused ? (
                <button onClick={resumeTimer} className={styles.resumeBtn}>
                  <Play size={18} />
                  Resume
                </button>
              ) : timer.isRunning ? (
                <button onClick={pauseTimer} className={styles.pauseBtn}>
                  <Pause size={18} />
                  Pause
                </button>
              ) : null}
              <button onClick={handleStopTimer} className={styles.stopBtn} title="Stop & Save">
                <StopCircle size={18} />
                Stop
              </button>
              <button onClick={discardTimer} className={styles.discardBtn} title="Discard">
                <X size={18} />
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.quickTimer}>
            <div className={styles.quickTimerHeader}>
              <Clock size={16} />
              <h3>Quick Timer</h3>
            </div>
            <div className={styles.timerSelects}>
              <select 
                value={selectedClientId} 
                onChange={(e) => {
                  setSelectedClientId(e.target.value)
                  setSelectedMatterId('') // Reset matter when client changes
                }}
                className={styles.timerSelect}
              >
                <option value="">All Clients</option>
                {clients.filter(c => c.isActive).map(c => (
                  <option key={c.id} value={c.id}>{c.name || c.displayName}</option>
                ))}
              </select>
              <select 
                value={selectedMatterId} 
                onChange={(e) => setSelectedMatterId(e.target.value)}
                className={styles.timerSelect}
              >
                <option value="">No matter (general time)</option>
                {filteredMatters.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <button className={styles.startTimerBtn} onClick={handleStartTimer}>
                <Play size={14} />
                Start
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Save Timer Modal */}
      {showSaveTimerModal && (
        <SaveTimerModal
          timer={timer}
          matters={matters}
          clients={clients}
          onClose={() => {
            setShowSaveTimerModal(false)
            discardTimer()
          }}
          onSave={async (data) => {
            try {
              await addTimeEntry(data)
              setShowSaveTimerModal(false)
              discardTimer()
              await fetchTimeEntries({ limit: 500 })
            } catch (error) {
              console.error('Failed to save time entry:', error)
              alert('Failed to save time entry. Please try again.')
            }
          }}
        />
      )}

      {/* Charts Row */}
      <section className={styles.chartsRow}>
        <div className={styles.chartCard}>
          <div className={styles.cardHeader}>
            <h3>Revenue & Hours</h3>
            {revenueGrowth !== 0 && (
              <div className={styles.cardBadge} style={{ color: revenueGrowth >= 0 ? '#10B981' : '#EF4444' }}>
                <TrendingUp size={14} style={{ transform: revenueGrowth < 0 ? 'rotate(180deg)' : 'none' }} />
                {revenueGrowth >= 0 ? '+' : ''}{revenueGrowth.toFixed(1)}%
              </div>
            )}
          </div>
          <div className={styles.chartContainer}>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
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
                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#F59E0B" 
                  strokeWidth={2}
                  fill="url(#revenueGradient)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.cardHeader}>
            <h3>Matters by Type</h3>
          </div>
          <div className={styles.pieChartContainer}>
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
                  <span 
                    className={styles.legendDot} 
                    style={{ background: COLORS[index % COLORS.length] }}
                  />
                  <span className={styles.legendLabel}>{item.name}</span>
                  <span className={styles.legendValue}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Row */}
      <section className={styles.bottomRow}>
        {/* Recent Matters */}
        <div className={styles.listCard}>
          <div className={styles.cardHeader}>
            <h3>Recent Matters</h3>
              <Link to="/app/matters" className={styles.viewAll}>View all</Link>
          </div>
          <div className={styles.listContent}>
            {recentMatters.map(matter => (
              <Link 
                key={matter.id} 
                to={`/app/matters/${matter.id}`} 
                className={styles.listItem}
              >
                <div className={styles.listItemIcon}>
                  <Briefcase size={16} />
                </div>
                <div className={styles.listItemContent}>
                  <span className={styles.listItemTitle}>{matter.name}</span>
                  <span className={styles.listItemMeta}>
                    {matter.number} · {clients.find(c => c.id === matter.clientId)?.name}
                  </span>
                </div>
                <span className={`${styles.statusBadge} ${styles[matter.status]}`}>
                  {matter.status.replace('_', ' ')}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Upcoming Events */}
        <div className={styles.listCard}>
          <div className={styles.cardHeader}>
            <h3>Upcoming Events</h3>
            <Link to="/app/calendar" className={styles.viewAll}>View all</Link>
          </div>
          <div className={styles.listContent}>
            {upcomingEvents.map(event => (
              <div key={event.id} className={styles.eventItem}>
                <div 
                  className={styles.eventDate}
                  style={{ borderColor: event.color }}
                >
                  <span className={styles.eventMonth}>
                    {format(parseISO(event.startTime), 'MMM')}
                  </span>
                  <span className={styles.eventDay}>
                    {format(parseISO(event.startTime), 'd')}
                  </span>
                </div>
                <div className={styles.listItemContent}>
                  <span className={styles.listItemTitle}>{event.title}</span>
                  <span className={styles.listItemMeta}>
                    {format(parseISO(event.startTime), 'h:mm a')}
                    {event.location && ` · ${event.location}`}
                  </span>
                </div>
                <span 
                  className={styles.eventType}
                  style={{ 
                    background: `${event.color}20`,
                    color: event.color 
                  }}
                >
                  {event.type.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Pending Invoices */}
        <div className={styles.listCard}>
          <div className={styles.cardHeader}>
            <h3>Pending Invoices</h3>
            <Link to="/app/billing" className={styles.viewAll}>View all</Link>
          </div>
          <div className={styles.listContent}>
            {pendingInvoices.map(invoice => (
              <div key={invoice.id} className={styles.invoiceItem}>
                <div className={styles.listItemIcon}>
                  <FileText size={16} />
                </div>
                <div className={styles.listItemContent}>
                  <span className={styles.listItemTitle}>{invoice.number}</span>
                  <span className={styles.listItemMeta}>
                    Due {format(parseISO(invoice.dueDate), 'MMM d, yyyy')}
                  </span>
                </div>
                <div className={styles.invoiceAmount}>
                  <span className={styles.amount}>${invoice.total.toLocaleString()}</span>
                  <span className={`${styles.invoiceStatus} ${styles[invoice.status]}`}>
                    {invoice.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Insights Banner */}
      <section className={styles.aiBanner}>
        <div className={styles.aiBannerContent}>
          <div className={styles.aiBannerIcon}>
            <Sparkles size={24} />
          </div>
          <div>
            <h3>AI-Powered Insights Available</h3>
            <p>Get intelligent analysis of your matters, billing trends, and upcoming deadlines.</p>
          </div>
        </div>
        <button onClick={() => openChat({
          label: 'AI Insights',
          contextType: 'dashboard',
          suggestedQuestions: [
            'Analyze my practice performance this month',
            'What are my biggest opportunities for growth?',
            'Which clients generate the most revenue?',
            'Identify any at-risk matters',
            'Suggest ways to improve efficiency'
          ]
        })} className={styles.aiBannerBtn}>
          Open AI Assistant
          <ArrowRight size={16} />
        </button>
      </section>
    </div>
  )
}

// Save Timer Modal - Save stopped timer as time entry
function SaveTimerModal({ timer, matters, clients, onClose, onSave }: {
  timer: any
  matters: any[]
  clients: any[]
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const hours = secondsToHours(timer.elapsed)
  const matter = timer.matterId ? matters.find((m: any) => m.id === timer.matterId) : null
  
  const [formData, setFormData] = useState({
    matterId: timer.matterId || '',
    date: format(new Date(), 'yyyy-MM-dd'),
    hours: Math.max(0.01, hours),
    description: '',
    billable: true,
    rate: matter?.billingRate || 450
  })

  // Convert date string to ISO format preserving the local date
  const dateToISO = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day, 12, 0, 0)
    return date.toISOString()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSave({
        ...formData,
        matterId: formData.matterId || undefined,
        date: dateToISO(formData.date),
        billed: false,
        aiGenerated: false
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Get client name for the selected matter
  const selectedMatter = formData.matterId ? matters.find(m => m.id === formData.matterId) : null
  const selectedClient = selectedMatter ? clients.find(c => c.id === selectedMatter.clientId) : null

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>
            <Save size={20} />
            Save Time Entry
          </h2>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.timerSummary}>
            <div className={styles.timerSummaryItem}>
              <Clock size={16} />
              <span>Timer: {formatElapsedTime(timer.elapsed)}</span>
            </div>
            {timer.matterName && (
              <div className={styles.timerSummaryItem}>
                <span>Matter: {timer.matterName}</span>
              </div>
            )}
            {timer.clientName && (
              <div className={styles.timerSummaryItem}>
                <span>Client: {timer.clientName}</span>
              </div>
            )}
          </div>

          <div className={styles.formGroup}>
            <label>Matter (optional)</label>
            <select
              value={formData.matterId}
              onChange={(e) => {
                const selectedM = matters.find((m: any) => m.id === e.target.value)
                setFormData({
                  ...formData, 
                  matterId: e.target.value,
                  rate: selectedM?.billingRate || 450
                })
              }}
            >
              <option value="">No matter selected</option>
              {matters.filter(m => m.status === 'active').map((m: any) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {selectedClient && (
            <div className={styles.clientInfo}>
              <Users size={14} />
              <span>Client: {selectedClient.name || selectedClient.displayName}</span>
            </div>
          )}

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Hours</label>
              <input
                type="number"
                value={formData.hours}
                onChange={(e) => setFormData({...formData, hours: parseFloat(e.target.value)})}
                min="0.01"
                step="0.01"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Describe the work performed..."
              rows={3}
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Rate ($/hr)</label>
              <input
                type="number"
                value={formData.rate}
                onChange={(e) => setFormData({...formData, rate: parseInt(e.target.value)})}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Billable</label>
              <select
                value={formData.billable ? 'yes' : 'no'}
                onChange={(e) => setFormData({...formData, billable: e.target.value === 'yes'})}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div className={styles.entryTotal}>
            Total: ${(formData.hours * formData.rate).toLocaleString()}
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={isSubmitting}>
              Discard
            </button>
            <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
