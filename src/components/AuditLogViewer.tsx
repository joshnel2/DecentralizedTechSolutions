import { useState, useEffect, useMemo } from 'react'
import { 
  Shield, Search, Filter, User, 
  FileText, Briefcase, Clock, ChevronDown, ChevronUp,
  Download, RefreshCw, Eye, Edit, Trash2, Plus,
  LogIn, LogOut, AlertTriangle
} from 'lucide-react'
import { format, parseISO, subDays } from 'date-fns'
import { firmApi, teamApi } from '../services/api'
import { usePaginatedData } from '../hooks/usePaginatedData'
import { Pagination } from './Pagination'
import styles from './AuditLogViewer.module.css'

interface AuditLogEntry {
  id: string
  userId: string
  userName?: string
  action: string
  resource: string
  resourceId?: string
  resourceName?: string
  details?: Record<string, any>
  ipAddress: string
  userAgent?: string
  timestamp: string
}

interface AuditLogViewerProps {
  matterId?: string // Filter to specific matter
  clientId?: string // Filter to specific client
  documentId?: string // Filter to specific document
  userId?: string // Filter to specific user
  compact?: boolean
  maxHeight?: string
}

/**
 * Audit Log Viewer Component
 * Critical for law firm compliance and security monitoring
 */
export function AuditLogViewer({
  matterId,
  clientId,
  documentId,
  userId: filterUserId,
  compact = false,
  maxHeight = '600px'
}: AuditLogViewerProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string>(filterUserId || '')
  const [selectedAction, setSelectedAction] = useState<string>('')
  const [selectedResource, setSelectedResource] = useState<string>('')
  const [dateRange, setDateRange] = useState<'today' | '7days' | '30days' | '90days' | 'all'>('7days')
  const [showFilters, setShowFilters] = useState(!compact)
  
  // Team members for filter dropdown
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; firstName: string; lastName: string }>>([])
  
  const fetchTeamMembers = async () => {
    try {
      const result = await teamApi.getMembers()
      setTeamMembers(result.teamMembers || [])
    } catch (err) {
      console.error('Failed to fetch team members:', err)
    }
  }
  
  const fetchLogs = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Calculate date range
      let startDate: string | undefined
      const now = new Date()
      
      switch (dateRange) {
        case 'today':
          startDate = format(now, 'yyyy-MM-dd')
          break
        case '7days':
          startDate = format(subDays(now, 7), 'yyyy-MM-dd')
          break
        case '30days':
          startDate = format(subDays(now, 30), 'yyyy-MM-dd')
          break
        case '90days':
          startDate = format(subDays(now, 90), 'yyyy-MM-dd')
          break
        default:
          startDate = undefined
      }
      
      const params: Record<string, string> = {}
      if (startDate) params.startDate = startDate
      if (filterUserId) params.userId = filterUserId
      
      const result = await firmApi.getAuditLogs(params)
      setLogs(result.logs || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }
  
  // Fetch logs and team members
  useEffect(() => {
    fetchLogs()
    fetchTeamMembers()
  }, [dateRange, matterId, clientId, documentId])
  
  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const searchable = [
          log.userName,
          log.action,
          log.resource,
          log.resourceName,
          log.ipAddress,
          JSON.stringify(log.details)
        ].filter(Boolean).join(' ').toLowerCase()
        
        if (!searchable.includes(query)) return false
      }
      
      // User filter
      if (selectedUserId && log.userId !== selectedUserId) return false
      
      // Action filter
      if (selectedAction && log.action !== selectedAction) return false
      
      // Resource filter
      if (selectedResource && log.resource !== selectedResource) return false
      
      return true
    })
  }, [logs, searchQuery, selectedUserId, selectedAction, selectedResource])
  
  // Pagination
  const pagination = usePaginatedData({
    data: filteredLogs,
    defaultPageSize: compact ? 10 : 25
  })
  
  // Get unique actions and resources for filter dropdowns
  const uniqueActions = useMemo(() => 
    [...new Set(logs.map(l => l.action))].sort(),
    [logs]
  )
  
  const uniqueResources = useMemo(() => 
    [...new Set(logs.map(l => l.resource))].sort(),
    [logs]
  )
  
  // Action icons
  const getActionIcon = (action: string) => {
    switch (action) {
      case 'create': return <Plus size={14} className={styles.iconCreate} />
      case 'update': return <Edit size={14} className={styles.iconUpdate} />
      case 'delete': return <Trash2 size={14} className={styles.iconDelete} />
      case 'view': return <Eye size={14} className={styles.iconView} />
      case 'download': return <Download size={14} className={styles.iconDownload} />
      case 'login': return <LogIn size={14} className={styles.iconLogin} />
      case 'logout': return <LogOut size={14} className={styles.iconLogout} />
      default: return <FileText size={14} />
    }
  }
  
  // Resource icons
  const getResourceIcon = (resource: string) => {
    switch (resource) {
      case 'matter': return <Briefcase size={14} />
      case 'client': return <User size={14} />
      case 'document': return <FileText size={14} />
      case 'user': return <User size={14} />
      case 'session': return <Shield size={14} />
      default: return <FileText size={14} />
    }
  }
  
  // Format action for display
  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }
  
  // Export logs
  const handleExport = () => {
    const csv = [
      ['Timestamp', 'User', 'Action', 'Resource', 'Resource Name', 'IP Address', 'Details'],
      ...filteredLogs.map(log => [
        format(parseISO(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
        log.userName || log.userId,
        log.action,
        log.resource,
        log.resourceName || '',
        log.ipAddress,
        log.details ? JSON.stringify(log.details) : ''
      ])
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  
  return (
    <div className={`${styles.container} ${compact ? styles.compact : ''}`}>
      <div className={styles.header}>
        <div className={styles.title}>
          <Shield size={20} />
          <span>Audit Log</span>
          <span className={styles.count}>{filteredLogs.length.toLocaleString()} entries</span>
        </div>
        
        <div className={styles.headerActions}>
          <button 
            className={styles.filterToggle}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} />
            Filters
            {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          
          <button 
            className={styles.refreshBtn}
            onClick={fetchLogs}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? styles.spin : ''} />
          </button>
          
          <button 
            className={styles.exportBtn}
            onClick={handleExport}
            disabled={filteredLogs.length === 0}
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>
      
      {/* Filters */}
      {showFilters && (
        <div className={styles.filters}>
          <div className={styles.filterRow}>
            <div className={styles.searchBox}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className={styles.filterSelect}
            >
              <option value="today">Today</option>
              <option value="7days">Last 7 days</option>
              <option value="30days">Last 30 days</option>
              <option value="90days">Last 90 days</option>
              <option value="all">All time</option>
            </select>
            
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="">All Users</option>
              {teamMembers.map(member => (
                <option key={member.id} value={member.id}>
                  {member.firstName} {member.lastName}
                </option>
              ))}
            </select>
            
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="">All Actions</option>
              {uniqueActions.map(action => (
                <option key={action} value={action}>
                  {formatAction(action)}
                </option>
              ))}
            </select>
            
            <select
              value={selectedResource}
              onChange={(e) => setSelectedResource(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="">All Resources</option>
              {uniqueResources.map(resource => (
                <option key={resource} value={resource}>
                  {resource.charAt(0).toUpperCase() + resource.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      
      {/* Error state */}
      {error && (
        <div className={styles.error}>
          <AlertTriangle size={16} />
          {error}
        </div>
      )}
      
      {/* Log entries */}
      <div className={styles.logList} style={{ maxHeight }}>
        {loading && logs.length === 0 ? (
          <div className={styles.loading}>
            <RefreshCw size={24} className={styles.spin} />
            <span>Loading audit logs...</span>
          </div>
        ) : pagination.pageData.length === 0 ? (
          <div className={styles.empty}>
            <Shield size={32} />
            <span>No audit log entries found</span>
          </div>
        ) : (
          pagination.pageData.map(log => (
            <div 
              key={log.id}
              className={`${styles.logEntry} ${expandedLogId === log.id ? styles.expanded : ''}`}
            >
              <div 
                className={styles.logMain}
                onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
              >
                <div className={styles.logIcon}>
                  {getActionIcon(log.action)}
                </div>
                
                <div className={styles.logContent}>
                  <div className={styles.logAction}>
                    <span className={styles.userName}>{log.userName || 'System'}</span>
                    <span className={styles.actionText}>{formatAction(log.action)}</span>
                    <span className={styles.resourceBadge}>
                      {getResourceIcon(log.resource)}
                      {log.resource}
                    </span>
                    {log.resourceName && (
                      <span className={styles.resourceName}>"{log.resourceName}"</span>
                    )}
                  </div>
                  
                  <div className={styles.logMeta}>
                    <span className={styles.timestamp}>
                      <Clock size={12} />
                      {format(parseISO(log.timestamp), 'MMM d, yyyy h:mm a')}
                    </span>
                    <span className={styles.ip}>{log.ipAddress}</span>
                  </div>
                </div>
                
                <div className={styles.expandIcon}>
                  {expandedLogId === log.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>
              
              {/* Expanded details */}
              {expandedLogId === log.id && log.details && (
                <div className={styles.logDetails}>
                  <div className={styles.detailsHeader}>Details</div>
                  <div className={styles.detailsContent}>
                    {Object.entries(log.details).map(([key, value]) => (
                      <div key={key} className={styles.detailItem}>
                        <span className={styles.detailKey}>{key}:</span>
                        <span className={styles.detailValue}>
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {log.userAgent && (
                    <div className={styles.userAgent}>
                      <strong>User Agent:</strong> {log.userAgent}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      
      {/* Pagination */}
      {filteredLogs.length > 0 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          startIndex={pagination.startIndex}
          endIndex={pagination.endIndex}
          pageSize={pagination.pageSize}
          pageSizeOptions={pagination.pageSizeOptions}
          onPageChange={pagination.goToPage}
          onPageSizeChange={pagination.setPageSize}
          hasNextPage={pagination.hasNextPage}
          hasPrevPage={pagination.hasPrevPage}
        />
      )}
    </div>
  )
}
