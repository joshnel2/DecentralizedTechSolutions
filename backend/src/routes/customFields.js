import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const requireAdmin = (req, res, next) => {
  if (!['owner', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Get all custom field definitions for the firm
router.get('/', authenticate, async (req, res) => {
  try {
    const { entityType } = req.query;
    let sql = 'SELECT * FROM custom_field_definitions WHERE firm_id = $1';
    const params = [req.user.firmId];
    if (entityType) {
      sql += ' AND entity_type = $2';
      params.push(entityType);
    }
    sql += ' ORDER BY entity_type, display_order, created_at';
    const result = await query(sql, params);
    res.json({
      fields: result.rows.map(f => ({
        id: f.id,
        entityType: f.entity_type,
        fieldKey: f.field_key,
        fieldLabel: f.field_label,
        fieldType: f.field_type,
        options: f.options,
        isRequired: f.is_required,
        isVisible: f.is_visible,
        displayOrder: f.display_order,
      }))
    });
  } catch (error) {
    console.error('Get custom fields error:', error);
    res.status(500).json({ error: 'Failed to get custom fields' });
  }
});

// Create a custom field definition
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { entityType = 'matter', fieldKey, fieldLabel, fieldType = 'text', options = [], isRequired = false, displayOrder = 0 } = req.body;
    if (!fieldKey || !fieldLabel) return res.status(400).json({ error: 'fieldKey and fieldLabel required' });

    const safeKey = fieldKey.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const result = await query(
      `INSERT INTO custom_field_definitions (firm_id, entity_type, field_key, field_label, field_type, options, is_required, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (firm_id, entity_type, field_key) DO UPDATE SET
         field_label = EXCLUDED.field_label, field_type = EXCLUDED.field_type,
         options = EXCLUDED.options, is_required = EXCLUDED.is_required,
         display_order = EXCLUDED.display_order, updated_at = NOW()
       RETURNING *`,
      [req.user.firmId, entityType, safeKey, fieldLabel, fieldType, JSON.stringify(options), isRequired, displayOrder]
    );
    const f = result.rows[0];
    res.status(201).json({ id: f.id, fieldKey: f.field_key, fieldLabel: f.field_label, fieldType: f.field_type });
  } catch (error) {
    console.error('Create custom field error:', error);
    res.status(500).json({ error: 'Failed to create custom field' });
  }
});

// Update a custom field definition
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { fieldLabel, fieldType, options, isRequired, isVisible, displayOrder } = req.body;
    await query(
      `UPDATE custom_field_definitions SET
        field_label = COALESCE($1, field_label), field_type = COALESCE($2, field_type),
        options = COALESCE($3, options), is_required = COALESCE($4, is_required),
        is_visible = COALESCE($5, is_visible), display_order = COALESCE($6, display_order),
        updated_at = NOW()
       WHERE id = $7 AND firm_id = $8`,
      [fieldLabel, fieldType, options ? JSON.stringify(options) : null, isRequired, isVisible, displayOrder, req.params.id, req.user.firmId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Update custom field error:', error);
    res.status(500).json({ error: 'Failed to update custom field' });
  }
});

// Delete a custom field definition
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM custom_field_definitions WHERE id = $1 AND firm_id = $2', [req.params.id, req.user.firmId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete custom field error:', error);
    res.status(500).json({ error: 'Failed to delete custom field' });
  }
});

export default router;
