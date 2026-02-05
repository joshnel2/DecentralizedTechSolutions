import { Link } from 'react-router-dom'
import { ArrowLeft, Calendar, CreditCard, Cloud, FileText, Users, Zap } from 'lucide-react'
import styles from './PublicPages.module.css'

export function IntegrationsPublicPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navContent}>
          <Link to="/" className={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 28H4L16 4Z" fill="url(#intGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
              <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
              <defs>
                <linearGradient id="intGrad" x1="16" y1="4" x2="16" y2="28">
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
        <h1>Integrations</h1>
        <p>Connect Apex with the tools your firm already uses for a seamless workflow.</p>
      </header>

      <div className={styles.content}>
        <section className={styles.section}>
          <h2>Calendar & Email</h2>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Calendar size={24} /></div>
              <h3>Microsoft 365</h3>
              <p>Sync calendars, contacts, and emails with Outlook. Access documents from OneDrive and SharePoint.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Calendar size={24} /></div>
              <h3>Google Workspace</h3>
              <p>Connect Google Calendar, Gmail, and Google Drive for seamless collaboration.</p>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Payments & Billing</h2>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardIcon}><CreditCard size={24} /></div>
              <h3>Stripe</h3>
              <p>Accept credit card payments online with automatic reconciliation and trust accounting support.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><CreditCard size={24} /></div>
              <h3>LawPay</h3>
              <p>Legal-specific payment processing with IOLTA compliance built-in.</p>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Document Management</h2>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Cloud size={24} /></div>
              <h3>Dropbox</h3>
              <p>Access and organize matter documents stored in Dropbox directly from Apex.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Cloud size={24} /></div>
              <h3>Box</h3>
              <p>Enterprise document management with advanced security and compliance features.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><FileText size={24} /></div>
              <h3>NetDocuments</h3>
              <p>Deep integration with NetDocuments for firms using their DMS platform.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><FileText size={24} /></div>
              <h3>iManage</h3>
              <p>Connect with iManage Work for enterprise document and email management.</p>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Accounting</h2>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardIcon}><CreditCard size={24} /></div>
              <h3>QuickBooks</h3>
              <p>Two-way sync with QuickBooks Online for seamless financial management.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><CreditCard size={24} /></div>
              <h3>Xero</h3>
              <p>Connect with Xero for international accounting and invoicing workflows.</p>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Communication</h2>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Users size={24} /></div>
              <h3>Microsoft Teams</h3>
              <p>Collaborate on matters and receive notifications directly in Teams.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Users size={24} /></div>
              <h3>Slack</h3>
              <p>Get matter updates and deadline reminders in your Slack channels.</p>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>API Access</h2>
          <div className={styles.card}>
            <div className={styles.cardIcon}><Zap size={24} /></div>
            <h3>REST API</h3>
            <p>
              Build custom integrations with our comprehensive REST API. Full documentation, 
              webhooks, and developer support available for enterprise customers.
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Request an Integration</h2>
          <p>
            Don't see the integration you need? <Link to="/contact">Contact us</Link> to request 
            new integrations or discuss custom development options for your firm.
          </p>
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
