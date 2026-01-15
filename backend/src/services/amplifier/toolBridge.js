/**
 * Tool Bridge for Amplifier Background Agent
 * 
 * This module creates an HTTP API bridge that allows Amplifier to call
 * all the same tools that the normal AI agent has access to.
 * 
 * Instead of executing tools directly, it makes authenticated HTTP calls
 * to internal API endpoints, passing the user's JWT token.
 */

import { query, withTransaction } from '../../db/connection.js';
import { formatDate, formatDateTime, getTodayInTimezone } from '../../utils/dateUtils.js';

/**
 * Complete list of tools available to Amplifier
 * Each tool maps to an internal handler that either:
 * 1. Calls an existing API endpoint
 * 2. Executes a database query directly
 * 3. Performs business logic
 */
export const AMPLIFIER_TOOLS = {
  // ============== TIME ENTRIES ==============
  log_time: {
    description: "Log billable time for the user on a specific matter",
    parameters: {
      matter_id: "string - Matter ID or name",
      hours: "number - Hours to log (0.1 to 24)",
      description: "string - Description of work",
      date: "string - Date YYYY-MM-DD (optional, defaults to today)",
      billable: "boolean - Whether billable (optional, defaults to true)"
    },
    required: ["matter_id", "hours", "description"]
  },
  
  get_my_time_entries: {
    description: "Get user's recent time entries",
    parameters: {
      limit: "number - Max entries to return",
      start_date: "string - Filter from date",
      end_date: "string - Filter to date",
      matter_id: "string - Filter by matter"
    },
    required: []
  },
  
  // ============== MATTERS ==============
  list_my_matters: {
    description: "Get matters the user can access",
    parameters: {
      status: "string - active|pending|closed|on_hold",
      limit: "number - Max to return"
    },
    required: []
  },
  
  search_matters: {
    description: "Search for matters by name, number, or client",
    parameters: {
      search: "string - Search term",
      status: "string - Filter by status",
      client_id: "string - Filter by client"
    },
    required: []
  },
  
  get_matter: {
    description: "Get comprehensive info about a matter including documents, tasks, events",
    parameters: {
      matter_id: "string - Matter ID or name"
    },
    required: ["matter_id"]
  },
  
  create_matter: {
    description: "Create a new legal matter/case",
    parameters: {
      name: "string - Matter name",
      client_id: "string - Client ID",
      description: "string - Description",
      type: "string - Matter type",
      priority: "string - low|medium|high|urgent",
      billing_type: "string - hourly|flat|contingency|retainer|pro_bono",
      billing_rate: "number - Hourly rate"
    },
    required: ["name"]
  },
  
  update_matter: {
    description: "Update an existing matter",
    parameters: {
      matter_id: "string - Matter ID",
      name: "string - New name",
      description: "string - New description",
      status: "string - New status",
      priority: "string - New priority"
    },
    required: ["matter_id"]
  },
  
  close_matter: {
    description: "Close a matter with resolution",
    parameters: {
      matter_id: "string - Matter ID",
      resolution: "string - Resolution outcome",
      closing_notes: "string - Closing notes"
    },
    required: ["matter_id"]
  },
  
  // ============== CLIENTS ==============
  list_clients: {
    description: "Get list of clients",
    parameters: {
      search: "string - Search by name",
      type: "string - person|company",
      limit: "number - Max to return"
    },
    required: []
  },
  
  get_client: {
    description: "Get comprehensive info about a client",
    parameters: {
      client_id: "string - Client ID"
    },
    required: ["client_id"]
  },
  
  create_client: {
    description: "Create a new client",
    parameters: {
      display_name: "string - Full name or company name",
      type: "string - person|company",
      email: "string - Email address",
      phone: "string - Phone number",
      first_name: "string - First name (for person)",
      last_name: "string - Last name (for person)"
    },
    required: ["display_name"]
  },
  
  update_client: {
    description: "Update an existing client",
    parameters: {
      client_id: "string - Client ID",
      display_name: "string",
      email: "string",
      phone: "string"
    },
    required: ["client_id"]
  },
  
  // ============== INVOICES ==============
  list_invoices: {
    description: "Get list of invoices",
    parameters: {
      status: "string - draft|sent|paid|overdue",
      client_id: "string - Filter by client",
      matter_id: "string - Filter by matter"
    },
    required: []
  },
  
  create_invoice: {
    description: "Create a new invoice",
    parameters: {
      client_id: "string - Client ID (required)",
      matter_id: "string - Matter ID",
      due_date: "string - Due date YYYY-MM-DD",
      include_unbilled_time: "boolean - Include unbilled time entries",
      items: "array - Custom line items [{description, amount}]"
    },
    required: ["client_id"]
  },
  
  send_invoice: {
    description: "Mark invoice as sent",
    parameters: {
      invoice_id: "string - Invoice ID"
    },
    required: ["invoice_id"]
  },
  
  record_payment: {
    description: "Record payment against invoice",
    parameters: {
      invoice_id: "string - Invoice ID",
      amount: "number - Payment amount",
      payment_method: "string - Payment method",
      payment_date: "string - Date YYYY-MM-DD"
    },
    required: ["invoice_id", "amount"]
  },
  
  // ============== DOCUMENTS ==============
  list_documents: {
    description: "Get list of documents",
    parameters: {
      matter_id: "string - Filter by matter",
      client_id: "string - Filter by client",
      search: "string - Search by name"
    },
    required: []
  },
  
  read_document_content: {
    description: "Read the text content of a document",
    parameters: {
      document_id: "string - Document ID",
      max_length: "number - Max characters"
    },
    required: ["document_id"]
  },
  
  create_document: {
    description: "Create a new PDF document",
    parameters: {
      name: "string - Document name",
      content: "string - Document content (markdown)",
      matter_id: "string - Attach to matter",
      client_id: "string - Attach to client"
    },
    required: ["name", "content"]
  },
  
  search_document_content: {
    description: "Search within all document contents",
    parameters: {
      search_term: "string - Text to search for",
      matter_id: "string - Limit to matter",
      client_id: "string - Limit to client"
    },
    required: ["search_term"]
  },
  
  // ============== CALENDAR ==============
  get_calendar_events: {
    description: "Get upcoming calendar events",
    parameters: {
      days_ahead: "number - Days to look ahead",
      matter_id: "string - Filter by matter",
      type: "string - Event type"
    },
    required: []
  },
  
  create_calendar_event: {
    description: "Create a new calendar event",
    parameters: {
      title: "string - Event title",
      start_time: "string - Start datetime ISO 8601",
      end_time: "string - End datetime",
      type: "string - meeting|court_date|deadline|reminder",
      matter_id: "string - Associated matter",
      location: "string - Event location"
    },
    required: ["title", "start_time"]
  },
  
  // ============== TASKS ==============
  list_tasks: {
    description: "Get list of tasks",
    parameters: {
      status: "string - pending|in_progress|completed",
      matter_id: "string - Filter by matter",
      assigned_to: "string - Filter by assignee"
    },
    required: []
  },
  
  create_task: {
    description: "Create a new task",
    parameters: {
      title: "string - Task title",
      due_date: "string - Due date YYYY-MM-DD",
      priority: "string - low|medium|high|urgent",
      matter_id: "string - Link to matter",
      assigned_to: "string - Assign to user"
    },
    required: ["title"]
  },
  
  complete_task: {
    description: "Mark task as completed",
    parameters: {
      task_id: "string - Task ID"
    },
    required: ["task_id"]
  },
  
  // ============== REPORTS ==============
  generate_report: {
    description: "Generate various reports",
    parameters: {
      report_type: "string - billing_summary|time_by_matter|revenue|outstanding_invoices",
      start_date: "string - Start date",
      end_date: "string - End date",
      matter_id: "string - Filter by matter",
      client_id: "string - Filter by client"
    },
    required: ["report_type"]
  },
  
  get_firm_analytics: {
    description: "Get firm-wide analytics and KPIs",
    parameters: {
      time_period: "string - current_month|last_month|year_to_date"
    },
    required: []
  },
  
  // ============== TEAM ==============
  list_team_members: {
    description: "Get list of team members",
    parameters: {
      role: "string - Filter by role",
      active_only: "boolean - Only active members"
    },
    required: []
  },
  
  // ============== PLANNING & PROGRESS ==============
  think_and_plan: {
    description: "Create a plan for a complex task",
    parameters: {
      goal: "string - The overall goal",
      analysis: "string - Analysis of what needs to be done",
      steps: "array - List of steps to take"
    },
    required: ["goal", "analysis", "steps"]
  },
  
  evaluate_progress: {
    description: "Evaluate progress toward a goal",
    parameters: {
      original_goal: "string - The original goal",
      completed_steps: "array - Steps completed",
      remaining_steps: "array - Steps remaining",
      confidence: "number - Confidence level 0-100"
    },
    required: ["original_goal", "completed_steps"]
  },
  
  task_complete: {
    description: "Mark a complex task as complete with summary",
    parameters: {
      goal: "string - The original goal",
      summary: "string - Summary of accomplishments",
      actions_taken: "array - List of actions taken",
      recommendations: "array - Follow-up recommendations"
    },
    required: ["goal", "summary", "actions_taken"]
  },
  
  log_work: {
    description: "Log work progress and learnings",
    parameters: {
      action: "string - What action was taken",
      result: "string - The result",
      next_step: "string - What to do next",
      reflection: "string - What was learned"
    },
    required: ["action"]
  }
};

/**
 * Execute a tool call for Amplifier
 * This function routes tool calls to the appropriate handler
 */
export async function executeTool(toolName, params, context) {
  const { userId, firmId, token } = context;
  
  console.log(`[Amplifier Tool] Executing: ${toolName}`, params);
  
  try {
    // Import the actual tool implementations from aiAgent
    // For now, we'll implement key tools directly here
    
    switch (toolName) {
      // ============== TIME ENTRIES ==============
      case 'log_time':
        return await logTime(params, userId, firmId);
      
      case 'get_my_time_entries':
        return await getTimeEntries(params, userId, firmId);
      
      // ============== MATTERS ==============
      case 'list_my_matters':
        return await listMatters(params, userId, firmId);
      
      case 'search_matters':
        return await searchMatters(params, userId, firmId);
      
      case 'get_matter':
        return await getMatter(params, userId, firmId);
      
      case 'create_matter':
        return await createMatter(params, userId, firmId);
      
      case 'update_matter':
        return await updateMatter(params, userId, firmId);
      
      case 'close_matter':
        return await closeMatter(params, userId, firmId);
      
      // ============== CLIENTS ==============
      case 'list_clients':
        return await listClients(params, userId, firmId);
      
      case 'get_client':
        return await getClient(params, userId, firmId);
      
      case 'create_client':
        return await createClient(params, userId, firmId);
      
      case 'update_client':
        return await updateClient(params, userId, firmId);
      
      // ============== INVOICES ==============
      case 'list_invoices':
        return await listInvoices(params, userId, firmId);
      
      case 'create_invoice':
        return await createInvoice(params, userId, firmId);
      
      case 'record_payment':
        return await recordPayment(params, userId, firmId);
      
      // ============== DOCUMENTS ==============
      case 'list_documents':
        return await listDocuments(params, userId, firmId);
      
      case 'read_document_content':
        return await readDocumentContent(params, userId, firmId);
      
      case 'search_document_content':
        return await searchDocumentContent(params, userId, firmId);
      
      // ============== CALENDAR ==============
      case 'get_calendar_events':
        return await getCalendarEvents(params, userId, firmId);
      
      case 'create_calendar_event':
        return await createCalendarEvent(params, userId, firmId);
      
      // ============== TASKS ==============
      case 'list_tasks':
        return await listTasks(params, userId, firmId);
      
      case 'create_task':
        return await createTask(params, userId, firmId);
      
      case 'complete_task':
        return await completeTask(params, userId, firmId);
      
      // ============== REPORTS ==============
      case 'generate_report':
        return await generateReport(params, userId, firmId);
      
      case 'get_firm_analytics':
        return await getFirmAnalytics(params, userId, firmId);
      
      // ============== TEAM ==============
      case 'list_team_members':
        return await listTeamMembers(params, userId, firmId);
      
      // ============== PLANNING (pass-through) ==============
      case 'think_and_plan':
      case 'evaluate_progress':
      case 'task_complete':
      case 'log_work':
        return { success: true, message: 'Planning step recorded', data: params };
      
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    console.error(`[Amplifier Tool] Error executing ${toolName}:`, error);
    return { error: error.message };
  }
}

// ============== TOOL IMPLEMENTATIONS ==============

async function logTime(params, userId, firmId) {
  const { matter_id, hours, description, date, billable = true } = params;
  
  // Find matter by ID or name
  let matterId = matter_id;
  if (!matter_id.match(/^[0-9a-f-]{36}$/i)) {
    const matterResult = await query(`
      SELECT id FROM matters 
      WHERE firm_id = $1 AND (LOWER(name) LIKE $2 OR LOWER(number) LIKE $2)
      LIMIT 1
    `, [firmId, `%${matter_id.toLowerCase()}%`]);
    
    if (!matterResult.rows.length) {
      return { error: `Matter not found: ${matter_id}` };
    }
    matterId = matterResult.rows[0].id;
  }
  
  // Get billing rate
  const matterInfo = await query(`
    SELECT m.billing_rate, m.billing_type, u.hourly_rate
    FROM matters m
    LEFT JOIN users u ON u.id = $2
    WHERE m.id = $1
  `, [matterId, userId]);
  
  const rate = matterInfo.rows[0]?.billing_rate || matterInfo.rows[0]?.hourly_rate || 0;
  const amount = hours * rate;
  
  const result = await query(`
    INSERT INTO time_entries (firm_id, user_id, matter_id, hours, description, date, billable, rate, amount)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, hours, description, date, amount
  `, [firmId, userId, matterId, hours, description, date || getTodayInTimezone(), billable, rate, amount]);
  
  return { success: true, timeEntry: result.rows[0] };
}

async function getTimeEntries(params, userId, firmId) {
  const { limit = 20, start_date, end_date, matter_id } = params;
  
  let sql = `
    SELECT te.*, m.name as matter_name
    FROM time_entries te
    LEFT JOIN matters m ON te.matter_id = m.id
    WHERE te.firm_id = $1 AND te.user_id = $2
  `;
  const values = [firmId, userId];
  let idx = 3;
  
  if (start_date) {
    sql += ` AND te.date >= $${idx++}`;
    values.push(start_date);
  }
  if (end_date) {
    sql += ` AND te.date <= $${idx++}`;
    values.push(end_date);
  }
  if (matter_id) {
    sql += ` AND te.matter_id = $${idx++}`;
    values.push(matter_id);
  }
  
  sql += ` ORDER BY te.date DESC, te.created_at DESC LIMIT $${idx}`;
  values.push(limit);
  
  const result = await query(sql, values);
  return { timeEntries: result.rows };
}

async function listMatters(params, userId, firmId) {
  const { status = 'active', limit = 50 } = params;
  
  const result = await query(`
    SELECT m.*, c.display_name as client_name
    FROM matters m
    LEFT JOIN clients c ON m.client_id = c.id
    WHERE m.firm_id = $1 AND m.status = $2
    ORDER BY m.created_at DESC
    LIMIT $3
  `, [firmId, status, limit]);
  
  return { matters: result.rows };
}

async function searchMatters(params, userId, firmId) {
  const { search, status, client_id } = params;
  
  let sql = `
    SELECT m.*, c.display_name as client_name
    FROM matters m
    LEFT JOIN clients c ON m.client_id = c.id
    WHERE m.firm_id = $1
  `;
  const values = [firmId];
  let idx = 2;
  
  if (search) {
    sql += ` AND (LOWER(m.name) LIKE $${idx} OR LOWER(m.number) LIKE $${idx} OR LOWER(c.display_name) LIKE $${idx})`;
    values.push(`%${search.toLowerCase()}%`);
    idx++;
  }
  if (status) {
    sql += ` AND m.status = $${idx++}`;
    values.push(status);
  }
  if (client_id) {
    sql += ` AND m.client_id = $${idx++}`;
    values.push(client_id);
  }
  
  sql += ` ORDER BY m.created_at DESC LIMIT 20`;
  
  const result = await query(sql, values);
  return { matters: result.rows };
}

async function getMatter(params, userId, firmId) {
  const { matter_id } = params;
  
  // Support flexible matching
  let matterQuery;
  if (matter_id.match(/^[0-9a-f-]{36}$/i)) {
    matterQuery = await query(`
      SELECT m.*, c.display_name as client_name, c.email as client_email
      FROM matters m
      LEFT JOIN clients c ON m.client_id = c.id
      WHERE m.id = $1 AND m.firm_id = $2
    `, [matter_id, firmId]);
  } else {
    matterQuery = await query(`
      SELECT m.*, c.display_name as client_name, c.email as client_email
      FROM matters m
      LEFT JOIN clients c ON m.client_id = c.id
      WHERE m.firm_id = $1 AND (LOWER(m.name) LIKE $2 OR LOWER(m.number) LIKE $2)
      LIMIT 1
    `, [firmId, `%${matter_id.toLowerCase()}%`]);
  }
  
  if (!matterQuery.rows.length) {
    return { error: `Matter not found: ${matter_id}` };
  }
  
  const matter = matterQuery.rows[0];
  
  // Get related data
  const [docs, tasks, events, timeEntries] = await Promise.all([
    query(`SELECT id, original_name, type, created_at FROM documents WHERE matter_id = $1 LIMIT 10`, [matter.id]),
    query(`SELECT id, name, status, due_date FROM matter_tasks WHERE matter_id = $1 LIMIT 10`, [matter.id]),
    query(`SELECT id, title, start_time, type FROM calendar_events WHERE matter_id = $1 AND start_time >= NOW() LIMIT 5`, [matter.id]),
    query(`SELECT SUM(hours) as total_hours, SUM(amount) as total_amount FROM time_entries WHERE matter_id = $1`, [matter.id])
  ]);
  
  return {
    matter,
    documents: docs.rows,
    tasks: tasks.rows,
    upcomingEvents: events.rows,
    billing: timeEntries.rows[0]
  };
}

async function createMatter(params, userId, firmId) {
  const { name, client_id, description, type, priority = 'medium', billing_type = 'hourly', billing_rate } = params;
  
  // Generate matter number
  const countResult = await query('SELECT COUNT(*) FROM matters WHERE firm_id = $1', [firmId]);
  const number = `M-${String(parseInt(countResult.rows[0].count) + 1).padStart(5, '0')}`;
  
  const result = await query(`
    INSERT INTO matters (firm_id, name, number, client_id, description, type, priority, billing_type, billing_rate, status, responsible_attorney)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10)
    RETURNING *
  `, [firmId, name, number, client_id || null, description || null, type || 'general', priority, billing_type, billing_rate || null, userId]);
  
  return { success: true, matter: result.rows[0] };
}

async function updateMatter(params, userId, firmId) {
  const { matter_id, ...updates } = params;
  
  const fields = [];
  const values = [matter_id, firmId];
  let idx = 3;
  
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }
  
  if (!fields.length) return { error: 'No fields to update' };
  
  const result = await query(`
    UPDATE matters SET ${fields.join(', ')}, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, values);
  
  return { success: true, matter: result.rows[0] };
}

async function closeMatter(params, userId, firmId) {
  const { matter_id, resolution, closing_notes } = params;
  
  const result = await query(`
    UPDATE matters 
    SET status = 'closed', close_date = NOW(), resolution = $3, closing_notes = $4, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, [matter_id, firmId, resolution || null, closing_notes || null]);
  
  return { success: true, matter: result.rows[0] };
}

async function listClients(params, userId, firmId) {
  const { search, type, limit = 50 } = params;
  
  let sql = 'SELECT * FROM clients WHERE firm_id = $1 AND is_active = true';
  const values = [firmId];
  let idx = 2;
  
  if (search) {
    sql += ` AND LOWER(display_name) LIKE $${idx++}`;
    values.push(`%${search.toLowerCase()}%`);
  }
  if (type) {
    sql += ` AND type = $${idx++}`;
    values.push(type);
  }
  
  sql += ` ORDER BY display_name LIMIT $${idx}`;
  values.push(limit);
  
  const result = await query(sql, values);
  return { clients: result.rows };
}

async function getClient(params, userId, firmId) {
  const { client_id } = params;
  
  const clientResult = await query('SELECT * FROM clients WHERE id = $1 AND firm_id = $2', [client_id, firmId]);
  if (!clientResult.rows.length) return { error: 'Client not found' };
  
  const [matters, invoices] = await Promise.all([
    query('SELECT id, name, number, status FROM matters WHERE client_id = $1 LIMIT 10', [client_id]),
    query('SELECT id, number, total, amount_due, status FROM invoices WHERE client_id = $1 LIMIT 10', [client_id])
  ]);
  
  return {
    client: clientResult.rows[0],
    matters: matters.rows,
    invoices: invoices.rows
  };
}

async function createClient(params, userId, firmId) {
  const { display_name, type = 'person', email, phone, first_name, last_name } = params;
  
  const result = await query(`
    INSERT INTO clients (firm_id, display_name, type, email, phone, first_name, last_name)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [firmId, display_name, type, email || null, phone || null, first_name || null, last_name || null]);
  
  return { success: true, client: result.rows[0] };
}

async function updateClient(params, userId, firmId) {
  const { client_id, ...updates } = params;
  
  const fields = [];
  const values = [client_id, firmId];
  let idx = 3;
  
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }
  
  if (!fields.length) return { error: 'No fields to update' };
  
  const result = await query(`
    UPDATE clients SET ${fields.join(', ')}, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, values);
  
  return { success: true, client: result.rows[0] };
}

async function listInvoices(params, userId, firmId) {
  const { status, client_id, matter_id, limit = 20 } = params;
  
  let sql = `
    SELECT i.*, c.display_name as client_name
    FROM invoices i
    LEFT JOIN clients c ON i.client_id = c.id
    WHERE i.firm_id = $1
  `;
  const values = [firmId];
  let idx = 2;
  
  if (status) {
    sql += ` AND i.status = $${idx++}`;
    values.push(status);
  }
  if (client_id) {
    sql += ` AND i.client_id = $${idx++}`;
    values.push(client_id);
  }
  if (matter_id) {
    sql += ` AND i.matter_id = $${idx++}`;
    values.push(matter_id);
  }
  
  sql += ` ORDER BY i.created_at DESC LIMIT $${idx}`;
  values.push(limit);
  
  const result = await query(sql, values);
  return { invoices: result.rows };
}

async function createInvoice(params, userId, firmId) {
  const { client_id, matter_id, due_date, items, include_unbilled_time } = params;
  
  // Generate invoice number
  const countResult = await query('SELECT COUNT(*) FROM invoices WHERE firm_id = $1', [firmId]);
  const number = `INV-${String(parseInt(countResult.rows[0].count) + 1).padStart(5, '0')}`;
  
  let total = 0;
  if (items && items.length) {
    total = items.reduce((sum, item) => sum + (item.amount * (item.quantity || 1)), 0);
  }
  
  const result = await query(`
    INSERT INTO invoices (firm_id, client_id, matter_id, number, due_date, total, amount_due, status)
    VALUES ($1, $2, $3, $4, $5, $6, $6, 'draft')
    RETURNING *
  `, [firmId, client_id, matter_id || null, number, due_date || null, total]);
  
  return { success: true, invoice: result.rows[0] };
}

async function recordPayment(params, userId, firmId) {
  const { invoice_id, amount, payment_method, payment_date } = params;
  
  const result = await query(`
    INSERT INTO payments (firm_id, invoice_id, amount, payment_method, payment_date)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [firmId, invoice_id, amount, payment_method || 'other', payment_date || getTodayInTimezone()]);
  
  // Update invoice amount_due
  await query(`
    UPDATE invoices SET amount_due = amount_due - $1,
    status = CASE WHEN amount_due - $1 <= 0 THEN 'paid' ELSE status END
    WHERE id = $2
  `, [amount, invoice_id]);
  
  return { success: true, payment: result.rows[0] };
}

async function listDocuments(params, userId, firmId) {
  const { matter_id, client_id, search, limit = 20 } = params;
  
  let sql = 'SELECT * FROM documents WHERE firm_id = $1';
  const values = [firmId];
  let idx = 2;
  
  if (matter_id) {
    sql += ` AND matter_id = $${idx++}`;
    values.push(matter_id);
  }
  if (client_id) {
    sql += ` AND client_id = $${idx++}`;
    values.push(client_id);
  }
  if (search) {
    sql += ` AND LOWER(original_name) LIKE $${idx++}`;
    values.push(`%${search.toLowerCase()}%`);
  }
  
  sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
  values.push(limit);
  
  const result = await query(sql, values);
  return { documents: result.rows };
}

async function readDocumentContent(params, userId, firmId) {
  const { document_id, max_length = 10000 } = params;
  
  const result = await query(`
    SELECT original_name, extracted_text 
    FROM documents 
    WHERE id = $1 AND firm_id = $2
  `, [document_id, firmId]);
  
  if (!result.rows.length) return { error: 'Document not found' };
  
  const doc = result.rows[0];
  const content = doc.extracted_text || '';
  
  return {
    name: doc.original_name,
    content: content.substring(0, max_length),
    truncated: content.length > max_length
  };
}

async function searchDocumentContent(params, userId, firmId) {
  const { search_term, matter_id, client_id } = params;
  
  let sql = `
    SELECT id, original_name, matter_id,
      SUBSTRING(extracted_text FROM POSITION(LOWER($2) IN LOWER(extracted_text)) FOR 200) as excerpt
    FROM documents
    WHERE firm_id = $1 AND LOWER(extracted_text) LIKE $3
  `;
  const values = [firmId, search_term, `%${search_term.toLowerCase()}%`];
  let idx = 4;
  
  if (matter_id) {
    sql += ` AND matter_id = $${idx++}`;
    values.push(matter_id);
  }
  if (client_id) {
    sql += ` AND client_id = $${idx++}`;
    values.push(client_id);
  }
  
  sql += ' LIMIT 10';
  
  const result = await query(sql, values);
  return { results: result.rows };
}

async function getCalendarEvents(params, userId, firmId) {
  const { days_ahead = 7, matter_id, type } = params;
  
  let sql = `
    SELECT e.*, m.name as matter_name
    FROM calendar_events e
    LEFT JOIN matters m ON e.matter_id = m.id
    WHERE e.firm_id = $1 AND e.start_time >= NOW() AND e.start_time < NOW() + INTERVAL '${days_ahead} days'
  `;
  const values = [firmId];
  let idx = 2;
  
  if (matter_id) {
    sql += ` AND e.matter_id = $${idx++}`;
    values.push(matter_id);
  }
  if (type) {
    sql += ` AND e.type = $${idx++}`;
    values.push(type);
  }
  
  sql += ' ORDER BY e.start_time';
  
  const result = await query(sql, values);
  return { events: result.rows };
}

async function createCalendarEvent(params, userId, firmId) {
  const { title, start_time, end_time, type = 'meeting', matter_id, location, description } = params;
  
  const result = await query(`
    INSERT INTO calendar_events (firm_id, user_id, title, start_time, end_time, type, matter_id, location, description)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [firmId, userId, title, start_time, end_time || null, type, matter_id || null, location || null, description || null]);
  
  return { success: true, event: result.rows[0] };
}

async function listTasks(params, userId, firmId) {
  const { status, matter_id, assigned_to } = params;
  
  let sql = `SELECT * FROM matter_tasks WHERE firm_id = $1`;
  const values = [firmId];
  let idx = 2;
  
  if (status) {
    sql += ` AND status = $${idx++}`;
    values.push(status);
  }
  if (matter_id) {
    sql += ` AND matter_id = $${idx++}`;
    values.push(matter_id);
  }
  if (assigned_to) {
    // Resolve assigned_to to a user ID
    let assigneeId = userId; // Default to current user
    
    if (assigned_to === 'me') {
      assigneeId = userId;
    } else if (assigned_to.match(/^[0-9a-f-]{36}$/i)) {
      // It's a UUID, use directly
      assigneeId = assigned_to;
    } else if (assigned_to.includes('@')) {
      // It's an email, look up the user
      const userResult = await query(
        'SELECT id FROM users WHERE firm_id = $1 AND LOWER(email) = LOWER($2)',
        [firmId, assigned_to]
      );
      if (userResult.rows.length > 0) {
        assigneeId = userResult.rows[0].id;
      } else {
        // User not found, return empty results
        return { tasks: [], message: `User not found: ${assigned_to}` };
      }
    } else {
      // Try to match by name
      const userResult = await query(
        `SELECT id FROM users WHERE firm_id = $1 AND (
          LOWER(first_name || ' ' || last_name) LIKE LOWER($2) OR
          LOWER(last_name) LIKE LOWER($2)
        )`,
        [firmId, `%${assigned_to}%`]
      );
      if (userResult.rows.length > 0) {
        assigneeId = userResult.rows[0].id;
      }
    }
    
    sql += ` AND assignee = $${idx++}`;
    values.push(assigneeId);
  }
  
  sql += ' ORDER BY due_date NULLS LAST, created_at DESC LIMIT 50';
  
  const result = await query(sql, values);
  return { tasks: result.rows };
}

async function createTask(params, userId, firmId) {
  const { title, due_date, priority = 'medium', matter_id, assigned_to } = params;
  
  // Resolve assigned_to to a user ID
  let assigneeId = userId; // Default to current user
  
  if (assigned_to) {
    if (assigned_to === 'me') {
      assigneeId = userId;
    } else if (assigned_to.match(/^[0-9a-f-]{36}$/i)) {
      // It's a UUID, use directly
      assigneeId = assigned_to;
    } else if (assigned_to.includes('@')) {
      // It's an email, look up the user
      const userResult = await query(
        'SELECT id FROM users WHERE firm_id = $1 AND LOWER(email) = LOWER($2)',
        [firmId, assigned_to]
      );
      if (userResult.rows.length > 0) {
        assigneeId = userResult.rows[0].id;
      }
    } else {
      // Try to match by name
      const userResult = await query(
        `SELECT id FROM users WHERE firm_id = $1 AND (
          LOWER(first_name || ' ' || last_name) LIKE LOWER($2) OR
          LOWER(last_name) LIKE LOWER($2)
        )`,
        [firmId, `%${assigned_to}%`]
      );
      if (userResult.rows.length > 0) {
        assigneeId = userResult.rows[0].id;
      }
    }
  }
  
  const result = await query(`
    INSERT INTO matter_tasks (firm_id, matter_id, name, due_date, priority, assignee, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'pending')
    RETURNING *
  `, [firmId, matter_id || null, title, due_date || null, priority, assigneeId]);
  
  return { success: true, task: result.rows[0] };
}

async function completeTask(params, userId, firmId) {
  const { task_id } = params;
  
  const result = await query(`
    UPDATE matter_tasks SET status = 'completed', completed_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, [task_id, firmId]);
  
  return { success: true, task: result.rows[0] };
}

async function generateReport(params, userId, firmId) {
  const { report_type, start_date, end_date, matter_id, client_id } = params;
  
  // Simplified report generation
  let report = { type: report_type };
  
  switch (report_type) {
    case 'billing_summary':
      const billing = await query(`
        SELECT SUM(hours) as total_hours, SUM(amount) as total_amount,
          COUNT(*) as entry_count
        FROM time_entries
        WHERE firm_id = $1
          ${start_date ? 'AND date >= $2' : ''}
          ${end_date ? 'AND date <= $3' : ''}
      `, [firmId, start_date, end_date].filter(Boolean));
      report.data = billing.rows[0];
      break;
    
    case 'outstanding_invoices':
      const outstanding = await query(`
        SELECT i.*, c.display_name as client_name
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        WHERE i.firm_id = $1 AND i.status IN ('sent', 'overdue')
        ORDER BY i.due_date
      `, [firmId]);
      report.data = outstanding.rows;
      break;
    
    default:
      report.data = { message: `Report type ${report_type} not yet implemented` };
  }
  
  return report;
}

async function getFirmAnalytics(params, userId, firmId) {
  const { time_period = 'current_month' } = params;
  
  const [matters, time, invoices] = await Promise.all([
    query(`SELECT status, COUNT(*) as count FROM matters WHERE firm_id = $1 GROUP BY status`, [firmId]),
    query(`
      SELECT SUM(hours) as total_hours, SUM(amount) as total_amount
      FROM time_entries WHERE firm_id = $1 AND date >= DATE_TRUNC('month', CURRENT_DATE)
    `, [firmId]),
    query(`
      SELECT SUM(total) as total_billed, SUM(amount_due) as outstanding
      FROM invoices WHERE firm_id = $1
    `, [firmId])
  ]);
  
  return {
    mattersByStatus: matters.rows,
    thisMonth: time.rows[0],
    invoiceSummary: invoices.rows[0]
  };
}

async function listTeamMembers(params, userId, firmId) {
  const { role, active_only = true } = params;
  
  let sql = 'SELECT id, first_name, last_name, email, role FROM users WHERE firm_id = $1';
  const values = [firmId];
  let idx = 2;
  
  if (active_only) {
    sql += ' AND is_active = true';
  }
  if (role) {
    sql += ` AND role = $${idx++}`;
    values.push(role);
  }
  
  const result = await query(sql, values);
  return { members: result.rows };
}

export default {
  AMPLIFIER_TOOLS,
  executeTool
};
