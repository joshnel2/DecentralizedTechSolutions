import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { User, Mail, Lock, Bell, Shield, Save } from 'lucide-react'
import styles from './SettingsPage.module.css'

export function SettingsPage() {
  const { user, updateUser } = useAuthStore()
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    emailNotifications: true,
    deadlineReminders: true,
    billingAlerts: true
  })
  const [saved, setSaved] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateUser({
      firstName: formData.firstName,
      lastName: formData.lastName
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className={styles.settingsPage}>
      <div className={styles.header}>
        <h1>My Settings</h1>
        <p>Manage your personal account settings and preferences</p>
      </div>

      <form onSubmit={handleSubmit} className={styles.settingsForm}>
        {/* Profile Section */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <User size={20} />
            <div>
              <h2>Profile Information</h2>
              <p>Update your personal details</p>
            </div>
          </div>
          
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>First Name</label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({...formData, firstName: e.target.value})}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Last Name</label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({...formData, lastName: e.target.value})}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Email Address</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
          </div>

          <div className={styles.avatarSection}>
            <div className={styles.avatar}>
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div>
              <button type="button" className={styles.uploadBtn}>Change Avatar</button>
              <p>JPG, PNG or GIF. Max 2MB.</p>
            </div>
          </div>
        </section>

        {/* Security Section */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Lock size={20} />
            <div>
              <h2>Password & Security</h2>
              <p>Keep your account secure</p>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Current Password</label>
            <input
              type="password"
              value={formData.currentPassword}
              onChange={(e) => setFormData({...formData, currentPassword: e.target.value})}
              placeholder="Enter current password"
            />
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>New Password</label>
              <input
                type="password"
                value={formData.newPassword}
                onChange={(e) => setFormData({...formData, newPassword: e.target.value})}
                placeholder="Enter new password"
              />
            </div>
            <div className={styles.formGroup}>
              <label>Confirm New Password</label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                placeholder="Confirm new password"
              />
            </div>
          </div>

          <div className={styles.securityNote}>
            <Shield size={16} />
            <span>Enable two-factor authentication for added security</span>
            <button type="button" className={styles.enableBtn}>Enable 2FA</button>
          </div>
        </section>

        {/* Notifications Section */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Bell size={20} />
            <div>
              <h2>Notification Preferences</h2>
              <p>Control how you receive updates</p>
            </div>
          </div>

          <div className={styles.toggleGroup}>
            <div className={styles.toggle}>
              <div>
                <span className={styles.toggleLabel}>Email Notifications</span>
                <span className={styles.toggleDesc}>Receive updates via email</span>
              </div>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={formData.emailNotifications}
                  onChange={(e) => setFormData({...formData, emailNotifications: e.target.checked})}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            <div className={styles.toggle}>
              <div>
                <span className={styles.toggleLabel}>Deadline Reminders</span>
                <span className={styles.toggleDesc}>Get notified about upcoming deadlines</span>
              </div>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={formData.deadlineReminders}
                  onChange={(e) => setFormData({...formData, deadlineReminders: e.target.checked})}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            <div className={styles.toggle}>
              <div>
                <span className={styles.toggleLabel}>Billing Alerts</span>
                <span className={styles.toggleDesc}>Invoice and payment notifications</span>
              </div>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={formData.billingAlerts}
                  onChange={(e) => setFormData({...formData, billingAlerts: e.target.checked})}
                />
                <span className={styles.slider}></span>
              </label>
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className={styles.actions}>
          {saved && (
            <span className={styles.savedMessage}>Settings saved successfully!</span>
          )}
          <button type="submit" className={styles.saveBtn}>
            <Save size={18} />
            Save Changes
          </button>
        </div>
      </form>
    </div>
  )
}
