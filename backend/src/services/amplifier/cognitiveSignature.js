/**
 * Cognitive Signature - Model-Agnostic Attorney Intelligence
 * 
 * THE PROBLEM WITH CURRENT AI MEMORY: Everything is stored as text that
 * gets injected into prompts. When you switch models, the effectiveness
 * of those text injections shifts unpredictably. Your learning is tightly
 * coupled to one model's interpretation of natural language.
 * 
 * THE SOLUTION: Store the attorney's cognitive profile as a MATHEMATICAL
 * OBJECT — a vector of continuous dimensions (0.0 to 1.0) that captures
 * WHO they are, not as words, but as numbers. Then RENDER those numbers
 * into whatever format the current model needs.
 * 
 * This is inspired by how the brain actually works. Your personality
 * isn't stored as sentences in your neurons. It's stored as connection
 * weights — continuous values that shape how you process information.
 * We're doing the same thing: storing the attorney's cognitive weights
 * and rendering them into behavior at runtime.
 * 
 * THE SIGNATURE DIMENSIONS:
 * 
 * Writing:
 *   sentence_length       0.0=terse  → 1.0=verbose
 *   formality             0.0=casual → 1.0=highly formal
 *   structure_preference  0.0=prose  → 1.0=heavy headers/bullets
 *   vocabulary_level      0.0=plain  → 1.0=technical legalese
 *   detail_level          0.0=concise → 1.0=exhaustive
 *   citation_density      0.0=none   → 1.0=heavy citations
 * 
 * Thinking:
 *   risk_tolerance        0.0=conservative → 1.0=aggressive
 *   analytic_depth        0.0=executive summary → 1.0=deep dive
 *   recommendation_style  0.0=single answer → 1.0=multiple options
 *   decision_speed        0.0=thorough/slow → 1.0=fast/decisive
 * 
 * Tone:
 *   assertiveness         0.0=diplomatic → 1.0=forceful
 *   warmth                0.0=cool/professional → 1.0=warm/personal
 *   directness            0.0=hedged → 1.0=blunt
 * 
 * Work Style:
 *   delegation_specificity  0.0=outcome-only → 1.0=step-by-step
 *   follow_up_frequency     0.0=hands-off → 1.0=hands-on
 *   action_item_emphasis    0.0=analysis only → 1.0=always includes next steps
 * 
 * PORTABILITY: This signature works across model changes, fine-tuning,
 * and even different AI providers. It's the attorney's cognitive DNA.
 * 
 * PRIVACY: Scoped to user_id + firm_id. Never shared.
 */

import { query } from '../../db/connection.js';

// =====================================================================
// THE SIGNATURE SCHEMA: All dimensions with their ranges and meanings
// =====================================================================

export const SIGNATURE_DIMENSIONS = {
  // Writing dimensions
  sentence_length:      { min: 0, max: 1, default: 0.5, category: 'writing', label: 'Sentence Length', lowLabel: 'terse', highLabel: 'verbose' },
  formality:            { min: 0, max: 1, default: 0.6, category: 'writing', label: 'Formality', lowLabel: 'casual', highLabel: 'formal' },
  structure_preference: { min: 0, max: 1, default: 0.5, category: 'writing', label: 'Structure', lowLabel: 'prose', highLabel: 'headers/bullets' },
  vocabulary_level:     { min: 0, max: 1, default: 0.5, category: 'writing', label: 'Vocabulary', lowLabel: 'plain language', highLabel: 'technical legalese' },
  detail_level:         { min: 0, max: 1, default: 0.5, category: 'writing', label: 'Detail Level', lowLabel: 'concise', highLabel: 'exhaustive' },
  citation_density:     { min: 0, max: 1, default: 0.3, category: 'writing', label: 'Citations', lowLabel: 'minimal', highLabel: 'heavy' },
  uses_oxford_comma:    { min: 0, max: 1, default: 0.5, category: 'writing', label: 'Oxford Comma', lowLabel: 'no', highLabel: 'yes' },
  
  // Thinking dimensions
  risk_tolerance:       { min: 0, max: 1, default: 0.5, category: 'thinking', label: 'Risk Tolerance', lowLabel: 'conservative', highLabel: 'aggressive' },
  analytic_depth:       { min: 0, max: 1, default: 0.5, category: 'thinking', label: 'Analytic Depth', lowLabel: 'executive summary', highLabel: 'deep dive' },
  recommendation_style: { min: 0, max: 1, default: 0.5, category: 'thinking', label: 'Recommendation Style', lowLabel: 'single answer', highLabel: 'multiple options' },
  decision_speed:       { min: 0, max: 1, default: 0.5, category: 'thinking', label: 'Decision Speed', lowLabel: 'deliberate', highLabel: 'fast/decisive' },
  
  // Tone dimensions
  assertiveness:        { min: 0, max: 1, default: 0.5, category: 'tone', label: 'Assertiveness', lowLabel: 'diplomatic', highLabel: 'forceful' },
  warmth:               { min: 0, max: 1, default: 0.5, category: 'tone', label: 'Warmth', lowLabel: 'cool/professional', highLabel: 'warm/personal' },
  directness:           { min: 0, max: 1, default: 0.5, category: 'tone', label: 'Directness', lowLabel: 'hedged/cautious', highLabel: 'blunt/direct' },
  
  // Work style dimensions
  delegation_specificity: { min: 0, max: 1, default: 0.5, category: 'work_style', label: 'Delegation', lowLabel: 'outcome-only', highLabel: 'step-by-step' },
  follow_up_frequency:    { min: 0, max: 1, default: 0.5, category: 'work_style', label: 'Follow-up', lowLabel: 'hands-off', highLabel: 'hands-on' },
  action_item_emphasis:   { min: 0, max: 1, default: 0.5, category: 'work_style', label: 'Action Items', lowLabel: 'analysis only', highLabel: 'always includes next steps' },
};

const TOTAL_DIMENSIONS = Object.keys(SIGNATURE_DIMENSIONS).length;

// Cache
const signatureCache = new Map();
const CACHE_TTL_MS = 180000; // 3 minutes

// Auto-migration
let _tableEnsured = false;
async function _ensureTable() {
  if (_tableEnsured) return;
  _tableEnsured = true;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS cognitive_signatures (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL,
        firm_id UUID NOT NULL,
        signature JSONB NOT NULL,
        dimension_metadata JSONB NOT NULL,
        total_dimensions INTEGER DEFAULT 0,
        observed_dimensions INTEGER DEFAULT 0,
        maturity_score DECIMAL(5,2) DEFAULT 0,
        version INTEGER DEFAULT 1,
        previous_signature JSONB,
        drift_magnitude DECIMAL(5,4),
        drift_dimensions TEXT[],
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, firm_id)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_cog_sig_user ON cognitive_signatures(user_id, firm_id)`);
  } catch (e) {
    if (!e.message?.includes('already exists')) {
      console.log('[CognitiveSignature] Auto-migration note:', e.message);
    }
  }
}

// =====================================================================
// CORE: Compute or load the cognitive signature
// =====================================================================

/**
 * Get the cognitive signature for an attorney.
 * Computes from current identity data if not stored, or loads stored version.
 * 
 * @param {string} userId
 * @param {string} firmId
 * @param {object} identity - The attorneyIdentity profile (optional, loaded if not provided)
 * @returns {object} { signature, metadata, maturity, version }
 */
export async function getCognitiveSignature(userId, firmId, identity = null) {
  const cacheKey = `${userId}:${firmId}`;
  const cached = signatureCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.signature;
  }
  
  await _ensureTable();
  
  try {
    // Load the identity if not provided
    if (!identity) {
      try {
        const { getAttorneyIdentity } = await import('./attorneyIdentity.js');
        identity = await getAttorneyIdentity(userId, firmId);
      } catch (e) {
        identity = null;
      }
    }
    
    // Load edit-learned preferences for additional signal
    let editSignals = [];
    try {
      const editResult = await query(`
        SELECT identity_dimension, signal_type, signal_data, confidence
        FROM edit_diff_signals
        WHERE user_id = $1 AND firm_id = $2 AND confidence >= 0.80
        ORDER BY confidence DESC
        LIMIT 20
      `, [userId, firmId]);
      editSignals = editResult.rows;
    } catch (_) {}
    
    // Load associative memory stats for thinking dimension inference
    let assocStats = null;
    try {
      const assocResult = await query(`
        SELECT COUNT(*) as edge_count, 
               AVG(strength) as avg_strength,
               COUNT(DISTINCT source_concept) as unique_sources
        FROM associative_memory_edges
        WHERE user_id = $1 AND firm_id = $2 AND strength >= 0.4
      `, [userId, firmId]);
      assocStats = assocResult.rows[0];
    } catch (_) {}
    
    // Compute the signature from all available data
    const signature = _computeSignature(identity, editSignals, assocStats);
    
    // Load previous signature for drift detection
    let previousSig = null;
    try {
      const prev = await query(
        `SELECT signature FROM cognitive_signatures WHERE user_id = $1 AND firm_id = $2`,
        [userId, firmId]
      );
      if (prev.rows.length > 0) {
        previousSig = typeof prev.rows[0].signature === 'string' 
          ? JSON.parse(prev.rows[0].signature) 
          : prev.rows[0].signature;
      }
    } catch (_) {}
    
    // Calculate drift
    const drift = previousSig ? _calculateDrift(previousSig, signature.values) : null;
    
    // Persist
    const result = {
      values: signature.values,
      metadata: signature.metadata,
      maturity: signature.maturity,
      observedDimensions: signature.observedDimensions,
      totalDimensions: TOTAL_DIMENSIONS,
      drift: drift,
      version: (previousSig ? 2 : 1), // Simplified version tracking
    };
    
    await _persistSignature(userId, firmId, result, previousSig);
    
    // Cache
    signatureCache.set(cacheKey, { signature: result, timestamp: Date.now() });
    
    console.log(`[CognitiveSignature] Computed signature for ${userId}: ${result.observedDimensions}/${TOTAL_DIMENSIONS} dimensions, maturity=${result.maturity.toFixed(1)}`);
    
    return result;
  } catch (e) {
    console.log('[CognitiveSignature] Compute note:', e.message);
    return _defaultSignature();
  }
}

// =====================================================================
// COMPUTATION: Convert qualitative identity data to continuous scores
// =====================================================================

function _computeSignature(identity, editSignals, assocStats) {
  const values = {};
  const metadata = {};
  
  // Initialize all dimensions with defaults
  for (const [dim, config] of Object.entries(SIGNATURE_DIMENSIONS)) {
    values[dim] = config.default;
    metadata[dim] = { confidence: 0, evidence_count: 0, source: 'default' };
  }
  
  if (!identity) {
    return { values, metadata, maturity: 0, observedDimensions: 0 };
  }
  
  const ws = identity.writingStyle || {};
  const tp = identity.thinkingPatterns || {};
  const cs = identity.communicationStyle || {};
  
  // ===== MAP WRITING STYLE TO CONTINUOUS SCORES =====
  
  if (ws.sentenceLength) {
    values.sentence_length = ws.sentenceLength === 'short' ? 0.25 : ws.sentenceLength === 'medium' ? 0.50 : 0.80;
    metadata.sentence_length = { confidence: 0.75, evidence_count: ws.sampleCount || 1, source: 'writing_analysis' };
  }
  
  if (ws.formality) {
    values.formality = ws.formality === 'casual' ? 0.20 : ws.formality === 'semiformal' ? 0.55 : 0.85;
    metadata.formality = { confidence: 0.75, evidence_count: ws.sampleCount || 1, source: 'writing_analysis' };
  }
  
  if (ws.structurePreference) {
    const structMap = { prose: 0.15, mixed: 0.45, bullets: 0.70, headers: 0.85 };
    values.structure_preference = structMap[ws.structurePreference] ?? 0.5;
    metadata.structure_preference = { confidence: 0.70, evidence_count: ws.sampleCount || 1, source: 'writing_analysis' };
  }
  
  if (ws.vocabularyLevel) {
    values.vocabulary_level = ws.vocabularyLevel === 'plain' ? 0.20 : ws.vocabularyLevel === 'moderate' ? 0.50 : 0.85;
    metadata.vocabulary_level = { confidence: 0.75, evidence_count: ws.sampleCount || 1, source: 'writing_analysis' };
  }
  
  if (ws.detailLevel) {
    values.detail_level = ws.detailLevel === 'concise' ? 0.20 : ws.detailLevel === 'moderate' ? 0.50 : 0.85;
    metadata.detail_level = { confidence: 0.70, evidence_count: ws.sampleCount || 1, source: 'writing_analysis' };
  }
  
  if (ws.prefersCitations) {
    values.citation_density = ws.prefersCitations === 'light' ? 0.20 : ws.prefersCitations === 'moderate' ? 0.50 : 0.85;
    metadata.citation_density = { confidence: 0.65, evidence_count: ws.sampleCount || 1, source: 'writing_analysis' };
  }
  
  if (ws.usesOxfordComma !== null && ws.usesOxfordComma !== undefined) {
    values.uses_oxford_comma = ws.usesOxfordComma ? 0.90 : 0.10;
    metadata.uses_oxford_comma = { confidence: 0.80, evidence_count: ws.sampleCount || 1, source: 'writing_analysis' };
  }
  
  // ===== MAP THINKING PATTERNS TO CONTINUOUS SCORES =====
  
  if (tp.riskTolerance) {
    values.risk_tolerance = tp.riskTolerance === 'conservative' ? 0.20 : tp.riskTolerance === 'moderate' ? 0.50 : 0.82;
    metadata.risk_tolerance = { confidence: 0.70, evidence_count: tp.sampleCount || 1, source: 'thinking_analysis' };
  }
  
  if (tp.analyticDepth) {
    values.analytic_depth = tp.analyticDepth === 'executive_summary' ? 0.20 : tp.analyticDepth === 'balanced' ? 0.50 : 0.85;
    metadata.analytic_depth = { confidence: 0.70, evidence_count: tp.sampleCount || 1, source: 'thinking_analysis' };
  }
  
  if (tp.recommendationStyle) {
    values.recommendation_style = tp.recommendationStyle === 'single_recommendation' ? 0.20 : 
                                   tp.recommendationStyle === 'pros_cons' ? 0.55 : 0.82;
    metadata.recommendation_style = { confidence: 0.65, evidence_count: tp.sampleCount || 1, source: 'thinking_analysis' };
  }
  
  if (tp.taskDelegationStyle) {
    values.delegation_specificity = tp.taskDelegationStyle === 'outcome_focused' ? 0.20 : 
                                     tp.taskDelegationStyle === 'minimal_direction' ? 0.35 : 0.80;
    metadata.delegation_specificity = { confidence: 0.65, evidence_count: tp.sampleCount || 1, source: 'thinking_analysis' };
  }
  
  if (tp.followUpFrequency) {
    values.follow_up_frequency = tp.followUpFrequency === 'hands_off' ? 0.15 : 
                                  tp.followUpFrequency === 'periodic' ? 0.50 : 0.85;
    metadata.follow_up_frequency = { confidence: 0.60, evidence_count: tp.sampleCount || 1, source: 'thinking_analysis' };
  }
  
  // ===== MAP TONE FROM WRITING AND COMMUNICATION STYLE =====
  
  if (ws.toneDefault) {
    const toneMap = {
      diplomatic: { assertiveness: 0.25, directness: 0.30 },
      cautious: { assertiveness: 0.30, directness: 0.25 },
      direct: { assertiveness: 0.65, directness: 0.80 },
      assertive: { assertiveness: 0.85, directness: 0.75 },
    };
    const tone = toneMap[ws.toneDefault];
    if (tone) {
      values.assertiveness = tone.assertiveness;
      values.directness = tone.directness;
      metadata.assertiveness = { confidence: 0.70, evidence_count: ws.sampleCount || 1, source: 'tone_analysis' };
      metadata.directness = { confidence: 0.70, evidence_count: ws.sampleCount || 1, source: 'tone_analysis' };
    }
  }
  
  if (cs.clientTone) {
    const warmthMap = {
      'warm-but-direct': 0.70, 'warm-professional': 0.75,
      'direct-professional': 0.35, 'neutral-professional': 0.45,
    };
    if (warmthMap[cs.clientTone] !== undefined) {
      values.warmth = warmthMap[cs.clientTone];
      metadata.warmth = { confidence: 0.65, evidence_count: cs.sampleCount || 1, source: 'comm_analysis' };
    }
  }
  
  // ===== INCORPORATE EDIT DIFF SIGNALS (highest confidence) =====
  
  for (const signal of editSignals) {
    const data = typeof signal.signal_data === 'string' ? JSON.parse(signal.signal_data) : signal.signal_data;
    const dim = signal.identity_dimension;
    const conf = parseFloat(signal.confidence);
    
    if (dim === 'detail_level' && signal.signal_type === 'substitution') {
      // If they shortened content, push detail_level lower
      if (data.edited_text && data.original_text && data.edited_text.length < data.original_text.length * 0.7) {
        values.detail_level = Math.max(0.1, values.detail_level - 0.1);
        metadata.detail_level = { confidence: Math.max(metadata.detail_level?.confidence || 0, conf), evidence_count: (metadata.detail_level?.evidence_count || 0) + 1, source: 'edit_diff' };
      }
    }
    
    if (dim === 'tone' && signal.signal_type === 'substitution') {
      // Formality shift detected from edits
      const origFormal = (data.original_text || '').match(/\b(pursuant|hereby|notwithstanding)\b/gi)?.length || 0;
      const editFormal = (data.edited_text || '').match(/\b(pursuant|hereby|notwithstanding)\b/gi)?.length || 0;
      if (origFormal > editFormal) {
        values.formality = Math.max(0.1, values.formality - 0.1);
        values.vocabulary_level = Math.max(0.1, values.vocabulary_level - 0.1);
      }
    }
    
    if (dim === 'content_preference' && signal.signal_type === 'addition') {
      // They added action items → high action_item_emphasis
      if (/next step|action|follow.?up|recommend/i.test(data.added_text || '')) {
        values.action_item_emphasis = Math.min(0.95, values.action_item_emphasis + 0.1);
        metadata.action_item_emphasis = { confidence: conf, evidence_count: (metadata.action_item_emphasis?.evidence_count || 0) + 1, source: 'edit_diff' };
      }
    }
  }
  
  // ===== INFER FROM CORRECTION PRINCIPLES =====
  
  if (identity.correctionPrinciples) {
    for (const principle of identity.correctionPrinciples) {
      const p = principle.principle.toLowerCase();
      
      if (/concise|point|cut|filler|brief/i.test(p)) {
        values.detail_level = Math.max(0.1, values.detail_level - 0.08);
      }
      if (/thorough|detail|comprehensive|exhaustive/i.test(p)) {
        values.detail_level = Math.min(0.95, values.detail_level + 0.08);
      }
      if (/next step|action item|follow/i.test(p)) {
        values.action_item_emphasis = Math.min(0.95, values.action_item_emphasis + 0.08);
      }
      if (/specific|not generic|real|actual/i.test(p)) {
        values.detail_level = Math.min(0.95, values.detail_level + 0.05);
      }
      if (/assertive|strong|aggressive/i.test(p)) {
        values.assertiveness = Math.min(0.95, values.assertiveness + 0.08);
      }
      if (/diplomatic|measured|soft/i.test(p)) {
        values.assertiveness = Math.max(0.1, values.assertiveness - 0.08);
      }
    }
  }
  
  // ===== CALCULATE MATURITY =====
  
  let observedDimensions = 0;
  let totalConfidence = 0;
  for (const [dim, meta] of Object.entries(metadata)) {
    if (meta.confidence > 0.5) {
      observedDimensions++;
      totalConfidence += meta.confidence;
    }
  }
  
  const maturity = TOTAL_DIMENSIONS > 0
    ? (observedDimensions / TOTAL_DIMENSIONS) * (totalConfidence / Math.max(observedDimensions, 1)) * 100
    : 0;
  
  return { values, metadata, maturity: Math.min(100, maturity), observedDimensions };
}

// =====================================================================
// DRIFT DETECTION: How much has the signature changed?
// =====================================================================

function _calculateDrift(previousSig, currentSig) {
  let totalDrift = 0;
  let driftCount = 0;
  const driftDimensions = [];
  
  for (const [dim, currentVal] of Object.entries(currentSig)) {
    const prevVal = previousSig[dim];
    if (prevVal !== undefined && prevVal !== null) {
      const diff = Math.abs(currentVal - prevVal);
      totalDrift += diff;
      driftCount++;
      if (diff > 0.1) {
        driftDimensions.push(dim);
      }
    }
  }
  
  return {
    magnitude: driftCount > 0 ? totalDrift / driftCount : 0,
    dimensions: driftDimensions,
    count: driftCount,
  };
}

// =====================================================================
// RENDERING: Convert signature to prompt text for current model
// =====================================================================

/**
 * Render the cognitive signature as prompt text.
 * This is the model-facing translation layer.
 * 
 * When models change, only this function needs to be updated.
 * The signature itself is stable and portable.
 */
export function renderSignatureForPrompt(signature) {
  if (!signature || !signature.values || signature.observedDimensions < 3) return '';
  
  const v = signature.values;
  const parts = [];
  
  parts.push(`\n## COGNITIVE SIGNATURE (${signature.observedDimensions}/${signature.totalDimensions} dimensions mapped)`);
  
  // Only render dimensions with meaningful deviation from default
  const renderables = [];
  for (const [dim, config] of Object.entries(SIGNATURE_DIMENSIONS)) {
    const val = v[dim];
    const meta = signature.metadata?.[dim];
    if (meta && meta.confidence > 0.5 && Math.abs(val - config.default) > 0.1) {
      renderables.push({ dim, val, config, confidence: meta.confidence });
    }
  }
  
  if (renderables.length === 0) return '';
  
  // Group by category
  const byCategory = {};
  for (const r of renderables) {
    const cat = r.config.category;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(r);
  }
  
  for (const [category, dims] of Object.entries(byCategory)) {
    const categoryLabel = category.replace('_', ' ').toUpperCase();
    const dimStrs = dims.map(d => {
      const position = d.val < 0.35 ? d.config.lowLabel : d.val > 0.65 ? d.config.highLabel : 'moderate';
      return `${d.config.label}: ${position} (${Math.round(d.val * 100)}%)`;
    });
    parts.push(`**${categoryLabel}:** ${dimStrs.join(' | ')}`);
  }
  
  return parts.join('\n');
}

// =====================================================================
// PERSISTENCE
// =====================================================================

async function _persistSignature(userId, firmId, result, previousSig) {
  try {
    await query(`
      INSERT INTO cognitive_signatures 
        (user_id, firm_id, signature, dimension_metadata, total_dimensions,
         observed_dimensions, maturity_score, previous_signature, 
         drift_magnitude, drift_dimensions)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (user_id, firm_id)
      DO UPDATE SET
        signature = $3, dimension_metadata = $4,
        observed_dimensions = $6, maturity_score = $7,
        previous_signature = cognitive_signatures.signature,
        drift_magnitude = $9, drift_dimensions = $10,
        version = cognitive_signatures.version + 1,
        updated_at = NOW()
    `, [
      userId, firmId,
      JSON.stringify(result.values),
      JSON.stringify(result.metadata),
      TOTAL_DIMENSIONS,
      result.observedDimensions,
      result.maturity,
      previousSig ? JSON.stringify(previousSig) : null,
      result.drift?.magnitude || null,
      result.drift?.dimensions || null,
    ]);
  } catch (e) {
    // Non-fatal
    if (!e.message?.includes('cognitive_signatures')) {
      console.log('[CognitiveSignature] Persist note:', e.message);
    }
  }
}

function _defaultSignature() {
  const values = {};
  const metadata = {};
  for (const [dim, config] of Object.entries(SIGNATURE_DIMENSIONS)) {
    values[dim] = config.default;
    metadata[dim] = { confidence: 0, evidence_count: 0, source: 'default' };
  }
  return { values, metadata, maturity: 0, observedDimensions: 0, totalDimensions: TOTAL_DIMENSIONS, drift: null, version: 0 };
}

/**
 * Invalidate cache (called after identity updates, edit diffs, etc.)
 */
export function invalidateSignatureCache(userId, firmId) {
  signatureCache.delete(`${userId}:${firmId}`);
}
