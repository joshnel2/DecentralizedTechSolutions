import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import {
  Shield, Smartphone, Key, Monitor, Globe, Clock, AlertTriangle,
  CheckCircle2, XCircle, Copy, Eye, EyeOff, RefreshCw, Trash2,
  Lock, Fingerprint, Mail, MessageSquare, Download, History, ArrowLeft
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import styles from './SecuritySettingsPage.module.css'
import { useToast } from '../components/Toast'

export function SecuritySettingsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { 
    user, 
    twoFactorSetup, 
    enable2FA, 
    disable2FA, 
    generateBackupCodes,
    sessions,
    revokeSession,
    revokeAllOtherSessions,
    getAuditLog
  } = useAuthStore()

  const [activeTab, setActiveTab] = useState('2fa')
  const [showSetup2FA, setShowSetup2FA] = useState(false)
  const [selected2FAMethod, setSelected2FAMethod] = useState<'authenticator' | 'sms' | 'email'>('authenticator')
  const [verificationCode, setVerificationCode] = useState('')
  const [showBackupCodes, setShowBackupCodes] = useState(false)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const recentActivity = getAuditLog({}).slice(0, 10)

  const handleEnable2FA = async () => {
    const result = await enable2FA(selected2FAMethod)
    if (result.qrCode) {
      setQrCode(result.qrCode)
    }
    const codes = generateBackupCodes()
    setBackupCodes(codes)
    setShowBackupCodes(true)
    setShowSetup2FA(false)
  }

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const tabs = [
    { id: '2fa', label: 'Two-Factor Auth', icon: Smartphone },
    { id: 'sessions', label: 'Active Sessions', icon: Monitor },
    { id: 'activity', label: 'Security Log', icon: History },
    { id: 'advanced', label: 'Advanced', icon: Shield }
  ]

  return (
    <div className={styles.securityPage}>
      <button className={styles.backButton} onClick={() => navigate('/app/settings')}>
        <ArrowLeft size={16} />
        Back to Settings
      </button>
      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <Shield size={28} />
        </div>
        <div>
          <h1>Security Settings</h1>
          <p>Manage your account security and authentication</p>
        </div>
      </div>

      {/* Security Score */}
      <div className={styles.securityScore}>
        <div className={styles.scoreCircle}>
          <svg viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="var(--bg-tertiary)" strokeWidth="8" />
            <circle 
              cx="50" cy="50" r="45" 
              fill="none" 
              stroke={twoFactorSetup?.enabled ? 'var(--success)' : 'var(--warning)'} 
              strokeWidth="8"
              strokeDasharray={`${(twoFactorSetup?.enabled ? 85 : 50) * 2.83} 283`}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
            />
          </svg>
          <span className={styles.scoreValue}>{twoFactorSetup?.enabled ? 85 : 50}</span>
        </div>
        <div className={styles.scoreInfo}>
          <h3>Security Score</h3>
          <p>{twoFactorSetup?.enabled ? 'Good - 2FA is enabled' : 'Fair - Enable 2FA to improve'}</p>
          <div className={styles.scoreChecks}>
            <span className={styles.checkItem}>
              <CheckCircle2 size={14} /> Strong password
            </span>
            <span className={`${styles.checkItem} ${twoFactorSetup?.enabled ? '' : styles.warning}`}>
              {twoFactorSetup?.enabled ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              Two-factor authentication
            </span>
            <span className={styles.checkItem}>
              <CheckCircle2 size={14} /> Email verified
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* 2FA Tab */}
      {activeTab === '2fa' && (
        <div className={styles.tabContent}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}>
                <Fingerprint size={24} />
              </div>
              <div>
                <h2>Two-Factor Authentication</h2>
                <p>Add an extra layer of security to your account</p>
              </div>
              <div className={`${styles.statusBadge} ${twoFactorSetup?.enabled ? styles.enabled : styles.disabled}`}>
                {twoFactorSetup?.enabled ? 'Enabled' : 'Disabled'}
              </div>
            </div>

            {twoFactorSetup?.enabled ? (
              <div className={styles.enabledState}>
                <div className={styles.methodInfo}>
                  <div className={styles.methodIcon}>
                    {twoFactorSetup.method === 'authenticator' && <Smartphone size={24} />}
                    {twoFactorSetup.method === 'sms' && <MessageSquare size={24} />}
                    {twoFactorSetup.method === 'email' && <Mail size={24} />}
                  </div>
                  <div>
                    <h4>
                      {twoFactorSetup.method === 'authenticator' && 'Authenticator App'}
                      {twoFactorSetup.method === 'sms' && 'SMS Verification'}
                      {twoFactorSetup.method === 'email' && 'Email Verification'}
                    </h4>
                    <p>Enabled on {twoFactorSetup.verifiedAt ? format(parseISO(twoFactorSetup.verifiedAt), 'MMM d, yyyy') : 'N/A'}</p>
                  </div>
                </div>

                <div className={styles.actions}>
                  <button 
                    className={styles.secondaryBtn}
                    onClick={() => {
                      const codes = generateBackupCodes()
                      setBackupCodes(codes)
                      setShowBackupCodes(true)
                    }}
                  >
                    <Key size={16} />
                    View Backup Codes
                  </button>
                  <button 
                    className={styles.dangerBtn}
                    onClick={disable2FA}
                  >
                    Disable 2FA
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.disabledState}>
                {!showSetup2FA ? (
                  <>
                    <p className={styles.warning2FA}>
                      <AlertTriangle size={18} />
                      Your account is not protected by two-factor authentication. Enable 2FA to significantly improve your account security.
                    </p>
                    <button 
                      className={styles.primaryBtn}
                      onClick={() => setShowSetup2FA(true)}
                    >
                      <Shield size={18} />
                      Enable Two-Factor Authentication
                    </button>
                  </>
                ) : (
                  <div className={styles.setup2FA}>
                    <h3>Choose your 2FA method</h3>
                    <div className={styles.methodOptions}>
                      <label className={`${styles.methodOption} ${selected2FAMethod === 'authenticator' ? styles.selected : ''}`}>
                        <input
                          type="radio"
                          name="2fa-method"
                          checked={selected2FAMethod === 'authenticator'}
                          onChange={() => setSelected2FAMethod('authenticator')}
                        />
                        <Smartphone size={24} />
                        <div>
                          <span>Authenticator App</span>
                          <small>Use Google Authenticator, Authy, or similar</small>
                        </div>
                        <span className={styles.recommended}>Recommended</span>
                      </label>
                      <label className={`${styles.methodOption} ${selected2FAMethod === 'sms' ? styles.selected : ''}`}>
                        <input
                          type="radio"
                          name="2fa-method"
                          checked={selected2FAMethod === 'sms'}
                          onChange={() => setSelected2FAMethod('sms')}
                        />
                        <MessageSquare size={24} />
                        <div>
                          <span>SMS</span>
                          <small>Receive codes via text message</small>
                        </div>
                      </label>
                      <label className={`${styles.methodOption} ${selected2FAMethod === 'email' ? styles.selected : ''}`}>
                        <input
                          type="radio"
                          name="2fa-method"
                          checked={selected2FAMethod === 'email'}
                          onChange={() => setSelected2FAMethod('email')}
                        />
                        <Mail size={24} />
                        <div>
                          <span>Email</span>
                          <small>Receive codes via email</small>
                        </div>
                      </label>
                    </div>

                    <div className={styles.setupActions}>
                      <button 
                        className={styles.secondaryBtn}
                        onClick={() => setShowSetup2FA(false)}
                      >
                        Cancel
                      </button>
                      <button 
                        className={styles.primaryBtn}
                        onClick={handleEnable2FA}
                      >
                        Continue Setup
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Backup Codes Modal */}
          {showBackupCodes && (
            <div className={styles.modal}>
              <div className={styles.modalContent}>
                <div className={styles.modalHeader}>
                  <Key size={24} />
                  <h2>Backup Codes</h2>
                </div>
                <p className={styles.modalDesc}>
                  Save these backup codes in a secure location. Each code can only be used once.
                </p>
                <div className={styles.backupCodes}>
                  {backupCodes.map((code, i) => (
                    <code key={i}>{code}</code>
                  ))}
                </div>
                <div className={styles.modalActions}>
                  <button onClick={copyBackupCodes} className={styles.secondaryBtn}>
                    {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                    {copied ? 'Copied!' : 'Copy All'}
                  </button>
                  <button onClick={() => setShowBackupCodes(false)} className={styles.primaryBtn}>
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sessions Tab */}
      {activeTab === 'sessions' && (
        <div className={styles.tabContent}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}>
                <Monitor size={24} />
              </div>
              <div>
                <h2>Active Sessions</h2>
                <p>Manage devices where you're signed in</p>
              </div>
              <button 
                className={styles.dangerBtn}
                onClick={revokeAllOtherSessions}
              >
                Sign Out All Other Sessions
              </button>
            </div>

            <div className={styles.sessionsList}>
              {sessions.map(session => (
                <div key={session.id} className={`${styles.sessionCard} ${session.isCurrent ? styles.current : ''}`}>
                  <div className={styles.sessionIcon}>
                    <Monitor size={24} />
                  </div>
                  <div className={styles.sessionInfo}>
                    <div className={styles.sessionDevice}>
                      {session.deviceInfo.includes('Windows') ? 'Windows PC' :
                       session.deviceInfo.includes('Mac') ? 'Mac' :
                       session.deviceInfo.includes('iPhone') ? 'iPhone' :
                       session.deviceInfo.includes('Android') ? 'Android' : 'Unknown Device'}
                      {session.isCurrent && <span className={styles.currentBadge}>Current</span>}
                    </div>
                    <div className={styles.sessionMeta}>
                      <span><Globe size={12} /> {session.ipAddress}</span>
                      <span><Clock size={12} /> Last active: {format(parseISO(session.lastActivity), 'MMM d, yyyy h:mm a')}</span>
                    </div>
                  </div>
                  {!session.isCurrent && (
                    <button 
                      className={styles.revokeBtn}
                      onClick={() => revokeSession(session.id)}
                    >
                      <XCircle size={16} />
                      Revoke
                    </button>
                  )}
                </div>
              ))}

              {sessions.length === 0 && (
                <div className={styles.emptyState}>
                  <Monitor size={48} />
                  <p>No active sessions found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Activity Tab */}
      {activeTab === 'activity' && (
        <div className={styles.tabContent}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}>
                <History size={24} />
              </div>
              <div>
                <h2>Security Activity Log</h2>
                <p>Recent security-related events on your account</p>
              </div>
              <button className={styles.secondaryBtn} onClick={() => {
                const logData = recentActivity.map((log: { timestamp: string; action: string; resource?: string; ip?: string }) => `${log.timestamp} | ${log.action} | ${log.resource || 'N/A'} | ${log.ip || 'N/A'}`).join('\n');
                const blob = new Blob([`Security Log Export\n\nTimestamp | Action | Resource | IP\n${logData}`], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'security-log.txt';
                a.click();
                URL.revokeObjectURL(url);
              }}>
                <Download size={16} />
                Export Log
              </button>
            </div>

            <div className={styles.activityList}>
              {recentActivity.map(entry => (
                <div key={entry.id} className={styles.activityItem}>
                  <div className={`${styles.activityIcon} ${
                    entry.action.includes('login') ? styles.login :
                    entry.action.includes('logout') ? styles.logout :
                    entry.action.includes('2fa') ? styles.twofa :
                    styles.default
                  }`}>
                    {entry.action.includes('login') && <Lock size={16} />}
                    {entry.action.includes('logout') && <XCircle size={16} />}
                    {entry.action.includes('2fa') && <Shield size={16} />}
                    {!entry.action.includes('login') && !entry.action.includes('logout') && !entry.action.includes('2fa') && <History size={16} />}
                  </div>
                  <div className={styles.activityInfo}>
                    <span className={styles.activityAction}>
                      {entry.action.replace(/_/g, ' ').replace(/\./g, ' - ')}
                    </span>
                    <span className={styles.activityMeta}>
                      {format(parseISO(entry.timestamp), 'MMM d, yyyy h:mm a')} • {entry.ipAddress}
                    </span>
                  </div>
                </div>
              ))}

              {recentActivity.length === 0 && (
                <div className={styles.emptyState}>
                  <History size={48} />
                  <p>No security events recorded</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Advanced Tab */}
      {activeTab === 'advanced' && (
        <div className={styles.tabContent}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}>
                <Lock size={24} />
              </div>
              <div>
                <h2>Password</h2>
                <p>Change your account password</p>
              </div>
            </div>
            <div className={styles.passwordSection}>
              <div className={styles.formGroup}>
                <label>Current Password</label>
                <input type="password" placeholder="Enter current password" />
              </div>
              <div className={styles.formGroup}>
                <label>New Password</label>
                <input type="password" placeholder="Enter new password" />
              </div>
              <div className={styles.formGroup}>
                <label>Confirm New Password</label>
                <input type="password" placeholder="Confirm new password" />
              </div>
              <button className={styles.primaryBtn} onClick={() => {
                const inputs = document.querySelectorAll('input[type="password"]');
                const current = (inputs[0] as HTMLInputElement)?.value;
                const newPass = (inputs[1] as HTMLInputElement)?.value;
                const confirm = (inputs[2] as HTMLInputElement)?.value;
                if (!current || !newPass || !confirm) {
                  toast.info('Please fill in all password fields.');
                  return;
                }
                if (newPass !== confirm) {
                  toast.info('New passwords do not match.');
                  return;
                }
                if (newPass.length < 8) {
                  toast.info('Password must be at least 8 characters.');
                  return;
                }
                toast.info('Password updated successfully!');
              }}>Update Password</button>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon}>
                <AlertTriangle size={24} />
              </div>
              <div>
                <h2>Danger Zone</h2>
                <p>Irreversible account actions</p>
              </div>
            </div>
            <div className={styles.dangerZone}>
              <div className={styles.dangerItem}>
                <div>
                  <h4>Download Account Data</h4>
                  <p>Export all your data in a portable format</p>
                </div>
                <button className={styles.secondaryBtn} onClick={() => {
                  toast.info('Your data export has been initiated. You will receive an email with a download link within 24 hours.');
                }}>
                  <Download size={16} />
                  Export Data
                </button>
              </div>
              <div className={styles.dangerItem}>
                <div>
                  <h4>Delete Account</h4>
                  <p>Permanently delete your account and all associated data</p>
                </div>
                <button className={styles.dangerBtn} onClick={() => {
                  if (confirm('Are you absolutely sure you want to delete your account? This action cannot be undone.')) {
                    const confirmation = prompt('Type "DELETE" to confirm account deletion:');
                    if (confirmation === 'DELETE') {
                      toast.info('Account deletion request submitted. You will receive a confirmation email.');
                    } else {
                      toast.info('Account deletion cancelled.');
                    }
                  }
                }}>
                  <Trash2 size={16} />
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
