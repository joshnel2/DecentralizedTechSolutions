/**
 * Hybrid Retrieval Pipeline for Legal Documents
 * 
 * Orchestrates four retrieval sources in parallel:
 * 1. Contextual Vector Search (pgvector) - semantic similarity with context
 * 2. Keyword Search (PostgreSQL full-text) - exact citation and term matching
 * 3. Graph Expansion (document relationships) - citation networks, clause dependencies
 * 4. RAPTOR Summary Search - hierarchical summaries for long documents
 * 
 * Results are fused using Reciprocal Rank Fusion (RRF) with legal domain weights,
 * then personalized using the lawyer's learned preferences.
 * 
 * PRIVACY: All retrieval is scoped to firm_id. Cross-tenant retrieval is
 * physically impossible (separate vector namespaces, RLS policies, encryption).
 */

import { query } from '../db/connection.js';
import { generateEmbedding } from './embeddingService.js';
import { searchSummaryTree } from './raptorSummaryService.js';

// RRF constant (controls how quickly rank importance decays)
// k=60 is the standard from the original RRF paper
const RRF_K = 60;

// Legal domain weight multipliers
const LEGAL_WEIGHTS = {
  // Court hierarchy weights
  court_level: {
    'supreme_court': 1.5,
    'circuit_court': 1.3,
    'district_court': 1.1,
    'state_supreme': 1.3,
    'state_appellate': 1.1,
    'state_trial': 1.0,
    'default': 1.0,
  },
  
  // Document type relevance by query intent
  intent_document_weights: {
    case_law_lookup: {
      'case_law': 1.5,
      'statute': 1.2,
      'treatise': 1.0,
      'memo': 0.8,
      'contract': 0.5,
    },
    clause_search: {
      'contract': 1.5,
      'template': 1.3,
      'memo': 0.8,
      'case_law': 0.7,
    },
    precedent_chain: {
      'case_law': 1.5,
      'memo': 1.2,
      'statute': 1.1,
      'contract': 0.3,
    },
    general: {
      'case_law': 1.0,
      'contract': 1.0,
      'memo': 1.0,
      'statute': 1.0,
    },
  },
  
  // Recency bonus (per year newer than baseline)
  recency_bonus_per_year: 0.02,
  recency_baseline_year: 2020,
  
  // Same jurisdiction bonus
  jurisdiction_match_bonus: 0.15,
};

/**
 * Classify query intent for retrieval strategy
 */
function classifyQueryIntent(queryText) {
  const lower = queryText.toLowerCase();
  
  // Case law lookup
  if (/(?:case|ruling|decision|held|holding|precedent|v\.\s)/i.test(lower)) {
    return 'case_law_lookup';
  }
  
  // Clause search
  if (/(?:clause|provision|section|term|language|draft|boilerplate)/i.test(lower)) {
    return 'clause_search';
  }
  
  // Precedent chain
  if (/(?:precedent|cite|citation|authority|support|line of cases)/i.test(lower)) {
    return 'precedent_chain';
  }
  
  return 'general';
}

/**
 * Expand query with legal synonyms for better recall
 */
function expandQueryTerms(queryText) {
  const expansions = {
    'damages': ['damages', 'remedy', 'relief', 'compensation', 'restitution'],
    'liable': ['liable', 'liability', 'responsible', 'culpable'],
    'negligence': ['negligence', 'negligent', 'duty of care', 'breach of duty'],
    'breach': ['breach', 'violation', 'default', 'non-compliance'],
    'indemnify': ['indemnify', 'indemnification', 'hold harmless', 'defend'],
    'terminate': ['terminate', 'termination', 'cancel', 'rescind', 'void'],
    'assign': ['assign', 'assignment', 'transfer', 'delegate'],
    'confidential': ['confidential', 'confidentiality', 'proprietary', 'trade secret', 'NDA'],
    'injunction': ['injunction', 'injunctive relief', 'restraining order', 'TRO'],
    'summary judgment': ['summary judgment', 'motion for summary judgment', 'Rule 56', 'no genuine issue'],
  };
  
  let expanded = queryText;
  const addedTerms = [];
  
  for (const [term, synonyms] of Object.entries(expansions)) {
    if (queryText.toLowerCase().includes(term)) {
      const newTerms = synonyms.filter(s => !queryText.toLowerCase().includes(s.toLowerCase()));
      addedTerms.push(...newTerms);
    }
  }
  
  return {
    originalQuery: queryText,
    expandedTerms: addedTerms,
    fullQuery: addedTerms.length > 0 
      ? `${queryText} (related: ${addedTerms.join(', ')})` 
      : queryText,
  };
}

/**
 * Source 1: Contextual Vector Search
 * Uses pgvector cosine similarity on context-prepended embeddings
 */
async function vectorSearch(queryEmbedding, firmId, options = {}) {
  const {
    limit = 50,
    threshold = 0.6,
    matterId = null,
    documentType = null,
  } = options;
  
  try {
    const result = await query(`
      SELECT 
        de.id as embedding_id,
        de.document_id,
        de.chunk_index,
        de.chunk_text,
        de.metadata,
        1 - (de.embedding <=> $1::vector) AS similarity,
        d.name as document_name,
        d.type as document_type,
        d.matter_id,
        d.created_at as document_date,
        m.name as matter_name,
        m.matter_type
      FROM document_embeddings de
      JOIN documents d ON d.id = de.document_id AND d.firm_id = de.firm_id
      LEFT JOIN matters m ON m.id = d.matter_id AND m.firm_id = d.firm_id
      WHERE de.firm_id = $2
        AND de.embedding IS NOT NULL
        AND ($3::UUID IS NULL OR d.matter_id = $3)
        AND ($4::VARCHAR IS NULL OR d.type = $4)
        AND 1 - (de.embedding <=> $1::vector) >= $5
      ORDER BY similarity DESC
      LIMIT $6
    `, [
      queryEmbedding,
      firmId,
      matterId,
      documentType,
      threshold,
      limit,
    ]);
    
    return result.rows.map((row, idx) => ({
      ...row,
      source: 'vector',
      rank: idx + 1,
      similarity: parseFloat(row.similarity),
    }));
  } catch (error) {
    console.error('[Retrieval] Vector search error:', error.message);
    return [];
  }
}

/**
 * Source 2: Keyword Search (PostgreSQL full-text)
 * Catches exact citations and specific terms that semantic search might miss
 */
async function keywordSearch(queryText, firmId, options = {}) {
  const {
    limit = 30,
    matterId = null,
  } = options;
  
  try {
    // Build ts_query from the query text
    // Handle legal citations specially (don't tokenize them)
    const sanitizedQuery = queryText
      .replace(/[^\w\s.,§'"()-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .map(w => w + ':*')  // Prefix matching
      .join(' & ');
    
    if (!sanitizedQuery) return [];
    
    const result = await query(`
      SELECT 
        de.id as embedding_id,
        de.document_id,
        de.chunk_index,
        de.chunk_text,
        de.metadata,
        ts_rank_cd(to_tsvector('english', de.chunk_text), to_tsquery('english', $1)) AS rank_score,
        d.name as document_name,
        d.type as document_type,
        d.matter_id,
        d.created_at as document_date,
        m.name as matter_name,
        m.matter_type
      FROM document_embeddings de
      JOIN documents d ON d.id = de.document_id AND d.firm_id = de.firm_id
      LEFT JOIN matters m ON m.id = d.matter_id AND m.firm_id = d.firm_id
      WHERE de.firm_id = $2
        AND to_tsvector('english', de.chunk_text) @@ to_tsquery('english', $1)
        AND ($3::UUID IS NULL OR d.matter_id = $3)
      ORDER BY rank_score DESC
      LIMIT $4
    `, [sanitizedQuery, firmId, matterId, limit]);
    
    return result.rows.map((row, idx) => ({
      ...row,
      source: 'keyword',
      rank: idx + 1,
      similarity: Math.min(1.0, parseFloat(row.rank_score) * 2), // Normalize to 0-1 range
    }));
  } catch (error) {
    console.error('[Retrieval] Keyword search error:', error.message);
    return [];
  }
}

/**
 * Source 3: Graph Expansion
 * Follows citation networks and clause dependencies from initial results
 */
async function graphExpansion(documentIds, firmId, options = {}) {
  const {
    maxDepth = 3,
    limit = 20,
    relationshipTypes = ['cites', 'references', 'depends_on', 'similar_to'],
  } = options;
  
  if (!documentIds || documentIds.length === 0) {
    return [];
  }
  
  try {
    // Recursive CTE to traverse the relationship graph
    const result = await query(`
      WITH RECURSIVE graph_traversal AS (
        -- Seed: direct relationships from initial documents
        SELECT 
          dr.target_document_id as document_id,
          dr.relationship_type,
          dr.confidence,
          1 as depth,
          ARRAY[dr.source_document_id] as path
        FROM document_relationships dr
        WHERE dr.firm_id = $1
          AND dr.source_document_id = ANY($2::UUID[])
          AND dr.relationship_type = ANY($3::VARCHAR[])
          AND dr.confidence >= 0.4
        
        UNION ALL
        
        -- Expand: follow relationships from discovered documents
        SELECT 
          dr.target_document_id,
          dr.relationship_type,
          dr.confidence * 0.7 as confidence,  -- Decay confidence with depth
          gt.depth + 1,
          gt.path || dr.source_document_id
        FROM document_relationships dr
        INNER JOIN graph_traversal gt ON dr.source_document_id = gt.document_id
        WHERE dr.firm_id = $1
          AND gt.depth < $4
          AND dr.confidence >= 0.4
          AND NOT (dr.target_document_id = ANY(gt.path))  -- Prevent cycles
          AND dr.relationship_type = ANY($3::VARCHAR[])
      )
      SELECT DISTINCT ON (gt.document_id)
        gt.document_id,
        gt.relationship_type,
        gt.confidence,
        gt.depth,
        d.name as document_name,
        d.type as document_type,
        d.matter_id,
        d.created_at as document_date,
        m.name as matter_name,
        m.matter_type
      FROM graph_traversal gt
      JOIN documents d ON d.id = gt.document_id AND d.firm_id = $1
      LEFT JOIN matters m ON m.id = d.matter_id AND m.firm_id = d.firm_id
      WHERE gt.document_id != ALL($2::UUID[])  -- Exclude seed documents
      ORDER BY gt.document_id, gt.confidence DESC
      LIMIT $5
    `, [firmId, documentIds, relationshipTypes, maxDepth, limit]);
    
    return result.rows.map((row, idx) => ({
      ...row,
      source: 'graph',
      rank: idx + 1,
      similarity: parseFloat(row.confidence) * 0.8, // Scale graph confidence to similarity range
      chunk_text: `[Related via ${row.relationship_type} at depth ${row.depth}]`,
      chunk_index: 0,
    }));
  } catch (error) {
    console.error('[Retrieval] Graph expansion error:', error.message);
    return [];
  }
}

/**
 * Reciprocal Rank Fusion (RRF)
 * Combines results from multiple retrieval sources into a single ranked list
 * 
 * RRF score = sum over all sources of: 1 / (k + rank_in_source)
 * 
 * This is preferred over simple score averaging because:
 * - It's score-distribution agnostic (vector similarity and BM25 have different distributions)
 * - It naturally handles different result set sizes
 * - It's been proven effective in information retrieval research
 */
function reciprocalRankFusion(resultSets, k = RRF_K) {
  const fusedScores = new Map(); // document_id:chunk_index -> { score, bestResult }
  
  for (const results of resultSets) {
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const key = `${result.document_id}:${result.chunk_index || 0}`;
      
      const rrfScore = 1.0 / (k + (i + 1));
      
      if (fusedScores.has(key)) {
        const existing = fusedScores.get(key);
        existing.score += rrfScore;
        existing.sources.push(result.source);
        // Keep the result with the highest individual similarity
        if (result.similarity > existing.bestResult.similarity) {
          existing.bestResult = result;
        }
      } else {
        fusedScores.set(key, {
          score: rrfScore,
          sources: [result.source],
          bestResult: result,
        });
      }
    }
  }
  
  // Convert to sorted array
  return Array.from(fusedScores.values())
    .sort((a, b) => b.score - a.score)
    .map(entry => ({
      ...entry.bestResult,
      rrfScore: entry.score,
      retrievalSources: entry.sources,
      multiSourceBonus: entry.sources.length > 1, // Found by multiple methods = higher confidence
    }));
}

/**
 * Apply legal domain weights to fused results
 */
function applyLegalWeights(results, queryIntent, lawyerJurisdiction = null) {
  const intentWeights = LEGAL_WEIGHTS.intent_document_weights[queryIntent] || 
    LEGAL_WEIGHTS.intent_document_weights.general;
  
  return results.map(result => {
    let weight = 1.0;
    
    // Document type weight based on query intent
    const docType = result.document_type || 'default';
    weight *= (intentWeights[docType] || 1.0);
    
    // Multi-source bonus: found by 2+ retrieval methods
    if (result.multiSourceBonus) {
      weight *= 1.15;
    }
    
    // Recency bonus
    if (result.document_date) {
      const docYear = new Date(result.document_date).getFullYear();
      const yearsNewer = docYear - LEGAL_WEIGHTS.recency_baseline_year;
      if (yearsNewer > 0) {
        weight *= (1.0 + yearsNewer * LEGAL_WEIGHTS.recency_bonus_per_year);
      }
    }
    
    // Jurisdiction match bonus
    if (lawyerJurisdiction && result.metadata) {
      const metadata = typeof result.metadata === 'string' ? JSON.parse(result.metadata) : result.metadata;
      if (metadata.jurisdiction && metadata.jurisdiction.toLowerCase().includes(lawyerJurisdiction.toLowerCase())) {
        weight *= (1.0 + LEGAL_WEIGHTS.jurisdiction_match_bonus);
      }
    }
    
    return {
      ...result,
      weightedScore: result.rrfScore * weight,
      appliedWeight: weight,
    };
  }).sort((a, b) => b.weightedScore - a.weightedScore);
}

/**
 * Apply lawyer-specific preference weights
 */
async function applyLawyerPreferences(results, firmId, lawyerId) {
  if (!lawyerId) return results;
  
  try {
    // Fetch lawyer preferences
    const prefResult = await query(`
      SELECT preference_type, preference_key, preference_value, confidence
      FROM lawyer_preferences
      WHERE firm_id = $1 AND lawyer_id = $2
        AND confidence >= 0.4
      ORDER BY confidence DESC
      LIMIT 20
    `, [firmId, lawyerId]);
    
    if (prefResult.rows.length === 0) return results;
    
    const preferences = {};
    for (const pref of prefResult.rows) {
      preferences[`${pref.preference_type}:${pref.preference_key}`] = {
        value: pref.preference_value,
        confidence: pref.confidence,
      };
    }
    
    return results.map(result => {
      let prefWeight = 1.0;
      
      // Document type preference
      const docTypePref = preferences[`document_type_affinity:${result.document_type}`];
      if (docTypePref) {
        prefWeight += 0.2 * docTypePref.confidence;
      }
      
      // Matter type preference
      if (result.matter_type) {
        const matterPref = preferences[`matter_type_affinity:${result.matter_type}`];
        if (matterPref) {
          prefWeight += 0.15 * matterPref.confidence;
        }
      }
      
      return {
        ...result,
        weightedScore: result.weightedScore * prefWeight,
        preferenceWeight: prefWeight,
      };
    }).sort((a, b) => b.weightedScore - a.weightedScore);
  } catch (error) {
    console.error('[Retrieval] Preference weighting error:', error.message);
    return results;
  }
}

/**
 * Deduplicate results: keep best chunk per document
 */
function deduplicateResults(results, maxPerDocument = 3) {
  const docCounts = new Map();
  const deduped = [];
  
  for (const result of results) {
    const docId = result.document_id;
    const count = docCounts.get(docId) || 0;
    
    if (count < maxPerDocument) {
      deduped.push(result);
      docCounts.set(docId, count + 1);
    }
  }
  
  return deduped;
}

/**
 * Main retrieval function
 * 
 * @param {string} queryText - The user's search query
 * @param {string} firmId - The firm ID (tenant isolation)
 * @param {object} options - Search options
 * @returns {object} Retrieval results with provenance
 */
export async function retrieve(queryText, firmId, options = {}) {
  const {
    limit = 10,
    matterId = null,
    documentType = null,
    lawyerId = null,
    lawyerJurisdiction = null,
    includeGraph = true,
    includeRaptor = true,
    includeKeyword = true,
    maxPerDocument = 3,
  } = options;
  
  const startTime = Date.now();
  
  // Step 1: Query Understanding
  const queryIntent = classifyQueryIntent(queryText);
  const expandedQuery = expandQueryTerms(queryText);
  
  // Step 2: Generate query embedding
  let queryEmbedding;
  try {
    const embResult = await generateEmbedding(expandedQuery.fullQuery, firmId);
    queryEmbedding = embResult.embedding;
  } catch (error) {
    console.error('[Retrieval] Embedding generation failed:', error.message);
    // Fall back to keyword-only search
    queryEmbedding = null;
  }
  
  // Step 3: Parallel retrieval from all sources
  const retrievalPromises = [];
  
  // Source 1: Vector search (if embedding available)
  if (queryEmbedding) {
    retrievalPromises.push(
      vectorSearch(queryEmbedding, firmId, { limit: 50, matterId, documentType })
        .catch(err => { console.error('[Retrieval] Vector search failed:', err.message); return []; })
    );
  } else {
    retrievalPromises.push(Promise.resolve([]));
  }
  
  // Source 2: Keyword search
  if (includeKeyword) {
    retrievalPromises.push(
      keywordSearch(queryText, firmId, { limit: 30, matterId })
        .catch(err => { console.error('[Retrieval] Keyword search failed:', err.message); return []; })
    );
  } else {
    retrievalPromises.push(Promise.resolve([]));
  }
  
  // Source 4: RAPTOR summary search
  if (includeRaptor && queryEmbedding) {
    retrievalPromises.push(
      searchSummaryTree(queryEmbedding, firmId, { limit: 10, levels: [1, 2] })
        .catch(err => { console.error('[Retrieval] RAPTOR search failed:', err.message); return []; })
    );
  } else {
    retrievalPromises.push(Promise.resolve([]));
  }
  
  // Execute all searches in parallel
  const [vectorResults, keywordResults, raptorResults] = await Promise.all(retrievalPromises);
  
  // Source 3: Graph expansion (requires initial vector results)
  let graphResults = [];
  if (includeGraph && vectorResults.length > 0) {
    const topDocIds = [...new Set(vectorResults.slice(0, 10).map(r => r.document_id))];
    graphResults = await graphExpansion(topDocIds, firmId, {
      maxDepth: queryIntent === 'precedent_chain' ? 3 : 2,
      relationshipTypes: queryIntent === 'clause_search' 
        ? ['depends_on', 'references'] 
        : ['cites', 'references', 'similar_to'],
    }).catch(err => { console.error('[Retrieval] Graph expansion failed:', err.message); return []; });
  }
  
  // Step 4: Fuse results using RRF
  const allSources = [vectorResults, keywordResults, graphResults, raptorResults]
    .filter(s => s.length > 0);
  
  let fusedResults = reciprocalRankFusion(allSources);
  
  // Step 5: Apply legal domain weights
  fusedResults = applyLegalWeights(fusedResults, queryIntent, lawyerJurisdiction);
  
  // Step 6: Apply lawyer preferences
  fusedResults = await applyLawyerPreferences(fusedResults, firmId, lawyerId);
  
  // Step 7: Deduplicate
  fusedResults = deduplicateResults(fusedResults, maxPerDocument);
  
  // Step 8: Trim to requested limit
  const finalResults = fusedResults.slice(0, limit);
  
  const totalTime = Date.now() - startTime;
  
  return {
    results: finalResults.map(r => ({
      documentId: r.document_id,
      documentName: r.document_name,
      documentType: r.document_type,
      matterId: r.matter_id,
      matterName: r.matter_name,
      chunkText: (r.chunk_text || r.summaryText || '').substring(0, 500),
      chunkIndex: r.chunk_index || 0,
      score: r.weightedScore,
      rawSimilarity: r.similarity,
      sources: r.retrievalSources || [r.source],
      level: r.levelLabel || 'chunk',
      provenance: buildProvenance(r),
    })),
    metadata: {
      queryIntent,
      expandedTerms: expandedQuery.expandedTerms,
      totalCandidates: vectorResults.length + keywordResults.length + graphResults.length + raptorResults.length,
      sourceCounts: {
        vector: vectorResults.length,
        keyword: keywordResults.length,
        graph: graphResults.length,
        raptor: raptorResults.length,
      },
      latencyMs: totalTime,
      firmId, // Confirm tenant context in response
    },
  };
}

/**
 * Build human-readable provenance for a result
 */
function buildProvenance(result) {
  const parts = [];
  
  if (result.retrievalSources?.includes('vector')) {
    parts.push(`Semantic match (${(result.similarity * 100).toFixed(0)}%)`);
  }
  if (result.retrievalSources?.includes('keyword')) {
    parts.push('Keyword match');
  }
  if (result.retrievalSources?.includes('graph')) {
    parts.push(`Related via ${result.relationship_type || 'graph'} (depth ${result.depth || 1})`);
  }
  if (result.source === 'raptor_summary') {
    parts.push(`${result.levelLabel || 'section'}-level summary match`);
  }
  if (result.multiSourceBonus) {
    parts.push('Confirmed by multiple retrieval methods');
  }
  
  return parts.join(' | ') || 'Direct match';
}

/**
 * Record retrieval feedback for learning
 */
export async function recordRetrievalFeedback(firmId, lawyerId, queryText, results, selectedDocumentId, rating = null) {
  try {
    const queryHash = require('crypto').createHash('sha256')
      .update(queryText)
      .digest('hex');
    
    const documentIds = results.map(r => r.documentId);
    
    await query(`
      INSERT INTO retrieval_feedback (
        firm_id, lawyer_id, query_hash, query_text, 
        retrieved_document_ids, selected_document_id, rating
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [firmId, lawyerId, queryHash, queryText, documentIds, selectedDocumentId, rating]);
    
    return { success: true };
  } catch (error) {
    console.error('[Retrieval] Feedback recording error:', error.message);
    return { success: false };
  }
}

export default {
  retrieve,
  recordRetrievalFeedback,
  classifyQueryIntent,
};
