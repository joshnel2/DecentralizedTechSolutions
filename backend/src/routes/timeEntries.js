import { Router } from 'express';
import { query, withTransaction } from '../db/connection.js';
import { authenticate, requirePermission, requireRole } from '../middleware/auth.js';
import { getTodayInTimezone, createDateInTimezone } from '../utils/dateUtils.js';
import { learnFromTimeEntry } from '../services/manualLearning.js';

const router = Router();

// Roles that can see all firm time entries (not just their own)
const FULL_ACCESS_ROLES = ['owner', 'admin', 'billing', 'partner'];

/**
 * Helper: log a billing audit event
 */
async function logBillingAudit(firmId, userId, action, resourceType, resourceId, changes, req) {
  try {
    await query(
      `INSERT INTO billing_audit_log (firm_id, user_id, action, resource_type, resource_id, changes, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        firmId, userId, action, resourceType, resourceId,
        changes ? JSON.stringify(changes) : null,
        req?.ip || null,
        req?.headers?.['user-agent']?.substring(0, 500) || null
      ]
    );
  } catch (err) {
    console.error('Billing audit log error:', err);
  }
}

/**
 * Helper: validate time entry data
 */
function validateTimeEntry(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate || data.hours !== undefined) {
    if (data.hours !== undefined && data.hours !== null) {
      const hours = parseFloat(data.hours);
      if (isNaN(hours) || hours < 0) {
        errors.push('Hours must be a non-negative number');
      }
      if (hours > 24) {
        errors.push('Hours cannot exceed 24 for a single entry');
      }
    } else if (!isUpdate) {
      errors.push('Hours is required');
    }
  }

  if (!isUpdate || data.description !== undefined) {
    if (data.description !== undefined && typeof data.description === 'string' && data.description.trim().length > 5000) {
      errors.push('Description cannot exceed 5000 characters');
    }
  }

  if (data.date) {
    const date = new Date(data.date);
    if (isNaN(date.getTime())) {
      errors.push('Invalid date format');
    }
    // Don't allow dates more than 1 year in the future
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    if (date > oneYearFromNow) {
      errors.push('Date cannot be more than 1 year in the future');
    }
  }

  if (data.rate !== undefined && data.rate !== null) {
    const rate = parseFloat(data.rate);
    if (isNaN(rate) || rate < 0) {
      errors.push('Rate must be a non-negative number');
    }
    if (rate > 10000) {
      errors.push('Rate cannot exceed $10,000/hour');
    }
  }

  if (data.activityCode && data.activityCode.length > 20) {
    errors.push('Activity code cannot exceed 20 characters');
  }

  if (data.taskCode && data.taskCode.length > 20) {
    errors.push('Task code cannot exceed 20 characters');
  }

  return errors;
}

// ============================================
// GET TIME ENTRIES
// ============================================

router.get('/', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    const { 
      matterId, userId, startDate, endDate, billable, billed, status,
      activityCode, entryType, invoiceId, search,
      sortBy = 'date', sortOrder = 'DESC',
      limit = 500, offset = 0
    } = req.query;
    
    const isAdmin = FULL_ACCESS_ROLES.includes(req.user.role);
    
    let sql = `
      SELECT te.*,
             m.name as matter_name,
             m.number as matter_number,
             m.client_id as matter_client_id,
             u.first_name || ' ' || u.last_name as user_name,
             u.email as user_email,
             i.number as invoice_number,
             i.status as invoice_status,
             c.display_name as client_name
      FROM time_entries te
      LEFT JOIN matters m ON te.matter_id = m.id
      LEFT JOIN users u ON te.user_id = u.id
      LEFT JOIN invoices i ON te.invoice_id = i.id
      LEFT JOIN clients c ON m.client_id = c.id
      WHERE te.firm_id = $1
    `;
    const params = [req.user.firmId];
    let paramIndex = 2;

    // Non-admins only see their own time entries
    if (!isAdmin) {
      sql += ` AND te.user_id = $${paramIndex}`;
      params.push(req.user.id);
      paramIndex++;
    }

    if (matterId) {
      sql += ` AND te.matter_id = $${paramIndex}`;
      params.push(matterId);
      paramIndex++;
    }

    if (userId && isAdmin) {
      sql += ` AND te.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (startDate) {
      sql += ` AND te.date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      sql += ` AND te.date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (billable !== undefined) {
      sql += ` AND te.billable = $${paramIndex}`;
      params.push(billable === 'true');
      paramIndex++;
    }

    if (billed !== undefined) {
      sql += ` AND te.billed = $${paramIndex}`;
      params.push(billed === 'true');
      paramIndex++;
    }

    if (status) {
      sql += ` AND te.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (activityCode) {
      sql += ` AND te.activity_code = $${paramIndex}`;
      params.push(activityCode);
      paramIndex++;
    }

    if (entryType) {
      sql += ` AND te.entry_type = $${paramIndex}`;
      params.push(entryType);
      paramIndex++;
    }

    if (invoiceId) {
      sql += ` AND te.invoice_id = $${paramIndex}`;
      params.push(invoiceId);
      paramIndex++;
    }

    if (search) {
      sql += ` AND (te.description ILIKE $${paramIndex} OR m.name ILIKE $${paramIndex} OR u.first_name || ' ' || u.last_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Validated sort columns to prevent SQL injection
    const validSortColumns = {
      date: 'te.date',
      hours: 'te.hours',
      amount: 'te.amount',
      created_at: 'te.created_at',
      user_name: 'user_name',
      matter_name: 'matter_name'
    };
    const sortColumn = validSortColumns[sortBy] || 'te.date';
    const order = sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    sql += ` ORDER BY ${sortColumn} ${order}, te.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(Math.min(parseInt(limit) || 500, 5000), parseInt(offset) || 0);

    // Get total count for pagination
    let countSql = sql.replace(/SELECT te\.\*[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM').replace(/ORDER BY[\s\S]*$/, '');
    // Remove the LIMIT/OFFSET params for count query
    const countParams = params.slice(0, -2);

    const [result, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, countParams)
    ]);

    res.json({
      timeEntries: result.rows.map(te => ({
        id: te.id,
        matterId: te.matter_id,
        matterName: te.matter_name,
        matterNumber: te.matter_number,
        clientName: te.client_name,
        userId: te.user_id,
        userName: te.user_name,
        userEmail: te.user_email,
        date: te.date,
        hours: parseFloat(te.hours),
        description: te.description,
        billable: te.billable,
        billed: te.billed,
        rate: parseFloat(te.rate),
        amount: parseFloat(te.amount),
        activityCode: te.activity_code,
        taskCode: te.task_code,
        status: te.status,
        entryType: te.entry_type,
        aiGenerated: te.ai_generated,
        invoiceId: te.invoice_id,
        invoiceNumber: te.invoice_number,
        invoiceStatus: te.invoice_status,
        submittedForApproval: te.submitted_for_approval,
        approvedBy: te.approved_by,
        approvedAt: te.approved_at,
        rejectedReason: te.rejected_reason,
        timerStart: te.timer_start,
        timerEnd: te.timer_end,
        createdAt: te.created_at,
        updatedAt: te.updated_at,
      })),
      pagination: {
        total: parseInt(countResult.rows[0]?.total || 0),
        limit: Math.min(parseInt(limit) || 500, 5000),
        offset: parseInt(offset) || 0,
      }
    });
  } catch (error) {
    console.error('Get time entries error:', error);
    res.status(500).json({ error: 'Failed to get time entries' });
  }
});

// ============================================
// GET TIME ENTRY SUMMARY / STATS
// ============================================

router.get('/summary', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    const { startDate, endDate, userId, matterId, groupBy = 'user' } = req.query;
    const isAdmin = FULL_ACCESS_ROLES.includes(req.user.role);
    
    let dateFilter = '';
    const params = [req.user.firmId];
    let paramIndex = 2;

    if (startDate) {
      dateFilter += ` AND te.date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      dateFilter += ` AND te.date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    // Non-admins: only their own data
    let userFilter = '';
    if (!isAdmin) {
      userFilter = ` AND te.user_id = $${paramIndex}`;
      params.push(req.user.id);
      paramIndex++;
    } else if (userId) {
      userFilter = ` AND te.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    let matterFilter = '';
    if (matterId) {
      matterFilter = ` AND te.matter_id = $${paramIndex}`;
      params.push(matterId);
      paramIndex++;
    }

    // Overall summary
    const summaryResult = await query(
      `SELECT 
        COUNT(*) as total_entries,
        COALESCE(SUM(te.hours), 0) as total_hours,
        COALESCE(SUM(te.amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END), 0) as billable_hours,
        COALESCE(SUM(CASE WHEN te.billable THEN te.amount ELSE 0 END), 0) as billable_amount,
        COALESCE(SUM(CASE WHEN NOT te.billable THEN te.hours ELSE 0 END), 0) as non_billable_hours,
        COALESCE(SUM(CASE WHEN te.billed THEN te.amount ELSE 0 END), 0) as billed_amount,
        COALESCE(SUM(CASE WHEN te.billable AND NOT te.billed THEN te.amount ELSE 0 END), 0) as unbilled_amount,
        COALESCE(SUM(CASE WHEN te.status = 'pending' AND te.submitted_for_approval THEN 1 ELSE 0 END), 0) as pending_approval,
        COALESCE(AVG(CASE WHEN te.billable THEN te.rate END), 0) as avg_billable_rate,
        CASE WHEN SUM(te.hours) > 0 
          THEN ROUND(SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END)::numeric / SUM(te.hours)::numeric * 100, 1) 
          ELSE 0 END as utilization_rate
       FROM time_entries te
       WHERE te.firm_id = $1${dateFilter}${userFilter}${matterFilter}`,
      params
    );

    // By-period breakdown (daily totals for charts)
    const dailyResult = await query(
      `SELECT 
        te.date,
        SUM(te.hours) as total_hours,
        SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END) as billable_hours,
        SUM(te.amount) as total_amount,
        COUNT(*) as entry_count
       FROM time_entries te
       WHERE te.firm_id = $1${dateFilter}${userFilter}${matterFilter}
       GROUP BY te.date
       ORDER BY te.date DESC
       LIMIT 90`,
      params
    );

    // Top matters by billing
    const topMattersResult = await query(
      `SELECT 
        m.id, m.name, m.number,
        SUM(te.hours) as total_hours,
        SUM(te.amount) as total_amount,
        SUM(CASE WHEN te.billable AND NOT te.billed THEN te.amount ELSE 0 END) as unbilled_amount
       FROM time_entries te
       JOIN matters m ON te.matter_id = m.id
       WHERE te.firm_id = $1${dateFilter}${userFilter}${matterFilter}
       GROUP BY m.id, m.name, m.number
       ORDER BY total_amount DESC
       LIMIT 10`,
      params
    );

    const summary = summaryResult.rows[0];

    res.json({
      summary: {
        totalEntries: parseInt(summary.total_entries),
        totalHours: parseFloat(summary.total_hours),
        totalAmount: parseFloat(summary.total_amount),
        billableHours: parseFloat(summary.billable_hours),
        billableAmount: parseFloat(summary.billable_amount),
        nonBillableHours: parseFloat(summary.non_billable_hours),
        billedAmount: parseFloat(summary.billed_amount),
        unbilledAmount: parseFloat(summary.unbilled_amount),
        pendingApproval: parseInt(summary.pending_approval),
        avgBillableRate: parseFloat(summary.avg_billable_rate),
        utilizationRate: parseFloat(summary.utilization_rate),
      },
      dailyBreakdown: dailyResult.rows.map(d => ({
        date: d.date,
        totalHours: parseFloat(d.total_hours),
        billableHours: parseFloat(d.billable_hours),
        totalAmount: parseFloat(d.total_amount),
        entryCount: parseInt(d.entry_count),
      })),
      topMatters: topMattersResult.rows.map(m => ({
        id: m.id,
        name: m.name,
        number: m.number,
        totalHours: parseFloat(m.total_hours),
        totalAmount: parseFloat(m.total_amount),
        unbilledAmount: parseFloat(m.unbilled_amount),
      })),
    });
  } catch (error) {
    console.error('Get time entry summary error:', error);
    res.status(500).json({ error: 'Failed to get time entry summary' });
  }
});

// ============================================
// CREATE TIME ENTRY
// ============================================

router.post('/', authenticate, requirePermission('billing:create'), async (req, res) => {
  try {
    const {
      matterId,
      date,
      hours,
      description,
      billable = true,
      rate,
      activityCode,
      taskCode,
      entryType = 'manual',
    } = req.body;

    // Validate input
    const errors = validateTimeEntry({ hours, description, date, rate, activityCode, taskCode });
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('; '), errors });
    }

    // Use defaults for optional fields
    const entryDate = date || getTodayInTimezone();
    const entryHours = parseFloat(hours) || 0;
    const entryDescription = (description || '').trim();

    // Validate matter exists and user has access
    if (matterId) {
      const matterResult = await query(
        `SELECT m.id, m.status, m.billing_rate,
                EXISTS(SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $2) as user_is_assigned
         FROM matters m
         WHERE m.id = $1 AND m.firm_id = $3`,
        [matterId, req.user.id, req.user.firmId]
      );

      if (matterResult.rows.length === 0) {
        return res.status(404).json({ error: 'Matter not found' });
      }

      const matter = matterResult.rows[0];
      if (matter.status === 'closed') {
        return res.status(400).json({ error: 'Cannot log time to a closed matter', code: 'MATTER_CLOSED' });
      }

      // Non-admin users must be assigned to the matter
      const isAdmin = FULL_ACCESS_ROLES.includes(req.user.role);
      if (!isAdmin && !matter.user_is_assigned) {
        const respCheck = await query(
          'SELECT 1 FROM matters WHERE id = $1 AND (responsible_attorney = $2 OR originating_attorney = $2 OR created_by = $2)',
          [matterId, req.user.id]
        );
        if (respCheck.rows.length === 0) {
          return res.status(403).json({ error: 'You are not assigned to this matter', code: 'NOT_AUTHORIZED_FOR_MATTER' });
        }
      }
    }

    // Get billing rate cascade: user assignment rate > matter rate > user rate > firm default
    let entryRate = rate;
    if (!entryRate && matterId) {
      const assignmentRate = await query(
        'SELECT billing_rate FROM matter_assignments WHERE matter_id = $1 AND user_id = $2 AND billing_rate IS NOT NULL',
        [matterId, req.user.id]
      );
      if (assignmentRate.rows.length > 0 && assignmentRate.rows[0].billing_rate) {
        entryRate = assignmentRate.rows[0].billing_rate;
      }
    }
    if (!entryRate && matterId) {
      const matterRate = await query('SELECT billing_rate FROM matters WHERE id = $1', [matterId]);
      if (matterRate.rows[0]?.billing_rate) entryRate = matterRate.rows[0].billing_rate;
    }
    if (!entryRate) {
      const userRate = await query('SELECT hourly_rate FROM users WHERE id = $1', [req.user.id]);
      entryRate = userRate.rows[0]?.hourly_rate || 350;
    }

    // Check if firm requires approval for time entries
    let needsApproval = false;
    try {
      const settingsResult = await query(
        'SELECT require_time_entry_approval, auto_approve_own_entries FROM billing_settings WHERE firm_id = $1',
        [req.user.firmId]
      );
      if (settingsResult.rows.length > 0) {
        const settings = settingsResult.rows[0];
        needsApproval = settings.require_time_entry_approval;
        // Auto-approve for admins/partners or if setting allows self-approval
        if (needsApproval && (FULL_ACCESS_ROLES.includes(req.user.role) || settings.auto_approve_own_entries)) {
          needsApproval = false;
        }
      }
    } catch (e) {
      // billing_settings table may not exist yet, continue without approval
    }

    const initialStatus = needsApproval ? 'pending' : 'approved';

    const result = await query(
      `INSERT INTO time_entries (
        firm_id, matter_id, user_id, date, hours, description,
        billable, rate, activity_code, task_code, entry_type, status,
        submitted_for_approval, approved_by, approved_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        req.user.firmId, matterId || null, req.user.id, entryDate, entryHours, entryDescription,
        billable, entryRate, activityCode || null, taskCode || null, entryType, initialStatus,
        needsApproval,
        needsApproval ? null : req.user.id,
        needsApproval ? null : new Date().toISOString()
      ]
    );

    const te = result.rows[0];
    
    // Learn from this time entry (async, non-blocking)
    learnFromTimeEntry({
      description: te.description,
      hours: parseFloat(te.hours),
      rate: parseFloat(te.rate),
      billable: te.billable,
      activity_code: te.activity_code,
      matter_id: te.matter_id,
      entry_type: te.entry_type
    }, req.user.id, req.user.firmId).catch(() => {});

    // Audit log
    logBillingAudit(req.user.firmId, req.user.id, 'time_entry.created', 'time_entry', te.id, {
      hours: parseFloat(te.hours),
      amount: parseFloat(te.amount),
      matter_id: te.matter_id,
      status: initialStatus
    }, req);

    res.status(201).json({
      id: te.id,
      matterId: te.matter_id,
      userId: te.user_id,
      date: te.date,
      hours: parseFloat(te.hours),
      description: te.description,
      billable: te.billable,
      billed: te.billed,
      rate: parseFloat(te.rate),
      amount: parseFloat(te.amount),
      activityCode: te.activity_code,
      taskCode: te.task_code,
      status: te.status,
      entryType: te.entry_type,
      submittedForApproval: te.submitted_for_approval,
      createdAt: te.created_at,
    });
  } catch (error) {
    console.error('Create time entry error:', error);
    res.status(500).json({ error: 'Failed to create time entry' });
  }
});

// ============================================
// UPDATE TIME ENTRY
// ============================================

router.put('/:id', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const existing = await query(
      `SELECT te.*, i.status as invoice_status 
       FROM time_entries te 
       LEFT JOIN invoices i ON te.invoice_id = i.id
       WHERE te.id = $1 AND te.firm_id = $2`,
      [req.params.id, req.user.firmId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    const entry = existing.rows[0];

    // Security: non-admin users can only edit their own time entries
    const isAdmin = FULL_ACCESS_ROLES.includes(req.user.role);
    if (!isAdmin && entry.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own time entries' });
    }

    // Prevent editing billed entries unless admin
    if (entry.billed && !isAdmin) {
      return res.status(400).json({ error: 'Cannot edit a billed time entry. Contact an administrator.', code: 'ENTRY_BILLED' });
    }

    // Prevent editing entries on finalized invoices
    if (entry.invoice_id && entry.invoice_status && !['draft', 'void'].includes(entry.invoice_status)) {
      return res.status(400).json({ 
        error: 'Cannot edit a time entry attached to a finalized invoice. Remove it from the invoice first.',
        code: 'INVOICE_FINALIZED'
      });
    }

    const { matterId, date, hours, description, billable, billed, rate, activityCode, taskCode, status } = req.body;

    // Validate
    const errors = validateTimeEntry({ hours, description, date, rate, activityCode, taskCode }, true);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('; '), errors });
    }

    // Only admins can change billed status or status directly
    if (!isAdmin && billed !== undefined) {
      return res.status(403).json({ error: 'Only administrators can change billed status' });
    }
    if (!isAdmin && status !== undefined && !['pending'].includes(status)) {
      return res.status(403).json({ error: 'Only administrators can change entry status' });
    }

    // Capture before state for audit
    const beforeState = {
      hours: parseFloat(entry.hours),
      description: entry.description,
      billable: entry.billable,
      rate: parseFloat(entry.rate),
      status: entry.status,
    };

    const result = await query(
      `UPDATE time_entries SET
        matter_id = COALESCE($1, matter_id),
        date = COALESCE($2, date),
        hours = COALESCE($3, hours),
        description = COALESCE($4, description),
        billable = COALESCE($5, billable),
        rate = COALESCE($6, rate),
        activity_code = COALESCE($7, activity_code),
        task_code = COALESCE($8, task_code),
        status = COALESCE($9, status),
        billed = COALESCE($10, billed),
        updated_at = NOW()
      WHERE id = $11
      RETURNING *`,
      [matterId, date, hours, description, billable, rate, activityCode, taskCode, status, billed, req.params.id]
    );

    const te = result.rows[0];

    // Audit log with before/after
    logBillingAudit(req.user.firmId, req.user.id, 'time_entry.updated', 'time_entry', te.id, {
      before: beforeState,
      after: {
        hours: parseFloat(te.hours),
        description: te.description,
        billable: te.billable,
        rate: parseFloat(te.rate),
        status: te.status,
      }
    }, req);

    res.json({
      id: te.id,
      matterId: te.matter_id,
      userId: te.user_id,
      date: te.date,
      hours: parseFloat(te.hours),
      description: te.description,
      billable: te.billable,
      billed: te.billed,
      rate: parseFloat(te.rate),
      amount: parseFloat(te.amount),
      activityCode: te.activity_code,
      taskCode: te.task_code,
      status: te.status,
      updatedAt: te.updated_at,
    });
  } catch (error) {
    console.error('Update time entry error:', error);
    res.status(500).json({ error: 'Failed to update time entry' });
  }
});

// ============================================
// DELETE TIME ENTRY
// ============================================

router.delete('/:id', authenticate, requirePermission('billing:delete'), async (req, res) => {
  try {
    const existing = await query(
      'SELECT id, user_id, billed, hours, amount, matter_id, invoice_id FROM time_entries WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    const entry = existing.rows[0];
    const isAdmin = FULL_ACCESS_ROLES.includes(req.user.role);

    // Security: non-admin users can only delete their own entries
    if (!isAdmin && entry.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own time entries' });
    }

    // Cannot delete billed entries
    if (entry.billed) {
      return res.status(400).json({ error: 'Cannot delete a billed time entry. Use a write-off instead.', code: 'ENTRY_BILLED' });
    }

    // Cannot delete entries attached to invoices
    if (entry.invoice_id) {
      return res.status(400).json({ error: 'Cannot delete a time entry attached to an invoice. Remove it from the invoice first.', code: 'ENTRY_ON_INVOICE' });
    }

    await query('DELETE FROM time_entries WHERE id = $1 AND firm_id = $2', [req.params.id, req.user.firmId]);

    // Audit log
    logBillingAudit(req.user.firmId, req.user.id, 'time_entry.deleted', 'time_entry', entry.id, {
      hours: parseFloat(entry.hours),
      amount: parseFloat(entry.amount),
      matter_id: entry.matter_id,
    }, req);

    res.json({ message: 'Time entry deleted' });
  } catch (error) {
    console.error('Delete time entry error:', error);
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

// ============================================
// BATCH OPERATIONS (Clio-style)
// ============================================

// Batch update time entries
router.put('/batch/update', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const { ids, updates } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    if (ids.length > 100) {
      return res.status(400).json({ error: 'Cannot update more than 100 entries at once' });
    }
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'updates object is required' });
    }

    const isAdmin = FULL_ACCESS_ROLES.includes(req.user.role);

    // Verify ownership for non-admins
    if (!isAdmin) {
      const ownershipCheck = await query(
        'SELECT COUNT(*) as count FROM time_entries WHERE id = ANY($1) AND firm_id = $2 AND user_id = $3',
        [ids, req.user.firmId, req.user.id]
      );
      if (parseInt(ownershipCheck.rows[0].count) !== ids.length) {
        return res.status(403).json({ error: 'You can only update your own time entries' });
      }
    }

    // Prevent batch update of billed entries for non-admins
    if (!isAdmin) {
      const billedCheck = await query(
        'SELECT COUNT(*) as count FROM time_entries WHERE id = ANY($1) AND billed = true',
        [ids]
      );
      if (parseInt(billedCheck.rows[0].count) > 0) {
        return res.status(400).json({ error: 'Cannot update billed time entries' });
      }
    }

    const allowedFields = isAdmin 
      ? ['billable', 'status', 'activityCode', 'taskCode', 'rate', 'billed']
      : ['billable', 'activityCode', 'taskCode'];
    
    const setClauses = [];
    const params = [ids, req.user.firmId];
    let paramIndex = 3;

    for (const [key, value] of Object.entries(updates)) {
      if (!allowedFields.includes(key)) continue;
      const dbColumn = key.replace(/([A-Z])/g, '_$1').toLowerCase(); // camelCase to snake_case
      setClauses.push(`${dbColumn} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    setClauses.push('updated_at = NOW()');

    const result = await query(
      `UPDATE time_entries SET ${setClauses.join(', ')} WHERE id = ANY($1) AND firm_id = $2 RETURNING id`,
      params
    );

    // Audit log
    logBillingAudit(req.user.firmId, req.user.id, 'time_entry.batch_updated', 'time_entry', ids[0], {
      ids,
      updates,
      count: result.rows.length
    }, req);

    res.json({ 
      message: `Updated ${result.rows.length} time entries`,
      updatedCount: result.rows.length,
      ids: result.rows.map(r => r.id)
    });
  } catch (error) {
    console.error('Batch update time entries error:', error);
    res.status(500).json({ error: 'Failed to batch update time entries' });
  }
});

// Batch delete time entries
router.delete('/batch/delete', authenticate, requirePermission('billing:delete'), async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    if (ids.length > 100) {
      return res.status(400).json({ error: 'Cannot delete more than 100 entries at once' });
    }

    const isAdmin = FULL_ACCESS_ROLES.includes(req.user.role);

    // Verify ownership for non-admins
    if (!isAdmin) {
      const ownershipCheck = await query(
        'SELECT COUNT(*) as count FROM time_entries WHERE id = ANY($1) AND firm_id = $2 AND user_id = $3',
        [ids, req.user.firmId, req.user.id]
      );
      if (parseInt(ownershipCheck.rows[0].count) !== ids.length) {
        return res.status(403).json({ error: 'You can only delete your own time entries' });
      }
    }

    // Cannot delete billed entries
    const result = await query(
      'DELETE FROM time_entries WHERE id = ANY($1) AND firm_id = $2 AND billed = false AND invoice_id IS NULL RETURNING id',
      [ids, req.user.firmId]
    );

    const skipped = ids.length - result.rows.length;

    logBillingAudit(req.user.firmId, req.user.id, 'time_entry.batch_deleted', 'time_entry', ids[0], {
      ids,
      deletedCount: result.rows.length,
      skippedCount: skipped
    }, req);

    res.json({ 
      message: `Deleted ${result.rows.length} time entries${skipped > 0 ? `, skipped ${skipped} billed/invoiced entries` : ''}`,
      deletedCount: result.rows.length,
      skippedCount: skipped
    });
  } catch (error) {
    console.error('Batch delete time entries error:', error);
    res.status(500).json({ error: 'Failed to batch delete time entries' });
  }
});

// ============================================
// APPROVAL WORKFLOW (Clio-style)
// ============================================

// Submit entries for approval
router.post('/submit-for-approval', authenticate, requirePermission('billing:create'), async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    // Verify ownership
    const entries = await query(
      `SELECT id, user_id, status, submitted_for_approval 
       FROM time_entries 
       WHERE id = ANY($1) AND firm_id = $2 AND user_id = $3`,
      [ids, req.user.firmId, req.user.id]
    );

    if (entries.rows.length !== ids.length) {
      return res.status(403).json({ error: 'Some entries were not found or do not belong to you' });
    }

    // Only pending entries can be submitted
    const invalidEntries = entries.rows.filter(e => e.status !== 'pending' || e.submitted_for_approval);
    if (invalidEntries.length > 0) {
      return res.status(400).json({ error: 'Some entries have already been submitted or approved' });
    }

    await query(
      `UPDATE time_entries SET submitted_for_approval = true, updated_at = NOW() WHERE id = ANY($1)`,
      [ids]
    );

    // Create approval records
    for (const id of ids) {
      await query(
        `INSERT INTO time_entry_approvals (firm_id, time_entry_id, submitted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [req.user.firmId, id, req.user.id]
      ).catch(() => {}); // Table might not exist yet
    }

    res.json({ message: `Submitted ${ids.length} entries for approval` });
  } catch (error) {
    console.error('Submit for approval error:', error);
    res.status(500).json({ error: 'Failed to submit entries for approval' });
  }
});

// Approve/reject time entries (requires billing:approve permission)
router.post('/review', authenticate, requirePermission('billing:approve'), async (req, res) => {
  try {
    const { ids, action, notes } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    if (!['approve', 'reject', 'request_revision'].includes(action)) {
      return res.status(400).json({ error: 'action must be approve, reject, or request_revision' });
    }
    if (action === 'reject' && !notes) {
      return res.status(400).json({ error: 'notes/reason is required when rejecting entries' });
    }

    const statusMap = {
      approve: 'approved',
      reject: 'rejected',
      request_revision: 'pending'
    };
    const newStatus = statusMap[action];

    const result = await query(
      `UPDATE time_entries SET 
        status = $1, 
        approved_by = CASE WHEN $1 = 'approved' THEN $4 ELSE approved_by END,
        approved_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE approved_at END,
        rejected_reason = CASE WHEN $1 IN ('rejected') THEN $3 ELSE rejected_reason END,
        submitted_for_approval = CASE WHEN $1 IN ('rejected') THEN false ELSE submitted_for_approval END,
        updated_at = NOW()
       WHERE id = ANY($2) AND firm_id = $5 AND submitted_for_approval = true
       RETURNING id`,
      [newStatus, ids, notes || null, req.user.id, req.user.firmId]
    );

    // Update approval records
    for (const row of result.rows) {
      await query(
        `UPDATE time_entry_approvals SET 
          reviewer_id = $1, status = $2, reviewer_notes = $3, reviewed_at = NOW()
         WHERE time_entry_id = $4 AND status = 'pending'`,
        [req.user.id, action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'revision_requested', notes || null, row.id]
      ).catch(() => {});
    }

    logBillingAudit(req.user.firmId, req.user.id, `time_entry.${action}`, 'time_entry', ids[0], {
      ids,
      action,
      notes,
      count: result.rows.length
    }, req);

    res.json({ 
      message: `${action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'Requested revision for'} ${result.rows.length} entries`,
      processedCount: result.rows.length
    });
  } catch (error) {
    console.error('Review time entries error:', error);
    res.status(500).json({ error: 'Failed to review time entries' });
  }
});

// Get entries pending approval
router.get('/pending-approval', authenticate, requirePermission('billing:approve'), async (req, res) => {
  try {
    const result = await query(
      `SELECT te.*,
              m.name as matter_name, m.number as matter_number,
              u.first_name || ' ' || u.last_name as user_name,
              c.display_name as client_name
       FROM time_entries te
       LEFT JOIN matters m ON te.matter_id = m.id
       LEFT JOIN users u ON te.user_id = u.id
       LEFT JOIN clients c ON m.client_id = c.id
       WHERE te.firm_id = $1 AND te.submitted_for_approval = true AND te.status = 'pending'
       ORDER BY te.date DESC, te.created_at DESC`,
      [req.user.firmId]
    );

    res.json({
      pendingEntries: result.rows.map(te => ({
        id: te.id,
        matterId: te.matter_id,
        matterName: te.matter_name,
        matterNumber: te.matter_number,
        clientName: te.client_name,
        userId: te.user_id,
        userName: te.user_name,
        date: te.date,
        hours: parseFloat(te.hours),
        description: te.description,
        billable: te.billable,
        rate: parseFloat(te.rate),
        amount: parseFloat(te.amount),
        activityCode: te.activity_code,
        entryType: te.entry_type,
        createdAt: te.created_at,
      })),
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get pending approval error:', error);
    res.status(500).json({ error: 'Failed to get pending entries' });
  }
});

// ============================================
// TIMER OPERATIONS (Clio-style running timer)
// ============================================

// Get active timer for current user
router.get('/timer', authenticate, requirePermission('billing:create'), async (req, res) => {
  try {
    const result = await query(
      `SELECT at.*, m.name as matter_name, m.number as matter_number
       FROM active_timers at
       LEFT JOIN matters m ON at.matter_id = m.id
       WHERE at.user_id = $1 AND at.is_running = true
       LIMIT 1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.json({ timer: null });
    }

    const t = result.rows[0];
    const now = new Date();
    const startedAt = new Date(t.started_at);
    const runningSeconds = t.paused_at ? 0 : Math.floor((now - startedAt) / 1000);
    const totalSeconds = t.accumulated_seconds + runningSeconds;

    res.json({
      timer: {
        id: t.id,
        matterId: t.matter_id,
        matterName: t.matter_name,
        matterNumber: t.matter_number,
        description: t.description,
        startedAt: t.started_at,
        pausedAt: t.paused_at,
        accumulatedSeconds: t.accumulated_seconds,
        totalSeconds,
        totalHours: Math.round(totalSeconds / 36) / 100, // to 2 decimal places
        isRunning: t.is_running && !t.paused_at,
        billable: t.billable,
        activityCode: t.activity_code,
        taskCode: t.task_code,
      }
    });
  } catch (error) {
    console.error('Get timer error:', error);
    res.status(500).json({ error: 'Failed to get timer' });
  }
});

// Start timer
router.post('/timer/start', authenticate, requirePermission('billing:create'), async (req, res) => {
  try {
    const { matterId, description, billable = true, activityCode, taskCode } = req.body;

    // Stop any existing running timer first (save as time entry)
    const existingTimer = await query(
      'SELECT id FROM active_timers WHERE user_id = $1 AND is_running = true',
      [req.user.id]
    );

    if (existingTimer.rows.length > 0) {
      // Auto-save and stop the existing timer
      await stopAndSaveTimer(req.user.id, req.user.firmId, req);
    }

    const result = await query(
      `INSERT INTO active_timers (firm_id, user_id, matter_id, description, billable, activity_code, task_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.firmId, req.user.id, matterId || null, description || '', billable, activityCode || null, taskCode || null]
    );

    const t = result.rows[0];
    res.status(201).json({
      timer: {
        id: t.id,
        matterId: t.matter_id,
        description: t.description,
        startedAt: t.started_at,
        isRunning: true,
        billable: t.billable,
      }
    });
  } catch (error) {
    console.error('Start timer error:', error);
    res.status(500).json({ error: 'Failed to start timer' });
  }
});

// Pause timer
router.post('/timer/pause', authenticate, requirePermission('billing:create'), async (req, res) => {
  try {
    const timer = await query(
      'SELECT * FROM active_timers WHERE user_id = $1 AND is_running = true AND paused_at IS NULL',
      [req.user.id]
    );

    if (timer.rows.length === 0) {
      return res.status(404).json({ error: 'No running timer found' });
    }

    const t = timer.rows[0];
    const now = new Date();
    const runningSeconds = Math.floor((now - new Date(t.started_at)) / 1000);
    const newAccumulated = t.accumulated_seconds + runningSeconds;

    await query(
      'UPDATE active_timers SET paused_at = NOW(), accumulated_seconds = $1, updated_at = NOW() WHERE id = $2',
      [newAccumulated, t.id]
    );

    res.json({ message: 'Timer paused', totalSeconds: newAccumulated });
  } catch (error) {
    console.error('Pause timer error:', error);
    res.status(500).json({ error: 'Failed to pause timer' });
  }
});

// Resume timer
router.post('/timer/resume', authenticate, requirePermission('billing:create'), async (req, res) => {
  try {
    const result = await query(
      `UPDATE active_timers SET paused_at = NULL, started_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND is_running = true AND paused_at IS NOT NULL
       RETURNING *`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No paused timer found' });
    }

    res.json({ message: 'Timer resumed', timer: { id: result.rows[0].id } });
  } catch (error) {
    console.error('Resume timer error:', error);
    res.status(500).json({ error: 'Failed to resume timer' });
  }
});

// Stop timer and save as time entry
router.post('/timer/stop', authenticate, requirePermission('billing:create'), async (req, res) => {
  try {
    const { description, matterId, billable, activityCode, taskCode } = req.body;
    const result = await stopAndSaveTimer(req.user.id, req.user.firmId, req, { description, matterId, billable, activityCode, taskCode });

    if (!result) {
      return res.status(404).json({ error: 'No running timer found' });
    }

    res.json({
      message: 'Timer stopped and time entry created',
      timeEntry: result
    });
  } catch (error) {
    console.error('Stop timer error:', error);
    res.status(500).json({ error: 'Failed to stop timer' });
  }
});

// Discard timer without saving
router.post('/timer/discard', authenticate, requirePermission('billing:create'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM active_timers WHERE user_id = $1 AND is_running = true RETURNING id',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No running timer found' });
    }

    res.json({ message: 'Timer discarded' });
  } catch (error) {
    console.error('Discard timer error:', error);
    res.status(500).json({ error: 'Failed to discard timer' });
  }
});

// Update running timer (change description, matter, etc.)
router.put('/timer', authenticate, requirePermission('billing:create'), async (req, res) => {
  try {
    const { description, matterId, billable, activityCode, taskCode } = req.body;

    const result = await query(
      `UPDATE active_timers SET
        description = COALESCE($1, description),
        matter_id = COALESCE($2, matter_id),
        billable = COALESCE($3, billable),
        activity_code = COALESCE($4, activity_code),
        task_code = COALESCE($5, task_code),
        updated_at = NOW()
       WHERE user_id = $6 AND is_running = true
       RETURNING *`,
      [description, matterId, billable, activityCode, taskCode, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No running timer found' });
    }

    res.json({ message: 'Timer updated' });
  } catch (error) {
    console.error('Update timer error:', error);
    res.status(500).json({ error: 'Failed to update timer' });
  }
});

/**
 * Helper: stop and save a running timer as a time entry
 */
async function stopAndSaveTimer(userId, firmId, req, overrides = {}) {
  const timer = await query(
    'SELECT * FROM active_timers WHERE user_id = $1 AND is_running = true',
    [userId]
  );

  if (timer.rows.length === 0) return null;

  const t = timer.rows[0];
  const now = new Date();

  // Calculate total seconds
  let totalSeconds = t.accumulated_seconds;
  if (!t.paused_at) {
    totalSeconds += Math.floor((now - new Date(t.started_at)) / 1000);
  }

  // Convert to hours (round to nearest billing increment, default 6 min = 0.1 hr)
  let hours = totalSeconds / 3600;
  hours = Math.ceil(hours * 10) / 10; // Round up to nearest 0.1
  if (hours < 0.1 && totalSeconds > 0) hours = 0.1; // Minimum entry

  // Get rate
  const matterId = overrides.matterId || t.matter_id;
  let rate = null;
  if (matterId) {
    const matterRate = await query('SELECT billing_rate FROM matters WHERE id = $1', [matterId]);
    rate = matterRate.rows[0]?.billing_rate;
  }
  if (!rate) {
    const userRate = await query('SELECT hourly_rate FROM users WHERE id = $1', [userId]);
    rate = userRate.rows[0]?.hourly_rate || 350;
  }

  // Create time entry
  const entryResult = await query(
    `INSERT INTO time_entries (
      firm_id, matter_id, user_id, date, hours, description,
      billable, rate, activity_code, task_code, entry_type, status,
      timer_start, timer_end
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'timer', 'approved', $11, $12)
    RETURNING *`,
    [
      firmId, matterId, userId, getTodayInTimezone(), hours,
      overrides.description || t.description || 'Timer entry',
      overrides.billable !== undefined ? overrides.billable : t.billable,
      rate,
      overrides.activityCode || t.activity_code,
      overrides.taskCode || t.task_code,
      t.started_at,
      now.toISOString()
    ]
  );

  // Delete the timer
  await query('DELETE FROM active_timers WHERE id = $1', [t.id]);

  const te = entryResult.rows[0];

  logBillingAudit(firmId, userId, 'time_entry.created_from_timer', 'time_entry', te.id, {
    timerDurationSeconds: totalSeconds,
    hours: parseFloat(te.hours),
    amount: parseFloat(te.amount),
  }, req);

  return {
    id: te.id,
    matterId: te.matter_id,
    date: te.date,
    hours: parseFloat(te.hours),
    description: te.description,
    billable: te.billable,
    rate: parseFloat(te.rate),
    amount: parseFloat(te.amount),
    timerDurationSeconds: totalSeconds,
  };
}

export default router;
