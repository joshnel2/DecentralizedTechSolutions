import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();

// ============================================
// PLATFORM SETTINGS HELPER
// ============================================
// Reads OAuth credentials from database first, falls back to ENV variables

let settingsCache = null;
let settingsCacheTime = 0;
const CACHE_TTL = 5000; // 5 second cache (short for quick updates)

async function getPlatformSettings() {
  const now = Date.now();
  if (settingsCache && (now - settingsCacheTime) < CACHE_TTL) {
    return settingsCache;
  }
  
  try {
    const result = await query('SELECT key, value FROM platform_settings');
    const settings = {};
    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });
    settingsCache = settings;
    settingsCacheTime = now;
    return settings;
  } catch (error) {
    // Table might not exist, return empty
    console.log('Platform settings table not found, using ENV variables');
    return {};
  }
}

// Export function to clear cache (called after settings update)
export function clearPlatformSettingsCache() {
  settingsCache = null;
  settingsCacheTime = 0;
}

async function getCredential(dbKey, envKey, defaultValue = '') {
  const settings = await getPlatformSettings();
  return settings[dbKey] || process.env[envKey] || defaultValue;
}

// ============================================
// INTEGRATION SETTINGS
// ============================================

// Diagnostic endpoint - NO AUTH REQUIRED - to check if credentials are configured
// This queries the DATABASE DIRECTLY, bypassing any caching
router.get('/status', async (req, res) => {
  try {
    // Query database DIRECTLY to bypass any caching
    const dbResult = await query(`SELECT key, value, is_secret FROM platform_settings WHERE key LIKE 'microsoft_%' OR key LIKE 'quickbooks_%'`);
    
    // Show partial values for debugging (first 8 chars + length)
    const maskValue = (val) => {
      if (!val) return 'EMPTY';
      if (val.length < 10) return `${val.substring(0, 3)}... (${val.length} chars)`;
      return `${val.substring(0, 8)}... (${val.length} chars)`;
    };
    
    // Build settings from direct DB query
    const dbSettings = {};
    dbResult.rows.forEach(row => {
      dbSettings[row.key] = {
        value: row.value,
        is_secret: row.is_secret,
        display: maskValue(row.value),
        looksLikeUUID: row.value ? /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(row.value) : false
      };
    });
    
    res.json({
      source: 'DIRECT DATABASE QUERY - NO CACHE',
      configured: {
        microsoft_client_id: !!dbSettings.microsoft_client_id?.value,
        microsoft_client_secret: !!dbSettings.microsoft_client_secret?.value,
        microsoft_redirect_uri: !!dbSettings.microsoft_redirect_uri?.value,
        quickbooks_client_id: !!dbSettings.quickbooks_client_id?.value,
        quickbooks_client_secret: !!dbSettings.quickbooks_client_secret?.value,
      },
      debug: {
        microsoft: {
          client_id: dbSettings.microsoft_client_id?.display || 'NOT IN DB',
          client_secret: dbSettings.microsoft_client_secret?.display || 'NOT IN DB',
          client_secret_looks_like_uuid: dbSettings.microsoft_client_secret?.looksLikeUUID || false,
          client_secret_is_secret_flag: dbSettings.microsoft_client_secret?.is_secret,
          redirect_uri: dbSettings.microsoft_redirect_uri?.value || 'NOT IN DB',
          tenant: dbSettings.microsoft_tenant?.value || 'NOT IN DB',
        },
        quickbooks: {
          client_id: dbSettings.quickbooks_client_id?.display || 'NOT IN DB',
          client_secret: dbSettings.quickbooks_client_secret?.display || 'NOT IN DB',
          client_secret_looks_like_uuid: dbSettings.quickbooks_client_secret?.looksLikeUUID || false,
          environment: dbSettings.quickbooks_environment?.value || 'NOT IN DB',
          redirect_uri: dbSettings.quickbooks_redirect_uri?.value || 'NOT IN DB',
        }
      },
      notes: {
        '1_client_secret_length': 'Microsoft secrets are typically ~40 chars, QuickBooks ~40 chars',
        '2_uuid_warning': 'If client_secret_looks_like_uuid is TRUE, you entered the Secret ID instead of the Secret Value',
        '3_is_secret_flag': 'If is_secret_flag is false/null, secrets may not be masked properly'
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check status: ' + error.message, stack: error.stack });
  }
});

// Get all integrations for a firm
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM integrations WHERE firm_id = $1`,
      [req.user.firmId]
    );

    // Initialize all supported providers
    const integrations = {
      google: null,
      quickbooks: null,
      outlook: null,
      onedrive: null,
      googledrive: null,
      dropbox: null,
      docusign: null,
      slack: null,
      zoom: null,
      quicken: null,
      'apex-drive': null,
    };

    result.rows.forEach(row => {
      integrations[row.provider] = {
        id: row.id,
        provider: row.provider,
        isConnected: row.is_connected,
        accountEmail: row.account_email,
        accountName: row.account_name,
        lastSyncAt: row.last_sync_at,
        syncEnabled: row.sync_enabled,
        settings: row.settings,
        connectedAt: row.connected_at,
      };
    });

    // Check if Apex Drive is configured (has a default drive configuration)
    try {
      const driveResult = await query(
        `SELECT dc.*, 
                (SELECT COUNT(*) FROM documents WHERE drive_id = dc.id) as doc_count
         FROM drive_configurations dc
         WHERE dc.firm_id = $1 AND dc.is_default = true
         LIMIT 1`,
        [req.user.firmId]
      );
      
      if (driveResult.rows.length > 0) {
        const drive = driveResult.rows[0];
        integrations['apex-drive'] = {
          id: drive.id,
          provider: 'apex-drive',
          isConnected: true,
          accountName: drive.name,
          lastSyncAt: drive.last_sync_at,
          syncEnabled: drive.sync_enabled,
          settings: {
            syncDocuments: true,
            autoVersionOnSave: drive.auto_version_on_save,
            documentCount: parseInt(drive.doc_count) || 0,
          },
          connectedAt: drive.created_at,
        };
      } else {
        // Check if Azure storage is configured at platform level
        const azureSettings = await getPlatformSettings();
        if (azureSettings.azure_storage_account_name && azureSettings.azure_storage_account_key) {
          integrations['apex-drive'] = {
            id: 'azure-configured',
            provider: 'apex-drive',
            isConnected: true,
            accountName: 'Azure File Share (Ready)',
            settings: {
              syncDocuments: true,
              azureConfigured: true,
            },
          };
        }
      }
    } catch (driveError) {
      console.log('Drive configurations table may not exist:', driveError.message);
    }

    res.json({ integrations });
  } catch (error) {
    console.error('Get integrations error:', error);
    res.status(500).json({ error: 'Failed to get integrations' });
  }
});

// Update integration sync settings
router.put('/:provider/settings', authenticate, async (req, res) => {
  try {
    const { provider } = req.params;
    const { settings } = req.body;
    
    // Merge new settings with existing
    const existing = await query(
      `SELECT settings FROM integrations WHERE firm_id = $1 AND provider = $2`,
      [req.user.firmId, provider]
    );
    
    const currentSettings = existing.rows[0]?.settings || {};
    const mergedSettings = { ...currentSettings, ...settings };
    
    await query(
      `UPDATE integrations SET settings = $1, updated_at = NOW() WHERE firm_id = $2 AND provider = $3`,
      [JSON.stringify(mergedSettings), req.user.firmId, provider]
    );
    
    res.json({ success: true, settings: mergedSettings });
  } catch (error) {
    console.error('Update integration settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ============================================
// GOOGLE CALENDAR INTEGRATION
// ============================================

// Initiate Google OAuth
router.get('/google/connect', authenticate, async (req, res) => {
  const GOOGLE_CLIENT_ID = await getCredential('google_client_id', 'GOOGLE_CLIENT_ID');
  const GOOGLE_REDIRECT_URI = await getCredential('google_redirect_uri', 'GOOGLE_REDIRECT_URI', 'http://localhost:3001/api/integrations/google/callback');
  
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'Google integration not configured. Please configure in Admin Portal.' });
  }

  const state = crypto.randomBytes(32).toString('hex');
  
  const stateData = Buffer.from(JSON.stringify({
    nonce: state,
    firmId: req.user.firmId,
    userId: req.user.id,
  })).toString('base64');

  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ].join(' ');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${GOOGLE_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${stateData}`;

  res.json({ authUrl });
});

// Google OAuth callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.redirect(`${process.env.FRONTEND_URL}/app/settings/integrations?error=missing_params`);
    }

    // Get credentials
    const GOOGLE_CLIENT_ID = await getCredential('google_client_id', 'GOOGLE_CLIENT_ID');
    const GOOGLE_CLIENT_SECRET = await getCredential('google_client_secret', 'GOOGLE_CLIENT_SECRET');
    const GOOGLE_REDIRECT_URI = await getCredential('google_redirect_uri', 'GOOGLE_REDIRECT_URI', 'http://localhost:3001/api/integrations/google/callback');

    // Decode state
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { firmId, userId } = stateData;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      console.error('Google token error:', tokens);
      return res.redirect(`${process.env.FRONTEND_URL}/app/settings/integrations?error=token_error`);
    }

    // Get user info
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userInfoResponse.json();

    // Store integration
    await query(
      `INSERT INTO integrations (firm_id, provider, is_connected, account_email, account_name, access_token, refresh_token, token_expires_at, connected_by)
       VALUES ($1, 'google', true, $2, $3, $4, $5, NOW() + INTERVAL '1 hour', $6)
       ON CONFLICT (firm_id, provider) DO UPDATE SET
         is_connected = true,
         account_email = $2,
         account_name = $3,
         access_token = $4,
         refresh_token = COALESCE($5, integrations.refresh_token),
         token_expires_at = NOW() + INTERVAL '1 hour',
         connected_at = NOW()`,
      [firmId, userInfo.email, userInfo.name, tokens.access_token, tokens.refresh_token, userId]
    );

    res.redirect(`${process.env.FRONTEND_URL}/app/settings/integrations?success=google`);
  } catch (error) {
    console.error('Google callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/app/settings/integrations?error=callback_error`);
  }
});

// Disconnect Google
router.post('/google/disconnect', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE integrations SET is_connected = false, access_token = NULL, refresh_token = NULL
       WHERE firm_id = $1 AND provider = 'google'`,
      [req.user.firmId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Google disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Sync Google Calendar events
router.post('/google/sync', authenticate, async (req, res) => {
  try {
    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'google' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(400).json({ error: 'Google not connected' });
    }

    // Get credentials
    const GOOGLE_CLIENT_ID = await getCredential('google_client_id', 'GOOGLE_CLIENT_ID');
    const GOOGLE_CLIENT_SECRET = await getCredential('google_client_secret', 'GOOGLE_CLIENT_SECRET');

    let accessToken = integration.rows[0].access_token;
    const refreshToken = integration.rows[0].refresh_token;

    // Check if token needs refresh
    if (new Date(integration.rows[0].token_expires_at) < new Date()) {
      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          grant_type: 'refresh_token',
        }),
      });

      const newTokens = await refreshResponse.json();
      
      // Check if refresh failed
      if (newTokens.error || !newTokens.access_token) {
        console.error('Google token refresh failed:', newTokens.error_description || newTokens.error);
        await query(
          `UPDATE integrations SET is_connected = false WHERE firm_id = $1 AND provider = 'google'`,
          [req.user.firmId]
        );
        return res.status(401).json({ 
          error: 'Google session expired. Please reconnect in Settings > Integrations.',
          needsReconnect: true
        });
      }
      
      accessToken = newTokens.access_token;

      await query(
        `UPDATE integrations SET access_token = $1, token_expires_at = NOW() + INTERVAL '1 hour'
         WHERE firm_id = $2 AND provider = 'google'`,
        [accessToken, req.user.firmId]
      );
    }

    // Fetch calendar events
    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneMonthAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const eventsResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${oneMonthAgo.toISOString()}&timeMax=${oneMonthAhead.toISOString()}&singleEvents=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const eventsData = await eventsResponse.json();
    let syncedCount = 0;

    // Check if calendar sync is enabled
    const syncSettings = integration.rows[0].settings || {};
    
    if (syncSettings.syncCalendar !== false) {
      // Import events to calendar
      for (const event of eventsData.items || []) {
        if (event.status === 'cancelled') continue;

        const existingEvent = await query(
          `SELECT id FROM calendar_events WHERE firm_id = $1 AND external_id = $2`,
          [req.user.firmId, event.id]
        );

        if (existingEvent.rows.length === 0) {
          await query(
            `INSERT INTO calendar_events (firm_id, title, description, start_time, end_time, type, external_id, external_source, created_by)
             VALUES ($1, $2, $3, $4, $5, 'meeting', $6, 'google', $7)`,
            [
              req.user.firmId,
              event.summary || 'Untitled Event',
              event.description || null,
              event.start?.dateTime || event.start?.date,
              event.end?.dateTime || event.end?.date,
              event.id,
              req.user.id,
            ]
          );
          syncedCount++;
        }
      }
    }

    // Update last sync time
    await query(
      `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'google'`,
      [req.user.firmId]
    );

    res.json({ 
      success: true, 
      syncedCount,
      message: syncSettings.syncCalendar !== false 
        ? `Synced ${syncedCount} events from Google Calendar` 
        : 'Calendar sync disabled - use integration settings to enable'
    });
  } catch (error) {
    console.error('Google sync error:', error);
    res.status(500).json({ error: 'Failed to sync calendar' });
  }
});

// ============================================
// QUICKBOOKS INTEGRATION
// ============================================

// Initiate QuickBooks OAuth
router.get('/quickbooks/connect', authenticate, async (req, res) => {
  const QB_CLIENT_ID = await getCredential('quickbooks_client_id', 'QUICKBOOKS_CLIENT_ID');
  const QB_CLIENT_SECRET = await getCredential('quickbooks_client_secret', 'QUICKBOOKS_CLIENT_SECRET');
  const QB_ENVIRONMENT = await getCredential('quickbooks_environment', 'QUICKBOOKS_ENVIRONMENT', 'sandbox');
  
  // Auto-detect redirect URI if not explicitly configured
  const configuredRedirectUri = await getCredential('quickbooks_redirect_uri', 'QUICKBOOKS_REDIRECT_URI', '');
  const QB_REDIRECT_URI = configuredRedirectUri || `${getApiBaseUrl(req)}/api/integrations/quickbooks/callback`;

  // Debug logging
  console.log('[QuickBooks Connect] Credentials check:', {
    clientId: QB_CLIENT_ID ? `${QB_CLIENT_ID.substring(0, 8)}... (${QB_CLIENT_ID.length} chars)` : 'MISSING',
    clientSecret: QB_CLIENT_SECRET ? `${QB_CLIENT_SECRET.substring(0, 4)}... (${QB_CLIENT_SECRET.length} chars)` : 'MISSING',
    environment: QB_ENVIRONMENT,
    redirectUri: QB_REDIRECT_URI,
    firmId: req.user.firmId
  });

  if (!QB_CLIENT_ID) {
    return res.status(500).json({ error: 'QuickBooks Client ID not configured. Go to Admin Portal and add QuickBooks Client ID.' });
  }
  
  if (!QB_CLIENT_SECRET) {
    return res.status(500).json({ error: 'QuickBooks Client Secret not configured. Go to Admin Portal and add QuickBooks Client Secret.' });
  }

  const state = Buffer.from(JSON.stringify({
    nonce: crypto.randomBytes(32).toString('hex'),
    firmId: req.user.firmId,
    userId: req.user.id,
  })).toString('base64');

  // QuickBooks OAuth Scopes:
  // - com.intuit.quickbooks.accounting: Full read/write access to accounting data (invoices, customers, bills, etc.)
  // - openid, profile, email: User identity information
  // - address, phone: Additional user info (optional but useful)
  const scopes = [
    'com.intuit.quickbooks.accounting',  // Full accounting read/write access
    'openid',                             // OpenID authentication
    'profile',                            // User profile info
    'email',                              // User email
  ].join(' ');
  
  const baseUrl = 'https://appcenter.intuit.com/connect/oauth2';

  const authUrl = `${baseUrl}?` +
    `client_id=${QB_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(QB_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&state=${state}`;

  res.json({ authUrl });
});

// QuickBooks OAuth callback
router.get('/quickbooks/callback', async (req, res) => {
  try {
    const { code, state, realmId } = req.query;

    if (!code || !state) {
      return res.redirect(`${process.env.FRONTEND_URL}/app/settings/integrations?error=missing_params`);
    }

    // Get credentials
    const QB_CLIENT_ID = await getCredential('quickbooks_client_id', 'QUICKBOOKS_CLIENT_ID');
    const QB_CLIENT_SECRET = await getCredential('quickbooks_client_secret', 'QUICKBOOKS_CLIENT_SECRET');
    const QB_ENVIRONMENT = await getCredential('quickbooks_environment', 'QUICKBOOKS_ENVIRONMENT', 'sandbox');
    
    // Auto-detect redirect URI if not explicitly configured
    const configuredQBRedirectUri = await getCredential('quickbooks_redirect_uri', 'QUICKBOOKS_REDIRECT_URI', '');
    const QB_REDIRECT_URI = configuredQBRedirectUri || `${getApiBaseUrl(req)}/api/integrations/quickbooks/callback`;

    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { firmId, userId } = stateData;

    // Exchange code for tokens
    const auth = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString('base64');
    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`,
      },
      body: new URLSearchParams({
        code,
        redirect_uri: QB_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      console.error('QuickBooks token error:', tokens);
      return res.redirect(`${process.env.FRONTEND_URL}/app/settings/integrations?error=token_error`);
    }

    // Get company info
    const baseUrl = QB_ENVIRONMENT === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';

    const companyResponse = await fetch(
      `${baseUrl}/v3/company/${realmId}/companyinfo/${realmId}`,
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: 'application/json',
        },
      }
    );

    const companyData = await companyResponse.json();
    const companyName = companyData.CompanyInfo?.CompanyName || 'QuickBooks Account';

    // Store integration
    await query(
      `INSERT INTO integrations (firm_id, provider, is_connected, account_name, access_token, refresh_token, token_expires_at, settings, connected_by)
       VALUES ($1, 'quickbooks', true, $2, $3, $4, NOW() + INTERVAL '1 hour', $5, $6)
       ON CONFLICT (firm_id, provider) DO UPDATE SET
         is_connected = true,
         account_name = $2,
         access_token = $3,
         refresh_token = $4,
         token_expires_at = NOW() + INTERVAL '1 hour',
         settings = $5,
         connected_at = NOW()`,
      [firmId, companyName, tokens.access_token, tokens.refresh_token, JSON.stringify({ realmId }), userId]
    );

    res.redirect(`${process.env.FRONTEND_URL}/app/settings/integrations?success=quickbooks`);
  } catch (error) {
    console.error('QuickBooks callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/app/settings/integrations?error=callback_error`);
  }
});

// Disconnect QuickBooks
router.post('/quickbooks/disconnect', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE integrations SET is_connected = false, access_token = NULL, refresh_token = NULL
       WHERE firm_id = $1 AND provider = 'quickbooks'`,
      [req.user.firmId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('QuickBooks disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Sync QuickBooks data
router.post('/quickbooks/sync', authenticate, async (req, res) => {
  try {
    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'quickbooks' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(400).json({ error: 'QuickBooks not connected' });
    }

    // Get credentials
    const QB_CLIENT_ID = await getCredential('quickbooks_client_id', 'QUICKBOOKS_CLIENT_ID');
    const QB_CLIENT_SECRET = await getCredential('quickbooks_client_secret', 'QUICKBOOKS_CLIENT_SECRET');
    const QB_ENVIRONMENT = await getCredential('quickbooks_environment', 'QUICKBOOKS_ENVIRONMENT', 'sandbox');

    const { access_token, refresh_token, settings } = integration.rows[0];
    const { realmId } = settings || {};

    if (!realmId) {
      return res.status(400).json({ error: 'QuickBooks realm ID missing' });
    }

    // Refresh token if needed (QuickBooks tokens expire quickly)
    let accessToken = access_token;
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
    if (newTokens.access_token) {
      accessToken = newTokens.access_token;
      await query(
        `UPDATE integrations SET access_token = $1, refresh_token = $2, token_expires_at = NOW() + INTERVAL '1 hour'
         WHERE firm_id = $3 AND provider = 'quickbooks'`,
        [newTokens.access_token, newTokens.refresh_token || refresh_token, req.user.firmId]
      );
    }

    const baseUrl = QB_ENVIRONMENT === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';

    // Fetch accounts (for bank accounts)
    const accountsResponse = await fetch(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent('SELECT * FROM Account WHERE AccountType = \'Bank\'')}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    const accountsData = await accountsResponse.json();

    // Fetch recent invoices
    const invoicesResponse = await fetch(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent('SELECT * FROM Invoice ORDER BY TxnDate DESC MAXRESULTS 50')}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    const invoicesData = await invoicesResponse.json();
    const qbInvoices = invoicesData.QueryResponse?.Invoice || [];

    // Check if billing sync is enabled
    const syncSettings = integration.rows[0].settings || {};
    let syncedCount = 0;

    if (syncSettings.syncBilling !== false) {
      // Sync QuickBooks invoices to local invoices table
      for (const qbInv of qbInvoices) {
        // Check if already synced (by external_id)
        const existing = await query(
          `SELECT id FROM invoices WHERE firm_id = $1 AND external_id = $2 AND external_source = 'quickbooks'`,
          [req.user.firmId, qbInv.Id]
        );

        if (existing.rows.length === 0) {
          // Try to find matching client by name
          const clientName = qbInv.CustomerRef?.name;
          let clientId = null;
          
          if (clientName) {
            const clientResult = await query(
              `SELECT id FROM clients WHERE firm_id = $1 AND name ILIKE $2 LIMIT 1`,
              [req.user.firmId, `%${clientName}%`]
            );
            clientId = clientResult.rows[0]?.id;
          }

          // Create invoice
          await query(
            `INSERT INTO invoices (firm_id, client_id, invoice_number, amount, status, due_date, external_id, external_source, description, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'quickbooks', $8, NOW())
             ON CONFLICT (firm_id, external_id, external_source) DO UPDATE SET
               amount = EXCLUDED.amount,
               status = EXCLUDED.status,
               due_date = EXCLUDED.due_date`,
            [
              req.user.firmId,
              clientId,
              qbInv.DocNumber || `QB-${qbInv.Id}`,
              parseFloat(qbInv.TotalAmt || 0),
              qbInv.Balance > 0 ? 'pending' : 'paid',
              qbInv.DueDate,
              qbInv.Id,
              `QuickBooks Invoice: ${qbInv.CustomerRef?.name || 'Unknown'}`
            ]
          );
          syncedCount++;
        }
      }
    }

    // Update last sync time
    await query(
      `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'quickbooks'`,
      [req.user.firmId]
    );

    res.json({
      success: true,
      syncedCount,
      accounts: accountsData.QueryResponse?.Account || [],
      invoices: qbInvoices,
      message: `Synced ${syncedCount} new invoices from QuickBooks to Billing`
    });
  } catch (error) {
    console.error('QuickBooks sync error:', error);
    res.status(500).json({ error: 'Failed to sync QuickBooks data' });
  }
});

// ============================================
// QUICKBOOKS EXTENDED ENDPOINTS (Clio-style)
// ============================================

// Helper to get valid QuickBooks access token (refreshes if needed)
async function getQuickBooksAccessToken(firmId) {
  const integration = await query(
    `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'quickbooks' AND is_connected = true`,
    [firmId]
  );

  if (integration.rows.length === 0) {
    throw new Error('QuickBooks not connected');
  }

  const QB_CLIENT_ID = await getCredential('quickbooks_client_id', 'QUICKBOOKS_CLIENT_ID');
  const QB_CLIENT_SECRET = await getCredential('quickbooks_client_secret', 'QUICKBOOKS_CLIENT_SECRET');
  const QB_ENVIRONMENT = await getCredential('quickbooks_environment', 'QUICKBOOKS_ENVIRONMENT', 'sandbox');

  let { access_token, refresh_token, settings } = integration.rows[0];
  const { realmId } = settings || {};

  if (!realmId) {
    throw new Error('QuickBooks realm ID missing');
  }

  // Always refresh token (QB tokens expire in 1 hour)
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
  if (newTokens.access_token) {
    access_token = newTokens.access_token;
    await query(
      `UPDATE integrations SET access_token = $1, refresh_token = $2, token_expires_at = NOW() + INTERVAL '1 hour'
       WHERE firm_id = $3 AND provider = 'quickbooks'`,
      [newTokens.access_token, newTokens.refresh_token || refresh_token, firmId]
    );
  } else if (newTokens.error) {
    console.error('QuickBooks token refresh failed:', newTokens);
    throw new Error('QuickBooks session expired. Please reconnect.');
  }

  const baseUrl = QB_ENVIRONMENT === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';

  return { accessToken: access_token, realmId, baseUrl };
}

// Get all customers from QuickBooks
router.get('/quickbooks/customers', authenticate, async (req, res) => {
  try {
    const { accessToken, realmId, baseUrl } = await getQuickBooksAccessToken(req.user.firmId);

    const customersResponse = await fetch(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent('SELECT * FROM Customer MAXRESULTS 1000')}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    const customersData = await customersResponse.json();
    
    if (customersData.fault) {
      console.error('QuickBooks API error:', customersData.fault);
      return res.status(400).json({ error: customersData.fault.error?.[0]?.message || 'QuickBooks API error' });
    }

    const customers = (customersData.QueryResponse?.Customer || []).map(c => ({
      id: c.Id,
      name: c.DisplayName || c.CompanyName || `${c.GivenName || ''} ${c.FamilyName || ''}`.trim(),
      email: c.PrimaryEmailAddr?.Address,
      phone: c.PrimaryPhone?.FreeFormNumber,
      balance: c.Balance || 0,
      companyName: c.CompanyName,
      active: c.Active,
      createdAt: c.MetaData?.CreateTime,
    }));

    res.json({ customers, total: customers.length });
  } catch (error) {
    console.error('QuickBooks customers error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch customers' });
  }
});

// Get all invoices from QuickBooks (detailed)
router.get('/quickbooks/invoices', authenticate, async (req, res) => {
  try {
    const { accessToken, realmId, baseUrl } = await getQuickBooksAccessToken(req.user.firmId);

    const invoicesResponse = await fetch(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent('SELECT * FROM Invoice ORDER BY TxnDate DESC MAXRESULTS 500')}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    const invoicesData = await invoicesResponse.json();
    
    if (invoicesData.fault) {
      console.error('QuickBooks API error:', invoicesData.fault);
      return res.status(400).json({ error: invoicesData.fault.error?.[0]?.message || 'QuickBooks API error' });
    }

    const invoices = (invoicesData.QueryResponse?.Invoice || []).map(inv => ({
      id: inv.Id,
      number: inv.DocNumber,
      customerName: inv.CustomerRef?.name,
      customerId: inv.CustomerRef?.value,
      date: inv.TxnDate,
      dueDate: inv.DueDate,
      total: parseFloat(inv.TotalAmt || 0),
      balance: parseFloat(inv.Balance || 0),
      status: inv.Balance > 0 ? (new Date(inv.DueDate) < new Date() ? 'overdue' : 'pending') : 'paid',
      emailStatus: inv.EmailStatus,
      lineItems: inv.Line?.filter(l => l.DetailType === 'SalesItemLineDetail').map(l => ({
        description: l.Description,
        amount: l.Amount,
        quantity: l.SalesItemLineDetail?.Qty,
        unitPrice: l.SalesItemLineDetail?.UnitPrice,
      })),
    }));

    res.json({ invoices, total: invoices.length });
  } catch (error) {
    console.error('QuickBooks invoices error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch invoices' });
  }
});

// Get payments from QuickBooks
router.get('/quickbooks/payments', authenticate, async (req, res) => {
  try {
    const { accessToken, realmId, baseUrl } = await getQuickBooksAccessToken(req.user.firmId);

    const paymentsResponse = await fetch(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent('SELECT * FROM Payment ORDER BY TxnDate DESC MAXRESULTS 500')}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    const paymentsData = await paymentsResponse.json();
    
    if (paymentsData.fault) {
      return res.status(400).json({ error: paymentsData.fault.error?.[0]?.message || 'QuickBooks API error' });
    }

    const payments = (paymentsData.QueryResponse?.Payment || []).map(p => ({
      id: p.Id,
      date: p.TxnDate,
      amount: parseFloat(p.TotalAmt || 0),
      customerName: p.CustomerRef?.name,
      customerId: p.CustomerRef?.value,
      paymentMethod: p.PaymentMethodRef?.name,
      memo: p.PrivateNote,
    }));

    res.json({ payments, total: payments.length });
  } catch (error) {
    console.error('QuickBooks payments error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch payments' });
  }
});

// Create a customer in QuickBooks
router.post('/quickbooks/customers', authenticate, async (req, res) => {
  try {
    const { accessToken, realmId, baseUrl } = await getQuickBooksAccessToken(req.user.firmId);
    const { displayName, companyName, email, phone, address } = req.body;

    if (!displayName) {
      return res.status(400).json({ error: 'Display name is required' });
    }

    const customerData = {
      DisplayName: displayName,
      ...(companyName && { CompanyName: companyName }),
      ...(email && { PrimaryEmailAddr: { Address: email } }),
      ...(phone && { PrimaryPhone: { FreeFormNumber: phone } }),
      ...(address && {
        BillAddr: {
          Line1: address.line1,
          City: address.city,
          CountrySubDivisionCode: address.state,
          PostalCode: address.postalCode,
          Country: address.country || 'USA',
        },
      }),
    };

    const response = await fetch(`${baseUrl}/v3/company/${realmId}/customer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(customerData),
    });

    const result = await response.json();

    if (result.fault) {
      console.error('QuickBooks create customer error:', result.fault);
      return res.status(400).json({ error: result.fault.error?.[0]?.message || 'Failed to create customer' });
    }

    res.json({ 
      success: true, 
      customer: {
        id: result.Customer.Id,
        name: result.Customer.DisplayName,
        email: result.Customer.PrimaryEmailAddr?.Address,
      },
      message: 'Customer created in QuickBooks'
    });
  } catch (error) {
    console.error('QuickBooks create customer error:', error);
    res.status(500).json({ error: error.message || 'Failed to create customer' });
  }
});

// Create an invoice in QuickBooks
router.post('/quickbooks/invoices', authenticate, async (req, res) => {
  try {
    const { accessToken, realmId, baseUrl } = await getQuickBooksAccessToken(req.user.firmId);
    const { customerId, lineItems, dueDate, memo, docNumber } = req.body;

    if (!customerId || !lineItems || lineItems.length === 0) {
      return res.status(400).json({ error: 'Customer ID and line items are required' });
    }

    // Build line items
    const lines = lineItems.map((item, index) => ({
      Id: String(index + 1),
      LineNum: index + 1,
      Description: item.description,
      Amount: parseFloat(item.amount),
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        Qty: item.quantity || 1,
        UnitPrice: item.unitPrice || item.amount,
        ItemRef: item.itemRef || { value: '1', name: 'Services' }, // Default to Services item
      },
    }));

    const invoiceData = {
      CustomerRef: { value: customerId },
      Line: lines,
      ...(dueDate && { DueDate: dueDate }),
      ...(memo && { PrivateNote: memo }),
      ...(docNumber && { DocNumber: docNumber }),
    };

    const response = await fetch(`${baseUrl}/v3/company/${realmId}/invoice`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(invoiceData),
    });

    const result = await response.json();

    if (result.fault) {
      console.error('QuickBooks create invoice error:', result.fault);
      return res.status(400).json({ error: result.fault.error?.[0]?.message || 'Failed to create invoice' });
    }

    res.json({ 
      success: true, 
      invoice: {
        id: result.Invoice.Id,
        number: result.Invoice.DocNumber,
        total: result.Invoice.TotalAmt,
        dueDate: result.Invoice.DueDate,
      },
      message: 'Invoice created in QuickBooks'
    });
  } catch (error) {
    console.error('QuickBooks create invoice error:', error);
    res.status(500).json({ error: error.message || 'Failed to create invoice' });
  }
});

// Record a payment in QuickBooks
router.post('/quickbooks/payments', authenticate, async (req, res) => {
  try {
    const { accessToken, realmId, baseUrl } = await getQuickBooksAccessToken(req.user.firmId);
    const { customerId, amount, invoiceId, paymentDate, memo } = req.body;

    if (!customerId || !amount) {
      return res.status(400).json({ error: 'Customer ID and amount are required' });
    }

    const paymentData = {
      CustomerRef: { value: customerId },
      TotalAmt: parseFloat(amount),
      ...(paymentDate && { TxnDate: paymentDate }),
      ...(memo && { PrivateNote: memo }),
      ...(invoiceId && {
        Line: [{
          Amount: parseFloat(amount),
          LinkedTxn: [{
            TxnId: invoiceId,
            TxnType: 'Invoice',
          }],
        }],
      }),
    };

    const response = await fetch(`${baseUrl}/v3/company/${realmId}/payment`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(paymentData),
    });

    const result = await response.json();

    if (result.fault) {
      console.error('QuickBooks create payment error:', result.fault);
      return res.status(400).json({ error: result.fault.error?.[0]?.message || 'Failed to record payment' });
    }

    res.json({ 
      success: true, 
      payment: {
        id: result.Payment.Id,
        amount: result.Payment.TotalAmt,
        date: result.Payment.TxnDate,
      },
      message: 'Payment recorded in QuickBooks'
    });
  } catch (error) {
    console.error('QuickBooks create payment error:', error);
    res.status(500).json({ error: error.message || 'Failed to record payment' });
  }
});

// Push a local invoice to QuickBooks
router.post('/quickbooks/push-invoice/:invoiceId', authenticate, async (req, res) => {
  try {
    const { invoiceId } = req.params;

    // Get the local invoice
    const invoiceResult = await query(
      `SELECT i.*, c.name as client_name, c.email as client_email
       FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id
       WHERE i.id = $1 AND i.firm_id = $2`,
      [invoiceId, req.user.firmId]
    );

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];
    const { accessToken, realmId, baseUrl } = await getQuickBooksAccessToken(req.user.firmId);

    // First, find or create the customer in QuickBooks
    let customerId = null;
    if (invoice.client_name) {
      // Search for existing customer
      const searchResponse = await fetch(
        `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${invoice.client_name.replace(/'/g, "''")}'`)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        }
      );

      const searchResult = await searchResponse.json();
      const existingCustomer = searchResult.QueryResponse?.Customer?.[0];

      if (existingCustomer) {
        customerId = existingCustomer.Id;
      } else {
        // Create new customer
        const createResponse = await fetch(`${baseUrl}/v3/company/${realmId}/customer`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            DisplayName: invoice.client_name,
            ...(invoice.client_email && { PrimaryEmailAddr: { Address: invoice.client_email } }),
          }),
        });

        const createResult = await createResponse.json();
        if (createResult.Customer) {
          customerId = createResult.Customer.Id;
        }
      }
    }

    if (!customerId) {
      return res.status(400).json({ error: 'Could not find or create customer in QuickBooks' });
    }

    // Create the invoice in QuickBooks
    const invoiceData = {
      CustomerRef: { value: customerId },
      DocNumber: invoice.invoice_number,
      DueDate: invoice.due_date,
      Line: [{
        Amount: parseFloat(invoice.amount),
        DetailType: 'SalesItemLineDetail',
        Description: invoice.description || `Invoice from Apex Legal`,
        SalesItemLineDetail: {
          Qty: 1,
          UnitPrice: parseFloat(invoice.amount),
          ItemRef: { value: '1', name: 'Services' },
        },
      }],
    };

    const response = await fetch(`${baseUrl}/v3/company/${realmId}/invoice`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(invoiceData),
    });

    const result = await response.json();

    if (result.fault) {
      console.error('QuickBooks push invoice error:', result.fault);
      return res.status(400).json({ error: result.fault.error?.[0]?.message || 'Failed to push invoice' });
    }

    // Update local invoice with QuickBooks reference
    await query(
      `UPDATE invoices SET external_id = $1, external_source = 'quickbooks' WHERE id = $2`,
      [result.Invoice.Id, invoiceId]
    );

    res.json({ 
      success: true, 
      quickbooksInvoiceId: result.Invoice.Id,
      message: `Invoice pushed to QuickBooks as #${result.Invoice.DocNumber || result.Invoice.Id}`
    });
  } catch (error) {
    console.error('QuickBooks push invoice error:', error);
    res.status(500).json({ error: error.message || 'Failed to push invoice to QuickBooks' });
  }
});

// Push a local client to QuickBooks
router.post('/quickbooks/push-client/:clientId', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;

    // Get the local client
    const clientResult = await query(
      `SELECT * FROM clients WHERE id = $1 AND firm_id = $2`,
      [clientId, req.user.firmId]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clientResult.rows[0];
    const { accessToken, realmId, baseUrl } = await getQuickBooksAccessToken(req.user.firmId);

    // Check if customer already exists
    const searchResponse = await fetch(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${client.name.replace(/'/g, "''")}'`)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    const searchResult = await searchResponse.json();
    if (searchResult.QueryResponse?.Customer?.[0]) {
      return res.json({ 
        success: true, 
        quickbooksCustomerId: searchResult.QueryResponse.Customer[0].Id,
        message: 'Client already exists in QuickBooks'
      });
    }

    // Create customer in QuickBooks
    const customerData = {
      DisplayName: client.name,
      ...(client.email && { PrimaryEmailAddr: { Address: client.email } }),
      ...(client.phone && { PrimaryPhone: { FreeFormNumber: client.phone } }),
      ...(client.address && {
        BillAddr: {
          Line1: client.address,
          City: client.city,
          CountrySubDivisionCode: client.state,
          PostalCode: client.zip_code,
        },
      }),
    };

    const response = await fetch(`${baseUrl}/v3/company/${realmId}/customer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(customerData),
    });

    const result = await response.json();

    if (result.fault) {
      console.error('QuickBooks push client error:', result.fault);
      return res.status(400).json({ error: result.fault.error?.[0]?.message || 'Failed to push client' });
    }

    res.json({ 
      success: true, 
      quickbooksCustomerId: result.Customer.Id,
      message: 'Client pushed to QuickBooks'
    });
  } catch (error) {
    console.error('QuickBooks push client error:', error);
    res.status(500).json({ error: error.message || 'Failed to push client to QuickBooks' });
  }
});

// Full two-way sync between Apex and QuickBooks
router.post('/quickbooks/full-sync', authenticate, async (req, res) => {
  try {
    const { accessToken, realmId, baseUrl } = await getQuickBooksAccessToken(req.user.firmId);
    const syncResults = {
      customersImported: 0,
      customersExported: 0,
      invoicesImported: 0,
      invoicesExported: 0,
      errors: [],
    };

    // 1. Import customers from QuickBooks
    const customersResponse = await fetch(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent('SELECT * FROM Customer WHERE Active = true MAXRESULTS 1000')}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    const customersData = await customersResponse.json();
    const qbCustomers = customersData.QueryResponse?.Customer || [];

    for (const qbCust of qbCustomers) {
      try {
        // Check if client exists by name
        const existing = await query(
          `SELECT id FROM clients WHERE firm_id = $1 AND name ILIKE $2`,
          [req.user.firmId, qbCust.DisplayName]
        );

        if (existing.rows.length === 0) {
          await query(
            `INSERT INTO clients (firm_id, name, email, phone, type)
             VALUES ($1, $2, $3, $4, 'individual')`,
            [
              req.user.firmId,
              qbCust.DisplayName,
              qbCust.PrimaryEmailAddr?.Address,
              qbCust.PrimaryPhone?.FreeFormNumber,
            ]
          );
          syncResults.customersImported++;
        }
      } catch (err) {
        syncResults.errors.push(`Customer ${qbCust.DisplayName}: ${err.message}`);
      }
    }

    // 2. Export local clients to QuickBooks (that don't have a QB record)
    const localClients = await query(
      `SELECT * FROM clients WHERE firm_id = $1`,
      [req.user.firmId]
    );

    for (const client of localClients.rows) {
      try {
        // Check if already in QuickBooks
        const searchResponse = await fetch(
          `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(`SELECT Id FROM Customer WHERE DisplayName = '${client.name.replace(/'/g, "''")}'`)}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
            },
          }
        );

        const searchResult = await searchResponse.json();
        if (!searchResult.QueryResponse?.Customer?.[0]) {
          // Create in QuickBooks
          const response = await fetch(`${baseUrl}/v3/company/${realmId}/customer`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              DisplayName: client.name,
              ...(client.email && { PrimaryEmailAddr: { Address: client.email } }),
              ...(client.phone && { PrimaryPhone: { FreeFormNumber: client.phone } }),
            }),
          });

          const result = await response.json();
          if (result.Customer) {
            syncResults.customersExported++;
          }
        }
      } catch (err) {
        syncResults.errors.push(`Export client ${client.name}: ${err.message}`);
      }
    }

    // 3. Import invoices from QuickBooks
    const invoicesResponse = await fetch(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent('SELECT * FROM Invoice ORDER BY TxnDate DESC MAXRESULTS 500')}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    const invoicesData = await invoicesResponse.json();
    const qbInvoices = invoicesData.QueryResponse?.Invoice || [];

    for (const qbInv of qbInvoices) {
      try {
        const existing = await query(
          `SELECT id FROM invoices WHERE firm_id = $1 AND external_id = $2 AND external_source = 'quickbooks'`,
          [req.user.firmId, qbInv.Id]
        );

        if (existing.rows.length === 0) {
          // Find client
          let clientId = null;
          if (qbInv.CustomerRef?.name) {
            const clientResult = await query(
              `SELECT id FROM clients WHERE firm_id = $1 AND name ILIKE $2 LIMIT 1`,
              [req.user.firmId, `%${qbInv.CustomerRef.name}%`]
            );
            clientId = clientResult.rows[0]?.id;
          }

          await query(
            `INSERT INTO invoices (firm_id, client_id, invoice_number, amount, status, due_date, external_id, external_source, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'quickbooks', $8)
             ON CONFLICT (firm_id, external_id, external_source) DO NOTHING`,
            [
              req.user.firmId,
              clientId,
              qbInv.DocNumber || `QB-${qbInv.Id}`,
              parseFloat(qbInv.TotalAmt || 0),
              qbInv.Balance > 0 ? 'pending' : 'paid',
              qbInv.DueDate,
              qbInv.Id,
              `QuickBooks: ${qbInv.CustomerRef?.name || 'Unknown'}`,
            ]
          );
          syncResults.invoicesImported++;
        }
      } catch (err) {
        syncResults.errors.push(`Invoice ${qbInv.DocNumber}: ${err.message}`);
      }
    }

    // Update last sync time
    await query(
      `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'quickbooks'`,
      [req.user.firmId]
    );

    res.json({
      success: true,
      ...syncResults,
      message: `Sync complete: ${syncResults.customersImported} customers imported, ${syncResults.customersExported} exported, ${syncResults.invoicesImported} invoices imported`,
    });
  } catch (error) {
    console.error('QuickBooks full sync error:', error);
    res.status(500).json({ error: error.message || 'Failed to sync with QuickBooks' });
  }
});

// Update QuickBooks integration settings
router.put('/quickbooks/settings', authenticate, async (req, res) => {
  try {
    const { syncBilling, syncCustomers, autoSync, twoWaySync } = req.body;

    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'quickbooks'`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(404).json({ error: 'QuickBooks not connected' });
    }

    const currentSettings = integration.rows[0].settings || {};
    const newSettings = {
      ...currentSettings,
      syncBilling: syncBilling !== undefined ? syncBilling : currentSettings.syncBilling,
      syncCustomers: syncCustomers !== undefined ? syncCustomers : currentSettings.syncCustomers,
      autoSync: autoSync !== undefined ? autoSync : currentSettings.autoSync,
      twoWaySync: twoWaySync !== undefined ? twoWaySync : currentSettings.twoWaySync,
    };

    await query(
      `UPDATE integrations SET settings = $1 WHERE firm_id = $2 AND provider = 'quickbooks'`,
      [JSON.stringify(newSettings), req.user.firmId]
    );

    res.json({ success: true, settings: newSettings });
  } catch (error) {
    console.error('QuickBooks settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Get QuickBooks integration status and stats
router.get('/quickbooks/status', authenticate, async (req, res) => {
  try {
    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'quickbooks'`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0 || !integration.rows[0].is_connected) {
      return res.json({ connected: false });
    }

    const row = integration.rows[0];
    
    res.json({
      connected: true,
      accountName: row.account_name,
      lastSyncAt: row.last_sync_at,
      settings: row.settings,
      connectedAt: row.connected_at,
    });
  } catch (error) {
    console.error('QuickBooks status error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// ============================================
// OUTLOOK/MICROSOFT INTEGRATION
// ============================================

// Helper to auto-detect the API base URL from the request
function getApiBaseUrl(req) {
  // Check for explicit configuration first
  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL;
  }
  // Auto-detect from request
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${protocol}://${host}`;
}

// Initiate Microsoft OAuth
router.get('/outlook/connect', authenticate, async (req, res) => {
  try {
    const MS_CLIENT_ID = await getCredential('microsoft_client_id', 'MICROSOFT_CLIENT_ID');
    const MS_CLIENT_SECRET = await getCredential('microsoft_client_secret', 'MICROSOFT_CLIENT_SECRET');
    const MS_TENANT = await getCredential('microsoft_tenant', 'MICROSOFT_TENANT', 'common');
    
    // Auto-detect redirect URI if not explicitly configured
    const configuredRedirectUri = await getCredential('microsoft_redirect_uri', 'MICROSOFT_REDIRECT_URI', '');
    const MS_REDIRECT_URI = configuredRedirectUri || `${getApiBaseUrl(req)}/api/integrations/outlook/callback`;

    // Debug logging - show what we're actually getting from the database
    console.log('[Outlook Connect] Credentials check:', {
      clientId: MS_CLIENT_ID ? `${MS_CLIENT_ID.substring(0, 8)}... (${MS_CLIENT_ID.length} chars)` : 'MISSING',
      clientSecret: MS_CLIENT_SECRET ? `${MS_CLIENT_SECRET.substring(0, 4)}... (${MS_CLIENT_SECRET.length} chars)` : 'MISSING',
      secretLooksLikeUUID: MS_CLIENT_SECRET ? /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(MS_CLIENT_SECRET) : false,
      tenant: MS_TENANT,
      redirectUri: MS_REDIRECT_URI,
      firmId: req.user.firmId
    });

    if (!MS_CLIENT_ID) {
      return res.status(500).json({ error: 'Microsoft Client ID not configured. Go to Admin Portal and add Microsoft Client ID.' });
    }
    
    if (!MS_CLIENT_SECRET) {
      return res.status(500).json({ error: 'Microsoft Client Secret not configured. Go to Admin Portal and add Microsoft Client Secret.' });
    }

    const state = Buffer.from(JSON.stringify({
      nonce: crypto.randomBytes(32).toString('hex'),
      firmId: req.user.firmId,
      userId: req.user.id,
    })).toString('base64');

    // Use basic scopes that don't require admin consent
    // Files.ReadWrite.All and Sites.ReadWrite.All often require admin consent
    const scopes = [
      'openid',
      'profile',
      'email',
      'offline_access',
      'Mail.Read',
      'Mail.Send',
      'Calendars.ReadWrite',
      'Files.ReadWrite',          // User's own files (no admin consent needed)
    ].join(' ');

    const authUrl = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/authorize?` +
      `client_id=${MS_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(MS_REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&response_mode=query` +
      `&state=${state}`;

    console.log('[Outlook Connect] Generated auth URL for firm:', req.user.firmId);
    res.json({ authUrl });
  } catch (error) {
    console.error('[Outlook Connect] Error:', error);
    res.status(500).json({ error: 'Failed to initialize Microsoft connection: ' + error.message });
  }
});

// Microsoft OAuth callback
router.get('/outlook/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.redirect(`${process.env.FRONTEND_URL}/app/settings/integrations?error=missing_params`);
    }

    // Get credentials
    const MS_CLIENT_ID = await getCredential('microsoft_client_id', 'MICROSOFT_CLIENT_ID');
    const MS_CLIENT_SECRET = await getCredential('microsoft_client_secret', 'MICROSOFT_CLIENT_SECRET');
    const MS_TENANT = await getCredential('microsoft_tenant', 'MICROSOFT_TENANT', 'common');
    
    // Auto-detect redirect URI if not explicitly configured
    const configuredRedirectUri = await getCredential('microsoft_redirect_uri', 'MICROSOFT_REDIRECT_URI', '');
    const MS_REDIRECT_URI = configuredRedirectUri || `${getApiBaseUrl(req)}/api/integrations/outlook/callback`;

    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { firmId, userId } = stateData;

    // Exchange code for tokens
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        redirect_uri: MS_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      console.error('Microsoft token error:', tokens);
      console.error('Microsoft token error details:', {
        error: tokens.error,
        description: tokens.error_description,
        clientId: MS_CLIENT_ID ? 'configured' : 'missing',
        clientSecret: MS_CLIENT_SECRET ? 'configured' : 'missing',
        redirectUri: MS_REDIRECT_URI,
        tenant: MS_TENANT
      });
      // Include error details in redirect for debugging
      const errorMsg = encodeURIComponent(tokens.error_description || tokens.error || 'token_error');
      return res.redirect(`${process.env.FRONTEND_URL}/app/settings/integrations?error=${errorMsg}`);
    }

    // Get user info
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userResponse.json();

    // Store integration
    await query(
      `INSERT INTO integrations (firm_id, provider, is_connected, account_email, account_name, access_token, refresh_token, token_expires_at, connected_by)
       VALUES ($1, 'outlook', true, $2, $3, $4, $5, NOW() + INTERVAL '1 hour', $6)
       ON CONFLICT (firm_id, provider) DO UPDATE SET
         is_connected = true,
         account_email = $2,
         account_name = $3,
         access_token = $4,
         refresh_token = COALESCE($5, integrations.refresh_token),
         token_expires_at = NOW() + INTERVAL '1 hour',
         connected_at = NOW()`,
      [firmId, userInfo.mail || userInfo.userPrincipalName, userInfo.displayName, tokens.access_token, tokens.refresh_token, userId]
    );

    res.redirect(`${process.env.FRONTEND_URL}/app/settings/integrations?success=outlook`);
  } catch (error) {
    console.error('Microsoft callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/app/settings/integrations?error=callback_error`);
  }
});

// Disconnect Outlook
router.post('/outlook/disconnect', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE integrations SET is_connected = false, access_token = NULL, refresh_token = NULL
       WHERE firm_id = $1 AND provider = 'outlook'`,
      [req.user.firmId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Outlook disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Get recent emails
router.get('/outlook/emails', authenticate, async (req, res) => {
  try {
    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'outlook' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(400).json({ error: 'Outlook not connected' });
    }

    // Get credentials
    const MS_CLIENT_ID = await getCredential('microsoft_client_id', 'MICROSOFT_CLIENT_ID');
    const MS_CLIENT_SECRET = await getCredential('microsoft_client_secret', 'MICROSOFT_CLIENT_SECRET');
    const MS_TENANT = await getCredential('microsoft_tenant', 'MICROSOFT_TENANT', 'common');

    let accessToken = integration.rows[0].access_token;
    const refreshToken = integration.rows[0].refresh_token;

    // Refresh token if needed
    if (new Date(integration.rows[0].token_expires_at) < new Date()) {
      const refreshResponse = await fetch(`https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: MS_CLIENT_ID,
          client_secret: MS_CLIENT_SECRET,
          grant_type: 'refresh_token',
        }),
      });

      const newTokens = await refreshResponse.json();
      
      // Check if refresh failed
      if (newTokens.error || !newTokens.access_token) {
        console.error('Outlook token refresh failed:', newTokens.error_description || newTokens.error);
        // Mark as disconnected so user knows to reconnect
        await query(
          `UPDATE integrations SET is_connected = false WHERE firm_id = $1 AND provider = 'outlook'`,
          [req.user.firmId]
        );
        return res.status(401).json({ 
          error: 'Outlook session expired. Please reconnect your Outlook account in Settings > Integrations.',
          needsReconnect: true
        });
      }
      
      accessToken = newTokens.access_token;

      await query(
        `UPDATE integrations SET access_token = $1, token_expires_at = NOW() + INTERVAL '1 hour'
         WHERE firm_id = $2 AND provider = 'outlook'`,
        [accessToken, req.user.firmId]
      );
    }

    // Fetch recent emails from INBOX folder only (not sent items)
    const emailsResponse = await fetch(
      'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime desc&$select=id,subject,from,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments,importance',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const emailsData = await emailsResponse.json();

    const emails = emailsData.value || [];
    
    // Check for auto-linking setting
    const settings = integration.rows[0].settings || {};
    
    // Auto-link emails to clients based on email address
    if (settings.autoLinkEmails !== false) {
      for (const email of emails) {
        const fromEmail = email.from?.emailAddress?.address?.toLowerCase();
        if (!fromEmail) continue;
        
        // Check if email is already linked
        const existingLink = await query(
          `SELECT id FROM email_links WHERE firm_id = $1 AND email_id = $2`,
          [req.user.firmId, email.id]
        );
        
        if (existingLink.rows.length === 0) {
          // Find client by email
          const clientMatch = await query(
            `SELECT id FROM clients WHERE firm_id = $1 AND LOWER(email) = $2`,
            [req.user.firmId, fromEmail]
          );
          
          if (clientMatch.rows.length > 0) {
            // Auto-link this email to the client
            await query(
              `INSERT INTO email_links (firm_id, client_id, email_id, email_provider, subject, from_address, received_at, linked_by, notes)
               VALUES ($1, $2, $3, 'outlook', $4, $5, $6, $7, 'Auto-linked by email address')
               ON CONFLICT DO NOTHING`,
              [
                req.user.firmId,
                clientMatch.rows[0].id,
                email.id,
                email.subject,
                fromEmail,
                email.receivedDateTime,
                req.user.id
              ]
            );
          }
        }
      }
    }

    res.json({
      emails: emails.map(email => ({
        id: email.id,
        subject: email.subject,
        from: email.from?.emailAddress?.address,
        fromName: email.from?.emailAddress?.name,
        receivedAt: email.receivedDateTime,
        isRead: email.isRead,
        preview: email.bodyPreview,
      })),
    });
  } catch (error) {
    console.error('Outlook emails error:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// Get Outlook drafts
router.get('/outlook/drafts', authenticate, async (req, res) => {
  try {
    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'outlook' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(400).json({ error: 'Outlook not connected' });
    }

    // Get credentials
    const MS_CLIENT_ID = await getCredential('microsoft_client_id', 'MICROSOFT_CLIENT_ID');
    const MS_CLIENT_SECRET = await getCredential('microsoft_client_secret', 'MICROSOFT_CLIENT_SECRET');
    const MS_TENANT = await getCredential('microsoft_tenant', 'MICROSOFT_TENANT', 'common');

    let accessToken = integration.rows[0].access_token;
    const refreshToken = integration.rows[0].refresh_token;

    // Refresh token if needed
    if (new Date(integration.rows[0].token_expires_at) < new Date()) {
      const tokenUrl = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/token`;
      const refreshResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: MS_CLIENT_ID,
          client_secret: MS_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (refreshResponse.ok) {
        const tokens = await refreshResponse.json();
        accessToken = tokens.access_token;
        
        await query(
          `UPDATE integrations SET access_token = $1, token_expires_at = $2 WHERE id = $3`,
          [tokens.access_token, new Date(Date.now() + tokens.expires_in * 1000), integration.rows[0].id]
        );
      } else {
        console.error('Outlook token refresh failed in drafts route');
        await query(
          `UPDATE integrations SET is_connected = false WHERE firm_id = $1 AND provider = 'outlook'`,
          [req.user.firmId]
        );
        return res.status(401).json({ 
          error: 'Outlook session expired. Please reconnect in Settings > Integrations.',
          needsReconnect: true
        });
      }
    }

    // Get drafts from Microsoft Graph API
    const graphResponse = await fetch(
      'https://graph.microsoft.com/v1.0/me/mailFolders/drafts/messages?$top=50&$orderby=createdDateTime desc',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!graphResponse.ok) {
      const errorText = await graphResponse.text();
      console.error('Graph API error:', errorText);
      return res.status(500).json({ error: 'Failed to fetch drafts from Outlook' });
    }

    const data = await graphResponse.json();
    const drafts = data.value || [];

    res.json({
      drafts: drafts.map(draft => ({
        id: draft.id,
        subject: draft.subject || '(No Subject)',
        to: draft.toRecipients?.map(r => r.emailAddress?.address).join(', ') || '',
        toNames: draft.toRecipients?.map(r => r.emailAddress?.name).join(', ') || '',
        createdAt: draft.createdDateTime,
        lastModified: draft.lastModifiedDateTime,
        preview: draft.bodyPreview,
      })),
    });
  } catch (error) {
    console.error('Outlook drafts error:', error);
    res.status(500).json({ error: 'Failed to fetch drafts' });
  }
});

// Get sent emails from Outlook
router.get('/outlook/sent', authenticate, async (req, res) => {
  try {
    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'outlook' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.json({ emails: [] });
    }

    const accessToken = await getValidOutlookToken(integration.rows[0]);
    if (!accessToken) {
      return res.status(401).json({ error: 'Token expired' });
    }

    const graphResponse = await fetch(
      'https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?$top=50&$orderby=sentDateTime desc&$select=id,subject,toRecipients,sentDateTime,bodyPreview,hasAttachments',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!graphResponse.ok) {
      return res.status(500).json({ error: 'Failed to fetch sent emails' });
    }

    const data = await graphResponse.json();
    res.json({
      emails: (data.value || []).map(email => ({
        id: email.id,
        subject: email.subject || '(No Subject)',
        to: email.toRecipients?.map(r => r.emailAddress?.address).join(', ') || '',
        toName: email.toRecipients?.map(r => r.emailAddress?.name).join(', ') || '',
        receivedAt: email.sentDateTime,
        preview: email.bodyPreview,
        hasAttachments: email.hasAttachments,
      })),
    });
  } catch (error) {
    console.error('Outlook sent error:', error);
    res.status(500).json({ error: 'Failed to fetch sent emails' });
  }
});

// Get email body
router.get('/outlook/email/:emailId/body', authenticate, async (req, res) => {
  try {
    const { emailId } = req.params;
    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'outlook' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(400).json({ error: 'Outlook not connected' });
    }

    const accessToken = await getValidOutlookToken(integration.rows[0]);
    if (!accessToken) {
      return res.status(401).json({ error: 'Token expired' });
    }

    const graphResponse = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${emailId}?$select=body`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!graphResponse.ok) {
      return res.status(500).json({ error: 'Failed to fetch email body' });
    }

    const data = await graphResponse.json();
    res.json({ body: data.body?.content || '' });
  } catch (error) {
    console.error('Get email body error:', error);
    res.status(500).json({ error: 'Failed to fetch email body' });
  }
});

// Send email via Outlook
router.post('/outlook/send', authenticate, async (req, res) => {
  try {
    const { to, cc, subject, body } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'Recipient is required' });
    }

    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'outlook' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(400).json({ error: 'Outlook not connected' });
    }

    const accessToken = await getValidOutlookToken(integration.rows[0]);
    if (!accessToken) {
      return res.status(401).json({ error: 'Token expired' });
    }

    // Build email message
    const message = {
      subject: subject || '',
      body: {
        contentType: 'Text',
        content: body || ''
      },
      toRecipients: to.split(',').map(email => ({
        emailAddress: { address: email.trim() }
      }))
    };

    if (cc) {
      message.ccRecipients = cc.split(',').map(email => ({
        emailAddress: { address: email.trim() }
      }));
    }

    const graphResponse = await fetch(
      'https://graph.microsoft.com/v1.0/me/sendMail',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message, saveToSentItems: true })
      }
    );

    if (!graphResponse.ok) {
      const errorText = await graphResponse.text();
      console.error('Send email error:', errorText);
      return res.status(500).json({ error: 'Failed to send email' });
    }

    // Auto-link email to clients based on recipient email addresses
    const recipientEmails = to.split(',').map(e => e.trim().toLowerCase());
    
    try {
      // Find clients with matching email addresses
      const clientsResult = await query(
        `SELECT id, email, display_name FROM clients 
         WHERE firm_id = $1 AND LOWER(email) = ANY($2)`,
        [req.user.firmId, recipientEmails]
      );

      // Link the sent email to each matching client
      for (const client of clientsResult.rows) {
        await query(
          `INSERT INTO email_links (
            firm_id, email_id, email_provider, subject, from_address, 
            client_id, linked_by, linked_at, received_at, notes
          ) VALUES ($1, $2, 'outlook', $3, $4, $5, $6, NOW(), NOW(), $7)
          ON CONFLICT DO NOTHING`,
          [
            req.user.firmId,
            `sent-${Date.now()}`, // Generate a unique ID for sent emails
            subject || '(No Subject)',
            'You',
            client.id,
            req.user.id,
            'Auto-linked: Email sent to client'
          ]
        );
      }
    } catch (linkError) {
      console.error('Error auto-linking sent email to clients:', linkError);
      // Don't fail the request, just log the error
    }

    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Save draft
router.post('/outlook/drafts', authenticate, async (req, res) => {
  try {
    const { to, cc, subject, body } = req.body;

    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'outlook' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(400).json({ error: 'Outlook not connected' });
    }

    const accessToken = await getValidOutlookToken(integration.rows[0]);
    if (!accessToken) {
      return res.status(401).json({ error: 'Token expired' });
    }

    const message = {
      subject: subject || '',
      body: {
        contentType: 'Text',
        content: body || ''
      },
      toRecipients: to ? to.split(',').map(email => ({
        emailAddress: { address: email.trim() }
      })) : []
    };

    if (cc) {
      message.ccRecipients = cc.split(',').map(email => ({
        emailAddress: { address: email.trim() }
      }));
    }

    const graphResponse = await fetch(
      'https://graph.microsoft.com/v1.0/me/messages',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
      }
    );

    if (!graphResponse.ok) {
      return res.status(500).json({ error: 'Failed to save draft' });
    }

    const data = await graphResponse.json();
    res.json({ success: true, draftId: data.id });
  } catch (error) {
    console.error('Save draft error:', error);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

// Delete email
router.delete('/outlook/email/:emailId', authenticate, async (req, res) => {
  try {
    const { emailId } = req.params;
    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'outlook' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(400).json({ error: 'Outlook not connected' });
    }

    const accessToken = await getValidOutlookToken(integration.rows[0]);
    if (!accessToken) {
      return res.status(401).json({ error: 'Token expired' });
    }

    // Move to deleted items
    const graphResponse = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${emailId}/move`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ destinationId: 'deleteditems' })
      }
    );

    if (!graphResponse.ok) {
      return res.status(500).json({ error: 'Failed to delete email' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete email error:', error);
    res.status(500).json({ error: 'Failed to delete email' });
  }
});

// Archive email
router.post('/outlook/email/:emailId/archive', authenticate, async (req, res) => {
  try {
    const { emailId } = req.params;
    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'outlook' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(400).json({ error: 'Outlook not connected' });
    }

    const accessToken = await getValidOutlookToken(integration.rows[0]);
    if (!accessToken) {
      return res.status(401).json({ error: 'Token expired' });
    }

    // Move to archive folder
    const graphResponse = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${emailId}/move`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ destinationId: 'archive' })
      }
    );

    if (!graphResponse.ok) {
      return res.status(500).json({ error: 'Failed to archive email' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Archive email error:', error);
    res.status(500).json({ error: 'Failed to archive email' });
  }
});

// Helper function to get valid Outlook access token
async function getValidOutlookToken(integration) {
  const MS_CLIENT_ID = await getCredential('microsoft_client_id', 'MICROSOFT_CLIENT_ID');
  const MS_CLIENT_SECRET = await getCredential('microsoft_client_secret', 'MICROSOFT_CLIENT_SECRET');
  const MS_TENANT = await getCredential('microsoft_tenant', 'MICROSOFT_TENANT', 'common');

  let accessToken = integration.access_token;

  if (new Date(integration.token_expires_at) < new Date()) {
    const tokenUrl = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/token`;
    const refreshResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        refresh_token: integration.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (refreshResponse.ok) {
      const tokens = await refreshResponse.json();
      accessToken = tokens.access_token;
      
      await query(
        `UPDATE integrations SET access_token = $1, token_expires_at = $2 WHERE id = $3`,
        [tokens.access_token, new Date(Date.now() + tokens.expires_in * 1000), integration.id]
      );
    } else {
      return null;
    }
  }

  return accessToken;
}

// Get client communications (emails linked to client)
router.get('/client/:clientId/communications', authenticate, async (req, res) => {
  try {
    const { clientId } = req.params;
    
    // Get emails linked to this client
    const result = await query(
      `SELECT el.*, u.first_name || ' ' || u.last_name as linked_by_name
       FROM email_links el
       LEFT JOIN users u ON el.linked_by = u.id
       WHERE el.firm_id = $1 AND el.client_id = $2
       ORDER BY el.received_at DESC NULLS LAST, el.linked_at DESC
       LIMIT 100`,
      [req.user.firmId, clientId]
    );
    
    res.json({
      communications: result.rows.map(e => ({
        id: e.id,
        emailId: e.email_id,
        subject: e.subject,
        from: e.from_address,
        receivedAt: e.received_at,
        linkedAt: e.linked_at,
        linkedBy: e.linked_by_name,
        notes: e.notes,
        provider: e.email_provider
      })),
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get client communications error:', error);
    res.status(500).json({ error: 'Failed to get communications' });
  }
});

// Sync Outlook calendar
router.post('/outlook/sync-calendar', authenticate, async (req, res) => {
  try {
    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'outlook' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(400).json({ error: 'Outlook not connected' });
    }

    let accessToken = integration.rows[0].access_token;

    // Fetch calendar events
    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneMonthAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const eventsResponse = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${oneMonthAgo.toISOString()}&endDateTime=${oneMonthAhead.toISOString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const eventsData = await eventsResponse.json();
    let syncedCount = 0;

    // Check if calendar sync is enabled
    const syncSettings = integration.rows[0].settings || {};
    
    if (syncSettings.syncCalendar !== false) {
      for (const event of eventsData.value || []) {
        const existingEvent = await query(
          `SELECT id FROM calendar_events WHERE firm_id = $1 AND external_id = $2`,
          [req.user.firmId, event.id]
        );

        if (existingEvent.rows.length === 0) {
          await query(
            `INSERT INTO calendar_events (firm_id, title, description, start_time, end_time, location, type, external_id, external_source, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, 'meeting', $7, 'outlook', $8)`,
            [
              req.user.firmId,
              event.subject || 'Untitled Event',
              event.bodyPreview || null,
              event.start?.dateTime,
              event.end?.dateTime,
              event.location?.displayName || null,
              event.id,
              req.user.id,
            ]
          );
          syncedCount++;
        }
      }
    }

    await query(
      `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'outlook'`,
      [req.user.firmId]
    );

    res.json({ 
      success: true, 
      syncedCount,
      message: syncSettings.syncCalendar !== false 
        ? `Synced ${syncedCount} events from Outlook Calendar` 
        : 'Calendar sync disabled - use integration settings to enable'
    });
  } catch (error) {
    console.error('Outlook sync error:', error);
    res.status(500).json({ error: 'Failed to sync calendar' });
  }
});

// Link email to matter/client
router.post('/outlook/link-email', authenticate, async (req, res) => {
  try {
    const { emailId, matterId, clientId } = req.body;
    
    if (!emailId) {
      return res.status(400).json({ error: 'emailId is required' });
    }
    
    if (!matterId && !clientId) {
      return res.status(400).json({ error: 'matterId or clientId is required' });
    }

    // Get email details from Outlook
    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'outlook' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(400).json({ error: 'Outlook not connected' });
    }

    const accessToken = integration.rows[0].access_token;

    // Fetch email details
    const emailResponse = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${emailId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const email = await emailResponse.json();

    // Store the link
    await query(
      `INSERT INTO email_links (firm_id, matter_id, client_id, email_id, email_provider, subject, from_address, to_addresses, received_at, linked_by)
       VALUES ($1, $2, $3, $4, 'outlook', $5, $6, $7, $8, $9)`,
      [
        req.user.firmId,
        matterId || null,
        clientId || null,
        emailId,
        email.subject,
        email.from?.emailAddress?.address,
        email.toRecipients?.map(r => r.emailAddress?.address) || [],
        email.receivedDateTime,
        req.user.id
      ]
    );

    res.json({ success: true, message: 'Email linked successfully' });
  } catch (error) {
    console.error('Link email error:', error);
    res.status(500).json({ error: 'Failed to link email' });
  }
});

// ============================================
// ONEDRIVE INTEGRATION (Microsoft Graph API)
// ============================================

// Initiate OneDrive OAuth (uses same Microsoft credentials)
router.get('/onedrive/connect', authenticate, async (req, res) => {
  const MS_CLIENT_ID = await getCredential('microsoft_client_id', 'MICROSOFT_CLIENT_ID');
  const MS_REDIRECT_URI = await getCredential('onedrive_redirect_uri', 'ONEDRIVE_REDIRECT_URI', 'http://localhost:3001/api/integrations/onedrive/callback');

  if (!MS_CLIENT_ID) {
    return res.status(500).json({ error: 'OneDrive integration not configured. Please configure Microsoft credentials in Admin Portal.' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  
  // Store state for verification
  await query(
    `INSERT INTO integrations (firm_id, provider, settings)
     VALUES ($1, 'onedrive', $2)
     ON CONFLICT (firm_id, provider) 
     DO UPDATE SET settings = jsonb_set(COALESCE(integrations.settings, '{}'), '{oauth_state}', $3)`,
    [req.user.firmId, JSON.stringify({ oauth_state: state }), JSON.stringify(state)]
  );

  const scopes = 'openid profile email Files.ReadWrite.All offline_access';
  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
    `client_id=${MS_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(MS_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scopes)}&state=${state}&prompt=consent`;

  res.json({ authUrl });
});

// OneDrive OAuth callback
router.get('/onedrive/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (error) {
    return res.redirect(`${frontendUrl}/app/integrations?error=${encodeURIComponent(error)}`);
  }

  try {
    const MS_CLIENT_ID = await getCredential('microsoft_client_id', 'MICROSOFT_CLIENT_ID');
    const MS_CLIENT_SECRET = await getCredential('microsoft_client_secret', 'MICROSOFT_CLIENT_SECRET');
    const MS_REDIRECT_URI = await getCredential('onedrive_redirect_uri', 'ONEDRIVE_REDIRECT_URI', 'http://localhost:3001/api/integrations/onedrive/callback');

    // Find integration with matching state
    const integration = await query(
      `SELECT * FROM integrations WHERE provider = 'onedrive' AND settings->>'oauth_state' = $1`,
      [state]
    );

    if (integration.rows.length === 0) {
      return res.redirect(`${frontendUrl}/app/integrations?error=Invalid state`);
    }

    const firmId = integration.rows[0].firm_id;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        redirect_uri: MS_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      return res.redirect(`${frontendUrl}/app/integrations?error=${encodeURIComponent(tokens.error_description || tokens.error)}`);
    }

    // Get user info
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userData = await userResponse.json();

    // Update integration
    await query(
      `UPDATE integrations 
       SET access_token = $1, refresh_token = $2, token_expires_at = NOW() + INTERVAL '1 hour',
           is_connected = true, account_email = $3, account_name = $4, connected_at = NOW(),
           settings = settings - 'oauth_state'
       WHERE firm_id = $5 AND provider = 'onedrive'`,
      [tokens.access_token, tokens.refresh_token, userData.mail || userData.userPrincipalName, userData.displayName, firmId]
    );

    res.redirect(`${frontendUrl}/app/integrations?success=OneDrive`);
  } catch (error) {
    console.error('OneDrive callback error:', error);
    res.redirect(`${frontendUrl}/app/integrations?error=Connection failed`);
  }
});

// Disconnect OneDrive
router.post('/onedrive/disconnect', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE integrations SET is_connected = false, access_token = NULL, refresh_token = NULL
       WHERE firm_id = $1 AND provider = 'onedrive'`,
      [req.user.firmId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('OneDrive disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Sync OneDrive - List files from root
router.post('/onedrive/sync', authenticate, async (req, res) => {
  try {
    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'onedrive' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(400).json({ error: 'OneDrive not connected' });
    }

    const accessToken = integration.rows[0].access_token;
    const syncSettings = integration.rows[0].settings || {};

    // Get files from OneDrive (including nested folders)
    const filesResponse = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children?$top=100', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const filesData = await filesResponse.json();
    const files = filesData.value || [];
    let syncedCount = 0;

    // Sync files to documents table if enabled
    if (syncSettings.syncDocuments !== false) {
      for (const file of files) {
        // Skip folders, only sync files
        if (file.folder) continue;

        // Check if already synced
        const existing = await query(
          `SELECT id FROM documents WHERE firm_id = $1 AND external_id = $2 AND external_source = 'onedrive'`,
          [req.user.firmId, file.id]
        );

        if (existing.rows.length === 0) {
          // Determine file type
          const ext = file.name.split('.').pop()?.toLowerCase() || '';
          const fileType = ext === 'pdf' ? 'pdf' : 
                          ['doc', 'docx'].includes(ext) ? 'word' :
                          ['xls', 'xlsx'].includes(ext) ? 'excel' :
                          ['ppt', 'pptx'].includes(ext) ? 'powerpoint' : 'other';

          await query(
            `INSERT INTO documents (firm_id, name, file_name, file_type, file_size, external_id, external_source, external_url, uploaded_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'onedrive', $7, $8, NOW())
             ON CONFLICT (firm_id, external_id, external_source) DO UPDATE SET
               name = EXCLUDED.name,
               file_size = EXCLUDED.file_size,
               external_url = EXCLUDED.external_url`,
            [
              req.user.firmId,
              file.name,
              file.name,
              fileType,
              file.size || 0,
              file.id,
              file.webUrl,
              req.user.id
            ]
          );
          syncedCount++;
        }
      }
    }

    await query(
      `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'onedrive'`,
      [req.user.firmId]
    );

    res.json({ 
      success: true, 
      syncedCount,
      files: files.slice(0, 20).map(f => ({
        id: f.id,
        name: f.name,
        size: f.size,
        folder: !!f.folder,
        webUrl: f.webUrl
      })),
      message: syncSettings.syncDocuments !== false 
        ? `Synced ${syncedCount} files from OneDrive to Documents` 
        : 'Document sync disabled - use integration settings to enable'
    });
  } catch (error) {
    console.error('OneDrive sync error:', error);
    res.status(500).json({ error: 'Failed to sync OneDrive' });
  }
});

// ============================================
// GOOGLE DRIVE INTEGRATION
// ============================================

// Initiate Google Drive OAuth
router.get('/googledrive/connect', authenticate, async (req, res) => {
  const GOOGLE_CLIENT_ID = await getCredential('google_client_id', 'GOOGLE_CLIENT_ID');
  const GOOGLE_REDIRECT_URI = await getCredential('googledrive_redirect_uri', 'GOOGLEDRIVE_REDIRECT_URI', 'http://localhost:3001/api/integrations/googledrive/callback');

  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'Google Drive integration not configured. Please configure Google credentials in Admin Portal.' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  
  await query(
    `INSERT INTO integrations (firm_id, provider, settings)
     VALUES ($1, 'googledrive', $2)
     ON CONFLICT (firm_id, provider) 
     DO UPDATE SET settings = jsonb_set(COALESCE(integrations.settings, '{}'), '{oauth_state}', $3)`,
    [req.user.firmId, JSON.stringify({ oauth_state: state }), JSON.stringify(state)]
  );

  const scopes = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${GOOGLE_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scopes)}&state=${state}&access_type=offline&prompt=consent`;

  res.json({ authUrl });
});

// Google Drive OAuth callback
router.get('/googledrive/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (error) {
    return res.redirect(`${frontendUrl}/app/integrations?error=${encodeURIComponent(error)}`);
  }

  try {
    const GOOGLE_CLIENT_ID = await getCredential('google_client_id', 'GOOGLE_CLIENT_ID');
    const GOOGLE_CLIENT_SECRET = await getCredential('google_client_secret', 'GOOGLE_CLIENT_SECRET');
    const GOOGLE_REDIRECT_URI = await getCredential('googledrive_redirect_uri', 'GOOGLEDRIVE_REDIRECT_URI', 'http://localhost:3001/api/integrations/googledrive/callback');

    const integration = await query(
      `SELECT * FROM integrations WHERE provider = 'googledrive' AND settings->>'oauth_state' = $1`,
      [state]
    );

    if (integration.rows.length === 0) {
      return res.redirect(`${frontendUrl}/app/integrations?error=Invalid state`);
    }

    const firmId = integration.rows[0].firm_id;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      return res.redirect(`${frontendUrl}/app/integrations?error=${encodeURIComponent(tokens.error_description || tokens.error)}`);
    }

    // Get user info
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userData = await userResponse.json();

    await query(
      `UPDATE integrations 
       SET access_token = $1, refresh_token = $2, token_expires_at = NOW() + INTERVAL '1 hour',
           is_connected = true, account_email = $3, account_name = $4, connected_at = NOW(),
           settings = settings - 'oauth_state'
       WHERE firm_id = $5 AND provider = 'googledrive'`,
      [tokens.access_token, tokens.refresh_token, userData.email, userData.name, firmId]
    );

    res.redirect(`${frontendUrl}/app/integrations?success=Google Drive`);
  } catch (error) {
    console.error('Google Drive callback error:', error);
    res.redirect(`${frontendUrl}/app/integrations?error=Connection failed`);
  }
});

// Disconnect Google Drive
router.post('/googledrive/disconnect', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE integrations SET is_connected = false, access_token = NULL, refresh_token = NULL
       WHERE firm_id = $1 AND provider = 'googledrive'`,
      [req.user.firmId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Google Drive disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Sync Google Drive - List files
router.post('/googledrive/sync', authenticate, async (req, res) => {
  try {
    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'googledrive' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(400).json({ error: 'Google Drive not connected' });
    }

    const accessToken = integration.rows[0].access_token;
    const syncSettings = integration.rows[0].settings || {};

    const filesResponse = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=100&fields=files(id,name,mimeType,size,webViewLink)', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const filesData = await filesResponse.json();
    const files = filesData.files || [];
    let syncedCount = 0;

    // Sync files to documents table if enabled
    if (syncSettings.syncDocuments !== false) {
      for (const file of files) {
        // Skip folders
        if (file.mimeType === 'application/vnd.google-apps.folder') continue;

        // Check if already synced
        const existing = await query(
          `SELECT id FROM documents WHERE firm_id = $1 AND external_id = $2 AND external_source = 'googledrive'`,
          [req.user.firmId, file.id]
        );

        if (existing.rows.length === 0) {
          // Determine file type from MIME type
          const mimeType = file.mimeType || '';
          const fileType = mimeType.includes('pdf') ? 'pdf' :
                          mimeType.includes('document') || mimeType.includes('word') ? 'word' :
                          mimeType.includes('spreadsheet') || mimeType.includes('excel') ? 'excel' :
                          mimeType.includes('presentation') || mimeType.includes('powerpoint') ? 'powerpoint' : 'other';

          await query(
            `INSERT INTO documents (firm_id, name, file_name, file_type, file_size, external_id, external_source, external_url, uploaded_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'googledrive', $7, $8, NOW())
             ON CONFLICT (firm_id, external_id, external_source) DO UPDATE SET
               name = EXCLUDED.name,
               file_size = EXCLUDED.file_size,
               external_url = EXCLUDED.external_url`,
            [
              req.user.firmId,
              file.name,
              file.name,
              fileType,
              parseInt(file.size) || 0,
              file.id,
              file.webViewLink,
              req.user.id
            ]
          );
          syncedCount++;
        }
      }
    }

    await query(
      `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'googledrive'`,
      [req.user.firmId]
    );

    res.json({ 
      success: true, 
      syncedCount,
      files: files.slice(0, 20).map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        webUrl: f.webViewLink
      })),
      message: syncSettings.syncDocuments !== false 
        ? `Synced ${syncedCount} files from Google Drive to Documents` 
        : 'Document sync disabled - use integration settings to enable'
    });
  } catch (error) {
    console.error('Google Drive sync error:', error);
    res.status(500).json({ error: 'Failed to sync Google Drive' });
  }
});

// ============================================
// DROPBOX INTEGRATION
// ============================================

// Initiate Dropbox OAuth
router.get('/dropbox/connect', authenticate, async (req, res) => {
  const DROPBOX_CLIENT_ID = await getCredential('dropbox_client_id', 'DROPBOX_CLIENT_ID');
  const DROPBOX_REDIRECT_URI = await getCredential('dropbox_redirect_uri', 'DROPBOX_REDIRECT_URI', 'http://localhost:3001/api/integrations/dropbox/callback');

  if (!DROPBOX_CLIENT_ID) {
    return res.status(500).json({ error: 'Dropbox integration not configured. Please configure Dropbox credentials in Admin Portal.' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  
  await query(
    `INSERT INTO integrations (firm_id, provider, settings)
     VALUES ($1, 'dropbox', $2)
     ON CONFLICT (firm_id, provider) 
     DO UPDATE SET settings = jsonb_set(COALESCE(integrations.settings, '{}'), '{oauth_state}', $3)`,
    [req.user.firmId, JSON.stringify({ oauth_state: state }), JSON.stringify(state)]
  );

  const authUrl = `https://www.dropbox.com/oauth2/authorize?` +
    `client_id=${DROPBOX_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(DROPBOX_REDIRECT_URI)}` +
    `&state=${state}&token_access_type=offline`;

  res.json({ authUrl });
});

// Dropbox OAuth callback
router.get('/dropbox/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (error) {
    return res.redirect(`${frontendUrl}/app/integrations?error=${encodeURIComponent(error)}`);
  }

  try {
    const DROPBOX_CLIENT_ID = await getCredential('dropbox_client_id', 'DROPBOX_CLIENT_ID');
    const DROPBOX_CLIENT_SECRET = await getCredential('dropbox_client_secret', 'DROPBOX_CLIENT_SECRET');
    const DROPBOX_REDIRECT_URI = await getCredential('dropbox_redirect_uri', 'DROPBOX_REDIRECT_URI', 'http://localhost:3001/api/integrations/dropbox/callback');

    const integration = await query(
      `SELECT * FROM integrations WHERE provider = 'dropbox' AND settings->>'oauth_state' = $1`,
      [state]
    );

    if (integration.rows.length === 0) {
      return res.redirect(`${frontendUrl}/app/integrations?error=Invalid state`);
    }

    const firmId = integration.rows[0].firm_id;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: DROPBOX_CLIENT_ID,
        client_secret: DROPBOX_CLIENT_SECRET,
        redirect_uri: DROPBOX_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      return res.redirect(`${frontendUrl}/app/integrations?error=${encodeURIComponent(tokens.error_description || tokens.error)}`);
    }

    // Get user info
    const userResponse = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userData = await userResponse.json();

    await query(
      `UPDATE integrations 
       SET access_token = $1, refresh_token = $2, token_expires_at = NOW() + INTERVAL '4 hours',
           is_connected = true, account_email = $3, account_name = $4, connected_at = NOW(),
           settings = settings - 'oauth_state'
       WHERE firm_id = $5 AND provider = 'dropbox'`,
      [tokens.access_token, tokens.refresh_token, userData.email, userData.name?.display_name, firmId]
    );

    res.redirect(`${frontendUrl}/app/integrations?success=Dropbox`);
  } catch (error) {
    console.error('Dropbox callback error:', error);
    res.redirect(`${frontendUrl}/app/integrations?error=Connection failed`);
  }
});

// Disconnect Dropbox
router.post('/dropbox/disconnect', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE integrations SET is_connected = false, access_token = NULL, refresh_token = NULL
       WHERE firm_id = $1 AND provider = 'dropbox'`,
      [req.user.firmId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Dropbox disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Sync Dropbox - List files
router.post('/dropbox/sync', authenticate, async (req, res) => {
  try {
    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'dropbox' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(400).json({ error: 'Dropbox not connected' });
    }

    const accessToken = integration.rows[0].access_token;
    const syncSettings = integration.rows[0].settings || {};

    const filesResponse = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: '', limit: 100 }),
    });

    const filesData = await filesResponse.json();
    const files = filesData.entries || [];
    let syncedCount = 0;

    // Sync files to documents table if enabled
    if (syncSettings.syncDocuments !== false) {
      for (const file of files) {
        // Skip folders
        if (file['.tag'] === 'folder') continue;

        // Check if already synced
        const existing = await query(
          `SELECT id FROM documents WHERE firm_id = $1 AND external_id = $2 AND external_source = 'dropbox'`,
          [req.user.firmId, file.id]
        );

        if (existing.rows.length === 0) {
          // Determine file type
          const ext = file.name.split('.').pop()?.toLowerCase() || '';
          const fileType = ext === 'pdf' ? 'pdf' :
                          ['doc', 'docx'].includes(ext) ? 'word' :
                          ['xls', 'xlsx'].includes(ext) ? 'excel' :
                          ['ppt', 'pptx'].includes(ext) ? 'powerpoint' : 'other';

          await query(
            `INSERT INTO documents (firm_id, name, file_name, file_type, file_size, external_id, external_source, file_path, uploaded_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'dropbox', $7, $8, NOW())
             ON CONFLICT (firm_id, external_id, external_source) DO UPDATE SET
               name = EXCLUDED.name,
               file_size = EXCLUDED.file_size`,
            [
              req.user.firmId,
              file.name,
              file.name,
              fileType,
              file.size || 0,
              file.id,
              file.path_display,
              req.user.id
            ]
          );
          syncedCount++;
        }
      }
    }

    await query(
      `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'dropbox'`,
      [req.user.firmId]
    );

    res.json({ 
      success: true, 
      syncedCount,
      files: files.slice(0, 20).map(f => ({
        id: f.id,
        name: f.name,
        path: f.path_display,
        folder: f['.tag'] === 'folder',
        size: f.size
      })),
      message: syncSettings.syncDocuments !== false 
        ? `Synced ${syncedCount} files from Dropbox to Documents` 
        : 'Document sync disabled - use integration settings to enable'
    });
  } catch (error) {
    console.error('Dropbox sync error:', error);
    res.status(500).json({ error: 'Failed to sync Dropbox' });
  }
});

// ============================================
// DOCUSIGN INTEGRATION
// ============================================

// Initiate DocuSign OAuth
router.get('/docusign/connect', authenticate, async (req, res) => {
  const DOCUSIGN_CLIENT_ID = await getCredential('docusign_client_id', 'DOCUSIGN_CLIENT_ID');
  const DOCUSIGN_REDIRECT_URI = await getCredential('docusign_redirect_uri', 'DOCUSIGN_REDIRECT_URI', 'http://localhost:3001/api/integrations/docusign/callback');
  const DOCUSIGN_ENV = await getCredential('docusign_environment', 'DOCUSIGN_ENVIRONMENT', 'demo'); // demo or production

  if (!DOCUSIGN_CLIENT_ID) {
    return res.status(500).json({ error: 'DocuSign integration not configured. Please configure DocuSign credentials in Admin Portal.' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  
  await query(
    `INSERT INTO integrations (firm_id, provider, settings)
     VALUES ($1, 'docusign', $2)
     ON CONFLICT (firm_id, provider) 
     DO UPDATE SET settings = jsonb_set(COALESCE(integrations.settings, '{}'), '{oauth_state}', $3)`,
    [req.user.firmId, JSON.stringify({ oauth_state: state, environment: DOCUSIGN_ENV }), JSON.stringify(state)]
  );

  const baseUrl = DOCUSIGN_ENV === 'production' 
    ? 'https://account.docusign.com' 
    : 'https://account-d.docusign.com';

  const scopes = 'signature extended';
  const authUrl = `${baseUrl}/oauth/auth?` +
    `client_id=${DOCUSIGN_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(DOCUSIGN_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scopes)}&state=${state}`;

  res.json({ authUrl });
});

// DocuSign OAuth callback
router.get('/docusign/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (error) {
    return res.redirect(`${frontendUrl}/app/integrations?error=${encodeURIComponent(error)}`);
  }

  try {
    const DOCUSIGN_CLIENT_ID = await getCredential('docusign_client_id', 'DOCUSIGN_CLIENT_ID');
    const DOCUSIGN_CLIENT_SECRET = await getCredential('docusign_client_secret', 'DOCUSIGN_CLIENT_SECRET');
    const DOCUSIGN_REDIRECT_URI = await getCredential('docusign_redirect_uri', 'DOCUSIGN_REDIRECT_URI', 'http://localhost:3001/api/integrations/docusign/callback');

    const integration = await query(
      `SELECT * FROM integrations WHERE provider = 'docusign' AND settings->>'oauth_state' = $1`,
      [state]
    );

    if (integration.rows.length === 0) {
      return res.redirect(`${frontendUrl}/app/integrations?error=Invalid state`);
    }

    const firmId = integration.rows[0].firm_id;
    const env = integration.rows[0].settings?.environment || 'demo';
    const baseUrl = env === 'production' 
      ? 'https://account.docusign.com' 
      : 'https://account-d.docusign.com';

    // Exchange code for tokens
    const authHeader = Buffer.from(`${DOCUSIGN_CLIENT_ID}:${DOCUSIGN_CLIENT_SECRET}`).toString('base64');
    const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authHeader}`
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      return res.redirect(`${frontendUrl}/app/integrations?error=${encodeURIComponent(tokens.error_description || tokens.error)}`);
    }

    // Get user info
    const userResponse = await fetch(`${baseUrl}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userData = await userResponse.json();

    await query(
      `UPDATE integrations 
       SET access_token = $1, refresh_token = $2, token_expires_at = NOW() + INTERVAL '8 hours',
           is_connected = true, account_email = $3, account_name = $4, connected_at = NOW(),
           settings = jsonb_set(settings - 'oauth_state', '{account_id}', $5)
       WHERE firm_id = $6 AND provider = 'docusign'`,
      [tokens.access_token, tokens.refresh_token, userData.email, userData.name, 
       JSON.stringify(userData.accounts?.[0]?.account_id || ''), firmId]
    );

    res.redirect(`${frontendUrl}/app/integrations?success=DocuSign`);
  } catch (error) {
    console.error('DocuSign callback error:', error);
    res.redirect(`${frontendUrl}/app/integrations?error=Connection failed`);
  }
});

// Disconnect DocuSign
router.post('/docusign/disconnect', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE integrations SET is_connected = false, access_token = NULL, refresh_token = NULL
       WHERE firm_id = $1 AND provider = 'docusign'`,
      [req.user.firmId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('DocuSign disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Sync DocuSign - List envelopes
router.post('/docusign/sync', authenticate, async (req, res) => {
  try {
    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'docusign' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(400).json({ error: 'DocuSign not connected' });
    }

    const accessToken = integration.rows[0].access_token;
    const accountId = integration.rows[0].settings?.account_id;
    const env = integration.rows[0].settings?.environment || 'demo';
    
    const apiBase = env === 'production'
      ? 'https://na1.docusign.net'
      : 'https://demo.docusign.net';

    const envelopesResponse = await fetch(
      `${apiBase}/restapi/v2.1/accounts/${accountId}/envelopes?from_date=${new Date(Date.now() - 30*24*60*60*1000).toISOString()}&count=20`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const envelopesData = await envelopesResponse.json();

    await query(
      `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'docusign'`,
      [req.user.firmId]
    );

    res.json({ 
      success: true, 
      syncedCount: envelopesData.envelopes?.length || 0,
      envelopes: (envelopesData.envelopes || []).map(e => ({
        id: e.envelopeId,
        subject: e.emailSubject,
        status: e.status,
        sentDateTime: e.sentDateTime,
        completedDateTime: e.completedDateTime
      }))
    });
  } catch (error) {
    console.error('DocuSign sync error:', error);
    res.status(500).json({ error: 'Failed to sync DocuSign' });
  }
});

// ============================================
// SLACK INTEGRATION
// ============================================

// Initiate Slack OAuth
router.get('/slack/connect', authenticate, async (req, res) => {
  const SLACK_CLIENT_ID = await getCredential('slack_client_id', 'SLACK_CLIENT_ID');
  const SLACK_REDIRECT_URI = await getCredential('slack_redirect_uri', 'SLACK_REDIRECT_URI', 'http://localhost:3001/api/integrations/slack/callback');

  if (!SLACK_CLIENT_ID) {
    return res.status(500).json({ error: 'Slack integration not configured. Please configure Slack credentials in Admin Portal.' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  
  await query(
    `INSERT INTO integrations (firm_id, provider, settings)
     VALUES ($1, 'slack', $2)
     ON CONFLICT (firm_id, provider) 
     DO UPDATE SET settings = jsonb_set(COALESCE(integrations.settings, '{}'), '{oauth_state}', $3)`,
    [req.user.firmId, JSON.stringify({ oauth_state: state }), JSON.stringify(state)]
  );

  const scopes = 'channels:read,chat:write,users:read,team:read';
  const authUrl = `https://slack.com/oauth/v2/authorize?` +
    `client_id=${SLACK_CLIENT_ID}&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(SLACK_REDIRECT_URI)}&state=${state}`;

  res.json({ authUrl });
});

// Slack OAuth callback
router.get('/slack/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (error) {
    return res.redirect(`${frontendUrl}/app/integrations?error=${encodeURIComponent(error)}`);
  }

  try {
    const SLACK_CLIENT_ID = await getCredential('slack_client_id', 'SLACK_CLIENT_ID');
    const SLACK_CLIENT_SECRET = await getCredential('slack_client_secret', 'SLACK_CLIENT_SECRET');
    const SLACK_REDIRECT_URI = await getCredential('slack_redirect_uri', 'SLACK_REDIRECT_URI', 'http://localhost:3001/api/integrations/slack/callback');

    const integration = await query(
      `SELECT * FROM integrations WHERE provider = 'slack' AND settings->>'oauth_state' = $1`,
      [state]
    );

    if (integration.rows.length === 0) {
      return res.redirect(`${frontendUrl}/app/integrations?error=Invalid state`);
    }

    const firmId = integration.rows[0].firm_id;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        redirect_uri: SLACK_REDIRECT_URI,
      }),
    });

    const tokens = await tokenResponse.json();

    if (!tokens.ok) {
      return res.redirect(`${frontendUrl}/app/integrations?error=${encodeURIComponent(tokens.error)}`);
    }

    await query(
      `UPDATE integrations 
       SET access_token = $1, refresh_token = $2, 
           is_connected = true, account_name = $3, connected_at = NOW(),
           settings = jsonb_set(settings - 'oauth_state', '{team_id}', $4)
       WHERE firm_id = $5 AND provider = 'slack'`,
      [tokens.access_token, tokens.refresh_token || null, tokens.team?.name, 
       JSON.stringify(tokens.team?.id || ''), firmId]
    );

    res.redirect(`${frontendUrl}/app/integrations?success=Slack`);
  } catch (error) {
    console.error('Slack callback error:', error);
    res.redirect(`${frontendUrl}/app/integrations?error=Connection failed`);
  }
});

// Disconnect Slack
router.post('/slack/disconnect', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE integrations SET is_connected = false, access_token = NULL, refresh_token = NULL
       WHERE firm_id = $1 AND provider = 'slack'`,
      [req.user.firmId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Slack disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Sync Slack - Get channels
router.post('/slack/sync', authenticate, async (req, res) => {
  try {
    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'slack' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(400).json({ error: 'Slack not connected' });
    }

    const accessToken = integration.rows[0].access_token;

    const channelsResponse = await fetch('https://slack.com/api/conversations.list?limit=20', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const channelsData = await channelsResponse.json();

    await query(
      `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'slack'`,
      [req.user.firmId]
    );

    res.json({ 
      success: true, 
      syncedCount: channelsData.channels?.length || 0,
      channels: (channelsData.channels || []).map(c => ({
        id: c.id,
        name: c.name,
        isPrivate: c.is_private,
        memberCount: c.num_members
      }))
    });
  } catch (error) {
    console.error('Slack sync error:', error);
    res.status(500).json({ error: 'Failed to sync Slack' });
  }
});

// ============================================
// ZOOM INTEGRATION
// ============================================

// Initiate Zoom OAuth
router.get('/zoom/connect', authenticate, async (req, res) => {
  const ZOOM_CLIENT_ID = await getCredential('zoom_client_id', 'ZOOM_CLIENT_ID');
  const ZOOM_REDIRECT_URI = await getCredential('zoom_redirect_uri', 'ZOOM_REDIRECT_URI', 'http://localhost:3001/api/integrations/zoom/callback');

  if (!ZOOM_CLIENT_ID) {
    return res.status(500).json({ error: 'Zoom integration not configured. Please configure Zoom credentials in Admin Portal.' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  
  await query(
    `INSERT INTO integrations (firm_id, provider, settings)
     VALUES ($1, 'zoom', $2)
     ON CONFLICT (firm_id, provider) 
     DO UPDATE SET settings = jsonb_set(COALESCE(integrations.settings, '{}'), '{oauth_state}', $3)`,
    [req.user.firmId, JSON.stringify({ oauth_state: state }), JSON.stringify(state)]
  );

  const authUrl = `https://zoom.us/oauth/authorize?` +
    `client_id=${ZOOM_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(ZOOM_REDIRECT_URI)}` +
    `&state=${state}`;

  res.json({ authUrl });
});

// Zoom OAuth callback
router.get('/zoom/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (error) {
    return res.redirect(`${frontendUrl}/app/integrations?error=${encodeURIComponent(error)}`);
  }

  try {
    const ZOOM_CLIENT_ID = await getCredential('zoom_client_id', 'ZOOM_CLIENT_ID');
    const ZOOM_CLIENT_SECRET = await getCredential('zoom_client_secret', 'ZOOM_CLIENT_SECRET');
    const ZOOM_REDIRECT_URI = await getCredential('zoom_redirect_uri', 'ZOOM_REDIRECT_URI', 'http://localhost:3001/api/integrations/zoom/callback');

    const integration = await query(
      `SELECT * FROM integrations WHERE provider = 'zoom' AND settings->>'oauth_state' = $1`,
      [state]
    );

    if (integration.rows.length === 0) {
      return res.redirect(`${frontendUrl}/app/integrations?error=Invalid state`);
    }

    const firmId = integration.rows[0].firm_id;

    // Exchange code for tokens
    const authHeader = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
    const tokenResponse = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authHeader}`
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: ZOOM_REDIRECT_URI,
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      return res.redirect(`${frontendUrl}/app/integrations?error=${encodeURIComponent(tokens.reason || tokens.error)}`);
    }

    // Get user info
    const userResponse = await fetch('https://api.zoom.us/v2/users/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userData = await userResponse.json();

    await query(
      `UPDATE integrations 
       SET access_token = $1, refresh_token = $2, token_expires_at = NOW() + INTERVAL '1 hour',
           is_connected = true, account_email = $3, account_name = $4, connected_at = NOW(),
           settings = settings - 'oauth_state'
       WHERE firm_id = $5 AND provider = 'zoom'`,
      [tokens.access_token, tokens.refresh_token, userData.email, 
       `${userData.first_name || ''} ${userData.last_name || ''}`.trim(), firmId]
    );

    res.redirect(`${frontendUrl}/app/integrations?success=Zoom`);
  } catch (error) {
    console.error('Zoom callback error:', error);
    res.redirect(`${frontendUrl}/app/integrations?error=Connection failed`);
  }
});

// Disconnect Zoom
router.post('/zoom/disconnect', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE integrations SET is_connected = false, access_token = NULL, refresh_token = NULL
       WHERE firm_id = $1 AND provider = 'zoom'`,
      [req.user.firmId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Zoom disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Sync Zoom - Get upcoming meetings
router.post('/zoom/sync', authenticate, async (req, res) => {
  try {
    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'zoom' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(400).json({ error: 'Zoom not connected' });
    }

    const accessToken = integration.rows[0].access_token;

    const meetingsResponse = await fetch('https://api.zoom.us/v2/users/me/meetings?type=upcoming&page_size=20', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const meetingsData = await meetingsResponse.json();

    await query(
      `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'zoom'`,
      [req.user.firmId]
    );

    res.json({ 
      success: true, 
      syncedCount: meetingsData.meetings?.length || 0,
      meetings: (meetingsData.meetings || []).map(m => ({
        id: m.id,
        topic: m.topic,
        startTime: m.start_time,
        duration: m.duration,
        joinUrl: m.join_url
      }))
    });
  } catch (error) {
    console.error('Zoom sync error:', error);
    res.status(500).json({ error: 'Failed to sync Zoom' });
  }
});

// ============================================
// QUICKEN INTEGRATION
// ============================================

// Initiate Quicken OAuth
router.get('/quicken/connect', authenticate, async (req, res) => {
  const QUICKEN_CLIENT_ID = await getCredential('quicken_client_id', 'QUICKEN_CLIENT_ID');
  const QUICKEN_REDIRECT_URI = await getCredential('quicken_redirect_uri', 'QUICKEN_REDIRECT_URI', 'http://localhost:3001/api/integrations/quicken/callback');

  if (!QUICKEN_CLIENT_ID) {
    return res.status(500).json({ error: 'Quicken integration not configured. Please configure Quicken credentials in Admin Portal.' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  
  await query(
    `INSERT INTO integrations (firm_id, provider, settings)
     VALUES ($1, 'quicken', $2)
     ON CONFLICT (firm_id, provider) 
     DO UPDATE SET settings = jsonb_set(COALESCE(integrations.settings, '{}'), '{oauth_state}', $3)`,
    [req.user.firmId, JSON.stringify({ oauth_state: state }), JSON.stringify(state)]
  );

  // Quicken uses Intuit's platform (like QuickBooks) for Quicken Simplifi
  const scopes = 'openid profile email';
  const authUrl = `https://appcenter.intuit.com/connect/oauth2?` +
    `client_id=${QUICKEN_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(QUICKEN_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scopes)}&state=${state}`;

  res.json({ authUrl });
});

// Quicken OAuth callback
router.get('/quicken/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (error) {
    return res.redirect(`${frontendUrl}/app/integrations?error=${encodeURIComponent(error)}`);
  }

  try {
    const QUICKEN_CLIENT_ID = await getCredential('quicken_client_id', 'QUICKEN_CLIENT_ID');
    const QUICKEN_CLIENT_SECRET = await getCredential('quicken_client_secret', 'QUICKEN_CLIENT_SECRET');
    const QUICKEN_REDIRECT_URI = await getCredential('quicken_redirect_uri', 'QUICKEN_REDIRECT_URI', 'http://localhost:3001/api/integrations/quicken/callback');

    const integration = await query(
      `SELECT * FROM integrations WHERE provider = 'quicken' AND settings->>'oauth_state' = $1`,
      [state]
    );

    if (integration.rows.length === 0) {
      return res.redirect(`${frontendUrl}/app/integrations?error=Invalid state`);
    }

    const firmId = integration.rows[0].firm_id;

    // Exchange code for tokens
    const authHeader = Buffer.from(`${QUICKEN_CLIENT_ID}:${QUICKEN_CLIENT_SECRET}`).toString('base64');
    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authHeader}`,
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: QUICKEN_REDIRECT_URI,
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      return res.redirect(`${frontendUrl}/app/integrations?error=${encodeURIComponent(tokens.error_description || tokens.error)}`);
    }

    // Get user info from ID token or userinfo endpoint
    let userData = { email: '', name: '' };
    try {
      const userResponse = await fetch('https://accounts.intuit.com/v1/openid_connect/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      userData = await userResponse.json();
    } catch (e) {
      console.log('Could not fetch Quicken user info');
    }

    await query(
      `UPDATE integrations 
       SET access_token = $1, refresh_token = $2, token_expires_at = NOW() + INTERVAL '1 hour',
           is_connected = true, account_email = $3, account_name = $4, connected_at = NOW(),
           settings = settings - 'oauth_state'
       WHERE firm_id = $5 AND provider = 'quicken'`,
      [tokens.access_token, tokens.refresh_token, userData.email || userData.sub, 
       userData.name || userData.givenName || '', firmId]
    );

    res.redirect(`${frontendUrl}/app/integrations?success=Quicken`);
  } catch (error) {
    console.error('Quicken callback error:', error);
    res.redirect(`${frontendUrl}/app/integrations?error=Connection failed`);
  }
});

// Disconnect Quicken
router.post('/quicken/disconnect', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE integrations SET is_connected = false, access_token = NULL, refresh_token = NULL
       WHERE firm_id = $1 AND provider = 'quicken'`,
      [req.user.firmId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Quicken disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Sync Quicken - placeholder for financial data sync
router.post('/quicken/sync', authenticate, async (req, res) => {
  try {
    const integration = await query(
      `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'quicken' AND is_connected = true`,
      [req.user.firmId]
    );

    if (integration.rows.length === 0) {
      return res.status(400).json({ error: 'Quicken not connected' });
    }

    await query(
      `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'quicken'`,
      [req.user.firmId]
    );

    res.json({ 
      success: true, 
      syncedCount: 0,
      message: 'Quicken sync completed. Financial data is available through the connected account.'
    });
  } catch (error) {
    console.error('Quicken sync error:', error);
    res.status(500).json({ error: 'Failed to sync Quicken' });
  }
});

export default router;
