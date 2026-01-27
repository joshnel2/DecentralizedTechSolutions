import React, { useState, useEffect } from 'react';
import '../styles/Login.css';

interface LoginProps {
  onSuccess: () => void;
}

// Default server URL - can be overridden by IT admin during deployment
const DEFAULT_SERVER_URL = process.env.APEX_SERVER_URL || 'https://strappedai-gpfra9f8gsg9d9hy.canadacentral-01.azurewebsites.net';

function Login({ onSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // Check for connection token in URL (deep link from web app)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const server = params.get('server');
    
    if (token) {
      if (server) setServerUrl(server);
      handleTokenConnect(token);
    }
    
    // Load saved email if exists
    const savedEmail = localStorage.getItem('apex_saved_email');
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  // Handle deep link token connection (from web app "Connect" button)
  const handleTokenConnect = async (token: string) => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${serverUrl}/api/desktop-client/validate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          deviceName: getDeviceName(),
          platform: window.platform?.os || 'windows',
          version: '1.0.0',
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        // Save credentials and connect
        const loginResult = await window.apexDrive.auth.login({
          email: result.user.email,
          password: result.token,
          serverUrl: result.serverUrl || serverUrl,
        });
        
        if (loginResult.success) {
          onSuccess();
        } else {
          setError('Connection failed. Please try logging in manually.');
        }
      } else {
        setError(result.error || 'Invalid or expired connection link. Please log in manually.');
      }
    } catch (err) {
      setError('Connection failed. Please log in manually.');
    } finally {
      setIsLoading(false);
    }
  };

  const getDeviceName = () => {
    // Try to get a meaningful device name
    return `${window.platform?.os || 'Windows'} Desktop`;
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
          <p>Sign in with your Apex account to access your matters</p>
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
            <label htmlFor="email">Email</label>
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

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
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
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>

          <button
            type="button"
            className="advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? 'Hide' : 'Show'} Server Settings
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={showAdvanced ? 'rotated' : ''}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {showAdvanced && (
            <div className="form-group advanced">
              <label htmlFor="serverUrl">Server URL</label>
              <input
                type="url"
                id="serverUrl"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://strappedai.com"
              />
              <small>Only change this if directed by your IT administrator</small>
            </div>
          )}
        </form>

        <div className="login-footer">
          <p>Need help? Contact your firm administrator</p>
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
