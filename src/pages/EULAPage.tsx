import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import styles from './PublicPages.module.css'

export function EULAPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navContent}>
          <Link to="/" className={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 28H4L16 4Z" fill="url(#eulaGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
              <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
              <defs>
                <linearGradient id="eulaGrad" x1="16" y1="4" x2="16" y2="28">
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
        <h1>End User License Agreement</h1>
        <p>Last updated: December 23, 2025</p>
      </header>

      <div className={styles.content}>
        <section className={styles.section}>
          <h2>1. Introduction</h2>
          <p>
            This End User License Agreement ("EULA" or "Agreement") is a legal agreement between you 
            ("User," "you," or "your") and Strapped AI LLC ("Strapped AI," "Company," "we," "us," or "our") 
            for the use of our AI-powered legal practice management software, including any associated 
            applications, services, APIs, and documentation (collectively, the "Software").
          </p>
          <p>
            <strong>BY INSTALLING, ACCESSING, OR USING THE SOFTWARE, YOU ACKNOWLEDGE THAT YOU HAVE READ, 
            UNDERSTOOD, AND AGREE TO BE BOUND BY THE TERMS OF THIS AGREEMENT.</strong> If you do not agree 
            to these terms, do not install, access, or use the Software.
          </p>
          <p>
            If you are accepting this Agreement on behalf of a company, law firm, or other legal entity, 
            you represent and warrant that you have the authority to bind that entity to this Agreement.
          </p>
        </section>

        <section className={styles.section}>
          <h2>2. License Grant</h2>
          <p>
            Subject to the terms of this Agreement and payment of applicable fees, Strapped AI grants you a 
            limited, non-exclusive, non-transferable, revocable license to:
          </p>
          <ul>
            <li>Access and use the Software for your internal business purposes</li>
            <li>Allow authorized users within your organization to access the Software</li>
            <li>Use the AI-powered features and integrations included in your subscription plan</li>
            <li>Store, process, and manage data through the Software</li>
          </ul>
          <p>
            This license is conditioned upon your compliance with all terms of this Agreement.
          </p>
        </section>

        <section className={styles.section}>
          <h2>3. License Restrictions</h2>
          <p>You may NOT:</p>
          <ul>
            <li>Copy, modify, adapt, or create derivative works of the Software</li>
            <li>Reverse engineer, disassemble, decompile, or attempt to derive the source code of the Software</li>
            <li>Rent, lease, lend, sell, sublicense, or otherwise transfer the Software to third parties</li>
            <li>Remove, alter, or obscure any proprietary notices, labels, or marks on the Software</li>
            <li>Use the Software to develop a competing product or service</li>
            <li>Use the Software in violation of any applicable laws or regulations</li>
            <li>Circumvent or disable any security or access control features</li>
            <li>Use automated scripts or bots to access the Software in a manner that exceeds normal use</li>
            <li>Share login credentials or allow unauthorized access to your account</li>
            <li>Use the Software to transmit malware, viruses, or other harmful code</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>4. AI-Powered Features</h2>
          <p>
            The Software includes artificial intelligence features powered by third-party AI services. 
            By using these features, you acknowledge and agree:
          </p>
          <ul>
            <li><strong>No Legal Advice:</strong> AI-generated content is provided for informational and 
            assistance purposes only. It does not constitute legal advice and should not be relied upon 
            as a substitute for professional legal judgment.</li>
            <li><strong>Review Required:</strong> You are solely responsible for reviewing, verifying, and 
            approving any AI-generated content before use in legal matters.</li>
            <li><strong>No Guarantee of Accuracy:</strong> While we strive for accuracy, AI outputs may 
            contain errors, omissions, or inaccuracies. We make no warranties regarding the accuracy, 
            completeness, or reliability of AI-generated content.</li>
            <li><strong>Data Processing:</strong> When using AI features, your data is processed by our 
            AI service providers. Your data is not used to train AI models and is processed in accordance 
            with our Privacy Policy.</li>
            <li><strong>Professional Responsibility:</strong> You remain fully responsible for your 
            professional obligations, including competence, confidentiality, and ethical duties.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>5. Third-Party Integrations</h2>
          <p>
            The Software may integrate with third-party services including, but not limited to, QuickBooks, 
            Microsoft 365, Google Workspace, DocuSign, and cloud storage providers. By enabling these integrations:
          </p>
          <ul>
            <li>You authorize us to access and sync data with those services on your behalf</li>
            <li>You agree to comply with the terms of service of each third-party provider</li>
            <li>You acknowledge that third-party services are governed by their own terms and privacy policies</li>
            <li>You understand that we are not responsible for the availability, accuracy, or security of 
            third-party services</li>
            <li>You may disconnect integrations at any time through your account settings</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>6. Your Data and Content</h2>
          <p>
            <strong>Ownership:</strong> You retain all right, title, and interest in and to any data, 
            documents, or content you submit to the Software ("Your Content"). We claim no ownership 
            rights over Your Content.
          </p>
          <p>
            <strong>License to Us:</strong> By submitting Your Content, you grant us a limited, worldwide, 
            non-exclusive license to host, store, process, and display Your Content solely for the purpose 
            of providing and improving the Software.
          </p>
          <p>
            <strong>Your Responsibilities:</strong> You are responsible for:
          </p>
          <ul>
            <li>Ensuring you have all necessary rights to submit Your Content</li>
            <li>Maintaining appropriate backups of Your Content</li>
            <li>Protecting confidential and privileged information in accordance with your professional duties</li>
            <li>Complying with all applicable laws regarding data protection and privacy</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>7. Intellectual Property</h2>
          <p>
            The Software, including all code, designs, graphics, user interfaces, features, functionality, 
            documentation, and related intellectual property, is owned by Strapped AI and protected by 
            copyright, trademark, patent, trade secret, and other intellectual property laws.
          </p>
          <p>
            Nothing in this Agreement grants you any right, title, or interest in the Software except for 
            the limited license expressly granted herein. All rights not expressly granted are reserved by 
            Strapped AI.
          </p>
          <p>
            "Strapped AI," the Strapped AI logo, and other product names and logos are trademarks of 
            Strapped AI LLC. You may not use these trademarks without our prior written permission.
          </p>
        </section>

        <section className={styles.section}>
          <h2>8. Subscription and Payment</h2>
          <ul>
            <li><strong>Fees:</strong> You agree to pay all applicable subscription fees as described in 
            your order or on our website. Fees are quoted in U.S. dollars unless otherwise specified.</li>
            <li><strong>Billing:</strong> Subscription fees are billed in advance on a monthly or annual 
            basis, depending on your plan selection.</li>
            <li><strong>Automatic Renewal:</strong> Subscriptions automatically renew unless cancelled 
            before the end of the current billing period.</li>
            <li><strong>Price Changes:</strong> We may modify pricing upon 30 days' notice. Continued use 
            after a price change constitutes acceptance.</li>
            <li><strong>Taxes:</strong> You are responsible for all applicable taxes, and we will charge 
            tax where required by law.</li>
            <li><strong>Refunds:</strong> Fees are generally non-refundable except as required by law or 
            as explicitly stated in this Agreement.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>9. Confidentiality</h2>
          <p>
            We recognize that Your Content may include confidential information protected by attorney-client 
            privilege or other legal protections. We agree to:
          </p>
          <ul>
            <li>Maintain appropriate safeguards to protect Your Content</li>
            <li>Not access Your Content except as necessary to provide the Software or as required by law</li>
            <li>Not disclose Your Content to third parties except as described in our Privacy Policy</li>
            <li>Assert all available protections against third-party access to privileged materials</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>10. Security</h2>
          <p>
            We implement industry-standard security measures to protect the Software and Your Content, including:
          </p>
          <ul>
            <li>Encryption of data at rest and in transit</li>
            <li>Access controls and authentication requirements</li>
            <li>Regular security assessments and monitoring</li>
            <li>Incident response procedures</li>
          </ul>
          <p>
            You are responsible for maintaining the security of your account credentials and ensuring 
            appropriate access controls within your organization.
          </p>
        </section>

        <section className={styles.section}>
          <h2>11. Disclaimer of Warranties</h2>
          <p>
            THE SOFTWARE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER 
            EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, 
            FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
          </p>
          <p>
            WE DO NOT WARRANT THAT THE SOFTWARE WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR FREE OF 
            VIRUSES OR OTHER HARMFUL COMPONENTS. WE DO NOT WARRANT THE ACCURACY, COMPLETENESS, OR 
            RELIABILITY OF ANY AI-GENERATED CONTENT.
          </p>
          <p>
            SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF IMPLIED WARRANTIES, SO SOME OF THE ABOVE 
            EXCLUSIONS MAY NOT APPLY TO YOU.
          </p>
        </section>

        <section className={styles.section}>
          <h2>12. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:
          </p>
          <ul>
            <li>STRAPPED AI SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, 
            PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO DAMAGES FOR LOSS OF PROFITS, 
            GOODWILL, DATA, OR OTHER INTANGIBLE LOSSES.</li>
            <li>OUR TOTAL LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATED TO THIS AGREEMENT SHALL 
            NOT EXCEED THE AMOUNTS PAID BY YOU TO STRAPPED AI IN THE TWELVE (12) MONTHS PRECEDING THE 
            CLAIM.</li>
            <li>WE ARE NOT LIABLE FOR ANY DAMAGES ARISING FROM YOUR RELIANCE ON AI-GENERATED CONTENT 
            OR FROM THE ACTIONS OR OMISSIONS OF THIRD-PARTY SERVICES.</li>
          </ul>
          <p>
            THESE LIMITATIONS APPLY REGARDLESS OF THE LEGAL THEORY ON WHICH THE CLAIM IS BASED AND EVEN 
            IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
          </p>
        </section>

        <section className={styles.section}>
          <h2>13. Indemnification</h2>
          <p>
            You agree to indemnify, defend, and hold harmless Strapped AI, its affiliates, officers, 
            directors, employees, and agents from and against any claims, damages, losses, liabilities, 
            costs, and expenses (including reasonable attorneys' fees) arising out of or related to:
          </p>
          <ul>
            <li>Your use of the Software</li>
            <li>Your violation of this Agreement</li>
            <li>Your violation of any applicable laws or third-party rights</li>
            <li>Your Content or the use thereof</li>
            <li>Any claim that Your Content infringes third-party intellectual property rights</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>14. Term and Termination</h2>
          <p>
            <strong>Term:</strong> This Agreement is effective until terminated by either party.
          </p>
          <p>
            <strong>Termination by You:</strong> You may terminate this Agreement at any time by 
            discontinuing use of the Software and closing your account.
          </p>
          <p>
            <strong>Termination by Us:</strong> We may terminate or suspend your access immediately, 
            without prior notice, if you breach this Agreement, fail to pay fees, or for any other 
            reason at our discretion.
          </p>
          <p>
            <strong>Effect of Termination:</strong> Upon termination:
          </p>
          <ul>
            <li>Your license to use the Software immediately terminates</li>
            <li>You must cease all use of the Software</li>
            <li>You may export Your Content for 30 days following termination</li>
            <li>We may delete Your Content after the 30-day period</li>
            <li>Provisions that by their nature should survive will survive termination</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>15. Updates and Modifications</h2>
          <p>
            <strong>Software Updates:</strong> We may update, modify, or discontinue features of the 
            Software at any time. We will endeavor to provide notice of material changes.
          </p>
          <p>
            <strong>Agreement Updates:</strong> We may modify this Agreement at any time. We will notify 
            you of material changes by email or through the Software. Continued use after changes become 
            effective constitutes acceptance of the modified Agreement.
          </p>
        </section>

        <section className={styles.section}>
          <h2>16. Governing Law and Disputes</h2>
          <p>
            This Agreement shall be governed by and construed in accordance with the laws of the State 
            of Delaware, without regard to its conflict of law principles.
          </p>
          <p>
            Any dispute arising out of or relating to this Agreement shall be resolved through binding 
            arbitration in accordance with the rules of the American Arbitration Association. The 
            arbitration shall take place in Delaware, and the arbitrator's decision shall be final and 
            binding.
          </p>
          <p>
            Notwithstanding the above, either party may seek injunctive or other equitable relief in 
            any court of competent jurisdiction to protect its intellectual property rights.
          </p>
        </section>

        <section className={styles.section}>
          <h2>17. General Provisions</h2>
          <ul>
            <li><strong>Entire Agreement:</strong> This Agreement, together with our Privacy Policy and 
            Terms of Service, constitutes the entire agreement between you and Strapped AI regarding 
            the Software.</li>
            <li><strong>Severability:</strong> If any provision of this Agreement is found unenforceable, 
            the remaining provisions will continue in full force and effect.</li>
            <li><strong>Waiver:</strong> Our failure to enforce any right or provision of this Agreement 
            shall not constitute a waiver of such right or provision.</li>
            <li><strong>Assignment:</strong> You may not assign this Agreement without our prior written 
            consent. We may assign this Agreement without restriction.</li>
            <li><strong>Force Majeure:</strong> Neither party shall be liable for delays or failures in 
            performance resulting from circumstances beyond its reasonable control.</li>
            <li><strong>Export Compliance:</strong> You agree to comply with all applicable export and 
            import laws and regulations.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>18. Contact Information</h2>
          <p>
            If you have any questions about this End User License Agreement, please contact us:
          </p>
          <p style={{ marginTop: '1rem' }}>
            <strong>Strapped AI LLC</strong><br />
            Email: <a href="mailto:admin@strappedai.com">admin@strappedai.com</a>
          </p>
          <p style={{ marginTop: '1rem' }}>
            By using the Software, you acknowledge that you have read this Agreement, understand it, 
            and agree to be bound by its terms and conditions.
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
