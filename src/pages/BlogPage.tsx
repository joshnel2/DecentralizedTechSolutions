import { Link } from 'react-router-dom'
import { ArrowLeft, FileText, Sparkles, Scale, Clock } from 'lucide-react'
import styles from './PublicPages.module.css'

export function BlogPage() {
  const posts = [
    {
      title: "How AI is Transforming Legal Research",
      excerpt: "Discover how modern AI tools are helping attorneys find relevant case law faster and more accurately than ever before.",
      date: "December 5, 2025",
      category: "AI & Technology",
      icon: Sparkles
    },
    {
      title: "Best Practices for Legal Time Tracking",
      excerpt: "Learn strategies to capture more billable time and improve your firm's revenue with better time tracking habits.",
      date: "December 1, 2025",
      category: "Billing",
      icon: Clock
    },
    {
      title: "Understanding Trust Accounting Compliance",
      excerpt: "A comprehensive guide to IOLTA requirements and how to stay compliant with state bar regulations.",
      date: "November 28, 2025",
      category: "Compliance",
      icon: Scale
    },
    {
      title: "The Future of Client Communication",
      excerpt: "How client portals and secure messaging are changing the way law firms interact with their clients.",
      date: "November 22, 2025",
      category: "Client Relations",
      icon: FileText
    },
    {
      title: "Maximizing Efficiency with Document Automation",
      excerpt: "Reduce document drafting time by up to 80% with smart templates and automated workflows.",
      date: "November 15, 2025",
      category: "Productivity",
      icon: FileText
    },
    {
      title: "Cybersecurity Essentials for Law Firms",
      excerpt: "Protect your firm and clients with these essential security practices for modern legal practices.",
      date: "November 10, 2025",
      category: "Security",
      icon: Scale
    }
  ]

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navContent}>
          <Link to="/" className={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 28H4L16 4Z" fill="url(#blogGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
              <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
              <defs>
                <linearGradient id="blogGrad" x1="16" y1="4" x2="16" y2="28">
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
        <h1>Blog</h1>
        <p>Insights, tips, and best practices for modern legal practice management.</p>
      </header>

      <div className={styles.content}>
        <div className={styles.blogGrid}>
          {posts.map((post, i) => (
            <div key={i} className={styles.blogCard}>
              <div className={styles.blogImage}>
                <post.icon size={48} />
              </div>
              <div className={styles.blogContent}>
                <div className={styles.blogMeta}>{post.date} • {post.category}</div>
                <h3>{post.title}</h3>
                <p>{post.excerpt}</p>
              </div>
            </div>
          ))}
        </div>

        <section className={styles.section}>
          <h2>Subscribe to Our Newsletter</h2>
          <p>
            Get the latest articles, product updates, and legal tech insights delivered to your inbox monthly.
          </p>
          <form className={styles.contactForm} style={{ maxWidth: 500 }} onSubmit={(e) => e.preventDefault()}>
            <div className={styles.formGroup}>
              <label>Email Address</label>
              <input type="email" placeholder="you@lawfirm.com" />
            </div>
            <button type="submit" className={styles.submitBtn}>Subscribe</button>
          </form>
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
