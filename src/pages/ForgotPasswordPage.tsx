import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail, CheckCircle, AlertCircle } from 'lucide-react'
import styles from './AuthPages.module.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send reset email')
      }

      setIsSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={styles.authPage}>
      {/* Background Effects */}
      <div className={styles.bgEffects}>
        <div className={styles.gradientOrb1} />
        <div className={styles.gradientOrb2} />
        <div className={styles.gridOverlay} />
      </div>

      {/* Mobile Header with Logo */}
      <div className={styles.mobileHeader}>
        <div className={styles.logo}>
          <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
            <path d="M16 4L28 28H4L16 4Z" fill="url(#mobileGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
            <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
            <defs>
              <linearGradient id="mobileGrad" x1="16" y1="4" x2="16" y2="28">
                <stop stopColor="#FBBF24"/>
                <stop offset="1" stopColor="#F59E0B"/>
              </linearGradient>
            </defs>
          </svg>
          <span className={styles.logoText}>Apex</span>
        </div>
      </div>

      {/* Left Side - Branding */}
      <div className={styles.brandSide}>
        <div className={styles.brandContent}>
          <div className={styles.logo}>
            <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 28H4L16 4Z" fill="url(#forgotGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
              <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
              <defs>
                <linearGradient id="forgotGrad" x1="16" y1="4" x2="16" y2="28">
                  <stop stopColor="#FBBF24"/>
                  <stop offset="1" stopColor="#F59E0B"/>
                </linearGradient>
              </defs>
            </svg>
            <span className={styles.logoText}>Apex</span>
          </div>
          
          <h1 className={styles.brandTitle}>
            Password recovery made simple.
          </h1>
          
          <p className={styles.brandSubtitle}>
            Enter your email address and we'll send you a secure link to reset your password.
            The link will expire in 1 hour for your security.
          </p>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className={styles.formSide}>
        <div className={styles.formContainer}>
          {!isSubmitted ? (
            <>
              <div className={styles.formHeader}>
                <h2>Forgot password?</h2>
                <p>No worries, we'll send you reset instructions.</p>
              </div>

              {error && (
                <div className={styles.errorAlert}>
                  <AlertCircle size={18} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.inputGroup}>
                  <label htmlFor="email">Email address</label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@lawfirm.com"
                    required
                    autoFocus
                  />
                </div>

                <button 
                  type="submit" 
                  className={styles.submitBtn}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className={styles.spinner} />
                  ) : (
                    <>
                      <Mail size={18} />
                      Send reset link
                    </>
                  )}
                </button>
              </form>

              <div className={styles.signupPrompt}>
                <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <ArrowLeft size={16} />
                  Back to login
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className={styles.formHeader} style={{ textAlign: 'center' }}>
                <div style={{ 
                  width: '64px', 
                  height: '64px', 
                  borderRadius: '50%', 
                  background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.05) 100%)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px'
                }}>
                  <CheckCircle size={32} color="#22C55E" />
                </div>
                <h2>Check your email</h2>
                <p style={{ marginTop: '12px' }}>
                  We sent a password reset link to<br />
                  <strong style={{ color: '#F59E0B' }}>{email}</strong>
                </p>
              </div>

              <div style={{ 
                padding: '16px', 
                background: 'var(--border-primary)', 
                borderRadius: '8px',
                marginTop: '24px'
              }}>
                <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6', margin: 0 }}>
                  Didn't receive the email? Check your spam folder, or{' '}
                  <button 
                    onClick={() => {
                      setIsSubmitted(false)
                      setEmail('')
                    }}
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      color: '#F59E0B', 
                      cursor: 'pointer',
                      padding: 0,
                      font: 'inherit'
                    }}
                  >
                    try another email address
                  </button>.
                </p>
              </div>

              <div className={styles.signupPrompt} style={{ marginTop: '32px' }}>
                <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <ArrowLeft size={16} />
                  Back to login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
