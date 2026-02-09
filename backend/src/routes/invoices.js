import { Router } from 'express';
import { query, withTransaction } from '../db/connection.js';
import { authenticate, requirePermission, requireRole } from '../middleware/auth.js';
import { getTodayInTimezone, getCurrentYear } from '../utils/dateUtils.js';
import { pushPaymentToQuickBooks, pushInvoiceToQuickBooks, syncPendingToQuickBooks } from '../utils/quickbooksSync.js';

const router = Router();

// Roles that can see all firm invoices (not just their own)
const FULL_ACCESS_ROLES = ['owner', 'admin', 'billing'];

// Valid invoice status transitions (Clio-style state machine)
const VALID_TRANSITIONS = {
  draft:   ['sent', 'void'],
  sent:    ['viewed', 'partial', 'paid', 'overdue', 'void'],
  viewed:  ['partial', 'paid', 'overdue', 'void'],
  partial: ['paid', 'overdue', 'void'],
  overdue: ['partial', 'paid', 'void'],
  paid:    [], // Terminal state - no transitions allowed (use credit note to refund)
  void:    [], // Terminal state - no transitions allowed
};

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
 * Helper: check if a non-privileged user has access to a specific invoice.
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

/**
 * Helper: validate invoice status transition
 */
function isValidTransition(currentStatus, newStatus) {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed) return false;
  return allowed.includes(newStatus);
}

/**
 * Helper: generate invoice number
 */
async function generateInvoiceNumber(firmId, client) {
  // Try to use firm's billing settings for prefix
  let prefix = 'INV';
  try {
    const settingsResult = await query(
      'SELECT invoice_prefix FROM billing_settings WHERE firm_id = $1',
      [firmId]
    );
    if (settingsResult.rows.length > 0 && settingsResult.rows[0].invoice_prefix) {
      prefix = settingsResult.rows[0].invoice_prefix;
    }
  } catch (e) {
    // billing_settings table may not exist yet
  }

  const countResult = await query(
    'SELECT COUNT(*) FROM invoices WHERE firm_id = $1',
    [firmId]
  );
  const count = parseInt(countResult.rows[0].count) + 1;
  return `${prefix}-${getCurrentYear()}-${String(count).padStart(4, '0')}`;
}

// ============================================
// GET INVOICES
// ============================================

router.get('/', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    const { clientId, matterId, status, view = 'my', search, limit = 500, offset = 0 } = req.query;
    
    const canViewAll = FULL_ACCESS_ROLES.includes(req.user.role);
    const effectiveView = canViewAll ? view : 'my';
    
    let sql = `
      SELECT i.*,
             c.display_name as client_name,
             c.email as client_email,
             m.name as matter_name,
             m.number as matter_number,
             m.billing_type as matter_billing_type,
             u.first_name || ' ' || u.last_name as created_by_name
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      LEFT JOIN matters m ON i.matter_id = m.id
      LEFT JOIN users u ON i.created_by = u.id
      WHERE i.firm_id = $1
    `;
    const params = [req.user.firmId];
    let paramIndex = 2;

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

    if (search) {
      sql += ` AND (i.number ILIKE $${paramIndex} OR c.display_name ILIKE $${paramIndex} OR m.name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ` ORDER BY i.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(Math.min(parseInt(limit) || 500, 5000), parseInt(offset) || 0);

    const result = await query(sql, params);

    res.json({
      invoices: result.rows.map(i => ({
        id: i.id,
        number: i.number,
        matterId: i.matter_id,
        matterName: i.matter_name,
        matterNumber: i.matter_number,
        matterBillingType: i.matter_billing_type,
        clientId: i.client_id,
        clientName: i.client_name,
        clientEmail: i.client_email,
        status: i.status,
        billingType: i.billing_type,
        issueDate: i.issue_date,
        dueDate: i.due_date,
        subtotalFees: parseFloat(i.subtotal_fees),
        subtotalExpenses: parseFloat(i.subtotal_expenses),
        subtotal: parseFloat(i.subtotal),
        taxRate: parseFloat(i.tax_rate),
        taxAmount: parseFloat(i.tax_amount),
        discountAmount: parseFloat(i.discount_amount),
        creditApplied: parseFloat(i.credit_applied || 0),
        trustApplied: parseFloat(i.trust_applied || 0),
        total: parseFloat(i.total),
        amountPaid: parseFloat(i.amount_paid),
        amountDue: parseFloat(i.amount_due),
        lineItems: i.line_items,
        notes: i.notes,
        terms: i.terms,
        createdBy: i.created_by,
        createdByName: i.created_by_name,
        finalizedAt: i.finalized_at,
        sentAt: i.sent_at,
        paidAt: i.paid_at,
        voidedAt: i.voided_at,
        voidReason: i.void_reason,
        quickbooksSyncStatus: i.quickbooks_sync_status,
        quickbooksId: i.quickbooks_id,
        createdAt: i.created_at,
        updatedAt: i.updated_at,
      })),
    });
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'Failed to get invoices' });
  }
});

// ============================================
// GET SINGLE INVOICE
// ============================================

router.get('/:id', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    const result = await query(
      `SELECT i.*,
              c.display_name as client_name, c.email as client_email,
              c.address_street, c.address_city, c.address_state, c.address_zip,
              c.phone as client_phone,
              m.name as matter_name, m.number as matter_number, m.billing_type as matter_billing_type,
              m.budget as matter_budget,
              u.first_name || ' ' || u.last_name as created_by_name
       FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id
       LEFT JOIN matters m ON i.matter_id = m.id
       LEFT JOIN users u ON i.created_by = u.id
       WHERE i.id = $1 AND i.firm_id = $2`,
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const i = result.rows[0];

    if (!await canAccessInvoice(req.user.id, req.user.role, i)) {
      return res.status(403).json({ error: 'Access denied to this invoice' });
    }

    // Get linked time entries count and total
    const timeEntrySummary = await query(
      `SELECT COUNT(*) as count, COALESCE(SUM(hours), 0) as total_hours, COALESCE(SUM(amount), 0) as total_amount
       FROM time_entries WHERE invoice_id = $1`,
      [req.params.id]
    );

    // Get linked expenses count and total
    const expenseSummary = await query(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
       FROM expenses WHERE invoice_id = $1`,
      [req.params.id]
    );

    // Get payment history
    const payments = await query(
      `SELECT p.*, u2.first_name || ' ' || u2.last_name as recorded_by_name
       FROM payments p
       LEFT JOIN users u2 ON p.created_by = u2.id
       WHERE p.invoice_id = $1 ORDER BY p.payment_date DESC`,
      [req.params.id]
    );

    // Get credit notes applied
    const creditNotes = await query(
      `SELECT * FROM credit_notes WHERE invoice_id = $1 AND status = 'applied' ORDER BY applied_at DESC`,
      [req.params.id]
    ).catch(() => ({ rows: [] })); // Table might not exist yet

    res.json({
      id: i.id,
      number: i.number,
      matterId: i.matter_id,
      matterName: i.matter_name,
      matterNumber: i.matter_number,
      matterBillingType: i.matter_billing_type,
      matterBudget: i.matter_budget ? parseFloat(i.matter_budget) : null,
      clientId: i.client_id,
      clientName: i.client_name,
      clientEmail: i.client_email,
      clientPhone: i.client_phone,
      clientAddress: {
        street: i.address_street,
        city: i.address_city,
        state: i.address_state,
        zip: i.address_zip,
      },
      status: i.status,
      billingType: i.billing_type,
      issueDate: i.issue_date,
      dueDate: i.due_date,
      subtotalFees: parseFloat(i.subtotal_fees),
      subtotalExpenses: parseFloat(i.subtotal_expenses),
      subtotal: parseFloat(i.subtotal),
      taxRate: parseFloat(i.tax_rate),
      taxAmount: parseFloat(i.tax_amount),
      discountAmount: parseFloat(i.discount_amount),
      creditApplied: parseFloat(i.credit_applied || 0),
      trustApplied: parseFloat(i.trust_applied || 0),
      total: parseFloat(i.total),
      amountPaid: parseFloat(i.amount_paid),
      amountDue: parseFloat(i.amount_due),
      lineItems: i.line_items,
      notes: i.notes,
      internalNotes: FULL_ACCESS_ROLES.includes(req.user.role) ? i.internal_notes : undefined,
      terms: i.terms,
      paymentInstructions: i.payment_instructions,
      createdBy: i.created_by,
      createdByName: i.created_by_name,
      finalizedAt: i.finalized_at,
      finalizedBy: i.finalized_by,
      sentAt: i.sent_at,
      paidAt: i.paid_at,
      voidedAt: i.voided_at,
      voidedBy: i.voided_by,
      voidReason: i.void_reason,
      quickbooksSyncStatus: i.quickbooks_sync_status,
      quickbooksId: i.quickbooks_id,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      // Related data
      linkedTimeEntries: {
        count: parseInt(timeEntrySummary.rows[0].count),
        totalHours: parseFloat(timeEntrySummary.rows[0].total_hours),
        totalAmount: parseFloat(timeEntrySummary.rows[0].total_amount),
      },
      linkedExpenses: {
        count: parseInt(expenseSummary.rows[0].count),
        totalAmount: parseFloat(expenseSummary.rows[0].total_amount),
      },
      payments: payments.rows.map(p => ({
        id: p.id,
        amount: parseFloat(p.amount),
        paymentMethod: p.payment_method,
        reference: p.reference,
        paymentDate: p.payment_date,
        notes: p.notes,
        recordedBy: p.recorded_by_name,
        quickbooksSyncStatus: p.quickbooks_sync_status,
        createdAt: p.created_at,
      })),
      creditNotes: creditNotes.rows.map(cn => ({
        id: cn.id,
        number: cn.number,
        type: cn.type,
        amount: parseFloat(cn.amount),
        reason: cn.reason,
        appliedAt: cn.applied_at,
      })),
    });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ error: 'Failed to get invoice' });
  }
});

// ============================================
// CREATE INVOICE
// ============================================

router.post('/', authenticate, requirePermission('billing:create'), async (req, res) => {
  try {
    const {
      matterId,
      clientId,
      issueDate,
      dueDate,
      lineItems = [],
      notes,
      internalNotes,
      paymentInstructions,
      terms,
      taxRate = 0,
      discountAmount = 0,
      billingType = 'hourly',
      timeEntryIds = [],
      expenseIds = [],
    } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'Client is required' });
    }

    // Verify client exists
    const clientCheck = await query(
      'SELECT id FROM clients WHERE id = $1 AND firm_id = $2',
      [clientId, req.user.firmId]
    );
    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Verify matter if provided
    const safeMatterId = matterId && matterId.trim() !== '' ? matterId : null;
    if (safeMatterId) {
      const matterCheck = await query(
        'SELECT id, status FROM matters WHERE id = $1 AND firm_id = $2',
        [safeMatterId, req.user.firmId]
      );
      if (matterCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Matter not found' });
      }
    }

    // Verify time entries belong to this firm and are not already billed
    if (timeEntryIds.length > 0) {
      const teCheck = await query(
        'SELECT id FROM time_entries WHERE id = ANY($1) AND firm_id = $2 AND billed = false',
        [timeEntryIds, req.user.firmId]
      );
      if (teCheck.rows.length !== timeEntryIds.length) {
        return res.status(400).json({ error: 'Some time entries are not found or already billed' });
      }
    }

    // Verify expenses belong to this firm and are not already billed
    if (expenseIds.length > 0) {
      const expCheck = await query(
        'SELECT id FROM expenses WHERE id = ANY($1) AND firm_id = $2 AND billed = false',
        [expenseIds, req.user.firmId]
      );
      if (expCheck.rows.length !== expenseIds.length) {
        return res.status(400).json({ error: 'Some expenses are not found or already billed' });
      }
    }

    const result = await withTransaction(async (client) => {
      const number = await generateInvoiceNumber(req.user.firmId);

      // Calculate totals from line items
      const subtotalFees = lineItems
        .filter(li => li.type === 'fee' || li.type === 'flat_fee' || !li.type)
        .reduce((sum, li) => sum + (parseFloat(li.amount) || (parseFloat(li.quantity) || 0) * (parseFloat(li.rate) || 0)), 0);
      const subtotalExpenses = lineItems
        .filter(li => li.type === 'expense')
        .reduce((sum, li) => sum + (parseFloat(li.amount) || (parseFloat(li.quantity) || 0) * (parseFloat(li.rate) || 0)), 0);

      const invoiceResult = await client.query(
        `INSERT INTO invoices (
          firm_id, number, matter_id, client_id, status, issue_date, due_date,
          subtotal_fees, subtotal_expenses, tax_rate, discount_amount,
          line_items, notes, internal_notes, payment_instructions, terms,
          billing_type, created_by
        ) VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *`,
        [
          req.user.firmId, number, safeMatterId, clientId, issueDate, dueDate,
          subtotalFees, subtotalExpenses, taxRate, discountAmount,
          JSON.stringify(lineItems), notes, internalNotes, paymentInstructions, terms,
          billingType, req.user.id
        ]
      );

      const invoice = invoiceResult.rows[0];

      // Link time entries
      if (timeEntryIds.length > 0) {
        await client.query(
          `UPDATE time_entries 
           SET invoice_id = $1, billed = true, status = 'billed', updated_at = NOW()
           WHERE id = ANY($2) AND firm_id = $3`,
          [invoice.id, timeEntryIds, req.user.firmId]
        );
      }

      // Link expenses
      if (expenseIds.length > 0) {
        await client.query(
          `UPDATE expenses 
           SET invoice_id = $1, billed = true, updated_at = NOW()
           WHERE id = ANY($2) AND firm_id = $3`,
          [invoice.id, expenseIds, req.user.firmId]
        );
      }

      return invoice;
    });

    logBillingAudit(req.user.firmId, req.user.id, 'invoice.created', 'invoice', result.id, {
      number: result.number,
      total: parseFloat(result.total),
      linkedTimeEntries: timeEntryIds.length,
      linkedExpenses: expenseIds.length,
    }, req);

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

// ============================================
// UPDATE INVOICE
// ============================================

router.put('/:id', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const existing = await query(
      'SELECT id, status, created_by, matter_id, finalized_at FROM invoices WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = existing.rows[0];

    // Check access
    if (!await canAccessInvoice(req.user.id, req.user.role, invoice)) {
      return res.status(403).json({ error: 'Access denied to this invoice' });
    }

    // Cannot edit finalized invoices unless admin (only status changes allowed)
    if (invoice.finalized_at && !FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(400).json({ 
        error: 'Cannot edit a finalized invoice. Contact an administrator.',
        code: 'INVOICE_FINALIZED'
      });
    }

    // Cannot edit paid or voided invoices
    if (['paid', 'void'].includes(invoice.status)) {
      return res.status(400).json({ 
        error: `Cannot edit a ${invoice.status} invoice`,
        code: 'INVOICE_TERMINAL'
      });
    }

    const {
      matterId,
      clientId,
      status,
      issueDate,
      dueDate,
      lineItems,
      notes,
      internalNotes,
      paymentInstructions,
      terms,
      taxRate,
      discountAmount,
    } = req.body;

    // Validate status transition
    if (status && status !== invoice.status) {
      if (!isValidTransition(invoice.status, status)) {
        return res.status(400).json({ 
          error: `Cannot change status from '${invoice.status}' to '${status}'`,
          code: 'INVALID_TRANSITION',
          allowedTransitions: VALID_TRANSITIONS[invoice.status]
        });
      }

      // Voiding requires billing:finalize permission
      if (status === 'void') {
        const { hasPermission } = await import('../utils/auth.js');
        if (!hasPermission(req.user.role, 'billing:finalize')) {
          return res.status(403).json({ error: 'You do not have permission to void invoices' });
        }
      }
    }

    // Recalculate totals if line items changed
    let subtotalFees, subtotalExpenses;
    if (lineItems) {
      subtotalFees = lineItems
        .filter(li => li.type === 'fee' || li.type === 'flat_fee' || !li.type)
        .reduce((sum, li) => sum + (parseFloat(li.amount) || (parseFloat(li.quantity) || 0) * (parseFloat(li.rate) || 0)), 0);
      subtotalExpenses = lineItems
        .filter(li => li.type === 'expense')
        .reduce((sum, li) => sum + (parseFloat(li.amount) || (parseFloat(li.quantity) || 0) * (parseFloat(li.rate) || 0)), 0);
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
        terms = COALESCE($13, terms),
        internal_notes = COALESCE($14, internal_notes),
        sent_at = CASE WHEN $3 = 'sent' AND sent_at IS NULL THEN NOW() ELSE sent_at END,
        paid_at = CASE WHEN $3 = 'paid' AND paid_at IS NULL THEN NOW() ELSE paid_at END,
        voided_at = CASE WHEN $3 = 'void' AND voided_at IS NULL THEN NOW() ELSE voided_at END,
        voided_by = CASE WHEN $3 = 'void' AND voided_by IS NULL THEN $15 ELSE voided_by END,
        updated_at = NOW()
      WHERE id = $16
      RETURNING *`,
      [
        matterId, clientId, status, issueDate, dueDate,
        subtotalFees, subtotalExpenses, taxRate, discountAmount,
        lineItems ? JSON.stringify(lineItems) : null, notes, paymentInstructions, terms,
        internalNotes,
        req.user.id,
        req.params.id
      ]
    );

    const i = result.rows[0];

    // If voiding, unlink time entries and expenses
    if (status === 'void') {
      await query(
        `UPDATE time_entries SET invoice_id = NULL, billed = false, status = 'approved', updated_at = NOW()
         WHERE invoice_id = $1 AND firm_id = $2`,
        [req.params.id, req.user.firmId]
      );
      await query(
        `UPDATE expenses SET invoice_id = NULL, billed = false, updated_at = NOW()
         WHERE invoice_id = $1 AND firm_id = $2`,
        [req.params.id, req.user.firmId]
      );
    }

    logBillingAudit(req.user.firmId, req.user.id, 'invoice.updated', 'invoice', i.id, {
      statusChange: status !== invoice.status ? { from: invoice.status, to: status } : undefined,
      total: parseFloat(i.total),
    }, req);

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

// ============================================
// FINALIZE INVOICE (Lock for sending - Clio-style)
// ============================================

router.post('/:id/finalize', authenticate, requirePermission('billing:finalize'), async (req, res) => {
  try {
    const existing = await query(
      'SELECT id, status, finalized_at, number FROM invoices WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = existing.rows[0];

    if (invoice.finalized_at) {
      return res.status(400).json({ error: 'Invoice is already finalized' });
    }

    if (invoice.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft invoices can be finalized' });
    }

    // Verify the invoice has a due date and line items
    const fullInvoice = await query('SELECT due_date, line_items, total FROM invoices WHERE id = $1', [req.params.id]);
    const inv = fullInvoice.rows[0];
    
    if (!inv.due_date) {
      return res.status(400).json({ error: 'Invoice must have a due date before finalizing' });
    }
    if (parseFloat(inv.total) <= 0) {
      return res.status(400).json({ error: 'Invoice total must be greater than zero' });
    }

    const result = await query(
      `UPDATE invoices SET 
        finalized_at = NOW(), finalized_by = $1, status = 'sent', sent_at = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [req.user.id, req.params.id]
    );

    logBillingAudit(req.user.firmId, req.user.id, 'invoice.finalized', 'invoice', req.params.id, {
      number: invoice.number,
      total: parseFloat(result.rows[0].total),
    }, req);

    // Auto-sync to QuickBooks if connected
    pushInvoiceToQuickBooks(req.user.firmId, req.params.id).catch(err => {
      console.error('Auto QuickBooks sync failed:', err);
    });

    res.json({ 
      message: 'Invoice finalized and marked as sent',
      invoice: {
        id: result.rows[0].id,
        number: result.rows[0].number,
        status: result.rows[0].status,
        finalizedAt: result.rows[0].finalized_at,
      }
    });
  } catch (error) {
    console.error('Finalize invoice error:', error);
    res.status(500).json({ error: 'Failed to finalize invoice' });
  }
});

// ============================================
// VOID INVOICE
// ============================================

router.post('/:id/void', authenticate, requirePermission('billing:finalize'), async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ error: 'A reason is required to void an invoice' });
    }

    const existing = await query(
      'SELECT id, status, number FROM invoices WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = existing.rows[0];

    if (['paid', 'void'].includes(invoice.status)) {
      return res.status(400).json({ error: `Cannot void a ${invoice.status} invoice. Use a credit note for paid invoices.` });
    }

    await withTransaction(async (client) => {
      // Void the invoice
      await client.query(
        `UPDATE invoices SET 
          status = 'void', voided_at = NOW(), voided_by = $1, void_reason = $2, updated_at = NOW()
         WHERE id = $3`,
        [req.user.id, reason.trim(), req.params.id]
      );

      // Unlink time entries
      await client.query(
        `UPDATE time_entries SET invoice_id = NULL, billed = false, status = 'approved', updated_at = NOW()
         WHERE invoice_id = $1 AND firm_id = $2`,
        [req.params.id, req.user.firmId]
      );

      // Unlink expenses
      await client.query(
        `UPDATE expenses SET invoice_id = NULL, billed = false, updated_at = NOW()
         WHERE invoice_id = $1 AND firm_id = $2`,
        [req.params.id, req.user.firmId]
      );
    });

    logBillingAudit(req.user.firmId, req.user.id, 'invoice.voided', 'invoice', req.params.id, {
      number: invoice.number,
      previousStatus: invoice.status,
      reason: reason.trim(),
    }, req);

    res.json({ message: 'Invoice voided successfully' });
  } catch (error) {
    console.error('Void invoice error:', error);
    res.status(500).json({ error: 'Failed to void invoice' });
  }
});

// ============================================
// RECORD PAYMENT
// ============================================

router.post('/:id/payments', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const { amount, paymentMethod, reference, paymentDate, notes, syncToQuickBooks = true } = req.body;

    if (!amount || parseFloat(amount) <= 0) {
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

    // Cannot record payment on void or draft invoices
    if (['void', 'draft'].includes(invoice.status)) {
      return res.status(400).json({ error: `Cannot record payment on a ${invoice.status} invoice` });
    }

    // Warn if overpayment
    const remainingDue = parseFloat(invoice.total) - parseFloat(invoice.amount_paid);
    if (parseFloat(amount) > remainingDue * 1.01) { // 1% tolerance for rounding
      return res.status(400).json({ 
        error: `Payment amount ($${amount}) exceeds remaining balance ($${remainingDue.toFixed(2)})`,
        code: 'OVERPAYMENT',
        remainingDue: remainingDue
      });
    }

    let paymentId;

    await withTransaction(async (client) => {
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

      const newAmountPaid = parseFloat(invoice.amount_paid) + parseFloat(amount);
      const newAmountDue = parseFloat(invoice.total) - newAmountPaid;
      const newStatus = newAmountDue <= 0.01 ? 'paid' : 'partial'; // Small tolerance

      await client.query(
        `UPDATE invoices SET 
          amount_paid = $1, 
          status = $2,
          paid_at = CASE WHEN $2 = 'paid' THEN NOW() ELSE paid_at END,
          updated_at = NOW()
        WHERE id = $3`,
        [newAmountPaid, newStatus, invoice.id]
      );
    });

    logBillingAudit(req.user.firmId, req.user.id, 'payment.recorded', 'payment', paymentId, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      amount: parseFloat(amount),
      paymentMethod,
      reference,
    }, req);

    // Sync to QuickBooks asynchronously
    let quickbooksSync = null;
    if (syncToQuickBooks && paymentId) {
      pushPaymentToQuickBooks(req.user.firmId, paymentId)
        .then(result => console.log(`QuickBooks payment sync for ${paymentId}:`, result))
        .catch(err => console.error(`QuickBooks payment sync failed for ${paymentId}:`, err));
      quickbooksSync = 'pending';
    }

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

// ============================================
// CREDIT NOTES / WRITE-OFFS (Clio-style)
// ============================================

// Create credit note
router.post('/:id/credit-note', authenticate, requirePermission('billing:writeoff'), async (req, res) => {
  try {
    const { amount, reason, type = 'credit' } = req.body;

    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Valid credit amount required' });
    }
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ error: 'A reason is required for credit notes' });
    }

    const invoiceResult = await query(
      'SELECT * FROM invoices WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];

    if (invoice.status === 'void') {
      return res.status(400).json({ error: 'Cannot apply credit to a voided invoice' });
    }

    // Generate credit note number
    const countResult = await query(
      'SELECT COUNT(*) FROM credit_notes WHERE firm_id = $1',
      [req.user.firmId]
    );
    const creditNumber = `CN-${getCurrentYear()}-${String(parseInt(countResult.rows[0].count) + 1).padStart(4, '0')}`;

    // Auto-approve for admins/billing
    const autoApprove = FULL_ACCESS_ROLES.includes(req.user.role);

    let creditNote;
    await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO credit_notes (
          firm_id, invoice_id, client_id, matter_id, number, type, amount, reason, status,
          approved_by, approved_at, applied_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          req.user.firmId, invoice.id, invoice.client_id, invoice.matter_id,
          creditNumber, type, amount, reason.trim(),
          autoApprove ? 'applied' : 'draft',
          autoApprove ? req.user.id : null,
          autoApprove ? new Date().toISOString() : null,
          autoApprove ? new Date().toISOString() : null,
          req.user.id
        ]
      );
      creditNote = result.rows[0];

      // If auto-approved, apply the credit immediately
      if (autoApprove) {
        const newCreditApplied = parseFloat(invoice.credit_applied || 0) + parseFloat(amount);
        const newAmountDue = parseFloat(invoice.total) - parseFloat(invoice.amount_paid) - newCreditApplied;
        
        await client.query(
          `UPDATE invoices SET 
            credit_applied = $1,
            amount_due = GREATEST(0, $2),
            status = CASE WHEN GREATEST(0, $2) <= 0.01 THEN 'paid' ELSE status END,
            paid_at = CASE WHEN GREATEST(0, $2) <= 0.01 AND paid_at IS NULL THEN NOW() ELSE paid_at END,
            updated_at = NOW()
           WHERE id = $3`,
          [newCreditApplied, newAmountDue, invoice.id]
        );
      }
    });

    logBillingAudit(req.user.firmId, req.user.id, `credit_note.${autoApprove ? 'created_and_applied' : 'created'}`, 'credit_note', creditNote.id, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      amount: parseFloat(amount),
      type,
      reason: reason.trim(),
    }, req);

    res.status(201).json({
      id: creditNote.id,
      number: creditNote.number,
      type: creditNote.type,
      amount: parseFloat(creditNote.amount),
      reason: creditNote.reason,
      status: creditNote.status,
      invoiceId: invoice.id,
      message: autoApprove ? 'Credit note created and applied' : 'Credit note created (pending approval)',
    });
  } catch (error) {
    console.error('Create credit note error:', error);
    res.status(500).json({ error: 'Failed to create credit note' });
  }
});

// ============================================
// MERGE INVOICES
// ============================================

router.post('/:id/merge', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const keepInvoiceId = req.params.id;
    const { mergeInvoiceIds } = req.body;

    if (!mergeInvoiceIds || !Array.isArray(mergeInvoiceIds) || mergeInvoiceIds.length === 0) {
      return res.status(400).json({ error: 'mergeInvoiceIds array is required' });
    }

    const allInvoiceIds = [keepInvoiceId, ...mergeInvoiceIds];
    const invoicesResult = await query(
      `SELECT id, matter_id, client_id, status, line_items, total, amount_paid, notes, number
       FROM invoices 
       WHERE id = ANY($1) AND firm_id = $2`,
      [allInvoiceIds, req.user.firmId]
    );

    if (invoicesResult.rows.length !== allInvoiceIds.length) {
      return res.status(404).json({ error: 'One or more invoices not found' });
    }

    // All must have same client
    const clientIds = [...new Set(invoicesResult.rows.map(inv => inv.client_id))];
    if (clientIds.length > 1) {
      return res.status(400).json({ error: 'All invoices must belong to the same client' });
    }

    const invalidStatuses = invoicesResult.rows.filter(inv => inv.status === 'paid' || inv.status === 'void');
    if (invalidStatuses.length > 0) {
      return res.status(400).json({ error: 'Cannot merge paid or voided invoices' });
    }

    const keepInvoice = invoicesResult.rows.find(inv => inv.id === keepInvoiceId);
    const mergeInvoices = invoicesResult.rows.filter(inv => inv.id !== keepInvoiceId);

    await withTransaction(async (client) => {
      let combinedLineItems = keepInvoice.line_items || [];
      let additionalTotal = 0;
      let additionalPaid = 0;
      const mergedNotes = [];

      for (const inv of mergeInvoices) {
        if (inv.line_items && inv.line_items.length > 0) {
          combinedLineItems.push({
            type: 'note',
            description: `--- Merged from Invoice ${inv.number || inv.id.slice(0, 8)} ---`
          });
          combinedLineItems = combinedLineItems.concat(inv.line_items);
        }
        additionalTotal += parseFloat(inv.total);
        additionalPaid += parseFloat(inv.amount_paid);
        if (inv.notes) mergedNotes.push(inv.notes);
      }

      const newTotal = parseFloat(keepInvoice.total) + additionalTotal;
      const newAmountPaid = parseFloat(keepInvoice.amount_paid) + additionalPaid;

      const subtotalFees = combinedLineItems
        .filter(li => li.type === 'fee' || li.type === 'flat_fee' || !li.type)
        .reduce((sum, li) => sum + (parseFloat(li.amount) || 0), 0);

      const combinedNotes = [keepInvoice.notes, ...mergedNotes].filter(Boolean).join('\n\n');
      
      await client.query(
        `UPDATE invoices SET
          line_items = $1, subtotal_fees = $2, subtotal = $2,
          total = $3, amount_paid = $4, amount_due = $5,
          notes = $6, updated_at = NOW()
        WHERE id = $7`,
        [JSON.stringify(combinedLineItems), subtotalFees, newTotal, newAmountPaid, newTotal - newAmountPaid, combinedNotes, keepInvoiceId]
      );

      await client.query(
        'UPDATE time_entries SET invoice_id = $1 WHERE invoice_id = ANY($2) AND firm_id = $3',
        [keepInvoiceId, mergeInvoiceIds, req.user.firmId]
      );

      await client.query(
        'UPDATE expenses SET invoice_id = $1 WHERE invoice_id = ANY($2) AND firm_id = $3',
        [keepInvoiceId, mergeInvoiceIds, req.user.firmId]
      );

      await client.query(
        `UPDATE invoices SET 
          status = 'void', voided_at = NOW(), voided_by = $1,
          void_reason = 'Merged into invoice ' || $2,
          updated_at = NOW()
        WHERE id = ANY($3)`,
        [req.user.id, keepInvoice.number || keepInvoiceId, mergeInvoiceIds]
      );
    });

    logBillingAudit(req.user.firmId, req.user.id, 'invoice.merged', 'invoice', keepInvoiceId, {
      mergedInvoiceIds,
      mergedCount: mergeInvoiceIds.length + 1,
    }, req);

    res.json({ 
      message: `Successfully merged ${mergeInvoiceIds.length + 1} invoices`,
      mergedInvoiceId: keepInvoiceId
    });
  } catch (error) {
    console.error('Merge invoices error:', error);
    res.status(500).json({ error: 'Failed to merge invoices' });
  }
});

// ============================================
// INVOICE TIME ENTRIES & PAYMENTS
// ============================================

router.get('/:id/time-entries', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
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

router.get('/:id/payments', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
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

// ============================================
// QUICKBOOKS SYNC
// ============================================

router.post('/:id/sync-quickbooks', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const result = await pushInvoiceToQuickBooks(req.user.firmId, req.params.id);
    
    if (result.success) {
      logBillingAudit(req.user.firmId, req.user.id, 'invoice.synced_quickbooks', 'invoice', req.params.id, {
        quickbooksId: result.quickbooks_id,
      }, req);
      res.json({ message: 'Invoice synced to QuickBooks', quickbooksId: result.quickbooks_id });
    } else {
      res.status(400).json({ error: result.error || result.reason || 'Sync failed' });
    }
  } catch (error) {
    console.error('QuickBooks sync error:', error);
    res.status(500).json({ error: 'Failed to sync to QuickBooks' });
  }
});

router.post('/:invoiceId/payments/:paymentId/sync-quickbooks', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const result = await pushPaymentToQuickBooks(req.user.firmId, req.params.paymentId);
    if (result.success) {
      res.json({ message: 'Payment synced to QuickBooks', quickbooksId: result.quickbooks_id });
    } else {
      res.status(400).json({ error: result.error || result.reason || 'Sync failed' });
    }
  } catch (error) {
    console.error('QuickBooks payment sync error:', error);
    res.status(500).json({ error: 'Failed to sync payment to QuickBooks' });
  }
});

router.post('/sync-all-quickbooks', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const results = await syncPendingToQuickBooks(req.user.firmId);
    logBillingAudit(req.user.firmId, req.user.id, 'quickbooks.bulk_sync', 'invoice', 'bulk', { results }, req);
    res.json({ message: 'Sync completed', results });
  } catch (error) {
    console.error('Bulk QuickBooks sync error:', error);
    res.status(500).json({ error: 'Failed to sync to QuickBooks' });
  }
});

// ============================================
// DELETE INVOICE (only drafts)
// ============================================

router.delete('/:id', authenticate, requirePermission('billing:delete'), async (req, res) => {
  try {
    const existing = await query(
      'SELECT id, status, number, created_by FROM invoices WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = existing.rows[0];

    // Only drafts can be deleted; anything else must be voided
    if (invoice.status !== 'draft') {
      return res.status(400).json({ 
        error: 'Only draft invoices can be deleted. Use void for sent/finalized invoices.',
        code: 'NOT_DRAFT'
      });
    }

    // Non-admin can only delete their own invoices
    if (!FULL_ACCESS_ROLES.includes(req.user.role) && invoice.created_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete invoices you created' });
    }

    await withTransaction(async (client) => {
      // Unlink time entries and expenses first
      await client.query(
        `UPDATE time_entries SET invoice_id = NULL, billed = false, status = 'approved', updated_at = NOW()
         WHERE invoice_id = $1`,
        [req.params.id]
      );
      await client.query(
        `UPDATE expenses SET invoice_id = NULL, billed = false, updated_at = NOW()
         WHERE invoice_id = $1`,
        [req.params.id]
      );
      await client.query('DELETE FROM invoices WHERE id = $1', [req.params.id]);
    });

    logBillingAudit(req.user.firmId, req.user.id, 'invoice.deleted', 'invoice', req.params.id, {
      number: invoice.number,
    }, req);

    res.json({ message: 'Invoice deleted' });
  } catch (error) {
    console.error('Delete invoice error:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

// ============================================
// GET ALL PAYMENTS (admin/billing view)
// ============================================

router.get('/all/payments', authenticate, requirePermission('billing:view'), async (req, res) => {
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
    params.push(Math.min(parseInt(limit), 1000), parseInt(offset) || 0);

    const [result, totalsResult] = await Promise.all([
      query(sql, params),
      query(
        `SELECT 
          COUNT(*) as total_count,
          COALESCE(SUM(amount), 0) as total_amount,
          COUNT(CASE WHEN quickbooks_sync_status = 'synced' THEN 1 END) as synced_count,
          COUNT(CASE WHEN quickbooks_sync_status = 'failed' THEN 1 END) as failed_count,
          COUNT(CASE WHEN quickbooks_sync_status = 'pending' THEN 1 END) as pending_count
         FROM payments WHERE firm_id = $1`,
        [req.user.firmId]
      )
    ]);

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
        amount: parseFloat(totals.total_amount),
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

// ============================================
// AGING REPORT
// ============================================

router.get('/reports/aging', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await query(
      `SELECT 
        i.id, i.number, i.status, i.due_date, i.total, i.amount_paid, i.credit_applied,
        c.display_name as client_name, c.id as client_id,
        m.name as matter_name,
        GREATEST(0, CURRENT_DATE - i.due_date) as days_overdue,
        (i.total - i.amount_paid - COALESCE(i.credit_applied, 0)) as outstanding
       FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id
       LEFT JOIN matters m ON i.matter_id = m.id
       WHERE i.firm_id = $1 AND i.status IN ('sent', 'viewed', 'partial', 'overdue')
       ORDER BY i.due_date ASC`,
      [req.user.firmId]
    );

    const aging = {
      current: { invoices: [], total: 0 },
      '1-30': { invoices: [], total: 0 },
      '31-60': { invoices: [], total: 0 },
      '61-90': { invoices: [], total: 0 },
      '90+': { invoices: [], total: 0 },
    };

    for (const row of result.rows) {
      const outstanding = parseFloat(row.outstanding);
      const daysOverdue = parseInt(row.days_overdue);
      const invoiceData = {
        id: row.id,
        number: row.number,
        clientName: row.client_name,
        clientId: row.client_id,
        matterName: row.matter_name,
        dueDate: row.due_date,
        total: parseFloat(row.total),
        outstanding,
        daysOverdue,
      };

      if (daysOverdue <= 0) {
        aging.current.invoices.push(invoiceData);
        aging.current.total += outstanding;
      } else if (daysOverdue <= 30) {
        aging['1-30'].invoices.push(invoiceData);
        aging['1-30'].total += outstanding;
      } else if (daysOverdue <= 60) {
        aging['31-60'].invoices.push(invoiceData);
        aging['31-60'].total += outstanding;
      } else if (daysOverdue <= 90) {
        aging['61-90'].invoices.push(invoiceData);
        aging['61-90'].total += outstanding;
      } else {
        aging['90+'].invoices.push(invoiceData);
        aging['90+'].total += outstanding;
      }
    }

    const totalOutstanding = Object.values(aging).reduce((sum, bucket) => sum + bucket.total, 0);

    res.json({
      aging,
      totalOutstanding,
      invoiceCount: result.rows.length,
    });
  } catch (error) {
    console.error('Aging report error:', error);
    res.status(500).json({ error: 'Failed to generate aging report' });
  }
});

export default router;
