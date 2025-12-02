import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db/connection.js';

const router = Router();

// Secure admin authentication middleware (same as secureAdmin.js)
const ADMIN_USERNAME_HASH = crypto.createHash('sha256').update('strappedadmin7969').digest('hex');
const ADMIN_PASSWORD_HASH = crypto.createHash('sha256').update('dawg79697969').digest('hex');

const requireSecureAdmin = (req, res, next) => {
  const authHeader = req.headers['x-admin-auth'];
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  try {
    const session = JSON.parse(Buffer.from(authHeader, 'base64').toString());
    
    if (!session.auth || session.exp < Date.now()) {
      return res.status(401).json({ error: 'Session expired' });
    }

    req.adminAuth = true;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid admin session' });
  }
};

// Audit logging for migration actions
const logMigrationAudit = (action, details, ip) => {
  console.log(`[MIGRATION AUDIT] ${new Date().toISOString()} - ${action}: ${JSON.stringify(details)} from ${ip}`);
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Flexible date parser - handles multiple formats
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  
  // Already a valid ISO date
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return new Date(dateStr).toISOString().split('T')[0];
  }
  
  // MM/DD/YYYY format
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
    const [month, day, year] = dateStr.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // DD/MM/YYYY format (European)
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(dateStr)) {
    const [day, month, year] = dateStr.split('-');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Try native parsing as fallback
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  
  return null;
};

// Normalize phone numbers
const normalizePhone = (phone) => {
  if (!phone) return null;
  // Remove all non-numeric characters except +
  return phone.replace(/[^\d+]/g, '');
};

// Validate email format
const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// ============================================
// VALIDATION ENDPOINT
// ============================================

router.post('/validate', requireSecureAdmin, async (req, res) => {
  const { data } = req.body;
  const errors = [];
  const warnings = [];
  const summary = {
    firm: null,
    users: 0,
    clients: 0,
    matters: 0,
    time_entries: 0,
    expenses: 0,
    calendar_events: 0
  };

  try {
    // Validate migration version
    if (!data.migration_version) {
      warnings.push('No migration_version specified, assuming 1.0');
    }

    // Validate firm
    if (!data.firm) {
      errors.push('Firm data is required');
    } else {
      if (!data.firm.name) {
        errors.push('Firm name is required');
      } else {
        summary.firm = data.firm.name;
      }
      
      // Check if firm name already exists
      const existingFirm = await query('SELECT id FROM firms WHERE name = $1', [data.firm.name]);
      if (existingFirm.rows.length > 0) {
        warnings.push(`Firm "${data.firm.name}" already exists - will create with unique name`);
      }
    }

    // Validate users
    if (data.users && Array.isArray(data.users)) {
      summary.users = data.users.length;
      const emails = new Set();
      
      for (let i = 0; i < data.users.length; i++) {
        const user = data.users[i];
        
        if (!user.email) {
          errors.push(`User ${i + 1}: Email is required`);
        } else if (!isValidEmail(user.email)) {
          errors.push(`User ${i + 1}: Invalid email format "${user.email}"`);
        } else {
          if (emails.has(user.email.toLowerCase())) {
            errors.push(`User ${i + 1}: Duplicate email "${user.email}"`);
          }
          emails.add(user.email.toLowerCase());
          
          // Check if email exists in system
          const existingUser = await query('SELECT id FROM users WHERE email = $1', [user.email]);
          if (existingUser.rows.length > 0) {
            errors.push(`User ${i + 1}: Email "${user.email}" already exists in the system`);
          }
        }
        
        if (!user.password || user.password.length < 8) {
          errors.push(`User ${i + 1} (${user.email || 'unknown'}): Password must be at least 8 characters`);
        }
        
        if (!user.first_name) {
          errors.push(`User ${i + 1} (${user.email || 'unknown'}): First name is required`);
        }
        
        if (!user.last_name) {
          errors.push(`User ${i + 1} (${user.email || 'unknown'}): Last name is required`);
        }
        
        const validRoles = ['owner', 'admin', 'attorney', 'paralegal', 'staff', 'billing', 'readonly'];
        if (user.role && !validRoles.includes(user.role)) {
          errors.push(`User ${i + 1} (${user.email || 'unknown'}): Invalid role "${user.role}". Must be one of: ${validRoles.join(', ')}`);
        }
      }
    }

    // Validate clients
    if (data.clients && Array.isArray(data.clients)) {
      summary.clients = data.clients.length;
      
      for (let i = 0; i < data.clients.length; i++) {
        const client = data.clients[i];
        
        if (!client.display_name && !client.company_name && !(client.first_name && client.last_name)) {
          errors.push(`Client ${i + 1}: Must have display_name, company_name, or first_name + last_name`);
        }
        
        if (client.type && !['person', 'company'].includes(client.type)) {
          errors.push(`Client ${i + 1}: Invalid type "${client.type}". Must be "person" or "company"`);
        }
        
        if (client.email && !isValidEmail(client.email)) {
          warnings.push(`Client ${i + 1}: Invalid email format "${client.email}"`);
        }
      }
    }

    // Validate matters
    if (data.matters && Array.isArray(data.matters)) {
      summary.matters = data.matters.length;
      const matterNumbers = new Set();
      
      for (let i = 0; i < data.matters.length; i++) {
        const matter = data.matters[i];
        
        if (!matter.number) {
          errors.push(`Matter ${i + 1}: Matter number is required`);
        } else {
          if (matterNumbers.has(matter.number)) {
            errors.push(`Matter ${i + 1}: Duplicate matter number "${matter.number}"`);
          }
          matterNumbers.add(matter.number);
        }
        
        if (!matter.name) {
          errors.push(`Matter ${i + 1}: Matter name is required`);
        }
        
        if (!matter.client_display_name && !matter.client_external_id) {
          warnings.push(`Matter ${i + 1} (${matter.number || 'unknown'}): No client linked`);
        }
        
        const validStatuses = ['active', 'pending', 'closed', 'on_hold', 'archived'];
        if (matter.status && !validStatuses.includes(matter.status)) {
          errors.push(`Matter ${i + 1}: Invalid status "${matter.status}"`);
        }
        
        const validBillingTypes = ['hourly', 'flat', 'contingency', 'retainer', 'pro_bono'];
        if (matter.billing_type && !validBillingTypes.includes(matter.billing_type)) {
          errors.push(`Matter ${i + 1}: Invalid billing_type "${matter.billing_type}"`);
        }
      }
    }

    // Validate time entries
    if (data.time_entries && Array.isArray(data.time_entries)) {
      summary.time_entries = data.time_entries.length;
      
      for (let i = 0; i < data.time_entries.length; i++) {
        const entry = data.time_entries[i];
        
        if (!entry.matter_number) {
          errors.push(`Time Entry ${i + 1}: Matter number is required`);
        }
        
        if (!entry.user_email) {
          errors.push(`Time Entry ${i + 1}: User email is required`);
        }
        
        if (!entry.date) {
          errors.push(`Time Entry ${i + 1}: Date is required`);
        } else if (!parseDate(entry.date)) {
          errors.push(`Time Entry ${i + 1}: Invalid date format "${entry.date}"`);
        }
        
        if (entry.hours === undefined || entry.hours === null || isNaN(parseFloat(entry.hours))) {
          errors.push(`Time Entry ${i + 1}: Hours is required and must be a number`);
        }
        
        if (!entry.description) {
          warnings.push(`Time Entry ${i + 1}: No description provided`);
        }
      }
    }

    // Validate expenses
    if (data.expenses && Array.isArray(data.expenses)) {
      summary.expenses = data.expenses.length;
      
      for (let i = 0; i < data.expenses.length; i++) {
        const expense = data.expenses[i];
        
        if (!expense.matter_number) {
          errors.push(`Expense ${i + 1}: Matter number is required`);
        }
        
        if (!expense.date) {
          errors.push(`Expense ${i + 1}: Date is required`);
        }
        
        if (expense.amount === undefined || isNaN(parseFloat(expense.amount))) {
          errors.push(`Expense ${i + 1}: Amount is required and must be a number`);
        }
        
        if (!expense.description) {
          warnings.push(`Expense ${i + 1}: No description provided`);
        }
      }
    }

    // Validate calendar events
    if (data.calendar_events && Array.isArray(data.calendar_events)) {
      summary.calendar_events = data.calendar_events.length;
      
      for (let i = 0; i < data.calendar_events.length; i++) {
        const event = data.calendar_events[i];
        
        if (!event.title) {
          errors.push(`Calendar Event ${i + 1}: Title is required`);
        }
        
        if (!event.start_time) {
          errors.push(`Calendar Event ${i + 1}: Start time is required`);
        }
        
        if (!event.end_time) {
          errors.push(`Calendar Event ${i + 1}: End time is required`);
        }
        
        const validTypes = ['meeting', 'court_date', 'deadline', 'reminder', 'task', 'closing', 'deposition', 'other'];
        if (event.type && !validTypes.includes(event.type)) {
          warnings.push(`Calendar Event ${i + 1}: Unknown type "${event.type}", will use "other"`);
        }
      }
    }

    logMigrationAudit('VALIDATE', { summary, errorCount: errors.length, warningCount: warnings.length }, req.ip);

    res.json({
      valid: errors.length === 0,
      errors,
      warnings,
      summary
    });

  } catch (error) {
    console.error('Migration validation error:', error);
    res.status(500).json({ error: 'Validation failed: ' + error.message });
  }
});

// ============================================
// IMPORT ENDPOINT
// ============================================

router.post('/import', requireSecureAdmin, async (req, res) => {
  const { data } = req.body;
  const results = {
    success: false,
    firm_id: null,
    imported: {
      users: 0,
      clients: 0,
      matters: 0,
      time_entries: 0,
      expenses: 0,
      calendar_events: 0
    },
    errors: [],
    warnings: []
  };

  // Maps to track created entities for linking
  const userMap = new Map(); // email -> user_id
  const clientMap = new Map(); // display_name -> client_id
  const matterMap = new Map(); // number -> matter_id

  try {
    // Start transaction
    await query('BEGIN');

    // ============================================
    // 1. CREATE FIRM
    // ============================================
    let firmName = data.firm.name;
    
    // Check for existing firm and create unique name if needed
    const existingFirm = await query('SELECT id FROM firms WHERE name = $1', [firmName]);
    if (existingFirm.rows.length > 0) {
      firmName = `${firmName} (Migrated ${new Date().toISOString().split('T')[0]})`;
      results.warnings.push(`Firm name already existed, created as "${firmName}"`);
    }

    const firmResult = await query(
      `INSERT INTO firms (name, address, city, state, zip_code, phone, email, website, billing_defaults)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        firmName,
        data.firm.address || null,
        data.firm.city || null,
        data.firm.state || null,
        data.firm.zip_code || null,
        normalizePhone(data.firm.phone),
        data.firm.email || null,
        data.firm.website || null,
        JSON.stringify(data.firm.billing_defaults || {
          hourlyRate: 350,
          incrementMinutes: 6,
          paymentTerms: 30,
          currency: "USD"
        })
      ]
    );
    
    const firmId = firmResult.rows[0].id;
    results.firm_id = firmId;

    // ============================================
    // 2. CREATE USERS
    // ============================================
    if (data.users && Array.isArray(data.users)) {
      for (const user of data.users) {
        try {
          const passwordHash = await bcrypt.hash(user.password, 12);
          
          const userResult = await query(
            `INSERT INTO users (firm_id, email, password_hash, first_name, last_name, role, phone, hourly_rate, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id`,
            [
              firmId,
              user.email.toLowerCase(),
              passwordHash,
              user.first_name,
              user.last_name,
              user.role || 'staff',
              normalizePhone(user.phone),
              user.hourly_rate || null,
              user.is_active !== false
            ]
          );
          
          userMap.set(user.email.toLowerCase(), userResult.rows[0].id);
          results.imported.users++;
        } catch (err) {
          results.errors.push(`Failed to create user ${user.email}: ${err.message}`);
        }
      }
    }

    // ============================================
    // 3. CREATE CLIENTS
    // ============================================
    if (data.clients && Array.isArray(data.clients)) {
      for (const client of data.clients) {
        try {
          // Determine display name
          let displayName = client.display_name;
          if (!displayName) {
            if (client.type === 'company' && client.company_name) {
              displayName = client.company_name;
            } else if (client.first_name && client.last_name) {
              displayName = `${client.first_name} ${client.last_name}`;
            } else {
              displayName = client.company_name || 'Unknown Client';
            }
          }

          const clientResult = await query(
            `INSERT INTO clients (firm_id, type, display_name, first_name, last_name, company_name, email, phone, 
             address_street, address_city, address_state, address_zip, notes, tags, contact_type, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING id`,
            [
              firmId,
              client.type || 'person',
              displayName,
              client.first_name || null,
              client.last_name || null,
              client.company_name || null,
              client.email || null,
              normalizePhone(client.phone),
              client.address_street || null,
              client.address_city || null,
              client.address_state || null,
              client.address_zip || null,
              client.notes || null,
              client.tags || [],
              client.contact_type || 'client',
              client.is_active !== false
            ]
          );
          
          clientMap.set(displayName.toLowerCase(), clientResult.rows[0].id);
          if (client.external_id) {
            clientMap.set(`ext:${client.external_id}`, clientResult.rows[0].id);
          }
          results.imported.clients++;
        } catch (err) {
          results.errors.push(`Failed to create client ${client.display_name || client.company_name}: ${err.message}`);
        }
      }
    }

    // ============================================
    // 4. CREATE MATTERS
    // ============================================
    if (data.matters && Array.isArray(data.matters)) {
      for (const matter of data.matters) {
        try {
          // Find client ID
          let clientId = null;
          if (matter.client_display_name) {
            clientId = clientMap.get(matter.client_display_name.toLowerCase());
          } else if (matter.client_external_id) {
            clientId = clientMap.get(`ext:${matter.client_external_id}`);
          }
          
          if (!clientId && matter.client_display_name) {
            results.warnings.push(`Matter ${matter.number}: Client "${matter.client_display_name}" not found`);
          }

          // Find responsible attorney ID
          let responsibleAttorneyId = null;
          if (matter.responsible_attorney_email) {
            responsibleAttorneyId = userMap.get(matter.responsible_attorney_email.toLowerCase());
            if (!responsibleAttorneyId) {
              results.warnings.push(`Matter ${matter.number}: Responsible attorney "${matter.responsible_attorney_email}" not found`);
            }
          }

          const matterResult = await query(
            `INSERT INTO matters (firm_id, client_id, number, name, description, type, status, priority,
             responsible_attorney, open_date, close_date, billing_type, billing_rate, flat_fee, 
             contingency_percent, retainer_amount, budget, court_name, case_number, judge, jurisdiction, tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
             RETURNING id`,
            [
              firmId,
              clientId,
              matter.number,
              matter.name,
              matter.description || null,
              matter.type || null,
              matter.status || 'active',
              matter.priority || 'medium',
              responsibleAttorneyId,
              parseDate(matter.open_date),
              parseDate(matter.close_date),
              matter.billing_type || 'hourly',
              matter.billing_rate || null,
              matter.flat_fee || null,
              matter.contingency_percent || null,
              matter.retainer_amount || null,
              matter.budget || null,
              matter.court_name || null,
              matter.case_number || null,
              matter.judge || null,
              matter.jurisdiction || null,
              matter.tags || []
            ]
          );
          
          matterMap.set(matter.number, matterResult.rows[0].id);
          if (matter.external_id) {
            matterMap.set(`ext:${matter.external_id}`, matterResult.rows[0].id);
          }
          results.imported.matters++;
        } catch (err) {
          results.errors.push(`Failed to create matter ${matter.number}: ${err.message}`);
        }
      }
    }

    // ============================================
    // 5. CREATE TIME ENTRIES
    // ============================================
    if (data.time_entries && Array.isArray(data.time_entries)) {
      for (const entry of data.time_entries) {
        try {
          const matterId = matterMap.get(entry.matter_number) || matterMap.get(`ext:${entry.matter_external_id}`);
          const userId = userMap.get(entry.user_email?.toLowerCase());
          
          if (!matterId) {
            results.warnings.push(`Time entry skipped: Matter "${entry.matter_number}" not found`);
            continue;
          }

          await query(
            `INSERT INTO time_entries (firm_id, matter_id, user_id, date, hours, description, billable, rate, activity_code, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              firmId,
              matterId,
              userId,
              parseDate(entry.date),
              parseFloat(entry.hours),
              entry.description || '',
              entry.billable !== false,
              parseFloat(entry.rate) || 0,
              entry.activity_code || null,
              'pending'
            ]
          );
          
          results.imported.time_entries++;
        } catch (err) {
          results.errors.push(`Failed to create time entry: ${err.message}`);
        }
      }
    }

    // ============================================
    // 6. CREATE EXPENSES
    // ============================================
    if (data.expenses && Array.isArray(data.expenses)) {
      for (const expense of data.expenses) {
        try {
          const matterId = matterMap.get(expense.matter_number) || matterMap.get(`ext:${expense.matter_external_id}`);
          const userId = userMap.get(expense.user_email?.toLowerCase());
          
          if (!matterId) {
            results.warnings.push(`Expense skipped: Matter "${expense.matter_number}" not found`);
            continue;
          }

          await query(
            `INSERT INTO expenses (firm_id, matter_id, user_id, date, description, amount, category, expense_type, billable, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              firmId,
              matterId,
              userId,
              parseDate(expense.date),
              expense.description || '',
              parseFloat(expense.amount),
              expense.category || null,
              expense.expense_type || 'other',
              expense.billable !== false,
              'pending'
            ]
          );
          
          results.imported.expenses++;
        } catch (err) {
          results.errors.push(`Failed to create expense: ${err.message}`);
        }
      }
    }

    // ============================================
    // 7. CREATE CALENDAR EVENTS
    // ============================================
    if (data.calendar_events && Array.isArray(data.calendar_events)) {
      for (const event of data.calendar_events) {
        try {
          const matterId = event.matter_number ? 
            (matterMap.get(event.matter_number) || matterMap.get(`ext:${event.matter_external_id}`)) : null;
          
          const clientId = event.client_display_name ?
            clientMap.get(event.client_display_name.toLowerCase()) : null;

          const validTypes = ['meeting', 'court_date', 'deadline', 'reminder', 'task', 'closing', 'deposition', 'other'];
          const eventType = validTypes.includes(event.type) ? event.type : 'other';

          await query(
            `INSERT INTO calendar_events (firm_id, matter_id, client_id, title, description, type, start_time, end_time, 
             all_day, location, color, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              firmId,
              matterId,
              clientId,
              event.title,
              event.description || null,
              eventType,
              new Date(event.start_time).toISOString(),
              new Date(event.end_time).toISOString(),
              event.all_day || false,
              event.location || null,
              event.color || '#3B82F6',
              'confirmed'
            ]
          );
          
          results.imported.calendar_events++;
        } catch (err) {
          results.errors.push(`Failed to create calendar event "${event.title}": ${err.message}`);
        }
      }
    }

    // Commit transaction
    await query('COMMIT');
    results.success = true;

    logMigrationAudit('IMPORT_SUCCESS', { 
      firm_id: firmId, 
      firm_name: firmName,
      imported: results.imported 
    }, req.ip);

    res.json(results);

  } catch (error) {
    // Rollback on error
    await query('ROLLBACK');
    
    logMigrationAudit('IMPORT_FAILED', { error: error.message }, req.ip);
    
    results.success = false;
    results.errors.push(`Migration failed: ${error.message}`);
    res.status(500).json(results);
  }
});

// ============================================
// GET MIGRATION TEMPLATE
// ============================================

router.get('/template', requireSecureAdmin, (req, res) => {
  const template = {
    migration_version: "1.0",
    source_system: "manual",
    export_date: new Date().toISOString().split('T')[0],
    
    firm: {
      name: "Example Law Firm",
      address: "123 Main Street",
      city: "Boston",
      state: "MA",
      zip_code: "02101",
      phone: "555-123-4567",
      email: "contact@examplelaw.com",
      website: "https://examplelaw.com",
      billing_defaults: {
        hourlyRate: 350,
        incrementMinutes: 6,
        paymentTerms: 30,
        currency: "USD"
      }
    },
    
    users: [
      {
        external_id: "user_001",
        email: "attorney@examplelaw.com",
        password: "SecurePassword123!",
        first_name: "Jane",
        last_name: "Attorney",
        role: "owner",
        phone: "555-111-2222",
        hourly_rate: 400.00,
        is_active: true
      }
    ],
    
    clients: [
      {
        external_id: "client_001",
        type: "person",
        display_name: "John Smith",
        first_name: "John",
        last_name: "Smith",
        email: "john.smith@email.com",
        phone: "555-333-4444",
        address_street: "456 Oak Avenue",
        address_city: "Boston",
        address_state: "MA",
        address_zip: "02102",
        notes: "Referred by existing client",
        tags: ["vip", "estate"],
        contact_type: "client"
      },
      {
        external_id: "client_002",
        type: "company",
        display_name: "Acme Corporation",
        company_name: "Acme Corporation",
        email: "legal@acme.com",
        phone: "555-555-5555",
        contact_type: "client"
      }
    ],
    
    matters: [
      {
        external_id: "matter_001",
        client_display_name: "John Smith",
        number: "2024-0001",
        name: "Smith Estate Planning",
        description: "Complete estate planning including will and trust",
        type: "Estate Planning",
        status: "active",
        priority: "medium",
        responsible_attorney_email: "attorney@examplelaw.com",
        open_date: "2024-01-15",
        billing_type: "hourly",
        billing_rate: 350.00,
        tags: ["estate", "trust"]
      }
    ],
    
    time_entries: [
      {
        matter_number: "2024-0001",
        user_email: "attorney@examplelaw.com",
        date: "2024-01-20",
        hours: 2.5,
        description: "Initial client consultation and estate planning discussion",
        billable: true,
        rate: 350.00,
        activity_code: "L100"
      }
    ],
    
    expenses: [
      {
        matter_number: "2024-0001",
        user_email: "attorney@examplelaw.com",
        date: "2024-01-22",
        description: "Court filing fee for probate documents",
        amount: 150.00,
        category: "Filing Fees",
        expense_type: "filing",
        billable: true
      }
    ],
    
    calendar_events: [
      {
        matter_number: "2024-0001",
        title: "Client Meeting - Estate Review",
        description: "Review draft estate documents with client",
        type: "meeting",
        start_time: "2024-02-01T10:00:00Z",
        end_time: "2024-02-01T11:00:00Z",
        all_day: false,
        location: "Office Conference Room A"
      }
    ]
  };

  res.json(template);
});

// ============================================
// MIGRATION HISTORY (for audit)
// ============================================

router.get('/history', requireSecureAdmin, async (req, res) => {
  try {
    // Get recently created firms (likely from migration)
    const result = await query(`
      SELECT f.id, f.name, f.created_at,
             (SELECT COUNT(*) FROM users WHERE firm_id = f.id) as user_count,
             (SELECT COUNT(*) FROM clients WHERE firm_id = f.id) as client_count,
             (SELECT COUNT(*) FROM matters WHERE firm_id = f.id) as matter_count
      FROM firms f
      ORDER BY f.created_at DESC
      LIMIT 20
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Get migration history error:', error);
    res.status(500).json({ error: 'Failed to get migration history' });
  }
});

export default router;
