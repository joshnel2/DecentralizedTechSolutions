import { Router } from 'express';
import { query, withTransaction } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { buildVisibilityFilter, canAccessMatter, FULL_ACCESS_ROLES } from '../middleware/matterPermissions.js';
import { getCurrentYear } from '../utils/dateUtils.js';
import { learnFromMatter, learnFromNote } from '../services/manualLearning.js';
import { emitEvent } from '../services/eventBus.js';

const router = Router();

// Helper to check which optional columns exist on the matters table
let columnCheckCache = null;
async function checkMatterColumns() {
  if (columnCheckCache !== null) return columnCheckCache;
  try {
    const result = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'matters' AND column_name IN (
        'originating_attorney', 'practice_area', 'matter_stage', 'pending_date',
        'location', 'client_reference_number', 'responsible_staff', 'maildrop_address',
        'billable', 'notification_user_ids', 'blocked_user_ids', 'permission_group_ids'
      )
    `);
    const cols = new Set(result.rows.map(r => r.column_name));
    columnCheckCache = {
      hasOriginatingAttorney: cols.has('originating_attorney'),
      hasClioFields: cols.has('practice_area'),
    };
  } catch (e) {
    columnCheckCache = { hasOriginatingAttorney: false, hasClioFields: false };
  }
  return columnCheckCache;
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
    
    const { hasOriginatingAttorney: hasOrigAtty, hasClioFields } = await checkMatterColumns();
    
    // Build visibility filter based on user role
    const visibilityFilter = buildVisibilityFilter(req.user.id, req.user.role, req.user.firmId, 1);
    
    // Use subqueries for attorney/staff names to avoid GROUP BY overhead
    let sql = `
      SELECT m.*,
             c.display_name as client_name,
             (SELECT first_name || ' ' || last_name FROM users WHERE id = m.responsible_attorney) as responsible_attorney_name,
             ${hasOrigAtty ? `(SELECT first_name || ' ' || last_name FROM users WHERE id = m.originating_attorney) as originating_attorney_name,` : `NULL as originating_attorney_name,`}
             ${hasClioFields ? `(SELECT first_name || ' ' || last_name FROM users WHERE id = m.responsible_staff) as responsible_staff_name,` : `NULL as responsible_staff_name,`}
             1 as _placeholder
      FROM matters m
      LEFT JOIN clients c ON m.client_id = c.id
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

    // No GROUP BY needed - query is now much faster
    sql += ` ORDER BY m.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    // Run both queries in parallel for speed
    const [result, countResult] = await Promise.all([
      query(sql, params),
      query('SELECT COUNT(*) FROM matters WHERE firm_id = $1', [req.user.firmId])
    ]);

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
        assignedTo: [],
        responsibleAttorney: m.responsible_attorney,
        responsibleAttorneyName: m.responsible_attorney_name,
        originatingAttorney: m.originating_attorney,
        originatingAttorneyName: m.originating_attorney_name,
        responsibleStaff: m.responsible_staff,
        responsibleStaffName: m.responsible_staff_name,
        practiceArea: m.practice_area,
        matterStage: m.matter_stage,
        openDate: m.open_date || m.created_at,
        pendingDate: m.pending_date,
        closeDate: m.close_date,
        statuteOfLimitations: m.statute_of_limitations,
        clientReferenceNumber: m.client_reference_number,
        location: m.location,
        billable: m.billable !== false,
        maildropAddress: m.maildrop_address,
        notificationUserIds: m.notification_user_ids || [],
        blockedUserIds: m.blocked_user_ids || [],
        permissionGroupIds: m.permission_group_ids || [],
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

    const { hasOriginatingAttorney: hasOrigAtty2, hasClioFields: hasClio } = await checkMatterColumns();
    
    const sql = `SELECT m.*,
              c.display_name as client_name,
              u.first_name || ' ' || u.last_name as responsible_attorney_name,
              ${hasOrigAtty2 ? `ou.first_name || ' ' || ou.last_name as originating_attorney_name,` : `NULL as originating_attorney_name,`}
              ${hasClio ? `su.first_name || ' ' || su.last_name as responsible_staff_name,` : `NULL as responsible_staff_name,`}
              array_agg(DISTINCT ma.user_id) FILTER (WHERE ma.user_id IS NOT NULL) as assigned_to
         FROM matters m
         LEFT JOIN clients c ON m.client_id = c.id
         LEFT JOIN users u ON m.responsible_attorney = u.id
         ${hasOrigAtty2 ? `LEFT JOIN users ou ON m.originating_attorney = ou.id` : ``}
         ${hasClio ? `LEFT JOIN users su ON m.responsible_staff = su.id` : ``}
         LEFT JOIN matter_assignments ma ON m.id = ma.matter_id
         WHERE m.id = $1 AND m.firm_id = $2
         GROUP BY m.id, c.display_name, u.first_name, u.last_name
                  ${hasOrigAtty2 ? `, ou.first_name, ou.last_name` : ``}
                  ${hasClio ? `, su.first_name, su.last_name` : ``}`;
    
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
      responsibleStaff: m.responsible_staff,
      responsibleStaffName: m.responsible_staff_name,
      practiceArea: m.practice_area,
      matterStage: m.matter_stage,
      openDate: m.open_date || m.created_at,
      pendingDate: m.pending_date,
      closeDate: m.close_date,
      statuteOfLimitations: m.statute_of_limitations,
      clientReferenceNumber: m.client_reference_number,
      location: m.location,
      billable: m.billable !== false,
      maildropAddress: m.maildrop_address,
      notificationUserIds: m.notification_user_ids || [],
      blockedUserIds: m.blocked_user_ids || [],
      permissionGroupIds: m.permission_group_ids || [],
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
      canManagePermissions,
      accessLevel: access.accessLevel,
    });
  } catch (error) {
    console.error('Get matter error:', error);
    res.status(500).json({ error: 'Failed to get matter' });
  }
});

// =====================================================
// MATTER NOTES ENDPOINTS
// =====================================================

// Get all notes for a matter
router.get('/:id/notes', authenticate, requirePermission('matters:view'), async (req, res) => {
  try {
    const access = await canAccessMatter(req.user.id, req.user.role, req.params.id, req.user.firmId);
    if (!access.hasAccess) {
      return res.status(403).json({ error: 'Access denied to this matter' });
    }

    const result = await query(`
      SELECT mn.id, mn.content, mn.note_type, mn.created_at, mn.created_by,
             u.first_name || ' ' || u.last_name as created_by_name
      FROM matter_notes mn
      LEFT JOIN users u ON mn.created_by = u.id
      WHERE mn.matter_id = $1 AND mn.firm_id = $2
      ORDER BY mn.created_at DESC
    `, [req.params.id, req.user.firmId]);

    res.json({
      notes: result.rows.map(n => ({
        id: n.id,
        content: n.content,
        noteType: n.note_type,
        createdAt: n.created_at,
        createdBy: n.created_by,
        createdByName: n.created_by_name || 'Unknown'
      })),
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get matter notes error:', error);
    res.status(500).json({ error: 'Failed to get matter notes' });
  }
});

// Add a note to a matter
router.post('/:id/notes', authenticate, requirePermission('matters:view'), async (req, res) => {
  try {
    const access = await canAccessMatter(req.user.id, req.user.role, req.params.id, req.user.firmId);
    if (!access.hasAccess) {
      return res.status(403).json({ error: 'Access denied to this matter' });
    }

    const { content, noteType = 'general' } = req.body;
    
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Note content is required' });
    }

    const result = await query(`
      INSERT INTO matter_notes (matter_id, firm_id, content, note_type, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id, content, note_type, created_at, created_by
    `, [req.params.id, req.user.firmId, content.trim(), noteType, req.user.id]);

    const note = result.rows[0];
    
    // Get creator name
    const userResult = await query('SELECT first_name, last_name FROM users WHERE id = $1', [req.user.id]);
    const userName = userResult.rows[0] 
      ? `${userResult.rows[0].first_name || ''} ${userResult.rows[0].last_name || ''}`.trim()
      : 'Unknown';

    // Learn from this manual note creation (async, non-blocking)
    learnFromNote({
      content: note.content,
      note_type: note.note_type
    }, req.params.id, req.user.id, req.user.firmId).catch(() => {});
    
    res.status(201).json({
      success: true,
      note: {
        id: note.id,
        content: note.content,
        noteType: note.note_type,
        createdAt: note.created_at,
        createdBy: note.created_by,
        createdByName: userName
      }
    });
  } catch (error) {
    console.error('Add matter note error:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// Delete a note
router.delete('/:id/notes/:noteId', authenticate, requirePermission('matters:edit'), async (req, res) => {
  try {
    const access = await canAccessMatter(req.user.id, req.user.role, req.params.id, req.user.firmId);
    if (!access.hasAccess) {
      return res.status(403).json({ error: 'Access denied to this matter' });
    }

    // Only allow deletion of own notes (unless admin)
    const noteCheck = await query(
      'SELECT created_by FROM matter_notes WHERE id = $1 AND matter_id = $2 AND firm_id = $3',
      [req.params.noteId, req.params.id, req.user.firmId]
    );
    
    if (noteCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const isOwner = noteCheck.rows[0].created_by === req.user.id;
    const isAdmin = ['owner', 'admin'].includes(req.user.role);
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You can only delete your own notes' });
    }

    await query('DELETE FROM matter_notes WHERE id = $1', [req.params.noteId]);

    res.json({ success: true, message: 'Note deleted' });
  } catch (error) {
    console.error('Delete matter note error:', error);
    res.status(500).json({ error: 'Failed to delete note' });
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
      responsibleStaff,
      practiceArea,
      matterStage,
      openDate,
      pendingDate,
      statuteOfLimitations,
      clientReferenceNumber,
      location,
      billable = true,
      maildropAddress,
      notificationUserIds = [],
      blockedUserIds = [],
      permissionGroupIds = [],
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

    const safeUuid = (val) => val && typeof val === 'string' && val.trim() !== '' ? val : null;
    const safeClientId = safeUuid(clientId);
    const safeResponsibleAttorney = safeUuid(responsibleAttorney) || req.user.id;
    const safeOriginatingAttorney = safeUuid(originatingAttorney);
    const safeResponsibleStaff = safeUuid(responsibleStaff);

    const { hasOriginatingAttorney: hasOrigAtty, hasClioFields } = await checkMatterColumns();
    
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

      // Build INSERT dynamically based on available columns
      const cols = [
        'firm_id', 'number', 'name', 'description', 'client_id', 'type', 'status', 'priority',
        'responsible_attorney', 'open_date', 'statute_of_limitations',
        'court_name', 'case_number', 'judge', 'jurisdiction',
        'billing_type', 'billing_rate', 'flat_fee', 'contingency_percent', 'retainer_amount',
        'budget', 'tags', 'conflict_cleared', 'created_by'
      ];
      const vals = [
        req.user.firmId, number, name, description, safeClientId, type, status, priority,
        safeResponsibleAttorney, openDate, statuteOfLimitations,
        courtInfo?.courtName, courtInfo?.caseNumber, courtInfo?.judge, courtInfo?.jurisdiction,
        billingType, billingRate, flatFee, contingencyPercent, retainerAmount,
        budget, tags, conflictCleared, req.user.id
      ];

      if (hasOrigAtty) {
        cols.push('originating_attorney');
        vals.push(safeOriginatingAttorney);
      }

      if (hasClioFields) {
        cols.push('responsible_staff', 'practice_area', 'matter_stage', 'pending_date',
                   'client_reference_number', 'location', 'billable', 'maildrop_address',
                   'notification_user_ids', 'blocked_user_ids', 'permission_group_ids');
        vals.push(safeResponsibleStaff, practiceArea || null, matterStage || null, pendingDate || null,
                  clientReferenceNumber || null, location || null, billable, maildropAddress || null,
                  notificationUserIds, blockedUserIds, permissionGroupIds);
      }

      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const matterResult = await client.query(
        `INSERT INTO matters (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        vals
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

    // Learn from this manual matter creation (async, non-blocking)
    learnFromMatter({
      name: result.name,
      matter_type: result.type,
      practice_area: result.practice_area,
      billing_rate: result.billing_rate,
      billing_type: result.billing_type,
      number: result.number
    }, req.user.id, req.user.firmId).catch(() => {});

    // Emit real-time event for matter creation (firm-wide)
    emitEvent(req.user.firmId, null, 'matter.created', {
      matterId: result.id,
      name: result.name,
      number: result.number,
      createdBy: req.user.id,
      createdByName: `${req.user.firstName} ${req.user.lastName}`,
    });
    
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
      responsibleStaff,
      practiceArea,
      matterStage,
      openDate,
      pendingDate,
      closeDate,
      statuteOfLimitations,
      clientReferenceNumber,
      location: matterLocation,
      billable,
      maildropAddress,
      notificationUserIds,
      blockedUserIds,
      permissionGroupIds,
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

    const safeUuidUpdate = (val) => {
      if (val === undefined) return undefined;
      if (val === null || val === '') return null;
      return typeof val === 'string' && val.trim() !== '' ? val : null;
    };
    const safeClientId = safeUuidUpdate(clientId);
    const safeResponsibleAttorney = safeUuidUpdate(responsibleAttorney);
    const safeOriginatingAttorney = safeUuidUpdate(originatingAttorney);
    const safeResponsibleStaff = safeUuidUpdate(responsibleStaff);

    const { hasClioFields: hasClioUpdate } = await checkMatterColumns();

    await withTransaction(async (client) => {
      let setClauses = [
        'name = COALESCE($1, name)',
        'description = COALESCE($2, description)',
        'client_id = COALESCE($3, client_id)',
        'type = COALESCE($4, type)',
        'status = COALESCE($5, status)',
        'priority = COALESCE($6, priority)',
        'responsible_attorney = COALESCE($7, responsible_attorney)',
        'originating_attorney = COALESCE($8, originating_attorney)',
        'open_date = COALESCE($9, open_date)',
        'close_date = COALESCE($10, close_date)',
        'statute_of_limitations = COALESCE($11, statute_of_limitations)',
        'court_name = COALESCE($12, court_name)',
        'case_number = COALESCE($13, case_number)',
        'judge = COALESCE($14, judge)',
        'jurisdiction = COALESCE($15, jurisdiction)',
        'billing_type = COALESCE($16, billing_type)',
        'billing_rate = COALESCE($17, billing_rate)',
        'flat_fee = COALESCE($18, flat_fee)',
        'contingency_percent = COALESCE($19, contingency_percent)',
        'retainer_amount = COALESCE($20, retainer_amount)',
        'budget = COALESCE($21, budget)',
        'tags = COALESCE($22, tags)',
        'ai_summary = COALESCE($23, ai_summary)',
        'conflict_cleared = COALESCE($24, conflict_cleared)',
        'notes = COALESCE($25, notes)',
      ];
      let updateParams = [
        name, description, safeClientId, type, status, priority, safeResponsibleAttorney, safeOriginatingAttorney,
        openDate, closeDate, statuteOfLimitations,
        courtInfo?.courtName, courtInfo?.caseNumber, courtInfo?.judge, courtInfo?.jurisdiction,
        billingType, billingRate, flatFee, contingencyPercent, retainerAmount,
        budget, tags, aiSummary, conflictCleared, notes
      ];
      let paramIdx = 26;

      if (hasClioUpdate) {
        setClauses.push(
          `practice_area = COALESCE($${paramIdx}, practice_area)`,
          `matter_stage = COALESCE($${paramIdx + 1}, matter_stage)`,
          `pending_date = COALESCE($${paramIdx + 2}, pending_date)`,
          `client_reference_number = COALESCE($${paramIdx + 3}, client_reference_number)`,
          `location = COALESCE($${paramIdx + 4}, location)`,
          `responsible_staff = COALESCE($${paramIdx + 5}, responsible_staff)`,
          `maildrop_address = COALESCE($${paramIdx + 6}, maildrop_address)`,
        );
        updateParams.push(
          practiceArea, matterStage, pendingDate,
          clientReferenceNumber, matterLocation, safeResponsibleStaff, maildropAddress,
        );
        paramIdx += 7;

        if (billable !== undefined) {
          setClauses.push(`billable = $${paramIdx}`);
          updateParams.push(billable);
          paramIdx++;
        }
        if (notificationUserIds !== undefined) {
          setClauses.push(`notification_user_ids = $${paramIdx}`);
          updateParams.push(notificationUserIds);
          paramIdx++;
        }
        if (blockedUserIds !== undefined) {
          setClauses.push(`blocked_user_ids = $${paramIdx}`);
          updateParams.push(blockedUserIds);
          paramIdx++;
        }
        if (permissionGroupIds !== undefined) {
          setClauses.push(`permission_group_ids = $${paramIdx}`);
          updateParams.push(permissionGroupIds);
          paramIdx++;
        }
      }

      updateParams.push(req.params.id);
      await client.query(
        `UPDATE matters SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
        updateParams
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
      originatingAttorney: m.originating_attorney,
      responsibleStaff: m.responsible_staff,
      practiceArea: m.practice_area,
      matterStage: m.matter_stage,
      openDate: m.open_date,
      pendingDate: m.pending_date,
      closeDate: m.close_date,
      statuteOfLimitations: m.statute_of_limitations,
      clientReferenceNumber: m.client_reference_number,
      location: m.location,
      billable: m.billable !== false,
      maildropAddress: m.maildrop_address,
      notificationUserIds: m.notification_user_ids || [],
      blockedUserIds: m.blocked_user_ids || [],
      permissionGroupIds: m.permission_group_ids || [],
      billingType: m.billing_type,
      billingRate: m.billing_rate,
      flatFee: m.flat_fee,
      contingencyPercent: m.contingency_percent,
      retainerAmount: m.retainer_amount,
      budget: m.budget,
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

// ============================================
// CONFLICT CHECK
// ============================================

/**
 * Check for potential conflicts of interest
 * Searches against:
 * - Existing clients (by name, company name)
 * - Matter contacts/parties (opposing counsel, parties, witnesses)
 * - Matter names
 * 
 * POST /api/matters/conflict-check
 */
router.post('/conflict-check', authenticate, requirePermission('matters:view'), async (req, res) => {
  try {
    const { 
      clientName,      // Name of the potential new client
      partyNames = [], // Array of related party names to check (opposing party, etc.)
      matterName       // Optional matter name to check
    } = req.body;

    if (!clientName && partyNames.length === 0) {
      return res.status(400).json({ 
        error: 'Please provide at least a client name or party names to check' 
      });
    }

    const conflicts = [];
    const searchTerms = [];

    // Build search terms
    if (clientName) {
      searchTerms.push({ term: clientName, type: 'client' });
    }
    partyNames.forEach(name => {
      if (name && name.trim()) {
        searchTerms.push({ term: name.trim(), type: 'party' });
      }
    });

    // Search each term
    for (const { term, type } of searchTerms) {
      const searchPattern = `%${term.toLowerCase()}%`;

      // 1. Search existing clients
      const clientMatches = await query(
        `SELECT c.id, c.display_name, c.company_name, c.email, c.type,
                (SELECT COUNT(*) FROM matters WHERE client_id = c.id) as matter_count
         FROM clients c
         WHERE c.firm_id = $1 
           AND c.is_active = true
           AND (
             LOWER(c.display_name) LIKE $2 
             OR LOWER(c.company_name) LIKE $2
             OR LOWER(c.first_name || ' ' || c.last_name) LIKE $2
           )
         LIMIT 10`,
        [req.user.firmId, searchPattern]
      );

      for (const client of clientMatches.rows) {
        conflicts.push({
          searchTerm: term,
          searchType: type,
          matchType: 'client',
          matchId: client.id,
          matchName: client.display_name,
          companyName: client.company_name,
          email: client.email,
          clientType: client.type,
          matterCount: parseInt(client.matter_count),
          severity: type === 'party' ? 'high' : 'medium', // Matching a party name to existing client is high severity
          description: type === 'party' 
            ? `"${term}" matches existing client "${client.display_name}" - potential adverse party conflict`
            : `Client "${client.display_name}" already exists in the system`
        });
      }

      // 2. Search matter contacts (opposing parties, co-counsel, etc.)
      const contactMatches = await query(
        `SELECT mc.id, mc.name, mc.role, mc.firm as contact_firm, mc.email,
                m.id as matter_id, m.name as matter_name, m.number as matter_number, m.status as matter_status,
                c.display_name as matter_client_name
         FROM matter_contacts mc
         JOIN matters m ON mc.matter_id = m.id
         LEFT JOIN clients c ON m.client_id = c.id
         WHERE m.firm_id = $1 
           AND LOWER(mc.name) LIKE $2
         ORDER BY m.created_at DESC
         LIMIT 15`,
        [req.user.firmId, searchPattern]
      );

      for (const contact of contactMatches.rows) {
        // Determine severity based on role
        const isAdverseRole = ['opposing party', 'opposing counsel', 'adverse party', 'defendant', 'plaintiff']
          .some(role => contact.role?.toLowerCase().includes(role));
        
        conflicts.push({
          searchTerm: term,
          searchType: type,
          matchType: 'matter_contact',
          matchId: contact.id,
          matchName: contact.name,
          role: contact.role,
          contactFirm: contact.contact_firm,
          email: contact.email,
          matterId: contact.matter_id,
          matterName: contact.matter_name,
          matterNumber: contact.matter_number,
          matterStatus: contact.matter_status,
          matterClientName: contact.matter_client_name,
          severity: isAdverseRole ? 'high' : 'medium',
          description: `"${term}" appears as ${contact.role || 'contact'} on matter "${contact.matter_name}" (${contact.matter_number}) for client "${contact.matter_client_name || 'Unknown'}"`
        });
      }

      // 3. Search matter names (less common but useful)
      if (matterName && term === clientName) {
        const matterMatches = await query(
          `SELECT m.id, m.name, m.number, m.status, m.type,
                  c.display_name as client_name
           FROM matters m
           LEFT JOIN clients c ON m.client_id = c.id
           WHERE m.firm_id = $1 
             AND (LOWER(m.name) LIKE $2 OR LOWER(m.number) LIKE $2)
           ORDER BY m.created_at DESC
           LIMIT 5`,
          [req.user.firmId, `%${matterName.toLowerCase()}%`]
        );

        for (const matter of matterMatches.rows) {
          conflicts.push({
            searchTerm: matterName,
            searchType: 'matter_name',
            matchType: 'matter',
            matchId: matter.id,
            matchName: matter.name,
            matterNumber: matter.number,
            matterStatus: matter.status,
            matterType: matter.type,
            clientName: matter.client_name,
            severity: 'low',
            description: `Similar matter "${matter.name}" (${matter.number}) exists for client "${matter.client_name || 'Unknown'}"`
          });
        }
      }
    }

    // Sort conflicts by severity
    const severityOrder = { high: 0, medium: 1, low: 2 };
    conflicts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // Summary
    const highCount = conflicts.filter(c => c.severity === 'high').length;
    const mediumCount = conflicts.filter(c => c.severity === 'medium').length;
    const lowCount = conflicts.filter(c => c.severity === 'low').length;

    res.json({
      hasConflicts: conflicts.length > 0,
      conflictCount: conflicts.length,
      summary: {
        high: highCount,
        medium: mediumCount,
        low: lowCount
      },
      recommendation: highCount > 0 
        ? 'STOP - High severity conflicts detected. Review carefully before proceeding.'
        : mediumCount > 0 
          ? 'CAUTION - Potential conflicts found. Please review before proceeding.'
          : conflicts.length > 0 
            ? 'LOW RISK - Minor matches found. Review recommended.'
            : 'CLEAR - No conflicts detected.',
      conflicts,
      searchedTerms: searchTerms.map(s => s.term),
      checkedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Conflict check error:', error);
    res.status(500).json({ error: 'Failed to perform conflict check' });
  }
});

/**
 * Mark a matter as conflict-cleared
 * PUT /api/matters/:id/conflict-cleared
 */
router.put('/:id/conflict-cleared', authenticate, requirePermission('matters:edit'), async (req, res) => {
  try {
    const { cleared, notes, checkedBy } = req.body;

    // Get user's name for the record
    const userResult = await query(
      'SELECT first_name, last_name FROM users WHERE id = $1',
      [req.user.id]
    );
    const userName = userResult.rows[0] 
      ? `${userResult.rows[0].first_name} ${userResult.rows[0].last_name}`
      : 'Unknown';

    const result = await query(
      `UPDATE matters SET 
        conflict_cleared = $1,
        custom_fields = COALESCE(custom_fields, '{}'::jsonb) || jsonb_build_object(
          'conflictCheckDate', $2,
          'conflictCheckBy', $3,
          'conflictCheckNotes', $4
        ),
        updated_at = NOW()
       WHERE id = $5 AND firm_id = $6
       RETURNING id, conflict_cleared, custom_fields`,
      [
        cleared !== false, 
        new Date().toISOString(),
        checkedBy || userName,
        notes || '',
        req.params.id, 
        req.user.firmId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }

    // Audit log
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'matter.conflict_cleared', 'matter', $3, $4)`,
      [req.user.firmId, req.user.id, req.params.id, JSON.stringify({ cleared, notes })]
    );

    res.json({
      success: true,
      conflictCleared: result.rows[0].conflict_cleared,
      conflictCheckDate: result.rows[0].custom_fields?.conflictCheckDate,
      conflictCheckBy: result.rows[0].custom_fields?.conflictCheckBy,
      conflictCheckNotes: result.rows[0].custom_fields?.conflictCheckNotes
    });

  } catch (error) {
    console.error('Mark conflict cleared error:', error);
    res.status(500).json({ error: 'Failed to update conflict status' });
  }
});

export default router;
