/**
 * Legal Research API Routes
 * 
 * Endpoints for the legal AI research integration.
 * Instead of competing with AI's legal research mastery, we plug into it.
 * These routes let the frontend manage research sessions, browse findings,
 * and trigger background agent research workflows.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { query } from '../db/connection.js';

const router = Router();

// ============================================
// RESEARCH SESSIONS
// ============================================

/**
 * GET /legal-research/sessions - List user's research sessions
 */
router.get('/sessions', authenticate, async (req, res) => {
  try {
    const { status, research_type, jurisdiction, matter_id, limit = 20, offset = 0 } = req.query;
    
    let sql = `
      SELECT lrs.*, m.name as matter_name, m.number as matter_number
      FROM legal_research_sessions lrs
      LEFT JOIN matters m ON lrs.matter_id = m.id
      WHERE lrs.user_id = $1 AND lrs.firm_id = $2
    `;
    const params = [req.user.id, req.user.firmId];
    let paramIdx = 3;
    
    if (status) {
      sql += ` AND lrs.status = $${paramIdx++}`;
      params.push(status);
    }
    if (research_type) {
      sql += ` AND lrs.research_type = $${paramIdx++}`;
      params.push(research_type);
    }
    if (jurisdiction) {
      sql += ` AND lrs.jurisdiction = $${paramIdx++}`;
      params.push(jurisdiction);
    }
    if (matter_id) {
      sql += ` AND lrs.matter_id = $${paramIdx++}`;
      params.push(matter_id);
    }
    
    sql += ` ORDER BY lrs.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await query(sql, params);
    
    // Get total count
    let countSql = `
      SELECT COUNT(*) FROM legal_research_sessions 
      WHERE user_id = $1 AND firm_id = $2
    `;
    const countParams = [req.user.id, req.user.firmId];
    if (status) countSql += ` AND status = '${status}'`;
    
    const countResult = await query(countSql, countParams);
    
    res.json({
      sessions: result.rows,
      total: parseInt(countResult.rows[0]?.count || 0),
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error('[LegalResearch] Error listing sessions:', error);
    res.status(500).json({ error: 'Failed to list research sessions' });
  }
});

/**
 * GET /legal-research/sessions/:id - Get a specific research session
 */
router.get('/sessions/:id', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT lrs.*, m.name as matter_name, m.number as matter_number
      FROM legal_research_sessions lrs
      LEFT JOIN matters m ON lrs.matter_id = m.id
      WHERE lrs.id = $1 AND lrs.user_id = $2
    `, [req.params.id, req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Research session not found' });
    }
    
    res.json({ session: result.rows[0] });
  } catch (error) {
    console.error('[LegalResearch] Error getting session:', error);
    res.status(500).json({ error: 'Failed to get research session' });
  }
});

/**
 * DELETE /legal-research/sessions/:id - Delete a research session
 */
router.delete('/sessions/:id', authenticate, async (req, res) => {
  try {
    const result = await query(`
      DELETE FROM legal_research_sessions 
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [req.params.id, req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Research session not found' });
    }
    
    res.json({ success: true, deleted: result.rows[0].id });
  } catch (error) {
    console.error('[LegalResearch] Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete research session' });
  }
});

// ============================================
// SAVED RESEARCH
// ============================================

/**
 * GET /legal-research/saved - Get saved research results
 */
router.get('/saved', authenticate, async (req, res) => {
  try {
    const { matter_id, research_type, tags, search, limit = 20, offset = 0 } = req.query;
    
    let sql = `
      SELECT lrs.*, m.name as matter_name
      FROM legal_research_saved lrs
      LEFT JOIN matters m ON lrs.matter_id = m.id
      WHERE lrs.user_id = $1 AND lrs.firm_id = $2
    `;
    const params = [req.user.id, req.user.firmId];
    let paramIdx = 3;
    
    if (matter_id) {
      sql += ` AND lrs.matter_id = $${paramIdx++}`;
      params.push(matter_id);
    }
    if (research_type) {
      sql += ` AND lrs.research_type = $${paramIdx++}`;
      params.push(research_type);
    }
    if (tags) {
      sql += ` AND lrs.tags && $${paramIdx++}::text[]`;
      params.push(tags.split(','));
    }
    if (search) {
      sql += ` AND (lrs.title ILIKE $${paramIdx} OR lrs.content ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }
    
    sql += ` ORDER BY lrs.is_pinned DESC, lrs.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await query(sql, params);
    
    res.json({ saved: result.rows });
  } catch (error) {
    console.error('[LegalResearch] Error listing saved research:', error);
    res.status(500).json({ error: 'Failed to list saved research' });
  }
});

/**
 * POST /legal-research/saved - Save a research result
 */
router.post('/saved', authenticate, async (req, res) => {
  try {
    const { session_id, matter_id, title, content, research_type, jurisdiction, citations, tags } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }
    
    const result = await query(`
      INSERT INTO legal_research_saved 
        (user_id, firm_id, session_id, matter_id, title, content, research_type, jurisdiction, citations, tags)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      req.user.id, req.user.firmId, session_id || null, matter_id || null,
      title, content, research_type || 'case_law', jurisdiction || null,
      JSON.stringify(citations || []), tags || [],
    ]);
    
    res.status(201).json({ saved: result.rows[0] });
  } catch (error) {
    console.error('[LegalResearch] Error saving research:', error);
    res.status(500).json({ error: 'Failed to save research' });
  }
});

/**
 * PUT /legal-research/saved/:id/pin - Toggle pin status
 */
router.put('/saved/:id/pin', authenticate, async (req, res) => {
  try {
    const result = await query(`
      UPDATE legal_research_saved 
      SET is_pinned = NOT is_pinned, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [req.params.id, req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Saved research not found' });
    }
    
    res.json({ saved: result.rows[0] });
  } catch (error) {
    console.error('[LegalResearch] Error toggling pin:', error);
    res.status(500).json({ error: 'Failed to toggle pin' });
  }
});

/**
 * DELETE /legal-research/saved/:id - Delete saved research
 */
router.delete('/saved/:id', authenticate, async (req, res) => {
  try {
    const result = await query(`
      DELETE FROM legal_research_saved WHERE id = $1 AND user_id = $2 RETURNING id
    `, [req.params.id, req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Saved research not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[LegalResearch] Error deleting saved research:', error);
    res.status(500).json({ error: 'Failed to delete saved research' });
  }
});

// ============================================
// RESEARCH TEMPLATES
// ============================================

/**
 * GET /legal-research/templates - Get research templates
 */
router.get('/templates', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM legal_research_templates 
      WHERE firm_id = $1 OR is_system = TRUE
      ORDER BY usage_count DESC, name ASC
    `, [req.user.firmId]);
    
    // If no templates exist, seed with defaults
    if (result.rows.length === 0) {
      await seedDefaultTemplates(req.user.firmId);
      const seeded = await query(`
        SELECT * FROM legal_research_templates 
        WHERE firm_id = $1 OR is_system = TRUE
        ORDER BY usage_count DESC, name ASC
      `, [req.user.firmId]);
      return res.json({ templates: seeded.rows });
    }
    
    res.json({ templates: result.rows });
  } catch (error) {
    console.error('[LegalResearch] Error listing templates:', error);
    // Return default templates even if DB fails
    res.json({ templates: getDefaultTemplates() });
  }
});

/**
 * POST /legal-research/templates - Create a research template
 */
router.post('/templates', authenticate, async (req, res) => {
  try {
    const { name, description, research_type, jurisdiction, practice_area, query_template, variables } = req.body;
    
    if (!name || !query_template) {
      return res.status(400).json({ error: 'Name and query_template are required' });
    }
    
    const result = await query(`
      INSERT INTO legal_research_templates 
        (firm_id, name, description, research_type, jurisdiction, practice_area, query_template, variables)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      req.user.firmId, name, description || '', research_type || 'case_law',
      jurisdiction || 'federal', practice_area || 'litigation',
      query_template, JSON.stringify(variables || []),
    ]);
    
    res.status(201).json({ template: result.rows[0] });
  } catch (error) {
    console.error('[LegalResearch] Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// ============================================
// RESEARCH CONFIGURATION
// ============================================

/**
 * GET /legal-research/config - Get available jurisdictions, practice areas, and research types
 */
router.get('/config', authenticate, async (req, res) => {
  try {
    const { RESEARCH_TYPES, JURISDICTIONS, PRACTICE_AREAS } = 
      await import('../services/amplifier/legalResearchIntegration.js');
    
    res.json({
      researchTypes: Object.entries(RESEARCH_TYPES).map(([key, value]) => ({
        id: value,
        name: key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
      })),
      jurisdictions: Object.entries(JURISDICTIONS).map(([key, value]) => ({
        id: key,
        name: value.name,
        courts: value.courts,
        primarySources: value.primarySources,
        citationFormat: value.citationFormat,
      })),
      practiceAreas: Object.entries(PRACTICE_AREAS).map(([key, value]) => ({
        id: key,
        name: value.name,
        focusAreas: value.focusAreas,
      })),
    });
  } catch (error) {
    console.error('[LegalResearch] Error getting config:', error);
    res.status(500).json({ error: 'Failed to get research configuration' });
  }
});

/**
 * GET /legal-research/stats - Get user's research statistics
 */
router.get('/stats', authenticate, async (req, res) => {
  try {
    const stats = await query(`
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_sessions,
        COUNT(*) FILTER (WHERE status = 'in_progress') as active_sessions,
        AVG(quality_score) FILTER (WHERE status = 'completed') as avg_quality_score,
        COUNT(DISTINCT jurisdiction) as jurisdictions_researched,
        COUNT(DISTINCT practice_area) as practice_areas_researched,
        MAX(created_at) as last_research_at
      FROM legal_research_sessions
      WHERE user_id = $1 AND firm_id = $2
    `, [req.user.id, req.user.firmId]);
    
    const savedCount = await query(`
      SELECT COUNT(*) as saved_count 
      FROM legal_research_saved 
      WHERE user_id = $1 AND firm_id = $2
    `, [req.user.id, req.user.firmId]);
    
    res.json({
      stats: {
        ...stats.rows[0],
        saved_count: parseInt(savedCount.rows[0]?.saved_count || 0),
        avg_quality_score: Math.round(parseFloat(stats.rows[0]?.avg_quality_score || 0)),
      },
    });
  } catch (error) {
    console.error('[LegalResearch] Error getting stats:', error);
    res.json({
      stats: {
        total_sessions: 0,
        completed_sessions: 0,
        active_sessions: 0,
        avg_quality_score: 0,
        jurisdictions_researched: 0,
        practice_areas_researched: 0,
        saved_count: 0,
      },
    });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function getDefaultTemplates() {
  return [
    {
      id: 'tpl-sol',
      name: 'Statute of Limitations Check',
      description: 'Research the applicable statute of limitations for a specific claim type',
      research_type: 'statutory',
      jurisdiction: 'ny',
      practice_area: 'litigation',
      query_template: 'What is the statute of limitations for {{claim_type}} claims in {{jurisdiction}}? Include tolling provisions, discovery rules, and any savings statutes.',
      variables: JSON.stringify([{ name: 'claim_type', label: 'Claim Type' }, { name: 'jurisdiction', label: 'Jurisdiction' }]),
      is_system: true,
    },
    {
      id: 'tpl-motion-dismiss',
      name: 'Motion to Dismiss Standards',
      description: 'Research the legal standard for a motion to dismiss',
      research_type: 'case_law',
      jurisdiction: 'federal',
      practice_area: 'litigation',
      query_template: 'What is the standard for a motion to dismiss under {{rule}} in {{jurisdiction}}? Include the applicable burden of proof, key cases, and recent developments.',
      variables: JSON.stringify([{ name: 'rule', label: 'Rule (e.g., 12(b)(6))' }, { name: 'jurisdiction', label: 'Jurisdiction' }]),
      is_system: true,
    },
    {
      id: 'tpl-contract-enforceability',
      name: 'Contract Enforceability',
      description: 'Analyze enforceability of a specific contract provision',
      research_type: 'contract_review',
      jurisdiction: 'federal',
      practice_area: 'corporate',
      query_template: 'Is a {{provision_type}} clause enforceable in {{jurisdiction}}? What are the requirements, limitations, and leading cases?',
      variables: JSON.stringify([{ name: 'provision_type', label: 'Provision Type' }, { name: 'jurisdiction', label: 'Jurisdiction' }]),
      is_system: true,
    },
    {
      id: 'tpl-employment-compliance',
      name: 'Employment Compliance Check',
      description: 'Research compliance requirements for a specific employment issue',
      research_type: 'compliance_check',
      jurisdiction: 'federal',
      practice_area: 'employment',
      query_template: 'What are the legal requirements for {{employment_issue}} under federal and {{state}} law? Include EEOC guidance, recent enforcement actions, and best practices.',
      variables: JSON.stringify([{ name: 'employment_issue', label: 'Employment Issue' }, { name: 'state', label: 'State' }]),
      is_system: true,
    },
    {
      id: 'tpl-discovery-scope',
      name: 'Discovery Scope Analysis',
      description: 'Research the permissible scope of discovery for specific requests',
      research_type: 'case_law',
      jurisdiction: 'federal',
      practice_area: 'litigation',
      query_template: 'What is the scope of permissible discovery for {{discovery_type}} regarding {{topic}} under {{rules}}? Include proportionality analysis and privilege considerations.',
      variables: JSON.stringify([{ name: 'discovery_type', label: 'Discovery Type' }, { name: 'topic', label: 'Topic' }, { name: 'rules', label: 'Applicable Rules' }]),
      is_system: true,
    },
    {
      id: 'tpl-multi-state',
      name: 'Multi-State Comparison',
      description: 'Compare legal treatment of an issue across multiple states',
      research_type: 'multi_jurisdiction',
      jurisdiction: 'federal',
      practice_area: 'litigation',
      query_template: 'How do {{jurisdictions}} treat {{legal_issue}}? Include the majority/minority rule analysis and practical implications for forum selection.',
      variables: JSON.stringify([{ name: 'jurisdictions', label: 'Jurisdictions (comma-separated)' }, { name: 'legal_issue', label: 'Legal Issue' }]),
      is_system: true,
    },
  ];
}

async function seedDefaultTemplates(firmId) {
  const templates = getDefaultTemplates();
  
  for (const tpl of templates) {
    try {
      await query(`
        INSERT INTO legal_research_templates 
          (firm_id, name, description, research_type, jurisdiction, practice_area, query_template, variables, is_system)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
        ON CONFLICT DO NOTHING
      `, [firmId, tpl.name, tpl.description, tpl.research_type, tpl.jurisdiction, tpl.practice_area, tpl.query_template, tpl.variables]);
    } catch (e) {
      // Ignore seed errors
    }
  }
}

export default router;
