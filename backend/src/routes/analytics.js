import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Helper to get date filter SQL clause
function getDateFilter(timePeriod, dateColumn = 'date') {
  switch (timePeriod) {
    case 'last_week':
      return { clause: `${dateColumn} >= CURRENT_DATE - INTERVAL '7 days'`, label: 'Last 7 Days' };
    case 'last_month':
      return { clause: `${dateColumn} >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') AND ${dateColumn} < DATE_TRUNC('month', CURRENT_DATE)`, label: 'Last Month' };
    case 'last_quarter':
      return { clause: `${dateColumn} >= DATE_TRUNC('quarter', CURRENT_DATE - INTERVAL '3 months') AND ${dateColumn} < DATE_TRUNC('quarter', CURRENT_DATE)`, label: 'Last Quarter' };
    case 'last_year':
      return { clause: `${dateColumn} >= DATE_TRUNC('year', CURRENT_DATE - INTERVAL '1 year') AND ${dateColumn} < DATE_TRUNC('year', CURRENT_DATE)`, label: 'Last Year' };
    case 'year_to_date':
      return { clause: `${dateColumn} >= DATE_TRUNC('year', CURRENT_DATE)`, label: 'Year to Date' };
    case 'all_time':
      return { clause: '1=1', label: 'All Time' };
    case 'this_month':
    case 'current_month':
    default:
      return { clause: `${dateColumn} >= DATE_TRUNC('month', CURRENT_DATE)`, label: 'Current Month' };
  }
}

/**
 * Individual Attorney Dashboard Analytics
 * 
 * GET /api/v1/analytics/my-dashboard
 * 
 * Returns personalized analytics for individual attorneys including:
 * - Personal billable hours and revenue (current period and trends)
 * - Monthly targets and progress
 * - Matter workload distribution
 * - Productivity metrics
 * - Comparison to firm averages
 * 
 * This is the Clio-style individual dashboard analytics endpoint.
 */
router.get('/my-dashboard', authenticate, async (req, res) => {
  try {
    const { time_period = 'current_month' } = req.query;
    const userId = req.user.id;
    const firmId = req.user.firmId;
    const { clause: dateFilter, label: periodLabel } = getDateFilter(time_period);

    // Execute all queries in parallel for performance
    const [
      // Personal time entries for current period
      myTimeStats,
      // Monthly trend for last 12 months
      myMonthlyTrend,
      // My matters workload
      myMattersWorkload,
      // Daily activity for current month
      myDailyActivity,
      // Comparison to firm average
      firmAverages,
      // My top clients by hours
      myTopClients,
      // Unbilled time summary
      myUnbilled,
      // My productivity targets (based on role/settings)
      userInfo
    ] = await Promise.all([
      // Personal time entries for current period
      query(`
        SELECT 
          COALESCE(SUM(hours), 0) as total_hours,
          COALESCE(SUM(hours) FILTER (WHERE billable = true), 0) as billable_hours,
          COALESCE(SUM(amount), 0) as total_amount,
          COALESCE(SUM(amount) FILTER (WHERE billable = true), 0) as billable_amount,
          COALESCE(SUM(amount) FILTER (WHERE billed = true), 0) as billed_amount,
          COALESCE(SUM(amount) FILTER (WHERE billable = true AND billed = false), 0) as unbilled_amount,
          COUNT(*) as entry_count,
          COUNT(*) FILTER (WHERE billable = true) as billable_entry_count,
          COALESCE(AVG(hours), 0) as avg_hours_per_entry,
          COALESCE(AVG(amount) FILTER (WHERE billable = true), 0) as avg_billable_amount,
          COALESCE(MAX(date), CURRENT_DATE) as last_entry_date,
          COUNT(DISTINCT date) as days_with_entries
        FROM time_entries 
        WHERE firm_id = $1 AND user_id = $2 AND ${dateFilter}
      `, [firmId, userId]),

      // Monthly trend for last 12 months
      query(`
        SELECT 
          DATE_TRUNC('month', date) as month,
          COALESCE(SUM(hours), 0) as total_hours,
          COALESCE(SUM(hours) FILTER (WHERE billable = true), 0) as billable_hours,
          COALESCE(SUM(amount), 0) as total_amount,
          COALESCE(SUM(amount) FILTER (WHERE billable = true), 0) as billable_amount,
          COUNT(*) as entry_count
        FROM time_entries
        WHERE firm_id = $1 AND user_id = $2 AND date >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', date)
        ORDER BY month DESC
      `, [firmId, userId]),

      // My matters workload
      query(`
        SELECT 
          m.id, m.name, m.number, m.status, m.type,
          c.display_name as client_name,
          COALESCE(SUM(te.hours), 0) as total_hours,
          COALESCE(SUM(te.amount), 0) as total_amount,
          COUNT(te.id) as entry_count,
          MAX(te.date) as last_activity
        FROM matters m
        LEFT JOIN clients c ON m.client_id = c.id
        LEFT JOIN time_entries te ON te.matter_id = m.id AND te.user_id = $2 AND te.${dateFilter.replace(/date/g, 'te.date')}
        WHERE m.firm_id = $1 AND (
          m.responsible_attorney = $2
          OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $2)
        )
        GROUP BY m.id, m.name, m.number, m.status, m.type, c.display_name
        ORDER BY total_hours DESC
        LIMIT 20
      `, [firmId, userId]),

      // Daily activity for current month
      query(`
        SELECT 
          date,
          COALESCE(SUM(hours), 0) as hours,
          COALESCE(SUM(amount), 0) as amount,
          COUNT(*) as entries
        FROM time_entries
        WHERE firm_id = $1 AND user_id = $2 AND date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY date
        ORDER BY date
      `, [firmId, userId]),

      // Firm averages for comparison
      query(`
        WITH user_totals AS (
          SELECT 
            user_id,
            COALESCE(SUM(hours), 0) as total_hours,
            COALESCE(SUM(hours) FILTER (WHERE billable = true), 0) as billable_hours,
            COALESCE(SUM(amount), 0) as total_amount
          FROM time_entries
          WHERE firm_id = $1 AND ${dateFilter}
          GROUP BY user_id
        )
        SELECT 
          COALESCE(AVG(total_hours), 0) as avg_hours,
          COALESCE(AVG(billable_hours), 0) as avg_billable_hours,
          COALESCE(AVG(total_amount), 0) as avg_amount,
          COALESCE(MAX(total_hours), 0) as max_hours,
          COUNT(DISTINCT user_id) as user_count
        FROM user_totals
      `, [firmId]),

      // Top clients by hours
      query(`
        SELECT 
          c.id, c.display_name as name,
          COALESCE(SUM(te.hours), 0) as total_hours,
          COALESCE(SUM(te.amount), 0) as total_amount,
          COUNT(DISTINCT m.id) as matter_count
        FROM clients c
        LEFT JOIN matters m ON m.client_id = c.id
        LEFT JOIN time_entries te ON te.matter_id = m.id AND te.user_id = $2 AND te.${dateFilter.replace(/date/g, 'te.date')}
        WHERE c.firm_id = $1
        GROUP BY c.id, c.display_name
        HAVING COALESCE(SUM(te.hours), 0) > 0
        ORDER BY total_hours DESC
        LIMIT 10
      `, [firmId, userId]),

      // Unbilled summary
      query(`
        SELECT 
          COALESCE(SUM(hours), 0) as unbilled_hours,
          COALESCE(SUM(amount), 0) as unbilled_amount,
          COUNT(*) as unbilled_entries,
          MIN(date) as oldest_unbilled_date
        FROM time_entries
        WHERE firm_id = $1 AND user_id = $2 AND billable = true AND billed = false
      `, [firmId, userId]),

      // User info for targets
      query(`
        SELECT hourly_rate, role FROM users WHERE id = $1
      `, [userId])
    ]);

    const stats = myTimeStats.rows[0];
    const firmAvg = firmAverages.rows[0];
    const user = userInfo.rows[0] || { hourly_rate: 350, role: 'staff' };
    const unbilled = myUnbilled.rows[0];

    // Calculate targets (based on industry standards)
    // Target: 1800-2000 billable hours/year = 150-167 hours/month
    const monthlyTarget = 160; // hours
    const dailyTarget = 8; // hours
    
    // Calculate utilization rate
    const totalHours = parseFloat(stats.total_hours) || 0;
    const billableHours = parseFloat(stats.billable_hours) || 0;
    const utilizationRate = totalHours > 0 ? (billableHours / totalHours * 100) : 0;
    
    // Calculate realization rate (what % of billable time gets collected)
    const billableAmount = parseFloat(stats.billable_amount) || 0;
    const billedAmount = parseFloat(stats.billed_amount) || 0;
    const realizationRate = billableAmount > 0 ? (billedAmount / billableAmount * 100) : 0;

    // Effective hourly rate (actual collected / hours)
    const effectiveRate = billableHours > 0 ? (billedAmount / billableHours) : 0;

    // Progress toward monthly target
    const monthProgress = (billableHours / monthlyTarget) * 100;

    // Comparison to firm average
    const vsAvgHours = parseFloat(firmAvg.avg_billable_hours) > 0 
      ? ((billableHours - parseFloat(firmAvg.avg_billable_hours)) / parseFloat(firmAvg.avg_billable_hours) * 100) 
      : 0;

    res.json({
      success: true,
      data: {
        period: {
          type: time_period,
          label: periodLabel,
          generated_at: new Date().toISOString()
        },

        summary: {
          total_hours: totalHours,
          billable_hours: billableHours,
          non_billable_hours: totalHours - billableHours,
          total_amount: parseFloat(stats.total_amount),
          billable_amount: billableAmount,
          billed_amount: billedAmount,
          unbilled_amount: parseFloat(stats.unbilled_amount),
          entry_count: parseInt(stats.entry_count),
          days_with_entries: parseInt(stats.days_with_entries),
          avg_hours_per_entry: parseFloat(stats.avg_hours_per_entry),
          last_entry_date: stats.last_entry_date
        },

        productivity: {
          utilization_rate: Math.round(utilizationRate * 10) / 10,
          realization_rate: Math.round(realizationRate * 10) / 10,
          effective_hourly_rate: Math.round(effectiveRate),
          standard_rate: parseFloat(user.hourly_rate) || 350,
          rate_variance: Math.round(effectiveRate - (parseFloat(user.hourly_rate) || 350))
        },

        targets: {
          monthly_target_hours: monthlyTarget,
          daily_target_hours: dailyTarget,
          current_progress_percent: Math.round(monthProgress * 10) / 10,
          hours_remaining: Math.max(0, monthlyTarget - billableHours),
          on_track: monthProgress >= 75 // Consider on track if 75%+ through month
        },

        comparison: {
          firm_avg_billable_hours: parseFloat(firmAvg.avg_billable_hours),
          firm_avg_amount: parseFloat(firmAvg.avg_amount),
          vs_avg_percent: Math.round(vsAvgHours * 10) / 10,
          rank_estimate: vsAvgHours > 20 ? 'Top Performer' : vsAvgHours > -10 ? 'Average' : 'Below Average'
        },

        unbilled: {
          hours: parseFloat(unbilled.unbilled_hours),
          amount: parseFloat(unbilled.unbilled_amount),
          entries: parseInt(unbilled.unbilled_entries),
          oldest_date: unbilled.oldest_unbilled_date
        },

        monthly_trend: myMonthlyTrend.rows.map(m => ({
          month: m.month,
          total_hours: parseFloat(m.total_hours),
          billable_hours: parseFloat(m.billable_hours),
          total_amount: parseFloat(m.total_amount),
          billable_amount: parseFloat(m.billable_amount),
          entry_count: parseInt(m.entry_count)
        })),

        daily_activity: myDailyActivity.rows.map(d => ({
          date: d.date,
          hours: parseFloat(d.hours),
          amount: parseFloat(d.amount),
          entries: parseInt(d.entries)
        })),

        matters_workload: myMattersWorkload.rows.map(m => ({
          id: m.id,
          name: m.name,
          number: m.number,
          status: m.status,
          type: m.type,
          client_name: m.client_name,
          total_hours: parseFloat(m.total_hours),
          total_amount: parseFloat(m.total_amount),
          entry_count: parseInt(m.entry_count),
          last_activity: m.last_activity
        })),

        top_clients: myTopClients.rows.map(c => ({
          id: c.id,
          name: c.name,
          total_hours: parseFloat(c.total_hours),
          total_amount: parseFloat(c.total_amount),
          matter_count: parseInt(c.matter_count)
        }))
      }
    });

  } catch (error) {
    console.error('My dashboard analytics error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to retrieve dashboard analytics',
      code: 'INTERNAL_ERROR'
    });
  }
});

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

/**
 * Comprehensive Firm Dashboard Analytics
 * 
 * GET /api/v1/analytics/firm-dashboard
 * 
 * Returns complete firm-wide analytics including:
 * - All time entries (not just current user's view)
 * - All invoices and payments
 * - All matters and clients
 * - Team productivity breakdown
 * - Revenue trends
 * 
 * This fixes the issue where firm analytics wasn't showing all data.
 */
router.get('/firm-dashboard', authenticate, requireRole('owner', 'admin', 'partner', 'billing'), async (req, res) => {
  try {
    const { time_period = 'current_month' } = req.query;
    const firmId = req.user.firmId;
    const { clause: dateFilter, label: periodLabel } = getDateFilter(time_period);

    // Get previous period for comparison
    const getPrevDateFilter = (period) => {
      switch (period) {
        case 'last_week':
          return `date >= CURRENT_DATE - INTERVAL '14 days' AND date < CURRENT_DATE - INTERVAL '7 days'`;
        case 'current_month':
        case 'this_month':
          return `date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') AND date < DATE_TRUNC('month', CURRENT_DATE)`;
        case 'last_month':
          return `date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '2 months') AND date < DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')`;
        case 'last_quarter':
          return `date >= DATE_TRUNC('quarter', CURRENT_DATE - INTERVAL '6 months') AND date < DATE_TRUNC('quarter', CURRENT_DATE - INTERVAL '3 months')`;
        case 'year_to_date':
          return `date >= DATE_TRUNC('year', CURRENT_DATE - INTERVAL '1 year') AND date < DATE_TRUNC('year', CURRENT_DATE)`;
        default:
          return `date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') AND date < DATE_TRUNC('month', CURRENT_DATE)`;
      }
    };
    const prevDateFilter = getPrevDateFilter(time_period);

    const [
      // Current period billing
      currentBilling,
      // Previous period billing for comparison
      prevBilling,
      // All-time totals
      allTimeTotals,
      // Invoice statistics
      invoiceStats,
      // Matter statistics  
      matterStats,
      // Client statistics
      clientStats,
      // Team productivity by user
      teamProductivity,
      // Revenue by month (last 12 months)
      monthlyRevenue,
      // Revenue by practice area
      revenueByType,
      // Top performing matters
      topMatters,
      // Top clients
      topClients,
      // Collection aging
      collectionAging
    ] = await Promise.all([
      // Current period billing - ALL firm time entries
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
          COUNT(DISTINCT user_id) as active_billers,
          COUNT(DISTINCT matter_id) as active_matters
        FROM time_entries 
        WHERE firm_id = $1 AND ${dateFilter}
      `, [firmId]),

      // Previous period for comparison
      query(`
        SELECT 
          COALESCE(SUM(hours), 0) as total_hours,
          COALESCE(SUM(amount), 0) as total_amount,
          COALESCE(SUM(hours) FILTER (WHERE billable = true), 0) as billable_hours,
          COALESCE(SUM(amount) FILTER (WHERE billable = true), 0) as billable_amount
        FROM time_entries 
        WHERE firm_id = $1 AND ${prevDateFilter}
      `, [firmId]),

      // All-time totals
      query(`
        SELECT 
          COALESCE(SUM(hours), 0) as total_hours,
          COALESCE(SUM(amount), 0) as total_amount,
          COALESCE(SUM(hours) FILTER (WHERE billable = true), 0) as billable_hours,
          COALESCE(SUM(amount) FILTER (WHERE billable = true), 0) as billable_amount,
          MIN(date) as first_entry_date,
          MAX(date) as last_entry_date
        FROM time_entries 
        WHERE firm_id = $1
      `, [firmId]),

      // Invoice statistics - ALL firm invoices
      query(`
        SELECT 
          COUNT(*) as total_invoices,
          COALESCE(SUM(subtotal_fees), 0) as total_invoiced,
          COALESCE(SUM(amount_paid), 0) as total_collected,
          COALESCE(SUM(subtotal_fees - amount_paid) FILTER (WHERE status != 'paid'), 0) as total_outstanding,
          COALESCE(SUM(subtotal_fees - amount_paid) FILTER (WHERE status = 'overdue'), 0) as total_overdue,
          COUNT(*) FILTER (WHERE status = 'draft') as draft_count,
          COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
          COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
          COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count,
          COUNT(*) FILTER (WHERE status = 'partial') as partial_count,
          COALESCE(AVG(subtotal_fees), 0) as avg_invoice_amount,
          COALESCE(AVG(EXTRACT(DAY FROM (CASE WHEN status = 'paid' THEN updated_at ELSE NOW() END) - issue_date)), 0) as avg_days_to_pay
        FROM invoices WHERE firm_id = $1
      `, [firmId]),

      // Matter statistics - ALL matters
      query(`
        SELECT 
          COUNT(*) as total_matters,
          COUNT(*) FILTER (WHERE status = 'active') as active_matters,
          COUNT(*) FILTER (WHERE status = 'pending') as pending_matters,
          COUNT(*) FILTER (WHERE status = 'closed') as closed_matters,
          COUNT(*) FILTER (WHERE status = 'on_hold') as on_hold_matters,
          COUNT(*) FILTER (WHERE priority = 'urgent') as urgent_matters,
          COUNT(*) FILTER (WHERE priority = 'high') as high_priority_matters,
          COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)) as new_this_month,
          COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('year', CURRENT_DATE)) as new_this_year
        FROM matters WHERE firm_id = $1
      `, [firmId]),

      // Client statistics - ALL clients
      query(`
        SELECT 
          COUNT(*) as total_clients,
          COUNT(*) FILTER (WHERE is_active = true) as active_clients,
          COUNT(*) FILTER (WHERE type = 'person') as individual_clients,
          COUNT(*) FILTER (WHERE type = 'company') as company_clients,
          COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)) as new_this_month
        FROM clients WHERE firm_id = $1
      `, [firmId]),

      // Team productivity - ALL team members
      query(`
        SELECT 
          u.id, u.first_name, u.last_name, u.role, u.hourly_rate,
          COALESCE(SUM(te.hours), 0) as total_hours,
          COALESCE(SUM(te.hours) FILTER (WHERE te.billable = true), 0) as billable_hours,
          COALESCE(SUM(te.amount), 0) as total_amount,
          COALESCE(SUM(te.amount) FILTER (WHERE te.billable = true), 0) as billable_amount,
          COUNT(te.id) as entry_count,
          COUNT(DISTINCT te.matter_id) as matter_count,
          MAX(te.date) as last_activity
        FROM users u
        LEFT JOIN time_entries te ON te.user_id = u.id AND te.firm_id = $1 AND te.${dateFilter.replace(/date/g, 'te.date')}
        WHERE u.firm_id = $1 AND u.is_active = true
        GROUP BY u.id, u.first_name, u.last_name, u.role, u.hourly_rate
        ORDER BY billable_hours DESC
      `, [firmId]),

      // Monthly revenue trend (12 months)
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
        ORDER BY month
      `, [firmId]),

      // Revenue by practice area/type
      query(`
        SELECT 
          COALESCE(m.type, 'unassigned') as matter_type,
          COALESCE(SUM(te.hours), 0) as total_hours,
          COALESCE(SUM(te.amount), 0) as total_amount,
          COUNT(DISTINCT m.id) as matter_count
        FROM time_entries te
        LEFT JOIN matters m ON te.matter_id = m.id
        WHERE te.firm_id = $1 AND te.${dateFilter.replace(/date/g, 'te.date')}
        GROUP BY COALESCE(m.type, 'unassigned')
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
        LIMIT 15
      `, [firmId]),

      // Top clients by revenue
      query(`
        SELECT 
          c.id, c.display_name, c.type,
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
        LIMIT 15
      `, [firmId]),

      // Collection aging (outstanding invoices by age)
      query(`
        SELECT 
          CASE 
            WHEN due_date >= CURRENT_DATE THEN 'current'
            WHEN due_date >= CURRENT_DATE - INTERVAL '30 days' THEN '1-30_days'
            WHEN due_date >= CURRENT_DATE - INTERVAL '60 days' THEN '31-60_days'
            WHEN due_date >= CURRENT_DATE - INTERVAL '90 days' THEN '61-90_days'
            ELSE 'over_90_days'
          END as age_bucket,
          COUNT(*) as invoice_count,
          COALESCE(SUM(subtotal_fees - amount_paid), 0) as outstanding_amount
        FROM invoices
        WHERE firm_id = $1 AND status IN ('sent', 'overdue', 'partial')
        GROUP BY age_bucket
        ORDER BY 
          CASE age_bucket
            WHEN 'current' THEN 1
            WHEN '1-30_days' THEN 2
            WHEN '31-60_days' THEN 3
            WHEN '61-90_days' THEN 4
            ELSE 5
          END
      `, [firmId])
    ]);

    const current = currentBilling.rows[0];
    const prev = prevBilling.rows[0];
    const allTime = allTimeTotals.rows[0];
    const invoices = invoiceStats.rows[0];
    const matters = matterStats.rows[0];
    const clients = clientStats.rows[0];

    // Calculate changes vs previous period
    const calcChange = (curr, prev) => {
      if (!prev || prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev * 100);
    };

    const hoursChange = calcChange(parseFloat(current.billable_hours), parseFloat(prev.billable_hours));
    const revenueChange = calcChange(parseFloat(current.billable_amount), parseFloat(prev.billable_amount));

    // Calculate utilization (billable / total hours)
    const totalHours = parseFloat(current.total_hours) || 0;
    const billableHours = parseFloat(current.billable_hours) || 0;
    const utilizationRate = totalHours > 0 ? (billableHours / totalHours * 100) : 0;

    // Collection rate
    const totalInvoiced = parseFloat(invoices.total_invoiced) || 0;
    const totalCollected = parseFloat(invoices.total_collected) || 0;
    const collectionRate = totalInvoiced > 0 ? (totalCollected / totalInvoiced * 100) : 0;

    res.json({
      success: true,
      data: {
        period: {
          type: time_period,
          label: periodLabel,
          generated_at: new Date().toISOString()
        },

        summary: {
          total_hours: totalHours,
          billable_hours: billableHours,
          total_amount: parseFloat(current.total_amount),
          billable_amount: parseFloat(current.billable_amount),
          billed_amount: parseFloat(current.billed_amount),
          unbilled_hours: parseFloat(current.unbilled_hours),
          unbilled_amount: parseFloat(current.unbilled_amount),
          entry_count: parseInt(current.total_entries),
          active_billers: parseInt(current.active_billers),
          active_matters: parseInt(current.active_matters)
        },

        changes: {
          hours_change_percent: Math.round(hoursChange * 10) / 10,
          revenue_change_percent: Math.round(revenueChange * 10) / 10,
          hours_trend: hoursChange >= 0 ? 'up' : 'down',
          revenue_trend: revenueChange >= 0 ? 'up' : 'down'
        },

        all_time: {
          total_hours: parseFloat(allTime.total_hours),
          total_amount: parseFloat(allTime.total_amount),
          billable_hours: parseFloat(allTime.billable_hours),
          billable_amount: parseFloat(allTime.billable_amount),
          first_entry_date: allTime.first_entry_date,
          last_entry_date: allTime.last_entry_date
        },

        productivity: {
          utilization_rate: Math.round(utilizationRate * 10) / 10,
          avg_hours_per_day: billableHours / (parseInt(current.active_billers) || 1) / 22, // Rough estimate
          avg_entry_amount: parseFloat(current.total_entries) > 0 
            ? parseFloat(current.total_amount) / parseFloat(current.total_entries) 
            : 0
        },

        invoices: {
          total: parseInt(invoices.total_invoices),
          total_invoiced: totalInvoiced,
          total_collected: totalCollected,
          total_outstanding: parseFloat(invoices.total_outstanding),
          total_overdue: parseFloat(invoices.total_overdue),
          collection_rate: Math.round(collectionRate * 10) / 10,
          avg_invoice_amount: parseFloat(invoices.avg_invoice_amount),
          avg_days_to_pay: Math.round(parseFloat(invoices.avg_days_to_pay)),
          by_status: {
            draft: parseInt(invoices.draft_count),
            sent: parseInt(invoices.sent_count),
            paid: parseInt(invoices.paid_count),
            overdue: parseInt(invoices.overdue_count),
            partial: parseInt(invoices.partial_count)
          }
        },

        collection_aging: collectionAging.rows.map(a => ({
          bucket: a.age_bucket,
          invoice_count: parseInt(a.invoice_count),
          outstanding_amount: parseFloat(a.outstanding_amount)
        })),

        matters: {
          total: parseInt(matters.total_matters),
          active: parseInt(matters.active_matters),
          pending: parseInt(matters.pending_matters),
          closed: parseInt(matters.closed_matters),
          on_hold: parseInt(matters.on_hold_matters),
          urgent: parseInt(matters.urgent_matters),
          high_priority: parseInt(matters.high_priority_matters),
          new_this_month: parseInt(matters.new_this_month),
          new_this_year: parseInt(matters.new_this_year)
        },

        clients: {
          total: parseInt(clients.total_clients),
          active: parseInt(clients.active_clients),
          individuals: parseInt(clients.individual_clients),
          companies: parseInt(clients.company_clients),
          new_this_month: parseInt(clients.new_this_month)
        },

        team_productivity: teamProductivity.rows.map(u => ({
          id: u.id,
          name: `${u.first_name} ${u.last_name}`,
          role: u.role,
          hourly_rate: parseFloat(u.hourly_rate),
          total_hours: parseFloat(u.total_hours),
          billable_hours: parseFloat(u.billable_hours),
          utilization_rate: parseFloat(u.total_hours) > 0 
            ? (parseFloat(u.billable_hours) / parseFloat(u.total_hours) * 100) 
            : 0,
          total_amount: parseFloat(u.total_amount),
          billable_amount: parseFloat(u.billable_amount),
          entry_count: parseInt(u.entry_count),
          matter_count: parseInt(u.matter_count),
          last_activity: u.last_activity
        })),

        monthly_trend: monthlyRevenue.rows.map(m => ({
          month: m.month,
          total_hours: parseFloat(m.total_hours),
          billable_hours: parseFloat(m.billable_hours),
          total_amount: parseFloat(m.total_amount),
          billable_amount: parseFloat(m.billable_amount),
          active_users: parseInt(m.active_users),
          entry_count: parseInt(m.entry_count)
        })),

        revenue_by_practice_area: revenueByType.rows.map(r => ({
          type: r.matter_type,
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
          name: c.display_name,
          type: c.type,
          matter_count: parseInt(c.matter_count),
          total_hours: parseFloat(c.total_hours),
          total_amount: parseFloat(c.total_amount)
        }))
      }
    });

  } catch (error) {
    console.error('Firm dashboard analytics error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to retrieve firm dashboard analytics',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * Quick Stats for Widgets
 * 
 * GET /api/v1/analytics/quick-stats
 * 
 * Lightweight endpoint for dashboard widgets that need quick stats.
 */
router.get('/quick-stats', authenticate, async (req, res) => {
  try {
    const firmId = req.user.firmId;
    const userId = req.user.id;
    const isAdmin = ['owner', 'admin', 'partner', 'billing'].includes(req.user.role);

    // Personal stats for everyone, firm stats for admins
    const [personalStats, firmStats] = await Promise.all([
      // Personal MTD stats
      query(`
        SELECT 
          COALESCE(SUM(hours) FILTER (WHERE billable = true), 0) as mtd_billable_hours,
          COALESCE(SUM(amount) FILTER (WHERE billable = true), 0) as mtd_billable_amount,
          COALESCE(SUM(amount) FILTER (WHERE billable = true AND billed = false), 0) as unbilled_amount,
          COUNT(*) as mtd_entries
        FROM time_entries 
        WHERE firm_id = $1 AND user_id = $2 AND date >= DATE_TRUNC('month', CURRENT_DATE)
      `, [firmId, userId]),

      // Firm-wide stats (only for admins)
      isAdmin ? query(`
        SELECT 
          COALESCE(SUM(hours) FILTER (WHERE billable = true), 0) as firm_mtd_hours,
          COALESCE(SUM(amount) FILTER (WHERE billable = true), 0) as firm_mtd_amount,
          (SELECT COUNT(*) FROM matters WHERE firm_id = $1 AND status = 'active') as active_matters,
          (SELECT COUNT(*) FROM clients WHERE firm_id = $1 AND is_active = true) as active_clients,
          (SELECT COALESCE(SUM(subtotal_fees - amount_paid), 0) FROM invoices WHERE firm_id = $1 AND status IN ('sent', 'overdue')) as outstanding_invoices
        FROM time_entries 
        WHERE firm_id = $1 AND date >= DATE_TRUNC('month', CURRENT_DATE)
      `, [firmId]) : null
    ]);

    const personal = personalStats.rows[0];
    const firm = firmStats?.rows[0];

    res.json({
      success: true,
      data: {
        personal: {
          mtd_billable_hours: parseFloat(personal.mtd_billable_hours),
          mtd_billable_amount: parseFloat(personal.mtd_billable_amount),
          unbilled_amount: parseFloat(personal.unbilled_amount),
          mtd_entries: parseInt(personal.mtd_entries)
        },
        firm: firm ? {
          mtd_hours: parseFloat(firm.firm_mtd_hours),
          mtd_amount: parseFloat(firm.firm_mtd_amount),
          active_matters: parseInt(firm.active_matters),
          active_clients: parseInt(firm.active_clients),
          outstanding_invoices: parseFloat(firm.outstanding_invoices)
        } : null,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Quick stats error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to retrieve quick stats',
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router;
