import { Router } from 'express';
import { query, withTransaction } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { buildVisibilityFilter, canAccessMatter, FULL_ACCESS_ROLES } from '../middleware/matterPermissions.js';
import { getCurrentYear } from '../utils/dateUtils.js';

const router = Router();

// Helper to check if originating_attorney column exists
let hasOriginatingAttorney = null;
async function checkOriginatingAttorneyColumn() {
  if (hasOriginatingAttorney !== null) return hasOriginatingAttorney;
  try {
    const result = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'matters' AND column_name = 'originating_attorney'
    `);
    hasOriginatingAttorney = result.rows.length > 0;
  } catch (e) {
    hasOriginatingAttorney = false;
  }
  return hasOriginatingAttorney;
}

// Get all matters
router.get('/', authenticate, requirePermission('matters:view'), async (req, res) => {
  try {
    const { 
      search, status, type, clientId, assignedTo, priority, visibility,
      view: requestedView = 'my', // 'my' = only my matters, 'all' = all matters I can see
      limit = 1000000, offset = 0  // No limit
    } = req.query;
    
    // Only admins/owners can view "all" matters - everyone else forced to "my"
    const isAdmin = req.user.role === 'owner' || req.user.role === 'admin';
    const view = (requestedView === 'all' && !isAdmin) ? 'my' : requestedView;
    
    // Check if originating_attorney column exists
    const hasOrigAtty = await checkOriginatingAttorneyColumn();
    
    // Build visibility filter based on user role
    const visibilityFilter = buildVisibilityFilter(req.user.id, req.user.role, req.user.firmId, 1);
    
    let sql = hasOrigAtty ? `
      SELECT m.*,
             c.display_name as client_name,
             u.first_name || ' ' || u.last_name as responsible_attorney_name,
             ou.first_name || ' ' || ou.last_name as originating_attorney_name,
             array_agg(DISTINCT ma.user_id) FILTER (WHERE ma.user_id IS NOT NULL) as assigned_to
      FROM matters m
      LEFT JOIN clients c ON m.client_id = c.id
      LEFT JOIN users u ON m.responsible_attorney = u.id
      LEFT JOIN users ou ON m.originating_attorney = ou.id
      LEFT JOIN matter_assignments ma ON m.id = ma.matter_id
      WHERE ${visibilityFilter.clause}
    ` : `
      SELECT m.*,
             c.display_name as client_name,
             u.first_name || ' ' || u.last_name as responsible_attorney_name,
             NULL as originating_attorney_name,
             array_agg(DISTINCT ma.user_id) FILTER (WHERE ma.user_id IS NOT NULL) as assigned_to
      FROM matters m
      LEFT JOIN clients c ON m.client_id = c.id
      LEFT JOIN users u ON m.responsible_attorney = u.id
      LEFT JOIN matter_assignments ma ON m.id = ma.matter_id
      WHERE ${visibilityFilter.clause}
    `;
    const params = [...visibilityFilter.params];
    let paramIndex = visibilityFilter.nextParamIndex;

    // "My Matters" filter - only show matters user is working on
    // This applies to all users, even admins, when they want to see their own matters
    if (view === 'my') {
      sql += ` AND (
        m.responsible_attorney = $${paramIndex}
        OR m.originating_attorney = $${paramIndex}
        OR EXISTS (SELECT 1 FROM matter_assignments ma2 WHERE ma2.matter_id = m.id AND ma2.user_id = $${paramIndex})
        OR m.created_by = $${paramIndex}
      )`;
      params.push(req.user.id);
      paramIndex++;
    }

    // Filter by visibility type if specified
    if (visibility && ['firm_wide', 'restricted'].includes(visibility)) {
      sql += ` AND m.visibility = $${paramIndex}`;
      params.push(visibility);
      paramIndex++;
    }

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

    sql += hasOrigAtty 
      ? ` GROUP BY m.id, c.display_name, u.first_name, u.last_name, ou.first_name, ou.last_name
             ORDER BY m.created_at DESC 
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
      : ` GROUP BY m.id, c.display_name, u.first_name, u.last_name
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
        type: m.type || 'other',
        status: m.status,
        priority: m.priority,
        visibility: m.visibility || 'firm_wide',
        assignedTo: m.assigned_to || [],
        responsibleAttorney: m.responsible_attorney,
        responsibleAttorneyName: m.responsible_attorney_name,
        originatingAttorney: m.originating_attorney,
        originatingAttorneyName: m.originating_attorney_name,
        openDate: m.open_date || m.created_at,
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
        notes: m.notes,
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
    // Check if user has access to this matter
    const access = await canAccessMatter(
      req.user.id,
      req.user.role,
      req.params.id,
      req.user.firmId
    );

    if (!access.hasAccess) {
      return res.status(403).json({ error: 'Access denied to this matter' });
    }

    const hasOrigAtty = await checkOriginatingAttorneyColumn();
    
    const sql = hasOrigAtty 
      ? `SELECT m.*,
              c.display_name as client_name,
              u.first_name || ' ' || u.last_name as responsible_attorney_name,
              ou.first_name || ' ' || ou.last_name as originating_attorney_name,
              array_agg(DISTINCT ma.user_id) FILTER (WHERE ma.user_id IS NOT NULL) as assigned_to
         FROM matters m
         LEFT JOIN clients c ON m.client_id = c.id
         LEFT JOIN users u ON m.responsible_attorney = u.id
         LEFT JOIN users ou ON m.originating_attorney = ou.id
         LEFT JOIN matter_assignments ma ON m.id = ma.matter_id
         WHERE m.id = $1 AND m.firm_id = $2
         GROUP BY m.id, c.display_name, u.first_name, u.last_name, ou.first_name, ou.last_name`
      : `SELECT m.*,
              c.display_name as client_name,
              u.first_name || ' ' || u.last_name as responsible_attorney_name,
              NULL as originating_attorney_name,
              array_agg(DISTINCT ma.user_id) FILTER (WHERE ma.user_id IS NOT NULL) as assigned_to
         FROM matters m
         LEFT JOIN clients c ON m.client_id = c.id
         LEFT JOIN users u ON m.responsible_attorney = u.id
         LEFT JOIN matter_assignments ma ON m.id = ma.matter_id
         WHERE m.id = $1 AND m.firm_id = $2
         GROUP BY m.id, c.display_name, u.first_name, u.last_name`;
    
    const result = await query(sql, [req.params.id, req.user.firmId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }

    const m = result.rows[0];
    
    // Check if user can manage permissions
    const canManagePermissions = FULL_ACCESS_ROLES.includes(req.user.role) || 
                                  m.responsible_attorney === req.user.id;

    res.json({
      id: m.id,
      number: m.number,
      name: m.name,
      description: m.description,
      clientId: m.client_id,
      clientName: m.client_name,
      type: m.type || 'other',
      status: m.status,
      priority: m.priority,
      visibility: m.visibility || 'firm_wide',
      assignedTo: m.assigned_to || [],
      responsibleAttorney: m.responsible_attorney,
      responsibleAttorneyName: m.responsible_attorney_name,
      originatingAttorney: m.originating_attorney,
      originatingAttorneyName: m.originating_attorney_name,
      openDate: m.open_date || m.created_at,
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
      notes: m.notes,
      customFields: m.custom_fields,
      createdBy: m.created_by,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
      // Permission info
      canManagePermissions,
      accessLevel: access.accessLevel,
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
      originatingAttorney,
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

    // Convert empty strings to null for UUID fields
    const safeClientId = clientId && clientId.trim() !== '' ? clientId : null;
    const safeResponsibleAttorney = responsibleAttorney && responsibleAttorney.trim() !== '' ? responsibleAttorney : req.user.id;
    const safeOriginatingAttorney = originatingAttorney && originatingAttorney.trim() !== '' ? originatingAttorney : null;

    const hasOrigAtty = await checkOriginatingAttorneyColumn();
    
    const result = await withTransaction(async (client) => {
      // Generate matter number - find max existing number for this year and increment
      const year = getCurrentYear();
      const prefix = `MTR-${year}-`;
      const maxResult = await client.query(
        `SELECT number FROM matters 
         WHERE firm_id = $1 AND number LIKE $2 
         ORDER BY number DESC LIMIT 1`,
        [req.user.firmId, `${prefix}%`]
      );
      
      let nextNum = 1;
      if (maxResult.rows.length > 0) {
        const lastNumber = maxResult.rows[0].number;
        const lastNum = parseInt(lastNumber.replace(prefix, ''), 10);
        if (!isNaN(lastNum)) {
          nextNum = lastNum + 1;
        }
      }
      const number = `${prefix}${String(nextNum).padStart(3, '0')}`;

      // Create matter - conditionally include originating_attorney
      const matterResult = hasOrigAtty 
        ? await client.query(
          `INSERT INTO matters (
            firm_id, number, name, description, client_id, type, status, priority,
            responsible_attorney, originating_attorney, open_date, statute_of_limitations,
            court_name, case_number, judge, jurisdiction,
            billing_type, billing_rate, flat_fee, contingency_percent, retainer_amount,
            budget, tags, conflict_cleared, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
          RETURNING *`,
          [
            req.user.firmId, number, name, description, safeClientId, type, status, priority,
            safeResponsibleAttorney, safeOriginatingAttorney, openDate, statuteOfLimitations,
            courtInfo?.courtName, courtInfo?.caseNumber, courtInfo?.judge, courtInfo?.jurisdiction,
            billingType, billingRate, flatFee, contingencyPercent, retainerAmount,
            budget, tags, conflictCleared, req.user.id
          ]
        )
        : await client.query(
          `INSERT INTO matters (
            firm_id, number, name, description, client_id, type, status, priority,
            responsible_attorney, open_date, statute_of_limitations,
            court_name, case_number, judge, jurisdiction,
            billing_type, billing_rate, flat_fee, contingency_percent, retainer_amount,
            budget, tags, conflict_cleared, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
          RETURNING *`,
          [
            req.user.firmId, number, name, description, safeClientId, type, status, priority,
            safeResponsibleAttorney, openDate, statuteOfLimitations,
            courtInfo?.courtName, courtInfo?.caseNumber, courtInfo?.judge, courtInfo?.jurisdiction,
            billingType, billingRate, flatFee, contingencyPercent, retainerAmount,
            budget, tags, conflictCleared, req.user.id
          ]
        );

      const matter = matterResult.rows[0];

      // Add team assignments with billing rates (for admins)
      // teamAssignments format: [{userId: string, billingRate: number}]
      const { teamAssignments } = req.body;
      if (teamAssignments && Array.isArray(teamAssignments)) {
        for (const assignment of teamAssignments) {
          if (assignment.userId && typeof assignment.userId === 'string' && 
              assignment.userId.length === 36 && assignment.userId.includes('-')) {
            await client.query(
              `INSERT INTO matter_assignments (matter_id, user_id, billing_rate) 
               VALUES ($1, $2, $3) ON CONFLICT (matter_id, user_id) DO UPDATE SET billing_rate = $3`,
              [matter.id, assignment.userId, assignment.billingRate || null]
            );
          }
        }
      }
      // Also handle legacy assignedTo array (simple user IDs without rates)
      else if (assignedTo && Array.isArray(assignedTo)) {
        for (const odId of assignedTo) {
          // Skip invalid user IDs (like 'user-1' placeholder)
          if (odId && typeof odId === 'string' && odId.length === 36 && odId.includes('-')) {
            await client.query(
              'INSERT INTO matter_assignments (matter_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [matter.id, odId]
            );
          }
        }
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
      originatingAttorney: result.originating_attorney,
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
      originatingAttorney,
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
      notes,
    } = req.body;

    // Convert empty strings to null for UUID fields (PostgreSQL can't cast "" to UUID)
    const safeClientId = clientId && clientId.trim() !== '' ? clientId : null;
    const safeResponsibleAttorney = responsibleAttorney && responsibleAttorney.trim() !== '' ? responsibleAttorney : null;
    const safeOriginatingAttorney = originatingAttorney && originatingAttorney.trim() !== '' ? originatingAttorney : null;

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
          originating_attorney = COALESCE($8, originating_attorney),
          open_date = COALESCE($9, open_date),
          close_date = COALESCE($10, close_date),
          statute_of_limitations = COALESCE($11, statute_of_limitations),
          court_name = COALESCE($12, court_name),
          case_number = COALESCE($13, case_number),
          judge = COALESCE($14, judge),
          jurisdiction = COALESCE($15, jurisdiction),
          billing_type = COALESCE($16, billing_type),
          billing_rate = COALESCE($17, billing_rate),
          flat_fee = COALESCE($18, flat_fee),
          contingency_percent = COALESCE($19, contingency_percent),
          retainer_amount = COALESCE($20, retainer_amount),
          budget = COALESCE($21, budget),
          tags = COALESCE($22, tags),
          ai_summary = COALESCE($23, ai_summary),
          conflict_cleared = COALESCE($24, conflict_cleared),
          notes = COALESCE($25, notes)
        WHERE id = $26`,
        [
          name, description, safeClientId, type, status, priority, safeResponsibleAttorney, safeOriginatingAttorney,
          openDate, closeDate, statuteOfLimitations,
          courtInfo?.courtName, courtInfo?.caseNumber, courtInfo?.judge, courtInfo?.jurisdiction,
          billingType, billingRate, flatFee, contingencyPercent, retainerAmount,
          budget, tags, aiSummary, conflictCleared, notes, req.params.id
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
      notes: m.notes,
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
