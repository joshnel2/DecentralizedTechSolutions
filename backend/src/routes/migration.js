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
  
  // Build query string manually - searchParams.append encodes commas as %2C which breaks Clio's fields parameter
  const queryParts = [];
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        value.forEach(v => queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`));
      } else if (key === 'fields') {
        // Don't encode the fields value - Clio needs raw commas
        queryParts.push(`fields=${value}`);
      } else {
        queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      }
    }
  });
  
  const url = `${CLIO_API_BASE}${endpoint}${queryParts.length ? '?' + queryParts.join('&') : ''}`;
  
  console.log(`[CLIO API] GET ${endpoint} with params:`, params);
  console.log(`[CLIO API] Full URL: ${url}`);
  
  try {
    const response = await fetch(url, {
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
  
  // CATCH-ALL: Fetch contacts WITHOUT initial filter to catch any missed
  // This catches: special characters, unicode/accented names, empty names, etc.
  // We fetch by type only (no initial) to get everything, deduping by ID
  console.log(`[CLIO API] Running catch-all fetch to get any missed contacts...`);
  for (const type of types) {
    try {
      console.log(`[CLIO API] Catch-all fetch for ${type} contacts...`);
      const catchAllData = await clioGetPaginated(
        accessToken, 
        endpoint, 
        { ...params, type }, 
        null
      );
      
      let newCount = 0;
      for (const item of catchAllData) {
        if (item.id && !seenIds.has(item.id)) {
          seenIds.add(item.id);
          allData.push(item);
          newCount++;
        }
      }
      
      if (newCount > 0) {
        console.log(`[CLIO API] Catch-all ${type}: found ${newCount} additional contacts! Total: ${allData.length}`);
      }
      if (onProgress) onProgress(allData.length);
      
    } catch (err) {
      console.log(`[CLIO API] Catch-all ${type} error: ${err.message}`);
    }
  }
  
  // FINAL CATCH-ALL: Fetch without type filter to catch any other contact types
  try {
    console.log(`[CLIO API] Final catch-all fetch (no type filter)...`);
    const finalCatchAll = await clioGetPaginated(
      accessToken, 
      endpoint, 
      { ...params }, 
      null
    );
    
    let newCount = 0;
    for (const item of finalCatchAll) {
      if (item.id && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        allData.push(item);
        newCount++;
      }
    }
    
    if (newCount > 0) {
      console.log(`[CLIO API] Final catch-all: found ${newCount} additional contacts! Total: ${allData.length}`);
    }
    if (onProgress) onProgress(allData.length);
    
  } catch (err) {
    console.log(`[CLIO API] Final catch-all error: ${err.message}`);
  }
  
  console.log(`[CLIO API] Contacts complete: ${allData.length} total records`);
  return allData;
}

// Fetch matters by STATUS - includes all possible Clio statuses + catch-all
// Each status can have up to 10k records
async function clioGetMattersByStatus(accessToken, endpoint, params, onProgress, clientIds = null) {
  const allData = [];
  const seenIds = new Set();
  // Include ALL possible Clio matter statuses
  const statuses = ['Open', 'Pending', 'Closed', 'Archived'];
  
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
  
  // CATCH-ALL: Fetch matters WITHOUT status filter to catch any with null/empty/custom status
  console.log(`[CLIO API] Running catch-all fetch for matters without status filter...`);
  try {
    const catchAllMatters = await clioGetPaginated(
      accessToken,
      endpoint,
      { ...params },
      (count) => {
        if (onProgress) onProgress(allData.length + count);
      }
    );
    
    let newCount = 0;
    for (const item of catchAllMatters) {
      if (item.id && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        allData.push(item);
        newCount++;
      }
    }
    
    if (newCount > 0) {
      console.log(`[CLIO API] Catch-all matters: found ${newCount} additional! Total: ${allData.length}`);
    }
    if (onProgress) onProgress(allData.length);
    
  } catch (err) {
    console.log(`[CLIO API] Catch-all matters error: ${err.message}`);
  }
  
  console.log(`[CLIO API] Matters complete: ${allData.length} total records`);
  return allData;
}

// Fetch activities by STATUS + YEAR - chunked to avoid 10k limit
async function clioGetActivitiesByStatus(accessToken, endpoint, params, onProgress, matterIds = null) {
  const allData = [];
  const seenIds = new Set();
  const statuses = ['billed', 'unbilled', 'non_billable'];
  const currentYear = new Date().getFullYear();
  
  console.log(`[CLIO API] Fetching activities by status + year (to bypass 10k limit)...`);
  
  // Iterate through years (2008 is Clio launch, start safely at 2000)
  for (let year = 2000; year <= currentYear; year++) {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    
    for (const status of statuses) {
      console.log(`[CLIO API] Fetching ${status} activities for ${year}...`);
      
      try {
        const batchActivities = await clioGetPaginated(
          accessToken,
          endpoint,
          { 
            ...params, 
            status,
            'date[]': [`>=${startDate}`, `<=${endDate}`]
          },
          (count) => {
            // Only update progress, don't recount total
          }
        );
        
        let newCount = 0;
        for (const item of batchActivities) {
          if (item.id && !seenIds.has(item.id)) {
            seenIds.add(item.id);
            allData.push(item);
            newCount++;
          }
        }
        
        if (newCount > 0) {
          console.log(`[CLIO API] ${status} activities for ${year}: ${newCount} new records`);
          if (onProgress) onProgress(allData.length);
        }
        
      } catch (err) {
        console.log(`[CLIO API] Error fetching ${status} activities for ${year}: ${err.message}`);
      }
    }
  }
  
  // CATCH-ALL: Fetch recent activities (last 30 days) WITHOUT filters to catch any oddities
  console.log(`[CLIO API] Running catch-all fetch for recent activities...`);
  try {
    const catchAllActivities = await clioGetPaginated(
      accessToken,
      endpoint,
      { 
        ...params,
        'updated_at[]': `>=${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()}`
      },
      null
    );
    
    let newCount = 0;
    for (const item of catchAllActivities) {
      if (item.id && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        allData.push(item);
        newCount++;
      }
    }
    
    if (newCount > 0) {
      console.log(`[CLIO API] Catch-all activities: found ${newCount} additional! Total: ${allData.length}`);
      if (onProgress) onProgress(allData.length);
    }
    
  } catch (err) {
    console.log(`[CLIO API] Catch-all activities error: ${err.message}`);
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
 * Clio format: [{address: "email@example.com", name: "Work", primary: true}]
 */
const extractEmail = (emailAddresses, fallbackEmail) => {
  if (fallbackEmail && typeof fallbackEmail === 'string') return fallbackEmail;
  if (!emailAddresses || !Array.isArray(emailAddresses)) return null;
  
  const defaultEmail = emailAddresses.find(e => e.primary);
  if (defaultEmail) return defaultEmail.address;
  if (emailAddresses.length > 0) return emailAddresses[0].address;
  return null;
};

/**
 * Extract primary phone from Clio phone_numbers array
 * Clio format: [{number: "555-123-4567", name: "Mobile", primary: true}]
 */
const extractPhone = (phoneNumbers, fallbackPhone) => {
  if (fallbackPhone && typeof fallbackPhone === 'string') return fallbackPhone;
  if (!phoneNumbers || !Array.isArray(phoneNumbers)) return null;
  
  const defaultPhone = phoneNumbers.find(p => p.primary);
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
 * Clio statuses: Open, Pending, Closed
 * DB constraint: active, pending, closed, on_hold, archived
 */
const mapMatterStatus = (clioStatus) => {
  if (!clioStatus) return 'active';
  const status = clioStatus.toLowerCase();
  if (status === 'open') return 'active';
  if (status === 'pending') return 'pending';
  if (status === 'closed') return 'closed';
  if (status === 'archived') return 'archived';
  if (status === 'on_hold' || status === 'on hold') return 'on_hold';
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

// ============================================
// CLIO DIAGNOSTIC ENDPOINT - Shows raw API responses
// ============================================
router.get('/clio/diagnose/:connectionId', requireSecureAdmin, async (req, res) => {
  try {
    const { connectionId } = req.params;
    
    if (!clioConnections.has(connectionId)) {
      return res.status(400).json({ success: false, error: 'Connection not found. Please reconnect to Clio.' });
    }
    
    const connection = clioConnections.get(connectionId);
    const accessToken = connection.accessToken;
    
    const results = {
      timestamp: new Date().toISOString(),
      connectionId,
      contacts: { raw: [], analysis: {} },
      activities: { raw: [], analysis: {} },
      bills: { raw: [], analysis: {} },
      errors: []
    };
    
    // 1. FETCH SAMPLE CONTACTS - Try multiple field syntaxes to find what works
    try {
      console.log('[CLIO DIAGNOSE] Fetching sample contacts with different field syntaxes...');
      
      // Try syntax 1: Simple field names
      const response1 = await clioRequest(accessToken, '/contacts.json', {
        fields: 'id,name,primary_email_address,primary_phone_number',
        limit: 3
      });
      results.contacts.syntax1_simple = {
        fields: 'primary_email_address,primary_phone_number',
        sample: response1.data?.[0] || null
      };
      
      // Try syntax 2: Nested field syntax
      const response2 = await clioRequest(accessToken, '/contacts.json', {
        fields: 'id,name,primary_email_address{address,name},primary_phone_number{number,name}',
        limit: 3
      });
      results.contacts.syntax2_nested = {
        fields: 'primary_email_address{address,name},primary_phone_number{number,name}',
        sample: response2.data?.[0] || null
      };
      
      // Try syntax 3: email_addresses array (the old way)
      const response3 = await clioRequest(accessToken, '/contacts.json', {
        fields: 'id,name,email_addresses,phone_numbers',
        limit: 3
      });
      results.contacts.syntax3_arrays = {
        fields: 'email_addresses,phone_numbers',
        sample: response3.data?.[0] || null
      };
      
      // Use response1 for main analysis
      results.contacts.raw = response1.data || [];
      results.contacts.totalAvailable = response1.meta?.paging?.records || 'unknown';
      
      // Analyze what fields are present
      const contactAnalysis = {
        count: results.contacts.raw.length,
        withEmailAddresses: 0,
        withPhoneNumbers: 0,
        withAddresses: 0,
        fieldsPresent: new Set(),
        sampleEmailFormat: null,
        samplePhoneFormat: null,
        recommendation: ''
      };
      
      // Check which syntax returned data
      const s1 = results.contacts.syntax1_simple?.sample;
      const s2 = results.contacts.syntax2_nested?.sample;
      const s3 = results.contacts.syntax3_arrays?.sample;
      
      if (s1?.primary_email_address?.address) {
        contactAnalysis.recommendation = 'Use: primary_email_address (simple syntax works)';
      } else if (s2?.primary_email_address?.address) {
        contactAnalysis.recommendation = 'Use: primary_email_address{address,name} (nested syntax required)';
      } else if (s3?.email_addresses?.length > 0) {
        contactAnalysis.recommendation = 'Use: email_addresses array (old syntax works)';
      } else {
        contactAnalysis.recommendation = 'NONE of the syntaxes returned email data - check API permissions';
      }
      
      for (const c of results.contacts.raw) {
        Object.keys(c).forEach(k => contactAnalysis.fieldsPresent.add(k));
        
        // Check all possible field names
        const hasEmail = c.primary_email_address?.address || c.email_addresses?.[0]?.address;
        const hasPhone = c.primary_phone_number?.number || c.phone_numbers?.[0]?.number;
        
        if (hasEmail) {
          contactAnalysis.withEmailAddresses++;
          if (!contactAnalysis.sampleEmailFormat) {
            contactAnalysis.sampleEmailFormat = c.primary_email_address || c.email_addresses?.[0];
          }
        }
        if (hasPhone) {
          contactAnalysis.withPhoneNumbers++;
          if (!contactAnalysis.samplePhoneFormat) {
            contactAnalysis.samplePhoneFormat = c.primary_phone_number || c.phone_numbers?.[0];
          }
        }
        if (c.primary_address?.street || c.primary_address?.city) {
          contactAnalysis.withAddresses++;
        }
      }
      contactAnalysis.fieldsPresent = Array.from(contactAnalysis.fieldsPresent);
      results.contacts.analysis = contactAnalysis;
      
    } catch (err) {
      results.errors.push({ type: 'contacts', message: err.message });
    }
    
    // 2. FETCH SAMPLE ACTIVITIES/TIME ENTRIES (first 5)
    try {
      console.log('[CLIO DIAGNOSE] Fetching sample activities...');
      const activitiesResponse = await clioRequest(accessToken, '/activities.json', {
        fields: 'id,type,date,quantity,price,total,note,matter,user,activity_description,billed,flat_rate,contingency_fee',
        limit: 5
      });
      
      results.activities.raw = activitiesResponse.data || [];
      results.activities.totalAvailable = activitiesResponse.meta?.paging?.records || 'unknown';
      
      // Analyze
      const activityAnalysis = {
        count: results.activities.raw.length,
        types: {},
        fieldsPresent: new Set()
      };
      
      for (const a of results.activities.raw) {
        Object.keys(a).forEach(k => activityAnalysis.fieldsPresent.add(k));
        activityAnalysis.types[a.type] = (activityAnalysis.types[a.type] || 0) + 1;
      }
      activityAnalysis.fieldsPresent = Array.from(activityAnalysis.fieldsPresent);
      results.activities.analysis = activityAnalysis;
      
    } catch (err) {
      results.errors.push({ type: 'activities', message: err.message });
    }
    
    // 3. FETCH SAMPLE BILLS (first 5)
    try {
      console.log('[CLIO DIAGNOSE] Fetching sample bills...');
      const billsResponse = await clioRequest(accessToken, '/bills.json', {
        fields: 'id,number,issued_at,due_at,state,total,balance,matter,client,user',
        limit: 5
      });
      
      results.bills.raw = billsResponse.data || [];
      results.bills.totalAvailable = billsResponse.meta?.paging?.records || 'unknown';
      
      // Analyze
      const billAnalysis = {
        count: results.bills.raw.length,
        states: {},
        fieldsPresent: new Set()
      };
      
      for (const b of results.bills.raw) {
        Object.keys(b).forEach(k => billAnalysis.fieldsPresent.add(k));
        billAnalysis.states[b.state] = (billAnalysis.states[b.state] || 0) + 1;
      }
      billAnalysis.fieldsPresent = Array.from(billAnalysis.fieldsPresent);
      results.bills.analysis = billAnalysis;
      
    } catch (err) {
      results.errors.push({ type: 'bills', message: err.message });
    }
    
    // 4. Also check what the API token has access to
    try {
      console.log('[CLIO DIAGNOSE] Checking API permissions...');
      const whoami = await clioRequest(accessToken, '/users/who_am_i.json', {
        fields: 'id,name,email,subscription_type,account'
      });
      results.apiUser = whoami.data;
    } catch (err) {
      results.errors.push({ type: 'whoami', message: err.message });
    }
    
    console.log('[CLIO DIAGNOSE] Complete. Results:', JSON.stringify(results, null, 2));
    
    res.json({
      success: true,
      message: 'Diagnostic complete - see raw Clio API responses below',
      results
    });
    
  } catch (error) {
    console.error('[CLIO DIAGNOSE] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// In-memory progress tracking (data saves to DB immediately, this is just for UI updates)
const migrationProgress = new Map();

// Get migration status/progress
router.get('/clio/progress/:connectionId', requireSecureAdmin, (req, res) => {
  const { connectionId } = req.params;
  const progress = migrationProgress.get(connectionId);
  
  if (!progress) {
    console.log('[CLIO PROGRESS] No progress found for connection:', connectionId);
    return res.json({ status: 'not_started', message: 'No import has been started for this connection' });
  }
  
  console.log('[CLIO PROGRESS] Returning progress for', connectionId, '- status:', progress.status);
  res.json(progress);
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
      logs: [],
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
        
        // Store user credentials for display on portal
        const userCredentials = [];
        
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
            
            // Add to logs array (keep last 50 entries)
            const logEntry = `[${new Date().toLocaleTimeString()}] ${step}: ${status} (${count} records)${errorMsg ? ` - ${errorMsg}` : ''}`;
            prog.logs = prog.logs || [];
            prog.logs.push(logEntry);
            if (prog.logs.length > 50) prog.logs.shift();
            
            console.log(`[CLIO IMPORT] Progress: ${step} = ${status} (${count} records)`);
          }
        };
        
        const addLog = (message) => {
          const prog = migrationProgress.get(connectionId);
          if (prog) {
            const logEntry = `[${new Date().toLocaleTimeString()}] ${message}`;
            prog.logs = prog.logs || [];
            prog.logs.push(logEntry);
            if (prog.logs.length > 50) prog.logs.shift();
            console.log(`[CLIO IMPORT] ${message}`);
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
            `INSERT INTO firms (name, settings) VALUES ($1, $2) RETURNING id`,
            [actualFirmName, JSON.stringify({ source: 'clio', importedAt: new Date().toISOString() })]
          );
          firmId = firmResult.rows[0].id;
          console.log(`[CLIO IMPORT] Created new firm: ${actualFirmName} (${firmId})`);
        }
        
        // ============================================
        // STEP 1: IMPORT USERS (direct to DB)
        // ============================================
        if (!includeUsers) {
          console.log('[CLIO IMPORT] Step 1/7: SKIPPING users');
          updateProgress('users', 'skipped', 0);
        } else {
          console.log('[CLIO IMPORT] Step 1/7: Importing users directly to DB...');
          updateProgress('users', 'running', 0);
          try {
            // Fetch users - use proven working fields
            const users = await clioGetAll(accessToken, '/users.json', {
              fields: 'id,name,first_name,last_name,email,enabled,subscription_type'
            }, (count) => updateProgress('users', 'running', count));
            
            console.log(`[CLIO IMPORT] Users fetched from Clio: ${users.length}`);
            addLog(`Fetched ${users.length} users from Clio`);
            
            let skippedNoEmail = 0;
            
            for (const u of users) {
              try {
                // SKIP users without a real email - don't create fake emails
                if (!u.email || !u.email.includes('@') || u.email.includes('@import.clio')) {
                  console.log(`[CLIO IMPORT] Skipping user ${u.name || u.id} - no valid email`);
                  skippedNoEmail++;
                  continue;
                }
                
                const baseEmail = u.email.toLowerCase();
                const firstName = u.first_name || u.name?.split(' ')[0] || 'User';
                const lastName = u.last_name || u.name?.split(' ').slice(1).join(' ') || '';
                
                // Map Clio subscription_type to Apex role
                // Valid Apex roles: owner, admin, attorney, paralegal, staff, billing, readonly
                let role = 'attorney';
                const subType = (u.subscription_type || '').toLowerCase();
                if (subType === 'owner') {
                  role = 'owner';
                } else if (subType === 'admin' || subType === 'administrator') {
                  role = 'admin';
                } else if (subType === 'attorney' || subType === 'user' || subType === 'lawyer') {
                  role = 'attorney';
                } else if (subType === 'paralegal' || subType === 'legal assistant') {
                  role = 'paralegal';
                } else if (subType === 'staff' || subType === 'associate' || subType === 'secretary') {
                  role = 'staff';
                } else if (subType === 'billing' || subType === 'accountant') {
                  role = 'billing';
                } else if (subType === 'readonly' || subType === 'viewer') {
                  role = 'readonly';
                }
                
                // Extract hourly rate from Clio (rate field)
                const hourlyRate = u.rate ? parseFloat(u.rate) : null;
                
                // Check if email already exists WITHIN THIS FIRM ONLY (not globally!)
                let email = baseEmail;
                const existingUser = await query(
                  'SELECT id FROM users WHERE firm_id = $1 AND LOWER(email) = LOWER($2)',
                  [firmId, baseEmail]
                );
                
                if (existingUser.rows.length > 0) {
                  // Email exists in THIS firm already, add Clio ID suffix
                  const [localPart, domain] = baseEmail.split('@');
                  email = `${localPart}+clio${u.id}@${domain}`;
                  console.log(`[CLIO IMPORT] Email ${baseEmail} exists in this firm, using ${email}`);
                }
                
                // Generate random password for each user
                const randomPassword = crypto.randomBytes(8).toString('hex') + '!Aa1';
                const passwordHash = await bcrypt.hash(randomPassword, 10);
                
                // Check if email exists GLOBALLY (different firm) - if so, we still insert but need unique email
                const globalDuplicate = await query(
                  'SELECT id, firm_id FROM users WHERE LOWER(email) = LOWER($1)',
                  [email]
                );
                
                if (globalDuplicate.rows.length > 0) {
                  // Email already exists globally - make it unique with clio ID
                  const [localPart, domain] = email.split('@');
                  email = `${localPart}+clio${u.id}@${domain}`;
                  console.log(`[CLIO IMPORT] Email exists globally, using unique: ${email}`);
                }
                
                const result = await query(
                  `INSERT INTO users (firm_id, email, password_hash, first_name, last_name, role, hourly_rate, phone, is_active)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
                  [firmId, email, passwordHash, firstName, lastName, role, hourlyRate, null, u.enabled !== false]
                );
                
                userIdMap.set(`clio:${u.id}`, result.rows[0].id);
                counts.users++;
                
                // Store credentials for display on portal
                userCredentials.push({
                  email: email,
                  firstName: firstName,
                  lastName: lastName,
                  name: `${firstName} ${lastName}`.trim(),
                  password: randomPassword,
                  role: role
                });
                
                console.log(`[CLIO IMPORT] User imported: ${email} (role: ${role}, rate: ${hourlyRate || 'none'})`);
              } catch (err) {
                console.log(`[CLIO IMPORT] User error: ${u.email || u.id} - ${err.message}`);
              }
            }
            console.log(`[CLIO IMPORT] Users skipped (no valid email): ${skippedNoEmail}`);
            console.log('[CLIO IMPORT] Note: Passwords stored for display on portal');
            // Verify users were saved
            const userVerify = await query('SELECT COUNT(*) FROM users WHERE firm_id = $1', [firmId]);
            const actualUserCount = parseInt(userVerify.rows[0].count);
            console.log(`[CLIO IMPORT] Users saved to DB: ${counts.users}, verified in DB: ${actualUserCount}`);
            updateProgress('users', 'done', actualUserCount);
          } catch (err) {
            console.error('[CLIO IMPORT] Users error:', err.message);
            updateProgress('users', 'error', counts.users, err.message);
          }
        }
        
        // ============================================
        // STEP 2: IMPORT CONTACTS (direct to DB)
        // ============================================
        if (!includeContacts) {
          console.log('[CLIO IMPORT] Step 2/7: SKIPPING contacts');
          updateProgress('contacts', 'skipped', 0);
        } else {
          console.log('[CLIO IMPORT] Step 2/7: Importing contacts directly to DB...');
          addLog('Starting contacts import from Clio...');
          updateProgress('contacts', 'running', 0);
          try {
            // Fetch contacts - try ALL possible field syntaxes for email/phone
            // Clio API is inconsistent - some accounts need arrays, some need primary_ fields
            // Also need to handle nested fields for email_addresses and phone_numbers which some API versions use
            // The format email_addresses{address,primary,name} asks for those specific fields on the nested objects
            const contacts = await clioGetAll(accessToken, '/contacts.json', {
              fields: 'id,name,first_name,last_name,type,company{name},email_addresses{address,primary,name,default_email,value},phone_numbers{number,primary,name,default_number,value},primary_email_address{address,primary,name,value},primary_phone_number{number,primary,name,value},addresses{street,city,province,postal_code,country,primary,name},primary_address{street,city,province,postal_code,country,primary,name}'
            }, (count) => updateProgress('contacts', 'running', count));
            
            addLog(`Fetched ${contacts.length} contacts from Clio API. Analyzing email/phone data...`);
            
            // Log samples to debug what Clio returns for email/phone
            if (contacts.length > 0) {
              // Log RAW first contact to see exactly what Clio returns
              console.log(`[CLIO IMPORT] RAW first contact from Clio API:`);
              console.log(JSON.stringify(contacts[0], null, 2));
              
              // Log to frontend what fields exist on first contact
              const firstContact = contacts[0];
              const firstContactFields = Object.keys(firstContact).join(', ');
              addLog(`DEBUG: First contact fields: ${firstContactFields}`);
              
              // Check if email/phone fields exist at all
              const hasEmailField = 'email_addresses' in firstContact || 'primary_email_address' in firstContact;
              const hasPhoneField = 'phone_numbers' in firstContact || 'primary_phone_number' in firstContact;
              addLog(`DEBUG: Has email field: ${hasEmailField}, Has phone field: ${hasPhoneField}`);
              
              // Show sample email/phone data from first contact
              if (firstContact.email_addresses) {
                addLog(`DEBUG: email_addresses = ${JSON.stringify(firstContact.email_addresses)}`);
              }
              if (firstContact.primary_email_address) {
                addLog(`DEBUG: primary_email_address = ${JSON.stringify(firstContact.primary_email_address)}`);
              }
              if (firstContact.phone_numbers) {
                addLog(`DEBUG: phone_numbers = ${JSON.stringify(firstContact.phone_numbers)}`);
              }
              if (firstContact.primary_phone_number) {
                addLog(`DEBUG: primary_phone_number = ${JSON.stringify(firstContact.primary_phone_number)}`);
              }
              
              console.log(`[CLIO IMPORT] First 3 contacts with email/phone data:`);
              for (let i = 0; i < Math.min(3, contacts.length); i++) {
                const c = contacts[i];
                console.log(`[CLIO IMPORT]   Contact ${i+1}: name="${c.name}", email=${JSON.stringify(c.primary_email_address)}, phone=${JSON.stringify(c.primary_phone_number)}`);
              }
              // Also count how many have email/phone - check both field syntaxes
              const withEmail = contacts.filter(c => c.primary_email_address?.address || c.email_addresses?.[0]?.address).length;
              const withPhone = contacts.filter(c => c.primary_phone_number?.number || c.phone_numbers?.[0]?.number).length;
              console.log(`[CLIO IMPORT] Contacts with email: ${withEmail}/${contacts.length}, with phone: ${withPhone}/${contacts.length}`);
              addLog(`Contacts from Clio: ${contacts.length} total, ${withEmail} with email, ${withPhone} with phone`);
            }
            
            // Track how many contacts have email/phone saved
            let savedWithEmail = 0;
            let savedWithPhone = 0;
            
            for (const c of contacts) {
              try {
                const isCompany = c.type === 'Company';
                const displayName = c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown';
                
                // Try both Clio field syntaxes: primary_* fields OR *_arrays
                // Also handle the case where email_addresses might be an array of objects but the 'address' property is at the top level of the object
                
                // Helper to safely get email - try ALL possible fields
                let primaryEmail = null;
                // 1. Direct object
                if (c.primary_email_address) {
                    primaryEmail = c.primary_email_address;
                }
                // 2. Scan array
                else if (Array.isArray(c.email_addresses) && c.email_addresses.length > 0) {
                    primaryEmail = c.email_addresses.find(e => e.primary) || 
                                  c.email_addresses.find(e => e.default_email) || 
                                  c.email_addresses.find(e => e.name === 'Work') ||
                                  c.email_addresses.find(e => e.name === 'Other') ||
                                  c.email_addresses[0];
                }
                
                // Normalize email object - sometimes it's {address: '...'} and sometimes {value: '...'}
                if (primaryEmail) {
                    if (!primaryEmail.address && primaryEmail.value) {
                        primaryEmail.address = primaryEmail.value;
                    }
                }

                // Helper to safely get phone - try ALL possible fields
                let primaryPhone = null;
                // 1. Direct object
                if (c.primary_phone_number) {
                    primaryPhone = c.primary_phone_number;
                }
                // 2. Scan array
                else if (Array.isArray(c.phone_numbers) && c.phone_numbers.length > 0) {
                    primaryPhone = c.phone_numbers.find(p => p.primary) || 
                                  c.phone_numbers.find(p => p.default_number) || 
                                  c.phone_numbers.find(p => p.name === 'Work') ||
                                  c.phone_numbers.find(p => p.name === 'Mobile') ||
                                  c.phone_numbers[0];
                }
                
                // Normalize phone object - sometimes it's {number: '...'} and sometimes {value: '...'}
                if (primaryPhone) {
                    if (!primaryPhone.number && primaryPhone.value) {
                        primaryPhone.number = primaryPhone.value;
                    }
                }

                const primaryAddr = 
                  // Option 1: Direct primary field
                  c.primary_address || 
                  // Option 2: Find primary in array
                  (Array.isArray(c.addresses) ? c.addresses.find(a => a.primary) : null) || 
                  // Option 3: First in array
                  (Array.isArray(c.addresses) ? c.addresses[0] : null);
                
                // Log first 5 contacts with details about what we're saving
                if (counts.contacts < 5) {
                  console.log(`[CLIO IMPORT] Contact ${counts.contacts + 1} SAVE DETAILS:`);
                  console.log(`[CLIO IMPORT]   Name: "${displayName}"`);
                  console.log(`[CLIO IMPORT]   Raw email_addresses: ${JSON.stringify(c.email_addresses)}`);
                  console.log(`[CLIO IMPORT]   Raw primary_email_address: ${JSON.stringify(c.primary_email_address)}`);
                  console.log(`[CLIO IMPORT]   Primary email found: ${JSON.stringify(primaryEmail)}`);
                  console.log(`[CLIO IMPORT]   Email to save: "${primaryEmail?.address || 'NULL'}"`);
                  console.log(`[CLIO IMPORT]   Raw phone_numbers: ${JSON.stringify(c.phone_numbers)}`);
                  console.log(`[CLIO IMPORT]   Raw primary_phone_number: ${JSON.stringify(c.primary_phone_number)}`);
                  console.log(`[CLIO IMPORT]   Primary phone found: ${JSON.stringify(primaryPhone)}`);
                  console.log(`[CLIO IMPORT]   Phone to save: "${primaryPhone?.number || 'NULL'}"`);
                }
                
                // Track what we're saving
                if (primaryEmail?.address) savedWithEmail++;
                if (primaryPhone?.number) savedWithPhone++;
                
                // Build notes with contact info from Clio
                const notesParts = [];
                
                // Save email if present
                if (primaryEmail?.address) {
                  const label = primaryEmail.name || 'Email';
                  notesParts.push(`${label}: ${primaryEmail.address}`);
                }
                
                // Save phone if present
                if (primaryPhone?.number) {
                  const label = primaryPhone.name || 'Phone';
                  notesParts.push(`${label}: ${primaryPhone.number}`);
                }
                
                // Save address if present
                if (primaryAddr) {
                  const addrParts = [primaryAddr.street, primaryAddr.city, primaryAddr.province, primaryAddr.postal_code].filter(Boolean);
                  if (addrParts.length > 0) {
                    const label = primaryAddr.name || 'Address';
                    notesParts.push(`${label}: ${addrParts.join(', ')}`);
                  }
                }
                
                const notes = notesParts.length > 0 ? `--- FROM CLIO ---\n${notesParts.join('\n')}` : null;
                
                const result = await query(
                  `INSERT INTO clients (firm_id, type, display_name, first_name, last_name, company_name, email, phone, address_street, address_city, address_state, address_zip, notes, is_active)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
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
                    notes,
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
            // Verify contacts were saved
            console.log(`[CLIO IMPORT] Contacts fetched from Clio: ${contacts.length}`);
            console.log(`[CLIO IMPORT] Contacts saved with email: ${savedWithEmail}/${counts.contacts}`);
            console.log(`[CLIO IMPORT] Contacts saved with phone: ${savedWithPhone}/${counts.contacts}`);
            addLog(`RESULT: Saved ${counts.contacts} contacts - ${savedWithEmail} with email, ${savedWithPhone} with phone`);
            
            // Verify in database
            const contactVerify = await query('SELECT COUNT(*) FROM clients WHERE firm_id = $1', [firmId]);
            const actualContactCount = parseInt(contactVerify.rows[0].count);
            const contactsWithEmailInDb = await query('SELECT COUNT(*) FROM clients WHERE firm_id = $1 AND email IS NOT NULL AND email != \'\'', [firmId]);
            const contactsWithPhoneInDb = await query('SELECT COUNT(*) FROM clients WHERE firm_id = $1 AND phone IS NOT NULL AND phone != \'\'', [firmId]);
            console.log(`[CLIO IMPORT] Contacts in DB: ${actualContactCount}, with email: ${contactsWithEmailInDb.rows[0].count}, with phone: ${contactsWithPhoneInDb.rows[0].count}`);
            addLog(`DB VERIFY: ${actualContactCount} contacts, ${contactsWithEmailInDb.rows[0].count} with email, ${contactsWithPhoneInDb.rows[0].count} with phone`);
            updateProgress('contacts', 'done', actualContactCount);
          } catch (err) {
            console.error('[CLIO IMPORT] Contacts error:', err.message);
            updateProgress('contacts', 'error', counts.contacts, err.message);
          }
        }
        
        // ============================================
        // STEP 3: IMPORT MATTERS (direct to DB)
        // ============================================
        if (!includeMatters) {
          console.log('[CLIO IMPORT] Step 3/7: SKIPPING matters');
          updateProgress('matters', 'skipped', 0);
        } else {
          console.log('[CLIO IMPORT] Step 3/7: Importing matters directly to DB...');
          updateProgress('matters', 'running', 0);
          try {
            // Fetch matters
            const matters = await clioGetMattersByStatus(
              accessToken, '/matters.json',
              { fields: 'id,display_number,description,status,open_date,close_date,billing_method,client{id,name},responsible_attorney{id,name},originating_attorney{id,name},practice_area{id,name}' },
              (count) => updateProgress('matters', 'running', count)
            );
            
            for (const m of matters) {
              try {
                // Always use unique matter number - append Clio ID to guarantee uniqueness
                const baseNumber = m.display_number || `M-${m.id}`;
                const matterNumber = `${baseNumber}-${m.id}`;
                const clientId = m.client?.id ? contactIdMap.get(`clio:${m.client.id}`) : null;
                const responsibleId = m.responsible_attorney?.id ? userIdMap.get(`clio:${m.responsible_attorney.id}`) : null;
                const originatingId = m.originating_attorney?.id ? userIdMap.get(`clio:${m.originating_attorney.id}`) : null;
                
                // Map practice_area to matter type
                const matterType = m.practice_area?.name || null;
                
                // Get billing rate from matter's custom_rate or responsible attorney's rate
                const billingRate = m.custom_rate 
                  ? parseFloat(m.custom_rate) 
                  : (m.responsible_attorney?.rate ? parseFloat(m.responsible_attorney.rate) : null);
                
                // Map Clio billing_method to Apex billing_type
                let billingType = 'hourly';
                if (m.billing_method) {
                  const method = m.billing_method.toLowerCase();
                  if (method === 'flat' || method === 'flat_fee' || method === 'flat rate') {
                    billingType = 'flat';
                  } else if (method === 'contingency' || method === 'contingent') {
                    billingType = 'contingency';
                  } else if (method === 'retainer') {
                    billingType = 'retainer';
                  } else if (method === 'pro_bono' || method === 'no_charge' || method === 'non-billable') {
                    billingType = 'pro_bono';
                  }
                }
                
                // Build custom_fields JSON from Clio custom_field_values
                const customFields = {};
                if (m.custom_field_values && m.custom_field_values.length > 0) {
                  m.custom_field_values.forEach(cf => {
                    if (cf.field_name && cf.value) {
                      customFields[cf.field_name] = cf.value;
                    }
                  });
                }
                
                const result = await query(
                  `INSERT INTO matters (firm_id, client_id, number, name, description, type, status, responsible_attorney, originating_attorney, open_date, close_date, billing_type, billing_rate, statute_of_limitations, jurisdiction, custom_fields)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
                  [
                    firmId,
                    clientId,
                    matterNumber,
                    m.description || matterNumber,
                    m.description || null,
                    matterType,
                    mapMatterStatus(m.status),
                    responsibleId,
                    originatingId,
                    m.open_date || null,
                    m.close_date || null,
                    billingType,
                    billingRate,
                    m.statute_of_limitations || null,
                    m.location || null,
                    Object.keys(customFields).length > 0 ? JSON.stringify(customFields) : '{}'
                  ]
                );
                
                const matterId = result.rows[0].id;
                matterIdMap.set(`clio:${m.id}`, matterId);
                
                // Create matter_assignments for responsible and originating attorneys
                if (responsibleId) {
                  try {
                    await query(
                      `INSERT INTO matter_assignments (matter_id, user_id, role, billing_rate)
                       VALUES ($1, $2, $3, $4)
                       ON CONFLICT (matter_id, user_id) DO NOTHING`,
                      [matterId, responsibleId, 'responsible_attorney', billingRate]
                    );
                  } catch (assignErr) {
                    // Ignore assignment errors
                  }
                }
                if (originatingId && originatingId !== responsibleId) {
                  try {
                    await query(
                      `INSERT INTO matter_assignments (matter_id, user_id, role, billing_rate)
                       VALUES ($1, $2, $3, $4)
                       ON CONFLICT (matter_id, user_id) DO NOTHING`,
                      [matterId, originatingId, 'originating_attorney', null]
                    );
                  } catch (assignErr) {
                    // Ignore assignment errors
                  }
                }
                
                counts.matters++;
                
                if (counts.matters % 500 === 0) {
                  console.log(`[CLIO IMPORT] Matters saved: ${counts.matters}`);
                }
              } catch (err) {
                console.log(`[CLIO IMPORT] Matter error: ${m.display_number || m.id} - ${err.message}`);
              }
            }
            // Verify matters were saved
            console.log(`[CLIO IMPORT] Matters fetched from Clio: ${matters.length}`);
            const matterVerify = await query('SELECT COUNT(*) FROM matters WHERE firm_id = $1', [firmId]);
            const actualMatterCount = parseInt(matterVerify.rows[0].count);
            console.log(`[CLIO IMPORT] Matters saved to DB: ${counts.matters}, verified in DB: ${actualMatterCount}`);
            updateProgress('matters', 'done', actualMatterCount);
          } catch (err) {
            console.error('[CLIO IMPORT] Matters error:', err.message);
            updateProgress('matters', 'error', counts.matters, err.message);
          }
        }
        
        // ============================================
        // STEP 4: IMPORT TIME ENTRIES (direct to DB)
        // ============================================
        if (!includeActivities) {
          console.log('[CLIO IMPORT] Step 4/7: SKIPPING activities');
          updateProgress('activities', 'skipped', 0);
        } else {
          console.log('[CLIO IMPORT] Step 4/7: Importing time entries and expenses directly to DB...');
          updateProgress('activities', 'running', 0);
          try {
            // Fetch activities - use proven working fields
            // Fetch activities with all needed fields (verified against Clio OpenAPI spec)
            const activities = await clioGetActivitiesByStatus(
              accessToken, '/activities.json',
              { fields: 'id,type,date,quantity,quantity_in_hours,price,total,note,billed,non_billable,matter{id,display_number},user{id,name},activity_description{id,name}' },
              (count) => updateProgress('activities', 'running', count)
            );
            
            console.log(`[CLIO IMPORT] Activities fetched from Clio: ${activities.length}`);
            
            // Log RAW first activity to see exactly what Clio returns
            if (activities.length > 0) {
              console.log(`[CLIO IMPORT] RAW first activity from Clio API:`);
              console.log(JSON.stringify(activities[0], null, 2));
              
              // Log first 5 activities summary
              console.log(`[CLIO IMPORT] First 5 activities summary:`);
              for (let i = 0; i < Math.min(5, activities.length); i++) {
                const a = activities[i];
                console.log(`[CLIO IMPORT]   Activity ${i+1}: type=${a.type}, date=${a.date}, quantity=${a.quantity}, quantity_in_hours=${a.quantity_in_hours}, price=${a.price}, total=${a.total}, billed=${a.billed}, matter_id=${a.matter?.id}, user=${a.user?.name}`);
              }
              
              // Count by type and status
              const timeEntries = activities.filter(a => a.type === 'TimeEntry').length;
              const expenses = activities.filter(a => a.type === 'ExpenseEntry').length;
              const billed = activities.filter(a => a.billed).length;
              const withMatter = activities.filter(a => a.matter?.id).length;
              console.log(`[CLIO IMPORT] Activity breakdown: ${timeEntries} time entries, ${expenses} expenses, ${billed} billed, ${withMatter} with matter`);
            }
            
            let expenseCount = 0;
            let skippedNoMatter = 0;
            let savedTimeEntries = 0;
            
            for (const a of activities) {
              try {
                const matterId = a.matter?.id ? matterIdMap.get(`clio:${a.matter.id}`) : null;
                const userId = a.user?.id ? userIdMap.get(`clio:${a.user.id}`) : null;
                
                if (!matterId) {
                  skippedNoMatter++;
                  continue; // Skip entries without linked matter
                }
                
                // Clio has TimeEntry and ExpenseEntry types
                const isExpense = a.type === 'ExpenseEntry';
                
                if (isExpense) {
                  // Insert as expense
                  const amount = parseFloat(a.total) || parseFloat(a.price) || 0;
                  // Use activity_description name as category if available
                  const category = a.activity_description?.name || 'Expense';
                  
                  await query(
                    `INSERT INTO expenses (firm_id, matter_id, user_id, date, description, amount, category, billable, billed, status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [
                      firmId,
                      matterId,
                      userId,
                      a.date || new Date().toISOString().split('T')[0],
                      a.note || 'Imported expense from Clio',
                      amount,
                      category,
                      !a.non_billable,
                      a.billed || false,
                      a.billed ? 'billed' : 'pending'
                    ]
                  );
                  expenseCount++;
                } else {
                  // Insert as time entry
                  // Prefer quantity_in_hours (already in hours) over quantity (which may be in different units)
                  const hours = parseFloat(a.quantity_in_hours) || parseFloat(a.quantity) || 0;
                  let rate = parseFloat(a.price) || 0;
                  
                  // If no rate but we have total and hours, calculate rate
                  if (rate === 0 && hours > 0 && a.total) {
                    rate = parseFloat(a.total) / hours;
                  }
                  
                  // Default rate if still 0 (for analytics to work)
                  if (rate === 0) {
                    rate = 350; // Default hourly rate
                  }
                  
                  // Determine entry status based on billed flag
                  const status = a.billed ? 'billed' : 'pending';
                  
                  // Get activity code from activity_description.name
                  const activityCode = a.activity_description?.name || null;
                  
                  await query(
                    `INSERT INTO time_entries (firm_id, matter_id, user_id, date, hours, rate, description, activity_code, billable, billed, status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                    [
                      firmId,
                      matterId,
                      userId,
                      a.date || new Date().toISOString().split('T')[0],
                      hours,
                      rate,
                      a.note || 'Imported from Clio',
                      activityCode,
                      !a.non_billable,
                      a.billed || false,
                      status
                    ]
                  );
                  
                  counts.activities++;
                  savedTimeEntries++;
                }
                
                if ((counts.activities + expenseCount) % 1000 === 0) {
                  console.log(`[CLIO IMPORT] Activities saved: ${counts.activities} time entries, ${expenseCount} expenses`);
                }
              } catch (err) {
                console.log(`[CLIO IMPORT] Activity error: ${a.id} - ${err.message}`);
              }
            }
            console.log(`[CLIO IMPORT] Activities without matter (skipped): ${skippedNoMatter}`);
            // Verify time entries and expenses were saved
            console.log(`[CLIO IMPORT] Activities fetched from Clio: ${activities.length}`);
            const activityVerify = await query('SELECT COUNT(*) FROM time_entries WHERE firm_id = $1', [firmId]);
            const expenseVerify = await query('SELECT COUNT(*) FROM expenses WHERE firm_id = $1', [firmId]);
            const actualActivityCount = parseInt(activityVerify.rows[0].count);
            const actualExpenseCount = parseInt(expenseVerify.rows[0].count);
            console.log(`[CLIO IMPORT] Time entries saved: ${counts.activities}, expenses saved: ${expenseCount}`);
            console.log(`[CLIO IMPORT] Verified in DB: ${actualActivityCount} time entries, ${actualExpenseCount} expenses`);
            updateProgress('activities', 'done', actualActivityCount + actualExpenseCount);
          } catch (err) {
            console.error('[CLIO IMPORT] Activities error:', err.message);
            updateProgress('activities', 'error', counts.activities, err.message);
          }
        }
        
        // ============================================
        // STEP 5: IMPORT BILLS (direct to DB)
        // ============================================
        if (!includeBills) {
          console.log('[CLIO IMPORT] Step 5/7: SKIPPING bills');
          updateProgress('bills', 'skipped', 0);
        } else {
          console.log('[CLIO IMPORT] Step 5/7: Importing bills directly to DB...');
          updateProgress('bills', 'running', 0);
          try {
            // Fetch bills with comprehensive financial data
            // Try different field combinations for bills as Clio API permissions vary
            let bills = [];
            try {
              bills = await clioGetAll(accessToken, '/bills.json', {
                fields: 'id,number,issued_at,due_at,total,balance,state,matters{id,display_number},client{id,name}'
              }, (count) => updateProgress('bills', 'running', count));
            } catch (err) {
              console.log(`[CLIO IMPORT] Standard bills fetch failed: ${err.message}. Retrying with minimal fields...`);
              try {
                // Retry with less aggressive field selection - some accounts restrict nested data
                bills = await clioGetAll(accessToken, '/bills.json', {
                  fields: 'id,number,issued_at,due_at,total,balance,state'
                }, (count) => updateProgress('bills', 'running', count));
              } catch (retryErr) {
                console.error(`[CLIO IMPORT] Retry failed: ${retryErr.message}`);
                // If it fails again, we just have 0 bills
              }
            }

            console.log(`[CLIO IMPORT] Bills fetched from Clio: ${bills.length}`);
            
            // Log RAW first bill to see exactly what Clio returns
            if (bills.length > 0) {
              console.log(`[CLIO IMPORT] RAW first bill from Clio API:`);
              console.log(JSON.stringify(bills[0], null, 2));
              
              // Log first 5 bills summary
              console.log(`[CLIO IMPORT] First 5 bills summary:`);
              for (let i = 0; i < Math.min(5, bills.length); i++) {
                const b = bills[i];
                console.log(`[CLIO IMPORT]   Bill ${i+1}: number=${b.number}, state=${b.state}, total=${b.total}, balance=${b.balance}, issued_at=${b.issued_at}, matters=${b.matters?.length || 0}, client=${b.client?.name}`);
              }
              
              // Count by state
              const byState = {};
              bills.forEach(b => {
                byState[b.state] = (byState[b.state] || 0) + 1;
              });
              console.log(`[CLIO IMPORT] Bills by state:`, byState);
              
              // Calculate totals
              const totalAmount = bills.reduce((sum, b) => sum + (parseFloat(b.total) || 0), 0);
              const totalBalance = bills.reduce((sum, b) => sum + (parseFloat(b.balance) || 0), 0);
              console.log(`[CLIO IMPORT] Bills total amount: $${totalAmount.toFixed(2)}, outstanding: $${totalBalance.toFixed(2)}`);
            }
            
            let skippedBills = 0;
            
            for (const b of bills) {
              try {
                const firstMatter = b.matters?.[0];
                const matterId = firstMatter?.id ? matterIdMap.get(`clio:${firstMatter.id}`) : null;
                const clientId = b.client?.id ? contactIdMap.get(`clio:${b.client.id}`) : null;
                
                // Parse Clio financial fields (only using what's fetched)
                const billTotal = parseFloat(b.total) || 0;
                const billBalance = parseFloat(b.balance) || 0;
                const amountPaid = billTotal - billBalance;
                
                // Map Clio state to our status
                let invoiceStatus = 'draft';
                if (b.state === 'paid') invoiceStatus = 'paid';
                else if (b.state === 'void' || b.state === 'deleted') invoiceStatus = 'void';
                else if (b.state === 'awaiting_payment') invoiceStatus = 'sent';
                else if (b.state === 'awaiting_approval') invoiceStatus = 'draft';
                else if (b.state === 'partial') invoiceStatus = 'partial';
                
                await query(
                  `INSERT INTO invoices (firm_id, matter_id, client_id, number, issue_date, due_date, subtotal_fees, amount_paid, status)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                  [
                    firmId,
                    matterId,
                    clientId,
                    `${b.number || 'INV'}-${b.id}`, // Append ID to ensure unique
                    b.issued_at || new Date().toISOString().split('T')[0],
                    b.due_at || null,
                    billTotal, // Use total as subtotal_fees
                    amountPaid,
                    invoiceStatus
                  ]
                );
                
                counts.bills++;
              } catch (err) {
                skippedBills++;
                if (skippedBills <= 5) {
                  console.log(`[CLIO IMPORT] Bill error: ${b.number || b.id} - ${err.message}`);
                }
              }
            }
            
            // Verify bills were saved
            const billVerify = await query('SELECT COUNT(*) FROM invoices WHERE firm_id = $1', [firmId]);
            const actualBillCount = parseInt(billVerify.rows[0].count);
            
            // Get billing summary from DB
            const billingSummary = await query(`
              SELECT 
                COUNT(*) as total,
                SUM(subtotal_fees) as total_billed,
                SUM(amount_paid) as total_paid,
                COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
                COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count
              FROM invoices WHERE firm_id = $1
            `, [firmId]);
            
            console.log(`[CLIO IMPORT] Bills saved to DB: ${counts.bills}, skipped: ${skippedBills}`);
            console.log(`[CLIO IMPORT] Bills verified in DB: ${actualBillCount}`);
            console.log(`[CLIO IMPORT] Billing summary in DB: total=$${billingSummary.rows[0].total_billed || 0}, paid=$${billingSummary.rows[0].total_paid || 0}, paid_count=${billingSummary.rows[0].paid_count}, sent_count=${billingSummary.rows[0].sent_count}`);
            updateProgress('bills', 'done', actualBillCount);
          } catch (err) {
            console.error('[CLIO IMPORT] Bills error:', err.message);
            updateProgress('bills', 'error', counts.bills, err.message);
          }
        }
        
        // ============================================
        // STEP 6: IMPORT CALENDAR (direct to DB)
        // ============================================
        if (!includeCalendar) {
          console.log('[CLIO IMPORT] Step 6/7: SKIPPING calendar');
          updateProgress('calendar', 'skipped', 0);
        } else {
          console.log('[CLIO IMPORT] Step 6/7: Importing calendar directly to DB...');
          updateProgress('calendar', 'running', 0);
          try {
            // Fetch calendar entries with type and recurrence info
            const events = await clioGetAll(accessToken, '/calendar_entries.json', {
              fields: 'id,summary,description,start_at,end_at,all_day,location,matter,attendees'
            }, (count) => updateProgress('calendar', 'running', count));
            
            for (const e of events) {
              try {
                // Skip events without start/end times (required fields)
                if (!e.start_at || !e.end_at) continue;
                
                const matterId = e.matter?.id ? matterIdMap.get(`clio:${e.matter.id}`) : null;
                
                // Map Clio calendar_entry_type to Apex event type
                let eventType = 'other';
                const clioType = (e.calendar_entry_type?.name || '').toLowerCase();
                if (clioType.includes('court') || clioType.includes('hearing')) {
                  eventType = 'court_date';
                } else if (clioType.includes('meeting') || clioType.includes('conference')) {
                  eventType = 'meeting';
                } else if (clioType.includes('deadline') || clioType.includes('due')) {
                  eventType = 'deadline';
                } else if (clioType.includes('reminder') || clioType.includes('follow')) {
                  eventType = 'reminder';
                } else if (clioType.includes('task')) {
                  eventType = 'task';
                } else if (clioType.includes('closing')) {
                  eventType = 'closing';
                } else if (clioType.includes('deposition')) {
                  eventType = 'deposition';
                }
                
                // Format attendees as JSON array
                const attendees = [];
                if (e.attendees && Array.isArray(e.attendees)) {
                  e.attendees.forEach(att => {
                    attendees.push({
                      name: att.name || 'Unknown',
                      email: att.email || null,
                      type: att.type || 'required'
                    });
                  });
                }
                
                // Format reminders as JSON array
                const reminders = [];
                if (e.reminders && Array.isArray(e.reminders)) {
                  e.reminders.forEach(rem => {
                    reminders.push({
                      minutes: rem.minutes || 15,
                      method: rem.method || 'popup'
                    });
                  });
                }
                
                // Check if event is private
                const isPrivate = e.permission === 'private' || e.permission === 'private_no_time';
                
                await query(
                  `INSERT INTO calendar_events (firm_id, matter_id, title, description, type, start_time, end_time, all_day, location, attendees, reminders, recurrence_rule, is_private)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
                  [
                    firmId,
                    matterId,
                    e.summary || 'Event',
                    e.description || null,
                    eventType,
                    e.start_at,
                    e.end_at,
                    e.all_day || false,
                    e.location || null,
                    JSON.stringify(attendees),
                    JSON.stringify(reminders),
                    e.recurrence_rule || null,
                    isPrivate
                  ]
                );
                
                counts.calendar++;
              } catch (err) {
                // Skip silently
              }
            }
            // Verify calendar events were saved
            const calendarVerify = await query('SELECT COUNT(*) FROM calendar_events WHERE firm_id = $1', [firmId]);
            const actualCalendarCount = parseInt(calendarVerify.rows[0].count);
            console.log(`[CLIO IMPORT] Calendar saved to DB: ${counts.calendar}, verified in DB: ${actualCalendarCount}`);
            updateProgress('calendar', 'done', actualCalendarCount);
          } catch (err) {
            console.error('[CLIO IMPORT] Calendar error:', err.message);
            updateProgress('calendar', 'error', counts.calendar, err.message);
          }
        }
        
        // ============================================
        // STEP 7: IMPORT NOTES (direct to DB)
        // ============================================
        // Clio notes are attached to matters or contacts - we save them to custom_fields or notes field
        console.log('[CLIO IMPORT] Step 7/7: Importing notes...');
        let notesCount = 0;
        try {
          // Fetch notes from Clio - notes are attached to matters or contacts
          const notes = await clioGetPaginated(accessToken, '/notes.json', {
            fields: 'id,subject,detail,date,matter{id},contact{id},created_at'
          }, null);
          
          console.log(`[CLIO IMPORT] Notes fetched from Clio: ${notes.length}`);
          
          // Group notes by matter and contact
          const matterNotes = new Map(); // matterClioId -> array of notes
          const contactNotes = new Map(); // contactClioId -> array of notes
          
          for (const note of notes) {
            const noteText = `[${note.date || note.created_at?.split('T')[0] || 'No date'}] ${note.subject || 'Note'}: ${note.detail || ''}`;
            
            if (note.matter?.id) {
              const matterId = `clio:${note.matter.id}`;
              if (!matterNotes.has(matterId)) {
                matterNotes.set(matterId, []);
              }
              matterNotes.get(matterId).push(noteText);
            }
            
            if (note.contact?.id) {
              const contactId = `clio:${note.contact.id}`;
              if (!contactNotes.has(contactId)) {
                contactNotes.set(contactId, []);
              }
              contactNotes.get(contactId).push(noteText);
            }
            notesCount++;
          }
          
          // Update matters with their notes (stored in custom_fields JSON)
          for (const [clioMatterId, notesList] of matterNotes) {
            const apexMatterId = matterIdMap.get(clioMatterId);
            if (apexMatterId) {
              try {
                // Get existing custom_fields and merge notes
                const existing = await query('SELECT custom_fields FROM matters WHERE id = $1', [apexMatterId]);
                const customFields = existing.rows[0]?.custom_fields || {};
                customFields.clio_notes = notesList;
                
                await query(
                  'UPDATE matters SET custom_fields = $1 WHERE id = $2',
                  [JSON.stringify(customFields), apexMatterId]
                );
              } catch (err) {
                // Skip silently
              }
            }
          }
          
          // Update contacts with their notes (appended to notes TEXT field)
          for (const [clioContactId, notesList] of contactNotes) {
            const apexClientId = contactIdMap.get(clioContactId);
            if (apexClientId) {
              try {
                // Get existing notes and append
                const existing = await query('SELECT notes FROM clients WHERE id = $1', [apexClientId]);
                let existingNotes = existing.rows[0]?.notes || '';
                
                if (existingNotes && !existingNotes.endsWith('\n')) {
                  existingNotes += '\n';
                }
                existingNotes += '\n--- CLIO NOTES ---\n' + notesList.join('\n');
                
                await query(
                  'UPDATE clients SET notes = $1 WHERE id = $2',
                  [existingNotes, apexClientId]
                );
              } catch (err) {
                // Skip silently
              }
            }
          }
          
          console.log(`[CLIO IMPORT] Notes processed: ${notesCount} (matters: ${matterNotes.size}, contacts: ${contactNotes.size})`);
        } catch (err) {
          console.log(`[CLIO IMPORT] Notes error (non-fatal): ${err.message}`);
          // Notes are optional - don't fail the import
        }
        
        // ============================================
        // COMPLETE
        // ============================================
        // Note: Documents are NOT imported via API - firms drag files from Clio Drive to Apex Drive
        // Permissions are based on matter assignments which are already imported above
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
            notes: notesCount,
            warnings: warnings.length,
            userCredentials: userCredentials // Store credentials for portal display
          };
          console.log('[CLIO IMPORT] ✓ Import completed:', prog.summary);
          console.log(`[CLIO IMPORT] User credentials stored: ${userCredentials.length}`);
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

// ============================================
// DOCUMENT MIGRATION: Match files to matters
// ============================================

/**
 * Build matter lookup maps from a firm's existing matters
 * Used for matching folder paths to matters during document import
 */
async function buildMatterLookupMaps(firmId) {
  const result = await query(`
    SELECT m.id, m.number, m.name, m.description, c.display_name as client_name
    FROM matters m
    LEFT JOIN clients c ON m.client_id = c.id
    WHERE m.firm_id = $1
  `, [firmId]);
  
  const maps = {
    byNumber: new Map(),        // "2024-0001" → matterId
    byName: new Map(),          // "smith vs jones" → matterId
    byClientMatter: new Map(),  // "smith john|smith vs jones" → matterId
    byNumberPrefix: new Map(),  // "20240001" (no dashes) → matterId
    allMatters: result.rows
  };
  
  for (const m of result.rows) {
    // By matter number (exact)
    if (m.number) {
      maps.byNumber.set(m.number.toLowerCase(), m.id);
      // Also without dashes/spaces for fuzzy matching
      const normalized = m.number.replace(/[-\s.]/g, '').toLowerCase();
      maps.byNumberPrefix.set(normalized, m.id);
    }
    
    // By matter name (normalized)
    if (m.name) {
      const normalizedName = m.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
      maps.byName.set(normalizedName, m.id);
    }
    
    // By client + matter combination
    if (m.client_name && m.name) {
      const clientNorm = m.client_name.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
      const matterNorm = m.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
      maps.byClientMatter.set(`${clientNorm}|${matterNorm}`, m.id);
    }
  }
  
  console.log(`[DOC MIGRATION] Built lookup maps: ${maps.byNumber.size} by number, ${maps.byName.size} by name, ${maps.byClientMatter.size} by client+matter`);
  return maps;
}

/**
 * Extract potential matter identifiers from a folder path
 * Handles various Clio folder structures
 */
function extractMatterInfoFromPath(folderPath) {
  const results = {
    matterNumber: null,
    matterName: null,
    clientName: null,
    subfolderPath: null,
    confidence: 'low'
  };
  
  // Normalize path separators and split
  const parts = folderPath.replace(/\\/g, '/').split('/').filter(p => p && p.trim());
  
  if (parts.length === 0) return results;
  
  // Common patterns to detect
  const matterNumberPattern = /^(\d{4}[-.]?\d{3,4})/;  // 2024-0001 or 2024.0001 or 20240001
  const matterWithNamePattern = /^(\d{4}[-.]?\d{3,4})\s*[-–—]\s*(.+)$/;  // "2024-0001 - Smith vs Jones"
  const yearFolderPattern = /^20\d{2}$/;  // "2024" as a folder
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    const lowerPart = part.toLowerCase();
    
    // Skip common non-matter folders
    if (['matters', 'clients', 'documents', 'files', 'clio', 'clio drive'].includes(lowerPart)) {
      continue;
    }
    
    // Pattern: "2024-0001 - Smith vs Jones"
    const fullMatch = part.match(matterWithNamePattern);
    if (fullMatch) {
      results.matterNumber = fullMatch[1];
      results.matterName = fullMatch[2].trim();
      results.subfolderPath = '/' + parts.slice(i + 1).join('/');
      results.confidence = 'high';
      break;
    }
    
    // Pattern: Just matter number "2024-0001"
    const numberMatch = part.match(matterNumberPattern);
    if (numberMatch) {
      results.matterNumber = numberMatch[1];
      results.subfolderPath = '/' + parts.slice(i + 1).join('/');
      results.confidence = 'medium';
      break;
    }
    
    // Pattern: Year folder followed by matter folder
    if (yearFolderPattern.test(part) && parts[i + 1]) {
      // Check if next folder is a matter
      const nextPart = parts[i + 1];
      const nextMatch = nextPart.match(matterWithNamePattern) || nextPart.match(matterNumberPattern);
      if (nextMatch) {
        results.matterNumber = nextMatch[1];
        results.matterName = nextMatch[2] || null;
        results.subfolderPath = '/' + parts.slice(i + 2).join('/');
        results.confidence = 'high';
        break;
      }
    }
    
    // Pattern: "Clients/Smith, John/Matter Name"
    if (lowerPart === 'clients' && parts[i + 1] && parts[i + 2]) {
      results.clientName = parts[i + 1];
      results.matterName = parts[i + 2];
      results.subfolderPath = '/' + parts.slice(i + 3).join('/');
      results.confidence = 'medium';
      break;
    }
  }
  
  // Fallback: use first non-generic folder as potential matter name
  if (!results.matterNumber && !results.matterName) {
    for (const part of parts) {
      const lowerPart = part.toLowerCase();
      if (!['matters', 'clients', 'documents', 'files', 'clio', 'clio drive', 'pleadings', 'discovery', 'correspondence', 'drafts'].includes(lowerPart)) {
        results.matterName = part;
        results.confidence = 'low';
        break;
      }
    }
  }
  
  return results;
}

/**
 * Match extracted folder info to an existing matter
 */
function matchToMatter(folderInfo, lookupMaps) {
  // 1. Try exact matter number match (highest confidence)
  if (folderInfo.matterNumber) {
    const normalizedNum = folderInfo.matterNumber.toLowerCase();
    if (lookupMaps.byNumber.has(normalizedNum)) {
      return { matterId: lookupMaps.byNumber.get(normalizedNum), matchType: 'number_exact', confidence: 'high' };
    }
    // Try without dashes
    const fuzzyNum = normalizedNum.replace(/[-\s.]/g, '');
    if (lookupMaps.byNumberPrefix.has(fuzzyNum)) {
      return { matterId: lookupMaps.byNumberPrefix.get(fuzzyNum), matchType: 'number_fuzzy', confidence: 'high' };
    }
  }
  
  // 2. Try client + matter name combo
  if (folderInfo.clientName && folderInfo.matterName) {
    const clientNorm = folderInfo.clientName.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    const matterNorm = folderInfo.matterName.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    const key = `${clientNorm}|${matterNorm}`;
    if (lookupMaps.byClientMatter.has(key)) {
      return { matterId: lookupMaps.byClientMatter.get(key), matchType: 'client_matter', confidence: 'medium' };
    }
  }
  
  // 3. Try matter name match
  if (folderInfo.matterName) {
    const normalizedName = folderInfo.matterName.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    if (lookupMaps.byName.has(normalizedName)) {
      return { matterId: lookupMaps.byName.get(normalizedName), matchType: 'name_exact', confidence: 'medium' };
    }
    
    // Fuzzy name matching - check if any matter name contains this or vice versa
    for (const [name, matterId] of lookupMaps.byName) {
      if (name.includes(normalizedName) || normalizedName.includes(name)) {
        return { matterId, matchType: 'name_fuzzy', confidence: 'low' };
      }
    }
  }
  
  return { matterId: null, matchType: 'unmatched', confidence: 'none' };
}

/**
 * Process a list of file paths and match them to matters
 * Returns categorized results for review
 */
async function matchFilesToMatters(firmId, filePaths) {
  const lookupMaps = await buildMatterLookupMaps(firmId);
  
  const results = {
    matched: [],      // Files successfully matched to matters
    unmatched: [],    // Files that couldn't be matched
    byMatter: {},     // Grouped by matter for easy review
    stats: {
      total: filePaths.length,
      matched: 0,
      unmatched: 0,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0
    }
  };
  
  for (const filePath of filePaths) {
    const folderInfo = extractMatterInfoFromPath(filePath);
    const match = matchToMatter(folderInfo, lookupMaps);
    
    const fileInfo = {
      originalPath: filePath,
      fileName: filePath.split('/').pop() || filePath.split('\\').pop(),
      folderInfo,
      match
    };
    
    if (match.matterId) {
      fileInfo.matterId = match.matterId;
      fileInfo.subfolderPath = folderInfo.subfolderPath || '/';
      results.matched.push(fileInfo);
      results.stats.matched++;
      
      // Group by matter
      if (!results.byMatter[match.matterId]) {
        const matter = lookupMaps.allMatters.find(m => m.id === match.matterId);
        results.byMatter[match.matterId] = {
          matterId: match.matterId,
          matterNumber: matter?.number,
          matterName: matter?.name,
          files: []
        };
      }
      results.byMatter[match.matterId].files.push(fileInfo);
      
      // Track confidence levels
      if (match.confidence === 'high') results.stats.highConfidence++;
      else if (match.confidence === 'medium') results.stats.mediumConfidence++;
      else results.stats.lowConfidence++;
    } else {
      results.unmatched.push(fileInfo);
      results.stats.unmatched++;
    }
  }
  
  return results;
}

// API: Preview document matching (dry run)
router.post('/documents/match-preview', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId, filePaths } = req.body;
    
    if (!firmId || !filePaths || !Array.isArray(filePaths)) {
      return res.status(400).json({ error: 'firmId and filePaths array required' });
    }
    
    console.log(`[DOC MIGRATION] Preview matching ${filePaths.length} files for firm ${firmId}`);
    
    const results = await matchFilesToMatters(firmId, filePaths);
    
    res.json({
      success: true,
      preview: true,
      ...results
    });
  } catch (error) {
    console.error('Document match preview error:', error);
    res.status(500).json({ error: 'Failed to preview document matching: ' + error.message });
  }
});

// API: Import documents with matter matching
router.post('/documents/import', requireSecureAdmin, async (req, res) => {
  try {
    const { 
      firmId, 
      documents,  // Array of { path, content (base64), size, type }
      defaultOwnerId,  // User ID to set as owner if uploader unknown
      unmatchedAction = 'general'  // 'general' = put in General Documents, 'skip' = don't import
    } = req.body;
    
    if (!firmId || !documents || !Array.isArray(documents)) {
      return res.status(400).json({ error: 'firmId and documents array required' });
    }
    
    console.log(`[DOC MIGRATION] Importing ${documents.length} documents for firm ${firmId}`);
    
    // Build lookup maps
    const lookupMaps = await buildMatterLookupMaps(firmId);
    
    // Import Azure storage utilities
    const { uploadFileBuffer, ensureDirectory, isAzureConfigured } = await import('../utils/azureStorage.js');
    
    const azureConfigured = await isAzureConfigured();
    if (!azureConfigured) {
      return res.status(400).json({ error: 'Azure Storage not configured. Configure it in Admin Portal first.' });
    }
    
    const results = {
      imported: [],
      skipped: [],
      errors: [],
      stats: { total: documents.length, imported: 0, skipped: 0, errors: 0 }
    };
    
    for (const doc of documents) {
      try {
        // Match to matter
        const folderInfo = extractMatterInfoFromPath(doc.path);
        const match = matchToMatter(folderInfo, lookupMaps);
        
        let matterId = match.matterId;
        let targetPath;
        
        if (matterId) {
          // Matched to matter - put in matter folder
          const subPath = folderInfo.subfolderPath || '';
          targetPath = `matters/matter-${matterId}${subPath}/${doc.fileName || doc.path.split('/').pop()}`;
        } else if (unmatchedAction === 'general') {
          // Put in General Documents folder
          targetPath = `documents/Imported/${doc.path.split('/').pop()}`;
        } else {
          // Skip unmatched
          results.skipped.push({ path: doc.path, reason: 'unmatched' });
          results.stats.skipped++;
          continue;
        }
        
        // Upload to Azure
        const content = Buffer.from(doc.content, 'base64');
        await ensureDirectory(`firm-${firmId}/${targetPath.split('/').slice(0, -1).join('/')}`);
        const uploadResult = await uploadFileBuffer(content, targetPath, firmId);
        
        // Create document record
        const docResult = await query(`
          INSERT INTO documents (
            firm_id, matter_id, name, original_name, path, folder_path,
            type, size, uploaded_by, owner_id, privacy_level, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id
        `, [
          firmId,
          matterId,
          doc.fileName || doc.path.split('/').pop(),
          doc.path.split('/').pop(),
          uploadResult.path,
          folderInfo.subfolderPath || '/',
          doc.type || 'application/octet-stream',
          content.length,
          defaultOwnerId,
          defaultOwnerId,
          matterId ? 'team' : 'firm',  // Matter docs = team access, general = firm-wide
          'final'
        ]);
        
        results.imported.push({
          id: docResult.rows[0].id,
          originalPath: doc.path,
          targetPath,
          matterId,
          matchType: match.matchType
        });
        results.stats.imported++;
        
      } catch (err) {
        console.error(`[DOC MIGRATION] Error importing ${doc.path}:`, err.message);
        results.errors.push({ path: doc.path, error: err.message });
        results.stats.errors++;
      }
    }
    
    console.log(`[DOC MIGRATION] Complete: ${results.stats.imported} imported, ${results.stats.skipped} skipped, ${results.stats.errors} errors`);
    
    res.json({
      success: true,
      ...results
    });
  } catch (error) {
    console.error('Document import error:', error);
    res.status(500).json({ error: 'Failed to import documents: ' + error.message });
  }
});

// API: Get matter matching suggestions for a single path
router.post('/documents/match-single', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId, filePath } = req.body;
    
    if (!firmId || !filePath) {
      return res.status(400).json({ error: 'firmId and filePath required' });
    }
    
    const lookupMaps = await buildMatterLookupMaps(firmId);
    const folderInfo = extractMatterInfoFromPath(filePath);
    const match = matchToMatter(folderInfo, lookupMaps);
    
    // Get matter details if matched
    let matterDetails = null;
    if (match.matterId) {
      const matter = lookupMaps.allMatters.find(m => m.id === match.matterId);
      if (matter) {
        matterDetails = {
          id: matter.id,
          number: matter.number,
          name: matter.name,
          clientName: matter.client_name
        };
      }
    }
    
    res.json({
      success: true,
      filePath,
      extracted: folderInfo,
      match: {
        ...match,
        matter: matterDetails
      }
    });
  } catch (error) {
    console.error('Single match error:', error);
    res.status(500).json({ error: 'Failed to match: ' + error.message });
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
