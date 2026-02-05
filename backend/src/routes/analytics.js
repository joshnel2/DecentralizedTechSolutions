import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * AI Agent Tool: Retrieve Firm Analytics Summary
 * 
 * GET /api/v1/analytics/firm-summary
 * 
 * Security Model:
 * - User must be authenticated via JWT
 * - User must have role: owner, admin, partner, or billing
 * - Data is strictly filtered by firm_id from JWT (no cross-firm access)
 * - Returns aggregated, non-user-specific data for firm-wide insights
 * 
 * This endpoint provides firm-wide analytical data intended for 
 * administrative queries and business intelligence.
 */
router.get('/firm-summary', authenticate, requireRole('owner', 'admin', 'partner', 'billing'), async (req, res) => {
  try {
    const { time_period = 'current_month' } = req.query;
    const firmId = req.user.firmId;

    // Determine date range based on time_period
    let dateFilter;
    let periodLabel;
    
    switch (time_period) {
      case 'last_week':
        dateFilter = `date >= CURRENT_DATE - INTERVAL '7 days'`;
        periodLabel = 'Last 7 Days';
        break;
      case 'last_month':
        dateFilter = `date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') AND date < DATE_TRUNC('month', CURRENT_DATE)`;
        periodLabel = 'Last Month';
        break;
      case 'last_quarter':
        dateFilter = `date >= DATE_TRUNC('quarter', CURRENT_DATE - INTERVAL '3 months') AND date < DATE_TRUNC('quarter', CURRENT_DATE)`;
        periodLabel = 'Last Quarter';
        break;
      case 'last_year':
        dateFilter = `date >= DATE_TRUNC('year', CURRENT_DATE - INTERVAL '1 year') AND date < DATE_TRUNC('year', CURRENT_DATE)`;
        periodLabel = 'Last Year';
        break;
      case 'year_to_date':
        dateFilter = `date >= DATE_TRUNC('year', CURRENT_DATE)`;
        periodLabel = 'Year to Date';
        break;
      case 'all_time':
        dateFilter = '1=1';
        periodLabel = 'All Time';
        break;
      case 'current_month':
      default:
        dateFilter = `date >= DATE_TRUNC('month', CURRENT_DATE)`;
        periodLabel = 'Current Month';
        break;
    }

    // Execute all queries in parallel for performance
    const [
      matterStats,
      billingStats,
      revenueStats,
      clientStats,
      teamPerformance,
      invoiceStats,
      recentTrends,
      topMatters,
      topClients
    ] = await Promise.all([
      // Matter statistics
      query(`
        SELECT 
          COUNT(*) as total_matters,
          COUNT(*) FILTER (WHERE status = 'active') as active_matters,
          COUNT(*) FILTER (WHERE status = 'pending') as pending_matters,
          COUNT(*) FILTER (WHERE status = 'closed') as closed_matters,
          COUNT(*) FILTER (WHERE priority = 'urgent') as urgent_matters,
          COUNT(*) FILTER (WHERE priority = 'high') as high_priority_matters,
          COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)) as new_this_month
        FROM matters WHERE firm_id = $1
      `, [firmId]),

      // Billing statistics for the period
      query(`
        SELECT 
          COALESCE(SUM(hours), 0) as total_hours,
          COALESCE(SUM(amount), 0) as total_amount,
          COALESCE(SUM(hours) FILTER (WHERE billable = true), 0) as billable_hours,
          COALESCE(SUM(amount) FILTER (WHERE billable = true), 0) as billable_amount,
          COALESCE(SUM(hours) FILTER (WHERE billed = true), 0) as billed_hours,
          COALESCE(SUM(amount) FILTER (WHERE billed = true), 0) as billed_amount,
          COALESCE(SUM(hours) FILTER (WHERE billable = true AND billed = false), 0) as unbilled_hours,
          COALESCE(SUM(amount) FILTER (WHERE billable = true AND billed = false), 0) as unbilled_amount,
          COUNT(*) as total_entries,
          COALESCE(AVG(hours), 0) as avg_hours_per_entry
        FROM time_entries 
        WHERE firm_id = $1 AND ${dateFilter}
      `, [firmId]),

      // Revenue by month (last 6 months)
      query(`
        SELECT 
          DATE_TRUNC('month', date) as month,
          COALESCE(SUM(hours), 0) as hours,
          COALESCE(SUM(amount), 0) as revenue,
          COUNT(*) as entry_count
        FROM time_entries
        WHERE firm_id = $1 AND date >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', date)
        ORDER BY month DESC
      `, [firmId]),

      // Client statistics
      query(`
        SELECT 
          COUNT(*) as total_clients,
          COUNT(*) FILTER (WHERE is_active = true) as active_clients,
          COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)) as new_this_month
        FROM clients WHERE firm_id = $1
      `, [firmId]),

      // Team performance for the period (aggregated, not individual identifying)
      query(`
        SELECT 
          u.role,
          COUNT(DISTINCT u.id) as member_count,
          COALESCE(SUM(te.hours), 0) as total_hours,
          COALESCE(SUM(te.amount), 0) as total_revenue,
          COALESCE(AVG(te.hours), 0) as avg_hours_per_entry
        FROM users u
        LEFT JOIN time_entries te ON te.user_id = u.id AND te.firm_id = $1 AND te.${dateFilter.replace(/date/g, 'te.date')}
        WHERE u.firm_id = $1 AND u.is_active = true
        GROUP BY u.role
        ORDER BY total_revenue DESC
      `, [firmId]),

      // Invoice statistics
      query(`
        SELECT 
          COUNT(*) as total_invoices,
          COALESCE(SUM(subtotal_fees), 0) as total_invoiced,
          COALESCE(SUM(amount_paid), 0) as total_collected,
          COALESCE(SUM(subtotal_fees - amount_paid), 0) as total_outstanding,
          COALESCE(SUM(subtotal_fees - amount_paid) FILTER (WHERE status = 'overdue'), 0) as total_overdue,
          COUNT(*) FILTER (WHERE status = 'draft') as draft_count,
          COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
          COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
          COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count
        FROM invoices WHERE firm_id = $1
      `, [firmId]),

      // Recent trends (week over week comparison)
      query(`
        WITH this_week AS (
          SELECT COALESCE(SUM(hours), 0) as hours, COALESCE(SUM(amount), 0) as amount
          FROM time_entries 
          WHERE firm_id = $1 AND date >= CURRENT_DATE - INTERVAL '7 days'
        ),
        last_week AS (
          SELECT COALESCE(SUM(hours), 0) as hours, COALESCE(SUM(amount), 0) as amount
          FROM time_entries 
          WHERE firm_id = $1 AND date >= CURRENT_DATE - INTERVAL '14 days' AND date < CURRENT_DATE - INTERVAL '7 days'
        )
        SELECT 
          tw.hours as this_week_hours, tw.amount as this_week_amount,
          lw.hours as last_week_hours, lw.amount as last_week_amount,
          CASE WHEN lw.hours > 0 THEN ((tw.hours - lw.hours) / lw.hours * 100) ELSE 0 END as hours_change_percent,
          CASE WHEN lw.amount > 0 THEN ((tw.amount - lw.amount) / lw.amount * 100) ELSE 0 END as revenue_change_percent
        FROM this_week tw, last_week lw
      `, [firmId]),

      // Top matters by revenue (this period)
      query(`
        SELECT 
          m.id, m.name, m.number, m.status,
          c.display_name as client_name,
          COALESCE(SUM(te.hours), 0) as total_hours,
          COALESCE(SUM(te.amount), 0) as total_revenue
        FROM matters m
        LEFT JOIN clients c ON m.client_id = c.id
        LEFT JOIN time_entries te ON te.matter_id = m.id AND te.${dateFilter.replace(/date/g, 'te.date')}
        WHERE m.firm_id = $1
        GROUP BY m.id, m.name, m.number, m.status, c.display_name
        HAVING COALESCE(SUM(te.amount), 0) > 0
        ORDER BY total_revenue DESC
        LIMIT 10
      `, [firmId]),

      // Top clients by revenue (this period)
      query(`
        SELECT 
          c.id, c.display_name, c.type,
          COUNT(DISTINCT m.id) as matter_count,
          COALESCE(SUM(te.hours), 0) as total_hours,
          COALESCE(SUM(te.amount), 0) as total_revenue
        FROM clients c
        LEFT JOIN matters m ON m.client_id = c.id
        LEFT JOIN time_entries te ON te.matter_id = m.id AND te.${dateFilter.replace(/date/g, 'te.date')}
        WHERE c.firm_id = $1
        GROUP BY c.id, c.display_name, c.type
        HAVING COALESCE(SUM(te.amount), 0) > 0
        ORDER BY total_revenue DESC
        LIMIT 10
      `, [firmId])
    ]);

    // Calculate utilization rate (assuming 8 hours/day, 22 days/month)
    const billing = billingStats.rows[0];
    const team = teamPerformance.rows;
    const totalTeamMembers = team.reduce((sum, t) => sum + parseInt(t.member_count), 0);
    const expectedHours = totalTeamMembers * 8 * 22; // Rough estimate
    const utilizationRate = expectedHours > 0 
      ? (parseFloat(billing.billable_hours) / expectedHours * 100).toFixed(1)
      : 0;

    // Build response
    res.json({
      success: true,
      data: {
        period: {
          type: time_period,
          label: periodLabel,
          generated_at: new Date().toISOString()
        },
        
        matters: {
          total: parseInt(matterStats.rows[0].total_matters),
          active: parseInt(matterStats.rows[0].active_matters),
          pending: parseInt(matterStats.rows[0].pending_matters),
          closed: parseInt(matterStats.rows[0].closed_matters),
          urgent: parseInt(matterStats.rows[0].urgent_matters),
          high_priority: parseInt(matterStats.rows[0].high_priority_matters),
          new_this_month: parseInt(matterStats.rows[0].new_this_month)
        },

        clients: {
          total: parseInt(clientStats.rows[0].total_clients),
          active: parseInt(clientStats.rows[0].active_clients),
          new_this_month: parseInt(clientStats.rows[0].new_this_month)
        },

        billing: {
          total_hours: parseFloat(billing.total_hours),
          total_amount: parseFloat(billing.total_amount),
          billable_hours: parseFloat(billing.billable_hours),
          billable_amount: parseFloat(billing.billable_amount),
          billed_hours: parseFloat(billing.billed_hours),
          billed_amount: parseFloat(billing.billed_amount),
          unbilled_hours: parseFloat(billing.unbilled_hours),
          unbilled_amount: parseFloat(billing.unbilled_amount),
          total_entries: parseInt(billing.total_entries),
          avg_hours_per_entry: parseFloat(billing.avg_hours_per_entry).toFixed(2),
          utilization_rate_percent: parseFloat(utilizationRate)
        },

        invoices: {
          total: parseInt(invoiceStats.rows[0].total_invoices),
          total_invoiced: parseFloat(invoiceStats.rows[0].total_invoiced),
          total_collected: parseFloat(invoiceStats.rows[0].total_collected),
          total_outstanding: parseFloat(invoiceStats.rows[0].total_outstanding),
          total_overdue: parseFloat(invoiceStats.rows[0].total_overdue),
          by_status: {
            draft: parseInt(invoiceStats.rows[0].draft_count),
            sent: parseInt(invoiceStats.rows[0].sent_count),
            paid: parseInt(invoiceStats.rows[0].paid_count),
            overdue: parseInt(invoiceStats.rows[0].overdue_count)
          },
          collection_rate_percent: invoiceStats.rows[0].total_invoiced > 0
            ? (parseFloat(invoiceStats.rows[0].total_collected) / parseFloat(invoiceStats.rows[0].total_invoiced) * 100).toFixed(1)
            : 0
        },

        trends: {
          week_over_week: {
            this_week_hours: parseFloat(recentTrends.rows[0]?.this_week_hours || 0),
            this_week_amount: parseFloat(recentTrends.rows[0]?.this_week_amount || 0),
            last_week_hours: parseFloat(recentTrends.rows[0]?.last_week_hours || 0),
            last_week_amount: parseFloat(recentTrends.rows[0]?.last_week_amount || 0),
            hours_change_percent: parseFloat(recentTrends.rows[0]?.hours_change_percent || 0).toFixed(1),
            revenue_change_percent: parseFloat(recentTrends.rows[0]?.revenue_change_percent || 0).toFixed(1)
          },
          monthly_revenue: revenueStats.rows.map(r => ({
            month: r.month,
            hours: parseFloat(r.hours),
            revenue: parseFloat(r.revenue),
            entry_count: parseInt(r.entry_count)
          }))
        },

        team_performance_by_role: team.map(t => ({
          role: t.role,
          member_count: parseInt(t.member_count),
          total_hours: parseFloat(t.total_hours),
          total_revenue: parseFloat(t.total_revenue),
          avg_hours_per_entry: parseFloat(t.avg_hours_per_entry).toFixed(2)
        })),

        top_matters: topMatters.rows.map(m => ({
          id: m.id,
          name: m.name,
          number: m.number,
          status: m.status,
          client_name: m.client_name,
          total_hours: parseFloat(m.total_hours),
          total_revenue: parseFloat(m.total_revenue)
        })),

        top_clients: topClients.rows.map(c => ({
          id: c.id,
          name: c.display_name,
          type: c.type,
          matter_count: parseInt(c.matter_count),
          total_hours: parseFloat(c.total_hours),
          total_revenue: parseFloat(c.total_revenue)
        }))
      }
    });

  } catch (error) {
    console.error('Firm summary error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to retrieve firm analytics',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * Comprehensive Firm Dashboard Analytics
 * 
 * GET /api/v1/analytics/firm-dashboard
 * 
 * Returns all firm-wide data for the analytics dashboard including:
 * - Time entries summary (billable hours, amounts, utilization)
 * - Invoice stats (collected, outstanding, overdue)
 * - Matter and client counts
 * - Team productivity rankings
 * - Monthly trends
 * - Revenue by practice area
 * - Top matters and clients
 */
router.get('/firm-dashboard', authenticate, requireRole('owner', 'admin', 'partner', 'billing'), async (req, res) => {
  try {
    const { time_period = 'current_month' } = req.query;
    const firmId = req.user.firmId;

    // Build date filter based on time_period
    let dateFilter, prevDateFilter;
    switch (time_period) {
      case 'last_month':
        dateFilter = `date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') AND date < DATE_TRUNC('month', CURRENT_DATE)`;
        prevDateFilter = `date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '2 months') AND date < DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')`;
        break;
      case 'last_quarter':
        dateFilter = `date >= CURRENT_DATE - INTERVAL '3 months'`;
        prevDateFilter = `date >= CURRENT_DATE - INTERVAL '6 months' AND date < CURRENT_DATE - INTERVAL '3 months'`;
        break;
      case 'last_6_months':
        dateFilter = `date >= CURRENT_DATE - INTERVAL '6 months'`;
        prevDateFilter = `date >= CURRENT_DATE - INTERVAL '12 months' AND date < CURRENT_DATE - INTERVAL '6 months'`;
        break;
      case 'year_to_date':
        dateFilter = `date >= DATE_TRUNC('year', CURRENT_DATE)`;
        prevDateFilter = `date >= DATE_TRUNC('year', CURRENT_DATE - INTERVAL '1 year') AND date < DATE_TRUNC('year', CURRENT_DATE)`;
        break;
      case 'all_time':
        dateFilter = '1=1';
        prevDateFilter = '1=0'; // No previous period for all time
        break;
      case 'current_month':
      default:
        dateFilter = `date >= DATE_TRUNC('month', CURRENT_DATE)`;
        prevDateFilter = `date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') AND date < DATE_TRUNC('month', CURRENT_DATE)`;
        break;
    }

    // Execute all queries in parallel for maximum speed
    const [
      summary,
      prevSummary,
      invoiceStats,
      matterStats,
      clientStats,
      teamProductivity,
      monthlyTrend,
      revenueByType,
      topMatters,
      topClients,
      collectionAging
    ] = await Promise.all([
      // Current period summary
      query(`
        SELECT 
          COALESCE(SUM(hours), 0) as total_hours,
          COALESCE(SUM(hours) FILTER (WHERE billable = true), 0) as billable_hours,
          COALESCE(SUM(amount), 0) as total_amount,
          COALESCE(SUM(amount) FILTER (WHERE billable = true), 0) as billable_amount,
          COALESCE(SUM(amount) FILTER (WHERE billed = true), 0) as billed_amount,
          COALESCE(SUM(hours) FILTER (WHERE billable = true AND billed = false), 0) as unbilled_hours,
          COALESCE(SUM(amount) FILTER (WHERE billable = true AND billed = false), 0) as unbilled_amount,
          COUNT(*) as entry_count,
          COUNT(DISTINCT user_id) as active_billers,
          COUNT(DISTINCT matter_id) as active_matters
        FROM time_entries WHERE firm_id = $1 AND ${dateFilter}
      `, [firmId]),

      // Previous period summary for comparison
      query(`
        SELECT 
          COALESCE(SUM(hours), 0) as total_hours,
          COALESCE(SUM(amount), 0) as total_amount
        FROM time_entries WHERE firm_id = $1 AND ${prevDateFilter}
      `, [firmId]),

      // Invoice statistics
      query(`
        SELECT 
          COUNT(*) as total,
          COALESCE(SUM(subtotal_fees), 0) as total_invoiced,
          COALESCE(SUM(amount_paid), 0) as total_collected,
          COALESCE(SUM(subtotal_fees - amount_paid) FILTER (WHERE status != 'paid'), 0) as total_outstanding,
          COALESCE(SUM(subtotal_fees - amount_paid) FILTER (WHERE status = 'overdue'), 0) as total_overdue,
          COUNT(*) FILTER (WHERE status = 'draft') as draft,
          COUNT(*) FILTER (WHERE status = 'sent') as sent,
          COUNT(*) FILTER (WHERE status = 'paid') as paid,
          COUNT(*) FILTER (WHERE status = 'overdue') as overdue,
          COUNT(*) FILTER (WHERE status = 'partial') as partial,
          COALESCE(AVG(subtotal_fees), 0) as avg_invoice_amount,
          COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400) FILTER (WHERE status = 'paid'), 0) as avg_days_to_pay
        FROM invoices WHERE firm_id = $1
      `, [firmId]),

      // Matter statistics
      query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status LIKE 'closed%') as closed,
          COUNT(*) FILTER (WHERE status = 'on_hold') as on_hold,
          COUNT(*) FILTER (WHERE priority = 'urgent') as urgent,
          COUNT(*) FILTER (WHERE priority = 'high') as high_priority,
          COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)) as new_this_month,
          COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('year', CURRENT_DATE)) as new_this_year
        FROM matters WHERE firm_id = $1
      `, [firmId]),

      // Client statistics
      query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_active = true) as active,
          COUNT(*) FILTER (WHERE type = 'person') as individuals,
          COUNT(*) FILTER (WHERE type = 'company') as companies,
          COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)) as new_this_month
        FROM clients WHERE firm_id = $1
      `, [firmId]),

      // Team productivity - individual performance
      query(`
        SELECT 
          u.id, u.first_name || ' ' || u.last_name as name, u.role, u.hourly_rate,
          COALESCE(SUM(te.hours), 0) as total_hours,
          COALESCE(SUM(te.hours) FILTER (WHERE te.billable = true), 0) as billable_hours,
          COALESCE(SUM(te.amount), 0) as total_amount,
          COALESCE(SUM(te.amount) FILTER (WHERE te.billable = true), 0) as billable_amount,
          COUNT(te.id) as entry_count,
          COUNT(DISTINCT te.matter_id) as matter_count,
          MAX(te.created_at) as last_activity
        FROM users u
        LEFT JOIN time_entries te ON te.user_id = u.id AND te.firm_id = $1 AND te.${dateFilter.replace(/date/g, 'te.date')}
        WHERE u.firm_id = $1 AND u.is_active = true
        GROUP BY u.id, u.first_name, u.last_name, u.role, u.hourly_rate
        ORDER BY billable_hours DESC
      `, [firmId]),

      // Monthly trend (last 12 months)
      query(`
        SELECT 
          DATE_TRUNC('month', date) as month,
          COALESCE(SUM(hours), 0) as total_hours,
          COALESCE(SUM(hours) FILTER (WHERE billable = true), 0) as billable_hours,
          COALESCE(SUM(amount), 0) as total_amount,
          COALESCE(SUM(amount) FILTER (WHERE billable = true), 0) as billable_amount,
          COUNT(DISTINCT user_id) as active_users,
          COUNT(*) as entry_count
        FROM time_entries
        WHERE firm_id = $1 AND date >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', date)
        ORDER BY month ASC
      `, [firmId]),

      // Revenue by practice area/matter type
      query(`
        SELECT 
          COALESCE(m.type, 'unassigned') as type,
          COALESCE(SUM(te.hours), 0) as total_hours,
          COALESCE(SUM(te.amount), 0) as total_amount,
          COUNT(DISTINCT m.id) as matter_count
        FROM time_entries te
        LEFT JOIN matters m ON te.matter_id = m.id
        WHERE te.firm_id = $1 AND te.${dateFilter.replace(/date/g, 'te.date')}
        GROUP BY m.type
        ORDER BY total_amount DESC
      `, [firmId]),

      // Top matters by revenue
      query(`
        SELECT 
          m.id, m.name, m.number, m.status, m.type,
          c.display_name as client_name,
          COALESCE(SUM(te.hours), 0) as total_hours,
          COALESCE(SUM(te.amount), 0) as total_amount
        FROM matters m
        LEFT JOIN clients c ON m.client_id = c.id
        LEFT JOIN time_entries te ON te.matter_id = m.id AND te.${dateFilter.replace(/date/g, 'te.date')}
        WHERE m.firm_id = $1
        GROUP BY m.id, m.name, m.number, m.status, m.type, c.display_name
        HAVING COALESCE(SUM(te.amount), 0) > 0
        ORDER BY total_amount DESC
        LIMIT 10
      `, [firmId]),

      // Top clients by revenue
      query(`
        SELECT 
          c.id, c.display_name as name, c.type,
          COUNT(DISTINCT m.id) as matter_count,
          COALESCE(SUM(te.hours), 0) as total_hours,
          COALESCE(SUM(te.amount), 0) as total_amount
        FROM clients c
        LEFT JOIN matters m ON m.client_id = c.id
        LEFT JOIN time_entries te ON te.matter_id = m.id AND te.${dateFilter.replace(/date/g, 'te.date')}
        WHERE c.firm_id = $1
        GROUP BY c.id, c.display_name, c.type
        HAVING COALESCE(SUM(te.amount), 0) > 0
        ORDER BY total_amount DESC
        LIMIT 10
      `, [firmId]),

      // Collection aging buckets
      query(`
        SELECT 
          CASE 
            WHEN due_date >= CURRENT_DATE THEN 'Current'
            WHEN due_date >= CURRENT_DATE - INTERVAL '30 days' THEN '1-30 days'
            WHEN due_date >= CURRENT_DATE - INTERVAL '60 days' THEN '31-60 days'
            WHEN due_date >= CURRENT_DATE - INTERVAL '90 days' THEN '61-90 days'
            ELSE '90+ days'
          END as bucket,
          COUNT(*) as invoice_count,
          COALESCE(SUM(subtotal_fees - amount_paid), 0) as outstanding_amount
        FROM invoices 
        WHERE firm_id = $1 AND status NOT IN ('paid', 'draft')
        GROUP BY bucket
        ORDER BY 
          CASE bucket 
            WHEN 'Current' THEN 1 
            WHEN '1-30 days' THEN 2 
            WHEN '31-60 days' THEN 3 
            WHEN '61-90 days' THEN 4 
            ELSE 5 
          END
      `, [firmId])
    ]);

    // Calculate derived metrics
    const s = summary.rows[0];
    const ps = prevSummary.rows[0];
    const inv = invoiceStats.rows[0];
    const mat = matterStats.rows[0];
    const cli = clientStats.rows[0];

    // Calculate utilization rate (assuming 8 hours/day target)
    const activeUsers = teamProductivity.rows.filter(t => parseFloat(t.total_hours) > 0).length;
    const expectedHours = activeUsers * 8 * 22; // 22 working days/month
    const utilizationRate = expectedHours > 0 ? (parseFloat(s.billable_hours) / expectedHours * 100) : 0;

    // Calculate period changes
    const hoursChange = parseFloat(ps.total_hours) > 0 
      ? ((parseFloat(s.total_hours) - parseFloat(ps.total_hours)) / parseFloat(ps.total_hours) * 100) 
      : 0;
    const revenueChange = parseFloat(ps.total_amount) > 0 
      ? ((parseFloat(s.total_amount) - parseFloat(ps.total_amount)) / parseFloat(ps.total_amount) * 100) 
      : 0;

    // Calculate collection rate
    const collectionRate = parseFloat(inv.total_invoiced) > 0 
      ? (parseFloat(inv.total_collected) / parseFloat(inv.total_invoiced) * 100) 
      : 0;

    res.json({
      success: true,
      data: {
        summary: {
          total_hours: parseFloat(s.total_hours),
          billable_hours: parseFloat(s.billable_hours),
          total_amount: parseFloat(s.total_amount),
          billable_amount: parseFloat(s.billable_amount),
          billed_amount: parseFloat(s.billed_amount),
          unbilled_hours: parseFloat(s.unbilled_hours),
          unbilled_amount: parseFloat(s.unbilled_amount),
          entry_count: parseInt(s.entry_count),
          active_billers: parseInt(s.active_billers),
          active_matters: parseInt(s.active_matters)
        },
        changes: {
          hours_change_percent: Math.round(hoursChange * 10) / 10,
          revenue_change_percent: Math.round(revenueChange * 10) / 10,
          hours_trend: hoursChange >= 0 ? 'up' : 'down',
          revenue_trend: revenueChange >= 0 ? 'up' : 'down'
        },
        productivity: {
          utilization_rate: Math.round(utilizationRate * 10) / 10
        },
        invoices: {
          total: parseInt(inv.total),
          total_invoiced: parseFloat(inv.total_invoiced),
          total_collected: parseFloat(inv.total_collected),
          total_outstanding: parseFloat(inv.total_outstanding),
          total_overdue: parseFloat(inv.total_overdue),
          collection_rate: Math.round(collectionRate * 10) / 10,
          avg_invoice_amount: parseFloat(inv.avg_invoice_amount),
          avg_days_to_pay: Math.round(parseFloat(inv.avg_days_to_pay)),
          by_status: {
            draft: parseInt(inv.draft),
            sent: parseInt(inv.sent),
            paid: parseInt(inv.paid),
            overdue: parseInt(inv.overdue),
            partial: parseInt(inv.partial)
          }
        },
        collection_aging: collectionAging.rows.map(r => ({
          bucket: r.bucket,
          invoice_count: parseInt(r.invoice_count),
          outstanding_amount: parseFloat(r.outstanding_amount)
        })),
        matters: {
          total: parseInt(mat.total),
          active: parseInt(mat.active),
          pending: parseInt(mat.pending),
          closed: parseInt(mat.closed),
          on_hold: parseInt(mat.on_hold),
          urgent: parseInt(mat.urgent),
          high_priority: parseInt(mat.high_priority),
          new_this_month: parseInt(mat.new_this_month),
          new_this_year: parseInt(mat.new_this_year)
        },
        clients: {
          total: parseInt(cli.total),
          active: parseInt(cli.active),
          individuals: parseInt(cli.individuals),
          companies: parseInt(cli.companies),
          new_this_month: parseInt(cli.new_this_month)
        },
        team_productivity: teamProductivity.rows.map(t => ({
          id: t.id,
          name: t.name,
          role: t.role,
          hourly_rate: parseFloat(t.hourly_rate) || 0,
          total_hours: parseFloat(t.total_hours),
          billable_hours: parseFloat(t.billable_hours),
          utilization_rate: parseFloat(t.total_hours) > 0 
            ? Math.round((parseFloat(t.billable_hours) / parseFloat(t.total_hours)) * 100) 
            : 0,
          total_amount: parseFloat(t.total_amount),
          billable_amount: parseFloat(t.billable_amount),
          entry_count: parseInt(t.entry_count),
          matter_count: parseInt(t.matter_count),
          last_activity: t.last_activity
        })),
        monthly_trend: monthlyTrend.rows.map(m => ({
          month: m.month,
          total_hours: parseFloat(m.total_hours),
          billable_hours: parseFloat(m.billable_hours),
          total_amount: parseFloat(m.total_amount),
          billable_amount: parseFloat(m.billable_amount),
          active_users: parseInt(m.active_users),
          entry_count: parseInt(m.entry_count)
        })),
        revenue_by_practice_area: revenueByType.rows.map(r => ({
          type: r.type,
          total_hours: parseFloat(r.total_hours),
          total_amount: parseFloat(r.total_amount),
          matter_count: parseInt(r.matter_count)
        })),
        top_matters: topMatters.rows.map(m => ({
          id: m.id,
          name: m.name,
          number: m.number,
          status: m.status,
          type: m.type,
          client_name: m.client_name,
          total_hours: parseFloat(m.total_hours),
          total_amount: parseFloat(m.total_amount)
        })),
        top_clients: topClients.rows.map(c => ({
          id: c.id,
          name: c.name,
          type: c.type,
          matter_count: parseInt(c.matter_count),
          total_hours: parseFloat(c.total_hours),
          total_amount: parseFloat(c.total_amount)
        }))
      }
    });

  } catch (error) {
    console.error('Firm dashboard error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to retrieve firm dashboard analytics',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * Attorney Production Value - Last 12 Months
 * 
 * GET /api/v1/analytics/attorney-production
 * 
 * Calculates production value (Duration * Hourly Rate) for each attorney
 * from billable time entries over the last 12 months.
 * Used for billing analytics when firms don't have invoice/payment data.
 */
router.get('/attorney-production', authenticate, requireRole('owner', 'admin', 'partner', 'billing'), async (req, res) => {
  try {
    const firmId = req.user.firmId;

    // First, get diagnostic info about time entries
    const diagnostic = await query(`
      SELECT 
        COUNT(*) as total_entries,
        COUNT(*) FILTER (WHERE billable = true) as billable_entries,
        COUNT(*) FILTER (WHERE date >= CURRENT_DATE - INTERVAL '12 months') as recent_entries,
        COUNT(*) FILTER (WHERE billable = true AND date >= CURRENT_DATE - INTERVAL '12 months') as recent_billable,
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) FILTER (WHERE user_id IS NULL) as entries_without_user
      FROM time_entries
      WHERE firm_id = $1
    `, [firmId]);
    
    console.log('[ANALYTICS] Time entries diagnostic:', diagnostic.rows[0]);

    // Get production value by attorney for last 12 months
    // Filter: billable = true (exclude non-billable entries)
    // Calculation: hours * hourly_rate = production value
    const productionByAttorney = await query(`
      SELECT 
        COALESCE(u.id, 'unassigned') as id,
        COALESCE(u.first_name || ' ' || u.last_name, 'Unassigned') as name,
        COALESCE(u.role, 'unknown') as role,
        COALESCE(u.hourly_rate, 0) as default_rate,
        COALESCE(SUM(te.hours), 0) as total_hours,
        COALESCE(SUM(te.hours * COALESCE(te.rate, u.hourly_rate, 350)), 0) as production_value,
        COUNT(te.id) as entry_count,
        COUNT(DISTINCT te.matter_id) as matter_count,
        COUNT(DISTINCT DATE_TRUNC('month', te.date)) as active_months
      FROM time_entries te
      LEFT JOIN users u ON te.user_id = u.id
      WHERE te.firm_id = $1 
        AND (te.billable = true OR te.billable IS NULL)
        AND te.date >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY u.id, u.first_name, u.last_name, u.role, u.hourly_rate
      HAVING COALESCE(SUM(te.hours), 0) > 0
      ORDER BY production_value DESC
    `, [firmId]);

    // Get monthly breakdown for trend chart
    const monthlyProduction = await query(`
      SELECT 
        DATE_TRUNC('month', te.date) as month,
        u.id as user_id,
        u.first_name || ' ' || u.last_name as name,
        COALESCE(SUM(te.hours), 0) as hours,
        COALESCE(SUM(te.hours * COALESCE(te.rate, u.hourly_rate, 0)), 0) as production_value
      FROM time_entries te
      JOIN users u ON te.user_id = u.id
      WHERE te.firm_id = $1 
        AND te.billable = true
        AND te.date >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', te.date), u.id, u.first_name, u.last_name
      ORDER BY month ASC, production_value DESC
    `, [firmId]);

    // Calculate totals
    const totalProduction = productionByAttorney.rows.reduce((sum, r) => sum + parseFloat(r.production_value), 0);
    const totalHours = productionByAttorney.rows.reduce((sum, r) => sum + parseFloat(r.total_hours), 0);

    // Format monthly data for stacked chart (by attorney per month)
    const monthlyData = {};
    monthlyProduction.rows.forEach(row => {
      const monthKey = row.month.toISOString().slice(0, 7); // YYYY-MM
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { month: monthKey, total: 0 };
      }
      monthlyData[monthKey][row.name] = parseFloat(row.production_value);
      monthlyData[monthKey].total += parseFloat(row.production_value);
    });

    const diag = diagnostic.rows[0] || {};
    
    res.json({
      success: true,
      data: {
        summary: {
          total_production_value: totalProduction,
          total_billable_hours: totalHours,
          attorney_count: productionByAttorney.rows.length,
          avg_production_per_attorney: productionByAttorney.rows.length > 0 
            ? totalProduction / productionByAttorney.rows.length 
            : 0,
          period: 'Last 12 Months'
        },
        // Diagnostic info to help debug data issues
        diagnostic: {
          total_time_entries: parseInt(diag.total_entries) || 0,
          billable_entries: parseInt(diag.billable_entries) || 0,
          entries_in_last_12_months: parseInt(diag.recent_entries) || 0,
          billable_in_last_12_months: parseInt(diag.recent_billable) || 0,
          earliest_entry_date: diag.earliest_date,
          latest_entry_date: diag.latest_date,
          unique_users_with_entries: parseInt(diag.unique_users) || 0,
          entries_without_user: parseInt(diag.entries_without_user) || 0
        },
        by_attorney: productionByAttorney.rows.map(r => ({
          id: r.id,
          name: r.name,
          role: r.role,
          default_rate: parseFloat(r.default_rate) || 0,
          total_hours: parseFloat(r.total_hours),
          production_value: parseFloat(r.production_value),
          entry_count: parseInt(r.entry_count),
          matter_count: parseInt(r.matter_count),
          active_months: parseInt(r.active_months),
          avg_monthly_production: parseInt(r.active_months) > 0 
            ? parseFloat(r.production_value) / parseInt(r.active_months) 
            : 0
        })),
        monthly_trend: Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month)),
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Attorney production error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to retrieve attorney production data',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * AI Agent Tool: Get Quick KPIs
 * 
 * GET /api/v1/analytics/kpis
 * 
 * Returns key performance indicators for quick dashboards.
 * Lighter weight than full firm-summary.
 */
router.get('/kpis', authenticate, requireRole('owner', 'admin', 'partner', 'billing'), async (req, res) => {
  try {
    const firmId = req.user.firmId;

    const [matters, billing, invoices] = await Promise.all([
      query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'active') as active_matters,
          COUNT(*) FILTER (WHERE priority IN ('urgent', 'high') AND status = 'active') as priority_matters
        FROM matters WHERE firm_id = $1
      `, [firmId]),

      query(`
        SELECT 
          COALESCE(SUM(hours), 0) as mtd_hours,
          COALESCE(SUM(amount), 0) as mtd_revenue,
          COALESCE(SUM(amount) FILTER (WHERE billable = true AND billed = false), 0) as unbilled_amount
        FROM time_entries 
        WHERE firm_id = $1 AND date >= DATE_TRUNC('month', CURRENT_DATE)
      `, [firmId]),

      query(`
        SELECT 
          COALESCE(SUM(subtotal_fees - amount_paid), 0) as outstanding,
          COALESCE(SUM(subtotal_fees - amount_paid) FILTER (WHERE status = 'overdue'), 0) as overdue
        FROM invoices WHERE firm_id = $1
      `, [firmId])
    ]);

    res.json({
      success: true,
      data: {
        active_matters: parseInt(matters.rows[0].active_matters),
        priority_matters: parseInt(matters.rows[0].priority_matters),
        mtd_hours: parseFloat(billing.rows[0].mtd_hours),
        mtd_revenue: parseFloat(billing.rows[0].mtd_revenue),
        unbilled_amount: parseFloat(billing.rows[0].unbilled_amount),
        outstanding_invoices: parseFloat(invoices.rows[0].outstanding),
        overdue_invoices: parseFloat(invoices.rows[0].overdue),
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('KPIs error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to retrieve KPIs',
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router;
