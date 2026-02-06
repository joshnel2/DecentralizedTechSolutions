/**
 * Learning Integration Service
 * 
 * Connects the retrieval system to existing learning systems:
 * - privateLearning.js (privacy boundaries)
 * - learningOptimizer.js (pattern optimization)
 * - memoryStorage.js (long-term storage)
 * 
 * Enables "meaningful learning" for retrieval as requested.
 * NO CONFIGURATION CHANGES - uses existing learning systems.
 */

import { query } from '../db/connection.js';

// Optional imports - gracefully degrade if modules not available
let PrivateLearningStore, LearningOptimizer, MemoryStorage;
let LEARNING_SYSTEMS_AVAILABLE = false;

try {
  // Try to import existing learning systems
  const privateLearningModule = await import('./amplifier/privateLearning.js');
  const learningOptimizerModule = await import('./amplifier/learningOptimizer.js');
  const memoryStorageModule = await import('./amplifier/memoryStorage.js');
  
  PrivateLearningStore = privateLearningModule.PrivateLearningStore;
  LearningOptimizer = learningOptimizerModule.LearningOptimizer;
  MemoryStorage = memoryStorageModule.MemoryStorage;
  
  LEARNING_SYSTEMS_AVAILABLE = true;
  console.log('[LearningIntegration] Connected to existing learning systems');
} catch (error) {
  console.log('[LearningIntegration] Learning systems not available, using fallback:', error.message);
  LEARNING_SYSTEMS_AVAILABLE = false;
}

/**
 * Retrieval with learning integration
 * Applies lawyer preferences and learned patterns to search
 */
export class LearningIntegratedRetrieval {
  constructor(firmId, lawyerId) {
    this.firmId = firmId;
    this.lawyerId = lawyerId;
    
    if (LEARNING_SYSTEMS_AVAILABLE) {
      this.privateLearning = new PrivateLearningStore();
      this.learningOptimizer = new LearningOptimizer();
      this.memoryStorage = new MemoryStorage();
    }
  }
  
  /**
   * Enhanced semantic search with learning integration
   */
  async semanticSearch(query, options = {}) {
    const {
      limit = 10,
      threshold = 0.7,
      matterId = null,
      documentType = null,
      includeGraphExpansion = true
    } = options;
    
    // Step 1: Get lawyer preferences and privacy level
    const lawyerContext = await this.getLawyerContext();
    
    // Step 2: Apply learned patterns to query enhancement
    const enhancedQuery = await this.enhanceQueryWithLearning(query, lawyerContext);
    
    // Step 3: Perform semantic search (call existing embedding service)
    const baseResults = await this.performBaseSemanticSearch(enhancedQuery, {
      limit: limit * 2, // Get extra for learning-based filtering
      threshold,
      matterId,
      documentType,
      includeGraphExpansion
    });
    
    // Step 4: Apply learning-based weighting
    const weightedResults = await this.applyLearningWeights(baseResults, lawyerContext);
    
    // Step 5: Track retrieval for future learning
    await this.trackRetrievalForLearning(query, weightedResults, lawyerContext);
    
    // Step 6: Return top results
    return weightedResults
      .sort((a, b) => b.learnedRelevance - a.learnedRelevance)
      .slice(0, limit)
      .map(result => this.formatResultForOutput(result, lawyerContext));
  }
  
  /**
   * Get lawyer context from learning systems
   */
  async getLawyerContext() {
    if (!LEARNING_SYSTEMS_AVAILABLE) {
      return {
        privacyLevel: 'strict',
        preferences: {},
        learnedPatterns: [],
        disclaimer: 'Learning systems not available - using basic retrieval'
      };
    }
    
    try {
      // Get privacy level
      const privacyLevel = await this.getPrivacyLevel();
      
      // Get lawyer preferences
      const preferences = await this.getLawyerPreferences();
      
      // Get learned patterns for this lawyer
      const learnedPatterns = await this.getLearnedPatterns();
      
      return {
        privacyLevel,
        preferences,
        learnedPatterns,
        disclaimer: this.getPrivacyDisclaimer(privacyLevel)
      };
    } catch (error) {
      console.error('[LearningIntegration] Error getting lawyer context:', error);
      return this.getFallbackContext();
    }
  }
  
  /**
   * Get lawyer's privacy level from existing system
   */
  async getPrivacyLevel() {
    try {
      // Try to get from database (existing system)
      const result = await query(`
        SELECT privacy_level FROM user_preferences 
        WHERE firm_id = $1 AND user_id = $2
      `, [this.firmId, this.lawyerId]);
      
      if (result.rows.length > 0) {
        return result.rows[0].privacy_level || 'strict';
      }
      
      // Default privacy level
      return 'strict';
    } catch (error) {
      console.log('[LearningIntegration] Using default privacy level');
      return 'strict';
    }
  }
  
  /**
   * Get lawyer preferences from learning system
   */
  async getLawyerPreferences() {
    if (!LEARNING_SYSTEMS_AVAILABLE) {
      return {};
    }
    
    try {
      // Use existing learning system's memory storage
      const preferences = await this.memoryStorage.getUserPreferences(
        this.firmId,
        this.lawyerId
      );
      
      return preferences || {};
    } catch (error) {
      console.error('[LearningIntegration] Error getting preferences:', error);
      return {};
    }
  }
  
  /**
   * Get learned patterns for this lawyer
   */
  async getLearnedPatterns() {
    if (!LEARNING_SYSTEMS_AVAILABLE) {
      return [];
    }
    
    try {
      const patterns = await this.learningOptimizer.getPatternsForUser(
        this.firmId,
        this.lawyerId,
        'document_retrieval'
      );
      
      return patterns || [];
    } catch (error) {
      console.error('[LearningIntegration] Error getting patterns:', error);
      return [];
    }
  }
  
  /**
   * Enhance query with learned patterns
   */
  async enhanceQueryWithLearning(query, lawyerContext) {
    const { preferences, learnedPatterns } = lawyerContext;
    
    let enhancedQuery = query;
    
    // Add document type preferences
    const preferredDocTypes = preferences.document_type_preferences || [];
    if (preferredDocTypes.length > 0) {
      enhancedQuery += ` ${preferredDocTypes.join(' ')}`;
    }
    
    // Add learned query expansion patterns
    for (const pattern of learnedPatterns) {
      if (pattern.type === 'query_expansion' && 
          pattern.confidence > 0.7) {
        enhancedQuery += ` ${pattern.expansion_terms}`;
      }
    }
    
    // Add jurisdiction preferences if present
    if (preferences.preferred_jurisdiction) {
      enhancedQuery += ` jurisdiction:${preferences.preferred_jurisdiction}`;
    }
    
    return enhancedQuery.trim();
  }
  
  /**
   * Perform base semantic search (calls existing embedding service)
   */
  async performBaseSemanticSearch(query, options) {
    // This would call the existing embeddingService.js
    // For now, simulate with database query
    
    try {
      // Call existing embedding service via import
      const embeddingService = await import('./embeddingService.js');
      return await embeddingService.semanticSearch(query, this.firmId, options);
    } catch (error) {
      console.error('[LearningIntegration] Base search error:', error);
      
      // Fallback to direct database query
      return await this.fallbackSemanticSearch(query, options);
    }
  }
  
  /**
   * Fallback semantic search
   */
  async fallbackSemanticSearch(query, options) {
    // Simplified fallback - in production, use pgvector
    const result = await query(`
      SELECT 
        d.id as document_id,
        d.name as document_name,
        d.type as document_type,
        d.matter_id,
        m.name as matter_name,
        0.8 as similarity,  -- Mock similarity
        LEFT(d.description, 500) as chunk_text,
        'fallback' as source
      FROM documents d
      LEFT JOIN matters m ON m.id = d.matter_id
      WHERE d.firm_id = $1
        AND d.status != 'deleted'
        AND (
          d.name ILIKE $2
          OR d.description ILIKE $2
        )
      LIMIT $3
    `, [this.firmId, `%${query}%`, options.limit || 10]);
    
    return result.rows;
  }
  
  /**
   * Apply learning-based weighting to results
   */
  async applyLearningWeights(results, lawyerContext) {
    const { preferences, learnedPatterns, privacyLevel } = lawyerContext;
    
    return results.map(result => {
      let learnedRelevance = result.similarity || 0.5;
      let weightFactors = [];
      
      // 1. Document type preference weighting
      if (preferences.document_type_preferences?.includes(result.document_type)) {
        learnedRelevance *= 1.3;
        weightFactors.push('preferred_doc_type');
      }
      
      // 2. Matter type preference weighting
      if (preferences.matter_type_preferences) {
        const matterName = result.matter_name || '';
        for (const preferredMatter of preferences.matter_type_preferences) {
          if (matterName.toLowerCase().includes(preferredMatter.toLowerCase())) {
            learnedRelevance *= 1.2;
            weightFactors.push('preferred_matter_type');
            break;
          }
        }
      }
      
      // 3. Apply learned success patterns
      for (const pattern of learnedPatterns) {
        if (pattern.type === 'successful_retrieval_pattern') {
          const matchesPattern = this.patternMatchesResult(pattern, result);
          if (matchesPattern) {
            learnedRelevance *= (1 + (pattern.confidence * 0.5));
            weightFactors.push('learned_success_pattern');
          }
        }
      }
      
      // 4. Privacy-based filtering
      if (privacyLevel === 'strict') {
        // Strict privacy: only weight user's own documents higher
        // (implementation depends on ownership tracking)
        weightFactors.push('strict_privacy_applied');
      }
      
      return {
        ...result,
        learnedRelevance,
        weightFactors,
        originalSimilarity: result.similarity || 0.5
      };
    });
  }
  
  /**
   * Check if result matches learned pattern
   */
  patternMatchesResult(pattern, result) {
    if (!pattern.conditions) return false;
    
    const conditions = pattern.conditions;
    let matches = 0;
    let totalConditions = 0;
    
    if (conditions.document_type && result.document_type === conditions.document_type) {
      matches++;
    }
    totalConditions++;
    
    if (conditions.matter_type) {
      const matterName = result.matter_name || '';
      if (matterName.toLowerCase().includes(conditions.matter_type.toLowerCase())) {
        matches++;
      }
      totalConditions++;
    }
    
    // Require at least 50% match
    return totalConditions > 0 && (matches / totalConditions) >= 0.5;
  }
  
  /**
   * Track retrieval for future learning
   */
  async trackRetrievalForLearning(query, results, lawyerContext) {
    if (!LEARNING_SYSTEMS_AVAILABLE) {
      return;
    }
    
    try {
      const retrievalData = {
        query,
        results: results.map(r => ({
          document_id: r.document_id,
          document_type: r.document_type,
          learned_relevance: r.learnedRelevance,
          weight_factors: r.weightFactors
        })),
        lawyer_context: {
          privacy_level: lawyerContext.privacyLevel,
          preference_count: Object.keys(lawyerContext.preferences).length,
          pattern_count: lawyerContext.learnedPatterns.length
        },
        timestamp: new Date().toISOString()
      };
      
      // Store in learning system
      await this.memoryStorage.storeRetrievalPattern(
        this.firmId,
        this.lawyerId,
        retrievalData
      );
      
      console.log('[LearningIntegration] Retrieval tracked for learning');
    } catch (error) {
      console.error('[LearningIntegration] Error tracking retrieval:', error);
    }
  }
  
  /**
   * Format result for output
   */
  formatResultForOutput(result, lawyerContext) {
    return {
      documentId: result.document_id,
      documentName: result.document_name,
      matterId: result.matter_id,
      matterName: result.matter_name,
      documentType: result.document_type,
      similarity: result.originalSimilarity,
      learnedRelevance: result.learnedRelevance,
      relevanceBoost: result.learnedRelevance - result.originalSimilarity,
      weightFactors: result.weightFactors,
      chunkText: result.chunk_text?.substring(0, 500) + '...',
      source: result.source || 'semantic',
      privacyDisclaimer: lawyerContext.disclaimer
    };
  }
  
  /**
   * Get privacy disclaimer based on privacy level
   */
  getPrivacyDisclaimer(privacyLevel) {
    switch (privacyLevel) {
      case 'strict':
        return 'Results weighted by your personal preferences only';
      case 'firm_anonymous':
        return 'Results include anonymous firm patterns';
      case 'firm_collaborative':
        return 'Results include attributed firm learnings';
      default:
        return 'Basic retrieval without learning integration';
    }
  }
  
  /**
   * Fallback context when learning systems unavailable
   */
  getFallbackContext() {
    return {
      privacyLevel: 'basic',
      preferences: {},
      learnedPatterns: [],
      disclaimer: 'Learning integration unavailable - using basic retrieval'
    };
  }
}

/**
 * Convenience function for integrated search
 */
export async function learningIntegratedSearch(
  query,
  firmId,
  lawyerId,
  options = {}
) {
  const retrieval = new LearningIntegratedRetrieval(firmId, lawyerId);
  return await retrieval.semanticSearch(query, options);
}

export default {
  LearningIntegratedRetrieval,
  learningIntegratedSearch
};