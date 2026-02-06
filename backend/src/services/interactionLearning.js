/**
 * Interaction Learning Service
 * 
 * Learns from how users interact with the software itself (not the AI).
 * This fills the gap between:
 * - Document learning (learns from document content)
 * - Manual learning (learns from CRUD actions like creating time entries)
 * - AI task learning (learns from AI task execution)
 * 
 * This module tracks:
 * - Page navigation patterns (which sections the user works in most)
 * - Feature usage frequency (which tools they rely on)
 * - Search patterns (what they search for, how they filter)
 * - Workflow sequences (what they do after what)
 * - Time-of-day patterns (when they do certain types of work)
 * - Sort/filter preferences (how they organize their views)
 * 
 * PRIVACY: All data is scoped to (firm_id, user_id) and never shared
 * between users. Firm-level patterns are aggregated and anonymized.
 * 
 * MEMORY MANAGEMENT: Uses the same bounded patterns as other learning
 * systems - upsert with occurrence counting, confidence caps, and
 * TTL-based caching.
 */

import { query } from '../db/connection.js';

// In-memory buffer to batch DB writes (avoids per-click DB calls)
const interactionBuffer = new Map(); // key: `${firmId}:${userId}` -> interactions[]
const FLUSH_INTERVAL_MS = 30000; // Flush every 30 seconds
const MAX_BUFFER_SIZE = 50; // Flush if buffer exceeds 50 items per user

// In-memory cache for user interaction profiles
const profileCache = new Map();
const PROFILE_CACHE_TTL_MS = 600000; // 10 minutes

// Start periodic flush
let flushInterval = null;

function startFlushInterval() {
  if (!flushInterval) {
    flushInterval = setInterval(flushAllBuffers, FLUSH_INTERVAL_MS);
    // Don't prevent process exit
    if (flushInterval.unref) flushInterval.unref();
  }
}

/**
 * Record a user interaction event
 * 
 * Called from the frontend via POST /api/ai/interactions
 * Batched in memory and flushed periodically to avoid DB pressure.
 * 
 * @param {string} firmId 
 * @param {string} userId 
 * @param {Object} interaction - { type, category, detail, metadata }
 */
export function recordInteraction(firmId, userId, interaction) {
  const key = `${firmId}:${userId}`;
  
  if (!interactionBuffer.has(key)) {
    interactionBuffer.set(key, []);
  }
  
  const buffer = interactionBuffer.get(key);
  buffer.push({
    ...interaction,
    timestamp: new Date().toISOString(),
  });
  
  // Flush if buffer is full
  if (buffer.length >= MAX_BUFFER_SIZE) {
    flushBuffer(firmId, userId).catch(err => {
      console.error('[InteractionLearning] Flush error:', err.message);
    });
  }
  
  // Ensure flush interval is running
  startFlushInterval();
}

/**
 * Flush all buffered interactions to the database
 */
async function flushAllBuffers() {
  for (const [key, interactions] of interactionBuffer.entries()) {
    if (interactions.length === 0) continue;
    
    const [firmId, userId] = key.split(':');
    try {
      await processInteractionBatch(firmId, userId, interactions);
    } catch (err) {
      console.error(`[InteractionLearning] Batch process error for ${key}:`, err.message);
    }
    
    // Clear the buffer
    interactionBuffer.set(key, []);
  }
}

/**
 * Flush buffer for a specific user
 */
async function flushBuffer(firmId, userId) {
  const key = `${firmId}:${userId}`;
  const interactions = interactionBuffer.get(key) || [];
  
  if (interactions.length === 0) return;
  
  try {
    await processInteractionBatch(firmId, userId, interactions);
    interactionBuffer.set(key, []);
  } catch (err) {
    console.error('[InteractionLearning] Flush error:', err.message);
  }
}

/**
 * Process a batch of interactions into learning patterns
 * 
 * Instead of storing raw clicks, we aggregate into patterns:
 * - Page visit frequency
 * - Feature usage frequency
 * - Search term categories
 * - Navigation sequences
 * - Time-of-day work patterns
 */
async function processInteractionBatch(firmId, userId, interactions) {
  // 1. Aggregate page visits
  const pageVisits = {};
  // 2. Aggregate feature usage
  const featureUsage = {};
  // 3. Track search patterns
  const searchCategories = {};
  // 4. Track navigation sequences (what page follows what)
  const navSequences = [];
  // 5. Track time-of-day patterns
  const timeSlots = {};
  // 6. Track filter/sort preferences
  const viewPreferences = {};
  
  let prevPage = null;
  
  for (const interaction of interactions) {
    const { type, category, detail, metadata, timestamp } = interaction;
    
    // Time slot
    const hour = new Date(timestamp).getHours();
    const timeSlot = hour < 6 ? 'early_morning' : hour < 9 ? 'morning' : 
                     hour < 12 ? 'late_morning' : hour < 14 ? 'afternoon_early' :
                     hour < 17 ? 'afternoon' : hour < 20 ? 'evening' : 'night';
    
    switch (type) {
      case 'page_view': {
        const page = detail || category;
        pageVisits[page] = (pageVisits[page] || 0) + 1;
        
        // Track time-of-day per page
        const timeKey = `${page}:${timeSlot}`;
        timeSlots[timeKey] = (timeSlots[timeKey] || 0) + 1;
        
        // Track navigation sequence
        if (prevPage && prevPage !== page) {
          navSequences.push({ from: prevPage, to: page });
        }
        prevPage = page;
        break;
      }
      
      case 'feature_use': {
        const feature = detail || category;
        featureUsage[feature] = (featureUsage[feature] || 0) + 1;
        break;
      }
      
      case 'search': {
        // Categorize the search term (don't store raw text for privacy)
        const searchCategory = categorizeSearch(detail);
        searchCategories[searchCategory] = (searchCategories[searchCategory] || 0) + 1;
        break;
      }
      
      case 'filter':
      case 'sort': {
        const prefKey = `${category}:${type}:${detail}`;
        viewPreferences[prefKey] = (viewPreferences[prefKey] || 0) + 1;
        break;
      }
    }
  }
  
  // Now persist the aggregated patterns (not raw interactions)
  const patterns = [];
  
  // Page visit patterns
  for (const [page, count] of Object.entries(pageVisits)) {
    patterns.push({
      type: 'page_frequency',
      category: 'navigation',
      data: { key: `page:${page}`, page, frequency: count },
    });
  }
  
  // Feature usage patterns
  for (const [feature, count] of Object.entries(featureUsage)) {
    patterns.push({
      type: 'feature_frequency',
      category: 'features',
      data: { key: `feature:${feature}`, feature, frequency: count },
    });
  }
  
  // Search category patterns
  for (const [cat, count] of Object.entries(searchCategories)) {
    patterns.push({
      type: 'search_category',
      category: 'search',
      data: { key: `search:${cat}`, search_category: cat, frequency: count },
    });
  }
  
  // Navigation sequences (top 5 most common)
  const seqCounts = {};
  for (const { from, to } of navSequences) {
    const seqKey = `${from}->${to}`;
    seqCounts[seqKey] = (seqCounts[seqKey] || 0) + 1;
  }
  const topSequences = Object.entries(seqCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  
  for (const [seq, count] of topSequences) {
    const [from, to] = seq.split('->');
    patterns.push({
      type: 'nav_sequence',
      category: 'workflow',
      data: { key: `nav:${seq}`, from_page: from, to_page: to, frequency: count },
    });
  }
  
  // Time-of-day patterns (top 10)
  const topTimeSlots = Object.entries(timeSlots)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  
  for (const [timeKey, count] of topTimeSlots) {
    const [page, slot] = timeKey.split(':');
    patterns.push({
      type: 'time_pattern',
      category: 'timing',
      data: { key: `time:${timeKey}`, page, time_slot: slot, frequency: count },
    });
  }
  
  // View preference patterns (top 10)
  const topPrefs = Object.entries(viewPreferences)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  
  for (const [prefKey, count] of topPrefs) {
    const [prefCategory, prefType, prefDetail] = prefKey.split(':');
    patterns.push({
      type: 'view_preference',
      category: 'preferences',
      data: { 
        key: `pref:${prefKey}`, 
        view_category: prefCategory, 
        preference_type: prefType,
        preference_value: prefDetail,
        frequency: count 
      },
    });
  }
  
  // Batch upsert all patterns
  for (const pattern of patterns) {
    await upsertInteractionPattern(firmId, userId, pattern);
  }
  
  if (patterns.length > 0) {
    console.log(`[InteractionLearning] Processed ${interactions.length} interactions -> ${patterns.length} patterns for user ${userId}`);
  }
}

/**
 * Categorize a search query without storing the raw text
 * This preserves privacy while still learning search behavior
 */
function categorizeSearch(searchText) {
  if (!searchText) return 'empty';
  
  const lower = searchText.toLowerCase();
  
  if (/\d{4}[-/]\d{2}|january|february|march|april|may|june|july|august|september|october|november|december/i.test(lower)) {
    return 'date_search';
  }
  if (/invoice|bill|payment|amount|\$/i.test(lower)) {
    return 'billing_search';
  }
  if (/motion|brief|filing|court|pleading/i.test(lower)) {
    return 'court_filing_search';
  }
  if (/contract|agreement|lease|license/i.test(lower)) {
    return 'contract_search';
  }
  if (/deadline|due|expir|statute of limitation/i.test(lower)) {
    return 'deadline_search';
  }
  if (/email|letter|correspond/i.test(lower)) {
    return 'correspondence_search';
  }
  if (/\.pdf|\.doc|\.xls/i.test(lower)) {
    return 'file_type_search';
  }
  if (lower.length <= 3) {
    return 'short_search';
  }
  
  return 'general_search';
}

/**
 * Upsert an interaction pattern into the database
 * Uses the same ai_learning_patterns table as manualLearning.js
 */
async function upsertInteractionPattern(firmId, userId, pattern) {
  const patternKey = pattern.data.key;
  
  try {
    const existing = await query(`
      SELECT id, occurrences, pattern_data 
      FROM ai_learning_patterns
      WHERE firm_id = $1 AND user_id = $2 AND pattern_type = $3 AND pattern_data->>'key' = $4
    `, [firmId, userId, pattern.type, patternKey]);
    
    if (existing.rows.length > 0) {
      // Merge: increment occurrences, update frequency with running average
      const existingData = existing.rows[0].pattern_data;
      const mergedData = { ...existingData };
      
      // Running average for frequency
      if (typeof pattern.data.frequency === 'number' && typeof existingData.frequency === 'number') {
        mergedData.frequency = existingData.frequency + pattern.data.frequency;
      }
      
      await query(`
        UPDATE ai_learning_patterns 
        SET occurrences = occurrences + 1, 
            last_used_at = NOW(),
            pattern_data = $2::jsonb,
            confidence = LEAST(0.95, confidence + 0.005)
        WHERE id = $1
      `, [existing.rows[0].id, JSON.stringify(mergedData)]);
    } else {
      await query(`
        INSERT INTO ai_learning_patterns (firm_id, user_id, pattern_type, pattern_category, pattern_data, confidence)
        VALUES ($1, $2, $3, $4, $5, 0.3)
      `, [firmId, userId, pattern.type, pattern.category, JSON.stringify(pattern.data)]);
    }
  } catch (error) {
    // Non-critical - table may not exist yet
    if (!error.message?.includes('ai_learning_patterns')) {
      console.error('[InteractionLearning] Upsert error:', error.message);
    }
  }
}

/**
 * Get user's interaction profile for agent context
 * 
 * Returns a summary of how the user works with the software,
 * which the agent uses to prioritize and personalize its behavior.
 */
export async function getUserInteractionProfile(firmId, userId) {
  // Check cache
  const cacheKey = `${firmId}:${userId}`;
  const cached = profileCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < PROFILE_CACHE_TTL_MS) {
    return cached.data;
  }
  
  try {
    const result = await query(`
      SELECT pattern_type, pattern_category, pattern_data, occurrences, confidence
      FROM ai_learning_patterns
      WHERE firm_id = $1 AND user_id = $2 
        AND pattern_type IN ('page_frequency', 'feature_frequency', 'search_category', 'nav_sequence', 'time_pattern', 'view_preference')
        AND confidence >= 0.3
      ORDER BY occurrences DESC
      LIMIT 50
    `, [firmId, userId]);
    
    const profile = buildInteractionProfile(result.rows);
    
    // Cache it
    profileCache.set(cacheKey, { data: profile, timestamp: Date.now() });
    
    return profile;
  } catch (error) {
    // Table might not exist
    return null;
  }
}

/**
 * Build a structured interaction profile from raw patterns
 */
function buildInteractionProfile(rows) {
  if (!rows || rows.length === 0) return null;
  
  const profile = {
    mostUsedPages: [],
    mostUsedFeatures: [],
    searchBehavior: [],
    commonWorkflows: [],
    workSchedule: [],
    viewPreferences: [],
  };
  
  for (const row of rows) {
    const data = typeof row.pattern_data === 'string' ? JSON.parse(row.pattern_data) : row.pattern_data;
    
    switch (row.pattern_type) {
      case 'page_frequency':
        profile.mostUsedPages.push({ 
          page: data.page, 
          frequency: data.frequency || row.occurrences 
        });
        break;
        
      case 'feature_frequency':
        profile.mostUsedFeatures.push({ 
          feature: data.feature, 
          frequency: data.frequency || row.occurrences 
        });
        break;
        
      case 'search_category':
        profile.searchBehavior.push({ 
          category: data.search_category, 
          frequency: data.frequency || row.occurrences 
        });
        break;
        
      case 'nav_sequence':
        profile.commonWorkflows.push({ 
          from: data.from_page, 
          to: data.to_page, 
          frequency: data.frequency || row.occurrences 
        });
        break;
        
      case 'time_pattern':
        profile.workSchedule.push({ 
          page: data.page, 
          timeSlot: data.time_slot, 
          frequency: data.frequency || row.occurrences 
        });
        break;
        
      case 'view_preference':
        profile.viewPreferences.push({
          category: data.view_category,
          type: data.preference_type,
          value: data.preference_value,
          frequency: data.frequency || row.occurrences,
        });
        break;
    }
  }
  
  // Sort each list by frequency (most used first)
  profile.mostUsedPages.sort((a, b) => b.frequency - a.frequency);
  profile.mostUsedFeatures.sort((a, b) => b.frequency - a.frequency);
  profile.searchBehavior.sort((a, b) => b.frequency - a.frequency);
  profile.commonWorkflows.sort((a, b) => b.frequency - a.frequency);
  
  // Limit sizes
  profile.mostUsedPages = profile.mostUsedPages.slice(0, 10);
  profile.mostUsedFeatures = profile.mostUsedFeatures.slice(0, 10);
  profile.searchBehavior = profile.searchBehavior.slice(0, 5);
  profile.commonWorkflows = profile.commonWorkflows.slice(0, 5);
  profile.workSchedule = profile.workSchedule.slice(0, 10);
  profile.viewPreferences = profile.viewPreferences.slice(0, 10);
  
  return profile;
}

/**
 * Format interaction profile for the agent prompt
 */
export function formatInteractionProfileForPrompt(profile) {
  if (!profile) return '';
  
  const sections = [];
  
  // Most used areas
  if (profile.mostUsedPages.length > 0) {
    const topPages = profile.mostUsedPages.slice(0, 5).map(p => p.page).join(', ');
    sections.push(`**Primary Work Areas:** ${topPages}`);
  }
  
  // Most used features
  if (profile.mostUsedFeatures.length > 0) {
    const topFeatures = profile.mostUsedFeatures.slice(0, 5).map(f => f.feature).join(', ');
    sections.push(`**Frequently Used Features:** ${topFeatures}`);
  }
  
  // Work schedule patterns
  if (profile.workSchedule.length > 0) {
    // Aggregate time slots
    const slotCounts = {};
    for (const { timeSlot, frequency } of profile.workSchedule) {
      slotCounts[timeSlot] = (slotCounts[timeSlot] || 0) + frequency;
    }
    const topSlots = Object.entries(slotCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([slot]) => slot.replace(/_/g, ' '));
    
    sections.push(`**Active Hours:** Most active during ${topSlots.join(', ')}`);
  }
  
  // Common workflows
  if (profile.commonWorkflows.length > 0) {
    const workflows = profile.commonWorkflows.slice(0, 3)
      .map(w => `${w.from} → ${w.to}`)
      .join('; ');
    sections.push(`**Common Workflows:** ${workflows}`);
  }
  
  // Search patterns
  if (profile.searchBehavior.length > 0) {
    const searchTypes = profile.searchBehavior.slice(0, 3)
      .map(s => s.category.replace(/_/g, ' '))
      .join(', ');
    sections.push(`**Common Searches:** ${searchTypes}`);
  }
  
  if (sections.length === 0) return '';
  
  return `\n## HOW THIS USER WORKS\n\nBased on their software usage patterns (private to them):\n\n${sections.join('\n')}\n\nUse this context to prioritize relevant information and match their workflow.\n`;
}

export default {
  recordInteraction,
  getUserInteractionProfile,
  formatInteractionProfileForPrompt,
};
