import React, { useState, useEffect, useRef } from 'react';
import '../styles/SyncLogs.css';

interface SyncLog {
  id: string;
  timestamp: string;
  type: 'upload' | 'download' | 'conflict' | 'error' | 'info';
  message: string;
  documentId?: string;
  matterId?: string;
}

function SyncLogs() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadLogs();
    
    // Listen for new logs
    window.apexDrive.on('sync-progress', (log: SyncLog) => {
      setLogs((prev) => [...prev.slice(-499), log]);
    });

    // Refresh every 10 seconds
    const interval = setInterval(loadLogs, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const loadLogs = async () => {
    try {
      const data = await window.apexDrive.sync.logs(500);
      setLogs(data);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true;
    return log.type === filter;
  });

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'upload':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="17 1 21 5 17 9"/>
            <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
          </svg>
        );
      case 'download':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="7 15 12 20 17 15"/>
            <path d="M12 20V4"/>
          </svg>
        );
      case 'conflict':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        );
      case 'error':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        );
    }
  };

  // Group logs by date
  const groupedLogs: Record<string, SyncLog[]> = {};
  filteredLogs.forEach((log) => {
    const date = formatDate(log.timestamp);
    if (!groupedLogs[date]) {
      groupedLogs[date] = [];
    }
    groupedLogs[date].push(log);
  });

  if (isLoading) {
    return (
      <div className="sync-logs loading">
        <div className="loading-spinner large"></div>
        <p>Loading sync logs...</p>
      </div>
    );
  }

  return (
    <div className="sync-logs">
      <header className="logs-header">
        <h1>Sync Logs</h1>
        <div className="logs-controls">
          <div className="filter-group">
            <label htmlFor="filter">Filter:</label>
            <select
              id="filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="upload">Uploads</option>
              <option value="download">Downloads</option>
              <option value="conflict">Conflicts</option>
              <option value="error">Errors</option>
              <option value="info">Info</option>
            </select>
          </div>
          <label className="auto-scroll-toggle">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            <span>Auto-scroll</span>
          </label>
          <button className="btn btn-secondary" onClick={loadLogs}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Refresh
          </button>
        </div>
      </header>

      <div className="logs-content">
        {filteredLogs.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <p>No sync logs yet</p>
            <span>Logs will appear here when files are synced</span>
          </div>
        ) : (
          <div className="logs-list">
            {Object.entries(groupedLogs).map(([date, dateLogs]) => (
              <div key={date} className="log-date-group">
                <div className="log-date-header">{date}</div>
                {dateLogs.map((log) => (
                  <div key={log.id} className={`log-entry ${log.type}`}>
                    <div className="log-icon">{getLogIcon(log.type)}</div>
                    <div className="log-content">
                      <div className="log-message">{log.message}</div>
                      {log.documentId && (
                        <div className="log-details">
                          <span>Document ID: {log.documentId}</span>
                        </div>
                      )}
                    </div>
                    <div className="log-time">{formatTime(log.timestamp)}</div>
                  </div>
                ))}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      <footer className="logs-footer">
        <span>{filteredLogs.length} log entries</span>
        {filter !== 'all' && (
          <button className="clear-filter" onClick={() => setFilter('all')}>
            Clear filter
          </button>
        )}
      </footer>
    </div>
  );
}

export default SyncLogs;
