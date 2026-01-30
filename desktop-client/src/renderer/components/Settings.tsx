import React, { useState, useEffect } from 'react';
import '../styles/Settings.css';

interface Settings {
  driveLetter: string;
  autoStart: boolean;
  autoMount: boolean;
  startMinimized: boolean;
  serverUrl: string;
  syncInterval: number;
  cacheDir: string;
  maxCacheSize: number;
  conflictStrategy: string;
  showNotifications: boolean;
}

function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [availableLetters, setAvailableLetters] = useState<string[]>(['X', 'Y', 'Z']);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await window.apexDrive.settings.get();
      setSettings(data as Settings);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (key: keyof Settings, value: any) => {
    if (settings) {
      setSettings({ ...settings, [key]: value });
      setSaved(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    
    setIsSaving(true);
    try {
      await window.apexDrive.settings.set(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectCacheDir = async () => {
    const result = await window.apexDrive.settings.selectCacheDir();
    if (result.path) {
      handleChange('cacheDir', result.path);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 GB';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  const parseBytes = (gb: number): number => {
    return gb * 1024 * 1024 * 1024;
  };

  if (isLoading || !settings) {
    return (
      <div className="settings loading">
        <div className="loading-spinner large"></div>
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="settings">
      <header className="settings-header">
        <h1>Settings</h1>
        <button
          className="btn btn-primary save-btn"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <span className="button-spinner"></span>
              Saving...
            </>
          ) : saved ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Saved
            </>
          ) : (
            'Save Changes'
          )}
        </button>
      </header>

      <div className="settings-content">
        {/* Drive Settings */}
        <section className="settings-section">
          <h2>Drive Settings</h2>
          
          <div className="setting-group">
            <label htmlFor="driveLetter">Drive Letter</label>
            <select
              id="driveLetter"
              value={settings.driveLetter}
              onChange={(e) => handleChange('driveLetter', e.target.value)}
            >
              {availableLetters.map((letter) => (
                <option key={letter} value={letter}>
                  {letter}:
                </option>
              ))}
            </select>
            <span className="setting-help">
              The drive letter to use for Apex Drive in Windows Explorer
            </span>
          </div>

          <div className="setting-group checkbox">
            <label>
              <input
                type="checkbox"
                checked={settings.autoMount}
                onChange={(e) => handleChange('autoMount', e.target.checked)}
              />
              <span className="checkbox-label">Auto-mount drive on startup</span>
            </label>
            <span className="setting-help">
              Automatically mount the drive when Apex Drive starts
            </span>
          </div>
        </section>

        {/* Startup Settings */}
        <section className="settings-section">
          <h2>Startup</h2>
          
          <div className="setting-group checkbox">
            <label>
              <input
                type="checkbox"
                checked={settings.autoStart}
                onChange={(e) => handleChange('autoStart', e.target.checked)}
              />
              <span className="checkbox-label">Start with Windows</span>
            </label>
            <span className="setting-help">
              Launch Apex Drive automatically when you log in
            </span>
          </div>

          <div className="setting-group checkbox">
            <label>
              <input
                type="checkbox"
                checked={settings.startMinimized}
                onChange={(e) => handleChange('startMinimized', e.target.checked)}
              />
              <span className="checkbox-label">Start minimized to system tray</span>
            </label>
            <span className="setting-help">
              Start in the background without showing the main window
            </span>
          </div>
        </section>

        {/* Sync Settings */}
        <section className="settings-section">
          <h2>Synchronization</h2>
          
          <div className="setting-group">
            <label htmlFor="syncInterval">Sync Interval</label>
            <select
              id="syncInterval"
              value={settings.syncInterval}
              onChange={(e) => handleChange('syncInterval', parseInt(e.target.value))}
            >
              <option value={10000}>10 seconds</option>
              <option value={30000}>30 seconds</option>
              <option value={60000}>1 minute</option>
              <option value={300000}>5 minutes</option>
              <option value={600000}>10 minutes</option>
            </select>
            <span className="setting-help">
              How often to check for changes on the server
            </span>
          </div>

          <div className="setting-group">
            <label htmlFor="conflictStrategy">Conflict Resolution</label>
            <select
              id="conflictStrategy"
              value={settings.conflictStrategy}
              onChange={(e) => handleChange('conflictStrategy', e.target.value)}
            >
              <option value="ask">Ask me each time</option>
              <option value="local">Keep my changes</option>
              <option value="server">Use server version</option>
              <option value="both">Keep both versions</option>
            </select>
            <span className="setting-help">
              How to handle conflicts when the same file is changed in multiple places
            </span>
          </div>
        </section>

        {/* Cache Settings */}
        <section className="settings-section">
          <h2>Cache</h2>
          
          <div className="setting-group">
            <label htmlFor="cacheDir">Cache Location</label>
            <div className="input-with-button">
              <input
                type="text"
                id="cacheDir"
                value={settings.cacheDir}
                onChange={(e) => handleChange('cacheDir', e.target.value)}
                readOnly
              />
              <button className="btn btn-secondary" onClick={handleSelectCacheDir}>
                Browse
              </button>
            </div>
            <span className="setting-help">
              Local folder where files are cached for faster access
            </span>
          </div>

          <div className="setting-group">
            <label htmlFor="maxCacheSize">Maximum Cache Size</label>
            <div className="range-input">
              <input
                type="range"
                id="maxCacheSize"
                min="1"
                max="50"
                value={settings.maxCacheSize / (1024 * 1024 * 1024)}
                onChange={(e) => handleChange('maxCacheSize', parseBytes(parseInt(e.target.value)))}
              />
              <span className="range-value">{formatBytes(settings.maxCacheSize)}</span>
            </div>
            <span className="setting-help">
              Maximum disk space to use for caching files locally
            </span>
          </div>
        </section>

        {/* Notifications */}
        <section className="settings-section">
          <h2>Notifications</h2>
          
          <div className="setting-group checkbox">
            <label>
              <input
                type="checkbox"
                checked={settings.showNotifications}
                onChange={(e) => handleChange('showNotifications', e.target.checked)}
              />
              <span className="checkbox-label">Show sync notifications</span>
            </label>
            <span className="setting-help">
              Display notifications when files are synced
            </span>
          </div>
        </section>

        {/* Server Settings */}
        <section className="settings-section">
          <h2>Server Connection</h2>
          
          <div className="setting-group">
            <label htmlFor="serverUrl">Server URL</label>
            <input
              type="url"
              id="serverUrl"
              value={settings.serverUrl}
              onChange={(e) => handleChange('serverUrl', e.target.value)}
            />
            <span className="setting-help warning">
              Warning: Only change this if directed by your IT administrator
            </span>
          </div>
        </section>

        {/* Updates Section */}
        <section className="settings-section">
          <h2>Updates</h2>
          <UpdateSection />
        </section>
      </div>
    </div>
  );
}

// Update section component
function UpdateSection() {
  const [updateStatus, setUpdateStatus] = useState<{
    updateAvailable: boolean;
    updateDownloaded: boolean;
    downloadProgress: number;
    currentVersion: string;
    updateInfo: any;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUpdateStatus();

    // Listen for update status changes
    window.apexDrive.on('update-status', (status: any) => {
      if (status.status === 'downloading') {
        setDownloading(true);
        setUpdateStatus(prev => prev ? { ...prev, downloadProgress: status.progress } : null);
      } else if (status.status === 'ready') {
        setDownloading(false);
        setUpdateStatus(prev => prev ? { ...prev, updateDownloaded: true, downloadProgress: 100 } : null);
      } else if (status.status === 'available') {
        setUpdateStatus(prev => prev ? { 
          ...prev, 
          updateAvailable: true, 
          updateInfo: { version: status.version, releaseNotes: status.releaseNotes }
        } : null);
      } else if (status.status === 'error') {
        setError(status.error || 'Update check failed');
      }
    });
  }, []);

  const loadUpdateStatus = async () => {
    try {
      const status = await window.apexDrive.app.updateStatus();
      setUpdateStatus(status);
    } catch (err) {
      console.error('Failed to get update status:', err);
    }
  };

  const checkForUpdates = async () => {
    setChecking(true);
    setError(null);
    try {
      const result = await window.apexDrive.app.checkUpdates();
      if (result.error) {
        setError(result.error);
      } else if (!result.updateAvailable) {
        setError(null);
      }
      await loadUpdateStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to check for updates');
    } finally {
      setChecking(false);
    }
  };

  const downloadUpdate = async () => {
    setDownloading(true);
    setError(null);
    try {
      const result = await window.apexDrive.app.downloadUpdate();
      if (!result.success) {
        setError(result.error || 'Download failed');
        setDownloading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Download failed');
      setDownloading(false);
    }
  };

  const installUpdate = async () => {
    try {
      await window.apexDrive.app.installUpdate();
    } catch (err: any) {
      setError(err.message || 'Installation failed');
    }
  };

  return (
    <div className="update-section">
      <div className="setting-group">
        <div className="update-info">
          <div className="update-version">
            <span className="version-label">Current Version</span>
            <span className="version-value">{updateStatus?.currentVersion || 'Loading...'}</span>
          </div>
          
          {updateStatus?.updateAvailable && !updateStatus?.updateDownloaded && (
            <div className="update-available">
              <span className="update-badge">Update Available</span>
              <span className="new-version">Version {updateStatus.updateInfo?.version}</span>
            </div>
          )}
          
          {updateStatus?.updateDownloaded && (
            <div className="update-ready">
              <span className="update-badge ready">Ready to Install</span>
              <span className="new-version">Version {updateStatus.updateInfo?.version}</span>
            </div>
          )}
          
          {downloading && (
            <div className="download-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${updateStatus?.downloadProgress || 0}%` }}
                />
              </div>
              <span className="progress-text">
                Downloading... {(updateStatus?.downloadProgress || 0).toFixed(0)}%
              </span>
            </div>
          )}
          
          {error && (
            <div className="update-error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}
        </div>

        <div className="update-actions">
          {!updateStatus?.updateAvailable && !updateStatus?.updateDownloaded && (
            <button 
              className="btn btn-secondary"
              onClick={checkForUpdates}
              disabled={checking}
            >
              {checking ? (
                <>
                  <span className="button-spinner"></span>
                  Checking...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 4 23 10 17 10"/>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                  </svg>
                  Check for Updates
                </>
              )}
            </button>
          )}

          {updateStatus?.updateAvailable && !updateStatus?.updateDownloaded && !downloading && (
            <button 
              className="btn btn-primary"
              onClick={downloadUpdate}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download Update
            </button>
          )}

          {updateStatus?.updateDownloaded && (
            <button 
              className="btn btn-primary"
              onClick={installUpdate}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Restart to Install
            </button>
          )}
        </div>
      </div>

      <span className="setting-help">
        Apex Drive automatically checks for updates and will notify you when one is available.
      </span>
    </div>
  );
}

export default SettingsPage;
