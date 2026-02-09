import { Router } from 'express';
import { query, withTransaction } from '../db/connection.js';
import { authenticate, requirePermission, requireRole } from '../middleware/auth.js';
import { getDateInTimezone, getTodayInTimezone, createDateInTimezone } from '../utils/dateUtils.js';

const router = Router();

// Roles with full billing access
const BILLING_ADMIN_ROLES = ['owner', 'admin', 'billing'];

/**
 * Helper: log a billing audit event
 */
async function logBillingAudit(firmId, userId, action, resourceType, resourceId, changes, req) {
  try {
    await query(
      `INSERT INTO billing_audit_log (firm_id, user_id, action, resource_type, resource_id, changes, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [firmId, userId, action, resourceType, resourceId,
       changes ? JSON.stringify(changes) : null,
       req?.ip || null, req?.headers?.['user-agent']?.substring(0, 500) || null]
    );
  } catch (err) {
    console.error('Billing audit log error:', err);
  }
}

// ============================================
// BILLING SETTINGS (requires billing:settings)
// ============================================

router.get('/settings', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    let result = await query(
      'SELECT * FROM billing_settings WHERE firm_id = $1',
      [req.user.firmId]
    );

    if (result.rows.length === 0) {
      result = await query(
        'INSERT INTO billing_settings (firm_id) VALUES ($1) RETURNING *',
        [req.user.firmId]
      );
    }

    const s = result.rows[0];
    res.json({
      id: s.id,
      defaultPaymentTerms: s.default_payment_terms,
      lateFeeEnabled: s.late_fee_enabled,
      lateFeePercent: parseFloat(s.late_fee_percent),
      lateFeeGraceDays: s.late_fee_grace_days,
      lateFeeType: s.late_fee_type,
      lateFeeCap: s.late_fee_cap ? parseFloat(s.late_fee_cap) : null,
      invoicePrefix: s.invoice_prefix,
      nextInvoiceNumber: s.next_invoice_number,
      autoSendReminders: s.auto_send_reminders,
      reminderDays: s.reminder_days,
      defaultBillingIncrement: s.default_billing_increment,
      roundingMethod: s.rounding_method,
      minimumEntryMinutes: s.minimum_entry_minutes,
      defaultHourlyRate: s.default_hourly_rate ? parseFloat(s.default_hourly_rate) : null,
      requireMatterForTime: s.require_matter_for_time,
      requireDescriptionForTime: s.require_description_for_time,
      requireTimeEntryApproval: s.require_time_entry_approval,
      requireExpenseApproval: s.require_expense_approval,
      autoApproveOwnEntries: s.auto_approve_own_entries,
      acceptCreditCards: s.accept_credit_cards,
      acceptACH: s.accept_ach,
      surchargeEnabled: s.surcharge_enabled,
      surchargePercent: parseFloat(s.surcharge_percent),
      utbmsEnabled: s.utbms_enabled,
      ledesFormat: s.ledes_format,
      requireActivityCode: s.require_activity_code,
      requireTaskCode: s.require_task_code,
      requireTrustRequestApproval: s.require_trust_request_approval,
      minimumTrustBalanceAlert: s.minimum_trust_balance_alert ? parseFloat(s.minimum_trust_balance_alert) : null,
      autoApplyTrustToInvoices: s.auto_apply_trust_to_invoices,
    });
  } catch (error) {
    console.error('Get billing settings error:', error);
    res.status(500).json({ error: 'Failed to get billing settings' });
  }
});

router.put('/settings', authenticate, requirePermission('billing:settings'), async (req, res) => {
  try {
    const {
      defaultPaymentTerms, lateFeeEnabled, lateFeePercent, lateFeeGraceDays,
      lateFeeType, lateFeeCap, invoicePrefix, nextInvoiceNumber,
      autoSendReminders, reminderDays,
      defaultBillingIncrement, roundingMethod, minimumEntryMinutes, defaultHourlyRate,
      requireMatterForTime, requireDescriptionForTime,
      requireTimeEntryApproval, requireExpenseApproval, autoApproveOwnEntries,
      acceptCreditCards, acceptACH, surchargeEnabled, surchargePercent,
      utbmsEnabled, ledesFormat, requireActivityCode, requireTaskCode,
      requireTrustRequestApproval, minimumTrustBalanceAlert, autoApplyTrustToInvoices,
    } = req.body;

    // Validate
    if (lateFeePercent !== undefined && (lateFeePercent < 0 || lateFeePercent > 25)) {
      return res.status(400).json({ error: 'Late fee percent must be between 0 and 25' });
    }
    if (surchargePercent !== undefined && (surchargePercent < 0 || surchargePercent > 10)) {
      return res.status(400).json({ error: 'Surcharge percent must be between 0 and 10' });
    }
    if (defaultHourlyRate !== undefined && (defaultHourlyRate < 0 || defaultHourlyRate > 10000)) {
      return res.status(400).json({ error: 'Default hourly rate must be between 0 and 10000' });
    }
    if (defaultBillingIncrement !== undefined && ![1, 6, 10, 15, 30].includes(defaultBillingIncrement)) {
      return res.status(400).json({ error: 'Billing increment must be 1, 6, 10, 15, or 30 minutes' });
    }

    const result = await query(
      `INSERT INTO billing_settings (firm_id, default_payment_terms, late_fee_enabled, late_fee_percent,
         late_fee_grace_days, late_fee_type, late_fee_cap, invoice_prefix, next_invoice_number,
         auto_send_reminders, reminder_days,
         default_billing_increment, rounding_method, minimum_entry_minutes, default_hourly_rate,
         require_matter_for_time, require_description_for_time,
         require_time_entry_approval, require_expense_approval, auto_approve_own_entries,
         accept_credit_cards, accept_ach, surcharge_enabled, surcharge_percent,
         utbms_enabled, ledes_format, require_activity_code, require_task_code,
         require_trust_request_approval, minimum_trust_balance_alert, auto_apply_trust_to_invoices)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)
       ON CONFLICT (firm_id) DO UPDATE SET
         default_payment_terms = COALESCE($2, billing_settings.default_payment_terms),
         late_fee_enabled = COALESCE($3, billing_settings.late_fee_enabled),
         late_fee_percent = COALESCE($4, billing_settings.late_fee_percent),
         late_fee_grace_days = COALESCE($5, billing_settings.late_fee_grace_days),
         late_fee_type = COALESCE($6, billing_settings.late_fee_type),
         late_fee_cap = COALESCE($7, billing_settings.late_fee_cap),
         invoice_prefix = COALESCE($8, billing_settings.invoice_prefix),
         next_invoice_number = COALESCE($9, billing_settings.next_invoice_number),
         auto_send_reminders = COALESCE($10, billing_settings.auto_send_reminders),
         reminder_days = COALESCE($11, billing_settings.reminder_days),
         default_billing_increment = COALESCE($12, billing_settings.default_billing_increment),
         rounding_method = COALESCE($13, billing_settings.rounding_method),
         minimum_entry_minutes = COALESCE($14, billing_settings.minimum_entry_minutes),
         default_hourly_rate = COALESCE($15, billing_settings.default_hourly_rate),
         require_matter_for_time = COALESCE($16, billing_settings.require_matter_for_time),
         require_description_for_time = COALESCE($17, billing_settings.require_description_for_time),
         require_time_entry_approval = COALESCE($18, billing_settings.require_time_entry_approval),
         require_expense_approval = COALESCE($19, billing_settings.require_expense_approval),
         auto_approve_own_entries = COALESCE($20, billing_settings.auto_approve_own_entries),
         accept_credit_cards = COALESCE($21, billing_settings.accept_credit_cards),
         accept_ach = COALESCE($22, billing_settings.accept_ach),
         surcharge_enabled = COALESCE($23, billing_settings.surcharge_enabled),
         surcharge_percent = COALESCE($24, billing_settings.surcharge_percent),
         utbms_enabled = COALESCE($25, billing_settings.utbms_enabled),
         ledes_format = COALESCE($26, billing_settings.ledes_format),
         require_activity_code = COALESCE($27, billing_settings.require_activity_code),
         require_task_code = COALESCE($28, billing_settings.require_task_code),
         require_trust_request_approval = COALESCE($29, billing_settings.require_trust_request_approval),
         minimum_trust_balance_alert = COALESCE($30, billing_settings.minimum_trust_balance_alert),
         auto_apply_trust_to_invoices = COALESCE($31, billing_settings.auto_apply_trust_to_invoices),
         updated_at = NOW()
       RETURNING *`,
      [
        req.user.firmId, defaultPaymentTerms, lateFeeEnabled, lateFeePercent,
        lateFeeGraceDays, lateFeeType, lateFeeCap, invoicePrefix, nextInvoiceNumber,
        autoSendReminders, reminderDays,
        defaultBillingIncrement, roundingMethod, minimumEntryMinutes, defaultHourlyRate,
        requireMatterForTime, requireDescriptionForTime,
        requireTimeEntryApproval, requireExpenseApproval, autoApproveOwnEntries,
        acceptCreditCards, acceptACH, surchargeEnabled, surchargePercent,
        utbmsEnabled, ledesFormat, requireActivityCode, requireTaskCode,
        requireTrustRequestApproval, minimumTrustBalanceAlert, autoApplyTrustToInvoices
      ]
    );

    logBillingAudit(req.user.firmId, req.user.id, 'billing_settings.updated', 'billing_settings', result.rows[0].id, req.body, req);

    res.json({ message: 'Billing settings updated' });
  } catch (error) {
    console.error('Update billing settings error:', error);
    res.status(500).json({ error: 'Failed to update billing settings' });
  }
});

// ============================================
// INVOICE TEMPLATES
// ============================================

router.get('/invoice-templates', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM invoice_templates WHERE firm_id = $1 ORDER BY is_default DESC, created_at DESC',
      [req.user.firmId]
    );
    res.json({
      invoiceTemplates: result.rows.map(t => ({
        id: t.id, name: t.name, isDefault: t.is_default,
        header: t.header_config, lineItems: t.line_items_config,
        footer: t.footer_config, styling: t.styling,
        createdAt: t.created_at, updatedAt: t.updated_at,
      })),
    });
  } catch (error) {
    console.error('Get invoice templates error:', error);
    res.status(500).json({ error: 'Failed to get invoice templates' });
  }
});

router.post('/invoice-templates', authenticate, requirePermission('billing:settings'), async (req, res) => {
  try {
    const { name, isDefault, header, lineItems, footer, styling } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    if (isDefault) {
      await query('UPDATE invoice_templates SET is_default = false WHERE firm_id = $1', [req.user.firmId]);
    }

    const result = await query(
      `INSERT INTO invoice_templates (firm_id, name, is_default, header_config, line_items_config, footer_config, styling)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.firmId, name, isDefault || false, header || {}, lineItems || {}, footer || {}, styling || {}]
    );

    const t = result.rows[0];
    res.status(201).json({
      id: t.id, name: t.name, isDefault: t.is_default,
      header: t.header_config, lineItems: t.line_items_config,
      footer: t.footer_config, styling: t.styling,
      createdAt: t.created_at,
    });
  } catch (error) {
    console.error('Create invoice template error:', error);
    res.status(500).json({ error: 'Failed to create invoice template' });
  }
});

router.put('/invoice-templates/:id', authenticate, requirePermission('billing:settings'), async (req, res) => {
  try {
    const { name, isDefault, header, lineItems, footer, styling } = req.body;

    if (isDefault) {
      await query('UPDATE invoice_templates SET is_default = false WHERE firm_id = $1 AND id != $2', [req.user.firmId, req.params.id]);
    }

    const result = await query(
      `UPDATE invoice_templates SET
        name = COALESCE($1, name), is_default = COALESCE($2, is_default),
        header_config = COALESCE($3, header_config), line_items_config = COALESCE($4, line_items_config),
        footer_config = COALESCE($5, footer_config), styling = COALESCE($6, styling), updated_at = NOW()
       WHERE id = $7 AND firm_id = $8 RETURNING *`,
      [name, isDefault, header, lineItems, footer, styling, req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice template not found' });

    const t = result.rows[0];
    res.json({ id: t.id, name: t.name, isDefault: t.is_default });
  } catch (error) {
    console.error('Update invoice template error:', error);
    res.status(500).json({ error: 'Failed to update invoice template' });
  }
});

router.delete('/invoice-templates/:id', authenticate, requirePermission('billing:settings'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM invoice_templates WHERE id = $1 AND firm_id = $2 RETURNING id',
      [req.params.id, req.user.firmId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice template not found' });
    res.json({ message: 'Invoice template deleted' });
  } catch (error) {
    console.error('Delete invoice template error:', error);
    res.status(500).json({ error: 'Failed to delete invoice template' });
  }
});

// ============================================
// PAYMENT PROCESSORS (requires billing:settings)
// ============================================

router.get('/payment-processors', authenticate, requirePermission('billing:settings'), async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM payment_processors WHERE firm_id = $1 ORDER BY is_default DESC, created_at DESC',
      [req.user.firmId]
    );
    res.json({
      paymentProcessors: result.rows.map(p => ({
        id: p.id, name: p.name, type: p.type,
        isActive: p.is_active, isDefault: p.is_default,
        // Never expose full credentials - only connection status
        credentials: { isConnected: p.credentials?.isConnected || false },
        fees: p.fees, supportedMethods: p.supported_methods,
        createdAt: p.created_at,
      })),
    });
  } catch (error) {
    console.error('Get payment processors error:', error);
    res.status(500).json({ error: 'Failed to get payment processors' });
  }
});

router.post('/payment-processors', authenticate, requirePermission('billing:settings'), async (req, res) => {
  try {
    const { name, type, isActive, isDefault, credentials, fees, supportedMethods } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'Name and type are required' });

    if (isDefault) {
      await query('UPDATE payment_processors SET is_default = false WHERE firm_id = $1', [req.user.firmId]);
    }

    const result = await query(
      `INSERT INTO payment_processors (firm_id, name, type, is_active, is_default, credentials, fees, supported_methods)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.user.firmId, name, type, isActive || false, isDefault || false, credentials || {}, fees || {}, supportedMethods || []]
    );

    logBillingAudit(req.user.firmId, req.user.id, 'payment_processor.created', 'payment_processor', result.rows[0].id, { name, type }, req);

    const p = result.rows[0];
    res.status(201).json({
      id: p.id, name: p.name, type: p.type, isActive: p.is_active, isDefault: p.is_default,
      credentials: { isConnected: p.credentials?.isConnected || false },
      fees: p.fees, supportedMethods: p.supported_methods,
    });
  } catch (error) {
    console.error('Create payment processor error:', error);
    res.status(500).json({ error: 'Failed to create payment processor' });
  }
});

router.put('/payment-processors/:id', authenticate, requirePermission('billing:settings'), async (req, res) => {
  try {
    const { name, type, isActive, isDefault, credentials, fees, supportedMethods } = req.body;

    if (isDefault) {
      await query('UPDATE payment_processors SET is_default = false WHERE firm_id = $1 AND id != $2', [req.user.firmId, req.params.id]);
    }

    const result = await query(
      `UPDATE payment_processors SET
        name = COALESCE($1, name), type = COALESCE($2, type),
        is_active = COALESCE($3, is_active), is_default = COALESCE($4, is_default),
        credentials = COALESCE($5, credentials), fees = COALESCE($6, fees),
        supported_methods = COALESCE($7, supported_methods), updated_at = NOW()
       WHERE id = $8 AND firm_id = $9 RETURNING *`,
      [name, type, isActive, isDefault, credentials, fees, supportedMethods, req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Payment processor not found' });
    res.json({ message: 'Payment processor updated' });
  } catch (error) {
    console.error('Update payment processor error:', error);
    res.status(500).json({ error: 'Failed to update payment processor' });
  }
});

router.delete('/payment-processors/:id', authenticate, requirePermission('billing:settings'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM payment_processors WHERE id = $1 AND firm_id = $2 RETURNING id',
      [req.params.id, req.user.firmId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Payment processor not found' });

    logBillingAudit(req.user.firmId, req.user.id, 'payment_processor.deleted', 'payment_processor', req.params.id, {}, req);
    res.json({ message: 'Payment processor deleted' });
  } catch (error) {
    console.error('Delete payment processor error:', error);
    res.status(500).json({ error: 'Failed to delete payment processor' });
  }
});

// ============================================
// PAYMENT LINKS
// ============================================

router.get('/payment-links', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    // Non-billing-admin users only see payment links for their invoices
    const isAdmin = BILLING_ADMIN_ROLES.includes(req.user.role);
    let sql = `SELECT pl.*, i.number as invoice_number, c.display_name as client_name
               FROM payment_links pl
               LEFT JOIN invoices i ON pl.invoice_id = i.id
               LEFT JOIN clients c ON pl.client_id = c.id
               WHERE pl.firm_id = $1`;
    const params = [req.user.firmId];

    if (!isAdmin) {
      sql += ' AND i.created_by = $2';
      params.push(req.user.id);
    }

    sql += ' ORDER BY pl.created_at DESC';
    const result = await query(sql, params);

    res.json({
      paymentLinks: result.rows.map(pl => ({
        id: pl.id, invoiceId: pl.invoice_id, invoiceNumber: pl.invoice_number,
        clientId: pl.client_id, clientName: pl.client_name,
        amount: parseFloat(pl.amount), url: pl.url,
        status: pl.status, expiresAt: pl.expires_at, createdAt: pl.created_at,
      })),
    });
  } catch (error) {
    console.error('Get payment links error:', error);
    res.status(500).json({ error: 'Failed to get payment links' });
  }
});

router.post('/payment-links', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const { invoiceId, clientId, amount, expiresAt } = req.body;
    if (!invoiceId || !amount) return res.status(400).json({ error: 'Invoice ID and amount are required' });
    if (amount <= 0) return res.status(400).json({ error: 'Amount must be positive' });

    // Verify invoice exists and belongs to firm
    const invoiceCheck = await query(
      'SELECT id, status FROM invoices WHERE id = $1 AND firm_id = $2',
      [invoiceId, req.user.firmId]
    );
    if (invoiceCheck.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    if (['paid', 'void', 'draft'].includes(invoiceCheck.rows[0].status)) {
      return res.status(400).json({ error: 'Cannot create payment link for a paid, void, or draft invoice' });
    }

    const url = `https://pay.apexlegal.com/${crypto.randomUUID()}`;
    const expiry = expiresAt || createDateInTimezone(getDateInTimezone(30), 23, 59).toISOString();

    const result = await query(
      `INSERT INTO payment_links (firm_id, invoice_id, client_id, amount, url, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.firmId, invoiceId, clientId, amount, url, expiry]
    );

    const pl = result.rows[0];
    res.status(201).json({
      id: pl.id, invoiceId: pl.invoice_id, amount: parseFloat(pl.amount),
      url: pl.url, status: pl.status, expiresAt: pl.expires_at,
    });
  } catch (error) {
    console.error('Create payment link error:', error);
    res.status(500).json({ error: 'Failed to create payment link' });
  }
});

router.put('/payment-links/:id', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'paid', 'expired', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await query(
      'UPDATE payment_links SET status = $1 WHERE id = $2 AND firm_id = $3 RETURNING *',
      [status, req.params.id, req.user.firmId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Payment link not found' });
    res.json({ message: 'Payment link updated' });
  } catch (error) {
    console.error('Update payment link error:', error);
    res.status(500).json({ error: 'Failed to update payment link' });
  }
});

// ============================================
// RECURRING PAYMENTS
// ============================================

router.get('/recurring-payments', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    if (!BILLING_ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied - billing role required' });
    }

    const result = await query(
      `SELECT rp.*, c.display_name as client_name, m.name as matter_name
       FROM recurring_payments rp
       LEFT JOIN clients c ON rp.client_id = c.id
       LEFT JOIN matters m ON rp.matter_id = m.id
       WHERE rp.firm_id = $1 ORDER BY rp.next_payment_date ASC`,
      [req.user.firmId]
    );

    res.json({
      recurringPayments: result.rows.map(rp => ({
        id: rp.id, clientId: rp.client_id, clientName: rp.client_name,
        matterId: rp.matter_id, matterName: rp.matter_name,
        amount: parseFloat(rp.amount), frequency: rp.frequency,
        paymentMethod: rp.payment_method, nextPaymentDate: rp.next_payment_date,
        lastPaymentDate: rp.last_payment_date, status: rp.status,
        createdAt: rp.created_at,
      })),
    });
  } catch (error) {
    console.error('Get recurring payments error:', error);
    res.status(500).json({ error: 'Failed to get recurring payments' });
  }
});

router.post('/recurring-payments', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    if (!BILLING_ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied - billing role required' });
    }

    const { clientId, matterId, amount, frequency, paymentMethod, nextPaymentDate } = req.body;
    if (!clientId || !amount || !frequency || !nextPaymentDate) {
      return res.status(400).json({ error: 'Client ID, amount, frequency, and next payment date are required' });
    }
    if (amount <= 0) return res.status(400).json({ error: 'Amount must be positive' });

    // Verify client
    const clientCheck = await query('SELECT id FROM clients WHERE id = $1 AND firm_id = $2', [clientId, req.user.firmId]);
    if (clientCheck.rows.length === 0) return res.status(404).json({ error: 'Client not found' });

    const result = await query(
      `INSERT INTO recurring_payments (firm_id, client_id, matter_id, amount, frequency, payment_method, next_payment_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.firmId, clientId, matterId, amount, frequency, paymentMethod, nextPaymentDate]
    );

    logBillingAudit(req.user.firmId, req.user.id, 'recurring_payment.created', 'recurring_payment', result.rows[0].id, { clientId, amount, frequency }, req);

    const rp = result.rows[0];
    res.status(201).json({
      id: rp.id, clientId: rp.client_id, amount: parseFloat(rp.amount),
      frequency: rp.frequency, nextPaymentDate: rp.next_payment_date, status: rp.status,
    });
  } catch (error) {
    console.error('Create recurring payment error:', error);
    res.status(500).json({ error: 'Failed to create recurring payment' });
  }
});

router.put('/recurring-payments/:id', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    if (!BILLING_ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { amount, frequency, paymentMethod, nextPaymentDate, lastPaymentDate, status } = req.body;

    const result = await query(
      `UPDATE recurring_payments SET
        amount = COALESCE($1, amount), frequency = COALESCE($2, frequency),
        payment_method = COALESCE($3, payment_method), next_payment_date = COALESCE($4, next_payment_date),
        last_payment_date = COALESCE($5, last_payment_date), status = COALESCE($6, status), updated_at = NOW()
       WHERE id = $7 AND firm_id = $8 RETURNING *`,
      [amount, frequency, paymentMethod, nextPaymentDate, lastPaymentDate, status, req.params.id, req.user.firmId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Recurring payment not found' });
    res.json({ message: 'Recurring payment updated' });
  } catch (error) {
    console.error('Update recurring payment error:', error);
    res.status(500).json({ error: 'Failed to update recurring payment' });
  }
});

router.delete('/recurring-payments/:id', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    if (!BILLING_ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const result = await query(
      'DELETE FROM recurring_payments WHERE id = $1 AND firm_id = $2 RETURNING id',
      [req.params.id, req.user.firmId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Recurring payment not found' });
    res.json({ message: 'Recurring payment deleted' });
  } catch (error) {
    console.error('Delete recurring payment error:', error);
    res.status(500).json({ error: 'Failed to delete recurring payment' });
  }
});

// ============================================
// TRUST ACCOUNTS (requires billing:trust)
// ============================================

router.get('/trust-accounts', authenticate, requirePermission('billing:trust'), async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM trust_accounts WHERE firm_id = $1 ORDER BY created_at DESC',
      [req.user.firmId]
    );
    res.json({
      trustAccounts: result.rows.map(ta => ({
        id: ta.id, bankName: ta.bank_name, accountName: ta.account_name,
        accountNumber: ta.account_number_last4 ? `****${ta.account_number_last4}` : '',
        routingNumber: ta.routing_number_last4 ? `****${ta.routing_number_last4}` : '',
        accountType: ta.account_type, balance: parseFloat(ta.balance),
        isVerified: ta.is_verified, lastReconciled: ta.last_reconciled,
        createdAt: ta.created_at,
      })),
    });
  } catch (error) {
    console.error('Get trust accounts error:', error);
    res.status(500).json({ error: 'Failed to get trust accounts' });
  }
});

router.post('/trust-accounts', authenticate, requirePermission('billing:trust'), async (req, res) => {
  try {
    const { bankName, accountName, accountNumber, routingNumber, accountType, balance, isVerified } = req.body;
    if (!bankName || !accountName) return res.status(400).json({ error: 'Bank name and account name are required' });

    // Validate account type
    if (accountType && !['iolta', 'operating'].includes(accountType)) {
      return res.status(400).json({ error: 'Account type must be iolta or operating' });
    }

    const result = await query(
      `INSERT INTO trust_accounts (firm_id, bank_name, account_name, account_number_last4, routing_number_last4, account_type, balance, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        req.user.firmId, bankName, accountName,
        accountNumber ? accountNumber.slice(-4) : null,
        routingNumber ? routingNumber.slice(-4) : null,
        accountType || 'iolta', balance || 0, isVerified || false
      ]
    );

    logBillingAudit(req.user.firmId, req.user.id, 'trust_account.created', 'trust_account', result.rows[0].id, {
      bankName, accountName, accountType: accountType || 'iolta',
    }, req);

    const ta = result.rows[0];
    res.status(201).json({
      id: ta.id, bankName: ta.bank_name, accountName: ta.account_name,
      accountType: ta.account_type, balance: parseFloat(ta.balance),
      isVerified: ta.is_verified,
    });
  } catch (error) {
    console.error('Create trust account error:', error);
    res.status(500).json({ error: 'Failed to create trust account' });
  }
});

router.put('/trust-accounts/:id', authenticate, requirePermission('billing:trust'), async (req, res) => {
  try {
    const { bankName, accountName, accountType, balance, isVerified, lastReconciled } = req.body;

    // Cannot manually change balance - only through transactions
    if (balance !== undefined) {
      return res.status(400).json({ error: 'Trust account balance can only be changed through trust transactions. This is required for IOLTA compliance.' });
    }

    const result = await query(
      `UPDATE trust_accounts SET
        bank_name = COALESCE($1, bank_name), account_name = COALESCE($2, account_name),
        account_type = COALESCE($3, account_type),
        is_verified = COALESCE($4, is_verified), last_reconciled = COALESCE($5, last_reconciled),
        updated_at = NOW()
       WHERE id = $6 AND firm_id = $7 RETURNING *`,
      [bankName, accountName, accountType, isVerified, lastReconciled, req.params.id, req.user.firmId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Trust account not found' });

    logBillingAudit(req.user.firmId, req.user.id, 'trust_account.updated', 'trust_account', req.params.id, req.body, req);
    res.json({ message: 'Trust account updated' });
  } catch (error) {
    console.error('Update trust account error:', error);
    res.status(500).json({ error: 'Failed to update trust account' });
  }
});

router.delete('/trust-accounts/:id', authenticate, requirePermission('billing:trust'), async (req, res) => {
  try {
    // Prevent deletion of trust accounts with non-zero balance
    const accountCheck = await query(
      'SELECT balance FROM trust_accounts WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );
    if (accountCheck.rows.length === 0) return res.status(404).json({ error: 'Trust account not found' });
    if (parseFloat(accountCheck.rows[0].balance) !== 0) {
      return res.status(400).json({ error: 'Cannot delete a trust account with a non-zero balance. Transfer or withdraw all funds first.' });
    }

    await query('DELETE FROM trust_accounts WHERE id = $1 AND firm_id = $2', [req.params.id, req.user.firmId]);

    logBillingAudit(req.user.firmId, req.user.id, 'trust_account.deleted', 'trust_account', req.params.id, {}, req);
    res.json({ message: 'Trust account deleted' });
  } catch (error) {
    console.error('Delete trust account error:', error);
    res.status(500).json({ error: 'Failed to delete trust account' });
  }
});

// ============================================
// TRUST TRANSACTIONS (requires billing:trust)
// ============================================

router.get('/trust-transactions', authenticate, requirePermission('billing:trust'), async (req, res) => {
  try {
    const { trustAccountId, clientId, startDate, endDate, type, limit = 200, offset = 0 } = req.query;
    
    let sql = `SELECT tt.*, ta.firm_id, ta.account_name,
                      c.display_name as client_name, m.name as matter_name,
                      u.first_name || ' ' || u.last_name as created_by_name
               FROM trust_transactions tt
               JOIN trust_accounts ta ON tt.trust_account_id = ta.id
               LEFT JOIN clients c ON tt.client_id = c.id
               LEFT JOIN matters m ON tt.matter_id = m.id
               LEFT JOIN users u ON tt.created_by = u.id
               WHERE ta.firm_id = $1`;
    const params = [req.user.firmId];
    let paramIndex = 2;

    if (trustAccountId) {
      sql += ` AND tt.trust_account_id = $${paramIndex}`;
      params.push(trustAccountId);
      paramIndex++;
    }
    if (clientId) {
      sql += ` AND tt.client_id = $${paramIndex}`;
      params.push(clientId);
      paramIndex++;
    }
    if (startDate) {
      sql += ` AND tt.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      sql += ` AND tt.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    if (type) {
      sql += ` AND tt.type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    sql += ` ORDER BY tt.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(Math.min(parseInt(limit), 1000), parseInt(offset) || 0);

    const result = await query(sql, params);

    res.json({
      trustTransactions: result.rows.map(tt => ({
        id: tt.id, trustAccountId: tt.trust_account_id, accountName: tt.account_name,
        clientId: tt.client_id, clientName: tt.client_name,
        matterId: tt.matter_id, matterName: tt.matter_name,
        type: tt.type, amount: parseFloat(tt.amount),
        description: tt.description, reference: tt.reference,
        paymentMethod: tt.payment_method, checkNumber: tt.check_number,
        clearedAt: tt.cleared_at, createdBy: tt.created_by,
        createdByName: tt.created_by_name, createdAt: tt.created_at,
      })),
    });
  } catch (error) {
    console.error('Get trust transactions error:', error);
    res.status(500).json({ error: 'Failed to get trust transactions' });
  }
});

router.post('/trust-transactions', authenticate, requirePermission('billing:trust'), async (req, res) => {
  try {
    const { trustAccountId, clientId, matterId, type, amount, description, reference, paymentMethod, checkNumber } = req.body;

    if (!trustAccountId || !clientId || !type || !amount || !description) {
      return res.status(400).json({ error: 'Trust account ID, client ID, type, amount, and description are required' });
    }
    if (parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }
    if (!['deposit', 'withdrawal', 'transfer', 'interest', 'fee'].includes(type)) {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }

    // Verify trust account belongs to firm
    const accountCheck = await query(
      'SELECT id, balance, account_type FROM trust_accounts WHERE id = $1 AND firm_id = $2',
      [trustAccountId, req.user.firmId]
    );
    if (accountCheck.rows.length === 0) return res.status(404).json({ error: 'Trust account not found' });

    // Verify client belongs to firm
    const clientCheck = await query(
      'SELECT id FROM clients WHERE id = $1 AND firm_id = $2',
      [clientId, req.user.firmId]
    );
    if (clientCheck.rows.length === 0) return res.status(404).json({ error: 'Client not found' });

    const currentBalance = parseFloat(accountCheck.rows[0].balance);
    const isWithdrawal = ['withdrawal', 'transfer', 'fee'].includes(type);

    // Prevent overdraft on trust accounts (IOLTA compliance)
    if (isWithdrawal && parseFloat(amount) > currentBalance) {
      return res.status(400).json({ 
        error: `Insufficient trust account balance. Current balance: $${currentBalance.toFixed(2)}, requested: $${parseFloat(amount).toFixed(2)}`,
        code: 'INSUFFICIENT_TRUST_BALANCE'
      });
    }

    let transaction;
    await withTransaction(async (client) => {
      // Update account balance
      const balanceChange = isWithdrawal ? -parseFloat(amount) : parseFloat(amount);
      await client.query(
        'UPDATE trust_accounts SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
        [balanceChange, trustAccountId]
      );

      const result = await client.query(
        `INSERT INTO trust_transactions (trust_account_id, client_id, matter_id, type, amount, description, reference, payment_method, check_number, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [trustAccountId, clientId, matterId, type, amount, description, reference, paymentMethod, checkNumber, req.user.id]
      );
      transaction = result.rows[0];

      // Update client trust balance ledger
      await client.query(
        `INSERT INTO client_trust_balances (firm_id, client_id, trust_account_id, balance)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (firm_id, client_id, trust_account_id) DO UPDATE SET 
           balance = client_trust_balances.balance + $4,
           last_updated = NOW()`,
        [req.user.firmId, clientId, trustAccountId, isWithdrawal ? -parseFloat(amount) : parseFloat(amount)]
      ).catch(() => {}); // Table might not exist yet
    });

    logBillingAudit(req.user.firmId, req.user.id, `trust_transaction.${type}`, 'trust_transaction', transaction.id, {
      trustAccountId, clientId, type, amount: parseFloat(amount),
      previousBalance: currentBalance,
      newBalance: currentBalance + (isWithdrawal ? -parseFloat(amount) : parseFloat(amount)),
    }, req);

    const tt = transaction;
    res.status(201).json({
      id: tt.id, trustAccountId: tt.trust_account_id,
      clientId: tt.client_id, type: tt.type,
      amount: parseFloat(tt.amount), description: tt.description,
      createdAt: tt.created_at,
    });
  } catch (error) {
    console.error('Create trust transaction error:', error);
    res.status(500).json({ error: 'Failed to create trust transaction' });
  }
});

router.put('/trust-transactions/:id', authenticate, requirePermission('billing:trust'), async (req, res) => {
  try {
    const { clearedAt } = req.body;

    // Trust transactions are immutable except for clearing status
    const result = await query(
      `UPDATE trust_transactions SET cleared_at = $1
       WHERE id = $2 AND trust_account_id IN (SELECT id FROM trust_accounts WHERE firm_id = $3)
       RETURNING *`,
      [clearedAt || new Date().toISOString(), req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Trust transaction not found' });

    logBillingAudit(req.user.firmId, req.user.id, 'trust_transaction.cleared', 'trust_transaction', req.params.id, {
      clearedAt: result.rows[0].cleared_at,
    }, req);

    res.json({ message: 'Trust transaction marked as cleared' });
  } catch (error) {
    console.error('Update trust transaction error:', error);
    res.status(500).json({ error: 'Failed to update trust transaction' });
  }
});

// ============================================
// THREE-WAY RECONCILIATION (IOLTA Compliance)
// ============================================

router.get('/trust-accounts/:id/reconciliation', authenticate, requirePermission('billing:trust'), async (req, res) => {
  try {
    const account = await query(
      'SELECT * FROM trust_accounts WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );
    if (account.rows.length === 0) return res.status(404).json({ error: 'Trust account not found' });

    // Get all transactions grouped by client
    const clientBalances = await query(
      `SELECT tt.client_id, c.display_name as client_name,
              SUM(CASE WHEN tt.type IN ('deposit', 'interest') THEN tt.amount ELSE -tt.amount END) as balance
       FROM trust_transactions tt
       LEFT JOIN clients c ON tt.client_id = c.id
       WHERE tt.trust_account_id = $1
       GROUP BY tt.client_id, c.display_name
       HAVING SUM(CASE WHEN tt.type IN ('deposit', 'interest') THEN tt.amount ELSE -tt.amount END) != 0
       ORDER BY c.display_name`,
      [req.params.id]
    );

    // Uncleared transactions
    const unclearedResult = await query(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
       FROM trust_transactions
       WHERE trust_account_id = $1 AND cleared_at IS NULL`,
      [req.params.id]
    );

    const ta = account.rows[0];
    const bankBalance = parseFloat(ta.balance);
    const clientLedgerTotal = clientBalances.rows.reduce((sum, r) => sum + parseFloat(r.balance), 0);
    const discrepancy = Math.round((bankBalance - clientLedgerTotal) * 100) / 100;

    res.json({
      accountId: ta.id,
      accountName: ta.account_name,
      bankBalance,
      clientLedgerTotal,
      isReconciled: Math.abs(discrepancy) < 0.01,
      discrepancy,
      lastReconciled: ta.last_reconciled,
      clientBalances: clientBalances.rows.map(r => ({
        clientId: r.client_id,
        clientName: r.client_name,
        balance: parseFloat(r.balance),
      })),
      unclearedTransactions: {
        count: parseInt(unclearedResult.rows[0].count),
        total: parseFloat(unclearedResult.rows[0].total),
      },
    });
  } catch (error) {
    console.error('Reconciliation error:', error);
    res.status(500).json({ error: 'Failed to generate reconciliation report' });
  }
});

// ============================================
// GET ALL BILLING DATA (for initial load)
// ============================================

router.get('/all', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    const isAdmin = BILLING_ADMIN_ROLES.includes(req.user.role);
    
    // Base queries everyone can access
    const queries = [
      query('SELECT * FROM billing_settings WHERE firm_id = $1', [req.user.firmId]),
      query('SELECT * FROM invoice_templates WHERE firm_id = $1 ORDER BY is_default DESC', [req.user.firmId]),
    ];

    // Admin-only queries
    if (isAdmin) {
      queries.push(
        query('SELECT id, name, type, is_active, is_default, fees, supported_methods, created_at FROM payment_processors WHERE firm_id = $1 ORDER BY is_default DESC', [req.user.firmId]),
        query('SELECT * FROM payment_links WHERE firm_id = $1 ORDER BY created_at DESC LIMIT 100', [req.user.firmId]),
        query('SELECT * FROM recurring_payments WHERE firm_id = $1 ORDER BY next_payment_date ASC', [req.user.firmId]),
        query('SELECT * FROM trust_accounts WHERE firm_id = $1 ORDER BY created_at DESC', [req.user.firmId]),
        query(`SELECT tt.* FROM trust_transactions tt
               JOIN trust_accounts ta ON tt.trust_account_id = ta.id
               WHERE ta.firm_id = $1 ORDER BY tt.created_at DESC LIMIT 200`, [req.user.firmId]),
      );
    } else {
      // Non-admins get empty arrays for restricted data
      queries.push(
        Promise.resolve({ rows: [] }),
        Promise.resolve({ rows: [] }),
        Promise.resolve({ rows: [] }),
        Promise.resolve({ rows: [] }),
        Promise.resolve({ rows: [] }),
      );
    }

    const [settings, templates, processors, links, recurring, trustAccounts, trustTransactions] = await Promise.all(queries);

    const s = settings.rows[0] || {};
    
    res.json({
      billingSettings: settings.rows.length > 0 ? {
        defaultPaymentTerms: s.default_payment_terms,
        lateFeeEnabled: s.late_fee_enabled,
        lateFeePercent: parseFloat(s.late_fee_percent || 0),
        lateFeeGraceDays: s.late_fee_grace_days,
        autoSendReminders: s.auto_send_reminders,
        reminderDays: s.reminder_days,
        defaultBillingIncrement: s.default_billing_increment,
        roundingMethod: s.rounding_method,
        minimumEntryMinutes: s.minimum_entry_minutes,
        defaultHourlyRate: s.default_hourly_rate ? parseFloat(s.default_hourly_rate) : null,
        requireTimeEntryApproval: s.require_time_entry_approval,
        requireExpenseApproval: s.require_expense_approval,
        acceptCreditCards: s.accept_credit_cards,
        acceptACH: s.accept_ach,
        surchargeEnabled: s.surcharge_enabled,
        surchargePercent: parseFloat(s.surcharge_percent || 0),
        utbmsEnabled: s.utbms_enabled,
        requireActivityCode: s.require_activity_code,
      } : null,
      invoiceTemplates: templates.rows.map(t => ({
        id: t.id, name: t.name, isDefault: t.is_default,
        header: t.header_config, lineItems: t.line_items_config,
        footer: t.footer_config, styling: t.styling, createdAt: t.created_at,
      })),
      paymentProcessors: processors.rows.map(p => ({
        id: p.id, name: p.name, type: p.type,
        isActive: p.is_active, isDefault: p.is_default,
        fees: p.fees, supportedMethods: p.supported_methods, createdAt: p.created_at,
      })),
      paymentLinks: links.rows.map(pl => ({
        id: pl.id, invoiceId: pl.invoice_id, clientId: pl.client_id,
        amount: parseFloat(pl.amount), url: pl.url, status: pl.status,
        expiresAt: pl.expires_at, createdAt: pl.created_at,
      })),
      recurringPayments: recurring.rows.map(rp => ({
        id: rp.id, clientId: rp.client_id, matterId: rp.matter_id,
        amount: parseFloat(rp.amount), frequency: rp.frequency,
        paymentMethod: rp.payment_method, nextPaymentDate: rp.next_payment_date,
        lastPaymentDate: rp.last_payment_date, status: rp.status, createdAt: rp.created_at,
      })),
      trustAccounts: trustAccounts.rows.map(ta => ({
        id: ta.id, bankName: ta.bank_name, accountName: ta.account_name,
        accountNumber: ta.account_number_last4 ? `****${ta.account_number_last4}` : '',
        routingNumber: ta.routing_number_last4 ? `****${ta.routing_number_last4}` : '',
        accountType: ta.account_type, balance: parseFloat(ta.balance),
        isVerified: ta.is_verified, lastReconciled: ta.last_reconciled, createdAt: ta.created_at,
      })),
      trustTransactions: trustTransactions.rows.map(tt => ({
        id: tt.id, trustAccountId: tt.trust_account_id,
        clientId: tt.client_id, matterId: tt.matter_id,
        type: tt.type, amount: parseFloat(tt.amount),
        description: tt.description, reference: tt.reference,
        paymentMethod: tt.payment_method, checkNumber: tt.check_number,
        clearedAt: tt.cleared_at, createdBy: tt.created_by, createdAt: tt.created_at,
      })),
    });
  } catch (error) {
    console.error('Get all billing data error:', error);
    res.status(500).json({ error: 'Failed to get billing data' });
  }
});

export default router;
