import { Router } from 'express';
import { query, withTransaction } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { getTodayInTimezone, getCurrentYear } from '../utils/dateUtils.js';
import { pushPaymentToQuickBooks, pushInvoiceToQuickBooks, syncPendingToQuickBooks } from '../utils/quickbooksSync.js';
import { emitEvent } from '../services/eventBus.js';

const router = Router();

// Roles that can see all firm invoices (not just their own)
const FULL_ACCESS_ROLES = ['owner', 'admin', 'billing'];

/**
 * Helper: check if a non-privileged user has access to a specific invoice.
 * Returns true if the user created the invoice or is associated with its matter.
 */
async function canAccessInvoice(userId, userRole, invoice) {
  if (FULL_ACCESS_ROLES.includes(userRole)) return true;
  if (invoice.created_by === userId) return true;
  if (invoice.matter_id) {
    const matterCheck = await query(
      `SELECT 1 FROM matters m WHERE m.id = $1 AND (
        m.responsible_attorney = $2 OR m.originating_attorney = $2 OR m.created_by = $2
        OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $2)
      )`,
      [invoice.matter_id, userId]
    );
    return matterCheck.rows.length > 0;
  }
  return false;
}

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

    // Security: verify user has access to this specific invoice
    if (!await canAccessInvoice(req.user.id, req.user.role, i)) {
      return res.status(403).json({ error: 'Access denied to this invoice' });
    }

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
      timeEntryIds = [], // Link time entries to this invoice
      expenseIds = [],   // Link expenses to this invoice
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

      const invoice = invoiceResult.rows[0];

      // Link time entries to this invoice and mark as billed
      if (timeEntryIds && timeEntryIds.length > 0) {
        await client.query(
          `UPDATE time_entries 
           SET invoice_id = $1, billed = true, status = 'billed', updated_at = NOW()
           WHERE id = ANY($2) AND firm_id = $3`,
          [invoice.id, timeEntryIds, req.user.firmId]
        );
      }

      // Link expenses to this invoice and mark as billed
      if (expenseIds && expenseIds.length > 0) {
        await client.query(
          `UPDATE expenses 
           SET invoice_id = $1, billed = true, updated_at = NOW()
           WHERE id = ANY($2) AND firm_id = $3`,
          [invoice.id, expenseIds, req.user.firmId]
        );
      }

      return invoice;
    });

    // Emit real-time event for invoice creation
    emitEvent(req.user.firmId, null, 'invoice.created', {
      invoiceId: result.id,
      number: result.number,
      total: parseFloat(result.total),
      clientId: result.client_id,
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
      linkedTimeEntries: timeEntryIds.length,
      linkedExpenses: expenseIds.length,
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
    let paymentId;

    await withTransaction(async (client) => {
      // Record payment
      const paymentResult = await client.query(
        `INSERT INTO payments (
          firm_id, invoice_id, client_id, amount, payment_method,
          reference, payment_date, notes, created_by, quickbooks_sync_status
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

    // Sync to QuickBooks asynchronously (don't block the response)
    let quickbooksSync = null;
    if (syncToQuickBooks && paymentId) {
      // Don't await - let it happen in the background
      pushPaymentToQuickBooks(req.user.firmId, paymentId)
        .then(result => {
          console.log(`QuickBooks payment sync result for payment ${paymentId}:`, result);
        })
        .catch(err => {
          console.error(`QuickBooks payment sync failed for payment ${paymentId}:`, err);
        });
      quickbooksSync = 'pending';
    }

    // Emit real-time event for payment recorded
    emitEvent(req.user.firmId, null, 'invoice.paid', {
      invoiceId: invoice.id,
      paymentId,
      amount,
      invoiceNumber: invoice.number,
    });

    res.json({ 
      message: 'Payment recorded successfully',
      paymentId,
      quickbooksSync
    });
  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// Merge multiple invoices into one
router.post('/:id/merge', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const keepInvoiceId = req.params.id;
    const { mergeInvoiceIds } = req.body;

    if (!mergeInvoiceIds || !Array.isArray(mergeInvoiceIds) || mergeInvoiceIds.length === 0) {
      return res.status(400).json({ error: 'mergeInvoiceIds array is required' });
    }

    // Verify all invoices exist and belong to the same matter
    const allInvoiceIds = [keepInvoiceId, ...mergeInvoiceIds];
    const invoicesResult = await query(
      `SELECT id, matter_id, client_id, status, line_items, total, amount_paid, notes
       FROM invoices 
       WHERE id = ANY($1) AND firm_id = $2`,
      [allInvoiceIds, req.user.firmId]
    );

    if (invoicesResult.rows.length !== allInvoiceIds.length) {
      return res.status(404).json({ error: 'One or more invoices not found' });
    }

    // Verify all invoices have the same matter
    const matterIds = [...new Set(invoicesResult.rows.map(inv => inv.matter_id))];
    if (matterIds.length > 1) {
      return res.status(400).json({ error: 'All invoices must belong to the same matter' });
    }

    // Verify no invoices are paid or void
    const invalidStatuses = invoicesResult.rows.filter(inv => inv.status === 'paid' || inv.status === 'void');
    if (invalidStatuses.length > 0) {
      return res.status(400).json({ error: 'Cannot merge paid or voided invoices' });
    }

    const keepInvoice = invoicesResult.rows.find(inv => inv.id === keepInvoiceId);
    const mergeInvoices = invoicesResult.rows.filter(inv => inv.id !== keepInvoiceId);

    await withTransaction(async (client) => {
      // Combine all line items
      let combinedLineItems = keepInvoice.line_items || [];
      let additionalTotal = 0;
      let additionalPaid = 0;
      const mergedNotes = [];

      for (const inv of mergeInvoices) {
        if (inv.line_items && inv.line_items.length > 0) {
          // Add a separator comment
          combinedLineItems.push({
            type: 'note',
            description: `--- Merged from Invoice ${inv.number || inv.id.slice(0, 8)} ---`
          });
          combinedLineItems = combinedLineItems.concat(inv.line_items);
        }
        additionalTotal += parseFloat(inv.total);
        additionalPaid += parseFloat(inv.amount_paid);
        if (inv.notes) {
          mergedNotes.push(inv.notes);
        }
      }

      // Calculate new totals
      const newTotal = parseFloat(keepInvoice.total) + additionalTotal;
      const newAmountPaid = parseFloat(keepInvoice.amount_paid) + additionalPaid;
      const newAmountDue = newTotal - newAmountPaid;

      // Recalculate subtotals
      const subtotalFees = combinedLineItems
        .filter(li => li.type === 'fee' || li.type === 'flat_fee' || !li.type)
        .reduce((sum, li) => sum + (parseFloat(li.amount) || 0), 0);

      // Update the keep invoice with combined data
      const combinedNotes = [keepInvoice.notes, ...mergedNotes].filter(Boolean).join('\n\n');
      
      await client.query(
        `UPDATE invoices SET
          line_items = $1,
          subtotal_fees = $2,
          subtotal = $2,
          total = $3,
          amount_paid = $4,
          amount_due = $5,
          notes = $6,
          updated_at = NOW()
        WHERE id = $7`,
        [
          JSON.stringify(combinedLineItems),
          subtotalFees,
          newTotal,
          newAmountPaid,
          newAmountDue,
          combinedNotes,
          keepInvoiceId
        ]
      );

      // Update time entries to point to the merged invoice
      await client.query(
        `UPDATE time_entries SET invoice_id = $1 WHERE invoice_id = ANY($2) AND firm_id = $3`,
        [keepInvoiceId, mergeInvoiceIds, req.user.firmId]
      );

      // Update expenses to point to the merged invoice
      await client.query(
        `UPDATE expenses SET invoice_id = $1 WHERE invoice_id = ANY($2) AND firm_id = $3`,
        [keepInvoiceId, mergeInvoiceIds, req.user.firmId]
      );

      // Void the merged invoices
      await client.query(
        `UPDATE invoices SET 
          status = 'void', 
          notes = COALESCE(notes, '') || E'\n\n[Merged into invoice ' || $1 || ']',
          updated_at = NOW()
        WHERE id = ANY($2)`,
        [keepInvoice.number || keepInvoiceId, mergeInvoiceIds]
      );
    });

    res.json({ 
      message: `Successfully merged ${mergeInvoiceIds.length + 1} invoices`,
      mergedInvoiceId: keepInvoiceId
    });
  } catch (error) {
    console.error('Merge invoices error:', error);
    res.status(500).json({ error: 'Failed to merge invoices' });
  }
});

// Get time entries linked to an invoice
router.get('/:id/time-entries', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    // Security: verify user has access to this invoice
    const invoiceCheck = await query(
      'SELECT id, created_by, matter_id FROM invoices WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );
    if (invoiceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (!await canAccessInvoice(req.user.id, req.user.role, invoiceCheck.rows[0])) {
      return res.status(403).json({ error: 'Access denied to this invoice' });
    }

    const result = await query(
      `SELECT te.*, 
              m.name as matter_name, m.number as matter_number,
              u.first_name || ' ' || u.last_name as user_name
       FROM time_entries te
       LEFT JOIN matters m ON te.matter_id = m.id
       LEFT JOIN users u ON te.user_id = u.id
       WHERE te.invoice_id = $1 AND te.firm_id = $2
       ORDER BY te.date DESC, te.created_at DESC`,
      [req.params.id, req.user.firmId]
    );

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
      })),
      totals: {
        hours: result.rows.reduce((sum, te) => sum + parseFloat(te.hours), 0),
        amount: result.rows.reduce((sum, te) => sum + parseFloat(te.amount), 0),
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('Get invoice time entries error:', error);
    res.status(500).json({ error: 'Failed to get time entries' });
  }
});

// Get payments for an invoice
router.get('/:id/payments', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    // Security: verify user has access to this invoice
    const invoiceCheck = await query(
      'SELECT id, created_by, matter_id FROM invoices WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );
    if (invoiceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (!await canAccessInvoice(req.user.id, req.user.role, invoiceCheck.rows[0])) {
      return res.status(403).json({ error: 'Access denied to this invoice' });
    }

    const result = await query(
      `SELECT p.*, u.first_name || ' ' || u.last_name as created_by_name
       FROM payments p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.invoice_id = $1 AND p.firm_id = $2
       ORDER BY p.payment_date DESC, p.created_at DESC`,
      [req.params.id, req.user.firmId]
    );

    res.json({
      payments: result.rows.map(p => ({
        id: p.id,
        amount: parseFloat(p.amount),
        paymentMethod: p.payment_method,
        reference: p.reference,
        paymentDate: p.payment_date,
        notes: p.notes,
        createdBy: p.created_by,
        createdByName: p.created_by_name,
        createdAt: p.created_at,
        quickbooksId: p.quickbooks_id,
        quickbooksSyncStatus: p.quickbooks_sync_status,
        quickbooksSyncedAt: p.quickbooks_synced_at,
        quickbooksSyncError: p.quickbooks_sync_error
      }))
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: 'Failed to get payments' });
  }
});

// Sync invoice to QuickBooks
router.post('/:id/sync-quickbooks', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const result = await pushInvoiceToQuickBooks(req.user.firmId, req.params.id);
    
    if (result.success) {
      res.json({ 
        message: 'Invoice synced to QuickBooks',
        quickbooksId: result.quickbooks_id
      });
    } else {
      res.status(400).json({ 
        error: result.error || result.reason || 'Sync failed'
      });
    }
  } catch (error) {
    console.error('QuickBooks sync error:', error);
    res.status(500).json({ error: 'Failed to sync to QuickBooks' });
  }
});

// Retry payment sync to QuickBooks
router.post('/:invoiceId/payments/:paymentId/sync-quickbooks', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const result = await pushPaymentToQuickBooks(req.user.firmId, req.params.paymentId);
    
    if (result.success) {
      res.json({ 
        message: 'Payment synced to QuickBooks',
        quickbooksId: result.quickbooks_id
      });
    } else {
      res.status(400).json({ 
        error: result.error || result.reason || 'Sync failed'
      });
    }
  } catch (error) {
    console.error('QuickBooks payment sync error:', error);
    res.status(500).json({ error: 'Failed to sync payment to QuickBooks' });
  }
});

// Bulk sync pending items to QuickBooks
router.post('/sync-all-quickbooks', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const results = await syncPendingToQuickBooks(req.user.firmId);
    
    res.json({
      message: 'Sync completed',
      results
    });
  } catch (error) {
    console.error('Bulk QuickBooks sync error:', error);
    res.status(500).json({ error: 'Failed to sync to QuickBooks' });
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

// Get all payments (with filtering) - restricted to admin/billing roles
router.get('/all/payments', authenticate, requirePermission('billing:view'), async (req, res) => {
  // Security: only privileged roles can see all firm payments
  if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied - admin or billing role required' });
  }
  try {
    const { startDate, endDate, clientId, syncStatus, limit = 100, offset = 0 } = req.query;
    
    let sql = `
      SELECT p.*, 
             i.number as invoice_number,
             c.display_name as client_name,
             u.first_name || ' ' || u.last_name as created_by_name
       FROM payments p
       LEFT JOIN invoices i ON p.invoice_id = i.id
       LEFT JOIN clients c ON p.client_id = c.id
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.firm_id = $1
    `;
    const params = [req.user.firmId];
    let paramIndex = 2;

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

    if (clientId) {
      sql += ` AND p.client_id = $${paramIndex}`;
      params.push(clientId);
      paramIndex++;
    }

    if (syncStatus) {
      sql += ` AND p.quickbooks_sync_status = $${paramIndex}`;
      params.push(syncStatus);
      paramIndex++;
    }

    sql += ` ORDER BY p.payment_date DESC, p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);

    // Get totals
    const totalsResult = await query(
      `SELECT 
        COUNT(*) as total_count,
        SUM(amount) as total_amount,
        COUNT(CASE WHEN quickbooks_sync_status = 'synced' THEN 1 END) as synced_count,
        COUNT(CASE WHEN quickbooks_sync_status = 'failed' THEN 1 END) as failed_count,
        COUNT(CASE WHEN quickbooks_sync_status = 'pending' THEN 1 END) as pending_count
       FROM payments WHERE firm_id = $1`,
      [req.user.firmId]
    );

    const totals = totalsResult.rows[0];

    res.json({
      payments: result.rows.map(p => ({
        id: p.id,
        invoiceId: p.invoice_id,
        invoiceNumber: p.invoice_number,
        clientId: p.client_id,
        clientName: p.client_name,
        amount: parseFloat(p.amount),
        paymentMethod: p.payment_method,
        reference: p.reference,
        paymentDate: p.payment_date,
        notes: p.notes,
        createdBy: p.created_by,
        createdByName: p.created_by_name,
        createdAt: p.created_at,
        quickbooksId: p.quickbooks_id,
        quickbooksSyncStatus: p.quickbooks_sync_status,
        quickbooksSyncedAt: p.quickbooks_synced_at,
        quickbooksSyncError: p.quickbooks_sync_error
      })),
      totals: {
        count: parseInt(totals.total_count),
        amount: parseFloat(totals.total_amount || 0),
        syncedCount: parseInt(totals.synced_count),
        failedCount: parseInt(totals.failed_count),
        pendingCount: parseInt(totals.pending_count)
      }
    });
  } catch (error) {
    console.error('Get all payments error:', error);
    res.status(500).json({ error: 'Failed to get payments' });
  }
});

export default router;
