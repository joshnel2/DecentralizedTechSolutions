import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db/connection.js';

const router = Router();

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
