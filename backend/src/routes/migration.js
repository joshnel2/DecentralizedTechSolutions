import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db/connection.js';

const router = Router();

// Secure admin authentication middleware
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

// Audit logging
const logMigrationAudit = (action, details, ip) => {
  console.log(`[MIGRATION AUDIT] ${new Date().toISOString()} - ${action}: ${JSON.stringify(details)} from ${ip}`);
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Flexible date parser - handles Clio formats
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  
  // ISO format: 2024-01-15
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return new Date(dateStr).toISOString().split('T')[0];
  }
  
  // Clio format: MM/DD/YYYY or M/D/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
    const [month, day, year] = dateStr.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Try native parsing
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  
  return null;
};

// Parse Clio phone numbers array or string
const parsePhoneNumbers = (phones) => {
  if (!phones) return null;
  if (typeof phones === 'string') return phones.replace(/[^\d+]/g, '');
  if (Array.isArray(phones) && phones.length > 0) {
    // Clio format: [{number, name, default_phone}]
    const defaultPhone = phones.find(p => p.default_phone) || phones[0];
    return defaultPhone?.number?.replace(/[^\d+]/g, '') || null;
  }
  return null;
};

// Parse Clio email addresses array or string
const parseEmailAddresses = (emails) => {
  if (!emails) return null;
  if (typeof emails === 'string') return emails;
  if (Array.isArray(emails) && emails.length > 0) {
    // Clio format: [{address, name, default_email}]
    const defaultEmail = emails.find(e => e.default_email) || emails[0];
    return defaultEmail?.address || null;
  }
  return null;
};

// Parse Clio addresses array
const parseAddress = (addresses) => {
  if (!addresses) return { street: null, city: null, province: null, postal_code: null };
  if (Array.isArray(addresses) && addresses.length > 0) {
    const addr = addresses.find(a => a.primary) || addresses[0];
    return {
      street: addr.street || null,
      city: addr.city || null,
      province: addr.province || null,
      postal_code: addr.postal_code || null
    };
  }
  return { street: null, city: null, province: null, postal_code: null };
};

// Map Clio status to our status
const mapMatterStatus = (clioStatus) => {
  const statusMap = {
    'Open': 'active',
    'open': 'active',
    'Pending': 'pending',
    'pending': 'pending',
    'Closed': 'closed',
    'closed': 'closed'
  };
  return statusMap[clioStatus] || 'active';
};

// Map Clio billing method to ours
const mapBillingMethod = (clioMethod) => {
  const methodMap = {
    'hourly': 'hourly',
    'Hourly': 'hourly',
    'flat': 'flat',
    'Flat Fee': 'flat',
    'flat_fee': 'flat',
    'contingency': 'contingency',
    'Contingency': 'contingency',
    'non-billable': 'pro_bono',
    'Non-Billable': 'pro_bono'
  };
  return methodMap[clioMethod] || 'hourly';
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
    contacts: 0,
    matters: 0,
    activities: 0,
    calendar_entries: 0
  };

  try {
    // Validate firm
    if (!data.firm) {
      errors.push('Firm data is required');
    } else {
      if (!data.firm.name) {
        errors.push('Firm name is required');
      } else {
        summary.firm = data.firm.name;
      }
      
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
        const userEmail = user.email || parseEmailAddresses(user.email_addresses);
        
        if (!userEmail) {
          errors.push(`User ${i + 1}: Email is required`);
        } else if (!isValidEmail(userEmail)) {
          errors.push(`User ${i + 1}: Invalid email format "${userEmail}"`);
        } else {
          if (emails.has(userEmail.toLowerCase())) {
            errors.push(`User ${i + 1}: Duplicate email "${userEmail}"`);
          }
          emails.add(userEmail.toLowerCase());
          
          const existingUser = await query('SELECT id FROM users WHERE email = $1', [userEmail]);
          if (existingUser.rows.length > 0) {
            errors.push(`User ${i + 1}: Email "${userEmail}" already exists in the system`);
          }
        }
        
        if (!user.password || user.password.length < 8) {
          errors.push(`User ${i + 1} (${userEmail || 'unknown'}): Password must be at least 8 characters`);
        }
        
        if (!user.first_name && !user.name) {
          errors.push(`User ${i + 1}: First name or name is required`);
        }
      }
    }

    // Validate contacts (Clio terminology)
    if (data.contacts && Array.isArray(data.contacts)) {
      summary.contacts = data.contacts.length;
      
      for (let i = 0; i < data.contacts.length; i++) {
        const contact = data.contacts[i];
        
        if (!contact.name && !contact.first_name && !contact.company) {
          errors.push(`Contact ${i + 1}: Must have name, first_name, or company`);
        }
        
        const contactType = contact.type?.toLowerCase();
        if (contactType && !['person', 'company'].includes(contactType)) {
          errors.push(`Contact ${i + 1}: Invalid type "${contact.type}". Must be "Person" or "Company"`);
        }
      }
    }

    // Validate matters
    if (data.matters && Array.isArray(data.matters)) {
      summary.matters = data.matters.length;
      const matterNumbers = new Set();
      
      for (let i = 0; i < data.matters.length; i++) {
        const matter = data.matters[i];
        const matterNum = matter.display_number || matter.number;
        
        if (!matterNum) {
          errors.push(`Matter ${i + 1}: display_number is required`);
        } else {
          if (matterNumbers.has(matterNum)) {
            errors.push(`Matter ${i + 1}: Duplicate matter number "${matterNum}"`);
          }
          matterNumbers.add(matterNum);
        }
        
        if (!matter.description && !matter.name) {
          errors.push(`Matter ${i + 1}: description (matter name) is required`);
        }
      }
    }

    // Validate activities (Clio's time entries)
    if (data.activities && Array.isArray(data.activities)) {
      summary.activities = data.activities.length;
      
      for (let i = 0; i < data.activities.length; i++) {
        const activity = data.activities[i];
        
        if (!activity.date) {
          errors.push(`Activity ${i + 1}: Date is required`);
        } else if (!parseDate(activity.date)) {
          errors.push(`Activity ${i + 1}: Invalid date format "${activity.date}"`);
        }
        
        if (activity.quantity === undefined || activity.quantity === null) {
          errors.push(`Activity ${i + 1}: quantity (hours) is required`);
        }
      }
    }

    // Validate calendar entries
    if (data.calendar_entries && Array.isArray(data.calendar_entries)) {
      summary.calendar_entries = data.calendar_entries.length;
      
      for (let i = 0; i < data.calendar_entries.length; i++) {
        const entry = data.calendar_entries[i];
        
        if (!entry.summary && !entry.name) {
          errors.push(`Calendar Entry ${i + 1}: summary (title) is required`);
        }
        
        if (!entry.start_at) {
          errors.push(`Calendar Entry ${i + 1}: start_at is required`);
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
      contacts: 0,
      matters: 0,
      activities: 0,
      calendar_entries: 0
    },
    errors: [],
    warnings: []
  };

  // Maps for linking
  const userMap = new Map(); // email -> user_id, also clio_id -> user_id
  const contactMap = new Map(); // name -> client_id, also clio_id -> client_id
  const matterMap = new Map(); // display_number -> matter_id, also clio_id -> matter_id

  try {
    await query('BEGIN');

    // ============================================
    // 1. CREATE FIRM
    // ============================================
    let firmName = data.firm.name;
    
    const existingFirm = await query('SELECT id FROM firms WHERE name = $1', [firmName]);
    if (existingFirm.rows.length > 0) {
      firmName = `${firmName} (Migrated ${new Date().toISOString().split('T')[0]})`;
      results.warnings.push(`Firm name already existed, created as "${firmName}"`);
    }

    // Parse Clio firm structure
    const firmAddress = parseAddress(data.firm.addresses);
    const firmPhone = parsePhoneNumbers(data.firm.phone_numbers) || data.firm.phone;
    const firmEmail = parseEmailAddresses(data.firm.email_addresses) || data.firm.email;

    const firmResult = await query(
      `INSERT INTO firms (name, address, city, state, zip_code, phone, email, website, billing_defaults)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        firmName,
        firmAddress.street || data.firm.address || null,
        firmAddress.city || data.firm.city || null,
        firmAddress.province || data.firm.state || null,
        firmAddress.postal_code || data.firm.zip_code || null,
        firmPhone,
        firmEmail,
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
          const userEmail = (user.email || parseEmailAddresses(user.email_addresses))?.toLowerCase();
          const userPhone = parsePhoneNumbers(user.phone_numbers) || user.phone;
          
          // Handle Clio name format
          let firstName = user.first_name;
          let lastName = user.last_name;
          if (!firstName && user.name) {
            const nameParts = user.name.split(' ');
            firstName = nameParts[0];
            lastName = nameParts.slice(1).join(' ') || 'User';
          }

          // Map Clio roles
          let role = user.role || 'staff';
          if (user.subscription_type === 'Owner' || user.is_owner) role = 'owner';
          else if (user.subscription_type === 'Attorney' || user.type === 'Attorney') role = 'attorney';
          else if (user.type === 'Paralegal') role = 'paralegal';

          const passwordHash = await bcrypt.hash(user.password, 12);
          
          const userResult = await query(
            `INSERT INTO users (firm_id, email, password_hash, first_name, last_name, role, phone, hourly_rate, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id`,
            [
              firmId,
              userEmail,
              passwordHash,
              firstName,
              lastName || 'User',
              role,
              userPhone,
              user.rate || user.hourly_rate || user.default_rate || null,
              user.enabled !== false && user.is_active !== false
            ]
          );
          
          userMap.set(userEmail, userResult.rows[0].id);
          if (user.id) userMap.set(`clio:${user.id}`, userResult.rows[0].id);
          if (user.name) userMap.set(user.name.toLowerCase(), userResult.rows[0].id);
          results.imported.users++;
        } catch (err) {
          results.errors.push(`Failed to create user ${user.email || user.name}: ${err.message}`);
        }
      }
    }

    // ============================================
    // 3. CREATE CONTACTS (Clio terminology for clients)
    // ============================================
    if (data.contacts && Array.isArray(data.contacts)) {
      for (const contact of data.contacts) {
        try {
          // Determine type (Clio uses "Person" or "Company")
          const contactType = contact.type?.toLowerCase() === 'company' ? 'company' : 'person';
          
          // Build display name (Clio format)
          let displayName = contact.name;
          if (!displayName) {
            if (contactType === 'company') {
              displayName = contact.company || contact.company_name || 'Unknown Company';
            } else {
              const parts = [contact.prefix, contact.first_name, contact.middle_name, contact.last_name, contact.suffix]
                .filter(Boolean);
              displayName = parts.length > 0 ? parts.join(' ') : 'Unknown Contact';
            }
          }

          // Parse Clio-format fields
          const email = parseEmailAddresses(contact.email_addresses) || contact.email;
          const phone = parsePhoneNumbers(contact.phone_numbers) || contact.phone;
          const address = parseAddress(contact.addresses);

          const clientResult = await query(
            `INSERT INTO clients (firm_id, type, display_name, first_name, last_name, company_name, email, phone, 
             address_street, address_city, address_state, address_zip, notes, tags, contact_type, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING id`,
            [
              firmId,
              contactType,
              displayName,
              contact.first_name || null,
              contact.last_name || null,
              contact.company || contact.company_name || null,
              email,
              phone,
              address.street || contact.address_street || null,
              address.city || contact.address_city || null,
              address.province || contact.address_state || null,
              address.postal_code || contact.address_zip || null,
              contact.notes || null,
              contact.tags || [],
              contact.contact_type || 'client',
              contact.is_active !== false
            ]
          );
          
          contactMap.set(displayName.toLowerCase(), clientResult.rows[0].id);
          if (contact.id) contactMap.set(`clio:${contact.id}`, clientResult.rows[0].id);
          if (contact.name) contactMap.set(contact.name.toLowerCase(), clientResult.rows[0].id);
          results.imported.contacts++;
        } catch (err) {
          results.errors.push(`Failed to create contact ${contact.name || contact.company}: ${err.message}`);
        }
      }
    }

    // ============================================
    // 4. CREATE MATTERS
    // ============================================
    if (data.matters && Array.isArray(data.matters)) {
      for (const matter of data.matters) {
        try {
          const matterNumber = matter.display_number || matter.number;
          const matterName = matter.description || matter.name;
          
          // Find client - Clio uses {client: {id, name}} or client_name
          let clientId = null;
          if (matter.client?.id) {
            clientId = contactMap.get(`clio:${matter.client.id}`);
          }
          if (!clientId && matter.client?.name) {
            clientId = contactMap.get(matter.client.name.toLowerCase());
          }
          if (!clientId && matter.client_name) {
            clientId = contactMap.get(matter.client_name.toLowerCase());
          }

          // Find responsible attorney - Clio uses {responsible_attorney: {id, name}}
          let responsibleAttorneyId = null;
          if (matter.responsible_attorney?.id) {
            responsibleAttorneyId = userMap.get(`clio:${matter.responsible_attorney.id}`);
          }
          if (!responsibleAttorneyId && matter.responsible_attorney?.name) {
            responsibleAttorneyId = userMap.get(matter.responsible_attorney.name.toLowerCase());
          }
          if (!responsibleAttorneyId && matter.responsible_attorney_name) {
            responsibleAttorneyId = userMap.get(matter.responsible_attorney_name.toLowerCase());
          }

          // Map Clio practice area
          const practiceArea = matter.practice_area?.name || matter.practice_area || matter.type || null;

          const matterResult = await query(
            `INSERT INTO matters (firm_id, client_id, number, name, description, type, status, priority,
             responsible_attorney, open_date, close_date, billing_type, billing_rate, tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             RETURNING id`,
            [
              firmId,
              clientId,
              matterNumber,
              matterName,
              matter.detailed_description || matter.description_notes || null,
              practiceArea,
              mapMatterStatus(matter.status),
              matter.priority || 'medium',
              responsibleAttorneyId,
              parseDate(matter.open_date),
              parseDate(matter.close_date),
              mapBillingMethod(matter.billing_method),
              matter.billing_rate || matter.rate || null,
              matter.tags || []
            ]
          );
          
          matterMap.set(matterNumber, matterResult.rows[0].id);
          if (matter.id) matterMap.set(`clio:${matter.id}`, matterResult.rows[0].id);
          results.imported.matters++;
        } catch (err) {
          results.errors.push(`Failed to create matter ${matter.display_number || matter.number}: ${err.message}`);
        }
      }
    }

    // ============================================
    // 5. CREATE ACTIVITIES (Clio's time/expense entries)
    // ============================================
    if (data.activities && Array.isArray(data.activities)) {
      for (const activity of data.activities) {
        try {
          // Find matter - Clio uses {matter: {id, display_number}}
          let matterId = null;
          if (activity.matter?.id) {
            matterId = matterMap.get(`clio:${activity.matter.id}`);
          }
          if (!matterId && activity.matter?.display_number) {
            matterId = matterMap.get(activity.matter.display_number);
          }
          if (!matterId && activity.matter_number) {
            matterId = matterMap.get(activity.matter_number);
          }
          
          if (!matterId) {
            results.warnings.push(`Activity skipped: Matter not found`);
            continue;
          }

          // Find user - Clio uses {user: {id, name}}
          let userId = null;
          if (activity.user?.id) {
            userId = userMap.get(`clio:${activity.user.id}`);
          }
          if (!userId && activity.user?.name) {
            userId = userMap.get(activity.user.name.toLowerCase());
          }
          if (!userId && activity.user_email) {
            userId = userMap.get(activity.user_email.toLowerCase());
          }

          // Clio uses "type" to distinguish TimeEntry vs ExpenseEntry
          const activityType = activity.type?.toLowerCase();
          const isExpense = activityType === 'expenseentry' || activityType === 'expense';

          if (isExpense) {
            // Create expense
            await query(
              `INSERT INTO expenses (firm_id, matter_id, user_id, date, description, amount, category, expense_type, billable, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                firmId,
                matterId,
                userId,
                parseDate(activity.date),
                activity.note || activity.activity_description || '',
                parseFloat(activity.total) || parseFloat(activity.quantity) || 0,
                activity.expense_category?.name || activity.category || null,
                'other',
                activity.non_billable !== true && activity.billable !== false,
                'pending'
              ]
            );
          } else {
            // Create time entry
            await query(
              `INSERT INTO time_entries (firm_id, matter_id, user_id, date, hours, description, billable, rate, activity_code, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                firmId,
                matterId,
                userId,
                parseDate(activity.date),
                parseFloat(activity.quantity) || 0,
                activity.note || activity.activity_description || '',
                activity.non_billable !== true && activity.billable !== false,
                parseFloat(activity.rate) || 0,
                activity.activity_description?.code || activity.utbms_code || null,
                'pending'
              ]
            );
          }
          
          results.imported.activities++;
        } catch (err) {
          results.errors.push(`Failed to create activity: ${err.message}`);
        }
      }
    }

    // ============================================
    // 6. CREATE CALENDAR ENTRIES
    // ============================================
    if (data.calendar_entries && Array.isArray(data.calendar_entries)) {
      for (const entry of data.calendar_entries) {
        try {
          // Find matter if linked
          let matterId = null;
          if (entry.matter?.id) {
            matterId = matterMap.get(`clio:${entry.matter.id}`);
          }
          if (!matterId && entry.matter?.display_number) {
            matterId = matterMap.get(entry.matter.display_number);
          }

          // Map Clio calendar entry types
          const typeMap = {
            'Court Date': 'court_date',
            'Deadline': 'deadline',
            'Meeting': 'meeting',
            'Task': 'task',
            'Reminder': 'reminder',
            'Hearing': 'court_date',
            'Deposition': 'deposition',
            'Closing': 'closing'
          };
          const eventType = typeMap[entry.type] || typeMap[entry.calendar_entry_type] || 'other';

          // Clio uses start_at and end_at
          const startTime = entry.start_at || entry.start_time;
          const endTime = entry.end_at || entry.end_time || startTime;

          await query(
            `INSERT INTO calendar_events (firm_id, matter_id, title, description, type, start_time, end_time, 
             all_day, location, color, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              firmId,
              matterId,
              entry.summary || entry.name || entry.title,
              entry.description || null,
              eventType,
              new Date(startTime).toISOString(),
              new Date(endTime).toISOString(),
              entry.all_day || entry.all_day_event || false,
              entry.location || null,
              entry.color || '#3B82F6',
              'confirmed'
            ]
          );
          
          results.imported.calendar_entries++;
        } catch (err) {
          results.errors.push(`Failed to create calendar entry "${entry.summary || entry.name}": ${err.message}`);
        }
      }
    }

    await query('COMMIT');
    results.success = true;

    logMigrationAudit('IMPORT_SUCCESS', { 
      firm_id: firmId, 
      firm_name: firmName,
      imported: results.imported 
    }, req.ip);

    res.json(results);

  } catch (error) {
    await query('ROLLBACK');
    
    logMigrationAudit('IMPORT_FAILED', { error: error.message }, req.ip);
    
    results.success = false;
    results.errors.push(`Migration failed: ${error.message}`);
    res.status(500).json(results);
  }
});

// ============================================
// GET CLIO-FORMAT TEMPLATE
// ============================================

router.get('/template', requireSecureAdmin, (req, res) => {
  // This template matches Clio's export format exactly
  const template = {
    // Migration metadata
    export_info: {
      source: "Clio",
      export_date: new Date().toISOString(),
      version: "1.0"
    },
    
    // Firm information
    firm: {
      name: "Smith & Associates LLP",
      phone_numbers: [
        { number: "555-123-4567", name: "Main", default_phone: true }
      ],
      email_addresses: [
        { address: "contact@smithlaw.com", name: "Main", default_email: true }
      ],
      addresses: [
        {
          street: "123 Legal Way, Suite 400",
          city: "Boston",
          province: "MA",
          postal_code: "02101",
          country: "United States",
          name: "Main",
          primary: true
        }
      ],
      website: "https://smithlaw.com"
    },
    
    // Users (attorneys, staff) - PASSWORD IS REQUIRED FOR IMPORT
    users: [
      {
        id: 12345,
        name: "Jane Smith",
        first_name: "Jane",
        last_name: "Smith",
        email: "jane@smithlaw.com",
        password: "SecurePassword123!",
        phone_numbers: [
          { number: "555-111-2222", name: "Mobile", default_phone: true }
        ],
        email_addresses: [
          { address: "jane@smithlaw.com", name: "Work", default_email: true }
        ],
        type: "Attorney",
        subscription_type: "Owner",
        enabled: true,
        rate: 400.00,
        default_rate: 400.00
      },
      {
        id: 12346,
        name: "Bob Johnson",
        first_name: "Bob",
        last_name: "Johnson",
        email: "bob@smithlaw.com",
        password: "SecurePassword456!",
        type: "Paralegal",
        enabled: true,
        rate: 150.00
      }
    ],
    
    // Contacts (clients and companies) - Clio format
    contacts: [
      {
        id: 67890,
        type: "Person",
        name: "John Doe",
        prefix: "Mr.",
        first_name: "John",
        middle_name: "Robert",
        last_name: "Doe",
        suffix: "Jr.",
        title: "CEO",
        company: "Doe Enterprises",
        email_addresses: [
          { address: "john.doe@email.com", name: "Personal", default_email: true },
          { address: "jdoe@doeenterprises.com", name: "Work", default_email: false }
        ],
        phone_numbers: [
          { number: "555-333-4444", name: "Mobile", default_phone: true },
          { number: "555-333-5555", name: "Work", default_phone: false }
        ],
        addresses: [
          {
            street: "456 Oak Avenue",
            city: "Boston",
            province: "MA",
            postal_code: "02102",
            country: "United States",
            name: "Home",
            primary: true
          }
        ],
        web_sites: [
          { address: "https://johndoe.com", name: "Personal" }
        ],
        notes: "VIP client - referred by existing client"
      },
      {
        id: 67891,
        type: "Company",
        name: "Acme Corporation",
        company: "Acme Corporation",
        email_addresses: [
          { address: "legal@acme.com", name: "Legal Department", default_email: true }
        ],
        phone_numbers: [
          { number: "555-555-5555", name: "Main", default_phone: true }
        ],
        addresses: [
          {
            street: "789 Corporate Blvd",
            city: "Chicago",
            province: "IL",
            postal_code: "60601",
            country: "United States",
            name: "Headquarters",
            primary: true
          }
        ]
      }
    ],
    
    // Matters (cases) - Clio format
    matters: [
      {
        id: 11111,
        display_number: "2024-0001",
        description: "Doe Estate Planning",
        detailed_description: "Complete estate planning including will, trust, and power of attorney documents",
        client: {
          id: 67890,
          name: "John Doe"
        },
        status: "Open",
        practice_area: {
          id: 1,
          name: "Estate Planning"
        },
        responsible_attorney: {
          id: 12345,
          name: "Jane Smith"
        },
        originating_attorney: {
          id: 12345,
          name: "Jane Smith"
        },
        open_date: "2024-01-15",
        close_date: null,
        pending_date: null,
        billable: true,
        billing_method: "hourly"
      },
      {
        id: 11112,
        display_number: "2024-0002",
        description: "Acme Corp Contract Review",
        client: {
          id: 67891,
          name: "Acme Corporation"
        },
        status: "Open",
        practice_area: {
          name: "Corporate"
        },
        responsible_attorney: {
          name: "Jane Smith"
        },
        open_date: "2024-02-01",
        billable: true,
        billing_method: "Flat Fee",
        billing_rate: 5000.00
      }
    ],
    
    // Activities (time entries and expenses) - Clio format
    activities: [
      {
        id: 99001,
        type: "TimeEntry",
        date: "2024-01-20",
        matter: {
          id: 11111,
          display_number: "2024-0001"
        },
        user: {
          id: 12345,
          name: "Jane Smith"
        },
        quantity: 2.5,
        rate: 400.00,
        total: 1000.00,
        note: "Initial client consultation regarding estate planning goals and family situation",
        activity_description: {
          name: "Client Conference",
          code: "L100"
        },
        non_billable: false,
        billed: false
      },
      {
        id: 99002,
        type: "TimeEntry",
        date: "2024-01-22",
        matter: {
          id: 11111,
          display_number: "2024-0001"
        },
        user: {
          id: 12345,
          name: "Jane Smith"
        },
        quantity: 3.0,
        rate: 400.00,
        total: 1200.00,
        note: "Draft will and revocable living trust documents",
        non_billable: false
      },
      {
        id: 99003,
        type: "TimeEntry",
        date: "2024-01-25",
        matter: {
          id: 11111,
          display_number: "2024-0001"
        },
        user: {
          id: 12346,
          name: "Bob Johnson"
        },
        quantity: 1.5,
        rate: 150.00,
        total: 225.00,
        note: "Research beneficiary designation requirements",
        non_billable: false
      },
      {
        id: 99004,
        type: "ExpenseEntry",
        date: "2024-01-26",
        matter: {
          id: 11111,
          display_number: "2024-0001"
        },
        user: {
          id: 12345,
          name: "Jane Smith"
        },
        quantity: 1,
        total: 75.00,
        note: "Recording fee for deed transfer",
        expense_category: {
          name: "Filing Fees"
        },
        non_billable: false
      }
    ],
    
    // Calendar entries - Clio format
    calendar_entries: [
      {
        id: 55001,
        summary: "Client Meeting - Doe Estate Review",
        description: "Review draft estate documents with John Doe",
        matter: {
          id: 11111,
          display_number: "2024-0001"
        },
        start_at: "2024-02-01T10:00:00-05:00",
        end_at: "2024-02-01T11:30:00-05:00",
        all_day: false,
        location: "Office Conference Room A",
        calendar_entry_type: "Meeting",
        attendees: [
          { name: "Jane Smith", email: "jane@smithlaw.com" },
          { name: "John Doe", email: "john.doe@email.com" }
        ],
        reminders: [
          { minutes: 60 },
          { minutes: 1440 }
        ]
      },
      {
        id: 55002,
        summary: "Statute of Limitations - Johnson Personal Injury",
        description: "Filing deadline for Johnson v. XYZ Corp",
        start_at: "2024-06-15T00:00:00-05:00",
        end_at: "2024-06-15T23:59:59-05:00",
        all_day: true,
        calendar_entry_type: "Deadline"
      },
      {
        id: 55003,
        summary: "Court Hearing - Acme Corp",
        description: "Motion hearing for preliminary injunction",
        matter: {
          display_number: "2024-0002"
        },
        start_at: "2024-03-20T09:00:00-05:00",
        end_at: "2024-03-20T12:00:00-05:00",
        all_day: false,
        location: "Suffolk County Superior Court, Room 4B",
        calendar_entry_type: "Court Date"
      }
    ]
  };

  res.json(template);
});

// ============================================
// MIGRATION HISTORY
// ============================================

router.get('/history', requireSecureAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT f.id, f.name, f.created_at,
             (SELECT COUNT(*) FROM users WHERE firm_id = f.id) as user_count,
             (SELECT COUNT(*) FROM clients WHERE firm_id = f.id) as contact_count,
             (SELECT COUNT(*) FROM matters WHERE firm_id = f.id) as matter_count,
             (SELECT COUNT(*) FROM time_entries WHERE firm_id = f.id) as activity_count
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
