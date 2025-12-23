import { Link } from 'react-router-dom'
import { ArrowLeft, Book, FileText, Video, HelpCircle, Zap, Users, DollarSign, Calendar, ChevronRight } from 'lucide-react'
import styles from './PublicPages.module.css'

export function DocsPage() {
  const sections = [
    {
      title: "Getting Started",
      icon: Zap,
      articles: [
        "Quick Start Guide",
        "Setting Up Your Firm",
        "Inviting Team Members",
        "Configuring Billing Rates",
        "Importing Existing Data"
      ]
    },
    {
      title: "Matter Management",
      icon: FileText,
      articles: [
        "Creating Matters",
        "Matter Workflows",
        "Custom Fields",
        "Document Management",
        "Matter Permissions"
      ]
    },
    {
      title: "Time & Billing",
      icon: DollarSign,
      articles: [
        "Time Tracking Basics",
        "Creating Invoices",
        "Payment Processing",
        "Trust Accounting",
        "Expense Tracking"
      ]
    },
    {
      title: "Calendar & Tasks",
      icon: Calendar,
      articles: [
        "Calendar Overview",
        "Deadline Management",
        "Court Rules Integration",
        "Task Assignments",
        "Calendar Sync"
      ]
    },
    {
      title: "Client Portal",
      icon: Users,
      articles: [
        "Portal Setup",
        "Client Access Levels",
        "Document Sharing",
        "Secure Messaging",
        "Invoice Viewing"
      ]
    },
    {
      title: "AI Features",
      icon: Zap,
      articles: [
        "AI Assistant Overview",
        "Legal Research",
        "Document Analysis",
        "Time Entry Suggestions",
        "AI Configuration"
      ]
    }
  ]

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navContent}>
          <Link to="/" className={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 28H4L16 4Z" fill="url(#docsGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
              <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
              <defs>
                <linearGradient id="docsGrad" x1="16" y1="4" x2="16" y2="28">
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
        <h1>Documentation</h1>
        <p>Everything you need to get the most out of Apex.</p>
      </header>

      <div className={styles.content}>
        <div className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.cardIcon}><Book size={24} /></div>
            <h3>User Guide</h3>
            <p>Comprehensive documentation covering all features and workflows in Apex.</p>
          </div>
          <div className={styles.card}>
            <div className={styles.cardIcon}><Video size={24} /></div>
            <h3>Video Tutorials</h3>
            <p>Step-by-step video guides to help you master every aspect of the platform.</p>
          </div>
          <div className={styles.card}>
            <div className={styles.cardIcon}><HelpCircle size={24} /></div>
            <h3>FAQ</h3>
            <p>Quick answers to the most commonly asked questions about Apex.</p>
          </div>
          <div className={styles.card}>
            <div className={styles.cardIcon}><Zap size={24} /></div>
            <h3>Best Practices</h3>
            <p>Tips and strategies to maximize efficiency and get the best results.</p>
          </div>
        </div>

        {sections.map((section, i) => (
          <section key={i} className={styles.section}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <section.icon size={24} style={{ color: 'var(--apex-gold-bright)' }} />
              {section.title}
            </h2>
            <ul className={styles.featureList}>
              {section.articles.map((article, j) => (
                <li key={j} style={{ cursor: 'pointer' }}>
                  <FileText size={18} />
                  <span style={{ flex: 1 }}>{article}</span>
                  <ChevronRight size={18} style={{ color: 'var(--apex-muted)' }} />
                </li>
              ))}
            </ul>
          </section>
        ))}
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
