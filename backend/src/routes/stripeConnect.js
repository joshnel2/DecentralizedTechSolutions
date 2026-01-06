/**
 * Stripe Connect OAuth Routes
 * 
 * Handles connecting law firms to Stripe via OAuth
 * Uses Stripe Connect Standard accounts - firms own their accounts
 * 
 * Also handles:
 * - Payment processing (creating payment intents)
 * - Webhooks for payment events
 * - QuickBooks sync for completed payments
 */

import { Router } from 'express';
import { query, withTransaction } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import express from 'express';

const router = Router();

// Stripe Connect configuration
const STRIPE_CLIENT_ID = process.env.STRIPE_CLIENT_ID;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Initialize Stripe if key is available
let stripe = null;
if (STRIPE_SECRET_KEY) {
  const Stripe = (await import('stripe')).default;
  stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16',
  });
}

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
      console.log('[Stripe→QB] QuickBooks not connected for firm, skipping sync');
      return;
    }

    // Add to sync queue with retry support
    await query(
      `INSERT INTO quickbooks_sync_queue (firm_id, entity_type, entity_id, action, status, next_retry_at)
       VALUES ($1, 'payment', $2, 'create', 'pending', NOW())
       ON CONFLICT DO NOTHING`,
      [firmId, paymentId]
    );

    console.log(`[Stripe→QB] Payment ${paymentId} queued for QuickBooks sync`);
  } catch (error) {
    console.error('[Stripe→QB] Failed to queue payment for QuickBooks sync:', error.message);
  }
}

/**
 * GET /api/stripe/connect/status
 * Get current Stripe connection status for the firm
 */
router.get('/status', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        id,
        stripe_account_id,
        business_name,
        email,
        is_connected,
        charges_enabled,
        payouts_enabled,
        details_submitted,
        default_to_trust,
        trust_account_label,
        operating_account_label,
        accept_cards,
        accept_ach,
        accept_apple_pay,
        accept_google_pay,
        compliance_accepted_at,
        connected_at
      FROM stripe_connections 
      WHERE firm_id = $1 AND is_connected = true`,
      [req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.json({
        connected: false,
        connection: null
      });
    }

    const connection = result.rows[0];

    // If connected, fetch latest status from Stripe
    if (stripe && connection.stripe_account_id) {
      try {
        const account = await stripe.accounts.retrieve(connection.stripe_account_id);
        
        // Update local status if changed
        if (account.charges_enabled !== connection.charges_enabled ||
            account.payouts_enabled !== connection.payouts_enabled ||
            account.details_submitted !== connection.details_submitted) {
          await query(
            `UPDATE stripe_connections 
             SET charges_enabled = $1, payouts_enabled = $2, details_submitted = $3, updated_at = NOW()
             WHERE id = $4`,
            [account.charges_enabled, account.payouts_enabled, account.details_submitted, connection.id]
          );
          connection.charges_enabled = account.charges_enabled;
          connection.payouts_enabled = account.payouts_enabled;
          connection.details_submitted = account.details_submitted;
        }
      } catch (stripeError) {
        console.error('Error fetching Stripe account status:', stripeError.message);
      }
    }

    res.json({
      connected: true,
      connection: {
        id: connection.id,
        stripeAccountId: connection.stripe_account_id,
        businessName: connection.business_name,
        email: connection.email,
        chargesEnabled: connection.charges_enabled,
        payoutsEnabled: connection.payouts_enabled,
        detailsSubmitted: connection.details_submitted,
        settings: {
          defaultToTrust: connection.default_to_trust,
          trustAccountLabel: connection.trust_account_label,
          operatingAccountLabel: connection.operating_account_label,
          acceptCards: connection.accept_cards,
          acceptAch: connection.accept_ach,
          acceptApplePay: connection.accept_apple_pay,
          acceptGooglePay: connection.accept_google_pay,
        },
        complianceAcceptedAt: connection.compliance_accepted_at,
        connectedAt: connection.connected_at
      }
    });
  } catch (error) {
    console.error('Error getting Stripe connection status:', error);
    res.status(500).json({ error: 'Failed to get connection status' });
  }
});

/**
 * GET /api/stripe/connect/oauth-url
 * Generate OAuth URL for connecting to Stripe
 */
router.get('/oauth-url', authenticate, requireRole(['admin', 'owner']), async (req, res) => {
  try {
    if (!STRIPE_CLIENT_ID) {
      return res.status(400).json({ 
        error: 'Stripe Connect is not configured. Please contact support.' 
      });
    }

    // Generate a state token for security
    const state = Buffer.from(JSON.stringify({
      firmId: req.user.firmId,
      userId: req.user.id,
      timestamp: Date.now()
    })).toString('base64');

    // Build the Stripe Connect OAuth URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: STRIPE_CLIENT_ID,
      scope: 'read_write',
      redirect_uri: `${FRONTEND_URL}/app/settings/apex-pay/callback`,
      state: state,
      'stripe_user[business_type]': 'company',
      'stripe_user[country]': 'US',
    });

    const oauthUrl = `https://connect.stripe.com/oauth/authorize?${params.toString()}`;

    res.json({ url: oauthUrl, state });
  } catch (error) {
    console.error('Error generating OAuth URL:', error);
    res.status(500).json({ error: 'Failed to generate connection URL' });
  }
});

/**
 * POST /api/stripe/connect/callback
 * Handle OAuth callback from Stripe
 */
router.post('/callback', authenticate, requireRole(['admin', 'owner']), async (req, res) => {
  try {
    const { code, state } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    if (!stripe) {
      return res.status(400).json({ error: 'Stripe is not configured' });
    }

    // Verify state token
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      if (stateData.firmId !== req.user.firmId) {
        return res.status(400).json({ error: 'Invalid state token' });
      }
      // Check if state is not too old (1 hour)
      if (Date.now() - stateData.timestamp > 3600000) {
        return res.status(400).json({ error: 'Authorization expired. Please try again.' });
      }
    } catch (e) {
      return res.status(400).json({ error: 'Invalid state token' });
    }

    // Exchange authorization code for access token
    const response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code: code,
    });

    const connectedAccountId = response.stripe_user_id;

    // Get account details from Stripe
    const account = await stripe.accounts.retrieve(connectedAccountId);

    // Check if already connected
    const existing = await query(
      'SELECT id FROM stripe_connections WHERE firm_id = $1',
      [req.user.firmId]
    );

    if (existing.rows.length > 0) {
      // Update existing connection
      await query(
        `UPDATE stripe_connections SET
          stripe_account_id = $1,
          business_name = $2,
          email = $3,
          is_connected = true,
          charges_enabled = $4,
          payouts_enabled = $5,
          details_submitted = $6,
          connected_at = NOW(),
          disconnected_at = NULL,
          updated_at = NOW()
        WHERE firm_id = $7`,
        [
          connectedAccountId,
          account.business_profile?.name || account.settings?.dashboard?.display_name || 'Connected Account',
          account.email,
          account.charges_enabled,
          account.payouts_enabled,
          account.details_submitted,
          req.user.firmId
        ]
      );
    } else {
      // Create new connection
      await query(
        `INSERT INTO stripe_connections (
          firm_id, stripe_account_id, business_name, email,
          charges_enabled, payouts_enabled, details_submitted
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          req.user.firmId,
          connectedAccountId,
          account.business_profile?.name || account.settings?.dashboard?.display_name || 'Connected Account',
          account.email,
          account.charges_enabled,
          account.payouts_enabled,
          account.details_submitted
        ]
      );
    }

    res.json({
      success: true,
      accountId: connectedAccountId,
      businessName: account.business_profile?.name || 'Connected Account',
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled
    });
  } catch (error) {
    console.error('Error handling Stripe OAuth callback:', error);
    res.status(500).json({ error: error.message || 'Failed to connect Stripe account' });
  }
});

/**
 * POST /api/stripe/connect/accept-compliance
 * Record that user accepted compliance terms
 */
router.post('/accept-compliance', authenticate, requireRole(['admin', 'owner']), async (req, res) => {
  try {
    const result = await query(
      `UPDATE stripe_connections 
       SET compliance_accepted_at = NOW(), compliance_accepted_by = $1, updated_at = NOW()
       WHERE firm_id = $2
       RETURNING id`,
      [req.user.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No Stripe connection found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error accepting compliance:', error);
    res.status(500).json({ error: 'Failed to record compliance acceptance' });
  }
});

/**
 * PUT /api/stripe/connect/settings
 * Update Stripe connection settings
 */
router.put('/settings', authenticate, requireRole(['admin', 'owner']), async (req, res) => {
  try {
    const {
      defaultToTrust,
      trustAccountLabel,
      operatingAccountLabel,
      acceptCards,
      acceptAch,
      acceptApplePay,
      acceptGooglePay
    } = req.body;

    const result = await query(
      `UPDATE stripe_connections SET
        default_to_trust = COALESCE($1, default_to_trust),
        trust_account_label = COALESCE($2, trust_account_label),
        operating_account_label = COALESCE($3, operating_account_label),
        accept_cards = COALESCE($4, accept_cards),
        accept_ach = COALESCE($5, accept_ach),
        accept_apple_pay = COALESCE($6, accept_apple_pay),
        accept_google_pay = COALESCE($7, accept_google_pay),
        updated_at = NOW()
      WHERE firm_id = $8
      RETURNING *`,
      [
        defaultToTrust,
        trustAccountLabel,
        operatingAccountLabel,
        acceptCards,
        acceptAch,
        acceptApplePay,
        acceptGooglePay,
        req.user.firmId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No Stripe connection found' });
    }

    res.json({ success: true, settings: result.rows[0] });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * POST /api/stripe/connect/disconnect
 * Disconnect Stripe account
 */
router.post('/disconnect', authenticate, requireRole(['admin', 'owner']), async (req, res) => {
  try {
    const result = await query(
      `UPDATE stripe_connections SET
        is_connected = false,
        disconnected_at = NOW(),
        updated_at = NOW()
      WHERE firm_id = $1
      RETURNING stripe_account_id`,
      [req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No Stripe connection found' });
    }

    // Optionally revoke access on Stripe side
    if (stripe && result.rows[0].stripe_account_id) {
      try {
        await stripe.oauth.deauthorize({
          client_id: STRIPE_CLIENT_ID,
          stripe_user_id: result.rows[0].stripe_account_id,
        });
      } catch (stripeError) {
        console.error('Error deauthorizing on Stripe:', stripeError.message);
        // Continue anyway - we've disconnected on our side
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting Stripe:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

/**
 * GET /api/stripe/connect/transactions
 * Get payment transactions
 */
router.get('/transactions', authenticate, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT 
        t.*,
        c.name as client_name,
        m.name as matter_name,
        i.invoice_number
      FROM stripe_transactions t
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN matters m ON t.matter_id = m.id
      LEFT JOIN invoices i ON t.invoice_id = i.id
      WHERE t.firm_id = $1
    `;
    const params = [req.user.firmId];

    if (status && status !== 'all') {
      sql += ` AND t.status = $${params.length + 1}`;
      params.push(status);
    }

    sql += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM stripe_transactions WHERE firm_id = $1`,
      [req.user.firmId]
    );

    res.json({
      transactions: result.rows.map(t => ({
        id: t.id,
        clientName: t.client_name || 'Unknown',
        matterName: t.matter_name || 'N/A',
        invoiceNumber: t.invoice_number,
        amount: t.amount_cents / 100,
        fee: t.fee_cents / 100,
        netAmount: t.net_amount_cents / 100,
        currency: t.currency,
        paymentMethod: t.payment_method,
        cardBrand: t.card_brand,
        cardLast4: t.card_last4,
        accountType: t.account_type,
        status: t.status,
        createdAt: t.created_at
      })),
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

/**
 * GET /api/stripe/connect/stats
 * Get payment statistics
 */
router.get('/stats', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'completed' THEN amount_cents ELSE 0 END), 0) as total_received,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN fee_cents ELSE 0 END), 0) as total_fees,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END), 0) as pending_amount,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
        COUNT(*) as total_count,
        COALESCE(SUM(CASE WHEN status = 'completed' AND account_type = 'operating' THEN net_amount_cents ELSE 0 END), 0) as operating_balance,
        COALESCE(SUM(CASE WHEN status = 'completed' AND account_type = 'trust' THEN net_amount_cents ELSE 0 END), 0) as trust_balance
      FROM stripe_transactions
      WHERE firm_id = $1
    `, [req.user.firmId]);

    const stats = result.rows[0];
    const successRate = stats.total_count > 0 
      ? (parseInt(stats.completed_count) / parseInt(stats.total_count)) * 100 
      : 0;

    res.json({
      totalReceived: parseInt(stats.total_received) / 100,
      totalFees: parseInt(stats.total_fees) / 100,
      pendingAmount: parseInt(stats.pending_amount) / 100,
      successRate: Math.round(successRate * 10) / 10,
      operatingBalance: parseInt(stats.operating_balance) / 100,
      trustBalance: parseInt(stats.trust_balance) / 100,
      transactionCount: parseInt(stats.total_count)
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// ============================================
// PAYMENT PROCESSING (Apex Pay)
// ============================================

/**
 * POST /api/stripe/connect/create-payment-intent
 * Create a payment intent for collecting payment
 */
router.post('/create-payment-intent', authenticate, async (req, res) => {
  try {
    const { 
      amount, 
      invoiceId, 
      clientId, 
      matterId, 
      accountType = 'operating',
      description 
    } = req.body;

    if (!stripe) {
      return res.status(400).json({ error: 'Stripe is not configured' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    // Get firm's Stripe connection
    const connectionResult = await query(
      `SELECT stripe_account_id, charges_enabled FROM stripe_connections 
       WHERE firm_id = $1 AND is_connected = true`,
      [req.user.firmId]
    );

    if (connectionResult.rows.length === 0) {
      return res.status(400).json({ error: 'Stripe not connected. Please connect Apex Pay first.' });
    }

    const { stripe_account_id, charges_enabled } = connectionResult.rows[0];

    if (!charges_enabled) {
      return res.status(400).json({ error: 'Stripe account not fully set up. Please complete onboarding.' });
    }

    // Get client info if provided
    let clientName = 'Client';
    if (clientId) {
      const clientResult = await query(
        'SELECT display_name FROM clients WHERE id = $1 AND firm_id = $2',
        [clientId, req.user.firmId]
      );
      if (clientResult.rows.length > 0) {
        clientName = clientResult.rows[0].display_name;
      }
    }

    // Get invoice info if provided
    let invoiceNumber = null;
    if (invoiceId) {
      const invoiceResult = await query(
        'SELECT number FROM invoices WHERE id = $1 AND firm_id = $2',
        [invoiceId, req.user.firmId]
      );
      if (invoiceResult.rows.length > 0) {
        invoiceNumber = invoiceResult.rows[0].number;
      }
    }

    // Create payment intent on the connected account
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      description: description || `Payment from ${clientName}${invoiceNumber ? ` for Invoice ${invoiceNumber}` : ''}`,
      metadata: {
        firm_id: req.user.firmId,
        client_id: clientId || '',
        invoice_id: invoiceId || '',
        matter_id: matterId || '',
        account_type: accountType,
        created_by: req.user.id
      },
      // Apply platform fee if desired (optional)
      // application_fee_amount: Math.round(amount * 100 * 0.01), // 1% platform fee
    }, {
      stripeAccount: stripe_account_id,
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: amount
    });

  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: error.message || 'Failed to create payment' });
  }
});

/**
 * POST /api/stripe/connect/webhook
 * Handle Stripe webhook events
 * This is called by Stripe when payment events occur
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;

  try {
    // Verify webhook signature if secret is configured
    if (STRIPE_WEBHOOK_SECRET) {
      const sig = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } else {
      // For development without signature verification
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`[Stripe Webhook] Received event: ${event.type}`);

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      case 'charge.refunded':
        await handleRefund(event.data.object);
        break;

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error(`[Stripe Webhook] Error handling ${event.type}:`, error);
    // Still return 200 to prevent Stripe from retrying
    res.json({ received: true, error: error.message });
  }
});

/**
 * Handle successful payment
 * Records transaction, updates invoice, syncs to QuickBooks
 */
async function handlePaymentSucceeded(paymentIntent) {
  console.log(`[Stripe] Payment succeeded: ${paymentIntent.id}`);

  const metadata = paymentIntent.metadata || {};
  const firmId = metadata.firm_id;
  const clientId = metadata.client_id || null;
  const invoiceId = metadata.invoice_id || null;
  const matterId = metadata.matter_id || null;
  const accountType = metadata.account_type || 'operating';

  if (!firmId) {
    console.error('[Stripe] Payment missing firm_id metadata:', paymentIntent.id);
    return;
  }

  // Get charge details for card info
  let cardBrand = null;
  let cardLast4 = null;
  let paymentMethod = 'card';

  if (paymentIntent.latest_charge) {
    try {
      // Find the firm's Stripe account
      const connectionResult = await query(
        'SELECT stripe_account_id FROM stripe_connections WHERE firm_id = $1',
        [firmId]
      );
      
      if (connectionResult.rows.length > 0) {
        const charge = await stripe.charges.retrieve(
          paymentIntent.latest_charge,
          { stripeAccount: connectionResult.rows[0].stripe_account_id }
        );
        
        if (charge.payment_method_details?.card) {
          cardBrand = charge.payment_method_details.card.brand;
          cardLast4 = charge.payment_method_details.card.last4;
        } else if (charge.payment_method_details?.us_bank_account) {
          paymentMethod = 'ach';
          cardLast4 = charge.payment_method_details.us_bank_account.last4;
        }
      }
    } catch (err) {
      console.error('[Stripe] Error fetching charge details:', err.message);
    }
  }

  const amountCents = paymentIntent.amount;
  const feeCents = Math.round(amountCents * 0.029 + 30); // Estimate: 2.9% + $0.30
  const netAmountCents = amountCents - feeCents;

  let paymentId = null;

  await withTransaction(async (client) => {
    // Record the Stripe transaction
    const txnResult = await client.query(
      `INSERT INTO stripe_transactions (
        firm_id, client_id, matter_id, invoice_id,
        stripe_payment_intent_id, amount_cents, fee_cents, net_amount_cents,
        currency, payment_method, card_brand, card_last4, account_type, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'completed')
      RETURNING id`,
      [
        firmId,
        clientId || null,
        matterId || null,
        invoiceId || null,
        paymentIntent.id,
        amountCents,
        feeCents,
        netAmountCents,
        paymentIntent.currency,
        paymentMethod,
        cardBrand,
        cardLast4,
        accountType
      ]
    );

    // Also record in payments table for unified payment tracking
    const paymentResult = await client.query(
      `INSERT INTO payments (
        firm_id, invoice_id, client_id, amount, payment_method,
        reference, payment_date, notes, processor_id, sync_status
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, $7, $8, 'pending')
      RETURNING id`,
      [
        firmId,
        invoiceId || null,
        clientId || null,
        amountCents / 100,
        paymentMethod === 'ach' ? 'ach' : 'apex_pay',
        `Apex Pay - ${cardBrand || 'Card'} ending ${cardLast4 || '****'}`,
        `Paid via Apex Pay${cardBrand ? ` (${cardBrand} •••• ${cardLast4})` : ''}`,
        paymentIntent.id
      ]
    );
    paymentId = paymentResult.rows[0].id;

    // If linked to an invoice, update the invoice
    if (invoiceId) {
      const invoiceResult = await client.query(
        'SELECT total, amount_paid FROM invoices WHERE id = $1 AND firm_id = $2',
        [invoiceId, firmId]
      );

      if (invoiceResult.rows.length > 0) {
        const invoice = invoiceResult.rows[0];
        const newAmountPaid = parseFloat(invoice.amount_paid) + (amountCents / 100);
        const newAmountDue = parseFloat(invoice.total) - newAmountPaid;
        const newStatus = newAmountDue <= 0 ? 'paid' : 'partial';

        await client.query(
          `UPDATE invoices SET 
            amount_paid = $1, 
            status = $2,
            paid_at = CASE WHEN $2 = 'paid' THEN NOW() ELSE paid_at END
          WHERE id = $3`,
          [newAmountPaid, newStatus, invoiceId]
        );
      }
    }
  });

  // Trigger QuickBooks sync (async, don't block)
  if (paymentId) {
    triggerQuickBooksPaymentSync(firmId, paymentId).catch(err => {
      console.error('[Stripe→QB] Async sync trigger failed:', err.message);
    });
  }

  console.log(`[Stripe] Payment recorded successfully: ${paymentIntent.id}, Payment ID: ${paymentId}`);
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(paymentIntent) {
  console.log(`[Stripe] Payment failed: ${paymentIntent.id}`);

  const metadata = paymentIntent.metadata || {};
  const firmId = metadata.firm_id;

  if (!firmId) return;

  // Record the failed attempt
  await query(
    `INSERT INTO stripe_transactions (
      firm_id, client_id, matter_id, invoice_id,
      stripe_payment_intent_id, amount_cents, currency, status,
      error_message
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'failed', $8)
    ON CONFLICT (stripe_payment_intent_id) DO UPDATE SET
      status = 'failed',
      error_message = $8`,
    [
      firmId,
      metadata.client_id || null,
      metadata.matter_id || null,
      metadata.invoice_id || null,
      paymentIntent.id,
      paymentIntent.amount,
      paymentIntent.currency,
      paymentIntent.last_payment_error?.message || 'Payment failed'
    ]
  ).catch(err => console.error('[Stripe] Error recording failed payment:', err.message));
}

/**
 * Handle refund
 */
async function handleRefund(charge) {
  console.log(`[Stripe] Refund processed: ${charge.id}`);

  // Update the transaction status
  await query(
    `UPDATE stripe_transactions SET status = 'refunded' 
     WHERE stripe_payment_intent_id = $1`,
    [charge.payment_intent]
  ).catch(err => console.error('[Stripe] Error updating refund status:', err.message));

  // TODO: Could also create a reverse entry in QuickBooks for the refund
}

/**
 * POST /api/stripe/connect/process-payment
 * Alternative: Process payment directly (for server-side payment confirmation)
 */
router.post('/process-payment', authenticate, async (req, res) => {
  try {
    const { 
      paymentIntentId,
      invoiceId,
      clientId,
      amount,
      paymentMethodId,
      accountType = 'operating'
    } = req.body;

    if (!stripe) {
      return res.status(400).json({ error: 'Stripe is not configured' });
    }

    // Get firm's Stripe connection
    const connectionResult = await query(
      `SELECT stripe_account_id, charges_enabled FROM stripe_connections 
       WHERE firm_id = $1 AND is_connected = true`,
      [req.user.firmId]
    );

    if (connectionResult.rows.length === 0) {
      return res.status(400).json({ error: 'Stripe not connected' });
    }

    const { stripe_account_id } = connectionResult.rows[0];

    let paymentIntent;

    if (paymentIntentId) {
      // Confirm existing payment intent
      paymentIntent = await stripe.paymentIntents.confirm(
        paymentIntentId,
        { payment_method: paymentMethodId },
        { stripeAccount: stripe_account_id }
      );
    } else {
      // Create and confirm new payment intent
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: 'usd',
        payment_method: paymentMethodId,
        confirm: true,
        metadata: {
          firm_id: req.user.firmId,
          client_id: clientId || '',
          invoice_id: invoiceId || '',
          account_type: accountType,
          created_by: req.user.id
        }
      }, {
        stripeAccount: stripe_account_id,
      });
    }

    if (paymentIntent.status === 'succeeded') {
      res.json({
        success: true,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status
      });
    } else if (paymentIntent.status === 'requires_action') {
      res.json({
        success: false,
        requiresAction: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      });
    } else {
      res.json({
        success: false,
        status: paymentIntent.status,
        paymentIntentId: paymentIntent.id
      });
    }

  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ error: error.message || 'Payment processing failed' });
  }
});

export default router;
