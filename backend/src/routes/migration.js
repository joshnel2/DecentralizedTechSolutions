import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db/connection.js';
import {
  streamDocumentToAzure,
  batchStreamDocuments,
  fetchDocumentManifestFromClio,
  getDocumentMigrationStatus
} from '../services/clioDocumentStreaming.js';

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
  
  // Always order by id ascending to ensure consistent pagination and avoid 10k limit issues
  const orderedParams = { ...params, order: 'id(asc)' };
  
  console.log(`[CLIO API] Fetching contacts by initial + type + order by id(asc) to bypass 10k limit...`);
  
  // First, fetch by initial A-Z for each type
  for (const type of types) {
    for (const initial of initials) {
      console.log(`[CLIO API] Fetching ${type} contacts starting with "${initial}"...`);
      
      try {
        const letterData = await clioGetPaginated(
          accessToken, 
          endpoint, 
          { ...orderedParams, initial, type }, 
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
          { ...orderedParams, initial, type }, 
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
        { ...orderedParams, type }, 
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
      { ...orderedParams }, 
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

// Fetch matters by STATUS + YEAR - includes all possible Clio statuses with yearly batching
// Each status+year can have up to 10k records
async function clioGetMattersByStatus(accessToken, endpoint, params, onProgress, clientIds = null) {
  const allData = [];
  const seenIds = new Set();
  // Include ALL possible Clio matter statuses
  const statuses = ['Open', 'Pending', 'Closed', 'Archived'];
  const currentYear = new Date().getFullYear();
  
  // Always order by id ascending to ensure consistent pagination and avoid 10k limit issues
  const orderedParams = { ...params, order: 'id(asc)' };
  
  console.log(`[CLIO API] Fetching matters by status + year + order by id(asc) (bypasses 10k limit)...`);
  
  // Helper to fetch and dedupe
  async function fetchBatch(batchParams, label) {
    try {
      const batchMatters = await clioGetPaginated(
        accessToken,
        endpoint,
        batchParams,
        (count) => {
          if (onProgress) onProgress(allData.length + count);
        }
      );
      
      let newCount = 0;
      for (const item of batchMatters) {
        if (item.id && !seenIds.has(item.id)) {
          seenIds.add(item.id);
          allData.push(item);
          newCount++;
        }
      }
      
      if (newCount > 0) {
        console.log(`[CLIO API] ${label}: ${newCount} records, total ${allData.length}`);
      }
      if (onProgress) onProgress(allData.length);
      
    } catch (err) {
      console.log(`[CLIO API] Error fetching ${label}: ${err.message}`);
    }
  }
  
  // Fetch by status + year for better granularity
  for (const status of statuses) {
    console.log(`[CLIO API] Fetching ${status} matters by year...`);
    
    // For closed/archived, batch by year (these accumulate over time)
    if (status === 'Closed' || status === 'Archived') {
      for (let year = 2010; year <= currentYear; year++) {
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;
        await fetchBatch(
          { ...orderedParams, status, 'open_date[]': [`>=${startDate}`, `<=${endDate}`] },
          `${status} matters ${year}`
        );
      }
      // Also fetch ones without open_date
      await fetchBatch(
        { ...orderedParams, status },
        `${status} matters (no date filter)`
      );
    } else {
      // For Open/Pending, just fetch all (usually fewer)
      await fetchBatch({ ...orderedParams, status }, `${status} matters`);
    }
  }
  
  // CATCH-ALL: Fetch matters WITHOUT status filter to catch any with null/empty/custom status
  console.log(`[CLIO API] Running catch-all fetch for matters without status filter...`);
  await fetchBatch({ ...orderedParams }, 'Catch-all matters');
  
  console.log(`[CLIO API] Matters complete: ${allData.length} total records`);
  return allData;
}

// Fetch activities by STATUS + TIME WINDOW - uses weeks for recent years to avoid 10k limit
async function clioGetActivitiesByStatus(accessToken, endpoint, params, onProgress, matterIds = null) {
  const allData = [];
  const seenIds = new Set();
  const statuses = ['billed', 'unbilled', 'non_billable'];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  
  // Always order by id ascending to ensure consistent pagination and avoid 10k limit issues
  const orderedParams = { ...params, order: 'id(asc)' };
  
  console.log(`[CLIO API] Fetching activities by status + TIME WINDOW + order by id(asc) (weekly for recent years to bypass 10k limit)...`);
  
  // Helper to fetch a date range
  async function fetchDateRange(startDate, endDate, label) {
    for (const status of statuses) {
      try {
        const batchActivities = await clioGetPaginated(
          accessToken,
          endpoint,
          { 
            ...orderedParams, 
            status,
            'date[]': [`>=${startDate}`, `<=${endDate}`]
          },
          null
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
          console.log(`[CLIO API] ${status} activities for ${label}: +${newCount}, total ${allData.length}`);
          if (onProgress) onProgress(allData.length);
        }
        
      } catch (err) {
        console.log(`[CLIO API] Error fetching ${status} for ${label}: ${err.message}`);
      }
    }
  }
  
  // For older years (before 2020), use monthly batches
  for (let year = 2010; year < 2020; year++) {
    for (let month = 1; month <= 12; month++) {
      const monthStr = String(month).padStart(2, '0');
      const lastDay = new Date(year, month, 0).getDate();
      const startDate = `${year}-${monthStr}-01`;
      const endDate = `${year}-${monthStr}-${lastDay}`;
      await fetchDateRange(startDate, endDate, `${year}-${monthStr}`);
    }
    console.log(`[CLIO API] Completed ${year}: ${allData.length} activities so far`);
  }
  
  // For recent years (2020+), use WEEKLY batches to avoid 10k limit
  console.log(`[CLIO API] Switching to WEEKLY batches for 2020+ to handle high volume...`);
  for (let year = 2020; year <= currentYear; year++) {
    const maxMonth = (year === currentYear) ? currentMonth : 12;
    
    for (let month = 1; month <= maxMonth; month++) {
      const monthStr = String(month).padStart(2, '0');
      const lastDay = new Date(year, month, 0).getDate();
      
      // Split month into weekly chunks
      const weekStarts = [1, 8, 15, 22];
      for (let i = 0; i < weekStarts.length; i++) {
        const weekStart = weekStarts[i];
        const weekEnd = (i === weekStarts.length - 1) ? lastDay : weekStarts[i + 1] - 1;
        const startDate = `${year}-${monthStr}-${String(weekStart).padStart(2, '0')}`;
        const endDate = `${year}-${monthStr}-${String(weekEnd).padStart(2, '0')}`;
        await fetchDateRange(startDate, endDate, `${year}-${monthStr} week ${i + 1}`);
      }
    }
    console.log(`[CLIO API] Completed ${year}: ${allData.length} activities so far`);
  }
  
  // CATCH-ALL #1: Fetch recent activities (last 90 days) by created_at to catch newly entered ones
  console.log(`[CLIO API] Running catch-all for recently CREATED activities (last 90 days)...`);
  try {
    const recentDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const catchAllCreated = await clioGetPaginated(
      accessToken,
      endpoint,
      { 
        ...params,
        'created_at[]': `>=${recentDate}`
      },
      null
    );
    
    let newCount = 0;
    for (const item of catchAllCreated) {
      if (item.id && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        allData.push(item);
        newCount++;
      }
    }
    
    if (newCount > 0) {
      console.log(`[CLIO API] Catch-all (created): found ${newCount} additional! Total: ${allData.length}`);
      if (onProgress) onProgress(allData.length);
    }
    
  } catch (err) {
    console.log(`[CLIO API] Catch-all (created) error: ${err.message}`);
  }
  
  // CATCH-ALL #2: Fetch recent activities (last 90 days) by updated_at
  console.log(`[CLIO API] Running catch-all for recently UPDATED activities (last 90 days)...`);
  try {
    const recentDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const catchAllUpdated = await clioGetPaginated(
      accessToken,
      endpoint,
      { 
        ...params,
        'updated_at[]': `>=${recentDate}`
      },
      null
    );
    
    let newCount = 0;
    for (const item of catchAllUpdated) {
      if (item.id && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        allData.push(item);
        newCount++;
      }
    }
    
    if (newCount > 0) {
      console.log(`[CLIO API] Catch-all (updated): found ${newCount} additional! Total: ${allData.length}`);
      if (onProgress) onProgress(allData.length);
    }
    
  } catch (err) {
    console.log(`[CLIO API] Catch-all (updated) error: ${err.message}`);
  }
  
  // CATCH-ALL #3: Fetch WITHOUT any date filter (gets most recent by default)
  console.log(`[CLIO API] Running final catch-all (no date filter)...`);
  try {
    for (const status of statuses) {
      const noDateActivities = await clioGetPaginated(
        accessToken,
        endpoint,
        { ...params, status },
        null
      );
      
      let newCount = 0;
      for (const item of noDateActivities) {
        if (item.id && !seenIds.has(item.id)) {
          seenIds.add(item.id);
          allData.push(item);
          newCount++;
        }
      }
      
      if (newCount > 0) {
        console.log(`[CLIO API] Catch-all (${status}, no date): found ${newCount} additional!`);
        if (onProgress) onProgress(allData.length);
      }
    }
  } catch (err) {
    console.log(`[CLIO API] Catch-all (no date) error: ${err.message}`);
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
  
  // Always order by id ascending to ensure consistent pagination and avoid 10k limit issues
  const orderedParams = { ...params, order: 'id(asc)' };
  
  console.log(`[CLIO API] Fetching bills by state + month + order by id(asc) (smallest batches)...`);
  
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
              ...orderedParams, 
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
      let timeEntriesNoMatter = 0;
      let expensesSkippedNoMatter = 0;
      
      for (const activity of data.activities) {
        try {
          // Find matter - try multiple lookup methods
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
          
          // Find user - try multiple lookup methods
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
              // Also try case-insensitive match
              if (!userId) {
                for (const [key, id] of userIdMap.entries()) {
                  if (key.toLowerCase() === activity.user.name.toLowerCase()) {
                    userId = id;
                    break;
                  }
                }
              }
            }
            if (!userId && activity.user.email) {
              userId = userIdMap.get(activity.user.email.toLowerCase());
            }
          }
          
          const activityType = (activity.type || '').toLowerCase();
          const isExpense = activityType.includes('expense');
          
          if (isExpense) {
            // Expenses require a matter (must be billable to something)
            if (!matterId) {
              expensesSkippedNoMatter++;
              results.warnings.push(`Expense skipped: Matter not found (ref: ${activity.matter?.display_number || activity.matter?.clio_id || 'unknown'})`);
              continue;
            }
            
            // Create expense record with migration tracking
            await query(
              `INSERT INTO expenses (firm_id, matter_id, user_id, date, description, amount, category, billable, status, clio_id, migrated_at, migration_source)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), 'json_import')
               ON CONFLICT (firm_id, clio_id) WHERE clio_id IS NOT NULL DO NOTHING`,
              [
                firmId,
                matterId,
                userId,
                parseDate(activity.date),
                activity.note || activity.activity_description?.name || 'Expense',
                parseFloat(activity.total) || parseFloat(activity.quantity) || 0,
                activity.expense_category?.name || activity.activity_description?.name || 'Other',
                activity.non_billable !== true,
                'pending',
                activity.id || activity.clio_id || null  // clio_id for deduplication
              ]
            );
            results.imported.expenses++;
          } else {
            // Time entries CAN be imported without matter (general time tracking)
            if (!matterId) {
              timeEntriesNoMatter++;
            }
            
            // Build description with context if matter is missing
            let description = activity.note || activity.activity_description?.name || 'Time entry';
            if (!matterId && activity.matter?.display_number) {
              description = `[Matter: ${activity.matter.display_number}] ${description}`;
            }
            
            // Create time entry record with migration tracking
            await query(
              `INSERT INTO time_entries (firm_id, matter_id, user_id, date, hours, description, billable, rate, activity_code, status, clio_id, migrated_at, migration_source)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), 'json_import')
               ON CONFLICT (firm_id, clio_id) WHERE clio_id IS NOT NULL DO NOTHING`,
              [
                firmId,
                matterId,  // Can be null - entry will be "unassigned"
                userId,
                parseDate(activity.date),
                parseFloat(activity.quantity_in_hours) || parseFloat(activity.quantity) || 0,
                description,
                activity.non_billable !== true,
                parseFloat(activity.rate) || parseFloat(activity.price) || 0,
                activity.activity_description?.code || activity.activity_description?.name || null,
                'pending',
                activity.id || activity.clio_id || null  // clio_id for deduplication
              ]
            );
            results.imported.time_entries++;
          }
        } catch (err) {
          results.errors.push(`Activity: ${err.message}`);
        }
      }
      
      // Add summary to results
      if (timeEntriesNoMatter > 0) {
        results.warnings.push(`${timeEntriesNoMatter} time entries imported without matter assignment`);
      }
      if (expensesSkippedNoMatter > 0) {
        results.warnings.push(`${expensesSkippedNoMatter} expenses skipped (no matter reference)`);
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
      
      // Try syntax 1: Simple field names (no nested specifiers)
      const response1 = await clioRequest(accessToken, '/contacts.json', {
        fields: 'id,name,primary_email_address,primary_phone_number',
        limit: 3
      });
      results.contacts.syntax1_simple = {
        fields: 'primary_email_address,primary_phone_number',
        sample: response1.data?.[0] || null
      };
      
      // Try syntax 2: Array fields WITHOUT nested specifiers (most reliable)
      const response2 = await clioRequest(accessToken, '/contacts.json', {
        fields: 'id,name,email_addresses,phone_numbers',
        limit: 3
      });
      results.contacts.syntax2_arrays = {
        fields: 'email_addresses,phone_numbers',
        sample: response2.data?.[0] || null
      };
      
      // Try syntax 3: Array fields WITH valid nested specifiers only
      const response3 = await clioRequest(accessToken, '/contacts.json', {
        fields: 'id,name,email_addresses{id,address,name,primary},phone_numbers{id,number,name,primary}',
        limit: 3
      });
      results.contacts.syntax3_nested_valid = {
        fields: 'email_addresses{id,address,name,primary},phone_numbers{id,number,name,primary}',
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
      const s2 = results.contacts.syntax2_arrays?.sample;
      const s3 = results.contacts.syntax3_nested_valid?.sample;
      
      if (s1?.primary_email_address?.address) {
        contactAnalysis.recommendation = 'Use: primary_email_address (returns object with address)';
      } else if (s2?.email_addresses?.length > 0 && s2.email_addresses[0]?.address) {
        contactAnalysis.recommendation = 'Use: email_addresses array (returns full array)';
      } else if (s3?.email_addresses?.length > 0 && s3.email_addresses[0]?.address) {
        contactAnalysis.recommendation = 'Use: email_addresses{id,address,name,primary} (nested syntax works)';
      } else {
        contactAnalysis.recommendation = 'NONE of the syntaxes returned email data - check API permissions or contact has no email';
      }
      
      // Log what each syntax returned for debugging
      results.contacts.syntaxComparison = {
        syntax1_has_email: !!s1?.primary_email_address?.address,
        syntax2_has_email: !!(s2?.email_addresses?.length > 0 && s2.email_addresses[0]?.address),
        syntax3_has_email: !!(s3?.email_addresses?.length > 0 && s3.email_addresses[0]?.address)
      };
      
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
      includeCalendar = true,
      includeDocuments = true,
      customFirmFolder = null,
      filterByUser = false,
      filterUserEmail = null
    } = req.body;
    
    console.log('[CLIO IMPORT] Starting import for connection:', connectionId, 'firmName:', firmName);
    console.log('[CLIO IMPORT] Include options:', { includeUsers, includeContacts, includeMatters, includeActivities, includeBills, includeCalendar, includeDocuments });
    console.log('[CLIO IMPORT] Custom Azure folder:', customFirmFolder || '(auto-generate from firmId)');
    console.log('[CLIO IMPORT] User filter:', { filterByUser, filterUserEmail });
    
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
    const importOptions = { existingFirmId, includeUsers, includeContacts, includeMatters, includeActivities, includeBills, includeCalendar, includeDocuments, customFirmFolder, filterByUser, filterUserEmail };
    
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
        calendar: { status: 'pending', count: 0 },
        documents: { status: 'pending', count: 0 },
        tasks: { status: 'pending', count: 0 },
        activityCodes: { status: 'pending', count: 0 }
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
        // USER-SPECIFIC MIGRATION: Find Clio user ID by email
        // ============================================
        let filterClioUserId = null;
        if (filterByUser && filterUserEmail) {
          console.log(`[CLIO IMPORT] User-specific migration enabled. Finding Clio user with email: ${filterUserEmail}`);
          addLog(`🔍 Looking up Clio user: ${filterUserEmail}`);
          
          try {
            // Fetch all users from Clio to find the one with matching email
            const allClioUsers = await clioGetAll(accessToken, '/users.json', {
              fields: 'id,name,email'
            }, null);
            
            const matchingUser = allClioUsers.find(u => 
              u.email && u.email.toLowerCase() === filterUserEmail.toLowerCase()
            );
            
            if (matchingUser) {
              filterClioUserId = matchingUser.id;
              console.log(`[CLIO IMPORT] Found Clio user: ${matchingUser.name} (ID: ${filterClioUserId})`);
              addLog(`✅ Found Clio user: ${matchingUser.name} (ID: ${filterClioUserId})`);
              addLog(`📋 Will only import matters where this user is the responsible attorney`);
            } else {
              console.log(`[CLIO IMPORT] WARNING: No Clio user found with email: ${filterUserEmail}`);
              addLog(`⚠️ No Clio user found with email: ${filterUserEmail}`);
              addLog(`Proceeding with full import (no user filter applied)`);
              warnings.push(`User-specific filter requested but no user found with email: ${filterUserEmail}. Importing all data.`);
            }
          } catch (err) {
            console.error(`[CLIO IMPORT] Error looking up filter user: ${err.message}`);
            addLog(`⚠️ Error looking up user: ${err.message}. Proceeding with full import.`);
            warnings.push(`Could not look up filter user: ${err.message}`);
          }
        }
        
        // Track client IDs for contact filtering (populated during matters import)
        const filterClientClioIds = new Set();
        
        // ============================================
        // PRE-LOAD EXISTING DATA MAPS (for when steps are skipped)
        // This allows time entries/bills to link to already-imported users/matters
        // ============================================
        
        // Pre-load userIdMap from database if we're skipping users but need to link activities
        if (!includeUsers && includeActivities) {
          console.log('[CLIO IMPORT] Pre-loading existing users from database for activity linking...');
          try {
            // Get all users for this firm and map by email
            const existingUsers = await query(
              'SELECT id, email, first_name, last_name FROM users WHERE firm_id = $1',
              [firmId]
            );
            for (const user of existingUsers.rows) {
              if (user.email) {
                userIdMap.set(user.email.toLowerCase(), user.id);
                // Also map by full name for fallback matching
                const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim().toLowerCase();
                if (fullName) userIdMap.set(fullName, user.id);
              }
            }
            console.log(`[CLIO IMPORT] Pre-loaded ${existingUsers.rows.length} existing users into map`);
            addLog(`📋 Loaded ${existingUsers.rows.length} existing users for linking`);
            
            // Also fetch Clio users to map Clio IDs to emails, then to our user IDs
            const clioUsers = await clioGetAll(accessToken, '/users.json', {
              fields: 'id,name,email'
            }, null);
            for (const cu of clioUsers) {
              if (cu.email) {
                const ourUserId = userIdMap.get(cu.email.toLowerCase());
                if (ourUserId) {
                  userIdMap.set(`clio:${cu.id}`, ourUserId);
                }
              }
            }
            console.log(`[CLIO IMPORT] Mapped ${clioUsers.length} Clio users to existing users`);
          } catch (err) {
            console.log(`[CLIO IMPORT] Could not pre-load users: ${err.message}`);
          }
        }
        
        // Pre-load matterIdMap from database if we're skipping matters but need to link activities/bills
        if (!includeMatters && (includeActivities || includeBills)) {
          console.log('[CLIO IMPORT] Pre-loading existing matters from database for activity/bill linking...');
          try {
            // Get all matters for this firm
            const existingMatters = await query(
              'SELECT id, number FROM matters WHERE firm_id = $1',
              [firmId]
            );
            for (const matter of existingMatters.rows) {
              if (matter.number) {
                matterIdMap.set(matter.number, matter.id);
                // The number format from Clio import is: {display_number}-{clio_id}
                // Extract Clio ID from the end if present
                const match = matter.number.match(/-(\d+)$/);
                if (match) {
                  matterIdMap.set(`clio:${match[1]}`, matter.id);
                }
              }
            }
            console.log(`[CLIO IMPORT] Pre-loaded ${existingMatters.rows.length} existing matters into map`);
            addLog(`📋 Loaded ${existingMatters.rows.length} existing matters for linking`);
          } catch (err) {
            console.log(`[CLIO IMPORT] Could not pre-load matters: ${err.message}`);
          }
        }
        
        // Pre-load contactIdMap from database if we're skipping contacts but need to link bills
        if (!includeContacts && includeBills) {
          console.log('[CLIO IMPORT] Pre-loading existing clients from database for bill linking...');
          try {
            const existingClients = await query(
              'SELECT id, display_name FROM clients WHERE firm_id = $1',
              [firmId]
            );
            for (const client of existingClients.rows) {
              if (client.display_name) {
                contactIdMap.set(client.display_name.toLowerCase(), client.id);
              }
            }
            console.log(`[CLIO IMPORT] Pre-loaded ${existingClients.rows.length} existing clients into map`);
            addLog(`📋 Loaded ${existingClients.rows.length} existing clients for linking`);
          } catch (err) {
            console.log(`[CLIO IMPORT] Could not pre-load clients: ${err.message}`);
          }
        }
        
        // ============================================
        // STEP 1: IMPORT USERS (direct to DB)
        // ============================================
        if (!includeUsers) {
          console.log('[CLIO IMPORT] Step 1/10: SKIPPING users');
          updateProgress('users', 'skipped', 0);
        } else {
          console.log('[CLIO IMPORT] Step 1/10: Importing users directly to DB...');
          updateProgress('users', 'running', 0);
          try {
            // Fetch users - use proven working fields
            const users = await clioGetAll(accessToken, '/users.json', {
              fields: 'id,name,first_name,last_name,email,enabled,subscription_type'
            }, (count) => updateProgress('users', 'running', count));
            
            console.log(`[CLIO IMPORT] Users fetched from Clio: ${users.length}`);
            addLog(`Fetched ${users.length} users from Clio`);
            
            // If user-specific filter is active, only import that single user
            let filteredUsers = users;
            if (filterClioUserId) {
              filteredUsers = users.filter(u => u.id === filterClioUserId);
              console.log(`[CLIO IMPORT] User filter applied: importing only 1 user (${filterUserEmail})`);
              addLog(`👤 Importing only 1 user: ${filterUserEmail}`);
            }
            
            let skippedNoEmail = 0;
            
            for (const u of filteredUsers) {
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
        // PRE-FETCH: Get client IDs for user-specific contact filtering
        // ============================================
        if (filterClioUserId && includeContacts) {
          console.log(`[CLIO IMPORT] Pre-fetching matters to identify clients for user filter...`);
          addLog(`🔍 Identifying which contacts to import...`);
          
          try {
            // Use simple paginated fetch with minimal fields for speed
            const mattersList = await clioGetPaginated(
              accessToken, '/matters.json',
              { fields: 'id,client{id},responsible_attorney{id}', limit: 200 },
              null
            );
            
            // Collect client IDs from user's matters
            for (const m of mattersList) {
              if (m.responsible_attorney?.id === filterClioUserId && m.client?.id) {
                filterClientClioIds.add(m.client.id);
              }
            }
            
            console.log(`[CLIO IMPORT] Found ${filterClientClioIds.size} unique clients from user's matters`);
            addLog(`📇 Found ${filterClientClioIds.size} clients to import`);
          } catch (err) {
            console.error(`[CLIO IMPORT] Error pre-fetching matters for client filter: ${err.message}`);
            addLog(`⚠️ Could not identify clients, will import all contacts`);
          }
        }
        
        // ============================================
        // STEP 2: IMPORT CONTACTS (direct to DB)
        // ============================================
        if (!includeContacts) {
          console.log('[CLIO IMPORT] Step 2/10: SKIPPING contacts');
          updateProgress('contacts', 'skipped', 0);
        } else {
          console.log('[CLIO IMPORT] Step 2/10: Importing contacts directly to DB...');
          addLog('Starting contacts import from Clio...');
          updateProgress('contacts', 'running', 0);
          try {
            const contactFields = 'id,name,first_name,last_name,type,company{id,name},email_addresses{id,address,name,primary},phone_numbers{id,number,name,primary},primary_email_address,primary_phone_number,addresses{id,street,city,province,postal_code,country,name,primary},primary_address';
            
            let filteredContacts = [];
            
            // If user-specific filter is active, fetch only those specific contacts by ID (much faster)
            if (filterClioUserId && filterClientClioIds.size > 0) {
              console.log(`[CLIO IMPORT] Fetching ${filterClientClioIds.size} specific contacts by ID...`);
              addLog(`📇 Fetching ${filterClientClioIds.size} contacts for user's matters...`);
              
              const clientIds = Array.from(filterClientClioIds);
              for (let i = 0; i < clientIds.length; i++) {
                try {
                  const response = await clioRequest(accessToken, `/contacts/${clientIds[i]}.json`, { fields: contactFields });
                  if (response.data) {
                    filteredContacts.push(response.data);
                  }
                  if ((i + 1) % 20 === 0 || i === clientIds.length - 1) {
                    updateProgress('contacts', 'running', filteredContacts.length);
                    addLog(`📇 Fetched ${filteredContacts.length}/${clientIds.length} contacts...`);
                  }
                } catch (err) {
                  console.log(`[CLIO IMPORT] Could not fetch contact ${clientIds[i]}: ${err.message}`);
                }
              }
              console.log(`[CLIO IMPORT] Fetched ${filteredContacts.length} contacts by ID`);
              addLog(`✅ Fetched ${filteredContacts.length} contacts for user's matters`);
            } else {
              // No filter - fetch all contacts
              const contacts = await clioGetAll(accessToken, '/contacts.json', {
                fields: contactFields
              }, (count) => updateProgress('contacts', 'running', count));
              
              filteredContacts = contacts;
              addLog(`Fetched ${contacts.length} contacts from Clio API.`);
            }
            
            // Log samples to debug what Clio returns for email/phone
            if (filteredContacts.length > 0) {
              // Log RAW first contact to see exactly what Clio returns
              console.log(`[CLIO IMPORT] RAW first contact from Clio API:`);
              console.log(JSON.stringify(filteredContacts[0], null, 2));
              
              // Log to frontend what fields exist on first contact
              const firstContact = filteredContacts[0];
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
              for (let i = 0; i < Math.min(3, filteredContacts.length); i++) {
                const c = filteredContacts[i];
                console.log(`[CLIO IMPORT]   Contact ${i+1}: name="${c.name}", email=${JSON.stringify(c.primary_email_address)}, phone=${JSON.stringify(c.primary_phone_number)}`);
              }
              // Also count how many have email/phone - check both field syntaxes
              const withEmail = filteredContacts.filter(c => c.primary_email_address?.address || c.email_addresses?.[0]?.address).length;
              const withPhone = filteredContacts.filter(c => c.primary_phone_number?.number || c.phone_numbers?.[0]?.number).length;
              console.log(`[CLIO IMPORT] Contacts with email: ${withEmail}/${filteredContacts.length}, with phone: ${withPhone}/${filteredContacts.length}`);
              addLog(`Contacts to import: ${filteredContacts.length} total, ${withEmail} with email, ${withPhone} with phone`);
            }
            
            // Track how many contacts have email/phone saved
            let savedWithEmail = 0;
            let savedWithPhone = 0;
            
            for (const c of filteredContacts) {
              try {
                const isCompany = c.type === 'Company';
                const displayName = c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown';
                
                // Try both Clio field syntaxes: primary_* fields OR *_arrays
                // Handle ALL possible property names from Clio API
                
                // Helper to extract email string from an email object (handles all Clio formats)
                const getEmailString = (emailObj) => {
                    if (!emailObj) return null;
                    if (typeof emailObj === 'string') return emailObj;
                    // Try all possible property names Clio might use
                    return emailObj.address || emailObj.email || emailObj.value || 
                           emailObj.email_address || emailObj.mail || null;
                };
                
                // Helper to extract phone string from a phone object (handles all Clio formats)
                const getPhoneString = (phoneObj) => {
                    if (!phoneObj) return null;
                    if (typeof phoneObj === 'string') return phoneObj;
                    // Try all possible property names Clio might use
                    return phoneObj.number || phoneObj.phone || phoneObj.value || 
                           phoneObj.phone_number || phoneObj.tel || null;
                };
                
                // Extract primary email - try multiple sources
                let primaryEmailString = null;
                let primaryEmailLabel = 'Email';
                
                // 1. Try primary_email_address first (direct object from Clio)
                if (c.primary_email_address) {
                    primaryEmailString = getEmailString(c.primary_email_address);
                    primaryEmailLabel = c.primary_email_address.name || 'Email';
                }
                
                // 2. If not found, scan email_addresses array
                if (!primaryEmailString && Array.isArray(c.email_addresses) && c.email_addresses.length > 0) {
                    // Find the best email: primary > default > Work > Other > first
                    const emailItem = c.email_addresses.find(e => e.primary) || 
                                     c.email_addresses.find(e => e.default_email) || 
                                     c.email_addresses.find(e => e.name === 'Work') ||
                                     c.email_addresses.find(e => e.name === 'Other') ||
                                     c.email_addresses[0];
                    if (emailItem) {
                        primaryEmailString = getEmailString(emailItem);
                        primaryEmailLabel = emailItem.name || 'Email';
                    }
                }
                
                // 3. Last resort - check if there's a direct email field on the contact
                if (!primaryEmailString && c.email) {
                    primaryEmailString = typeof c.email === 'string' ? c.email : getEmailString(c.email);
                }

                // Extract primary phone - try multiple sources
                let primaryPhoneString = null;
                let primaryPhoneLabel = 'Phone';
                
                // 1. Try primary_phone_number first (direct object from Clio)
                if (c.primary_phone_number) {
                    primaryPhoneString = getPhoneString(c.primary_phone_number);
                    primaryPhoneLabel = c.primary_phone_number.name || 'Phone';
                }
                
                // 2. If not found, scan phone_numbers array
                if (!primaryPhoneString && Array.isArray(c.phone_numbers) && c.phone_numbers.length > 0) {
                    // Find the best phone: primary > default > Work > Mobile > first
                    const phoneItem = c.phone_numbers.find(p => p.primary) || 
                                     c.phone_numbers.find(p => p.default_number) || 
                                     c.phone_numbers.find(p => p.name === 'Work') ||
                                     c.phone_numbers.find(p => p.name === 'Mobile') ||
                                     c.phone_numbers[0];
                    if (phoneItem) {
                        primaryPhoneString = getPhoneString(phoneItem);
                        primaryPhoneLabel = phoneItem.name || 'Phone';
                    }
                }
                
                // 3. Last resort - check if there's a direct phone field on the contact
                if (!primaryPhoneString && c.phone) {
                    primaryPhoneString = typeof c.phone === 'string' ? c.phone : getPhoneString(c.phone);
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
                  console.log(`[CLIO IMPORT]   Raw c.email: ${JSON.stringify(c.email)}`);
                  console.log(`[CLIO IMPORT]   EXTRACTED Email: "${primaryEmailString || 'NULL'}"`);
                  console.log(`[CLIO IMPORT]   Raw phone_numbers: ${JSON.stringify(c.phone_numbers)}`);
                  console.log(`[CLIO IMPORT]   Raw primary_phone_number: ${JSON.stringify(c.primary_phone_number)}`);
                  console.log(`[CLIO IMPORT]   Raw c.phone: ${JSON.stringify(c.phone)}`);
                  console.log(`[CLIO IMPORT]   EXTRACTED Phone: "${primaryPhoneString || 'NULL'}"`);
                }
                
                // Track what we're saving
                if (primaryEmailString) savedWithEmail++;
                if (primaryPhoneString) savedWithPhone++;
                
                // Build notes with contact info from Clio
                const notesParts = [];
                
                // Save email if present
                if (primaryEmailString) {
                  notesParts.push(`${primaryEmailLabel}: ${primaryEmailString}`);
                }
                
                // Save phone if present
                if (primaryPhoneString) {
                  notesParts.push(`${primaryPhoneLabel}: ${primaryPhoneString}`);
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
                    primaryEmailString || null,
                    primaryPhoneString || null,
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
            console.log(`[CLIO IMPORT] Contacts fetched from Clio: ${filteredContacts.length}`);
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
        // Track imported Clio matter IDs for filtering time entries, bills, calendar
        const importedClioMatterIds = new Set();
        
        if (!includeMatters) {
          console.log('[CLIO IMPORT] Step 3/10: SKIPPING matters');
          updateProgress('matters', 'skipped', 0);
          
          // If skipping matters but need activities/bills, extract Clio IDs from existing matter numbers
          if (includeActivities || includeBills || includeCalendar) {
            console.log('[CLIO IMPORT] Extracting Clio matter IDs from existing matters for activity/bill fetching...');
            try {
              const existingMatters = await query(
                'SELECT number FROM matters WHERE firm_id = $1',
                [firmId]
              );
              for (const matter of existingMatters.rows) {
                // Extract Clio ID from matter number format: {display_number}-{clio_id}
                const match = matter.number?.match(/-(\d+)$/);
                if (match) {
                  importedClioMatterIds.add(parseInt(match[1]));
                }
              }
              console.log(`[CLIO IMPORT] Found ${importedClioMatterIds.size} Clio matter IDs from existing matters`);
              addLog(`📋 Found ${importedClioMatterIds.size} existing matters for fetching activities/bills`);
            } catch (err) {
              console.log(`[CLIO IMPORT] Could not extract matter IDs: ${err.message}`);
            }
          }
        } else {
          console.log('[CLIO IMPORT] Step 3/10: Importing matters directly to DB...');
          updateProgress('matters', 'running', 0);
          try {
            // Fetch matters
            const matters = await clioGetMattersByStatus(
              accessToken, '/matters.json',
              { fields: 'id,display_number,description,status,open_date,close_date,billing_method,client{id,name},responsible_attorney{id,name},originating_attorney{id,name},practice_area{id,name}' },
              (count) => updateProgress('matters', 'running', count)
            );
            
            // If user-specific filter is active, filter matters
            let filteredMatters = matters;
            if (filterClioUserId) {
              filteredMatters = matters.filter(m => 
                m.responsible_attorney?.id === filterClioUserId
              );
              console.log(`[CLIO IMPORT] User filter applied: ${filteredMatters.length} of ${matters.length} matters where user is responsible attorney`);
              addLog(`📋 Filtered to ${filteredMatters.length} matters (from ${matters.length} total) where user is responsible attorney`);
            }
            
            for (const m of filteredMatters) {
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
                importedClioMatterIds.add(m.id); // Track for filtering time entries, bills, calendar
                
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
          console.log('[CLIO IMPORT] Step 4/10: SKIPPING activities');
          updateProgress('activities', 'skipped', 0);
        } else {
          console.log('[CLIO IMPORT] Step 4/10: Importing time entries and expenses directly to DB...');
          updateProgress('activities', 'running', 0);
          try {
            // Use simpler field format - some Clio accounts don't support nested syntax like {id,name,code}
            const activityFields = 'id,type,date,quantity,quantity_in_hours,rounded_quantity_in_hours,price,total,note,billed,non_billable,created_at,updated_at,matter,user,activity_description,bill';
            
            let filteredActivities = [];
            
            // If user-specific filter, fetch activities BY USER ID (not by matter)
            // This gets ALL time entries for this user, even on matters where they're not the responsible attorney
            if (filterClioUserId) {
              console.log(`[CLIO IMPORT] Fetching ALL activities for user ${filterClioUserId}...`);
              addLog(`⏱️ Fetching all time entries for this user...`);
              
              try {
                // Fetch activities by user_id - this gets ALL the user's time entries
                const userActivities = await clioGetPaginated(
                  accessToken, '/activities.json',
                  { fields: activityFields, user_id: filterClioUserId, order: 'id(asc)' },
                  (count) => updateProgress('activities', 'running', count)
                );
                filteredActivities.push(...userActivities);
                console.log(`[CLIO IMPORT] Fetched ${filteredActivities.length} activities for user`);
                addLog(`✅ Fetched ${filteredActivities.length} time entries for user`);
              } catch (err) {
                console.log(`[CLIO IMPORT] Could not fetch activities by user_id: ${err.message}`);
                addLog(`⚠️ Error fetching time entries: ${err.message}`);
                
                // Fallback: try fetching by matter IDs if user_id filter failed
                if (importedClioMatterIds.size > 0) {
                  console.log(`[CLIO IMPORT] Falling back to fetching by matter IDs...`);
                  addLog(`🔄 Trying alternative method...`);
                  
                  const matterIds = Array.from(importedClioMatterIds);
                  for (let i = 0; i < matterIds.length; i++) {
                    try {
                      const matterActivities = await clioGetPaginated(
                        accessToken, '/activities.json',
                        { fields: activityFields, matter_id: matterIds[i], order: 'id(asc)' },
                        null
                      );
                      filteredActivities.push(...matterActivities);
                    } catch (matterErr) {
                      // Skip individual matter errors
                    }
                  }
                  console.log(`[CLIO IMPORT] Fallback fetched ${filteredActivities.length} activities`);
                  addLog(`✅ Fallback fetched ${filteredActivities.length} time entries`);
                }
              }
            } else {
              // No filter - fetch all activities
              const activities = await clioGetActivitiesByStatus(
                accessToken, '/activities.json',
                { fields: activityFields },
                (count) => updateProgress('activities', 'running', count)
              );
              filteredActivities = activities;
              console.log(`[CLIO IMPORT] Activities fetched from Clio: ${activities.length}`);
            }
            
            // Log RAW first activity to see exactly what Clio returns
            if (filteredActivities.length > 0) {
              console.log(`[CLIO IMPORT] RAW first activity from Clio API:`);
              console.log(JSON.stringify(filteredActivities[0], null, 2));
              
              // Log first 5 activities summary
              console.log(`[CLIO IMPORT] First 5 activities summary:`);
              for (let i = 0; i < Math.min(5, filteredActivities.length); i++) {
                const a = filteredActivities[i];
                console.log(`[CLIO IMPORT]   Activity ${i+1}: type=${a.type}, date=${a.date}, quantity=${a.quantity}, quantity_in_hours=${a.quantity_in_hours}, price=${a.price}, total=${a.total}, billed=${a.billed}, matter_id=${a.matter?.id}, user=${a.user?.name}`);
              }
              
              // Count by type and status
              const timeEntries = filteredActivities.filter(a => a.type === 'TimeEntry').length;
              const expenses = filteredActivities.filter(a => a.type === 'ExpenseEntry').length;
              const billed = filteredActivities.filter(a => a.billed).length;
              const withMatter = filteredActivities.filter(a => a.matter?.id).length;
              console.log(`[CLIO IMPORT] Activity breakdown: ${timeEntries} time entries, ${expenses} expenses, ${billed} billed, ${withMatter} with matter`);
            }
            
            let expenseCount = 0;
            let timeEntriesNoMatter = 0;
            let timeEntriesNoUser = 0;
            let expensesNoMatter = 0;
            let savedTimeEntries = 0;
            
            for (const a of filteredActivities) {
              try {
                // Robust matter extraction - try multiple property names and formats
                let matterClioId = null;
                let matterDisplayNum = null;
                
                if (a.matter?.id) {
                  matterClioId = a.matter.id;
                  matterDisplayNum = a.matter.display_number || a.matter.number || a.matter.name;
                } else if (a.matter_id) {
                  matterClioId = a.matter_id; // Direct ID field
                } else if (a.case?.id) {
                  matterClioId = a.case.id; // Some APIs use 'case' instead of 'matter'
                }
                
                let matterId = matterClioId ? matterIdMap.get(`clio:${matterClioId}`) : null;
                if (!matterId && matterDisplayNum) {
                  matterId = matterIdMap.get(matterDisplayNum);
                }
                
                // Robust user extraction - try multiple property names
                let userClioId = null;
                let userName = null;
                let userEmail = null;
                
                if (a.user?.id) {
                  userClioId = a.user.id;
                  userName = a.user.name;
                  userEmail = a.user.email;
                } else if (a.user_id) {
                  userClioId = a.user_id; // Direct ID field
                } else if (a.attorney?.id) {
                  userClioId = a.attorney.id; // Some APIs use 'attorney'
                  userName = a.attorney.name;
                } else if (a.timekeeper?.id) {
                  userClioId = a.timekeeper.id; // Some APIs use 'timekeeper'
                  userName = a.timekeeper.name;
                }
                
                // Look up user - try by Clio ID first, then by email, then by name
                let userId = userClioId ? userIdMap.get(`clio:${userClioId}`) : null;
                if (!userId && userEmail) {
                  userId = userIdMap.get(userEmail.toLowerCase());
                }
                if (!userId && userName) {
                  // Try to find user by name in the userIdMap
                  for (const [key, id] of userIdMap.entries()) {
                    if (key.toLowerCase() === userName.toLowerCase()) {
                      userId = id;
                      break;
                    }
                  }
                }
                
                // Clio has TimeEntry and ExpenseEntry types
                const isExpense = a.type === 'ExpenseEntry';
                
                if (isExpense) {
                  // For expenses, we require a matter (expense must be billable to something)
                  if (!matterId) {
                    expensesNoMatter++;
                    continue;
                  }
                  
                  // Insert as expense with Clio tracking fields
                  const amount = parseFloat(a.total) || parseFloat(a.price) || 0;
                  // Use activity_description name as category if available, or UTBMS expense type
                  const category = a.activity_description?.name || a.utbms_expense_type?.name || 'Expense';
                  
                  await query(
                    `INSERT INTO expenses (firm_id, matter_id, user_id, date, description, amount, category, billable, billed, status, clio_id, clio_created_at, clio_updated_at, migrated_at, migration_source)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), 'clio')
                     ON CONFLICT (firm_id, clio_id) WHERE clio_id IS NOT NULL 
                     DO UPDATE SET 
                       description = EXCLUDED.description,
                       amount = EXCLUDED.amount,
                       billable = EXCLUDED.billable,
                       billed = EXCLUDED.billed,
                       status = EXCLUDED.status,
                       clio_updated_at = EXCLUDED.clio_updated_at`,
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
                      a.billed ? 'billed' : 'pending',
                      a.id || null,  // clio_id
                      a.created_at || null,  // clio_created_at
                      a.updated_at || null   // clio_updated_at
                    ]
                  );
                  expenseCount++;
                } else {
                  // Insert as time entry - ALLOW entries without matter (general time tracking)
                  // Track stats for reporting
                  if (!matterId) timeEntriesNoMatter++;
                  if (!userId) timeEntriesNoUser++;
                  
                  // Prefer rounded_quantity_in_hours (billing hours) > quantity_in_hours > quantity
                  const hours = parseFloat(a.rounded_quantity_in_hours) || parseFloat(a.quantity_in_hours) || parseFloat(a.quantity) || 0;
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
                  
                  // Get activity code from activity_description (prefer code over name for standardization)
                  const activityCode = a.activity_description?.code || a.activity_description?.name || null;
                  
                  // Build description with context if matter is missing
                  let description = a.note || 'Imported from Clio';
                  if (!matterId && a.matter?.display_number) {
                    description = `[Matter: ${a.matter.display_number}] ${description}`;
                  }
                  
                  await query(
                    `INSERT INTO time_entries (firm_id, matter_id, user_id, date, hours, rate, description, activity_code, billable, billed, status, clio_id, clio_created_at, clio_updated_at, migrated_at, migration_source)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), 'clio')
                     ON CONFLICT (firm_id, clio_id) WHERE clio_id IS NOT NULL 
                     DO UPDATE SET 
                       matter_id = COALESCE(EXCLUDED.matter_id, time_entries.matter_id),
                       user_id = COALESCE(EXCLUDED.user_id, time_entries.user_id),
                       hours = EXCLUDED.hours,
                       rate = EXCLUDED.rate,
                       description = EXCLUDED.description,
                       billable = EXCLUDED.billable,
                       billed = EXCLUDED.billed,
                       status = EXCLUDED.status,
                       clio_updated_at = EXCLUDED.clio_updated_at`,
                    [
                      firmId,
                      matterId, // Can be null - entry will be "unassigned"
                      userId,   // Can be null - entry will be "unassigned"
                      a.date || new Date().toISOString().split('T')[0],
                      hours,
                      rate,
                      description,
                      activityCode,
                      !a.non_billable,
                      a.billed || false,
                      status,
                      a.id || null,  // clio_id
                      a.created_at || null,  // clio_created_at
                      a.updated_at || null   // clio_updated_at
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
            
            // Detailed logging of import stats
            console.log(`[CLIO IMPORT] Time entries without matter (still imported): ${timeEntriesNoMatter}`);
            console.log(`[CLIO IMPORT] Time entries without user (still imported): ${timeEntriesNoUser}`);
            console.log(`[CLIO IMPORT] Expenses without matter (skipped): ${expensesNoMatter}`);
            // Verify time entries and expenses were saved
            console.log(`[CLIO IMPORT] Activities fetched from Clio: ${filteredActivities.length}`);
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
          console.log('[CLIO IMPORT] Step 5/10: SKIPPING bills');
          updateProgress('bills', 'skipped', 0);
        } else {
          console.log('[CLIO IMPORT] Step 5/10: Importing bills directly to DB...');
          updateProgress('bills', 'running', 0);
          try {
            const billFields = 'id,number,issued_at,due_at,total,balance,state,matters{id,display_number},client{id,name}';
            const billFieldsMinimal = 'id,number,issued_at,due_at,total,balance,state';
            
            let filteredBills = [];
            
            // If user-specific filter, fetch bills for imported matters AND by client IDs
            if (filterClioUserId) {
              const seenBillIds = new Set(); // Bills can appear for multiple matters/clients
              
              // First, try fetching bills by matter IDs
              if (importedClioMatterIds.size > 0) {
                console.log(`[CLIO IMPORT] Fetching bills for ${importedClioMatterIds.size} matters...`);
                addLog(`💰 Fetching bills for ${importedClioMatterIds.size} matters...`);
                
                const matterIds = Array.from(importedClioMatterIds);
                
                for (let i = 0; i < matterIds.length; i++) {
                  try {
                    const matterBills = await clioGetPaginated(
                      accessToken, '/bills.json',
                      { fields: billFields, matter_id: matterIds[i], order: 'id(asc)' },
                      null
                    );
                    for (const bill of matterBills) {
                      if (!seenBillIds.has(bill.id)) {
                        seenBillIds.add(bill.id);
                        filteredBills.push(bill);
                      }
                    }
                    
                    if ((i + 1) % 20 === 0 || i === matterIds.length - 1) {
                      updateProgress('bills', 'running', filteredBills.length);
                    }
                  } catch (err) {
                    console.log(`[CLIO IMPORT] Could not fetch bills for matter ${matterIds[i]}: ${err.message}`);
                  }
                }
                console.log(`[CLIO IMPORT] Fetched ${filteredBills.length} bills from matters`);
                addLog(`✅ Found ${filteredBills.length} bills from matters`);
              }
              
              // Also try fetching bills by client IDs (in case bills are linked to clients, not matters)
              if (filterClientClioIds && filterClientClioIds.size > 0) {
                console.log(`[CLIO IMPORT] Also fetching bills for ${filterClientClioIds.size} clients...`);
                addLog(`💰 Also checking ${filterClientClioIds.size} clients for bills...`);
                
                const clientIds = Array.from(filterClientClioIds);
                let clientBillCount = 0;
                
                for (let i = 0; i < clientIds.length; i++) {
                  try {
                    const clientBills = await clioGetPaginated(
                      accessToken, '/bills.json',
                      { fields: billFields, client_id: clientIds[i], order: 'id(asc)' },
                      null
                    );
                    for (const bill of clientBills) {
                      if (!seenBillIds.has(bill.id)) {
                        seenBillIds.add(bill.id);
                        filteredBills.push(bill);
                        clientBillCount++;
                      }
                    }
                  } catch (err) {
                    // Skip individual client errors
                  }
                }
                
                if (clientBillCount > 0) {
                  console.log(`[CLIO IMPORT] Found ${clientBillCount} additional bills from clients`);
                  addLog(`✅ Found ${clientBillCount} additional bills from clients`);
                }
              }
              
              console.log(`[CLIO IMPORT] Total bills fetched for user: ${filteredBills.length}`);
              addLog(`💰 Total: ${filteredBills.length} bills for this user`);
              
              if (filteredBills.length === 0) {
                addLog(`ℹ️ No bills found - this user may not have any invoices yet`);
              }
            } else {
              // No filter - fetch all bills
              let bills = [];
              try {
                bills = await clioGetAll(accessToken, '/bills.json', {
                  fields: billFields
                }, (count) => updateProgress('bills', 'running', count));
              } catch (err) {
                console.log(`[CLIO IMPORT] Standard bills fetch failed: ${err.message}. Retrying with minimal fields...`);
                try {
                  bills = await clioGetAll(accessToken, '/bills.json', {
                    fields: billFieldsMinimal
                  }, (count) => updateProgress('bills', 'running', count));
                } catch (retryErr) {
                  console.error(`[CLIO IMPORT] Retry failed: ${retryErr.message}`);
                }
              }
              filteredBills = bills;
              console.log(`[CLIO IMPORT] Bills fetched from Clio: ${bills.length}`);
            }
            
            // Log RAW first bill to see exactly what Clio returns
            if (filteredBills.length > 0) {
              console.log(`[CLIO IMPORT] RAW first bill from Clio API:`);
              console.log(JSON.stringify(filteredBills[0], null, 2));
              
              // Log first 5 bills summary
              console.log(`[CLIO IMPORT] First 5 bills summary:`);
              for (let i = 0; i < Math.min(5, filteredBills.length); i++) {
                const b = filteredBills[i];
                console.log(`[CLIO IMPORT]   Bill ${i+1}: number=${b.number}, state=${b.state}, total=${b.total}, balance=${b.balance}, issued_at=${b.issued_at}, matters=${b.matters?.length || 0}, client=${b.client?.name}`);
              }
              
              // Count by state
              const byState = {};
              filteredBills.forEach(b => {
                byState[b.state] = (byState[b.state] || 0) + 1;
              });
              console.log(`[CLIO IMPORT] Bills by state:`, byState);
              
              // Calculate totals
              const totalAmount = filteredBills.reduce((sum, b) => sum + (parseFloat(b.total) || 0), 0);
              const totalBalance = filteredBills.reduce((sum, b) => sum + (parseFloat(b.balance) || 0), 0);
              console.log(`[CLIO IMPORT] Bills total amount: $${totalAmount.toFixed(2)}, outstanding: $${totalBalance.toFixed(2)}`);
            }
            
            let skippedBills = 0;
            
            for (const b of filteredBills) {
              try {
                // Robust matter extraction - handle array or single object
                let firstMatter = null;
                if (Array.isArray(b.matters) && b.matters.length > 0) {
                  firstMatter = b.matters[0];
                } else if (b.matter && typeof b.matter === 'object') {
                  firstMatter = b.matter; // Single matter object
                } else if (b.matters && typeof b.matters === 'object' && !Array.isArray(b.matters)) {
                  firstMatter = b.matters; // Single matter in 'matters' field
                }
                const matterClioId = firstMatter?.id || firstMatter?.clio_id;
                const matterId = matterClioId ? matterIdMap.get(`clio:${matterClioId}`) : null;
                
                // Robust client extraction - handle different property names
                let clientClioId = null;
                if (b.client?.id) {
                  clientClioId = b.client.id;
                } else if (b.client?.clio_id) {
                  clientClioId = b.client.clio_id;
                } else if (b.contact?.id) {
                  clientClioId = b.contact.id; // Some versions use 'contact' instead of 'client'
                } else if (b.customer?.id) {
                  clientClioId = b.customer.id; // Fallback for 'customer' naming
                }
                const clientId = clientClioId ? contactIdMap.get(`clio:${clientClioId}`) : null;
                
                // Parse Clio financial fields - try multiple property names
                const billTotal = parseFloat(b.total) || parseFloat(b.amount) || parseFloat(b.grand_total) || 0;
                const billBalance = parseFloat(b.balance) || parseFloat(b.balance_due) || parseFloat(b.outstanding) || 0;
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
          console.log('[CLIO IMPORT] Step 6/10: SKIPPING calendar');
          updateProgress('calendar', 'skipped', 0);
        } else {
          console.log('[CLIO IMPORT] Step 6/10: Importing calendar directly to DB...');
          updateProgress('calendar', 'running', 0);
          try {
            const calendarFields = 'id,summary,description,start_at,end_at,all_day,location,matter,attendees';
            
            let filteredEvents = [];
            
            // If user-specific filter, fetch calendar entries only for the imported matters
            if (filterClioUserId && importedClioMatterIds.size > 0) {
              console.log(`[CLIO IMPORT] Fetching calendar events for ${importedClioMatterIds.size} matters...`);
              addLog(`📅 Fetching calendar events for ${importedClioMatterIds.size} matters...`);
              
              const matterIds = Array.from(importedClioMatterIds);
              for (let i = 0; i < matterIds.length; i++) {
                try {
                  const matterEvents = await clioGetPaginated(
                    accessToken, '/calendar_entries.json',
                    { fields: calendarFields, matter_id: matterIds[i] },
                    null
                  );
                  filteredEvents.push(...matterEvents);
                  
                  if ((i + 1) % 20 === 0 || i === matterIds.length - 1) {
                    updateProgress('calendar', 'running', filteredEvents.length);
                  }
                } catch (err) {
                  console.log(`[CLIO IMPORT] Could not fetch calendar for matter ${matterIds[i]}: ${err.message}`);
                }
              }
              console.log(`[CLIO IMPORT] Fetched ${filteredEvents.length} calendar events for user's matters`);
              addLog(`✅ Fetched ${filteredEvents.length} calendar events for user's matters`);
            } else if (filterClioUserId && importedClioMatterIds.size === 0) {
              // User filter active but no matters were imported
              console.log(`[CLIO IMPORT] No matters imported for user, skipping calendar`);
              addLog(`⚠️ No matters found for this user, skipping calendar events`);
            } else {
              // No filter - fetch all calendar events
              const events = await clioGetAll(accessToken, '/calendar_entries.json', {
                fields: calendarFields
              }, (count) => updateProgress('calendar', 'running', count));
              filteredEvents = events;
            }
            
            for (const e of filteredEvents) {
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
        console.log('[CLIO IMPORT] Step 7/10: Importing notes...');
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
        // STEP 7B: IMPORT TASKS (to dedicated tasks table if exists)
        // ============================================
        console.log('[CLIO IMPORT] Step 7B: Importing tasks...');
        updateProgress('tasks', 'running', 0);
        let tasksCount = 0;
        try {
          // First check if tasks table exists
          const tasksTableCheck = await query(`
            SELECT EXISTS (
              SELECT 1 FROM information_schema.tables 
              WHERE table_schema = 'public' AND table_name = 'tasks'
            ) as exists
          `);
          
          if (!tasksTableCheck.rows[0]?.exists) {
            console.log('[CLIO IMPORT] Tasks table does not exist - skipping tasks import');
            addLog('⚠️ Tasks table not found - skipping (run migration to enable)');
            updateProgress('tasks', 'completed', 0);
          } else {
            // Fetch tasks from Clio
            const tasks = await clioGetPaginated(accessToken, '/tasks.json', {
              fields: 'id,name,description,priority,status,due_at,completed_at,reminder_at,matter{id},assignee{id},assigner{id},created_at,updated_at'
            }, null);
            
            console.log(`[CLIO IMPORT] Tasks fetched from Clio: ${tasks.length}`);
            addLog(`📋 Fetched ${tasks.length} tasks from Clio`);
            
            for (const task of tasks) {
              try {
                const matterId = task.matter?.id ? matterIdMap.get(`clio:${task.matter.id}`) : null;
                const assignedTo = task.assignee?.id ? userIdMap.get(`clio:${task.assignee.id}`) : null;
                const createdBy = task.assigner?.id ? userIdMap.get(`clio:${task.assigner.id}`) : null;
                
                // Map priority
                let priority = 'medium';
                const clioPriority = (task.priority || '').toLowerCase();
                if (clioPriority === 'high' || clioPriority === 'urgent') priority = 'high';
                else if (clioPriority === 'low') priority = 'low';
                
                // Map status
                let status = 'pending';
                const clioStatus = (task.status || '').toLowerCase();
                if (clioStatus === 'complete' || clioStatus === 'completed') status = 'completed';
                else if (clioStatus === 'in_progress' || clioStatus === 'in progress') status = 'in_progress';
                
                // Parse due date/time
                const dueAt = task.due_at ? new Date(task.due_at) : null;
                const dueDate = dueAt ? dueAt.toISOString().split('T')[0] : null;
                const dueTime = dueAt ? dueAt.toISOString().split('T')[1].substring(0, 8) : null;
                
                // Check if tasks table has clio_id column for upsert
                const hasClioId = await query(`
                  SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'tasks' AND column_name = 'clio_id'
                  ) as exists
                `);
                
                if (hasClioId.rows[0]?.exists) {
                  // Use upsert with clio_id
                  await query(
                    `INSERT INTO tasks (firm_id, matter_id, assigned_to, created_by, name, description, priority, status, due_date, due_time, completed_at, reminder_at, clio_id, clio_created_at, clio_updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                     ON CONFLICT (firm_id, clio_id) WHERE clio_id IS NOT NULL DO UPDATE SET
                       name = EXCLUDED.name,
                       description = EXCLUDED.description,
                       priority = EXCLUDED.priority,
                       status = EXCLUDED.status,
                       due_date = EXCLUDED.due_date,
                       completed_at = EXCLUDED.completed_at,
                       updated_at = NOW()`,
                    [
                      firmId,
                      matterId,
                      assignedTo,
                      createdBy,
                      task.name || 'Untitled Task',
                      task.description || null,
                      priority,
                      status,
                      dueDate,
                      dueTime,
                      task.completed_at || null,
                      task.reminder_at || null,
                      task.id,
                      task.created_at || null,
                      task.updated_at || null
                    ]
                  );
                } else {
                  // Simple insert without clio_id
                  await query(
                    `INSERT INTO tasks (firm_id, matter_id, assigned_to, created_by, name, description, priority, status, due_date, due_time, completed_at, reminder_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                    [
                      firmId,
                      matterId,
                      assignedTo,
                      createdBy,
                      task.name || 'Untitled Task',
                      task.description || null,
                      priority,
                      status,
                      dueDate,
                      dueTime,
                      task.completed_at || null,
                      task.reminder_at || null
                    ]
                  );
                }
                tasksCount++;
                
                if (tasksCount % 100 === 0) {
                  updateProgress('tasks', 'running', tasksCount);
                }
              } catch (err) {
                // Skip individual task errors
                if (!err.message.includes('duplicate')) {
                  console.log(`[CLIO IMPORT] Task error: ${err.message}`);
                }
              }
            }
            
            updateProgress('tasks', 'completed', tasksCount);
            console.log(`[CLIO IMPORT] Tasks imported: ${tasksCount}`);
            addLog(`✅ Imported ${tasksCount} tasks`);
          }
        } catch (err) {
          console.log(`[CLIO IMPORT] Tasks error (non-fatal): ${err.message}`);
          updateProgress('tasks', 'error', tasksCount, err.message);
          addLog(`⚠️ Tasks import error: ${err.message}`);
        }
        
        // ============================================
        // STEP 7C: IMPORT ACTIVITY CODES (UTBMS/LEDES)
        // ============================================
        console.log('[CLIO IMPORT] Step 7C: Importing activity codes...');
        updateProgress('activityCodes', 'running', 0);
        let activityCodesCount = 0;
        try {
          // First check if activity_codes table exists
          const activityCodesTableCheck = await query(`
            SELECT EXISTS (
              SELECT 1 FROM information_schema.tables 
              WHERE table_schema = 'public' AND table_name = 'activity_codes'
            ) as exists
          `);
          
          if (!activityCodesTableCheck.rows[0]?.exists) {
            console.log('[CLIO IMPORT] Activity codes table does not exist - skipping');
            addLog('⚠️ Activity codes table not found - skipping (run migration to enable)');
            updateProgress('activityCodes', 'completed', 0);
          } else {
            // Fetch activity descriptions from Clio (these are the activity codes)
            const activityDescs = await clioGetPaginated(accessToken, '/activity_descriptions.json', {
              fields: 'id,name,code,type,rate,visible_to_co_counsel,created_at,updated_at'
            }, null);
            
            console.log(`[CLIO IMPORT] Activity codes fetched from Clio: ${activityDescs.length}`);
            addLog(`📋 Fetched ${activityDescs.length} activity codes from Clio`);
            
            for (const ad of activityDescs) {
              try {
                const code = ad.code || `CODE-${ad.id}`;
                
                await query(
                  `INSERT INTO activity_codes (firm_id, code, name, description, category, rate_override, clio_id)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)
                   ON CONFLICT (firm_id, code) DO UPDATE SET
                     name = EXCLUDED.name,
                     rate_override = EXCLUDED.rate_override,
                     updated_at = NOW()`,
                  [
                    firmId,
                    code,
                    ad.name || code,
                    null,
                    ad.type || 'general',
                    ad.rate ? parseFloat(ad.rate) : null,
                    ad.id
                  ]
                );
                activityCodesCount++;
              } catch (err) {
                // Skip silently - might be missing columns
                if (!err.message.includes('duplicate') && !err.message.includes('column')) {
                  console.log(`[CLIO IMPORT] Activity code error: ${err.message}`);
                }
              }
            }
            
            updateProgress('activityCodes', 'completed', activityCodesCount);
            console.log(`[CLIO IMPORT] Activity codes imported: ${activityCodesCount}`);
            addLog(`✅ Imported ${activityCodesCount} activity codes`);
          }
        } catch (err) {
          console.log(`[CLIO IMPORT] Activity codes error (non-fatal): ${err.message}`);
          updateProgress('activityCodes', 'error', activityCodesCount, err.message);
          addLog(`⚠️ Activity codes import error: ${err.message}`);
        }
        
        // ============================================
        // STEP 8: IMPORT PAYMENTS (direct to DB)
        // ============================================
        console.log('[CLIO IMPORT] Step 8/10: Importing payments...');
        let paymentsCount = 0;
        try {
          // Fetch payments from Clio - these are actual payment records
          // Note: Clio payments API has limited fields - using only valid ones
          const payments = await clioGetPaginated(accessToken, '/payments.json', {
            fields: 'id,date,amount,description,type,contact{id,name},created_at'
          }, null);
          
          console.log(`[CLIO IMPORT] Payments fetched from Clio: ${payments.length}`);
          
          if (payments.length > 0) {
            console.log(`[CLIO IMPORT] First payment sample:`, JSON.stringify(payments[0], null, 2));
          }
          
          // We need to map Clio bill IDs to Apex invoice IDs
          // Since we appended Clio ID to invoice numbers, we can look up by number pattern
          const invoiceMap = new Map();
          const invoiceResults = await query('SELECT id, number FROM invoices WHERE firm_id = $1', [firmId]);
          for (const inv of invoiceResults.rows) {
            // Extract Clio ID from number format "INV-123-456" where 456 is Clio ID
            const parts = inv.number.split('-');
            if (parts.length >= 2) {
              const clioId = parts[parts.length - 1];
              invoiceMap.set(clioId, inv.id);
            }
          }
          
          for (const p of payments) {
            try {
              // Look up invoice by Clio bill ID
              let invoiceId = null;
              if (p.bill?.id) {
                invoiceId = invoiceMap.get(String(p.bill.id));
              }
              
              // Look up client
              const clientId = p.contact?.id ? contactIdMap.get(`clio:${p.contact.id}`) : null;
              
              const amount = parseFloat(p.amount) || 0;
              if (amount <= 0) continue;
              
              // Map Clio type to our payment_method
              let paymentMethod = 'other';
              if (p.type) {
                const pt = p.type.toLowerCase();
                if (pt.includes('check') || pt.includes('cheque')) paymentMethod = 'check';
                else if (pt.includes('credit') || pt.includes('card')) paymentMethod = 'credit_card';
                else if (pt.includes('wire') || pt.includes('transfer') || pt.includes('ach')) paymentMethod = 'bank_transfer';
                else if (pt.includes('cash')) paymentMethod = 'cash';
              }
              
              await query(
                `INSERT INTO payments (firm_id, invoice_id, client_id, amount, payment_method, payment_date, notes, reference, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                  firmId,
                  invoiceId,
                  clientId,
                  amount,
                  paymentMethod,
                  p.date || new Date().toISOString().split('T')[0],
                  p.description || null,
                  `Clio Payment ${p.id}`,
                  p.created_at || new Date().toISOString()
                ]
              );
              paymentsCount++;
            } catch (err) {
              // Skip silently - payments are optional
            }
          }
          
          // Calculate total payments imported
          const paymentSummary = await query(
            'SELECT COUNT(*) as count, SUM(amount) as total FROM payments WHERE firm_id = $1',
            [firmId]
          );
          console.log(`[CLIO IMPORT] Payments saved: ${paymentsCount}, total amount: $${parseFloat(paymentSummary.rows[0]?.total || 0).toFixed(2)}`);
          
        } catch (err) {
          console.log(`[CLIO IMPORT] Payments error (non-fatal): ${err.message}`);
        }
        
        // ============================================
        // STEP 9: IMPORT TRUST ACCOUNTS (direct to DB)
        // ============================================
        console.log('[CLIO IMPORT] Step 9/10: Importing trust accounts...');
        let trustAccountsCount = 0;
        let trustTransactionsCount = 0;
        const trustAccountMap = new Map(); // clio ID -> apex ID
        
        try {
          // Fetch bank accounts from Clio (includes trust/IOLTA accounts)
          const bankAccounts = await clioGetPaginated(accessToken, '/bank_accounts.json', {
            fields: 'id,name,account_type,currency,balance,holder,domicile,bank_transactions_enabled,created_at'
          }, null);
          
          console.log(`[CLIO IMPORT] Bank accounts fetched from Clio: ${bankAccounts.length}`);
          
          for (const acct of bankAccounts) {
            try {
              // Map Clio account_type to our types
              const accountType = acct.account_type?.toLowerCase()?.includes('operating') ? 'operating' : 'iolta';
              
              const result = await query(
                `INSERT INTO trust_accounts (firm_id, bank_name, account_name, account_type, balance, is_verified, created_at)
                 VALUES ($1, $2, $3, $4, $5, true, $6)
                 RETURNING id`,
                [
                  firmId,
                  acct.holder || 'Bank',
                  acct.name || 'Trust Account',
                  accountType,
                  parseFloat(acct.balance) || 0,
                  acct.created_at || new Date().toISOString()
                ]
              );
              
              trustAccountMap.set(`clio:${acct.id}`, result.rows[0].id);
              trustAccountsCount++;
            } catch (err) {
              // Skip duplicate accounts
            }
          }
          
          console.log(`[CLIO IMPORT] Trust accounts saved: ${trustAccountsCount}`);
          
          // Now fetch trust transactions if we have accounts
          if (trustAccountsCount > 0) {
            try {
              const transactions = await clioGetPaginated(accessToken, '/bank_transactions.json', {
                fields: 'id,date,amount,description,type,balance,bank_account{id},matter{id,display_number},contact{id,name},created_at'
              }, null);
              
              console.log(`[CLIO IMPORT] Bank transactions fetched from Clio: ${transactions.length}`);
              
              for (const tx of transactions) {
                try {
                  const trustAccountId = tx.bank_account?.id ? trustAccountMap.get(`clio:${tx.bank_account.id}`) : null;
                  if (!trustAccountId) continue;
                  
                  const matterId = tx.matter?.id ? matterIdMap.get(`clio:${tx.matter.id}`) : null;
                  const clientId = tx.contact?.id ? contactIdMap.get(`clio:${tx.contact.id}`) : null;
                  
                  // Map Clio type to our transaction types
                  let txType = 'deposit';
                  if (tx.type) {
                    const t = tx.type.toLowerCase();
                    if (t.includes('withdraw') || t.includes('disbursement') || t.includes('payment')) txType = 'withdrawal';
                    else if (t.includes('transfer')) txType = 'transfer';
                    else if (t.includes('interest')) txType = 'interest';
                    else if (t.includes('fee')) txType = 'fee';
                  }
                  
                  // Determine sign based on transaction type
                  let amount = parseFloat(tx.amount) || 0;
                  if (txType === 'withdrawal' && amount > 0) amount = -amount;
                  
                  await query(
                    `INSERT INTO trust_transactions (trust_account_id, client_id, matter_id, type, amount, description, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                      trustAccountId,
                      clientId,
                      matterId,
                      txType,
                      Math.abs(amount),
                      tx.description || 'Trust transaction from Clio',
                      tx.date || tx.created_at || new Date().toISOString()
                    ]
                  );
                  trustTransactionsCount++;
                } catch (err) {
                  // Skip errors
                }
              }
              
              console.log(`[CLIO IMPORT] Trust transactions saved: ${trustTransactionsCount}`);
              
            } catch (err) {
              console.log(`[CLIO IMPORT] Trust transactions error: ${err.message}`);
            }
          }
          
        } catch (err) {
          console.log(`[CLIO IMPORT] Trust accounts error (non-fatal): ${err.message}`);
        }
        
        // ============================================
        // STEP 10: ENHANCE INVOICES WITH LINE ITEMS
        // ============================================
        console.log('[CLIO IMPORT] Step 10/10: Fetching invoice line items...');
        let lineItemsCount = 0;
        
        try {
          // Fetch line items from Clio - these show what's on each bill
          const lineItems = await clioGetPaginated(accessToken, '/line_items.json', {
            fields: 'id,type,description,quantity,rate,total,date,bill{id,number},matter{id},activity{id,type},created_at'
          }, null);
          
          console.log(`[CLIO IMPORT] Line items fetched from Clio: ${lineItems.length}`);
          
          // Group line items by bill ID
          const billLineItems = new Map(); // clioId -> array of line items
          
          for (const li of lineItems) {
            if (!li.bill?.id) continue;
            
            const billId = String(li.bill.id);
            if (!billLineItems.has(billId)) {
              billLineItems.set(billId, []);
            }
            
            billLineItems.get(billId).push({
              type: li.type || 'time',
              description: li.description || '',
              quantity: parseFloat(li.quantity) || 0,
              rate: parseFloat(li.rate) || 0,
              total: parseFloat(li.total) || 0,
              date: li.date || null
            });
          }
          
          // Update invoices with line items
          const invoiceResults = await query('SELECT id, number FROM invoices WHERE firm_id = $1', [firmId]);
          
          for (const inv of invoiceResults.rows) {
            // Extract Clio ID from number format
            const parts = inv.number.split('-');
            const clioId = parts[parts.length - 1];
            
            const items = billLineItems.get(clioId);
            if (items && items.length > 0) {
              await query(
                'UPDATE invoices SET line_items = $1 WHERE id = $2',
                [JSON.stringify(items), inv.id]
              );
              lineItemsCount += items.length;
            }
          }
          
          console.log(`[CLIO IMPORT] Line items added to invoices: ${lineItemsCount}`);
          
        } catch (err) {
          console.log(`[CLIO IMPORT] Line items error (non-fatal): ${err.message}`);
        }
        
        // ============================================
        // STEP 11: DOCUMENTS - Fetch metadata and stream to Azure
        // ============================================
        // Features:
        // - If filterByUser is enabled, only gets documents for that user's matters
        // - Creates firm folder in Azure File Share automatically
        // - Streams directly from Clio to Azure (no disk)
        // - Preserves original filenames with extensions
        // ============================================
        let documentMetadataCount = 0;
        let documentsStreamedCount = 0;
        let documentsFailedCount = 0;
        
        if (!includeDocuments) {
          console.log('[CLIO IMPORT] Step 11: SKIPPING documents');
          updateProgress('documents', 'skipped', 0);
          addLog('📄 Skipping documents (not selected)');
        } else {
          console.log('[CLIO IMPORT] Step 11: Fetching and streaming documents from Clio to Azure...');
          updateProgress('documents', 'running', 0);
          
          try {
            // ============================================
            // 0. PRE-FLIGHT CHECK: Verify Clio token can access documents
            // ============================================
            addLog('🔍 Checking Clio document access...');
            try {
              const testDoc = await clioRequest(accessToken, '/documents.json', { limit: 1 });
              if (testDoc.data) {
                console.log(`[CLIO IMPORT] Clio document access OK - found ${testDoc.data.length} test doc(s)`);
                addLog('✅ Clio document access verified');
              }
            } catch (clioErr) {
              console.error('[CLIO IMPORT] Clio document access failed:', clioErr.message);
              addLog(`⚠️ Cannot access Clio documents: ${clioErr.message}`);
              addLog('ℹ️ Check if your Clio app has document permissions');
              updateProgress('documents', 'error', 0);
              throw new Error(`Clio document access failed: ${clioErr.message}`);
            }
            
            // ============================================
            // 1. ENSURE AZURE FIRM FOLDER EXISTS
            // ============================================
            // This creates firm-{firmId}/ folder in Azure File Share
            // Works for both new firms and existing firms
            const { ensureFirmFolder, isAzureConfigured, getAzureConfig } = await import('../utils/azureStorage.js');
            
            const azureConfigured = await isAzureConfigured();
            if (!azureConfigured) {
              addLog('⚠️ Azure Storage not configured - skipping document streaming');
              addLog('ℹ️ Configure Azure in Admin Portal → Platform Settings → Azure Storage');
              updateProgress('documents', 'skipped', 0);
            } else {
              // Log Azure config and firmId for debugging
              const azConfig = await getAzureConfig();
              // Use custom folder if specified, otherwise use default firm-{firmId}
              const targetFirmFolder = customFirmFolder || `firm-${firmId}`;
              console.log(`[CLIO IMPORT] *** Documents will be stored in: ${targetFirmFolder} ***`);
              console.log(`[CLIO IMPORT] *** Firm name: ${actualFirmName}, Firm ID: ${firmId} ***`);
              if (customFirmFolder) {
                console.log(`[CLIO IMPORT] *** Using CUSTOM folder override: ${customFirmFolder} ***`);
              }
              console.log(`[CLIO IMPORT] Azure configured: account=${azConfig?.accountName}, share=${azConfig?.shareName}`);
              addLog(`📁 Target folder: ${targetFirmFolder} (${actualFirmName})`);
              if (customFirmFolder) {
                addLog(`📁 Using custom folder: ${customFirmFolder}`);
              }
              addLog(`📁 Azure Storage: ${azConfig?.accountName}/${azConfig?.shareName}`);
              // Create firm folder in Azure (idempotent - safe to call multiple times)
              // If using custom folder, extract the firm ID from it or use the folder directly
              const folderFirmId = customFirmFolder ? customFirmFolder.replace(/^firm-/, '') : firmId;
              const folderResult = await ensureFirmFolder(folderFirmId);
              if (folderResult.success) {
                console.log(`[CLIO IMPORT] Azure firm folder ready: ${folderResult.path}`);
                addLog(`📁 Azure folder created/verified: ${folderResult.path}`);
              } else {
                console.error(`[CLIO IMPORT] Failed to create firm folder: ${folderResult.error}`);
                addLog(`⚠️ Failed to create firm folder: ${folderResult.error}`);
              }
              
              // ============================================
              // 2. BUILD MAPPING FROM CLIO IDs TO OUR IDs
              // ============================================
              const docMatterIdMap = new Map();
              for (const [key, value] of matterIdMap.entries()) {
                if (key.startsWith('clio:')) {
                  const clioId = parseInt(key.replace('clio:', ''));
                  docMatterIdMap.set(clioId, value);
                }
              }
              
              // ============================================
              // 3. FETCH DOCUMENTS FROM CLIO
              // ============================================
              // If user filter is active, only get documents for their matters
              let documentsToProcess = [];
              
              if (filterByUser && importedClioMatterIds.size > 0) {
                // USER FILTER ACTIVE: Only get documents for user's matters
                addLog(`📄 Fetching documents for ${importedClioMatterIds.size} matters (user filter active)...`);
                console.log(`[CLIO IMPORT] User filter: fetching docs for ${importedClioMatterIds.size} matters`);
                
                // Fetch documents by matter ID
                const matterIdArray = Array.from(importedClioMatterIds);
                for (let i = 0; i < matterIdArray.length; i += 10) {
                  const batchIds = matterIdArray.slice(i, i + 10);
                  
                  for (const matterId of batchIds) {
                    try {
                      const matterDocs = await clioGetPaginated(accessToken, '/documents.json', {
                        fields: 'id,name,filename,parent,matter,created_at,updated_at,content_type,latest_document_version{id,size,filename}',
                        matter_id: matterId,
                        order: 'id(asc)'
                      }, null);
                      
                      documentsToProcess.push(...matterDocs);
                    } catch (err) {
                      console.log(`[CLIO IMPORT] Could not fetch docs for matter ${matterId}: ${err.message}`);
                    }
                  }
                  
                  if (documentsToProcess.length > 0 && i % 50 === 0) {
                    addLog(`📄 Found ${documentsToProcess.length} documents so far...`);
                  }
                }
                
                addLog(`✅ Found ${documentsToProcess.length} documents for user's matters`);
              } else {
                // NO FILTER: Fetch all documents
                addLog('📄 Fetching all documents from Clio...');
                
                documentsToProcess = await clioGetPaginated(accessToken, '/documents.json', {
                  fields: 'id,name,filename,parent,matter,created_at,updated_at,content_type,latest_document_version{id,size,filename}',
                  order: 'id(asc)'
                }, (count) => {
                  if (count % 500 === 0) addLog(`📄 Fetched ${count} documents...`);
                  updateProgress('documents', 'running', count);
                });
                
                addLog(`✅ Found ${documentsToProcess.length} documents in Clio`);
              }
              
              console.log(`[CLIO IMPORT] Total documents to process: ${documentsToProcess.length}`);
              
              // ============================================
              // 4. FETCH FOLDERS FOR PATH RECONSTRUCTION
              // ============================================
              let folders = [];
              try {
                folders = await clioGetPaginated(accessToken, '/folders.json', {
                  fields: 'id,name,parent,matter',
                  order: 'id(asc)'
                }, null);
                console.log(`[CLIO IMPORT] Folder structure fetched: ${folders.length} folders`);
              } catch (folderErr) {
                console.log(`[CLIO IMPORT] Could not fetch folders: ${folderErr.message}`);
              }
              
              // Build folder path lookup
              const folderPathMap = new Map();
              const folderById = new Map();
              for (const f of folders) {
                folderById.set(f.id, f);
              }
              
              const buildFolderPath = (folderId, visited = new Set()) => {
                if (!folderId || visited.has(folderId)) return '';
                visited.add(folderId);
                const folder = folderById.get(folderId);
                if (!folder) return '';
                const parentPath = folder.parent?.id ? buildFolderPath(folder.parent.id, visited) : '';
                return parentPath ? `${parentPath}/${folder.name}` : folder.name;
              };
              
              // Store folders in manifest
              for (const f of folders) {
                const path = buildFolderPath(f.id);
                folderPathMap.set(f.id, path);
                try {
                  const matterIdForFolder = f.matter?.id ? docMatterIdMap.get(f.matter.id) : null;
                  await query(
                    `INSERT INTO clio_folder_manifest (firm_id, clio_id, clio_parent_id, clio_matter_id, name, full_path, matter_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (firm_id, clio_id) DO UPDATE SET name = EXCLUDED.name, full_path = EXCLUDED.full_path, matter_id = EXCLUDED.matter_id`,
                    [firmId, f.id, f.parent?.id || null, f.matter?.id || null, f.name, path, matterIdForFolder]
                  );
                } catch (err) { /* Skip */ }
              }
              
              // ============================================
              // 5. STORE DOCUMENT METADATA IN MANIFEST
              // ============================================
              addLog('📄 Storing document metadata...');
              for (const doc of documentsToProcess) {
                try {
                  const folderPath = doc.parent?.id ? folderPathMap.get(doc.parent.id) : '';
                  const originalFilename = doc.latest_document_version?.filename || doc.filename || doc.name;
                  const fullPath = folderPath ? `${folderPath}/${originalFilename}` : originalFilename;
                  const matterIdForDoc = doc.matter?.id ? docMatterIdMap.get(doc.matter.id) : null;
                  const fileSize = doc.latest_document_version?.size || null;
                  
                  await query(
                    `INSERT INTO clio_document_manifest 
                      (firm_id, clio_id, clio_matter_id, clio_folder_id, name, clio_path, content_type, size, 
                       matter_id, clio_created_at, clio_updated_at, match_status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
                     ON CONFLICT (firm_id, clio_id) DO UPDATE SET
                       name = EXCLUDED.name, clio_path = EXCLUDED.clio_path, content_type = EXCLUDED.content_type,
                       size = EXCLUDED.size, matter_id = EXCLUDED.matter_id, match_status = 'pending', updated_at = NOW()`,
                    [firmId, doc.id, doc.matter?.id || null, doc.parent?.id || null, originalFilename, fullPath, 
                     doc.content_type || null, fileSize, matterIdForDoc, doc.created_at || null, doc.updated_at || null]
                  );
                  documentMetadataCount++;
                } catch (err) {
                  if (!err.message.includes('duplicate')) {
                    console.log(`[CLIO IMPORT] Document manifest error: ${err.message}`);
                  }
                }
              }
              
              addLog(`✅ Stored ${documentMetadataCount} documents in manifest`);
              
              // ============================================
              // 6. STREAM DOCUMENTS TO AZURE
              // ============================================
              addLog('📤 Streaming documents from Clio to Azure (no local disk)...');
              console.log('[CLIO IMPORT] Starting document streaming to Azure...');
              
              // Get pending documents from manifest
              const pendingDocs = await query(`
                SELECT * FROM clio_document_manifest 
                WHERE firm_id = $1 AND match_status = 'pending'
                ORDER BY clio_id
              `, [firmId]);
              
              const totalDocs = pendingDocs.rows.length;
              console.log(`[CLIO IMPORT] ${totalDocs} documents to stream`);
              
              if (totalDocs === 0) {
                addLog('ℹ️ No pending documents to stream');
              } else {
                addLog(`📤 Starting to stream ${totalDocs} documents to Azure...`);
                
                // Track errors for summary
                const errorDetails = [];
                
                // Stream documents in batches of 50 (Clio rate limit)
                const BATCH_SIZE = 50;
                for (let i = 0; i < totalDocs; i += BATCH_SIZE) {
                  const batch = pendingDocs.rows.slice(i, i + BATCH_SIZE);
                  
                  // Process batch concurrently - each document streams directly to Azure
                  await Promise.all(batch.map(async (manifest) => {
                    try {
                      const streamResult = await streamDocumentToAzure(accessToken, manifest, firmId, {
                        matterIdMap: docMatterIdMap,
                        customFirmFolder: customFirmFolder || null
                      });
                      
                      if (streamResult.success) {
                        documentsStreamedCount++;
                      } else {
                        documentsFailedCount++;
                        errorDetails.push({ name: manifest.name, error: streamResult.error || 'Unknown error' });
                      }
                    } catch (err) {
                      documentsFailedCount++;
                      errorDetails.push({ name: manifest.name, error: err.message });
                    }
                  }));
                  
                  // Progress update
                  const processed = Math.min(i + BATCH_SIZE, totalDocs);
                  updateProgress('documents', 'running', documentsStreamedCount);
                  addLog(`📤 Progress: ${documentsStreamedCount}/${totalDocs} streamed, ${documentsFailedCount} failed`);
                }
                
                // Log error summary if there were failures
                if (errorDetails.length > 0 && errorDetails.length <= 10) {
                  addLog(`⚠️ Failed documents:`);
                  errorDetails.forEach(e => addLog(`   - ${e.name}: ${e.error}`));
                } else if (errorDetails.length > 10) {
                  addLog(`⚠️ First 5 errors:`);
                  errorDetails.slice(0, 5).forEach(e => addLog(`   - ${e.name}: ${e.error}`));
                  addLog(`   ... and ${errorDetails.length - 5} more`);
                }
              }
              
              // Final status
              updateProgress('documents', 'completed', documentsStreamedCount);
              console.log(`[CLIO IMPORT] Documents complete: ${documentsStreamedCount} streamed, ${documentsFailedCount} failed`);
              console.log(`[CLIO IMPORT] *** Documents stored in Azure folder: firm-${firmId} ***`);
              addLog(`✅ Documents: ${documentsStreamedCount} streamed to Azure, ${documentsFailedCount} failed`);
              addLog(`📂 Location: Azure File Share → firm-${firmId}/`);
              
              if (documentsFailedCount > 0) {
                addLog(`⚠️ ${documentsFailedCount} failed - retry from Firm Documents tab`);
              }
            }
            
          } catch (err) {
            console.log(`[CLIO IMPORT] Document streaming error: ${err.message}`);
            addLog(`⚠️ Document streaming error: ${err.message}`);
            updateProgress('documents', 'error', documentsStreamedCount);
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
            notes: notesCount,
            tasks: tasksCount,
            activityCodes: activityCodesCount,
            payments: paymentsCount,
            trustAccounts: trustAccountsCount,
            trustTransactions: trustTransactionsCount,
            lineItems: lineItemsCount,
            documentMetadata: documentMetadataCount,
            documentsStreamed: documentsStreamedCount,
            documentsFailed: documentsFailedCount,
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

// ============================================
// SCAN AZURE FILE SHARE - Auto-match files to matters
// Use this after dragging Clio Drive files into Azure
// ============================================
router.post('/documents/scan-azure', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.body;
    
    if (!firmId) {
      return res.status(400).json({ error: 'firmId required' });
    }
    
    console.log(`[SCAN] Starting Azure scan for firm ${firmId}`);
    
    // Import Azure utilities
    const { listFiles, isAzureConfigured, getShareClient, ensureDirectory } = await import('../utils/azureStorage.js');
    const path = await import('path');
    
    const azureEnabled = await isAzureConfigured();
    if (!azureEnabled) {
      return res.status(400).json({ 
        error: 'Azure Storage not configured',
        message: 'Configure Azure Storage in Admin Portal → Settings first'
      });
    }
    
    // Get share client
    const shareClient = await getShareClient();
    const firmFolder = `firm-${firmId}`;
    
    // Load matters and clients for matching
    const mattersResult = await query(
      `SELECT id, name, number FROM matters WHERE firm_id = $1`,
      [firmId]
    );
    const matters = mattersResult.rows;
    
    const clientsResult = await query(
      `SELECT id, name, display_name FROM clients WHERE firm_id = $1`,
      [firmId]
    );
    const clients = clientsResult.rows;
    
    console.log(`[SCAN] Loaded ${matters.length} matters, ${clients.length} clients`);
    
    // Scan Azure directory recursively
    async function scanDirectory(dirClient, basePath = '') {
      const files = [];
      try {
        for await (const item of dirClient.listFilesAndDirectories()) {
          const itemPath = basePath ? `${basePath}/${item.name}` : item.name;
          
          if (item.kind === 'directory') {
            const subDirClient = dirClient.getDirectoryClient(item.name);
            const subFiles = await scanDirectory(subDirClient, itemPath);
            files.push(...subFiles);
          } else {
            // Get file properties for size/etag
            try {
              const fileClient = dirClient.getFileClient(item.name);
              const props = await fileClient.getProperties();
              files.push({
                name: item.name,
                path: itemPath,
                folder: basePath,
                size: props.contentLength,
                etag: props.etag,
                lastModified: props.lastModified
              });
            } catch (e) {
              files.push({ name: item.name, path: itemPath, folder: basePath, size: 0 });
            }
          }
        }
      } catch (err) {
        console.log(`[SCAN] Error scanning ${basePath}: ${err.message}`);
      }
      return files;
    }
    
    // Match folder path to matter
    function matchFolder(folderPath) {
      if (!folderPath) return { matterId: null, clientId: null };
      
      const parts = folderPath.split('/').filter(p => p);
      const skipFolders = ['matters', 'clients', 'documents', 'files', 'general', 'firm', 'clio', 'clio drive'];
      
      for (const part of parts) {
        if (skipFolders.includes(part.toLowerCase())) continue;
        
        // Match "MatterNumber - MatterName" or "ClientName - MatterName"
        if (part.includes(' - ')) {
          const [prefix, suffix] = part.split(' - ').map(s => s.trim());
          
          // Try matter number first
          const byNumber = matters.find(m => 
            m.number && m.number.toLowerCase() === prefix.toLowerCase()
          );
          if (byNumber) return { matterId: byNumber.id, clientId: null };
          
          // Try matter name
          const byName = matters.find(m =>
            m.name && m.name.toLowerCase().includes(suffix.toLowerCase())
          );
          if (byName) return { matterId: byName.id, clientId: null };
        }
        
        // Try direct matter number match
        const directMatch = matters.find(m => 
          m.number && part.toLowerCase().includes(m.number.toLowerCase())
        );
        if (directMatch) return { matterId: directMatch.id, clientId: null };
        
        // Try matter-{id} folder pattern (already organized)
        const matterIdMatch = part.match(/^matter-([a-f0-9-]+)$/i);
        if (matterIdMatch) {
          const m = matters.find(m => m.id === matterIdMatch[1]);
          if (m) return { matterId: m.id, clientId: null };
        }
      }
      
      return { matterId: null, clientId: null };
    }
    
    // Get MIME type from extension
    function getMimeType(filename) {
      const ext = (filename.split('.').pop() || '').toLowerCase();
      const types = {
        pdf: 'application/pdf',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ppt: 'application/vnd.ms-powerpoint',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        txt: 'text/plain',
        jpg: 'image/jpeg', jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        zip: 'application/zip',
        msg: 'application/vnd.ms-outlook',
        eml: 'message/rfc822'
      };
      return types[ext] || 'application/octet-stream';
    }
    
    // Start scan
    const dirClient = shareClient.getDirectoryClient(firmFolder);
    const allFiles = await scanDirectory(dirClient, '');
    
    console.log(`[SCAN] Found ${allFiles.length} files`);
    
    const results = {
      scanned: allFiles.length,
      created: 0,
      updated: 0,
      matched: 0,
      unmatched: 0,
      errors: []
    };
    
    for (const file of allFiles) {
      try {
        // Check if exists
        const existing = await query(
          `SELECT id, matter_id, size, external_etag FROM documents 
           WHERE firm_id = $1 AND external_path = $2`,
          [firmId, file.path]
        );
        
        const { matterId } = matchFolder(file.folder);
        if (matterId) results.matched++;
        else results.unmatched++;
        
        if (existing.rows.length > 0) {
          const doc = existing.rows[0];
          // Update if matter changed or file changed
          if ((!doc.matter_id && matterId) || file.etag !== doc.external_etag) {
            await query(
              `UPDATE documents SET 
                matter_id = COALESCE($1, matter_id),
                size = $2,
                external_etag = $3,
                updated_at = NOW()
               WHERE id = $4`,
              [matterId, file.size, file.etag, doc.id]
            );
            results.updated++;
          }
        } else {
          // Create new record
          await query(
            `INSERT INTO documents (
              firm_id, matter_id, name, original_name, path, folder_path,
              type, size, external_path, external_etag, external_modified_at,
              privacy_level, status, storage_location
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
              firmId,
              matterId,
              file.name,
              file.name,
              file.path,
              file.folder,
              getMimeType(file.name),
              file.size || 0,
              file.path,
              file.etag,
              file.lastModified,
              matterId ? 'team' : 'firm',
              'final',
              'azure'
            ]
          );
          results.created++;
        }
      } catch (err) {
        results.errors.push({ path: file.path, error: err.message });
      }
    }
    
    console.log(`[SCAN] Complete: ${results.created} created, ${results.updated} updated, ${results.matched} matched`);
    
    res.json({
      success: true,
      ...results,
      message: `Scanned ${results.scanned} files: ${results.created} new, ${results.updated} updated, ${results.matched} matched to matters`
    });
    
  } catch (error) {
    console.error('Azure scan error:', error);
    res.status(500).json({ error: 'Failed to scan Azure: ' + error.message });
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

// ============================================
// CLIO DOCUMENT MANIFEST MATCHING
// ============================================

// Get document manifest status for a firm
router.get('/documents/manifest/:firmId', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    
    // Get manifest stats
    const stats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN match_status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN match_status = 'matched' THEN 1 END) as matched,
        COUNT(CASE WHEN match_status = 'imported' THEN 1 END) as imported,
        COUNT(CASE WHEN match_status = 'missing' THEN 1 END) as missing,
        COUNT(CASE WHEN matter_id IS NOT NULL THEN 1 END) as linked_to_matter
      FROM clio_document_manifest
      WHERE firm_id = $1
    `, [firmId]);
    
    // Get sample of pending documents
    const pending = await query(`
      SELECT clio_id, name, clio_path, content_type, size, matter_id
      FROM clio_document_manifest
      WHERE firm_id = $1 AND match_status = 'pending'
      ORDER BY name
      LIMIT 50
    `, [firmId]);
    
    res.json({
      success: true,
      stats: stats.rows[0],
      pendingSample: pending.rows
    });
  } catch (error) {
    console.error('Get manifest error:', error);
    res.status(500).json({ error: 'Failed to get manifest: ' + error.message });
  }
});

// Match Azure files to Clio document manifest
router.post('/documents/match-manifest', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.body;
    
    if (!firmId) {
      return res.status(400).json({ error: 'firmId required' });
    }
    
    console.log(`[DOC MATCH] Starting manifest matching for firm ${firmId}`);
    
    // Import Azure storage utilities
    const { listFilesRecursive, isAzureConfigured } = await import('../utils/azureStorage.js');
    
    const azureConfigured = await isAzureConfigured();
    if (!azureConfigured) {
      return res.status(400).json({ error: 'Azure Storage not configured' });
    }
    
    // Get all files from Azure for this firm
    const firmPath = `firm-${firmId}`;
    let azureFiles = [];
    try {
      azureFiles = await listFilesRecursive(firmPath);
      console.log(`[DOC MATCH] Found ${azureFiles.length} files in Azure`);
    } catch (err) {
      console.log(`[DOC MATCH] Could not list Azure files: ${err.message}`);
      return res.status(400).json({ error: 'Could not access Azure storage: ' + err.message });
    }
    
    // Build filename lookup map
    const filesByName = new Map();
    const filesByPath = new Map();
    for (const file of azureFiles) {
      const name = file.name.split('/').pop().toLowerCase();
      if (!filesByName.has(name)) {
        filesByName.set(name, []);
      }
      filesByName.get(name).push(file);
      filesByPath.set(file.name.toLowerCase(), file);
    }
    
    // Get all pending documents from manifest
    const pendingDocs = await query(`
      SELECT id, clio_id, name, clio_path, size
      FROM clio_document_manifest
      WHERE firm_id = $1 AND match_status = 'pending'
    `, [firmId]);
    
    console.log(`[DOC MATCH] Matching ${pendingDocs.rows.length} pending documents`);
    
    const results = {
      matched: 0,
      missing: 0,
      errors: 0
    };
    
    for (const doc of pendingDocs.rows) {
      try {
        const docNameLower = doc.name.toLowerCase();
        let matchedFile = null;
        let matchMethod = null;
        let confidence = 0;
        
        // Method 1: Exact path match
        if (doc.clio_path) {
          const pathVariants = [
            doc.clio_path.toLowerCase(),
            `${firmPath}/${doc.clio_path}`.toLowerCase(),
            `${firmPath}/documents/${doc.clio_path}`.toLowerCase()
          ];
          for (const pathVar of pathVariants) {
            if (filesByPath.has(pathVar)) {
              matchedFile = filesByPath.get(pathVar);
              matchMethod = 'exact_path';
              confidence = 100;
              break;
            }
          }
        }
        
        // Method 2: Filename match
        if (!matchedFile && filesByName.has(docNameLower)) {
          const candidates = filesByName.get(docNameLower);
          if (candidates.length === 1) {
            matchedFile = candidates[0];
            matchMethod = 'filename_unique';
            confidence = 90;
          } else {
            // Multiple files with same name - try to match by size
            if (doc.size) {
              const sizeMatch = candidates.find(f => f.size === doc.size);
              if (sizeMatch) {
                matchedFile = sizeMatch;
                matchMethod = 'filename_size';
                confidence = 85;
              }
            }
            // If still no match, take first one but lower confidence
            if (!matchedFile) {
              matchedFile = candidates[0];
              matchMethod = 'filename_first';
              confidence = 60;
            }
          }
        }
        
        // Update manifest with match result
        if (matchedFile) {
          await query(`
            UPDATE clio_document_manifest
            SET match_status = 'matched',
                matched_azure_path = $1,
                match_confidence = $2,
                match_method = $3,
                updated_at = NOW()
            WHERE id = $4
          `, [matchedFile.name, confidence, matchMethod, doc.id]);
          results.matched++;
        } else {
          await query(`
            UPDATE clio_document_manifest
            SET match_status = 'missing',
                updated_at = NOW()
            WHERE id = $1
          `, [doc.id]);
          results.missing++;
        }
      } catch (err) {
        console.log(`[DOC MATCH] Error matching ${doc.name}: ${err.message}`);
        results.errors++;
      }
    }
    
    console.log(`[DOC MATCH] Complete: ${results.matched} matched, ${results.missing} missing, ${results.errors} errors`);
    
    res.json({
      success: true,
      results,
      message: `Matched ${results.matched} documents. ${results.missing} files not found in Azure (copy them from Clio Drive).`
    });
  } catch (error) {
    console.error('Match manifest error:', error);
    res.status(500).json({ error: 'Failed to match manifest: ' + error.message });
  }
});

// Import matched documents into documents table
router.post('/documents/import-matched', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.body;
    
    if (!firmId) {
      return res.status(400).json({ error: 'firmId required' });
    }
    
    console.log(`[DOC IMPORT] Importing matched documents for firm ${firmId}`);
    
    // Get all matched documents
    const matchedDocs = await query(`
      SELECT m.*, mat.number as matter_number
      FROM clio_document_manifest m
      LEFT JOIN matters mat ON m.matter_id = mat.id
      WHERE m.firm_id = $1 AND m.match_status = 'matched'
    `, [firmId]);
    
    console.log(`[DOC IMPORT] Found ${matchedDocs.rows.length} matched documents to import`);
    
    const results = {
      imported: 0,
      skipped: 0,
      errors: 0
    };
    
    for (const doc of matchedDocs.rows) {
      try {
        // Check if document already exists
        const existing = await query(
          'SELECT id FROM documents WHERE firm_id = $1 AND path = $2',
          [firmId, doc.matched_azure_path]
        );
        
        if (existing.rows.length > 0) {
          // Update manifest to point to existing document
          await query(`
            UPDATE clio_document_manifest
            SET match_status = 'imported',
                matched_document_id = $1,
                updated_at = NOW()
            WHERE id = $2
          `, [existing.rows[0].id, doc.id]);
          results.skipped++;
          continue;
        }
        
        // Create document record
        const docResult = await query(`
          INSERT INTO documents (
            firm_id, matter_id, client_id, name, original_name, type, size, path,
            owner_id, uploaded_by, privacy_level, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, 'team', 'final')
          RETURNING id
        `, [
          firmId,
          doc.matter_id,
          doc.client_id,
          doc.name,
          doc.name,
          doc.content_type,
          doc.size,
          doc.matched_azure_path,
          doc.owner_id
        ]);
        
        // Update manifest
        await query(`
          UPDATE clio_document_manifest
          SET match_status = 'imported',
              matched_document_id = $1,
              updated_at = NOW()
          WHERE id = $2
        `, [docResult.rows[0].id, doc.id]);
        
        results.imported++;
        
        if (results.imported % 100 === 0) {
          console.log(`[DOC IMPORT] Imported ${results.imported} documents...`);
        }
      } catch (err) {
        console.log(`[DOC IMPORT] Error importing ${doc.name}: ${err.message}`);
        results.errors++;
      }
    }
    
    console.log(`[DOC IMPORT] Complete: ${results.imported} imported, ${results.skipped} skipped, ${results.errors} errors`);
    
    res.json({
      success: true,
      results,
      message: `Imported ${results.imported} documents into the system.`
    });
  } catch (error) {
    console.error('Import matched error:', error);
    res.status(500).json({ error: 'Failed to import matched documents: ' + error.message });
  }
});

// ============================================
// CLIO DOCUMENT STREAMING MIGRATION
// ============================================
// Stream documents directly from Clio API to Azure Storage
// No local disk storage - pure memory streaming!

// Get document streaming migration status
router.get('/documents/stream-status/:firmId', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    
    const status = await getDocumentMigrationStatus(firmId);
    
    // Get recent errors
    const recentErrors = await query(`
      SELECT clio_id, name, clio_path, updated_at
      FROM clio_document_manifest
      WHERE firm_id = $1 AND match_status = 'error'
      ORDER BY updated_at DESC
      LIMIT 10
    `, [firmId]);
    
    // Get sample of successfully imported documents to show paths
    const recentImports = await query(`
      SELECT clio_id, name, matched_azure_path, updated_at
      FROM clio_document_manifest
      WHERE firm_id = $1 AND match_status = 'imported'
      ORDER BY updated_at DESC
      LIMIT 5
    `, [firmId]);
    
    // Check actual documents table to confirm storage
    const documentsInDb = await query(`
      SELECT COUNT(*) as count, 
             COUNT(CASE WHEN external_path LIKE 'firm-%' THEN 1 END) as azure_count
      FROM documents
      WHERE firm_id = $1 AND storage_location = 'azure'
    `, [firmId]);
    
    // Get firm name for display
    const firmResult = await query('SELECT name FROM firms WHERE id = $1', [firmId]);
    const firmName = firmResult.rows[0]?.name || 'Unknown';
    
    // Get Azure config to show the full storage location
    const { getAzureConfig } = await import('../utils/azureStorage.js');
    const azureConfig = await getAzureConfig();
    
    res.json({
      success: true,
      status,
      firmInfo: {
        id: firmId,
        name: firmName,
        azureFolder: `firm-${firmId}`
      },
      azureStorage: azureConfig ? {
        account: azureConfig.accountName,
        share: azureConfig.shareName,
        fullPath: `\\\\${azureConfig.accountName}.file.core.windows.net\\${azureConfig.shareName}\\firm-${firmId}`
      } : null,
      documentsInDb: {
        total: parseInt(documentsInDb.rows[0]?.count) || 0,
        azureCount: parseInt(documentsInDb.rows[0]?.azure_count) || 0
      },
      recentErrors: recentErrors.rows,
      recentImports: recentImports.rows
    });
  } catch (error) {
    console.error('Get stream status error:', error);
    res.status(500).json({ error: 'Failed to get status: ' + error.message });
  }
});

// Fetch document metadata from Clio and populate manifest
// This prepares documents for streaming without downloading
router.post('/documents/fetch-manifest', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId, connectionId } = req.body;
    
    if (!firmId || !connectionId) {
      return res.status(400).json({ error: 'firmId and connectionId required' });
    }
    
    // Get Clio access token from connection
    const connection = clioConnections.get(connectionId);
    if (!connection) {
      return res.status(401).json({ error: 'Clio connection not found. Please reconnect.' });
    }
    
    console.log(`[DOC STREAM] Fetching document manifest for firm ${firmId}...`);
    
    // Build matter ID mapping if we have migrated matters
    const matterIdMap = new Map();
    try {
      const matters = await query(
        `SELECT id, clio_id FROM matters WHERE firm_id = $1 AND clio_id IS NOT NULL`,
        [firmId]
      );
      for (const m of matters.rows) {
        matterIdMap.set(m.clio_id, m.id);
      }
      console.log(`[DOC STREAM] Loaded ${matterIdMap.size} matter mappings`);
    } catch (e) {
      console.log(`[DOC STREAM] Could not load matter mappings: ${e.message}`);
    }
    
    const result = await fetchDocumentManifestFromClio(connection.accessToken, firmId, {
      matterIdMap,
      onProgress: (progress) => {
        console.log(`[DOC STREAM] Progress: ${JSON.stringify(progress)}`);
      }
    });
    
    res.json({
      success: true,
      message: `Fetched ${result.documentsFound} documents and ${result.foldersFound} folders from Clio.`,
      ...result
    });
  } catch (error) {
    console.error('Fetch manifest error:', error);
    res.status(500).json({ error: 'Failed to fetch manifest: ' + error.message });
  }
});

// Stream documents from Clio directly to Azure
// This downloads files from Clio and uploads to Azure using memory only
router.post('/documents/stream-to-azure', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId, connectionId, batchSize = 5, limit = null, customFirmFolder = null } = req.body;
    
    if (!firmId || !connectionId) {
      return res.status(400).json({ error: 'firmId and connectionId required' });
    }
    
    // Log if custom folder is specified
    if (customFirmFolder) {
      console.log(`[DOC STREAM] Using custom Azure folder: ${customFirmFolder}`);
    }
    
    // Get Clio access token from connection
    const connection = clioConnections.get(connectionId);
    if (!connection) {
      return res.status(401).json({ error: 'Clio connection not found. Please reconnect.' });
    }
    
    console.log(`[DOC STREAM] Starting document streaming for firm ${firmId}...`);
    
    // Build ID mappings from previous migration
    const matterIdMap = new Map();
    const clientIdMap = new Map();
    const userIdMap = new Map();
    
    try {
      const matters = await query(`SELECT id, clio_id FROM matters WHERE firm_id = $1 AND clio_id IS NOT NULL`, [firmId]);
      for (const m of matters.rows) matterIdMap.set(m.clio_id, m.id);
      
      const clients = await query(`SELECT id, clio_id FROM clients WHERE firm_id = $1 AND clio_id IS NOT NULL`, [firmId]);
      for (const c of clients.rows) clientIdMap.set(c.clio_id, c.id);
      
      const users = await query(`SELECT id, clio_id FROM users WHERE firm_id = $1 AND clio_id IS NOT NULL`, [firmId]);
      for (const u of users.rows) userIdMap.set(u.clio_id, u.id);
      
      console.log(`[DOC STREAM] Loaded mappings: ${matterIdMap.size} matters, ${clientIdMap.size} clients, ${userIdMap.size} users`);
    } catch (e) {
      console.log(`[DOC STREAM] Could not load some mappings: ${e.message}`);
    }
    
    const result = await batchStreamDocuments(connection.accessToken, firmId, {
      batchSize: Math.min(batchSize, 50),  // Cap at 50 - Clio's concurrent limit
      limit: limit || null,
      matterIdMap,
      clientIdMap,
      userIdMap,
      customFirmFolder,  // Pass custom folder if specified
      onProgress: (progress) => {
        console.log(`[DOC STREAM] Progress: ${progress.processed}/${progress.total} (${progress.success} success, ${progress.failed} failed)`);
      }
    });
    
    res.json({
      success: true,
      message: `Streamed ${result.success} documents to Azure. ${result.failed} failed.`,
      ...result
    });
  } catch (error) {
    console.error('Stream to Azure error:', error);
    res.status(500).json({ error: 'Failed to stream documents: ' + error.message });
  }
});

// Stream a single document (for testing or retrying)
router.post('/documents/stream-single', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId, connectionId, clioDocumentId } = req.body;
    
    if (!firmId || !connectionId || !clioDocumentId) {
      return res.status(400).json({ error: 'firmId, connectionId, and clioDocumentId required' });
    }
    
    const connection = clioConnections.get(connectionId);
    if (!connection) {
      return res.status(401).json({ error: 'Clio connection not found. Please reconnect.' });
    }
    
    // Get the manifest entry
    const manifestResult = await query(`
      SELECT * FROM clio_document_manifest
      WHERE firm_id = $1 AND clio_id = $2
    `, [firmId, clioDocumentId]);
    
    if (manifestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found in manifest' });
    }
    
    const manifest = manifestResult.rows[0];
    
    const result = await streamDocumentToAzure(connection.accessToken, manifest, firmId);
    
    res.json({
      success: result.success,
      message: result.success ? `Streamed ${manifest.name} to Azure` : `Failed: ${result.error}`,
      ...result
    });
  } catch (error) {
    console.error('Stream single error:', error);
    res.status(500).json({ error: 'Failed to stream document: ' + error.message });
  }
});

// Reset failed documents to pending for retry
router.post('/documents/reset-failed', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.body;
    
    if (!firmId) {
      return res.status(400).json({ error: 'firmId required' });
    }
    
    const result = await query(`
      UPDATE clio_document_manifest
      SET match_status = 'pending', updated_at = NOW()
      WHERE firm_id = $1 AND match_status = 'error'
      RETURNING clio_id, name
    `, [firmId]);
    
    res.json({
      success: true,
      reset: result.rows.length,
      message: `Reset ${result.rows.length} failed documents to pending.`
    });
  } catch (error) {
    console.error('Reset failed error:', error);
    res.status(500).json({ error: 'Failed to reset documents: ' + error.message });
  }
});

// Get document permissions mapping info
router.get('/documents/permissions-info/:firmId', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.params;
    
    // Get permission stats
    const docStats = await query(`
      SELECT 
        privacy_level,
        COUNT(*) as count
      FROM documents
      WHERE firm_id = $1
      GROUP BY privacy_level
    `, [firmId]);
    
    const permStats = await query(`
      SELECT 
        permission_level,
        COUNT(*) as count
      FROM document_permissions
      WHERE firm_id = $1
      GROUP BY permission_level
    `, [firmId]);
    
    const ownerStats = await query(`
      SELECT 
        COUNT(CASE WHEN owner_id IS NOT NULL THEN 1 END) as with_owner,
        COUNT(CASE WHEN owner_id IS NULL THEN 1 END) as without_owner
      FROM documents
      WHERE firm_id = $1
    `, [firmId]);
    
    res.json({
      success: true,
      privacyLevels: docStats.rows.reduce((acc, r) => { acc[r.privacy_level] = parseInt(r.count); return acc; }, {}),
      permissionLevels: permStats.rows.reduce((acc, r) => { acc[r.permission_level] = parseInt(r.count); return acc; }, {}),
      ownershipStats: ownerStats.rows[0]
    });
  } catch (error) {
    console.error('Get permissions info error:', error);
    res.status(500).json({ error: 'Failed to get permissions info: ' + error.message });
  }
});

// Bulk update document permissions based on matter assignments
router.post('/documents/sync-permissions', requireSecureAdmin, async (req, res) => {
  try {
    const { firmId } = req.body;
    
    if (!firmId) {
      return res.status(400).json({ error: 'firmId required' });
    }
    
    console.log(`[DOC PERM] Syncing document permissions for firm ${firmId}...`);
    
    // Update privacy level based on matter assignment
    // Documents linked to matters get 'team' access
    // Documents not linked get 'firm' access
    const updateResult = await query(`
      UPDATE documents
      SET privacy_level = CASE 
        WHEN matter_id IS NOT NULL THEN 'team'
        ELSE 'firm'
      END,
      updated_at = NOW()
      WHERE firm_id = $1
      RETURNING id, matter_id, privacy_level
    `, [firmId]);
    
    // For documents with owners, ensure owner has full permissions
    const ownerDocs = await query(`
      SELECT d.id, d.owner_id, d.firm_id
      FROM documents d
      WHERE d.firm_id = $1 AND d.owner_id IS NOT NULL
    `, [firmId]);
    
    let permissionsCreated = 0;
    for (const doc of ownerDocs.rows) {
      try {
        await query(`
          INSERT INTO document_permissions (
            document_id, firm_id, user_id, permission_level,
            can_view, can_download, can_edit, can_delete, can_share, can_manage_permissions
          ) VALUES ($1, $2, $3, 'full', true, true, true, true, true, true)
          ON CONFLICT DO NOTHING
        `, [doc.id, doc.firm_id, doc.owner_id]);
        permissionsCreated++;
      } catch (e) {
        // Skip errors
      }
    }
    
    console.log(`[DOC PERM] Updated ${updateResult.rows.length} documents, created ${permissionsCreated} owner permissions`);
    
    res.json({
      success: true,
      documentsUpdated: updateResult.rows.length,
      permissionsCreated,
      message: `Updated privacy for ${updateResult.rows.length} documents and created ${permissionsCreated} owner permissions.`
    });
  } catch (error) {
    console.error('Sync permissions error:', error);
    res.status(500).json({ error: 'Failed to sync permissions: ' + error.message });
  }
});

export default router;
