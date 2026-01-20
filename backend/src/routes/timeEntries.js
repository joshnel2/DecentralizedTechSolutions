import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { getTodayInTimezone } from '../utils/dateUtils.js';
import { learnFromTimeEntry } from '../services/manualLearning.js';

const router = Router();

// Get time entries
router.get('/', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    const { 
      matterId, userId, startDate, endDate, billable, billed, status,
      limit = 1000000, offset = 0  // No limit
    } = req.query;
    
    // Check if user is admin/owner - they see all firm data
    const isAdmin = ['owner', 'admin', 'billing'].includes(req.user.role);
    
    let sql = `
      SELECT te.*,
             m.name as matter_name,
             m.number as matter_number,
             u.first_name || ' ' || u.last_name as user_name,
             i.number as invoice_number,
             i.status as invoice_status
      FROM time_entries te
      LEFT JOIN matters m ON te.matter_id = m.id
      LEFT JOIN users u ON te.user_id = u.id
      LEFT JOIN invoices i ON te.invoice_id = i.id
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

    // Only filter by userId if admin is looking at a specific user
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

    sql += ` ORDER BY te.date DESC, te.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);

    res.json({
      timeEntries: result.rows.map(te => ({
        id: te.id,
        matterId: te.matter_id,
        matterName: te.matter_name,
        matterNumber: te.matter_number,
        userId: te.user_id,
        userName: te.user_name,
        date: te.date,
        hours: parseFloat(te.hours),
        description: te.description,
        billable: te.billable,
        billed: te.billed,
        rate: parseFloat(te.rate),
        amount: parseFloat(te.amount),
        activityCode: te.activity_code,
        status: te.status,
        entryType: te.entry_type,
        aiGenerated: te.ai_generated,
        invoiceId: te.invoice_id,
        invoiceNumber: te.invoice_number,
        invoiceStatus: te.invoice_status,
        createdAt: te.created_at,
        updatedAt: te.updated_at,
      })),
    });
  } catch (error) {
    console.error('Get time entries error:', error);
    res.status(500).json({ error: 'Failed to get time entries' });
  }
});

// Create time entry
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
      entryType = 'manual',
    } = req.body;

    // Use defaults for optional fields - use Eastern timezone for consistent dates
    const entryDate = date || getTodayInTimezone();
    const entryHours = hours || 0.01;
    const entryDescription = description || '';

    // Get rate from matter if not provided
    let entryRate = rate;
    if (!entryRate) {
      if (matterId) {
        const matterResult = await query(
          'SELECT billing_rate FROM matters WHERE id = $1',
          [matterId]
        );
        if (matterResult.rows.length > 0 && matterResult.rows[0].billing_rate) {
          entryRate = matterResult.rows[0].billing_rate;
        }
      }
      
      if (!entryRate) {
        // Get user's rate
        const userResult = await query(
          'SELECT hourly_rate FROM users WHERE id = $1',
          [req.user.id]
        );
        entryRate = userResult.rows[0]?.hourly_rate || 350;
      }
    }

    const result = await query(
      `INSERT INTO time_entries (
        firm_id, matter_id, user_id, date, hours, description,
        billable, rate, activity_code, entry_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        req.user.firmId, matterId || null, req.user.id, entryDate, entryHours, entryDescription,
        billable, entryRate, activityCode, entryType
      ]
    );

    const te = result.rows[0];
    
    // Learn from this manual time entry (async, non-blocking)
    learnFromTimeEntry({
      description: te.description,
      hours: parseFloat(te.hours),
      rate: parseFloat(te.rate),
      billable: te.billable,
      activity_code: te.activity_code,
      matter_id: te.matter_id,
      entry_type: te.entry_type
    }, req.user.id, req.user.firmId).catch(() => {});
    
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
      status: te.status,
      entryType: te.entry_type,
      createdAt: te.created_at,
    });
  } catch (error) {
    console.error('Create time entry error:', error);
    res.status(500).json({ error: 'Failed to create time entry' });
  }
});

// Update time entry
router.put('/:id', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const existing = await query(
      'SELECT id FROM time_entries WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    const { matterId, date, hours, description, billable, billed, rate, activityCode, status } = req.body;

    const result = await query(
      `UPDATE time_entries SET
        matter_id = COALESCE($1, matter_id),
        date = COALESCE($2, date),
        hours = COALESCE($3, hours),
        description = COALESCE($4, description),
        billable = COALESCE($5, billable),
        rate = COALESCE($6, rate),
        activity_code = COALESCE($7, activity_code),
        status = COALESCE($8, status),
        billed = COALESCE($9, billed)
      WHERE id = $10
      RETURNING *`,
      [matterId, date, hours, description, billable, rate, activityCode, status, billed, req.params.id]
    );

    const te = result.rows[0];
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
      status: te.status,
      updatedAt: te.updated_at,
    });
  } catch (error) {
    console.error('Update time entry error:', error);
    res.status(500).json({ error: 'Failed to update time entry' });
  }
});

// Delete time entry
router.delete('/:id', authenticate, requirePermission('billing:delete'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM time_entries WHERE id = $1 AND firm_id = $2 AND billed = false RETURNING id',
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Time entry not found or already billed' });
    }

    res.json({ message: 'Time entry deleted' });
  } catch (error) {
    console.error('Delete time entry error:', error);
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

export default router;
