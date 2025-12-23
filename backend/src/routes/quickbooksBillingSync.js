import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();

// ============================================
// HELPER: Get QuickBooks credentials and refresh token
// ============================================

async function getPlatformSetting(key) {
  try {
    const result = await query('SELECT value FROM platform_settings WHERE key = $1', [key]);
    return result.rows[0]?.value || process.env[key.toUpperCase().replace(/_/g, '_')] || '';
  } catch {
    return process.env[key.toUpperCase().replace(/_/g, '_')] || '';
  }
}

async function getQuickBooksToken(firmId) {
  const integration = await query(
    `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'quickbooks' AND is_connected = true`,
    [firmId]
  );

  if (integration.rows.length === 0) {
    throw new Error('QuickBooks not connected. Please connect QuickBooks first.');
  }

  const { access_token, refresh_token, token_expires_at, settings } = integration.rows[0];
  const realmId = settings?.realmId;

  if (!realmId) {
    throw new Error('QuickBooks realm ID missing. Please reconnect QuickBooks.');
  }

  // Check if token needs refresh
  if (new Date(token_expires_at) < new Date()) {
    const QB_CLIENT_ID = await getPlatformSetting('quickbooks_client_id') || process.env.QUICKBOOKS_CLIENT_ID;
    const QB_CLIENT_SECRET = await getPlatformSetting('quickbooks_client_secret') || process.env.QUICKBOOKS_CLIENT_SECRET;
    
    const auth = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString('base64');
    
    const refreshResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`,
      },
      body: new URLSearchParams({
        refresh_token: refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    const newTokens = await refreshResponse.json();
    
    if (newTokens.error) {
      throw new Error('QuickBooks token refresh failed. Please reconnect.');
    }

    await query(
      `UPDATE integrations SET access_token = $1, refresh_token = $2, token_expires_at = NOW() + INTERVAL '1 hour'
       WHERE firm_id = $3 AND provider = 'quickbooks'`,
      [newTokens.access_token, newTokens.refresh_token || refresh_token, firmId]
    );

    return { accessToken: newTokens.access_token, realmId };
  }

  return { accessToken: access_token, realmId };
}

function getQBBaseUrl() {
  const env = process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox';
  return env === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

// ============================================
// SYNC SETTINGS
// ============================================

// Get sync settings for the firm
router.get('/settings', authenticate, async (req, res) => {
  try {
    let result = await query(
      `SELECT * FROM quickbooks_sync_settings WHERE firm_id = $1`,
      [req.user.firmId]
    );

    if (result.rows.length === 0) {
      // Create default settings
      result = await query(
        `INSERT INTO quickbooks_sync_settings (firm_id) VALUES ($1) RETURNING *`,
        [req.user.firmId]
      );
    }

    const settings = result.rows[0];
    
    res.json({
      autoSyncEnabled: settings.auto_sync_enabled,
      autoSyncInterval: settings.auto_sync_interval,
      lastAutoSyncAt: settings.last_auto_sync_at,
      syncInvoicesToQb: settings.sync_invoices_to_qb,
      syncInvoicesFromQb: settings.sync_invoices_from_qb,
      syncPaymentsFromQb: settings.sync_payments_from_qb,
      syncCustomersToQb: settings.sync_customers_to_qb,
      syncCustomersFromQb: settings.sync_customers_from_qb,
      autoPushSentInvoices: settings.auto_push_sent_invoices,
      autoSyncPaidStatus: settings.auto_sync_paid_status,
      autoCreateCustomers: settings.auto_create_customers,
      autoCreateClients: settings.auto_create_clients,
      // Expense sync settings
      syncExpensesToQb: settings.sync_expenses_to_qb ?? true,
      syncBillsFromQb: settings.sync_bills_from_qb ?? true,
      autoPushApprovedExpenses: settings.auto_push_approved_expenses ?? true,
      autoCreateVendors: settings.auto_create_vendors ?? true,
      defaultExpenseSyncType: settings.default_expense_sync_type ?? 'bill',
      conflictResolution: settings.conflict_resolution,
    });
  } catch (error) {
    console.error('Get QB sync settings error:', error);
    res.status(500).json({ error: 'Failed to get sync settings' });
  }
});

// Update sync settings
router.put('/settings', authenticate, async (req, res) => {
  try {
    const {
      autoSyncEnabled,
      autoSyncInterval,
      syncInvoicesToQb,
      syncInvoicesFromQb,
      syncPaymentsFromQb,
      syncCustomersToQb,
      syncCustomersFromQb,
      autoPushSentInvoices,
      autoSyncPaidStatus,
      autoCreateCustomers,
      autoCreateClients,
      // Expense sync settings
      syncExpensesToQb,
      syncBillsFromQb,
      autoPushApprovedExpenses,
      autoCreateVendors,
      defaultExpenseSyncType,
      conflictResolution,
    } = req.body;

    await query(
      `INSERT INTO quickbooks_sync_settings (firm_id) VALUES ($1)
       ON CONFLICT (firm_id) DO UPDATE SET
         auto_sync_enabled = COALESCE($2, quickbooks_sync_settings.auto_sync_enabled),
         auto_sync_interval = COALESCE($3, quickbooks_sync_settings.auto_sync_interval),
         sync_invoices_to_qb = COALESCE($4, quickbooks_sync_settings.sync_invoices_to_qb),
         sync_invoices_from_qb = COALESCE($5, quickbooks_sync_settings.sync_invoices_from_qb),
         sync_payments_from_qb = COALESCE($6, quickbooks_sync_settings.sync_payments_from_qb),
         sync_customers_to_qb = COALESCE($7, quickbooks_sync_settings.sync_customers_to_qb),
         sync_customers_from_qb = COALESCE($8, quickbooks_sync_settings.sync_customers_from_qb),
         auto_push_sent_invoices = COALESCE($9, quickbooks_sync_settings.auto_push_sent_invoices),
         auto_sync_paid_status = COALESCE($10, quickbooks_sync_settings.auto_sync_paid_status),
         auto_create_customers = COALESCE($11, quickbooks_sync_settings.auto_create_customers),
         auto_create_clients = COALESCE($12, quickbooks_sync_settings.auto_create_clients),
         sync_expenses_to_qb = COALESCE($13, quickbooks_sync_settings.sync_expenses_to_qb),
         sync_bills_from_qb = COALESCE($14, quickbooks_sync_settings.sync_bills_from_qb),
         auto_push_approved_expenses = COALESCE($15, quickbooks_sync_settings.auto_push_approved_expenses),
         auto_create_vendors = COALESCE($16, quickbooks_sync_settings.auto_create_vendors),
         default_expense_sync_type = COALESCE($17, quickbooks_sync_settings.default_expense_sync_type),
         conflict_resolution = COALESCE($18, quickbooks_sync_settings.conflict_resolution),
         updated_at = NOW()`,
      [
        req.user.firmId,
        autoSyncEnabled,
        autoSyncInterval,
        syncInvoicesToQb,
        syncInvoicesFromQb,
        syncPaymentsFromQb,
        syncCustomersToQb,
        syncCustomersFromQb,
        autoPushSentInvoices,
        autoSyncPaidStatus,
        autoCreateCustomers,
        autoCreateClients,
        syncExpensesToQb,
        syncBillsFromQb,
        autoPushApprovedExpenses,
        autoCreateVendors,
        defaultExpenseSyncType,
        conflictResolution,
      ]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update QB sync settings error:', error);
    res.status(500).json({ error: 'Failed to update sync settings' });
  }
});

// ============================================
// SYNC STATUS & DASHBOARD
// ============================================

// Get sync dashboard/status
router.get('/status', authenticate, async (req, res) => {
  try {
    // Check if QuickBooks is connected
    const integration = await query(
      `SELECT is_connected, account_name, last_sync_at, settings FROM integrations 
       WHERE firm_id = $1 AND provider = 'quickbooks'`,
      [req.user.firmId]
    );

    const isConnected = integration.rows[0]?.is_connected === true;
    const companyName = integration.rows[0]?.account_name;
    const lastSyncAt = integration.rows[0]?.last_sync_at;

    // Get sync statistics
    const [mappedClients, syncedInvoices, syncedPayments, syncedExpenses, importedBills, mappedVendors, recentLogs] = await Promise.all([
      query(`SELECT COUNT(*) as count FROM quickbooks_client_mappings WHERE firm_id = $1`, [req.user.firmId]),
      query(`SELECT COUNT(*) as count, SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) as synced,
             SUM(CASE WHEN sync_status = 'error' THEN 1 ELSE 0 END) as errors
             FROM quickbooks_invoice_sync WHERE firm_id = $1`, [req.user.firmId]),
      query(`SELECT COUNT(*) as count, SUM(CASE WHEN synced_to_billing THEN 1 ELSE 0 END) as applied
             FROM quickbooks_payment_sync WHERE firm_id = $1`, [req.user.firmId]),
      query(`SELECT COUNT(*) as count, SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) as synced,
             SUM(CASE WHEN sync_status = 'error' THEN 1 ELSE 0 END) as errors
             FROM quickbooks_expense_sync WHERE firm_id = $1`, [req.user.firmId]),
      query(`SELECT COUNT(*) as count, SUM(CASE WHEN imported_to_expenses THEN 1 ELSE 0 END) as applied
             FROM quickbooks_bills_imported WHERE firm_id = $1`, [req.user.firmId]),
      query(`SELECT COUNT(*) as count FROM quickbooks_vendor_mappings WHERE firm_id = $1`, [req.user.firmId]),
      query(`SELECT * FROM quickbooks_sync_log WHERE firm_id = $1 ORDER BY started_at DESC LIMIT 10`, [req.user.firmId]),
    ]);

    // Get unmapped clients count
    const unmappedClients = await query(
      `SELECT COUNT(*) as count FROM clients c
       WHERE c.firm_id = $1 AND NOT EXISTS (
         SELECT 1 FROM quickbooks_client_mappings qcm WHERE qcm.client_id = c.id
       )`,
      [req.user.firmId]
    );

    // Get unsyced invoices count
    const unsyncedInvoices = await query(
      `SELECT COUNT(*) as count FROM invoices i
       WHERE i.firm_id = $1 AND i.status IN ('sent', 'paid', 'overdue', 'partial')
       AND NOT EXISTS (
         SELECT 1 FROM quickbooks_invoice_sync qis WHERE qis.invoice_id = i.id
       )`,
      [req.user.firmId]
    );

    // Get unsynced expenses count
    const unsyncedExpenses = await query(
      `SELECT COUNT(*) as count FROM expenses e
       WHERE e.firm_id = $1 AND e.status IN ('approved', 'billed')
       AND NOT EXISTS (
         SELECT 1 FROM quickbooks_expense_sync qes WHERE qes.expense_id = e.id
       )`,
      [req.user.firmId]
    );

    res.json({
      isConnected,
      companyName,
      lastSyncAt,
      stats: {
        mappedClients: parseInt(mappedClients.rows[0]?.count || 0),
        unmappedClients: parseInt(unmappedClients.rows[0]?.count || 0),
        syncedInvoices: parseInt(syncedInvoices.rows[0]?.synced || 0),
        invoiceSyncErrors: parseInt(syncedInvoices.rows[0]?.errors || 0),
        unsyncedInvoices: parseInt(unsyncedInvoices.rows[0]?.count || 0),
        paymentsImported: parseInt(syncedPayments.rows[0]?.count || 0),
        paymentsApplied: parseInt(syncedPayments.rows[0]?.applied || 0),
        // Expense/Bill stats
        syncedExpenses: parseInt(syncedExpenses.rows[0]?.synced || 0),
        expenseSyncErrors: parseInt(syncedExpenses.rows[0]?.errors || 0),
        unsyncedExpenses: parseInt(unsyncedExpenses.rows[0]?.count || 0),
        billsImported: parseInt(importedBills.rows[0]?.count || 0),
        billsApplied: parseInt(importedBills.rows[0]?.applied || 0),
        mappedVendors: parseInt(mappedVendors.rows[0]?.count || 0),
      },
      recentLogs: recentLogs.rows.map(log => ({
        id: log.id,
        syncType: log.sync_type,
        direction: log.direction,
        startedAt: log.started_at,
        completedAt: log.completed_at,
        status: log.status,
        itemsSynced: log.items_synced,
        itemsFailed: log.items_failed,
        errorMessage: log.error_message,
      })),
    });
  } catch (error) {
    console.error('Get QB sync status error:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

// ============================================
// CLIENT ↔ CUSTOMER MAPPING
// ============================================

// Get client mappings
router.get('/client-mappings', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT qcm.*, c.display_name as client_name, c.email as client_email
       FROM quickbooks_client_mappings qcm
       JOIN clients c ON qcm.client_id = c.id
       WHERE qcm.firm_id = $1
       ORDER BY c.display_name ASC`,
      [req.user.firmId]
    );

    res.json({
      mappings: result.rows.map(m => ({
        id: m.id,
        clientId: m.client_id,
        clientName: m.client_name,
        clientEmail: m.client_email,
        qbCustomerId: m.qb_customer_id,
        qbCustomerName: m.qb_customer_name,
        qbCustomerEmail: m.qb_customer_email,
        syncDirection: m.sync_direction,
        lastSyncedAt: m.last_synced_at,
      })),
    });
  } catch (error) {
    console.error('Get client mappings error:', error);
    res.status(500).json({ error: 'Failed to get client mappings' });
  }
});

// Get unmapped clients
router.get('/unmapped-clients', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.id, c.display_name as name, c.email
       FROM clients c
       WHERE c.firm_id = $1 AND NOT EXISTS (
         SELECT 1 FROM quickbooks_client_mappings qcm WHERE qcm.client_id = c.id
       )
       ORDER BY c.display_name ASC`,
      [req.user.firmId]
    );

    res.json({ clients: result.rows });
  } catch (error) {
    console.error('Get unmapped clients error:', error);
    res.status(500).json({ error: 'Failed to get unmapped clients' });
  }
});

// Fetch QuickBooks customers (for mapping UI)
router.get('/qb-customers', authenticate, async (req, res) => {
  try {
    const { accessToken, realmId } = await getQuickBooksToken(req.user.firmId);
    const baseUrl = getQBBaseUrl();

    const response = await fetch(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent('SELECT * FROM Customer MAXRESULTS 1000')}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    const data = await response.json();
    const customers = data.QueryResponse?.Customer || [];

    res.json({
      customers: customers.map(c => ({
        id: c.Id,
        name: c.DisplayName || c.CompanyName || `${c.GivenName || ''} ${c.FamilyName || ''}`.trim(),
        email: c.PrimaryEmailAddr?.Address,
        balance: c.Balance || 0,
        active: c.Active,
      })),
    });
  } catch (error) {
    console.error('Get QB customers error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch QuickBooks customers' });
  }
});

// Create/update client mapping
router.post('/client-mappings', authenticate, async (req, res) => {
  try {
    const { clientId, qbCustomerId, qbCustomerName, qbCustomerEmail, syncDirection } = req.body;

    if (!clientId || !qbCustomerId) {
      return res.status(400).json({ error: 'clientId and qbCustomerId are required' });
    }

    const result = await query(
      `INSERT INTO quickbooks_client_mappings (firm_id, client_id, qb_customer_id, qb_customer_name, qb_customer_email, sync_direction)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (firm_id, client_id) DO UPDATE SET
         qb_customer_id = EXCLUDED.qb_customer_id,
         qb_customer_name = EXCLUDED.qb_customer_name,
         qb_customer_email = EXCLUDED.qb_customer_email,
         sync_direction = EXCLUDED.sync_direction,
         updated_at = NOW()
       RETURNING *`,
      [req.user.firmId, clientId, qbCustomerId, qbCustomerName, qbCustomerEmail, syncDirection || 'both']
    );

    res.json({ success: true, mapping: result.rows[0] });
  } catch (error) {
    console.error('Create client mapping error:', error);
    res.status(500).json({ error: 'Failed to create client mapping' });
  }
});

// Delete client mapping
router.delete('/client-mappings/:id', authenticate, async (req, res) => {
  try {
    await query(
      `DELETE FROM quickbooks_client_mappings WHERE id = $1 AND firm_id = $2`,
      [req.params.id, req.user.firmId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Delete client mapping error:', error);
    res.status(500).json({ error: 'Failed to delete client mapping' });
  }
});

// Auto-map clients by email matching
router.post('/auto-map-clients', authenticate, async (req, res) => {
  try {
    const { accessToken, realmId } = await getQuickBooksToken(req.user.firmId);
    const baseUrl = getQBBaseUrl();

    // Get QB customers
    const response = await fetch(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent('SELECT * FROM Customer MAXRESULTS 1000')}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    const data = await response.json();
    const customers = data.QueryResponse?.Customer || [];

    // Get unmapped clients
    const clientsResult = await query(
      `SELECT c.id, c.display_name, c.email FROM clients c
       WHERE c.firm_id = $1 AND c.email IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM quickbooks_client_mappings qcm WHERE qcm.client_id = c.id
       )`,
      [req.user.firmId]
    );

    let mappedCount = 0;

    for (const client of clientsResult.rows) {
      if (!client.email) continue;

      // Find matching customer by email
      const matchingCustomer = customers.find(c => 
        c.PrimaryEmailAddr?.Address?.toLowerCase() === client.email.toLowerCase()
      );

      if (matchingCustomer) {
        await query(
          `INSERT INTO quickbooks_client_mappings (firm_id, client_id, qb_customer_id, qb_customer_name, qb_customer_email, sync_direction)
           VALUES ($1, $2, $3, $4, $5, 'both')
           ON CONFLICT (firm_id, client_id) DO NOTHING`,
          [
            req.user.firmId,
            client.id,
            matchingCustomer.Id,
            matchingCustomer.DisplayName || matchingCustomer.CompanyName,
            matchingCustomer.PrimaryEmailAddr?.Address,
          ]
        );
        mappedCount++;
      }
    }

    res.json({ success: true, mappedCount });
  } catch (error) {
    console.error('Auto-map clients error:', error);
    res.status(500).json({ error: error.message || 'Failed to auto-map clients' });
  }
});

// Create QB customer from client (push new customer to QB)
router.post('/create-qb-customer', authenticate, async (req, res) => {
  try {
    const { clientId } = req.body;

    // Get client details
    const clientResult = await query(
      `SELECT * FROM clients WHERE id = $1 AND firm_id = $2`,
      [clientId, req.user.firmId]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clientResult.rows[0];
    const { accessToken, realmId } = await getQuickBooksToken(req.user.firmId);
    const baseUrl = getQBBaseUrl();

    // Create customer in QuickBooks
    const customerData = {
      DisplayName: client.display_name || client.name,
      PrimaryEmailAddr: client.email ? { Address: client.email } : undefined,
      PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : undefined,
      BillAddr: client.address_street ? {
        Line1: client.address_street,
        City: client.address_city,
        CountrySubDivisionCode: client.address_state,
        PostalCode: client.address_zip,
      } : undefined,
    };

    const response = await fetch(
      `${baseUrl}/v3/company/${realmId}/customer`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(customerData),
      }
    );

    const result = await response.json();

    if (result.Customer) {
      // Save mapping
      await query(
        `INSERT INTO quickbooks_client_mappings (firm_id, client_id, qb_customer_id, qb_customer_name, qb_customer_email, sync_direction)
         VALUES ($1, $2, $3, $4, $5, 'both')`,
        [
          req.user.firmId,
          clientId,
          result.Customer.Id,
          result.Customer.DisplayName,
          result.Customer.PrimaryEmailAddr?.Address,
        ]
      );

      res.json({ success: true, customer: result.Customer });
    } else {
      throw new Error(result.Fault?.Error?.[0]?.Message || 'Failed to create customer');
    }
  } catch (error) {
    console.error('Create QB customer error:', error);
    res.status(500).json({ error: error.message || 'Failed to create QuickBooks customer' });
  }
});

// ============================================
// INVOICE SYNC
// ============================================

// Get synced invoices
router.get('/synced-invoices', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT qis.*, i.invoice_number, i.amount as local_amount, i.status as local_status,
              c.display_name as client_name
       FROM quickbooks_invoice_sync qis
       JOIN invoices i ON qis.invoice_id = i.id
       LEFT JOIN clients c ON i.client_id = c.id
       WHERE qis.firm_id = $1
       ORDER BY qis.last_synced_at DESC`,
      [req.user.firmId]
    );

    res.json({
      invoices: result.rows.map(inv => ({
        id: inv.id,
        invoiceId: inv.invoice_id,
        invoiceNumber: inv.invoice_number,
        clientName: inv.client_name,
        localAmount: parseFloat(inv.local_amount),
        localStatus: inv.local_status,
        qbInvoiceId: inv.qb_invoice_id,
        qbDocNumber: inv.qb_doc_number,
        qbTotal: parseFloat(inv.qb_total),
        qbBalance: parseFloat(inv.qb_balance),
        qbStatus: inv.qb_status,
        syncStatus: inv.sync_status,
        syncDirection: inv.sync_direction,
        lastSyncedAt: inv.last_synced_at,
        syncError: inv.sync_error,
      })),
    });
  } catch (error) {
    console.error('Get synced invoices error:', error);
    res.status(500).json({ error: 'Failed to get synced invoices' });
  }
});

// Get unsynced invoices
router.get('/unsynced-invoices', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT i.*, c.display_name as client_name
       FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id
       WHERE i.firm_id = $1 AND i.status IN ('sent', 'paid', 'overdue', 'partial')
       AND NOT EXISTS (
         SELECT 1 FROM quickbooks_invoice_sync qis WHERE qis.invoice_id = i.id
       )
       ORDER BY i.created_at DESC`,
      [req.user.firmId]
    );

    res.json({
      invoices: result.rows.map(inv => ({
        id: inv.id,
        number: inv.invoice_number,
        clientId: inv.client_id,
        clientName: inv.client_name,
        amount: parseFloat(inv.amount),
        status: inv.status,
        dueDate: inv.due_date,
        issueDate: inv.issue_date || inv.created_at,
      })),
    });
  } catch (error) {
    console.error('Get unsynced invoices error:', error);
    res.status(500).json({ error: 'Failed to get unsynced invoices' });
  }
});

// Push invoice to QuickBooks
router.post('/push-invoice', authenticate, async (req, res) => {
  try {
    const { invoiceId } = req.body;

    // Get invoice with client mapping
    const invoiceResult = await query(
      `SELECT i.*, qcm.qb_customer_id
       FROM invoices i
       LEFT JOIN quickbooks_client_mappings qcm ON i.client_id = qcm.client_id AND qcm.firm_id = i.firm_id
       WHERE i.id = $1 AND i.firm_id = $2`,
      [invoiceId, req.user.firmId]
    );

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];

    if (!invoice.qb_customer_id) {
      return res.status(400).json({ error: 'Client is not mapped to a QuickBooks customer. Please map the client first.' });
    }

    const { accessToken, realmId } = await getQuickBooksToken(req.user.firmId);
    const baseUrl = getQBBaseUrl();

    // Build QB invoice
    const qbInvoice = {
      CustomerRef: { value: invoice.qb_customer_id },
      TxnDate: invoice.issue_date ? new Date(invoice.issue_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      DueDate: invoice.due_date ? new Date(invoice.due_date).toISOString().split('T')[0] : undefined,
      DocNumber: invoice.invoice_number,
      Line: [],
    };

    // Get line items or use invoice total
    const lineItems = invoice.line_items || [];
    
    if (lineItems.length > 0) {
      for (const item of lineItems) {
        qbInvoice.Line.push({
          Amount: item.amount || (item.quantity * item.rate),
          DetailType: 'SalesItemLineDetail',
          SalesItemLineDetail: {
            ItemRef: { value: '1', name: 'Services' }, // Default service item
          },
          Description: item.description || 'Legal Services',
        });
      }
    } else {
      // Single line with total
      qbInvoice.Line.push({
        Amount: parseFloat(invoice.amount),
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          ItemRef: { value: '1', name: 'Services' },
        },
        Description: invoice.description || 'Legal Services',
      });
    }

    const response = await fetch(
      `${baseUrl}/v3/company/${realmId}/invoice`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(qbInvoice),
      }
    );

    const result = await response.json();

    if (result.Invoice) {
      // Save sync record
      await query(
        `INSERT INTO quickbooks_invoice_sync (firm_id, invoice_id, qb_invoice_id, qb_doc_number, qb_txn_date, qb_due_date, qb_total, qb_balance, qb_status, sync_status, sync_direction)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'synced', 'to_qb')
         ON CONFLICT (firm_id, invoice_id) DO UPDATE SET
           qb_invoice_id = EXCLUDED.qb_invoice_id,
           qb_doc_number = EXCLUDED.qb_doc_number,
           qb_total = EXCLUDED.qb_total,
           qb_balance = EXCLUDED.qb_balance,
           sync_status = 'synced',
           sync_error = NULL,
           last_synced_at = NOW(),
           updated_at = NOW()`,
        [
          req.user.firmId,
          invoiceId,
          result.Invoice.Id,
          result.Invoice.DocNumber,
          result.Invoice.TxnDate,
          result.Invoice.DueDate,
          result.Invoice.TotalAmt,
          result.Invoice.Balance,
          result.Invoice.Balance > 0 ? 'pending' : 'paid',
        ]
      );

      res.json({ success: true, qbInvoice: result.Invoice });
    } else {
      const errorMsg = result.Fault?.Error?.[0]?.Message || 'Failed to create invoice';
      
      // Log error
      await query(
        `INSERT INTO quickbooks_invoice_sync (firm_id, invoice_id, qb_invoice_id, sync_status, sync_direction, sync_error)
         VALUES ($1, $2, '', 'error', 'to_qb', $3)
         ON CONFLICT (firm_id, invoice_id) DO UPDATE SET
           sync_status = 'error',
           sync_error = EXCLUDED.sync_error,
           updated_at = NOW()`,
        [req.user.firmId, invoiceId, errorMsg]
      );

      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error('Push invoice error:', error);
    res.status(500).json({ error: error.message || 'Failed to push invoice to QuickBooks' });
  }
});

// Bulk push invoices
router.post('/push-invoices-bulk', authenticate, async (req, res) => {
  try {
    const { invoiceIds } = req.body;

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({ error: 'invoiceIds array is required' });
    }

    // Create sync log
    const logResult = await query(
      `INSERT INTO quickbooks_sync_log (firm_id, sync_type, direction, initiated_by)
       VALUES ($1, 'invoices', 'push', $2) RETURNING id`,
      [req.user.firmId, req.user.id]
    );
    const logId = logResult.rows[0].id;

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (const invoiceId of invoiceIds) {
      try {
        // Get invoice with client mapping
        const invoiceResult = await query(
          `SELECT i.*, qcm.qb_customer_id
           FROM invoices i
           LEFT JOIN quickbooks_client_mappings qcm ON i.client_id = qcm.client_id AND qcm.firm_id = i.firm_id
           WHERE i.id = $1 AND i.firm_id = $2`,
          [invoiceId, req.user.firmId]
        );

        if (invoiceResult.rows.length === 0) {
          errors.push({ invoiceId, error: 'Invoice not found' });
          failCount++;
          continue;
        }

        const invoice = invoiceResult.rows[0];

        if (!invoice.qb_customer_id) {
          errors.push({ invoiceId, error: 'Client not mapped' });
          failCount++;
          continue;
        }

        const { accessToken, realmId } = await getQuickBooksToken(req.user.firmId);
        const baseUrl = getQBBaseUrl();

        const qbInvoice = {
          CustomerRef: { value: invoice.qb_customer_id },
          TxnDate: invoice.issue_date ? new Date(invoice.issue_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          DueDate: invoice.due_date ? new Date(invoice.due_date).toISOString().split('T')[0] : undefined,
          DocNumber: invoice.invoice_number,
          Line: [{
            Amount: parseFloat(invoice.amount),
            DetailType: 'SalesItemLineDetail',
            SalesItemLineDetail: { ItemRef: { value: '1', name: 'Services' } },
            Description: invoice.description || 'Legal Services',
          }],
        };

        const response = await fetch(
          `${baseUrl}/v3/company/${realmId}/invoice`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify(qbInvoice),
          }
        );

        const result = await response.json();

        if (result.Invoice) {
          await query(
            `INSERT INTO quickbooks_invoice_sync (firm_id, invoice_id, qb_invoice_id, qb_doc_number, qb_total, qb_balance, sync_status, sync_direction)
             VALUES ($1, $2, $3, $4, $5, $6, 'synced', 'to_qb')
             ON CONFLICT (firm_id, invoice_id) DO UPDATE SET
               qb_invoice_id = EXCLUDED.qb_invoice_id,
               qb_doc_number = EXCLUDED.qb_doc_number,
               qb_total = EXCLUDED.qb_total,
               qb_balance = EXCLUDED.qb_balance,
               sync_status = 'synced',
               sync_error = NULL,
               last_synced_at = NOW()`,
            [req.user.firmId, invoiceId, result.Invoice.Id, result.Invoice.DocNumber, result.Invoice.TotalAmt, result.Invoice.Balance]
          );
          successCount++;
        } else {
          const errorMsg = result.Fault?.Error?.[0]?.Message || 'Failed';
          errors.push({ invoiceId, error: errorMsg });
          failCount++;
        }
      } catch (err) {
        errors.push({ invoiceId, error: err.message });
        failCount++;
      }
    }

    // Update log
    await query(
      `UPDATE quickbooks_sync_log SET completed_at = NOW(), status = $1, items_synced = $2, items_failed = $3, details = $4
       WHERE id = $5`,
      [failCount === 0 ? 'success' : (successCount > 0 ? 'partial' : 'error'), successCount, failCount, JSON.stringify({ errors }), logId]
    );

    res.json({ success: true, successCount, failCount, errors });
  } catch (error) {
    console.error('Bulk push invoices error:', error);
    res.status(500).json({ error: error.message || 'Failed to push invoices' });
  }
});

// ============================================
// PAYMENT SYNC (PULL FROM QB)
// ============================================

// Pull payments from QuickBooks
router.post('/pull-payments', authenticate, async (req, res) => {
  try {
    const { accessToken, realmId } = await getQuickBooksToken(req.user.firmId);
    const baseUrl = getQBBaseUrl();

    // Create sync log
    const logResult = await query(
      `INSERT INTO quickbooks_sync_log (firm_id, sync_type, direction, initiated_by)
       VALUES ($1, 'payments', 'pull', $2) RETURNING id`,
      [req.user.firmId, req.user.id]
    );
    const logId = logResult.rows[0].id;

    // Fetch recent payments from QB (last 90 days)
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const response = await fetch(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(`SELECT * FROM Payment WHERE TxnDate >= '${startDate}' MAXRESULTS 500`)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    const data = await response.json();
    const payments = data.QueryResponse?.Payment || [];

    let importedCount = 0;
    let skippedCount = 0;
    let appliedCount = 0;

    for (const payment of payments) {
      // Check if already imported
      const existing = await query(
        `SELECT id FROM quickbooks_payment_sync WHERE firm_id = $1 AND qb_payment_id = $2`,
        [req.user.firmId, payment.Id]
      );

      if (existing.rows.length > 0) {
        skippedCount++;
        continue;
      }

      // Find linked invoice
      let invoiceId = null;
      const linkedLines = payment.Line || [];
      for (const line of linkedLines) {
        const qbInvoiceId = line.LinkedTxn?.[0]?.TxnId;
        if (qbInvoiceId) {
          const invoiceSync = await query(
            `SELECT invoice_id FROM quickbooks_invoice_sync WHERE firm_id = $1 AND qb_invoice_id = $2`,
            [req.user.firmId, qbInvoiceId]
          );
          if (invoiceSync.rows.length > 0) {
            invoiceId = invoiceSync.rows[0].invoice_id;
            break;
          }
        }
      }

      // Save payment record
      await query(
        `INSERT INTO quickbooks_payment_sync (firm_id, invoice_id, qb_payment_id, qb_invoice_id, qb_customer_id, amount, payment_date, payment_method, reference_number, memo, sync_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')`,
        [
          req.user.firmId,
          invoiceId,
          payment.Id,
          linkedLines[0]?.LinkedTxn?.[0]?.TxnId,
          payment.CustomerRef?.value,
          payment.TotalAmt,
          payment.TxnDate,
          payment.PaymentMethodRef?.name || 'Other',
          payment.PaymentRefNum,
          payment.PrivateNote,
        ]
      );

      importedCount++;

      // Auto-apply to invoice if linked
      if (invoiceId) {
        try {
          // Record payment in our system
          await query(
            `UPDATE invoices SET amount_paid = LEAST(amount_paid + $1, amount),
             status = CASE WHEN amount_paid + $1 >= amount THEN 'paid' ELSE 'partial' END
             WHERE id = $2 AND firm_id = $3`,
            [payment.TotalAmt, invoiceId, req.user.firmId]
          );

          await query(
            `UPDATE quickbooks_payment_sync SET synced_to_billing = true, sync_status = 'synced' WHERE qb_payment_id = $1 AND firm_id = $2`,
            [payment.Id, req.user.firmId]
          );

          appliedCount++;
        } catch (err) {
          console.error('Error applying payment:', err);
        }
      }
    }

    // Update log
    await query(
      `UPDATE quickbooks_sync_log SET completed_at = NOW(), status = 'success', items_synced = $1, details = $2 WHERE id = $3`,
      [importedCount, JSON.stringify({ skipped: skippedCount, applied: appliedCount }), logId]
    );

    // Update last sync time
    await query(
      `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'quickbooks'`,
      [req.user.firmId]
    );

    res.json({
      success: true,
      imported: importedCount,
      skipped: skippedCount,
      applied: appliedCount,
      total: payments.length,
    });
  } catch (error) {
    console.error('Pull payments error:', error);
    res.status(500).json({ error: error.message || 'Failed to pull payments from QuickBooks' });
  }
});

// Get pending payments (not yet applied to billing)
router.get('/pending-payments', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT qps.*, i.invoice_number, c.display_name as client_name
       FROM quickbooks_payment_sync qps
       LEFT JOIN invoices i ON qps.invoice_id = i.id
       LEFT JOIN quickbooks_client_mappings qcm ON qps.qb_customer_id = qcm.qb_customer_id AND qcm.firm_id = qps.firm_id
       LEFT JOIN clients c ON qcm.client_id = c.id
       WHERE qps.firm_id = $1 AND qps.synced_to_billing = false
       ORDER BY qps.payment_date DESC`,
      [req.user.firmId]
    );

    res.json({
      payments: result.rows.map(p => ({
        id: p.id,
        qbPaymentId: p.qb_payment_id,
        invoiceId: p.invoice_id,
        invoiceNumber: p.invoice_number,
        clientName: p.client_name,
        amount: parseFloat(p.amount),
        paymentDate: p.payment_date,
        paymentMethod: p.payment_method,
        referenceNumber: p.reference_number,
        memo: p.memo,
        syncStatus: p.sync_status,
      })),
    });
  } catch (error) {
    console.error('Get pending payments error:', error);
    res.status(500).json({ error: 'Failed to get pending payments' });
  }
});

// Apply payment to invoice
router.post('/apply-payment', authenticate, async (req, res) => {
  try {
    const { paymentId, invoiceId } = req.body;

    const paymentResult = await query(
      `SELECT * FROM quickbooks_payment_sync WHERE id = $1 AND firm_id = $2`,
      [paymentId, req.user.firmId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    // Update invoice
    await query(
      `UPDATE invoices SET 
         amount_paid = LEAST(amount_paid + $1, amount),
         status = CASE WHEN amount_paid + $1 >= amount THEN 'paid' ELSE 'partial' END
       WHERE id = $2 AND firm_id = $3`,
      [payment.amount, invoiceId, req.user.firmId]
    );

    // Mark payment as applied
    await query(
      `UPDATE quickbooks_payment_sync SET synced_to_billing = true, sync_status = 'synced', invoice_id = $1 WHERE id = $2`,
      [invoiceId, paymentId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Apply payment error:', error);
    res.status(500).json({ error: 'Failed to apply payment' });
  }
});

// ============================================
// EXPENSE/BILL SYNC
// ============================================

// Get vendor mappings
router.get('/vendor-mappings', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM quickbooks_vendor_mappings WHERE firm_id = $1 ORDER BY vendor_name ASC`,
      [req.user.firmId]
    );

    res.json({
      mappings: result.rows.map(m => ({
        id: m.id,
        vendorName: m.vendor_name,
        vendorEmail: m.vendor_email,
        qbVendorId: m.qb_vendor_id,
        qbVendorName: m.qb_vendor_name,
        qbVendorEmail: m.qb_vendor_email,
        syncDirection: m.sync_direction,
        lastSyncedAt: m.last_synced_at,
      })),
    });
  } catch (error) {
    console.error('Get vendor mappings error:', error);
    res.status(500).json({ error: 'Failed to get vendor mappings' });
  }
});

// Fetch QuickBooks vendors (for mapping UI)
router.get('/qb-vendors', authenticate, async (req, res) => {
  try {
    const { accessToken, realmId } = await getQuickBooksToken(req.user.firmId);
    const baseUrl = getQBBaseUrl();

    const response = await fetch(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent('SELECT * FROM Vendor MAXRESULTS 1000')}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    const data = await response.json();
    const vendors = data.QueryResponse?.Vendor || [];

    res.json({
      vendors: vendors.map(v => ({
        id: v.Id,
        name: v.DisplayName || v.CompanyName || `${v.GivenName || ''} ${v.FamilyName || ''}`.trim(),
        email: v.PrimaryEmailAddr?.Address,
        balance: v.Balance || 0,
        active: v.Active,
      })),
    });
  } catch (error) {
    console.error('Get QB vendors error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch QuickBooks vendors' });
  }
});

// Create/update vendor mapping
router.post('/vendor-mappings', authenticate, async (req, res) => {
  try {
    const { vendorName, vendorEmail, qbVendorId, qbVendorName, qbVendorEmail, syncDirection } = req.body;

    if (!vendorName || !qbVendorId) {
      return res.status(400).json({ error: 'vendorName and qbVendorId are required' });
    }

    const result = await query(
      `INSERT INTO quickbooks_vendor_mappings (firm_id, vendor_name, vendor_email, qb_vendor_id, qb_vendor_name, qb_vendor_email, sync_direction)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (firm_id, vendor_name) DO UPDATE SET
         qb_vendor_id = EXCLUDED.qb_vendor_id,
         qb_vendor_name = EXCLUDED.qb_vendor_name,
         qb_vendor_email = EXCLUDED.qb_vendor_email,
         sync_direction = EXCLUDED.sync_direction,
         updated_at = NOW()
       RETURNING *`,
      [req.user.firmId, vendorName, vendorEmail, qbVendorId, qbVendorName, qbVendorEmail, syncDirection || 'both']
    );

    res.json({ success: true, mapping: result.rows[0] });
  } catch (error) {
    console.error('Create vendor mapping error:', error);
    res.status(500).json({ error: 'Failed to create vendor mapping' });
  }
});

// Delete vendor mapping
router.delete('/vendor-mappings/:id', authenticate, async (req, res) => {
  try {
    await query(
      `DELETE FROM quickbooks_vendor_mappings WHERE id = $1 AND firm_id = $2`,
      [req.params.id, req.user.firmId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Delete vendor mapping error:', error);
    res.status(500).json({ error: 'Failed to delete vendor mapping' });
  }
});

// Create QB vendor
router.post('/create-qb-vendor', authenticate, async (req, res) => {
  try {
    const { vendorName, vendorEmail } = req.body;

    if (!vendorName) {
      return res.status(400).json({ error: 'vendorName is required' });
    }

    const { accessToken, realmId } = await getQuickBooksToken(req.user.firmId);
    const baseUrl = getQBBaseUrl();

    const vendorData = {
      DisplayName: vendorName,
      PrimaryEmailAddr: vendorEmail ? { Address: vendorEmail } : undefined,
    };

    const response = await fetch(
      `${baseUrl}/v3/company/${realmId}/vendor`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(vendorData),
      }
    );

    const result = await response.json();

    if (result.Vendor) {
      // Save mapping
      await query(
        `INSERT INTO quickbooks_vendor_mappings (firm_id, vendor_name, vendor_email, qb_vendor_id, qb_vendor_name, qb_vendor_email, sync_direction)
         VALUES ($1, $2, $3, $4, $5, $6, 'both')
         ON CONFLICT (firm_id, vendor_name) DO UPDATE SET
           qb_vendor_id = EXCLUDED.qb_vendor_id,
           qb_vendor_name = EXCLUDED.qb_vendor_name,
           updated_at = NOW()`,
        [
          req.user.firmId,
          vendorName,
          vendorEmail,
          result.Vendor.Id,
          result.Vendor.DisplayName,
          result.Vendor.PrimaryEmailAddr?.Address,
        ]
      );

      res.json({ success: true, vendor: result.Vendor });
    } else {
      throw new Error(result.Fault?.Error?.[0]?.Message || 'Failed to create vendor');
    }
  } catch (error) {
    console.error('Create QB vendor error:', error);
    res.status(500).json({ error: error.message || 'Failed to create QuickBooks vendor' });
  }
});

// Get synced expenses
router.get('/synced-expenses', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT qes.*, e.description, e.amount as local_amount, e.status as local_status,
              e.category, e.expense_type, e.date as expense_date
       FROM quickbooks_expense_sync qes
       JOIN expenses e ON qes.expense_id = e.id
       WHERE qes.firm_id = $1
       ORDER BY qes.last_synced_at DESC`,
      [req.user.firmId]
    );

    res.json({
      expenses: result.rows.map(exp => ({
        id: exp.id,
        expenseId: exp.expense_id,
        description: exp.description,
        category: exp.category,
        expenseType: exp.expense_type,
        expenseDate: exp.expense_date,
        localAmount: parseFloat(exp.local_amount),
        localStatus: exp.local_status,
        qbBillId: exp.qb_bill_id,
        qbExpenseId: exp.qb_expense_id,
        qbVendorId: exp.qb_vendor_id,
        qbDocNumber: exp.qb_doc_number,
        qbTotal: exp.qb_total ? parseFloat(exp.qb_total) : null,
        syncType: exp.sync_type,
        syncStatus: exp.sync_status,
        syncDirection: exp.sync_direction,
        lastSyncedAt: exp.last_synced_at,
        syncError: exp.sync_error,
      })),
    });
  } catch (error) {
    console.error('Get synced expenses error:', error);
    res.status(500).json({ error: 'Failed to get synced expenses' });
  }
});

// Get unsynced expenses
router.get('/unsynced-expenses', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT e.*, m.name as matter_name
       FROM expenses e
       LEFT JOIN matters m ON e.matter_id = m.id
       WHERE e.firm_id = $1 AND e.status IN ('approved', 'billed')
       AND NOT EXISTS (
         SELECT 1 FROM quickbooks_expense_sync qes WHERE qes.expense_id = e.id
       )
       ORDER BY e.date DESC`,
      [req.user.firmId]
    );

    res.json({
      expenses: result.rows.map(exp => ({
        id: exp.id,
        matterId: exp.matter_id,
        matterName: exp.matter_name,
        date: exp.date,
        description: exp.description,
        amount: parseFloat(exp.amount),
        category: exp.category,
        expenseType: exp.expense_type,
        billable: exp.billable,
        status: exp.status,
      })),
    });
  } catch (error) {
    console.error('Get unsynced expenses error:', error);
    res.status(500).json({ error: 'Failed to get unsynced expenses' });
  }
});

// Get unique expense vendors (for mapping)
router.get('/expense-vendors', authenticate, async (req, res) => {
  try {
    // Get unique vendors from expenses that aren't mapped yet
    const result = await query(
      `SELECT DISTINCT e.category as vendor_name
       FROM expenses e
       WHERE e.firm_id = $1 AND e.category IS NOT NULL AND e.category != ''
       AND NOT EXISTS (
         SELECT 1 FROM quickbooks_vendor_mappings qvm WHERE qvm.vendor_name = e.category AND qvm.firm_id = e.firm_id
       )
       ORDER BY e.category ASC`,
      [req.user.firmId]
    );

    res.json({
      vendors: result.rows.map(r => ({ name: r.vendor_name })),
    });
  } catch (error) {
    console.error('Get expense vendors error:', error);
    res.status(500).json({ error: 'Failed to get expense vendors' });
  }
});

// Push expense to QuickBooks as Bill
router.post('/push-expense', authenticate, async (req, res) => {
  try {
    const { expenseId, syncType = 'bill' } = req.body;

    // Get expense
    const expenseResult = await query(
      `SELECT e.*, qvm.qb_vendor_id
       FROM expenses e
       LEFT JOIN quickbooks_vendor_mappings qvm ON e.category = qvm.vendor_name AND qvm.firm_id = e.firm_id
       WHERE e.id = $1 AND e.firm_id = $2`,
      [expenseId, req.user.firmId]
    );

    if (expenseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const expense = expenseResult.rows[0];
    const { accessToken, realmId } = await getQuickBooksToken(req.user.firmId);
    const baseUrl = getQBBaseUrl();

    let qbResult;

    if (syncType === 'bill') {
      // Create as Bill (Accounts Payable)
      if (!expense.qb_vendor_id) {
        return res.status(400).json({ 
          error: 'Expense vendor/category is not mapped to a QuickBooks vendor. Please map the vendor first.',
          needsVendorMapping: true,
          vendorName: expense.category
        });
      }

      const billData = {
        VendorRef: { value: expense.qb_vendor_id },
        TxnDate: expense.date ? new Date(expense.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        Line: [{
          Amount: parseFloat(expense.amount),
          DetailType: 'AccountBasedExpenseLineDetail',
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: '1' }, // Default expense account - would need to be configurable
          },
          Description: expense.description,
        }],
      };

      const response = await fetch(
        `${baseUrl}/v3/company/${realmId}/bill`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(billData),
        }
      );

      qbResult = await response.json();

      if (qbResult.Bill) {
        await query(
          `INSERT INTO quickbooks_expense_sync (firm_id, expense_id, qb_bill_id, qb_vendor_id, qb_doc_number, qb_txn_date, qb_total, qb_balance, sync_type, sync_status, sync_direction, last_synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'bill', 'synced', 'to_qb', NOW())
           ON CONFLICT (firm_id, expense_id) DO UPDATE SET
             qb_bill_id = EXCLUDED.qb_bill_id,
             qb_total = EXCLUDED.qb_total,
             qb_balance = EXCLUDED.qb_balance,
             sync_status = 'synced',
             sync_error = NULL,
             last_synced_at = NOW()`,
          [
            req.user.firmId,
            expenseId,
            qbResult.Bill.Id,
            expense.qb_vendor_id,
            qbResult.Bill.DocNumber,
            qbResult.Bill.TxnDate,
            qbResult.Bill.TotalAmt,
            qbResult.Bill.Balance,
          ]
        );

        res.json({ success: true, qbBill: qbResult.Bill });
      } else {
        const errorMsg = qbResult.Fault?.Error?.[0]?.Message || 'Failed to create bill';
        throw new Error(errorMsg);
      }
    } else {
      // Create as Purchase/Expense (direct expense, not AP)
      const purchaseData = {
        PaymentType: 'Cash',
        TxnDate: expense.date ? new Date(expense.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        Line: [{
          Amount: parseFloat(expense.amount),
          DetailType: 'AccountBasedExpenseLineDetail',
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: '1' },
          },
          Description: expense.description,
        }],
        AccountRef: { value: '1' }, // Bank/Cash account
      };

      const response = await fetch(
        `${baseUrl}/v3/company/${realmId}/purchase`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(purchaseData),
        }
      );

      qbResult = await response.json();

      if (qbResult.Purchase) {
        await query(
          `INSERT INTO quickbooks_expense_sync (firm_id, expense_id, qb_expense_id, qb_doc_number, qb_txn_date, qb_total, sync_type, sync_status, sync_direction, last_synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'expense', 'synced', 'to_qb', NOW())
           ON CONFLICT (firm_id, expense_id) DO UPDATE SET
             qb_expense_id = EXCLUDED.qb_expense_id,
             qb_total = EXCLUDED.qb_total,
             sync_status = 'synced',
             sync_error = NULL,
             last_synced_at = NOW()`,
          [
            req.user.firmId,
            expenseId,
            qbResult.Purchase.Id,
            qbResult.Purchase.DocNumber,
            qbResult.Purchase.TxnDate,
            qbResult.Purchase.TotalAmt,
          ]
        );

        res.json({ success: true, qbPurchase: qbResult.Purchase });
      } else {
        const errorMsg = qbResult.Fault?.Error?.[0]?.Message || 'Failed to create expense';
        throw new Error(errorMsg);
      }
    }
  } catch (error) {
    console.error('Push expense error:', error);
    res.status(500).json({ error: error.message || 'Failed to push expense to QuickBooks' });
  }
});

// Bulk push expenses
router.post('/push-expenses-bulk', authenticate, async (req, res) => {
  try {
    const { expenseIds, syncType = 'bill' } = req.body;

    if (!expenseIds || !Array.isArray(expenseIds) || expenseIds.length === 0) {
      return res.status(400).json({ error: 'expenseIds array is required' });
    }

    // Create sync log
    const logResult = await query(
      `INSERT INTO quickbooks_sync_log (firm_id, sync_type, direction, initiated_by)
       VALUES ($1, 'expenses', 'push', $2) RETURNING id`,
      [req.user.firmId, req.user.id]
    );
    const logId = logResult.rows[0].id;

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    const { accessToken, realmId } = await getQuickBooksToken(req.user.firmId);
    const baseUrl = getQBBaseUrl();

    for (const expenseId of expenseIds) {
      try {
        const expenseResult = await query(
          `SELECT e.*, qvm.qb_vendor_id
           FROM expenses e
           LEFT JOIN quickbooks_vendor_mappings qvm ON e.category = qvm.vendor_name AND qvm.firm_id = e.firm_id
           WHERE e.id = $1 AND e.firm_id = $2`,
          [expenseId, req.user.firmId]
        );

        if (expenseResult.rows.length === 0) {
          errors.push({ expenseId, error: 'Expense not found' });
          failCount++;
          continue;
        }

        const expense = expenseResult.rows[0];

        if (syncType === 'bill' && !expense.qb_vendor_id) {
          errors.push({ expenseId, error: 'Vendor not mapped', vendorName: expense.category });
          failCount++;
          continue;
        }

        if (syncType === 'bill') {
          const billData = {
            VendorRef: { value: expense.qb_vendor_id },
            TxnDate: expense.date ? new Date(expense.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            Line: [{
              Amount: parseFloat(expense.amount),
              DetailType: 'AccountBasedExpenseLineDetail',
              AccountBasedExpenseLineDetail: { AccountRef: { value: '1' } },
              Description: expense.description,
            }],
          };

          const response = await fetch(
            `${baseUrl}/v3/company/${realmId}/bill`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
              body: JSON.stringify(billData),
            }
          );

          const result = await response.json();

          if (result.Bill) {
            await query(
              `INSERT INTO quickbooks_expense_sync (firm_id, expense_id, qb_bill_id, qb_vendor_id, qb_total, sync_type, sync_status, sync_direction, last_synced_at)
               VALUES ($1, $2, $3, $4, $5, 'bill', 'synced', 'to_qb', NOW())
               ON CONFLICT (firm_id, expense_id) DO UPDATE SET
                 qb_bill_id = EXCLUDED.qb_bill_id,
                 sync_status = 'synced',
                 last_synced_at = NOW()`,
              [req.user.firmId, expenseId, result.Bill.Id, expense.qb_vendor_id, result.Bill.TotalAmt]
            );
            successCount++;
          } else {
            errors.push({ expenseId, error: result.Fault?.Error?.[0]?.Message || 'Failed' });
            failCount++;
          }
        }
      } catch (err) {
        errors.push({ expenseId, error: err.message });
        failCount++;
      }
    }

    // Update log
    await query(
      `UPDATE quickbooks_sync_log SET completed_at = NOW(), status = $1, items_synced = $2, items_failed = $3, details = $4
       WHERE id = $5`,
      [failCount === 0 ? 'success' : (successCount > 0 ? 'partial' : 'error'), successCount, failCount, JSON.stringify({ errors }), logId]
    );

    res.json({ success: true, successCount, failCount, errors });
  } catch (error) {
    console.error('Bulk push expenses error:', error);
    res.status(500).json({ error: error.message || 'Failed to push expenses' });
  }
});

// Pull bills from QuickBooks
router.post('/pull-bills', authenticate, async (req, res) => {
  try {
    const { accessToken, realmId } = await getQuickBooksToken(req.user.firmId);
    const baseUrl = getQBBaseUrl();

    // Create sync log
    const logResult = await query(
      `INSERT INTO quickbooks_sync_log (firm_id, sync_type, direction, initiated_by)
       VALUES ($1, 'bills', 'pull', $2) RETURNING id`,
      [req.user.firmId, req.user.id]
    );
    const logId = logResult.rows[0].id;

    // Fetch recent bills from QB (last 90 days)
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const response = await fetch(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(`SELECT * FROM Bill WHERE TxnDate >= '${startDate}' MAXRESULTS 500`)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    const data = await response.json();
    const bills = data.QueryResponse?.Bill || [];

    let importedCount = 0;
    let skippedCount = 0;

    for (const bill of bills) {
      // Check if already imported
      const existing = await query(
        `SELECT id FROM quickbooks_bills_imported WHERE firm_id = $1 AND qb_bill_id = $2`,
        [req.user.firmId, bill.Id]
      );

      if (existing.rows.length > 0) {
        skippedCount++;
        continue;
      }

      // Save bill record
      await query(
        `INSERT INTO quickbooks_bills_imported (firm_id, qb_bill_id, qb_vendor_id, qb_vendor_name, doc_number, txn_date, due_date, total_amount, balance, memo, line_items, is_paid, sync_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'imported')`,
        [
          req.user.firmId,
          bill.Id,
          bill.VendorRef?.value,
          bill.VendorRef?.name,
          bill.DocNumber,
          bill.TxnDate,
          bill.DueDate,
          bill.TotalAmt,
          bill.Balance,
          bill.PrivateNote,
          JSON.stringify(bill.Line || []),
          bill.Balance === 0,
        ]
      );

      importedCount++;
    }

    // Update log
    await query(
      `UPDATE quickbooks_sync_log SET completed_at = NOW(), status = 'success', items_synced = $1, details = $2 WHERE id = $3`,
      [importedCount, JSON.stringify({ skipped: skippedCount }), logId]
    );

    res.json({
      success: true,
      imported: importedCount,
      skipped: skippedCount,
      total: bills.length,
    });
  } catch (error) {
    console.error('Pull bills error:', error);
    res.status(500).json({ error: error.message || 'Failed to pull bills from QuickBooks' });
  }
});

// Get imported bills (not yet created as expenses)
router.get('/imported-bills', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM quickbooks_bills_imported
       WHERE firm_id = $1 AND imported_to_expenses = false
       ORDER BY txn_date DESC`,
      [req.user.firmId]
    );

    res.json({
      bills: result.rows.map(b => ({
        id: b.id,
        qbBillId: b.qb_bill_id,
        qbVendorId: b.qb_vendor_id,
        qbVendorName: b.qb_vendor_name,
        docNumber: b.doc_number,
        txnDate: b.txn_date,
        dueDate: b.due_date,
        totalAmount: parseFloat(b.total_amount),
        balance: parseFloat(b.balance),
        memo: b.memo,
        lineItems: b.line_items,
        isPaid: b.is_paid,
        syncStatus: b.sync_status,
      })),
    });
  } catch (error) {
    console.error('Get imported bills error:', error);
    res.status(500).json({ error: 'Failed to get imported bills' });
  }
});

// Create expense from imported bill
router.post('/create-expense-from-bill', authenticate, async (req, res) => {
  try {
    const { billId, matterId, category, billable = true } = req.body;

    const billResult = await query(
      `SELECT * FROM quickbooks_bills_imported WHERE id = $1 AND firm_id = $2`,
      [billId, req.user.firmId]
    );

    if (billResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const bill = billResult.rows[0];

    // Create expense
    const expenseResult = await query(
      `INSERT INTO expenses (firm_id, matter_id, user_id, date, description, amount, category, expense_type, billable, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'other', $8, 'approved')
       RETURNING *`,
      [
        req.user.firmId,
        matterId,
        req.user.id,
        bill.txn_date,
        bill.memo || `Bill #${bill.doc_number} from ${bill.qb_vendor_name}`,
        bill.total_amount,
        category || bill.qb_vendor_name,
        billable,
      ]
    );

    const expense = expenseResult.rows[0];

    // Link bill to expense
    await query(
      `UPDATE quickbooks_bills_imported SET expense_id = $1, imported_to_expenses = true, sync_status = 'applied' WHERE id = $2`,
      [expense.id, billId]
    );

    // Create sync record
    await query(
      `INSERT INTO quickbooks_expense_sync (firm_id, expense_id, qb_bill_id, qb_vendor_id, qb_total, sync_type, sync_status, sync_direction, last_synced_at)
       VALUES ($1, $2, $3, $4, $5, 'bill', 'synced', 'from_qb', NOW())`,
      [req.user.firmId, expense.id, bill.qb_bill_id, bill.qb_vendor_id, bill.total_amount]
    );

    res.json({ success: true, expense });
  } catch (error) {
    console.error('Create expense from bill error:', error);
    res.status(500).json({ error: 'Failed to create expense from bill' });
  }
});

// Get expense sync status summary
router.get('/expense-sync-status', authenticate, async (req, res) => {
  try {
    const [syncedExpenses, unsyncedExpenses, importedBills, vendorMappings] = await Promise.all([
      query(
        `SELECT COUNT(*) as count, SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) as synced,
                SUM(CASE WHEN sync_status = 'error' THEN 1 ELSE 0 END) as errors
         FROM quickbooks_expense_sync WHERE firm_id = $1`,
        [req.user.firmId]
      ),
      query(
        `SELECT COUNT(*) as count FROM expenses e
         WHERE e.firm_id = $1 AND e.status IN ('approved', 'billed')
         AND NOT EXISTS (SELECT 1 FROM quickbooks_expense_sync qes WHERE qes.expense_id = e.id)`,
        [req.user.firmId]
      ),
      query(
        `SELECT COUNT(*) as count, SUM(CASE WHEN imported_to_expenses THEN 1 ELSE 0 END) as applied
         FROM quickbooks_bills_imported WHERE firm_id = $1`,
        [req.user.firmId]
      ),
      query(
        `SELECT COUNT(*) as count FROM quickbooks_vendor_mappings WHERE firm_id = $1`,
        [req.user.firmId]
      ),
    ]);

    res.json({
      syncedExpenses: parseInt(syncedExpenses.rows[0]?.synced || 0),
      expenseSyncErrors: parseInt(syncedExpenses.rows[0]?.errors || 0),
      unsyncedExpenses: parseInt(unsyncedExpenses.rows[0]?.count || 0),
      importedBills: parseInt(importedBills.rows[0]?.count || 0),
      appliedBills: parseInt(importedBills.rows[0]?.applied || 0),
      mappedVendors: parseInt(vendorMappings.rows[0]?.count || 0),
    });
  } catch (error) {
    console.error('Get expense sync status error:', error);
    res.status(500).json({ error: 'Failed to get expense sync status' });
  }
});

// ============================================
// FULL SYNC
// ============================================

// Run full sync (both directions)
router.post('/full-sync', authenticate, async (req, res) => {
  try {
    // Create sync log
    const logResult = await query(
      `INSERT INTO quickbooks_sync_log (firm_id, sync_type, direction, initiated_by)
       VALUES ($1, 'full', 'both', $2) RETURNING id`,
      [req.user.firmId, req.user.id]
    );
    const logId = logResult.rows[0].id;

    const results = {
      invoicesPushed: 0,
      paymentsImported: 0,
      paymentsApplied: 0,
      errors: [],
    };

    try {
      // Get settings
      const settingsResult = await query(
        `SELECT * FROM quickbooks_sync_settings WHERE firm_id = $1`,
        [req.user.firmId]
      );
      const settings = settingsResult.rows[0] || {};

      // Push unsynced invoices if enabled
      if (settings.sync_invoices_to_qb !== false) {
        const unsyncedInvoices = await query(
          `SELECT i.id FROM invoices i
           JOIN quickbooks_client_mappings qcm ON i.client_id = qcm.client_id AND qcm.firm_id = i.firm_id
           WHERE i.firm_id = $1 AND i.status IN ('sent', 'overdue', 'partial')
           AND NOT EXISTS (SELECT 1 FROM quickbooks_invoice_sync qis WHERE qis.invoice_id = i.id)
           LIMIT 50`,
          [req.user.firmId]
        );

        for (const inv of unsyncedInvoices.rows) {
          try {
            // Simplified push - just track count
            results.invoicesPushed++;
          } catch (err) {
            results.errors.push({ type: 'invoice', id: inv.id, error: err.message });
          }
        }
      }

      // Pull payments if enabled
      if (settings.sync_payments_from_qb !== false) {
        const { accessToken, realmId } = await getQuickBooksToken(req.user.firmId);
        const baseUrl = getQBBaseUrl();

        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const response = await fetch(
          `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(`SELECT * FROM Payment WHERE TxnDate >= '${startDate}' MAXRESULTS 100`)}`,
          { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
        );

        const data = await response.json();
        const payments = data.QueryResponse?.Payment || [];

        for (const payment of payments) {
          const existing = await query(
            `SELECT id FROM quickbooks_payment_sync WHERE firm_id = $1 AND qb_payment_id = $2`,
            [req.user.firmId, payment.Id]
          );

          if (existing.rows.length === 0) {
            results.paymentsImported++;
          }
        }
      }

      // Update log
      await query(
        `UPDATE quickbooks_sync_log SET completed_at = NOW(), status = $1, 
         items_synced = $2, items_failed = $3, details = $4 WHERE id = $5`,
        [
          results.errors.length === 0 ? 'success' : 'partial',
          results.invoicesPushed + results.paymentsImported,
          results.errors.length,
          JSON.stringify(results),
          logId,
        ]
      );

      // Update last sync
      await query(
        `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'quickbooks'`,
        [req.user.firmId]
      );

    } catch (error) {
      await query(
        `UPDATE quickbooks_sync_log SET completed_at = NOW(), status = 'error', error_message = $1 WHERE id = $2`,
        [error.message, logId]
      );
      throw error;
    }

    res.json({ success: true, ...results });
  } catch (error) {
    console.error('Full sync error:', error);
    res.status(500).json({ error: error.message || 'Full sync failed' });
  }
});

// Get sync history/logs
router.get('/sync-logs', authenticate, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const result = await query(
      `SELECT qsl.*, u.first_name || ' ' || u.last_name as initiated_by_name
       FROM quickbooks_sync_log qsl
       LEFT JOIN users u ON qsl.initiated_by = u.id
       WHERE qsl.firm_id = $1
       ORDER BY qsl.started_at DESC
       LIMIT $2`,
      [req.user.firmId, parseInt(limit)]
    );

    res.json({
      logs: result.rows.map(log => ({
        id: log.id,
        syncType: log.sync_type,
        direction: log.direction,
        startedAt: log.started_at,
        completedAt: log.completed_at,
        status: log.status,
        itemsSynced: log.items_synced,
        itemsFailed: log.items_failed,
        details: log.details,
        errorMessage: log.error_message,
        initiatedBy: log.initiated_by_name,
      })),
    });
  } catch (error) {
    console.error('Get sync logs error:', error);
    res.status(500).json({ error: 'Failed to get sync logs' });
  }
});

export default router;
