import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { getTodayInTimezone, createDateInTimezone } from '../utils/dateUtils.js';

const router = Router();

/**
 * AI Agent Tool: Log Billable Time
 * 
 * POST /api/v1/billing/log-time
 * 
 * Security Model:
 * - User must be authenticated via JWT
 * - User must have 'billing:create' permission
 * - User must be authorized to log time to the specified matter:
 *   - User is assigned to the matter (via matter_assignments), OR
 *   - User is the responsible_attorney for the matter, OR
 *   - User is admin/owner (can log to any firm matter)
 * - Time entry is always created for the authenticated user (no impersonation)
 * - Firm isolation enforced via firm_id from JWT
 */
router.post('/log-time', authenticate, requirePermission('billing:create'), async (req, res) => {
  try {
    const {
      matter_id,
      hours,
      description,
      date,
      billable = true,
      activity_code,
    } = req.body;

    // Validate required fields
    if (!matter_id) {
      return res.status(400).json({ 
        success: false,
        error: 'matter_id is required',
        code: 'MISSING_MATTER_ID'
      });
    }

    if (!hours || typeof hours !== 'number' || hours <= 0 || hours > 24) {
      return res.status(400).json({ 
        success: false,
        error: 'hours must be a positive number between 0 and 24',
        code: 'INVALID_HOURS'
      });
    }

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'description is required and must be a non-empty string',
        code: 'MISSING_DESCRIPTION'
      });
    }

    // Validate date if provided - use Eastern timezone for consistent dates
    let entryDate;
    if (date) {
      // If date is provided, parse it as a date string and create at noon to avoid day boundary issues
      const dateStr = date.split('T')[0]; // Get just the date part if ISO string
      entryDate = createDateInTimezone(dateStr, 12, 0);
    } else {
      // Use today in Eastern timezone
      entryDate = createDateInTimezone(getTodayInTimezone(), 12, 0);
    }
    if (isNaN(entryDate.getTime())) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid date format',
        code: 'INVALID_DATE'
      });
    }

    // Check if user is admin/owner (they can log to any matter in the firm)
    const isAdmin = ['owner', 'admin'].includes(req.user.role);

    // Verify matter exists and belongs to the firm
    const matterResult = await query(
      `SELECT m.id, m.name, m.number, m.billing_rate, m.responsible_attorney, m.status,
              EXISTS(
                SELECT 1 FROM matter_assignments ma 
                WHERE ma.matter_id = m.id AND ma.user_id = $2
              ) as user_is_assigned
       FROM matters m
       WHERE m.id = $1 AND m.firm_id = $3`,
      [matter_id, req.user.id, req.user.firmId]
    );

    if (matterResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Matter not found',
        code: 'MATTER_NOT_FOUND'
      });
    }

    const matter = matterResult.rows[0];

    // Check matter status
    if (matter.status === 'closed') {
      return res.status(400).json({ 
        success: false,
        error: 'Cannot log time to a closed matter',
        code: 'MATTER_CLOSED'
      });
    }

    // Authorization check: user must be assigned to matter OR be responsible attorney OR be admin
    const isResponsibleAttorney = matter.responsible_attorney === req.user.id;
    const isAssigned = matter.user_is_assigned;

    if (!isAdmin && !isResponsibleAttorney && !isAssigned) {
      return res.status(403).json({ 
        success: false,
        error: 'You are not authorized to log time to this matter. You must be assigned to the matter or be the responsible attorney.',
        code: 'NOT_AUTHORIZED_FOR_MATTER'
      });
    }

    // Get billing rate (priority: user's rate for this matter > matter rate > user's default rate)
    let billingRate;
    
    // First, check if user has a specific rate for this matter
    const assignmentRate = await query(
      `SELECT billing_rate FROM matter_assignments 
       WHERE matter_id = $1 AND user_id = $2 AND billing_rate IS NOT NULL`,
      [matter_id, req.user.id]
    );
    
    if (assignmentRate.rows.length > 0 && assignmentRate.rows[0].billing_rate) {
      billingRate = assignmentRate.rows[0].billing_rate;
    } else if (matter.billing_rate) {
      billingRate = matter.billing_rate;
    } else {
      // Get user's default hourly rate
      const userResult = await query(
        'SELECT hourly_rate FROM users WHERE id = $1',
        [req.user.id]
      );
      billingRate = userResult.rows[0]?.hourly_rate || 350; // Default fallback
    }

    // Create the time entry
    const result = await query(
      `INSERT INTO time_entries (
        firm_id, matter_id, user_id, date, hours, description,
        billable, rate, activity_code, entry_type, ai_generated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ai_suggested', true)
      RETURNING *`,
      [
        req.user.firmId,
        matter_id,
        req.user.id,
        entryDate.toISOString().split('T')[0],
        hours,
        description.trim(),
        billable,
        billingRate,
        activity_code || null
      ]
    );

    const timeEntry = result.rows[0];

    // Log audit trail
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'time_entry.created_via_ai', 'time_entry', $3, $4)`,
      [
        req.user.firmId, 
        req.user.id, 
        timeEntry.id, 
        JSON.stringify({
          matter_id,
          matter_name: matter.name,
          hours,
          amount: parseFloat(timeEntry.amount),
          ai_generated: true
        })
      ]
    ).catch(err => console.error('Audit log error:', err)); // Don't fail if audit log fails

    // Return success response
    res.status(201).json({
      success: true,
      message: `Successfully logged ${hours} hours to matter ${matter.number}`,
      data: {
        id: timeEntry.id,
        matter_id: timeEntry.matter_id,
        matter_name: matter.name,
        matter_number: matter.number,
        user_id: timeEntry.user_id,
        date: timeEntry.date,
        hours: parseFloat(timeEntry.hours),
        description: timeEntry.description,
        billable: timeEntry.billable,
        rate: parseFloat(timeEntry.rate),
        amount: parseFloat(timeEntry.amount),
        activity_code: timeEntry.activity_code,
        entry_type: timeEntry.entry_type,
        ai_generated: timeEntry.ai_generated,
        created_at: timeEntry.created_at
      }
    });

  } catch (error) {
    console.error('Log time error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to log time entry',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * AI Agent Tool: Get User's Matters (for time logging context)
 * 
 * GET /api/v1/billing/my-matters
 * 
 * Returns matters the user can log time to.
 * Useful for AI Agent to know which matters are available.
 */
router.get('/my-matters', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    const isAdmin = ['owner', 'admin'].includes(req.user.role);

    let sql = `
      SELECT m.id, m.name, m.number, m.status, m.billing_type, m.billing_rate,
             c.display_name as client_name
      FROM matters m
      LEFT JOIN clients c ON m.client_id = c.id
      WHERE m.firm_id = $1 AND m.status != 'closed'
    `;
    const params = [req.user.firmId];

    // Non-admins only see matters they're assigned to or responsible for
    if (!isAdmin) {
      sql += ` AND (m.responsible_attorney = $2 OR EXISTS (
        SELECT 1 FROM matter_assignments WHERE matter_id = m.id AND user_id = $2
      ))`;
      params.push(req.user.id);
    }

    sql += ` ORDER BY m.name ASC LIMIT 100`;

    const result = await query(sql, params);

    res.json({
      success: true,
      data: {
        matters: result.rows.map(m => ({
          id: m.id,
          name: m.name,
          number: m.number,
          status: m.status,
          billing_type: m.billing_type,
          billing_rate: m.billing_rate ? parseFloat(m.billing_rate) : null,
          client_name: m.client_name
        })),
        count: result.rows.length
      }
    });

  } catch (error) {
    console.error('Get my matters error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get matters',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * AI Agent Tool: Get User's Recent Time Entries
 * 
 * GET /api/v1/billing/my-time-entries
 * 
 * Returns recent time entries for the authenticated user.
 */
router.get('/my-time-entries', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    const { limit = 20, start_date, end_date } = req.query;

    let sql = `
      SELECT te.*, m.name as matter_name, m.number as matter_number
      FROM time_entries te
      LEFT JOIN matters m ON te.matter_id = m.id
      WHERE te.firm_id = $1 AND te.user_id = $2
    `;
    const params = [req.user.firmId, req.user.id];
    let paramIndex = 3;

    if (start_date) {
      sql += ` AND te.date >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      sql += ` AND te.date <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    sql += ` ORDER BY te.date DESC, te.created_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    const result = await query(sql, params);

    // Get summary stats
    const summaryResult = await query(
      `SELECT 
        SUM(hours) as total_hours,
        SUM(amount) as total_amount,
        SUM(CASE WHEN billable THEN hours ELSE 0 END) as billable_hours,
        SUM(CASE WHEN billed THEN amount ELSE 0 END) as billed_amount
       FROM time_entries
       WHERE firm_id = $1 AND user_id = $2 AND date >= DATE_TRUNC('month', CURRENT_DATE)`,
      [req.user.firmId, req.user.id]
    );

    const summary = summaryResult.rows[0];

    res.json({
      success: true,
      data: {
        time_entries: result.rows.map(te => ({
          id: te.id,
          matter_id: te.matter_id,
          matter_name: te.matter_name,
          matter_number: te.matter_number,
          date: te.date,
          hours: parseFloat(te.hours),
          description: te.description,
          billable: te.billable,
          billed: te.billed,
          rate: parseFloat(te.rate),
          amount: parseFloat(te.amount),
          activity_code: te.activity_code,
          ai_generated: te.ai_generated,
          created_at: te.created_at
        })),
        this_month_summary: {
          total_hours: parseFloat(summary?.total_hours || 0),
          total_amount: parseFloat(summary?.total_amount || 0),
          billable_hours: parseFloat(summary?.billable_hours || 0),
          billed_amount: parseFloat(summary?.billed_amount || 0)
        }
      }
    });

  } catch (error) {
    console.error('Get my time entries error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get time entries',
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router;
