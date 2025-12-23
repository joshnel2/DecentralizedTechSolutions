import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import styles from './PublicPages.module.css'

export function StatusPage() {
  const services = [
    { name: "Web Application", status: "operational" },
    { name: "API", status: "operational" },
    { name: "Database", status: "operational" },
    { name: "Document Storage", status: "operational" },
    { name: "AI Services", status: "operational" },
    { name: "Email Delivery", status: "operational" },
    { name: "Payment Processing", status: "operational" },
    { name: "Calendar Sync", status: "operational" }
  ]

  const incidents = [
    {
      date: "December 5, 2025",
      title: "Scheduled Maintenance Completed",
      status: "resolved",
      description: "Database optimization completed successfully. No user impact."
    },
    {
      date: "November 28, 2025",
      title: "Brief API Latency",
      status: "resolved",
      description: "Some users experienced increased API response times for approximately 15 minutes. Issue identified and resolved."
    }
  ]

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navContent}>
          <Link to="/" className={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 28H4L16 4Z" fill="url(#statusGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
              <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
              <defs>
                <linearGradient id="statusGrad" x1="16" y1="4" x2="16" y2="28">
                  <stop stopColor="#FBBF24"/>
                  <stop offset="1" stopColor="#F59E0B"/>
                </linearGradient>
              </defs>
            </svg>
            <span>Apex</span>
          </Link>
          <div className={styles.navActions}>
            <Link to="/login" className={styles.loginLink}>Sign In</Link>
            <Link to="/register" className={styles.ctaBtn}>Get Started</Link>
          </div>
        </div>
      </nav>

      <header className={styles.header}>
        <h1>System Status</h1>
        <p>Current status of Apex services and recent incidents.</p>
      </header>

      <div className={styles.content}>
        <section className={styles.section}>
          <div className={styles.card} style={{ textAlign: 'center', padding: '2rem', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
            <CheckCircle size={48} style={{ color: 'var(--apex-success)', marginBottom: '1rem' }} />
            <h2 style={{ color: 'var(--apex-success)', marginBottom: '0.5rem', borderBottom: 'none', paddingBottom: 0 }}>All Systems Operational</h2>
            <p style={{ margin: 0 }}>Last updated: {new Date().toLocaleString()}</p>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Service Status</h2>
          <div className={styles.statusGrid}>
            {services.map((service, i) => (
              <div key={i} className={styles.statusItem}>
                <span className={styles.name}>{service.name}</span>
                <span className={styles.statusBadge}>
                  <CheckCircle size={14} /> Operational
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2>Uptime (Last 90 Days)</h2>
          <div className={styles.grid}>
            <div className={styles.card} style={{ textAlign: 'center' }}>
              <h3 style={{ fontSize: '2.5rem', color: 'var(--apex-success)', marginBottom: '0.5rem' }}>99.98%</h3>
              <p style={{ margin: 0 }}>Web Application</p>
            </div>
            <div className={styles.card} style={{ textAlign: 'center' }}>
              <h3 style={{ fontSize: '2.5rem', color: 'var(--apex-success)', marginBottom: '0.5rem' }}>99.99%</h3>
              <p style={{ margin: 0 }}>API</p>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Recent Incidents</h2>
          {incidents.map((incident, i) => (
            <div key={i} className={styles.card} style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0 }}>{incident.title}</h3>
                <span className={styles.statusBadge}>
                  <CheckCircle size={14} /> Resolved
                </span>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--apex-muted)', marginBottom: '0.5rem' }}>{incident.date}</p>
              <p style={{ margin: 0 }}>{incident.description}</p>
            </div>
          ))}
        </section>

        <section className={styles.section}>
          <h2>Scheduled Maintenance</h2>
          <div className={styles.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <Clock size={20} style={{ color: 'var(--apex-gold-bright)' }} />
              <h3 style={{ margin: 0 }}>No Scheduled Maintenance</h3>
            </div>
            <p style={{ margin: 0 }}>
              There is no scheduled maintenance at this time. We typically schedule maintenance windows 
              on weekends during low-usage hours and provide at least 72 hours notice.
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Subscribe to Updates</h2>
          <p>
            Get notified about service incidents and scheduled maintenance via email.
          </p>
          <form className={styles.contactForm} style={{ maxWidth: 400 }} onSubmit={(e) => e.preventDefault()}>
            <div className={styles.formGroup}>
              <input type="email" placeholder="your@email.com" />
            </div>
            <button type="submit" className={styles.submitBtn}>Subscribe to Updates</button>
          </form>
        </section>
      </div>

      <footer className={styles.footer}>
        <p>© 2025 Strapped AI LLC. All rights reserved.</p>
        <Link to="/" className={styles.backLink}>
          <ArrowLeft size={16} /> Back to Home
        </Link>
      </footer>
    </div>
  )
}
