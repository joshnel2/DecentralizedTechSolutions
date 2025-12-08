import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import styles from './PublicPages.module.css'

export function PrivacyPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navContent}>
          <Link to="/" className={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 28H4L16 4Z" fill="url(#privacyGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
              <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
              <defs>
                <linearGradient id="privacyGrad" x1="16" y1="4" x2="16" y2="28">
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
        <h1>Privacy Policy</h1>
        <p>Last updated: December 1, 2025</p>
      </header>

      <div className={styles.content}>
        <section className={styles.section}>
          <h2>Introduction</h2>
          <p>
            Apex Legal Technologies ("Apex," "we," "us," or "our") is committed to protecting your privacy. 
            This Privacy Policy explains how we collect, use, disclose, and safeguard your information when 
            you use our legal practice management platform and related services.
          </p>
          <p>
            Please read this privacy policy carefully. By accessing or using our services, you acknowledge 
            that you have read, understood, and agree to be bound by this privacy policy.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Information We Collect</h2>
          
          <h3>Information You Provide</h3>
          <ul>
            <li><strong>Account Information:</strong> Name, email address, phone number, firm name, and billing information when you create an account.</li>
            <li><strong>Client Data:</strong> Information about your clients that you choose to store in Apex, including names, contact information, and matter details.</li>
            <li><strong>Documents:</strong> Files and documents you upload to the platform.</li>
            <li><strong>Communications:</strong> Messages you send through our support channels.</li>
          </ul>

          <h3>Information Collected Automatically</h3>
          <ul>
            <li><strong>Usage Data:</strong> Information about how you use the platform, including features accessed and actions taken.</li>
            <li><strong>Device Information:</strong> Browser type, operating system, and device identifiers.</li>
            <li><strong>Log Data:</strong> IP addresses, access times, and pages viewed.</li>
            <li><strong>Cookies:</strong> We use cookies and similar technologies to enhance your experience.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Provide, maintain, and improve our services</li>
            <li>Process transactions and send related information</li>
            <li>Send administrative notifications and updates</li>
            <li>Respond to your comments, questions, and support requests</li>
            <li>Monitor and analyze usage patterns and trends</li>
            <li>Detect, investigate, and prevent fraudulent or unauthorized activity</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>AI Features and Data Processing</h2>
          <p>
            Our AI features are powered by Azure OpenAI. When you use AI features:
          </p>
          <ul>
            <li>Your prompts and documents are processed to generate responses</li>
            <li>Your data is <strong>never</strong> used to train AI models</li>
            <li>AI processing occurs within Microsoft Azure's secure infrastructure</li>
            <li>You can disable AI features at any time in your settings</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Information Sharing</h2>
          <p>We do not sell your personal information. We may share information in the following circumstances:</p>
          <ul>
            <li><strong>Service Providers:</strong> With vendors who assist in providing our services (hosting, payment processing, etc.)</li>
            <li><strong>Legal Requirements:</strong> When required by law or to respond to legal process</li>
            <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
            <li><strong>With Your Consent:</strong> When you have given explicit permission</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Data Security</h2>
          <p>
            We implement appropriate technical and organizational measures to protect your information, including:
          </p>
          <ul>
            <li>Encryption of data at rest (AES-256) and in transit (TLS 1.3)</li>
            <li>Regular security assessments and penetration testing</li>
            <li>Access controls and authentication requirements</li>
            <li>Employee security training and background checks</li>
            <li>SOC 2 Type II certified infrastructure</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Data Retention</h2>
          <p>
            We retain your information for as long as your account is active or as needed to provide services. 
            After account termination, we retain data for a period necessary to comply with legal obligations 
            and resolve disputes. You may request deletion of your data at any time.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Your Rights</h2>
          <p>Depending on your location, you may have the following rights:</p>
          <ul>
            <li>Access and receive a copy of your personal data</li>
            <li>Correct inaccurate or incomplete data</li>
            <li>Request deletion of your data</li>
            <li>Object to or restrict processing of your data</li>
            <li>Data portability</li>
            <li>Withdraw consent where processing is based on consent</li>
          </ul>
          <p>
            To exercise these rights, please contact us at <a href="mailto:privacy@apexlegal.com">privacy@apexlegal.com</a>.
          </p>
        </section>

        <section className={styles.section}>
          <h2>International Transfers</h2>
          <p>
            Your information may be transferred to and processed in countries other than your country of residence. 
            We ensure appropriate safeguards are in place for such transfers in compliance with applicable law.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Children's Privacy</h2>
          <p>
            Our services are not intended for individuals under 18 years of age. We do not knowingly collect 
            personal information from children.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Changes to This Policy</h2>
          <p>
            We may update this privacy policy from time to time. We will notify you of any changes by posting 
            the new policy on this page and updating the "Last updated" date. We encourage you to review this 
            policy periodically.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy or our privacy practices, please contact us at:
          </p>
          <p>
            <strong>Email:</strong> <a href="mailto:privacy@apexlegal.com">privacy@apexlegal.com</a><br />
            <strong>Address:</strong> Apex Legal Technologies, 123 Legal Tech Way, San Francisco, CA 94105
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
