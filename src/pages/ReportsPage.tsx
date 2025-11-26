import { useState, useMemo } from 'react'
import { useDataStore } from '../stores/dataStore'
import { 
  TrendingUp, DollarSign, Clock, Users, Briefcase,
  Download, Calendar, FileText, CheckCircle2
} from 'lucide-react'
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell
} from 'recharts'
import styles from './ReportsPage.module.css'

const COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#EC4899']

export function ReportsPage() {
  const { matters, clients, timeEntries, invoices, expenses } = useDataStore()
  const [exportMessage, setExportMessage] = useState<string | null>(null)

  // CSV Export Functions
  const exportToCSV = (data: any[], filename: string, headers: string[]) => {
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h.toLowerCase().replace(/ /g, '')] ?? row[h] ?? ''
        // Escape commas and quotes
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`
        }
        return val
      }).join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    
    setExportMessage(`${filename}.csv exported successfully!`)
    setTimeout(() => setExportMessage(null), 3000)
  }

  const exportMatters = () => {
    const data = matters.map(m => ({
      Number: m.number,
      Name: m.name,
      Client: clients.find(c => c.id === m.clientId)?.name || '',
      Type: m.type.replace(/_/g, ' '),
      Status: m.status.replace(/_/g, ' '),
      'Open Date': m.openDate.split('T')[0],
      'Billing Type': m.billingType,
      Priority: m.priority
    }))
    exportToCSV(data, 'matters_report', ['Number', 'Name', 'Client', 'Type', 'Status', 'Open Date', 'Billing Type', 'Priority'])
  }

  const exportClients = () => {
    const data = clients.map(c => ({
      Name: c.name,
      Type: c.type,
      Email: c.email,
      Phone: c.phone,
      City: c.city,
      State: c.state,
      Status: c.status,
      'Matters Count': matters.filter(m => m.clientId === c.id).length
    }))
    exportToCSV(data, 'clients_report', ['Name', 'Type', 'Email', 'Phone', 'City', 'State', 'Status', 'Matters Count'])
  }

  const exportBilling = () => {
    const data = invoices.map(i => ({
      'Invoice #': i.number,
      Client: clients.find(c => c.id === i.clientId)?.name || '',
      Matter: matters.find(m => m.id === i.matterId)?.name || '',
      'Issue Date': i.issueDate.split('T')[0],
      'Due Date': i.dueDate.split('T')[0],
      Total: i.total,
      Paid: i.amountPaid,
      Status: i.status
    }))
    exportToCSV(data, 'billing_report', ['Invoice #', 'Client', 'Matter', 'Issue Date', 'Due Date', 'Total', 'Paid', 'Status'])
  }

  const exportTimeEntries = () => {
    const data = timeEntries.map(t => ({
      Date: t.date.split('T')[0],
      Matter: matters.find(m => m.id === t.matterId)?.name || '',
      Description: t.description,
      Hours: t.hours,
      Rate: t.rate,
      Amount: t.amount,
      Billable: t.billable ? 'Yes' : 'No',
      Billed: t.billed ? 'Yes' : 'No'
    }))
    exportToCSV(data, 'time_entries_report', ['Date', 'Matter', 'Description', 'Hours', 'Rate', 'Amount', 'Billable', 'Billed'])
  }

  const exportProductivity = () => {
    const byMatter = matters.map(m => {
      const entries = timeEntries.filter(t => t.matterId === m.id)
      const totalHours = entries.reduce((sum, e) => sum + e.hours, 0)
      const billableHours = entries.filter(e => e.billable).reduce((sum, e) => sum + e.hours, 0)
      const revenue = entries.reduce((sum, e) => sum + e.amount, 0)
      return {
        Matter: m.name,
        'Matter Number': m.number,
        'Total Hours': totalHours.toFixed(1),
        'Billable Hours': billableHours.toFixed(1),
        'Utilization %': totalHours > 0 ? ((billableHours / totalHours) * 100).toFixed(1) : '0',
        Revenue: revenue
      }
    })
    exportToCSV(byMatter, 'productivity_report', ['Matter', 'Matter Number', 'Total Hours', 'Billable Hours', 'Utilization %', 'Revenue'])
  }

  const exportAging = () => {
    const outstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').map(i => {
      const daysOld = Math.floor((Date.now() - new Date(i.issueDate).getTime()) / (1000 * 60 * 60 * 24))
      return {
        'Invoice #': i.number,
        Client: clients.find(c => c.id === i.clientId)?.name || '',
        'Issue Date': i.issueDate.split('T')[0],
        'Due Date': i.dueDate.split('T')[0],
        'Days Outstanding': daysOld,
        Amount: i.total - i.amountPaid,
        'Aging Bucket': daysOld <= 30 ? '0-30 days' : daysOld <= 60 ? '31-60 days' : daysOld <= 90 ? '61-90 days' : '90+ days'
      }
    })
    exportToCSV(outstanding, 'aging_report', ['Invoice #', 'Client', 'Issue Date', 'Due Date', 'Days Outstanding', 'Amount', 'Aging Bucket'])
  }

  const handleRunReport = (reportType: string) => {
    switch(reportType) {
      case 'Billing Summary': exportBilling(); break
      case 'Timekeeper Report': exportTimeEntries(); break
      case 'Matter Status': exportMatters(); break
      case 'Client Report': exportClients(); break
      case 'Aging Report': exportAging(); break
      case 'Productivity': exportProductivity(); break
    }
  }

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
        <div className={styles.headerRight}>
          {exportMessage && (
            <span className={styles.exportSuccess}>
              <CheckCircle2 size={16} />
              {exportMessage}
            </span>
          )}
          <button className={styles.exportBtn} onClick={exportBilling}>
            <Download size={18} />
            Export All
          </button>
        </div>
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
        <p className={styles.reportHint}>Click "Run" to export CSV report</p>
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
              <button 
                className={styles.runBtn}
                onClick={() => handleRunReport(report.title)}
              >
                <Download size={12} />
                CSV
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
