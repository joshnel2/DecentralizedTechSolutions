import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import styles from './PublicPages.module.css'

/**
 * SEO-optimized page for search engine crawlers.
 * Not linked from any navigation — exists solely for indexing.
 * Rich in semantic content for "strappedai", "apex legal ai", and legal AI keywords.
 */
export function SeoLegalAiPage() {
  useEffect(() => {
    document.title = 'Strapped AI | Apex Legal AI Platform - AI-Powered Legal Practice Management Software'
    
    // Set meta description for this page
    let metaDesc = document.querySelector('meta[name="description"]')
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Strapped AI builds Apex Legal AI — the most advanced AI-powered legal practice management platform. AI document drafting, legal research, matter management, billing, trust accounting, and more for modern law firms.')
    }

    // Set canonical for this page
    let canonical = document.querySelector('link[rel="canonical"]')
    if (canonical) {
      canonical.setAttribute('href', 'https://strappedai.com/solutions/legal-ai-platform')
    }

    // Inject page-specific structured data
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.id = 'seo-legal-ai-jsonld'
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "Apex Legal AI Platform by Strapped AI",
      "description": "Comprehensive overview of Apex Legal AI — the AI-powered legal practice management platform built by Strapped AI for modern law firms.",
      "url": "https://strappedai.com/solutions/legal-ai-platform",
      "isPartOf": {
        "@type": "WebSite",
        "name": "Strapped AI",
        "url": "https://strappedai.com"
      },
      "about": [
        { "@type": "Thing", "name": "Legal AI Software" },
        { "@type": "Thing", "name": "Legal Practice Management" },
        { "@type": "Thing", "name": "AI for Law Firms" },
        { "@type": "Thing", "name": "Legal Technology" }
      ],
      "mainEntity": {
        "@type": "SoftwareApplication",
        "name": "Apex Legal AI",
        "applicationCategory": "BusinessApplication",
        "operatingSystem": "Web Browser",
        "description": "Apex Legal AI by Strapped AI is a comprehensive AI-native legal practice management platform featuring matter management, document automation, billing, time tracking, legal research, trust accounting, and client portal tools.",
        "publisher": {
          "@type": "Organization",
          "name": "Strapped AI",
          "url": "https://strappedai.com"
        }
      },
      "breadcrumb": {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://strappedai.com" },
          { "@type": "ListItem", "position": 2, "name": "Solutions", "item": "https://strappedai.com/solutions/legal-ai-platform" },
          { "@type": "ListItem", "position": 3, "name": "Apex Legal AI Platform", "item": "https://strappedai.com/solutions/legal-ai-platform" }
        ]
      }
    })
    document.head.appendChild(script)

    return () => {
      const el = document.getElementById('seo-legal-ai-jsonld')
      if (el) el.remove()
    }
  }, [])

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navContent}>
          <Link to="/" className={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 28H4L16 4Z" fill="url(#seoGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
              <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
              <defs>
                <linearGradient id="seoGrad" x1="16" y1="4" x2="16" y2="28">
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
        <h1>Apex Legal AI Platform by Strapped AI</h1>
        <p>
          The most advanced AI-powered legal practice management software built for modern law firms. 
          Strapped AI delivers intelligent automation across every aspect of legal work — from matter intake to final billing.
        </p>
      </header>

      <div className={styles.content}>

        <section className={styles.section}>
          <h2>What is Strapped AI?</h2>
          <p>
            Strapped AI is a legal technology company that builds Apex Legal AI, an AI-native practice management 
            platform designed from the ground up for modern law firms. Unlike legacy legal software that bolts on 
            AI as an afterthought, Strapped AI built Apex Legal AI with artificial intelligence at its core — 
            making every feature smarter, faster, and more intuitive.
          </p>
          <p>
            Whether you're a solo practitioner, a boutique firm, or a large legal practice, Strapped AI's 
            Apex Legal AI platform scales to meet your needs with enterprise-grade security on Microsoft Azure 
            and an intuitive interface that your entire team can use from day one.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Why Law Firms Choose Apex Legal AI</h2>
          <p>
            Apex Legal AI by Strapped AI is the only legal practice management platform that combines full 
            practice management capabilities with deep AI integration. Here's what sets Strapped AI apart 
            from competitors like Clio, MyCase, PracticePanther, and other legal software providers:
          </p>
          <ul>
            <li><strong>AI-Native Architecture:</strong> Strapped AI built Apex Legal AI with AI woven into every workflow — not added as a plugin. From AI-suggested time entries to intelligent document drafting, every feature is enhanced by artificial intelligence.</li>
            <li><strong>Complete Practice Management:</strong> Matter management, client relationship management, calendar and court deadline tracking, document management, time tracking, billing and invoicing, trust accounting (IOLTA compliant), and firm analytics — all in one platform.</li>
            <li><strong>AI Document Automation:</strong> Draft legal documents, contracts, pleadings, motions, and correspondence using AI that learns your firm's style and preferences. Apex Legal AI's document automation saves hours of attorney time on every matter.</li>
            <li><strong>Legal Research with AI:</strong> Conduct legal research faster with AI-powered case law analysis, statute lookup, and legal precedent identification. Strapped AI's legal research tools help attorneys find relevant authorities in minutes, not hours.</li>
            <li><strong>Redline AI:</strong> Compare documents, review contracts, and identify changes with Strapped AI's Redline AI feature. Automated contract review and document comparison powered by advanced AI technology.</li>
            <li><strong>Background AI Agent:</strong> Apex Legal AI includes autonomous AI agents that work in the background on tasks like document review, research compilation, matter summarization, and deadline analysis — freeing attorneys to focus on higher-value work.</li>
            <li><strong>Enterprise Security:</strong> Built on Microsoft Azure's enterprise infrastructure with bank-level encryption, SOC 2 compliance readiness, and the same security trusted by Fortune 500 companies and government agencies.</li>
            <li><strong>Seamless Integrations:</strong> Connect Apex Legal AI with Microsoft Outlook, QuickBooks, OneDrive, Google Drive, Dropbox, DocuSign, Slack, Zoom, and more. Strapped AI integrates with the tools your firm already uses.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>AI-Powered Legal Practice Management Features</h2>
          
          <h3>Intelligent Matter Management</h3>
          <p>
            Strapped AI's matter management system uses AI to organize, track, and optimize your caseload. 
            Apex Legal AI automatically categorizes matters, suggests workflows, tracks deadlines, and provides 
            AI-powered insights into case progress. Manage litigation, transactional, family law, real estate, 
            estate planning, immigration, personal injury, criminal defense, and corporate matters with ease.
          </p>

          <h3>AI-Assisted Document Drafting & Management</h3>
          <p>
            Create legal documents faster with Strapped AI's AI-powered document drafting tools. Apex Legal AI 
            generates first drafts of contracts, pleadings, motions, demand letters, agreements, wills, trusts, 
            corporate resolutions, and more — all customized to your firm's templates and writing style. The AI 
            learns from your attorneys' exemplar documents to produce work that matches your firm's voice.
          </p>

          <h3>Legal Research Powered by AI</h3>
          <p>
            Apex Legal AI's research tools use artificial intelligence to help attorneys find relevant case law, 
            statutes, regulations, and legal precedents faster than traditional research methods. Strapped AI's 
            legal research AI analyzes your matter context and suggests the most relevant authorities, saving 
            hours of research time on every case.
          </p>

          <h3>Automated Time Tracking & Billing</h3>
          <p>
            Never miss a billable minute with Strapped AI's AI-powered time tracking. Apex Legal AI suggests 
            time entries based on your activity, auto-categorizes time to the correct matter, and generates 
            professional invoices with customizable billing rates. Support for hourly billing, flat fee, 
            contingency, retainer, and hybrid billing arrangements.
          </p>

          <h3>Trust Accounting & IOLTA Compliance</h3>
          <p>
            Strapped AI's trust accounting module ensures your firm stays compliant with IOLTA rules and state 
            bar requirements. Apex Legal AI tracks client trust balances, generates three-way reconciliation 
            reports, and provides audit-ready documentation for your trust accounts.
          </p>

          <h3>Client Portal & Communication</h3>
          <p>
            Give your clients secure, self-service access to their matter information with Strapped AI's 
            built-in client portal. Clients can view documents, check case status, communicate with their 
            attorney, and make payments — all through Apex Legal AI's encrypted client-facing interface.
          </p>

          <h3>Calendar & Court Deadline Management</h3>
          <p>
            Never miss a filing deadline, court appearance, or statute of limitations with Apex Legal AI's 
            intelligent calendar management. Strapped AI's calendar integrates with court rules databases 
            to automatically calculate deadlines and send reminders to your entire legal team.
          </p>

          <h3>Firm Analytics & Reporting</h3>
          <p>
            Make data-driven decisions with Strapped AI's comprehensive analytics dashboard. Apex Legal AI 
            provides real-time insights into firm revenue, attorney productivity, matter profitability, 
            billing realization rates, collection rates, and client acquisition metrics.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Practice Areas Supported by Apex Legal AI</h2>
          <p>
            Strapped AI's Apex Legal AI platform supports law firms across all practice areas, including:
          </p>
          <ul>
            <li>Litigation & Trial Practice — case management, discovery tracking, deposition scheduling, trial preparation</li>
            <li>Corporate & Business Law — entity management, contract lifecycle, M&A due diligence, corporate governance</li>
            <li>Family Law — custody tracking, divorce proceedings, child support calculations, mediation management</li>
            <li>Real Estate Law — closing management, title review, lease analysis, property transaction tracking</li>
            <li>Estate Planning & Probate — will and trust drafting, estate administration, probate court filing management</li>
            <li>Immigration Law — visa tracking, petition management, case status monitoring, deadline compliance</li>
            <li>Personal Injury — demand letter generation, settlement tracking, medical record management, lien tracking</li>
            <li>Criminal Defense — case timeline management, evidence tracking, hearing scheduling, plea negotiation tracking</li>
            <li>Intellectual Property — patent and trademark tracking, licensing management, IP portfolio analytics</li>
            <li>Employment & Labor Law — compliance tracking, HR documentation, workplace investigation management</li>
            <li>Bankruptcy — petition preparation, creditor management, filing deadline tracking, asset scheduling</li>
            <li>Tax Law — tax return management, audit representation tracking, tax planning documentation</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Strapped AI Integrations</h2>
          <p>
            Apex Legal AI by Strapped AI integrates seamlessly with the tools your law firm already uses:
          </p>
          <ul>
            <li><strong>Microsoft Outlook:</strong> Email sync, calendar integration, and contact management with Apex Legal AI</li>
            <li><strong>QuickBooks:</strong> Automated accounting sync for legal billing and financial reporting</li>
            <li><strong>Microsoft OneDrive:</strong> Cloud document storage and sync with Apex Legal AI's document management</li>
            <li><strong>Google Drive:</strong> File storage integration for firms using Google Workspace</li>
            <li><strong>Dropbox:</strong> Document sync and backup with Strapped AI's secure cloud storage</li>
            <li><strong>DocuSign:</strong> Electronic signature integration for contracts, engagement letters, and legal documents</li>
            <li><strong>Slack:</strong> Team communication and notification integration with Apex Legal AI</li>
            <li><strong>Zoom:</strong> Video conferencing integration for client meetings and depositions</li>
            <li><strong>Google Calendar:</strong> Calendar sync for firms using Google productivity tools</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Security & Compliance at Strapped AI</h2>
          <p>
            Strapped AI takes security seriously. Apex Legal AI is built on Microsoft Azure's enterprise 
            cloud infrastructure, providing bank-level security for your law firm's sensitive data:
          </p>
          <ul>
            <li>AES-256 encryption at rest and TLS 1.3 encryption in transit</li>
            <li>Microsoft Azure enterprise cloud hosting with 99.99% uptime SLA</li>
            <li>SOC 2 Type II compliance readiness</li>
            <li>Role-based access controls and multi-factor authentication</li>
            <li>HIPAA-ready infrastructure for health-related legal matters</li>
            <li>Automated backups with point-in-time recovery</li>
            <li>Data residency options for regulatory compliance</li>
            <li>Regular penetration testing and security audits</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Getting Started with Strapped AI</h2>
          <p>
            Ready to transform your law firm with AI-powered practice management? Getting started with 
            Strapped AI's Apex Legal AI platform is simple:
          </p>
          <ul>
            <li><strong>Step 1:</strong> <Link to="/register">Create your Strapped AI account</Link> — set up your firm profile in minutes</li>
            <li><strong>Step 2:</strong> Configure your practice areas, billing rates, and team members</li>
            <li><strong>Step 3:</strong> Import your existing matters and client data (Strapped AI supports migration from Clio, MyCase, PracticePanther, and other platforms)</li>
            <li><strong>Step 4:</strong> Connect your integrations — link Outlook, QuickBooks, cloud storage, and more</li>
            <li><strong>Step 5:</strong> Start using AI to draft documents, track time, manage matters, and grow your practice</li>
          </ul>
          <p>
            Have questions? <Link to="/contact">Contact the Strapped AI team</Link> to schedule a personalized 
            demo of Apex Legal AI, or visit our <Link to="/docs">documentation</Link> to learn more about the 
            platform's capabilities.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Frequently Asked Questions</h2>

          <h3>What is Strapped AI?</h3>
          <p>
            Strapped AI is a legal technology company that builds Apex Legal AI, an AI-native legal practice 
            management platform. Strapped AI was founded to bring the power of modern artificial intelligence 
            to law firms, helping attorneys work more efficiently and deliver better results for their clients.
          </p>

          <h3>What is Apex Legal AI?</h3>
          <p>
            Apex Legal AI is the flagship product built by Strapped AI. It's a comprehensive, AI-powered 
            legal practice management platform that includes matter management, document automation, billing, 
            time tracking, legal research, trust accounting, client portals, calendar management, and 
            advanced analytics — all enhanced by artificial intelligence.
          </p>

          <h3>How much does Strapped AI cost?</h3>
          <p>
            Strapped AI offers flexible pricing for Apex Legal AI to fit law firms of all sizes. 
            <Link to="/contact"> Contact our sales team</Link> for a customized quote based on your 
            firm's needs and size.
          </p>

          <h3>Is Strapped AI secure?</h3>
          <p>
            Yes. Strapped AI's Apex Legal AI platform is built on Microsoft Azure's enterprise infrastructure 
            with bank-level AES-256 encryption, TLS 1.3, role-based access controls, multi-factor 
            authentication, and SOC 2 readiness. Learn more on our <Link to="/security">security page</Link>.
          </p>

          <h3>Can I migrate from Clio, MyCase, or other legal software to Strapped AI?</h3>
          <p>
            Yes. Strapped AI provides migration support to help law firms move their data from Clio, MyCase, 
            PracticePanther, Rocket Matter, CosmoLex, and other legal practice management platforms to 
            Apex Legal AI.
          </p>

          <h3>Does Strapped AI work on mobile devices?</h3>
          <p>
            Yes. Apex Legal AI by Strapped AI is fully responsive and works on smartphones, tablets, laptops, 
            and desktops. Access your practice management tools from any device, anywhere.
          </p>
        </section>

      </div>

      <footer className={styles.footer}>
        <p>&copy; {new Date().getFullYear()} Strapped AI. All rights reserved. Apex Legal AI is a product of Strapped AI.</p>
        <Link to="/" className={styles.backLink}>Back to Home</Link>
      </footer>
    </div>
  )
}
