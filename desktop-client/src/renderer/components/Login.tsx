import React, { useState, useEffect } from 'react';
import '../styles/Login.css';

interface LoginProps {
  onSuccess: () => void;
}

function Login({ onSuccess }: LoginProps) {
  const [loginMethod, setLoginMethod] = useState<'credentials' | 'code'>('code');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [connectionCode, setConnectionCode] = useState('');
  const [serverUrl, setServerUrl] = useState('https://api.apexlegal.com');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Check for connection token in URL (deep link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const server = params.get('server');
    
    if (token) {
      if (server) setServerUrl(server);
      handleTokenConnect(token);
    }
  }, []);

  const handleTokenConnect = async (token: string) => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${serverUrl}/api/desktop-client/validate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          deviceName: 'Desktop Client',
          platform: window.platform?.os || 'windows',
          version: '1.0.0',
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        // Save credentials and connect
        await window.apexDrive.auth.login({
          email: result.user.email,
          password: '', // Token auth doesn't need password
          serverUrl: result.serverUrl || serverUrl,
        });
        onSuccess();
      } else {
        setError(result.error || 'Invalid or expired connection token');
      }
    } catch (err) {
      setError('Failed to connect. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${serverUrl}/api/desktop-client/validate-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: connectionCode.toUpperCase().trim(),
          deviceName: 'Desktop Client',
          platform: window.platform?.os || 'windows',
          version: '1.0.0',
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        // Save the token and connect
        const loginResult = await window.apexDrive.auth.login({
          email: result.user.email,
          password: result.token, // Use token as password for internal auth
          serverUrl: result.serverUrl || serverUrl,
        });
        
        if (loginResult.success) {
          onSuccess();
        } else {
          setError(loginResult.error || 'Connection failed');
        }
      } else {
        setError(result.error || 'Invalid or expired connection code');
      }
    } catch (err) {
      setError('Failed to connect. Please check the code and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (loginMethod === 'code') {
      return handleCodeConnect(e);
    }
    
    setError('');
    setIsLoading(true);

    try {
      const result = await window.apexDrive.auth.login({
        email,
        password,
        serverUrl,
      });

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || 'Login failed. Please check your credentials.');
      }
    } catch (err) {
      setError('Connection failed. Please check your server URL.');
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
          <p>Sign in to access your legal documents</p>
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

          {/* Login Method Tabs */}
          <div className="login-tabs">
            <button
              type="button"
              className={`login-tab ${loginMethod === 'code' ? 'active' : ''}`}
              onClick={() => setLoginMethod('code')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6"/>
                <polyline points="8 6 2 12 8 18"/>
              </svg>
              Connection Code
            </button>
            <button
              type="button"
              className={`login-tab ${loginMethod === 'credentials' ? 'active' : ''}`}
              onClick={() => setLoginMethod('credentials')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Email & Password
            </button>
          </div>

          {loginMethod === 'code' ? (
            <>
              <div className="code-instructions">
                <p>Get your connection code from the Apex web app:</p>
                <ol>
                  <li>Go to <strong>Settings → Integrations</strong></li>
                  <li>Find <strong>Apex Drive Desktop</strong></li>
                  <li>Click <strong>Connect Existing Install</strong></li>
                </ol>
              </div>
              
              <div className="form-group">
                <label htmlFor="connectionCode">Connection Code</label>
                <input
                  type="text"
                  id="connectionCode"
                  value={connectionCode}
                  onChange={(e) => setConnectionCode(e.target.value.toUpperCase())}
                  placeholder="XXXXXXXX"
                  className="code-input"
                  maxLength={8}
                  required
                  autoFocus
                />
              </div>
            </>
          ) : (
            <>
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
            </>
          )}

          <button
            type="button"
            className="advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced Options
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
                placeholder="https://api.apexlegal.com"
              />
              <small>Only change this if directed by your IT administrator</small>
            </div>
          )}

          <button type="submit" className="login-button" disabled={isLoading}>
            {isLoading ? (
              <>
                <span className="button-spinner"></span>
                {loginMethod === 'code' ? 'Connecting...' : 'Signing in...'}
              </>
            ) : (
              loginMethod === 'code' ? 'Connect' : 'Sign In'
            )}
          </button>
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
