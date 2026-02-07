/**
 * Embedding Backfill - Index existing documents for semantic search
 * 
 * When semantic search is first enabled, existing documents in the firm's
 * matters need to be embedded. This service:
 * 
 * 1. Finds all documents with content_text that haven't been embedded yet
 * 2. Embeds them in batches to avoid overwhelming the Azure OpenAI API
 * 3. Tracks progress so it can be resumed if interrupted
 * 4. Runs as a background process, doesn't block anything
 * 
 * Can be triggered:
 * - Via API endpoint: POST /api/v1/background-agent/embed-backfill
 * - Automatically on first background task start (if embeddings are empty)
 */

import { query } from '../../db/connection.js';
import { storeDocumentEmbeddings } from '../embeddingService.js';

// Track active backfill per firm to prevent duplicate runs
const activeBackfills = new Map();

/**
 * Check if a firm needs embedding backfill.
 * Returns true if there are documents with content but no embeddings.
 */
export async function needsBackfill(firmId) {
  try {
    const result = await query(`
      SELECT 
        (SELECT COUNT(*) FROM documents WHERE firm_id = $1 AND content_text IS NOT NULL AND LENGTH(content_text) > 50) as docs_with_content,
        (SELECT COUNT(DISTINCT document_id) FROM document_embeddings WHERE firm_id = $1) as docs_embedded
    `, [firmId]);
    
    const row = result.rows[0];
    const docsWithContent = parseInt(row.docs_with_content) || 0;
    const docsEmbedded = parseInt(row.docs_embedded) || 0;
    
    return {
      needed: docsWithContent > docsEmbedded,
      docsWithContent,
      docsEmbedded,
      docsRemaining: docsWithContent - docsEmbedded,
    };
  } catch (e) {
    return { needed: false, docsWithContent: 0, docsEmbedded: 0, docsRemaining: 0 };
  }
}

/**
 * Run embedding backfill for a firm.
 * Processes documents in batches, with rate limiting and progress tracking.
 * 
 * @param {string} firmId
 * @param {object} options
 * @param {number} options.batchSize - Documents per batch (default 5)
 * @param {number} options.delayMs - Delay between batches (default 2000ms)
 * @param {number} options.maxDocuments - Max documents to process (default 500)
 * @param {function} options.onProgress - Progress callback
 * @returns {object} Result with counts
 */
export async function runBackfill(firmId, options = {}) {
  const {
    batchSize = 5,
    delayMs = 2000,
    maxDocuments = 500,
    onProgress = null,
  } = options;
  
  // Prevent concurrent backfills for the same firm
  if (activeBackfills.has(firmId)) {
    return { error: 'Backfill already running for this firm', inProgress: true };
  }
  
  activeBackfills.set(firmId, { startedAt: new Date(), processed: 0 });
  
  const result = {
    firmId,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    startedAt: new Date(),
    completedAt: null,
  };
  
  try {
    console.log(`[EmbeddingBackfill] Starting backfill for firm ${firmId} (batch=${batchSize}, max=${maxDocuments})`);
    
    // Find documents that need embedding
    const docsResult = await query(`
      SELECT d.id, d.original_name, d.type, d.content_text, d.matter_id, 
             LENGTH(d.content_text) as content_length
      FROM documents d
      WHERE d.firm_id = $1 
        AND d.content_text IS NOT NULL 
        AND LENGTH(d.content_text) > 50
        AND NOT EXISTS (
          SELECT 1 FROM document_embeddings de 
          WHERE de.document_id = d.id AND de.firm_id = d.firm_id
        )
      ORDER BY d.uploaded_at DESC
      LIMIT $2
    `, [firmId, maxDocuments]);
    
    const totalDocs = docsResult.rows.length;
    console.log(`[EmbeddingBackfill] Found ${totalDocs} documents to embed`);
    
    if (totalDocs === 0) {
      result.completedAt = new Date();
      activeBackfills.delete(firmId);
      return result;
    }
    
    // Process in batches
    for (let i = 0; i < totalDocs; i += batchSize) {
      const batch = docsResult.rows.slice(i, i + batchSize);
      
      for (const doc of batch) {
        result.processed++;
        
        try {
          await storeDocumentEmbeddings(doc.id, firmId, doc.content_text, {
            documentType: doc.type,
            documentName: doc.original_name,
            matterId: doc.matter_id,
            source: 'backfill',
          });
          
          result.succeeded++;
          console.log(`[EmbeddingBackfill] [${result.processed}/${totalDocs}] Embedded: "${doc.original_name}" (${doc.content_length} chars)`);
          
        } catch (docError) {
          result.failed++;
          console.warn(`[EmbeddingBackfill] [${result.processed}/${totalDocs}] Failed: "${doc.original_name}": ${docError.message}`);
        }
        
        // Update active backfill tracker
        const tracker = activeBackfills.get(firmId);
        if (tracker) tracker.processed = result.processed;
      }
      
      // Report progress
      if (onProgress) {
        onProgress({
          processed: result.processed,
          total: totalDocs,
          succeeded: result.succeeded,
          failed: result.failed,
          percent: Math.round((result.processed / totalDocs) * 100),
        });
      }
      
      // Rate limiting delay between batches
      if (i + batchSize < totalDocs) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    result.completedAt = new Date();
    const durationSec = Math.round((result.completedAt - result.startedAt) / 1000);
    console.log(`[EmbeddingBackfill] Complete: ${result.succeeded}/${result.processed} embedded in ${durationSec}s (${result.failed} failed)`);
    
    return result;
    
  } catch (error) {
    console.error('[EmbeddingBackfill] Error:', error.message);
    result.error = error.message;
    return result;
  } finally {
    activeBackfills.delete(firmId);
  }
}

/**
 * Get backfill status for a firm.
 */
export function getBackfillStatus(firmId) {
  const active = activeBackfills.get(firmId);
  if (active) {
    return {
      running: true,
      startedAt: active.startedAt,
      processed: active.processed,
    };
  }
  return { running: false };
}

/**
 * Auto-backfill check: called on background task start.
 * If the firm has documents but no embeddings, starts a small backfill
 * in the background (limited to 50 docs to avoid blocking).
 */
export async function autoBackfillIfNeeded(firmId) {
  try {
    const status = await needsBackfill(firmId);
    
    if (status.needed && status.docsEmbedded === 0 && status.docsRemaining > 0) {
      console.log(`[EmbeddingBackfill] Auto-backfill triggered for firm ${firmId}: ${status.docsRemaining} docs need embedding`);
      
      // Run in background with conservative limits
      runBackfill(firmId, {
        batchSize: 3,
        delayMs: 3000,
        maxDocuments: 50, // Only do 50 on auto-backfill, full backfill via API
      }).catch(e => {
        console.warn('[EmbeddingBackfill] Auto-backfill error:', e.message);
      });
      
      return { triggered: true, docsRemaining: status.docsRemaining };
    }
    
    return { triggered: false, docsEmbedded: status.docsEmbedded };
  } catch (e) {
    return { triggered: false, error: e.message };
  }
}
