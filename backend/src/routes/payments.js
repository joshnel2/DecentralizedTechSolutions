/**
 * Payments Routes
 * 
 * Handles recording and managing payments in Apex
 * ALL payments sync to QuickBooks automatically (if connected)
 * 
 * This is similar to Clio Manage's payment recording but BETTER:
 * - Auto-sync to QuickBooks with retry logic
 * - Record payments with or without invoices
 * - Track sync status
 * - View payment history
 */

import { Router } from 'express';
import { query, withTransaction } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { getTodayInTimezone } from '../utils/dateUtils.js';

const router = Router();

// Roles that can see all firm payments (not just their own)
const FULL_ACCESS_ROLES = ['owner', 'admin', 'billing'];

/**
 * Helper function to trigger QuickBooks payment sync
 */
async function triggerQuickBooksPaymentSync(firmId, paymentId) {
  try {
    // Check if QuickBooks is connected for this firm
    const integration = await query(
      `SELECT id FROM integrations WHERE firm_id = $1 AND provider = 'quickbooks' AND is_connected = true`,
      [firmId]
    );

    if (integration.rows.length === 0) {
      console.log('[Payment→QB] QuickBooks not connected, skipping sync');
      return { queued: false, reason: 'quickbooks_not_connected' };
    }

    // Add to sync queue with retry support
    await query(
      `INSERT INTO quickbooks_sync_queue (firm_id, entity_type, entity_id, action, status, next_retry_at)
       VALUES ($1, 'payment', $2, 'create', 'pending', NOW())
       ON CONFLICT DO NOTHING`,
      [firmId, paymentId]
    );

    console.log(`[Payment→QB] Payment ${paymentId} queued for QuickBooks sync`);
    return { queued: true };
  } catch (error) {
    console.error('[Payment→QB] Failed to queue sync:', error.message);
    return { queued: false, reason: error.message };
  }
}

/**
 * GET /api/payments
 * Get all payments with filters
 */
router.get('/', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    const { 
      clientId, 
      matterId, 
      invoiceId, 
      startDate, 
      endDate, 
      syncStatus,
      view = 'my',
      limit = 100, 
      offset = 0 
    } = req.query;

    // Enforce role-based access
    const canViewAll = FULL_ACCESS_ROLES.includes(req.user.role);
    const effectiveView = canViewAll ? view : 'my';

    let sql = `
      SELECT 
        p.*,
        c.display_name as client_name,
        i.number as invoice_number,
        i.total as invoice_total,
        m.name as matter_name,
        m.number as matter_number,
        u.first_name || ' ' || u.last_name as created_by_name
      FROM payments p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN invoices i ON p.invoice_id = i.id
      LEFT JOIN matters m ON i.matter_id = m.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.firm_id = $1
    `;
    const params = [req.user.firmId];
    let paramIndex = 2;

    // Filter by user if not full access
    if (effectiveView === 'my') {
      sql += ` AND p.created_by = $${paramIndex}`;
      params.push(req.user.id);
      paramIndex++;
    }

    if (clientId) {
      sql += ` AND p.client_id = $${paramIndex}`;
      params.push(clientId);
      paramIndex++;
    }

    if (matterId) {
      sql += ` AND i.matter_id = $${paramIndex}`;
      params.push(matterId);
      paramIndex++;
    }

    if (invoiceId) {
      sql += ` AND p.invoice_id = $${paramIndex}`;
      params.push(invoiceId);
      paramIndex++;
    }

    if (startDate) {
      sql += ` AND p.payment_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      sql += ` AND p.payment_date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (syncStatus) {
      sql += ` AND p.sync_status = $${paramIndex}`;
      params.push(syncStatus);
      paramIndex++;
    }

    sql += ` ORDER BY p.payment_date DESC, p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);

    // Get totals
    let totalSql = `
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM payments p
      WHERE p.firm_id = $1
    `;
    const totalParams = [req.user.firmId];
    
    if (effectiveView === 'my') {
      totalSql += ` AND p.created_by = $2`;
      totalParams.push(req.user.id);
    }

    const totalResult = await query(totalSql, totalParams);

    res.json({
      payments: result.rows.map(p => ({
        id: p.id,
        clientId: p.client_id,
        clientName: p.client_name,
        invoiceId: p.invoice_id,
        invoiceNumber: p.invoice_number,
        invoiceTotal: p.invoice_total ? parseFloat(p.invoice_total) : null,
        matterName: p.matter_name,
        matterNumber: p.matter_number,
        amount: parseFloat(p.amount),
        paymentMethod: p.payment_method,
        reference: p.reference,
        paymentDate: p.payment_date,
        notes: p.notes,
        processorId: p.processor_id,
        syncStatus: p.sync_status || 'not_synced',
        syncError: p.sync_error,
        syncedAt: p.synced_at,
        externalId: p.external_id,
        externalSource: p.external_source,
        createdBy: p.created_by,
        createdByName: p.created_by_name,
        createdAt: p.created_at
      })),
      total: parseInt(totalResult.rows[0]?.total_count || 0),
      totalAmount: parseFloat(totalResult.rows[0]?.total_amount || 0),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: 'Failed to get payments' });
  }
});

/**
 * GET /api/payments/:id
 * Get single payment details
 */
router.get('/:id', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        p.*,
        c.display_name as client_name,
        c.email as client_email,
        i.number as invoice_number,
        i.total as invoice_total,
        m.name as matter_name,
        m.number as matter_number,
        u.first_name || ' ' || u.last_name as created_by_name
      FROM payments p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN invoices i ON p.invoice_id = i.id
      LEFT JOIN matters m ON i.matter_id = m.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = $1 AND p.firm_id = $2`,
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const p = result.rows[0];
    res.json({
      id: p.id,
      clientId: p.client_id,
      clientName: p.client_name,
      clientEmail: p.client_email,
      invoiceId: p.invoice_id,
      invoiceNumber: p.invoice_number,
      invoiceTotal: p.invoice_total ? parseFloat(p.invoice_total) : null,
      matterName: p.matter_name,
      matterNumber: p.matter_number,
      amount: parseFloat(p.amount),
      paymentMethod: p.payment_method,
      reference: p.reference,
      paymentDate: p.payment_date,
      notes: p.notes,
      processorId: p.processor_id,
      syncStatus: p.sync_status || 'not_synced',
      syncError: p.sync_error,
      syncedAt: p.synced_at,
      externalId: p.external_id,
      externalSource: p.external_source,
      createdBy: p.created_by,
      createdByName: p.created_by_name,
      createdAt: p.created_at
    });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({ error: 'Failed to get payment' });
  }
});

/**
 * POST /api/payments
 * Record a new payment (with or without invoice)
 * 
 * This is the main endpoint for recording ALL payments:
 * - Manual payments (check, wire, cash, etc.)
 * - Credit card payments
 * - Trust account deposits
 * 
 * ALL payments automatically sync to QuickBooks if connected!
 */
router.post('/', authenticate, requirePermission('billing:create'), async (req, res) => {
  try {
    const { 
      clientId,
      invoiceId,
      amount, 
      paymentMethod, 
      reference, 
      paymentDate, 
      notes,
      syncToQuickBooks = true  // Default to auto-sync
    } = req.body;

    // Validate required fields
    if (!clientId) {
      return res.status(400).json({ error: 'Client is required' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid payment amount is required' });
    }

    // Verify client exists and belongs to firm
    const clientResult = await query(
      'SELECT id, display_name FROM clients WHERE id = $1 AND firm_id = $2',
      [clientId, req.user.firmId]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // If invoice provided, verify it exists and belongs to firm
    let invoice = null;
    if (invoiceId) {
      const invoiceResult = await query(
        'SELECT id, total, amount_paid, client_id FROM invoices WHERE id = $1 AND firm_id = $2',
        [invoiceId, req.user.firmId]
      );

      if (invoiceResult.rows.length === 0) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      invoice = invoiceResult.rows[0];
    }

    let paymentId = null;
    let newInvoiceStatus = null;

    await withTransaction(async (client) => {
      // Create the payment
      const paymentResult = await client.query(
        `INSERT INTO payments (
          firm_id, invoice_id, client_id, amount, payment_method,
          reference, payment_date, notes, created_by, sync_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
        RETURNING id`,
        [
          req.user.firmId, 
          invoiceId || null, 
          clientId, 
          amount,
          paymentMethod || 'other', 
          reference || null, 
          paymentDate || getTodayInTimezone(), 
          notes || null, 
          req.user.id
        ]
      );
      paymentId = paymentResult.rows[0].id;

      // If linked to invoice, update the invoice totals
      if (invoice) {
        const newAmountPaid = parseFloat(invoice.amount_paid) + amount;
        const newAmountDue = parseFloat(invoice.total) - newAmountPaid;
        newInvoiceStatus = newAmountDue <= 0 ? 'paid' : 'partial';

        await client.query(
          `UPDATE invoices SET 
            amount_paid = $1, 
            status = $2,
            paid_at = CASE WHEN $2 = 'paid' THEN NOW() ELSE paid_at END
          WHERE id = $3`,
          [newAmountPaid, newInvoiceStatus, invoiceId]
        );
      }
    });

    // Trigger QuickBooks sync (async, don't block the response)
    let syncResult = { queued: false };
    if (syncToQuickBooks && paymentId) {
      syncResult = await triggerQuickBooksPaymentSync(req.user.firmId, paymentId);
    }

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      payment: {
        id: paymentId,
        clientId,
        clientName: clientResult.rows[0].display_name,
        invoiceId: invoiceId || null,
        amount,
        paymentMethod,
        paymentDate: paymentDate || getTodayInTimezone()
      },
      invoiceUpdated: invoice ? {
        invoiceId,
        newStatus: newInvoiceStatus
      } : null,
      quickBooksSync: {
        queued: syncResult.queued,
        reason: syncResult.reason || null
      }
    });
  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

/**
 * POST /api/payments/:id/retry-sync
 * Retry syncing a failed payment to QuickBooks
 */
router.post('/:id/retry-sync', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const paymentResult = await query(
      'SELECT id, sync_status FROM payments WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Reset sync status and queue for retry
    await query(
      `UPDATE payments SET 
        sync_status = 'pending',
        sync_error = NULL,
        retry_count = COALESCE(retry_count, 0) + 1
      WHERE id = $1`,
      [req.params.id]
    );

    const syncResult = await triggerQuickBooksPaymentSync(req.user.firmId, req.params.id);

    res.json({
      success: true,
      message: syncResult.queued ? 'Payment queued for QuickBooks sync' : 'QuickBooks not connected',
      syncQueued: syncResult.queued
    });
  } catch (error) {
    console.error('Retry sync error:', error);
    res.status(500).json({ error: 'Failed to retry sync' });
  }
});

/**
 * POST /api/payments/bulk-sync
 * Sync all unsynced payments to QuickBooks
 */
router.post('/bulk-sync', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    // Check if QuickBooks is connected
    const integration = await query(
      `SELECT id FROM integrations WHERE firm_id = $1 AND provider = 'quickbooks' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(400).json({ error: 'QuickBooks is not connected' });
    }

    // Get all unsynced payments
    const unsyncedPayments = await query(
      `SELECT id FROM payments 
       WHERE firm_id = $1 
       AND (sync_status IS NULL OR sync_status IN ('pending', 'failed', 'pending_retry'))
       AND external_id IS NULL`,
      [req.user.firmId]
    );

    let queuedCount = 0;
    for (const payment of unsyncedPayments.rows) {
      await query(
        `INSERT INTO quickbooks_sync_queue (firm_id, entity_type, entity_id, action, status, next_retry_at)
         VALUES ($1, 'payment', $2, 'create', 'pending', NOW())
         ON CONFLICT DO NOTHING`,
        [req.user.firmId, payment.id]
      );
      queuedCount++;
    }

    res.json({
      success: true,
      message: `${queuedCount} payments queued for QuickBooks sync`,
      queuedCount
    });
  } catch (error) {
    console.error('Bulk sync error:', error);
    res.status(500).json({ error: 'Failed to queue payments for sync' });
  }
});

/**
 * GET /api/payments/sync-status
 * Get QuickBooks sync status summary
 */
router.get('/sync/status', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        sync_status,
        COUNT(*) as count,
        SUM(amount) as total_amount
       FROM payments
       WHERE firm_id = $1
       GROUP BY sync_status`,
      [req.user.firmId]
    );

    // Check if QuickBooks is connected
    const integration = await query(
      `SELECT id, last_sync_at FROM integrations 
       WHERE firm_id = $1 AND provider = 'quickbooks' AND is_connected = true`,
      [req.user.firmId]
    );

    const statusMap = {};
    result.rows.forEach(row => {
      statusMap[row.sync_status || 'not_synced'] = {
        count: parseInt(row.count),
        totalAmount: parseFloat(row.total_amount)
      };
    });

    res.json({
      quickBooksConnected: integration.rows.length > 0,
      lastSync: integration.rows[0]?.last_sync_at || null,
      syncStatus: statusMap,
      pendingCount: (statusMap.pending?.count || 0) + (statusMap.pending_retry?.count || 0),
      syncedCount: statusMap.synced?.count || 0,
      failedCount: statusMap.failed?.count || 0
    });
  } catch (error) {
    console.error('Get sync status error:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

/**
 * DELETE /api/payments/:id
 * Delete a payment (also removes from QuickBooks if synced)
 */
router.delete('/:id', authenticate, requirePermission('billing:delete'), async (req, res) => {
  try {
    const paymentResult = await query(
      'SELECT * FROM payments WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    await withTransaction(async (client) => {
      // If linked to invoice, reverse the payment amount
      if (payment.invoice_id) {
        const invoiceResult = await client.query(
          'SELECT total, amount_paid FROM invoices WHERE id = $1',
          [payment.invoice_id]
        );

        if (invoiceResult.rows.length > 0) {
          const invoice = invoiceResult.rows[0];
          const newAmountPaid = Math.max(0, parseFloat(invoice.amount_paid) - parseFloat(payment.amount));
          const newStatus = newAmountPaid <= 0 ? 'sent' : 'partial';

          await client.query(
            `UPDATE invoices SET 
              amount_paid = $1, 
              status = $2,
              paid_at = CASE WHEN $2 != 'paid' THEN NULL ELSE paid_at END
            WHERE id = $3`,
            [newAmountPaid, newStatus, payment.invoice_id]
          );
        }
      }

      // Delete the payment
      await client.query('DELETE FROM payments WHERE id = $1', [req.params.id]);

      // If synced to QuickBooks, queue a delete operation
      if (payment.external_id && payment.external_source === 'quickbooks') {
        await client.query(
          `INSERT INTO quickbooks_sync_queue (firm_id, entity_type, entity_id, action, status, payload)
           VALUES ($1, 'payment', $2, 'delete', 'pending', $3)`,
          [req.user.firmId, req.params.id, JSON.stringify({ quickbooks_id: payment.external_id })]
        );
      }
    });

    res.json({ 
      success: true, 
      message: 'Payment deleted',
      invoiceUpdated: !!payment.invoice_id
    });
  } catch (error) {
    console.error('Delete payment error:', error);
    res.status(500).json({ error: 'Failed to delete payment' });
  }
});

export default router;
