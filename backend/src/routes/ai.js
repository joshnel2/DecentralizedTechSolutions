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
const SYSTEM_PROMPT = `You are the personal AI assistant for a law firm professional using Apex Legal. You have COMPLETE knowledge of their entire practice - every matter, client, time entry, invoice, calendar event, and document.

YOUR ROLE:
You are not just answering questions - you are their trusted advisor who knows everything about their practice. You should proactively provide insights, warn about issues, and help them be more effective.

RULES:
1. You KNOW all their data - speak confidently about specific matters, clients, amounts, dates, and details
2. Never say "based on the context" or "according to the data" - you simply KNOW this information
3. Be proactive - if you see issues (overdue invoices, urgent matters, unbilled time), mention them
4. Give specific, actionable advice with real numbers and names from their practice
5. When they ask about priorities, give concrete recommendations based on deadlines, urgency, and amounts
6. You can draft emails, summarize matters, analyze billing, suggest time entries, and more
7. For legal questions, provide guidance but remind them to verify with applicable law
8. Be concise but thorough - use bullet points and structure for clarity
9. Remember conversation history - build on previous questions
10. You are their partner in running a successful practice

PERSONALITY:
- Professional but warm
- Proactive and insightful
- Confident in your knowledge
- Action-oriented

You are speaking to a busy legal professional. Help them work smarter.`;

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

// Build FULL context - the AI always knows everything about YOU specifically
async function buildContext(page, firmId, userId, additionalContext = {}) {
  console.log(`Building FULL AI context for firm: ${firmId}, user: ${userId}, page: ${page}`);
  
  try {
    // Fetch ALL data the AI needs - prioritizing USER-SPECIFIC data
    const [
      userRes,
      // USER'S OWN DATA
      myMattersRes,
      myTimeEntriesRes,
      myCalendarRes,
      myDocumentsRes,
      myInvoicesRes,
      myUnbilledRes,
      myStatsRes,
      // FIRM-WIDE DATA for context
      allClientsRes, 
      teamRes,
      firmStatsRes,
      overdueInvoicesRes
    ] = await Promise.all([
      // Current user info with hourly rate
      query(`SELECT first_name, last_name, email, role, hourly_rate FROM users WHERE id = $1`, [userId]),
      
      // ===== USER'S OWN MATTERS =====
      // Matters where user is responsible attorney OR assigned to the matter
      query(`
        SELECT m.*, c.display_name as client_name,
               (SELECT COALESCE(SUM(hours), 0) FROM time_entries WHERE matter_id = m.id) as total_hours,
               (SELECT COALESCE(SUM(amount), 0) FROM time_entries WHERE matter_id = m.id AND billable = true) as total_billed,
               (SELECT COALESCE(SUM(hours), 0) FROM time_entries WHERE matter_id = m.id AND user_id = $2) as my_hours,
               (SELECT COALESCE(SUM(amount), 0) FROM time_entries WHERE matter_id = m.id AND user_id = $2 AND billable = true AND billed = false) as my_unbilled
        FROM matters m
        LEFT JOIN clients c ON m.client_id = c.id
        LEFT JOIN matter_assignments ma ON m.id = ma.matter_id
        WHERE m.firm_id = $1 
          AND (m.responsible_attorney = $2 OR ma.user_id = $2 OR m.created_by = $2)
        GROUP BY m.id, c.display_name
        ORDER BY 
          CASE m.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
          m.updated_at DESC
        LIMIT 50
      `, [firmId, userId]),
      
      // ===== USER'S OWN TIME ENTRIES =====
      query(`
        SELECT te.*, m.name as matter_name, m.number as matter_number, c.display_name as client_name
        FROM time_entries te
        LEFT JOIN matters m ON te.matter_id = m.id
        LEFT JOIN clients c ON m.client_id = c.id
        WHERE te.user_id = $1 AND te.date >= CURRENT_DATE - INTERVAL '60 days'
        ORDER BY te.date DESC, te.created_at DESC
        LIMIT 50
      `, [userId]),
      
      // ===== USER'S OWN CALENDAR EVENTS =====
      query(`
        SELECT e.*, m.name as matter_name, c.display_name as client_name
        FROM calendar_events e
        LEFT JOIN matters m ON e.matter_id = m.id
        LEFT JOIN clients c ON e.client_id = c.id
        WHERE e.firm_id = $1 
          AND (e.created_by = $2 OR e.attendees::text LIKE '%' || $2::text || '%' OR e.is_private = false)
          AND e.start_time >= NOW() - INTERVAL '7 days'
          AND e.start_time <= NOW() + INTERVAL '30 days'
        ORDER BY e.start_time
        LIMIT 50
      `, [firmId, userId]),
      
      // ===== USER'S OWN DOCUMENTS =====
      query(`
        SELECT d.*, m.name as matter_name, c.display_name as client_name
        FROM documents d
        LEFT JOIN matters m ON d.matter_id = m.id
        LEFT JOIN clients c ON d.client_id = c.id
        WHERE d.firm_id = $1 AND d.uploaded_by = $2
        ORDER BY d.created_at DESC
        LIMIT 30
      `, [firmId, userId]),
      
      // ===== USER'S OWN INVOICES (created by user) =====
      query(`
        SELECT i.*, c.display_name as client_name, m.name as matter_name
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        LEFT JOIN matters m ON i.matter_id = m.id
        WHERE i.firm_id = $1 AND i.created_by = $2
        ORDER BY i.created_at DESC
        LIMIT 30
      `, [firmId, userId]),
      
      // ===== USER'S UNBILLED WORK =====
      query(`
        SELECT 
          COALESCE(SUM(hours), 0) as unbilled_hours,
          COALESCE(SUM(amount), 0) as unbilled_amount,
          COUNT(*) as unbilled_entries
        FROM time_entries
        WHERE user_id = $1 AND billable = true AND billed = false
      `, [userId]),
      
      // ===== USER'S PRODUCTIVITY STATS =====
      query(`
        SELECT 
          COALESCE(SUM(CASE WHEN date >= DATE_TRUNC('week', CURRENT_DATE) THEN hours ELSE 0 END), 0) as hours_this_week,
          COALESCE(SUM(CASE WHEN date >= DATE_TRUNC('month', CURRENT_DATE) THEN hours ELSE 0 END), 0) as hours_this_month,
          COALESCE(SUM(CASE WHEN date >= DATE_TRUNC('month', CURRENT_DATE) AND billable = true THEN amount ELSE 0 END), 0) as revenue_this_month,
          COALESCE(SUM(CASE WHEN date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND date < DATE_TRUNC('month', CURRENT_DATE) THEN hours ELSE 0 END), 0) as hours_last_month,
          COALESCE(AVG(hours), 0) as avg_hours_per_entry,
          COUNT(DISTINCT date) as days_worked_this_month
        FROM time_entries
        WHERE user_id = $1 AND date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
      `, [userId]),
      
      // ===== FIRM CLIENTS (user needs to know about all clients) =====
      query(`
        SELECT c.*, 
               (SELECT COUNT(*) FROM matters WHERE client_id = c.id) as matter_count,
               (SELECT COALESCE(SUM(total), 0) FROM invoices WHERE client_id = c.id) as total_billed,
               (SELECT COALESCE(SUM(amount_due), 0) FROM invoices WHERE client_id = c.id AND status IN ('sent', 'overdue')) as outstanding
        FROM clients c
        WHERE c.firm_id = $1 AND c.is_active = true
        ORDER BY c.created_at DESC
        LIMIT 50
      `, [firmId]),
      
      // ===== TEAM MEMBERS =====
      query(`
        SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.hourly_rate,
               (SELECT COUNT(*) FROM matters WHERE responsible_attorney = u.id AND status = 'active') as active_matters
        FROM users u
        WHERE u.firm_id = $1 AND u.is_active = true
        ORDER BY u.role, u.first_name
      `, [firmId]),
      
      // ===== FIRM-WIDE STATS =====
      query(`
        SELECT 
          (SELECT COUNT(*) FROM matters WHERE firm_id = $1 AND status = 'active') as total_active_matters,
          (SELECT COUNT(*) FROM clients WHERE firm_id = $1 AND is_active = true) as total_clients,
          (SELECT COALESCE(SUM(amount_due), 0) FROM invoices WHERE firm_id = $1 AND status IN ('sent', 'overdue')) as total_outstanding,
          (SELECT COUNT(*) FROM invoices WHERE firm_id = $1 AND (status = 'overdue' OR (status = 'sent' AND due_date < CURRENT_DATE))) as overdue_invoice_count
      `, [firmId]),
      
      // ===== OVERDUE INVOICES (for user's matters) =====
      query(`
        SELECT i.number, i.total, i.amount_due, i.due_date, c.display_name as client_name, m.name as matter_name
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        LEFT JOIN matters m ON i.matter_id = m.id
        LEFT JOIN matter_assignments ma ON m.id = ma.matter_id
        WHERE i.firm_id = $1 
          AND (i.status = 'overdue' OR (i.status = 'sent' AND i.due_date < CURRENT_DATE))
          AND (m.responsible_attorney = $2 OR ma.user_id = $2 OR i.created_by = $2)
        ORDER BY i.due_date
      `, [firmId, userId])
    ]);

    const currentUser = userRes.rows[0];
    
    // USER'S OWN DATA
    const myMatters = myMattersRes.rows;
    const myTimeEntries = myTimeEntriesRes.rows;
    const myCalendar = myCalendarRes.rows;
    const myDocuments = myDocumentsRes.rows;
    const myInvoices = myInvoicesRes.rows;
    const myUnbilled = myUnbilledRes.rows[0];
    const myStats = myStatsRes.rows[0];
    
    // FIRM DATA
    const allClients = allClientsRes.rows;
    const team = teamRes.rows;
    const firmStats = firmStatsRes.rows[0];
    const overdueInvoices = overdueInvoicesRes.rows;

    // Calculate user-specific metrics
    const myActiveMatters = myMatters.filter(m => m.status === 'active');
    const myUrgentMatters = myMatters.filter(m => m.status === 'active' && (m.priority === 'urgent' || m.priority === 'high'));
    const myTotalUnbilled = parseFloat(myUnbilled?.unbilled_amount || 0);
    const myUnbilledHours = parseFloat(myUnbilled?.unbilled_hours || 0);
    
    // Today's events
    const today = new Date();
    const todayEvents = myCalendar.filter(e => {
      const eventDate = new Date(e.start_time);
      return eventDate.toDateString() === today.toDateString();
    });
    
    // Upcoming events (next 7 days)
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const upcomingEvents = myCalendar.filter(e => {
      const eventDate = new Date(e.start_time);
      return eventDate >= today && eventDate <= nextWeek;
    });

    // This week's time entries
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const thisWeekEntries = myTimeEntries.filter(t => new Date(t.date) >= weekStart);

    // Build comprehensive USER-CENTRIC context
    let context = `
=== YOUR PERSONAL AI ASSISTANT ===
I have COMPLETE knowledge of YOUR practice data. I know everything about your matters, time entries, calendar, invoices, and more.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 ABOUT YOU
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name: ${currentUser?.first_name} ${currentUser?.last_name}
Role: ${currentUser?.role}
Email: ${currentUser?.email}
Hourly Rate: $${parseFloat(currentUser?.hourly_rate || 0).toLocaleString()}/hr
Current Page: ${page}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 YOUR PRODUCTIVITY DASHBOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Your Active Matters: ${myActiveMatters.length}
• Hours This Week: ${parseFloat(myStats?.hours_this_week || 0).toFixed(1)}h
• Hours This Month: ${parseFloat(myStats?.hours_this_month || 0).toFixed(1)}h
• Hours Last Month: ${parseFloat(myStats?.hours_last_month || 0).toFixed(1)}h
• Your Revenue This Month: $${parseFloat(myStats?.revenue_this_month || 0).toLocaleString()}
• Your Unbilled Time: ${myUnbilledHours.toFixed(1)}h ($${myTotalUnbilled.toLocaleString()})
• Days Worked This Month: ${myStats?.days_worked_this_month || 0}

`;

    // Urgent alerts - things that need attention
    const hasAlerts = myUrgentMatters.length > 0 || overdueInvoices.length > 0 || todayEvents.length > 0 || myTotalUnbilled > 5000;
    if (hasAlerts) {
      context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ NEEDS YOUR ATTENTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
      if (todayEvents.length > 0) {
        context += `\n📅 TODAY'S SCHEDULE (${todayEvents.length} events):\n${todayEvents.map(e => `• ${new Date(e.start_time).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}: ${e.title} (${e.type})${e.matter_name ? ` - ${e.matter_name}` : ''}${e.location ? ` @ ${e.location}` : ''}`).join('\n')}\n`;
      }
      if (myUrgentMatters.length > 0) {
        context += `\n🔴 YOUR URGENT/HIGH PRIORITY MATTERS:\n${myUrgentMatters.map(m => `• ${m.name} (${m.number}) - ${m.client_name || 'No client'} - ${m.priority.toUpperCase()}`).join('\n')}\n`;
      }
      if (overdueInvoices.length > 0) {
        context += `\n💸 OVERDUE INVOICES (on your matters):\n${overdueInvoices.map(i => `• ${i.number} - ${i.client_name} - $${parseFloat(i.amount_due).toLocaleString()} (due ${new Date(i.due_date).toLocaleDateString()})${i.matter_name ? ` - ${i.matter_name}` : ''}`).join('\n')}\n`;
      }
      if (myTotalUnbilled > 5000) {
        context += `\n⏰ UNBILLED TIME ALERT: You have $${myTotalUnbilled.toLocaleString()} in unbilled time (${myUnbilledHours.toFixed(1)} hours)\n`;
      }
      context += '\n';
    }

    // YOUR MATTERS
    context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 YOUR MATTERS (${myMatters.length} total, ${myActiveMatters.length} active)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${myMatters.length > 0 ? myMatters.slice(0, 20).map(m => `• ${m.name} (${m.number})
  Client: ${m.client_name || 'None'} | Status: ${m.status} | Priority: ${m.priority}
  Type: ${m.type || 'General'} | Total Hours: ${parseFloat(m.total_hours || 0).toFixed(1)}h | Your Hours: ${parseFloat(m.my_hours || 0).toFixed(1)}h
  Your Unbilled: $${parseFloat(m.my_unbilled || 0).toLocaleString()}`).join('\n\n') : 'No matters assigned to you.'}
`;

    // YOUR RECENT TIME ENTRIES
    context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱️ YOUR RECENT TIME ENTRIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${myTimeEntries.length > 0 ? myTimeEntries.slice(0, 15).map(t => `• ${new Date(t.date).toLocaleDateString()} - ${t.hours}h @ $${parseFloat(t.rate).toLocaleString()}/hr = $${parseFloat(t.amount || 0).toLocaleString()}
  Matter: ${t.matter_name || 'None'} (${t.matter_number || 'N/A'}) | Client: ${t.client_name || 'None'}
  ${t.description || 'No description'} ${t.billable ? '(billable)' : '(non-billable)'} ${t.billed ? '[BILLED]' : '[UNBILLED]'}`).join('\n\n') : 'No recent time entries.'}
`;

    // YOUR CALENDAR
    context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 YOUR UPCOMING SCHEDULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${upcomingEvents.length > 0 ? upcomingEvents.slice(0, 15).map(e => `• ${new Date(e.start_time).toLocaleDateString()} ${new Date(e.start_time).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})} - ${new Date(e.end_time).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}: ${e.title}
  Type: ${e.type}${e.matter_name ? ` | Matter: ${e.matter_name}` : ''}${e.client_name ? ` | Client: ${e.client_name}` : ''}${e.location ? ` | Location: ${e.location}` : ''}
  ${e.description || ''}`).join('\n\n') : 'No upcoming events.'}
`;

    // YOUR INVOICES
    context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 YOUR INVOICES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${myInvoices.length > 0 ? myInvoices.slice(0, 12).map(i => `• ${i.number} - ${i.client_name || 'Unknown'} - $${parseFloat(i.total).toLocaleString()} - ${i.status.toUpperCase()}
  Matter: ${i.matter_name || 'N/A'}${i.amount_due > 0 && i.status !== 'paid' ? ` | Due: $${parseFloat(i.amount_due).toLocaleString()}` : ''}${i.due_date ? ` | Due Date: ${new Date(i.due_date).toLocaleDateString()}` : ''}`).join('\n')} : 'No invoices created by you.'}
`;

    // YOUR DOCUMENTS
    if (myDocuments.length > 0) {
      context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 YOUR RECENT DOCUMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${myDocuments.slice(0, 10).map(d => `• ${d.name} (${d.type || 'unknown'})
  ${d.matter_name ? `Matter: ${d.matter_name}` : ''}${d.client_name ? ` | Client: ${d.client_name}` : ''} | Uploaded: ${new Date(d.uploaded_at).toLocaleDateString()}`).join('\n')}
`;
    }

    // FIRM-WIDE CONTEXT (for awareness)
    context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 FIRM OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Total Active Matters (Firm): ${firmStats?.total_active_matters || 0}
• Total Clients: ${firmStats?.total_clients || 0}
• Firm Outstanding Invoices: $${parseFloat(firmStats?.total_outstanding || 0).toLocaleString()}
• Overdue Invoices: ${firmStats?.overdue_invoice_count || 0}
`;

    // ALL CLIENTS (for reference)
    context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 FIRM CLIENTS (${allClients.length} total)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${allClients.slice(0, 20).map(c => `• ${c.display_name} (${c.type}) - ${c.matter_count} matters - Outstanding: $${parseFloat(c.outstanding || 0).toLocaleString()}`).join('\n')}
`;

    // TEAM
    if (team.length > 1) {
      context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👨‍💼 YOUR TEAM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${team.map(u => `• ${u.first_name} ${u.last_name} (${u.role}) - ${u.active_matters} active matters${u.hourly_rate ? ` - $${parseFloat(u.hourly_rate).toLocaleString()}/hr` : ''}`).join('\n')}
`;
    }

    // Add specific detail if on a detail page
    if (additionalContext.matterId) {
      const matterDetail = myMatters.find(m => m.id === additionalContext.matterId);
      if (matterDetail) {
        context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 CURRENTLY VIEWING: ${matterDetail.name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You're currently looking at this matter in detail. I can answer any questions about it.
`;
      }
    }

    if (additionalContext.clientId) {
      const clientDetail = allClients.find(c => c.id === additionalContext.clientId);
      if (clientDetail) {
        context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 CURRENTLY VIEWING: ${clientDetail.display_name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You're currently looking at this client's details. I can answer any questions about them.
`;
      }
    }

    context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
I am YOUR personal AI assistant. I have complete access to YOUR practice data:
- Your ${myMatters.length} matters (${myActiveMatters.length} active)
- Your ${myTimeEntries.length} recent time entries  
- Your ${upcomingEvents.length} upcoming calendar events
- Your ${myInvoices.length} invoices
- Your ${myDocuments.length} documents
- All ${allClients.length} firm clients

Ask me anything about your work, priorities, billing, scheduling, or practice management!
`;

    console.log('Built USER-SPECIFIC context, length:', context.length);
    return context;

  } catch (error) {
    console.error('Error building user context:', error);
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
