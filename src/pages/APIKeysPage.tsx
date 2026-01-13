import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Key, Code, Shield } from 'lucide-react'
import styles from './APIKeysPage.module.css'

export function APIKeysPage() {
  const navigate = useNavigate()

  const openDeveloperPortal = () => {
    window.open('/developer/apps', '_blank')
  }

  return (
    <div className={styles.apiKeysPage}>
      <button className={styles.backButton} onClick={() => navigate('/app/settings')}>
        <ArrowLeft size={16} />
        Back to Settings
      </button>
      
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>API Keys</h1>
          <p>Manage API keys for external integrations</p>
        </div>
      </div>

      <div className={styles.developerPortalCard}>
        <div className={styles.cardIcon}>
          <Code size={32} />
        </div>
        <div className={styles.cardContent}>
          <h2>Developer Portal</h2>
          <p>
            API keys are now managed in the Apex Developer Portal. The Developer Portal 
            provides comprehensive API documentation, code examples, and tools to help 
            you build integrations.
          </p>
          
          <div className={styles.features}>
            <div className={styles.feature}>
              <Key size={18} />
              <span>Create & manage API keys</span>
            </div>
            <div className={styles.feature}>
              <Code size={18} />
              <span>Full API documentation</span>
            </div>
            <div className={styles.feature}>
              <Shield size={18} />
              <span>Permission management</span>
            </div>
          </div>

          <button className={styles.portalBtn} onClick={openDeveloperPortal}>
            <ExternalLink size={18} />
            Go to Developer Portal
          </button>
        </div>
      </div>
    </div>
  )
}
