import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();

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

    const integrations = {
      google: null,
      quickbooks: null,
      outlook: null,
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

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/integrations/google/callback';

// Initiate Google OAuth
router.get('/google/connect', authenticate, (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'Google integration not configured' });
  }

  const state = crypto.randomBytes(32).toString('hex');
  
  // Store state in session or database for verification
  // For simplicity, we'll encode user info in state (in production, use a proper session)
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

const QB_CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID;
const QB_CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET;
const QB_REDIRECT_URI = process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:3001/api/integrations/quickbooks/callback';
const QB_ENVIRONMENT = process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox'; // 'sandbox' or 'production'

// Initiate QuickBooks OAuth
router.get('/quickbooks/connect', authenticate, (req, res) => {
  if (!QB_CLIENT_ID) {
    return res.status(500).json({ error: 'QuickBooks integration not configured' });
  }

  const state = Buffer.from(JSON.stringify({
    nonce: crypto.randomBytes(32).toString('hex'),
    firmId: req.user.firmId,
    userId: req.user.id,
  })).toString('base64');

  const scopes = 'com.intuit.quickbooks.accounting';
  const baseUrl = QB_ENVIRONMENT === 'production' 
    ? 'https://appcenter.intuit.com/connect/oauth2'
    : 'https://appcenter.intuit.com/connect/oauth2';

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

const MS_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MS_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const MS_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3001/api/integrations/outlook/callback';
const MS_TENANT = process.env.MICROSOFT_TENANT || 'common';

// Initiate Microsoft OAuth
router.get('/outlook/connect', authenticate, (req, res) => {
  if (!MS_CLIENT_ID) {
    return res.status(500).json({ error: 'Microsoft integration not configured' });
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

export default router;
