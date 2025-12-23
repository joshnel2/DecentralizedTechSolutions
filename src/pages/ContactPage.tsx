import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail, Phone, MapPin, Clock, Check } from 'lucide-react'
import styles from './PublicPages.module.css'

export function ContactPage() {
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navContent}>
          <Link to="/" className={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 28H4L16 4Z" fill="url(#contactGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
              <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
              <defs>
                <linearGradient id="contactGrad" x1="16" y1="4" x2="16" y2="28">
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
        <h1>Contact Us</h1>
        <p>Have questions? We'd love to hear from you. Our team is here to help.</p>
      </header>

      <div className={styles.content}>
        <div className={styles.contactGrid}>
          <div className={styles.contactInfo}>
            <div className={styles.contactItem}>
              <Mail size={24} />
              <div>
                <h3>Email</h3>
                <p>hello@apexlegal.com</p>
                <p>support@apexlegal.com</p>
              </div>
            </div>
            <div className={styles.contactItem}>
              <Phone size={24} />
              <div>
                <h3>Phone</h3>
                <p>Sales: (555) 123-4567</p>
                <p>Support: (555) 123-4568</p>
              </div>
            </div>
            <div className={styles.contactItem}>
              <MapPin size={24} />
              <div>
                <h3>Address</h3>
                <p>123 Legal Tech Way</p>
                <p>San Francisco, CA 94105</p>
              </div>
            </div>
            <div className={styles.contactItem}>
              <Clock size={24} />
              <div>
                <h3>Business Hours</h3>
                <p>Monday - Friday: 9am - 6pm PT</p>
                <p>24/7 support for Enterprise plans</p>
              </div>
            </div>
          </div>

          <div>
            {submitted ? (
              <div className={styles.card} style={{ textAlign: 'center', padding: '3rem' }}>
                <div style={{ 
                  width: 64, height: 64, background: 'rgba(16, 185, 129, 0.1)', 
                  borderRadius: '50%', display: 'flex', alignItems: 'center', 
                  justifyContent: 'center', margin: '0 auto 1rem', color: 'var(--apex-success)' 
                }}>
                  <Check size={32} />
                </div>
                <h3 style={{ marginBottom: '0.5rem' }}>Message Sent!</h3>
                <p>Thank you for reaching out. We'll get back to you within 24 hours.</p>
              </div>
            ) : (
              <form className={styles.contactForm} onSubmit={handleSubmit}>
                <div className={styles.formGroup}>
                  <label>Name</label>
                  <input type="text" placeholder="Your name" required />
                </div>
                <div className={styles.formGroup}>
                  <label>Email</label>
                  <input type="email" placeholder="you@lawfirm.com" required />
                </div>
                <div className={styles.formGroup}>
                  <label>Subject</label>
                  <select required>
                    <option value="">Select a topic</option>
                    <option value="sales">Sales Inquiry</option>
                    <option value="support">Technical Support</option>
                    <option value="billing">Billing Question</option>
                    <option value="partnership">Partnership Opportunity</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Message</label>
                  <textarea rows={5} placeholder="How can we help?" required />
                </div>
                <button type="submit" className={styles.submitBtn}>
                  <Mail size={18} />
                  Send Message
                </button>
              </form>
            )}
          </div>
        </div>
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
