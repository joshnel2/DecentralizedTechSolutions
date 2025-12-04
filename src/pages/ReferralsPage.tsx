import { useState } from 'react'
import { 
  Gift, Copy, Share2, Mail, Users, DollarSign, Check, Trophy,
  Twitter, Linkedin, CheckCircle2
} from 'lucide-react'
import styles from './SettingsPage.module.css'

export function ReferralsPage() {
  const [copied, setCopied] = useState(false)
  
  const referralData = {
    code: 'APEX-JOHN2024',
    link: 'https://apexlegal.com/ref/APEX-JOHN2024',
    earnings: 1500,
    referrals: 3,
    pending: 1
  }

  const referralHistory = [
    { id: '1', name: 'Smith & Associates', status: 'completed', date: '2024-01-05', reward: 500 },
    { id: '2', name: 'Johnson Law Group', status: 'completed', date: '2023-12-15', reward: 500 },
    { id: '3', name: 'Williams Legal', status: 'completed', date: '2023-11-20', reward: 500 },
    { id: '4', name: 'Davis Partners', status: 'pending', date: '2024-01-10', reward: 500 }
  ]

  const copyLink = async () => {
    await navigator.clipboard.writeText(referralData.link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.settingsPage}>
      <div className={styles.header}>
        <h1>Referral Rewards Center</h1>
        <p>Earn $500 for every firm you refer to Apex!</p>
      </div>

      <div className={styles.settingsContent} style={{ maxWidth: '900px' }}>
        <div className={styles.tabContent}>
          {/* Rewards Banner */}
          <div style={{
            background: 'linear-gradient(135deg, var(--gold-primary) 0%, #ff9500 100%)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--spacing-xl)',
            marginBottom: 'var(--spacing-xl)',
            color: 'var(--bg-primary)',
            textAlign: 'center'
          }}>
            <Gift size={48} style={{ marginBottom: '1rem' }} />
            <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Share Apex, Earn Rewards!
            </h2>
            <p style={{ fontSize: '1.125rem', opacity: 0.9, marginBottom: '1.5rem' }}>
              Get $500 for every firm that signs up using your referral link
            </p>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'rgba(0,0,0,0.15)',
              borderRadius: '999px',
              padding: '0.5rem 1rem',
              gap: '0.5rem'
            }}>
              <Trophy size={20} />
              <span style={{ fontWeight: 600 }}>Plus: Every referral enters you to win a VIP trip!</span>
            </div>
          </div>

          {/* Stats Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
            marginBottom: 'var(--spacing-xl)'
          }}>
            <div style={{
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-lg)',
              textAlign: 'center'
            }}>
              <DollarSign size={32} style={{ color: 'var(--gold-primary)', marginBottom: '0.5rem' }} />
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                ${referralData.earnings}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Total Earned</div>
            </div>

            <div style={{
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-lg)',
              textAlign: 'center'
            }}>
              <Users size={32} style={{ color: 'var(--gold-primary)', marginBottom: '0.5rem' }} />
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {referralData.referrals}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Successful Referrals</div>
            </div>

            <div style={{
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-lg)',
              textAlign: 'center'
            }}>
              <Gift size={32} style={{ color: 'var(--gold-primary)', marginBottom: '0.5rem' }} />
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {referralData.pending}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Pending</div>
            </div>
          </div>

          {/* Share Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Share2 size={20} />
              <div>
                <h2>Your Referral Link</h2>
                <p>Share this link with colleagues and friends</p>
              </div>
            </div>

            <div style={{
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1rem'
            }}>
              <code style={{
                flex: 1,
                color: 'var(--gold-primary)',
                fontSize: '0.9rem',
                wordBreak: 'break-all'
              }}>
                {referralData.link}
              </code>
              <button 
                onClick={copyLink}
                style={{
                  background: copied ? 'var(--success)' : 'var(--gold-primary)',
                  color: 'var(--bg-primary)',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 600
                }}
              >
                {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className={styles.secondaryBtn} onClick={() => {
                window.location.href = `mailto:?subject=Try Apex Legal Practice Management&body=I've been using Apex for my law practice and thought you might be interested. Sign up with my referral link: ${referralData.link}`;
              }}>
                <Mail size={16} />
                Email Invite
              </button>
              <button className={styles.secondaryBtn} onClick={() => {
                window.open(`https://twitter.com/intent/tweet?text=Check out Apex Legal Practice Management - the AI-powered platform for modern law firms!&url=${encodeURIComponent(referralData.link)}`, '_blank');
              }}>
                <Twitter size={16} />
                Share on X
              </button>
              <button className={styles.secondaryBtn} onClick={() => {
                window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralData.link)}`, '_blank');
              }}>
                <Linkedin size={16} />
                Share on LinkedIn
              </button>
            </div>
          </div>

          {/* Referral History */}
          <div className={styles.section} style={{ borderBottom: 'none' }}>
            <div className={styles.sectionHeader}>
              <Users size={20} />
              <div>
                <h2>Referral History</h2>
                <p>Track your referrals and rewards</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {referralHistory.map(ref => (
                <div 
                  key={ref.id}
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: ref.status === 'completed' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(234, 179, 8, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {ref.status === 'completed' ? (
                        <Check size={20} style={{ color: 'var(--success)' }} />
                      ) : (
                        <Gift size={20} style={{ color: 'var(--gold-primary)' }} />
                      )}
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{ref.name}</div>
                      <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                        {new Date(ref.date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ 
                      color: ref.status === 'completed' ? 'var(--success)' : 'var(--gold-primary)', 
                      fontWeight: 600 
                    }}>
                      ${ref.reward}
                    </div>
                    <div style={{
                      fontSize: '0.75rem',
                      color: ref.status === 'completed' ? 'var(--success)' : 'var(--text-tertiary)',
                      textTransform: 'capitalize'
                    }}>
                      {ref.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
