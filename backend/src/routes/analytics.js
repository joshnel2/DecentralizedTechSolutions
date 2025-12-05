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
          COALESCE(SUM(total), 0) as total_invoiced,
          COALESCE(SUM(amount_paid), 0) as total_collected,
          COALESCE(SUM(amount_due), 0) as total_outstanding,
          COALESCE(SUM(amount_due) FILTER (WHERE status = 'overdue'), 0) as total_overdue,
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
          COALESCE(SUM(amount_due), 0) as outstanding,
          COALESCE(SUM(amount_due) FILTER (WHERE status = 'overdue'), 0) as overdue
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
