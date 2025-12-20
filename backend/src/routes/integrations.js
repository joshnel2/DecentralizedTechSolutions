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
const CACHE_TTL = 60000; // 1 minute cache

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

async function getCredential(dbKey, envKey, defaultValue = '') {
  const settings = await getPlatformSettings();
  return settings[dbKey] || process.env[envKey] || defaultValue;
}

// ============================================
// INTEGRATION SETTINGS
// ============================================

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

    res.json({ integrations });
  } catch (error) {
    console.error('Get integrations error:', error);
    res.status(500).json({ error: 'Failed to get integrations' });
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

    // Import events
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

    // Update last sync time
    await query(
      `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'google'`,
      [req.user.firmId]
    );

    res.json({ success: true, syncedCount });
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
  const QB_REDIRECT_URI = await getCredential('quickbooks_redirect_uri', 'QUICKBOOKS_REDIRECT_URI', 'http://localhost:3001/api/integrations/quickbooks/callback');
  const QB_ENVIRONMENT = await getCredential('quickbooks_environment', 'QUICKBOOKS_ENVIRONMENT', 'sandbox');

  if (!QB_CLIENT_ID) {
    return res.status(500).json({ error: 'QuickBooks integration not configured. Please configure in Admin Portal.' });
  }

  const state = Buffer.from(JSON.stringify({
    nonce: crypto.randomBytes(32).toString('hex'),
    firmId: req.user.firmId,
    userId: req.user.id,
  })).toString('base64');

  const scopes = 'com.intuit.quickbooks.accounting';
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
    const QB_REDIRECT_URI = await getCredential('quickbooks_redirect_uri', 'QUICKBOOKS_REDIRECT_URI', 'http://localhost:3001/api/integrations/quickbooks/callback');
    const QB_ENVIRONMENT = await getCredential('quickbooks_environment', 'QUICKBOOKS_ENVIRONMENT', 'sandbox');

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

    // Update last sync time
    await query(
      `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'quickbooks'`,
      [req.user.firmId]
    );

    res.json({
      success: true,
      accounts: accountsData.QueryResponse?.Account || [],
      invoices: invoicesData.QueryResponse?.Invoice || [],
    });
  } catch (error) {
    console.error('QuickBooks sync error:', error);
    res.status(500).json({ error: 'Failed to sync QuickBooks data' });
  }
});

// ============================================
// OUTLOOK/MICROSOFT INTEGRATION
// ============================================

// Initiate Microsoft OAuth
router.get('/outlook/connect', authenticate, async (req, res) => {
  const MS_CLIENT_ID = await getCredential('microsoft_client_id', 'MICROSOFT_CLIENT_ID');
  const MS_REDIRECT_URI = await getCredential('microsoft_redirect_uri', 'MICROSOFT_REDIRECT_URI', 'http://localhost:3001/api/integrations/outlook/callback');
  const MS_TENANT = await getCredential('microsoft_tenant', 'MICROSOFT_TENANT', 'common');

  if (!MS_CLIENT_ID) {
    return res.status(500).json({ error: 'Microsoft integration not configured. Please configure in Admin Portal.' });
  }

  const state = Buffer.from(JSON.stringify({
    nonce: crypto.randomBytes(32).toString('hex'),
    firmId: req.user.firmId,
    userId: req.user.id,
  })).toString('base64');

  const scopes = [
    'openid',
    'profile',
    'email',
    'offline_access',
    'Mail.Read',
    'Mail.Send',
    'Calendars.ReadWrite',
  ].join(' ');

  const authUrl = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/authorize?` +
    `client_id=${MS_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(MS_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&response_mode=query` +
    `&state=${state}`;

  res.json({ authUrl });
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
    const MS_REDIRECT_URI = await getCredential('microsoft_redirect_uri', 'MICROSOFT_REDIRECT_URI', 'http://localhost:3001/api/integrations/outlook/callback');
    const MS_TENANT = await getCredential('microsoft_tenant', 'MICROSOFT_TENANT', 'common');

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
      return res.redirect(`${process.env.FRONTEND_URL}/app/settings/integrations?error=token_error`);
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
      accessToken = newTokens.access_token;

      await query(
        `UPDATE integrations SET access_token = $1, token_expires_at = NOW() + INTERVAL '1 hour'
         WHERE firm_id = $2 AND provider = 'outlook'`,
        [accessToken, req.user.firmId]
      );
    }

    // Fetch recent emails
    const emailsResponse = await fetch(
      'https://graph.microsoft.com/v1.0/me/messages?$top=20&$orderby=receivedDateTime desc',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const emailsData = await emailsResponse.json();

    res.json({
      emails: (emailsData.value || []).map(email => ({
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

    await query(
      `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'outlook'`,
      [req.user.firmId]
    );

    res.json({ success: true, syncedCount });
  } catch (error) {
    console.error('Outlook sync error:', error);
    res.status(500).json({ error: 'Failed to sync calendar' });
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

    // Get files from OneDrive
    const filesResponse = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const filesData = await filesResponse.json();

    await query(
      `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'onedrive'`,
      [req.user.firmId]
    );

    res.json({ 
      success: true, 
      syncedCount: filesData.value?.length || 0,
      files: (filesData.value || []).slice(0, 20).map(f => ({
        id: f.id,
        name: f.name,
        size: f.size,
        folder: !!f.folder,
        webUrl: f.webUrl
      }))
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

    const filesResponse = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=20&fields=files(id,name,mimeType,size,webViewLink)', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const filesData = await filesResponse.json();

    await query(
      `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'googledrive'`,
      [req.user.firmId]
    );

    res.json({ 
      success: true, 
      syncedCount: filesData.files?.length || 0,
      files: (filesData.files || []).map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        webUrl: f.webViewLink
      }))
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

    const filesResponse = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: '', limit: 20 }),
    });

    const filesData = await filesResponse.json();

    await query(
      `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'dropbox'`,
      [req.user.firmId]
    );

    res.json({ 
      success: true, 
      syncedCount: filesData.entries?.length || 0,
      files: (filesData.entries || []).map(f => ({
        id: f.id,
        name: f.name,
        path: f.path_display,
        folder: f['.tag'] === 'folder',
        size: f.size
      }))
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
