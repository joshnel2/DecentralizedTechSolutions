import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db/connection.js';

const router = Router();

// ============================================
// CLIO API CONFIGURATION
// ============================================
const CLIO_API_BASE = 'https://app.clio.com/api/v4';

// Store active Clio connections (in production, use database)
const clioConnections = new Map();

// Helper to make Clio API requests with better error handling
async function clioRequest(accessToken, endpoint, params = {}, retryCount = 0) {
  const MAX_RETRIES = 3;
  const url = new URL(`${CLIO_API_BASE}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      // Handle array parameters (e.g., open_date[]=['>=2020-01-01', '<=2020-12-31'])
      if (Array.isArray(value)) {
        value.forEach(v => url.searchParams.append(key, v));
      } else {
        url.searchParams.append(key, value);
      }
    }
  });
  
  console.log(`[CLIO API] GET ${endpoint} with params:`, params);
  
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`[CLIO API] Response status: ${response.status}`);
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`[CLIO API] Error response: ${error}`);
      
      // Handle rate limiting with automatic retry
      if (response.status === 429) {
        if (retryCount >= MAX_RETRIES) {
          throw new Error('Clio rate limit exceeded after maximum retries.');
        }
        // Parse retry time from error message, default to 60 seconds
        let waitTime = 60;
        try {
          const errorObj = JSON.parse(error);
          const match = errorObj?.error?.message?.match(/Retry in (\d+) seconds/);
          if (match) {
            waitTime = parseInt(match[1], 10) + 5; // Add 5 second buffer
          }
        } catch (e) {}
        console.log(`[CLIO API] Rate limited. Waiting ${waitTime}s before retry ${retryCount + 1}/${MAX_RETRIES}...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
        return clioRequest(accessToken, endpoint, params, retryCount + 1);
      }
      
      // Handle specific error cases
      if (response.status === 401) {
        throw new Error('Clio access token expired or invalid. Please reconnect to Clio.');
      }
      if (response.status === 403) {
        throw new Error('Access denied. Check that your Clio app has the required permissions.');
      }
      
      throw new Error(`Clio API error: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    console.log(`[CLIO API] Got ${data.data?.length || 0} records from ${endpoint}`);
    return data;
  } catch (fetchError) {
    console.error(`[CLIO API] Fetch error for ${endpoint}:`, fetchError.message);
    throw fetchError;
  }
}

// Helper to fetch from Clio using a full URL (for pagination)
async function clioRequestUrl(accessToken, fullUrl, retryCount = 0) {
  const MAX_RETRIES = 3;
  console.log(`[CLIO API] Fetching URL: ${fullUrl.substring(0, 80)}...`);
  
  const response = await fetch(fullUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  console.log(`[CLIO API] Response status: ${response.status}`);
  
  if (!response.ok) {
    const text = await response.text();
    console.log(`[CLIO API] Error response: ${text}`);
    
    // Handle rate limiting with automatic retry
    if (response.status === 429) {
      if (retryCount >= MAX_RETRIES) {
        throw new Error('Clio rate limit exceeded after maximum retries.');
      }
      // Parse retry time from error message, default to 60 seconds
      let waitTime = 60;
      try {
        const errorObj = JSON.parse(text);
        const match = errorObj?.error?.message?.match(/Retry in (\d+) seconds/);
        if (match) {
          waitTime = parseInt(match[1], 10) + 5; // Add 5 second buffer
        }
      } catch (e) {}
      console.log(`[CLIO API] Rate limited. Waiting ${waitTime}s before retry ${retryCount + 1}/${MAX_RETRIES}...`);
      await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      return clioRequestUrl(accessToken, fullUrl, retryCount + 1);
    }
    
    throw new Error(`Clio API error: ${response.status} - ${text}`);
  }
  
  return response.json();
}

// Main fetch function - routes to appropriate method based on endpoint
async function clioGetAll(accessToken, endpoint, params = {}, onProgress = null) {
  // For contacts, use A-Z initial batching (officially supported by Clio)
  if (endpoint.includes('contacts')) {
    return await clioGetContactsByInitial(accessToken, endpoint, params, onProgress);
  }
  
  // For matters, batch by status (Open, Pending, Closed)
  if (endpoint.includes('matters')) {
    return await clioGetMattersByStatus(accessToken, endpoint, params, onProgress);
  }
  
  // For activities, batch by status (billed, unbilled, non_billable, etc.)
  if (endpoint.includes('activities')) {
    return await clioGetActivitiesByStatus(accessToken, endpoint, params, onProgress);
  }
  
  // For bills, batch by state (draft, awaiting_payment, paid, etc.)
  if (endpoint.includes('bills')) {
    return await clioGetBillsByState(accessToken, endpoint, params, onProgress);
  }
  
  // For other endpoints (users, calendar), use standard pagination
  return await clioGetPaginated(accessToken, endpoint, params, onProgress);
}

// Fetch contacts by initial A-Z + type (Person/Company) for maximum coverage
// Each combination has its own 10k limit = 52 batches max + numeric/special chars
async function clioGetContactsByInitial(accessToken, endpoint, params, onProgress) {
  const allData = [];
  const seenIds = new Set();
  const initials = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const types = ['Person', 'Company'];
  
  console.log(`[CLIO API] Fetching contacts by initial + type to bypass 10k limit...`);
  
  // First, fetch by initial A-Z for each type
  for (const type of types) {
    for (const initial of initials) {
      console.log(`[CLIO API] Fetching ${type} contacts starting with "${initial}"...`);
      
      try {
        const letterData = await clioGetPaginated(
          accessToken, 
          endpoint, 
          { ...params, initial, type }, 
          null
        );
        
        let newCount = 0;
        for (const item of letterData) {
          if (item.id && !seenIds.has(item.id)) {
            seenIds.add(item.id);
            allData.push(item);
            newCount++;
          }
        }
        
        if (newCount > 0) {
          console.log(`[CLIO API] ${type} "${initial}": got ${newCount} new, total ${allData.length}`);
        }
        if (onProgress) onProgress(allData.length);
        
      } catch (err) {
        console.log(`[CLIO API] ${type} "${initial}" error: ${err.message}, continuing...`);
      }
    }
  }
  
  // Also fetch contacts with numeric initials (0-9)
  for (const type of types) {
    for (let num = 0; num <= 9; num++) {
      const initial = String(num);
      try {
        const numData = await clioGetPaginated(
          accessToken, 
          endpoint, 
          { ...params, initial, type }, 
          null
        );
        
        let newCount = 0;
        for (const item of numData) {
          if (item.id && !seenIds.has(item.id)) {
            seenIds.add(item.id);
            allData.push(item);
            newCount++;
          }
        }
        
        if (newCount > 0) {
          console.log(`[CLIO API] ${type} "${initial}": got ${newCount} new, total ${allData.length}`);
        }
        if (onProgress) onProgress(allData.length);
        
      } catch (err) {
        // Numeric initials might not be supported, that's ok
      }
    }
  }
  
  console.log(`[CLIO API] Contacts complete: ${allData.length} total records`);
  return allData;
}

// Fetch matters by STATUS (Open, Pending, Closed) - simple and fast
// Each status can have up to 10k records, allowing up to 30k total
async function clioGetMattersByStatus(accessToken, endpoint, params, onProgress, clientIds = null) {
  const allData = [];
  const seenIds = new Set();
  const statuses = ['Open', 'Pending', 'Closed'];
  
  console.log(`[CLIO API] Fetching matters by status (bypasses 10k limit)...`);
  
  for (const status of statuses) {
    console.log(`[CLIO API] Fetching ${status} matters...`);
    
    try {
      const statusMatters = await clioGetPaginated(
        accessToken,
        endpoint,
        { ...params, status },
        (count) => {
          if (onProgress) onProgress(allData.length + count);
        }
      );
      
      let newCount = 0;
      for (const item of statusMatters) {
        if (item.id && !seenIds.has(item.id)) {
          seenIds.add(item.id);
          allData.push(item);
          newCount++;
        }
      }
      
      console.log(`[CLIO API] ${status} matters: ${newCount} records, total ${allData.length}`);
      if (onProgress) onProgress(allData.length);
      
    } catch (err) {
      console.log(`[CLIO API] Error fetching ${status} matters: ${err.message}`);
    }
  }
  
  console.log(`[CLIO API] Matters complete: ${allData.length} total records`);
  return allData;
}

// Fetch activities by STATUS (billed, unbilled, non_billable) - simple and fast
// Each status can have up to 10k records, allowing up to 30k total
async function clioGetActivitiesByStatus(accessToken, endpoint, params, onProgress, matterIds = null) {
  const allData = [];
  const seenIds = new Set();
  const statuses = ['billed', 'unbilled', 'non_billable'];
  
  console.log(`[CLIO API] Fetching activities by status (bypasses 10k limit)...`);
  
  for (const status of statuses) {
    console.log(`[CLIO API] Fetching ${status} activities...`);
    
    try {
      const statusActivities = await clioGetPaginated(
        accessToken,
        endpoint,
        { ...params, status },
        (count) => {
          if (onProgress) onProgress(allData.length + count);
        }
      );
      
      let newCount = 0;
      for (const item of statusActivities) {
        if (item.id && !seenIds.has(item.id)) {
          seenIds.add(item.id);
          allData.push(item);
          newCount++;
        }
      }
      
      console.log(`[CLIO API] ${status} activities: ${newCount} records, total ${allData.length}`);
      if (onProgress) onProgress(allData.length);
      
    } catch (err) {
      console.log(`[CLIO API] Error fetching ${status} activities: ${err.message}`);
    }
  }
  
  console.log(`[CLIO API] Activities complete: ${allData.length} total records`);
  return allData;
}

// Fetch bills by state + month (smallest possible batches)
async function clioGetBillsByState(accessToken, endpoint, params, onProgress) {
  const allData = [];
  const seenIds = new Set();
  const states = ['draft', 'awaiting_approval', 'awaiting_payment', 'paid', 'void', 'deleted'];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  
  console.log(`[CLIO API] Fetching bills by state + month (smallest batches)...`);
  
  for (const state of states) {
    for (let year = 2000; year <= currentYear; year++) {
      const maxMonth = (year === currentYear) ? currentMonth : 12;
      
      for (let month = 1; month <= maxMonth; month++) {
        const monthStr = String(month).padStart(2, '0');
        const lastDay = new Date(year, month, 0).getDate();
        const startDate = `${year}-${monthStr}-01`;
        const endDate = `${year}-${monthStr}-${lastDay}`;
        
        try {
          const batchData = await clioGetPaginated(
            accessToken, 
            endpoint, 
            { 
              ...params, 
              state,
              'issued_at[]': [`>=${startDate}`, `<=${endDate}`]
            }, 
            null
          );
          
          let newCount = 0;
          for (const item of batchData) {
            if (item.id && !seenIds.has(item.id)) {
              seenIds.add(item.id);
              allData.push(item);
              newCount++;
            }
          }
          
          if (newCount > 0) {
            console.log(`[CLIO API] Bills ${state} ${year}-${monthStr}: +${newCount}, total ${allData.length}`);
          }
          if (onProgress) onProgress(allData.length);
          
        } catch (err) {
          // Skip errors silently for date filters
        }
      }
    }
  }
  
  console.log(`[CLIO API] Bills complete: ${allData.length} total records`);
  return allData;
}

// Standard paginated fetch using Clio's cursor pagination
async function clioGetPaginated(accessToken, endpoint, params = {}, onProgress = null) {
  const allData = [];
  const seenIds = new Set();
  const limit = 200;
  let nextUrl = null;
  let hasMore = true;
  let pageCount = 0;
  let retryCount = 0;
  const maxRetries = 5;
  
  console.log(`[CLIO API] Starting paginated fetch for ${endpoint}`);
  
  while (hasMore) {
    pageCount++;
    
    try {
      let response;
      
      if (nextUrl) {
        response = await clioRequestUrl(accessToken, nextUrl);
      } else {
        response = await clioRequest(accessToken, endpoint, { ...params, limit });
      }
      
      const data = response.data || [];
      console.log(`[CLIO API] Page ${pageCount}: received ${data.length}, total ${allData.length + data.length}`);
      
      let newCount = 0;
      for (const item of data) {
        const id = item.id;
        if (id && !seenIds.has(id)) {
          seenIds.add(id);
          allData.push(item);
          newCount++;
        }
      }
      
      retryCount = 0;
      
      if (onProgress) {
        onProgress(allData.length);
      }
      
      const nextPageUrl = response.meta?.paging?.next;
      if (nextPageUrl && data.length > 0) {
        nextUrl = nextPageUrl;
      } else {
        hasMore = false;
      }
      
      await new Promise(r => setTimeout(r, 1500));
      
    } catch (error) {
      if (error.message.includes('rate limit') || error.message.includes('429') || error.message.includes('Rate')) {
        retryCount++;
        if (retryCount > maxRetries) throw error;
        
        const waitTime = 35 + (retryCount * 10);
        console.log(`[CLIO API] Rate limited. Waiting ${waitTime}s...`);
        await new Promise(r => setTimeout(r, waitTime * 1000));
        pageCount--;
        continue;
      }
      
      // Hit 10k limit - stop gracefully
      if (error.message.includes('out of bounds') || error.message.includes('page_token')) {
        console.log(`[CLIO API] Hit 10k limit for ${endpoint}, got ${allData.length} records`);
        hasMore = false;
        break;
      }
      
      throw error;
    }
  }
  
  console.log(`[CLIO API] Completed ${endpoint}: ${allData.length} records`);
  return allData;
}

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
            const existing = await query(
              'SELECT id, firm_id, first_name, last_name, email FROM users WHERE LOWER(email) = LOWER($1)', 
              [emailLower]
            );
            if (existing.rows.length > 0) {
              // User already exists - we'll skip creating and use their existing account for linking
              const existingName = `${existing.rows[0].first_name} ${existing.rows[0].last_name}`.trim();
              const existingFirmId = existing.rows[0].firm_id;
              warnings.push(`User #${idx}: Email "${email}" already exists as "${existingName}" (ID: ${existing.rows[0].id.substring(0,8)}..., Firm: ${existingFirmId ? existingFirmId.substring(0,8) + '...' : 'none'}) - will skip and use existing account for linking`);
            }
          }
        }
        
        // Password will be auto-generated if missing or too short - just log warning
        if (!user.password || user.password.length < 8) {
          warnings.push(`User #${idx} (${email || 'no email'}): Password will be auto-generated`);
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
      let existingMatterCount = 0;
      
      for (let i = 0; i < data.matters.length; i++) {
        const matter = data.matters[i];
        const idx = i + 1;
        let matterNum = matter.display_number || matter.number;
        
        // Blank or missing matter numbers will be auto-generated during import
        if (!matterNum || matterNum === '[blank]' || matterNum.trim() === '') {
          warnings.push(`Matter #${idx}: Blank matter number - will be auto-generated`);
          continue; // Skip duplicate check for blank numbers
        }
        
        if (seenNumbers.has(matterNum)) {
          warnings.push(`Matter #${idx}: Duplicate matter number "${matterNum}" in import data - will be auto-adjusted`);
        } else {
          seenNumbers.add(matterNum);
          // Check if matter number exists in database
          const existingMatter = await query('SELECT id FROM matters WHERE number = $1', [matterNum]);
          if (existingMatter.rows.length > 0) {
            existingMatterCount++;
          }
        }
        
        if (!matter.description && !matter.name) {
          errors.push(`Matter #${idx}: description (matter name) is required`);
        }
      }
      
      if (existingMatterCount > 0) {
        warnings.push(`${existingMatterCount} matter number(s) already exist in database - they will be prefixed with firm name to ensure uniqueness`);
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
  const { data, existingFirmId } = req.body;
  
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
    
    // Set statement timeout to 1 hour for large imports
    await query('SET LOCAL statement_timeout = 3600000');

    // ============================================
    // 1. CREATE OR USE EXISTING FIRM
    // ============================================
    let firmId;
    let firmName;
    
    if (existingFirmId) {
      // Use existing firm
      const existingFirm = await query('SELECT id, name FROM firms WHERE id = $1', [existingFirmId]);
      if (existingFirm.rows.length === 0) {
        throw new Error('Selected firm not found');
      }
      firmId = existingFirm.rows[0].id;
      firmName = existingFirm.rows[0].name;
      results.warnings.push(`Adding data to existing firm "${firmName}"`);
      console.log(`[MIGRATION] Using existing firm: ${firmName} (${firmId})`);
    } else {
      // Create new firm
      firmName = data.firm.name;
      
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
      
      firmId = firmResult.rows[0].id;
    }
    
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
          
          // CHECK FOR EXISTING USER - handle duplicates gracefully (case-insensitive check)
          const existingUser = await query(
            'SELECT id, firm_id, first_name, last_name, email FROM users WHERE LOWER(email) = LOWER($1)', 
            [email]
          );
          
          if (existingUser.rows.length > 0) {
            // User already exists - add to lookup map for matter/activity linking
            const existingId = existingUser.rows[0].id;
            const existingFirmId = existingUser.rows[0].firm_id;
            const existingEmail = existingUser.rows[0].email;
            const existingName = `${existingUser.rows[0].first_name} ${existingUser.rows[0].last_name}`.trim();
            
            userIdMap.set(email, existingId);
            if (user.id) userIdMap.set(`clio:${user.id}`, existingId);
            if (user.clio_id) userIdMap.set(`clio:${user.clio_id}`, existingId);
            if (user.name) userIdMap.set(user.name.toLowerCase(), existingId);
            
            console.log(`[MIGRATION] Existing user found: email="${existingEmail}", id="${existingId}", firm_id="${existingFirmId}"`);
            results.warnings.push(`User "${email}" already exists as "${existingName}" (ID: ${existingId.substring(0,8)}..., Firm: ${existingFirmId ? existingFirmId.substring(0,8) + '...' : 'none'}) - using existing account for linking`);
            continue; // Skip to next user, don't try to insert
          }
          
          // Generate password if missing - ensure minimum 8 characters
          let password = user.password;
          if (!password || password.length < 8) {
            const baseName = (firstName || 'User').padEnd(4, 'x'); // Ensure at least 4 chars
            password = baseName + Math.floor(1000 + Math.random() * 9000) + '!'; // 4 + 4 + 1 = 9 chars min
          }
          const passwordHash = await bcrypt.hash(password, 12);
          
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
          if (user.clio_id) userIdMap.set(`clio:${user.clio_id}`, userId);
          if (user.name) userIdMap.set(user.name.toLowerCase(), userId);
          
          // Store credentials for display
          results.user_credentials.push({
            email: email,
            name: `${firstName} ${lastName || ''}`.trim(),
            password: password, // Password before hashing
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
          if (contact.clio_id) contactIdMap.set(`clio:${contact.clio_id}`, clientId);
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
    // Helper function to generate unique matter number
    const generateUniqueMatterNumber = async (baseNumber, firmShortName) => {
      let matterNumber = baseNumber;
      let attempt = 0;
      const maxAttempts = 100;
      
      while (attempt < maxAttempts) {
        const existing = await query('SELECT id FROM matters WHERE number = $1', [matterNumber]);
        if (existing.rows.length === 0) {
          return matterNumber;
        }
        attempt++;
        // Append firm prefix and/or counter to make it unique
        if (attempt === 1) {
          matterNumber = `${firmShortName}-${baseNumber}`;
        } else {
          matterNumber = `${firmShortName}-${baseNumber}-${attempt}`;
        }
      }
      // Fallback: use timestamp
      return `${firmShortName}-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    };
    
    // Create a short firm identifier for matter number prefix
    const firmShortName = firmName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toUpperCase() || 'IMPORT';
    
    if (data.matters && Array.isArray(data.matters)) {
      for (const matter of data.matters) {
        try {
          // Generate unique matter number if blank
          let matterNumber = matter.display_number || matter.number;
          if (!matterNumber || matterNumber === '[blank]' || matterNumber.trim() === '') {
            matterNumber = `MATTER-${matter.id || matter.clio_id || Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
          }
          
          // CHECK FOR EXISTING MATTER NUMBER - ensure uniqueness
          const existingMatter = await query('SELECT id, firm_id FROM matters WHERE number = $1', [matterNumber]);
          if (existingMatter.rows.length > 0) {
            const originalNumber = matterNumber;
            matterNumber = await generateUniqueMatterNumber(matterNumber, firmShortName);
            results.warnings.push(`Matter number "${originalNumber}" already exists - using "${matterNumber}" instead`);
          }
          
          const matterName = matter.description || matter.name;
          
          // Find client
          let clientId = null;
          if (matter.client) {
            if (matter.client.id) {
              clientId = contactIdMap.get(`clio:${matter.client.id}`);
            }
            if (!clientId && matter.client.clio_id) {
              clientId = contactIdMap.get(`clio:${matter.client.clio_id}`);
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
            if (!attorneyId && matter.responsible_attorney.clio_id) {
              attorneyId = userIdMap.get(`clio:${matter.responsible_attorney.clio_id}`);
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
          // Also map by original number for activity linking
          if (matter.display_number) matterIdMap.set(matter.display_number, matterId);
          if (matter.id) matterIdMap.set(`clio:${matter.id}`, matterId);
          if (matter.clio_id) matterIdMap.set(`clio:${matter.clio_id}`, matterId);
          
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
            if (activity.matter.clio_id) {
              matterId = matterIdMap.get(`clio:${activity.matter.clio_id}`);
            }
            if (!matterId && activity.matter.id) {
              matterId = matterIdMap.get(`clio:${activity.matter.id}`);
            }
            if (!matterId && activity.matter.display_number) {
              matterId = matterIdMap.get(activity.matter.display_number);
            }
          }
          
          if (!matterId) {
            results.warnings.push(`Activity skipped: Matter not found (ref: ${activity.matter?.display_number || activity.matter?.clio_id || 'unknown'})`);
            continue;
          }
          
          // Find user
          let userId = null;
          if (activity.user) {
            if (activity.user.clio_id) {
              userId = userIdMap.get(`clio:${activity.user.clio_id}`);
            }
            if (!userId && activity.user.id) {
              userId = userIdMap.get(`clio:${activity.user.id}`);
            }
            if (!userId && activity.user.name) {
              userId = userIdMap.get(activity.user.name.toLowerCase());
            }
            if (!userId && activity.user.email) {
              userId = userIdMap.get(activity.user.email.toLowerCase());
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
            if (entry.matter.clio_id) {
              matterId = matterIdMap.get(`clio:${entry.matter.clio_id}`);
            }
            if (!matterId && entry.matter.id) {
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

// ============================================
// CLIO API INTEGRATION - Direct API Migration
// ============================================

// OAuth callback for Clio - NO AUTH REQUIRED (callback from Clio)
router.get('/clio/callback', async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://strappedai.com';
  
  // Helper to show debug page
  const showDebug = (title, message, data = {}) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Clio OAuth - ${title}</title></head>
      <body style="font-family: Arial; padding: 40px; background: #1a1a2e; color: #fff;">
        <h1 style="color: #f59e0b;">${title}</h1>
        <p>${message}</p>
        <pre style="background: #0d0d1a; padding: 20px; border-radius: 8px; overflow: auto;">${JSON.stringify(data, null, 2)}</pre>
        <br/>
        <a href="${frontendUrl}/rx760819/dashboard" style="color: #3b82f6;">← Back to Admin Portal</a>
      </body>
      </html>
    `);
  };
  
  try {
    const { code, state, error, error_description } = req.query;
    
    console.log('[CLIO] Callback received:', { code: code ? 'yes' : 'no', state, error });
    
    // Check for OAuth error from Clio
    if (error) {
      return showDebug('Clio Authorization Failed', error_description || error, { error, error_description });
    }
    
    if (!code) {
      return showDebug('Missing Code', 'No authorization code received from Clio', req.query);
    }
    
    if (!state) {
      return showDebug('Missing State', 'No state parameter received', req.query);
    }
    
    // Get stored OAuth config using state
    const oauthConfig = clioConnections.get(`oauth_${state}`);
    if (!oauthConfig) {
      console.error('[CLIO] OAuth config not found for state:', state);
      // List all current keys for debugging
      const keys = Array.from(clioConnections.keys());
      return showDebug('Session Expired', 'OAuth configuration not found. Please try again.', { 
        state, 
        availableKeys: keys,
        note: 'This can happen if the server restarted or too much time passed'
      });
    }
    
    // Exchange code for access token
    console.log('[CLIO] Exchanging code for token...');
    const tokenResponse = await fetch('https://app.clio.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: oauthConfig.clientId,
        client_secret: oauthConfig.clientSecret,
        redirect_uri: oauthConfig.redirectUri
      })
    });
    
    const tokenData = await tokenResponse.json();
    console.log('[CLIO] Token response:', tokenResponse.status, tokenData.error || 'success');
    
    if (!tokenData.access_token) {
      return showDebug('Token Exchange Failed', 'Failed to get access token from Clio', {
        status: tokenResponse.status,
        error: tokenData.error,
        error_description: tokenData.error_description,
        redirectUri: oauthConfig.redirectUri
      });
    }
    
    // Clean up the OAuth config
    clioConnections.delete(`oauth_${state}`);
    
    // Store the connection
    const connectionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    clioConnections.set(connectionId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      firmName: oauthConfig.firmName,
      connectedAt: new Date()
    });
    
    console.log('[CLIO] Connected successfully, connectionId:', connectionId);
    
    // Redirect back to admin portal DASHBOARD with success
    const redirectUrl = `${frontendUrl}/rx760819/dashboard?clio_connected=${connectionId}&firm=${encodeURIComponent(oauthConfig.firmName)}`;
    console.log('[CLIO] Redirecting to:', redirectUrl);
    res.redirect(redirectUrl);
    
  } catch (error) {
    console.error('[CLIO] OAuth callback error:', error);
    showDebug('Server Error', error.message, { stack: error.stack });
  }
});

// Start OAuth flow
router.post('/clio/oauth-start', requireSecureAdmin, async (req, res) => {
  try {
    const { clientId, clientSecret, firmName } = req.body;
    
    if (!clientId || !clientSecret) {
      return res.status(400).json({ success: false, error: 'Client ID and Secret are required' });
    }
    
    const redirectUri = `${process.env.BACKEND_URL || 'https://strappedai-gpfra9f8gsg9d9hy.canadacentral-01.azurewebsites.net'}/api/migration/clio/callback`;
    
    // Create a unique state ID to track this OAuth flow
    const stateId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    // Store OAuth config with state ID
    clioConnections.set(`oauth_${stateId}`, {
      clientId,
      clientSecret,
      redirectUri,
      firmName: firmName || 'Imported from Clio',
      createdAt: new Date()
    });
    
    console.log('[CLIO] OAuth started, state:', stateId);
    
    // Build authorization URL with state
    const authUrl = `https://app.clio.com/oauth/authorize?` + new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state: stateId
    }).toString();
    
    res.json({ success: true, authUrl });
  } catch (error) {
    console.error('[CLIO] OAuth start error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user info for a Clio connection
router.get('/clio/user/:connectionId', requireSecureAdmin, async (req, res) => {
  try {
    const { connectionId } = req.params;
    const connection = clioConnections.get(connectionId);
    
    if (!connection) {
      return res.status(404).json({ success: false, error: 'Connection not found' });
    }
    
    // Fetch user info from Clio
    try {
      const whoami = await clioRequest(connection.accessToken, '/users/who_am_i.json', { fields: 'id,name,email' });
      res.json({ success: true, user: whoami.data });
    } catch (apiError) {
      console.error('[CLIO] Failed to fetch user:', apiError);
      res.json({ success: true, user: { name: 'Clio User', email: 'Connected' } });
    }
  } catch (error) {
    console.error('[CLIO] User fetch error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Store Clio API credentials (entered by admin)
router.post('/clio/connect', requireSecureAdmin, async (req, res) => {
  try {
    const { accessToken, clientId, clientSecret, refreshToken } = req.body;
    
    if (!accessToken) {
      return res.status(400).json({ success: false, error: 'Access token is required' });
    }
    
    // Test the connection by fetching the current user
    try {
      const whoami = await clioRequest(accessToken, '/users/who_am_i.json', { fields: 'id,name,email' });
      
      // Store the connection
      const connectionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
      clioConnections.set(connectionId, {
        accessToken,
        clientId,
        clientSecret,
        refreshToken,
        user: whoami.data,
        connectedAt: new Date()
      });
      
      console.log('[CLIO] Connected successfully:', whoami.data.name);
      
      res.json({
        success: true,
        connectionId,
        user: whoami.data,
        message: `Connected to Clio as ${whoami.data.name}`
      });
    } catch (apiError) {
      console.error('[CLIO] Connection test failed:', apiError);
      res.status(401).json({ 
        success: false, 
        error: 'Invalid access token. Please check your Clio API token.' 
      });
    }
  } catch (error) {
    console.error('[CLIO] Connect error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get migration status/progress - now from database for persistence
router.get('/clio/progress/:connectionId', requireSecureAdmin, async (req, res) => {
  const { connectionId } = req.params;
  
  try {
    const result = await query(
      'SELECT * FROM migration_jobs WHERE connection_id = $1',
      [connectionId]
    );
    
    if (result.rows.length === 0) {
      console.log('[CLIO PROGRESS] No progress found for connection:', connectionId);
      return res.json({ status: 'not_started', message: 'No import has been started for this connection' });
    }
    
    const job = result.rows[0];
    const progress = {
      status: job.status,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      connectionId: job.connection_id,
      importOptions: job.import_options,
      steps: {
        users: { status: job.users_status, count: job.users_count },
        contacts: { status: job.contacts_status, count: job.contacts_count },
        matters: { status: job.matters_status, count: job.matters_count },
        activities: { status: job.activities_status, count: job.activities_count },
        bills: { status: job.bills_status, count: job.bills_count },
        calendar: { status: job.calendar_status, count: job.calendar_count }
      },
      summary: job.summary,
      error: job.error_message
    };
    
    console.log('[CLIO PROGRESS] Returning progress for', connectionId, '- status:', progress.status);
    res.json(progress);
  } catch (err) {
    console.error('[CLIO PROGRESS] Database error:', err.message);
    res.json({ status: 'not_started', message: 'No import has been started for this connection' });
  }
});

// Start the full Clio data import
router.post('/clio/import', requireSecureAdmin, async (req, res) => {
  try {
    const { 
      connectionId, 
      firmName, 
      existingFirmId,
      includeUsers = true,
      includeContacts = true,
      includeMatters = true, 
      includeActivities = true, 
      includeBills = true, 
      includeCalendar = true 
    } = req.body;
    
    console.log('[CLIO IMPORT] Starting import for connection:', connectionId, 'firmName:', firmName);
    console.log('[CLIO IMPORT] Include options:', { includeUsers, includeContacts, includeMatters, includeActivities, includeBills, includeCalendar });
    
    if (!connectionId) {
      console.error('[CLIO IMPORT] No connection ID provided');
      return res.status(400).json({ success: false, error: 'Connection ID is required.' });
    }
    
    if (!clioConnections.has(connectionId)) {
      console.error('[CLIO IMPORT] Connection not found:', connectionId);
      console.log('[CLIO IMPORT] Available connections:', Array.from(clioConnections.keys()));
      return res.status(400).json({ success: false, error: 'Invalid connection. Please reconnect to Clio.' });
    }
    
    const connection = clioConnections.get(connectionId);
    const accessToken = connection.accessToken;
    
    console.log('[CLIO IMPORT] Connection found, access token present:', !!accessToken);
    
    // Check if token might be expired
    if (connection.expiresAt && Date.now() > connection.expiresAt) {
      console.warn('[CLIO IMPORT] Access token may be expired, but attempting import anyway');
    }
    
    // Store options for background process
    const importOptions = { existingFirmId, includeUsers, includeContacts, includeMatters, includeActivities, includeBills, includeCalendar };
    
    // Initialize progress
    migrationProgress.set(connectionId, {
      status: 'running',
      startedAt: new Date(),
      connectionId: connectionId,
      importOptions,
      steps: {
        users: { status: 'pending', count: 0 },
        contacts: { status: 'pending', count: 0 },
        matters: { status: 'pending', count: 0 },
        activities: { status: 'pending', count: 0 },
        bills: { status: 'pending', count: 0 },
        calendar: { status: 'pending', count: 0 }
      }
    });
    
    console.log('[CLIO IMPORT] Progress initialized, sending response...');
    
    // Send immediate response - import runs in background
    res.json({ success: true, message: 'Import started. Data saves directly to database as it imports.' });
    
    // Run import in background - SAVES DIRECTLY TO DATABASE
    console.log('[CLIO IMPORT] Starting background import process (direct to DB)...');
    (async () => {
      try {
        console.log('[CLIO IMPORT] Background process started for connection:', connectionId);
        
        // Track counts for progress
        const counts = { users: 0, contacts: 0, matters: 0, activities: 0, bills: 0, calendar: 0 };
        const warnings = [];
        
        // ID maps for linking
        const userIdMap = new Map();
        const contactIdMap = new Map();
        const matterIdMap = new Map();
        
        const updateProgress = (step, status, count, errorMsg = null) => {
          const prog = migrationProgress.get(connectionId);
          if (prog) {
            prog.steps[step] = { status, count };
            if (errorMsg) prog.steps[step].error = errorMsg;
            prog.lastUpdate = new Date();
            console.log(`[CLIO IMPORT] Progress: ${step} = ${status} (${count} records)`);
          }
        };
        
        // ============================================
        // STEP 0: CREATE OR GET FIRM
        // ============================================
        let firmId;
        let actualFirmName = firmName || 'Imported from Clio';
        
        if (existingFirmId) {
          // Use existing firm
          const existingFirm = await query('SELECT id, name FROM firms WHERE id = $1', [existingFirmId]);
          if (existingFirm.rows.length === 0) {
            throw new Error('Selected firm not found');
          }
          firmId = existingFirmId;
          actualFirmName = existingFirm.rows[0].name;
          console.log(`[CLIO IMPORT] Using existing firm: ${actualFirmName} (${firmId})`);
        } else {
          // Create new firm (handle duplicates by adding timestamp)
          const existingFirm = await query('SELECT id FROM firms WHERE name = $1', [actualFirmName]);
          if (existingFirm.rows.length > 0) {
            const timestamp = new Date().toISOString().split('T')[0];
            actualFirmName = `${actualFirmName} (Imported ${timestamp})`;
            warnings.push(`Firm name already exists, created as "${actualFirmName}"`);
          }
          
          const firmResult = await query(
            `INSERT INTO firms (name, status, settings) VALUES ($1, 'active', $2) RETURNING id`,
            [actualFirmName, JSON.stringify({ source: 'clio', importedAt: new Date().toISOString() })]
          );
          firmId = firmResult.rows[0].id;
          console.log(`[CLIO IMPORT] Created new firm: ${actualFirmName} (${firmId})`);
        }
        
        // ============================================
        // STEP 1: IMPORT USERS (direct to DB)
        // ============================================
        if (!includeUsers) {
          console.log('[CLIO IMPORT] Step 1/6: SKIPPING users');
          updateProgress('users', 'skipped', 0);
        } else {
          console.log('[CLIO IMPORT] Step 1/6: Importing users directly to DB...');
          updateProgress('users', 'running', 0);
          try {
            const users = await clioGetAll(accessToken, '/users.json', {
              fields: 'id,name,first_name,last_name,email,enabled,subscription_type'
            }, (count) => updateProgress('users', 'running', count));
            
            for (const u of users) {
              try {
                const email = (u.email || `user${u.id}@import.clio`).toLowerCase();
                const firstName = u.first_name || u.name?.split(' ')[0] || 'User';
                const lastName = u.last_name || u.name?.split(' ').slice(1).join(' ') || '';
                
                // Check for existing user (case-insensitive)
                const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
                if (existing.rows.length > 0) {
                  userIdMap.set(`clio:${u.id}`, existing.rows[0].id);
                  warnings.push(`User "${email}" already exists - using existing`);
                  continue;
                }
                
                // Generate password and insert
                const password = firstName + Math.floor(1000 + Math.random() * 9000) + '!';
                const passwordHash = await bcrypt.hash(password, 12);
                
                const result = await query(
                  `INSERT INTO users (firm_id, email, password_hash, first_name, last_name, role, is_active)
                   VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                  [firmId, email, passwordHash, firstName, lastName, 'attorney', u.enabled !== false]
                );
                
                userIdMap.set(`clio:${u.id}`, result.rows[0].id);
                counts.users++;
              } catch (err) {
                warnings.push(`User ${u.email || u.id}: ${err.message}`);
              }
            }
            updateProgress('users', 'done', counts.users);
            console.log(`[CLIO IMPORT] Users saved to DB: ${counts.users}`);
          } catch (err) {
            console.error('[CLIO IMPORT] Users error:', err.message);
            updateProgress('users', 'error', counts.users, err.message);
          }
        }
        
        // ============================================
        // STEP 2: IMPORT CONTACTS (direct to DB)
        // ============================================
        if (!includeContacts) {
          console.log('[CLIO IMPORT] Step 2/6: SKIPPING contacts');
          updateProgress('contacts', 'skipped', 0);
        } else {
          console.log('[CLIO IMPORT] Step 2/6: Importing contacts directly to DB...');
          updateProgress('contacts', 'running', 0);
          try {
            const contacts = await clioGetAll(accessToken, '/contacts.json', {
              fields: 'id,name,first_name,last_name,type,company{id,name},email_addresses,phone_numbers,addresses'
            }, (count) => updateProgress('contacts', 'running', count));
            
            for (const c of contacts) {
              try {
                const isCompany = c.type === 'Company';
                const displayName = c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown';
                const primaryEmail = c.email_addresses?.find(e => e.default_email) || c.email_addresses?.[0];
                const primaryPhone = c.phone_numbers?.find(p => p.default_number) || c.phone_numbers?.[0];
                const primaryAddr = c.addresses?.find(a => a.primary) || c.addresses?.[0];
                
                const result = await query(
                  `INSERT INTO clients (firm_id, type, display_name, first_name, last_name, company_name, email, phone, address_street, address_city, address_state, address_zip, is_active)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
                  [
                    firmId,
                    isCompany ? 'company' : 'person',
                    displayName,
                    c.first_name || null,
                    c.last_name || null,
                    c.company?.name || null,
                    primaryEmail?.address || null,
                    primaryPhone?.number || null,
                    primaryAddr?.street || null,
                    primaryAddr?.city || null,
                    primaryAddr?.province || null,
                    primaryAddr?.postal_code || null,
                    true
                  ]
                );
                
                contactIdMap.set(`clio:${c.id}`, result.rows[0].id);
                counts.contacts++;
                
                // Log progress every 1000
                if (counts.contacts % 1000 === 0) {
                  console.log(`[CLIO IMPORT] Contacts saved: ${counts.contacts}`);
                }
              } catch (err) {
                // Skip duplicates silently, log others
                if (!err.message.includes('duplicate')) {
                  warnings.push(`Contact ${c.name || c.id}: ${err.message}`);
                }
              }
            }
            updateProgress('contacts', 'done', counts.contacts);
            console.log(`[CLIO IMPORT] Contacts saved to DB: ${counts.contacts}`);
          } catch (err) {
            console.error('[CLIO IMPORT] Contacts error:', err.message);
            updateProgress('contacts', 'error', counts.contacts, err.message);
          }
        }
        
        // ============================================
        // STEP 3: IMPORT MATTERS (direct to DB)
        // ============================================
        if (!includeMatters) {
          console.log('[CLIO IMPORT] Step 3/6: SKIPPING matters');
          updateProgress('matters', 'skipped', 0);
        } else {
          console.log('[CLIO IMPORT] Step 3/6: Importing matters directly to DB...');
          updateProgress('matters', 'running', 0);
          try {
            const matters = await clioGetMattersByStatus(
              accessToken, '/matters.json',
              { fields: 'id,display_number,description,status,open_date,close_date,billing_method,client{id,name},responsible_attorney{id,name},originating_attorney{id,name},practice_area{id,name}' },
              (count) => updateProgress('matters', 'running', count)
            );
            
            // Helper to generate unique matter number
            const usedNumbers = new Set();
            const generateUniqueMatterNumber = async (baseNumber) => {
              let num = baseNumber;
              let attempt = 0;
              while (attempt < 100) {
                if (!usedNumbers.has(num)) {
                  const existing = await query('SELECT id FROM matters WHERE number = $1', [num]);
                  if (existing.rows.length === 0) {
                    usedNumbers.add(num);
                    return num;
                  }
                }
                attempt++;
                num = `${actualFirmName.substring(0,3).toUpperCase()}-${baseNumber}-${attempt}`;
              }
              return `${baseNumber}-${Date.now()}`;
            };
            
            for (const m of matters) {
              try {
                const matterNumber = await generateUniqueMatterNumber(m.display_number || `M-${m.id}`);
                const clientId = m.client?.id ? contactIdMap.get(`clio:${m.client.id}`) : null;
                const responsibleId = m.responsible_attorney?.id ? userIdMap.get(`clio:${m.responsible_attorney.id}`) : null;
                
                const result = await query(
                  `INSERT INTO matters (firm_id, client_id, number, name, description, status, responsible_attorney, open_date, close_date, billing_type)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
                  [
                    firmId,
                    clientId,
                    matterNumber,
                    m.description || matterNumber,
                    m.description || null,
                    m.status?.toLowerCase() === 'closed' ? 'closed' : 'active',
                    responsibleId,
                    m.open_date || null,
                    m.close_date || null,
                    m.billing_method || 'hourly'
                  ]
                );
                
                matterIdMap.set(`clio:${m.id}`, result.rows[0].id);
                counts.matters++;
                
                if (counts.matters % 500 === 0) {
                  console.log(`[CLIO IMPORT] Matters saved: ${counts.matters}`);
                }
              } catch (err) {
                if (!err.message.includes('duplicate')) {
                  warnings.push(`Matter ${m.display_number || m.id}: ${err.message}`);
                }
              }
            }
            updateProgress('matters', 'done', counts.matters);
            console.log(`[CLIO IMPORT] Matters saved to DB: ${counts.matters}`);
          } catch (err) {
            console.error('[CLIO IMPORT] Matters error:', err.message);
            updateProgress('matters', 'error', counts.matters, err.message);
          }
        }
        
        // ============================================
        // STEP 4: IMPORT TIME ENTRIES (direct to DB)
        // ============================================
        if (!includeActivities) {
          console.log('[CLIO IMPORT] Step 4/6: SKIPPING activities');
          updateProgress('activities', 'skipped', 0);
        } else {
          console.log('[CLIO IMPORT] Step 4/6: Importing time entries directly to DB...');
          updateProgress('activities', 'running', 0);
          try {
            const activities = await clioGetActivitiesByStatus(
              accessToken, '/activities.json',
              { fields: 'id,type,date,quantity,price,total,note,billed,non_billable,matter{id,display_number},user{id,name}' },
              (count) => updateProgress('activities', 'running', count)
            );
            
            for (const a of activities) {
              try {
                const matterId = a.matter?.id ? matterIdMap.get(`clio:${a.matter.id}`) : null;
                const userId = a.user?.id ? userIdMap.get(`clio:${a.user.id}`) : null;
                
                if (!matterId) continue; // Skip entries without linked matter
                
                await query(
                  `INSERT INTO time_entries (firm_id, matter_id, user_id, date, duration, rate, description, billable, billed)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                  [
                    firmId,
                    matterId,
                    userId,
                    a.date || new Date().toISOString().split('T')[0],
                    Math.round((a.quantity || 0) * 60), // Convert hours to minutes
                    a.price || null,
                    a.note || 'Imported from Clio',
                    !a.non_billable,
                    a.billed || false
                  ]
                );
                
                counts.activities++;
                
                if (counts.activities % 1000 === 0) {
                  console.log(`[CLIO IMPORT] Time entries saved: ${counts.activities}`);
                }
              } catch (err) {
                // Skip silently - time entries often have issues
              }
            }
            updateProgress('activities', 'done', counts.activities);
            console.log(`[CLIO IMPORT] Time entries saved to DB: ${counts.activities}`);
          } catch (err) {
            console.error('[CLIO IMPORT] Activities error:', err.message);
            updateProgress('activities', 'error', counts.activities, err.message);
          }
        }
        
        // ============================================
        // STEP 5: IMPORT BILLS (direct to DB)
        // ============================================
        if (!includeBills) {
          console.log('[CLIO IMPORT] Step 5/6: SKIPPING bills');
          updateProgress('bills', 'skipped', 0);
        } else {
          console.log('[CLIO IMPORT] Step 5/6: Importing bills directly to DB...');
          updateProgress('bills', 'running', 0);
          try {
            const bills = await clioGetAll(accessToken, '/bills.json', {
              fields: 'id,number,issued_at,due_at,total,balance,state,matters{id,display_number},client{id,name}'
            }, (count) => updateProgress('bills', 'running', count));
            
            for (const b of bills) {
              try {
                const firstMatter = b.matters?.[0];
                const matterId = firstMatter?.id ? matterIdMap.get(`clio:${firstMatter.id}`) : null;
                const clientId = b.client?.id ? contactIdMap.get(`clio:${b.client.id}`) : null;
                
                await query(
                  `INSERT INTO invoices (firm_id, matter_id, client_id, number, date, due_date, total, balance, status)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                  [
                    firmId,
                    matterId,
                    clientId,
                    b.number || `INV-${b.id}`,
                    b.issued_at || new Date().toISOString().split('T')[0],
                    b.due_at || null,
                    b.total || 0,
                    b.balance || 0,
                    b.state === 'paid' ? 'paid' : b.state === 'void' ? 'void' : 'pending'
                  ]
                );
                
                counts.bills++;
              } catch (err) {
                // Skip silently
              }
            }
            updateProgress('bills', 'done', counts.bills);
            console.log(`[CLIO IMPORT] Bills saved to DB: ${counts.bills}`);
          } catch (err) {
            console.error('[CLIO IMPORT] Bills error:', err.message);
            updateProgress('bills', 'error', counts.bills, err.message);
          }
        }
        
        // ============================================
        // STEP 6: IMPORT CALENDAR (direct to DB)
        // ============================================
        if (!includeCalendar) {
          console.log('[CLIO IMPORT] Step 6/6: SKIPPING calendar');
          updateProgress('calendar', 'skipped', 0);
        } else {
          console.log('[CLIO IMPORT] Step 6/6: Importing calendar directly to DB...');
          updateProgress('calendar', 'running', 0);
          try {
            const events = await clioGetAll(accessToken, '/calendar_entries.json', {
              fields: 'id,summary,description,start_at,end_at,all_day,location,matter,attendees'
            }, (count) => updateProgress('calendar', 'running', count));
            
            for (const e of events) {
              try {
                const matterId = e.matter?.id ? matterIdMap.get(`clio:${e.matter.id}`) : null;
                
                await query(
                  `INSERT INTO calendar_events (firm_id, matter_id, title, description, start_time, end_time, all_day, location)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                  [
                    firmId,
                    matterId,
                    e.summary || 'Event',
                    e.description || null,
                    e.start_at || null,
                    e.end_at || null,
                    e.all_day || false,
                    e.location || null
                  ]
                );
                
                counts.calendar++;
              } catch (err) {
                // Skip silently
              }
            }
            updateProgress('calendar', 'done', counts.calendar);
            console.log(`[CLIO IMPORT] Calendar saved to DB: ${counts.calendar}`);
          } catch (err) {
            console.error('[CLIO IMPORT] Calendar error:', err.message);
            updateProgress('calendar', 'error', counts.calendar, err.message);
          }
        }
        
        // ============================================
        // COMPLETE
        // ============================================
        console.log('[CLIO IMPORT] All steps complete!');
        const prog = migrationProgress.get(connectionId);
        if (prog) {
          prog.status = 'completed';
          prog.completedAt = new Date();
          prog.summary = {
            firm: actualFirmName,
            firmId: firmId,
            users: counts.users,
            contacts: counts.contacts,
            matters: counts.matters,
            activities: counts.activities,
            bills: counts.bills,
            calendar: counts.calendar,
            warnings: warnings.length
          };
          console.log('[CLIO IMPORT] ✓ Import completed:', prog.summary);
        }
        
      } catch (error) {
        console.error('[CLIO IMPORT] ✗ Import failed:', error.message);
        console.error('[CLIO IMPORT] Stack:', error.stack);
        const prog = migrationProgress.get(connectionId);
        if (prog) {
          prog.status = 'error';
          prog.error = error.message;
        }
      }
    })();
    
  } catch (error) {
    console.error('[CLIO] Import start error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get the imported data once complete
router.get('/clio/result/:connectionId', requireSecureAdmin, (req, res) => {
  const { connectionId } = req.params;
  const progress = migrationProgress.get(connectionId);
  
  if (!progress) {
    return res.status(404).json({ success: false, error: 'No import found for this connection' });
  }
  
  if (progress.status !== 'completed') {
    return res.status(400).json({ 
      success: false, 
      status: progress.status,
      error: progress.status === 'error' ? progress.error : 'Import not yet complete'
    });
  }
  
  res.json({
    success: true,
    transformedData: progress.result,
    summary: progress.summary
  });
});

// Disconnect from Clio
router.post('/clio/disconnect', requireSecureAdmin, (req, res) => {
  const { connectionId } = req.body;
  if (connectionId) {
    clioConnections.delete(connectionId);
    migrationProgress.delete(connectionId);
  }
  res.json({ success: true, message: 'Disconnected from Clio' });
});

// ============================================
// CHUNKED MIGRATION - For unlimited data size
// ============================================

// In-memory storage for migration sessions (in production, use Redis)
const migrationSessions = new Map();

// Start a new migration session
router.post('/start-session', requireSecureAdmin, (req, res) => {
  try {
    const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const { firmName, firmEmail, firmPhone, firmAddress } = req.body;
    
    migrationSessions.set(sessionId, {
      created: new Date(),
      firm: {
        name: firmName || 'Imported Firm',
        email: firmEmail || null,
        phone: firmPhone || null,
        address: firmAddress || null
      },
      users: [],
      contacts: [],
      matters: [],
      activities: [],
      calendar_entries: [],
      bills: [],
      chunks: { users: 0, clients: 0, matters: 0, timeEntries: 0, calendarEvents: 0, bills: 0 }
    });
    
    console.log('[MIGRATION] Session started:', sessionId);
    res.json({ success: true, sessionId });
  } catch (error) {
    console.error('[MIGRATION] Start session error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add a chunk of data to a session
router.post('/add-chunk', requireSecureAdmin, (req, res) => {
  try {
    const { sessionId, dataType, data } = req.body;
    
    if (!sessionId || !migrationSessions.has(sessionId)) {
      return res.status(400).json({ success: false, error: 'Invalid session ID' });
    }
    
    const session = migrationSessions.get(sessionId);
    
    if (!data || typeof data !== 'string' || !data.trim()) {
      return res.json({ success: true, added: 0, message: 'No data in chunk' });
    }
    
    const lines = data.trim().split('\n');
    let added = 0;
    
    // Skip header if this is the first chunk for this type
    const startIdx = session.chunks[dataType] === 0 ? 1 : 0;
    session.chunks[dataType]++;
    
    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim()) continue;
      const parts = line.split(',').map(p => (p || '').trim());
      
      if (dataType === 'users' && parts.length >= 2) {
        const name = String(parts[0] || 'User');
        const nameParts = name.split(' ');
        const firstName = nameParts[0] || 'User';
        session.users.push({
          email: String(parts[1] || `user${session.users.length + 1}@temp.com`),
          first_name: firstName,
          last_name: nameParts.slice(1).join(' ') || 'Import',
          type: String(parts[2] || 'Attorney'),
          rate: parseFloat(String(parts[3] || '0').replace(/[$,]/g, '')) || null,
          password: firstName + Math.floor(1000 + Math.random() * 9000) + '!'
        });
        added++;
      }
      else if (dataType === 'clients' && parts[0]) {
        session.contacts.push({
          type: 'Person',
          name: String(parts[0]),
          email: parts[1] ? String(parts[1]) : null,
          phone: parts[2] ? String(parts[2]) : null
        });
        added++;
      }
      else if (dataType === 'matters' && parts[0]) {
        // Auto-generate unique matter number, use first column as description
        // Expected columns: Name, Client, Status, Practice Area, Responsible Attorney, Originating Attorney, Open Date, Close Date, Billing Method
        const matterNum = `M-${String(session.matters.length + 1).padStart(5, '0')}`;
        session.matters.push({
          display_number: matterNum,
          description: String(parts[0] || 'Imported Matter'),
          client: parts[1] ? { name: String(parts[1]) } : null,
          status: parts[2] ? String(parts[2]) : 'Open',
          practice_area: parts[3] ? { name: String(parts[3]) } : null,
          responsible_attorney: parts[4] ? { name: String(parts[4]) } : null,
          originating_attorney: parts[5] ? { name: String(parts[5]) } : null,
          open_date: parts[6] ? String(parts[6]) : null,
          close_date: parts[7] ? String(parts[7]) : null,
          billing_method: parts[8] ? String(parts[8]).toLowerCase() : 'hourly'
        });
        added++;
      }
      else if (dataType === 'timeEntries' && parts[0]) {
        session.activities.push({
          type: 'TimeEntry',
          date: String(parts[0] || new Date().toISOString().split('T')[0]),
          matter: parts[1] ? { display_number: String(parts[1]) } : null,
          user: parts[2] ? { name: String(parts[2]) } : null,
          quantity: parseFloat(parts[3] || '0') || 0,
          note: String(parts[4] || 'Time entry')
        });
        added++;
      }
      else if (dataType === 'calendarEvents' && parts[0]) {
        session.calendar_entries.push({
          summary: String(parts[0] || 'Event'),
          start_at: parts[1] ? String(parts[1]) : null,
          end_at: parts[2] ? String(parts[2]) : null,
          description: parts[3] ? String(parts[3]) : null
        });
        added++;
      }
      else if (dataType === 'bills' && parts[0]) {
        // Bills: Invoice#, Matter, Client, Date, Amount, Status, Due Date
        session.bills.push({
          number: String(parts[0] || `INV-${session.bills.length + 1}`),
          matter: parts[1] ? { display_number: String(parts[1]) } : null,
          client: parts[2] ? { name: String(parts[2]) } : null,
          issued_at: parts[3] ? String(parts[3]) : null,
          total: parseFloat(String(parts[4] || '0').replace(/[$,]/g, '')) || 0,
          status: parts[5] ? String(parts[5]) : 'draft',
          due_at: parts[6] ? String(parts[6]) : null,
          balance: parseFloat(String(parts[7] || parts[4] || '0').replace(/[$,]/g, '')) || 0
        });
        added++;
      }
    }
    
    const typeMapping = {
      clients: 'contacts',
      timeEntries: 'activities', 
      calendarEvents: 'calendar_entries',
      bills: 'bills',
      users: 'users',
      matters: 'matters'
    };
    const mappedType = typeMapping[dataType] || dataType;
    console.log(`[MIGRATION] Chunk added to ${sessionId}: ${dataType} +${added} (total: ${session[mappedType]?.length || 0})`);
    
    res.json({ 
      success: true, 
      added,
      totals: {
        users: session.users.length,
        contacts: session.contacts.length,
        matters: session.matters.length,
        activities: session.activities.length,
        calendar_entries: session.calendar_entries.length,
        bills: session.bills.length
      }
    });
  } catch (error) {
    console.error('[MIGRATION] Add chunk error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Finalize session and return parsed data
router.post('/finalize-session', requireSecureAdmin, (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId || !migrationSessions.has(sessionId)) {
      return res.status(400).json({ success: false, error: 'Invalid session ID' });
    }
    
    const session = migrationSessions.get(sessionId);
    
    const result = {
      firm: session.firm,
      users: session.users,
      contacts: session.contacts,
      matters: session.matters,
      activities: session.activities,
      calendar_entries: session.calendar_entries,
      bills: session.bills
    };
    
    // Clean up session
    migrationSessions.delete(sessionId);
    
    console.log('[MIGRATION] Session finalized:', sessionId, {
      users: result.users.length,
      contacts: result.contacts.length,
      matters: result.matters.length,
      activities: result.activities.length,
      calendar_entries: result.calendar_entries.length,
      bills: result.bills.length
    });
    
    res.json({
      success: true,
      transformedData: result,
      summary: {
        firm: result.firm.name,
        users: result.users.length,
        contacts: result.contacts.length,
        matters: result.matters.length,
        activities: result.activities.length,
        calendar_entries: result.calendar_entries.length,
        bills: result.bills.length
      }
    });
  } catch (error) {
    console.error('[MIGRATION] Finalize error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clean up old sessions (call periodically)
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  for (const [id, session] of migrationSessions) {
    if (session.created < oneHourAgo) {
      migrationSessions.delete(id);
      console.log('[MIGRATION] Cleaned up old session:', id);
    }
  }
}, 15 * 60 * 1000); // Every 15 minutes

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
      calendar_entries: [],
      bills: []
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
    // Expected columns: Name, Client, Status, Practice Area, Responsible Attorney, Originating Attorney, Open Date, Close Date, Billing Method
    try {
      if (body.matters && typeof body.matters === 'string' && body.matters.trim()) {
        console.log('[PARSE-CSV] Parsing matters, length:', body.matters.length);
        const lines = body.matters.trim().split('\n');
        let matterCount = 0;
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line || !line.trim()) continue;
          const parts = line.split(',').map(p => (p || '').trim());
          if (parts[0]) {
            matterCount++;
            result.matters.push({
              display_number: `M-${String(matterCount).padStart(5, '0')}`,
              description: String(parts[0] || 'Imported Matter'),
              client: parts[1] ? { name: String(parts[1]) } : null,
              status: parts[2] ? String(parts[2]) : 'Open',
              practice_area: parts[3] ? { name: String(parts[3]) } : null,
              responsible_attorney: parts[4] ? { name: String(parts[4]) } : null,
              originating_attorney: parts[5] ? { name: String(parts[5]) } : null,
              open_date: parts[6] ? String(parts[6]) : null,
              close_date: parts[7] ? String(parts[7]) : null,
              billing_method: parts[8] ? String(parts[8]).toLowerCase() : 'hourly'
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

    // Parse bills if provided
    // Expected columns: Invoice#, Matter, Client, Date, Amount, Status, Due Date, Balance
    try {
      if (body.bills && typeof body.bills === 'string' && body.bills.trim()) {
        console.log('[PARSE-CSV] Parsing bills, length:', body.bills.length);
        const lines = body.bills.trim().split('\n');
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line || !line.trim()) continue;
          const parts = line.split(',').map(p => (p || '').trim());
          if (parts[0]) {
            result.bills.push({
              number: String(parts[0] || `INV-${result.bills.length + 1}`),
              matter: parts[1] ? { display_number: String(parts[1]) } : null,
              client: parts[2] ? { name: String(parts[2]) } : null,
              issued_at: parts[3] ? String(parts[3]) : null,
              total: parseFloat(String(parts[4] || '0').replace(/[$,]/g, '')) || 0,
              status: parts[5] ? String(parts[5]).toLowerCase() : 'draft',
              due_at: parts[6] ? String(parts[6]) : null,
              balance: parseFloat(String(parts[7] || parts[4] || '0').replace(/[$,]/g, '')) || 0
            });
          }
        }
        console.log('[PARSE-CSV] Bills parsed:', result.bills.length);
      }
    } catch (billErr) {
      console.error('[PARSE-CSV] Bills parse error:', billErr.message);
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
        calendar_entries: result.calendar_entries.length,
        bills: result.bills.length
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

// ============================================
// DIAGNOSTIC: Check if user/email exists
// ============================================

router.get('/check-user/:email', requireSecureAdmin, async (req, res) => {
  try {
    const { email } = req.params;
    
    console.log(`[MIGRATION DIAGNOSTIC] Checking for user with email: "${email}"`);
    
    // Check with exact match
    const exactResult = await query(
      'SELECT id, email, first_name, last_name, firm_id, is_active, created_at FROM users WHERE email = $1',
      [email]
    );
    
    // Check with lowercase match
    const lowerResult = await query(
      'SELECT id, email, first_name, last_name, firm_id, is_active, created_at FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    // Check with ILIKE (partial match like admin portal uses)
    const ilikeResult = await query(
      'SELECT id, email, first_name, last_name, firm_id, is_active, created_at FROM users WHERE email ILIKE $1',
      [`%${email}%`]
    );
    
    // Get firm names for context
    const firmIds = [...new Set([
      ...exactResult.rows.map(r => r.firm_id),
      ...lowerResult.rows.map(r => r.firm_id),
      ...ilikeResult.rows.map(r => r.firm_id)
    ])].filter(Boolean);
    
    const firmNames = {};
    if (firmIds.length > 0) {
      const firms = await query('SELECT id, name FROM firms WHERE id = ANY($1)', [firmIds]);
      firms.rows.forEach(f => { firmNames[f.id] = f.name; });
    }
    
    const formatUser = (u) => ({
      id: u.id,
      email: u.email,
      name: `${u.first_name} ${u.last_name}`,
      firmId: u.firm_id,
      firmName: firmNames[u.firm_id] || 'Unknown',
      isActive: u.is_active,
      createdAt: u.created_at
    });
    
    res.json({
      searchedFor: email,
      results: {
        exactMatch: exactResult.rows.map(formatUser),
        caseInsensitiveMatch: lowerResult.rows.map(formatUser),
        partialMatch: ilikeResult.rows.map(formatUser)
      },
      summary: {
        exactMatchCount: exactResult.rows.length,
        caseInsensitiveMatchCount: lowerResult.rows.length,
        partialMatchCount: ilikeResult.rows.length,
        userExists: lowerResult.rows.length > 0
      }
    });
  } catch (error) {
    console.error('Check user error:', error);
    res.status(500).json({ error: 'Failed to check user: ' + error.message });
  }
});

export default router;
