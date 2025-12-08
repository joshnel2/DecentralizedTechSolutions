import { Link } from 'react-router-dom'
import { ArrowLeft, Scale, Users, Target, Award } from 'lucide-react'
import styles from './PublicPages.module.css'

export function AboutPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navContent}>
          <Link to="/" className={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 28H4L16 4Z" fill="url(#aboutGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
              <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
              <defs>
                <linearGradient id="aboutGrad" x1="16" y1="4" x2="16" y2="28">
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
        <h1>About Apex</h1>
        <p>We're building the future of legal practice management, powered by AI and designed for modern law firms.</p>
      </header>

      <div className={styles.content}>
        <section className={styles.section}>
          <h2>Our Mission</h2>
          <p>
            At Apex, we believe that legal professionals deserve technology that works as hard as they do. 
            Our mission is to empower law firms with intelligent, intuitive software that streamlines operations, 
            enhances client service, and drives profitability.
          </p>
          <p>
            We're not just building another practice management tool—we're creating an AI-native platform that 
            understands the unique challenges of legal work and provides smart solutions that save time and reduce errors.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Our Values</h2>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Scale size={24} /></div>
              <h3>Excellence</h3>
              <p>We hold ourselves to the highest standards, just like the legal professionals we serve.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Users size={24} /></div>
              <h3>Client Focus</h3>
              <p>Every feature we build is designed with our users' needs at the forefront.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Target size={24} /></div>
              <h3>Innovation</h3>
              <p>We leverage cutting-edge AI to solve real problems in legal practice management.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon}><Award size={24} /></div>
              <h3>Integrity</h3>
              <p>Security and confidentiality are at the core of everything we do.</p>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Our Story</h2>
          <p>
            Apex was founded by legal technology veterans who saw firsthand the challenges that law firms face 
            with outdated software systems. After years of working with firms of all sizes, we recognized an 
            opportunity to build something better—a platform that combines powerful practice management tools 
            with the latest advances in artificial intelligence.
          </p>
          <p>
            Today, Apex serves law firms across the country, helping them work smarter, bill more accurately, 
            and deliver exceptional service to their clients. Our team includes experts in legal technology, 
            artificial intelligence, security, and user experience design.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Why Choose Apex?</h2>
          <ul className={styles.featureList}>
            <li>
              <Scale size={20} />
              <div>
                <strong>Built for Legal</strong>
                <p>Purpose-built for law firms, not adapted from generic business software.</p>
              </div>
            </li>
            <li>
              <Target size={20} />
              <div>
                <strong>AI-Native Platform</strong>
                <p>Azure OpenAI integration provides intelligent assistance throughout your workflow.</p>
              </div>
            </li>
            <li>
              <Award size={20} />
              <div>
                <strong>Enterprise Security</strong>
                <p>SOC 2 certified infrastructure with HIPAA compliance for sensitive matters.</p>
              </div>
            </li>
            <li>
              <Users size={20} />
              <div>
                <strong>Dedicated Support</strong>
                <p>Our team of legal tech experts is here to ensure your success.</p>
              </div>
            </li>
          </ul>
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
