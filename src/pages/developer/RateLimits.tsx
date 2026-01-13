import { Info, AlertTriangle } from 'lucide-react'
import styles from './DeveloperPortal.module.css'

export function RateLimits() {
  return (
    <div className={styles.docPage}>
      <header className={styles.docHeader}>
        <h1>Rate Limits</h1>
        <p>
          The Apex API implements rate limiting to ensure fair usage and maintain 
          platform stability for all users.
        </p>
      </header>

      <section className={styles.docSection}>
        <h2>Current Limits</h2>
        <p>
          API requests are limited based on your API key. The following limits apply:
        </p>

        <table className={styles.paramTable}>
          <thead>
            <tr>
              <th>Limit Type</th>
              <th>Limit</th>
              <th>Window</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Requests per minute</td>
              <td>60</td>
              <td>1 minute</td>
            </tr>
            <tr>
              <td>Requests per hour</td>
              <td>1,000</td>
              <td>1 hour</td>
            </tr>
            <tr>
              <td>Requests per day</td>
              <td>10,000</td>
              <td>24 hours</td>
            </tr>
          </tbody>
        </table>

        <div className={styles.infoBox}>
          <Info size={20} />
          <p>
            Rate limits are applied per API key. If you have multiple applications, 
            each API key has its own separate limits.
          </p>
        </div>
      </section>

      <section className={styles.docSection}>
        <h2>Rate Limit Headers</h2>
        <p>
          Every API response includes headers that show your current rate limit status:
        </p>

        <table className={styles.paramTable}>
          <thead>
            <tr>
              <th>Header</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>X-RateLimit-Limit</code></td>
              <td>Maximum requests allowed in the current window</td>
            </tr>
            <tr>
              <td><code>X-RateLimit-Remaining</code></td>
              <td>Requests remaining in the current window</td>
            </tr>
            <tr>
              <td><code>X-RateLimit-Reset</code></td>
              <td>Unix timestamp when the rate limit window resets</td>
            </tr>
          </tbody>
        </table>

        <h3>Example Response Headers</h3>
        <div className={styles.codeBlock}>
          <pre><code>{`HTTP/1.1 200 OK
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1705856400
Content-Type: application/json`}</code></pre>
        </div>
      </section>

      <section className={styles.docSection}>
        <h2>Exceeding Rate Limits</h2>
        <p>
          When you exceed a rate limit, the API returns a <code>429 Too Many Requests</code> 
          response. The response includes information about when you can retry.
        </p>

        <h3>429 Response Example</h3>
        <div className={styles.codeBlock}>
          <pre><code>{`HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1705856400
Retry-After: 45
Content-Type: application/json

{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please wait before retrying.",
  "retryAfter": 45
}`}</code></pre>
        </div>

        <div className={`${styles.infoBox} ${styles.warning}`}>
          <AlertTriangle size={20} />
          <p>
            <strong>Don't retry immediately!</strong> Use the <code>Retry-After</code> header 
            to determine how long to wait before making another request. Continuously 
            retrying while rate limited may result in temporary API key suspension.
          </p>
        </div>
      </section>

      <section className={styles.docSection}>
        <h2>Best Practices</h2>
        
        <h3>1. Implement Exponential Backoff</h3>
        <p>
          When you receive a rate limit error, wait progressively longer between retries:
        </p>
        <div className={styles.codeBlock}>
          <pre><code>{`async function makeRequestWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || 60;
      const waitTime = Math.min(retryAfter * Math.pow(2, attempt), 300);
      await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      continue;
    }
    
    return response;
  }
  throw new Error('Max retries exceeded');
}`}</code></pre>
        </div>

        <h3>2. Cache Responses</h3>
        <p>
          Cache API responses when possible to reduce the number of requests. Data that 
          doesn't change frequently (like matter details) can often be cached for several minutes.
        </p>

        <h3>3. Use Bulk Endpoints</h3>
        <p>
          When you need to retrieve multiple records, use list endpoints with filters rather 
          than making individual requests for each record.
        </p>

        <h3>4. Request Only What You Need</h3>
        <p>
          Use query parameters to filter results and reduce response sizes. This is more 
          efficient than fetching all data and filtering client-side.
        </p>
      </section>

      <section className={styles.docSection}>
        <h2>Need Higher Limits?</h2>
        <p>
          If your application requires higher rate limits, contact our support team to 
          discuss your use case. Enterprise plans may have increased limits available.
        </p>
        <p>
          <a href="mailto:developers@apexlegal.app" style={{ color: 'var(--apex-gold)' }}>
            Contact Developer Support
          </a>
        </p>
      </section>
    </div>
  )
}
