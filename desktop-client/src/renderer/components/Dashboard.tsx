import React, { useState, useEffect } from 'react';
import '../styles/Dashboard.css';

interface DriveStatus {
  mounted: boolean;
  driveLetter: string;
  connected: boolean;
}

interface SyncStatus {
  syncing: boolean;
  lastSync: string | null;
  dirtyFiles?: number;
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
  const [mountingDrive, setMountingDrive] = useState(false);

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

  const handleMountToggle = async () => {
    setMountingDrive(true);
    try {
      if (driveStatus?.mounted) {
        await window.apexDrive.drive.unmount();
      } else {
        await window.apexDrive.drive.mount();
      }
      await refreshStatus();
    } finally {
      setMountingDrive(false);
    }
  };

  const handleOpenDrive = async () => {
    await window.apexDrive.drive.open();
  };

  const handleSyncNow = async () => {
    await window.apexDrive.sync.now();
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
        {/* Drive Status Card */}
        <div className="card drive-status-card">
          <div className="card-header">
            <h2>Drive Status</h2>
            <span className={`status-badge ${driveStatus?.mounted ? 'success' : 'warning'}`}>
              {driveStatus?.mounted ? 'Mounted' : 'Not Mounted'}
            </span>
          </div>
          <div className="card-content">
            <div className="drive-info">
              <div className="drive-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" ry="2"/>
                  <line x1="6" y1="12" x2="18" y2="12"/>
                  <line x1="6" y1="16" x2="10" y2="16"/>
                </svg>
              </div>
              <div className="drive-details">
                <span className="drive-letter">{driveStatus?.driveLetter || 'Z'}:</span>
                <span className="drive-label">Apex Drive</span>
              </div>
            </div>
            <div className="drive-actions">
              <button
                className={`btn ${driveStatus?.mounted ? 'btn-secondary' : 'btn-primary'}`}
                onClick={handleMountToggle}
                disabled={mountingDrive}
              >
                {mountingDrive ? (
                  <span className="button-spinner"></span>
                ) : driveStatus?.mounted ? (
                  'Unmount'
                ) : (
                  'Mount Drive'
                )}
              </button>
              {driveStatus?.mounted && (
                <button className="btn btn-primary" onClick={handleOpenDrive}>
                  Open in Explorer
                </button>
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
              {syncStatus?.dirtyFiles !== undefined && syncStatus.dirtyFiles > 0 && (
                <div className="info-row">
                  <span>Pending Changes</span>
                  <span className="text-warning">{syncStatus.dirtyFiles} files</span>
                </div>
              )}
            </div>
            <button
              className="btn btn-secondary sync-btn"
              onClick={handleSyncNow}
              disabled={syncStatus?.syncing}
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
            <h2>Recent Matters</h2>
            <span className="matter-count">{matters.length} matters available</span>
          </div>
          <div className="card-content">
            {matters.length === 0 ? (
              <div className="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <p>No matters found</p>
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

        {/* Quick Actions Card */}
        <div className="card actions-card">
          <div className="card-header">
            <h2>Quick Actions</h2>
          </div>
          <div className="card-content">
            <div className="quick-actions">
              <button className="action-btn" onClick={handleOpenDrive} disabled={!driveStatus?.mounted}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span>Open Drive</span>
              </button>
              <button className="action-btn" onClick={handleSyncNow} disabled={syncStatus?.syncing}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                <span>Sync Files</span>
              </button>
              <button className="action-btn" onClick={() => window.apexDrive.on('navigate', () => {})}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                <span>Settings</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
