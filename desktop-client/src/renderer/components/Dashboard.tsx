import React, { useState, useEffect } from 'react';
import '../styles/Dashboard.css';

interface DriveStatus {
  mounted: boolean;
  driveLetter: string;
  connected: boolean;
  localPath?: string;
}

interface SyncStatus {
  syncing: boolean;
  lastSync: string | null;
  dirtyFiles?: number;
  matterCount?: number;
}

interface Matter {
  id: string;
  name: string;
  number: string | null;
  clientName: string;
}

function Dashboard() {
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounting, setIsMounting] = useState(false);
  const [mountError, setMountError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    
    // Listen for drive status changes
    window.apexDrive.on('drive-status', (status: DriveStatus) => {
      setDriveStatus(status);
    });

    window.apexDrive.on('sync-status', (status: SyncStatus) => {
      setSyncStatus(status);
    });

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      refreshStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        refreshStatus(),
        loadMatters(),
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshStatus = async () => {
    const [drive, sync] = await Promise.all([
      window.apexDrive.drive.status(),
      window.apexDrive.sync.status(),
    ]);
    setDriveStatus(drive);
    setSyncStatus(sync);
  };

  const loadMatters = async () => {
    const result = await window.apexDrive.matters.list();
    if (result.success && result.matters) {
      setMatters(result.matters.slice(0, 10)); // Show top 10
    }
  };

  const handleMountDrive = async () => {
    setIsMounting(true);
    setMountError(null);
    try {
      const result = await window.apexDrive.drive.mount();
      if (result.success) {
        await refreshStatus();
      } else {
        setMountError(result.error || 'Failed to mount drive');
      }
    } catch (error) {
      setMountError('Failed to mount drive');
    } finally {
      setIsMounting(false);
    }
  };

  const handleUnmountDrive = async () => {
    setIsMounting(true);
    try {
      await window.apexDrive.drive.unmount();
      await refreshStatus();
    } finally {
      setIsMounting(false);
    }
  };

  const handleOpenDrive = async () => {
    const result = await window.apexDrive.drive.open();
    if (!result.success && result.error) {
      setMountError(result.error);
    }
  };

  const handleSyncNow = async () => {
    await window.apexDrive.sync.now();
    if (driveStatus?.mounted) {
      await window.apexDrive.drive.refresh();
    }
    await refreshStatus();
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="dashboard loading">
        <div className="loading-spinner large"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Dashboard</h1>
        <button className="refresh-btn" onClick={loadData}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Refresh
        </button>
      </header>

      <div className="dashboard-grid">
        {/* Drive Status Card - Main Feature */}
        <div className="card drive-status-card">
          <div className="card-header">
            <h2>{driveStatus?.driveLetter || 'Z'}: Drive</h2>
            <span className={`status-badge ${driveStatus?.mounted ? 'success' : 'warning'}`}>
              {driveStatus?.mounted ? 'Mounted' : 'Not Mounted'}
            </span>
          </div>
          <div className="card-content">
            <div className="drive-info">
              <div className="drive-icon large">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" ry="2"/>
                  <line x1="6" y1="12" x2="18" y2="12"/>
                  <line x1="6" y1="16" x2="10" y2="16"/>
                </svg>
              </div>
              <div className="drive-details">
                <span className="drive-letter">{driveStatus?.driveLetter || 'Z'}:</span>
                <span className="drive-label">
                  {driveStatus?.mounted 
                    ? `Apex Drive (${matters.length} matters)` 
                    : 'Click Mount to access your files'}
                </span>
                {driveStatus?.mounted && (
                  <span className="drive-note">Only shows files you have permission to access</span>
                )}
              </div>
            </div>
            
            {mountError && (
              <div className="error-message">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {mountError}
              </div>
            )}
            
            <div className="drive-actions">
              {!driveStatus?.mounted ? (
                <button
                  className="btn btn-primary btn-large"
                  onClick={handleMountDrive}
                  disabled={isMounting || !driveStatus?.connected}
                >
                  {isMounting ? (
                    <>
                      <span className="button-spinner"></span>
                      Mounting...
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18, marginRight: 8 }}>
                        <rect x="2" y="4" width="20" height="16" rx="2" ry="2"/>
                        <line x1="12" y1="10" x2="12" y2="16"/>
                        <line x1="9" y1="13" x2="15" y2="13"/>
                      </svg>
                      Mount Drive
                    </>
                  )}
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={handleOpenDrive}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16, marginRight: 8 }}>
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    Open in Explorer
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={handleUnmountDrive}
                    disabled={isMounting}
                  >
                    Unmount
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Connection Status Card */}
        <div className="card connection-card">
          <div className="card-header">
            <h2>Connection</h2>
            <span className={`status-badge ${driveStatus?.connected ? 'success' : 'error'}`}>
              {driveStatus?.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="card-content">
            <div className="connection-info">
              <div className="info-row">
                <span>Server Status</span>
                <span className={driveStatus?.connected ? 'text-success' : 'text-error'}>
                  {driveStatus?.connected ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="info-row">
                <span>Last Sync</span>
                <span>{formatDate(syncStatus?.lastSync || null)}</span>
              </div>
              <div className="info-row">
                <span>Your Matters</span>
                <span>{matters.length} accessible</span>
              </div>
            </div>
            <button
              className="btn btn-secondary sync-btn"
              onClick={handleSyncNow}
              disabled={syncStatus?.syncing || !driveStatus?.connected}
            >
              {syncStatus?.syncing ? (
                <>
                  <span className="button-spinner"></span>
                  Syncing...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 4 23 10 17 10"/>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                  </svg>
                  Sync Now
                </>
              )}
            </button>
          </div>
        </div>

        {/* Recent Matters Card */}
        <div className="card matters-card">
          <div className="card-header">
            <h2>Your Matters</h2>
            <span className="matter-count">{matters.length} matters</span>
          </div>
          <div className="card-content">
            {matters.length === 0 ? (
              <div className="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <p>No matters found</p>
                <p className="empty-note">You'll see matters here once you have access to them</p>
              </div>
            ) : (
              <ul className="matters-list">
                {matters.map((matter) => (
                  <li key={matter.id} className="matter-item">
                    <div className="matter-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                    </div>
                    <div className="matter-details">
                      <span className="matter-name">
                        {matter.number && `${matter.number} - `}{matter.name}
                      </span>
                      <span className="matter-client">{matter.clientName}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Instructions Card */}
        <div className="card instructions-card">
          <div className="card-header">
            <h2>How It Works</h2>
          </div>
          <div className="card-content">
            <ol className="instructions-list">
              <li>
                <strong>Click "Mount Drive"</strong> to create your B: drive
              </li>
              <li>
                <strong>Open Windows Explorer</strong> - you'll see B: Apex Drive
              </li>
              <li>
                <strong>Browse your files</strong> - only files you have permission to access are shown
              </li>
              <li>
                <strong>Files sync automatically</strong> - changes are uploaded to the server
              </li>
            </ol>
            <p className="security-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16, marginRight: 6, verticalAlign: 'middle' }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Your drive only shows files from matters you have access to.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
