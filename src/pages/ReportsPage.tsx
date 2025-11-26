import { useMemo } from 'react'
import { useDataStore } from '../stores/dataStore'
import { 
  BarChart3, TrendingUp, DollarSign, Clock, Users, Briefcase,
  Download, Calendar, FileText
} from 'lucide-react'
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell
} from 'recharts'
import styles from './ReportsPage.module.css'

const COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#EC4899']

export function ReportsPage() {
  const { matters, clients, timeEntries, invoices } = useDataStore()

  const revenueByMonth = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return months.map((month, i) => ({
      month,
      revenue: Math.round(40000 + Math.random() * 50000),
      collected: Math.round(35000 + Math.random() * 40000)
    }))
  }, [])

  const mattersByType = useMemo(() => {
    const counts: Record<string, number> = {}
    matters.forEach(m => {
      const type = m.type.replace(/_/g, ' ')
      counts[type] = (counts[type] || 0) + 1
    })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [matters])

  const hoursByMatter = useMemo(() => {
    const hours: Record<string, number> = {}
    timeEntries.forEach(t => {
      const matter = matters.find(m => m.id === t.matterId)
      if (matter) {
        hours[matter.name] = (hours[matter.name] || 0) + t.hours
      }
    })
    return Object.entries(hours)
      .map(([name, hours]) => ({ name: name.slice(0, 20), hours }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 8)
  }, [timeEntries, matters])

  const utilizationRate = useMemo(() => {
    const totalHours = timeEntries.reduce((sum, t) => sum + t.hours, 0)
    const billableHours = timeEntries.filter(t => t.billable).reduce((sum, t) => sum + t.hours, 0)
    return totalHours > 0 ? (billableHours / totalHours * 100).toFixed(1) : 0
  }, [timeEntries])

  const totalRevenue = invoices.reduce((sum, i) => sum + i.total, 0)
  const totalCollected = invoices.reduce((sum, i) => sum + i.amountPaid, 0)
  const activeMatters = matters.filter(m => m.status === 'active').length

  return (
    <div className={styles.reportsPage}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Reports & Analytics</h1>
        </div>
        <button className={styles.exportBtn}>
          <Download size={18} />
          Export Report
        </button>
      </div>

      {/* KPI Cards */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B' }}>
            <DollarSign size={24} />
          </div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiValue}>${(totalRevenue / 1000).toFixed(0)}k</span>
            <span className={styles.kpiLabel}>Total Revenue</span>
            <span className={styles.kpiChange}>+12.5% from last period</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>
            <TrendingUp size={24} />
          </div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiValue}>${(totalCollected / 1000).toFixed(0)}k</span>
            <span className={styles.kpiLabel}>Collected</span>
            <span className={styles.kpiChange}>+8.3% from last period</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' }}>
            <Clock size={24} />
          </div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiValue}>{utilizationRate}%</span>
            <span className={styles.kpiLabel}>Utilization Rate</span>
            <span className={styles.kpiChange}>Target: 80%</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8B5CF6' }}>
            <Briefcase size={24} />
          </div>
          <div className={styles.kpiContent}>
            <span className={styles.kpiValue}>{activeMatters}</span>
            <span className={styles.kpiLabel}>Active Matters</span>
            <span className={styles.kpiChange}>{clients.length} clients</span>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className={styles.chartsRow}>
        <div className={styles.chartCard}>
          <h3>Revenue Overview</h3>
          <div className={styles.chartContainer}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={revenueByMonth}>
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
                />
                <Bar dataKey="revenue" fill="#F59E0B" radius={[4, 4, 0, 0]} name="Billed" />
                <Bar dataKey="collected" fill="#10B981" radius={[4, 4, 0, 0]} name="Collected" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.chartCard}>
          <h3>Matters by Practice Area</h3>
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

      {/* Hours by Matter */}
      <div className={styles.chartCard}>
        <h3>Hours by Matter</h3>
        <div className={styles.chartContainer}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={hoursByMatter} layout="vertical">
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
                width={150}
              />
              <Tooltip 
                contentStyle={{
                  background: '#1E293B',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#F1F5F9'
                }}
                formatter={(value: number) => [`${value.toFixed(1)} hours`, 'Hours']}
              />
              <Bar dataKey="hours" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quick Reports */}
      <div className={styles.quickReports}>
        <h3>Quick Reports</h3>
        <div className={styles.reportCards}>
          {[
            { icon: DollarSign, title: 'Billing Summary', desc: 'Monthly billing and collections' },
            { icon: Clock, title: 'Timekeeper Report', desc: 'Hours by attorney and staff' },
            { icon: Briefcase, title: 'Matter Status', desc: 'Active matters summary' },
            { icon: Users, title: 'Client Report', desc: 'Client activity and billing' },
            { icon: Calendar, title: 'Aging Report', desc: 'Outstanding receivables aging' },
            { icon: FileText, title: 'Productivity', desc: 'Utilization and efficiency' }
          ].map(report => (
            <div key={report.title} className={styles.reportCard}>
              <div className={styles.reportIcon}>
                <report.icon size={20} />
              </div>
              <div className={styles.reportInfo}>
                <span className={styles.reportTitle}>{report.title}</span>
                <span className={styles.reportDesc}>{report.desc}</span>
              </div>
              <button className={styles.runBtn}>Run</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
