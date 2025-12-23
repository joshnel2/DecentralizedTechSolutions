import { useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  Sparkles, Check, ArrowRight, Scale, Clock, DollarSign, 
  FileText, Users, Calendar, Shield, Zap, BarChart3,
  ChevronRight, Building2, Mail, Lock, BadgeCheck
} from 'lucide-react'
import styles from './LandingPage.module.css'

// Footer navigation links
const footerLinks = {
  product: [
    { label: 'Features', href: '#features', isAnchor: true },
    { label: 'Security', href: '/security' },
    { label: 'Integrations', href: '/integrations' },
  ],
  company: [
    { label: 'About', href: '/about' },
    { label: 'Blog', href: '/blog' },
    { label: 'Contact', href: '/contact' },
  ],
  resources: [
    { label: 'Documentation', href: '/docs' },
    { label: 'API Reference', href: '/api' },
    { label: 'Support', href: '/support' },
    { label: 'Status', href: '/status' },
  ],
  legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Compliance', href: '/compliance' },
  ],
}

const features = [
  { icon: Scale, title: 'Matter Management', desc: 'Track cases, deadlines, and court dates in one place' },
  { icon: Clock, title: 'Time Tracking', desc: 'Effortless time capture with AI-powered suggestions' },
  { icon: DollarSign, title: 'Billing & Invoicing', desc: 'Flexible billing: hourly, flat fee, contingency' },
  { icon: FileText, title: 'Document Management', desc: 'Secure storage with AI-powered summaries' },
  { icon: Users, title: 'Client Portal', desc: 'Keep clients informed with self-service access' },
  { icon: Calendar, title: 'Calendar & Deadlines', desc: 'Never miss a court date or filing deadline' },
  { icon: Shield, title: 'Trust Accounting', desc: 'IOLTA-compliant trust account management' },
  { icon: Zap, title: 'AI Assistant', desc: 'Research, draft, and analyze with Azure OpenAI' },
  { icon: BarChart3, title: 'Reports & Analytics', desc: 'Real-time insights into firm performance' }
]

export function LandingPage() {
  const [showContactModal, setShowContactModal] = useState(false)
  const [showBookingModal, setShowBookingModal] = useState(false)

  return (
    <div className={styles.landing}>
      {/* Navigation */}
      <nav className={styles.nav}>
        <div className={styles.navContent}>
          <div className={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 28H4L16 4Z" fill="url(#landingGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
              <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
              <defs>
                <linearGradient id="landingGrad" x1="16" y1="4" x2="16" y2="28">
                  <stop stopColor="#FBBF24"/>
                  <stop offset="1" stopColor="#F59E0B"/>
                </linearGradient>
              </defs>
            </svg>
            <span>Apex</span>
          </div>
          <div className={styles.navLinks}>
            <a href="#features">Features</a>
            <button onClick={() => setShowContactModal(true)} className={styles.contactBtn}>
              Contact Sales
            </button>
          </div>
          <div className={styles.navActions}>
            <Link to="/login" className={styles.loginLink}>Sign In</Link>
            <button className={styles.ctaBtn} onClick={() => setShowBookingModal(true)}>
              Book Demo
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <Sparkles size={14} />
            AI-Native Legal Practice Management
          </div>
          <h1>
            The future of law firm management is <span className={styles.highlight}>intelligent</span>
          </h1>
          <p>
            Apex combines powerful practice management tools with Azure OpenAI to help 
            modern law firms work smarter, bill more, and serve clients better.
          </p>
          <div className={styles.heroActions}>
            <button className={styles.primaryBtn} onClick={() => setShowBookingModal(true)}>
              Book Demo
              <ArrowRight size={18} />
            </button>
            <Link to="/login" className={styles.secondaryBtn}>
              Sign In
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
        <div className={styles.heroVisual}>
          <div className={styles.dashboardPreview}>
            <div className={styles.previewHeader}>
              <div className={styles.previewDots}>
                <span></span><span></span><span></span>
              </div>
              <span>Dashboard</span>
            </div>
            <div className={styles.previewContent}>
              <div className={styles.previewCard}>
                <Sparkles size={20} />
                <span>AI Assistant Ready</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className={styles.features}>
        <div className={styles.sectionHeader}>
          <h2>Everything your firm needs</h2>
          <p>Comprehensive tools designed specifically for legal professionals</p>
        </div>
        <div className={styles.featuresGrid}>
          {features.map((feature, i) => (
            <div key={i} className={styles.featureCard}>
              <div className={styles.featureIcon}>
                <feature.icon size={24} />
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* AI Section */}
      <section className={styles.aiSection}>
        <div className={styles.aiContent}>
          <div className={styles.aiBadge}>
            <Sparkles size={14} />
            Powered by Azure OpenAI
          </div>
          <h2>AI that actually understands legal work</h2>
          <p>
            Our AI assistant is trained to help with legal research, document drafting, 
            contract analysis, and more. It's like having a brilliant associate available 24/7.
          </p>
          <ul className={styles.aiFeatures}>
            <li><Check size={18} /> Legal research and case law analysis</li>
            <li><Check size={18} /> Contract review and clause suggestions</li>
            <li><Check size={18} /> Motion and brief drafting assistance</li>
            <li><Check size={18} /> Time entry suggestions from activity</li>
            <li><Check size={18} /> Document summarization</li>
            <li><Check size={18} /> Deadline and risk identification</li>
          </ul>
          <button onClick={() => setShowContactModal(true)} className={styles.aiCta}>
            See AI in Action
            <ChevronRight size={18} />
          </button>
        </div>
        <div className={styles.aiVisual}>
          <div className={styles.chatPreview}>
            <div className={styles.chatMessage}>
              <div className={styles.userMessage}>
                Help me research case law on this topic
              </div>
            </div>
            <div className={styles.chatMessage}>
              <div className={styles.aiMessage}>
                <div className={styles.aiAvatar}><Sparkles size={14} /></div>
                <div>
                  <strong>AI-powered legal research</strong>
                  <p>Get instant analysis and relevant case law tailored to your needs.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value & Compliance Section */}
      <section className={styles.valueSection}>
        <div className={styles.sectionHeader}>
          <h2>Enterprise AI at a fraction of the cost</h2>
          <p>Direct integration with Azure OpenAI means lower costs and enterprise-grade security</p>
        </div>
        <div className={styles.valueGrid}>
          <div className={styles.valueCard}>
            <div className={styles.valueIcon}>
              <DollarSign size={28} />
            </div>
            <h3>Lower Cost Than Competitors</h3>
            <p>
              Our direct enterprise partnership with Azure OpenAI eliminates middleman markup. 
              You get powerful AI capabilities at a fraction of what other legal tech providers charge.
            </p>
          </div>
          <div className={styles.valueCard}>
            <div className={styles.valueIcon}>
              <BadgeCheck size={28} />
            </div>
            <h3>SOC 2 Certified Infrastructure</h3>
            <p>
              Your data is hosted on Microsoft Azure's SOC 2 Type II certified infrastructure, 
              ensuring the highest standards of security, availability, and confidentiality.
            </p>
          </div>
          <div className={styles.valueCard}>
            <div className={styles.valueIcon}>
              <Lock size={28} />
            </div>
            <h3>Fully HIPAA Compliant</h3>
            <p>
              Apex is completely HIPAA compliant, making it safe for firms handling sensitive 
              healthcare-related legal matters. Your client data is protected to the highest standards.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaContent}>
          <h2>Ready to transform your practice?</h2>
          <p>See how Apex can help your firm work smarter.</p>
          <div className={styles.ctaActions}>
            <button className={styles.primaryBtn} onClick={() => setShowBookingModal(true)}>
              Book Demo
              <ArrowRight size={18} />
            </button>
            <Link to="/login" className={styles.secondaryBtn}>
              Sign In
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerBrand}>
            <div className={styles.logo}>
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <path d="M16 4L28 28H4L16 4Z" fill="url(#footerGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
                <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
                <defs>
                  <linearGradient id="footerGrad" x1="16" y1="4" x2="16" y2="28">
                    <stop stopColor="#FBBF24"/>
                    <stop offset="1" stopColor="#F59E0B"/>
                  </linearGradient>
                </defs>
              </svg>
              <span>Apex</span>
            </div>
            <p>AI-native legal practice management for modern law firms.</p>
          </div>
          <div className={styles.footerLinks}>
            <div>
              <h4>Product</h4>
              {footerLinks.product.map((link) => (
                link.isAnchor ? (
                  <a key={link.label} href={link.href}>{link.label}</a>
                ) : (
                  <Link key={link.label} to={link.href}>{link.label}</Link>
                )
              ))}
            </div>
            <div>
              <h4>Company</h4>
              {footerLinks.company.map((link) => (
                <Link key={link.label} to={link.href}>{link.label}</Link>
              ))}
            </div>
            <div>
              <h4>Resources</h4>
              {footerLinks.resources.map((link) => (
                <Link key={link.label} to={link.href}>{link.label}</Link>
              ))}
            </div>
            <div>
              <h4>Legal</h4>
              {footerLinks.legal.map((link) => (
                <Link key={link.label} to={link.href}>{link.label}</Link>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <p>© 2025 Strapped AI. All rights reserved.</p>
        </div>
      </footer>

      {/* Contact Sales Modal */}
      {showContactModal && (
        <ContactSalesModal onClose={() => setShowContactModal(false)} />
      )}

      {/* Book Demo Modal */}
      {showBookingModal && (
        <BookDemoModal onClose={() => setShowBookingModal(false)} />
      )}
    </div>
  )
}

function ContactSalesModal({ onClose }: { onClose: () => void }) {
  const [submitted, setSubmitted] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    firmSize: '',
    message: ''
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Simulate submission
    setSubmitted(true)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>×</button>
        
        {submitted ? (
          <div className={styles.successMessage}>
            <div className={styles.successIcon}>
              <Check size={32} />
            </div>
            <h2>Thank you!</h2>
            <p>A member of our sales team will contact you within 24 hours.</p>
            <button onClick={onClose} className={styles.primaryBtn}>
              Close
            </button>
          </div>
        ) : (
          <>
            <div className={styles.modalHeader}>
              <Building2 size={24} />
              <div>
                <h2>Contact Sales</h2>
                <p>Let's discuss how Apex can help your firm</p>
              </div>
            </div>
            
            <form onSubmit={handleSubmit} className={styles.contactForm}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Full Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="John Smith"
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Work Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    placeholder="john@lawfirm.com"
                    required
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Firm Name</label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={e => setFormData({...formData, company: e.target.value})}
                    placeholder="Smith & Associates"
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                    placeholder="(555) 555-0100"
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Firm Size</label>
                <select
                  value={formData.firmSize}
                  onChange={e => setFormData({...formData, firmSize: e.target.value})}
                  required
                >
                  <option value="">Select firm size</option>
                  <option value="1">Solo practitioner</option>
                  <option value="2-5">2-5 attorneys</option>
                  <option value="6-20">6-20 attorneys</option>
                  <option value="21-50">21-50 attorneys</option>
                  <option value="51-100">51-100 attorneys</option>
                  <option value="100+">100+ attorneys</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>How can we help?</label>
                <textarea
                  value={formData.message}
                  onChange={e => setFormData({...formData, message: e.target.value})}
                  placeholder="Tell us about your firm's needs..."
                  rows={3}
                />
              </div>

              <button type="submit" className={styles.submitBtn}>
                <Mail size={18} />
                Request Demo
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

function BookDemoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.bookingModal} onClick={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>×</button>
        <div className={styles.bookingHeader}>
          <Calendar size={24} />
          <div>
            <h2>Book a Demo</h2>
            <p>Schedule a personalized walkthrough of Apex</p>
          </div>
        </div>
        <div className={styles.bookingContent}>
          <iframe 
            src="https://calendar.google.com/calendar/appointments/schedules/AcZssZ2-LCPZzddN3qpNP1e8imSpgJ3QPsJuJvqCRVGRjxUj9kAHmHGtuayCrTbNDY-2B3NDJqdVtnHb?gv=true" 
            style={{ border: 0 }} 
            width="100%" 
            height="600" 
            frameBorder="0"
            title="Book a Demo"
          />
        </div>
      </div>
    </div>
  )
}
