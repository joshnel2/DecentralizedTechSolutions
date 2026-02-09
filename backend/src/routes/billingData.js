import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate, requirePermission, requireRole } from '../middleware/auth.js';
import { getDateInTimezone, getTodayInTimezone, createDateInTimezone } from '../utils/dateUtils.js';

const router = Router();

// ============================================
// BILLING SETTINGS
// ============================================

// Get billing settings
router.get('/settings', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    let result = await query(
      'SELECT * FROM billing_settings WHERE firm_id = $1',
      [req.user.firmId]
    );

    // Create default settings if not exists
    if (result.rows.length === 0) {
      result = await query(
        `INSERT INTO billing_settings (firm_id) VALUES ($1) RETURNING *`,
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
      autoSendReminders: s.auto_send_reminders,
      reminderDays: s.reminder_days,
      acceptCreditCards: s.accept_credit_cards,
      acceptACH: s.accept_ach,
      surchargeEnabled: s.surcharge_enabled,
      surchargePercent: parseFloat(s.surcharge_percent),
    });
  } catch (error) {
    console.error('Get billing settings error:', error);
    res.status(500).json({ error: 'Failed to get billing settings' });
  }
});

// Update billing settings
router.put('/settings', authenticate, requireRole('owner', 'admin', 'billing'), async (req, res) => {
  try {
    const {
      defaultPaymentTerms,
      lateFeeEnabled,
      lateFeePercent,
      lateFeeGraceDays,
      autoSendReminders,
      reminderDays,
      acceptCreditCards,
      acceptACH,
      surchargeEnabled,
      surchargePercent,
    } = req.body;

    const result = await query(
      `INSERT INTO billing_settings (firm_id, default_payment_terms, late_fee_enabled, late_fee_percent,
         late_fee_grace_days, auto_send_reminders, reminder_days, accept_credit_cards, accept_ach,
         surcharge_enabled, surcharge_percent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (firm_id) DO UPDATE SET
         default_payment_terms = COALESCE($2, billing_settings.default_payment_terms),
         late_fee_enabled = COALESCE($3, billing_settings.late_fee_enabled),
         late_fee_percent = COALESCE($4, billing_settings.late_fee_percent),
         late_fee_grace_days = COALESCE($5, billing_settings.late_fee_grace_days),
         auto_send_reminders = COALESCE($6, billing_settings.auto_send_reminders),
         reminder_days = COALESCE($7, billing_settings.reminder_days),
         accept_credit_cards = COALESCE($8, billing_settings.accept_credit_cards),
         accept_ach = COALESCE($9, billing_settings.accept_ach),
         surcharge_enabled = COALESCE($10, billing_settings.surcharge_enabled),
         surcharge_percent = COALESCE($11, billing_settings.surcharge_percent),
         updated_at = NOW()
       RETURNING *`,
      [
        req.user.firmId, defaultPaymentTerms, lateFeeEnabled, lateFeePercent,
        lateFeeGraceDays, autoSendReminders, reminderDays, acceptCreditCards, acceptACH,
        surchargeEnabled, surchargePercent
      ]
    );

    const s = result.rows[0];
    res.json({
      id: s.id,
      defaultPaymentTerms: s.default_payment_terms,
      lateFeeEnabled: s.late_fee_enabled,
      lateFeePercent: parseFloat(s.late_fee_percent),
      lateFeeGraceDays: s.late_fee_grace_days,
      autoSendReminders: s.auto_send_reminders,
      reminderDays: s.reminder_days,
      acceptCreditCards: s.accept_credit_cards,
      acceptACH: s.accept_ach,
      surchargeEnabled: s.surcharge_enabled,
      surchargePercent: parseFloat(s.surcharge_percent),
    });
  } catch (error) {
    console.error('Update billing settings error:', error);
    res.status(500).json({ error: 'Failed to update billing settings' });
  }
});

// ============================================
// INVOICE TEMPLATES
// ============================================

// Get all invoice templates
router.get('/invoice-templates', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM invoice_templates WHERE firm_id = $1 ORDER BY is_default DESC, created_at DESC',
      [req.user.firmId]
    );

    res.json({
      invoiceTemplates: result.rows.map(t => ({
        id: t.id,
        name: t.name,
        isDefault: t.is_default,
        header: t.header_config,
        lineItems: t.line_items_config,
        footer: t.footer_config,
        styling: t.styling,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      })),
    });
  } catch (error) {
    console.error('Get invoice templates error:', error);
    res.status(500).json({ error: 'Failed to get invoice templates' });
  }
});

// Create invoice template
router.post('/invoice-templates', authenticate, requireRole('owner', 'admin', 'billing'), async (req, res) => {
  try {
    const { name, isDefault, header, lineItems, footer, styling } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await query(
        'UPDATE invoice_templates SET is_default = false WHERE firm_id = $1',
        [req.user.firmId]
      );
    }

    const result = await query(
      `INSERT INTO invoice_templates (firm_id, name, is_default, header_config, line_items_config, footer_config, styling)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.firmId, name, isDefault || false, header || {}, lineItems || {}, footer || {}, styling || {}]
    );

    const t = result.rows[0];
    res.status(201).json({
      id: t.id,
      name: t.name,
      isDefault: t.is_default,
      header: t.header_config,
      lineItems: t.line_items_config,
      footer: t.footer_config,
      styling: t.styling,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    });
  } catch (error) {
    console.error('Create invoice template error:', error);
    res.status(500).json({ error: 'Failed to create invoice template' });
  }
});

// Update invoice template
router.put('/invoice-templates/:id', authenticate, requireRole('owner', 'admin', 'billing'), async (req, res) => {
  try {
    const { name, isDefault, header, lineItems, footer, styling } = req.body;

    // If setting as default, unset other defaults
    if (isDefault) {
      await query(
        'UPDATE invoice_templates SET is_default = false WHERE firm_id = $1 AND id != $2',
        [req.user.firmId, req.params.id]
      );
    }

    const result = await query(
      `UPDATE invoice_templates SET
        name = COALESCE($1, name),
        is_default = COALESCE($2, is_default),
        header_config = COALESCE($3, header_config),
        line_items_config = COALESCE($4, line_items_config),
        footer_config = COALESCE($5, footer_config),
        styling = COALESCE($6, styling),
        updated_at = NOW()
       WHERE id = $7 AND firm_id = $8
       RETURNING *`,
      [name, isDefault, header, lineItems, footer, styling, req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice template not found' });
    }

    const t = result.rows[0];
    res.json({
      id: t.id,
      name: t.name,
      isDefault: t.is_default,
      header: t.header_config,
      lineItems: t.line_items_config,
      footer: t.footer_config,
      styling: t.styling,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    });
  } catch (error) {
    console.error('Update invoice template error:', error);
    res.status(500).json({ error: 'Failed to update invoice template' });
  }
});

// Delete invoice template
router.delete('/invoice-templates/:id', authenticate, requireRole('owner', 'admin', 'billing'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM invoice_templates WHERE id = $1 AND firm_id = $2 RETURNING id',
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice template not found' });
    }

    res.json({ message: 'Invoice template deleted' });
  } catch (error) {
    console.error('Delete invoice template error:', error);
    res.status(500).json({ error: 'Failed to delete invoice template' });
  }
});

// ============================================
// PAYMENT PROCESSORS
// ============================================

// Get all payment processors - restricted to admin/billing (contains credentials)
router.get('/payment-processors', authenticate, requireRole('owner', 'admin', 'billing'), async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM payment_processors WHERE firm_id = $1 ORDER BY is_default DESC, created_at DESC',
      [req.user.firmId]
    );

    res.json({
      paymentProcessors: result.rows.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        isActive: p.is_active,
        isDefault: p.is_default,
        credentials: p.credentials,
        fees: p.fees,
        supportedMethods: p.supported_methods,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })),
    });
  } catch (error) {
    console.error('Get payment processors error:', error);
    res.status(500).json({ error: 'Failed to get payment processors' });
  }
});

// Create payment processor
router.post('/payment-processors', authenticate, requireRole('owner', 'admin', 'billing'), async (req, res) => {
  try {
    const { name, type, isActive, isDefault, credentials, fees, supportedMethods } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await query(
        'UPDATE payment_processors SET is_default = false WHERE firm_id = $1',
        [req.user.firmId]
      );
    }

    const result = await query(
      `INSERT INTO payment_processors (firm_id, name, type, is_active, is_default, credentials, fees, supported_methods)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.user.firmId, name, type, isActive || false, isDefault || false, credentials || {}, fees || {}, supportedMethods || []]
    );

    const p = result.rows[0];
    res.status(201).json({
      id: p.id,
      name: p.name,
      type: p.type,
      isActive: p.is_active,
      isDefault: p.is_default,
      credentials: p.credentials,
      fees: p.fees,
      supportedMethods: p.supported_methods,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    });
  } catch (error) {
    console.error('Create payment processor error:', error);
    res.status(500).json({ error: 'Failed to create payment processor' });
  }
});

// Update payment processor
router.put('/payment-processors/:id', authenticate, requireRole('owner', 'admin', 'billing'), async (req, res) => {
  try {
    const { name, type, isActive, isDefault, credentials, fees, supportedMethods } = req.body;

    // If setting as default, unset other defaults
    if (isDefault) {
      await query(
        'UPDATE payment_processors SET is_default = false WHERE firm_id = $1 AND id != $2',
        [req.user.firmId, req.params.id]
      );
    }

    const result = await query(
      `UPDATE payment_processors SET
        name = COALESCE($1, name),
        type = COALESCE($2, type),
        is_active = COALESCE($3, is_active),
        is_default = COALESCE($4, is_default),
        credentials = COALESCE($5, credentials),
        fees = COALESCE($6, fees),
        supported_methods = COALESCE($7, supported_methods),
        updated_at = NOW()
       WHERE id = $8 AND firm_id = $9
       RETURNING *`,
      [name, type, isActive, isDefault, credentials, fees, supportedMethods, req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment processor not found' });
    }

    const p = result.rows[0];
    res.json({
      id: p.id,
      name: p.name,
      type: p.type,
      isActive: p.is_active,
      isDefault: p.is_default,
      credentials: p.credentials,
      fees: p.fees,
      supportedMethods: p.supported_methods,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    });
  } catch (error) {
    console.error('Update payment processor error:', error);
    res.status(500).json({ error: 'Failed to update payment processor' });
  }
});

// Delete payment processor
router.delete('/payment-processors/:id', authenticate, requireRole('owner', 'admin', 'billing'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM payment_processors WHERE id = $1 AND firm_id = $2 RETURNING id',
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment processor not found' });
    }

    res.json({ message: 'Payment processor deleted' });
  } catch (error) {
    console.error('Delete payment processor error:', error);
    res.status(500).json({ error: 'Failed to delete payment processor' });
  }
});

// ============================================
// PAYMENT LINKS
// ============================================

// Get all payment links
router.get('/payment-links', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM payment_links WHERE firm_id = $1 ORDER BY created_at DESC',
      [req.user.firmId]
    );

    res.json({
      paymentLinks: result.rows.map(pl => ({
        id: pl.id,
        invoiceId: pl.invoice_id,
        clientId: pl.client_id,
        amount: parseFloat(pl.amount),
        url: pl.url,
        status: pl.status,
        expiresAt: pl.expires_at,
        createdAt: pl.created_at,
      })),
    });
  } catch (error) {
    console.error('Get payment links error:', error);
    res.status(500).json({ error: 'Failed to get payment links' });
  }
});

// Create payment link
router.post('/payment-links', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const { invoiceId, clientId, amount, expiresAt } = req.body;

    if (!invoiceId || !amount) {
      return res.status(400).json({ error: 'Invoice ID and amount are required' });
    }

    const url = `https://pay.apexlegal.com/${crypto.randomUUID()}`;
    // Default expiry is 30 days from today
    const expiry = expiresAt || createDateInTimezone(getDateInTimezone(30), 23, 59).toISOString();

    const result = await query(
      `INSERT INTO payment_links (firm_id, invoice_id, client_id, amount, url, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.firmId, invoiceId, clientId, amount, url, expiry]
    );

    const pl = result.rows[0];
    res.status(201).json({
      id: pl.id,
      invoiceId: pl.invoice_id,
      clientId: pl.client_id,
      amount: parseFloat(pl.amount),
      url: pl.url,
      status: pl.status,
      expiresAt: pl.expires_at,
      createdAt: pl.created_at,
    });
  } catch (error) {
    console.error('Create payment link error:', error);
    res.status(500).json({ error: 'Failed to create payment link' });
  }
});

// Update payment link status
router.put('/payment-links/:id', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const { status } = req.body;

    const result = await query(
      `UPDATE payment_links SET status = $1 WHERE id = $2 AND firm_id = $3 RETURNING *`,
      [status, req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    const pl = result.rows[0];
    res.json({
      id: pl.id,
      invoiceId: pl.invoice_id,
      clientId: pl.client_id,
      amount: parseFloat(pl.amount),
      url: pl.url,
      status: pl.status,
      expiresAt: pl.expires_at,
      createdAt: pl.created_at,
    });
  } catch (error) {
    console.error('Update payment link error:', error);
    res.status(500).json({ error: 'Failed to update payment link' });
  }
});

// ============================================
// RECURRING PAYMENTS
// ============================================

// Get all recurring payments
router.get('/recurring-payments', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM recurring_payments WHERE firm_id = $1 ORDER BY next_payment_date ASC',
      [req.user.firmId]
    );

    res.json({
      recurringPayments: result.rows.map(rp => ({
        id: rp.id,
        clientId: rp.client_id,
        matterId: rp.matter_id,
        amount: parseFloat(rp.amount),
        frequency: rp.frequency,
        paymentMethod: rp.payment_method,
        nextPaymentDate: rp.next_payment_date,
        lastPaymentDate: rp.last_payment_date,
        status: rp.status,
        createdAt: rp.created_at,
        updatedAt: rp.updated_at,
      })),
    });
  } catch (error) {
    console.error('Get recurring payments error:', error);
    res.status(500).json({ error: 'Failed to get recurring payments' });
  }
});

// Create recurring payment
router.post('/recurring-payments', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const { clientId, matterId, amount, frequency, paymentMethod, nextPaymentDate } = req.body;

    if (!clientId || !amount || !frequency || !nextPaymentDate) {
      return res.status(400).json({ error: 'Client ID, amount, frequency, and next payment date are required' });
    }

    const result = await query(
      `INSERT INTO recurring_payments (firm_id, client_id, matter_id, amount, frequency, payment_method, next_payment_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.firmId, clientId, matterId, amount, frequency, paymentMethod, nextPaymentDate]
    );

    const rp = result.rows[0];
    res.status(201).json({
      id: rp.id,
      clientId: rp.client_id,
      matterId: rp.matter_id,
      amount: parseFloat(rp.amount),
      frequency: rp.frequency,
      paymentMethod: rp.payment_method,
      nextPaymentDate: rp.next_payment_date,
      lastPaymentDate: rp.last_payment_date,
      status: rp.status,
      createdAt: rp.created_at,
      updatedAt: rp.updated_at,
    });
  } catch (error) {
    console.error('Create recurring payment error:', error);
    res.status(500).json({ error: 'Failed to create recurring payment' });
  }
});

// Update recurring payment
router.put('/recurring-payments/:id', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const { amount, frequency, paymentMethod, nextPaymentDate, lastPaymentDate, status } = req.body;

    const result = await query(
      `UPDATE recurring_payments SET
        amount = COALESCE($1, amount),
        frequency = COALESCE($2, frequency),
        payment_method = COALESCE($3, payment_method),
        next_payment_date = COALESCE($4, next_payment_date),
        last_payment_date = COALESCE($5, last_payment_date),
        status = COALESCE($6, status),
        updated_at = NOW()
       WHERE id = $7 AND firm_id = $8
       RETURNING *`,
      [amount, frequency, paymentMethod, nextPaymentDate, lastPaymentDate, status, req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recurring payment not found' });
    }

    const rp = result.rows[0];
    res.json({
      id: rp.id,
      clientId: rp.client_id,
      matterId: rp.matter_id,
      amount: parseFloat(rp.amount),
      frequency: rp.frequency,
      paymentMethod: rp.payment_method,
      nextPaymentDate: rp.next_payment_date,
      lastPaymentDate: rp.last_payment_date,
      status: rp.status,
      createdAt: rp.created_at,
      updatedAt: rp.updated_at,
    });
  } catch (error) {
    console.error('Update recurring payment error:', error);
    res.status(500).json({ error: 'Failed to update recurring payment' });
  }
});

// Delete recurring payment
router.delete('/recurring-payments/:id', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM recurring_payments WHERE id = $1 AND firm_id = $2 RETURNING id',
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recurring payment not found' });
    }

    res.json({ message: 'Recurring payment deleted' });
  } catch (error) {
    console.error('Delete recurring payment error:', error);
    res.status(500).json({ error: 'Failed to delete recurring payment' });
  }
});

// ============================================
// TRUST ACCOUNTS (using existing tables)
// ============================================

// Get all trust accounts - sensitive financial data
router.get('/trust-accounts', authenticate, requireRole('owner', 'admin', 'billing'), async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM trust_accounts WHERE firm_id = $1 ORDER BY created_at DESC',
      [req.user.firmId]
    );

    res.json({
      trustAccounts: result.rows.map(ta => ({
        id: ta.id,
        firmId: ta.firm_id,
        bankName: ta.bank_name,
        accountName: ta.account_name,
        accountNumber: ta.account_number_last4 ? `****${ta.account_number_last4}` : '',
        routingNumber: ta.routing_number_last4 ? `****${ta.routing_number_last4}` : '',
        accountType: ta.account_type,
        balance: parseFloat(ta.balance),
        isVerified: ta.is_verified,
        lastReconciled: ta.last_reconciled,
        createdAt: ta.created_at,
        updatedAt: ta.updated_at,
      })),
    });
  } catch (error) {
    console.error('Get trust accounts error:', error);
    res.status(500).json({ error: 'Failed to get trust accounts' });
  }
});

// Create trust account
router.post('/trust-accounts', authenticate, requireRole('owner', 'admin', 'billing'), async (req, res) => {
  try {
    const { bankName, accountName, accountNumber, routingNumber, accountType, balance, isVerified } = req.body;

    if (!bankName || !accountName) {
      return res.status(400).json({ error: 'Bank name and account name are required' });
    }

    const result = await query(
      `INSERT INTO trust_accounts (firm_id, bank_name, account_name, account_number_last4, routing_number_last4, account_type, balance, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.user.firmId, bankName, accountName,
        accountNumber ? accountNumber.slice(-4) : null,
        routingNumber ? routingNumber.slice(-4) : null,
        accountType || 'iolta', balance || 0, isVerified || false
      ]
    );

    const ta = result.rows[0];
    res.status(201).json({
      id: ta.id,
      firmId: ta.firm_id,
      bankName: ta.bank_name,
      accountName: ta.account_name,
      accountNumber: ta.account_number_last4 ? `****${ta.account_number_last4}` : '',
      routingNumber: ta.routing_number_last4 ? `****${ta.routing_number_last4}` : '',
      accountType: ta.account_type,
      balance: parseFloat(ta.balance),
      isVerified: ta.is_verified,
      lastReconciled: ta.last_reconciled,
      createdAt: ta.created_at,
      updatedAt: ta.updated_at,
    });
  } catch (error) {
    console.error('Create trust account error:', error);
    res.status(500).json({ error: 'Failed to create trust account' });
  }
});

// Update trust account
router.put('/trust-accounts/:id', authenticate, requireRole('owner', 'admin', 'billing'), async (req, res) => {
  try {
    const { bankName, accountName, accountType, balance, isVerified, lastReconciled } = req.body;

    const result = await query(
      `UPDATE trust_accounts SET
        bank_name = COALESCE($1, bank_name),
        account_name = COALESCE($2, account_name),
        account_type = COALESCE($3, account_type),
        balance = COALESCE($4, balance),
        is_verified = COALESCE($5, is_verified),
        last_reconciled = COALESCE($6, last_reconciled),
        updated_at = NOW()
       WHERE id = $7 AND firm_id = $8
       RETURNING *`,
      [bankName, accountName, accountType, balance, isVerified, lastReconciled, req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trust account not found' });
    }

    const ta = result.rows[0];
    res.json({
      id: ta.id,
      firmId: ta.firm_id,
      bankName: ta.bank_name,
      accountName: ta.account_name,
      accountNumber: ta.account_number_last4 ? `****${ta.account_number_last4}` : '',
      routingNumber: ta.routing_number_last4 ? `****${ta.routing_number_last4}` : '',
      accountType: ta.account_type,
      balance: parseFloat(ta.balance),
      isVerified: ta.is_verified,
      lastReconciled: ta.last_reconciled,
      createdAt: ta.created_at,
      updatedAt: ta.updated_at,
    });
  } catch (error) {
    console.error('Update trust account error:', error);
    res.status(500).json({ error: 'Failed to update trust account' });
  }
});

// Delete trust account
router.delete('/trust-accounts/:id', authenticate, requireRole('owner', 'admin', 'billing'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM trust_accounts WHERE id = $1 AND firm_id = $2 RETURNING id',
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trust account not found' });
    }

    res.json({ message: 'Trust account deleted' });
  } catch (error) {
    console.error('Delete trust account error:', error);
    res.status(500).json({ error: 'Failed to delete trust account' });
  }
});

// ============================================
// TRUST TRANSACTIONS
// ============================================

// Get all trust transactions
router.get('/trust-transactions', authenticate, requireRole('owner', 'admin', 'billing'), async (req, res) => {
  try {
    const { trustAccountId, clientId } = req.query;
    
    let sql = `SELECT tt.*, ta.firm_id FROM trust_transactions tt
               JOIN trust_accounts ta ON tt.trust_account_id = ta.id
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

    sql += ' ORDER BY tt.created_at DESC';

    const result = await query(sql, params);

    res.json({
      trustTransactions: result.rows.map(tt => ({
        id: tt.id,
        trustAccountId: tt.trust_account_id,
        clientId: tt.client_id,
        matterId: tt.matter_id,
        type: tt.type,
        amount: parseFloat(tt.amount),
        description: tt.description,
        reference: tt.reference,
        paymentMethod: tt.payment_method,
        checkNumber: tt.check_number,
        clearedAt: tt.cleared_at,
        createdBy: tt.created_by,
        createdAt: tt.created_at,
      })),
    });
  } catch (error) {
    console.error('Get trust transactions error:', error);
    res.status(500).json({ error: 'Failed to get trust transactions' });
  }
});

// Create trust transaction
router.post('/trust-transactions', authenticate, requireRole('owner', 'admin', 'billing'), async (req, res) => {
  try {
    const { trustAccountId, clientId, matterId, type, amount, description, reference, paymentMethod, checkNumber } = req.body;

    if (!trustAccountId || !clientId || !type || !amount || !description) {
      return res.status(400).json({ error: 'Trust account ID, client ID, type, amount, and description are required' });
    }

    // Verify trust account belongs to firm
    const accountCheck = await query(
      'SELECT id, balance FROM trust_accounts WHERE id = $1 AND firm_id = $2',
      [trustAccountId, req.user.firmId]
    );

    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Trust account not found' });
    }

    // Update account balance
    const balanceChange = (type === 'deposit' || type === 'interest') ? amount : -amount;
    await query(
      'UPDATE trust_accounts SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
      [balanceChange, trustAccountId]
    );

    const result = await query(
      `INSERT INTO trust_transactions (trust_account_id, client_id, matter_id, type, amount, description, reference, payment_method, check_number, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [trustAccountId, clientId, matterId, type, amount, description, reference, paymentMethod, checkNumber, req.user.id]
    );

    const tt = result.rows[0];
    res.status(201).json({
      id: tt.id,
      trustAccountId: tt.trust_account_id,
      clientId: tt.client_id,
      matterId: tt.matter_id,
      type: tt.type,
      amount: parseFloat(tt.amount),
      description: tt.description,
      reference: tt.reference,
      paymentMethod: tt.payment_method,
      checkNumber: tt.check_number,
      clearedAt: tt.cleared_at,
      createdBy: tt.created_by,
      createdAt: tt.created_at,
    });
  } catch (error) {
    console.error('Create trust transaction error:', error);
    res.status(500).json({ error: 'Failed to create trust transaction' });
  }
});

// Update trust transaction (mark as cleared)
router.put('/trust-transactions/:id', authenticate, requireRole('owner', 'admin', 'billing'), async (req, res) => {
  try {
    const { clearedAt } = req.body;

    const result = await query(
      `UPDATE trust_transactions SET cleared_at = $1
       WHERE id = $2 AND trust_account_id IN (SELECT id FROM trust_accounts WHERE firm_id = $3)
       RETURNING *`,
      [clearedAt || createDateInTimezone(getTodayInTimezone(), 12, 0).toISOString(), req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trust transaction not found' });
    }

    const tt = result.rows[0];
    res.json({
      id: tt.id,
      trustAccountId: tt.trust_account_id,
      clientId: tt.client_id,
      matterId: tt.matter_id,
      type: tt.type,
      amount: parseFloat(tt.amount),
      description: tt.description,
      reference: tt.reference,
      paymentMethod: tt.payment_method,
      checkNumber: tt.check_number,
      clearedAt: tt.cleared_at,
      createdBy: tt.created_by,
      createdAt: tt.created_at,
    });
  } catch (error) {
    console.error('Update trust transaction error:', error);
    res.status(500).json({ error: 'Failed to update trust transaction' });
  }
});

// ============================================
// GET ALL BILLING DATA (for initial load)
// ============================================

router.get('/all', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    const [settings, templates, processors, links, recurring, trustAccounts, trustTransactions] = await Promise.all([
      query('SELECT * FROM billing_settings WHERE firm_id = $1', [req.user.firmId]),
      query('SELECT * FROM invoice_templates WHERE firm_id = $1 ORDER BY is_default DESC', [req.user.firmId]),
      query('SELECT * FROM payment_processors WHERE firm_id = $1 ORDER BY is_default DESC', [req.user.firmId]),
      query('SELECT * FROM payment_links WHERE firm_id = $1 ORDER BY created_at DESC', [req.user.firmId]),
      query('SELECT * FROM recurring_payments WHERE firm_id = $1 ORDER BY next_payment_date ASC', [req.user.firmId]),
      query('SELECT * FROM trust_accounts WHERE firm_id = $1 ORDER BY created_at DESC', [req.user.firmId]),
      query(`SELECT tt.* FROM trust_transactions tt
             JOIN trust_accounts ta ON tt.trust_account_id = ta.id
             WHERE ta.firm_id = $1 ORDER BY tt.created_at DESC`, [req.user.firmId]),
    ]);

    const s = settings.rows[0] || {};
    
    res.json({
      billingSettings: settings.rows.length > 0 ? {
        defaultPaymentTerms: s.default_payment_terms,
        lateFeeEnabled: s.late_fee_enabled,
        lateFeePercent: parseFloat(s.late_fee_percent || 0),
        lateFeeGraceDays: s.late_fee_grace_days,
        autoSendReminders: s.auto_send_reminders,
        reminderDays: s.reminder_days,
        acceptCreditCards: s.accept_credit_cards,
        acceptACH: s.accept_ach,
        surchargeEnabled: s.surcharge_enabled,
        surchargePercent: parseFloat(s.surcharge_percent || 0),
      } : null,
      invoiceTemplates: templates.rows.map(t => ({
        id: t.id,
        name: t.name,
        isDefault: t.is_default,
        header: t.header_config,
        lineItems: t.line_items_config,
        footer: t.footer_config,
        styling: t.styling,
        createdAt: t.created_at,
      })),
      paymentProcessors: processors.rows.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        isActive: p.is_active,
        isDefault: p.is_default,
        credentials: p.credentials,
        fees: p.fees,
        supportedMethods: p.supported_methods,
        createdAt: p.created_at,
      })),
      paymentLinks: links.rows.map(pl => ({
        id: pl.id,
        invoiceId: pl.invoice_id,
        clientId: pl.client_id,
        amount: parseFloat(pl.amount),
        url: pl.url,
        status: pl.status,
        expiresAt: pl.expires_at,
        createdAt: pl.created_at,
      })),
      recurringPayments: recurring.rows.map(rp => ({
        id: rp.id,
        clientId: rp.client_id,
        matterId: rp.matter_id,
        amount: parseFloat(rp.amount),
        frequency: rp.frequency,
        paymentMethod: rp.payment_method,
        nextPaymentDate: rp.next_payment_date,
        lastPaymentDate: rp.last_payment_date,
        status: rp.status,
        createdAt: rp.created_at,
      })),
      trustAccounts: trustAccounts.rows.map(ta => ({
        id: ta.id,
        firmId: ta.firm_id,
        bankName: ta.bank_name,
        accountName: ta.account_name,
        accountNumber: ta.account_number_last4 ? `****${ta.account_number_last4}` : '',
        routingNumber: ta.routing_number_last4 ? `****${ta.routing_number_last4}` : '',
        accountType: ta.account_type,
        balance: parseFloat(ta.balance),
        isVerified: ta.is_verified,
        lastReconciled: ta.last_reconciled,
        createdAt: ta.created_at,
      })),
      trustTransactions: trustTransactions.rows.map(tt => ({
        id: tt.id,
        trustAccountId: tt.trust_account_id,
        clientId: tt.client_id,
        matterId: tt.matter_id,
        type: tt.type,
        amount: parseFloat(tt.amount),
        description: tt.description,
        reference: tt.reference,
        paymentMethod: tt.payment_method,
        checkNumber: tt.check_number,
        clearedAt: tt.cleared_at,
        createdBy: tt.created_by,
        createdAt: tt.created_at,
      })),
    });
  } catch (error) {
    console.error('Get all billing data error:', error);
    res.status(500).json({ error: 'Failed to get billing data' });
  }
});

export default router;
