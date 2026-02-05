import { useState, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, ArrowLeft, CheckCircle, AlertCircle, XCircle, Loader2 } from 'lucide-react'
import styles from './AuthPages.module.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(true)
  const [isTokenValid, setIsTokenValid] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState('')

  // Verify token on mount
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setIsVerifying(false)
        setIsTokenValid(false)
        return
      }

      try {
        const response = await fetch(`${API_URL}/auth/verify-reset-token?token=${encodeURIComponent(token)}`)
        const data = await response.json()
        
        setIsTokenValid(data.valid)
        if (data.firstName) {
          setFirstName(data.firstName)
        }
      } catch (err) {
        console.error('Token verification error:', err)
        setIsTokenValid(false)
      } finally {
        setIsVerifying(false)
      }
    }

    verifyToken()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    // Validate password length
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, newPassword: password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password')
      }

      setIsSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  // Loading state while verifying token
  if (isVerifying) {
    return (
      <div className={styles.authPage}>
        <div className={styles.bgEffects}>
          <div className={styles.gradientOrb1} />
          <div className={styles.gradientOrb2} />
          <div className={styles.gridOverlay} />
        </div>
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          position: 'relative',
          zIndex: 1 
        }}>
          <div style={{ textAlign: 'center' }}>
            <Loader2 size={48} color="#F59E0B" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#94a3b8', marginTop: '16px' }}>Verifying your reset link...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      </div>
    )
  }

  // Invalid or missing token
  if (!token || !isTokenValid) {
    return (
      <div className={styles.authPage}>
        <div className={styles.bgEffects}>
          <div className={styles.gradientOrb1} />
          <div className={styles.gradientOrb2} />
          <div className={styles.gridOverlay} />
        </div>
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          position: 'relative',
          zIndex: 1,
          padding: '20px'
        }}>
          <div style={{ textAlign: 'center', maxWidth: '400px' }}>
            <div style={{ 
              width: '64px', 
              height: '64px', 
              borderRadius: '50%', 
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px'
            }}>
              <XCircle size={32} color="#EF4444" />
            </div>
            <h2 style={{ color: '#fff', fontSize: '24px', marginBottom: '12px' }}>
              Invalid or Expired Link
            </h2>
            <p style={{ color: '#94a3b8', lineHeight: '1.6', marginBottom: '32px' }}>
              This password reset link is invalid or has expired. Reset links are only valid for 1 hour.
              Please request a new one.
            </p>
            <Link 
              to="/forgot-password" 
              className={styles.submitBtn}
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              Request new link
              <ArrowRight size={18} />
            </Link>
            <div style={{ marginTop: '24px' }}>
              <Link to="/login" style={{ color: '#F59E0B', fontSize: '14px' }}>
                <ArrowLeft size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                Back to login
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Success state
  if (isSuccess) {
    return (
      <div className={styles.authPage}>
        <div className={styles.bgEffects}>
          <div className={styles.gradientOrb1} />
          <div className={styles.gradientOrb2} />
          <div className={styles.gridOverlay} />
        </div>
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          position: 'relative',
          zIndex: 1,
          padding: '20px'
        }}>
          <div style={{ textAlign: 'center', maxWidth: '400px' }}>
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
            <h2 style={{ color: '#fff', fontSize: '24px', marginBottom: '12px' }}>
              Password Reset Complete
            </h2>
            <p style={{ color: '#94a3b8', lineHeight: '1.6', marginBottom: '32px' }}>
              Your password has been reset successfully. You can now log in with your new password.
            </p>
            <button 
              onClick={() => navigate('/login')}
              className={styles.submitBtn}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              Continue to login
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    )
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
              <path d="M16 4L28 28H4L16 4Z" fill="url(#resetGrad)" stroke="#F59E0B" strokeWidth="1.5"/>
              <circle cx="16" cy="19" r="3" fill="#0B0F1A"/>
              <defs>
                <linearGradient id="resetGrad" x1="16" y1="4" x2="16" y2="28">
                  <stop stopColor="#FBBF24"/>
                  <stop offset="1" stopColor="#F59E0B"/>
                </linearGradient>
              </defs>
            </svg>
            <span className={styles.logoText}>Apex</span>
          </div>
          
          <h1 className={styles.brandTitle}>
            Create a new password.
          </h1>
          
          <p className={styles.brandSubtitle}>
            Choose a strong password that you haven't used before. 
            Your password should be at least 8 characters long.
          </p>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className={styles.formSide}>
        <div className={styles.formContainer}>
          <div className={styles.formHeader}>
            <h2>Set new password</h2>
            <p>
              {firstName ? `Hi ${firstName}, ` : ''}
              Enter your new password below.
            </p>
          </div>

          {error && (
            <div className={styles.errorAlert}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
              <label htmlFor="password">New password</label>
              <div className={styles.passwordInput}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  required
                  minLength={8}
                  autoFocus
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="confirmPassword">Confirm password</label>
              <div className={styles.passwordInput}>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Password requirements hint */}
            <div style={{ 
              padding: '12px', 
              background: 'rgba(255, 255, 255, 0.03)', 
              borderRadius: '8px',
              fontSize: '13px',
              color: '#64748b'
            }}>
              <p style={{ margin: '0 0 8px', fontWeight: 500, color: '#94a3b8' }}>Password requirements:</p>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                <li style={{ color: password.length >= 8 ? '#22C55E' : '#64748b' }}>
                  At least 8 characters
                </li>
                <li style={{ color: password === confirmPassword && password.length > 0 ? '#22C55E' : '#64748b' }}>
                  Passwords match
                </li>
              </ul>
            </div>

            <button 
              type="submit" 
              className={styles.submitBtn}
              disabled={isLoading || password.length < 8 || password !== confirmPassword}
            >
              {isLoading ? (
                <span className={styles.spinner} />
              ) : (
                <>
                  Reset password
                  <ArrowRight size={18} />
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
        </div>
      </div>
    </div>
  )
}
