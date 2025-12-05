import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import { hasPermission } from '../utils/auth.js';

const router = Router();

// Azure OpenAI configuration
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT;
const API_VERSION = '2024-08-01-preview'; // Updated for function calling

// =============================================================================
// TOOL DEFINITIONS - These tell the AI what actions it can take
// =============================================================================
const TOOLS = [
  {
    type: "function",
    function: {
      name: "log_time",
      description: "Log billable time for the user on a specific matter. Use this when the user wants to record time spent on a case or matter.",
      parameters: {
        type: "object",
        properties: {
          matter_id: {
            type: "string",
            description: "The UUID of the matter to log time against. Get this from list_my_matters if you don't have it."
          },
          hours: {
            type: "number",
            description: "Number of hours to log (e.g., 2.5 for 2 hours 30 minutes). Must be between 0.1 and 24."
          },
          description: {
            type: "string",
            description: "Description of the work performed. Be specific and professional."
          },
          date: {
            type: "string",
            description: "Date of the work in YYYY-MM-DD format. Defaults to today if not specified."
          },
          billable: {
            type: "boolean",
            description: "Whether the time is billable. Defaults to true."
          }
        },
        required: ["matter_id", "hours", "description"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_my_matters",
      description: "Get a list of matters the user can log time to. Use this to find matter IDs or show the user their active cases.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function", 
    function: {
      name: "get_my_time_entries",
      description: "Get the user's recent time entries. Use this to see what time has been logged recently.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description: "Number of entries to return (default 20, max 100)"
          },
          start_date: {
            type: "string",
            description: "Filter entries from this date (YYYY-MM-DD)"
          },
          end_date: {
            type: "string",
            description: "Filter entries until this date (YYYY-MM-DD)"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_firm_analytics",
      description: "Get firm-wide analytics and KPIs. Only available for admin, partner, owner, or billing roles. Use this for questions about firm performance, revenue, billing metrics.",
      parameters: {
        type: "object",
        properties: {
          time_period: {
            type: "string",
            enum: ["current_month", "last_week", "last_month", "last_quarter", "year_to_date"],
            description: "Time period for analytics. Defaults to current_month."
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_clients",
      description: "Get a list of clients for the firm. Use this when the user asks about clients.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Search term to filter clients by name"
          },
          limit: {
            type: "integer",
            description: "Number of clients to return (default 50)"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_invoices",
      description: "Get a list of invoices. Use this for billing inquiries, overdue invoices, etc.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["draft", "sent", "paid", "overdue", "partial"],
            description: "Filter by invoice status"
          },
          client_id: {
            type: "string",
            description: "Filter by client UUID"
          },
          limit: {
            type: "integer",
            description: "Number of invoices to return"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_calendar_events",
      description: "Get upcoming calendar events, deadlines, and appointments.",
      parameters: {
        type: "object",
        properties: {
          days_ahead: {
            type: "integer",
            description: "Number of days to look ahead (default 7)"
          },
          matter_id: {
            type: "string",
            description: "Filter events by matter UUID"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Create a new calendar event, meeting, or deadline.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Event title"
          },
          start_time: {
            type: "string",
            description: "Start time in ISO 8601 format (e.g., 2024-01-15T14:00:00)"
          },
          end_time: {
            type: "string",
            description: "End time in ISO 8601 format. If not provided, defaults to 1 hour after start_time."
          },
          type: {
            type: "string",
            enum: ["meeting", "court_date", "deadline", "reminder", "task", "deposition", "other"],
            description: "Type of event. Use 'court_date' for court appearances."
          },
          matter_id: {
            type: "string",
            description: "Associated matter UUID (optional)"
          },
          location: {
            type: "string",
            description: "Event location (optional)"
          },
          description: {
            type: "string",
            description: "Event description (optional)"
          },
          all_day: {
            type: "boolean",
            description: "Whether this is an all-day event. Defaults to false."
          }
        },
        required: ["title", "start_time", "type"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_matters",
      description: "Search for matters by name, number, or other criteria.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Search term"
          },
          status: {
            type: "string",
            enum: ["active", "pending", "closed", "on_hold"],
            description: "Filter by status"
          },
          client_id: {
            type: "string",
            description: "Filter by client UUID"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_matter",
      description: "Create a new legal matter/case. Use this when the user wants to open a new case or matter.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name of the matter (e.g., 'Smith v. Jones', 'Johnson Contract Review')"
          },
          client_id: {
            type: "string",
            description: "UUID of the client this matter is for. Use list_clients to find client IDs."
          },
          description: {
            type: "string",
            description: "Description of the matter"
          },
          type: {
            type: "string",
            description: "Type of matter (e.g., 'litigation', 'contract', 'corporate', 'estate', 'family')"
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "urgent"],
            description: "Priority level. Defaults to medium."
          },
          billing_type: {
            type: "string",
            enum: ["hourly", "flat", "contingency", "retainer", "pro_bono"],
            description: "Billing type. Defaults to hourly."
          },
          billing_rate: {
            type: "number",
            description: "Hourly rate for this matter (if hourly billing)"
          }
        },
        required: ["name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_client",
      description: "Create a new client. Use this when the user wants to add a new client to the system.",
      parameters: {
        type: "object",
        properties: {
          display_name: {
            type: "string",
            description: "Full name or company name of the client"
          },
          type: {
            type: "string",
            enum: ["person", "company"],
            description: "Whether this is an individual person or a company. Defaults to person."
          },
          email: {
            type: "string",
            description: "Client's email address"
          },
          phone: {
            type: "string",
            description: "Client's phone number"
          },
          first_name: {
            type: "string",
            description: "First name (for individual clients)"
          },
          last_name: {
            type: "string",
            description: "Last name (for individual clients)"
          },
          company_name: {
            type: "string",
            description: "Company name (for company clients)"
          }
        },
        required: ["display_name"]
      }
    }
  }
];

// =============================================================================
// TOOL EXECUTION - Actually perform the actions
// =============================================================================
async function executeTool(toolName, args, user) {
  console.log(`Executing tool: ${toolName}`, args);
  
  try {
    switch (toolName) {
      case 'log_time':
        return await logTime(args, user);
      
      case 'list_my_matters':
        return await listMyMatters(user);
      
      case 'get_my_time_entries':
        return await getMyTimeEntries(args, user);
      
      case 'get_firm_analytics':
        return await getFirmAnalytics(args, user);
      
      case 'list_clients':
        return await listClients(args, user);
      
      case 'list_invoices':
        return await listInvoices(args, user);
      
      case 'get_calendar_events':
        return await getCalendarEvents(args, user);
      
      case 'create_calendar_event':
        return await createCalendarEvent(args, user);
      
      case 'search_matters':
        return await searchMatters(args, user);
      
      case 'create_matter':
        return await createMatter(args, user);
      
      case 'create_client':
        return await createClient(args, user);
      
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    console.error(`Tool execution error (${toolName}):`, error);
    return { error: error.message };
  }
}

// Tool implementations
async function logTime(args, user) {
  const { matter_id, hours, description, date, billable = true } = args;
  
  // Validate
  if (!matter_id || !hours || !description) {
    return { error: 'Missing required fields: matter_id, hours, description' };
  }
  
  if (hours <= 0 || hours > 24) {
    return { error: 'Hours must be between 0.1 and 24' };
  }
  
  // Check matter authorization
  const isAdmin = ['owner', 'admin'].includes(user.role);
  
  const matterResult = await query(
    `SELECT m.id, m.name, m.number, m.billing_rate, m.responsible_attorney, m.status,
            EXISTS(SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $2) as user_is_assigned
     FROM matters m WHERE m.id = $1 AND m.firm_id = $3`,
    [matter_id, user.id, user.firmId]
  );
  
  if (matterResult.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  const matter = matterResult.rows[0];
  
  if (matter.status === 'closed') {
    return { error: 'Cannot log time to a closed matter' };
  }
  
  const isAuthorized = isAdmin || matter.responsible_attorney === user.id || matter.user_is_assigned;
  if (!isAuthorized) {
    return { error: 'You are not authorized to log time to this matter' };
  }
  
  // Get billing rate
  let billingRate = matter.billing_rate;
  if (!billingRate) {
    const userResult = await query('SELECT hourly_rate FROM users WHERE id = $1', [user.id]);
    billingRate = userResult.rows[0]?.hourly_rate || 350;
  }
  
  // Create entry
  const entryDate = date || new Date().toISOString().split('T')[0];
  
  const result = await query(
    `INSERT INTO time_entries (firm_id, matter_id, user_id, date, hours, description, billable, rate, entry_type, ai_generated)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ai_suggested', true) RETURNING *`,
    [user.firmId, matter_id, user.id, entryDate, hours, description, billable, billingRate]
  );
  
  const entry = result.rows[0];
  
  return {
    success: true,
    message: `Logged ${hours} hours to "${matter.name}" (${matter.number})`,
    data: {
      id: entry.id,
      matter: matter.name,
      matter_number: matter.number,
      hours: parseFloat(entry.hours),
      amount: parseFloat(entry.amount),
      date: entry.date
    }
  };
}

async function listMyMatters(user) {
  const isAdmin = ['owner', 'admin'].includes(user.role);
  
  let sql = `
    SELECT m.id, m.name, m.number, m.status, m.billing_type, c.display_name as client_name
    FROM matters m
    LEFT JOIN clients c ON m.client_id = c.id
    WHERE m.firm_id = $1 AND m.status != 'closed'
  `;
  const params = [user.firmId];
  
  if (!isAdmin) {
    sql += ` AND (m.responsible_attorney = $2 OR EXISTS (
      SELECT 1 FROM matter_assignments WHERE matter_id = m.id AND user_id = $2
    ))`;
    params.push(user.id);
  }
  
  sql += ` ORDER BY m.name LIMIT 50`;
  
  const result = await query(sql, params);
  
  return {
    matters: result.rows.map(m => ({
      id: m.id,
      name: m.name,
      number: m.number,
      status: m.status,
      client: m.client_name
    })),
    count: result.rows.length
  };
}

async function getMyTimeEntries(args, user) {
  const { limit = 20, start_date, end_date } = args;
  
  let sql = `
    SELECT te.*, m.name as matter_name, m.number as matter_number
    FROM time_entries te
    LEFT JOIN matters m ON te.matter_id = m.id
    WHERE te.firm_id = $1 AND te.user_id = $2
  `;
  const params = [user.firmId, user.id];
  let idx = 3;
  
  if (start_date) {
    sql += ` AND te.date >= $${idx++}`;
    params.push(start_date);
  }
  if (end_date) {
    sql += ` AND te.date <= $${idx++}`;
    params.push(end_date);
  }
  
  sql += ` ORDER BY te.date DESC LIMIT $${idx}`;
  params.push(Math.min(parseInt(limit), 100));
  
  const result = await query(sql, params);
  
  // Get summary
  const summaryResult = await query(
    `SELECT SUM(hours) as total_hours, SUM(amount) as total_amount
     FROM time_entries WHERE firm_id = $1 AND user_id = $2 AND date >= DATE_TRUNC('month', CURRENT_DATE)`,
    [user.firmId, user.id]
  );
  
  return {
    entries: result.rows.map(e => ({
      id: e.id,
      date: e.date,
      hours: parseFloat(e.hours),
      amount: parseFloat(e.amount),
      matter: e.matter_name,
      matter_number: e.matter_number,
      description: e.description,
      billable: e.billable
    })),
    this_month: {
      hours: parseFloat(summaryResult.rows[0]?.total_hours || 0),
      amount: parseFloat(summaryResult.rows[0]?.total_amount || 0)
    }
  };
}

async function getFirmAnalytics(args, user) {
  // Check permission
  if (!['owner', 'admin', 'partner', 'billing'].includes(user.role)) {
    return { error: 'You do not have permission to view firm analytics' };
  }
  
  const { time_period = 'current_month' } = args;
  
  let dateFilter;
  switch (time_period) {
    case 'last_week':
      dateFilter = `date >= CURRENT_DATE - INTERVAL '7 days'`;
      break;
    case 'last_month':
      dateFilter = `date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') AND date < DATE_TRUNC('month', CURRENT_DATE)`;
      break;
    case 'last_quarter':
      dateFilter = `date >= DATE_TRUNC('quarter', CURRENT_DATE - INTERVAL '3 months')`;
      break;
    case 'year_to_date':
      dateFilter = `date >= DATE_TRUNC('year', CURRENT_DATE)`;
      break;
    default:
      dateFilter = `date >= DATE_TRUNC('month', CURRENT_DATE)`;
  }
  
  const [billing, matters, invoices] = await Promise.all([
    query(`
      SELECT SUM(hours) as hours, SUM(amount) as revenue,
             SUM(CASE WHEN billable AND NOT billed THEN amount ELSE 0 END) as unbilled
      FROM time_entries WHERE firm_id = $1 AND ${dateFilter}
    `, [user.firmId]),
    query(`
      SELECT COUNT(*) FILTER (WHERE status = 'active') as active,
             COUNT(*) FILTER (WHERE priority IN ('urgent', 'high')) as priority
      FROM matters WHERE firm_id = $1
    `, [user.firmId]),
    query(`
      SELECT SUM(amount_due) as outstanding,
             SUM(CASE WHEN status = 'overdue' THEN amount_due ELSE 0 END) as overdue
      FROM invoices WHERE firm_id = $1
    `, [user.firmId])
  ]);
  
  return {
    period: time_period,
    billing: {
      hours: parseFloat(billing.rows[0]?.hours || 0),
      revenue: parseFloat(billing.rows[0]?.revenue || 0),
      unbilled: parseFloat(billing.rows[0]?.unbilled || 0)
    },
    matters: {
      active: parseInt(matters.rows[0]?.active || 0),
      priority: parseInt(matters.rows[0]?.priority || 0)
    },
    invoices: {
      outstanding: parseFloat(invoices.rows[0]?.outstanding || 0),
      overdue: parseFloat(invoices.rows[0]?.overdue || 0)
    }
  };
}

async function listClients(args, user) {
  const { search, limit = 50 } = args;
  
  let sql = `SELECT id, display_name, type, email, phone, is_active FROM clients WHERE firm_id = $1`;
  const params = [user.firmId];
  
  if (search) {
    sql += ` AND display_name ILIKE $2`;
    params.push(`%${search}%`);
  }
  
  sql += ` ORDER BY display_name LIMIT ${Math.min(parseInt(limit), 100)}`;
  
  const result = await query(sql, params);
  
  return {
    clients: result.rows.map(c => ({
      id: c.id,
      name: c.display_name,
      type: c.type,
      email: c.email,
      phone: c.phone,
      active: c.is_active
    })),
    count: result.rows.length
  };
}

async function listInvoices(args, user) {
  const { status, client_id, limit = 20 } = args;
  
  let sql = `
    SELECT i.id, i.number, i.status, i.total, i.amount_due, i.due_date, c.display_name as client_name
    FROM invoices i
    LEFT JOIN clients c ON i.client_id = c.id
    WHERE i.firm_id = $1
  `;
  const params = [user.firmId];
  let idx = 2;
  
  if (status) {
    sql += ` AND i.status = $${idx++}`;
    params.push(status);
  }
  if (client_id) {
    sql += ` AND i.client_id = $${idx++}`;
    params.push(client_id);
  }
  
  sql += ` ORDER BY i.created_at DESC LIMIT ${Math.min(parseInt(limit), 50)}`;
  
  const result = await query(sql, params);
  
  return {
    invoices: result.rows.map(i => ({
      id: i.id,
      number: i.number,
      client: i.client_name,
      status: i.status,
      total: parseFloat(i.total),
      amount_due: parseFloat(i.amount_due),
      due_date: i.due_date
    })),
    count: result.rows.length
  };
}

async function getCalendarEvents(args, user) {
  const { days_ahead = 7, matter_id } = args;
  
  let sql = `
    SELECT e.id, e.title, e.start_time, e.end_time, e.type, e.location, m.name as matter_name
    FROM calendar_events e
    LEFT JOIN matters m ON e.matter_id = m.id
    WHERE e.firm_id = $1 AND e.start_time >= NOW() AND e.start_time < NOW() + INTERVAL '${parseInt(days_ahead)} days'
  `;
  const params = [user.firmId];
  
  if (matter_id) {
    sql += ` AND e.matter_id = $2`;
    params.push(matter_id);
  }
  
  sql += ` ORDER BY e.start_time LIMIT 30`;
  
  const result = await query(sql, params);
  
  return {
    events: result.rows.map(e => ({
      id: e.id,
      title: e.title,
      start: e.start_time,
      end: e.end_time,
      type: e.type,
      location: e.location,
      matter: e.matter_name
    })),
    count: result.rows.length
  };
}

async function createCalendarEvent(args, user) {
  const { title, start_time, end_time, type, matter_id, location, description, all_day = false } = args;
  
  if (!title || !start_time || !type) {
    return { error: 'Missing required fields: title, start_time, type' };
  }
  
  // Validate type
  const validTypes = ['meeting', 'court_date', 'deadline', 'reminder', 'task', 'closing', 'deposition', 'other'];
  if (!validTypes.includes(type)) {
    return { error: `Invalid event type. Must be one of: ${validTypes.join(', ')}` };
  }
  
  // Parse start time
  const startDate = new Date(start_time);
  if (isNaN(startDate.getTime())) {
    return { error: 'Invalid start_time format. Use ISO 8601 format (e.g., 2024-01-15T14:00:00)' };
  }
  
  // Calculate end time - default to 1 hour after start if not provided
  let endDate;
  if (end_time) {
    endDate = new Date(end_time);
    if (isNaN(endDate.getTime())) {
      return { error: 'Invalid end_time format. Use ISO 8601 format.' };
    }
  } else {
    // Default: 1 hour after start for meetings, same time for deadlines/reminders
    endDate = new Date(startDate);
    if (type === 'meeting' || type === 'court_date' || type === 'deposition') {
      endDate.setHours(endDate.getHours() + 1);
    } else {
      endDate.setMinutes(endDate.getMinutes() + 30); // 30 min for deadlines/reminders
    }
  }
  
  const result = await query(
    `INSERT INTO calendar_events (firm_id, title, start_time, end_time, type, matter_id, location, description, all_day, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [user.firmId, title, startDate.toISOString(), endDate.toISOString(), type, matter_id || null, location || null, description || null, all_day, user.id]
  );
  
  const event = result.rows[0];
  
  return {
    success: true,
    message: `Created ${type} "${title}" for ${startDate.toLocaleString()}`,
    data: {
      id: event.id,
      title: event.title,
      start: event.start_time,
      end: event.end_time,
      type: event.type,
      location: event.location
    }
  };
}

async function searchMatters(args, user) {
  const { search, status, client_id } = args;
  const isAdmin = ['owner', 'admin'].includes(user.role);
  
  let sql = `
    SELECT m.id, m.name, m.number, m.status, m.priority, c.display_name as client_name
    FROM matters m
    LEFT JOIN clients c ON m.client_id = c.id
    WHERE m.firm_id = $1
  `;
  const params = [user.firmId];
  let idx = 2;
  
  if (!isAdmin) {
    sql += ` AND (m.responsible_attorney = $${idx} OR EXISTS (SELECT 1 FROM matter_assignments WHERE matter_id = m.id AND user_id = $${idx}))`;
    params.push(user.id);
    idx++;
  }
  
  if (search) {
    sql += ` AND (m.name ILIKE $${idx} OR m.number ILIKE $${idx})`;
    params.push(`%${search}%`);
    idx++;
  }
  if (status) {
    sql += ` AND m.status = $${idx}`;
    params.push(status);
    idx++;
  }
  if (client_id) {
    sql += ` AND m.client_id = $${idx}`;
    params.push(client_id);
    idx++;
  }
  
  sql += ` ORDER BY m.created_at DESC LIMIT 25`;
  
  const result = await query(sql, params);
  
  return {
    matters: result.rows.map(m => ({
      id: m.id,
      name: m.name,
      number: m.number,
      status: m.status,
      priority: m.priority,
      client: m.client_name
    })),
    count: result.rows.length
  };
}

async function createMatter(args, user) {
  // Check permission
  if (!hasPermission(user.role, 'matters:create')) {
    return { error: 'You do not have permission to create matters' };
  }
  
  const { 
    name, 
    client_id, 
    description, 
    type, 
    priority = 'medium', 
    billing_type = 'hourly', 
    billing_rate 
  } = args;
  
  if (!name) {
    return { error: 'Matter name is required' };
  }
  
  // Generate matter number
  const countResult = await query(
    'SELECT COUNT(*) FROM matters WHERE firm_id = $1',
    [user.firmId]
  );
  const count = parseInt(countResult.rows[0].count) + 1;
  const number = `MTR-${new Date().getFullYear()}-${String(count).padStart(3, '0')}`;
  
  // Validate client if provided
  if (client_id) {
    const clientCheck = await query(
      'SELECT id, display_name FROM clients WHERE id = $1 AND firm_id = $2',
      [client_id, user.firmId]
    );
    if (clientCheck.rows.length === 0) {
      return { error: 'Client not found' };
    }
  }
  
  const result = await query(
    `INSERT INTO matters (
      firm_id, number, name, description, client_id, type, status, priority,
      responsible_attorney, billing_type, billing_rate, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10, $8)
    RETURNING *`,
    [
      user.firmId, number, name, description || null, client_id || null,
      type || null, priority, user.id, billing_type, billing_rate || null
    ]
  );
  
  const matter = result.rows[0];
  
  // Assign the creator to the matter
  await query(
    'INSERT INTO matter_assignments (matter_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [matter.id, user.id]
  );
  
  return {
    success: true,
    message: `Created matter "${name}" (${number})`,
    data: {
      id: matter.id,
      name: matter.name,
      number: matter.number,
      status: matter.status,
      type: matter.type,
      priority: matter.priority,
      billing_type: matter.billing_type
    }
  };
}

async function createClient(args, user) {
  // Check permission
  if (!hasPermission(user.role, 'clients:create')) {
    return { error: 'You do not have permission to create clients' };
  }
  
  const { 
    display_name, 
    type = 'person', 
    email, 
    phone, 
    first_name, 
    last_name, 
    company_name 
  } = args;
  
  if (!display_name) {
    return { error: 'Client name (display_name) is required' };
  }
  
  // Check for duplicate email if provided
  if (email) {
    const emailCheck = await query(
      'SELECT id FROM clients WHERE email = $1 AND firm_id = $2',
      [email, user.firmId]
    );
    if (emailCheck.rows.length > 0) {
      return { error: 'A client with this email already exists' };
    }
  }
  
  const result = await query(
    `INSERT INTO clients (
      firm_id, display_name, type, email, phone, first_name, last_name, company_name, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      user.firmId, display_name, type, email || null, phone || null,
      first_name || null, last_name || null, company_name || null, user.id
    ]
  );
  
  const client = result.rows[0];
  
  return {
    success: true,
    message: `Created client "${display_name}"`,
    data: {
      id: client.id,
      name: client.display_name,
      type: client.type,
      email: client.email,
      phone: client.phone
    }
  };
}

// =============================================================================
// SYSTEM PROMPT WITH TOOL INSTRUCTIONS
// =============================================================================
const AGENT_SYSTEM_PROMPT = `You are an intelligent AI assistant for Apex Legal, a law firm management platform. You can both answer questions AND take actions on behalf of the user.

## Your Capabilities:
1. **Log Time**: Record billable hours to matters
2. **View Matters**: List and search legal matters
3. **View Time Entries**: See recent time logged
4. **Firm Analytics**: View firm performance (admin/partner only)
5. **Manage Clients**: View client information
6. **Manage Invoices**: View invoice status
7. **Calendar**: View and create events/deadlines

## Guidelines:
- When the user asks you to DO something (log time, create event, etc.), use the appropriate tool
- When the user asks a QUESTION, use tools to get data first, then answer naturally
- Be proactive - if the user says "log 2 hours for the Smith case", search for the matter first if needed
- Always confirm actions with specific details (matter name, amounts, dates)
- For time logging, ask for clarification if the matter is ambiguous
- Be concise and professional
- Never expose internal IDs to users - use names and numbers instead

## Current User Context:
- User Role: {{USER_ROLE}}
- The user can only access data within their firm
- Non-admin users can only log time to matters they're assigned to`;

// =============================================================================
// MAIN CHAT ENDPOINT WITH FUNCTION CALLING
// =============================================================================
router.post('/chat', authenticate, async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!AZURE_ENDPOINT || !AZURE_API_KEY || !AZURE_DEPLOYMENT) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    const systemPrompt = AGENT_SYSTEM_PROMPT.replace('{{USER_ROLE}}', req.user.role);

    // Build messages
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: 'user', content: message }
    ];

    // Call Azure OpenAI with tools
    let response = await callAzureOpenAIWithTools(messages, TOOLS);
    
    // Handle tool calls (may need multiple rounds)
    let iterations = 0;
    const maxIterations = 5; // Prevent infinite loops
    
    while (response.tool_calls && iterations < maxIterations) {
      iterations++;
      console.log(`Processing ${response.tool_calls.length} tool calls (iteration ${iterations})`);
      
      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: response.content || null,
        tool_calls: response.tool_calls
      });
      
      // Execute each tool call
      for (const toolCall of response.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        
        console.log(`Calling tool: ${functionName}`, functionArgs);
        
        const result = await executeTool(functionName, functionArgs, req.user);
        
        // Add tool result
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }
      
      // Get next response
      response = await callAzureOpenAIWithTools(messages, TOOLS);
    }

    // Log AI usage
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, details)
       VALUES ($1, $2, 'ai.agent_chat', 'ai', $3)`,
      [req.user.firmId, req.user.id, JSON.stringify({ 
        messageLength: message.length,
        toolCallCount: iterations 
      })]
    ).catch(() => {});

    res.json({
      response: response.content,
      toolsUsed: iterations > 0
    });

  } catch (error) {
    console.error('AI Agent chat error:', error);
    res.status(500).json({ error: 'Failed to get AI response' });
  }
});

// Helper to call Azure OpenAI with function calling
async function callAzureOpenAIWithTools(messages, tools) {
  const url = `${AZURE_ENDPOINT}openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': AZURE_API_KEY,
    },
    body: JSON.stringify({
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Azure OpenAI error:', error);
    throw new Error(`Azure OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const choice = data.choices[0];
  
  return {
    content: choice.message.content,
    tool_calls: choice.message.tool_calls
  };
}

export default router;
