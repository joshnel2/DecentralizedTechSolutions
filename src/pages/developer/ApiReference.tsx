import { useState } from 'react'
import { Copy, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react'
import styles from './DeveloperPortal.module.css'

interface EndpointProps {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  description: string
  parameters?: { name: string; type: string; required?: boolean; description: string }[]
  requestBody?: string
  responseBody: string
}

function Endpoint({ method, path, description, parameters, requestBody, responseBody }: EndpointProps) {
  const [expanded, setExpanded] = useState(false)
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null)

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code)
    setCopiedBlock(id)
    setTimeout(() => setCopiedBlock(null), 2000)
  }

  const curlExample = method === 'GET' 
    ? `curl -X GET "https://your-firm.apexlegal.app${path}" \\
  -H "Authorization: Bearer YOUR_API_KEY"`
    : `curl -X ${method} "https://your-firm.apexlegal.app${path}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${requestBody || '{}'}'`

  return (
    <div className={styles.endpoint}>
      <div 
        className={styles.endpointHeader} 
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer' }}
      >
        <span className={`${styles.methodBadge} ${styles[method.toLowerCase()]}`}>
          {method}
        </span>
        <span className={styles.endpointPath}>{path}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--apex-subtle)' }}>
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </span>
      </div>
      
      {expanded && (
        <div className={styles.endpointBody}>
          <p className={styles.endpointDesc}>{description}</p>

          {parameters && parameters.length > 0 && (
            <>
              <h4 style={{ fontSize: '0.875rem', color: 'var(--apex-light)', marginBottom: '8px' }}>Parameters</h4>
              <table className={styles.paramTable}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {parameters.map(p => (
                    <tr key={p.name}>
                      <td>
                        <code>{p.name}</code>
                        {p.required && <span className={styles.required}>*</span>}
                      </td>
                      <td>{p.type}</td>
                      <td>{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h4 style={{ fontSize: '0.875rem', color: 'var(--apex-light)', margin: '16px 0 8px' }}>Example Request</h4>
          <div className={styles.codeBlock}>
            <div className={styles.codeHeader}>
              <span className={styles.codeLanguage}>bash</span>
              <button 
                className={`${styles.copyBtn} ${copiedBlock === `curl-${path}` ? styles.copied : ''}`}
                onClick={(e) => { e.stopPropagation(); copyCode(curlExample, `curl-${path}`) }}
              >
                {copiedBlock === `curl-${path}` ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                {copiedBlock === `curl-${path}` ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre><code>{curlExample}</code></pre>
          </div>

          <h4 style={{ fontSize: '0.875rem', color: 'var(--apex-light)', margin: '16px 0 8px' }}>Example Response</h4>
          <div className={styles.codeBlock}>
            <div className={styles.codeHeader}>
              <span className={styles.codeLanguage}>json</span>
            </div>
            <pre><code>{responseBody}</code></pre>
          </div>
        </div>
      )}
    </div>
  )
}

export function ApiReference() {
  const [activeSection, setActiveSection] = useState('matters')

  const sections = [
    { id: 'matters', label: 'Matters' },
    { id: 'clients', label: 'Clients' },
    { id: 'time-entries', label: 'Time Entries' },
    { id: 'invoices', label: 'Invoices' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'documents', label: 'Documents' },
    { id: 'users', label: 'Users' },
  ]

  return (
    <div className={styles.docPage}>
      <header className={styles.docHeader}>
        <h1>API Reference</h1>
        <p>
          Complete reference documentation for all Apex API endpoints. Click on an 
          endpoint to see parameters, examples, and response formats.
        </p>
      </header>

      <section className={styles.docSection}>
        <h2>Base URL</h2>
        <div className={styles.codeBlock}>
          <pre><code>https://your-firm.apexlegal.app/api</code></pre>
        </div>
        <p>Replace <code>your-firm</code> with your firm's subdomain.</p>
      </section>

      <div className={styles.tabs}>
        {sections.map(s => (
          <button 
            key={s.id}
            className={`${styles.tab} ${activeSection === s.id ? styles.active : ''}`}
            onClick={() => setActiveSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {activeSection === 'matters' && (
        <section className={styles.docSection}>
          <h2>Matters</h2>
          <p>Endpoints for managing legal matters, cases, and projects.</p>

          <Endpoint
            method="GET"
            path="/api/matters"
            description="Retrieve a list of all matters for your firm. Supports pagination and filtering."
            parameters={[
              { name: 'page', type: 'integer', description: 'Page number (default: 1)' },
              { name: 'pageSize', type: 'integer', description: 'Items per page (default: 50, max: 100)' },
              { name: 'status', type: 'string', description: 'Filter by status: active, closed, pending' },
              { name: 'clientId', type: 'uuid', description: 'Filter by client ID' },
              { name: 'search', type: 'string', description: 'Search by name or number' },
            ]}
            responseBody={`{
  "matters": [
    {
      "id": "uuid-1234",
      "number": "M-2024-0001",
      "name": "Smith v. Jones",
      "clientId": "client-uuid",
      "clientName": "John Smith",
      "status": "active",
      "matterType": "litigation",
      "openDate": "2024-01-15",
      "billingMethod": "hourly",
      "responsibleAttorneyId": "user-uuid",
      "description": "Personal injury case",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-20T14:00:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "pageSize": 50
}`}
          />

          <Endpoint
            method="GET"
            path="/api/matters/:id"
            description="Retrieve details for a specific matter."
            parameters={[
              { name: 'id', type: 'uuid', required: true, description: 'Matter ID' },
            ]}
            responseBody={`{
  "id": "uuid-1234",
  "number": "M-2024-0001",
  "name": "Smith v. Jones",
  "clientId": "client-uuid",
  "clientName": "John Smith",
  "status": "active",
  "matterType": "litigation",
  "openDate": "2024-01-15",
  "closeDate": null,
  "billingMethod": "hourly",
  "responsibleAttorneyId": "user-uuid",
  "originatingAttorneyId": "user-uuid",
  "description": "Personal injury case arising from...",
  "practiceArea": "Personal Injury",
  "customFields": {},
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-20T14:00:00Z"
}`}
          />

          <Endpoint
            method="POST"
            path="/api/matters"
            description="Create a new matter."
            parameters={[
              { name: 'name', type: 'string', required: true, description: 'Matter name' },
              { name: 'clientId', type: 'uuid', required: true, description: 'Client ID' },
              { name: 'matterType', type: 'string', description: 'Type of matter' },
              { name: 'billingMethod', type: 'string', description: 'hourly, flat_fee, contingency, retainer' },
              { name: 'responsibleAttorneyId', type: 'uuid', description: 'Responsible attorney ID' },
              { name: 'description', type: 'string', description: 'Matter description' },
            ]}
            requestBody={`{
  "name": "New Case Name",
  "clientId": "client-uuid",
  "matterType": "litigation",
  "billingMethod": "hourly"
}`}
            responseBody={`{
  "id": "new-matter-uuid",
  "number": "M-2024-0002",
  "name": "New Case Name",
  "clientId": "client-uuid",
  "status": "active",
  "createdAt": "2024-01-21T09:00:00Z"
}`}
          />

          <Endpoint
            method="PUT"
            path="/api/matters/:id"
            description="Update an existing matter."
            parameters={[
              { name: 'id', type: 'uuid', required: true, description: 'Matter ID' },
              { name: 'name', type: 'string', description: 'Matter name' },
              { name: 'status', type: 'string', description: 'active, closed, pending' },
              { name: 'description', type: 'string', description: 'Matter description' },
            ]}
            requestBody={`{
  "name": "Updated Case Name",
  "status": "closed"
}`}
            responseBody={`{
  "message": "Matter updated successfully"
}`}
          />

          <Endpoint
            method="DELETE"
            path="/api/matters/:id"
            description="Delete a matter. This action cannot be undone."
            parameters={[
              { name: 'id', type: 'uuid', required: true, description: 'Matter ID' },
            ]}
            responseBody={`{
  "message": "Matter deleted successfully"
}`}
          />
        </section>
      )}

      {activeSection === 'clients' && (
        <section className={styles.docSection}>
          <h2>Clients</h2>
          <p>Endpoints for managing client contacts and organizations.</p>

          <Endpoint
            method="GET"
            path="/api/clients"
            description="Retrieve a list of all clients."
            parameters={[
              { name: 'page', type: 'integer', description: 'Page number' },
              { name: 'pageSize', type: 'integer', description: 'Items per page' },
              { name: 'type', type: 'string', description: 'Filter by type: individual, organization' },
              { name: 'search', type: 'string', description: 'Search by name or email' },
            ]}
            responseBody={`{
  "clients": [
    {
      "id": "client-uuid",
      "type": "individual",
      "name": "John Smith",
      "email": "john@example.com",
      "phone": "555-123-4567",
      "address": "123 Main St, City, ST 12345",
      "matterCount": 3,
      "createdAt": "2024-01-10T08:00:00Z"
    }
  ],
  "total": 75,
  "page": 1,
  "pageSize": 50
}`}
          />

          <Endpoint
            method="GET"
            path="/api/clients/:id"
            description="Retrieve details for a specific client."
            parameters={[
              { name: 'id', type: 'uuid', required: true, description: 'Client ID' },
            ]}
            responseBody={`{
  "id": "client-uuid",
  "type": "individual",
  "name": "John Smith",
  "email": "john@example.com",
  "phone": "555-123-4567",
  "address": "123 Main St",
  "city": "City",
  "state": "ST",
  "zip": "12345",
  "notes": "Preferred contact method: email",
  "customFields": {},
  "matters": [
    { "id": "matter-1", "name": "Smith v. Jones", "status": "active" }
  ],
  "createdAt": "2024-01-10T08:00:00Z"
}`}
          />

          <Endpoint
            method="POST"
            path="/api/clients"
            description="Create a new client."
            parameters={[
              { name: 'name', type: 'string', required: true, description: 'Client name' },
              { name: 'type', type: 'string', description: 'individual or organization' },
              { name: 'email', type: 'string', description: 'Email address' },
              { name: 'phone', type: 'string', description: 'Phone number' },
            ]}
            requestBody={`{
  "name": "Jane Doe",
  "type": "individual",
  "email": "jane@example.com",
  "phone": "555-987-6543"
}`}
            responseBody={`{
  "id": "new-client-uuid",
  "name": "Jane Doe",
  "type": "individual",
  "createdAt": "2024-01-21T10:00:00Z"
}`}
          />

          <Endpoint
            method="PUT"
            path="/api/clients/:id"
            description="Update an existing client."
            requestBody={`{
  "email": "newemail@example.com",
  "phone": "555-111-2222"
}`}
            responseBody={`{
  "message": "Client updated successfully"
}`}
          />

          <Endpoint
            method="DELETE"
            path="/api/clients/:id"
            description="Delete a client."
            responseBody={`{
  "message": "Client deleted successfully"
}`}
          />
        </section>
      )}

      {activeSection === 'time-entries' && (
        <section className={styles.docSection}>
          <h2>Time Entries</h2>
          <p>Endpoints for managing billable time records.</p>

          <Endpoint
            method="GET"
            path="/api/time-entries"
            description="Retrieve time entries. Can be filtered by matter, user, or date range."
            parameters={[
              { name: 'matterId', type: 'uuid', description: 'Filter by matter ID' },
              { name: 'userId', type: 'uuid', description: 'Filter by user ID' },
              { name: 'startDate', type: 'date', description: 'Start of date range (YYYY-MM-DD)' },
              { name: 'endDate', type: 'date', description: 'End of date range (YYYY-MM-DD)' },
              { name: 'billed', type: 'boolean', description: 'Filter by billed status' },
            ]}
            responseBody={`{
  "timeEntries": [
    {
      "id": "entry-uuid",
      "matterId": "matter-uuid",
      "matterName": "Smith v. Jones",
      "userId": "user-uuid",
      "userName": "Sarah Attorney",
      "date": "2024-01-20",
      "hours": 2.5,
      "rate": 350.00,
      "amount": 875.00,
      "description": "Document review and analysis",
      "billable": true,
      "billed": false,
      "activityCode": "L110",
      "createdAt": "2024-01-20T16:30:00Z"
    }
  ],
  "total": 250,
  "totalHours": 625.5,
  "totalAmount": 218925.00
}`}
          />

          <Endpoint
            method="POST"
            path="/api/time-entries"
            description="Create a new time entry."
            parameters={[
              { name: 'matterId', type: 'uuid', required: true, description: 'Matter ID' },
              { name: 'date', type: 'date', required: true, description: 'Date of work' },
              { name: 'hours', type: 'number', required: true, description: 'Hours worked' },
              { name: 'description', type: 'string', required: true, description: 'Work description' },
              { name: 'billable', type: 'boolean', description: 'Is this billable? (default: true)' },
              { name: 'activityCode', type: 'string', description: 'UTBMS activity code' },
            ]}
            requestBody={`{
  "matterId": "matter-uuid",
  "date": "2024-01-21",
  "hours": 1.5,
  "description": "Client phone call regarding case status",
  "billable": true,
  "activityCode": "L120"
}`}
            responseBody={`{
  "id": "new-entry-uuid",
  "matterId": "matter-uuid",
  "hours": 1.5,
  "amount": 525.00,
  "createdAt": "2024-01-21T11:00:00Z"
}`}
          />

          <Endpoint
            method="PUT"
            path="/api/time-entries/:id"
            description="Update a time entry."
            requestBody={`{
  "hours": 2.0,
  "description": "Updated description"
}`}
            responseBody={`{
  "message": "Time entry updated successfully"
}`}
          />

          <Endpoint
            method="DELETE"
            path="/api/time-entries/:id"
            description="Delete a time entry."
            responseBody={`{
  "message": "Time entry deleted successfully"
}`}
          />
        </section>
      )}

      {activeSection === 'invoices' && (
        <section className={styles.docSection}>
          <h2>Invoices</h2>
          <p>Endpoints for managing invoices and billing.</p>

          <Endpoint
            method="GET"
            path="/api/invoices"
            description="Retrieve invoices."
            parameters={[
              { name: 'status', type: 'string', description: 'Filter by status: draft, sent, paid, overdue' },
              { name: 'clientId', type: 'uuid', description: 'Filter by client' },
              { name: 'matterId', type: 'uuid', description: 'Filter by matter' },
            ]}
            responseBody={`{
  "invoices": [
    {
      "id": "invoice-uuid",
      "number": "INV-2024-0001",
      "clientId": "client-uuid",
      "clientName": "John Smith",
      "matterId": "matter-uuid",
      "matterName": "Smith v. Jones",
      "status": "sent",
      "amount": 2500.00,
      "balance": 2500.00,
      "issueDate": "2024-01-15",
      "dueDate": "2024-02-15",
      "createdAt": "2024-01-15T12:00:00Z"
    }
  ],
  "total": 45
}`}
          />

          <Endpoint
            method="POST"
            path="/api/invoices"
            description="Create a new invoice."
            requestBody={`{
  "clientId": "client-uuid",
  "matterId": "matter-uuid",
  "timeEntryIds": ["entry-1", "entry-2"],
  "dueDate": "2024-02-20"
}`}
            responseBody={`{
  "id": "new-invoice-uuid",
  "number": "INV-2024-0002",
  "amount": 1750.00,
  "status": "draft"
}`}
          />
        </section>
      )}

      {activeSection === 'calendar' && (
        <section className={styles.docSection}>
          <h2>Calendar Events</h2>
          <p>Endpoints for managing calendar events, deadlines, and appointments.</p>

          <Endpoint
            method="GET"
            path="/api/calendar"
            description="Retrieve calendar events."
            parameters={[
              { name: 'startDate', type: 'date', description: 'Start of date range' },
              { name: 'endDate', type: 'date', description: 'End of date range' },
              { name: 'matterId', type: 'uuid', description: 'Filter by matter' },
              { name: 'type', type: 'string', description: 'Filter by type: meeting, deadline, hearing, reminder' },
            ]}
            responseBody={`{
  "events": [
    {
      "id": "event-uuid",
      "title": "Client Meeting - Smith",
      "type": "meeting",
      "startTime": "2024-01-22T10:00:00Z",
      "endTime": "2024-01-22T11:00:00Z",
      "allDay": false,
      "matterId": "matter-uuid",
      "matterName": "Smith v. Jones",
      "location": "Conference Room A",
      "description": "Discuss case strategy",
      "attendees": ["user-1", "user-2"]
    }
  ]
}`}
          />

          <Endpoint
            method="POST"
            path="/api/calendar"
            description="Create a calendar event."
            requestBody={`{
  "title": "Deposition - John Doe",
  "type": "hearing",
  "startTime": "2024-01-25T09:00:00Z",
  "endTime": "2024-01-25T12:00:00Z",
  "matterId": "matter-uuid",
  "location": "Court House Room 301"
}`}
            responseBody={`{
  "id": "new-event-uuid",
  "title": "Deposition - John Doe",
  "createdAt": "2024-01-21T14:00:00Z"
}`}
          />
        </section>
      )}

      {activeSection === 'documents' && (
        <section className={styles.docSection}>
          <h2>Documents</h2>
          <p>Endpoints for managing documents and files.</p>

          <Endpoint
            method="GET"
            path="/api/documents"
            description="Retrieve documents."
            parameters={[
              { name: 'matterId', type: 'uuid', description: 'Filter by matter' },
              { name: 'clientId', type: 'uuid', description: 'Filter by client' },
              { name: 'search', type: 'string', description: 'Search by filename' },
            ]}
            responseBody={`{
  "documents": [
    {
      "id": "doc-uuid",
      "name": "Complaint.pdf",
      "mimeType": "application/pdf",
      "size": 245678,
      "matterId": "matter-uuid",
      "matterName": "Smith v. Jones",
      "uploadedBy": "user-uuid",
      "uploadedByName": "Sarah Attorney",
      "createdAt": "2024-01-18T09:30:00Z"
    }
  ],
  "total": 120
}`}
          />

          <Endpoint
            method="GET"
            path="/api/documents/:id/download"
            description="Download a document file."
            parameters={[
              { name: 'id', type: 'uuid', required: true, description: 'Document ID' },
            ]}
            responseBody={`Binary file content with appropriate Content-Type header`}
          />

          <Endpoint
            method="POST"
            path="/api/documents"
            description="Upload a new document. Use multipart/form-data encoding."
            parameters={[
              { name: 'file', type: 'file', required: true, description: 'The file to upload' },
              { name: 'matterId', type: 'uuid', description: 'Matter to attach document to' },
              { name: 'clientId', type: 'uuid', description: 'Client to attach document to' },
            ]}
            responseBody={`{
  "id": "new-doc-uuid",
  "name": "Contract.docx",
  "size": 34567,
  "createdAt": "2024-01-21T15:00:00Z"
}`}
          />

          <Endpoint
            method="DELETE"
            path="/api/documents/:id"
            description="Delete a document."
            responseBody={`{
  "message": "Document deleted successfully"
}`}
          />
        </section>
      )}

      {activeSection === 'users' && (
        <section className={styles.docSection}>
          <h2>Users</h2>
          <p>Endpoints for retrieving user information (read-only via API).</p>

          <Endpoint
            method="GET"
            path="/api/team/attorneys"
            description="Retrieve a list of attorneys and team members."
            responseBody={`{
  "attorneys": [
    {
      "id": "user-uuid",
      "email": "sarah@firm.com",
      "firstName": "Sarah",
      "lastName": "Attorney",
      "name": "Sarah Attorney",
      "role": "attorney",
      "hourlyRate": 350.00,
      "isActive": true
    }
  ]
}`}
          />
        </section>
      )}
    </div>
  )
}
