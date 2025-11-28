import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Azure OpenAI configuration
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT;
const API_VERSION = '2024-02-15-preview';

// System prompt for the AI
const SYSTEM_PROMPT = `You are an intelligent AI assistant for a law firm management platform called Apex Legal. You have access to the firm's data shown in the context below.

RULES:
1. If the question relates to the firm data provided, use it to give specific, accurate answers
2. If the question is general or unrelated to the firm data, answer helpfully like a knowledgeable legal assistant
3. Never say "based on the context provided" or "according to the data" - just answer naturally as if you know this information
4. Be concise, professional, and helpful
5. You can reference specific matters, clients, dates, amounts, and team members from the data
6. For legal questions, provide general guidance but remind users to verify with applicable law
7. When suggesting priorities or tasks, be specific and actionable
8. Format responses nicely with bullet points or numbered lists when appropriate

You are speaking directly to a law firm professional. Be their intelligent assistant.`;

// Helper to call Azure OpenAI
async function callAzureOpenAI(messages) {
  const url = `${AZURE_ENDPOINT}openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': AZURE_API_KEY,
    },
    body: JSON.stringify({
      messages,
      temperature: 0.7,
      max_tokens: 2000,
      top_p: 0.95,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Azure OpenAI error:', error);
    throw new Error(`Azure OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Build context based on page and fetch relevant data
async function buildContext(page, firmId, userId, additionalContext = {}) {
  let context = '';
  
  console.log(`Building AI context for page: ${page}, firm: ${firmId}, user: ${userId}`);
  
  try {
    switch (page) {
      case 'dashboard': {
        // Get summary stats
        const [mattersRes, clientsRes, timeRes, invoicesRes, eventsRes] = await Promise.all([
          query(`SELECT status, COUNT(*) as count FROM matters WHERE firm_id = $1 GROUP BY status`, [firmId]),
          query(`SELECT COUNT(*) as count FROM clients WHERE firm_id = $1 AND is_active = true`, [firmId]),
          query(`
            SELECT SUM(hours) as total_hours, SUM(amount) as total_amount 
            FROM time_entries 
            WHERE firm_id = $1 AND date >= DATE_TRUNC('month', CURRENT_DATE)
          `, [firmId]),
          query(`
            SELECT status, COUNT(*) as count, SUM(total) as total, SUM(amount_due) as due
            FROM invoices WHERE firm_id = $1 GROUP BY status
          `, [firmId]),
          query(`
            SELECT title, start_time, type, location 
            FROM calendar_events 
            WHERE firm_id = $1 AND start_time >= NOW() AND start_time < NOW() + INTERVAL '7 days'
            ORDER BY start_time LIMIT 10
          `, [firmId]),
        ]);

        const matterStats = mattersRes.rows.reduce((acc, r) => ({ ...acc, [r.status]: parseInt(r.count) }), {});
        const activeMatters = matterStats.active || 0;
        const invoiceStats = invoicesRes.rows;
        const outstanding = invoiceStats.filter(i => i.status === 'sent' || i.status === 'overdue')
          .reduce((sum, i) => sum + parseFloat(i.due || 0), 0);
        const overdue = invoiceStats.find(i => i.status === 'overdue');

        context = `
[CURRENT PAGE: Dashboard]

FIRM OVERVIEW:
- Active Matters: ${activeMatters}
- Total Matters: ${Object.values(matterStats).reduce((a, b) => a + b, 0)}
- Active Clients: ${clientsRes.rows[0]?.count || 0}
- This Month's Billable Hours: ${parseFloat(timeRes.rows[0]?.total_hours || 0).toFixed(1)}
- This Month's Revenue: $${parseFloat(timeRes.rows[0]?.total_amount || 0).toLocaleString()}
- Outstanding Invoices: $${outstanding.toLocaleString()}
- Overdue Amount: $${parseFloat(overdue?.due || 0).toLocaleString()}

UPCOMING EVENTS (Next 7 Days):
${eventsRes.rows.map(e => `- ${new Date(e.start_time).toLocaleDateString()} ${new Date(e.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}: ${e.title} (${e.type})${e.location ? ` at ${e.location}` : ''}`).join('\n') || 'No upcoming events'}
`;
        
        // Get urgent matters
        const urgentMatters = await query(`
          SELECT m.name, m.number, m.priority, c.display_name as client_name
          FROM matters m
          LEFT JOIN clients c ON m.client_id = c.id
          WHERE m.firm_id = $1 AND m.status = 'active' AND m.priority IN ('high', 'urgent')
          ORDER BY CASE m.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 END
          LIMIT 5
        `, [firmId]);
        
        if (urgentMatters.rows.length > 0) {
          context += `
URGENT/HIGH PRIORITY MATTERS:
${urgentMatters.rows.map(m => `- ${m.name} (${m.number}) - ${m.client_name || 'No client'} - ${m.priority.toUpperCase()}`).join('\n')}
`;
        }
        break;
      }

      case 'matters': {
        const matters = await query(`
          SELECT m.*, c.display_name as client_name,
                 u.first_name || ' ' || u.last_name as attorney_name
          FROM matters m
          LEFT JOIN clients c ON m.client_id = c.id
          LEFT JOIN users u ON m.responsible_attorney = u.id
          WHERE m.firm_id = $1
          ORDER BY m.created_at DESC
          LIMIT 20
        `, [firmId]);

        context = `
[CURRENT PAGE: Matters List]

MATTERS (${matters.rows.length} shown):
${matters.rows.map(m => `- ${m.name} (${m.number})
  Client: ${m.client_name || 'None'} | Status: ${m.status} | Type: ${m.type}
  Attorney: ${m.attorney_name || 'Unassigned'} | Billing: ${m.billing_type} ${m.billing_rate ? `$${m.billing_rate}/hr` : ''}`).join('\n\n')}
`;
        break;
      }

      case 'matter-detail': {
        if (!additionalContext.matterId) break;
        
        const [matterRes, timeRes, docsRes, eventsRes] = await Promise.all([
          query(`
            SELECT m.*, c.display_name as client_name, c.email as client_email,
                   u.first_name || ' ' || u.last_name as attorney_name
            FROM matters m
            LEFT JOIN clients c ON m.client_id = c.id
            LEFT JOIN users u ON m.responsible_attorney = u.id
            WHERE m.id = $1 AND m.firm_id = $2
          `, [additionalContext.matterId, firmId]),
          query(`
            SELECT te.*, u.first_name || ' ' || u.last_name as user_name
            FROM time_entries te
            LEFT JOIN users u ON te.user_id = u.id
            WHERE te.matter_id = $1
            ORDER BY te.date DESC LIMIT 10
          `, [additionalContext.matterId]),
          query(`SELECT name, type, created_at FROM documents WHERE matter_id = $1 LIMIT 10`, [additionalContext.matterId]),
          query(`SELECT title, start_time, type FROM calendar_events WHERE matter_id = $1 AND start_time >= NOW() ORDER BY start_time LIMIT 5`, [additionalContext.matterId]),
        ]);

        const m = matterRes.rows[0];
        if (!m) break;

        const totalBilled = timeRes.rows.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        const totalHours = timeRes.rows.reduce((sum, t) => sum + parseFloat(t.hours || 0), 0);

        context = `
[CURRENT PAGE: Matter Detail]

MATTER: ${m.name} (${m.number})
Client: ${m.client_name || 'None'} ${m.client_email ? `(${m.client_email})` : ''}
Status: ${m.status} | Priority: ${m.priority} | Type: ${m.type}
Responsible Attorney: ${m.attorney_name || 'Unassigned'}
Billing: ${m.billing_type} ${m.billing_rate ? `at $${m.billing_rate}/hr` : ''}
Opened: ${m.open_date ? new Date(m.open_date).toLocaleDateString() : 'Unknown'}
${m.description ? `Description: ${m.description}` : ''}

BILLING SUMMARY:
- Total Hours: ${totalHours.toFixed(1)}
- Total Billed: $${totalBilled.toLocaleString()}

RECENT TIME ENTRIES:
${timeRes.rows.map(t => `- ${new Date(t.date).toLocaleDateString()}: ${t.hours}hrs - ${t.description} (${t.user_name})`).join('\n') || 'No time entries'}

DOCUMENTS (${docsRes.rows.length}):
${docsRes.rows.map(d => `- ${d.name} (${d.type})`).join('\n') || 'No documents'}

UPCOMING EVENTS:
${eventsRes.rows.map(e => `- ${new Date(e.start_time).toLocaleDateString()}: ${e.title} (${e.type})`).join('\n') || 'No upcoming events'}
`;
        break;
      }

      case 'clients': {
        const clients = await query(`
          SELECT c.*, 
                 (SELECT COUNT(*) FROM matters WHERE client_id = c.id) as matter_count,
                 (SELECT COALESCE(SUM(total), 0) FROM invoices WHERE client_id = c.id) as total_billed
          FROM clients c
          WHERE c.firm_id = $1
          ORDER BY c.created_at DESC
          LIMIT 20
        `, [firmId]);

        context = `
[CURRENT PAGE: Clients List]

CLIENTS (${clients.rows.length}):
${clients.rows.map(c => `- ${c.display_name} (${c.type})
  ${c.email ? `Email: ${c.email}` : ''} ${c.phone ? `| Phone: ${c.phone}` : ''}
  Matters: ${c.matter_count} | Total Billed: $${parseFloat(c.total_billed || 0).toLocaleString()}
  Status: ${c.is_active ? 'Active' : 'Inactive'}`).join('\n\n')}
`;
        break;
      }

      case 'client-detail': {
        if (!additionalContext.clientId) break;
        
        const [clientRes, mattersRes, invoicesRes] = await Promise.all([
          query(`SELECT * FROM clients WHERE id = $1 AND firm_id = $2`, [additionalContext.clientId, firmId]),
          query(`SELECT name, number, status, type FROM matters WHERE client_id = $1 ORDER BY created_at DESC LIMIT 10`, [additionalContext.clientId]),
          query(`SELECT number, status, total, amount_due, due_date FROM invoices WHERE client_id = $1 ORDER BY created_at DESC LIMIT 10`, [additionalContext.clientId]),
        ]);

        const c = clientRes.rows[0];
        if (!c) break;

        context = `
[CURRENT PAGE: Client Detail]

CLIENT: ${c.display_name}
Type: ${c.type} | Status: ${c.is_active ? 'Active' : 'Inactive'}
Email: ${c.email || 'None'} | Phone: ${c.phone || 'None'}
${c.company_name ? `Company: ${c.company_name}` : ''}
${c.address_street ? `Address: ${c.address_street}, ${c.address_city}, ${c.address_state} ${c.address_zip}` : ''}

MATTERS (${mattersRes.rows.length}):
${mattersRes.rows.map(m => `- ${m.name} (${m.number}) - ${m.status} - ${m.type}`).join('\n') || 'No matters'}

INVOICES (${invoicesRes.rows.length}):
${invoicesRes.rows.map(i => `- ${i.number}: $${parseFloat(i.total).toLocaleString()} - ${i.status}${i.amount_due > 0 ? ` ($${parseFloat(i.amount_due).toLocaleString()} due)` : ''}`).join('\n') || 'No invoices'}
`;
        break;
      }

      case 'billing': {
        const [invoicesRes, unbilledRes, arRes] = await Promise.all([
          query(`
            SELECT i.*, c.display_name as client_name
            FROM invoices i
            LEFT JOIN clients c ON i.client_id = c.id
            WHERE i.firm_id = $1
            ORDER BY i.created_at DESC LIMIT 20
          `, [firmId]),
          query(`
            SELECT SUM(amount) as total, SUM(hours) as hours
            FROM time_entries
            WHERE firm_id = $1 AND billable = true AND billed = false
          `, [firmId]),
          query(`
            SELECT 
              SUM(CASE WHEN status = 'sent' AND due_date >= CURRENT_DATE THEN amount_due ELSE 0 END) as current,
              SUM(CASE WHEN status = 'overdue' OR (status = 'sent' AND due_date < CURRENT_DATE) THEN amount_due ELSE 0 END) as overdue
            FROM invoices WHERE firm_id = $1
          `, [firmId]),
        ]);

        const unbilled = unbilledRes.rows[0];
        const ar = arRes.rows[0];

        context = `
[CURRENT PAGE: Billing]

ACCOUNTS RECEIVABLE:
- Current (not overdue): $${parseFloat(ar?.current || 0).toLocaleString()}
- Overdue: $${parseFloat(ar?.overdue || 0).toLocaleString()}
- Total Outstanding: $${(parseFloat(ar?.current || 0) + parseFloat(ar?.overdue || 0)).toLocaleString()}

UNBILLED WORK:
- Unbilled Hours: ${parseFloat(unbilled?.hours || 0).toFixed(1)}
- Unbilled Amount: $${parseFloat(unbilled?.total || 0).toLocaleString()}

RECENT INVOICES:
${invoicesRes.rows.map(i => `- ${i.number} | ${i.client_name || 'Unknown'} | $${parseFloat(i.total).toLocaleString()} | ${i.status}${i.status !== 'paid' ? ` | Due: ${new Date(i.due_date).toLocaleDateString()}` : ''}`).join('\n')}
`;
        break;
      }

      case 'calendar': {
        const events = await query(`
          SELECT e.*, m.name as matter_name
          FROM calendar_events e
          LEFT JOIN matters m ON e.matter_id = m.id
          WHERE e.firm_id = $1 AND e.start_time >= NOW() - INTERVAL '7 days'
          ORDER BY e.start_time
          LIMIT 30
        `, [firmId]);

        context = `
[CURRENT PAGE: Calendar]

UPCOMING EVENTS:
${events.rows.map(e => {
  const start = new Date(e.start_time);
  const isPast = start < new Date();
  return `- ${isPast ? '[PAST] ' : ''}${start.toLocaleDateString()} ${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
  ${e.title} (${e.type})
  ${e.matter_name ? `Matter: ${e.matter_name}` : ''}${e.location ? ` | Location: ${e.location}` : ''}`;
}).join('\n\n') || 'No events scheduled'}
`;
        break;
      }

      case 'time-tracking': {
        const [entriesRes, summaryRes, mattersRes, eventsRes] = await Promise.all([
          query(`
            SELECT te.*, m.name as matter_name, u.first_name || ' ' || u.last_name as user_name
            FROM time_entries te
            LEFT JOIN matters m ON te.matter_id = m.id
            LEFT JOIN users u ON te.user_id = u.id
            WHERE te.firm_id = $1
            ORDER BY te.date DESC, te.created_at DESC
            LIMIT 20
          `, [firmId]),
          query(`
            SELECT 
              SUM(hours) as total_hours,
              SUM(amount) as total_amount,
              SUM(CASE WHEN billable THEN hours ELSE 0 END) as billable_hours,
              SUM(CASE WHEN billed THEN amount ELSE 0 END) as billed_amount
            FROM time_entries
            WHERE firm_id = $1 AND date >= DATE_TRUNC('month', CURRENT_DATE)
          `, [firmId]),
          query(`
            SELECT m.id, m.name, m.number, m.billing_type, m.billing_rate, c.display_name as client_name
            FROM matters m
            LEFT JOIN clients c ON m.client_id = c.id
            WHERE m.firm_id = $1 AND m.status = 'active'
            ORDER BY m.created_at DESC
            LIMIT 15
          `, [firmId]),
          query(`
            SELECT e.title, e.start_time, e.end_time, e.type, m.name as matter_name
            FROM calendar_events e
            LEFT JOIN matters m ON e.matter_id = m.id
            WHERE e.firm_id = $1 
              AND e.start_time >= NOW() - INTERVAL '14 days'
              AND e.start_time <= NOW() + INTERVAL '7 days'
            ORDER BY e.start_time DESC
            LIMIT 20
          `, [firmId]),
        ]);

        const summary = summaryRes.rows[0];

        context = `
[CURRENT PAGE: Time Tracking]

THIS MONTH'S SUMMARY:
- Total Hours: ${parseFloat(summary?.total_hours || 0).toFixed(1)}
- Billable Hours: ${parseFloat(summary?.billable_hours || 0).toFixed(1)}
- Total Value: $${parseFloat(summary?.total_amount || 0).toLocaleString()}
- Billed: $${parseFloat(summary?.billed_amount || 0).toLocaleString()}

ACTIVE MATTERS (for time entry suggestions):
${mattersRes.rows.length > 0 ? mattersRes.rows.map(m => `- ${m.name} (${m.number}) - ${m.client_name || 'No client'} - ${m.billing_type} ${m.billing_rate ? `$${m.billing_rate}/hr` : ''}`).join('\n') : 'No active matters found. User needs to create matters first.'}

RECENT CALENDAR EVENTS (past 2 weeks + upcoming week):
${eventsRes.rows.length > 0 ? eventsRes.rows.map(e => {
  const start = new Date(e.start_time);
  const duration = e.end_time ? ((new Date(e.end_time) - start) / 3600000).toFixed(1) : '?';
  return `- ${start.toLocaleDateString()} ${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}: ${e.title} (${e.type}) - ${duration}hrs${e.matter_name ? ` - Matter: ${e.matter_name}` : ''}`;
}).join('\n') : 'No recent calendar events found.'}

RECENT TIME ENTRIES:
${entriesRes.rows.length > 0 ? entriesRes.rows.map(e => `- ${new Date(e.date).toLocaleDateString()} | ${e.hours}hrs | $${parseFloat(e.amount || 0).toLocaleString()}
  ${e.matter_name || 'No matter'} | ${e.user_name}
  ${e.description}`).join('\n\n') : 'No recent time entries found.'}

SUGGESTION: Compare calendar events with time entries to identify work that may not have been logged yet.
`;
        break;
      }

      case 'documents': {
        const docs = await query(`
          SELECT d.*, m.name as matter_name, c.display_name as client_name
          FROM documents d
          LEFT JOIN matters m ON d.matter_id = m.id
          LEFT JOIN clients c ON d.client_id = c.id
          WHERE d.firm_id = $1
          ORDER BY d.created_at DESC
          LIMIT 20
        `, [firmId]);

        context = `
[CURRENT PAGE: Documents]

RECENT DOCUMENTS:
${docs.rows.map(d => `- ${d.name} (${d.type || 'unknown type'})
  ${d.matter_name ? `Matter: ${d.matter_name}` : ''}${d.client_name ? ` | Client: ${d.client_name}` : ''}
  Uploaded: ${new Date(d.created_at).toLocaleDateString()}`).join('\n\n') || 'No documents'}
`;
        break;
      }

      case 'team': {
        const team = await query(`
          SELECT u.*, 
                 (SELECT COUNT(*) FROM matters WHERE responsible_attorney = u.id) as matter_count,
                 (SELECT COALESCE(SUM(hours), 0) FROM time_entries WHERE user_id = u.id AND date >= DATE_TRUNC('month', CURRENT_DATE)) as monthly_hours
          FROM users u
          WHERE u.firm_id = $1 AND u.is_active = true
          ORDER BY u.role, u.first_name
        `, [firmId]);

        context = `
[CURRENT PAGE: Team]

TEAM MEMBERS:
${team.rows.map(u => `- ${u.first_name} ${u.last_name} (${u.role})
  Email: ${u.email}
  Matters: ${u.matter_count} | This Month: ${parseFloat(u.monthly_hours || 0).toFixed(1)} hrs
  Rate: ${u.hourly_rate ? `$${u.hourly_rate}/hr` : 'Not set'}`).join('\n\n')}
`;
        break;
      }

      case 'analytics':
      case 'reports': {
        // Firm-wide analytics context - comprehensive view for admins
        const [revenueRes, hoursRes, teamRes, mattersRes, clientsRes, invoicesRes, trendsRes] = await Promise.all([
          // Total revenue this month and last month
          query(`
            SELECT 
              COALESCE(SUM(CASE WHEN date >= DATE_TRUNC('month', CURRENT_DATE) THEN amount ELSE 0 END), 0) as this_month,
              COALESCE(SUM(CASE WHEN date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') AND date < DATE_TRUNC('month', CURRENT_DATE) THEN amount ELSE 0 END), 0) as last_month
            FROM time_entries WHERE firm_id = $1 AND billable = true
          `, [firmId]),
          // Hours breakdown
          query(`
            SELECT 
              COALESCE(SUM(hours), 0) as total_hours,
              COALESCE(SUM(CASE WHEN billable THEN hours ELSE 0 END), 0) as billable_hours,
              COALESCE(SUM(CASE WHEN billed THEN hours ELSE 0 END), 0) as billed_hours
            FROM time_entries WHERE firm_id = $1 AND date >= DATE_TRUNC('month', CURRENT_DATE)
          `, [firmId]),
          // Team productivity
          query(`
            SELECT u.first_name, u.last_name, u.role,
                   COALESCE(SUM(te.hours), 0) as hours,
                   COALESCE(SUM(te.amount), 0) as revenue
            FROM users u
            LEFT JOIN time_entries te ON te.user_id = u.id AND te.date >= DATE_TRUNC('month', CURRENT_DATE)
            WHERE u.firm_id = $1 AND u.is_active = true
            GROUP BY u.id, u.first_name, u.last_name, u.role
            ORDER BY revenue DESC
          `, [firmId]),
          // Matters by status
          query(`
            SELECT status, COUNT(*) as count FROM matters WHERE firm_id = $1 GROUP BY status
          `, [firmId]),
          // Client stats
          query(`
            SELECT COUNT(*) as total, COUNT(CASE WHEN is_active THEN 1 END) as active FROM clients WHERE firm_id = $1
          `, [firmId]),
          // Invoice stats
          query(`
            SELECT 
              COALESCE(SUM(total), 0) as total_invoiced,
              COALESCE(SUM(amount_paid), 0) as total_collected,
              COALESCE(SUM(CASE WHEN status = 'overdue' THEN amount_due ELSE 0 END), 0) as overdue,
              COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue_count
            FROM invoices WHERE firm_id = $1
          `, [firmId]),
          // Monthly trends (last 6 months)
          query(`
            SELECT 
              DATE_TRUNC('month', date) as month,
              COALESCE(SUM(hours), 0) as hours,
              COALESCE(SUM(amount), 0) as revenue
            FROM time_entries 
            WHERE firm_id = $1 AND date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '5 months')
            GROUP BY DATE_TRUNC('month', date)
            ORDER BY month
          `, [firmId]),
        ]);

        const revenue = revenueRes.rows[0];
        const hours = hoursRes.rows[0];
        const team = teamRes.rows;
        const matterStats = mattersRes.rows.reduce((acc, r) => ({ ...acc, [r.status]: parseInt(r.count) }), {});
        const clients = clientsRes.rows[0];
        const invoices = invoicesRes.rows[0];
        const trends = trendsRes.rows;

        const revenueGrowth = parseFloat(revenue.last_month) > 0 
          ? (((parseFloat(revenue.this_month) - parseFloat(revenue.last_month)) / parseFloat(revenue.last_month)) * 100).toFixed(1)
          : 'N/A';
        const utilizationRate = parseFloat(hours.total_hours) > 0 
          ? ((parseFloat(hours.billable_hours) / parseFloat(hours.total_hours)) * 100).toFixed(1)
          : '0';

        context = `
[CURRENT PAGE: Firm Analytics]

FIRM-WIDE REVENUE ANALYTICS:
- This Month's Revenue: $${parseFloat(revenue.this_month).toLocaleString()}
- Last Month's Revenue: $${parseFloat(revenue.last_month).toLocaleString()}
- Month-over-Month Growth: ${revenueGrowth}%
- Total Invoiced (All Time): $${parseFloat(invoices.total_invoiced).toLocaleString()}
- Total Collected: $${parseFloat(invoices.total_collected).toLocaleString()}
- Collection Rate: ${parseFloat(invoices.total_invoiced) > 0 ? ((parseFloat(invoices.total_collected) / parseFloat(invoices.total_invoiced)) * 100).toFixed(1) : 0}%

HOURS ANALYTICS (This Month):
- Total Hours: ${parseFloat(hours.total_hours).toFixed(1)}
- Billable Hours: ${parseFloat(hours.billable_hours).toFixed(1)}
- Billed Hours: ${parseFloat(hours.billed_hours).toFixed(1)}
- Utilization Rate: ${utilizationRate}%

ACCOUNTS RECEIVABLE:
- Overdue Amount: $${parseFloat(invoices.overdue).toLocaleString()}
- Overdue Invoices: ${invoices.overdue_count}

MATTER STATUS BREAKDOWN:
${Object.entries(matterStats).map(([status, count]) => `- ${status}: ${count}`).join('\n')}
- Total Matters: ${Object.values(matterStats).reduce((a, b) => a + b, 0)}

CLIENT STATISTICS:
- Total Clients: ${clients.total}
- Active Clients: ${clients.active}

TEAM PRODUCTIVITY (This Month):
${team.map((t, i) => `${i + 1}. ${t.first_name} ${t.last_name} (${t.role}): ${parseFloat(t.hours).toFixed(1)} hrs | $${parseFloat(t.revenue).toLocaleString()}`).join('\n')}

MONTHLY TRENDS (Last 6 Months):
${trends.map(t => `- ${new Date(t.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}: ${parseFloat(t.hours).toFixed(1)} hrs | $${parseFloat(t.revenue).toLocaleString()}`).join('\n')}
`;
        break;
      }

      case 'ai-assistant': {
        // Full AI Studio page - provide comprehensive firm context
        const [mattersRes, clientsRes, timeRes, invoicesRes, eventsRes, docsRes] = await Promise.all([
          query(`
            SELECT m.*, c.display_name as client_name
            FROM matters m
            LEFT JOIN clients c ON m.client_id = c.id
            WHERE m.firm_id = $1 AND m.status = 'active'
            ORDER BY m.priority DESC, m.created_at DESC
            LIMIT 15
          `, [firmId]),
          query(`SELECT id, display_name, type, email, is_active FROM clients WHERE firm_id = $1 ORDER BY created_at DESC LIMIT 15`, [firmId]),
          query(`
            SELECT te.*, m.name as matter_name
            FROM time_entries te
            LEFT JOIN matters m ON te.matter_id = m.id
            WHERE te.firm_id = $1 AND te.date >= CURRENT_DATE - INTERVAL '14 days'
            ORDER BY te.date DESC
            LIMIT 20
          `, [firmId]),
          query(`SELECT number, status, total, amount_due, due_date FROM invoices WHERE firm_id = $1 ORDER BY created_at DESC LIMIT 15`, [firmId]),
          query(`
            SELECT title, start_time, type, location 
            FROM calendar_events 
            WHERE firm_id = $1 AND start_time >= NOW() - INTERVAL '7 days'
            ORDER BY start_time
            LIMIT 20
          `, [firmId]),
          query(`SELECT name, type, created_at FROM documents WHERE firm_id = $1 ORDER BY created_at DESC LIMIT 10`, [firmId]),
        ]);

        const activeMatters = mattersRes.rows;
        const clients = clientsRes.rows;
        const recentTime = timeRes.rows;
        const invoices = invoicesRes.rows;
        const events = eventsRes.rows;
        const docs = docsRes.rows;

        const outstandingInvoices = invoices.filter(i => i.status === 'sent' || i.status === 'overdue');
        const totalOutstanding = outstandingInvoices.reduce((sum, i) => sum + parseFloat(i.amount_due || 0), 0);

        context = `
[CURRENT PAGE: AI Assistant - Full Context Mode]

You are the AI Assistant for this law firm. You have comprehensive access to their data.

ACTIVE MATTERS (${activeMatters.length}):
${activeMatters.map(m => `- ${m.name} (${m.number}) | Client: ${m.client_name || 'None'} | Status: ${m.status} | Priority: ${m.priority} | Type: ${m.type}`).join('\n') || 'No active matters'}

CLIENTS (${clients.length}):
${clients.map(c => `- ${c.display_name} (${c.type}) - ${c.is_active ? 'Active' : 'Inactive'}`).join('\n') || 'No clients'}

RECENT TIME ENTRIES (last 2 weeks):
${recentTime.map(t => `- ${new Date(t.date).toLocaleDateString()}: ${t.hours}hrs on ${t.matter_name || 'Unknown'} - ${t.description?.substring(0, 50) || 'No description'}`).join('\n') || 'No recent time entries'}

INVOICES:
- Outstanding: $${totalOutstanding.toLocaleString()} across ${outstandingInvoices.length} invoices
${invoices.slice(0, 5).map(i => `- ${i.number}: $${parseFloat(i.total).toLocaleString()} - ${i.status}`).join('\n')}

CALENDAR (recent & upcoming):
${events.map(e => `- ${new Date(e.start_time).toLocaleDateString()} ${new Date(e.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}: ${e.title} (${e.type})`).join('\n') || 'No events'}

RECENT DOCUMENTS:
${docs.map(d => `- ${d.name} (${d.type || 'unknown'})`).join('\n') || 'No documents'}

You can help with:
- Legal research and case analysis
- Document drafting and review
- Matter management and strategy
- Billing insights and time tracking
- Calendar and deadline management
- Any questions about the firm's data shown above
`;
        break;
      }

      default:
        context = `[CURRENT PAGE: ${page}]\nGeneral firm context - user is browsing the application.`;
    }
  } catch (error) {
    console.error('Error building context:', error);
    console.error('Error details:', error.message);
    context = `[CURRENT PAGE: ${page}]\nNote: Some data may be unavailable. Error: ${error.message}`;
  }

  // If no context was built, provide a generic one
  if (!context || context.trim() === '') {
    context = `[CURRENT PAGE: ${page}]\nNo specific data available for this page. The user may need to create some data first.`;
  }

  console.log('Built context length:', context.length);
  return context;
}

// Chat endpoint
router.post('/chat', authenticate, async (req, res) => {
  try {
    const { message, page = 'general', context: additionalContext = {}, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!AZURE_ENDPOINT || !AZURE_API_KEY || !AZURE_DEPLOYMENT) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    // Build context for current page
    const pageContext = await buildContext(page, req.user.firmId, req.user.id, additionalContext);

    // Build messages array
    const messages = [
      {
        role: 'system',
        content: `${SYSTEM_PROMPT}\n\n${pageContext}`,
      },
      // Include conversation history (last 10 messages)
      ...conversationHistory.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: 'user',
        content: message,
      },
    ];

    // Call Azure OpenAI
    const response = await callAzureOpenAI(messages);

    // Log AI usage (optional - for analytics)
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, details)
       VALUES ($1, $2, 'ai.chat', 'ai', $3)`,
      [req.user.firmId, req.user.id, JSON.stringify({ page, messageLength: message.length })]
    ).catch(() => {}); // Don't fail if logging fails

    res.json({
      response,
      page,
    });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ error: 'Failed to get AI response' });
  }
});

// Quick actions endpoint - for suggested prompts
router.get('/suggestions', authenticate, async (req, res) => {
  const { page } = req.query;

  const suggestions = {
    dashboard: [
      "What should I prioritize today based on deadlines and urgency?",
      "Give me a quick summary of my firm's performance this week",
      "What urgent matters need my attention right now?",
      "How's my billing looking this month compared to last month?",
      "Are there any overdue invoices I should follow up on?",
    ],
    matters: [
      "Which matters are at risk of missing deadlines?",
      "Analyze my matter workload - am I overcommitted?",
      "Which matters haven't had activity in the last 2 weeks?",
      "What's the total value of my active matters?",
      "Help me prioritize my matters for this week",
    ],
    'matter-detail': [
      "Give me a complete summary of this matter",
      "What's the billing status and remaining budget?",
      "What are the recommended next steps?",
      "Draft a status update email for the client",
      "Are there any red flags or concerns with this matter?",
    ],
    clients: [
      "Which clients have overdue invoices I should follow up on?",
      "Who are my top 5 clients by revenue this year?",
      "Which clients haven't had any matters in 6+ months?",
      "Analyze client payment patterns - who pays late?",
      "Which clients might benefit from additional services?",
    ],
    'client-detail': [
      "Give me a complete overview of this client relationship",
      "What's the payment history for this client?",
      "Summarize all active matters for this client",
      "Are there any billing concerns with this client?",
      "What services could we offer this client?",
    ],
    billing: [
      "What's overdue and needs immediate attention?",
      "Which invoices should I follow up on this week?",
      "Show me unbilled time I should invoice",
      "Project my revenue for this month",
      "Analyze my collection rate - how can I improve?",
      "Which clients have outstanding balances over 30 days?",
    ],
    calendar: [
      "What's on my schedule today?",
      "Are there any scheduling conflicts this week?",
      "What important deadlines are coming up?",
      "When is my next court date or deadline?",
      "Help me find time for a 2-hour meeting this week",
      "What meetings can I prepare for?",
    ],
    'time-tracking': [
      "How many billable hours have I logged this week?",
      "What's my utilization rate this month?",
      "What time should I have billed but might have missed?",
      "Compare my hours to last week",
      "Which matters have I spent the most time on?",
      "Any time entries I should review or correct?",
    ],
    documents: [
      "What are the most recent documents uploaded?",
      "Which matters have documents pending review?",
      "Find documents related to a specific topic",
      "Summarize the key documents for my active matters",
      "Are there any documents missing from important matters?",
    ],
    team: [
      "How is my team performing this month?",
      "Who has the highest billable hours this week?",
      "Which team members have capacity for new matters?",
      "Compare team productivity across the firm",
      "Are there any staffing concerns I should know about?",
    ],
    analytics: [
      "Give me an executive summary of firm performance",
      "What are the key trends in our revenue?",
      "How does this month compare to last month?",
      "Which practice areas are most profitable?",
      "What improvements should we focus on?",
      "Analyze our client retention rate",
    ],
    reports: [
      "What reports should I review this week?",
      "Summarize our key performance metrics",
      "What trends should I be aware of?",
      "How are we tracking against our goals?",
      "What operational improvements could we make?",
    ],
    'ai-assistant': [
      "What should I focus on today?",
      "Give me a full status report on my practice",
      "Help me prepare for my meetings today",
      "What's the most important thing I should know right now?",
      "Analyze my workload and suggest optimizations",
      "Draft a weekly summary for my practice",
    ],
  };

  res.json({
    suggestions: suggestions[page] || [
      "How can I assist you today?",
      "What would you like to know about your practice?",
      "Ask me anything about your matters, clients, or billing",
    ],
  });
});

export default router;
