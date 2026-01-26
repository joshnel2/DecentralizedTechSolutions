/**
 * Document AI API Routes
 * 
 * These endpoints expose AI-powered document features.
 * The AI sees what the user sees - same permissions.
 */

import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import { 
  analyzeDocument,
  getDocumentInsights,
  getMatterDocumentInsights,
  generateMatterBrief,
  findRelatedDocuments,
  extractMatterDeadlines 
} from '../services/documentAI.js';

const router = Router();

// ============================================
// DOCUMENT AI ENDPOINTS
// ============================================

/**
 * Get AI insights for a specific document
 */
router.get('/documents/:documentId/insights', authenticate, async (req, res) => {
  try {
    const { documentId } = req.params;
    const firmId = req.user.firmId;

    // Verify access (user can see this document)
    const docAccess = await query(`
      SELECT d.id, d.matter_id
      FROM documents d
      LEFT JOIN matters m ON m.id = d.matter_id
      LEFT JOIN matter_permissions mp ON mp.matter_id = m.id
      WHERE d.id = $1 AND d.firm_id = $2
        AND (
          m.responsible_attorney_id = $3
          OR m.originating_attorney_id = $3
          OR mp.user_id = $3
          OR EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = $3 AND u.firm_id = d.firm_id 
            AND u.role IN ('owner', 'admin')
          )
          OR d.matter_id IS NULL  -- Firm-level documents
        )
    `, [documentId, firmId, req.user.id]);

    if (docAccess.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const insights = await getDocumentInsights(documentId, firmId);
    
    res.json({ insights });
  } catch (error) {
    console.error('[DocumentAI] Get insights error:', error);
    res.status(500).json({ error: 'Failed to get insights' });
  }
});

/**
 * Request AI analysis for a document
 */
router.post('/documents/:documentId/analyze', authenticate, async (req, res) => {
  try {
    const { documentId } = req.params;
    const firmId = req.user.firmId;
    const userId = req.user.id;

    // Queue for analysis
    const result = await analyzeDocument(documentId, firmId, userId);
    
    res.json({ 
      queued: true,
      message: 'Document queued for AI analysis'
    });
  } catch (error) {
    console.error('[DocumentAI] Analyze error:', error);
    res.status(500).json({ error: 'Failed to queue analysis' });
  }
});

/**
 * Get AI insights for all documents in a matter
 */
router.get('/matters/:matterId/document-insights', authenticate, async (req, res) => {
  try {
    const { matterId } = req.params;
    const firmId = req.user.firmId;

    // Verify matter access
    const matterAccess = await verifyMatterAccess(req.user.id, matterId, firmId);
    if (!matterAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const insights = await getMatterDocumentInsights(matterId, firmId);
    
    res.json({ 
      matterId,
      documentCount: insights.length,
      insights 
    });
  } catch (error) {
    console.error('[DocumentAI] Matter insights error:', error);
    res.status(500).json({ error: 'Failed to get matter insights' });
  }
});

/**
 * Generate a quick brief for a matter
 * "Give me a 2-minute overview of this case"
 */
router.get('/matters/:matterId/brief', authenticate, async (req, res) => {
  try {
    const { matterId } = req.params;
    const firmId = req.user.firmId;
    const userId = req.user.id;

    // Verify access
    const matterAccess = await verifyMatterAccess(userId, matterId, firmId);
    if (!matterAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const brief = await generateMatterBrief(matterId, firmId, userId);
    
    if (!brief) {
      return res.status(404).json({ error: 'Matter not found' });
    }

    res.json(brief);
  } catch (error) {
    console.error('[DocumentAI] Brief error:', error);
    res.status(500).json({ error: 'Failed to generate brief' });
  }
});

/**
 * Find documents similar to this one
 */
router.get('/documents/:documentId/related', authenticate, async (req, res) => {
  try {
    const { documentId } = req.params;
    const { limit = 5 } = req.query;
    const firmId = req.user.firmId;
    const userId = req.user.id;

    const related = await findRelatedDocuments(documentId, firmId, userId, parseInt(limit));
    
    res.json({ related });
  } catch (error) {
    console.error('[DocumentAI] Related docs error:', error);
    res.status(500).json({ error: 'Failed to find related documents' });
  }
});

/**
 * Extract all deadlines from documents in a matter
 */
router.get('/matters/:matterId/deadlines', authenticate, async (req, res) => {
  try {
    const { matterId } = req.params;
    const firmId = req.user.firmId;

    // Verify access
    const matterAccess = await verifyMatterAccess(req.user.id, matterId, firmId);
    if (!matterAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const deadlines = await extractMatterDeadlines(matterId, firmId);
    
    res.json({ 
      matterId,
      deadlineCount: deadlines.length,
      deadlines 
    });
  } catch (error) {
    console.error('[DocumentAI] Deadlines error:', error);
    res.status(500).json({ error: 'Failed to extract deadlines' });
  }
});

/**
 * Semantic search across all user's documents
 * Better than keyword search - understands meaning
 */
router.get('/search', authenticate, async (req, res) => {
  try {
    const { q, matterId, type, limit = 20 } = req.query;
    const firmId = req.user.firmId;
    const userId = req.user.id;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query too short' });
    }

    // Build search query with permission filtering
    let searchQuery = `
      SELECT DISTINCT
        d.id,
        d.name,
        d.type,
        d.folder_path,
        d.matter_id,
        m.name as matter_name,
        i.summary,
        i.document_type,
        i.suggested_tags,
        i.importance_score,
        ts_rank(to_tsvector('english', COALESCE(d.name, '') || ' ' || COALESCE(i.summary, '')), 
                plainto_tsquery('english', $1)) as rank
      FROM documents d
      LEFT JOIN document_ai_insights i ON i.document_id = d.id
      LEFT JOIN matters m ON m.id = d.matter_id
      LEFT JOIN matter_permissions mp ON mp.matter_id = m.id
      WHERE d.firm_id = $2
        AND d.status != 'deleted'
        AND (
          -- Permission check
          m.responsible_attorney_id = $3
          OR m.originating_attorney_id = $3
          OR mp.user_id = $3
          OR EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = $3 AND u.firm_id = d.firm_id 
            AND u.role IN ('owner', 'admin')
          )
          OR d.matter_id IS NULL
        )
        AND (
          -- Search in name, summary, and tags
          d.name ILIKE $4
          OR i.summary ILIKE $4
          OR $1 = ANY(i.suggested_tags)
          OR to_tsvector('english', COALESCE(d.name, '') || ' ' || COALESCE(i.summary, '')) 
             @@ plainto_tsquery('english', $1)
        )
    `;

    const params = [q, firmId, userId, `%${q}%`];
    let paramIndex = 5;

    // Optional matter filter
    if (matterId) {
      searchQuery += ` AND d.matter_id = $${paramIndex++}`;
      params.push(matterId);
    }

    // Optional document type filter
    if (type) {
      searchQuery += ` AND i.document_type = $${paramIndex++}`;
      params.push(type);
    }

    searchQuery += ` ORDER BY rank DESC, i.importance_score DESC NULLS LAST LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    const result = await query(searchQuery, params);

    res.json({
      query: q,
      resultCount: result.rows.length,
      results: result.rows,
    });
  } catch (error) {
    console.error('[DocumentAI] Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * Log drive activity (called by desktop client)
 */
router.post('/activity', authenticate, async (req, res) => {
  try {
    const { action, documentId, matterId, fileName, fileType, folderPath, durationSeconds, metadata } = req.body;
    const firmId = req.user.firmId;
    const userId = req.user.id;

    await query(`
      INSERT INTO drive_activity_log (
        firm_id, user_id, document_id, matter_id, action,
        file_name, file_type, folder_path, duration_seconds, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [firmId, userId, documentId, matterId, action, fileName, fileType, folderPath, durationSeconds, JSON.stringify(metadata || {})]);

    res.json({ success: true });
  } catch (error) {
    // Table might not exist, that's okay
    res.json({ success: true });
  }
});

/**
 * Get recent activity for the dashboard
 */
router.get('/activity/recent', authenticate, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const firmId = req.user.firmId;
    const userId = req.user.id;

    const result = await query(`
      SELECT 
        a.action,
        a.file_name,
        a.file_type,
        a.folder_path,
        a.source,
        a.created_at,
        m.name as matter_name,
        d.id as document_id
      FROM drive_activity_log a
      LEFT JOIN matters m ON m.id = a.matter_id
      LEFT JOIN documents d ON d.id = a.document_id
      WHERE a.firm_id = $1 AND a.user_id = $2
      ORDER BY a.created_at DESC
      LIMIT $3
    `, [firmId, userId, parseInt(limit)]);

    res.json({ activity: result.rows });
  } catch (error) {
    res.json({ activity: [] });
  }
});

/**
 * Get document types summary for dashboard
 */
router.get('/stats/document-types', authenticate, async (req, res) => {
  try {
    const firmId = req.user.firmId;
    const userId = req.user.id;

    const result = await query(`
      SELECT 
        i.document_type,
        COUNT(*) as count
      FROM documents d
      JOIN document_ai_insights i ON i.document_id = d.id
      LEFT JOIN matters m ON m.id = d.matter_id
      LEFT JOIN matter_permissions mp ON mp.matter_id = m.id
      WHERE d.firm_id = $1 AND d.status != 'deleted'
        AND (
          m.responsible_attorney_id = $2
          OR m.originating_attorney_id = $2
          OR mp.user_id = $2
          OR EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = $2 AND u.firm_id = d.firm_id 
            AND u.role IN ('owner', 'admin')
          )
        )
      GROUP BY i.document_type
      ORDER BY count DESC
    `, [firmId, userId]);

    res.json({ types: result.rows });
  } catch (error) {
    res.json({ types: [] });
  }
});

// Helper function
async function verifyMatterAccess(userId, matterId, firmId) {
  const result = await query(`
    SELECT 1 FROM matters m
    LEFT JOIN matter_permissions mp ON mp.matter_id = m.id
    WHERE m.id = $1 AND m.firm_id = $2
      AND (
        m.responsible_attorney_id = $3
        OR m.originating_attorney_id = $3
        OR mp.user_id = $3
        OR EXISTS (
          SELECT 1 FROM users u 
          WHERE u.id = $3 
          AND u.firm_id = m.firm_id 
          AND u.role IN ('owner', 'admin')
        )
      )
    LIMIT 1
  `, [matterId, firmId, userId]);

  return result.rows.length > 0;
}

export default router;
