import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, CheckCircle2, AlertTriangle, Info, Shield } from 'lucide-react'
import styles from './DeveloperPortal.module.css'

export function Authentication() {
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null)

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code)
    setCopiedBlock(id)
    setTimeout(() => setCopiedBlock(null), 2000)
  }

  return (
    <div className={styles.docPage}>
      <header className={styles.docHeader}>
        <h1>Authentication</h1>
        <p>
          All API requests must be authenticated using an API key. This page explains 
          how to obtain and use API keys to access the Apex API.
        </p>
      </header>

      <section className={styles.docSection}>
        <h2>API Keys</h2>
        <p>
          API keys are the primary method for authenticating with the Apex API. Each API key 
          is associated with a specific firm and has a defined set of permissions.
        </p>

        <h3>Creating an API Key</h3>
        <ol>
          <li>Sign in to the <Link to="/developer/apps" style={{ color: 'var(--apex-gold)' }}>Developer Portal</Link> with an admin account</li>
          <li>Navigate to "My Apps"</li>
          <li>Click "Create New App"</li>
          <li>Configure your app name and permissions</li>
          <li>Copy and securely store your API key</li>
        </ol>

        <div className={`${styles.infoBox} ${styles.warning}`}>
          <AlertTriangle size={20} />
          <div>
            <p><strong>Security Best Practices</strong></p>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
              <li>Never expose API keys in client-side code</li>
              <li>Don't commit API keys to version control</li>
              <li>Use environment variables to store keys</li>
              <li>Rotate keys periodically</li>
              <li>Use the minimum required permissions</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.docSection}>
        <h2>Using API Keys</h2>
        <p>
          Include your API key in the <code>Authorization</code> header of every request 
          using the Bearer token format.
        </p>

        <h3>Header Format</h3>
        <div className={styles.codeBlock}>
          <pre><code>Authorization: Bearer YOUR_API_KEY</code></pre>
        </div>

        <h3>Example Request</h3>
        <div className={styles.codeBlock}>
          <div className={styles.codeHeader}>
            <span className={styles.codeLanguage}>bash</span>
            <button 
              className={`${styles.copyBtn} ${copiedBlock === 'curl' ? styles.copied : ''}`}
              onClick={() => copyCode(`curl -X GET "https://your-firm.apexlegal.app/api/matters" \\
  -H "Authorization: Bearer apex_abc123def456..." \\
  -H "Content-Type: application/json"`, 'curl')}
            >
              {copiedBlock === 'curl' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              {copiedBlock === 'curl' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre><code>{`curl -X GET "https://your-firm.apexlegal.app/api/matters" \\
  -H "Authorization: Bearer apex_abc123def456..." \\
  -H "Content-Type: application/json"`}</code></pre>
        </div>

        <h3>JavaScript Example</h3>
        <div className={styles.codeBlock}>
          <div className={styles.codeHeader}>
            <span className={styles.codeLanguage}>javascript</span>
            <button 
              className={`${styles.copyBtn} ${copiedBlock === 'js' ? styles.copied : ''}`}
              onClick={() => copyCode(`const response = await fetch('https://your-firm.apexlegal.app/api/matters', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + process.env.APEX_API_KEY,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.matters);`, 'js')}
            >
              {copiedBlock === 'js' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              {copiedBlock === 'js' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre><code>{`const response = await fetch('https://your-firm.apexlegal.app/api/matters', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + process.env.APEX_API_KEY,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.matters);`}</code></pre>
        </div>

        <h3>Python Example</h3>
        <div className={styles.codeBlock}>
          <div className={styles.codeHeader}>
            <span className={styles.codeLanguage}>python</span>
            <button 
              className={`${styles.copyBtn} ${copiedBlock === 'py' ? styles.copied : ''}`}
              onClick={() => copyCode(`import requests
import os

api_key = os.environ.get('APEX_API_KEY')
headers = {
    'Authorization': f'Bearer {api_key}',
    'Content-Type': 'application/json'
}

response = requests.get(
    'https://your-firm.apexlegal.app/api/matters',
    headers=headers
)

data = response.json()
print(data['matters'])`, 'py')}
            >
              {copiedBlock === 'py' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              {copiedBlock === 'py' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre><code>{`import requests
import os

api_key = os.environ.get('APEX_API_KEY')
headers = {
    'Authorization': f'Bearer {api_key}',
    'Content-Type': 'application/json'
}

response = requests.get(
    'https://your-firm.apexlegal.app/api/matters',
    headers=headers
)

data = response.json()
print(data['matters'])`}</code></pre>
        </div>
      </section>

      <section className={styles.docSection}>
        <h2>Permissions</h2>
        <p>
          API keys have granular permissions that control what actions can be performed. 
          When creating an API key, select only the permissions your application needs.
        </p>

        <table className={styles.paramTable}>
          <thead>
            <tr>
              <th>Permission</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>matters:read</code></td>
              <td>View matters and matter details</td>
            </tr>
            <tr>
              <td><code>matters:write</code></td>
              <td>Create and update matters</td>
            </tr>
            <tr>
              <td><code>clients:read</code></td>
              <td>View clients and contact information</td>
            </tr>
            <tr>
              <td><code>clients:write</code></td>
              <td>Create and update clients</td>
            </tr>
            <tr>
              <td><code>documents:read</code></td>
              <td>View and download documents</td>
            </tr>
            <tr>
              <td><code>documents:write</code></td>
              <td>Upload and manage documents</td>
            </tr>
            <tr>
              <td><code>calendar:read</code></td>
              <td>View calendar events</td>
            </tr>
            <tr>
              <td><code>calendar:write</code></td>
              <td>Create and update calendar events</td>
            </tr>
            <tr>
              <td><code>billing:read</code></td>
              <td>View time entries and invoices</td>
            </tr>
            <tr>
              <td><code>billing:write</code></td>
              <td>Create time entries and invoices</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className={styles.docSection}>
        <h2>Authentication Errors</h2>
        <p>
          When authentication fails, the API returns an error response with details about 
          what went wrong.
        </p>

        <h3>401 Unauthorized</h3>
        <p>The API key is missing, invalid, or has been revoked.</p>
        <div className={styles.codeBlock}>
          <pre><code>{`{
  "error": "Invalid API key"
}`}</code></pre>
        </div>

        <h3>403 Forbidden</h3>
        <p>The API key doesn't have permission to perform the requested action.</p>
        <div className={styles.codeBlock}>
          <pre><code>{`{
  "error": "API key lacks required permission"
}`}</code></pre>
        </div>

        <div className={styles.infoBox}>
          <Info size={20} />
          <p>
            If you're receiving authentication errors, verify that your API key is correct, 
            has not expired, and has the necessary permissions for the endpoint you're accessing.
          </p>
        </div>
      </section>

      <section className={styles.docSection}>
        <h2>Key Management</h2>
        <p>
          You can manage your API keys in the <Link to="/developer/apps" style={{ color: 'var(--apex-gold)' }}>My Apps</Link> section 
          of the Developer Portal.
        </p>

        <h3>Available Actions</h3>
        <ul>
          <li><strong>View</strong> - See your API key value and permissions</li>
          <li><strong>Copy</strong> - Copy the key to your clipboard</li>
          <li><strong>Revoke</strong> - Permanently disable the key</li>
        </ul>

        <div className={`${styles.infoBox} ${styles.warning}`}>
          <AlertTriangle size={20} />
          <p>
            <strong>Revoking a key is permanent.</strong> Once revoked, all applications using 
            that key will immediately lose access. Make sure to update your applications with 
            a new key before revoking the old one.
          </p>
        </div>
      </section>
    </div>
  )
}
