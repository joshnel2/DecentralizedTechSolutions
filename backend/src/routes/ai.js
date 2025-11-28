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
        const [entriesRes, summaryRes] = await Promise.all([
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
        ]);

        const summary = summaryRes.rows[0];

        context = `
[CURRENT PAGE: Time Tracking]

THIS MONTH'S SUMMARY:
- Total Hours: ${parseFloat(summary?.total_hours || 0).toFixed(1)}
- Billable Hours: ${parseFloat(summary?.billable_hours || 0).toFixed(1)}
- Total Value: $${parseFloat(summary?.total_amount || 0).toLocaleString()}
- Billed: $${parseFloat(summary?.billed_amount || 0).toLocaleString()}

RECENT TIME ENTRIES:
${entriesRes.rows.map(e => `- ${new Date(e.date).toLocaleDateString()} | ${e.hours}hrs | $${parseFloat(e.amount || 0).toLocaleString()}
  ${e.matter_name || 'No matter'} | ${e.user_name}
  ${e.description}`).join('\n\n')}
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

      default:
        context = `[CURRENT PAGE: ${page}]\nGeneral firm context - user is browsing the application.`;
    }
  } catch (error) {
    console.error('Error building context:', error);
    context = `[CURRENT PAGE: ${page}]\nContext unavailable due to an error.`;
  }

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
    ],
  };

  res.json({
    suggestions: suggestions[page] || [
      "How can I help you today?",
      "What would you like to know?",
    ],
  });
});

export default router;
