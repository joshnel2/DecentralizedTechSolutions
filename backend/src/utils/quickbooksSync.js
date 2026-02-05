/**
 * QuickBooks Sync Utilities
 * Handles two-way sync between Apex and QuickBooks Online
 */

import { query } from '../db/connection.js';

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
    console.log(`Could not fetch ${key} from DB:`, e.message);
  }
  return process.env[envKey] || defaultValue;
}

/**
 * Get QuickBooks integration for a firm
 */
export async function getQuickBooksIntegration(firmId) {
  const result = await query(
    `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'quickbooks' AND is_connected = true`,
    [firmId]
  );
  return result.rows[0] || null;
}

/**
 * Refresh QuickBooks access token if needed
 */
export async function refreshTokenIfNeeded(integration) {
  const QB_CLIENT_ID = await getCredential('quickbooks_client_id', 'QUICKBOOKS_CLIENT_ID');
  const QB_CLIENT_SECRET = await getCredential('quickbooks_client_secret', 'QUICKBOOKS_CLIENT_SECRET');
  
  // Check if token is expired or about to expire (within 5 minutes)
  const expiresAt = new Date(integration.token_expires_at);
  const now = new Date();
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
  
  if (expiresAt > fiveMinutesFromNow) {
    return integration.access_token;
  }
  
  // Refresh the token
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
  
  const tokens = await tokenResponse.json();
  
  if (tokens.error) {
    throw new Error(`Token refresh failed: ${tokens.error}`);
  }
  
  // Update tokens in database
  await query(
    `UPDATE integrations SET access_token = $1, refresh_token = $2, token_expires_at = NOW() + INTERVAL '1 hour'
     WHERE firm_id = $3 AND provider = 'quickbooks'`,
    [tokens.access_token, tokens.refresh_token, integration.firm_id]
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
  // First check if client already has a QuickBooks ID
  const clientResult = await query(
    'SELECT * FROM clients WHERE id = $1 AND firm_id = $2',
    [clientId, firmId]
  );
  
  if (clientResult.rows.length === 0) {
    throw new Error('Client not found');
  }
  
  const client = clientResult.rows[0];
  
  // If already mapped to QuickBooks, return the ID
  if (client.quickbooks_id) {
    return client.quickbooks_id;
  }
  
  const baseUrl = await getQBBaseUrl();
  
  // Try to find existing customer by name or email
  const searchName = client.display_name || `${client.first_name} ${client.last_name}`.trim();
  const searchQuery = `SELECT * FROM Customer WHERE DisplayName = '${searchName.replace(/'/g, "\\'")}'`;
  
  const searchResponse = await fetch(
    `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(searchQuery)}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    }
  );
  
  const searchData = await searchResponse.json();
  
  if (searchData.QueryResponse?.Customer?.length > 0) {
    // Found existing customer
    const qbCustomerId = searchData.QueryResponse.Customer[0].Id;
    
    // Save the mapping
    await query(
      'UPDATE clients SET quickbooks_id = $1, quickbooks_synced_at = NOW() WHERE id = $2',
      [qbCustomerId, clientId]
    );
    
    return qbCustomerId;
  }
  
  // Create new customer in QuickBooks
  const customerData = {
    DisplayName: searchName,
    PrimaryEmailAddr: client.email ? { Address: client.email } : undefined,
    PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : undefined,
    BillAddr: client.address_street ? {
      Line1: client.address_street,
      City: client.address_city,
      CountrySubDivisionCode: client.address_state,
      PostalCode: client.address_zip
    } : undefined
  };
  
  const createResponse = await fetch(
    `${baseUrl}/v3/company/${realmId}/customer`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(customerData)
    }
  );
  
  const createData = await createResponse.json();
  
  if (createData.Customer) {
    const qbCustomerId = createData.Customer.Id;
    
    // Save the mapping
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
    // QuickBooks not connected, mark as not applicable
    await query(
      `UPDATE invoices SET quickbooks_sync_status = 'not_applicable' WHERE id = $1`,
      [invoiceId]
    );
    return { success: false, reason: 'QuickBooks not connected' };
  }
  
  try {
    const accessToken = await refreshTokenIfNeeded(integration);
    const realmId = integration.settings?.realmId;
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
    
    // If already synced, skip
    if (invoice.quickbooks_id) {
      return { success: true, quickbooks_id: invoice.quickbooks_id, message: 'Already synced' };
    }
    
    // Find or create QuickBooks customer
    const qbCustomerId = await findOrCreateQBCustomer(firmId, invoice.client_id, accessToken, realmId);
    
    // Build QuickBooks invoice
    const lineItems = invoice.line_items || [];
    const qbLines = lineItems.map((item, index) => ({
      LineNum: index + 1,
      Amount: item.amount || (item.quantity * item.rate),
      DetailType: 'SalesItemLineDetail',
      Description: item.description,
      SalesItemLineDetail: {
        Qty: item.quantity || 1,
        UnitPrice: item.rate || item.amount
      }
    }));
    
    // If no line items, create a single line
    if (qbLines.length === 0) {
      qbLines.push({
        LineNum: 1,
        Amount: parseFloat(invoice.total),
        DetailType: 'SalesItemLineDetail',
        Description: 'Legal Services',
        SalesItemLineDetail: {
          Qty: 1,
          UnitPrice: parseFloat(invoice.total)
        }
      });
    }
    
    const qbInvoice = {
      CustomerRef: { value: qbCustomerId },
      Line: qbLines,
      DueDate: invoice.due_date?.toISOString?.()?.split('T')[0] || invoice.due_date,
      DocNumber: invoice.number,
      CustomerMemo: invoice.notes ? { value: invoice.notes } : undefined
    };
    
    const response = await fetch(
      `${baseUrl}/v3/company/${realmId}/invoice`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(qbInvoice)
      }
    );
    
    const data = await response.json();
    
    if (data.Invoice) {
      // Success - update invoice with QuickBooks ID
      await query(
        `UPDATE invoices SET 
          quickbooks_id = $1, 
          quickbooks_customer_id = $2,
          quickbooks_sync_status = 'synced', 
          quickbooks_synced_at = NOW(),
          quickbooks_sync_error = NULL
        WHERE id = $3`,
        [data.Invoice.Id, qbCustomerId, invoiceId]
      );
      
      return { success: true, quickbooks_id: data.Invoice.Id };
    } else {
      throw new Error(JSON.stringify(data));
    }
  } catch (error) {
    console.error('QuickBooks invoice push error:', error);
    
    await query(
      `UPDATE invoices SET 
        quickbooks_sync_status = 'failed', 
        quickbooks_sync_error = $1
      WHERE id = $2`,
      [error.message, invoiceId]
    );
    
    return { success: false, error: error.message };
  }
}

/**
 * Push a payment to QuickBooks
 */
export async function pushPaymentToQuickBooks(firmId, paymentId) {
  const integration = await getQuickBooksIntegration(firmId);
  
  if (!integration) {
    // QuickBooks not connected, mark as not applicable
    await query(
      `UPDATE payments SET quickbooks_sync_status = 'not_applicable' WHERE id = $1`,
      [paymentId]
    );
    return { success: false, reason: 'QuickBooks not connected' };
  }
  
  try {
    const accessToken = await refreshTokenIfNeeded(integration);
    const realmId = integration.settings?.realmId;
    const baseUrl = await getQBBaseUrl();
    
    // Get payment details with invoice info
    const paymentResult = await query(
      `SELECT p.*, i.quickbooks_id as invoice_qb_id, i.quickbooks_customer_id, c.quickbooks_id as client_qb_id
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
    
    // If already synced, skip
    if (payment.quickbooks_id) {
      return { success: true, quickbooks_id: payment.quickbooks_id, message: 'Already synced' };
    }
    
    // Need either a QuickBooks invoice or customer to link to
    let qbCustomerId = payment.quickbooks_customer_id || payment.client_qb_id;
    
    if (!qbCustomerId && payment.client_id) {
      // Try to find/create customer
      qbCustomerId = await findOrCreateQBCustomer(firmId, payment.client_id, accessToken, realmId);
    }
    
    if (!qbCustomerId) {
      throw new Error('Cannot sync payment: No QuickBooks customer linked');
    }
    
    // Build QuickBooks payment
    const qbPayment = {
      CustomerRef: { value: qbCustomerId },
      TotalAmt: parseFloat(payment.amount),
      PaymentMethodRef: payment.payment_method ? { value: getQBPaymentMethodId(payment.payment_method) } : undefined,
      PaymentRefNum: payment.reference || undefined,
      TxnDate: payment.payment_date?.toISOString?.()?.split('T')[0] || payment.payment_date,
      PrivateNote: payment.notes || undefined
    };
    
    // Link to invoice if we have QuickBooks invoice ID
    if (payment.invoice_qb_id) {
      qbPayment.Line = [{
        Amount: parseFloat(payment.amount),
        LinkedTxn: [{
          TxnId: payment.invoice_qb_id,
          TxnType: 'Invoice'
        }]
      }];
    }
    
    const response = await fetch(
      `${baseUrl}/v3/company/${realmId}/payment`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(qbPayment)
      }
    );
    
    const data = await response.json();
    
    if (data.Payment) {
      // Success - update payment with QuickBooks ID
      await query(
        `UPDATE payments SET 
          quickbooks_id = $1, 
          quickbooks_sync_status = 'synced', 
          quickbooks_synced_at = NOW(),
          quickbooks_sync_error = NULL
        WHERE id = $2`,
        [data.Payment.Id, paymentId]
      );
      
      return { success: true, quickbooks_id: data.Payment.Id };
    } else {
      throw new Error(JSON.stringify(data));
    }
  } catch (error) {
    console.error('QuickBooks payment push error:', error);
    
    await query(
      `UPDATE payments SET 
        quickbooks_sync_status = 'failed', 
        quickbooks_sync_error = $1
      WHERE id = $2`,
      [error.message, paymentId]
    );
    
    return { success: false, error: error.message };
  }
}

/**
 * Map Apex payment methods to QuickBooks payment method IDs
 */
function getQBPaymentMethodId(method) {
  // QuickBooks has default payment method IDs
  // These may vary by account, but common ones:
  const methodMap = {
    'check': '2',
    'cash': '1', 
    'credit_card': '3',
    'wire': '4',
    'ach': '5',
    'other': '6'
  };
  return methodMap[method] || '6'; // Default to 'other'
}

/**
 * Sync pending items to QuickBooks (batch job)
 */
export async function syncPendingToQuickBooks(firmId) {
  const results = {
    invoices: { synced: 0, failed: 0 },
    payments: { synced: 0, failed: 0 }
  };
  
  // Sync pending invoices
  const pendingInvoices = await query(
    `SELECT id FROM invoices 
     WHERE firm_id = $1 AND quickbooks_sync_status = 'pending' AND status != 'draft'
     LIMIT 50`,
    [firmId]
  );
  
  for (const inv of pendingInvoices.rows) {
    const result = await pushInvoiceToQuickBooks(firmId, inv.id);
    if (result.success) {
      results.invoices.synced++;
    } else {
      results.invoices.failed++;
    }
  }
  
  // Sync pending payments
  const pendingPayments = await query(
    `SELECT id FROM payments 
     WHERE firm_id = $1 AND quickbooks_sync_status = 'pending'
     LIMIT 50`,
    [firmId]
  );
  
  for (const pmt of pendingPayments.rows) {
    const result = await pushPaymentToQuickBooks(firmId, pmt.id);
    if (result.success) {
      results.payments.synced++;
    } else {
      results.payments.failed++;
    }
  }
  
  return results;
}

export default {
  getQuickBooksIntegration,
  refreshTokenIfNeeded,
  findOrCreateQBCustomer,
  pushInvoiceToQuickBooks,
  pushPaymentToQuickBooks,
  syncPendingToQuickBooks
};
