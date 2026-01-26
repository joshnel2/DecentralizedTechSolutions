import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import SyncLogs from './components/SyncLogs';
import './styles/App.css';

type View = 'login' | 'dashboard' | 'settings' | 'logs';

function App() {
  const [view, setView] = useState<View>('login');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    // Check authentication status on load
    checkAuth();
    loadAppVersion();

    // Listen for navigation events from main process
    window.apexDrive.on('navigate', (path: string) => {
      if (path === '/settings') setView('settings');
      else if (path === '/logs') setView('logs');
      else if (path === '/login') {
        setIsAuthenticated(false);
        setView('login');
      }
      else setView('dashboard');
    });
  }, []);

  const checkAuth = async () => {
    try {
      const result = await window.apexDrive.auth.check();
      setIsAuthenticated(result.authenticated);
      setView(result.authenticated ? 'dashboard' : 'login');
    } catch (error) {
      console.error('Auth check failed:', error);
      setView('login');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAppVersion = async () => {
    try {
      const version = await window.apexDrive.app.version();
      setAppVersion(version);
    } catch {
      setAppVersion('1.0.0');
    }
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setView('dashboard');
  };

  const handleLogout = async () => {
    await window.apexDrive.auth.logout();
    setIsAuthenticated(false);
    setView('login');
  };

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <img src="./assets/logo.svg" alt="Apex Drive" className="loading-logo" />
          <div className="loading-spinner"></div>
          <p>Connecting to Apex Drive...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {!isAuthenticated ? (
        <Login onSuccess={handleLoginSuccess} />
      ) : (
        <>
          <nav className="sidebar">
            <div className="sidebar-header">
              <img src="./assets/logo.svg" alt="Apex Drive" className="sidebar-logo" />
              <span className="sidebar-title">Apex Drive</span>
            </div>
            
            <ul className="sidebar-menu">
              <li className={view === 'dashboard' ? 'active' : ''}>
                <button onClick={() => setView('dashboard')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                  Dashboard
                </button>
              </li>
              <li className={view === 'logs' ? 'active' : ''}>
                <button onClick={() => setView('logs')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  Sync Logs
                </button>
              </li>
              <li className={view === 'settings' ? 'active' : ''}>
                <button onClick={() => setView('settings')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  Settings
                </button>
              </li>
            </ul>

            <div className="sidebar-footer">
              <button className="logout-btn" onClick={handleLogout}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign Out
              </button>
              <div className="version">v{appVersion}</div>
            </div>
          </nav>

          <main className="main-content">
            {view === 'dashboard' && <Dashboard />}
            {view === 'settings' && <Settings />}
            {view === 'logs' && <SyncLogs />}
          </main>
        </>
      )}
    </div>
  );
}

export default App;
