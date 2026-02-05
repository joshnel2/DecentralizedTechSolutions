import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useDataStore } from '../stores/dataStore'
import { userSettingsApi } from '../services/api'
import { 
  User, Lock, Bell, Shield, Save, Calendar, Clock, 
  Palette, Download, Trash2, CheckCircle2, ArrowLeft,
  Tags, Plus, Edit2, Bot, Sparkles
} from 'lucide-react'
import styles from './SettingsPage.module.css'
import { useToast } from '../components/Toast'

export function SettingsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user, updateUser } = useAuthStore()
  const { matterTypes, addMatterType, updateMatterType, deleteMatterType, toggleMatterTypeActive } = useDataStore()
  const [activeTab, setActiveTab] = useState('profile')
  const [saved, setSaved] = useState(false)
  const [newMatterType, setNewMatterType] = useState('')
  const [editingMatterType, setEditingMatterType] = useState<{ id: string; label: string } | null>(null)
  
  const [profileData, setProfileData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: '',
    title: 'Partner',
    barNumber: '',
    jurisdiction: ''
  })

  const [securityData, setSecurityData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactorEnabled: false
  })

  const [notificationData, setNotificationData] = useState({
    emailNotifications: true,
    deadlineReminders: true,
    matterUpdates: true,
    calendarReminders: true,
    aiInsights: true,
    weeklyDigest: true,
    reminderTime: '24'
  })

  const [calendarData, setCalendarData] = useState({
    defaultView: 'month',
    weekStart: 'sunday',
    workingHoursStart: '09:00',
    workingHoursEnd: '17:00',
    defaultEventDuration: '60',
    showWeekends: true,
    defaultReminder: '15'
  })

  const [billingData, setBillingData] = useState({
    defaultRate: 450,
    billingIncrement: '6',
    roundingMethod: 'up',
    autoSaveTimer: true,
    requireDescription: true,
    defaultBillable: true,
    trackNonBillable: true
  })

  const [displayData, setDisplayData] = useState({
    theme: 'dark',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    timezone: 'America/New_York',
    language: 'en',
    compactMode: false
  })

  const [aiSettings, setAiSettings] = useState({
    customInstructions: ''
  })
  const [_aiSettingsLoading, setAiSettingsLoading] = useState(false)

  // Load AI settings on mount
  useEffect(() => {
    const loadAISettings = async () => {
      try {
        const result = await userSettingsApi.getAISettings()
        setAiSettings({
          customInstructions: result.aiCustomInstructions || ''
        })
      } catch (error) {
        console.error('Failed to load AI settings:', error)
      }
    }
    loadAISettings()
  }, [])

  const handleSave = async () => {
    // Save profile updates
    updateUser({
      firstName: profileData.firstName,
      lastName: profileData.lastName
    })

    // Save AI settings if on that tab
    if (activeTab === 'aiPreferences') {
      setAiSettingsLoading(true)
      try {
        await userSettingsApi.updateAISettings({
          aiCustomInstructions: aiSettings.customInstructions
        })
      } catch (error) {
        console.error('Failed to save AI settings:', error)
      } finally {
        setAiSettingsLoading(false)
      }
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleAddMatterType = () => {
    if (newMatterType.trim()) {
      addMatterType({
        value: newMatterType.toLowerCase().replace(/\s+/g, '_'),
        label: newMatterType.trim()
      })
      setNewMatterType('')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  const handleUpdateMatterType = (id: string, label: string) => {
    updateMatterType(id, { 
      label,
      value: label.toLowerCase().replace(/\s+/g, '_')
    })
    setEditingMatterType(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'billing', label: 'Time Tracking', icon: Clock },
    { id: 'matterTypes', label: 'Matter Types', icon: Tags },
    { id: 'aiPreferences', label: 'AI Assistant', icon: Bot },
    { id: 'display', label: 'Display', icon: Palette }
  ]

  return (
    <div className={styles.settingsPage}>
      <button className={styles.backButton} onClick={() => navigate('/app/settings')}>
        <ArrowLeft size={16} />
        Back to Settings
      </button>
      <div className={styles.header}>
        <h1>My Settings</h1>
        <p>Manage your personal account settings and preferences</p>
      </div>

      <div className={styles.settingsLayout}>
        {/* Settings Navigation */}
        <nav className={styles.settingsNav}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`${styles.navItem} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Settings Content */}
        <div className={styles.settingsContent}>
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <User size={20} />
                  <div>
                    <h2>Profile Information</h2>
                    <p>Your personal details and professional information</p>
                  </div>
                </div>

                <div className={styles.avatarSection}>
                  <div className={styles.avatar}>
                    {user?.firstName?.[0]}{user?.lastName?.[0]}
                  </div>
                  <div>
                    <input 
                      type="file" 
                      id="avatarUpload" 
                      accept="image/*" 
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          if (file.size > 2 * 1024 * 1024) {
                            toast.warning('File size must be less than 2MB')
                            return
                          }
                          toast.success('Photo uploaded successfully!')
                        }
                      }}
                    />
                    <button 
                      className={styles.uploadBtn}
                      onClick={() => document.getElementById('avatarUpload')?.click()}
                    >
                      Change Photo
                    </button>
                    <p>JPG, PNG or GIF. Max 2MB.</p>
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>First Name</label>
                    <input
                      type="text"
                      value={profileData.firstName}
                      onChange={e => setProfileData({...profileData, firstName: e.target.value})}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Last Name</label>
                    <input
                      type="text"
                      value={profileData.lastName}
                      onChange={e => setProfileData({...profileData, lastName: e.target.value})}
                    />
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Email Address</label>
                    <input
                      type="email"
                      value={profileData.email}
                      onChange={e => setProfileData({...profileData, email: e.target.value})}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Phone Number</label>
                    <input
                      type="tel"
                      value={profileData.phone}
                      onChange={e => setProfileData({...profileData, phone: e.target.value})}
                      placeholder="(555) 555-0100"
                    />
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Title / Position</label>
                    <select
                      value={profileData.title}
                      onChange={e => setProfileData({...profileData, title: e.target.value})}
                    >
                      <option value="Partner">Partner</option>
                      <option value="Associate">Associate</option>
                      <option value="Of Counsel">Of Counsel</option>
                      <option value="Paralegal">Paralegal</option>
                      <option value="Legal Assistant">Legal Assistant</option>
                      <option value="Administrator">Administrator</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Bar Number</label>
                    <input
                      type="text"
                      value={profileData.barNumber}
                      onChange={e => setProfileData({...profileData, barNumber: e.target.value})}
                      placeholder="123456"
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Jurisdiction(s)</label>
                  <input
                    type="text"
                    value={profileData.jurisdiction}
                    onChange={e => setProfileData({...profileData, jurisdiction: e.target.value})}
                    placeholder="New York, California"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Lock size={20} />
                  <div>
                    <h2>Password</h2>
                    <p>Change your password to keep your account secure</p>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Current Password</label>
                  <input
                    type="password"
                    value={securityData.currentPassword}
                    onChange={e => setSecurityData({...securityData, currentPassword: e.target.value})}
                    placeholder="Enter current password"
                  />
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>New Password</label>
                    <input
                      type="password"
                      value={securityData.newPassword}
                      onChange={e => setSecurityData({...securityData, newPassword: e.target.value})}
                      placeholder="Enter new password"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Confirm New Password</label>
                    <input
                      type="password"
                      value={securityData.confirmPassword}
                      onChange={e => setSecurityData({...securityData, confirmPassword: e.target.value})}
                      placeholder="Confirm new password"
                    />
                  </div>
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Shield size={20} />
                  <div>
                    <h2>Two-Factor Authentication</h2>
                    <p>Add an extra layer of security to your account</p>
                  </div>
                </div>

                <div className={styles.toggle}>
                  <div>
                    <span className={styles.toggleLabel}>Enable 2FA</span>
                    <span className={styles.toggleDesc}>Require a verification code when signing in</span>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={securityData.twoFactorEnabled}
                      onChange={e => setSecurityData({...securityData, twoFactorEnabled: e.target.checked})}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>
              </div>

            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Bell size={20} />
                  <div>
                    <h2>Email Notifications</h2>
                    <p>Choose what emails you want to receive</p>
                  </div>
                </div>

                <div className={styles.toggleGroup}>
                  <div className={styles.toggle}>
                    <div>
                      <span className={styles.toggleLabel}>All Email Notifications</span>
                      <span className={styles.toggleDesc}>Master toggle for all email notifications</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={notificationData.emailNotifications}
                        onChange={e => setNotificationData({...notificationData, emailNotifications: e.target.checked})}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>

                  <div className={styles.toggle}>
                    <div>
                      <span className={styles.toggleLabel}>Deadline Reminders</span>
                      <span className={styles.toggleDesc}>Get notified before important deadlines</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={notificationData.deadlineReminders}
                        onChange={e => setNotificationData({...notificationData, deadlineReminders: e.target.checked})}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>

                  <div className={styles.toggle}>
                    <div>
                      <span className={styles.toggleLabel}>Matter Updates</span>
                      <span className={styles.toggleDesc}>Activity on your assigned matters</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={notificationData.matterUpdates}
                        onChange={e => setNotificationData({...notificationData, matterUpdates: e.target.checked})}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>

                  <div className={styles.toggle}>
                    <div>
                      <span className={styles.toggleLabel}>Calendar Reminders</span>
                      <span className={styles.toggleDesc}>Event and meeting reminders</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={notificationData.calendarReminders}
                        onChange={e => setNotificationData({...notificationData, calendarReminders: e.target.checked})}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>

                  <div className={styles.toggle}>
                    <div>
                      <span className={styles.toggleLabel}>AI Insights</span>
                      <span className={styles.toggleDesc}>AI-generated suggestions and analysis</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={notificationData.aiInsights}
                        onChange={e => setNotificationData({...notificationData, aiInsights: e.target.checked})}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>

                  <div className={styles.toggle}>
                    <div>
                      <span className={styles.toggleLabel}>Weekly Digest</span>
                      <span className={styles.toggleDesc}>Summary of weekly activity</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={notificationData.weeklyDigest}
                        onChange={e => setNotificationData({...notificationData, weeklyDigest: e.target.checked})}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Default Reminder Time</label>
                  <select
                    value={notificationData.reminderTime}
                    onChange={e => setNotificationData({...notificationData, reminderTime: e.target.value})}
                  >
                    <option value="15">15 minutes before</option>
                    <option value="30">30 minutes before</option>
                    <option value="60">1 hour before</option>
                    <option value="120">2 hours before</option>
                    <option value="1440">1 day before</option>
                    <option value="2880">2 days before</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Calendar Tab */}
          {activeTab === 'calendar' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Calendar size={20} />
                  <div>
                    <h2>Calendar Preferences</h2>
                    <p>Customize your calendar display and behavior</p>
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Default View</label>
                    <select
                      value={calendarData.defaultView}
                      onChange={e => setCalendarData({...calendarData, defaultView: e.target.value})}
                    >
                      <option value="day">Day</option>
                      <option value="week">Week</option>
                      <option value="month">Month</option>
                      <option value="agenda">Agenda</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Week Starts On</label>
                    <select
                      value={calendarData.weekStart}
                      onChange={e => setCalendarData({...calendarData, weekStart: e.target.value})}
                    >
                      <option value="sunday">Sunday</option>
                      <option value="monday">Monday</option>
                    </select>
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Working Hours Start</label>
                    <input
                      type="time"
                      value={calendarData.workingHoursStart}
                      onChange={e => setCalendarData({...calendarData, workingHoursStart: e.target.value})}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Working Hours End</label>
                    <input
                      type="time"
                      value={calendarData.workingHoursEnd}
                      onChange={e => setCalendarData({...calendarData, workingHoursEnd: e.target.value})}
                    />
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Default Event Duration</label>
                    <select
                      value={calendarData.defaultEventDuration}
                      onChange={e => setCalendarData({...calendarData, defaultEventDuration: e.target.value})}
                    >
                      <option value="15">15 minutes</option>
                      <option value="30">30 minutes</option>
                      <option value="60">1 hour</option>
                      <option value="90">1.5 hours</option>
                      <option value="120">2 hours</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Default Reminder</label>
                    <select
                      value={calendarData.defaultReminder}
                      onChange={e => setCalendarData({...calendarData, defaultReminder: e.target.value})}
                    >
                      <option value="0">None</option>
                      <option value="5">5 minutes</option>
                      <option value="10">10 minutes</option>
                      <option value="15">15 minutes</option>
                      <option value="30">30 minutes</option>
                      <option value="60">1 hour</option>
                    </select>
                  </div>
                </div>

                <div className={styles.toggle}>
                  <div>
                    <span className={styles.toggleLabel}>Show Weekends</span>
                    <span className={styles.toggleDesc}>Display Saturday and Sunday in calendar views</span>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={calendarData.showWeekends}
                      onChange={e => setCalendarData({...calendarData, showWeekends: e.target.checked})}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Time Tracking Tab */}
          {activeTab === 'billing' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Clock size={20} />
                  <div>
                    <h2>Time Tracking Preferences</h2>
                    <p>Configure your default time tracking settings</p>
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Default Hourly Rate ($)</label>
                    <input
                      type="number"
                      value={billingData.defaultRate}
                      onChange={e => setBillingData({...billingData, defaultRate: parseInt(e.target.value)})}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Billing Increment</label>
                    <select
                      value={billingData.billingIncrement}
                      onChange={e => setBillingData({...billingData, billingIncrement: e.target.value})}
                    >
                      <option value="1">1 minute</option>
                      <option value="6">6 minutes (0.1 hr)</option>
                      <option value="10">10 minutes</option>
                      <option value="15">15 minutes (0.25 hr)</option>
                      <option value="30">30 minutes (0.5 hr)</option>
                    </select>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Rounding Method</label>
                  <select
                    value={billingData.roundingMethod}
                    onChange={e => setBillingData({...billingData, roundingMethod: e.target.value})}
                  >
                    <option value="up">Round Up</option>
                    <option value="down">Round Down</option>
                    <option value="nearest">Round to Nearest</option>
                    <option value="none">No Rounding</option>
                  </select>
                </div>

                <div className={styles.toggleGroup}>
                  <div className={styles.toggle}>
                    <div>
                      <span className={styles.toggleLabel}>Auto-save Timer Entries</span>
                      <span className={styles.toggleDesc}>Automatically save timer entries when stopped</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={billingData.autoSaveTimer}
                        onChange={e => setBillingData({...billingData, autoSaveTimer: e.target.checked})}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>

                  <div className={styles.toggle}>
                    <div>
                      <span className={styles.toggleLabel}>Require Description</span>
                      <span className={styles.toggleDesc}>Require a description for all time entries</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={billingData.requireDescription}
                        onChange={e => setBillingData({...billingData, requireDescription: e.target.checked})}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>

                  <div className={styles.toggle}>
                    <div>
                      <span className={styles.toggleLabel}>Default to Billable</span>
                      <span className={styles.toggleDesc}>New time entries are billable by default</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={billingData.defaultBillable}
                        onChange={e => setBillingData({...billingData, defaultBillable: e.target.checked})}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>

                  <div className={styles.toggle}>
                    <div>
                      <span className={styles.toggleLabel}>Track Non-Billable Time</span>
                      <span className={styles.toggleDesc}>Also track non-billable hours</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={billingData.trackNonBillable}
                        onChange={e => setBillingData({...billingData, trackNonBillable: e.target.checked})}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Matter Types Tab */}
          {activeTab === 'matterTypes' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Tags size={20} />
                  <div>
                    <h2>Matter Types</h2>
                    <p>Customize the matter types available in dropdowns when creating or editing matters</p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  <input
                    type="text"
                    value={newMatterType}
                    onChange={e => setNewMatterType(e.target.value)}
                    placeholder="Add new matter type..."
                    onKeyPress={e => e.key === 'Enter' && handleAddMatterType()}
                    style={{ 
                      flex: 1,
                      padding: '0.625rem 1rem',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: '0.9rem'
                    }}
                  />
                  <button 
                    onClick={handleAddMatterType}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.625rem 1rem',
                      background: 'var(--gold-primary)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--bg-primary)',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={18} />
                    Add
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {matterTypes.map(matterType => (
                    <div 
                      key={matterType.id} 
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem 1rem',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-sm)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span 
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: matterType.active ? 'var(--success)' : 'var(--text-tertiary)'
                          }}
                        />
                        {editingMatterType?.id === matterType.id ? (
                          <input
                            type="text"
                            value={editingMatterType.label}
                            onChange={e => setEditingMatterType({ ...editingMatterType, label: e.target.value })}
                            onBlur={() => handleUpdateMatterType(matterType.id, editingMatterType.label)}
                            onKeyPress={e => {
                              if (e.key === 'Enter') {
                                handleUpdateMatterType(matterType.id, editingMatterType.label)
                              }
                            }}
                            autoFocus
                            style={{ 
                              background: 'var(--bg-secondary)', 
                              border: '1px solid var(--gold-primary)',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              color: 'var(--text-primary)',
                              fontSize: '0.9rem'
                            }}
                          />
                        ) : (
                          <span style={{ color: 'var(--text-primary)' }}>{matterType.label}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                          onClick={() => setEditingMatterType({ id: matterType.id, label: matterType.label })}
                          title="Edit"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '32px',
                            height: '32px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer'
                          }}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => {
                            toggleMatterTypeActive(matterType.id)
                            setSaved(true)
                            setTimeout(() => setSaved(false), 3000)
                          }}
                          style={{
                            padding: '0.375rem 0.75rem',
                            background: 'transparent',
                            border: '1px solid var(--border-primary)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-secondary)',
                            fontSize: '0.75rem',
                            cursor: 'pointer'
                          }}
                        >
                          {matterType.active ? 'Disable' : 'Enable'}
                        </button>
                        <button 
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete "${matterType.label}"? Existing matters with this type will not be affected.`)) {
                              deleteMatterType(matterType.id)
                              setSaved(true)
                              setTimeout(() => setSaved(false), 3000)
                            }
                          }}
                          title="Delete"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '32px',
                            height: '32px',
                            background: 'transparent',
                            border: '1px solid transparent',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-tertiary)',
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {matterTypes.length === 0 && (
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    padding: '3rem',
                    textAlign: 'center',
                    color: 'var(--text-tertiary)'
                  }}>
                    <Tags size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                    <p>No matter types defined</p>
                    <p style={{ fontSize: '0.85rem' }}>
                      Add matter types above to categorize your legal matters
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI Preferences Tab */}
          {activeTab === 'aiPreferences' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Bot size={20} />
                  <div>
                    <h2>AI Assistant Preferences</h2>
                    <p>Customize how the AI assistant behaves when interacting with you</p>
                  </div>
                </div>

                <div style={{
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.1))',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-lg)',
                  marginBottom: 'var(--spacing-lg)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
                    <Sparkles size={20} style={{ color: 'var(--gold-primary)', flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <h3 style={{ margin: 0, marginBottom: '0.5rem', fontSize: '1rem', color: 'var(--text-primary)' }}>
                        Custom Instructions
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        Tell the AI about yourself and how you'd like it to respond. These instructions will be applied to all your conversations with the AI assistant.
                      </p>
                    </div>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>What would you like the AI to know about you?</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      {aiSettings.customInstructions.length}/2000
                    </span>
                  </label>
                  <textarea
                    value={aiSettings.customInstructions}
                    onChange={e => setAiSettings({ ...aiSettings, customInstructions: e.target.value.slice(0, 2000) })}
                    placeholder="Examples:
• I specialize in intellectual property and patent law
• I prefer concise, bullet-point responses
• Always use formal language in your responses
• When drafting documents, use our firm's standard formatting
• I work with clients primarily in the healthcare industry
• Remind me about statute of limitations when relevant"
                    rows={8}
                    style={{ 
                      resize: 'vertical',
                      minHeight: '180px',
                      fontFamily: 'inherit',
                      lineHeight: 1.6
                    }}
                  />
                </div>

                <div style={{
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 'var(--spacing-md)',
                  marginTop: 'var(--spacing-md)'
                }}>
                  <h4 style={{ margin: 0, marginBottom: '0.75rem', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                    💡 Tips for effective instructions:
                  </h4>
                  <ul style={{ 
                    margin: 0, 
                    paddingLeft: '1.25rem', 
                    fontSize: '0.85rem', 
                    color: 'var(--text-secondary)',
                    lineHeight: 1.7
                  }}>
                    <li>Share your practice area or specialization</li>
                    <li>Mention preferred response format (detailed vs. concise)</li>
                    <li>Include any firm-specific terminology or procedures</li>
                    <li>Specify your preferred communication style</li>
                    <li>Note any recurring tasks you need help with</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Display Tab */}
          {activeTab === 'display' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Palette size={20} />
                  <div>
                    <h2>Display Preferences</h2>
                    <p>Customize how Apex looks and feels</p>
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Theme</label>
                    <select
                      value={displayData.theme}
                      onChange={e => setDisplayData({...displayData, theme: e.target.value})}
                    >
                      <option value="dark">Dark</option>
                      <option value="light">Light</option>
                      <option value="system">System Default</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Language</label>
                    <select
                      value={displayData.language}
                      onChange={e => setDisplayData({...displayData, language: e.target.value})}
                    >
                      <option value="en">English</option>
                      <option value="es">Español</option>
                      <option value="fr">Français</option>
                    </select>
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Date Format</label>
                    <select
                      value={displayData.dateFormat}
                      onChange={e => setDisplayData({...displayData, dateFormat: e.target.value})}
                    >
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Time Format</label>
                    <select
                      value={displayData.timeFormat}
                      onChange={e => setDisplayData({...displayData, timeFormat: e.target.value})}
                    >
                      <option value="12h">12-hour (AM/PM)</option>
                      <option value="24h">24-hour</option>
                    </select>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Timezone</label>
                  <select
                    value={displayData.timezone}
                    onChange={e => setDisplayData({...displayData, timezone: e.target.value})}
                  >
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    <option value="America/Anchorage">Alaska Time (AKT)</option>
                    <option value="Pacific/Honolulu">Hawaii Time (HT)</option>
                  </select>
                </div>

                <div className={styles.toggle}>
                  <div>
                    <span className={styles.toggleLabel}>Compact Mode</span>
                    <span className={styles.toggleDesc}>Show more content with less spacing</span>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={displayData.compactMode}
                      onChange={e => setDisplayData({...displayData, compactMode: e.target.checked})}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Download size={20} />
                  <div>
                    <h2>Data & Privacy</h2>
                    <p>Manage your data and export options</p>
                  </div>
                </div>

                <div className={styles.actionButtons}>
                  <button 
                    className={styles.secondaryBtn}
                    onClick={() => {
                      toast.info('Data Export Initiated', 'You will receive an email when the export is ready to download.')
                    }}
                  >
                    <Download size={16} />
                    Export My Data
                  </button>
                  <button 
                    className={styles.dangerBtn}
                    onClick={() => {
                      if (confirm('Are you sure you want to delete your account? This action is irreversible and all your data will be permanently deleted.')) {
                        if (confirm('This is your final confirmation. Type "DELETE" to confirm.')) {
                          toast.info('Account Deletion Scheduled', 'You will be logged out shortly.')
                        }
                      }
                    }}
                  >
                    <Trash2 size={16} />
                    Delete My Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className={styles.saveBar}>
            {saved && (
              <span className={styles.savedMessage}>
                <CheckCircle2 size={16} />
                Settings saved successfully!
              </span>
            )}
            <button className={styles.saveBtn} onClick={handleSave}>
              <Save size={18} />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
