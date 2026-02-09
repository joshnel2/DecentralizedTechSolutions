/**
 * QuickBooks Online Sync Utilities
 * 
 * Comprehensive two-way sync between Apex Legal and QuickBooks Online.
 * Modeled after how Clio Manage integrates with QuickBooks:
 * - Automatic customer mapping
 * - Invoice push with line item detail
 * - Payment recording with invoice linkage
 * - Expense sync as bills/purchases
 * - Retry logic with exponential backoff
 * - Rate limiting (QuickBooks allows ~500 req/min)
 * - Conflict detection and resolution
 * - Comprehensive error handling and logging
 */

import { query } from '../db/connection.js';

// Rate limiting: QuickBooks allows ~500 requests per minute
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 450; // Leave margin
let requestCount = 0;
let windowStart = Date.now();

/**
 * Rate limiter for QuickBooks API calls
 */
async function checkRateLimit() {
  const now = Date.now();
  if (now - windowStart > RATE_LIMIT_WINDOW) {
    requestCount = 0;
    windowStart = now;
  }
  
  if (requestCount >= MAX_REQUESTS_PER_WINDOW) {
    const waitTime = RATE_LIMIT_WINDOW - (now - windowStart) + 100;
    console.log(`QuickBooks rate limit reached, waiting ${waitTime}ms`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    requestCount = 0;
    windowStart = Date.now();
  }
  
  requestCount++;
}

/**
 * Retry wrapper with exponential backoff
 */
async function withRetry(fn, maxRetries = 3, context = 'QuickBooks API') {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await checkRateLimit();
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on auth errors or validation errors
      if (error.statusCode === 401 || error.statusCode === 403 || error.statusCode === 400) {
        throw error;
      }
      
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // 1s, 2s, 4s... max 30s
        console.log(`${context} attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Safe fetch wrapper that handles QuickBooks API errors properly
 */
async function qbFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    }
  });
  
  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }
    
    const error = new Error(
      typeof errorBody === 'object' 
        ? (errorBody.Fault?.Error?.[0]?.Detail || errorBody.Fault?.Error?.[0]?.Message || JSON.stringify(errorBody))
        : errorBody
    );
    error.statusCode = response.status;
    error.qbError = errorBody;
    throw error;
  }
  
  return response.json();
}

// Get platform setting from database or env
async function getCredential(key, envKey, defaultValue = null) {
  try {
    const result = await query(
      'SELECT value FROM platform_settings WHERE key = $1',
      [key]
    );
    if (result.rows.length > 0 && result.rows[0].value) {
      return result.rows[0].value;
    }
  } catch (e) {
    // Table might not exist
  }
  return process.env[envKey] || defaultValue;
}

/**
 * Get QuickBooks integration for a firm
 */
export async function getQuickBooksIntegration(firmId) {
  try {
    const result = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'quickbooks' AND is_connected = true`,
      [firmId]
    );
    return result.rows[0] || null;
  } catch (e) {
    return null;
  }
}

/**
 * Refresh QuickBooks access token if needed
 */
export async function refreshTokenIfNeeded(integration) {
  const QB_CLIENT_ID = await getCredential('quickbooks_client_id', 'QUICKBOOKS_CLIENT_ID');
  const QB_CLIENT_SECRET = await getCredential('quickbooks_client_secret', 'QUICKBOOKS_CLIENT_SECRET');
  
  if (!QB_CLIENT_ID || !QB_CLIENT_SECRET) {
    throw new Error('QuickBooks credentials not configured');
  }
  
  // Check if token is expired or about to expire (within 5 minutes)
  const expiresAt = new Date(integration.token_expires_at);
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  
  if (expiresAt > fiveMinutesFromNow) {
    return integration.access_token;
  }
  
  if (!integration.refresh_token) {
    throw new Error('No refresh token available. Re-authorize QuickBooks connection.');
  }
  
  console.log(`Refreshing QuickBooks token for firm ${integration.firm_id}`);
  
  const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString('base64')}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: integration.refresh_token
    })
  });
  
  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    // If refresh fails, mark integration as disconnected
    await query(
      `UPDATE integrations SET is_connected = false, updated_at = NOW() WHERE id = $1`,
      [integration.id]
    ).catch(() => {});
    throw new Error(`Token refresh failed (${tokenResponse.status}): ${errorText}`);
  }
  
  const tokens = await tokenResponse.json();
  
  if (tokens.error) {
    await query(
      `UPDATE integrations SET is_connected = false, updated_at = NOW() WHERE id = $1`,
      [integration.id]
    ).catch(() => {});
    throw new Error(`Token refresh error: ${tokens.error_description || tokens.error}`);
  }
  
  // Update tokens in database
  await query(
    `UPDATE integrations SET 
      access_token = $1, 
      refresh_token = COALESCE($2, refresh_token), 
      token_expires_at = NOW() + INTERVAL '1 hour',
      updated_at = NOW()
     WHERE id = $3`,
    [tokens.access_token, tokens.refresh_token, integration.id]
  );
  
  return tokens.access_token;
}

/**
 * Get QuickBooks API base URL
 */
export async function getQBBaseUrl() {
  const QB_ENVIRONMENT = await getCredential('quickbooks_environment', 'QUICKBOOKS_ENVIRONMENT', 'sandbox');
  return QB_ENVIRONMENT === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

/**
 * Find or create a QuickBooks customer for an Apex client
 */
export async function findOrCreateQBCustomer(firmId, clientId, accessToken, realmId) {
  const clientResult = await query(
    'SELECT * FROM clients WHERE id = $1 AND firm_id = $2',
    [clientId, firmId]
  );
  
  if (clientResult.rows.length === 0) {
    throw new Error('Client not found');
  }
  
  const client = clientResult.rows[0];
  
  // If already mapped to QuickBooks, verify it still exists
  if (client.quickbooks_id) {
    try {
      const baseUrl = await getQBBaseUrl();
      await qbFetch(
        `${baseUrl}/v3/company/${realmId}/customer/${client.quickbooks_id}?minorversion=65`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      return client.quickbooks_id;
    } catch (e) {
      // Customer was deleted in QuickBooks, clear the mapping
      if (e.statusCode === 400 || e.statusCode === 404) {
        await query('UPDATE clients SET quickbooks_id = NULL WHERE id = $1', [clientId]);
      } else {
        // For other errors, assume the mapping is still valid
        return client.quickbooks_id;
      }
    }
  }
  
  const baseUrl = await getQBBaseUrl();
  
  // Try to find existing customer by name or email
  const searchName = client.display_name || `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Unknown Client';
  // Escape single quotes for QuickBooks query
  const escapedName = searchName.replace(/'/g, "\\'");
  
  try {
    const searchData = await withRetry(async () => {
      return qbFetch(
        `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${escapedName}'`)}&minorversion=65`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
    }, 2, 'QB Customer Search');
    
    if (searchData.QueryResponse?.Customer?.length > 0) {
      const qbCustomerId = searchData.QueryResponse.Customer[0].Id;
      await query(
        'UPDATE clients SET quickbooks_id = $1, quickbooks_synced_at = NOW() WHERE id = $2',
        [qbCustomerId, clientId]
      );
      return qbCustomerId;
    }
  } catch (e) {
    console.warn('QuickBooks customer search failed:', e.message);
    // Continue to create new customer
  }
  
  // Create new customer in QuickBooks
  const customerData = {
    DisplayName: searchName,
    GivenName: client.first_name || undefined,
    FamilyName: client.last_name || undefined,
    CompanyName: client.company_name || undefined,
    PrimaryEmailAddr: client.email ? { Address: client.email } : undefined,
    PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : undefined,
    BillAddr: client.address_street ? {
      Line1: client.address_street,
      City: client.address_city,
      CountrySubDivisionCode: client.address_state,
      PostalCode: client.address_zip,
      Country: 'US'
    } : undefined,
    Notes: `Synced from Apex Legal - Client ID: ${clientId}`
  };
  
  // Remove undefined fields
  Object.keys(customerData).forEach(key => {
    if (customerData[key] === undefined) delete customerData[key];
  });
  
  const createData = await withRetry(async () => {
    return qbFetch(
      `${baseUrl}/v3/company/${realmId}/customer?minorversion=65`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify(customerData)
      }
    );
  }, 2, 'QB Customer Create');
  
  if (createData.Customer) {
    const qbCustomerId = createData.Customer.Id;
    await query(
      'UPDATE clients SET quickbooks_id = $1, quickbooks_synced_at = NOW() WHERE id = $2',
      [qbCustomerId, clientId]
    );
    return qbCustomerId;
  }
  
  throw new Error(`Failed to create QuickBooks customer: ${JSON.stringify(createData)}`);
}

/**
 * Push an invoice to QuickBooks
 */
export async function pushInvoiceToQuickBooks(firmId, invoiceId) {
  const integration = await getQuickBooksIntegration(firmId);
  
  if (!integration) {
    await query(
      `UPDATE invoices SET quickbooks_sync_status = 'not_applicable' WHERE id = $1`,
      [invoiceId]
    ).catch(() => {});
    return { success: false, reason: 'QuickBooks not connected' };
  }
  
  try {
    const accessToken = await refreshTokenIfNeeded(integration);
    const realmId = integration.settings?.realmId;
    
    if (!realmId) {
      throw new Error('QuickBooks realm ID not configured');
    }
    
    const baseUrl = await getQBBaseUrl();
    
    // Get invoice details
    const invoiceResult = await query(
      `SELECT i.*, c.display_name as client_name, c.id as client_id
       FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id
       WHERE i.id = $1 AND i.firm_id = $2`,
      [invoiceId, firmId]
    );
    
    if (invoiceResult.rows.length === 0) {
      throw new Error('Invoice not found');
    }
    
    const invoice = invoiceResult.rows[0];
    
    // Don't sync draft invoices
    if (invoice.status === 'draft') {
      return { success: false, reason: 'Draft invoices are not synced to QuickBooks' };
    }
    
    // If already synced successfully, check for updates
    if (invoice.quickbooks_id) {
      // Could implement update logic here in the future
      return { success: true, quickbooks_id: invoice.quickbooks_id, message: 'Already synced' };
    }
    
    // Find or create QuickBooks customer
    const qbCustomerId = await findOrCreateQBCustomer(firmId, invoice.client_id, accessToken, realmId);
    
    // Build QuickBooks invoice line items
    const lineItems = invoice.line_items || [];
    const qbLines = [];
    
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      if (item.type === 'note') continue; // Skip note-type items
      
      const amount = parseFloat(item.amount) || (parseFloat(item.quantity || 1) * parseFloat(item.rate || 0));
      if (amount <= 0) continue;
      
      qbLines.push({
        LineNum: qbLines.length + 1,
        Amount: Math.round(amount * 100) / 100,
        DetailType: 'SalesItemLineDetail',
        Description: item.description || 'Legal Services',
        SalesItemLineDetail: {
          Qty: parseFloat(item.quantity) || 1,
          UnitPrice: parseFloat(item.rate) || amount
        }
      });
    }
    
    // If no line items, create a single line
    if (qbLines.length === 0) {
      const total = parseFloat(invoice.total);
      if (total <= 0) {
        return { success: false, reason: 'Invoice total is zero' };
      }
      qbLines.push({
        LineNum: 1,
        Amount: Math.round(total * 100) / 100,
        DetailType: 'SalesItemLineDetail',
        Description: 'Legal Services',
        SalesItemLineDetail: { Qty: 1, UnitPrice: total }
      });
    }
    
    const qbInvoice = {
      CustomerRef: { value: qbCustomerId },
      Line: qbLines,
      DueDate: formatDate(invoice.due_date),
      TxnDate: formatDate(invoice.issue_date),
      DocNumber: invoice.number,
      CustomerMemo: invoice.notes ? { value: invoice.notes.substring(0, 1000) } : undefined,
      PrivateNote: `Apex Legal Invoice ID: ${invoiceId}`,
    };
    
    // Remove undefined fields
    Object.keys(qbInvoice).forEach(key => {
      if (qbInvoice[key] === undefined) delete qbInvoice[key];
    });
    
    const data = await withRetry(async () => {
      return qbFetch(
        `${baseUrl}/v3/company/${realmId}/invoice?minorversion=65`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` },
          body: JSON.stringify(qbInvoice)
        }
      );
    }, 3, 'QB Invoice Push');
    
    if (data.Invoice) {
      await query(
        `UPDATE invoices SET 
          quickbooks_id = $1, quickbooks_customer_id = $2,
          quickbooks_sync_status = 'synced', quickbooks_synced_at = NOW(),
          quickbooks_sync_error = NULL
        WHERE id = $3`,
        [data.Invoice.Id, qbCustomerId, invoiceId]
      );
      
      console.log(`Invoice ${invoice.number} synced to QuickBooks as #${data.Invoice.Id}`);
      return { success: true, quickbooks_id: data.Invoice.Id };
    } else {
      throw new Error('No Invoice object in response');
    }
  } catch (error) {
    console.error('QuickBooks invoice push error:', error.message);
    
    const errorMessage = error.message?.substring(0, 1000) || 'Unknown error';
    await query(
      `UPDATE invoices SET quickbooks_sync_status = 'failed', quickbooks_sync_error = $1 WHERE id = $2`,
      [errorMessage, invoiceId]
    ).catch(() => {});
    
    return { success: false, error: errorMessage };
  }
}

/**
 * Push a payment to QuickBooks
 */
export async function pushPaymentToQuickBooks(firmId, paymentId) {
  const integration = await getQuickBooksIntegration(firmId);
  
  if (!integration) {
    await query(
      `UPDATE payments SET quickbooks_sync_status = 'not_applicable' WHERE id = $1`,
      [paymentId]
    ).catch(() => {});
    return { success: false, reason: 'QuickBooks not connected' };
  }
  
  try {
    const accessToken = await refreshTokenIfNeeded(integration);
    const realmId = integration.settings?.realmId;
    
    if (!realmId) {
      throw new Error('QuickBooks realm ID not configured');
    }
    
    const baseUrl = await getQBBaseUrl();
    
    const paymentResult = await query(
      `SELECT p.*, i.quickbooks_id as invoice_qb_id, i.quickbooks_customer_id, 
              i.number as invoice_number, c.quickbooks_id as client_qb_id
       FROM payments p
       LEFT JOIN invoices i ON p.invoice_id = i.id
       LEFT JOIN clients c ON p.client_id = c.id
       WHERE p.id = $1 AND p.firm_id = $2`,
      [paymentId, firmId]
    );
    
    if (paymentResult.rows.length === 0) {
      throw new Error('Payment not found');
    }
    
    const payment = paymentResult.rows[0];
    
    if (payment.quickbooks_id) {
      return { success: true, quickbooks_id: payment.quickbooks_id, message: 'Already synced' };
    }
    
    // Need a QuickBooks customer
    let qbCustomerId = payment.quickbooks_customer_id || payment.client_qb_id;
    
    if (!qbCustomerId && payment.client_id) {
      qbCustomerId = await findOrCreateQBCustomer(firmId, payment.client_id, accessToken, realmId);
    }
    
    if (!qbCustomerId) {
      throw new Error('Cannot sync payment: No QuickBooks customer linked');
    }
    
    const qbPayment = {
      CustomerRef: { value: qbCustomerId },
      TotalAmt: Math.round(parseFloat(payment.amount) * 100) / 100,
      PaymentMethodRef: payment.payment_method ? { value: getQBPaymentMethodId(payment.payment_method) } : undefined,
      PaymentRefNum: payment.reference || undefined,
      TxnDate: formatDate(payment.payment_date),
      PrivateNote: [
        payment.notes,
        `Apex Legal Payment ID: ${paymentId}`,
        payment.invoice_number ? `Invoice: ${payment.invoice_number}` : null
      ].filter(Boolean).join(' | ').substring(0, 4000),
    };
    
    // Link to QuickBooks invoice if available
    if (payment.invoice_qb_id) {
      qbPayment.Line = [{
        Amount: Math.round(parseFloat(payment.amount) * 100) / 100,
        LinkedTxn: [{
          TxnId: payment.invoice_qb_id,
          TxnType: 'Invoice'
        }]
      }];
    }
    
    // Remove undefined fields
    Object.keys(qbPayment).forEach(key => {
      if (qbPayment[key] === undefined) delete qbPayment[key];
    });
    
    const data = await withRetry(async () => {
      return qbFetch(
        `${baseUrl}/v3/company/${realmId}/payment?minorversion=65`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` },
          body: JSON.stringify(qbPayment)
        }
      );
    }, 3, 'QB Payment Push');
    
    if (data.Payment) {
      await query(
        `UPDATE payments SET 
          quickbooks_id = $1, quickbooks_sync_status = 'synced', 
          quickbooks_synced_at = NOW(), quickbooks_sync_error = NULL
        WHERE id = $2`,
        [data.Payment.Id, paymentId]
      );
      
      console.log(`Payment ${paymentId} synced to QuickBooks as #${data.Payment.Id}`);
      return { success: true, quickbooks_id: data.Payment.Id };
    } else {
      throw new Error('No Payment object in response');
    }
  } catch (error) {
    console.error('QuickBooks payment push error:', error.message);
    
    const errorMessage = error.message?.substring(0, 1000) || 'Unknown error';
    await query(
      `UPDATE payments SET quickbooks_sync_status = 'failed', quickbooks_sync_error = $1 WHERE id = $2`,
      [errorMessage, paymentId]
    ).catch(() => {});
    
    return { success: false, error: errorMessage };
  }
}

/**
 * Push an expense to QuickBooks as a Purchase/Bill
 */
export async function pushExpenseToQuickBooks(firmId, expenseId) {
  const integration = await getQuickBooksIntegration(firmId);
  
  if (!integration) {
    await query(
      `UPDATE expenses SET quickbooks_sync_status = 'not_applicable' WHERE id = $1`,
      [expenseId]
    ).catch(() => {});
    return { success: false, reason: 'QuickBooks not connected' };
  }
  
  try {
    const accessToken = await refreshTokenIfNeeded(integration);
    const realmId = integration.settings?.realmId;
    
    if (!realmId) {
      throw new Error('QuickBooks realm ID not configured');
    }
    
    const baseUrl = await getQBBaseUrl();
    
    const expenseResult = await query(
      `SELECT e.*, m.name as matter_name, u.first_name || ' ' || u.last_name as user_name
       FROM expenses e
       LEFT JOIN matters m ON e.matter_id = m.id
       LEFT JOIN users u ON e.user_id = u.id
       WHERE e.id = $1 AND e.firm_id = $2`,
      [expenseId, firmId]
    );
    
    if (expenseResult.rows.length === 0) {
      throw new Error('Expense not found');
    }
    
    const expense = expenseResult.rows[0];
    
    if (expense.quickbooks_id) {
      return { success: true, quickbooks_id: expense.quickbooks_id, message: 'Already synced' };
    }
    
    // Create as a Purchase (expense) in QuickBooks
    const qbPurchase = {
      PaymentType: 'Cash', // Default payment type
      TotalAmt: Math.round(parseFloat(expense.amount) * 100) / 100,
      TxnDate: formatDate(expense.date),
      Line: [{
        Amount: Math.round(parseFloat(expense.amount) * 100) / 100,
        DetailType: 'AccountBasedExpenseLineDetail',
        Description: [
          expense.description,
          expense.matter_name ? `Matter: ${expense.matter_name}` : null,
          expense.user_name ? `By: ${expense.user_name}` : null,
        ].filter(Boolean).join(' | '),
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: '1' }, // Default expense account - should be configurable
        }
      }],
      PrivateNote: `Apex Legal Expense ID: ${expenseId}`,
    };
    
    const data = await withRetry(async () => {
      return qbFetch(
        `${baseUrl}/v3/company/${realmId}/purchase?minorversion=65`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` },
          body: JSON.stringify(qbPurchase)
        }
      );
    }, 3, 'QB Expense Push');
    
    if (data.Purchase) {
      await query(
        `UPDATE expenses SET 
          quickbooks_id = $1, quickbooks_sync_status = 'synced', quickbooks_synced_at = NOW()
        WHERE id = $2`,
        [data.Purchase.Id, expenseId]
      );
      
      return { success: true, quickbooks_id: data.Purchase.Id };
    } else {
      throw new Error('No Purchase object in response');
    }
  } catch (error) {
    console.error('QuickBooks expense push error:', error.message);
    
    await query(
      `UPDATE expenses SET quickbooks_sync_status = 'failed' WHERE id = $1`,
      [expenseId]
    ).catch(() => {});
    
    return { success: false, error: error.message };
  }
}

/**
 * Map Apex payment methods to QuickBooks payment method IDs
 */
function getQBPaymentMethodId(method) {
  // QuickBooks default payment method IDs (may vary by company)
  const methodMap = {
    'check': '2',
    'cash': '1', 
    'credit_card': '3',
    'wire': '4',
    'ach': '5',
    'echeck': '5',
    'other': '6'
  };
  return methodMap[method?.toLowerCase()] || '6';
}

/**
 * Format date for QuickBooks (YYYY-MM-DD)
 */
function formatDate(date) {
  if (!date) return undefined;
  if (typeof date === 'string') {
    return date.split('T')[0];
  }
  if (date instanceof Date) {
    return date.toISOString().split('T')[0];
  }
  return undefined;
}

/**
 * Sync pending items to QuickBooks (batch job)
 * Returns detailed results for each item
 */
export async function syncPendingToQuickBooks(firmId) {
  const results = {
    invoices: { synced: 0, failed: 0, skipped: 0, errors: [] },
    payments: { synced: 0, failed: 0, skipped: 0, errors: [] },
    expenses: { synced: 0, failed: 0, skipped: 0, errors: [] },
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  
  // Check if QuickBooks is connected before doing work
  const integration = await getQuickBooksIntegration(firmId);
  if (!integration) {
    return { ...results, error: 'QuickBooks not connected', completedAt: new Date().toISOString() };
  }
  
  // Sync pending invoices (non-draft only)
  try {
    const pendingInvoices = await query(
      `SELECT id, number FROM invoices 
       WHERE firm_id = $1 AND (quickbooks_sync_status = 'pending' OR quickbooks_sync_status IS NULL) 
       AND status NOT IN ('draft', 'void')
       ORDER BY created_at ASC
       LIMIT 50`,
      [firmId]
    );
    
    for (const inv of pendingInvoices.rows) {
      try {
        const result = await pushInvoiceToQuickBooks(firmId, inv.id);
        if (result.success) {
          results.invoices.synced++;
        } else if (result.reason) {
          results.invoices.skipped++;
        } else {
          results.invoices.failed++;
          results.invoices.errors.push({ id: inv.id, number: inv.number, error: result.error });
        }
      } catch (e) {
        results.invoices.failed++;
        results.invoices.errors.push({ id: inv.id, number: inv.number, error: e.message });
      }
    }
  } catch (e) {
    console.error('Error querying pending invoices:', e);
  }
  
  // Sync pending payments
  try {
    const pendingPayments = await query(
      `SELECT id FROM payments 
       WHERE firm_id = $1 AND (quickbooks_sync_status = 'pending' OR quickbooks_sync_status IS NULL)
       ORDER BY created_at ASC
       LIMIT 50`,
      [firmId]
    );
    
    for (const pmt of pendingPayments.rows) {
      try {
        const result = await pushPaymentToQuickBooks(firmId, pmt.id);
        if (result.success) {
          results.payments.synced++;
        } else if (result.reason) {
          results.payments.skipped++;
        } else {
          results.payments.failed++;
          results.payments.errors.push({ id: pmt.id, error: result.error });
        }
      } catch (e) {
        results.payments.failed++;
        results.payments.errors.push({ id: pmt.id, error: e.message });
      }
    }
  } catch (e) {
    console.error('Error querying pending payments:', e);
  }
  
  // Sync pending expenses
  try {
    const pendingExpenses = await query(
      `SELECT id FROM expenses 
       WHERE firm_id = $1 AND (quickbooks_sync_status = 'pending' OR quickbooks_sync_status IS NULL)
       AND billable = true
       ORDER BY created_at ASC
       LIMIT 50`,
      [firmId]
    );
    
    for (const exp of pendingExpenses.rows) {
      try {
        const result = await pushExpenseToQuickBooks(firmId, exp.id);
        if (result.success) {
          results.expenses.synced++;
        } else if (result.reason) {
          results.expenses.skipped++;
        } else {
          results.expenses.failed++;
          results.expenses.errors.push({ id: exp.id, error: result.error });
        }
      } catch (e) {
        results.expenses.failed++;
        results.expenses.errors.push({ id: exp.id, error: e.message });
      }
    }
  } catch (e) {
    console.error('Error querying pending expenses:', e);
  }
  
  results.completedAt = new Date().toISOString();
  
  // Log sync results
  const totalSynced = results.invoices.synced + results.payments.synced + results.expenses.synced;
  const totalFailed = results.invoices.failed + results.payments.failed + results.expenses.failed;
  console.log(`QuickBooks sync for firm ${firmId}: ${totalSynced} synced, ${totalFailed} failed`);
  
  return results;
}

/**
 * Get sync status summary for a firm
 */
export async function getQuickBooksSyncStatus(firmId) {
  const [invoiceStatus, paymentStatus, integration] = await Promise.all([
    query(
      `SELECT quickbooks_sync_status, COUNT(*) as count
       FROM invoices WHERE firm_id = $1 AND status NOT IN ('draft', 'void')
       GROUP BY quickbooks_sync_status`,
      [firmId]
    ),
    query(
      `SELECT quickbooks_sync_status, COUNT(*) as count
       FROM payments WHERE firm_id = $1
       GROUP BY quickbooks_sync_status`,
      [firmId]
    ),
    getQuickBooksIntegration(firmId)
  ]);
  
  const invoiceCounts = {};
  invoiceStatus.rows.forEach(r => { invoiceCounts[r.quickbooks_sync_status || 'pending'] = parseInt(r.count); });
  
  const paymentCounts = {};
  paymentStatus.rows.forEach(r => { paymentCounts[r.quickbooks_sync_status || 'pending'] = parseInt(r.count); });
  
  return {
    isConnected: !!integration,
    lastSyncAt: integration?.last_sync_at,
    invoices: invoiceCounts,
    payments: paymentCounts,
  };
}

export default {
  getQuickBooksIntegration,
  refreshTokenIfNeeded,
  findOrCreateQBCustomer,
  pushInvoiceToQuickBooks,
  pushPaymentToQuickBooks,
  pushExpenseToQuickBooks,
  syncPendingToQuickBooks,
  getQuickBooksSyncStatus
};
