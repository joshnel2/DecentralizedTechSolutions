import { useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useDataStore } from '../stores/dataStore'
import { 
  Briefcase, Users, Clock, DollarSign, Calendar, TrendingUp,
  AlertCircle, ArrowRight, Sparkles, FileText, CheckCircle2
} from 'lucide-react'
import { format, isAfter, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import styles from './DashboardPage.module.css'

const COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444']

export function DashboardPage() {
  const { user } = useAuthStore()
  const { matters, clients, timeEntries, invoices, events, fetchMatters, fetchClients, fetchTimeEntries, fetchInvoices, fetchEvents } = useDataStore()

  // Fetch all data when component mounts
  useEffect(() => {
    fetchClients()
    fetchMatters()
    fetchTimeEntries({})
    fetchInvoices()
    fetchEvents({})
  }, [])

  const stats = useMemo(() => {
    const now = new Date()
    const monthStart = startOfMonth(now)
    const monthEnd = endOfMonth(now)

    const activeMatters = matters.filter(m => m.status === 'active').length
    const totalClients = clients.filter(c => c.isActive).length
    
    const monthlyEntries = timeEntries.filter(t => {
      const date = parseISO(t.date)
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
      upcomingDeadlines
    }
  }, [matters, clients, timeEntries, invoices, events])

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

  const revenueData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return months.map((month, i) => ({
      month,
      revenue: Math.round(50000 + Math.random() * 40000),
      hours: Math.round(80 + Math.random() * 60)
    }))
  }, [])

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
        <Link to="/app/ai" className={styles.aiPrompt}>
          <Sparkles size={20} />
          <span>Ask AI Assistant</span>
          <ArrowRight size={16} />
        </Link>
      </section>

      {/* Stats Grid */}
      <section className={styles.statsGrid}>
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
            <Clock size={22} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{stats.billableHours.toFixed(1)}</span>
            <span className={styles.statLabel}>Billable Hours (MTD)</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8B5CF6' }}>
            <DollarSign size={22} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>${(stats.monthlyRevenue / 1000).toFixed(1)}k</span>
            <span className={styles.statLabel}>Revenue (MTD)</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }}>
            <AlertCircle size={22} />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>${(stats.outstandingAmount / 1000).toFixed(1)}k</span>
            <span className={styles.statLabel}>Outstanding</span>
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

      {/* Charts Row */}
      <section className={styles.chartsRow}>
        <div className={styles.chartCard}>
          <div className={styles.cardHeader}>
            <h3>Revenue & Hours</h3>
            <div className={styles.cardBadge}>
              <TrendingUp size={14} />
              +12.5%
            </div>
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
        <Link to="/app/ai" className={styles.aiBannerBtn}>
          Open AI Assistant
          <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  )
}
