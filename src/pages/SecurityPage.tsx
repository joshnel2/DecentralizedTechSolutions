import { Link } from 'react-router-dom'
import { ArrowLeft, Shield, Lock, Server, Eye, Key, CheckCircle } from 'lucide-react'
import styles from './PublicPages.module.css'

export function SecurityPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navContent}>
          <Link to="/" className={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 28H4L16 4Z" fill="url(#secGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
              <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
              <defs>
                <linearGradient id="secGrad" x1="16" y1="4" x2="16" y2="28">
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
        <h1>Security at Apex</h1>
        <p>Your data security is our top priority. Learn about the measures we take to protect your firm's sensitive information.</p>
      </header>

      <div className={styles.content}>
        <section className={styles.section}>
          <h2>Enterprise-Grade Security</h2>
          <p>
            Apex is built on Microsoft Azure's enterprise infrastructure, providing the same level of security 
            trusted by Fortune 500 companies and government agencies worldwide.
          </p>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Shield size={24} /></div>
              <h3>SOC 2 Type II Certified</h3>
              <p>Our infrastructure meets rigorous security, availability, and confidentiality standards.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Lock size={24} /></div>
              <h3>HIPAA Compliant</h3>
              <p>Safe for handling healthcare-related legal matters and protected health information.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Server size={24} /></div>
              <h3>Data Encryption</h3>
              <p>AES-256 encryption at rest and TLS 1.3 for all data in transit.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Eye size={24} /></div>
              <h3>Access Controls</h3>
              <p>Role-based permissions ensure users only access what they need.</p>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Data Protection</h2>
          <ul className={styles.featureList}>
            <li>
              <CheckCircle size={20} />
              <div>
                <strong>Encryption at Rest</strong>
                <p>All stored data is encrypted using AES-256, the same standard used by banks and government agencies.</p>
              </div>
            </li>
            <li>
              <CheckCircle size={20} />
              <div>
                <strong>Encryption in Transit</strong>
                <p>All data transmitted between your browser and our servers uses TLS 1.3 encryption.</p>
              </div>
            </li>
            <li>
              <CheckCircle size={20} />
              <div>
                <strong>Secure Backups</strong>
                <p>Automated daily backups with point-in-time recovery capabilities and geo-redundant storage.</p>
              </div>
            </li>
            <li>
              <CheckCircle size={20} />
              <div>
                <strong>Data Isolation</strong>
                <p>Each firm's data is logically isolated to prevent any cross-tenant access.</p>
              </div>
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Authentication & Access</h2>
          <ul className={styles.featureList}>
            <li>
              <Key size={20} />
              <div>
                <strong>Two-Factor Authentication</strong>
                <p>Optional 2FA adds an extra layer of security to all user accounts.</p>
              </div>
            </li>
            <li>
              <Key size={20} />
              <div>
                <strong>Single Sign-On (SSO)</strong>
                <p>Enterprise SSO integration with major identity providers including Azure AD, Okta, and Google.</p>
              </div>
            </li>
            <li>
              <Key size={20} />
              <div>
                <strong>Session Management</strong>
                <p>Automatic session timeouts and the ability to remotely terminate active sessions.</p>
              </div>
            </li>
            <li>
              <Key size={20} />
              <div>
                <strong>Audit Logging</strong>
                <p>Comprehensive audit trails of all user actions for compliance and security monitoring.</p>
              </div>
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>AI Security</h2>
          <p>
            Our AI features are powered by Azure OpenAI, which provides enterprise-grade security for AI workloads:
          </p>
          <ul className={styles.featureList}>
            <li>
              <CheckCircle size={20} />
              <div>
                <strong>Data Privacy</strong>
                <p>Your data is never used to train AI models. Your prompts and documents remain confidential.</p>
              </div>
            </li>
            <li>
              <CheckCircle size={20} />
              <div>
                <strong>Regional Processing</strong>
                <p>AI processing occurs in your selected Azure region for data residency compliance.</p>
              </div>
            </li>
            <li>
              <CheckCircle size={20} />
              <div>
                <strong>Content Filtering</strong>
                <p>Built-in content safety systems prevent misuse of AI capabilities.</p>
              </div>
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Compliance</h2>
          <p>
            Apex maintains compliance with industry standards and regulations relevant to legal practice:
          </p>
          <ul>
            <li>SOC 2 Type II</li>
            <li>HIPAA (Business Associate Agreement available)</li>
            <li>GDPR compliant data handling</li>
            <li>State bar ethics requirements for cloud storage</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Report a Vulnerability</h2>
          <p>
            We take security seriously and appreciate responsible disclosure of any vulnerabilities. 
            Please report security issues to <a href="mailto:security@strapped.ai">security@strapped.ai</a>.
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
