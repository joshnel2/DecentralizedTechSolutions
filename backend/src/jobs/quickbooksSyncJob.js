/**
 * QuickBooks Sync Background Job
 * 
 * This job runs periodically to process the QuickBooks sync queue.
 * It handles:
 * - Pending payment syncs
 * - Failed syncs with retry logic
 * - Rate limiting compliance
 * 
 * This is BETTER than Clio because:
 * 1. Automatic retries with exponential backoff
 * 2. Queue-based processing (won't lose data if QB is down)
 * 3. Rate limit awareness
 * 4. Detailed error tracking
 */

import { query } from '../db/connection.js';

// Import the QuickBooks helper functions from integrations
let getQuickBooksAccessToken, createQuickBooksPayment, findOrCreateQuickBooksCustomer;

// Dynamically import to avoid circular dependencies
async function loadQuickBooksHelpers() {
  if (!getQuickBooksAccessToken) {
    const integrations = await import('../routes/integrations.js');
    getQuickBooksAccessToken = integrations.getQuickBooksAccessToken;
    createQuickBooksPayment = integrations.createQuickBooksPayment;
    findOrCreateQuickBooksCustomer = integrations.findOrCreateQuickBooksCustomer;
  }
}

/**
 * Process a single payment sync
 */
async function processPaymentSync(queueItem) {
  await loadQuickBooksHelpers();

  const { firm_id, entity_id } = queueItem;

  // Get payment details
  const paymentResult = await query(
    `SELECT p.*, 
            i.id as invoice_id, i.quickbooks_invoice_id,
            c.id as client_uuid, c.display_name, c.email, c.phone,
            c.address_street, c.address_city, c.address_state, c.address_zip,
            c.quickbooks_customer_id
     FROM payments p
     LEFT JOIN invoices i ON p.invoice_id = i.id
     LEFT JOIN clients c ON p.client_id = c.id
     WHERE p.id = $1 AND p.firm_id = $2`,
    [entity_id, firm_id]
  );

  if (paymentResult.rows.length === 0) {
    throw new Error('Payment not found');
  }

  const paymentRow = paymentResult.rows[0];

  const payment = {
    id: paymentRow.id,
    amount: paymentRow.amount,
    payment_method: paymentRow.payment_method,
    reference: paymentRow.reference,
    payment_date: paymentRow.payment_date,
    notes: paymentRow.notes
  };

  const invoice = paymentRow.invoice_id ? {
    quickbooks_invoice_id: paymentRow.quickbooks_invoice_id
  } : null;

  const client = {
    id: paymentRow.client_uuid,
    display_name: paymentRow.display_name,
    email: paymentRow.email,
    phone: paymentRow.phone,
    address_street: paymentRow.address_street,
    address_city: paymentRow.address_city,
    address_state: paymentRow.address_state,
    address_zip: paymentRow.address_zip,
    quickbooks_customer_id: paymentRow.quickbooks_customer_id
  };

  // Create payment in QuickBooks
  const qbPayment = await createQuickBooksPayment(firm_id, payment, invoice, client);

  // Update payment with QuickBooks ID
  await query(
    `UPDATE payments SET 
      external_id = $1, 
      external_source = 'quickbooks',
      sync_status = 'synced',
      sync_error = NULL,
      synced_at = NOW()
    WHERE id = $2`,
    [qbPayment.Id, entity_id]
  );

  return qbPayment;
}

/**
 * Process a batch of sync items
 */
async function processSyncBatch(items) {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  for (const item of items) {
    try {
      // Mark as processing
      await query(
        `UPDATE quickbooks_sync_queue SET 
          status = 'processing',
          processed_at = NOW()
        WHERE id = $1`,
        [item.id]
      );

      // Process based on entity type
      if (item.entity_type === 'payment' && item.action === 'create') {
        await processPaymentSync(item);
      }
      // Add more entity types as needed (invoice, customer, etc.)

      // Mark as completed
      await query(
        `UPDATE quickbooks_sync_queue SET 
          status = 'completed',
          completed_at = NOW()
        WHERE id = $1`,
        [item.id]
      );

      results.success++;
      console.log(`[QB Sync] Successfully synced ${item.entity_type} ${item.entity_id}`);

    } catch (error) {
      results.failed++;
      results.errors.push({
        id: item.id,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        error: error.message
      });

      // Calculate next retry time with exponential backoff
      const retryCount = item.retry_count + 1;
      const backoffMinutes = Math.min(Math.pow(2, retryCount) * 5, 1440); // Max 24 hours
      const shouldRetry = retryCount < item.max_retries;

      await query(
        `UPDATE quickbooks_sync_queue SET 
          status = $1,
          error_message = $2,
          retry_count = $3,
          next_retry_at = NOW() + INTERVAL '${backoffMinutes} minutes'
        WHERE id = $4`,
        [
          shouldRetry ? 'failed' : 'cancelled',
          error.message,
          retryCount,
          item.id
        ]
      );

      // Also update the payment's sync status
      if (item.entity_type === 'payment') {
        await query(
          `UPDATE payments SET 
            sync_status = $1,
            sync_error = $2,
            retry_count = $3
          WHERE id = $4`,
          [
            shouldRetry ? 'pending_retry' : 'failed',
            error.message,
            retryCount,
            item.entity_id
          ]
        ).catch(e => console.error('[QB Sync] Failed to update payment status:', e.message));
      }

      console.error(`[QB Sync] Failed to sync ${item.entity_type} ${item.entity_id}:`, error.message);
    }

    // Small delay between items to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return results;
}

/**
 * Main sync job function
 * Call this periodically (e.g., every minute)
 */
export async function runQuickBooksSyncJob() {
  console.log('[QB Sync Job] Starting sync job...');

  try {
    // Get pending items that are ready to process
    const pendingItems = await query(
      `SELECT * FROM quickbooks_sync_queue
       WHERE status IN ('pending', 'failed')
       AND (next_retry_at IS NULL OR next_retry_at <= NOW())
       AND retry_count < max_retries
       ORDER BY created_at ASC
       LIMIT 50`
    );

    if (pendingItems.rows.length === 0) {
      console.log('[QB Sync Job] No pending items to process');
      return { processed: 0 };
    }

    console.log(`[QB Sync Job] Processing ${pendingItems.rows.length} items...`);

    const results = await processSyncBatch(pendingItems.rows);

    console.log(`[QB Sync Job] Completed: ${results.success} success, ${results.failed} failed`);

    return {
      processed: pendingItems.rows.length,
      success: results.success,
      failed: results.failed
    };

  } catch (error) {
    console.error('[QB Sync Job] Job failed:', error);
    return { error: error.message };
  }
}

/**
 * Start the sync job on an interval
 * Default: every 60 seconds
 */
let syncInterval = null;

export function startQuickBooksSyncJob(intervalMs = 60000) {
  if (syncInterval) {
    console.log('[QB Sync Job] Job already running');
    return;
  }

  console.log(`[QB Sync Job] Starting job with ${intervalMs}ms interval`);

  // Run immediately on start
  runQuickBooksSyncJob().catch(console.error);

  // Then run on interval
  syncInterval = setInterval(() => {
    runQuickBooksSyncJob().catch(console.error);
  }, intervalMs);
}

export function stopQuickBooksSyncJob() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[QB Sync Job] Job stopped');
  }
}
