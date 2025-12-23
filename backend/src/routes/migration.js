import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db/connection.js';

const router = Router();

// Azure OpenAI configuration (same as ai.js)
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT;
const API_VERSION = '2024-02-15-preview';

// Helper to call Azure OpenAI (same as ai.js)
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
      temperature: options.temperature ?? 0.3, // Lower temperature for more consistent data transformation
      max_tokens: options.max_tokens ?? 8000,
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

/*
================================================================================
CLIO TO APEX LEGAL MIGRATION API
================================================================================
This migration API accepts data in Clio's exact export format and maps it
to the Apex Legal platform database schema.

FIELD MAPPING REFERENCE:
------------------------
CLIO FIELD                    → APEX FIELD
----------------------------------------------------------------------------------------
CONTACTS:
  id                          → (used for linking, stored in migration map)
  type: "Person"/"Company"    → type: "person"/"company"
  name                        → display_name
  first_name                  → first_name
  last_name                   → last_name
  company                     → company_name
  email_addresses[0].address  → email
  phone_numbers[0].number     → phone
  addresses[0].street         → address_street
  addresses[0].city           → address_city
  addresses[0].province       → address_state
  addresses[0].postal_code    → address_zip

MATTERS:
  id                          → (used for linking)
  display_number              → number
  description                 → name
  client.id/name              → client_id (looked up)
  status: "Open"/"Pending"/"Closed" → status: "active"/"pending"/"closed"
  practice_area.name          → type
  responsible_attorney.id/name → responsible_attorney (looked up)
  open_date                   → open_date
  close_date                  → close_date
  billing_method              → billing_type

ACTIVITIES (Time Entries):
  id                          → (not stored)
  type: "TimeEntry"           → (creates time_entries record)
  type: "ExpenseEntry"        → (creates expenses record)
  date                        → date
  matter.id/display_number    → matter_id (looked up)
  user.id/name                → user_id (looked up)
  quantity                    → hours (for time) / amount (for expense)
  rate                        → rate
  total                       → (calculated)
  note                        → description
  activity_description        → activity_code
  non_billable                → billable (inverted)

CALENDAR ENTRIES:
  id                          → (not stored)
  summary                     → title
  description                 → description
  matter.id/display_number    → matter_id (looked up)
  start_at                    → start_time
  end_at                      → end_time
  all_day                     → all_day
  location                    → location
  calendar_entry_type         → type (mapped)
================================================================================
*/

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
// CLIO FORMAT PARSERS
// ============================================

/**
 * Parse date from various formats (Clio uses YYYY-MM-DD and MM/DD/YYYY)
 */
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  
  // ISO format: 2024-01-15 or 2024-01-15T00:00:00Z
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.split('T')[0];
  }
  
  // US format: MM/DD/YYYY or M/D/YYYY
  const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Try native parsing
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  
  return null;
};

/**
 * Parse datetime for calendar events
 */
const parseDateTime = (dateTimeStr) => {
  if (!dateTimeStr) return null;
  const parsed = new Date(dateTimeStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return null;
};

/**
 * Extract primary email from Clio email_addresses array
 * Clio format: [{address: "email@example.com", name: "Work", default_email: true}]
 */
const extractEmail = (emailAddresses, fallbackEmail) => {
  if (fallbackEmail && typeof fallbackEmail === 'string') return fallbackEmail;
  if (!emailAddresses || !Array.isArray(emailAddresses)) return null;
  
  const defaultEmail = emailAddresses.find(e => e.default_email);
  if (defaultEmail) return defaultEmail.address;
  if (emailAddresses.length > 0) return emailAddresses[0].address;
  return null;
};

/**
 * Extract primary phone from Clio phone_numbers array
 * Clio format: [{number: "555-123-4567", name: "Mobile", default_phone: true}]
 */
const extractPhone = (phoneNumbers, fallbackPhone) => {
  if (fallbackPhone && typeof fallbackPhone === 'string') return fallbackPhone;
  if (!phoneNumbers || !Array.isArray(phoneNumbers)) return null;
  
  const defaultPhone = phoneNumbers.find(p => p.default_phone);
  if (defaultPhone) return defaultPhone.number;
  if (phoneNumbers.length > 0) return phoneNumbers[0].number;
  return null;
};

/**
 * Extract primary address from Clio addresses array
 * Clio format: [{street: "123 Main St", city: "Boston", province: "MA", postal_code: "02101", primary: true}]
 */
const extractAddress = (addresses) => {
  if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
    return { street: null, city: null, state: null, zip: null };
  }
  
  const primary = addresses.find(a => a.primary) || addresses[0];
  return {
    street: primary.street || null,
    city: primary.city || null,
    state: primary.province || primary.state || null,
    zip: primary.postal_code || primary.zip_code || null
  };
};

/**
 * Map Clio status to Apex status
 */
const mapMatterStatus = (clioStatus) => {
  if (!clioStatus) return 'active';
  const status = clioStatus.toLowerCase();
  if (status === 'open') return 'active';
  if (status === 'pending') return 'pending';
  if (status === 'closed') return 'closed';
  return 'active';
};

/**
 * Map Clio billing method to Apex billing type
 */
const mapBillingType = (clioMethod) => {
  if (!clioMethod) return 'hourly';
  const method = clioMethod.toLowerCase().replace(/[^a-z]/g, '');
  if (method === 'hourly') return 'hourly';
  if (method === 'flat' || method === 'flatfee') return 'flat';
  if (method === 'contingency') return 'contingency';
  if (method === 'retainer') return 'retainer';
  if (method === 'nonbillable' || method === 'probono') return 'pro_bono';
  return 'hourly';
};

/**
 * Map Clio user type to Apex role
 */
const mapUserRole = (clioUser) => {
  if (clioUser.subscription_type === 'Owner' || clioUser.is_owner) return 'owner';
  if (clioUser.subscription_type === 'Admin' || clioUser.is_admin) return 'admin';
  
  const type = (clioUser.type || '').toLowerCase();
  if (type === 'attorney' || type === 'lawyer') return 'attorney';
  if (type === 'paralegal') return 'paralegal';
  if (type === 'billing') return 'billing';
  
  return 'staff';
};

/**
 * Map Clio calendar entry type to Apex event type
 */
const mapCalendarType = (clioType) => {
  if (!clioType) return 'other';
  const type = clioType.toLowerCase().replace(/[^a-z]/g, '');
  
  const typeMap = {
    'meeting': 'meeting',
    'courtdate': 'court_date',
    'court': 'court_date',
    'hearing': 'court_date',
    'deadline': 'deadline',
    'duedate': 'deadline',
    'reminder': 'reminder',
    'task': 'task',
    'todo': 'task',
    'deposition': 'deposition',
    'closing': 'closing',
    'trial': 'court_date'
  };
  
  return typeMap[type] || 'other';
};

/**
 * Validate email format
 */
const isValidEmail = (email) => {
  if (!email) return false;
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
    // Validate required structure
    if (!data) {
      return res.status(400).json({ valid: false, errors: ['No data provided'], warnings: [], summary });
    }

    // Validate firm (required)
    if (!data.firm) {
      errors.push('Firm data is required');
    } else if (!data.firm.name) {
      errors.push('Firm name is required');
    } else {
      summary.firm = data.firm.name;
      const existingFirm = await query('SELECT id FROM firms WHERE name = $1', [data.firm.name]);
      if (existingFirm.rows.length > 0) {
        warnings.push(`Firm "${data.firm.name}" already exists - will create with unique name`);
      }
    }

    // Validate users (required - need at least one with password)
    if (!data.users || !Array.isArray(data.users) || data.users.length === 0) {
      errors.push('At least one user is required');
    } else {
      summary.users = data.users.length;
      const seenEmails = new Set();
      
      for (let i = 0; i < data.users.length; i++) {
        const user = data.users[i];
        const email = extractEmail(user.email_addresses, user.email);
        const idx = i + 1;
        
        if (!email) {
          errors.push(`User #${idx}: Email is required`);
        } else if (!isValidEmail(email)) {
          errors.push(`User #${idx}: Invalid email format "${email}"`);
        } else {
          const emailLower = email.toLowerCase();
          if (seenEmails.has(emailLower)) {
            errors.push(`User #${idx}: Duplicate email "${email}"`);
          } else {
            seenEmails.add(emailLower);
            const existing = await query('SELECT id FROM users WHERE email = $1', [emailLower]);
            if (existing.rows.length > 0) {
              errors.push(`User #${idx}: Email "${email}" already exists in the system`);
            }
          }
        }
        
        if (!user.password || user.password.length < 8) {
          errors.push(`User #${idx} (${email || 'no email'}): Password is required (min 8 characters)`);
        }
        
        const firstName = user.first_name || (user.name ? user.name.split(' ')[0] : null);
        if (!firstName) {
          errors.push(`User #${idx} (${email || 'no email'}): First name is required`);
        }
      }
    }

    // Validate contacts
    if (data.contacts && Array.isArray(data.contacts)) {
      summary.contacts = data.contacts.length;
      
      for (let i = 0; i < data.contacts.length; i++) {
        const contact = data.contacts[i];
        const idx = i + 1;
        
        const hasName = contact.name || contact.first_name || contact.company;
        if (!hasName) {
          errors.push(`Contact #${idx}: Must have name, first_name, or company`);
        }
        
        if (contact.type && !['Person', 'Company', 'person', 'company'].includes(contact.type)) {
          warnings.push(`Contact #${idx}: Unknown type "${contact.type}", will use "person"`);
        }
      }
    }

    // Validate matters
    if (data.matters && Array.isArray(data.matters)) {
      summary.matters = data.matters.length;
      const seenNumbers = new Set();
      
      for (let i = 0; i < data.matters.length; i++) {
        const matter = data.matters[i];
        const idx = i + 1;
        const matterNum = matter.display_number || matter.number;
        
        if (!matterNum) {
          errors.push(`Matter #${idx}: display_number is required`);
        } else if (seenNumbers.has(matterNum)) {
          errors.push(`Matter #${idx}: Duplicate matter number "${matterNum}"`);
        } else {
          seenNumbers.add(matterNum);
        }
        
        if (!matter.description && !matter.name) {
          errors.push(`Matter #${idx}: description (matter name) is required`);
        }
      }
    }

    // Validate activities
    if (data.activities && Array.isArray(data.activities)) {
      summary.activities = data.activities.length;
      
      for (let i = 0; i < data.activities.length; i++) {
        const activity = data.activities[i];
        const idx = i + 1;
        
        if (!activity.date) {
          errors.push(`Activity #${idx}: date is required`);
        } else if (!parseDate(activity.date)) {
          errors.push(`Activity #${idx}: Invalid date format "${activity.date}"`);
        }
        
        if (activity.quantity === undefined || activity.quantity === null) {
          errors.push(`Activity #${idx}: quantity is required`);
        }
        
        const matterRef = activity.matter?.display_number || activity.matter?.id;
        if (!matterRef) {
          warnings.push(`Activity #${idx}: No matter reference - will be skipped`);
        }
      }
    }

    // Validate calendar entries
    if (data.calendar_entries && Array.isArray(data.calendar_entries)) {
      summary.calendar_entries = data.calendar_entries.length;
      
      for (let i = 0; i < data.calendar_entries.length; i++) {
        const entry = data.calendar_entries[i];
        const idx = i + 1;
        
        if (!entry.summary && !entry.name) {
          errors.push(`Calendar Entry #${idx}: summary is required`);
        }
        
        if (!entry.start_at) {
          errors.push(`Calendar Entry #${idx}: start_at is required`);
        }
      }
    }

    logMigrationAudit('VALIDATE', { 
      firm: summary.firm,
      errors: errors.length, 
      warnings: warnings.length 
    }, req.ip);

    res.json({
      valid: errors.length === 0,
      errors,
      warnings,
      summary
    });

  } catch (error) {
    console.error('Migration validation error:', error);
    res.status(500).json({ 
      valid: false, 
      errors: ['Validation failed: ' + error.message], 
      warnings: [], 
      summary 
    });
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
    firm_name: null,
    imported: {
      users: 0,
      contacts: 0,
      matters: 0,
      time_entries: 0,
      expenses: 0,
      calendar_entries: 0
    },
    user_credentials: [], // Store user emails and passwords
    errors: [],
    warnings: []
  };

  // Lookup maps for linking records
  const userIdMap = new Map();    // clio_id OR email -> apex_user_id
  const contactIdMap = new Map(); // clio_id OR name -> apex_client_id
  const matterIdMap = new Map();  // clio_id OR display_number -> apex_matter_id

  try {
    await query('BEGIN');

    // ============================================
    // 1. CREATE FIRM
    // ============================================
    let firmName = data.firm.name;
    
    const existingFirm = await query('SELECT id FROM firms WHERE name = $1', [firmName]);
    if (existingFirm.rows.length > 0) {
      const timestamp = new Date().toISOString().split('T')[0];
      firmName = `${firmName} (Imported ${timestamp})`;
      results.warnings.push(`Firm already exists, created as "${firmName}"`);
    }

    const firmAddress = extractAddress(data.firm.addresses);
    
    const firmResult = await query(
      `INSERT INTO firms (name, address, city, state, zip_code, phone, email, website, billing_defaults)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        firmName,
        firmAddress.street || data.firm.address || null,
        firmAddress.city || data.firm.city || null,
        firmAddress.state || data.firm.state || null,
        firmAddress.zip || data.firm.zip_code || null,
        extractPhone(data.firm.phone_numbers, data.firm.phone),
        extractEmail(data.firm.email_addresses, data.firm.email),
        data.firm.website || null,
        JSON.stringify({
          hourlyRate: data.firm.default_rate || 350,
          incrementMinutes: 6,
          paymentTerms: 30,
          currency: "USD"
        })
      ]
    );
    
    const firmId = firmResult.rows[0].id;
    results.firm_id = firmId;
    results.firm_name = firmName;

    // ============================================
    // 2. CREATE USERS
    // ============================================
    if (data.users && Array.isArray(data.users)) {
      for (const user of data.users) {
        try {
          const email = extractEmail(user.email_addresses, user.email)?.toLowerCase();
          if (!email) continue;
          
          // Parse name
          let firstName = user.first_name;
          let lastName = user.last_name;
          if (!firstName && user.name) {
            const parts = user.name.trim().split(/\s+/);
            firstName = parts[0];
            lastName = parts.slice(1).join(' ') || 'User';
          }
          
          const passwordHash = await bcrypt.hash(user.password, 12);
          
          const userResult = await query(
            `INSERT INTO users (firm_id, email, password_hash, first_name, last_name, role, phone, hourly_rate, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id`,
            [
              firmId,
              email,
              passwordHash,
              firstName,
              lastName || 'User',
              mapUserRole(user),
              extractPhone(user.phone_numbers, user.phone),
              user.rate || user.default_rate || user.hourly_rate || null,
              user.enabled !== false && user.is_active !== false
            ]
          );
          
          const userId = userResult.rows[0].id;
          userIdMap.set(email, userId);
          if (user.id) userIdMap.set(`clio:${user.id}`, userId);
          if (user.name) userIdMap.set(user.name.toLowerCase(), userId);
          
          // Store credentials for display
          results.user_credentials.push({
            email: email,
            name: `${firstName} ${lastName || ''}`.trim(),
            password: user.password, // Original password before hashing
            role: mapUserRole(user)
          });
          
          results.imported.users++;
        } catch (err) {
          results.errors.push(`User "${user.email || user.name}": ${err.message}`);
        }
      }
    }

    // ============================================
    // 3. CREATE CONTACTS (Clients)
    // ============================================
    if (data.contacts && Array.isArray(data.contacts)) {
      for (const contact of data.contacts) {
        try {
          // Determine type
          const isCompany = contact.type?.toLowerCase() === 'company';
          
          // Build display name
          let displayName = contact.name;
          if (!displayName) {
            if (isCompany) {
              displayName = contact.company || 'Unknown Company';
            } else {
              const parts = [contact.prefix, contact.first_name, contact.middle_name, contact.last_name, contact.suffix]
                .filter(Boolean);
              displayName = parts.join(' ') || 'Unknown Contact';
            }
          }
          
          const address = extractAddress(contact.addresses);
          
          const clientResult = await query(
            `INSERT INTO clients (firm_id, type, display_name, first_name, last_name, company_name, 
             email, phone, address_street, address_city, address_state, address_zip, notes, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             RETURNING id`,
            [
              firmId,
              isCompany ? 'company' : 'person',
              displayName,
              contact.first_name || null,
              contact.last_name || null,
              contact.company || null,
              extractEmail(contact.email_addresses, contact.email),
              extractPhone(contact.phone_numbers, contact.phone),
              address.street,
              address.city,
              address.state,
              address.zip,
              contact.notes || null,
              true
            ]
          );
          
          const clientId = clientResult.rows[0].id;
          contactIdMap.set(displayName.toLowerCase(), clientId);
          if (contact.id) contactIdMap.set(`clio:${contact.id}`, clientId);
          if (contact.name) contactIdMap.set(contact.name.toLowerCase(), clientId);
          
          results.imported.contacts++;
        } catch (err) {
          results.errors.push(`Contact "${contact.name || contact.company}": ${err.message}`);
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
          
          // Find client
          let clientId = null;
          if (matter.client) {
            if (matter.client.id) {
              clientId = contactIdMap.get(`clio:${matter.client.id}`);
            }
            if (!clientId && matter.client.name) {
              clientId = contactIdMap.get(matter.client.name.toLowerCase());
            }
          }
          
          // Find responsible attorney
          let attorneyId = null;
          if (matter.responsible_attorney) {
            if (matter.responsible_attorney.id) {
              attorneyId = userIdMap.get(`clio:${matter.responsible_attorney.id}`);
            }
            if (!attorneyId && matter.responsible_attorney.name) {
              attorneyId = userIdMap.get(matter.responsible_attorney.name.toLowerCase());
            }
          }
          
          const matterResult = await query(
            `INSERT INTO matters (firm_id, client_id, number, name, description, type, status, priority,
             responsible_attorney, open_date, close_date, billing_type, billing_rate)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING id`,
            [
              firmId,
              clientId,
              matterNumber,
              matterName,
              matter.detailed_description || null,
              matter.practice_area?.name || matter.practice_area || null,
              mapMatterStatus(matter.status),
              'medium',
              attorneyId,
              parseDate(matter.open_date),
              parseDate(matter.close_date),
              mapBillingType(matter.billing_method),
              matter.billing_rate || null
            ]
          );
          
          const matterId = matterResult.rows[0].id;
          matterIdMap.set(matterNumber, matterId);
          if (matter.id) matterIdMap.set(`clio:${matter.id}`, matterId);
          
          results.imported.matters++;
        } catch (err) {
          results.errors.push(`Matter "${matter.display_number || matter.number}": ${err.message}`);
        }
      }
    }

    // ============================================
    // 5. CREATE ACTIVITIES (Time Entries & Expenses)
    // ============================================
    if (data.activities && Array.isArray(data.activities)) {
      for (const activity of data.activities) {
        try {
          // Find matter
          let matterId = null;
          if (activity.matter) {
            if (activity.matter.id) {
              matterId = matterIdMap.get(`clio:${activity.matter.id}`);
            }
            if (!matterId && activity.matter.display_number) {
              matterId = matterIdMap.get(activity.matter.display_number);
            }
          }
          
          if (!matterId) {
            results.warnings.push(`Activity skipped: Matter not found`);
            continue;
          }
          
          // Find user
          let userId = null;
          if (activity.user) {
            if (activity.user.id) {
              userId = userIdMap.get(`clio:${activity.user.id}`);
            }
            if (!userId && activity.user.name) {
              userId = userIdMap.get(activity.user.name.toLowerCase());
            }
          }
          
          const activityType = (activity.type || '').toLowerCase();
          const isExpense = activityType.includes('expense');
          
          if (isExpense) {
            // Create expense record
            await query(
              `INSERT INTO expenses (firm_id, matter_id, user_id, date, description, amount, category, billable, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [
                firmId,
                matterId,
                userId,
                parseDate(activity.date),
                activity.note || activity.activity_description?.name || 'Expense',
                parseFloat(activity.total) || parseFloat(activity.quantity) || 0,
                activity.expense_category?.name || 'Other',
                activity.non_billable !== true,
                'pending'
              ]
            );
            results.imported.expenses++;
          } else {
            // Create time entry record
            await query(
              `INSERT INTO time_entries (firm_id, matter_id, user_id, date, hours, description, billable, rate, activity_code, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                firmId,
                matterId,
                userId,
                parseDate(activity.date),
                parseFloat(activity.quantity) || 0,
                activity.note || activity.activity_description?.name || 'Time entry',
                activity.non_billable !== true,
                parseFloat(activity.rate) || 0,
                activity.activity_description?.code || null,
                'pending'
              ]
            );
            results.imported.time_entries++;
          }
        } catch (err) {
          results.errors.push(`Activity: ${err.message}`);
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
          if (entry.matter) {
            if (entry.matter.id) {
              matterId = matterIdMap.get(`clio:${entry.matter.id}`);
            }
            if (!matterId && entry.matter.display_number) {
              matterId = matterIdMap.get(entry.matter.display_number);
            }
          }
          
          const startTime = parseDateTime(entry.start_at);
          const endTime = parseDateTime(entry.end_at) || startTime;
          
          if (!startTime) {
            results.warnings.push(`Calendar entry "${entry.summary}" skipped: Invalid start time`);
            continue;
          }
          
          await query(
            `INSERT INTO calendar_events (firm_id, matter_id, title, description, type, start_time, end_time, all_day, location, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              firmId,
              matterId,
              entry.summary || entry.name || 'Untitled Event',
              entry.description || null,
              mapCalendarType(entry.calendar_entry_type || entry.type),
              startTime,
              endTime,
              entry.all_day === true,
              entry.location || null,
              'confirmed'
            ]
          );
          
          results.imported.calendar_entries++;
        } catch (err) {
          results.errors.push(`Calendar entry "${entry.summary}": ${err.message}`);
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
    await query('ROLLBACK');
    
    logMigrationAudit('IMPORT_FAILED', { error: error.message }, req.ip);
    
    results.success = false;
    results.errors.push(`Migration failed: ${error.message}`);
    res.status(500).json(results);
  }
});

// ============================================
// GET CLIO FORMAT TEMPLATE
// ============================================

router.get('/template', requireSecureAdmin, (req, res) => {
  // This matches Clio's exact export structure
  const template = {
    // Firm information
    firm: {
      name: "Smith & Associates LLP",
      phone_numbers: [
        { number: "555-123-4567", name: "Main", default_phone: true }
      ],
      email_addresses: [
        { address: "info@smithlaw.com", name: "Main", default_email: true }
      ],
      addresses: [
        {
          street: "123 Legal Way, Suite 400",
          city: "Boston",
          province: "MA",
          postal_code: "02101",
          country: "United States",
          name: "Office",
          primary: true
        }
      ],
      website: "https://smithlaw.com"
    },
    
    // Users - PASSWORD FIELD IS REQUIRED FOR IMPORT
    users: [
      {
        id: 100001,
        name: "Jane Smith",
        first_name: "Jane",
        last_name: "Smith",
        email_addresses: [
          { address: "jane@smithlaw.com", name: "Work", default_email: true }
        ],
        phone_numbers: [
          { number: "555-100-0001", name: "Mobile", default_phone: true }
        ],
        type: "Attorney",
        subscription_type: "Owner",
        enabled: true,
        rate: 400.00,
        password: "ChangeMe123!"
      },
      {
        id: 100002,
        name: "Bob Johnson",
        first_name: "Bob",
        last_name: "Johnson",
        email_addresses: [
          { address: "bob@smithlaw.com", name: "Work", default_email: true }
        ],
        type: "Paralegal",
        enabled: true,
        rate: 150.00,
        password: "ChangeMe123!"
      }
    ],
    
    // Contacts (clients) - Clio format
    contacts: [
      {
        id: 200001,
        type: "Person",
        name: "John Doe",
        prefix: "Mr.",
        first_name: "John",
        middle_name: "Robert",
        last_name: "Doe",
        suffix: "Jr.",
        title: "CEO",
        company: "Doe Industries",
        email_addresses: [
          { address: "john.doe@email.com", name: "Personal", default_email: true },
          { address: "jdoe@doeindustries.com", name: "Work", default_email: false }
        ],
        phone_numbers: [
          { number: "555-200-0001", name: "Mobile", default_phone: true },
          { number: "555-200-0002", name: "Work", default_phone: false }
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
        notes: "VIP client - referred by existing client Sarah Williams"
      },
      {
        id: 200002,
        type: "Company",
        name: "Acme Corporation",
        company: "Acme Corporation",
        email_addresses: [
          { address: "legal@acme.com", name: "Legal Dept", default_email: true }
        ],
        phone_numbers: [
          { number: "555-200-0003", name: "Main", default_phone: true }
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
    
    // Matters - Clio format
    matters: [
      {
        id: 300001,
        display_number: "2024-0001",
        description: "Doe Estate Planning",
        detailed_description: "Complete estate planning including will, revocable trust, healthcare proxy, and power of attorney",
        client: {
          id: 200001,
          name: "John Doe"
        },
        status: "Open",
        practice_area: {
          id: 1,
          name: "Estate Planning"
        },
        responsible_attorney: {
          id: 100001,
          name: "Jane Smith"
        },
        originating_attorney: {
          id: 100001,
          name: "Jane Smith"
        },
        open_date: "2024-01-15",
        close_date: null,
        billable: true,
        billing_method: "hourly"
      },
      {
        id: 300002,
        display_number: "2024-0002",
        description: "Acme Corp - Contract Review",
        detailed_description: "Review and negotiate vendor contracts for Q1 2024",
        client: {
          id: 200002,
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
        billing_method: "Flat Fee",
        billing_rate: 5000.00
      }
    ],
    
    // Activities (time entries and expenses) - Clio format
    activities: [
      {
        id: 400001,
        type: "TimeEntry",
        date: "2024-01-20",
        matter: {
          id: 300001,
          display_number: "2024-0001"
        },
        user: {
          id: 100001,
          name: "Jane Smith"
        },
        quantity: 2.5,
        rate: 400.00,
        total: 1000.00,
        note: "Initial client consultation - discussed estate planning goals, family situation, and asset overview",
        activity_description: {
          name: "Client Conference",
          code: "L100"
        },
        non_billable: false,
        billed: false
      },
      {
        id: 400002,
        type: "TimeEntry",
        date: "2024-01-22",
        matter: {
          id: 300001,
          display_number: "2024-0001"
        },
        user: {
          id: 100001,
          name: "Jane Smith"
        },
        quantity: 3.0,
        rate: 400.00,
        total: 1200.00,
        note: "Drafted revocable living trust and pour-over will",
        activity_description: {
          name: "Document Drafting",
          code: "L110"
        },
        non_billable: false
      },
      {
        id: 400003,
        type: "TimeEntry",
        date: "2024-01-23",
        matter: {
          id: 300001,
          display_number: "2024-0001"
        },
        user: {
          id: 100002,
          name: "Bob Johnson"
        },
        quantity: 1.5,
        rate: 150.00,
        total: 225.00,
        note: "Researched beneficiary designation requirements for retirement accounts",
        non_billable: false
      },
      {
        id: 400004,
        type: "ExpenseEntry",
        date: "2024-01-25",
        matter: {
          id: 300001,
          display_number: "2024-0001"
        },
        user: {
          id: 100001,
          name: "Jane Smith"
        },
        quantity: 1,
        total: 75.00,
        note: "Recording fee for deed transfer to trust",
        expense_category: {
          id: 1,
          name: "Filing Fees"
        },
        non_billable: false
      }
    ],
    
    // Calendar entries - Clio format
    calendar_entries: [
      {
        id: 500001,
        summary: "Client Meeting - Doe Estate Review",
        description: "Review and sign final estate planning documents with John Doe",
        matter: {
          id: 300001,
          display_number: "2024-0001"
        },
        start_at: "2024-02-01T10:00:00-05:00",
        end_at: "2024-02-01T11:30:00-05:00",
        all_day: false,
        location: "Conference Room A",
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
        id: 500002,
        summary: "Filing Deadline - Johnson Case",
        description: "Statute of limitations expires - must file complaint",
        start_at: "2024-06-15T00:00:00-05:00",
        end_at: "2024-06-15T23:59:59-05:00",
        all_day: true,
        calendar_entry_type: "Deadline"
      },
      {
        id: 500003,
        summary: "Court Hearing - Acme Corp Motion",
        description: "Motion hearing for preliminary injunction",
        matter: {
          display_number: "2024-0002"
        },
        start_at: "2024-03-20T09:00:00-05:00",
        end_at: "2024-03-20T12:00:00-05:00",
        all_day: false,
        location: "Suffolk County Superior Court, Courtroom 4B",
        calendar_entry_type: "Court Date"
      }
    ]
  };

  res.json(template);
});

// ============================================
// DIRECT CSV PARSING (No AI - faster & more reliable)
// ============================================

/**
 * Parse CSV string into array of objects
 */
const parseCSV = (csvString, expectedHeaders = null) => {
  if (!csvString || !csvString.trim()) return [];
  
  const lines = csvString.trim().split('\n').map(line => line.trim()).filter(line => line);
  if (lines.length === 0) return [];
  
  // Detect delimiter (comma or tab)
  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') ? '\t' : ',';
  
  // Parse header row
  const headers = firstLine.split(delimiter).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  
  // Parse data rows
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
    if (values.length === 0 || (values.length === 1 && !values[0])) continue;
    
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    results.push(row);
  }
  
  return results;
};

/**
 * Map CSV headers to our format (handles various naming conventions)
 */
const mapHeader = (header) => {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // User mappings
  if (['email', 'emailaddress', 'useremail'].includes(h)) return 'email';
  if (['firstname', 'first', 'fname'].includes(h)) return 'first_name';
  if (['lastname', 'last', 'lname'].includes(h)) return 'last_name';
  if (['name', 'fullname', 'username'].includes(h)) return 'name';
  if (['role', 'type', 'usertype', 'position'].includes(h)) return 'role';
  if (['rate', 'hourlyrate', 'billingrate'].includes(h)) return 'rate';
  if (['phone', 'phonenumber', 'telephone'].includes(h)) return 'phone';
  
  // Client mappings
  if (['company', 'companyname', 'organization'].includes(h)) return 'company';
  if (['clienttype', 'contacttype'].includes(h)) return 'type';
  if (['street', 'address', 'streetaddress', 'address1'].includes(h)) return 'street';
  if (['city'].includes(h)) return 'city';
  if (['state', 'province', 'region'].includes(h)) return 'state';
  if (['zip', 'zipcode', 'postalcode', 'postal'].includes(h)) return 'zip';
  
  // Matter mappings
  if (['matternumber', 'matterno', 'casenumber', 'caseno', 'number', 'displaynumber'].includes(h)) return 'number';
  if (['mattername', 'casename', 'description', 'title'].includes(h)) return 'matter_name';
  if (['client', 'clientname'].includes(h)) return 'client_name';
  if (['attorney', 'responsibleattorney', 'assignedto', 'assignee'].includes(h)) return 'attorney_name';
  if (['status', 'matterstatus', 'casestatus'].includes(h)) return 'status';
  if (['practicearea', 'area', 'category', 'mattertype'].includes(h)) return 'practice_area';
  if (['opendate', 'opened', 'dateopen', 'startdate'].includes(h)) return 'open_date';
  if (['closedate', 'closed', 'dateclosed', 'enddate'].includes(h)) return 'close_date';
  if (['billingmethod', 'billingtype'].includes(h)) return 'billing_method';
  
  // Time entry mappings
  if (['date', 'entrydate', 'workdate'].includes(h)) return 'date';
  if (['hours', 'quantity', 'duration', 'time'].includes(h)) return 'hours';
  if (['note', 'notes', 'description', 'memo', 'narrative'].includes(h)) return 'description';
  if (['matter', 'matterref', 'matterid'].includes(h)) return 'matter_ref';
  if (['user', 'attorney', 'timekeeper'].includes(h)) return 'user_name';
  if (['billable', 'isbillable'].includes(h)) return 'billable';
  if (['amount', 'total'].includes(h)) return 'amount';
  
  // Calendar mappings
  if (['summary', 'title', 'subject', 'eventname'].includes(h)) return 'title';
  if (['start', 'startat', 'starttime', 'startdate', 'begins'].includes(h)) return 'start_at';
  if (['end', 'endat', 'endtime', 'enddate', 'ends'].includes(h)) return 'end_at';
  if (['location', 'place', 'venue'].includes(h)) return 'location';
  if (['eventtype', 'calendartype', 'type'].includes(h)) return 'event_type';
  if (['allday', 'alldayevent'].includes(h)) return 'all_day';
  
  return header;
};

/**
 * Direct CSV parsing endpoint - no AI, just structured parsing
 */
// Simple test endpoint
router.get('/test', (req, res) => {
  res.json({ status: 'ok', message: 'Migration routes working' });
});

router.post('/parse-csv', requireSecureAdmin, (req, res) => {
  try {
    console.log('[PARSE-CSV] Request received, body size:', JSON.stringify(req.body || {}).length);
    
    const body = req.body || {};
    
    const result = {
      firm: {
        name: String(body.firmName || 'Imported Firm'),
        email: body.firmEmail ? String(body.firmEmail) : null,
        phone: body.firmPhone ? String(body.firmPhone) : null,
        address: body.firmAddress ? String(body.firmAddress) : null
      },
      users: [],
      contacts: [],
      matters: [],
      activities: [],
      calendar_entries: []
    };

    // Parse users if provided
    try {
      if (body.users && typeof body.users === 'string' && body.users.trim()) {
        console.log('[PARSE-CSV] Parsing users, length:', body.users.length);
        const lines = body.users.trim().split('\n');
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line || !line.trim()) continue;
          const parts = line.split(',').map(p => (p || '').trim());
          if (parts.length >= 2) {
            const name = String(parts[0] || 'User');
            const nameParts = name.split(' ');
            const firstName = nameParts[0] || 'User';
            result.users.push({
              email: String(parts[1] || `user${i}@temp.com`),
              first_name: firstName,
              last_name: nameParts.slice(1).join(' ') || 'Import',
              type: String(parts[2] || 'Attorney'),
              rate: parseFloat(String(parts[3] || '0').replace(/[$,]/g, '')) || null,
              password: firstName + Math.floor(1000 + Math.random() * 9000) + '!'
            });
          }
        }
        console.log('[PARSE-CSV] Users parsed:', result.users.length);
      }
    } catch (userErr) {
      console.error('[PARSE-CSV] User parse error:', userErr.message);
    }

    // Parse clients if provided
    try {
      if (body.clients && typeof body.clients === 'string' && body.clients.trim()) {
        console.log('[PARSE-CSV] Parsing clients, length:', body.clients.length);
        const lines = body.clients.trim().split('\n');
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line || !line.trim()) continue;
          const parts = line.split(',').map(p => (p || '').trim());
          if (parts[0]) {
            result.contacts.push({
              type: 'Person',
              name: String(parts[0]),
              email: parts[1] ? String(parts[1]) : null,
              phone: parts[2] ? String(parts[2]) : null
            });
          }
        }
        console.log('[PARSE-CSV] Clients parsed:', result.contacts.length);
      }
    } catch (clientErr) {
      console.error('[PARSE-CSV] Client parse error:', clientErr.message);
    }

    // Parse matters if provided
    try {
      if (body.matters && typeof body.matters === 'string' && body.matters.trim()) {
        console.log('[PARSE-CSV] Parsing matters, length:', body.matters.length);
        const lines = body.matters.trim().split('\n');
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line || !line.trim()) continue;
          const parts = line.split(',').map(p => (p || '').trim());
          if (parts[0]) {
            result.matters.push({
              display_number: String(parts[0] || `M-${i}`),
              description: String(parts[1] || 'Imported Matter'),
              client: parts[2] ? { name: String(parts[2]) } : null,
              status: String(parts[3] || 'Open'),
              billing_method: 'hourly'
            });
          }
        }
        console.log('[PARSE-CSV] Matters parsed:', result.matters.length);
      }
    } catch (matterErr) {
      console.error('[PARSE-CSV] Matter parse error:', matterErr.message);
    }

    // Parse time entries if provided
    try {
      if (body.timeEntries && typeof body.timeEntries === 'string' && body.timeEntries.trim()) {
        console.log('[PARSE-CSV] Parsing time entries, length:', body.timeEntries.length);
        const lines = body.timeEntries.trim().split('\n');
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line || !line.trim()) continue;
          const parts = line.split(',').map(p => (p || '').trim());
          if (parts[0]) {
            result.activities.push({
              type: 'TimeEntry',
              date: String(parts[0] || new Date().toISOString().split('T')[0]),
              matter: parts[1] ? { display_number: String(parts[1]) } : null,
              user: parts[2] ? { name: String(parts[2]) } : null,
              quantity: parseFloat(parts[3] || '0') || 0,
              note: String(parts[4] || 'Time entry')
            });
          }
        }
        console.log('[PARSE-CSV] Time entries parsed:', result.activities.length);
      }
    } catch (timeErr) {
      console.error('[PARSE-CSV] Time entry parse error:', timeErr.message);
    }

    // Parse calendar events if provided
    try {
      if (body.calendarEvents && typeof body.calendarEvents === 'string' && body.calendarEvents.trim()) {
        console.log('[PARSE-CSV] Parsing calendar events, length:', body.calendarEvents.length);
        const lines = body.calendarEvents.trim().split('\n');
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line || !line.trim()) continue;
          const parts = line.split(',').map(p => (p || '').trim());
          if (parts[0]) {
            result.calendar_entries.push({
              summary: String(parts[0] || 'Event'),
              start_at: parts[1] ? String(parts[1]) : null,
              end_at: parts[2] ? String(parts[2]) : null,
              description: parts[3] ? String(parts[3]) : null
            });
          }
        }
        console.log('[PARSE-CSV] Calendar events parsed:', result.calendar_entries.length);
      }
    } catch (calErr) {
      console.error('[PARSE-CSV] Calendar parse error:', calErr.message);
    }

    console.log('[PARSE-CSV] Success - sending response');
    
    return res.json({
      success: true,
      transformedData: result,
      summary: {
        firm: result.firm.name,
        users: result.users.length,
        contacts: result.contacts.length,
        matters: result.matters.length,
        activities: result.activities.length,
        calendar_entries: result.calendar_entries.length
      }
    });

  } catch (error) {
    console.error('[PARSE-CSV] FATAL ERROR:', error);
    return res.status(500).json({
      success: false,
      error: 'CSV parsing failed: ' + (error.message || 'Unknown error')
    });
  }
});

// ============================================
// AI FORMAT USERS ONLY
// ============================================

router.post('/ai-format-users', requireSecureAdmin, async (req, res) => {
  const { rawUsers } = req.body;

  if (!rawUsers || !rawUsers.trim()) {
    return res.status(400).json({ error: 'No user data provided' });
  }

  if (!AZURE_ENDPOINT || !AZURE_API_KEY || !AZURE_DEPLOYMENT) {
    return res.status(500).json({ error: 'AI service not configured' });
  }

  try {
    const prompt = `Convert this user data into CSV format with headers: Name,Email,Role,Rate

Input data:
${rawUsers}

Output ONLY valid CSV with the header row and data rows. No explanation, just the CSV.
Example output:
Name,Email,Role,Rate
Jane Smith,jane@email.com,Attorney,400
Bob Johnson,bob@email.com,Paralegal,150`;

    const messages = [
      { role: 'system', content: 'You convert messy user data into clean CSV format. Output ONLY the CSV, nothing else.' },
      { role: 'user', content: prompt }
    ];

    const csvResult = await callAzureOpenAI(messages, { temperature: 0.1, max_tokens: 2000 });
    
    // Clean up the response
    let cleanCsv = csvResult.trim();
    if (cleanCsv.startsWith('```')) {
      cleanCsv = cleanCsv.replace(/```csv\n?|```\n?/g, '').trim();
    }

    // Count users (lines minus header)
    const lines = cleanCsv.split('\n').filter(l => l.trim());
    const userCount = Math.max(0, lines.length - 1);

    res.json({
      success: true,
      formattedCsv: cleanCsv,
      userCount
    });

  } catch (error) {
    console.error('AI format users error:', error);
    res.status(500).json({ error: 'Failed to format users: ' + error.message });
  }
});

// ============================================
// AI-POWERED DATA TRANSFORMATION
// ============================================

const AI_TRANSFORM_SYSTEM_PROMPT = `You are an expert data transformation AI for migrating law firm data from Clio (and similar legal practice management systems) to our platform.

Your task is to transform raw data into our exact JSON format. The user may provide data in various formats:
- CSV exports from Clio
- JSON exports from Clio
- Spreadsheet data (tab or comma-separated)
- Unstructured data lists
- Mixed formats

You MUST output valid JSON that matches this EXACT structure:

{
  "firm": {
    "name": "Firm Name (REQUIRED)",
    "phone": "555-123-4567",
    "email": "info@firm.com",
    "website": "https://firm.com",
    "address": "Street address",
    "city": "City",
    "state": "ST",
    "zip_code": "12345"
  },
  "users": [
    {
      "email": "user@firm.com (REQUIRED)",
      "password": "TempPass123! (REQUIRED - generate secure 12+ char password if not provided)",
      "first_name": "First (REQUIRED)",
      "last_name": "Last",
      "type": "Attorney/Paralegal/Staff/Admin",
      "rate": 350.00,
      "phone": "555-123-4567"
    }
  ],
  "contacts": [
    {
      "type": "Person or Company",
      "name": "Display Name (REQUIRED for company)",
      "first_name": "First (REQUIRED for person)",
      "last_name": "Last",
      "company": "Company name if person works at one",
      "email": "client@email.com",
      "phone": "555-123-4567",
      "addresses": [
        {
          "street": "123 Main St",
          "city": "Boston",
          "province": "MA",
          "postal_code": "02101",
          "primary": true
        }
      ],
      "notes": "Any notes about the client"
    }
  ],
  "matters": [
    {
      "display_number": "2024-0001 (REQUIRED - generate if not provided)",
      "description": "Matter Name/Description (REQUIRED)",
      "detailed_description": "Longer description of the matter",
      "client": {
        "name": "Client Name (must match a contact name)"
      },
      "status": "Open/Pending/Closed",
      "practice_area": {
        "name": "Estate Planning/Corporate/Litigation/Family Law/Real Estate/Criminal/Immigration/Bankruptcy/IP/Employment/Other"
      },
      "responsible_attorney": {
        "name": "Attorney Name (must match a user name)"
      },
      "open_date": "YYYY-MM-DD",
      "close_date": "YYYY-MM-DD or null",
      "billing_method": "hourly/flat/contingency/retainer/pro_bono"
    }
  ],
  "activities": [
    {
      "type": "TimeEntry or ExpenseEntry",
      "date": "YYYY-MM-DD (REQUIRED)",
      "matter": {
        "display_number": "2024-0001 (must match a matter)"
      },
      "user": {
        "name": "User Name (must match a user)"
      },
      "quantity": 2.5,
      "rate": 350.00,
      "total": 875.00,
      "note": "Description of work performed",
      "non_billable": false
    }
  ],
  "calendar_entries": [
    {
      "summary": "Event Title (REQUIRED)",
      "description": "Event details",
      "matter": {
        "display_number": "2024-0001 (optional - link to matter)"
      },
      "start_at": "2024-03-15T10:00:00-05:00 (REQUIRED)",
      "end_at": "2024-03-15T11:00:00-05:00",
      "all_day": false,
      "location": "Conference Room A",
      "calendar_entry_type": "Meeting/Court Date/Deadline/Deposition/Reminder"
    }
  ]
}

RULES:
1. ALWAYS output valid JSON - no markdown, no explanations, JUST the JSON object
2. If firm name is not clear, use a reasonable default like "Law Firm (Imported)"
3. Generate secure passwords (12+ chars with uppercase, lowercase, numbers, symbols) for users if not provided
4. Generate matter numbers in YYYY-NNNN format if not provided
5. Parse dates from any format (MM/DD/YYYY, YYYY-MM-DD, "January 15, 2024", etc.) and output as YYYY-MM-DD
6. Infer practice areas from matter names/descriptions if not specified
7. Link contacts to matters by matching names
8. Calculate time entry totals if rate and quantity are provided
9. Map roles: Attorney/Lawyer -> Attorney, Secretary/Assistant -> Staff, Owner/Admin -> Admin
10. If data seems incomplete, include what you can and omit empty arrays
11. For ambiguous data, make reasonable assumptions - it's better to import something than nothing
12. Preserve all original data - don't lose any information during transformation

IMPORTANT: Your response must be ONLY the JSON object, starting with { and ending with }. No other text.`;

router.post('/ai-transform', requireSecureAdmin, async (req, res) => {
  const { rawData, dataFormat, additionalContext } = req.body;

  if (!rawData) {
    return res.status(400).json({ error: 'No data provided for transformation' });
  }

  if (!AZURE_ENDPOINT || !AZURE_API_KEY || !AZURE_DEPLOYMENT) {
    return res.status(500).json({ error: 'AI service not configured. Please configure Azure OpenAI in integration settings.' });
  }

  try {
    logMigrationAudit('AI_TRANSFORM_START', { 
      dataLength: rawData.length,
      format: dataFormat 
    }, req.ip);

    // Build user message with context
    let userMessage = `Transform this law firm data into the required JSON format:\n\n`;
    
    if (dataFormat) {
      userMessage += `Data format hint: ${dataFormat}\n\n`;
    }
    
    if (additionalContext) {
      userMessage += `Additional context: ${additionalContext}\n\n`;
    }
    
    userMessage += `DATA:\n${rawData}`;

    const messages = [
      { role: 'system', content: AI_TRANSFORM_SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ];

    const aiResponse = await callAzureOpenAI(messages, { 
      temperature: 0.2, // Very low for consistent formatting
      max_tokens: 8000 
    });

    // Try to parse the AI response as JSON
    let transformedData;
    try {
      // Clean up the response - remove any markdown code blocks if present
      let cleanResponse = aiResponse.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.slice(7);
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.slice(3);
      }
      if (cleanResponse.endsWith('```')) {
        cleanResponse = cleanResponse.slice(0, -3);
      }
      cleanResponse = cleanResponse.trim();

      transformedData = JSON.parse(cleanResponse);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.error('AI response:', aiResponse);
      
      return res.status(422).json({ 
        error: 'AI generated invalid JSON. Please try again or adjust your input data.',
        rawResponse: aiResponse.substring(0, 1000) // Return partial response for debugging
      });
    }

    // Validate minimum required fields
    if (!transformedData.firm || !transformedData.firm.name) {
      return res.status(422).json({ 
        error: 'Transformed data is missing required firm name',
        transformedData 
      });
    }

    // Ensure users have passwords
    if (transformedData.users && Array.isArray(transformedData.users)) {
      transformedData.users = transformedData.users.map(user => {
        if (!user.password) {
          // Generate a secure random password
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
          let password = '';
          for (let i = 0; i < 14; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          user.password = password;
        }
        return user;
      });
    }

    logMigrationAudit('AI_TRANSFORM_SUCCESS', {
      firm: transformedData.firm?.name,
      users: transformedData.users?.length || 0,
      contacts: transformedData.contacts?.length || 0,
      matters: transformedData.matters?.length || 0,
      activities: transformedData.activities?.length || 0,
      calendar_entries: transformedData.calendar_entries?.length || 0
    }, req.ip);

    res.json({
      success: true,
      transformedData,
      summary: {
        firm: transformedData.firm?.name,
        users: transformedData.users?.length || 0,
        contacts: transformedData.contacts?.length || 0,
        matters: transformedData.matters?.length || 0,
        activities: transformedData.activities?.length || 0,
        calendar_entries: transformedData.calendar_entries?.length || 0
      }
    });

  } catch (error) {
    console.error('AI transformation error:', error);
    logMigrationAudit('AI_TRANSFORM_FAILED', { error: error.message }, req.ip);
    
    res.status(500).json({ 
      error: 'AI transformation failed: ' + error.message 
    });
  }
});

// ============================================
// MIGRATION HISTORY
// ============================================

router.get('/history', requireSecureAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        f.id, 
        f.name, 
        f.created_at,
        (SELECT COUNT(*) FROM users WHERE firm_id = f.id) as user_count,
        (SELECT COUNT(*) FROM clients WHERE firm_id = f.id) as contact_count,
        (SELECT COUNT(*) FROM matters WHERE firm_id = f.id) as matter_count,
        (SELECT COUNT(*) FROM time_entries WHERE firm_id = f.id) as time_entry_count,
        (SELECT COUNT(*) FROM expenses WHERE firm_id = f.id) as expense_count,
        (SELECT COUNT(*) FROM calendar_events WHERE firm_id = f.id) as calendar_count
      FROM firms f
      ORDER BY f.created_at DESC
      LIMIT 20
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Migration history error:', error);
    res.status(500).json({ error: 'Failed to get migration history' });
  }
});

export default router;
