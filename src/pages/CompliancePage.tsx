import { Link } from 'react-router-dom'
import { ArrowLeft, Shield, CheckCircle, FileText, Lock, Server, Award } from 'lucide-react'
import styles from './PublicPages.module.css'

export function CompliancePage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navContent}>
          <Link to="/" className={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 28H4L16 4Z" fill="url(#compGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
              <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
              <defs>
                <linearGradient id="compGrad" x1="16" y1="4" x2="16" y2="28">
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
        <h1>Compliance</h1>
        <p>Our commitment to meeting the highest regulatory and industry standards.</p>
      </header>

      <div className={styles.content}>
        <section className={styles.section}>
          <h2>Certifications & Standards</h2>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Award size={24} /></div>
              <h3>SOC 2 Type II</h3>
              <p>
                Our infrastructure has been audited and certified for SOC 2 Type II compliance, 
                demonstrating our commitment to security, availability, and confidentiality.
              </p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Shield size={24} /></div>
              <h3>HIPAA</h3>
              <p>
                Apex is fully HIPAA compliant, making it safe for firms handling healthcare-related 
                legal matters. Business Associate Agreements available upon request.
              </p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Lock size={24} /></div>
              <h3>GDPR</h3>
              <p>
                We comply with the General Data Protection Regulation for processing personal data 
                of EU residents, including data subject rights and cross-border transfers.
              </p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><FileText size={24} /></div>
              <h3>CCPA</h3>
              <p>
                We comply with the California Consumer Privacy Act, providing California residents 
                with rights over their personal information.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Legal Industry Standards</h2>
          <ul className={styles.featureList}>
            <li>
              <CheckCircle size={20} />
              <div>
                <strong>ABA Model Rules Compliance</strong>
                <p>
                  Our platform is designed to help firms meet their ethical obligations under the ABA Model Rules 
                  of Professional Conduct, including competence in technology (Rule 1.1), confidentiality (Rule 1.6), 
                  and supervision (Rules 5.1-5.3).
                </p>
              </div>
            </li>
            <li>
              <CheckCircle size={20} />
              <div>
                <strong>State Bar Requirements</strong>
                <p>
                  We follow guidance from state bar associations regarding cloud storage and confidentiality of 
                  client information. Our security measures meet or exceed the requirements set forth in bar opinions 
                  across all 50 states.
                </p>
              </div>
            </li>
            <li>
              <CheckCircle size={20} />
              <div>
                <strong>IOLTA Compliance</strong>
                <p>
                  Our trust accounting features are designed to comply with IOLTA (Interest on Lawyers' Trust Accounts) 
                  requirements, with proper segregation of funds and required recordkeeping.
                </p>
              </div>
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Data Processing</h2>
          <div className={styles.card}>
            <h3>Data Processing Agreement</h3>
            <p>
              We offer a comprehensive Data Processing Agreement (DPA) that covers:
            </p>
            <ul>
              <li>Nature and purpose of processing</li>
              <li>Types of personal data processed</li>
              <li>Sub-processor information and management</li>
              <li>Security measures and audit rights</li>
              <li>Data subject rights assistance</li>
              <li>Data deletion and return procedures</li>
            </ul>
            <p style={{ marginTop: '1rem' }}>
              Contact <a href="mailto:legal@apexlegal.com">legal@apexlegal.com</a> to request a DPA.
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Infrastructure Security</h2>
          <ul className={styles.featureList}>
            <li>
              <Server size={20} />
              <div>
                <strong>Microsoft Azure</strong>
                <p>
                  Our platform runs on Microsoft Azure, which maintains numerous certifications including 
                  SOC 1/2/3, ISO 27001, FedRAMP, and more.
                </p>
              </div>
            </li>
            <li>
              <Lock size={20} />
              <div>
                <strong>Encryption</strong>
                <p>
                  All data is encrypted at rest using AES-256 and in transit using TLS 1.3. 
                  Encryption keys are managed through Azure Key Vault.
                </p>
              </div>
            </li>
            <li>
              <Shield size={20} />
              <div>
                <strong>Access Controls</strong>
                <p>
                  Role-based access controls, multi-factor authentication, and comprehensive audit logging 
                  ensure only authorized access to your data.
                </p>
              </div>
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Audit & Assessments</h2>
          <p>We conduct regular security assessments including:</p>
          <ul>
            <li>Annual SOC 2 Type II audits by independent auditors</li>
            <li>Quarterly vulnerability assessments</li>
            <li>Annual penetration testing by third-party security firms</li>
            <li>Continuous automated security monitoring</li>
            <li>Regular security awareness training for all employees</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Compliance Documentation</h2>
          <p>The following documents are available upon request:</p>
          <ul>
            <li>SOC 2 Type II Report</li>
            <li>Data Processing Agreement (DPA)</li>
            <li>Business Associate Agreement (BAA)</li>
            <li>Security Whitepaper</li>
            <li>Subprocessor List</li>
            <li>Penetration Test Executive Summary</li>
          </ul>
          <p style={{ marginTop: '1rem' }}>
            Contact <a href="mailto:compliance@apexlegal.com">compliance@apexlegal.com</a> to request documentation.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Questions?</h2>
          <p>
            If you have questions about our compliance program or need additional documentation for your 
            firm's due diligence, please contact our compliance team at{' '}
            <a href="mailto:compliance@apexlegal.com">compliance@apexlegal.com</a>.
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
