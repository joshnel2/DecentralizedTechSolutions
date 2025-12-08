import { Link } from 'react-router-dom'
import { ArrowLeft, Code, Key, Webhook, FileJson, Lock, Zap } from 'lucide-react'
import styles from './PublicPages.module.css'

export function APIReferencePage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navContent}>
          <Link to="/" className={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 28H4L16 4Z" fill="url(#apiGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
              <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
              <defs>
                <linearGradient id="apiGrad" x1="16" y1="4" x2="16" y2="28">
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
        <h1>API Reference</h1>
        <p>Build custom integrations with the Apex REST API.</p>
      </header>

      <div className={styles.content}>
        <section className={styles.section}>
          <h2>Overview</h2>
          <p>
            The Apex API provides programmatic access to your firm's data, allowing you to build custom 
            integrations, automate workflows, and connect with other systems in your tech stack.
          </p>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Code size={24} /></div>
              <h3>RESTful API</h3>
              <p>Standard REST architecture with JSON request and response bodies.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Lock size={24} /></div>
              <h3>OAuth 2.0</h3>
              <p>Secure authentication using industry-standard OAuth 2.0 protocol.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Webhook size={24} /></div>
              <h3>Webhooks</h3>
              <p>Real-time notifications when events occur in your Apex account.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Zap size={24} /></div>
              <h3>Rate Limiting</h3>
              <p>Generous rate limits with clear headers indicating your usage.</p>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Authentication</h2>
          <p>
            All API requests require authentication using an API key or OAuth 2.0 access token. 
            Include your credentials in the Authorization header:
          </p>
          <div className={styles.card} style={{ background: 'var(--apex-slate)', fontFamily: 'monospace', fontSize: '0.875rem' }}>
            <code style={{ color: 'var(--apex-gold-bright)' }}>
              Authorization: Bearer YOUR_API_KEY
            </code>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Available Endpoints</h2>
          <ul className={styles.featureList}>
            <li>
              <FileJson size={20} />
              <div>
                <strong>Matters</strong>
                <p>Create, read, update, and delete matters. Manage matter assignments and permissions.</p>
              </div>
            </li>
            <li>
              <FileJson size={20} />
              <div>
                <strong>Clients</strong>
                <p>Manage client records, contact information, and associated matters.</p>
              </div>
            </li>
            <li>
              <FileJson size={20} />
              <div>
                <strong>Time Entries</strong>
                <p>Log time, retrieve time entries, and manage billing status.</p>
              </div>
            </li>
            <li>
              <FileJson size={20} />
              <div>
                <strong>Invoices</strong>
                <p>Generate invoices, track payments, and manage billing workflows.</p>
              </div>
            </li>
            <li>
              <FileJson size={20} />
              <div>
                <strong>Documents</strong>
                <p>Upload, download, and manage documents associated with matters.</p>
              </div>
            </li>
            <li>
              <FileJson size={20} />
              <div>
                <strong>Calendar</strong>
                <p>Create and manage calendar events, deadlines, and reminders.</p>
              </div>
            </li>
            <li>
              <FileJson size={20} />
              <div>
                <strong>Users</strong>
                <p>Manage team members, roles, and permissions (admin only).</p>
              </div>
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Example Request</h2>
          <div className={styles.card} style={{ background: 'var(--apex-slate)', fontFamily: 'monospace', fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
            <code style={{ color: 'var(--apex-light)' }}>
{`curl -X GET "https://api.apexlegal.com/v1/matters" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`}
            </code>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Getting Started</h2>
          <ol>
            <li>Sign up for an Apex account and navigate to Settings → API Keys</li>
            <li>Generate a new API key with appropriate permissions</li>
            <li>Include the API key in your request headers</li>
            <li>Start making API calls to integrate with your systems</li>
          </ol>
          <p>
            Full API documentation with request/response examples is available to authenticated users 
            in the <Link to="/login">API section</Link> of your Apex dashboard.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Enterprise API Access</h2>
          <p>
            Enterprise customers receive enhanced API access including higher rate limits, 
            dedicated support, and custom endpoint development. <Link to="/contact">Contact sales</Link> to 
            learn more about enterprise API options.
          </p>
        </section>
      </div>

      <footer className={styles.footer}>
        <p>© 2025 Apex Legal Technologies. All rights reserved.</p>
        <Link to="/" className={styles.backLink}>
          <ArrowLeft size={16} /> Back to Home
        </Link>
      </footer>
    </div>
  )
}
