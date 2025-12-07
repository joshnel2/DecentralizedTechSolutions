import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ============================================
// DOCUMENT TEMPLATES
// ============================================

// Get all document templates
router.get('/', authenticate, async (req, res) => {
  try {
    const { category, search } = req.query;
    
    let sql = 'SELECT * FROM document_templates WHERE firm_id = $1';
    const params = [req.user.firmId];
    let paramIndex = 2;

    if (category) {
      sql += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (search) {
      sql += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ' ORDER BY usage_count DESC, created_at DESC';

    const result = await query(sql, params);

    res.json({
      templates: result.rows.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        practiceArea: t.practice_area,
        content: t.content,
        variables: t.variables,
        aiEnabled: t.ai_enabled,
        aiPrompts: t.ai_prompts,
        isActive: t.is_active,
        usageCount: t.usage_count,
        createdBy: t.created_by,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      })),
    });
  } catch (error) {
    console.error('Get document templates error:', error);
    res.status(500).json({ error: 'Failed to get document templates' });
  }
});

// Get single document template
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM document_templates WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document template not found' });
    }

    const t = result.rows[0];
    res.json({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      practiceArea: t.practice_area,
      content: t.content,
      variables: t.variables,
      aiEnabled: t.ai_enabled,
      aiPrompts: t.ai_prompts,
      isActive: t.is_active,
      usageCount: t.usage_count,
      createdBy: t.created_by,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    });
  } catch (error) {
    console.error('Get document template error:', error);
    res.status(500).json({ error: 'Failed to get document template' });
  }
});

// Create document template
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description, category, practiceArea, content, variables, aiEnabled, aiPrompts, isActive } = req.body;

    if (!name || !content) {
      return res.status(400).json({ error: 'Name and content are required' });
    }

    const result = await query(
      `INSERT INTO document_templates (firm_id, name, description, category, practice_area, content, variables, ai_enabled, ai_prompts, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        req.user.firmId, name, description, category || 'custom', practiceArea, content,
        variables || [], aiEnabled || false, aiPrompts || [], isActive !== false, req.user.id
      ]
    );

    const t = result.rows[0];
    res.status(201).json({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      practiceArea: t.practice_area,
      content: t.content,
      variables: t.variables,
      aiEnabled: t.ai_enabled,
      aiPrompts: t.ai_prompts,
      isActive: t.is_active,
      usageCount: t.usage_count,
      createdBy: t.created_by,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    });
  } catch (error) {
    console.error('Create document template error:', error);
    res.status(500).json({ error: 'Failed to create document template' });
  }
});

// Update document template
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, description, category, practiceArea, content, variables, aiEnabled, aiPrompts, isActive } = req.body;

    const result = await query(
      `UPDATE document_templates SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        category = COALESCE($3, category),
        practice_area = COALESCE($4, practice_area),
        content = COALESCE($5, content),
        variables = COALESCE($6, variables),
        ai_enabled = COALESCE($7, ai_enabled),
        ai_prompts = COALESCE($8, ai_prompts),
        is_active = COALESCE($9, is_active),
        updated_at = NOW()
       WHERE id = $10 AND firm_id = $11
       RETURNING *`,
      [name, description, category, practiceArea, content, variables, aiEnabled, aiPrompts, isActive, req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document template not found' });
    }

    const t = result.rows[0];
    res.json({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      practiceArea: t.practice_area,
      content: t.content,
      variables: t.variables,
      aiEnabled: t.ai_enabled,
      aiPrompts: t.ai_prompts,
      isActive: t.is_active,
      usageCount: t.usage_count,
      createdBy: t.created_by,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    });
  } catch (error) {
    console.error('Update document template error:', error);
    res.status(500).json({ error: 'Failed to update document template' });
  }
});

// Duplicate document template
router.post('/:id/duplicate', authenticate, async (req, res) => {
  try {
    const original = await query(
      'SELECT * FROM document_templates WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (original.rows.length === 0) {
      return res.status(404).json({ error: 'Document template not found' });
    }

    const o = original.rows[0];
    const result = await query(
      `INSERT INTO document_templates (firm_id, name, description, category, practice_area, content, variables, ai_enabled, ai_prompts, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        req.user.firmId, `${o.name} (Copy)`, o.description, o.category, o.practice_area,
        o.content, o.variables, o.ai_enabled, o.ai_prompts, o.is_active, req.user.id
      ]
    );

    const t = result.rows[0];
    res.status(201).json({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      practiceArea: t.practice_area,
      content: t.content,
      variables: t.variables,
      aiEnabled: t.ai_enabled,
      aiPrompts: t.ai_prompts,
      isActive: t.is_active,
      usageCount: t.usage_count,
      createdBy: t.created_by,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    });
  } catch (error) {
    console.error('Duplicate document template error:', error);
    res.status(500).json({ error: 'Failed to duplicate document template' });
  }
});

// Delete document template
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM document_templates WHERE id = $1 AND firm_id = $2 RETURNING id',
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document template not found' });
    }

    res.json({ message: 'Document template deleted' });
  } catch (error) {
    console.error('Delete document template error:', error);
    res.status(500).json({ error: 'Failed to delete document template' });
  }
});

// Increment usage count
router.post('/:id/use', authenticate, async (req, res) => {
  try {
    await query(
      'UPDATE document_templates SET usage_count = usage_count + 1 WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );
    res.json({ message: 'Usage count incremented' });
  } catch (error) {
    console.error('Increment usage count error:', error);
    res.status(500).json({ error: 'Failed to increment usage count' });
  }
});

// ============================================
// GENERATED DOCUMENTS
// ============================================

// Get all generated documents
router.get('/generated/all', authenticate, async (req, res) => {
  try {
    const { templateId, matterId, clientId, status } = req.query;
    
    let sql = 'SELECT * FROM generated_documents WHERE firm_id = $1';
    const params = [req.user.firmId];
    let paramIndex = 2;

    if (templateId) {
      sql += ` AND template_id = $${paramIndex}`;
      params.push(templateId);
      paramIndex++;
    }

    if (matterId) {
      sql += ` AND matter_id = $${paramIndex}`;
      params.push(matterId);
      paramIndex++;
    }

    if (clientId) {
      sql += ` AND client_id = $${paramIndex}`;
      params.push(clientId);
      paramIndex++;
    }

    if (status) {
      sql += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    sql += ' ORDER BY created_at DESC';

    const result = await query(sql, params);

    res.json({
      generatedDocuments: result.rows.map(d => ({
        id: d.id,
        templateId: d.template_id,
        matterId: d.matter_id,
        clientId: d.client_id,
        name: d.name,
        content: d.content,
        variables: d.variables,
        status: d.status,
        aiReviewNotes: d.ai_review_notes,
        createdBy: d.created_by,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      })),
    });
  } catch (error) {
    console.error('Get generated documents error:', error);
    res.status(500).json({ error: 'Failed to get generated documents' });
  }
});

// Create generated document
router.post('/generated', authenticate, async (req, res) => {
  try {
    const { templateId, matterId, clientId, name, content, variables, status } = req.body;

    if (!name || !content) {
      return res.status(400).json({ error: 'Name and content are required' });
    }

    // Increment template usage count if templateId provided
    if (templateId) {
      await query(
        'UPDATE document_templates SET usage_count = usage_count + 1 WHERE id = $1 AND firm_id = $2',
        [templateId, req.user.firmId]
      );
    }

    const result = await query(
      `INSERT INTO generated_documents (firm_id, template_id, matter_id, client_id, name, content, variables, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [req.user.firmId, templateId, matterId, clientId, name, content, variables || {}, status || 'draft', req.user.id]
    );

    const d = result.rows[0];
    res.status(201).json({
      id: d.id,
      templateId: d.template_id,
      matterId: d.matter_id,
      clientId: d.client_id,
      name: d.name,
      content: d.content,
      variables: d.variables,
      status: d.status,
      aiReviewNotes: d.ai_review_notes,
      createdBy: d.created_by,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    });
  } catch (error) {
    console.error('Create generated document error:', error);
    res.status(500).json({ error: 'Failed to create generated document' });
  }
});

// Update generated document
router.put('/generated/:id', authenticate, async (req, res) => {
  try {
    const { name, content, variables, status, aiReviewNotes } = req.body;

    const result = await query(
      `UPDATE generated_documents SET
        name = COALESCE($1, name),
        content = COALESCE($2, content),
        variables = COALESCE($3, variables),
        status = COALESCE($4, status),
        ai_review_notes = COALESCE($5, ai_review_notes),
        updated_at = NOW()
       WHERE id = $6 AND firm_id = $7
       RETURNING *`,
      [name, content, variables, status, aiReviewNotes, req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Generated document not found' });
    }

    const d = result.rows[0];
    res.json({
      id: d.id,
      templateId: d.template_id,
      matterId: d.matter_id,
      clientId: d.client_id,
      name: d.name,
      content: d.content,
      variables: d.variables,
      status: d.status,
      aiReviewNotes: d.ai_review_notes,
      createdBy: d.created_by,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    });
  } catch (error) {
    console.error('Update generated document error:', error);
    res.status(500).json({ error: 'Failed to update generated document' });
  }
});

// Delete generated document
router.delete('/generated/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM generated_documents WHERE id = $1 AND firm_id = $2 RETURNING id',
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Generated document not found' });
    }

    res.json({ message: 'Generated document deleted' });
  } catch (error) {
    console.error('Delete generated document error:', error);
    res.status(500).json({ error: 'Failed to delete generated document' });
  }
});

// ============================================
// GET ALL TEMPLATE DATA (for initial load)
// ============================================

router.get('/all/data', authenticate, async (req, res) => {
  try {
    const [templates, generatedDocs] = await Promise.all([
      query('SELECT * FROM document_templates WHERE firm_id = $1 ORDER BY usage_count DESC', [req.user.firmId]),
      query('SELECT * FROM generated_documents WHERE firm_id = $1 ORDER BY created_at DESC', [req.user.firmId]),
    ]);

    res.json({
      templates: templates.rows.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        practiceArea: t.practice_area,
        content: t.content,
        variables: t.variables,
        aiEnabled: t.ai_enabled,
        aiPrompts: t.ai_prompts,
        isActive: t.is_active,
        usageCount: t.usage_count,
        createdBy: t.created_by,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      })),
      generatedDocuments: generatedDocs.rows.map(d => ({
        id: d.id,
        templateId: d.template_id,
        matterId: d.matter_id,
        clientId: d.client_id,
        name: d.name,
        content: d.content,
        variables: d.variables,
        status: d.status,
        aiReviewNotes: d.ai_review_notes,
        createdBy: d.created_by,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      })),
    });
  } catch (error) {
    console.error('Get all template data error:', error);
    res.status(500).json({ error: 'Failed to get template data' });
  }
});

export default router;
