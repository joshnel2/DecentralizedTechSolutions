import { useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  Sparkles, Check, ArrowRight, Scale, Clock, DollarSign, 
  FileText, Users, Calendar, Shield, Zap, BarChart3,
  ChevronRight, Star, Building2, Mail
} from 'lucide-react'
import styles from './LandingPage.module.css'

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

const plans = [
  {
    name: 'Starter',
    price: 49,
    period: 'per user/month',
    description: 'For solo practitioners getting started',
    features: [
      'Up to 50 active matters',
      'Basic time tracking',
      'Invoice generation',
      'Calendar & deadlines',
      'Document storage (10GB)',
      'Email support'
    ],
    cta: 'Book Demo',
    popular: false
  },
  {
    name: 'Professional',
    price: 99,
    period: 'per user/month',
    description: 'For growing law firms',
    features: [
      'Unlimited matters',
      'Advanced time tracking',
      'Custom invoicing',
      'Client portal',
      'Document storage (100GB)',
      'AI Assistant (500 queries/mo)',
      'Trust accounting',
      'Priority support',
      'API access'
    ],
    cta: 'Book Demo',
    popular: true
  },
  {
    name: 'Enterprise',
    price: null,
    period: 'custom pricing',
    description: 'For large firms with advanced needs',
    features: [
      'Everything in Professional',
      'Unlimited AI queries',
      'Custom integrations',
      'Dedicated account manager',
      'SSO / SAML authentication',
      'Advanced security & compliance',
      'Custom training',
      'SLA guarantee',
      'On-premise option'
    ],
    cta: 'Contact Sales',
    popular: false
  }
]

const testimonials = [
  {
    quote: "Apex has transformed how we manage our practice. The AI features alone save us 10+ hours per week.",
    author: "Sarah Mitchell",
    title: "Partner, Mitchell & Associates",
    rating: 5
  },
  {
    quote: "Finally, a legal practice management system that actually understands how modern firms work.",
    author: "James Chen",
    title: "Managing Partner, Chen Law Group",
    rating: 5
  },
  {
    quote: "The billing features are incredible. We've reduced our AR by 40% since switching to Apex.",
    author: "Maria Rodriguez",
    title: "Founder, Rodriguez Legal",
    rating: 5
  }
]

export function LandingPage() {
  const [showContactModal, setShowContactModal] = useState(false)

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
            <a href="#pricing">Pricing</a>
            <a href="#testimonials">Testimonials</a>
            <button onClick={() => setShowContactModal(true)} className={styles.contactBtn}>
              Contact Sales
            </button>
          </div>
          <div className={styles.navActions}>
            <Link to="/login" className={styles.loginLink}>Sign In</Link>
            <button onClick={() => setShowContactModal(true)} className={styles.ctaBtn}>
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
            <button onClick={() => setShowContactModal(true)} className={styles.primaryBtn}>
              Book Demo
              <ArrowRight size={18} />
            </button>
            <Link to="/login" className={styles.secondaryBtn}>
              Sign In
              <ArrowRight size={18} />
            </Link>
          </div>
          <div className={styles.heroStats}>
            <div>
              <span className={styles.statNumber}>2,500+</span>
              <span className={styles.statLabel}>Law Firms</span>
            </div>
            <div>
              <span className={styles.statNumber}>$1.2B</span>
              <span className={styles.statLabel}>Billed Through Apex</span>
            </div>
            <div>
              <span className={styles.statNumber}>99.9%</span>
              <span className={styles.statLabel}>Uptime SLA</span>
            </div>
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
              <div className={styles.previewStats}>
                <div><strong>24</strong>Active Matters</div>
                <div><strong>$125k</strong>This Month</div>
                <div><strong>156h</strong>Billable Hours</div>
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
                Find recent case law on trade secret misappropriation in California
              </div>
            </div>
            <div className={styles.chatMessage}>
              <div className={styles.aiMessage}>
                <div className={styles.aiAvatar}><Sparkles size={14} /></div>
                <div>
                  <strong>Found 12 relevant cases:</strong>
                  <p>1. <em>Waymo v. Uber</em> (N.D. Cal. 2018) - Key precedent on...</p>
                  <p>2. <em>Cadence v. Avant!</em> (Cal. Ct. App. 2002) - Established...</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className={styles.pricing}>
        <div className={styles.sectionHeader}>
          <h2>Simple, transparent pricing</h2>
          <p>Choose the plan that's right for your firm</p>
        </div>
        <div className={styles.pricingGrid}>
          {plans.map((plan, i) => (
            <div key={i} className={`${styles.pricingCard} ${plan.popular ? styles.popular : ''}`}>
              {plan.popular && <div className={styles.popularBadge}>Most Popular</div>}
              <h3>{plan.name}</h3>
              <div className={styles.priceRow}>
                {plan.price ? (
                  <>
                    <span className={styles.price}>${plan.price}</span>
                    <span className={styles.period}>{plan.period}</span>
                  </>
                ) : (
                  <span className={styles.customPrice}>Custom</span>
                )}
              </div>
              <p className={styles.planDesc}>{plan.description}</p>
              <ul className={styles.planFeatures}>
                {plan.features.map((feature, j) => (
                  <li key={j}>
                    <Check size={16} />
                    {feature}
                  </li>
                ))}
              </ul>
              <button onClick={() => setShowContactModal(true)} className={plan.popular ? styles.planBtn : styles.planBtnOutline}>
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className={styles.testimonials}>
        <div className={styles.sectionHeader}>
          <h2>Trusted by leading firms</h2>
          <p>See what legal professionals are saying about Apex</p>
        </div>
        <div className={styles.testimonialsGrid}>
          {testimonials.map((t, i) => (
            <div key={i} className={styles.testimonialCard}>
              <div className={styles.stars}>
                {[...Array(t.rating)].map((_, j) => (
                  <Star key={j} size={16} fill="#F59E0B" color="#F59E0B" />
                ))}
              </div>
              <p>"{t.quote}"</p>
              <div className={styles.testimonialAuthor}>
                <div className={styles.authorAvatar}>
                  {t.author.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <strong>{t.author}</strong>
                  <span>{t.title}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaContent}>
          <h2>Ready to transform your practice?</h2>
          <p>Join 2,500+ law firms already using Apex to work smarter.</p>
          <div className={styles.ctaActions}>
            <button onClick={() => setShowContactModal(true)} className={styles.primaryBtn}>
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
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
              <a href="#">Security</a>
              <a href="#">Integrations</a>
            </div>
            <div>
              <h4>Company</h4>
              <a href="#">About</a>
              <a href="#">Careers</a>
              <a href="#">Blog</a>
              <a href="#">Contact</a>
            </div>
            <div>
              <h4>Resources</h4>
              <a href="#">Documentation</a>
              <a href="#">API Reference</a>
              <a href="#">Support</a>
              <a href="#">Status</a>
            </div>
            <div>
              <h4>Legal</h4>
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
              <a href="#">Security</a>
              <a href="#">Compliance</a>
            </div>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <p>© 2024 Apex Legal Technologies. All rights reserved.</p>
        </div>
      </footer>

      {/* Contact Sales Modal */}
      {showContactModal && (
        <ContactSalesModal onClose={() => setShowContactModal(false)} />
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
