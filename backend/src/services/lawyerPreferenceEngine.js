/**
 * Lawyer Preference Engine
 * 
 * Implements the three-layer learning hierarchy:
 *   Layer 1: Lawyer Identity (persists across ALL matters)
 *   Layer 2: Practice Area Patterns (persists within practice area)
 *   Layer 3: Matter-Specific Context (scoped to one matter)
 * 
 * KEY DESIGN DECISIONS:
 * 
 * 1. Patterns start at Layer 3 (matter-specific) and PROMOTE upward
 *    only when observed across multiple matters. This prevents overfitting
 *    to a single case's quirks.
 * 
 * 2. Promotion requires both repetition AND diversity:
 *    - Layer 3 → 2: Same pattern across 3+ matters of the same practice area
 *    - Layer 2 → 1: Same pattern across 2+ practice areas (5+ total matters)
 * 
 * 3. Some patterns should NEVER promote:
 *    - Opposing counsel behavior (matter-specific, could create conflicts)
 *    - Settlement terms (each negotiation is unique)
 *    - Judicial predictions (bias, not intelligence)
 * 
 * 4. Learning is always private to the individual lawyer.
 *    Firm-level aggregation is opt-in and anonymized.
 * 
 * PRIVACY: All preferences scoped to firm_id + lawyer_id. No cross-tenant
 * or cross-lawyer leakage. The engine NEVER reads another lawyer's preferences
 * even within the same firm (unless firm-level anonymous aggregation is enabled).
 */

import { query } from '../db/connection.js';
import crypto from 'crypto';

// Preference types and their layer eligibility
const PREFERENCE_TYPES = {
  // Can promote to Layer 1 (lawyer identity)
  writing_style: { maxLayer: 1, category: 'style' },
  citation_format: { maxLayer: 1, category: 'style' },
  jurisdiction_preference: { maxLayer: 1, category: 'practice' },
  risk_tolerance: { maxLayer: 1, category: 'practice' },
  document_type_affinity: { maxLayer: 1, category: 'retrieval' },
  query_pattern: { maxLayer: 1, category: 'retrieval' },
  formatting_preference: { maxLayer: 1, category: 'style' },
  
  // Can promote to Layer 2 (practice area) but NOT Layer 1
  clause_structure: { maxLayer: 2, category: 'practice' },
  argument_style: { maxLayer: 2, category: 'practice' },
  diligence_priority: { maxLayer: 2, category: 'practice' },
  negotiation_stance: { maxLayer: 2, category: 'practice' },
  
  // Layer 3 ONLY (never promotes)
  opposing_counsel_behavior: { maxLayer: 3, category: 'matter' },
  client_communication_style: { maxLayer: 3, category: 'matter' },
  judge_preference: { maxLayer: 3, category: 'matter' },
  settlement_pattern: { maxLayer: 3, category: 'matter' },
};

// Confidence thresholds
const CONFIDENCE = {
  base_explicit: 0.7,        // Explicit user preference
  base_inferred: 0.3,        // Inferred from behavior
  promote_to_layer2: 0.6,    // Minimum confidence to promote 3→2
  promote_to_layer1: 0.8,    // Minimum confidence to promote 2→1
  min_matters_layer2: 3,     // Minimum distinct matters for Layer 2
  min_matters_layer1: 5,     // Minimum distinct matters for Layer 1
  min_practice_areas_layer1: 2, // Minimum distinct practice areas for Layer 1
  temporal_decay_halflife_days: 180, // Confidence halves every 180 days without observation
};

/**
 * Calculate confidence score using diminishing returns formula
 */
function calculateConfidence(baseConfidence, occurrences) {
  return Math.min(0.99, baseConfidence + 0.49 * (1 - Math.exp(-occurrences / 10)));
}

/**
 * Apply temporal decay to confidence
 */
function applyTemporalDecay(confidence, lastSeenDate) {
  if (!lastSeenDate) return confidence;
  
  const daysSinceLastSeen = (Date.now() - new Date(lastSeenDate).getTime()) / (1000 * 60 * 60 * 24);
  const decayFactor = Math.exp(-daysSinceLastSeen / CONFIDENCE.temporal_decay_halflife_days * Math.LN2);
  
  return confidence * decayFactor;
}

/**
 * Record a preference observation
 * 
 * This is the main entry point for the learning system. Every time the system
 * observes a lawyer's behavior (document selection, editing pattern, etc.),
 * this function is called to record and potentially update preferences.
 * 
 * @param {string} firmId - Firm ID
 * @param {string} lawyerId - Lawyer's user ID
 * @param {string} preferenceType - Type from PREFERENCE_TYPES
 * @param {string} preferenceKey - Specific preference identifier
 * @param {object} preferenceValue - The preference value (JSONB)
 * @param {object} context - Additional context (matterId, practiceArea, etc.)
 * @returns {object} The updated or created preference
 */
export async function recordPreferenceObservation(firmId, lawyerId, preferenceType, preferenceKey, preferenceValue, context = {}) {
  const typeConfig = PREFERENCE_TYPES[preferenceType];
  if (!typeConfig) {
    console.warn(`[PreferenceEngine] Unknown preference type: ${preferenceType}`);
    return null;
  }
  
  const source = context.explicit ? 'explicit' : 'inferred';
  const baseConfidence = source === 'explicit' ? CONFIDENCE.base_explicit : CONFIDENCE.base_inferred;
  
  try {
    // Upsert the preference
    const result = await query(`
      INSERT INTO lawyer_preferences (
        firm_id, lawyer_id, preference_type, preference_key, 
        preference_value, confidence, source, occurrences, context
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8)
      ON CONFLICT (firm_id, lawyer_id, preference_type, preference_key)
      DO UPDATE SET
        preference_value = CASE 
          WHEN lawyer_preferences.source = 'explicit' AND $7 = 'inferred' 
            THEN lawyer_preferences.preference_value  -- Don't override explicit with inferred
          ELSE EXCLUDED.preference_value
        END,
        confidence = LEAST(0.99, lawyer_preferences.confidence + 0.05),
        occurrences = lawyer_preferences.occurrences + 1,
        updated_at = NOW(),
        source = CASE
          WHEN $7 = 'explicit' THEN 'explicit'  -- Explicit always wins
          ELSE lawyer_preferences.source
        END
      RETURNING *
    `, [
      firmId,
      lawyerId,
      preferenceType,
      preferenceKey,
      JSON.stringify(preferenceValue),
      baseConfidence,
      source,
      context.practiceArea || context.matterId || null,
    ]);
    
    const pref = result.rows[0];
    
    // Record the observation context for promotion analysis
    if (context.matterId) {
      await recordObservationContext(firmId, lawyerId, pref.id, context);
    }
    
    // Check if this preference should be promoted
    await checkAndPromote(firmId, lawyerId, pref);
    
    return pref;
  } catch (error) {
    console.error('[PreferenceEngine] Record observation error:', error.message);
    return null;
  }
}

/**
 * Record the context of an observation for later promotion analysis
 */
async function recordObservationContext(firmId, lawyerId, preferenceId, context) {
  try {
    await query(`
      INSERT INTO matter_context (
        firm_id, matter_id, lawyer_id, context_type, context_key, 
        context_value, source
      ) VALUES ($1, $2, $3, 'preference_observation', $4, $5, 'system')
      ON CONFLICT (firm_id, matter_id, lawyer_id, context_type, context_key)
      DO UPDATE SET
        context_value = matter_context.context_value || $5::jsonb,
        confidence = LEAST(0.99, matter_context.confidence + 0.05),
        updated_at = NOW()
    `, [
      firmId,
      context.matterId,
      lawyerId,
      preferenceId,
      JSON.stringify({
        practiceArea: context.practiceArea,
        observedAt: new Date().toISOString(),
      }),
    ]);
  } catch (error) {
    // Non-critical, log and continue
    console.warn('[PreferenceEngine] Context recording error:', error.message);
  }
}

/**
 * Check if a preference should be promoted to a higher layer
 * 
 * Promotion rules:
 * - Layer 3 → 2: Same pattern across 3+ matters in same practice area
 * - Layer 2 → 1: Same pattern across 5+ matters in 2+ practice areas
 */
async function checkAndPromote(firmId, lawyerId, preference) {
  const typeConfig = PREFERENCE_TYPES[preference.preference_type];
  if (!typeConfig) return;
  
  try {
    // Count distinct matters where this preference was observed
    const matterCount = await query(`
      SELECT 
        COUNT(DISTINCT mc.matter_id) as distinct_matters,
        COUNT(DISTINCT m.matter_type) as distinct_practice_areas,
        array_agg(DISTINCT m.matter_type) as practice_areas
      FROM matter_context mc
      JOIN matters m ON m.id = mc.matter_id AND m.firm_id = mc.firm_id
      WHERE mc.firm_id = $1 
        AND mc.lawyer_id = $2 
        AND mc.context_key = $3
        AND mc.context_type = 'preference_observation'
    `, [firmId, lawyerId, preference.id]);
    
    const stats = matterCount.rows[0];
    const distinctMatters = parseInt(stats.distinct_matters) || 0;
    const distinctPracticeAreas = parseInt(stats.distinct_practice_areas) || 0;
    
    // Determine current layer
    let currentLayer = 3; // Default: matter-specific
    if (distinctMatters >= CONFIDENCE.min_matters_layer1 && 
        distinctPracticeAreas >= CONFIDENCE.min_practice_areas_layer1 &&
        typeConfig.maxLayer <= 1) {
      currentLayer = 1;
    } else if (distinctMatters >= CONFIDENCE.min_matters_layer2 && typeConfig.maxLayer <= 2) {
      currentLayer = 2;
    }
    
    // Check promotion eligibility
    const confidence = parseFloat(preference.confidence);
    
    // Layer 3 → Layer 2
    if (currentLayer === 3 && 
        distinctMatters >= CONFIDENCE.min_matters_layer2 && 
        confidence >= CONFIDENCE.promote_to_layer2 &&
        typeConfig.maxLayer <= 2) {
      
      await logPromotion(firmId, lawyerId, preference.id, 3, 2, distinctMatters);
      console.log(`[PreferenceEngine] Promoted ${preference.preference_type}:${preference.preference_key} from Layer 3 → 2 (${distinctMatters} matters)`);
    }
    
    // Layer 2 → Layer 1
    if (currentLayer === 2 && 
        distinctMatters >= CONFIDENCE.min_matters_layer1 && 
        distinctPracticeAreas >= CONFIDENCE.min_practice_areas_layer1 &&
        confidence >= CONFIDENCE.promote_to_layer1 &&
        typeConfig.maxLayer <= 1) {
      
      await logPromotion(firmId, lawyerId, preference.id, 2, 1, distinctMatters);
      console.log(`[PreferenceEngine] Promoted ${preference.preference_type}:${preference.preference_key} from Layer 2 → 1 (${distinctMatters} matters, ${distinctPracticeAreas} practice areas)`);
    }
  } catch (error) {
    console.warn('[PreferenceEngine] Promotion check error:', error.message);
  }
}

/**
 * Log a preference promotion for audit trail
 */
async function logPromotion(firmId, lawyerId, preferenceId, fromLayer, toLayer, distinctMatters) {
  try {
    await query(`
      INSERT INTO preference_promotion_log (
        firm_id, lawyer_id, preference_id, from_layer, to_layer, 
        evidence_count, distinct_matters
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [firmId, lawyerId, preferenceId, fromLayer, toLayer, distinctMatters, distinctMatters]);
  } catch (error) {
    console.warn('[PreferenceEngine] Promotion log error:', error.message);
  }
}

/**
 * Get all preferences for a lawyer, organized by layer
 * 
 * @param {string} firmId - Firm ID
 * @param {string} lawyerId - Lawyer's user ID
 * @param {object} options - Filter options
 * @returns {object} Preferences organized by layer
 */
export async function getLawyerPreferences(firmId, lawyerId, options = {}) {
  const {
    practiceArea = null,
    matterId = null,
    categories = null, // Filter by category: 'style', 'practice', 'retrieval', 'matter'
    minConfidence = 0.3,
  } = options;
  
  try {
    const result = await query(`
      SELECT 
        lp.*,
        COUNT(DISTINCT mc.matter_id) as distinct_matters,
        COUNT(DISTINCT m.matter_type) as distinct_practice_areas
      FROM lawyer_preferences lp
      LEFT JOIN matter_context mc ON mc.context_key = lp.id::text 
        AND mc.firm_id = lp.firm_id 
        AND mc.lawyer_id = lp.lawyer_id
        AND mc.context_type = 'preference_observation'
      LEFT JOIN matters m ON m.id = mc.matter_id AND m.firm_id = mc.firm_id
      WHERE lp.firm_id = $1 
        AND lp.lawyer_id = $2
        AND lp.confidence >= $3
      GROUP BY lp.id
      ORDER BY lp.confidence DESC
    `, [firmId, lawyerId, minConfidence]);
    
    // Organize by layer
    const layered = {
      layer1: [], // Lawyer identity
      layer2: [], // Practice area patterns
      layer3: [], // Matter-specific
    };
    
    for (const pref of result.rows) {
      const typeConfig = PREFERENCE_TYPES[pref.preference_type] || { maxLayer: 3, category: 'other' };
      const distinctMatters = parseInt(pref.distinct_matters) || 0;
      const distinctPracticeAreas = parseInt(pref.distinct_practice_areas) || 0;
      
      // Apply temporal decay
      const effectiveConfidence = applyTemporalDecay(
        parseFloat(pref.confidence), 
        pref.updated_at
      );
      
      // Skip if below threshold after decay
      if (effectiveConfidence < minConfidence) continue;
      
      // Filter by category if specified
      if (categories && !categories.includes(typeConfig.category)) continue;
      
      const enrichedPref = {
        id: pref.id,
        type: pref.preference_type,
        key: pref.preference_key,
        value: pref.preference_value,
        confidence: effectiveConfidence,
        source: pref.source,
        occurrences: pref.occurrences,
        distinctMatters,
        distinctPracticeAreas,
        lastUpdated: pref.updated_at,
      };
      
      // Determine layer
      if (distinctMatters >= CONFIDENCE.min_matters_layer1 && 
          distinctPracticeAreas >= CONFIDENCE.min_practice_areas_layer1 &&
          typeConfig.maxLayer <= 1) {
        layered.layer1.push(enrichedPref);
      } else if (distinctMatters >= CONFIDENCE.min_matters_layer2 && typeConfig.maxLayer <= 2) {
        layered.layer2.push(enrichedPref);
      } else {
        layered.layer3.push(enrichedPref);
      }
    }
    
    return layered;
  } catch (error) {
    console.error('[PreferenceEngine] Get preferences error:', error.message);
    return { layer1: [], layer2: [], layer3: [] };
  }
}

/**
 * Learn from retrieval feedback
 * 
 * When a lawyer selects a document from search results, this function
 * records the implicit preference signal:
 * - Which document types are preferred for which query types
 * - Which matters/topics lead to which document selections
 * - How quickly the lawyer found what they needed (time to selection)
 */
export async function learnFromRetrievalFeedback(firmId, lawyerId, feedback) {
  const {
    queryText,
    queryIntent,
    selectedDocumentId,
    selectedDocumentType,
    retrievedDocumentTypes,
    matterId,
    practiceArea,
    timeToSelectionMs,
  } = feedback;
  
  const observations = [];
  
  // 1. Document type affinity
  if (selectedDocumentType) {
    observations.push(
      recordPreferenceObservation(
        firmId, lawyerId,
        'document_type_affinity',
        selectedDocumentType,
        {
          queryIntent,
          selectedOverTypes: retrievedDocumentTypes?.filter(t => t !== selectedDocumentType) || [],
          selectionSpeed: timeToSelectionMs ? (timeToSelectionMs < 5000 ? 'fast' : 'slow') : 'unknown',
        },
        { matterId, practiceArea }
      )
    );
  }
  
  // 2. Query pattern learning
  if (queryIntent) {
    const queryCategory = categorizeQuery(queryText);
    if (queryCategory) {
      observations.push(
        recordPreferenceObservation(
          firmId, lawyerId,
          'query_pattern',
          `${queryIntent}:${queryCategory}`,
          {
            preferredDocType: selectedDocumentType,
            queryExample: queryText.substring(0, 100), // Truncate for privacy
          },
          { matterId, practiceArea }
        )
      );
    }
  }
  
  await Promise.allSettled(observations);
}

/**
 * Categorize a query for pattern learning
 * Returns a category string, NOT the raw query (for privacy)
 */
function categorizeQuery(queryText) {
  const lower = queryText.toLowerCase();
  
  if (/standard|test|elements|requirement/i.test(lower)) return 'legal_standard';
  if (/draft|template|sample|form/i.test(lower)) return 'drafting_resource';
  if (/deadline|limitation|statute|time/i.test(lower)) return 'procedural_deadline';
  if (/damages|remedy|relief|award/i.test(lower)) return 'remedies';
  if (/clause|provision|term|section/i.test(lower)) return 'clause_lookup';
  if (/cite|citation|authority|case/i.test(lower)) return 'authority_lookup';
  if (/define|definition|meaning/i.test(lower)) return 'definition_lookup';
  
  return 'general';
}

/**
 * Learn from document editing patterns
 * 
 * When a lawyer edits an AI-generated or template document, the edits
 * reveal preferences about writing style, clause structure, and risk tolerance.
 */
export async function learnFromEditPattern(firmId, lawyerId, editContext) {
  const {
    originalText,
    editedText,
    documentType,
    sectionType, // 'indemnification', 'termination', 'governing_law', etc.
    matterId,
    practiceArea,
  } = editContext;
  
  if (!originalText || !editedText || originalText === editedText) return;
  
  const observations = [];
  
  // Analyze the nature of the edit
  const editAnalysis = analyzeEdit(originalText, editedText);
  
  // 1. Writing style observation
  if (editAnalysis.styleChanges.length > 0) {
    for (const change of editAnalysis.styleChanges) {
      observations.push(
        recordPreferenceObservation(
          firmId, lawyerId,
          'writing_style',
          change.type,
          {
            from: change.from,
            to: change.to,
            documentType,
          },
          { matterId, practiceArea }
        )
      );
    }
  }
  
  // 2. Clause structure observation (for contracts)
  if (sectionType && editAnalysis.substantiveChanges) {
    observations.push(
      recordPreferenceObservation(
        firmId, lawyerId,
        'clause_structure',
        `${documentType}:${sectionType}`,
        {
          editType: editAnalysis.editType,
          addedConcepts: editAnalysis.addedConcepts,
          removedConcepts: editAnalysis.removedConcepts,
        },
        { matterId, practiceArea }
      )
    );
  }
  
  // 3. Risk tolerance observation
  if (editAnalysis.riskSignal) {
    observations.push(
      recordPreferenceObservation(
        firmId, lawyerId,
        'risk_tolerance',
        sectionType || 'general',
        {
          direction: editAnalysis.riskSignal, // 'more_protective' or 'more_permissive'
          context: documentType,
        },
        { matterId, practiceArea }
      )
    );
  }
  
  // Record in edit_patterns table for detailed tracking
  const originalHash = crypto.createHash('sha256').update(originalText).digest('hex');
  const editedHash = crypto.createHash('sha256').update(editedText).digest('hex');
  
  try {
    await query(`
      INSERT INTO edit_patterns (
        firm_id, lawyer_id, original_text_hash, edited_text_hash,
        original_text_prefix, edited_text_prefix, context
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (firm_id, lawyer_id, original_text_hash, edited_text_hash, context)
      DO UPDATE SET
        occurrences = edit_patterns.occurrences + 1,
        last_seen = NOW()
    `, [
      firmId, lawyerId, originalHash, editedHash,
      originalText.substring(0, 100),
      editedText.substring(0, 100),
      `${documentType}:${sectionType || 'general'}`,
    ]);
  } catch (error) {
    console.warn('[PreferenceEngine] Edit pattern recording error:', error.message);
  }
  
  await Promise.allSettled(observations);
}

/**
 * Analyze an edit to extract preference signals
 */
function analyzeEdit(original, edited) {
  const result = {
    styleChanges: [],
    substantiveChanges: false,
    addedConcepts: [],
    removedConcepts: [],
    editType: 'modification',
    riskSignal: null,
  };
  
  // Style analysis
  const origWords = original.split(/\s+/);
  const editWords = edited.split(/\s+/);
  
  // Shall vs. will preference
  const origShall = (original.match(/\bshall\b/gi) || []).length;
  const editShall = (edited.match(/\bshall\b/gi) || []).length;
  const origWill = (original.match(/\bwill\b/gi) || []).length;
  const editWill = (edited.match(/\bwill\b/gi) || []).length;
  
  if (origShall > 0 && editShall < origShall && editWill > origWill) {
    result.styleChanges.push({ type: 'modal_verb', from: 'shall', to: 'will' });
  } else if (origWill > 0 && editWill < origWill && editShall > origShall) {
    result.styleChanges.push({ type: 'modal_verb', from: 'will', to: 'shall' });
  }
  
  // Active vs. passive voice
  const origPassive = (original.match(/\b(?:is|are|was|were|been|being)\s+\w+ed\b/gi) || []).length;
  const editPassive = (edited.match(/\b(?:is|are|was|were|been|being)\s+\w+ed\b/gi) || []).length;
  
  if (origPassive > editPassive && origPassive - editPassive >= 2) {
    result.styleChanges.push({ type: 'voice', from: 'passive', to: 'active' });
  } else if (editPassive > origPassive && editPassive - origPassive >= 2) {
    result.styleChanges.push({ type: 'voice', from: 'active', to: 'passive' });
  }
  
  // Oxford comma preference
  const origOxford = (original.match(/,\s+\w+,?\s+and\s/gi) || []).length;
  const editOxford = (edited.match(/,\s+\w+,\s+and\s/gi) || []).length;
  const editNoOxford = (edited.match(/,\s+\w+\s+and\s/gi) || []).length;
  
  if (editOxford > origOxford) {
    result.styleChanges.push({ type: 'punctuation', from: 'no_oxford_comma', to: 'oxford_comma' });
  }
  
  // Substantive change detection
  const lenDiff = Math.abs(edited.length - original.length);
  result.substantiveChanges = lenDiff > original.length * 0.1; // >10% length change = substantive
  
  // Risk signal detection
  const riskIncreaseTerms = /(?:notwithstanding|carve.?out|except|however|provided\s+that|subject\s+to|limitation|cap|maximum)/i;
  const riskDecreaseTerms = /(?:unlimited|sole\s+discretion|without\s+limitation|any\s+and\s+all|to\s+the\s+fullest\s+extent)/i;
  
  const origRiskIncrease = (original.match(new RegExp(riskIncreaseTerms.source, 'gi')) || []).length;
  const editRiskIncrease = (edited.match(new RegExp(riskIncreaseTerms.source, 'gi')) || []).length;
  
  if (editRiskIncrease > origRiskIncrease) {
    result.riskSignal = 'more_protective';
  } else if (editRiskIncrease < origRiskIncrease) {
    result.riskSignal = 'more_permissive';
  }
  
  return result;
}

/**
 * Get a compact preference summary for inclusion in AI prompts
 * Returns only the most confident and relevant preferences
 */
export async function getPreferenceSummaryForPrompt(firmId, lawyerId, context = {}) {
  const preferences = await getLawyerPreferences(firmId, lawyerId, {
    minConfidence: 0.4,
    categories: context.categories || null,
  });
  
  const summary = [];
  
  // Layer 1: Top 5 lawyer identity preferences
  for (const pref of preferences.layer1.slice(0, 5)) {
    summary.push(`[Identity] ${pref.type}: ${formatPreferenceValue(pref)}`);
  }
  
  // Layer 2: Top 5 practice area preferences (filtered by current practice area if available)
  const relevantLayer2 = context.practiceArea
    ? preferences.layer2.filter(p => {
        const val = typeof p.value === 'string' ? JSON.parse(p.value) : p.value;
        return val.practiceArea === context.practiceArea || !val.practiceArea;
      })
    : preferences.layer2;
  
  for (const pref of relevantLayer2.slice(0, 5)) {
    summary.push(`[Practice] ${pref.type}: ${formatPreferenceValue(pref)}`);
  }
  
  // Layer 3: Top 3 matter-specific preferences (only if matterId provided)
  if (context.matterId) {
    const matterPrefs = preferences.layer3.filter(p => {
      return p.key?.includes(context.matterId);
    });
    for (const pref of matterPrefs.slice(0, 3)) {
      summary.push(`[Matter] ${pref.type}: ${formatPreferenceValue(pref)}`);
    }
  }
  
  return summary.join('\n');
}

/**
 * Format a preference value for human-readable display
 */
function formatPreferenceValue(pref) {
  const val = typeof pref.value === 'string' ? JSON.parse(pref.value) : pref.value;
  
  if (typeof val === 'string') return val;
  
  // Common patterns
  if (val.from && val.to) return `prefers "${val.to}" over "${val.from}"`;
  if (val.direction) return val.direction;
  if (val.style) return val.style;
  if (val.preferredDocType) return `prefers ${val.preferredDocType} documents`;
  
  // Fallback: compact JSON
  return JSON.stringify(val).substring(0, 100);
}

/**
 * Run periodic maintenance on the preference engine
 * Should be called daily or weekly via background job
 */
export async function runMaintenance(firmId) {
  try {
    // 1. Apply temporal decay to all preferences
    await query(`
      UPDATE lawyer_preferences
      SET confidence = GREATEST(0.1, confidence * exp(
        -EXTRACT(EPOCH FROM (NOW() - updated_at)) / (${CONFIDENCE.temporal_decay_halflife_days} * 86400) * ln(2)
      ))
      WHERE firm_id = $1
        AND source = 'inferred'
        AND updated_at < NOW() - INTERVAL '30 days'
    `, [firmId]);
    
    // 2. Clean up very low confidence preferences
    const deleted = await query(`
      DELETE FROM lawyer_preferences
      WHERE firm_id = $1
        AND confidence < 0.15
        AND source = 'inferred'
        AND updated_at < NOW() - INTERVAL '90 days'
      RETURNING id
    `, [firmId]);
    
    // 3. Re-check promotions for preferences that gained new evidence
    const candidates = await query(`
      SELECT DISTINCT lp.id, lp.firm_id, lp.lawyer_id
      FROM lawyer_preferences lp
      WHERE lp.firm_id = $1
        AND lp.occurrences >= 3
        AND lp.confidence >= 0.5
    `, [firmId]);
    
    for (const candidate of candidates.rows) {
      const fullPref = await query(`SELECT * FROM lawyer_preferences WHERE id = $1`, [candidate.id]);
      if (fullPref.rows[0]) {
        await checkAndPromote(firmId, candidate.lawyer_id, fullPref.rows[0]);
      }
    }
    
    console.log(`[PreferenceEngine] Maintenance complete for firm ${firmId}: ${deleted.rows.length} preferences pruned`);
    
    return {
      prunedCount: deleted.rows.length,
      promotionCandidates: candidates.rows.length,
    };
  } catch (error) {
    console.error('[PreferenceEngine] Maintenance error:', error.message);
    return { error: error.message };
  }
}

export default {
  recordPreferenceObservation,
  getLawyerPreferences,
  learnFromRetrievalFeedback,
  learnFromEditPattern,
  getPreferenceSummaryForPrompt,
  runMaintenance,
  PREFERENCE_TYPES,
};
