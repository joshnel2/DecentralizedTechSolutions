import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate, requirePermission, requireRole } from '../middleware/auth.js';

const router = Router();

// Get firm details
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM firms WHERE id = $1',
      [req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Firm not found' });
    }

    const f = result.rows[0];
    res.json({
      id: f.id,
      name: f.name,
      address: f.address,
      city: f.city,
      state: f.state,
      zipCode: f.zip_code,
      phone: f.phone,
      email: f.email,
      website: f.website,
      logoUrl: f.logo_url,
      billingDefaults: f.billing_defaults,
      settings: f.settings,
      createdAt: f.created_at,
      updatedAt: f.updated_at,
    });
  } catch (error) {
    console.error('Get firm error:', error);
    res.status(500).json({ error: 'Failed to get firm details' });
  }
});

// Update firm
router.put('/', authenticate, requirePermission('firm:manage'), async (req, res) => {
  try {
    const {
      name,
      address,
      city,
      state,
      zipCode,
      phone,
      email,
      website,
      logoUrl,
      billingDefaults,
      settings,
    } = req.body;

    const result = await query(
      `UPDATE firms SET
        name = COALESCE($1, name),
        address = COALESCE($2, address),
        city = COALESCE($3, city),
        state = COALESCE($4, state),
        zip_code = COALESCE($5, zip_code),
        phone = COALESCE($6, phone),
        email = COALESCE($7, email),
        website = COALESCE($8, website),
        logo_url = COALESCE($9, logo_url),
        billing_defaults = COALESCE($10, billing_defaults),
        settings = COALESCE($11, settings)
      WHERE id = $12
      RETURNING *`,
      [
        name, address, city, state, zipCode, phone, email, website, logoUrl,
        billingDefaults ? JSON.stringify(billingDefaults) : null,
        settings ? JSON.stringify(settings) : null,
        req.user.firmId
      ]
    );

    // Log action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id)
       VALUES ($1, $2, 'firm.updated', 'firm', $1)`,
      [req.user.firmId, req.user.id]
    );

    const f = result.rows[0];
    res.json({
      id: f.id,
      name: f.name,
      address: f.address,
      city: f.city,
      state: f.state,
      zipCode: f.zip_code,
      phone: f.phone,
      email: f.email,
      website: f.website,
      logoUrl: f.logo_url,
      billingDefaults: f.billing_defaults,
      settings: f.settings,
      updatedAt: f.updated_at,
    });
  } catch (error) {
    console.error('Update firm error:', error);
    res.status(500).json({ error: 'Failed to update firm' });
  }
});

// Get audit logs
router.get('/audit-logs', authenticate, requirePermission('audit:view'), async (req, res) => {
  try {
    const { userId, resourceType, startDate, endDate, limit = 100, offset = 0 } = req.query;

    let sql = `
      SELECT al.*, u.first_name || ' ' || u.last_name as user_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.firm_id = $1
    `;
    const params = [req.user.firmId];
    let paramIndex = 2;

    if (userId) {
      sql += ` AND al.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (resourceType) {
      sql += ` AND al.resource_type = $${paramIndex}`;
      params.push(resourceType);
      paramIndex++;
    }

    if (startDate) {
      sql += ` AND al.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      sql += ` AND al.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    sql += ` ORDER BY al.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);

    res.json({
      auditLogs: result.rows.map(a => ({
        id: a.id,
        userId: a.user_id,
        userName: a.user_name,
        action: a.action,
        resourceType: a.resource_type,
        resourceId: a.resource_id,
        details: a.details,
        ipAddress: a.ip_address,
        userAgent: a.user_agent,
        createdAt: a.created_at,
      })),
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

// Dashboard stats
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    // Check if user is admin/owner - they see firm-wide stats
    const isAdmin = ['owner', 'admin', 'billing'].includes(req.user.role);
    
    const [
      matterStats,
      billingStats,
      recentActivity,
      upcomingDeadlines
    ] = await Promise.all([
      // Matter stats - admins see all, users see assigned
      isAdmin ? query(
        `SELECT 
          COUNT(*) FILTER (WHERE status = 'active') as active_matters,
          COUNT(*) FILTER (WHERE status = 'pending') as pending_matters,
          COUNT(*) FILTER (WHERE status = 'closed' AND close_date > NOW() - INTERVAL '30 days') as recently_closed
        FROM matters WHERE firm_id = $1`,
        [req.user.firmId]
      ) : query(
        `SELECT 
          COUNT(*) FILTER (WHERE m.status = 'active') as active_matters,
          COUNT(*) FILTER (WHERE m.status = 'pending') as pending_matters,
          COUNT(*) FILTER (WHERE m.status = 'closed' AND m.close_date > NOW() - INTERVAL '30 days') as recently_closed
        FROM matters m
        LEFT JOIN matter_assignments ma ON m.id = ma.matter_id
        WHERE m.firm_id = $1 AND (m.responsible_attorney = $2 OR ma.user_id = $2)`,
        [req.user.firmId, req.user.id]
      ),
      
      // Billing stats - admins see all, users see their own
      isAdmin ? query(
        `SELECT 
          COALESCE(SUM(amount_due), 0) as outstanding_invoices,
          COALESCE(SUM(CASE WHEN status = 'overdue' THEN amount_due ELSE 0 END), 0) as overdue_amount,
          (SELECT COALESCE(SUM(amount), 0) FROM time_entries 
           WHERE firm_id = $1 AND billed = false AND billable = true) as unbilled_time
        FROM invoices WHERE firm_id = $1 AND status NOT IN ('paid', 'void', 'draft')`,
        [req.user.firmId]
      ) : query(
        `SELECT 
          0 as outstanding_invoices,
          0 as overdue_amount,
          COALESCE(SUM(amount), 0) as unbilled_time
        FROM time_entries WHERE firm_id = $1 AND user_id = $2 AND billed = false AND billable = true`,
        [req.user.firmId, req.user.id]
      ),
      
      // Recent activity - admins see all, users see their own
      isAdmin ? query(
        `SELECT al.*, u.first_name || ' ' || u.last_name as user_name
         FROM audit_logs al
         LEFT JOIN users u ON al.user_id = u.id
         WHERE al.firm_id = $1
         ORDER BY al.created_at DESC LIMIT 5`,
        [req.user.firmId]
      ) : query(
        `SELECT al.*, u.first_name || ' ' || u.last_name as user_name
         FROM audit_logs al
         LEFT JOIN users u ON al.user_id = u.id
         WHERE al.firm_id = $1 AND al.user_id = $2
         ORDER BY al.created_at DESC LIMIT 5`,
        [req.user.firmId, req.user.id]
      ),
      
      // Upcoming deadlines - admins see all, users see relevant
      isAdmin ? query(
        `SELECT e.*, m.name as matter_name, m.number as matter_number
         FROM calendar_events e
         LEFT JOIN matters m ON e.matter_id = m.id
         WHERE e.firm_id = $1 
           AND e.type IN ('deadline', 'court_date', 'closing')
           AND e.start_time BETWEEN NOW() AND NOW() + INTERVAL '7 days'
         ORDER BY e.start_time LIMIT 10`,
        [req.user.firmId]
      ) : query(
        `SELECT e.*, m.name as matter_name, m.number as matter_number
         FROM calendar_events e
         LEFT JOIN matters m ON e.matter_id = m.id
         WHERE e.firm_id = $1 
           AND e.type IN ('deadline', 'court_date', 'closing')
           AND e.start_time BETWEEN NOW() AND NOW() + INTERVAL '7 days'
           AND (e.created_by = $2 OR e.is_private = false)
         ORDER BY e.start_time LIMIT 10`,
        [req.user.firmId, req.user.id]
      )
    ]);

    res.json({
      // Include role info so frontend knows what view they're seeing
      viewMode: isAdmin ? 'firm' : 'personal',
      userRole: req.user.role,
      matters: {
        active: parseInt(matterStats.rows[0]?.active_matters || 0),
        pending: parseInt(matterStats.rows[0]?.pending_matters || 0),
        recentlyClosed: parseInt(matterStats.rows[0]?.recently_closed || 0),
      },
      billing: {
        outstanding: parseFloat(billingStats.rows[0]?.outstanding_invoices || 0),
        overdue: parseFloat(billingStats.rows[0]?.overdue_amount || 0),
        unbilledTime: parseFloat(billingStats.rows[0]?.unbilled_time || 0),
      },
      recentActivity: recentActivity.rows.map(a => ({
        id: a.id,
        action: a.action,
        resourceType: a.resource_type,
        userName: a.user_name,
        createdAt: a.created_at,
      })),
      upcomingDeadlines: upcomingDeadlines.rows.map(e => ({
        id: e.id,
        title: e.title,
        type: e.type,
        startTime: e.start_time,
        matterName: e.matter_name,
        matterNumber: e.matter_number,
      })),
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

// Notifications
router.get('/notifications', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [req.user.id]
    );

    res.json({
      notifications: result.rows.map(n => ({
        id: n.id,
        type: n.type,
        category: n.category,
        title: n.title,
        message: n.message,
        actionUrl: n.action_url,
        read: n.read,
        readAt: n.read_at,
        createdAt: n.created_at,
      })),
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// Mark notification read
router.put('/notifications/:id/read', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE notifications SET read = true, read_at = NOW() 
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// Mark all notifications read
router.put('/notifications/read-all', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE notifications SET read = true, read_at = NOW() 
       WHERE user_id = $1 AND read = false`,
      [req.user.id]
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

export default router;
