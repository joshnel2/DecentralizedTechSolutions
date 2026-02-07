/**
 * Document AI Service
 * 
 * When files are uploaded (desktop or web), this service can:
 * - Auto-summarize documents
 * - Extract key dates/deadlines
 * - Suggest tags and categories
 * - Generate brief summaries for quick review
 * 
 * This is the USER's AI - it sees what they can see.
 */

import { query } from '../db/connection.js';

/**
 * Analyze a document and store AI insights
 * Called after file upload from desktop or web
 */
export async function analyzeDocument(documentId, firmId, userId) {
  try {
    // Get document info
    const docResult = await query(`
      SELECT d.*, m.name as matter_name, m.description as matter_description
      FROM documents d
      LEFT JOIN matters m ON m.id = d.matter_id
      WHERE d.id = $1 AND d.firm_id = $2
    `, [documentId, firmId]);

    if (docResult.rows.length === 0) {
      return null;
    }

    const doc = docResult.rows[0];
    
    // Queue for AI analysis (async - doesn't block upload)
    await queueDocumentAnalysis(documentId, firmId, userId, {
      name: doc.name,
      type: doc.type,
      matterName: doc.matter_name,
      matterDescription: doc.matter_description,
    });

    return { queued: true };
  } catch (error) {
    console.error('[DocumentAI] Analysis error:', error);
    return null;
  }
}

/**
 * Queue document for AI analysis
 */
async function queueDocumentAnalysis(documentId, firmId, userId, metadata) {
  try {
    // Insert into AI background tasks
    await query(`
      INSERT INTO ai_background_tasks (
        firm_id, user_id, task_type, target_type, target_id, 
        metadata, status, priority
      ) VALUES ($1, $2, 'document_analysis', 'document', $3, $4, 'pending', 'normal')
      ON CONFLICT DO NOTHING
    `, [firmId, userId, documentId, JSON.stringify(metadata)]);
  } catch (error) {
    // Table might not exist yet
    console.log('[DocumentAI] Queue error (table may not exist):', error.message);
  }
}

/**
 * Get AI insights for a document
 */
export async function getDocumentInsights(documentId, firmId) {
  try {
    const result = await query(`
      SELECT 
        summary,
        key_dates,
        suggested_tags,
        document_type,
        importance_score,
        related_documents,
        analyzed_at
      FROM document_ai_insights
      WHERE document_id = $1 AND firm_id = $2
    `, [documentId, firmId]);

    return result.rows[0] || null;
  } catch (error) {
    // Table might not exist
    return null;
  }
}

/**
 * Get AI insights for all documents in a matter
 */
export async function getMatterDocumentInsights(matterId, firmId) {
  try {
    const result = await query(`
      SELECT 
        d.id,
        d.name,
        i.summary,
        i.key_dates,
        i.suggested_tags,
        i.document_type,
        i.importance_score,
        i.analyzed_at
      FROM documents d
      LEFT JOIN document_ai_insights i ON i.document_id = d.id
      WHERE d.matter_id = $1 AND d.firm_id = $2 AND d.status != 'deleted'
      ORDER BY i.importance_score DESC NULLS LAST, d.uploaded_at DESC
    `, [matterId, firmId]);

    return result.rows;
  } catch (error) {
    return [];
  }
}

/**
 * Generate a matter briefing from all documents
 * "Give me a 2-minute overview of this case"
 */
export async function generateMatterBrief(matterId, firmId, userId) {
  try {
    // Get all document summaries
    const insights = await getMatterDocumentInsights(matterId, firmId);
    
    // Get matter info
    const matterResult = await query(`
      SELECT m.*, c.name as client_name
      FROM matters m
      LEFT JOIN clients c ON c.id = m.client_id
      WHERE m.id = $1 AND m.firm_id = $2
    `, [matterId, firmId]);

    if (matterResult.rows.length === 0) {
      return null;
    }

    const matter = matterResult.rows[0];

    // Get upcoming deadlines
    const deadlinesResult = await query(`
      SELECT title, start_time, type
      FROM calendar_events
      WHERE matter_id = $1 AND start_time > NOW()
      ORDER BY start_time ASC
      LIMIT 5
    `, [matterId]);

    // Get recent activity
    const activityResult = await query(`
      SELECT description, created_at, hours
      FROM time_entries
      WHERE matter_id = $1
      ORDER BY created_at DESC
      LIMIT 5
    `, [matterId]);

    return {
      matter: {
        name: matter.name,
        number: matter.number,
        client: matter.client_name,
        status: matter.status,
        description: matter.description,
      },
      documentCount: insights.length,
      documentSummaries: insights.slice(0, 10).map(d => ({
        name: d.name,
        summary: d.summary,
        type: d.document_type,
        keyDates: d.key_dates,
      })),
      upcomingDeadlines: deadlinesResult.rows,
      recentActivity: activityResult.rows,
      // This data can be fed to the AI for a natural language brief
    };
  } catch (error) {
    console.error('[DocumentAI] Matter brief error:', error);
    return null;
  }
}

/**
 * Find related documents across matters
 * "Show me similar contracts" or "Find related case law"
 */
export async function findRelatedDocuments(documentId, firmId, userId, limit = 5) {
  try {
    // Get the source document's insights
    const sourceInsights = await getDocumentInsights(documentId, firmId);
    
    if (!sourceInsights) {
      return [];
    }

    // Find documents with similar tags or types
    // In production, this would use vector embeddings for semantic search
    const result = await query(`
      SELECT DISTINCT
        d.id,
        d.name,
        d.matter_id,
        m.name as matter_name,
        i.summary,
        i.document_type,
        i.suggested_tags
      FROM documents d
      LEFT JOIN document_ai_insights i ON i.document_id = d.id
      LEFT JOIN matters m ON m.id = d.matter_id
      LEFT JOIN matter_permissions mp ON mp.matter_id = d.matter_id
      WHERE d.firm_id = $1
        AND d.id != $2
        AND d.status != 'deleted'
        AND (
          i.document_type = $3
          OR i.suggested_tags && $4::text[]
        )
        AND (
          m.responsible_attorney_id = $5
          OR m.originating_attorney_id = $5
          OR mp.user_id = $5
          OR EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = $5 
            AND u.firm_id = m.firm_id 
            AND u.role IN ('owner', 'admin')
          )
        )
      LIMIT $6
    `, [
      firmId, 
      documentId, 
      sourceInsights.document_type,
      sourceInsights.suggested_tags || [],
      userId,
      limit
    ]);

    return result.rows;
  } catch (error) {
    console.error('[DocumentAI] Find related error:', error);
    return [];
  }
}

/**
 * Extract all deadlines from documents in a matter
 * "What are all the dates mentioned in these documents?"
 */
export async function extractMatterDeadlines(matterId, firmId) {
  try {
    const result = await query(`
      SELECT 
        d.name as document_name,
        d.id as document_id,
        jsonb_array_elements(i.key_dates) as deadline_info
      FROM documents d
      JOIN document_ai_insights i ON i.document_id = d.id
      WHERE d.matter_id = $1 AND d.firm_id = $2 AND d.status != 'deleted'
        AND i.key_dates IS NOT NULL AND jsonb_array_length(i.key_dates) > 0
    `, [matterId, firmId]);

    // Parse and sort by date
    const deadlines = result.rows.map(row => ({
      documentName: row.document_name,
      documentId: row.document_id,
      ...row.deadline_info,
    })).sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA - dateB;
    });

    return deadlines;
  } catch (error) {
    console.error('[DocumentAI] Extract deadlines error:', error);
    return [];
  }
}

export default {
  analyzeDocument,
  getDocumentInsights,
  getMatterDocumentInsights,
  generateMatterBrief,
  findRelatedDocuments,
  extractMatterDeadlines,
};
