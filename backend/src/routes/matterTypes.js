import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Get all matter types for firm
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM matter_types WHERE firm_id = $1 ORDER BY label ASC`,
      [req.user.firmId]
    );

    res.json({
      matterTypes: result.rows.map(mt => ({
        id: mt.id,
        value: mt.value,
        label: mt.label,
        active: mt.active,
        createdAt: mt.created_at,
        updatedAt: mt.updated_at,
      })),
    });
  } catch (error) {
    console.error('Get matter types error:', error);
    res.status(500).json({ error: 'Failed to get matter types' });
  }
});

// Create matter type
router.post('/', authenticate, async (req, res) => {
  try {
    const { value, label } = req.body;

    if (!value || !label) {
      return res.status(400).json({ error: 'Value and label are required' });
    }

    const result = await query(
      `INSERT INTO matter_types (firm_id, value, label, active)
       VALUES ($1, $2, $3, true)
       RETURNING *`,
      [req.user.firmId, value.toLowerCase().replace(/\s+/g, '_'), label]
    );

    const mt = result.rows[0];
    res.status(201).json({
      id: mt.id,
      value: mt.value,
      label: mt.label,
      active: mt.active,
      createdAt: mt.created_at,
      updatedAt: mt.updated_at,
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Matter type already exists' });
    }
    console.error('Create matter type error:', error);
    res.status(500).json({ error: 'Failed to create matter type' });
  }
});

// Update matter type
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { value, label, active } = req.body;

    const result = await query(
      `UPDATE matter_types SET
        value = COALESCE($1, value),
        label = COALESCE($2, label),
        active = COALESCE($3, active),
        updated_at = NOW()
       WHERE id = $4 AND firm_id = $5
       RETURNING *`,
      [value, label, active, req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Matter type not found' });
    }

    const mt = result.rows[0];
    res.json({
      id: mt.id,
      value: mt.value,
      label: mt.label,
      active: mt.active,
      createdAt: mt.created_at,
      updatedAt: mt.updated_at,
    });
  } catch (error) {
    console.error('Update matter type error:', error);
    res.status(500).json({ error: 'Failed to update matter type' });
  }
});

// Delete matter type
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM matter_types WHERE id = $1 AND firm_id = $2 RETURNING id`,
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Matter type not found' });
    }

    res.json({ message: 'Matter type deleted' });
  } catch (error) {
    console.error('Delete matter type error:', error);
    res.status(500).json({ error: 'Failed to delete matter type' });
  }
});

// Seed default matter types for a firm (called when firm is created or on first access)
router.post('/seed-defaults', authenticate, async (req, res) => {
  try {
    // Check if firm already has matter types
    const existing = await query(
      'SELECT COUNT(*) FROM matter_types WHERE firm_id = $1',
      [req.user.firmId]
    );

    if (parseInt(existing.rows[0].count) > 0) {
      return res.json({ message: 'Matter types already exist', seeded: false });
    }

    const defaultTypes = [
      { value: 'litigation', label: 'Litigation' },
      { value: 'corporate', label: 'Corporate' },
      { value: 'real_estate', label: 'Real Estate' },
      { value: 'intellectual_property', label: 'Intellectual Property' },
      { value: 'employment', label: 'Employment' },
      { value: 'personal_injury', label: 'Personal Injury' },
      { value: 'estate_planning', label: 'Estate Planning' },
      { value: 'family', label: 'Family Law' },
      { value: 'criminal', label: 'Criminal' },
      { value: 'immigration', label: 'Immigration' },
      { value: 'bankruptcy', label: 'Bankruptcy' },
      { value: 'tax', label: 'Tax' },
      { value: 'other', label: 'Other' },
    ];

    for (const type of defaultTypes) {
      await query(
        `INSERT INTO matter_types (firm_id, value, label, active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (firm_id, value) DO NOTHING`,
        [req.user.firmId, type.value, type.label]
      );
    }

    res.json({ message: 'Default matter types seeded', seeded: true });
  } catch (error) {
    console.error('Seed matter types error:', error);
    res.status(500).json({ error: 'Failed to seed matter types' });
  }
});

export default router;
