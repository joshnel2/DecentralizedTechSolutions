import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import styles from './PublicPages.module.css'

export function TermsPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navContent}>
          <Link to="/" className={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 28H4L16 4Z" fill="url(#termsGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
              <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
              <defs>
                <linearGradient id="termsGrad" x1="16" y1="4" x2="16" y2="28">
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
        <h1>Terms of Service</h1>
        <p>Last updated: December 1, 2025</p>
      </header>

      <div className={styles.content}>
        <section className={styles.section}>
          <h2>1. Agreement to Terms</h2>
          <p>
            By accessing or using Apex Legal Technologies' services ("Services"), you agree to be bound by 
            these Terms of Service ("Terms"). If you do not agree to these Terms, do not use our Services.
          </p>
          <p>
            These Terms constitute a legally binding agreement between you and Apex Legal Technologies 
            ("Apex," "we," "us," or "our").
          </p>
        </section>

        <section className={styles.section}>
          <h2>2. Description of Services</h2>
          <p>
            Apex provides a cloud-based legal practice management platform that includes matter management, 
            time tracking, billing, document management, AI-powered assistance, and related features. 
            We reserve the right to modify, suspend, or discontinue any part of the Services at any time.
          </p>
        </section>

        <section className={styles.section}>
          <h2>3. Account Registration</h2>
          <p>To use our Services, you must:</p>
          <ul>
            <li>Register for an account with accurate and complete information</li>
            <li>Be at least 18 years old</li>
            <li>Have the authority to bind your organization if registering on behalf of a firm</li>
            <li>Maintain the security of your account credentials</li>
            <li>Notify us immediately of any unauthorized access</li>
          </ul>
          <p>
            You are responsible for all activities that occur under your account.
          </p>
        </section>

        <section className={styles.section}>
          <h2>4. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Services for any unlawful purpose</li>
            <li>Violate any applicable laws or regulations</li>
            <li>Infringe on intellectual property rights of others</li>
            <li>Transmit malicious code or interfere with the Services</li>
            <li>Attempt to gain unauthorized access to any systems</li>
            <li>Use the Services to send spam or unsolicited communications</li>
            <li>Resell or redistribute the Services without authorization</li>
            <li>Use automated systems to access the Services in a manner that exceeds reasonable use</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>5. Your Data</h2>
          <p>
            You retain all rights to the data you submit to the Services ("Your Data"). By using the Services, 
            you grant us a limited license to use Your Data solely to provide and improve the Services.
          </p>
          <p>
            You are responsible for ensuring you have the necessary rights and permissions to submit 
            Your Data to the Services, including any client information or confidential data.
          </p>
        </section>

        <section className={styles.section}>
          <h2>6. AI Features</h2>
          <p>
            Our AI features are provided as tools to assist your legal practice. You acknowledge that:
          </p>
          <ul>
            <li>AI outputs are suggestions and should be reviewed for accuracy</li>
            <li>You are responsible for verifying any AI-generated content</li>
            <li>AI features do not constitute legal advice</li>
            <li>You should not rely solely on AI outputs for legal decisions</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>7. Payment Terms</h2>
          <p>
            Subscription fees are billed in advance on a monthly or annual basis. You agree to pay all 
            applicable fees and taxes. Fees are non-refundable except as required by law or as explicitly 
            stated in these Terms.
          </p>
          <p>
            We may change our fees upon 30 days' notice. Continued use after a fee change constitutes 
            acceptance of the new fees.
          </p>
        </section>

        <section className={styles.section}>
          <h2>8. Intellectual Property</h2>
          <p>
            The Services, including all software, designs, text, graphics, and other content, are owned 
            by Apex and protected by intellectual property laws. You receive a limited, non-exclusive, 
            non-transferable license to use the Services for your internal business purposes.
          </p>
        </section>

        <section className={styles.section}>
          <h2>9. Confidentiality</h2>
          <p>
            We understand the confidential nature of legal practice. We maintain appropriate safeguards 
            to protect Your Data and comply with applicable confidentiality requirements. Our data handling 
            practices are detailed in our Privacy Policy.
          </p>
        </section>

        <section className={styles.section}>
          <h2>10. Disclaimer of Warranties</h2>
          <p>
            THE SERVICES ARE PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. 
            WE DISCLAIM ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A 
            PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
          </p>
        </section>

        <section className={styles.section}>
          <h2>11. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, APEX SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, 
            SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES. OUR TOTAL 
            LIABILITY SHALL NOT EXCEED THE AMOUNTS PAID BY YOU IN THE TWELVE MONTHS PRECEDING THE CLAIM.
          </p>
        </section>

        <section className={styles.section}>
          <h2>12. Indemnification</h2>
          <p>
            You agree to indemnify and hold Apex harmless from any claims, damages, or expenses arising 
            from your use of the Services, violation of these Terms, or infringement of any third-party rights.
          </p>
        </section>

        <section className={styles.section}>
          <h2>13. Termination</h2>
          <p>
            Either party may terminate this agreement at any time. Upon termination, your right to use 
            the Services will cease. You may export Your Data for 30 days following termination.
          </p>
        </section>

        <section className={styles.section}>
          <h2>14. Governing Law</h2>
          <p>
            These Terms shall be governed by the laws of the State of California without regard to 
            conflict of law principles. Any disputes shall be resolved in the courts of San Francisco County, California.
          </p>
        </section>

        <section className={styles.section}>
          <h2>15. Changes to Terms</h2>
          <p>
            We may modify these Terms at any time. We will provide notice of material changes through 
            the Services or by email. Continued use after changes constitutes acceptance of the modified Terms.
          </p>
        </section>

        <section className={styles.section}>
          <h2>16. Contact</h2>
          <p>
            For questions about these Terms, please contact us at:
          </p>
          <p>
            <strong>Email:</strong> <a href="mailto:legal@apexlegal.com">legal@apexlegal.com</a><br />
            <strong>Address:</strong> Apex Legal Technologies, 123 Legal Tech Way, San Francisco, CA 94105
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
