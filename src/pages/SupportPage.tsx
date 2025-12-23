import { Link } from 'react-router-dom'
import { ArrowLeft, MessageCircle, Mail, Phone, Book, Video, HelpCircle, Clock, Headphones } from 'lucide-react'
import styles from './PublicPages.module.css'

export function SupportPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navContent}>
          <Link to="/" className={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 28H4L16 4Z" fill="url(#supportGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
              <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
              <defs>
                <linearGradient id="supportGrad" x1="16" y1="4" x2="16" y2="28">
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
        <h1>Support</h1>
        <p>We're here to help you succeed with Apex.</p>
      </header>

      <div className={styles.content}>
        <section className={styles.section}>
          <h2>Get Help</h2>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardIcon}><MessageCircle size={24} /></div>
              <h3>Live Chat</h3>
              <p>Chat with our support team in real-time. Available Monday-Friday, 9am-6pm PT.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Mail size={24} /></div>
              <h3>Email Support</h3>
              <p>Send us an email at support@strapped.ai. We respond within 24 hours.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Phone size={24} /></div>
              <h3>Phone Support</h3>
              <p>Call us at (555) 123-4568. Enterprise customers have 24/7 phone access.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Headphones size={24} /></div>
              <h3>Schedule a Call</h3>
              <p>Book a one-on-one session with a product specialist for personalized help.</p>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Self-Service Resources</h2>
          <ul className={styles.featureList}>
            <li>
              <Book size={20} />
              <div>
                <strong>Documentation</strong>
                <p>Comprehensive guides covering all Apex features and workflows.</p>
                <Link to="/docs" style={{ color: 'var(--apex-gold-bright)', fontSize: '0.875rem' }}>Browse docs →</Link>
              </div>
            </li>
            <li>
              <Video size={20} />
              <div>
                <strong>Video Tutorials</strong>
                <p>Step-by-step video guides to help you master the platform.</p>
              </div>
            </li>
            <li>
              <HelpCircle size={20} />
              <div>
                <strong>Knowledge Base</strong>
                <p>Searchable articles answering common questions and troubleshooting issues.</p>
              </div>
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Support Plans</h2>
          <div className={styles.grid}>
            <div className={styles.card}>
              <h3>Standard Support</h3>
              <p style={{ color: 'var(--apex-gold-bright)', marginBottom: '1rem' }}>Included with all plans</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                <li style={{ padding: '0.5rem 0', color: 'var(--apex-text)', fontSize: '0.9375rem' }}>✓ Email support (24hr response)</li>
                <li style={{ padding: '0.5rem 0', color: 'var(--apex-text)', fontSize: '0.9375rem' }}>✓ Live chat (business hours)</li>
                <li style={{ padding: '0.5rem 0', color: 'var(--apex-text)', fontSize: '0.9375rem' }}>✓ Documentation access</li>
                <li style={{ padding: '0.5rem 0', color: 'var(--apex-text)', fontSize: '0.9375rem' }}>✓ Video tutorials</li>
              </ul>
            </div>
            <div className={styles.card}>
              <h3>Enterprise Support</h3>
              <p style={{ color: 'var(--apex-gold-bright)', marginBottom: '1rem' }}>For Enterprise plans</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                <li style={{ padding: '0.5rem 0', color: 'var(--apex-text)', fontSize: '0.9375rem' }}>✓ 24/7 phone support</li>
                <li style={{ padding: '0.5rem 0', color: 'var(--apex-text)', fontSize: '0.9375rem' }}>✓ Dedicated account manager</li>
                <li style={{ padding: '0.5rem 0', color: 'var(--apex-text)', fontSize: '0.9375rem' }}>✓ Priority ticket handling</li>
                <li style={{ padding: '0.5rem 0', color: 'var(--apex-text)', fontSize: '0.9375rem' }}>✓ Custom training sessions</li>
                <li style={{ padding: '0.5rem 0', color: 'var(--apex-text)', fontSize: '0.9375rem' }}>✓ Quarterly business reviews</li>
              </ul>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Training & Onboarding</h2>
          <p>
            All new Apex customers receive complimentary onboarding assistance to help you get up and 
            running quickly. Our training includes:
          </p>
          <ul>
            <li>Initial setup and configuration</li>
            <li>Data migration assistance</li>
            <li>Team training sessions</li>
            <li>Best practices guidance</li>
            <li>30-day check-in call</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Response Times</h2>
          <div className={styles.statusGrid}>
            <div className={styles.statusItem}>
              <span className={styles.name}>Critical Issues (System Down)</span>
              <span className={styles.statusBadge}><Clock size={14} /> 1 Hour</span>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.name}>High Priority</span>
              <span className={styles.statusBadge}><Clock size={14} /> 4 Hours</span>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.name}>Standard Requests</span>
              <span className={styles.statusBadge}><Clock size={14} /> 24 Hours</span>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.name}>Feature Requests</span>
              <span className={styles.statusBadge}><Clock size={14} /> 48 Hours</span>
            </div>
          </div>
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
