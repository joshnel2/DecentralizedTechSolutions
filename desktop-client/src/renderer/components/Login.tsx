import React, { useState, useEffect } from 'react';
import '../styles/Login.css';

interface LoginProps {
  onSuccess: () => void;
}

function Login({ onSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [serverUrl, setServerUrl] = useState('');

  useEffect(() => {
    // Load saved email and server URL from config
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      // Get server URL from config
      const config = await window.apexDrive.config.get();
      if (config.serverUrl) {
        setServerUrl(config.serverUrl);
      }
      
      // Load saved email if exists
      const savedEmail = localStorage.getItem('apex_saved_email');
      if (savedEmail) {
        setEmail(savedEmail);
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Save email for next time if remember me is checked
    if (rememberMe) {
      localStorage.setItem('apex_saved_email', email);
    } else {
      localStorage.removeItem('apex_saved_email');
    }

    try {
      const result = await window.apexDrive.auth.login({
        email,
        password,
        serverUrl,
      });

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || 'Invalid email or password. Please try again.');
      }
    } catch (err) {
      setError('Unable to connect to server. Please check your internet connection.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="48" height="48" rx="10" fill="#2563eb"/>
              <path d="M24 12L36 30H12L24 12Z" fill="white"/>
              <path d="M24 20L30 30H18L24 20Z" fill="#2563eb"/>
            </svg>
          </div>
          <h1>Apex Drive</h1>
          <p className="login-subtitle">Secure Document Management</p>
          <p className="login-description">Sign in with your Apex Legal account to access your firm's documents</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="error-message">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@lawfirm.com"
              required
              autoFocus
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember my email</span>
            </label>
          </div>

          <button type="submit" className="login-button" disabled={isLoading}>
            {isLoading ? (
              <>
                <span className="button-spinner"></span>
                Signing in securely...
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="lock-icon">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                Sign In Securely
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          <div className="security-badges">
            <span className="security-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              256-bit Encryption
            </span>
            <span className="security-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Secure Connection
            </span>
          </div>
          <p className="help-text">Need help? Contact your firm administrator</p>
        </div>
      </div>

      <div className="login-background">
        <div className="bg-shape shape-1"></div>
        <div className="bg-shape shape-2"></div>
        <div className="bg-shape shape-3"></div>
      </div>
    </div>
  );
}

export default Login;
