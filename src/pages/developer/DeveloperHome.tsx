import { Link } from 'react-router-dom'
import { Rocket, Code, Shield, Key, Zap, Book, FileText, Users } from 'lucide-react'
import styles from './DeveloperPortal.module.css'

export function DeveloperHome() {
  return (
    <div className={styles.docPage}>
      <header className={styles.docHeader}>
        <h1>Apex Developer Platform</h1>
        <p>
          Build powerful integrations with the Apex Legal Practice Management API. 
          Access matters, clients, time entries, invoices, documents, and more.
        </p>
      </header>

      <section className={styles.docSection}>
        <h2>Quick Start</h2>
        <p>
          Get up and running with the Apex API in minutes. Create an API key, make your first 
          request, and start building your integration.
        </p>

        <div className={styles.cardGrid}>
          <Link to="/developer/getting-started" className={styles.card}>
            <div className={styles.cardIcon}>
              <Rocket size={24} />
            </div>
            <h3>Getting Started</h3>
            <p>Learn the basics of the Apex API and make your first request</p>
          </Link>

          <Link to="/developer/authentication" className={styles.card}>
            <div className={styles.cardIcon}>
              <Shield size={24} />
            </div>
            <h3>Authentication</h3>
            <p>Secure your API requests with API keys</p>
          </Link>

          <Link to="/developer/api-reference" className={styles.card}>
            <div className={styles.cardIcon}>
              <Code size={24} />
            </div>
            <h3>API Reference</h3>
            <p>Complete documentation for all API endpoints</p>
          </Link>

          <Link to="/developer/apps" className={styles.card}>
            <div className={styles.cardIcon}>
              <Key size={24} />
            </div>
            <h3>Create an App</h3>
            <p>Generate API keys and manage your applications</p>
          </Link>
        </div>
      </section>

      <section className={styles.docSection}>
        <h2>What You Can Build</h2>
        <p>
          The Apex API gives you access to all the data and functionality you need to build 
          integrations, automate workflows, and extend your practice management system.
        </p>

        <div className={styles.cardGrid}>
          <div className={styles.card}>
            <div className={styles.cardIcon}>
              <FileText size={24} />
            </div>
            <h3>Document Automation</h3>
            <p>Generate documents, sync files, and automate document workflows</p>
          </div>

          <div className={styles.card}>
            <div className={styles.cardIcon}>
              <Users size={24} />
            </div>
            <h3>Client Portals</h3>
            <p>Build custom client-facing applications with matter and document access</p>
          </div>

          <div className={styles.card}>
            <div className={styles.cardIcon}>
              <Zap size={24} />
            </div>
            <h3>Workflow Automation</h3>
            <p>Connect Apex to other tools and automate repetitive tasks</p>
          </div>

          <div className={styles.card}>
            <div className={styles.cardIcon}>
              <Book size={24} />
            </div>
            <h3>Reporting & Analytics</h3>
            <p>Extract data for custom reports and business intelligence</p>
          </div>
        </div>
      </section>

      <section className={styles.docSection}>
        <h2>API Overview</h2>
        <p>
          The Apex API is a RESTful API that uses JSON for request and response bodies. 
          All API requests must be authenticated using an API key.
        </p>

        <h3>Base URL</h3>
        <div className={styles.codeBlock}>
          <pre><code>https://your-firm.apexlegal.app/api</code></pre>
        </div>

        <h3>Available Resources</h3>
        <ul>
          <li><strong>Matters</strong> - Cases, projects, and legal matters</li>
          <li><strong>Clients</strong> - Individual and organization contacts</li>
          <li><strong>Time Entries</strong> - Billable and non-billable time records</li>
          <li><strong>Invoices</strong> - Bills and payment tracking</li>
          <li><strong>Calendar Events</strong> - Appointments, deadlines, and reminders</li>
          <li><strong>Documents</strong> - File storage and document management</li>
          <li><strong>Users</strong> - Team members and their permissions</li>
        </ul>
      </section>

      <section className={styles.docSection}>
        <h2>Need Help?</h2>
        <p>
          We're here to help you build great integrations. If you have questions or need 
          assistance, reach out to our developer support team.
        </p>
        <p>
          <a href="mailto:developers@apexlegal.app" style={{ color: 'var(--apex-gold)' }}>
            developers@apexlegal.app
          </a>
        </p>
      </section>
    </div>
  )
}
