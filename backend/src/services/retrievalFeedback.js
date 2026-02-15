/**
 * Retrieval Feedback Collector
 * 
 * Captures both explicit and implicit feedback on retrieval quality
 * and feeds it into the lawyer preference engine for learning.
 * 
 * IMPLICIT FEEDBACK signals:
 * - Document selection: which result the lawyer clicked/used
 * - Time to selection: fast selection = high confidence match
 * - Scroll depth: how far the lawyer scrolled through results
 * - Re-queries: rephrasing suggests initial results were poor
 * - Document usage: was the selected document actually used in work product?
 * 
 * EXPLICIT FEEDBACK signals:
 * - Star rating (1-5) on search results
 * - "Not helpful" / "Helpful" button
 * - "Save as favorite" for future reference
 * 
 * All feedback is private to the individual lawyer (firm_id + lawyer_id scoped).
 */

import { query } from '../db/connection.js';
import { learnFromRetrievalFeedback } from './lawyerPreferenceEngine.js';
import crypto from 'crypto';

// Feedback aggregation configuration
const MIN_FEEDBACK_FOR_ANALYSIS = 5;  // Need at least 5 feedback events to analyze
const ANALYSIS_WINDOW_DAYS = 30;       // Analyze feedback from last 30 days

/**
 * Record implicit feedback: lawyer selected a document from results
 */
export async function recordDocumentSelection(firmId, lawyerId, selectionEvent) {
  const {
    queryText,
    queryIntent,
    selectedDocumentId,
    selectedDocumentType,
    selectedChunkIndex,
    allResultDocumentIds,
    allResultDocumentTypes,
    timeToSelectionMs,
    sessionId,
    matterId,
    practiceArea,
  } = selectionEvent;
  
  try {
    const queryHash = crypto.createHash('sha256')
      .update(queryText || '')
      .digest('hex');
    
    // Store in retrieval_feedback table
    await query(`
      INSERT INTO retrieval_feedback (
        firm_id, lawyer_id, query_hash, query_text,
        retrieved_document_ids, selected_document_id, selected_chunk_index,
        session_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      firmId,
      lawyerId,
      queryHash,
      queryText,
      allResultDocumentIds || [],
      selectedDocumentId,
      selectedChunkIndex || null,
      sessionId || null,
    ]);
    
    // Feed into preference engine
    await learnFromRetrievalFeedback(firmId, lawyerId, {
      queryText,
      queryIntent,
      selectedDocumentId,
      selectedDocumentType,
      retrievedDocumentTypes: allResultDocumentTypes,
      matterId,
      practiceArea,
      timeToSelectionMs,
    });
    
    return { success: true };
  } catch (error) {
    console.error('[RetrievalFeedback] Selection recording error:', error.message);
    return { success: false };
  }
}

/**
 * Record explicit feedback: lawyer rated search results
 */
export async function recordExplicitRating(firmId, lawyerId, ratingEvent) {
  const {
    queryText,
    selectedDocumentId,
    rating,
    sessionId,
  } = ratingEvent;
  
  try {
    const queryHash = crypto.createHash('sha256')
      .update(queryText || '')
      .digest('hex');
    
    // Update existing feedback record or create new one
    await query(`
      INSERT INTO retrieval_feedback (
        firm_id, lawyer_id, query_hash, query_text,
        retrieved_document_ids, selected_document_id, rating, session_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO NOTHING
    `, [
      firmId,
      lawyerId,
      queryHash,
      queryText,
      [],
      selectedDocumentId,
      rating,
      sessionId || null,
    ]);
    
    // High ratings boost the preference signal
    if (rating >= 4 && selectedDocumentId) {
      const docResult = await query(`
        SELECT type, matter_id FROM documents WHERE id = $1 AND firm_id = $2
      `, [selectedDocumentId, firmId]);
      
      if (docResult.rows.length > 0) {
        const doc = docResult.rows[0];
        await learnFromRetrievalFeedback(firmId, lawyerId, {
          queryText,
          selectedDocumentId,
          selectedDocumentType: doc.type,
          matterId: doc.matter_id,
        });
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('[RetrievalFeedback] Rating recording error:', error.message);
    return { success: false };
  }
}

/**
 * Record re-query event (user rephrased their search)
 * This is a negative signal about the previous results
 */
export async function recordRequery(firmId, lawyerId, requeueEvent) {
  const {
    originalQuery,
    newQuery,
    sessionId,
  } = requeueEvent;
  
  try {
    // Store the re-query pattern (anonymized)
    const originalHash = crypto.createHash('sha256')
      .update(originalQuery || '')
      .digest('hex');
    
    await query(`
      INSERT INTO retrieval_feedback (
        firm_id, lawyer_id, query_hash, query_text,
        retrieved_document_ids, rating, session_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      firmId,
      lawyerId,
      originalHash,
      originalQuery,
      [],
      2, // Low rating: user had to rephrase
      sessionId || null,
    ]);
    
    return { success: true };
  } catch (error) {
    console.error('[RetrievalFeedback] Re-query recording error:', error.message);
    return { success: false };
  }
}

/**
 * Analyze feedback patterns for a lawyer
 * Returns insights about what's working and what isn't
 */
export async function analyzeFeedbackPatterns(firmId, lawyerId) {
  try {
    // Get recent feedback
    const feedback = await query(`
      SELECT 
        rf.query_hash,
        rf.query_text,
        rf.selected_document_id,
        rf.rating,
        rf.created_at,
        d.type as document_type,
        d.matter_id,
        m.matter_type
      FROM retrieval_feedback rf
      LEFT JOIN documents d ON d.id = rf.selected_document_id AND d.firm_id = rf.firm_id
      LEFT JOIN matters m ON m.id = d.matter_id AND m.firm_id = d.firm_id
      WHERE rf.firm_id = $1 
        AND rf.lawyer_id = $2
        AND rf.created_at >= NOW() - INTERVAL '${ANALYSIS_WINDOW_DAYS} days'
      ORDER BY rf.created_at DESC
      LIMIT 100
    `, [firmId, lawyerId]);
    
    if (feedback.rows.length < MIN_FEEDBACK_FOR_ANALYSIS) {
      return {
        sufficient_data: false,
        feedback_count: feedback.rows.length,
        message: `Need at least ${MIN_FEEDBACK_FOR_ANALYSIS} feedback events for analysis`,
      };
    }
    
    // Aggregate by document type
    const docTypePreferences = {};
    const queryCategories = {};
    let totalRating = 0;
    let ratedCount = 0;
    
    for (const row of feedback.rows) {
      // Document type usage
      if (row.document_type) {
        docTypePreferences[row.document_type] = (docTypePreferences[row.document_type] || 0) + 1;
      }
      
      // Rating aggregation
      if (row.rating) {
        totalRating += row.rating;
        ratedCount++;
      }
    }
    
    // Sort document types by usage
    const sortedDocTypes = Object.entries(docTypePreferences)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => ({ type, count, percentage: Math.round(count / feedback.rows.length * 100) }));
    
    return {
      sufficient_data: true,
      feedback_count: feedback.rows.length,
      average_rating: ratedCount > 0 ? (totalRating / ratedCount).toFixed(1) : null,
      rated_count: ratedCount,
      preferred_document_types: sortedDocTypes,
      analysis_window_days: ANALYSIS_WINDOW_DAYS,
    };
  } catch (error) {
    console.error('[RetrievalFeedback] Analysis error:', error.message);
    return { error: error.message };
  }
}

/**
 * Get retrieval quality metrics for monitoring
 */
export async function getRetrievalMetrics(firmId, days = 7) {
  try {
    const metrics = await query(`
      SELECT 
        COUNT(*) as total_searches,
        COUNT(selected_document_id) as searches_with_selection,
        AVG(rating) FILTER (WHERE rating IS NOT NULL) as avg_rating,
        COUNT(*) FILTER (WHERE rating >= 4) as high_rated,
        COUNT(*) FILTER (WHERE rating <= 2) as low_rated,
        COUNT(DISTINCT lawyer_id) as active_lawyers
      FROM retrieval_feedback
      WHERE firm_id = $1
        AND created_at >= NOW() - ($2 || ' days')::INTERVAL
    `, [firmId, days]);
    
    const row = metrics.rows[0];
    
    return {
      totalSearches: parseInt(row.total_searches) || 0,
      searchesWithSelection: parseInt(row.searches_with_selection) || 0,
      selectionRate: row.total_searches > 0 
        ? ((row.searches_with_selection / row.total_searches) * 100).toFixed(1) + '%'
        : '0%',
      averageRating: row.avg_rating ? parseFloat(row.avg_rating).toFixed(1) : null,
      highRated: parseInt(row.high_rated) || 0,
      lowRated: parseInt(row.low_rated) || 0,
      activeLawyers: parseInt(row.active_lawyers) || 0,
      period: `${days} days`,
    };
  } catch (error) {
    console.error('[RetrievalFeedback] Metrics error:', error.message);
    return { error: error.message };
  }
}

export default {
  recordDocumentSelection,
  recordExplicitRating,
  recordRequery,
  analyzeFeedbackPatterns,
  getRetrievalMetrics,
};
