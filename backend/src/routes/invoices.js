import { Router } from 'express';
import { query, withTransaction } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { getTodayInTimezone, getCurrentYear } from '../utils/dateUtils.js';

const router = Router();

/**
 * Helper function to trigger QuickBooks payment sync
 * This queues the payment for sync to QuickBooks if connected
 */
async function triggerQuickBooksPaymentSync(firmId, paymentId) {
  try {
    // Check if QuickBooks is connected for this firm
    const integration = await query(
      `SELECT id FROM integrations WHERE firm_id = $1 AND provider = 'quickbooks' AND is_connected = true`,
      [firmId]
    );

    if (integration.rows.length === 0) {
      // QuickBooks not connected, skip silently
      console.log('QuickBooks not connected for firm, skipping payment sync');
      return;
    }

    // Add to sync queue with retry support
    await query(
      `INSERT INTO quickbooks_sync_queue (firm_id, entity_type, entity_id, action, status, next_retry_at)
       VALUES ($1, 'payment', $2, 'create', 'pending', NOW())
       ON CONFLICT DO NOTHING`,
      [firmId, paymentId]
    );

    console.log(`Payment ${paymentId} queued for QuickBooks sync`);
  } catch (error) {
    // Don't fail the payment if sync queue fails
    console.error('Failed to queue payment for QuickBooks sync:', error.message);
  }
}

// Roles that can see all firm invoices (not just their own)
const FULL_ACCESS_ROLES = ['owner', 'admin', 'billing'];

// Get invoices
router.get('/', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    const { clientId, matterId, status, view = 'my', limit = 1000000, offset = 0 } = req.query;  // No limit
    
    // Enforce role-based access: only privileged roles can view all invoices
    // Other roles are forced to 'my' view regardless of what they request
    const canViewAll = FULL_ACCESS_ROLES.includes(req.user.role);
    const effectiveView = canViewAll ? view : 'my';
    
    let sql = `
      SELECT i.*,
             c.display_name as client_name,
             m.name as matter_name,
             m.number as matter_number
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      LEFT JOIN matters m ON i.matter_id = m.id
      WHERE i.firm_id = $1
    `;
    const params = [req.user.firmId];
    let paramIndex = 2;

    // "My Invoices" filter - only show invoices user created or for their matters
    // This is enforced for non-privileged roles regardless of the view parameter
    if (effectiveView === 'my') {
      sql += ` AND (
        i.created_by = $${paramIndex}
        OR EXISTS (
          SELECT 1 FROM matters m2 
          WHERE m2.id = i.matter_id 
          AND (m2.responsible_attorney = $${paramIndex} 
               OR m2.originating_attorney = $${paramIndex}
               OR m2.created_by = $${paramIndex}
               OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m2.id AND ma.user_id = $${paramIndex}))
        )
      )`;
      params.push(req.user.id);
      paramIndex++;
    }

    if (clientId) {
      sql += ` AND i.client_id = $${paramIndex}`;
      params.push(clientId);
      paramIndex++;
    }

    if (matterId) {
      sql += ` AND i.matter_id = $${paramIndex}`;
      params.push(matterId);
      paramIndex++;
    }

    if (status) {
      sql += ` AND i.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    sql += ` ORDER BY i.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);

    res.json({
      invoices: result.rows.map(i => ({
        id: i.id,
        number: i.number,
        matterId: i.matter_id,
        matterName: i.matter_name,
        matterNumber: i.matter_number,
        clientId: i.client_id,
        clientName: i.client_name,
        status: i.status,
        issueDate: i.issue_date,
        dueDate: i.due_date,
        subtotalFees: parseFloat(i.subtotal_fees),
        subtotalExpenses: parseFloat(i.subtotal_expenses),
        subtotal: parseFloat(i.subtotal),
        taxRate: parseFloat(i.tax_rate),
        taxAmount: parseFloat(i.tax_amount),
        discountAmount: parseFloat(i.discount_amount),
        total: parseFloat(i.total),
        amountPaid: parseFloat(i.amount_paid),
        amountDue: parseFloat(i.amount_due),
        lineItems: i.line_items,
        notes: i.notes,
        createdAt: i.created_at,
        updatedAt: i.updated_at,
      })),
    });
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'Failed to get invoices' });
  }
});

// Get single invoice
router.get('/:id', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    const result = await query(
      `SELECT i.*,
              c.display_name as client_name, c.email as client_email,
              c.address_street, c.address_city, c.address_state, c.address_zip,
              m.name as matter_name, m.number as matter_number
       FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id
       LEFT JOIN matters m ON i.matter_id = m.id
       WHERE i.id = $1 AND i.firm_id = $2`,
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const i = result.rows[0];
    res.json({
      id: i.id,
      number: i.number,
      matterId: i.matter_id,
      matterName: i.matter_name,
      matterNumber: i.matter_number,
      clientId: i.client_id,
      clientName: i.client_name,
      clientEmail: i.client_email,
      clientAddress: {
        street: i.address_street,
        city: i.address_city,
        state: i.address_state,
        zip: i.address_zip,
      },
      status: i.status,
      issueDate: i.issue_date,
      dueDate: i.due_date,
      subtotalFees: parseFloat(i.subtotal_fees),
      subtotalExpenses: parseFloat(i.subtotal_expenses),
      subtotal: parseFloat(i.subtotal),
      taxRate: parseFloat(i.tax_rate),
      taxAmount: parseFloat(i.tax_amount),
      discountAmount: parseFloat(i.discount_amount),
      total: parseFloat(i.total),
      amountPaid: parseFloat(i.amount_paid),
      amountDue: parseFloat(i.amount_due),
      lineItems: i.line_items,
      notes: i.notes,
      paymentInstructions: i.payment_instructions,
      sentAt: i.sent_at,
      paidAt: i.paid_at,
      createdBy: i.created_by,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
    });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ error: 'Failed to get invoice' });
  }
});

// Create invoice
router.post('/', authenticate, requirePermission('billing:create'), async (req, res) => {
  try {
    const {
      matterId,
      clientId,
      issueDate,
      dueDate,
      lineItems = [],
      notes,
      paymentInstructions,
      taxRate = 0,
      discountAmount = 0,
    } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'Client is required' });
    }

    // Convert empty strings to null for UUID fields
    const safeMatterId = matterId && matterId.trim() !== '' ? matterId : null;

    const result = await withTransaction(async (client) => {
      // Generate invoice number
      const countResult = await client.query(
        'SELECT COUNT(*) FROM invoices WHERE firm_id = $1',
        [req.user.firmId]
      );
      const count = parseInt(countResult.rows[0].count) + 1;
      const number = `INV-${getCurrentYear()}-${String(count).padStart(4, '0')}`;

      // Calculate totals from line items
      const subtotalFees = lineItems
        .filter(li => li.type === 'fee' || li.type === 'flat_fee')
        .reduce((sum, li) => sum + (li.amount || li.quantity * li.rate), 0);
      const subtotalExpenses = lineItems
        .filter(li => li.type === 'expense')
        .reduce((sum, li) => sum + (li.amount || li.quantity * li.rate), 0);

      const invoiceResult = await client.query(
        `INSERT INTO invoices (
          firm_id, number, matter_id, client_id, status, issue_date, due_date,
          subtotal_fees, subtotal_expenses, tax_rate, discount_amount,
          line_items, notes, payment_instructions, created_by
        ) VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          req.user.firmId, number, safeMatterId, clientId, issueDate, dueDate,
          subtotalFees, subtotalExpenses, taxRate, discountAmount,
          JSON.stringify(lineItems), notes, paymentInstructions, req.user.id
        ]
      );

      return invoiceResult.rows[0];
    });

    res.status(201).json({
      id: result.id,
      number: result.number,
      matterId: result.matter_id,
      clientId: result.client_id,
      status: result.status,
      issueDate: result.issue_date,
      dueDate: result.due_date,
      subtotalFees: parseFloat(result.subtotal_fees),
      subtotalExpenses: parseFloat(result.subtotal_expenses),
      subtotal: parseFloat(result.subtotal),
      total: parseFloat(result.total),
      amountDue: parseFloat(result.amount_due),
      lineItems: result.line_items,
      createdAt: result.created_at,
    });
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// Update invoice
router.put('/:id', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const existing = await query(
      'SELECT id, status FROM invoices WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const {
      matterId,
      clientId,
      status,
      issueDate,
      dueDate,
      lineItems,
      notes,
      paymentInstructions,
      taxRate,
      discountAmount,
    } = req.body;

    // Recalculate totals if line items changed
    let subtotalFees, subtotalExpenses;
    if (lineItems) {
      subtotalFees = lineItems
        .filter(li => li.type === 'fee' || li.type === 'flat_fee')
        .reduce((sum, li) => sum + (li.amount || li.quantity * li.rate), 0);
      subtotalExpenses = lineItems
        .filter(li => li.type === 'expense')
        .reduce((sum, li) => sum + (li.amount || li.quantity * li.rate), 0);
    }

    const result = await query(
      `UPDATE invoices SET
        matter_id = COALESCE($1, matter_id),
        client_id = COALESCE($2, client_id),
        status = COALESCE($3, status),
        issue_date = COALESCE($4, issue_date),
        due_date = COALESCE($5, due_date),
        subtotal_fees = COALESCE($6, subtotal_fees),
        subtotal_expenses = COALESCE($7, subtotal_expenses),
        tax_rate = COALESCE($8, tax_rate),
        discount_amount = COALESCE($9, discount_amount),
        line_items = COALESCE($10, line_items),
        notes = COALESCE($11, notes),
        payment_instructions = COALESCE($12, payment_instructions),
        sent_at = CASE WHEN $3 = 'sent' AND sent_at IS NULL THEN NOW() ELSE sent_at END,
        paid_at = CASE WHEN $3 = 'paid' AND paid_at IS NULL THEN NOW() ELSE paid_at END
      WHERE id = $13
      RETURNING *`,
      [
        matterId, clientId, status, issueDate, dueDate,
        subtotalFees, subtotalExpenses, taxRate, discountAmount,
        lineItems ? JSON.stringify(lineItems) : null, notes, paymentInstructions,
        req.params.id
      ]
    );

    const i = result.rows[0];
    res.json({
      id: i.id,
      number: i.number,
      status: i.status,
      total: parseFloat(i.total),
      amountDue: parseFloat(i.amount_due),
      updatedAt: i.updated_at,
    });
  } catch (error) {
    console.error('Update invoice error:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// Record payment
router.post('/:id/payments', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const { amount, paymentMethod, reference, paymentDate, notes, syncToQuickBooks = true } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid payment amount required' });
    }

    const invoiceResult = await query(
      'SELECT * FROM invoices WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];
    let paymentId = null;

    await withTransaction(async (client) => {
      // Record payment and get the ID
      const paymentResult = await client.query(
        `INSERT INTO payments (
          firm_id, invoice_id, client_id, amount, payment_method,
          reference, payment_date, notes, created_by, sync_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
        RETURNING id`,
        [
          req.user.firmId, invoice.id, invoice.client_id, amount,
          paymentMethod, reference, paymentDate || getTodayInTimezone(), notes, req.user.id
        ]
      );
      paymentId = paymentResult.rows[0].id;

      // Update invoice
      const newAmountPaid = parseFloat(invoice.amount_paid) + amount;
      const newAmountDue = parseFloat(invoice.total) - newAmountPaid;
      const newStatus = newAmountDue <= 0 ? 'paid' : 'partial';

      await client.query(
        `UPDATE invoices SET 
          amount_paid = $1, 
          status = $2,
          paid_at = CASE WHEN $2 = 'paid' THEN NOW() ELSE paid_at END
        WHERE id = $3`,
        [newAmountPaid, newStatus, invoice.id]
      );
    });

    // Trigger QuickBooks sync asynchronously (don't block the response)
    if (syncToQuickBooks && paymentId) {
      triggerQuickBooksPaymentSync(req.user.firmId, paymentId).catch(err => {
        console.error('QuickBooks sync trigger failed:', err.message);
      });
    }

    res.json({ 
      message: 'Payment recorded successfully',
      paymentId,
      quickBooksSyncQueued: syncToQuickBooks
    });
  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// Delete invoice (only drafts)
router.delete('/:id', authenticate, requirePermission('billing:delete'), async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM invoices WHERE id = $1 AND firm_id = $2 AND status = 'draft' RETURNING id`,
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found or cannot be deleted' });
    }

    res.json({ message: 'Invoice deleted' });
  } catch (error) {
    console.error('Delete invoice error:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

export default router;
