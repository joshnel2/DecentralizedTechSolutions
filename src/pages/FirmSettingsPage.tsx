import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useDataStore } from '../stores/dataStore'
import { 
  Building2, CreditCard, Brain, Shield, Save, Users, Briefcase,
  DollarSign, Clock, Sparkles, CheckCircle2,
  AlertTriangle, Plus, Trash2, Edit2, UserPlus, X,
  Mail, UserCog, UserMinus, Landmark, Wallet, TrendingUp, PiggyBank, ArrowLeft
} from 'lucide-react'
import styles from './FirmSettingsPage.module.css'

// Demo users for the firm
const demoUsers = [
  { id: 'user-1', firstName: 'John', lastName: 'Mitchell', email: 'john@apexlaw.com', role: 'owner', title: 'Managing Partner' },
  { id: 'user-2', firstName: 'Sarah', lastName: 'Chen', email: 'sarah@apexlaw.com', role: 'admin', title: 'Partner' },
  { id: 'user-3', firstName: 'Michael', lastName: 'Roberts', email: 'michael@apexlaw.com', role: 'attorney', title: 'Associate' },
  { id: 'user-4', firstName: 'Emily', lastName: 'Davis', email: 'emily@apexlaw.com', role: 'paralegal', title: 'Senior Paralegal' },
  { id: 'user-5', firstName: 'James', lastName: 'Wilson', email: 'james@apexlaw.com', role: 'attorney', title: 'Associate' },
  { id: 'user-6', firstName: 'Lisa', lastName: 'Thompson', email: 'lisa@apexlaw.com', role: 'staff', title: 'Legal Assistant' }
]

const permissionOptions = [
  { id: 'matters:all', label: 'Matters - Full Access' },
  { id: 'matters:view', label: 'Matters - View Only' },
  { id: 'documents:all', label: 'Documents - Full Access' },
  { id: 'documents:view', label: 'Documents - View Only' },
  { id: 'billing:all', label: 'Billing - Full Access' },
  { id: 'billing:view', label: 'Billing - View Only' },
  { id: 'calendar:all', label: 'Calendar - Full Access' },
  { id: 'calendar:view', label: 'Calendar - View Only' },
  { id: 'reports:all', label: 'Reports - Full Access' },
  { id: 'reports:view', label: 'Reports - View Only' },
  { id: 'admin:settings', label: 'Admin - Firm Settings' },
  { id: 'admin:users', label: 'Admin - User Management' }
]

const groupColors = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
  '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9',
  '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF', '#EC4899'
]

export function FirmSettingsPage() {
  const navigate = useNavigate()
  const { firm, updateFirm, user } = useAuthStore()
  const { groups, addGroup, updateGroup, deleteGroup, clients, invoices } = useDataStore()
  const [activeTab, setActiveTab] = useState('accounts')
  
  // Calculate account balances
  const accountBalances = useMemo(() => {
    const totalRetainers = clients.reduce((sum, c) => sum + (c.clientInfo?.trustBalance || 0), 0)
    const outstandingAR = invoices
      .filter(i => i.status !== 'paid' && i.status !== 'void')
      .reduce((sum, i) => sum + i.amountDue, 0)
    const operatingBalance = 284750.00
    
    return {
      operating: operatingBalance,
      trust: totalRetainers || 127500.00,
      outstanding: outstandingAR || 49750.00
    }
  }, [clients, invoices])
  const [saved, setSaved] = useState(false)

  // Modal states
  const [showNewGroupModal, setShowNewGroupModal] = useState(false)
  const [showEditGroupModal, setShowEditGroupModal] = useState(false)
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [showInviteUserModal, setShowInviteUserModal] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<any>(null)

  const [firmData, setFirmData] = useState({
    name: firm?.name || '',
    address: firm?.address || '',
    city: '',
    state: '',
    zip: '',
    phone: '',
    fax: '',
    email: '',
    website: '',
    taxId: ''
  })

  const [billingSettings, setBillingSettings] = useState({
    defaultHourlyRate: firm?.billingDefaults?.hourlyRate || 350,
    billingIncrement: firm?.billingDefaults?.incrementMinutes || 6,
    paymentTerms: 30,
    lateFeePercent: 1.5,
    currency: 'USD',
    taxRate: 0,
    trustAccountRequired: true,
    retainerMinimum: 5000
  })

  const [practiceAreas, setPracticeAreas] = useState([
    { id: '1', name: 'Corporate Law', active: true },
    { id: '2', name: 'Litigation', active: true },
    { id: '3', name: 'Real Estate', active: true },
    { id: '4', name: 'Intellectual Property', active: true },
    { id: '5', name: 'Employment Law', active: true },
    { id: '6', name: 'Tax Law', active: true },
    { id: '7', name: 'Estate Planning', active: true },
    { id: '8', name: 'Bankruptcy', active: false },
    { id: '9', name: 'Family Law', active: false },
    { id: '10', name: 'Immigration', active: false }
  ])

  const [activityCodes, setActivityCodes] = useState([
    { id: '1', code: 'A101', description: 'Legal Research', billable: true },
    { id: '2', code: 'A102', description: 'Document Review', billable: true },
    { id: '3', code: 'A103', description: 'Client Meeting', billable: true },
    { id: '4', code: 'A104', description: 'Court Appearance', billable: true },
    { id: '5', code: 'A105', description: 'Drafting', billable: true },
    { id: '6', code: 'A201', description: 'Administrative', billable: false },
    { id: '7', code: 'A202', description: 'Pro Bono', billable: false }
  ])

  const [aiSettings, setAiSettings] = useState({
    enabled: true,
    provider: 'azure',
    endpoint: firm?.azureOpenAI?.endpoint || '',
    apiKey: firm?.azureOpenAI?.apiKey || '',
    deploymentName: firm?.azureOpenAI?.deploymentName || '',
    autoSuggest: true,
    documentAnalysis: true,
    matterSummaries: true,
    conflictCheck: true
  })

  const [securitySettings, setSecuritySettings] = useState({
    requireMfa: true,
    sessionTimeout: 60,
    passwordMinLength: 12,
    passwordRequireSpecial: true,
    ipWhitelist: '',
    auditLogging: true,
    dataRetentionDays: 365
  })

  const [newPracticeArea, setNewPracticeArea] = useState('')
  const [newActivityCode, setNewActivityCode] = useState({ code: '', description: '', billable: true })

  const handleSave = () => {
    updateFirm({
      name: firmData.name,
      address: firmData.address,
      billingDefaults: {
        hourlyRate: billingSettings.defaultHourlyRate,
        incrementMinutes: billingSettings.billingIncrement
      },
      azureOpenAI: {
        endpoint: aiSettings.endpoint,
        apiKey: aiSettings.apiKey,
        deploymentName: aiSettings.deploymentName
      }
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const addPracticeArea = () => {
    if (newPracticeArea.trim()) {
      setPracticeAreas([...practiceAreas, {
        id: Date.now().toString(),
        name: newPracticeArea,
        active: true
      }])
      setNewPracticeArea('')
    }
  }

  const addActivityCode = () => {
    if (newActivityCode.code && newActivityCode.description) {
      setActivityCodes([...activityCodes, {
        id: Date.now().toString(),
        ...newActivityCode
      }])
      setNewActivityCode({ code: '', description: '', billable: true })
    }
  }

  const getUserById = (id: string) => demoUsers.find(u => u.id === id)

  const tabs = [
    { id: 'accounts', label: 'Accounts', icon: Wallet },
    { id: 'general', label: 'Firm Info', icon: Building2 },
    { id: 'users', label: 'Users & Teams', icon: Users },
    { id: 'billing', label: 'Billing & Rates', icon: DollarSign },
    { id: 'practice', label: 'Practice Areas', icon: Briefcase },
    { id: 'activities', label: 'Activity Codes', icon: Clock },
    { id: 'ai', label: 'AI Configuration', icon: Brain },
    { id: 'security', label: 'Security', icon: Shield }
  ]

  const isAdmin = user?.role === 'admin' || user?.role === 'owner'

  if (!isAdmin) {
    return (
      <div className={styles.noAccess}>
        <AlertTriangle size={48} />
        <h2>Access Denied</h2>
        <p>You need administrator privileges to access firm settings.</p>
      </div>
    )
  }

  return (
    <div className={styles.firmSettingsPage}>
      <button className={styles.backButton} onClick={() => navigate('/app/settings')}>
        <ArrowLeft size={16} />
        Back to Settings
      </button>
      <div className={styles.header}>
        <h1>Firm Settings</h1>
        <p>Manage your firm's configuration, users, and AI settings</p>
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
          {/* Accounts Tab */}
          {activeTab === 'accounts' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Wallet size={20} />
                  <div>
                    <h2>Account Balances</h2>
                    <p>Overview of your firm's financial accounts</p>
                  </div>
                </div>

                <div className={styles.accountsGrid}>
                  <div className={styles.accountCard}>
                    <div className={styles.accountCardIcon} style={{ background: 'rgba(59, 130, 246, 0.15)' }}>
                      <Landmark size={24} color="#3B82F6" />
                    </div>
                    <div className={styles.accountCardInfo}>
                      <span className={styles.accountCardLabel}>Operating Account</span>
                      <span className={styles.accountCardBalance} style={{ color: '#3B82F6' }}>
                        ${accountBalances.operating.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                      <span className={styles.accountCardNote}>Primary business account</span>
                    </div>
                    <div className={styles.accountCardTrend} style={{ color: '#10B981' }}>
                      <TrendingUp size={16} />
                      <span>+2.4%</span>
                    </div>
                  </div>

                  <div className={styles.accountCard}>
                    <div className={styles.accountCardIcon} style={{ background: 'rgba(16, 185, 129, 0.15)' }}>
                      <PiggyBank size={24} color="#10B981" />
                    </div>
                    <div className={styles.accountCardInfo}>
                      <span className={styles.accountCardLabel}>Trust/IOLTA Account</span>
                      <span className={styles.accountCardBalance} style={{ color: '#10B981' }}>
                        ${accountBalances.trust.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                      <span className={styles.accountCardNote}>Client trust funds</span>
                    </div>
                    <div className={styles.accountCardTrend} style={{ color: '#10B981' }}>
                      <TrendingUp size={16} />
                      <span>+5.1%</span>
                    </div>
                  </div>

                  <div className={styles.accountCard}>
                    <div className={styles.accountCardIcon} style={{ background: 'rgba(245, 158, 11, 0.15)' }}>
                      <DollarSign size={24} color="#F59E0B" />
                    </div>
                    <div className={styles.accountCardInfo}>
                      <span className={styles.accountCardLabel}>Outstanding AR</span>
                      <span className={styles.accountCardBalance} style={{ color: '#F59E0B' }}>
                        ${accountBalances.outstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                      <span className={styles.accountCardNote}>Accounts receivable</span>
                    </div>
                    <div className={styles.accountCardTrend} style={{ color: '#EF4444' }}>
                      <TrendingUp size={16} style={{ transform: 'rotate(180deg)' }} />
                      <span>-12.3%</span>
                    </div>
                  </div>
                </div>

                <div className={styles.accountsSummary}>
                  <h3>Quick Summary</h3>
                  <div className={styles.summaryItems}>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Total Liquid Assets</span>
                      <span className={styles.summaryValue}>
                        ${(accountBalances.operating + accountBalances.trust).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Collection Rate (MTD)</span>
                      <span className={styles.summaryValue}>94.2%</span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Average Days to Collect</span>
                      <span className={styles.summaryValue}>18 days</span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Last Reconciliation</span>
                      <span className={styles.summaryValue}>Nov 24, 2025</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* General Tab */}
          {activeTab === 'general' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Building2 size={20} />
                  <div>
                    <h2>Firm Information</h2>
                    <p>Basic information about your law firm</p>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Firm Name</label>
                  <input
                    type="text"
                    value={firmData.name}
                    onChange={e => setFirmData({...firmData, name: e.target.value})}
                    placeholder="Your Law Firm LLP"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Street Address</label>
                  <input
                    type="text"
                    value={firmData.address}
                    onChange={e => setFirmData({...firmData, address: e.target.value})}
                    placeholder="123 Legal Avenue, Suite 400"
                  />
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>City</label>
                    <input
                      type="text"
                      value={firmData.city}
                      onChange={e => setFirmData({...firmData, city: e.target.value})}
                      placeholder="New York"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>State</label>
                    <input
                      type="text"
                      value={firmData.state}
                      onChange={e => setFirmData({...firmData, state: e.target.value})}
                      placeholder="NY"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>ZIP Code</label>
                    <input
                      type="text"
                      value={firmData.zip}
                      onChange={e => setFirmData({...firmData, zip: e.target.value})}
                      placeholder="10001"
                    />
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Phone</label>
                    <input
                      type="tel"
                      value={firmData.phone}
                      onChange={e => setFirmData({...firmData, phone: e.target.value})}
                      placeholder="(555) 555-0100"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Fax</label>
                    <input
                      type="tel"
                      value={firmData.fax}
                      onChange={e => setFirmData({...firmData, fax: e.target.value})}
                      placeholder="(555) 555-0101"
                    />
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Email</label>
                    <input
                      type="email"
                      value={firmData.email}
                      onChange={e => setFirmData({...firmData, email: e.target.value})}
                      placeholder="info@yourfirm.com"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Website</label>
                    <input
                      type="url"
                      value={firmData.website}
                      onChange={e => setFirmData({...firmData, website: e.target.value})}
                      placeholder="https://yourfirm.com"
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Tax ID / EIN</label>
                  <input
                    type="text"
                    value={firmData.taxId}
                    onChange={e => setFirmData({...firmData, taxId: e.target.value})}
                    placeholder="XX-XXXXXXX"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Users & Teams Tab */}
          {activeTab === 'users' && (
            <div className={styles.tabContent}>
              {/* Users Section */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Users size={20} />
                  <div>
                    <h2>Team Members</h2>
                    <p>Manage users and their roles in your firm</p>
                  </div>
                  <button 
                    className={styles.headerBtn}
                    onClick={() => setShowInviteUserModal(true)}
                  >
                    <UserPlus size={16} />
                    Invite User
                  </button>
                </div>

                <div className={styles.usersList}>
                  {demoUsers.map(u => (
                    <div key={u.id} className={styles.userCard}>
                      <div className={styles.userAvatar}>
                        {u.firstName[0]}{u.lastName[0]}
                      </div>
                      <div className={styles.userInfo}>
                        <span className={styles.userName}>{u.firstName} {u.lastName}</span>
                        <span className={styles.userTitle}>{u.title}</span>
                        <span className={styles.userEmail}>{u.email}</span>
                      </div>
                      <div className={styles.userRole}>
                        <span className={`${styles.roleBadge} ${styles[u.role]}`}>
                          {u.role}
                        </span>
                      </div>
                      <div className={styles.userActions}>
                        <button className={styles.iconBtn} title="Edit User" onClick={() => alert(`Edit User: ${u.firstName} ${u.lastName}\n\nRole: ${u.role}\nTitle: ${u.title}\nEmail: ${u.email}`)}>
                          <Edit2 size={16} />
                        </button>
                        {u.role !== 'owner' && (
                          <button className={styles.iconBtnDanger} title="Remove User" onClick={() => {
                            if (confirm(`Remove ${u.firstName} ${u.lastName} from the firm?`)) {
                              alert(`${u.firstName} ${u.lastName} has been removed from the firm.`);
                            }
                          }}>
                            <UserMinus size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Groups Section */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <UserCog size={20} />
                  <div>
                    <h2>Groups</h2>
                    <p>Organize users into groups with shared permissions</p>
                  </div>
                  <button 
                    className={styles.headerBtn}
                    onClick={() => setShowNewGroupModal(true)}
                  >
                    <Plus size={16} />
                    New Group
                  </button>
                </div>

                <div className={styles.groupsList}>
                  {groups.map(group => (
                    <div key={group.id} className={styles.groupCard}>
                      <div 
                        className={styles.groupColor}
                        style={{ backgroundColor: group.color }}
                      />
                      <div className={styles.groupInfo}>
                        <div className={styles.groupHeader}>
                          <span className={styles.groupName}>{group.name}</span>
                          <span className={styles.memberCount}>
                            {group.memberIds.length} member{group.memberIds.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <p className={styles.groupDesc}>{group.description}</p>
                        <div className={styles.groupMembers}>
                          {group.memberIds.slice(0, 5).map(memberId => {
                            const member = getUserById(memberId)
                            return member ? (
                              <div key={memberId} className={styles.memberChip} title={`${member.firstName} ${member.lastName}`}>
                                {member.firstName[0]}{member.lastName[0]}
                              </div>
                            ) : null
                          })}
                          {group.memberIds.length > 5 && (
                            <div className={styles.memberChip}>+{group.memberIds.length - 5}</div>
                          )}
                          <button 
                            className={styles.addMemberBtn}
                            onClick={() => {
                              setSelectedGroup(group)
                              setShowAddUserModal(true)
                            }}
                            title="Add member"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <div className={styles.groupPermissions}>
                          {group.permissions.slice(0, 3).map(perm => (
                            <span key={perm} className={styles.permissionTag}>
                              {perm.split(':')[0]}
                            </span>
                          ))}
                          {group.permissions.length > 3 && (
                            <span className={styles.permissionTag}>+{group.permissions.length - 3} more</span>
                          )}
                        </div>
                      </div>
                      <div className={styles.groupActions}>
                        <button 
                          className={styles.iconBtn}
                          onClick={() => {
                            setSelectedGroup(group)
                            setShowEditGroupModal(true)
                          }}
                          title="Edit Group"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          className={styles.iconBtnDanger}
                          onClick={() => deleteGroup(group.id)}
                          title="Delete Group"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {groups.length === 0 && (
                    <div className={styles.emptyGroups}>
                      <Users size={48} />
                      <p>No groups created yet</p>
                      <button onClick={() => setShowNewGroupModal(true)}>
                        <Plus size={16} />
                        Create your first group
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Billing Tab */}
          {activeTab === 'billing' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <DollarSign size={20} />
                  <div>
                    <h2>Billing Defaults</h2>
                    <p>Default billing rates and settings for the firm</p>
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Default Hourly Rate ($)</label>
                    <input
                      type="number"
                      value={billingSettings.defaultHourlyRate}
                      onChange={e => setBillingSettings({...billingSettings, defaultHourlyRate: parseInt(e.target.value)})}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Billing Increment (minutes)</label>
                    <select
                      value={billingSettings.billingIncrement}
                      onChange={e => setBillingSettings({...billingSettings, billingIncrement: parseInt(e.target.value)})}
                    >
                      <option value={1}>1 minute</option>
                      <option value={6}>6 minutes (0.1 hr)</option>
                      <option value={10}>10 minutes</option>
                      <option value={15}>15 minutes (0.25 hr)</option>
                      <option value={30}>30 minutes (0.5 hr)</option>
                    </select>
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Payment Terms (days)</label>
                    <select
                      value={billingSettings.paymentTerms}
                      onChange={e => setBillingSettings({...billingSettings, paymentTerms: parseInt(e.target.value)})}
                    >
                      <option value={15}>Net 15</option>
                      <option value={30}>Net 30</option>
                      <option value={45}>Net 45</option>
                      <option value={60}>Net 60</option>
                      <option value={90}>Net 90</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Late Fee (%)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={billingSettings.lateFeePercent}
                      onChange={e => setBillingSettings({...billingSettings, lateFeePercent: parseFloat(e.target.value)})}
                    />
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Currency</label>
                    <select
                      value={billingSettings.currency}
                      onChange={e => setBillingSettings({...billingSettings, currency: e.target.value})}
                    >
                      <option value="USD">USD - US Dollar</option>
                      <option value="CAD">CAD - Canadian Dollar</option>
                      <option value="EUR">EUR - Euro</option>
                      <option value="GBP">GBP - British Pound</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Tax Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={billingSettings.taxRate}
                      onChange={e => setBillingSettings({...billingSettings, taxRate: parseFloat(e.target.value)})}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <CreditCard size={20} />
                  <div>
                    <h2>Trust Accounting</h2>
                    <p>IOLTA and trust account settings</p>
                  </div>
                </div>

                <div className={styles.toggle}>
                  <div>
                    <span className={styles.toggleLabel}>Require Trust Account</span>
                    <span className={styles.toggleDesc}>Require retainer deposits before work begins</span>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={billingSettings.trustAccountRequired}
                      onChange={e => setBillingSettings({...billingSettings, trustAccountRequired: e.target.checked})}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>

                <div className={styles.formGroup}>
                  <label>Minimum Retainer ($)</label>
                  <input
                    type="number"
                    value={billingSettings.retainerMinimum}
                    onChange={e => setBillingSettings({...billingSettings, retainerMinimum: parseInt(e.target.value)})}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Practice Areas Tab */}
          {activeTab === 'practice' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Briefcase size={20} />
                  <div>
                    <h2>Practice Areas</h2>
                    <p>Define the areas of law your firm practices</p>
                  </div>
                </div>

                <div className={styles.addForm}>
                  <input
                    type="text"
                    value={newPracticeArea}
                    onChange={e => setNewPracticeArea(e.target.value)}
                    placeholder="Add new practice area..."
                    onKeyPress={e => e.key === 'Enter' && addPracticeArea()}
                  />
                  <button onClick={addPracticeArea} className={styles.addBtn}>
                    <Plus size={18} />
                    Add
                  </button>
                </div>

                <div className={styles.itemsList}>
                  {practiceAreas.map(area => (
                    <div key={area.id} className={styles.listItem}>
                      <div className={styles.listItemContent}>
                        <span className={`${styles.statusDot} ${area.active ? styles.active : styles.inactive}`}></span>
                        <span className={styles.itemName}>{area.name}</span>
                      </div>
                      <div className={styles.listItemActions}>
                        <button
                          className={styles.iconBtn}
                          onClick={() => setPracticeAreas(practiceAreas.map(a => 
                            a.id === area.id ? {...a, active: !a.active} : a
                          ))}
                        >
                          {area.active ? 'Disable' : 'Enable'}
                        </button>
                        <button 
                          className={styles.iconBtnDanger}
                          onClick={() => setPracticeAreas(practiceAreas.filter(a => a.id !== area.id))}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Activity Codes Tab */}
          {activeTab === 'activities' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Clock size={20} />
                  <div>
                    <h2>Activity Codes</h2>
                    <p>Standard codes for time entries and billing</p>
                  </div>
                </div>

                <div className={styles.addFormGrid}>
                  <input
                    type="text"
                    value={newActivityCode.code}
                    onChange={e => setNewActivityCode({...newActivityCode, code: e.target.value})}
                    placeholder="Code (e.g., A101)"
                  />
                  <input
                    type="text"
                    value={newActivityCode.description}
                    onChange={e => setNewActivityCode({...newActivityCode, description: e.target.value})}
                    placeholder="Description"
                  />
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={newActivityCode.billable}
                      onChange={e => setNewActivityCode({...newActivityCode, billable: e.target.checked})}
                    />
                    Billable
                  </label>
                  <button onClick={addActivityCode} className={styles.addBtn}>
                    <Plus size={18} />
                    Add
                  </button>
                </div>

                <div className={styles.activityTable}>
                  <div className={styles.tableHeader}>
                    <span>Code</span>
                    <span>Description</span>
                    <span>Type</span>
                    <span>Actions</span>
                  </div>
                  {activityCodes.map(code => (
                    <div key={code.id} className={styles.tableRow}>
                      <span className={styles.code}>{code.code}</span>
                      <span>{code.description}</span>
                      <span>
                        <span className={`${styles.tag} ${code.billable ? styles.billable : styles.nonBillable}`}>
                          {code.billable ? 'Billable' : 'Non-Billable'}
                        </span>
                      </span>
                      <span>
                        <button 
                          className={styles.iconBtnDanger}
                          onClick={() => setActivityCodes(activityCodes.filter(c => c.id !== code.id))}
                        >
                          <Trash2 size={16} />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* AI Configuration Tab */}
          {activeTab === 'ai' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Brain size={20} />
                  <div>
                    <h2>AI Configuration</h2>
                    <p>Configure AI services for intelligent features</p>
                  </div>
                </div>

                <div className={styles.toggle}>
                  <div>
                    <span className={styles.toggleLabel}>Enable AI Features</span>
                    <span className={styles.toggleDesc}>Use AI for document analysis, suggestions, and insights</span>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={aiSettings.enabled}
                      onChange={e => setAiSettings({...aiSettings, enabled: e.target.checked})}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>

                {aiSettings.enabled && (
                  <>
                    <div className={styles.formGroup}>
                      <label>AI Provider</label>
                      <select
                        value={aiSettings.provider}
                        onChange={e => setAiSettings({...aiSettings, provider: e.target.value})}
                      >
                        <option value="azure">Azure OpenAI</option>
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic Claude</option>
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <label>API Endpoint</label>
                      <input
                        type="url"
                        value={aiSettings.endpoint}
                        onChange={e => setAiSettings({...aiSettings, endpoint: e.target.value})}
                        placeholder="https://your-resource.openai.azure.com/"
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>API Key</label>
                      <input
                        type="password"
                        value={aiSettings.apiKey}
                        onChange={e => setAiSettings({...aiSettings, apiKey: e.target.value})}
                        placeholder="Enter your API key"
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>Deployment Name</label>
                      <input
                        type="text"
                        value={aiSettings.deploymentName}
                        onChange={e => setAiSettings({...aiSettings, deploymentName: e.target.value})}
                        placeholder="gpt-4"
                      />
                    </div>

                    <div className={styles.aiFeatures}>
                      <h3>
                        <Sparkles size={18} />
                        AI Features
                      </h3>
                      <div className={styles.toggleGroup}>
                        <div className={styles.toggle}>
                          <div>
                            <span className={styles.toggleLabel}>Auto-Suggest</span>
                            <span className={styles.toggleDesc}>AI suggestions while typing</span>
                          </div>
                          <label className={styles.switch}>
                            <input
                              type="checkbox"
                              checked={aiSettings.autoSuggest}
                              onChange={e => setAiSettings({...aiSettings, autoSuggest: e.target.checked})}
                            />
                            <span className={styles.slider}></span>
                          </label>
                        </div>

                        <div className={styles.toggle}>
                          <div>
                            <span className={styles.toggleLabel}>Document Analysis</span>
                            <span className={styles.toggleDesc}>AI-powered document review and summarization</span>
                          </div>
                          <label className={styles.switch}>
                            <input
                              type="checkbox"
                              checked={aiSettings.documentAnalysis}
                              onChange={e => setAiSettings({...aiSettings, documentAnalysis: e.target.checked})}
                            />
                            <span className={styles.slider}></span>
                          </label>
                        </div>

                        <div className={styles.toggle}>
                          <div>
                            <span className={styles.toggleLabel}>Matter Summaries</span>
                            <span className={styles.toggleDesc}>Automatic matter status summaries</span>
                          </div>
                          <label className={styles.switch}>
                            <input
                              type="checkbox"
                              checked={aiSettings.matterSummaries}
                              onChange={e => setAiSettings({...aiSettings, matterSummaries: e.target.checked})}
                            />
                            <span className={styles.slider}></span>
                          </label>
                        </div>

                        <div className={styles.toggle}>
                          <div>
                            <span className={styles.toggleLabel}>Conflict Check</span>
                            <span className={styles.toggleDesc}>AI-assisted conflict of interest checking</span>
                          </div>
                          <label className={styles.switch}>
                            <input
                              type="checkbox"
                              checked={aiSettings.conflictCheck}
                              onChange={e => setAiSettings({...aiSettings, conflictCheck: e.target.checked})}
                            />
                            <span className={styles.slider}></span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className={styles.tabContent}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Shield size={20} />
                  <div>
                    <h2>Security Settings</h2>
                    <p>Configure firm-wide security policies</p>
                  </div>
                </div>

                <div className={styles.toggle}>
                  <div>
                    <span className={styles.toggleLabel}>Require Multi-Factor Authentication</span>
                    <span className={styles.toggleDesc}>All users must enable MFA</span>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={securitySettings.requireMfa}
                      onChange={e => setSecuritySettings({...securitySettings, requireMfa: e.target.checked})}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Session Timeout (minutes)</label>
                    <select
                      value={securitySettings.sessionTimeout}
                      onChange={e => setSecuritySettings({...securitySettings, sessionTimeout: parseInt(e.target.value)})}
                    >
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={120}>2 hours</option>
                      <option value={480}>8 hours</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Password Minimum Length</label>
                    <select
                      value={securitySettings.passwordMinLength}
                      onChange={e => setSecuritySettings({...securitySettings, passwordMinLength: parseInt(e.target.value)})}
                    >
                      <option value={8}>8 characters</option>
                      <option value={10}>10 characters</option>
                      <option value={12}>12 characters</option>
                      <option value={14}>14 characters</option>
                      <option value={16}>16 characters</option>
                    </select>
                  </div>
                </div>

                <div className={styles.toggle}>
                  <div>
                    <span className={styles.toggleLabel}>Require Special Characters</span>
                    <span className={styles.toggleDesc}>Passwords must contain special characters</span>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={securitySettings.passwordRequireSpecial}
                      onChange={e => setSecuritySettings({...securitySettings, passwordRequireSpecial: e.target.checked})}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>

                <div className={styles.toggle}>
                  <div>
                    <span className={styles.toggleLabel}>Audit Logging</span>
                    <span className={styles.toggleDesc}>Log all user actions for compliance</span>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={securitySettings.auditLogging}
                      onChange={e => setSecuritySettings({...securitySettings, auditLogging: e.target.checked})}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>

                <div className={styles.formGroup}>
                  <label>IP Whitelist (optional)</label>
                  <textarea
                    value={securitySettings.ipWhitelist}
                    onChange={e => setSecuritySettings({...securitySettings, ipWhitelist: e.target.value})}
                    placeholder="Enter IP addresses, one per line"
                    rows={3}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Data Retention (days)</label>
                  <select
                    value={securitySettings.dataRetentionDays}
                    onChange={e => setSecuritySettings({...securitySettings, dataRetentionDays: parseInt(e.target.value)})}
                  >
                    <option value={90}>90 days</option>
                    <option value={180}>180 days</option>
                    <option value={365}>1 year</option>
                    <option value={730}>2 years</option>
                    <option value={1825}>5 years</option>
                    <option value={3650}>10 years</option>
                  </select>
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

      {/* New Group Modal */}
      {showNewGroupModal && (
        <NewGroupModal 
          onClose={() => setShowNewGroupModal(false)}
          onSave={(data) => {
            addGroup(data)
            setShowNewGroupModal(false)
          }}
          users={demoUsers}
        />
      )}

      {/* Edit Group Modal */}
      {showEditGroupModal && selectedGroup && (
        <EditGroupModal 
          group={selectedGroup}
          onClose={() => {
            setShowEditGroupModal(false)
            setSelectedGroup(null)
          }}
          onSave={(data) => {
            updateGroup(selectedGroup.id, data)
            setShowEditGroupModal(false)
            setSelectedGroup(null)
          }}
          users={demoUsers}
        />
      )}

      {/* Add User to Group Modal */}
      {showAddUserModal && selectedGroup && (
        <AddUserToGroupModal
          group={selectedGroup}
          onClose={() => {
            setShowAddUserModal(false)
            setSelectedGroup(null)
          }}
          onSave={(memberIds) => {
            updateGroup(selectedGroup.id, { memberIds })
            setShowAddUserModal(false)
            setSelectedGroup(null)
          }}
          users={demoUsers}
        />
      )}

      {/* Invite User Modal */}
      {showInviteUserModal && (
        <InviteUserModal
          onClose={() => setShowInviteUserModal(false)}
          onSave={() => setShowInviteUserModal(false)}
        />
      )}
    </div>
  )
}

// New Group Modal Component
interface NewGroupModalProps {
  onClose: () => void
  onSave: (data: any) => void
  users: typeof demoUsers
}

function NewGroupModal({ onClose, onSave, users }: NewGroupModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    memberIds: [] as string[],
    permissions: [] as string[],
    color: groupColors[0]
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.name) {
      onSave(formData)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Create New Group</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Group Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              placeholder="e.g., Litigation Team"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              placeholder="Brief description of this group's purpose"
              rows={2}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Group Color</label>
            <div className={styles.colorPicker}>
              {groupColors.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`${styles.colorOption} ${formData.color === color ? styles.selected : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setFormData({...formData, color})}
                />
              ))}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Members</label>
            <div className={styles.memberSelect}>
              {users.map(user => (
                <label key={user.id} className={styles.memberOption}>
                  <input
                    type="checkbox"
                    checked={formData.memberIds.includes(user.id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setFormData({...formData, memberIds: [...formData.memberIds, user.id]})
                      } else {
                        setFormData({...formData, memberIds: formData.memberIds.filter(id => id !== user.id)})
                      }
                    }}
                  />
                  <span>{user.firstName} {user.lastName}</span>
                  <span className={styles.memberRole}>{user.title}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Permissions</label>
            <div className={styles.permissionSelect}>
              {permissionOptions.map(perm => (
                <label key={perm.id} className={styles.permissionOption}>
                  <input
                    type="checkbox"
                    checked={formData.permissions.includes(perm.id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setFormData({...formData, permissions: [...formData.permissions, perm.id]})
                      } else {
                        setFormData({...formData, permissions: formData.permissions.filter(id => id !== perm.id)})
                      }
                    }}
                  />
                  <span>{perm.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
            <button type="submit" className={styles.saveBtn}>Create Group</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Edit Group Modal Component
interface EditGroupModalProps {
  group: any
  onClose: () => void
  onSave: (data: any) => void
  users: typeof demoUsers
}

function EditGroupModal({ group, onClose, onSave, users }: EditGroupModalProps) {
  const [formData, setFormData] = useState({
    name: group.name,
    description: group.description,
    memberIds: group.memberIds,
    permissions: group.permissions,
    color: group.color
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Edit Group</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Group Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              rows={2}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Group Color</label>
            <div className={styles.colorPicker}>
              {groupColors.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`${styles.colorOption} ${formData.color === color ? styles.selected : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setFormData({...formData, color})}
                />
              ))}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Members</label>
            <div className={styles.memberSelect}>
              {users.map(user => (
                <label key={user.id} className={styles.memberOption}>
                  <input
                    type="checkbox"
                    checked={formData.memberIds.includes(user.id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setFormData({...formData, memberIds: [...formData.memberIds, user.id]})
                      } else {
                        setFormData({...formData, memberIds: formData.memberIds.filter((id: string) => id !== user.id)})
                      }
                    }}
                  />
                  <span>{user.firstName} {user.lastName}</span>
                  <span className={styles.memberRole}>{user.title}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Permissions</label>
            <div className={styles.permissionSelect}>
              {permissionOptions.map(perm => (
                <label key={perm.id} className={styles.permissionOption}>
                  <input
                    type="checkbox"
                    checked={formData.permissions.includes(perm.id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setFormData({...formData, permissions: [...formData.permissions, perm.id]})
                      } else {
                        setFormData({...formData, permissions: formData.permissions.filter((id: string) => id !== perm.id)})
                      }
                    }}
                  />
                  <span>{perm.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
            <button type="submit" className={styles.saveBtn}>Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Add User to Group Modal
interface AddUserToGroupModalProps {
  group: any
  onClose: () => void
  onSave: (memberIds: string[]) => void
  users: typeof demoUsers
}

function AddUserToGroupModal({ group, onClose, onSave, users }: AddUserToGroupModalProps) {
  const [memberIds, setMemberIds] = useState<string[]>(group.memberIds)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(memberIds)
  }

  const availableUsers = users.filter(u => !memberIds.includes(u.id))

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Manage Members - {group.name}</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Current Members</label>
            <div className={styles.currentMembers}>
              {memberIds.map(id => {
                const user = users.find(u => u.id === id)
                return user ? (
                  <div key={id} className={styles.memberTag}>
                    <span>{user.firstName} {user.lastName}</span>
                    <button 
                      type="button"
                      onClick={() => setMemberIds(memberIds.filter(m => m !== id))}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : null
              })}
              {memberIds.length === 0 && (
                <span className={styles.noMembers}>No members in this group</span>
              )}
            </div>
          </div>

          {availableUsers.length > 0 && (
            <div className={styles.formGroup}>
              <label>Add Members</label>
              <div className={styles.memberSelect}>
                {availableUsers.map(user => (
                  <label key={user.id} className={styles.memberOption}>
                    <input
                      type="checkbox"
                      checked={memberIds.includes(user.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setMemberIds([...memberIds, user.id])
                        }
                      }}
                    />
                    <span>{user.firstName} {user.lastName}</span>
                    <span className={styles.memberRole}>{user.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
            <button type="submit" className={styles.saveBtn}>Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Invite User Modal
interface InviteUserModalProps {
  onClose: () => void
  onSave: () => void
}

function InviteUserModal({ onClose, onSave }: InviteUserModalProps) {
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'attorney',
    title: '',
    sendInvite: true
  })
  const [sent, setSent] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSent(true)
    setTimeout(() => {
      onSave()
    }, 1500)
  }

  if (sent) {
    return (
      <div className={styles.modalOverlay} onClick={onClose}>
        <div className={styles.modal} onClick={e => e.stopPropagation()}>
          <div className={styles.inviteSent}>
            <CheckCircle2 size={48} />
            <h2>Invitation Sent!</h2>
            <p>An invitation has been sent to {formData.email}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Invite Team Member</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Email Address *</label>
            <input
              type="email"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
              placeholder="colleague@email.com"
              required
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>First Name *</label>
              <input
                type="text"
                value={formData.firstName}
                onChange={e => setFormData({...formData, firstName: e.target.value})}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label>Last Name *</label>
              <input
                type="text"
                value={formData.lastName}
                onChange={e => setFormData({...formData, lastName: e.target.value})}
                required
              />
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Role *</label>
              <select
                value={formData.role}
                onChange={e => setFormData({...formData, role: e.target.value})}
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="attorney">Attorney</option>
                <option value="paralegal">Paralegal</option>
                <option value="staff">Staff</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={e => setFormData({...formData, title: e.target.value})}
                placeholder="e.g., Senior Associate"
              />
            </div>
          </div>

          <div className={styles.toggle}>
            <div>
              <span className={styles.toggleLabel}>Send Invitation Email</span>
              <span className={styles.toggleDesc}>User will receive an email to set up their account</span>
            </div>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={formData.sendInvite}
                onChange={e => setFormData({...formData, sendInvite: e.target.checked})}
              />
              <span className={styles.slider}></span>
            </label>
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
            <button type="submit" className={styles.saveBtn}>
              <Mail size={16} />
              Send Invitation
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
