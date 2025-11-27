import { Router } from 'express';
import { query, withTransaction } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const router = Router();

// Get all matters
router.get('/', authenticate, requirePermission('matters:view'), async (req, res) => {
  try {
    const { 
      search, status, type, clientId, assignedTo, priority,
      limit = 100, offset = 0 
    } = req.query;
    
    let sql = `
      SELECT m.*,
             c.display_name as client_name,
             u.first_name || ' ' || u.last_name as responsible_attorney_name,
             array_agg(DISTINCT ma.user_id) FILTER (WHERE ma.user_id IS NOT NULL) as assigned_to
      FROM matters m
      LEFT JOIN clients c ON m.client_id = c.id
      LEFT JOIN users u ON m.responsible_attorney = u.id
      LEFT JOIN matter_assignments ma ON m.id = ma.matter_id
      WHERE m.firm_id = $1
    `;
    const params = [req.user.firmId];
    let paramIndex = 2;

    if (search) {
      sql += ` AND (m.name ILIKE $${paramIndex} OR m.number ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (status) {
      sql += ` AND m.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (type) {
      sql += ` AND m.type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (clientId) {
      sql += ` AND m.client_id = $${paramIndex}`;
      params.push(clientId);
      paramIndex++;
    }

    if (assignedTo) {
      sql += ` AND EXISTS (SELECT 1 FROM matter_assignments WHERE matter_id = m.id AND user_id = $${paramIndex})`;
      params.push(assignedTo);
      paramIndex++;
    }

    if (priority) {
      sql += ` AND m.priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    sql += ` GROUP BY m.id, c.display_name, u.first_name, u.last_name
             ORDER BY m.created_at DESC 
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);

    const countResult = await query(
      'SELECT COUNT(*) FROM matters WHERE firm_id = $1',
      [req.user.firmId]
    );

    res.json({
      matters: result.rows.map(m => ({
        id: m.id,
        number: m.number,
        name: m.name,
        description: m.description,
        clientId: m.client_id,
        clientName: m.client_name,
        type: m.type,
        status: m.status,
        priority: m.priority,
        assignedTo: m.assigned_to || [],
        responsibleAttorney: m.responsible_attorney,
        responsibleAttorneyName: m.responsible_attorney_name,
        openDate: m.open_date,
        closeDate: m.close_date,
        statuteOfLimitations: m.statute_of_limitations,
        courtInfo: m.court_name ? {
          courtName: m.court_name,
          caseNumber: m.case_number,
          judge: m.judge,
          jurisdiction: m.jurisdiction,
        } : null,
        billingType: m.billing_type,
        billingRate: m.billing_rate,
        flatFee: m.flat_fee,
        contingencyPercent: m.contingency_percent,
        retainerAmount: m.retainer_amount,
        budget: m.budget,
        tags: m.tags,
        aiSummary: m.ai_summary,
        conflictCleared: m.conflict_cleared,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      })),
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error('Get matters error:', error);
    res.status(500).json({ error: 'Failed to get matters' });
  }
});

// Get single matter
router.get('/:id', authenticate, requirePermission('matters:view'), async (req, res) => {
  try {
    const result = await query(
      `SELECT m.*,
              c.display_name as client_name,
              u.first_name || ' ' || u.last_name as responsible_attorney_name,
              array_agg(DISTINCT ma.user_id) FILTER (WHERE ma.user_id IS NOT NULL) as assigned_to
       FROM matters m
       LEFT JOIN clients c ON m.client_id = c.id
       LEFT JOIN users u ON m.responsible_attorney = u.id
       LEFT JOIN matter_assignments ma ON m.id = ma.matter_id
       WHERE m.id = $1 AND m.firm_id = $2
       GROUP BY m.id, c.display_name, u.first_name, u.last_name`,
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }

    const m = result.rows[0];
    res.json({
      id: m.id,
      number: m.number,
      name: m.name,
      description: m.description,
      clientId: m.client_id,
      clientName: m.client_name,
      type: m.type,
      status: m.status,
      priority: m.priority,
      assignedTo: m.assigned_to || [],
      responsibleAttorney: m.responsible_attorney,
      responsibleAttorneyName: m.responsible_attorney_name,
      openDate: m.open_date,
      closeDate: m.close_date,
      statuteOfLimitations: m.statute_of_limitations,
      courtInfo: m.court_name ? {
        courtName: m.court_name,
        caseNumber: m.case_number,
        judge: m.judge,
        jurisdiction: m.jurisdiction,
      } : null,
      billingType: m.billing_type,
      billingRate: m.billing_rate,
      flatFee: m.flat_fee,
      contingencyPercent: m.contingency_percent,
      retainerAmount: m.retainer_amount,
      budget: m.budget,
      tags: m.tags,
      aiSummary: m.ai_summary,
      conflictCleared: m.conflict_cleared,
      customFields: m.custom_fields,
      createdBy: m.created_by,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    });
  } catch (error) {
    console.error('Get matter error:', error);
    res.status(500).json({ error: 'Failed to get matter' });
  }
});

// Create matter
router.post('/', authenticate, requirePermission('matters:create'), async (req, res) => {
  try {
    const {
      name,
      description,
      clientId,
      type,
      status = 'active',
      priority = 'medium',
      assignedTo = [],
      responsibleAttorney,
      openDate,
      statuteOfLimitations,
      courtInfo,
      billingType = 'hourly',
      billingRate,
      flatFee,
      contingencyPercent,
      retainerAmount,
      budget,
      tags = [],
      conflictCleared = false,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Matter name is required' });
    }

    const result = await withTransaction(async (client) => {
      // Generate matter number
      const countResult = await client.query(
        'SELECT COUNT(*) FROM matters WHERE firm_id = $1',
        [req.user.firmId]
      );
      const count = parseInt(countResult.rows[0].count) + 1;
      const number = `MTR-${new Date().getFullYear()}-${String(count).padStart(3, '0')}`;

      // Create matter
      const matterResult = await client.query(
        `INSERT INTO matters (
          firm_id, number, name, description, client_id, type, status, priority,
          responsible_attorney, open_date, statute_of_limitations,
          court_name, case_number, judge, jurisdiction,
          billing_type, billing_rate, flat_fee, contingency_percent, retainer_amount,
          budget, tags, conflict_cleared, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
        RETURNING *`,
        [
          req.user.firmId, number, name, description, clientId, type, status, priority,
          responsibleAttorney || req.user.id, openDate, statuteOfLimitations,
          courtInfo?.courtName, courtInfo?.caseNumber, courtInfo?.judge, courtInfo?.jurisdiction,
          billingType, billingRate, flatFee, contingencyPercent, retainerAmount,
          budget, tags, conflictCleared, req.user.id
        ]
      );

      const matter = matterResult.rows[0];

      // Add assignments
      for (const userId of assignedTo) {
        await client.query(
          'INSERT INTO matter_assignments (matter_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [matter.id, userId]
        );
      }

      // Also add responsible attorney if not already assigned
      if (responsibleAttorney && !assignedTo.includes(responsibleAttorney)) {
        await client.query(
          'INSERT INTO matter_assignments (matter_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [matter.id, responsibleAttorney, 'responsible_attorney']
        );
      }

      return matter;
    });

    // Log action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'matter.created', 'matter', $3, $4)`,
      [req.user.firmId, req.user.id, result.id, JSON.stringify({ name, number: result.number })]
    );

    res.status(201).json({
      id: result.id,
      number: result.number,
      name: result.name,
      description: result.description,
      clientId: result.client_id,
      type: result.type,
      status: result.status,
      priority: result.priority,
      assignedTo,
      responsibleAttorney: result.responsible_attorney,
      openDate: result.open_date,
      billingType: result.billing_type,
      billingRate: result.billing_rate,
      tags: result.tags,
      conflictCleared: result.conflict_cleared,
      createdAt: result.created_at,
    });
  } catch (error) {
    console.error('Create matter error:', error);
    res.status(500).json({ error: 'Failed to create matter' });
  }
});

// Update matter
router.put('/:id', authenticate, requirePermission('matters:edit'), async (req, res) => {
  try {
    const existing = await query(
      'SELECT id FROM matters WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }

    const {
      name,
      description,
      clientId,
      type,
      status,
      priority,
      assignedTo,
      responsibleAttorney,
      openDate,
      closeDate,
      statuteOfLimitations,
      courtInfo,
      billingType,
      billingRate,
      flatFee,
      contingencyPercent,
      retainerAmount,
      budget,
      tags,
      aiSummary,
      conflictCleared,
    } = req.body;

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE matters SET
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          client_id = COALESCE($3, client_id),
          type = COALESCE($4, type),
          status = COALESCE($5, status),
          priority = COALESCE($6, priority),
          responsible_attorney = COALESCE($7, responsible_attorney),
          open_date = COALESCE($8, open_date),
          close_date = COALESCE($9, close_date),
          statute_of_limitations = COALESCE($10, statute_of_limitations),
          court_name = COALESCE($11, court_name),
          case_number = COALESCE($12, case_number),
          judge = COALESCE($13, judge),
          jurisdiction = COALESCE($14, jurisdiction),
          billing_type = COALESCE($15, billing_type),
          billing_rate = COALESCE($16, billing_rate),
          flat_fee = COALESCE($17, flat_fee),
          contingency_percent = COALESCE($18, contingency_percent),
          retainer_amount = COALESCE($19, retainer_amount),
          budget = COALESCE($20, budget),
          tags = COALESCE($21, tags),
          ai_summary = COALESCE($22, ai_summary),
          conflict_cleared = COALESCE($23, conflict_cleared)
        WHERE id = $24`,
        [
          name, description, clientId, type, status, priority, responsibleAttorney,
          openDate, closeDate, statuteOfLimitations,
          courtInfo?.courtName, courtInfo?.caseNumber, courtInfo?.judge, courtInfo?.jurisdiction,
          billingType, billingRate, flatFee, contingencyPercent, retainerAmount,
          budget, tags, aiSummary, conflictCleared, req.params.id
        ]
      );

      // Update assignments if provided
      if (assignedTo) {
        await client.query('DELETE FROM matter_assignments WHERE matter_id = $1', [req.params.id]);
        for (const userId of assignedTo) {
          await client.query(
            'INSERT INTO matter_assignments (matter_id, user_id) VALUES ($1, $2)',
            [req.params.id, userId]
          );
        }
      }
    });

    // Return updated matter
    const result = await query(
      `SELECT m.*, array_agg(DISTINCT ma.user_id) FILTER (WHERE ma.user_id IS NOT NULL) as assigned_to
       FROM matters m
       LEFT JOIN matter_assignments ma ON m.id = ma.matter_id
       WHERE m.id = $1
       GROUP BY m.id`,
      [req.params.id]
    );

    const m = result.rows[0];
    res.json({
      id: m.id,
      number: m.number,
      name: m.name,
      description: m.description,
      clientId: m.client_id,
      type: m.type,
      status: m.status,
      priority: m.priority,
      assignedTo: m.assigned_to || [],
      responsibleAttorney: m.responsible_attorney,
      openDate: m.open_date,
      closeDate: m.close_date,
      billingType: m.billing_type,
      billingRate: m.billing_rate,
      tags: m.tags,
      conflictCleared: m.conflict_cleared,
      updatedAt: m.updated_at,
    });
  } catch (error) {
    console.error('Update matter error:', error);
    res.status(500).json({ error: 'Failed to update matter' });
  }
});

// Delete matter
router.delete('/:id', authenticate, requirePermission('matters:delete'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM matters WHERE id = $1 AND firm_id = $2 RETURNING id, number',
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }

    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id)
       VALUES ($1, $2, 'matter.deleted', 'matter', $3)`,
      [req.user.firmId, req.user.id, req.params.id]
    );

    res.json({ message: 'Matter deleted' });
  } catch (error) {
    console.error('Delete matter error:', error);
    res.status(500).json({ error: 'Failed to delete matter' });
  }
});

export default router;
