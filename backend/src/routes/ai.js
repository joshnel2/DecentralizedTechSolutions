import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import {
  DEFAULT_TIMEZONE,
  getTodayInTimezone,
  getDatePartsInTimezone,
  formatDate,
  formatTime,
  formatDateTime,
  formatMonthYear
} from '../utils/dateUtils.js';
import { getMemoryForPrompt } from '../services/userAIMemory.js';

const router = Router();

// Azure OpenAI configuration
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
const API_VERSION = '2024-02-15-preview';

// System prompt for the AI - now a function to include current date context
function getSystemPrompt() {
  const todayStr = getTodayInTimezone(DEFAULT_TIMEZONE);
  const dateParts = getDatePartsInTimezone(new Date(), DEFAULT_TIMEZONE);
  const currentYear = dateParts.year;
  
  return `You are an intelligent AI assistant for a law firm management platform called Apex Legal. Today is ${todayStr} (${currentYear}). You have access to the firm's data shown in the context below.

RULES:
1. If the question relates to the firm data provided, use it to give specific, accurate answers
2. If the question is general or unrelated to the firm data, answer helpfully like a knowledgeable legal assistant
3. Never say "based on the context provided" or "according to the data" - just answer naturally as if you know this information
4. Be concise, professional, and helpful
5. You can reference specific matters, clients, dates, amounts, and team members from the data
6. For legal questions, provide general guidance but remind users to verify with applicable law
7. When suggesting priorities or tasks, be specific and actionable
8. Format responses nicely with bullet points or numbered lists when appropriate
9. When referencing dates, deadlines, or timeframes, always use the current date (${todayStr}) as your reference point

You are speaking directly to a law firm professional. Be their intelligent assistant.`;
}

// Helper to call Azure OpenAI
async function callAzureOpenAI(messages, options = {}) {
  const url = `${AZURE_ENDPOINT}openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': AZURE_API_KEY,
    },
    body: JSON.stringify({
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 2000,
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

// Helper to call Azure OpenAI with vision (for image analysis)
async function callAzureOpenAIVision(messages, imageData) {
  // For vision requests, we need to use a vision-capable model
  // Azure OpenAI GPT-4 Vision uses a different message format
  const visionDeployment = process.env.AZURE_OPENAI_VISION_DEPLOYMENT || AZURE_DEPLOYMENT;
  const url = `${AZURE_ENDPOINT}openai/deployments/${visionDeployment}/chat/completions?api-version=${API_VERSION}`;
  
  // Convert the last user message to include the image
  const messagesWithImage = messages.map((msg, index) => {
    if (index === messages.length - 1 && msg.role === 'user') {
      // Convert user message to include image
      return {
        role: 'user',
        content: [
          {
            type: 'text',
            text: msg.content
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${imageData.mimeType};base64,${imageData.base64}`,
              detail: 'high'
            }
          }
        ]
      };
    }
    return msg;
  });
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': AZURE_API_KEY,
    },
    body: JSON.stringify({
      messages: messagesWithImage,
      temperature: 0.7,
      max_tokens: 4000,
      top_p: 0.95,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Azure OpenAI Vision error:', error);
    throw new Error(`Azure OpenAI Vision API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Build context based on page and fetch relevant data
// Security: userRole is used to filter data for non-admin users
async function buildContext(page, firmId, userId, userRole = 'staff', additionalContext = {}) {
  let context = '';
  const isAdmin = ['owner', 'admin', 'billing'].includes(userRole);
  
  console.log(`Building AI context for page: ${page}, firm: ${firmId}, user: ${userId}, role: ${userRole}, isAdmin: ${isAdmin}`);
  
  try {
    switch (page) {
      case 'dashboard': {
        // Get summary stats - filtered by user permissions for non-admins
        const matterAccessFilter = isAdmin ? '' : `AND (m.visibility = 'firm_wide' OR m.responsible_attorney = '${userId}' OR m.originating_attorney = '${userId}' OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = '${userId}'))`;
        const [mattersRes, clientsRes, timeRes, invoicesRes, eventsRes] = await Promise.all([
          isAdmin
            ? query(`SELECT status, COUNT(*) as count FROM matters WHERE firm_id = $1 GROUP BY status`, [firmId])
            : query(`SELECT status, COUNT(*) as count FROM matters m WHERE m.firm_id = $1 ${matterAccessFilter} GROUP BY status`, [firmId]),
          query(`SELECT COUNT(*) as count FROM clients WHERE firm_id = $1 AND is_active = true`, [firmId]),
          isAdmin
            ? query(`SELECT SUM(hours) as total_hours, SUM(amount) as total_amount FROM time_entries WHERE firm_id = $1 AND date >= DATE_TRUNC('month', CURRENT_DATE)`, [firmId])
            : query(`SELECT SUM(hours) as total_hours, SUM(amount) as total_amount FROM time_entries WHERE firm_id = $1 AND user_id = $2 AND date >= DATE_TRUNC('month', CURRENT_DATE)`, [firmId, userId]),
          isAdmin
            ? query(`SELECT status, COUNT(*) as count, SUM(total) as total, SUM(amount_due) as due FROM invoices WHERE firm_id = $1 GROUP BY status`, [firmId])
            : query(`SELECT status, COUNT(*) as count, SUM(total) as total, SUM(amount_due) as due FROM invoices WHERE firm_id = $1 AND (created_by = $2 OR EXISTS (SELECT 1 FROM matters m2 WHERE m2.id = matter_id AND (m2.responsible_attorney = $2 OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m2.id AND ma.user_id = $2)))) GROUP BY status`, [firmId, userId]),
          isAdmin
            ? query(`SELECT title, start_time, type, location FROM calendar_events WHERE firm_id = $1 AND start_time >= NOW() AND start_time < NOW() + INTERVAL '7 days' ORDER BY start_time LIMIT 10`, [firmId])
            : query(`SELECT title, start_time, type, location FROM calendar_events WHERE firm_id = $1 AND (created_by = $2 OR is_private = false) AND start_time >= NOW() AND start_time < NOW() + INTERVAL '7 days' ORDER BY start_time LIMIT 10`, [firmId, userId]),
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
${eventsRes.rows.map(e => `- ${formatDateTime(e.start_time)}: ${e.title} (${e.type})${e.location ? ` at ${e.location}` : ''}`).join('\n') || 'No upcoming events'}
`;
        
        // Get urgent matters - filtered by permissions for non-admins
        const urgentMatters = isAdmin
          ? await query(`
              SELECT m.name, m.number, m.priority, c.display_name as client_name
              FROM matters m LEFT JOIN clients c ON m.client_id = c.id
              WHERE m.firm_id = $1 AND m.status = 'active' AND m.priority IN ('high', 'urgent')
              ORDER BY CASE m.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 END LIMIT 5
            `, [firmId])
          : await query(`
              SELECT m.name, m.number, m.priority, c.display_name as client_name
              FROM matters m LEFT JOIN clients c ON m.client_id = c.id
              WHERE m.firm_id = $1 AND m.status = 'active' AND m.priority IN ('high', 'urgent')
                AND (m.visibility = 'firm_wide' OR m.responsible_attorney = $2 OR m.originating_attorney = $2
                     OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $2))
              ORDER BY CASE m.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 END LIMIT 5
            `, [firmId, userId]);
        
        if (urgentMatters.rows.length > 0) {
          context += `
URGENT/HIGH PRIORITY MATTERS:
${urgentMatters.rows.map(m => `- ${m.name} (${m.number}) - ${m.client_name || 'No client'} - ${m.priority.toUpperCase()}`).join('\n')}
`;
        }
        break;
      }

      case 'matters': {
        // Security: filter matters by user permissions for non-admins
        const matters = isAdmin
          ? await query(`
              SELECT m.*, c.display_name as client_name, u.first_name || ' ' || u.last_name as attorney_name
              FROM matters m LEFT JOIN clients c ON m.client_id = c.id LEFT JOIN users u ON m.responsible_attorney = u.id
              WHERE m.firm_id = $1 ORDER BY m.created_at DESC LIMIT 20
            `, [firmId])
          : await query(`
              SELECT m.*, c.display_name as client_name, u.first_name || ' ' || u.last_name as attorney_name
              FROM matters m LEFT JOIN clients c ON m.client_id = c.id LEFT JOIN users u ON m.responsible_attorney = u.id
              WHERE m.firm_id = $1 AND (m.visibility = 'firm_wide' OR m.responsible_attorney = $2 OR m.originating_attorney = $2
                OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $2)
                OR EXISTS (SELECT 1 FROM matter_permissions mp WHERE mp.matter_id = m.id AND mp.user_id = $2))
              ORDER BY m.created_at DESC LIMIT 20
            `, [firmId, userId]);

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
          query(`SELECT name, type, uploaded_at FROM documents WHERE matter_id = $1 LIMIT 10`, [additionalContext.matterId]),
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
Opened: ${m.open_date ? formatDate(m.open_date) : 'Unknown'}
${m.description ? `Description: ${m.description}` : ''}

BILLING SUMMARY:
- Total Hours: ${totalHours.toFixed(1)}
- Total Billed: $${totalBilled.toLocaleString()}

RECENT TIME ENTRIES:
${timeRes.rows.map(t => `- ${formatDate(t.date)}: ${t.hours}hrs - ${t.description} (${t.user_name})`).join('\n') || 'No time entries'}

DOCUMENTS (${docsRes.rows.length}):
${docsRes.rows.map(d => `- ${d.original_name || d.name} (${d.type})`).join('\n') || 'No documents'}

UPCOMING EVENTS:
${eventsRes.rows.map(e => `- ${formatDateTime(e.start_time)}: ${e.title} (${e.type})`).join('\n') || 'No upcoming events'}
`;
        break;
      }

      case 'clients': {
        // Security: filter clients by user access for non-admins
        const clients = isAdmin
          ? await query(`
              SELECT c.*, 
                     (SELECT COUNT(*) FROM matters WHERE client_id = c.id) as matter_count,
                     (SELECT COALESCE(SUM(total), 0) FROM invoices WHERE client_id = c.id) as total_billed
              FROM clients c WHERE c.firm_id = $1 ORDER BY c.created_at DESC LIMIT 20
            `, [firmId])
          : await query(`
              SELECT c.*, 
                     (SELECT COUNT(*) FROM matters WHERE client_id = c.id) as matter_count,
                     (SELECT COALESCE(SUM(total), 0) FROM invoices WHERE client_id = c.id) as total_billed
              FROM clients c WHERE c.firm_id = $1 AND (
                c.created_by = $2
                OR EXISTS (SELECT 1 FROM matters m2 WHERE m2.client_id = c.id AND (
                  m2.responsible_attorney = $2 OR m2.originating_attorney = $2
                  OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m2.id AND ma.user_id = $2)
                ))
              ) ORDER BY c.created_at DESC LIMIT 20
            `, [firmId, userId]);

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
        // Security: filter billing data by user access for non-admins
        const userInvoiceFilter = isAdmin ? '' : `AND (i.created_by = '${userId}' OR EXISTS (SELECT 1 FROM matters m2 WHERE m2.id = i.matter_id AND (m2.responsible_attorney = '${userId}' OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m2.id AND ma.user_id = '${userId}'))))`;
        const [invoicesRes, unbilledRes, arRes] = await Promise.all([
          isAdmin
            ? query(`SELECT i.*, c.display_name as client_name FROM invoices i LEFT JOIN clients c ON i.client_id = c.id WHERE i.firm_id = $1 ORDER BY i.created_at DESC LIMIT 20`, [firmId])
            : query(`SELECT i.*, c.display_name as client_name FROM invoices i LEFT JOIN clients c ON i.client_id = c.id WHERE i.firm_id = $1 AND (i.created_by = $2 OR EXISTS (SELECT 1 FROM matters m2 WHERE m2.id = i.matter_id AND (m2.responsible_attorney = $2 OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m2.id AND ma.user_id = $2)))) ORDER BY i.created_at DESC LIMIT 20`, [firmId, userId]),
          isAdmin
            ? query(`SELECT SUM(amount) as total, SUM(hours) as hours FROM time_entries WHERE firm_id = $1 AND billable = true AND billed = false`, [firmId])
            : query(`SELECT SUM(amount) as total, SUM(hours) as hours FROM time_entries WHERE firm_id = $1 AND user_id = $2 AND billable = true AND billed = false`, [firmId, userId]),
          isAdmin
            ? query(`SELECT SUM(CASE WHEN status = 'sent' AND due_date >= CURRENT_DATE THEN amount_due ELSE 0 END) as current, SUM(CASE WHEN status = 'overdue' OR (status = 'sent' AND due_date < CURRENT_DATE) THEN amount_due ELSE 0 END) as overdue FROM invoices WHERE firm_id = $1`, [firmId])
            : query(`SELECT SUM(CASE WHEN status = 'sent' AND due_date >= CURRENT_DATE THEN amount_due ELSE 0 END) as current, SUM(CASE WHEN status = 'overdue' OR (status = 'sent' AND due_date < CURRENT_DATE) THEN amount_due ELSE 0 END) as overdue FROM invoices i WHERE i.firm_id = $1 AND (i.created_by = $2 OR EXISTS (SELECT 1 FROM matters m2 WHERE m2.id = i.matter_id AND (m2.responsible_attorney = $2 OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m2.id AND ma.user_id = $2))))`, [firmId, userId]),
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
${invoicesRes.rows.map(i => `- ${i.number} | ${i.client_name || 'Unknown'} | $${parseFloat(i.total).toLocaleString()} | ${i.status}${i.status !== 'paid' ? ` | Due: ${formatDate(i.due_date)}` : ''}`).join('\n')}
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
  return `- ${isPast ? '[PAST] ' : ''}${formatDateTime(e.start_time)}
  ${e.title} (${e.type})
  ${e.matter_name ? `Matter: ${e.matter_name}` : ''}${e.location ? ` | Location: ${e.location}` : ''}`;
}).join('\n\n') || 'No events scheduled'}
`;
        break;
      }

      case 'time-tracking': {
        // Security: non-admins only see their own time entries and accessible matters
        const [entriesRes, summaryRes, mattersRes, eventsRes] = await Promise.all([
          isAdmin
            ? query(`SELECT te.*, m.name as matter_name, u.first_name || ' ' || u.last_name as user_name FROM time_entries te LEFT JOIN matters m ON te.matter_id = m.id LEFT JOIN users u ON te.user_id = u.id WHERE te.firm_id = $1 ORDER BY te.date DESC, te.created_at DESC LIMIT 20`, [firmId])
            : query(`SELECT te.*, m.name as matter_name, u.first_name || ' ' || u.last_name as user_name FROM time_entries te LEFT JOIN matters m ON te.matter_id = m.id LEFT JOIN users u ON te.user_id = u.id WHERE te.firm_id = $1 AND te.user_id = $2 ORDER BY te.date DESC, te.created_at DESC LIMIT 20`, [firmId, userId]),
          isAdmin
            ? query(`SELECT SUM(hours) as total_hours, SUM(amount) as total_amount, SUM(CASE WHEN billable THEN hours ELSE 0 END) as billable_hours, SUM(CASE WHEN billed THEN amount ELSE 0 END) as billed_amount FROM time_entries WHERE firm_id = $1 AND date >= DATE_TRUNC('month', CURRENT_DATE)`, [firmId])
            : query(`SELECT SUM(hours) as total_hours, SUM(amount) as total_amount, SUM(CASE WHEN billable THEN hours ELSE 0 END) as billable_hours, SUM(CASE WHEN billed THEN amount ELSE 0 END) as billed_amount FROM time_entries WHERE firm_id = $1 AND user_id = $2 AND date >= DATE_TRUNC('month', CURRENT_DATE)`, [firmId, userId]),
          isAdmin
            ? query(`SELECT m.id, m.name, m.number, m.billing_type, m.billing_rate, c.display_name as client_name FROM matters m LEFT JOIN clients c ON m.client_id = c.id WHERE m.firm_id = $1 AND m.status = 'active' ORDER BY m.created_at DESC LIMIT 15`, [firmId])
            : query(`SELECT m.id, m.name, m.number, m.billing_type, m.billing_rate, c.display_name as client_name FROM matters m LEFT JOIN clients c ON m.client_id = c.id WHERE m.firm_id = $1 AND m.status = 'active' AND (m.visibility = 'firm_wide' OR m.responsible_attorney = $2 OR m.originating_attorney = $2 OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $2)) ORDER BY m.created_at DESC LIMIT 15`, [firmId, userId]),
          isAdmin
            ? query(`SELECT e.title, e.start_time, e.end_time, e.type, m.name as matter_name FROM calendar_events e LEFT JOIN matters m ON e.matter_id = m.id WHERE e.firm_id = $1 AND e.start_time >= NOW() - INTERVAL '14 days' AND e.start_time <= NOW() + INTERVAL '7 days' ORDER BY e.start_time DESC LIMIT 20`, [firmId])
            : query(`SELECT e.title, e.start_time, e.end_time, e.type, m.name as matter_name FROM calendar_events e LEFT JOIN matters m ON e.matter_id = m.id WHERE e.firm_id = $1 AND (e.created_by = $2 OR e.is_private = false) AND e.start_time >= NOW() - INTERVAL '14 days' AND e.start_time <= NOW() + INTERVAL '7 days' ORDER BY e.start_time DESC LIMIT 20`, [firmId, userId]),
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
  return `- ${formatDateTime(e.start_time)}: ${e.title} (${e.type}) - ${duration}hrs${e.matter_name ? ` - Matter: ${e.matter_name}` : ''}`;
}).join('\n') : 'No recent calendar events found.'}

RECENT TIME ENTRIES:
${entriesRes.rows.length > 0 ? entriesRes.rows.map(e => `- ${formatDate(e.date)} | ${e.hours}hrs | $${parseFloat(e.amount || 0).toLocaleString()}
  ${e.matter_name || 'No matter'} | ${e.user_name}
  ${e.description}`).join('\n\n') : 'No recent time entries found.'}

SUGGESTION: Compare calendar events with time entries to identify work that may not have been logged yet.
`;
        break;
      }

      case 'documents': {
        // Security: non-admins only see documents they have access to
        const docs = isAdmin
          ? await query(`SELECT d.*, m.name as matter_name, c.display_name as client_name FROM documents d LEFT JOIN matters m ON d.matter_id = m.id LEFT JOIN clients c ON d.client_id = c.id WHERE d.firm_id = $1 ORDER BY d.uploaded_at DESC LIMIT 20`, [firmId])
          : await query(`SELECT d.*, m.name as matter_name, c.display_name as client_name FROM documents d LEFT JOIN matters m ON d.matter_id = m.id LEFT JOIN clients c ON d.client_id = c.id WHERE d.firm_id = $1 AND (d.uploaded_by = $2 OR d.owner_id = $2 OR d.privacy_level = 'firm' OR EXISTS (SELECT 1 FROM matters m2 WHERE m2.id = d.matter_id AND (m2.visibility = 'firm_wide' OR m2.responsible_attorney = $2 OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m2.id AND ma.user_id = $2)))) ORDER BY d.uploaded_at DESC LIMIT 20`, [firmId, userId]);

        context = `
[CURRENT PAGE: Documents]

RECENT DOCUMENTS:
${docs.rows.map(d => `- ${d.original_name || d.name} (${d.type || 'unknown type'})
  ${d.matter_name ? `Matter: ${d.matter_name}` : ''}${d.client_name ? ` | Client: ${d.client_name}` : ''}
  Uploaded: ${formatDate(d.uploaded_at)}`).join('\n\n') || 'No documents'}
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
        // Security: non-admins only see their own data in analytics context
        const [mattersRes, revenueRes, teamRes, clientsRes] = await Promise.all([
          isAdmin
            ? query(`SELECT status, COUNT(*) as count FROM matters WHERE firm_id = $1 GROUP BY status`, [firmId])
            : query(`SELECT status, COUNT(*) as count FROM matters m WHERE m.firm_id = $1 AND (m.visibility = 'firm_wide' OR m.responsible_attorney = $2 OR m.originating_attorney = $2 OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $2)) GROUP BY status`, [firmId, userId]),
          isAdmin
            ? query(`SELECT DATE_TRUNC('month', date) as month, SUM(hours) as hours, SUM(amount) as revenue FROM time_entries WHERE firm_id = $1 AND date >= NOW() - INTERVAL '6 months' GROUP BY DATE_TRUNC('month', date) ORDER BY month DESC`, [firmId])
            : query(`SELECT DATE_TRUNC('month', date) as month, SUM(hours) as hours, SUM(amount) as revenue FROM time_entries WHERE firm_id = $1 AND user_id = $2 AND date >= NOW() - INTERVAL '6 months' GROUP BY DATE_TRUNC('month', date) ORDER BY month DESC`, [firmId, userId]),
          isAdmin
            ? query(`SELECT u.first_name || ' ' || u.last_name as name, u.role, COALESCE(SUM(te.hours), 0) as total_hours, COALESCE(SUM(te.amount), 0) as total_revenue FROM users u LEFT JOIN time_entries te ON te.user_id = u.id AND te.date >= DATE_TRUNC('month', CURRENT_DATE) WHERE u.firm_id = $1 AND u.is_active = true GROUP BY u.id, u.first_name, u.last_name, u.role ORDER BY total_revenue DESC`, [firmId])
            : query(`SELECT u.first_name || ' ' || u.last_name as name, u.role, COALESCE(SUM(te.hours), 0) as total_hours, COALESCE(SUM(te.amount), 0) as total_revenue FROM users u LEFT JOIN time_entries te ON te.user_id = u.id AND te.date >= DATE_TRUNC('month', CURRENT_DATE) WHERE u.firm_id = $1 AND u.id = $2 GROUP BY u.id, u.first_name, u.last_name, u.role ORDER BY total_revenue DESC`, [firmId, userId]),
          isAdmin
            ? query(`SELECT c.display_name, COUNT(DISTINCT m.id) as matter_count, COALESCE(SUM(i.total), 0) as total_billed FROM clients c LEFT JOIN matters m ON m.client_id = c.id LEFT JOIN invoices i ON i.client_id = c.id WHERE c.firm_id = $1 GROUP BY c.id, c.display_name ORDER BY total_billed DESC LIMIT 10`, [firmId])
            : query(`SELECT c.display_name, COUNT(DISTINCT m.id) as matter_count, COALESCE(SUM(i.total), 0) as total_billed FROM clients c LEFT JOIN matters m ON m.client_id = c.id LEFT JOIN invoices i ON i.client_id = c.id WHERE c.firm_id = $1 AND (c.created_by = $2 OR EXISTS (SELECT 1 FROM matters m2 WHERE m2.client_id = c.id AND (m2.responsible_attorney = $2 OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m2.id AND ma.user_id = $2)))) GROUP BY c.id, c.display_name ORDER BY total_billed DESC LIMIT 10`, [firmId, userId]),
        ]);

        const matterStats = mattersRes.rows.reduce((acc, r) => ({ ...acc, [r.status]: parseInt(r.count) }), {});

        context = `
[CURRENT PAGE: Firm Analytics]

MATTER BREAKDOWN:
${Object.entries(matterStats).map(([status, count]) => `- ${status}: ${count}`).join('\n')}

MONTHLY REVENUE (Last 6 Months):
${revenueRes.rows.map(r => `- ${formatMonthYear(r.month)}: ${parseFloat(r.hours || 0).toFixed(1)} hrs / $${parseFloat(r.revenue || 0).toLocaleString()}`).join('\n') || 'No data'}

TEAM PERFORMANCE (This Month):
${teamRes.rows.map(t => `- ${t.name} (${t.role}): ${parseFloat(t.total_hours || 0).toFixed(1)} hrs / $${parseFloat(t.total_revenue || 0).toLocaleString()}`).join('\n')}

TOP CLIENTS BY REVENUE:
${clientsRes.rows.map(c => `- ${c.display_name}: ${c.matter_count} matters / $${parseFloat(c.total_billed || 0).toLocaleString()}`).join('\n') || 'No clients yet'}
`;
        break;
      }

      case 'ai-assistant':
      case 'general': {
        // Security: filter data by user permissions for non-admins
        const matterFilter = isAdmin ? '' : `AND (m.visibility = 'firm_wide' OR m.responsible_attorney = '${userId}' OR m.originating_attorney = '${userId}' OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = '${userId}'))`;
        const [userRes, mattersRes, clientsRes, urgentRes, upcomingRes, unbilledRes] = await Promise.all([
          query(`SELECT first_name, last_name, role FROM users WHERE id = $1`, [userId]),
          isAdmin
            ? query(`SELECT m.name, m.number, m.status, m.priority, c.display_name as client_name FROM matters m LEFT JOIN clients c ON m.client_id = c.id WHERE m.firm_id = $1 AND m.status = 'active' ORDER BY CASE m.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END LIMIT 10`, [firmId])
            : query(`SELECT m.name, m.number, m.status, m.priority, c.display_name as client_name FROM matters m LEFT JOIN clients c ON m.client_id = c.id WHERE m.firm_id = $1 AND m.status = 'active' AND (m.visibility = 'firm_wide' OR m.responsible_attorney = $2 OR m.originating_attorney = $2 OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $2)) ORDER BY CASE m.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END LIMIT 10`, [firmId, userId]),
          isAdmin
            ? query(`SELECT display_name, type FROM clients WHERE firm_id = $1 AND is_active = true LIMIT 10`, [firmId])
            : query(`SELECT c.display_name, c.type FROM clients c WHERE c.firm_id = $1 AND c.is_active = true AND (c.created_by = $2 OR EXISTS (SELECT 1 FROM matters m2 WHERE m2.client_id = c.id AND (m2.responsible_attorney = $2 OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m2.id AND ma.user_id = $2)))) LIMIT 10`, [firmId, userId]),
          isAdmin
            ? query(`SELECT m.name, m.number, m.priority FROM matters m WHERE m.firm_id = $1 AND m.status = 'active' AND m.priority IN ('urgent', 'high') LIMIT 5`, [firmId])
            : query(`SELECT m.name, m.number, m.priority FROM matters m WHERE m.firm_id = $1 AND m.status = 'active' AND m.priority IN ('urgent', 'high') AND (m.visibility = 'firm_wide' OR m.responsible_attorney = $2 OR m.originating_attorney = $2 OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $2)) LIMIT 5`, [firmId, userId]),
          isAdmin
            ? query(`SELECT title, start_time, type FROM calendar_events WHERE firm_id = $1 AND start_time >= NOW() AND start_time < NOW() + INTERVAL '7 days' ORDER BY start_time LIMIT 5`, [firmId])
            : query(`SELECT title, start_time, type FROM calendar_events WHERE firm_id = $1 AND (created_by = $2 OR is_private = false) AND start_time >= NOW() AND start_time < NOW() + INTERVAL '7 days' ORDER BY start_time LIMIT 5`, [firmId, userId]),
          isAdmin
            ? query(`SELECT SUM(hours) as hours, SUM(amount) as amount FROM time_entries WHERE firm_id = $1 AND billable = true AND billed = false`, [firmId])
            : query(`SELECT SUM(hours) as hours, SUM(amount) as amount FROM time_entries WHERE firm_id = $1 AND user_id = $2 AND billable = true AND billed = false`, [firmId, userId]),
        ]);

        const user = userRes.rows[0];
        const unbilled = unbilledRes.rows[0];

        context = `
[CURRENT PAGE: AI Assistant]

YOU: ${user?.first_name} ${user?.last_name} (${user?.role})

ACTIVE MATTERS (${mattersRes.rows.length}):
${mattersRes.rows.map(m => `- ${m.name} (${m.number}) - ${m.client_name || 'No client'} - ${m.priority}`).join('\n') || 'No active matters'}

CLIENTS (${clientsRes.rows.length}):
${clientsRes.rows.map(c => `- ${c.display_name} (${c.type})`).join('\n') || 'No clients'}

${urgentRes.rows.length > 0 ? `URGENT/HIGH PRIORITY:\n${urgentRes.rows.map(m => `- ${m.name} (${m.number}) - ${m.priority.toUpperCase()}`).join('\n')}` : ''}

UPCOMING (Next 7 Days):
${upcomingRes.rows.map(e => `- ${formatDateTime(e.start_time)}: ${e.title} (${e.type})`).join('\n') || 'Nothing scheduled'}

UNBILLED WORK: ${parseFloat(unbilled?.hours || 0).toFixed(1)} hrs ($${parseFloat(unbilled?.amount || 0).toLocaleString()})
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

    // Fetch user's custom AI instructions
    let userCustomInstructions = '';
    try {
      const userResult = await query(
        'SELECT ai_custom_instructions FROM users WHERE id = $1',
        [req.user.id]
      );
      if (userResult.rows.length > 0 && userResult.rows[0].ai_custom_instructions) {
        userCustomInstructions = userResult.rows[0].ai_custom_instructions;
      }
    } catch (err) {
      console.error('Error fetching user AI instructions:', err);
      // Continue without custom instructions if there's an error
    }

    // Fetch user's AI memory file (persistent learned context)
    let userMemoryContext = '';
    try {
      const memoryPrompt = await getMemoryForPrompt(req.user.id, req.user.firmId);
      if (memoryPrompt) {
        userMemoryContext = memoryPrompt;
      }
    } catch (err) {
      console.error('Error fetching user AI memory:', err);
      // Continue without memory context if there's an error
    }

    // Check if there's image data in the context (for vision analysis)
    const imageData = additionalContext?.imageData;
    const hasImage = imageData && imageData.base64 && imageData.mimeType;

    // Build context for current page (exclude imageData from context building)
    const contextWithoutImage = { ...additionalContext };
    delete contextWithoutImage.imageData;
    const pageContext = await buildContext(page, req.user.firmId, req.user.id, req.user.role, contextWithoutImage);

    // Build system prompt - adjust for image analysis if needed
    // Include user's custom instructions and memory file if they exist
    let systemPrompt = getSystemPrompt();
    
    if (userCustomInstructions) {
      systemPrompt = `${systemPrompt}

USER'S CUSTOM INSTRUCTIONS (follow these preferences when responding to this user):
${userCustomInstructions}`;
    }
    if (userMemoryContext) {
      systemPrompt = `${systemPrompt}
${userMemoryContext}`;
    }
    if (hasImage) {
      systemPrompt = `You are an intelligent AI assistant for a law firm management platform called Apex Legal. 

You have vision capabilities and can analyze images. When the user uploads an image:
1. Read and extract any text visible in the image (OCR)
2. Describe the contents accurately
3. Answer questions about what you see
4. Identify document types, forms, or structured content
5. Be thorough in extracting text - include all visible text

For legal documents, identify:
- Document type (contract, letter, pleading, etc.)
- Key parties mentioned
- Important dates
- Signatures or signature blocks
- Any notable terms or clauses visible

Be professional, accurate, and helpful.
${userCustomInstructions ? `
USER'S CUSTOM INSTRUCTIONS (follow these preferences when responding to this user):
${userCustomInstructions}
` : ''}
${userMemoryContext || ''}
${pageContext}`;
    }

    // Build messages array
    const messages = [
      {
        role: 'system',
        content: systemPrompt,
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

    // Call Azure OpenAI (with or without vision)
    let response;
    if (hasImage) {
      console.log('Processing image with vision API, mimeType:', imageData.mimeType);
      response = await callAzureOpenAIVision(messages, imageData);
    } else {
      response = await callAzureOpenAI(messages);
    }

    // Log AI usage (optional - for analytics)
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, details)
       VALUES ($1, $2, 'ai.chat', 'ai', $3)`,
      [req.user.firmId, req.user.id, JSON.stringify({ page, messageLength: message.length, hasImage })]
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
      "What should I prioritize today?",
      "Summarize my urgent matters",
      "What deadlines are coming up?",
      "How's my billing looking this month?",
    ],
    matters: [
      "Which matters need attention?",
      "Show me matters by priority",
      "What are my oldest open matters?",
      "Any matters missing time entries?",
    ],
    'matter-detail': [
      "Summarize this matter",
      "What's the billing status?",
      "What are the next steps?",
      "Draft a status update for the client",
    ],
    clients: [
      "Which clients have overdue invoices?",
      "Who are my most active clients?",
      "Any clients without recent activity?",
    ],
    billing: [
      "What's overdue?",
      "Which invoices need follow-up?",
      "Summarize unbilled time",
      "Project this month's revenue",
    ],
    calendar: [
      "What do I have today?",
      "Any scheduling conflicts?",
      "What's my week look like?",
      "When is my next court date?",
    ],
    'time-tracking': [
      "How many hours this week?",
      "What's my utilization rate?",
      "Any unbilled time I should invoice?",
      "Suggest time entries I might have missed",
    ],
    documents: [
      "What documents do I have?",
      "Show documents by matter",
      "Any documents uploaded this week?",
    ],
    team: [
      "Who's billing the most this month?",
      "Team workload summary",
      "Who has capacity for new matters?",
    ],
    analytics: [
      "How's the firm doing this month?",
      "Compare to last month",
      "Top performing matters",
      "Revenue trends",
    ],
    'ai-assistant': [
      "What should I focus on today?",
      "Give me a practice overview",
      "What needs my attention?",
      "Help me plan my week",
    ],
  };

  res.json({
    suggestions: suggestions[page] || [
      "How can I help you today?",
      "What would you like to know?",
    ],
  });
});

// ============================================
// LEARNING PATTERNS API
// ============================================
// These endpoints allow the Python background agent to access
// learned patterns from user interactions for personalized behavior

/**
 * GET /api/ai/learning-patterns
 * Fetch learning patterns for the background agent
 * 
 * HIERARCHICAL PRIVACY LEVELS:
 * - level=user: Private patterns for this user only
 * - level=firm: Shared patterns within the firm
 * - level=global: Anonymized patterns from all users (no identifying info)
 * 
 * The agent gets continuously smarter by learning from:
 * 1. User's personal patterns (private)
 * 2. Firm's collective patterns (shared within firm)
 * 3. Global anonymized patterns (everyone contributes, no privacy leak)
 */
router.get('/learning-patterns', authenticate, async (req, res) => {
  try {
    const { firmId, userId, patternType, category, minConfidence = 0.3, level = 'user' } = req.query;
    
    // Use authenticated user's firm if not specified
    const targetFirmId = firmId || req.user.firmId;
    const targetUserId = userId || req.user.id;
    
    let sql;
    let params;
    
    if (level === 'global') {
      // Global patterns: anonymized, no firm_id or user_id filter
      // These are patterns that work across all users (no identifying info stored)
      sql = `
        SELECT 
          id, pattern_type, pattern_category, pattern_data,
          confidence, occurrences, last_used_at, created_at
        FROM ai_learning_patterns
        WHERE level = 'global'
          AND confidence >= $1
      `;
      params = [parseFloat(minConfidence)];
      
    } else if (level === 'firm') {
      // Firm-wide patterns: shared within the firm
      sql = `
        SELECT 
          id, pattern_type, pattern_category, pattern_data,
          confidence, occurrences, last_used_at, created_at
        FROM ai_learning_patterns
        WHERE firm_id = $1
          AND (user_id IS NULL OR level = 'firm')
          AND confidence >= $2
      `;
      params = [targetFirmId, parseFloat(minConfidence)];
      
    } else {
      // User-specific patterns: private to this user
      sql = `
        SELECT 
          id, pattern_type, pattern_category, pattern_data,
          confidence, occurrences, last_used_at, created_at
        FROM ai_learning_patterns
        WHERE firm_id = $1
          AND user_id = $2
          AND (level = 'user' OR level IS NULL)
          AND confidence >= $3
      `;
      params = [targetFirmId, targetUserId, parseFloat(minConfidence)];
    }
    
    let paramIndex = params.length + 1;
    
    if (patternType) {
      sql += ` AND pattern_type = $${paramIndex}`;
      params.push(patternType);
      paramIndex++;
    }
    
    if (category) {
      sql += ` AND pattern_category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    
    sql += ` ORDER BY confidence DESC, occurrences DESC LIMIT 100`;
    
    const result = await query(sql, params);
    
    res.json({
      patterns: result.rows.map(p => ({
        id: p.id,
        pattern_type: p.pattern_type,
        pattern_category: p.pattern_category,
        pattern_data: p.pattern_data,
        confidence: parseFloat(p.confidence),
        occurrences: p.occurrences,
        last_used_at: p.last_used_at,
        created_at: p.created_at
      })),
      count: result.rows.length,
      level: level,
      firm_id: level !== 'global' ? targetFirmId : null,
      user_id: level === 'user' ? targetUserId : null
    });
    
  } catch (error) {
    console.error('Get learning patterns error:', error);
    res.status(500).json({ error: 'Failed to get learning patterns' });
  }
});

/**
 * POST /api/ai/learning-patterns
 * Save a new learning pattern from the background agent
 * 
 * PRIVACY LEVELS:
 * - level=user: Private to this user (default)
 * - level=firm: Shared within the firm
 * - level=global: Anonymized pattern for global learning (NO identifying info!)
 * 
 * For global patterns, the system automatically strips any identifying information
 * to ensure privacy while allowing collective improvement.
 */
router.post('/learning-patterns', authenticate, async (req, res) => {
  try {
    const { firmId, userId, patternType, category, patternData, level = 'user' } = req.body;
    
    if (!patternType || !patternData) {
      return res.status(400).json({ error: 'patternType and patternData are required' });
    }
    
    // For global patterns, ensure no identifying information
    let safePatternData = patternData;
    let targetFirmId = firmId || req.user.firmId;
    let targetUserId = userId || req.user.id;
    
    if (level === 'global') {
      // Strip identifying information for global patterns
      safePatternData = sanitizeForGlobalLearning(patternData);
      targetFirmId = null;  // Don't store firm ID for global patterns
      targetUserId = null;  // Don't store user ID for global patterns
    } else if (level === 'firm') {
      targetUserId = null;  // Firm patterns don't have a specific user
    }
    
    // Generate a key for the pattern
    const patternKey = safePatternData.key || `${patternType}:${level}:${JSON.stringify(safePatternData).substring(0, 50)}`;
    
    // Check if pattern already exists
    let existingQuery;
    let existingParams;
    
    if (level === 'global') {
      existingQuery = `
        SELECT id, occurrences, pattern_data 
        FROM ai_learning_patterns
        WHERE level = 'global' AND pattern_type = $1 AND pattern_data->>'key' = $2
      `;
      existingParams = [patternType, patternKey];
    } else {
      existingQuery = `
        SELECT id, occurrences, pattern_data 
        FROM ai_learning_patterns
        WHERE firm_id = $1 AND (user_id = $2 OR ($2 IS NULL AND user_id IS NULL))
          AND pattern_type = $3 AND pattern_data->>'key' = $4
      `;
      existingParams = [targetFirmId, targetUserId, patternType, patternKey];
    }
    
    const existing = await query(existingQuery, existingParams);
    
    if (existing.rows.length > 0) {
      // Update existing pattern - merge data and increase confidence
      const existingData = existing.rows[0].pattern_data;
      const mergedData = mergePatternData(existingData, safePatternData);
      
      await query(`
        UPDATE ai_learning_patterns 
        SET occurrences = occurrences + 1, 
            last_used_at = NOW(),
            pattern_data = $2::jsonb,
            confidence = LEAST(0.95, confidence + 0.02)
        WHERE id = $1
        RETURNING *
      `, [existing.rows[0].id, JSON.stringify(mergedData)]);
      
      res.json({ success: true, action: 'updated', id: existing.rows[0].id, level });
    } else {
      // Create new pattern
      const result = await query(`
        INSERT INTO ai_learning_patterns (firm_id, user_id, pattern_type, pattern_category, pattern_data, confidence, level)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        targetFirmId, 
        targetUserId, 
        patternType, 
        category || 'general', 
        JSON.stringify(safePatternData),
        level === 'global' ? 0.3 : 0.4,  // Global patterns start with lower confidence
        level
      ]);
      
      res.status(201).json({ success: true, action: 'created', id: result.rows[0].id, level });
    }
    
  } catch (error) {
    console.error('Save learning pattern error:', error);
    res.status(500).json({ error: 'Failed to save learning pattern' });
  }
});

/**
 * Sanitize pattern data for global learning (remove all identifying info)
 */
function sanitizeForGlobalLearning(data) {
  const sensitiveFields = [
    'client_name', 'client_id', 'matter_name', 'matter_id', 'firm_id', 'user_id',
    'party_name', 'user_name', 'attorney_name', 'firm_name', 'email', 'phone',
    'document_content', 'note_content', 'description', 'sample', 'sample_title',
    'sample_start', 'typical_description', 'billing_rate', 'amount', 'rate', 'address'
  ];
  
  const safeData = {};
  for (const [key, value] of Object.entries(data)) {
    // Skip sensitive fields
    if (sensitiveFields.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
      continue;
    }
    
    // Skip values that look like names or identifiers
    if (typeof value === 'string' && value.length > 3 && value.length < 50) {
      const words = value.trim().split(/\s+/);
      // Skip if looks like a name (2-3 capitalized words)
      if (words.length >= 2 && words.length <= 3 && words.every(w => /^[A-Z]/.test(w))) {
        continue;
      }
      // Skip if looks like an ID
      if (/^[0-9a-f-]{20,}$/i.test(value)) {
        continue;
      }
    }
    
    safeData[key] = value;
  }
  
  return safeData;
}

/**
 * Merge pattern data, averaging numeric fields
 */
function mergePatternData(existing, newData) {
  const merged = { ...existing };
  
  for (const [key, value] of Object.entries(newData)) {
    if (typeof value === 'number' && typeof existing[key] === 'number') {
      // Average numeric values
      merged[key] = (existing[key] + value) / 2;
    } else if (key !== 'key') {
      merged[key] = value;
    }
  }
  
  return merged;
}

/**
 * GET /api/ai/user-learning-summary
 * Get a summary of what has been learned about a user
 */
router.get('/user-learning-summary', authenticate, async (req, res) => {
  try {
    const { userId } = req.query;
    const targetUserId = userId || req.user.id;
    
    // Get pattern counts by category
    const categoryCounts = await query(`
      SELECT pattern_category, COUNT(*) as count, AVG(confidence) as avg_confidence
      FROM ai_learning_patterns
      WHERE firm_id = $1 AND (user_id = $2 OR user_id IS NULL)
      GROUP BY pattern_category
      ORDER BY count DESC
    `, [req.user.firmId, targetUserId]);
    
    // Get most used patterns
    const topPatterns = await query(`
      SELECT pattern_type, pattern_category, pattern_data, occurrences, confidence
      FROM ai_learning_patterns
      WHERE firm_id = $1 AND (user_id = $2 OR user_id IS NULL)
      ORDER BY occurrences DESC
      LIMIT 10
    `, [req.user.firmId, targetUserId]);
    
    // Get recent learning activity
    const recentActivity = await query(`
      SELECT pattern_type, pattern_category, created_at, last_used_at
      FROM ai_learning_patterns
      WHERE firm_id = $1 AND (user_id = $2 OR user_id IS NULL)
      ORDER BY COALESCE(last_used_at, created_at) DESC
      LIMIT 10
    `, [req.user.firmId, targetUserId]);
    
    res.json({
      user_id: targetUserId,
      categories: categoryCounts.rows.map(c => ({
        category: c.pattern_category,
        pattern_count: parseInt(c.count),
        avg_confidence: parseFloat(c.avg_confidence).toFixed(2)
      })),
      top_patterns: topPatterns.rows,
      recent_activity: recentActivity.rows,
      total_patterns: categoryCounts.rows.reduce((sum, c) => sum + parseInt(c.count), 0)
    });
    
  } catch (error) {
    console.error('Get user learning summary error:', error);
    res.status(500).json({ error: 'Failed to get learning summary' });
  }
});

/**
 * POST /api/ai/interactions
 * Record user interaction events for learning
 * 
 * The frontend sends batched interaction events (page views, feature usage,
 * searches, filter/sort actions) which are processed into patterns.
 * 
 * Raw events are NOT stored - they are aggregated into anonymous patterns
 * (page frequency, feature frequency, workflow sequences, etc.)
 * 
 * This allows the agent to understand HOW the user works with the software,
 * not just what they create through the AI.
 */
router.post('/interactions', authenticate, async (req, res) => {
  try {
    const { events } = req.body;
    
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'Events array is required' });
    }
    
    // Cap at 100 events per request to prevent abuse
    const cappedEvents = events.slice(0, 100);
    
    // Import interaction learning service
    const { recordInteraction } = await import('../services/interactionLearning.js');
    
    // Record each event (buffered in memory, not immediate DB writes)
    for (const event of cappedEvents) {
      // Validate event structure
      if (!event.type || typeof event.type !== 'string') continue;
      
      // Sanitize - strip any potentially sensitive data
      const sanitizedEvent = {
        type: event.type.substring(0, 50),
        category: (event.category || '').substring(0, 50),
        detail: (event.detail || '').substring(0, 100),
        metadata: event.metadata ? sanitizeMetadata(event.metadata) : undefined,
      };
      
      recordInteraction(req.user.firmId, req.user.id, sanitizedEvent);
    }
    
    res.json({ 
      success: true, 
      recorded: cappedEvents.length,
      message: 'Interactions recorded for learning'
    });
  } catch (error) {
    console.error('Record interactions error:', error);
    // Non-critical - don't fail with 500 for tracking
    res.json({ success: false, error: 'Failed to record interactions' });
  }
});

/**
 * GET /api/ai/interaction-profile
 * Get the user's interaction profile (for debugging/transparency)
 * Shows what the agent has learned about how the user works
 */
router.get('/interaction-profile', authenticate, async (req, res) => {
  try {
    const { getUserInteractionProfile } = await import('../services/interactionLearning.js');
    
    const profile = await getUserInteractionProfile(req.user.firmId, req.user.id);
    
    res.json({
      profile: profile || { message: 'No interaction data yet - the agent will learn as you use the software' },
      privacy: 'This data is private to you and is used to personalize the agent\'s behavior'
    });
  } catch (error) {
    console.error('Get interaction profile error:', error);
    res.status(500).json({ error: 'Failed to get interaction profile' });
  }
});

/**
 * Sanitize metadata to prevent storing sensitive information
 */
function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return undefined;
  
  const safe = {};
  const allowedKeys = ['page', 'section', 'action', 'count', 'duration', 'sortBy', 'filterBy', 'viewMode'];
  
  for (const key of allowedKeys) {
    if (metadata[key] !== undefined) {
      // Only allow short string values or numbers
      if (typeof metadata[key] === 'number') {
        safe[key] = metadata[key];
      } else if (typeof metadata[key] === 'string' && metadata[key].length <= 100) {
        safe[key] = metadata[key];
      }
    }
  }
  
  return Object.keys(safe).length > 0 ? safe : undefined;
}

export default router;
