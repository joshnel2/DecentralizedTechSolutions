import { Link } from 'react-router-dom'
import { ArrowLeft, Shield, Lock, Eye, Database, Cpu, Globe, Users, FileText, RefreshCw } from 'lucide-react'
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
        <p>Last updated: December 23, 2025</p>
      </header>

      <div className={styles.content}>
        {/* Introduction */}
        <section className={styles.section}>
          <h2><Shield size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />Introduction</h2>
          <p>
            Apex Legal Technologies ("Apex," "we," "us," or "our") is committed to protecting your privacy 
            and maintaining the confidentiality of your data. As a legal practice management platform, we 
            understand the critical importance of data security and attorney-client privilege.
          </p>
          <p>
            This Privacy Policy explains how we collect, use, disclose, and safeguard your information when 
            you use our AI-powered legal practice management platform, including our website, applications, 
            integrations, and related services (collectively, the "Services").
          </p>
          <p>
            <strong>By accessing or using our Services, you acknowledge that you have read, understood, and 
            agree to be bound by this Privacy Policy.</strong> If you do not agree with the terms of this 
            policy, please do not access or use our Services.
          </p>
        </section>

        {/* Information We Collect */}
        <section className={styles.section}>
          <h2><Database size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />Information We Collect</h2>
          
          <h3>Information You Provide Directly</h3>
          <ul>
            <li><strong>Account Information:</strong> Name, email address, phone number, law firm name, bar number, 
            professional credentials, and billing information when you create an account or subscribe to our Services.</li>
            <li><strong>Client & Matter Data:</strong> Information about your clients and legal matters that you 
            choose to store in Apex, including client names, contact information, case details, matter notes, 
            court dates, and related legal information.</li>
            <li><strong>Documents & Files:</strong> Legal documents, contracts, pleadings, and other files you 
            upload to the platform for document management, AI analysis, or collaboration.</li>
            <li><strong>Financial Data:</strong> Time entries, billing records, invoice information, trust account 
            transactions, and payment details processed through our billing features.</li>
            <li><strong>Communications:</strong> Messages sent through our platform, including client communications, 
            team messages, and support requests.</li>
            <li><strong>Calendar & Scheduling:</strong> Events, appointments, deadlines, and court dates you create 
            or sync with the platform.</li>
          </ul>

          <h3>Information from Third-Party Integrations</h3>
          <p>When you connect third-party services to Apex, we may receive information from those services:</p>
          <ul>
            <li><strong>QuickBooks Online:</strong> Invoice data, customer information, payment records, and 
            financial transactions to sync billing and accounting.</li>
            <li><strong>Microsoft Outlook:</strong> Email messages, calendar events, and contacts when you enable 
            email integration for client communication tracking.</li>
            <li><strong>Google Workspace:</strong> Calendar events, email messages, and documents when you connect 
            Google services for synchronization.</li>
            <li><strong>Cloud Storage (OneDrive, Google Drive, Dropbox):</strong> File names, metadata, and document 
            contents when you sync external storage with your Apex documents.</li>
            <li><strong>DocuSign:</strong> Signature requests, envelope status, and signed document information.</li>
            <li><strong>Zoom & Communication Tools:</strong> Meeting information and scheduling data.</li>
          </ul>

          <h3>Information Collected Automatically</h3>
          <ul>
            <li><strong>Usage Data:</strong> Features accessed, actions taken, time spent on pages, and interaction 
            patterns within the platform.</li>
            <li><strong>Device Information:</strong> Browser type, operating system, device type, screen resolution, 
            and unique device identifiers.</li>
            <li><strong>Log Data:</strong> IP addresses, access times, pages viewed, referring URLs, and error logs.</li>
            <li><strong>Cookies & Tracking:</strong> We use cookies, local storage, and similar technologies to 
            maintain sessions, remember preferences, and analyze usage patterns.</li>
          </ul>
        </section>

        {/* How We Use Your Information */}
        <section className={styles.section}>
          <h2><Eye size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />How We Use Your Information</h2>
          <p>We use the information we collect for the following purposes:</p>
          
          <h3>Providing Our Services</h3>
          <ul>
            <li>Operating and maintaining the Apex platform and all its features</li>
            <li>Processing legal matter management, time tracking, and billing</li>
            <li>Syncing data with connected third-party integrations</li>
            <li>Generating reports, analytics, and insights for your practice</li>
            <li>Facilitating document storage, search, and collaboration</li>
          </ul>

          <h3>AI-Powered Features</h3>
          <ul>
            <li>Providing AI-assisted document analysis, summarization, and drafting</li>
            <li>Generating intelligent time entry suggestions and billing recommendations</li>
            <li>Powering legal research assistance and case analysis</li>
            <li>Enabling natural language search and smart categorization</li>
          </ul>

          <h3>Communications & Support</h3>
          <ul>
            <li>Sending service-related notifications, updates, and alerts</li>
            <li>Responding to your inquiries and support requests</li>
            <li>Providing deadline reminders and calendar notifications</li>
          </ul>

          <h3>Security & Compliance</h3>
          <ul>
            <li>Detecting, investigating, and preventing fraudulent or unauthorized activity</li>
            <li>Maintaining audit logs for compliance and security purposes</li>
            <li>Enforcing our Terms of Service and protecting our legal rights</li>
            <li>Complying with legal obligations and regulatory requirements</li>
          </ul>

          <h3>Improvement & Analytics</h3>
          <ul>
            <li>Analyzing usage patterns to improve our Services</li>
            <li>Developing new features and functionality</li>
            <li>Conducting aggregated, anonymized research and analysis</li>
          </ul>
        </section>

        {/* AI Features and Data Processing */}
        <section className={styles.section}>
          <h2><Cpu size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />AI Features and Data Processing</h2>
          <p>
            Apex integrates advanced AI capabilities powered by Microsoft Azure OpenAI Service to enhance 
            your legal practice. We are committed to responsible AI use and transparent data handling:
          </p>
          
          <h3>How AI Processes Your Data</h3>
          <ul>
            <li><strong>Document Analysis:</strong> When you use AI features to analyze documents, the content 
            is securely transmitted to Azure OpenAI for processing. Results are returned to you immediately.</li>
            <li><strong>Drafting Assistance:</strong> AI-powered drafting uses your prompts and context to 
            generate suggested content, which you can review and edit before use.</li>
            <li><strong>Time Entry Suggestions:</strong> AI analyzes your calendar, emails, and activities to 
            suggest time entries, but you maintain full control over what is recorded.</li>
            <li><strong>Legal Research:</strong> AI assists with research queries but does not replace 
            professional legal judgment.</li>
          </ul>

          <h3>AI Data Protection Commitments</h3>
          <ul>
            <li><strong>No Model Training:</strong> Your data is <strong>never</strong> used to train, improve, 
            or fine-tune any AI models. Your information remains exclusively yours.</li>
            <li><strong>Ephemeral Processing:</strong> AI interactions are processed in real-time and are not 
            retained by the AI service after generating responses.</li>
            <li><strong>Enterprise Security:</strong> All AI processing occurs within Microsoft Azure's 
            enterprise-grade, SOC 2 compliant infrastructure with end-to-end encryption.</li>
            <li><strong>No Third-Party Access:</strong> Your AI interactions are not shared with, accessed by, 
            or visible to any third parties, including Microsoft or OpenAI researchers.</li>
            <li><strong>Opt-Out Available:</strong> You can disable AI features at any time in your account 
            settings without affecting other platform functionality.</li>
          </ul>

          <h3>AI Limitations Disclosure</h3>
          <p>
            AI-generated content is provided as a tool to assist legal professionals and should not be relied 
            upon as legal advice. All AI outputs should be reviewed by qualified attorneys before use. Apex 
            is not responsible for any errors, omissions, or consequences arising from reliance on AI-generated 
            content.
          </p>
        </section>

        {/* Third-Party Integrations */}
        <section className={styles.section}>
          <h2><RefreshCw size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />Third-Party Integrations</h2>
          <p>
            Apex integrates with various third-party services to provide a seamless experience. When you 
            connect these services, you authorize Apex to access and sync data as described below:
          </p>

          <h3>Accounting & Financial Services</h3>
          <ul>
            <li><strong>QuickBooks Online (Intuit):</strong> We access invoice, customer, and payment data to 
            sync your billing. Data synced from QuickBooks is stored securely and used only for the purposes 
            you authorize. <a href="https://www.intuit.com/privacy/" target="_blank" rel="noopener noreferrer">View Intuit's Privacy Policy</a></li>
          </ul>

          <h3>Email & Calendar Services</h3>
          <ul>
            <li><strong>Microsoft 365/Outlook:</strong> When connected, we access emails, calendar events, and 
            contacts to enable communication tracking and calendar sync. <a href="https://privacy.microsoft.com/" target="_blank" rel="noopener noreferrer">View Microsoft's Privacy Policy</a></li>
            <li><strong>Google Workspace:</strong> We access Gmail, Google Calendar, and Google Drive to sync 
            communications, events, and documents. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">View Google's Privacy Policy</a></li>
          </ul>

          <h3>Cloud Storage Services</h3>
          <ul>
            <li><strong>OneDrive, Google Drive, Dropbox:</strong> We access files and folders you choose to sync 
            with Apex document management.</li>
          </ul>

          <h3>E-Signature & Communication</h3>
          <ul>
            <li><strong>DocuSign:</strong> We access signature request status and signed documents.</li>
            <li><strong>Zoom, Slack:</strong> We access meeting schedules and channel information for integration features.</li>
          </ul>

          <p>
            <strong>Your Control:</strong> You can disconnect any integration at any time through your account 
            settings. Disconnecting an integration will stop future data syncing but will not automatically 
            delete previously synced data from Apex.
          </p>
        </section>

        {/* Information Sharing */}
        <section className={styles.section}>
          <h2><Users size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />Information Sharing and Disclosure</h2>
          <p>
            <strong>We do not sell, rent, or trade your personal information or client data.</strong> We may 
            share information only in the following limited circumstances:
          </p>
          <ul>
            <li><strong>Service Providers:</strong> We share data with trusted vendors who assist in providing 
            our Services (cloud hosting, payment processing, email delivery, customer support). These providers 
            are contractually bound to protect your data and use it only for specified purposes.</li>
            <li><strong>Third-Party Integrations:</strong> When you connect integrations, data is shared with 
            those services as necessary to provide the integration functionality you requested.</li>
            <li><strong>Legal Requirements:</strong> We may disclose information when required by law, subpoena, 
            court order, or government request. We will notify you of such requests when legally permitted.</li>
            <li><strong>Protection of Rights:</strong> We may share information to protect the safety, rights, 
            or property of Apex, our users, or the public.</li>
            <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, bankruptcy, or 
            sale of assets, your information may be transferred. We will notify you of any such change.</li>
            <li><strong>With Your Consent:</strong> We may share information when you have given explicit permission.</li>
          </ul>

          <h3>Attorney-Client Privilege</h3>
          <p>
            We understand that your client data may be protected by attorney-client privilege. Apex is designed 
            as a tool for attorneys and does not waive any privilege protections. We maintain strict access 
            controls and will assert all available protections against third-party access to privileged materials.
          </p>
        </section>

        {/* Data Security */}
        <section className={styles.section}>
          <h2><Lock size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />Data Security</h2>
          <p>
            We implement comprehensive security measures designed to meet the stringent requirements of legal 
            professionals:
          </p>
          
          <h3>Technical Safeguards</h3>
          <ul>
            <li><strong>Encryption at Rest:</strong> All stored data is encrypted using AES-256 encryption.</li>
            <li><strong>Encryption in Transit:</strong> All data transmission uses TLS 1.3 encryption.</li>
            <li><strong>Access Controls:</strong> Role-based access controls and multi-factor authentication.</li>
            <li><strong>Network Security:</strong> Enterprise firewalls, intrusion detection, and DDoS protection.</li>
            <li><strong>Secure Infrastructure:</strong> Hosted on SOC 2 Type II certified cloud infrastructure.</li>
          </ul>

          <h3>Organizational Safeguards</h3>
          <ul>
            <li>Regular security assessments and third-party penetration testing</li>
            <li>Employee background checks and security training</li>
            <li>Incident response procedures and breach notification protocols</li>
            <li>Comprehensive audit logging and monitoring</li>
            <li>Vendor security assessments for all third-party providers</li>
          </ul>

          <h3>Your Security Responsibilities</h3>
          <p>
            You are responsible for maintaining the security of your account credentials, enabling multi-factor 
            authentication, and ensuring appropriate access controls within your organization.
          </p>
        </section>

        {/* Data Retention */}
        <section className={styles.section}>
          <h2><FileText size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />Data Retention</h2>
          <ul>
            <li><strong>Active Accounts:</strong> We retain your data for as long as your account is active and 
            as needed to provide Services.</li>
            <li><strong>After Termination:</strong> Upon account termination, we retain data for 90 days to allow 
            for data export, then securely delete it unless legally required to retain it longer.</li>
            <li><strong>Legal Holds:</strong> We may retain data longer if required by law, regulation, or legal 
            proceedings.</li>
            <li><strong>Backup Retention:</strong> Backups are retained for disaster recovery purposes and are 
            deleted according to our backup retention schedule (typically 30 days).</li>
            <li><strong>Audit Logs:</strong> Security and access logs are retained for 2 years for compliance purposes.</li>
          </ul>
          <p>
            You may request deletion of your data at any time by contacting us. We will process deletion 
            requests within 30 days, subject to legal retention requirements.
          </p>
        </section>

        {/* Your Rights */}
        <section className={styles.section}>
          <h2>Your Privacy Rights</h2>
          <p>Depending on your location, you may have the following rights regarding your personal information:</p>
          
          <h3>General Rights</h3>
          <ul>
            <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
            <li><strong>Correction:</strong> Request correction of inaccurate or incomplete data.</li>
            <li><strong>Deletion:</strong> Request deletion of your personal data.</li>
            <li><strong>Portability:</strong> Receive your data in a structured, machine-readable format.</li>
            <li><strong>Objection:</strong> Object to certain types of processing.</li>
            <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances.</li>
            <li><strong>Withdraw Consent:</strong> Withdraw consent where processing is based on consent.</li>
          </ul>

          <h3>California Residents (CCPA/CPRA)</h3>
          <p>California residents have additional rights including:</p>
          <ul>
            <li>Right to know what personal information is collected and how it's used</li>
            <li>Right to delete personal information</li>
            <li>Right to opt-out of sale or sharing of personal information (we do not sell your data)</li>
            <li>Right to non-discrimination for exercising privacy rights</li>
            <li>Right to correct inaccurate personal information</li>
            <li>Right to limit use of sensitive personal information</li>
          </ul>

          <h3>European Residents (GDPR)</h3>
          <p>If you are in the European Economic Area, you have rights under the General Data Protection 
          Regulation, including the rights listed above and the right to lodge a complaint with your local 
          data protection authority.</p>

          <p>
            <strong>To exercise any of these rights,</strong> please contact us at{' '}
            <a href="mailto:privacy@apexlegal.com">privacy@apexlegal.com</a>. We will respond to your 
            request within 30 days (or as required by applicable law).
          </p>
        </section>

        {/* International Transfers */}
        <section className={styles.section}>
          <h2><Globe size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />International Data Transfers</h2>
          <p>
            Your information may be transferred to, stored, and processed in the United States or other 
            countries where our service providers operate. When we transfer data internationally, we ensure 
            appropriate safeguards are in place:
          </p>
          <ul>
            <li>Standard Contractual Clauses approved by the European Commission</li>
            <li>Data Processing Agreements with all service providers</li>
            <li>Compliance with applicable data protection laws</li>
            <li>Privacy Shield certification where applicable</li>
          </ul>
        </section>

        {/* Cookies */}
        <section className={styles.section}>
          <h2>Cookies and Tracking Technologies</h2>
          <p>We use cookies and similar technologies for the following purposes:</p>
          <ul>
            <li><strong>Essential Cookies:</strong> Required for the platform to function (authentication, security).</li>
            <li><strong>Preference Cookies:</strong> Remember your settings and preferences.</li>
            <li><strong>Analytics Cookies:</strong> Help us understand how you use our Services to improve them.</li>
          </ul>
          <p>
            You can control cookies through your browser settings. Disabling essential cookies may prevent 
            you from using certain features of our Services.
          </p>
        </section>

        {/* Children's Privacy */}
        <section className={styles.section}>
          <h2>Children's Privacy</h2>
          <p>
            Our Services are designed for legal professionals and are not intended for individuals under 18 
            years of age. We do not knowingly collect personal information from children. If we learn that 
            we have collected information from a child under 18, we will promptly delete it.
          </p>
        </section>

        {/* Changes to Policy */}
        <section className={styles.section}>
          <h2>Changes to This Privacy Policy</h2>
          <p>
            We may update this Privacy Policy from time to time to reflect changes in our practices, 
            technologies, legal requirements, or other factors. When we make material changes:
          </p>
          <ul>
            <li>We will update the "Last updated" date at the top of this page</li>
            <li>We will notify you via email or in-app notification for significant changes</li>
            <li>We will provide at least 30 days notice before changes take effect for material updates</li>
          </ul>
          <p>
            We encourage you to review this Privacy Policy periodically. Your continued use of our Services 
            after changes become effective constitutes acceptance of the revised policy.
          </p>
        </section>

        {/* Contact Us */}
        <section className={styles.section}>
          <h2>Contact Us</h2>
          <p>
            If you have any questions, concerns, or requests regarding this Privacy Policy or our privacy 
            practices, please contact us:
          </p>
          <p style={{ marginTop: '1rem' }}>
            <strong>Apex Legal Technologies</strong><br />
            Attn: Privacy Team<br />
            123 Legal Tech Way<br />
            San Francisco, CA 94105<br />
            United States
          </p>
          <p style={{ marginTop: '1rem' }}>
            <strong>Email:</strong> <a href="mailto:privacy@apexlegal.com">privacy@apexlegal.com</a><br />
            <strong>Data Protection Inquiries:</strong> <a href="mailto:dpo@apexlegal.com">dpo@apexlegal.com</a>
          </p>
          <p style={{ marginTop: '1rem' }}>
            For urgent security concerns, please email <a href="mailto:security@apexlegal.com">security@apexlegal.com</a>.
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
