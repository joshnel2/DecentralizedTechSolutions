import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, CheckCircle2, Info, AlertTriangle } from 'lucide-react'
import styles from './DeveloperPortal.module.css'

export function GettingStarted() {
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null)

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code)
    setCopiedBlock(id)
    setTimeout(() => setCopiedBlock(null), 2000)
  }

  return (
    <div className={styles.docPage}>
      <header className={styles.docHeader}>
        <h1>Getting Started</h1>
        <p>
          Learn how to authenticate with the Apex API and make your first request. 
          This guide will have you up and running in just a few minutes.
        </p>
      </header>

      <section className={styles.docSection}>
        <h2>Step 1: Create an API Key</h2>
        <p>
          To use the Apex API, you'll need an API key. API keys are created in the 
          Developer Portal and provide access to your firm's data.
        </p>

        <ol>
          <li>Go to <Link to="/developer/apps" style={{ color: 'var(--apex-gold)' }}>My Apps</Link></li>
          <li>Click "Create New App"</li>
          <li>Enter a name for your application</li>
          <li>Select the permissions your app needs</li>
          <li>Click "Create" and copy your API key</li>
        </ol>

        <div className={`${styles.infoBox} ${styles.warning}`}>
          <AlertTriangle size={20} />
          <p>
            <strong>Keep your API key secure!</strong> API keys provide access to your firm's data. 
            Never share them publicly or commit them to version control.
          </p>
        </div>
      </section>

      <section className={styles.docSection}>
        <h2>Step 2: Make Your First Request</h2>
        <p>
          Once you have an API key, you can start making requests to the Apex API. 
          All requests must include your API key in the Authorization header.
        </p>

        <h3>Example: List Matters</h3>
        <div className={styles.codeBlock}>
          <div className={styles.codeHeader}>
            <span className={styles.codeLanguage}>bash</span>
            <button 
              className={`${styles.copyBtn} ${copiedBlock === 'curl1' ? styles.copied : ''}`}
              onClick={() => copyCode(`curl -X GET "https://your-firm.apexlegal.app/api/matters" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`, 'curl1')}
            >
              {copiedBlock === 'curl1' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              {copiedBlock === 'curl1' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre><code>{`curl -X GET "https://your-firm.apexlegal.app/api/matters" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`}</code></pre>
        </div>

        <h3>Example Response</h3>
        <div className={styles.codeBlock}>
          <div className={styles.codeHeader}>
            <span className={styles.codeLanguage}>json</span>
            <button 
              className={`${styles.copyBtn} ${copiedBlock === 'json1' ? styles.copied : ''}`}
              onClick={() => copyCode(`{
  "matters": [
    {
      "id": "uuid-1234-5678",
      "number": "M-2024-0001",
      "name": "Smith v. Jones",
      "clientId": "client-uuid",
      "clientName": "John Smith",
      "status": "active",
      "matterType": "litigation",
      "openDate": "2024-01-15",
      "billingMethod": "hourly",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 50
}`, 'json1')}
            >
              {copiedBlock === 'json1' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              {copiedBlock === 'json1' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre><code>{`{
  "matters": [
    {
      "id": "uuid-1234-5678",
      "number": "M-2024-0001",
      "name": "Smith v. Jones",
      "clientId": "client-uuid",
      "clientName": "John Smith",
      "status": "active",
      "matterType": "litigation",
      "openDate": "2024-01-15",
      "billingMethod": "hourly",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 50
}`}</code></pre>
        </div>
      </section>

      <section className={styles.docSection}>
        <h2>Step 3: Explore the API</h2>
        <p>
          Now that you've made your first request, explore the full API reference to see 
          all available endpoints and what you can build.
        </p>

        <h3>Core Endpoints</h3>
        <table className={styles.paramTable}>
          <thead>
            <tr>
              <th>Resource</th>
              <th>Endpoint</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Matters</td>
              <td><code>/api/matters</code></td>
              <td>Legal matters and cases</td>
            </tr>
            <tr>
              <td>Clients</td>
              <td><code>/api/clients</code></td>
              <td>Client contacts and organizations</td>
            </tr>
            <tr>
              <td>Time Entries</td>
              <td><code>/api/time-entries</code></td>
              <td>Billable time records</td>
            </tr>
            <tr>
              <td>Invoices</td>
              <td><code>/api/invoices</code></td>
              <td>Bills and payments</td>
            </tr>
            <tr>
              <td>Calendar</td>
              <td><code>/api/calendar</code></td>
              <td>Events and deadlines</td>
            </tr>
            <tr>
              <td>Documents</td>
              <td><code>/api/documents</code></td>
              <td>Files and document metadata</td>
            </tr>
          </tbody>
        </table>

        <div className={styles.infoBox}>
          <Info size={20} />
          <p>
            Check out the <Link to="/developer/api-reference" style={{ color: 'inherit', fontWeight: 600 }}>API Reference</Link> for 
            complete documentation of all endpoints, including request parameters and response formats.
          </p>
        </div>
      </section>

      <section className={styles.docSection}>
        <h2>Best Practices</h2>
        
        <h3>Error Handling</h3>
        <p>
          Always check the HTTP status code of responses. The API uses standard HTTP status codes:
        </p>
        <ul>
          <li><code>200</code> - Success</li>
          <li><code>201</code> - Created (for POST requests)</li>
          <li><code>400</code> - Bad Request (invalid parameters)</li>
          <li><code>401</code> - Unauthorized (invalid or missing API key)</li>
          <li><code>403</code> - Forbidden (insufficient permissions)</li>
          <li><code>404</code> - Not Found</li>
          <li><code>429</code> - Too Many Requests (rate limited)</li>
          <li><code>500</code> - Server Error</li>
        </ul>

        <h3>Rate Limiting</h3>
        <p>
          The API has rate limits to ensure fair usage. If you exceed the limit, you'll receive 
          a <code>429</code> response. See the <Link to="/developer/rate-limits" style={{ color: 'var(--apex-gold)' }}>Rate Limits</Link> page 
          for details.
        </p>

        <h3>Pagination</h3>
        <p>
          List endpoints return paginated results. Use the <code>page</code> and <code>pageSize</code> 
          query parameters to navigate through results.
        </p>
        <div className={styles.codeBlock}>
          <pre><code>{`GET /api/matters?page=2&pageSize=25`}</code></pre>
        </div>
      </section>

      <section className={styles.docSection}>
        <h2>Next Steps</h2>
        <ul>
          <li><Link to="/developer/authentication" style={{ color: 'var(--apex-gold)' }}>Learn more about authentication</Link></li>
          <li><Link to="/developer/api-reference" style={{ color: 'var(--apex-gold)' }}>Explore the full API reference</Link></li>
          <li><Link to="/developer/apps" style={{ color: 'var(--apex-gold)' }}>Create your first app</Link></li>
        </ul>
      </section>
    </div>
  )
}
