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
const SYSTEM_PROMPT = `You are the AI assistant for a law firm using Apex Legal.

CRITICAL INSTRUCTIONS:
1. You MUST ONLY use the data provided below. Do NOT make up or hallucinate any information.
2. If you don't see specific data in the context below, say "I don't see that in your current data" - NEVER invent matters, clients, or numbers.
3. Only reference matters, clients, invoices, and events that are EXPLICITLY listed in the data below.
4. If asked about something not in the data, acknowledge you don't have that information.

HOW TO RESPOND:
- Use ONLY the real data provided in the context section below
- Quote actual matter names, client names, and amounts from the data
- If the data shows 0 matters or no clients, say so honestly
- Never guess or assume - only state what you can see in the provided data

The user's actual firm data is provided below. Use ONLY this data to answer questions.`;

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
      temperature: 0.1,  // Low temperature = less hallucination, more factual
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

// Build FULL context - the AI always knows everything about you
async function buildContext(page, firmId, userId, additionalContext = {}) {
  console.log(`Building FULL AI context for firm: ${firmId}, user: ${userId}, page: ${page}`);
  
  try {
    // Fetch ALL data the AI needs to be your complete personal assistant
    const [
      userRes,
      mattersRes, 
      clientsRes, 
      timeEntriesRes, 
      invoicesRes, 
      eventsRes, 
      docsRes,
      teamRes,
      urgentMattersRes,
      overdueInvoicesRes,
      unbilledRes,
      recentActivityRes
    ] = await Promise.all([
      // Current user info
      query(`SELECT first_name, last_name, email, role FROM users WHERE id = $1`, [userId]),
      // All active matters with details
      query(`
        SELECT m.*, c.display_name as client_name,
               u.first_name || ' ' || u.last_name as attorney_name,
               (SELECT COALESCE(SUM(hours), 0) FROM time_entries WHERE matter_id = m.id) as total_hours,
               (SELECT COALESCE(SUM(amount), 0) FROM time_entries WHERE matter_id = m.id AND billable = true) as total_billed
        FROM matters m
        LEFT JOIN clients c ON m.client_id = c.id
        LEFT JOIN users u ON m.responsible_attorney = u.id
        WHERE m.firm_id = $1
        ORDER BY 
          CASE m.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
          m.created_at DESC
        LIMIT 25
      `, [firmId]),
      // All clients
      query(`
        SELECT c.*, 
               (SELECT COUNT(*) FROM matters WHERE client_id = c.id) as matter_count,
               (SELECT COALESCE(SUM(total), 0) FROM invoices WHERE client_id = c.id) as total_billed,
               (SELECT COALESCE(SUM(amount_due), 0) FROM invoices WHERE client_id = c.id AND status IN ('sent', 'overdue')) as outstanding
        FROM clients c
        WHERE c.firm_id = $1
        ORDER BY c.created_at DESC
        LIMIT 25
      `, [firmId]),
      // Recent time entries (last 30 days)
      query(`
        SELECT te.*, m.name as matter_name, m.number as matter_number,
               u.first_name || ' ' || u.last_name as user_name
        FROM time_entries te
        LEFT JOIN matters m ON te.matter_id = m.id
        LEFT JOIN users u ON te.user_id = u.id
        WHERE te.firm_id = $1 AND te.date >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY te.date DESC, te.created_at DESC
        LIMIT 30
      `, [firmId]),
      // All invoices
      query(`
        SELECT i.*, c.display_name as client_name, m.name as matter_name
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        LEFT JOIN matters m ON i.matter_id = m.id
        WHERE i.firm_id = $1
        ORDER BY i.created_at DESC
        LIMIT 25
      `, [firmId]),
      // Calendar events (past week + next 2 weeks)
      query(`
        SELECT e.*, m.name as matter_name
        FROM calendar_events e
        LEFT JOIN matters m ON e.matter_id = m.id
        WHERE e.firm_id = $1 
          AND e.start_time >= NOW() - INTERVAL '7 days'
          AND e.start_time <= NOW() + INTERVAL '14 days'
        ORDER BY e.start_time
        LIMIT 30
      `, [firmId]),
      // Recent documents
      query(`
        SELECT d.*, m.name as matter_name, c.display_name as client_name
        FROM documents d
        LEFT JOIN matters m ON d.matter_id = m.id
        LEFT JOIN clients c ON d.client_id = c.id
        WHERE d.firm_id = $1
        ORDER BY d.created_at DESC
        LIMIT 20
      `, [firmId]),
      // Team members
      query(`
        SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.hourly_rate,
               (SELECT COUNT(*) FROM matters WHERE responsible_attorney = u.id AND status = 'active') as active_matters,
               (SELECT COALESCE(SUM(hours), 0) FROM time_entries WHERE user_id = u.id AND date >= DATE_TRUNC('month', CURRENT_DATE)) as monthly_hours
        FROM users u
        WHERE u.firm_id = $1 AND u.is_active = true
        ORDER BY u.role, u.first_name
      `, [firmId]),
      // Urgent/high priority matters
      query(`
        SELECT m.name, m.number, m.priority, m.status, c.display_name as client_name
        FROM matters m
        LEFT JOIN clients c ON m.client_id = c.id
        WHERE m.firm_id = $1 AND m.status = 'active' AND m.priority IN ('high', 'urgent')
        ORDER BY CASE m.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 END
      `, [firmId]),
      // Overdue invoices
      query(`
        SELECT i.number, i.total, i.amount_due, i.due_date, c.display_name as client_name
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        WHERE i.firm_id = $1 AND (i.status = 'overdue' OR (i.status = 'sent' AND i.due_date < CURRENT_DATE))
        ORDER BY i.due_date
      `, [firmId]),
      // Unbilled work summary
      query(`
        SELECT 
          COALESCE(SUM(hours), 0) as unbilled_hours,
          COALESCE(SUM(amount), 0) as unbilled_amount
        FROM time_entries
        WHERE firm_id = $1 AND billable = true AND billed = false
      `, [firmId]),
      // Recent activity for context
      query(`
        SELECT 'time_entry' as type, te.created_at, te.description as details, m.name as matter_name
        FROM time_entries te
        LEFT JOIN matters m ON te.matter_id = m.id
        WHERE te.firm_id = $1
        ORDER BY te.created_at DESC
        LIMIT 10
      `, [firmId])
    ]);

    const currentUser = userRes.rows[0];
    const matters = mattersRes.rows;
    const clients = clientsRes.rows;
    const timeEntries = timeEntriesRes.rows;
    const invoices = invoicesRes.rows;
    const events = eventsRes.rows;
    const documents = docsRes.rows;
    const team = teamRes.rows;
    const urgentMatters = urgentMattersRes.rows;
    const overdueInvoices = overdueInvoicesRes.rows;
    const unbilled = unbilledRes.rows[0];

    // Calculate key metrics
    const activeMatters = matters.filter(m => m.status === 'active');
    const activeClients = clients.filter(c => c.is_active);
    const thisMonthTime = timeEntries.filter(t => new Date(t.date) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const totalHoursThisMonth = thisMonthTime.reduce((sum, t) => sum + parseFloat(t.hours || 0), 0);
    const totalRevenueThisMonth = thisMonthTime.filter(t => t.billable).reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    const totalOutstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((sum, i) => sum + parseFloat(i.amount_due || 0), 0);
    const totalOverdue = overdueInvoices.reduce((sum, i) => sum + parseFloat(i.amount_due || 0), 0);

    // Upcoming events
    const upcomingEvents = events.filter(e => new Date(e.start_time) >= new Date());
    const todayEvents = upcomingEvents.filter(e => {
      const eventDate = new Date(e.start_time);
      const today = new Date();
      return eventDate.toDateString() === today.toDateString();
    });

    // Build comprehensive context
    let context = `
=== YOUR PERSONAL AI ASSISTANT ===
I have complete knowledge of your practice. Here's everything I know:

YOU: ${currentUser?.first_name} ${currentUser?.last_name} (${currentUser?.role})
CURRENT PAGE: ${page}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 PRACTICE OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Active Matters: ${activeMatters.length}
• Active Clients: ${activeClients.length}
• This Month's Hours: ${totalHoursThisMonth.toFixed(1)}h
• This Month's Revenue: $${totalRevenueThisMonth.toLocaleString()}
• Outstanding Invoices: $${totalOutstanding.toLocaleString()}
• Overdue Amount: $${totalOverdue.toLocaleString()}
• Unbilled Time: ${parseFloat(unbilled?.unbilled_hours || 0).toFixed(1)}h ($${parseFloat(unbilled?.unbilled_amount || 0).toLocaleString()})

`;

    // Urgent alerts
    if (urgentMatters.length > 0 || overdueInvoices.length > 0 || todayEvents.length > 0) {
      context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ NEEDS YOUR ATTENTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
      if (urgentMatters.length > 0) {
        context += `\nURGENT MATTERS:\n${urgentMatters.map(m => `• ${m.name} (${m.number}) - ${m.client_name || 'No client'} - ${m.priority.toUpperCase()}`).join('\n')}\n`;
      }
      if (overdueInvoices.length > 0) {
        context += `\nOVERDUE INVOICES:\n${overdueInvoices.map(i => `• ${i.number} - ${i.client_name} - $${parseFloat(i.amount_due).toLocaleString()} (due ${new Date(i.due_date).toLocaleDateString()})`).join('\n')}\n`;
      }
      if (todayEvents.length > 0) {
        context += `\nTODAY'S SCHEDULE:\n${todayEvents.map(e => `• ${new Date(e.start_time).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}: ${e.title} (${e.type})${e.matter_name ? ` - ${e.matter_name}` : ''}`).join('\n')}\n`;
      }
    }

    // Matters
    context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 MATTERS (${matters.length} total, ${activeMatters.length} active)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${matters.slice(0, 15).map(m => `• ${m.name} (${m.number})
  Client: ${m.client_name || 'None'} | Status: ${m.status} | Priority: ${m.priority}
  Type: ${m.type} | Hours: ${parseFloat(m.total_hours || 0).toFixed(1)}h | Billed: $${parseFloat(m.total_billed || 0).toLocaleString()}`).join('\n\n')}
`;

    // Clients
    context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 CLIENTS (${clients.length} total)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${clients.slice(0, 12).map(c => `• ${c.display_name} (${c.type})
  Matters: ${c.matter_count} | Total Billed: $${parseFloat(c.total_billed || 0).toLocaleString()} | Outstanding: $${parseFloat(c.outstanding || 0).toLocaleString()}`).join('\n')}
`;

    // Recent time entries
    context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱️ RECENT TIME ENTRIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${timeEntries.slice(0, 10).map(t => `• ${new Date(t.date).toLocaleDateString()} - ${t.hours}h - ${t.matter_name || 'No matter'}
  ${t.description || 'No description'} (${t.user_name})`).join('\n')}
`;

    // Invoices
    context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 INVOICES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${invoices.slice(0, 10).map(i => `• ${i.number} - ${i.client_name || 'Unknown'} - $${parseFloat(i.total).toLocaleString()} - ${i.status}${i.amount_due > 0 && i.status !== 'paid' ? ` ($${parseFloat(i.amount_due).toLocaleString()} due)` : ''}`).join('\n')}
`;

    // Calendar
    context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 UPCOMING SCHEDULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${upcomingEvents.slice(0, 10).map(e => `• ${new Date(e.start_time).toLocaleDateString()} ${new Date(e.start_time).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}: ${e.title}
  Type: ${e.type}${e.matter_name ? ` | Matter: ${e.matter_name}` : ''}${e.location ? ` | Location: ${e.location}` : ''}`).join('\n')}
`;

    // Documents
    if (documents.length > 0) {
      context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 RECENT DOCUMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${documents.slice(0, 8).map(d => `• ${d.name} (${d.type || 'unknown'})${d.matter_name ? ` - ${d.matter_name}` : ''}`).join('\n')}
`;
    }

    // Team
    if (team.length > 1) {
      context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👨‍💼 TEAM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${team.map(u => `• ${u.first_name} ${u.last_name} (${u.role}) - ${u.active_matters} active matters - ${parseFloat(u.monthly_hours || 0).toFixed(1)}h this month`).join('\n')}
`;
    }

    // Add specific detail if on a detail page
    if (additionalContext.matterId) {
      const matterDetail = matters.find(m => m.id === additionalContext.matterId);
      if (matterDetail) {
        context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 CURRENTLY VIEWING: ${matterDetail.name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You're currently looking at this matter in detail.
`;
      }
    }

    if (additionalContext.clientId) {
      const clientDetail = clients.find(c => c.id === additionalContext.clientId);
      if (clientDetail) {
        context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 CURRENTLY VIEWING: ${clientDetail.display_name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You're currently looking at this client's details.
`;
      }
    }

    context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
I am your personal AI assistant with full knowledge of your practice.
Ask me anything - I can help with matters, clients, billing, scheduling, analysis, drafting, and more.
`;

    console.log('Built FULL context, length:', context.length);
    return context;

  } catch (error) {
    console.error('Error building full context:', error);
    return `Error loading your practice data. Please try again. (${error.message})`;
  }
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

    // Log what we're sending (for debugging)
    console.log('=== AI REQUEST ===');
    console.log('User:', req.user.id, 'Firm:', req.user.firmId);
    console.log('Message:', message);
    console.log('Context length:', pageContext.length);
    console.log('Context preview:', pageContext.substring(0, 500));

    // Build messages array
    const messages = [
      {
        role: 'system',
        content: `${SYSTEM_PROMPT}\n\n=== YOUR FIRM'S ACTUAL DATA (USE ONLY THIS) ===\n${pageContext}\n=== END OF DATA ===\n\nRemember: ONLY use the data shown above. Do not invent any information.`,
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

// Quick actions endpoint - for suggested prompts (same for all pages since AI has full context)
router.get('/suggestions', authenticate, async (req, res) => {
  // The AI has FULL context, so suggestions are universal
  const suggestions = [
    "What should I focus on today?",
    "What needs my attention right now?",
    "Give me a status update on my practice",
    "Any overdue invoices I should follow up on?",
    "What unbilled time should I invoice?",
    "How is my month going compared to last month?",
  ];

  res.json({ suggestions });
});

export default router;
