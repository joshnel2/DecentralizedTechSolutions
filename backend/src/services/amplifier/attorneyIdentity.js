/**
 * Attorney Identity Learning System
 * 
 * THE CORE THESIS: The future of legal AI is not smarter models (that's coming
 * for free from OpenAI/Anthropic). The future is an AI that becomes MORE AND
 * MORE like the specific attorney over time. This is the Neuralink bridge —
 * an externalized version of how a specific human thinks, writes, and decides.
 * 
 * This module builds a deep, evolving identity profile for each attorney:
 * 
 * 1. WRITING STYLE — How they write: sentence length, vocabulary, formality,
 *    structure preferences, tone in different contexts
 * 
 * 2. THINKING PATTERNS — How they reason: aggressive vs conservative, detail
 *    level, risk tolerance, preferred argument structure
 * 
 * 3. CORRECTION PRINCIPLES — Not just "what they said was wrong" but the
 *    PRINCIPLE behind it: "this attorney always wants dates bolded" or
 *    "this attorney prefers 3 options, never 1 recommendation"
 * 
 * 4. PREFERENCE HIERARCHY — What matters MORE to them: accuracy vs speed,
 *    thoroughness vs brevity, formal vs accessible language
 * 
 * 5. COMMUNICATION STYLE — How they talk to clients vs courts vs opposing
 *    counsel, different tones for different audiences
 * 
 * 6. IDENTITY MATURITY — A score (0-100) tracking how well the system knows
 *    this attorney. As maturity grows, the generic junior attorney brief
 *    FADES and is replaced by this attorney-specific identity.
 * 
 * PRIVACY: Everything is scoped to user_id + firm_id. Never shared across firms.
 * The identity belongs to the attorney and lives with their account.
 */

import { query } from '../../db/connection.js';

// =====================================================================
// IDENTITY MATURITY THRESHOLDS
// These control when the generic brief starts fading
// =====================================================================

/**
 * Identity maturity levels:
 * 0-15:   NASCENT    - Brand new, know almost nothing. Full generic brief.
 * 16-35:  EMERGING   - Some patterns visible. Brief stays but profile injected.
 * 36-55:  DEVELOPING - Clear personality emerging. Brief starts thinning.
 * 56-75:  STRONG     - Rich identity. Brief mostly replaced by identity.
 * 76-100: MIRROR     - Deep knowledge. Brief completely replaced. Agent IS the attorney.
 */
export const MATURITY_LEVELS = {
  NASCENT:    { min: 0,  max: 15,  briefWeight: 1.0,  identityWeight: 0.0, label: 'nascent' },
  EMERGING:   { min: 16, max: 35,  briefWeight: 0.8,  identityWeight: 0.3, label: 'emerging' },
  DEVELOPING: { min: 36, max: 55,  briefWeight: 0.5,  identityWeight: 0.6, label: 'developing' },
  STRONG:     { min: 56, max: 75,  briefWeight: 0.2,  identityWeight: 0.9, label: 'strong' },
  MIRROR:     { min: 76, max: 100, briefWeight: 0.0,  identityWeight: 1.0, label: 'mirror' },
};

// Cache for identity profiles (hot path: loaded at task start)
const identityCache = new Map();
const CACHE_TTL_MS = 120000; // 2 minutes (shorter than lawyerProfile because identity is more critical)

// Auto-migration: ensure the table exists on first use
let _tableEnsured = false;
async function _ensureTable() {
  if (_tableEnsured) return;
  _tableEnsured = true;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS attorney_identity_dimensions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL,
        firm_id UUID NOT NULL,
        dimension_name VARCHAR(100) NOT NULL,
        dimension_value JSONB NOT NULL,
        confidence DECIMAL(3,2) DEFAULT 0.50,
        evidence_count INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_attorney_identity_user_firm ON attorney_identity_dimensions(user_id, firm_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_attorney_identity_dimension ON attorney_identity_dimensions(user_id, firm_id, dimension_name)`);
  } catch (e) {
    // Non-fatal: might not have DDL permissions
    if (!e.message?.includes('already exists')) {
      console.log('[AttorneyIdentity] Auto-migration note:', e.message);
    }
  }
}

// =====================================================================
// CORE: Load or Build Attorney Identity
// =====================================================================

/**
 * Load the full attorney identity profile.
 * This is the primary API — called at task start in amplifierService.
 * 
 * Returns a structured identity object with:
 * - writingStyle: extracted patterns from their documents and feedback
 * - thinkingPatterns: how they reason and make decisions
 * - correctionPrinciples: extracted principles from rejections/corrections
 * - preferenceHierarchy: what they care about most
 * - communicationStyle: how they address different audiences
 * - maturity: how well the system knows them (0-100)
 * - maturityLevel: which threshold level they're at
 */
export async function getAttorneyIdentity(userId, firmId) {
  // Check cache
  const cacheKey = `${userId}:${firmId}`;
  const cached = identityCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.identity;
  }

  // Ensure the identity table exists (lazy auto-migration)
  await _ensureTable();

  try {
    const identity = {
      userId,
      firmId,
      writingStyle: {},
      thinkingPatterns: {},
      correctionPrinciples: [],
      preferenceHierarchy: [],
      communicationStyle: {},
      maturity: 0,
      maturityLevel: MATURITY_LEVELS.NASCENT,
      rawDimensions: {},  // Individual dimension scores for maturity calc
    };

    // ===== 1. Load stored identity dimensions from DB =====
    const storedDimensions = await _loadStoredDimensions(userId, firmId);
    
    // ===== 2. Load correction principles from feedback =====
    const principles = await _loadCorrectionPrinciples(userId, firmId);
    identity.correctionPrinciples = principles;

    // ===== 3. Analyze writing style from created documents =====
    const writingStyle = await _analyzeWritingStyle(userId, firmId);
    identity.writingStyle = writingStyle;

    // ===== 4. Analyze thinking patterns from task history =====
    const thinkingPatterns = await _analyzeThinkingPatterns(userId, firmId);
    identity.thinkingPatterns = thinkingPatterns;

    // ===== 5. Extract preference hierarchy from feedback patterns =====
    const preferences = await _extractPreferenceHierarchy(userId, firmId, storedDimensions);
    identity.preferenceHierarchy = preferences;

    // ===== 6. Analyze communication style differences =====
    const commStyle = await _analyzeCommunicationStyle(userId, firmId);
    identity.communicationStyle = commStyle;

    // ===== 7. Merge stored dimensions =====
    for (const dim of storedDimensions) {
      identity.rawDimensions[dim.dimension_name] = {
        value: dim.dimension_value,
        confidence: parseFloat(dim.confidence),
        evidence_count: dim.evidence_count,
        updated_at: dim.updated_at,
      };
    }

    // ===== 8. Calculate maturity score =====
    identity.maturity = _calculateMaturity(identity);
    identity.maturityLevel = _getMaturityLevel(identity.maturity);

    // Cache it
    identityCache.set(cacheKey, { identity, timestamp: Date.now() });

    console.log(`[AttorneyIdentity] Profile for user ${userId}: maturity=${identity.maturity} (${identity.maturityLevel.label}), ${principles.length} correction principles, ${Object.keys(writingStyle).length} style dimensions`);

    return identity;
  } catch (error) {
    console.error('[AttorneyIdentity] Error building identity:', error.message);
    // Return a minimal identity so the system still works
    return {
      userId, firmId,
      writingStyle: {}, thinkingPatterns: {},
      correctionPrinciples: [], preferenceHierarchy: [],
      communicationStyle: {},
      maturity: 0,
      maturityLevel: MATURITY_LEVELS.NASCENT,
      rawDimensions: {},
    };
  }
}

// =====================================================================
// WRITING STYLE ANALYSIS
// Extracts HOW the attorney writes from their documents and notes
// =====================================================================

async function _analyzeWritingStyle(userId, firmId) {
  const style = {
    sentenceLength: null,       // 'short' | 'medium' | 'long'
    formality: null,            // 'formal' | 'semiformal' | 'casual'
    structurePreference: null,  // 'headers' | 'prose' | 'bullets' | 'mixed'
    vocabularyLevel: null,      // 'plain' | 'moderate' | 'technical'
    detailLevel: null,          // 'concise' | 'moderate' | 'exhaustive'
    toneDefault: null,          // 'direct' | 'diplomatic' | 'assertive' | 'cautious'
    usesOxfordComma: null,      // true | false
    prefersCitations: null,     // 'heavy' | 'moderate' | 'light'
    sampleCount: 0,
  };

  try {
    // Pull recent documents and notes created by this attorney
    // (not by the agent — we want THEIR writing style)
    const docsResult = await query(`
      SELECT content_text FROM documents
      WHERE firm_id = $1 AND uploaded_by = $2
        AND content_text IS NOT NULL AND LENGTH(content_text) > 200
        AND uploaded_at > NOW() - INTERVAL '180 days'
      ORDER BY uploaded_at DESC LIMIT 15
    `, [firmId, userId]);

    const notesResult = await query(`
      SELECT mn.content FROM matter_notes mn
      JOIN matters m ON mn.matter_id = m.id
      WHERE m.firm_id = $1 AND mn.created_by = $2
        AND LENGTH(mn.content) > 100
        AND mn.created_at > NOW() - INTERVAL '180 days'
      ORDER BY mn.created_at DESC LIMIT 20
    `, [firmId, userId]);

    const allTexts = [
      ...docsResult.rows.map(r => r.content_text),
      ...notesResult.rows.map(r => r.content),
    ];

    if (allTexts.length === 0) return style;
    style.sampleCount = allTexts.length;

    // Analyze combined text samples
    const combined = allTexts.join('\n\n');
    const sentences = combined.split(/[.!?]+/).filter(s => s.trim().length > 10);

    // --- Sentence length ---
    if (sentences.length >= 5) {
      const avgLen = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / sentences.length;
      if (avgLen < 12) style.sentenceLength = 'short';
      else if (avgLen < 22) style.sentenceLength = 'medium';
      else style.sentenceLength = 'long';
    }

    // --- Structure preference ---
    const headerCount = (combined.match(/^#{1,4}\s|^[A-Z][A-Z\s]{3,}:/gm) || []).length;
    const bulletCount = (combined.match(/^[\s]*[-•*]\s/gm) || []).length;
    const totalParagraphs = (combined.match(/\n\n/g) || []).length + 1;

    if (headerCount > totalParagraphs * 0.3) style.structurePreference = 'headers';
    else if (bulletCount > sentences.length * 0.4) style.structurePreference = 'bullets';
    else if (headerCount > 2 || bulletCount > 5) style.structurePreference = 'mixed';
    else style.structurePreference = 'prose';

    // --- Formality ---
    const informalMarkers = (combined.match(/\b(gonna|wanna|kinda|yeah|nope|btw|fyi|asap|ok)\b/gi) || []).length;
    const formalMarkers = (combined.match(/\b(hereby|whereas|notwithstanding|forthwith|aforementioned|pursuant|thereof)\b/gi) || []).length;
    const totalWords = combined.split(/\s+/).length;
    const informalRate = informalMarkers / Math.max(totalWords, 1) * 1000;
    const formalRate = formalMarkers / Math.max(totalWords, 1) * 1000;
    
    if (formalRate > 2) style.formality = 'formal';
    else if (informalRate > 1) style.formality = 'casual';
    else style.formality = 'semiformal';

    // --- Vocabulary level ---
    const legalTerms = (combined.match(/\b(pursuant|notwithstanding|herein|thereof|whereas|prima facie|res judicata|stare decisis|de novo|sua sponte|inter alia|supra|infra)\b/gi) || []).length;
    const legalRate = legalTerms / Math.max(totalWords, 1) * 1000;
    
    if (legalRate > 3) style.vocabularyLevel = 'technical';
    else if (legalRate > 1) style.vocabularyLevel = 'moderate';
    else style.vocabularyLevel = 'plain';

    // --- Detail level (based on document length distribution) ---
    const avgDocLength = allTexts.reduce((sum, t) => sum + t.length, 0) / allTexts.length;
    if (avgDocLength < 500) style.detailLevel = 'concise';
    else if (avgDocLength < 2000) style.detailLevel = 'moderate';
    else style.detailLevel = 'exhaustive';

    // --- Oxford comma ---
    const oxfordYes = (combined.match(/,\s+\w+,\s+and\s/g) || []).length;
    const oxfordNo = (combined.match(/,\s+\w+\s+and\s/g) || []).length;
    if (oxfordYes + oxfordNo >= 3) {
      style.usesOxfordComma = oxfordYes > oxfordNo;
    }

    // --- Tone ---
    const assertiveMarkers = (combined.match(/\b(must|shall|clearly|obviously|undoubtedly|certainly)\b/gi) || []).length;
    const cautiousMarkers = (combined.match(/\b(may|might|perhaps|possibly|potentially|arguably|it appears)\b/gi) || []).length;
    const directMarkers = (combined.match(/\b(we recommend|we advise|you should|the answer is|we will)\b/gi) || []).length;
    const diplomaticMarkers = (combined.match(/\b(we suggest|you may wish|for your consideration|one option|another approach)\b/gi) || []).length;

    const toneScores = [
      { tone: 'assertive', score: assertiveMarkers },
      { tone: 'cautious', score: cautiousMarkers },
      { tone: 'direct', score: directMarkers },
      { tone: 'diplomatic', score: diplomaticMarkers },
    ].sort((a, b) => b.score - a.score);

    if (toneScores[0].score > 3) {
      style.toneDefault = toneScores[0].tone;
    }

    // --- Citation density ---
    const citationCount = (combined.match(/\d+\s+(?:F\.|U\.S\.|S\.Ct\.|N\.Y\.|A\.D\.)/g) || []).length +
                          (combined.match(/§\s*\d+/g) || []).length +
                          (combined.match(/CPLR\s*§?\s*\d+/gi) || []).length;
    const citationRate = citationCount / allTexts.length;
    
    if (citationRate > 5) style.prefersCitations = 'heavy';
    else if (citationRate > 1) style.prefersCitations = 'moderate';
    else style.prefersCitations = 'light';

  } catch (error) {
    // Non-fatal: empty writing style is fine for new users
    if (!error.message?.includes('does not exist')) {
      console.log('[AttorneyIdentity] Writing style analysis note:', error.message);
    }
  }

  return style;
}

// =====================================================================
// THINKING PATTERNS
// How the attorney reasons and makes decisions
// =====================================================================

async function _analyzeThinkingPatterns(userId, firmId) {
  const patterns = {
    riskTolerance: null,           // 'aggressive' | 'moderate' | 'conservative'
    recommendationStyle: null,     // 'single_recommendation' | 'multiple_options' | 'pros_cons'
    analyticDepth: null,           // 'executive_summary' | 'balanced' | 'deep_dive'
    decisionSpeed: null,           // 'fast_decisive' | 'deliberate' | 'thorough_slow'
    taskDelegationStyle: null,     // 'specific_instructions' | 'outcome_focused' | 'minimal_direction'
    followUpFrequency: null,       // 'hands_on' | 'periodic' | 'hands_off'
    sampleCount: 0,
  };

  try {
    // Analyze from their task history (goals, feedback, patterns)
    const tasksResult = await query(`
      SELECT goal, status, feedback_rating, feedback_text, review_status, review_feedback,
             EXTRACT(EPOCH FROM (completed_at - started_at)) as duration_seconds,
             iterations, result, progress
      FROM ai_background_tasks
      WHERE user_id = $1 AND firm_id = $2
        AND completed_at IS NOT NULL
      ORDER BY completed_at DESC LIMIT 30
    `, [userId, firmId]);

    const tasks = tasksResult.rows;
    if (tasks.length < 3) return patterns;
    patterns.sampleCount = tasks.length;

    // --- Task delegation style (from how they phrase goals) ---
    const goals = tasks.map(t => t.goal.toLowerCase());
    const specificGoals = goals.filter(g => 
      /step\s*\d|first.*then|make sure|include|format|structure/i.test(g)
    ).length;
    const outcomeGoals = goals.filter(g =>
      /review|prepare|draft|analyze|summarize|create/i.test(g) && 
      !/step|first|then|include|format/i.test(g)
    ).length;

    if (specificGoals > goals.length * 0.5) patterns.taskDelegationStyle = 'specific_instructions';
    else if (outcomeGoals > goals.length * 0.6) patterns.taskDelegationStyle = 'outcome_focused';
    else patterns.taskDelegationStyle = 'minimal_direction';

    // --- Decision speed (from how quickly they review) ---
    const reviewedTasks = tasks.filter(t => t.review_status);
    if (reviewedTasks.length >= 3) {
      const approved = reviewedTasks.filter(t => t.review_status === 'approved').length;
      const rejected = reviewedTasks.filter(t => t.review_status === 'rejected').length;
      const approvalRate = approved / reviewedTasks.length;
      
      // High approval rate + few rejections = trusts quickly
      if (approvalRate > 0.8) patterns.followUpFrequency = 'hands_off';
      else if (rejected > approved) patterns.followUpFrequency = 'hands_on';
      else patterns.followUpFrequency = 'periodic';
    }

    // --- Risk tolerance & analytic depth (from feedback patterns) ---
    const feedbacks = tasks
      .filter(t => t.feedback_text || t.review_feedback)
      .map(t => (t.feedback_text || '') + ' ' + (t.review_feedback || ''));

    const combinedFeedback = feedbacks.join(' ').toLowerCase();
    
    if (combinedFeedback.length > 50) {
      // Risk tolerance
      const aggressiveSignals = (combinedFeedback.match(/\b(more aggressive|push harder|stronger|bolder|assert)\b/g) || []).length;
      const conservativeSignals = (combinedFeedback.match(/\b(too aggressive|careful|conservative|cautious|hedge|soften)\b/g) || []).length;
      
      if (aggressiveSignals > conservativeSignals) patterns.riskTolerance = 'aggressive';
      else if (conservativeSignals > aggressiveSignals) patterns.riskTolerance = 'conservative';
      else patterns.riskTolerance = 'moderate';

      // Analytic depth
      const moreDetailSignals = (combinedFeedback.match(/\b(more detail|deeper|thorough|expand|elaborate|comprehensive)\b/g) || []).length;
      const lessDetailSignals = (combinedFeedback.match(/\b(too long|shorter|concise|brief|executive summary|bottom line)\b/g) || []).length;
      
      if (moreDetailSignals > lessDetailSignals) patterns.analyticDepth = 'deep_dive';
      else if (lessDetailSignals > moreDetailSignals) patterns.analyticDepth = 'executive_summary';
      else patterns.analyticDepth = 'balanced';

      // Recommendation style
      const optionsSignals = (combinedFeedback.match(/\b(options|alternatives|pros.*cons|compare|choices)\b/g) || []).length;
      const singleRecSignals = (combinedFeedback.match(/\b(just tell me|recommendation|what should|your call|decide)\b/g) || []).length;
      
      if (optionsSignals > singleRecSignals) patterns.recommendationStyle = 'multiple_options';
      else if (singleRecSignals > optionsSignals) patterns.recommendationStyle = 'single_recommendation';
      else patterns.recommendationStyle = 'pros_cons';
    }

  } catch (error) {
    if (!error.message?.includes('does not exist')) {
      console.log('[AttorneyIdentity] Thinking patterns note:', error.message);
    }
  }

  return patterns;
}

// =====================================================================
// CORRECTION PRINCIPLES
// The KEY innovation: extract PRINCIPLES from feedback, not just store text.
// "Too wordy" → PRINCIPLE: "prefers concise output"
// "Missing dates" → PRINCIPLE: "always include specific dates"
// =====================================================================

async function _loadCorrectionPrinciples(userId, firmId) {
  const principles = [];

  try {
    // Load explicitly stored principles
    const stored = await query(`
      SELECT dimension_value, confidence, evidence_count, updated_at
      FROM attorney_identity_dimensions
      WHERE user_id = $1 AND firm_id = $2 AND dimension_name = 'correction_principle'
      ORDER BY confidence DESC, evidence_count DESC
      LIMIT 20
    `, [userId, firmId]);

    for (const row of stored.rows) {
      const val = typeof row.dimension_value === 'string' ? JSON.parse(row.dimension_value) : row.dimension_value;
      principles.push({
        principle: val.principle,
        source: val.source || 'feedback',
        evidence: val.evidence || '',
        confidence: parseFloat(row.confidence),
        evidenceCount: row.evidence_count,
      });
    }

    // Also extract from recent rejection feedback that hasn't been principled yet
    const rejections = await query(`
      SELECT review_feedback, goal, id FROM ai_background_tasks
      WHERE user_id = $1 AND firm_id = $2
        AND review_status = 'rejected'
        AND review_feedback IS NOT NULL
        AND completed_at > NOW() - INTERVAL '90 days'
      ORDER BY completed_at DESC LIMIT 10
    `, [userId, firmId]);

    // Extract principles from rejection text (rule-based extraction)
    for (const rej of rejections.rows) {
      const extracted = _extractPrinciplesFromFeedback(rej.review_feedback, rej.goal);
      for (const p of extracted) {
        // Only add if not already covered by a stored principle
        const isDuplicate = principles.some(existing => 
          existing.principle.toLowerCase().includes(p.principle.toLowerCase().substring(0, 30)) ||
          p.principle.toLowerCase().includes(existing.principle.toLowerCase().substring(0, 30))
        );
        if (!isDuplicate) {
          principles.push(p);
        }
      }
    }

  } catch (error) {
    if (!error.message?.includes('does not exist')) {
      console.log('[AttorneyIdentity] Correction principles note:', error.message);
    }
  }

  return principles.slice(0, 15); // Cap at 15 most important principles
}

/**
 * Extract actionable principles from rejection feedback text.
 * This is where raw human feedback becomes structured learning.
 */
function _extractPrinciplesFromFeedback(feedback, goal = '') {
  if (!feedback || feedback.length < 10) return [];
  
  const principles = [];
  const fb = feedback.toLowerCase();

  // --- Length / detail preferences ---
  if (/too (short|brief|thin|shallow)/i.test(fb)) {
    principles.push({
      principle: 'This attorney wants MORE detail and longer, more thorough work product',
      source: 'rejection',
      evidence: feedback.substring(0, 150),
      confidence: 0.85,
      evidenceCount: 1,
    });
  }
  if (/too (long|verbose|wordy|much detail)/i.test(fb)) {
    principles.push({
      principle: 'This attorney prefers CONCISE output — get to the point, cut the filler',
      source: 'rejection',
      evidence: feedback.substring(0, 150),
      confidence: 0.85,
      evidenceCount: 1,
    });
  }

  // --- Specificity preferences ---
  if (/generic|boilerplate|not specific|vague|cookie.?cutter/i.test(fb)) {
    principles.push({
      principle: 'NEVER produce generic work — every sentence must reference specific facts, dates, names from the actual matter',
      source: 'rejection',
      evidence: feedback.substring(0, 150),
      confidence: 0.9,
      evidenceCount: 1,
    });
  }

  // --- Tone preferences ---
  if (/too (formal|stiff|stilted)/i.test(fb)) {
    principles.push({
      principle: 'This attorney prefers a less formal, more natural writing tone',
      source: 'rejection',
      evidence: feedback.substring(0, 150),
      confidence: 0.8,
      evidenceCount: 1,
    });
  }
  if (/too (casual|informal|loose)/i.test(fb)) {
    principles.push({
      principle: 'This attorney requires formal, professional tone in all work product',
      source: 'rejection',
      evidence: feedback.substring(0, 150),
      confidence: 0.8,
      evidenceCount: 1,
    });
  }
  if (/too (aggressive|strong|harsh)/i.test(fb)) {
    principles.push({
      principle: 'This attorney prefers a measured, diplomatic tone — avoid aggressive language',
      source: 'rejection',
      evidence: feedback.substring(0, 150),
      confidence: 0.8,
      evidenceCount: 1,
    });
  }
  if (/too (soft|weak|passive)/i.test(fb) || /more (aggressive|assertive|strong)/i.test(fb)) {
    principles.push({
      principle: 'This attorney prefers assertive, strong language — be direct and decisive',
      source: 'rejection',
      evidence: feedback.substring(0, 150),
      confidence: 0.8,
      evidenceCount: 1,
    });
  }

  // --- Structure preferences ---
  if (/need.*header|needs.*section|organize|structure|format/i.test(fb)) {
    principles.push({
      principle: 'This attorney wants well-structured documents with clear headers and sections',
      source: 'rejection',
      evidence: feedback.substring(0, 150),
      confidence: 0.75,
      evidenceCount: 1,
    });
  }
  if (/bullet|list|point form/i.test(fb)) {
    principles.push({
      principle: 'This attorney prefers bullet points and lists over lengthy paragraphs',
      source: 'rejection',
      evidence: feedback.substring(0, 150),
      confidence: 0.75,
      evidenceCount: 1,
    });
  }

  // --- Content requirements ---
  if (/miss.*deadline|didn.*check.*calendar|deadline|date/i.test(fb)) {
    principles.push({
      principle: 'ALWAYS check and highlight deadlines — this attorney was burned by missed deadlines before',
      source: 'rejection',
      evidence: feedback.substring(0, 150),
      confidence: 0.9,
      evidenceCount: 1,
    });
  }
  if (/cit(ation|e)|authority|case law|source/i.test(fb)) {
    principles.push({
      principle: 'This attorney requires proper legal citations and authority for every legal claim',
      source: 'rejection',
      evidence: feedback.substring(0, 150),
      confidence: 0.85,
      evidenceCount: 1,
    });
  }
  if (/next step|action item|follow.*up|what.*do.*next/i.test(fb)) {
    principles.push({
      principle: 'ALWAYS include clear, specific next steps and action items — this attorney expects them',
      source: 'rejection',
      evidence: feedback.substring(0, 150),
      confidence: 0.85,
      evidenceCount: 1,
    });
  }
  if (/option|alternative|choice|recommend/i.test(fb)) {
    principles.push({
      principle: 'This attorney wants to see multiple options with pros/cons, not just one recommendation',
      source: 'rejection',
      evidence: feedback.substring(0, 150),
      confidence: 0.8,
      evidenceCount: 1,
    });
  }
  if (/didn.t read|didn.t review|missed|overlook/i.test(fb)) {
    principles.push({
      principle: 'Read EVERYTHING in the matter file thoroughly before producing work — this attorney caught omissions before',
      source: 'rejection',
      evidence: feedback.substring(0, 150),
      confidence: 0.9,
      evidenceCount: 1,
    });
  }

  // --- Risk and analysis preferences ---
  if (/risk|downside|worst case|liability|exposure/i.test(fb)) {
    principles.push({
      principle: 'This attorney wants explicit risk analysis — identify downsides, worst-case scenarios, and liability exposure',
      source: 'rejection',
      evidence: feedback.substring(0, 150),
      confidence: 0.8,
      evidenceCount: 1,
    });
  }

  // --- If we couldn't extract specific principles, create a general one from the text ---
  if (principles.length === 0 && feedback.length > 20) {
    principles.push({
      principle: `Attorney correction: "${feedback.substring(0, 200)}"`,
      source: 'rejection_raw',
      evidence: feedback.substring(0, 150),
      confidence: 0.6,
      evidenceCount: 1,
    });
  }

  return principles;
}

// =====================================================================
// PREFERENCE HIERARCHY
// What matters MORE to this attorney
// =====================================================================

async function _extractPreferenceHierarchy(userId, firmId, storedDimensions) {
  const preferences = [];

  try {
    // Load explicitly stored preferences
    const prefDims = storedDimensions.filter(d => d.dimension_name === 'preference_rank');
    for (const dim of prefDims) {
      const val = typeof dim.dimension_value === 'string' ? JSON.parse(dim.dimension_value) : dim.dimension_value;
      preferences.push({
        dimension: val.dimension,
        preference: val.preference,
        importance: val.importance || 'high',
        confidence: parseFloat(dim.confidence),
      });
    }

    // Infer from feedback patterns
    const feedbackResult = await query(`
      SELECT feedback_text, feedback_rating, review_feedback, review_status
      FROM ai_background_tasks
      WHERE user_id = $1 AND firm_id = $2
        AND (feedback_text IS NOT NULL OR review_feedback IS NOT NULL)
        AND completed_at > NOW() - INTERVAL '120 days'
      ORDER BY completed_at DESC LIMIT 30
    `, [userId, firmId]);

    // Count mentions of different dimensions in feedback
    const dimensionMentions = {
      accuracy: 0,
      thoroughness: 0,
      brevity: 0,
      speed: 0,
      formatting: 0,
      deadlines: 0,
      citations: 0,
      tone: 0,
      next_steps: 0,
    };

    for (const row of feedbackResult.rows) {
      const text = ((row.feedback_text || '') + ' ' + (row.review_feedback || '')).toLowerCase();
      if (/accura|correct|right|wrong|error|mistake/i.test(text)) dimensionMentions.accuracy++;
      if (/thorough|detail|comprehensive|complete|deep/i.test(text)) dimensionMentions.thoroughness++;
      if (/concise|brief|short|summary|bottom line/i.test(text)) dimensionMentions.brevity++;
      if (/fast|quick|speed|time|long/i.test(text)) dimensionMentions.speed++;
      if (/format|structure|layout|header|section|organize/i.test(text)) dimensionMentions.formatting++;
      if (/deadline|date|calendar|due|overdue/i.test(text)) dimensionMentions.deadlines++;
      if (/cite|citation|authority|source|case law/i.test(text)) dimensionMentions.citations++;
      if (/tone|voice|style|formal|casual|aggressive/i.test(text)) dimensionMentions.tone++;
      if (/next step|action|follow|recommend/i.test(text)) dimensionMentions.next_steps++;
    }

    // Sort by frequency to determine what matters most
    const ranked = Object.entries(dimensionMentions)
      .filter(([, count]) => count >= 2)
      .sort(([, a], [, b]) => b - a);

    for (const [dim, count] of ranked) {
      // Only add if not already covered by stored preferences
      if (!preferences.some(p => p.dimension === dim)) {
        preferences.push({
          dimension: dim,
          preference: `frequently mentioned in feedback (${count}x)`,
          importance: count >= 4 ? 'critical' : count >= 2 ? 'high' : 'medium',
          confidence: Math.min(0.9, 0.5 + count * 0.1),
        });
      }
    }

  } catch (error) {
    if (!error.message?.includes('does not exist')) {
      console.log('[AttorneyIdentity] Preference hierarchy note:', error.message);
    }
  }

  return preferences.slice(0, 10);
}

// =====================================================================
// COMMUNICATION STYLE
// How they address different audiences
// =====================================================================

async function _analyzeCommunicationStyle(userId, firmId) {
  const commStyle = {
    clientTone: null,     // How they communicate with clients
    courtTone: null,      // How they write for courts
    internalTone: null,   // How they write internal memos
    sampleCount: 0,
  };

  try {
    // Check for documents tagged by type to differentiate audiences
    const docsResult = await query(`
      SELECT d.content_text, d.original_name, d.file_type
      FROM documents d
      WHERE d.firm_id = $1 AND d.uploaded_by = $2
        AND d.content_text IS NOT NULL AND LENGTH(d.content_text) > 200
        AND d.uploaded_at > NOW() - INTERVAL '180 days'
      ORDER BY d.uploaded_at DESC LIMIT 20
    `, [firmId, userId]);

    if (docsResult.rows.length === 0) return commStyle;
    commStyle.sampleCount = docsResult.rows.length;

    // Categorize documents by likely audience based on name patterns
    for (const doc of docsResult.rows) {
      const name = (doc.original_name || '').toLowerCase();
      const content = (doc.content_text || '').substring(0, 3000);

      if (/letter.*client|client.*letter|dear.*mr|dear.*ms|dear.*dr|retainer|engagement/i.test(name + content)) {
        // Client communication
        const isWarm = /thank|pleased|happy to|look forward|please.*hesitate/i.test(content);
        const isDirect = /you must|you need to|you should|immediately|urgent/i.test(content);
        if (isWarm && isDirect) commStyle.clientTone = 'warm-but-direct';
        else if (isWarm) commStyle.clientTone = 'warm-professional';
        else if (isDirect) commStyle.clientTone = 'direct-professional';
        else commStyle.clientTone = 'neutral-professional';
      }

      if (/motion|brief|memorandum.*law|affirmation|affidavit|petition/i.test(name)) {
        // Court document
        const isAssertive = /clearly|undoubtedly|this court should|must grant|must deny/i.test(content);
        const isMeasured = /respectfully|with due respect|we submit|the court may/i.test(content);
        if (isAssertive) commStyle.courtTone = 'assertive-authoritative';
        else if (isMeasured) commStyle.courtTone = 'respectful-persuasive';
        else commStyle.courtTone = 'neutral-formal';
      }

      if (/memo|internal|note|analysis|research/i.test(name)) {
        // Internal communication
        const isCasual = /hey|fyi|quick|heads up|btw/i.test(content);
        const isStructured = /issue|analysis|conclusion|recommendation|summary/i.test(content);
        if (isCasual) commStyle.internalTone = 'casual-efficient';
        else if (isStructured) commStyle.internalTone = 'structured-analytical';
        else commStyle.internalTone = 'professional-standard';
      }
    }

  } catch (error) {
    if (!error.message?.includes('does not exist')) {
      console.log('[AttorneyIdentity] Communication style note:', error.message);
    }
  }

  return commStyle;
}

// =====================================================================
// STORED DIMENSIONS (DB persistence for identity traits)
// =====================================================================

async function _loadStoredDimensions(userId, firmId) {
  try {
    const result = await query(`
      SELECT dimension_name, dimension_value, confidence, evidence_count, updated_at
      FROM attorney_identity_dimensions
      WHERE user_id = $1 AND firm_id = $2 AND confidence > 0.2
      ORDER BY confidence DESC, evidence_count DESC
      LIMIT 50
    `, [userId, firmId]);
    return result.rows;
  } catch (error) {
    // Table may not exist yet — that's fine
    return [];
  }
}

// =====================================================================
// MATURITY CALCULATION
// How well does the system know this attorney?
// =====================================================================

function _calculateMaturity(identity) {
  let score = 0;

  // Writing style dimensions (up to 25 points)
  const ws = identity.writingStyle;
  if (ws.sampleCount >= 1) score += 3;
  if (ws.sampleCount >= 5) score += 4;
  if (ws.sampleCount >= 15) score += 3;
  if (ws.sentenceLength) score += 2;
  if (ws.formality) score += 2;
  if (ws.structurePreference) score += 2;
  if (ws.vocabularyLevel) score += 2;
  if (ws.detailLevel) score += 2;
  if (ws.toneDefault) score += 3;
  if (ws.usesOxfordComma !== null) score += 1;
  if (ws.prefersCitations) score += 1;

  // Thinking patterns (up to 20 points)
  const tp = identity.thinkingPatterns;
  if (tp.sampleCount >= 3) score += 3;
  if (tp.sampleCount >= 10) score += 3;
  if (tp.riskTolerance) score += 3;
  if (tp.recommendationStyle) score += 2;
  if (tp.analyticDepth) score += 3;
  if (tp.taskDelegationStyle) score += 2;
  if (tp.followUpFrequency) score += 2;
  if (tp.decisionSpeed) score += 2;

  // Correction principles (up to 25 points)
  const principles = identity.correctionPrinciples;
  score += Math.min(15, principles.length * 3);  // Up to 5 principles = 15 points
  const highConfidence = principles.filter(p => p.confidence >= 0.8).length;
  score += Math.min(10, highConfidence * 2);  // High-confidence principles = bonus

  // Preference hierarchy (up to 15 points)
  const prefs = identity.preferenceHierarchy;
  score += Math.min(10, prefs.length * 2);
  const criticalPrefs = prefs.filter(p => p.importance === 'critical').length;
  score += Math.min(5, criticalPrefs * 2.5);

  // Communication style (up to 15 points)
  const cs = identity.communicationStyle;
  if (cs.sampleCount >= 5) score += 3;
  if (cs.clientTone) score += 4;
  if (cs.courtTone) score += 4;
  if (cs.internalTone) score += 4;

  return Math.min(100, Math.round(score));
}

function _getMaturityLevel(score) {
  for (const level of Object.values(MATURITY_LEVELS)) {
    if (score >= level.min && score <= level.max) {
      return level;
    }
  }
  return MATURITY_LEVELS.NASCENT;
}

// =====================================================================
// STORE NEW PRINCIPLES (called from rejection handler)
// =====================================================================

/**
 * Extract and store correction principles from a task rejection.
 * This is called from the review queue rejection endpoint.
 * 
 * @param {string} userId - The attorney who rejected
 * @param {string} firmId - The firm
 * @param {string} feedback - The rejection feedback text
 * @param {string} goal - The original task goal
 * @returns {Array} Principles extracted and stored
 */
export async function learnFromCorrection(userId, firmId, feedback, goal) {
  if (!feedback || !userId || !firmId) return [];

  await _ensureTable();

  const extracted = _extractPrinciplesFromFeedback(feedback, goal);

  for (const principle of extracted) {
    try {
      await _storeDimension(userId, firmId, 'correction_principle', {
        principle: principle.principle,
        source: principle.source,
        evidence: principle.evidence,
        goal: (goal || '').substring(0, 100),
      }, principle.confidence);
    } catch (e) {
      // Non-fatal
    }
  }

  // Invalidate cache so next task gets fresh identity
  identityCache.delete(`${userId}:${firmId}`);

  console.log(`[AttorneyIdentity] Stored ${extracted.length} correction principles from rejection`);
  return extracted;
}

/**
 * Store an explicit preference (can be called from UI settings, or inferred from patterns).
 */
export async function storePreference(userId, firmId, dimension, preference, importance = 'high', confidence = 0.8) {
  await _storeDimension(userId, firmId, 'preference_rank', {
    dimension,
    preference,
    importance,
  }, confidence);
  
  identityCache.delete(`${userId}:${firmId}`);
}

/**
 * Store any identity dimension in the DB.
 */
async function _storeDimension(userId, firmId, dimensionName, dimensionValue, confidence = 0.6) {
  try {
    // Try to find existing and merge
    const existing = await query(`
      SELECT id, evidence_count, confidence FROM attorney_identity_dimensions
      WHERE user_id = $1 AND firm_id = $2 AND dimension_name = $3
        AND dimension_value->>'principle' = $4
      LIMIT 1
    `, [userId, firmId, dimensionName, dimensionValue.principle || JSON.stringify(dimensionValue).substring(0, 200)]);

    if (existing.rows.length > 0) {
      // Strengthen existing principle
      await query(`
        UPDATE attorney_identity_dimensions
        SET evidence_count = evidence_count + 1,
            confidence = LEAST(0.98, confidence + 0.05),
            updated_at = NOW()
        WHERE id = $1
      `, [existing.rows[0].id]);
    } else {
      await query(`
        INSERT INTO attorney_identity_dimensions
          (user_id, firm_id, dimension_name, dimension_value, confidence, evidence_count)
        VALUES ($1, $2, $3, $4::jsonb, $5, 1)
      `, [userId, firmId, dimensionName, JSON.stringify(dimensionValue), confidence]);
    }
  } catch (error) {
    // Table may not exist — log but don't fail
    if (!error.message?.includes('does not exist')) {
      console.log('[AttorneyIdentity] Store dimension note:', error.message);
    }
  }
}

// =====================================================================
// FORMAT FOR PROMPT — The identity prompt that replaces the brief
// =====================================================================

/**
 * Format the attorney identity for injection into the system prompt.
 * This replaces the junior attorney brief as maturity increases.
 * 
 * At low maturity: returns empty (let the brief handle it)
 * At high maturity: returns a rich identity description
 */
export function formatIdentityForPrompt(identity) {
  if (!identity || identity.maturity < 10) return '';

  const parts = [];
  parts.push(`\n## WHO YOU ARE WORKING FOR`);
  parts.push(`Identity maturity: ${identity.maturityLevel.label} (${identity.maturity}/100) — ${
    identity.maturity < 35 ? 'still learning this attorney\'s preferences' :
    identity.maturity < 55 ? 'personality is emerging — adapt to these patterns' :
    identity.maturity < 75 ? 'you know this attorney well — match their style' :
    'you ARE this attorney\'s externalized judgment — write as they would write'
  }\n`);

  // --- Writing style (if known) ---
  const ws = identity.writingStyle;
  const styleNotes = [];
  if (ws.sentenceLength) styleNotes.push(`${ws.sentenceLength} sentences`);
  if (ws.formality) styleNotes.push(`${ws.formality} tone`);
  if (ws.structurePreference) styleNotes.push(`prefers ${ws.structurePreference} structure`);
  if (ws.vocabularyLevel) styleNotes.push(`${ws.vocabularyLevel} vocabulary`);
  if (ws.detailLevel) styleNotes.push(`${ws.detailLevel} detail level`);
  if (ws.toneDefault) styleNotes.push(`default tone: ${ws.toneDefault}`);
  if (ws.usesOxfordComma !== null) styleNotes.push(ws.usesOxfordComma ? 'uses Oxford comma' : 'no Oxford comma');
  if (ws.prefersCitations) styleNotes.push(`${ws.prefersCitations} citation usage`);
  
  if (styleNotes.length > 0) {
    parts.push(`**Writing Style:** ${styleNotes.join(' | ')}`);
  }

  // --- Communication style (if known) ---
  const cs = identity.communicationStyle;
  const commNotes = [];
  if (cs.clientTone) commNotes.push(`Client comms: ${cs.clientTone}`);
  if (cs.courtTone) commNotes.push(`Court filings: ${cs.courtTone}`);
  if (cs.internalTone) commNotes.push(`Internal memos: ${cs.internalTone}`);
  
  if (commNotes.length > 0) {
    parts.push(`**Communication Tones:** ${commNotes.join(' | ')}`);
  }

  // --- Thinking patterns (if known) ---
  const tp = identity.thinkingPatterns;
  const thinkNotes = [];
  if (tp.riskTolerance) thinkNotes.push(`risk tolerance: ${tp.riskTolerance}`);
  if (tp.recommendationStyle) thinkNotes.push(`prefers: ${tp.recommendationStyle.replace(/_/g, ' ')}`);
  if (tp.analyticDepth) thinkNotes.push(`depth: ${tp.analyticDepth.replace(/_/g, ' ')}`);
  if (tp.taskDelegationStyle) thinkNotes.push(`delegation: ${tp.taskDelegationStyle.replace(/_/g, ' ')}`);
  
  if (thinkNotes.length > 0) {
    parts.push(`**How They Think:** ${thinkNotes.join(' | ')}`);
  }

  // --- Correction principles (CRITICAL — these are hard-learned rules) ---
  const highPrinciples = identity.correctionPrinciples.filter(p => p.confidence >= 0.7);
  if (highPrinciples.length > 0) {
    parts.push(`\n**HARD RULES (learned from corrections — do NOT violate):**`);
    for (const p of highPrinciples.slice(0, 8)) {
      parts.push(`- ${p.principle}`);
    }
  }

  // Lower confidence principles as guidance
  const softPrinciples = identity.correctionPrinciples.filter(p => p.confidence < 0.7 && p.confidence >= 0.5);
  if (softPrinciples.length > 0) {
    parts.push(`\n**Preferences (observed patterns):**`);
    for (const p of softPrinciples.slice(0, 5)) {
      parts.push(`- ${p.principle}`);
    }
  }

  // --- Preference hierarchy ---
  const criticalPrefs = identity.preferenceHierarchy.filter(p => p.importance === 'critical');
  if (criticalPrefs.length > 0) {
    parts.push(`\n**What matters MOST to this attorney:**`);
    for (const p of criticalPrefs.slice(0, 4)) {
      parts.push(`- ${p.dimension}: ${p.preference}`);
    }
  }

  return parts.join('\n');
}

// =====================================================================
// DB MIGRATION: Create the attorney_identity_dimensions table
// =====================================================================

export const IDENTITY_MIGRATION_SQL = `
-- Attorney Identity Dimensions
-- Stores learned identity traits for each attorney
-- Each dimension is a named trait with a JSON value and confidence score
CREATE TABLE IF NOT EXISTS attorney_identity_dimensions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  firm_id UUID NOT NULL,
  dimension_name VARCHAR(100) NOT NULL,  -- e.g. 'correction_principle', 'preference_rank', 'writing_tone'
  dimension_value JSONB NOT NULL,        -- The actual trait value (structured)
  confidence DECIMAL(3,2) DEFAULT 0.50,  -- 0.00-1.00 confidence in this dimension
  evidence_count INTEGER DEFAULT 1,       -- How many observations support this
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups per attorney
CREATE INDEX IF NOT EXISTS idx_attorney_identity_user_firm 
  ON attorney_identity_dimensions(user_id, firm_id);
CREATE INDEX IF NOT EXISTS idx_attorney_identity_dimension 
  ON attorney_identity_dimensions(user_id, firm_id, dimension_name);
`;
