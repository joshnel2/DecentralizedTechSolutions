import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// ============================================
// NOTIFICATION PREFERENCES
// ============================================

// Get user's notification preferences
router.get('/preferences', async (req, res) => {
  try {
    const firmId = req.user.firmId;
    const userId = req.user.id;
    
    // Try to get existing preferences
    let result = await query(
      `SELECT * FROM notification_preferences WHERE user_id = $1 AND firm_id = $2`,
      [userId, firmId]
    );
    
    // If no preferences exist, create defaults
    if (result.rows.length === 0) {
      result = await query(`
        INSERT INTO notification_preferences (user_id, firm_id)
        VALUES ($1, $2)
        RETURNING *
      `, [userId, firmId]);
    }
    
    const prefs = result.rows[0];
    
    // Get user's phone/email from users table if not in preferences
    const userResult = await query(
      `SELECT email, phone FROM users WHERE id = $1`,
      [userId]
    );
    const user = userResult.rows[0] || {};
    
    res.json({
      success: true,
      preferences: {
        ...prefs,
        email: user.email,
        phone: user.phone || prefs.sms_phone
      }
    });
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// Update notification preferences
router.put('/preferences', async (req, res) => {
  try {
    const firmId = req.user.firmId;
    const userId = req.user.id;
    
    const {
      // Email settings
      in_app,
      email_immediate,
      email_digest,
      digest_frequency,
      // In-app settings
      document_changes,
      document_shares,
      co_editing,
      matter_updates,
      billing_updates,
      // SMS settings
      sms_enabled,
      sms_phone,
      sms_deadlines,
      sms_urgent_matters,
      sms_payments,
      sms_calendar,
      // Other
      ai_notifications,
      push_enabled,
      quiet_hours_start,
      quiet_hours_end
    } = req.body;
    
    const result = await query(`
      INSERT INTO notification_preferences (
        user_id, firm_id, in_app, email_immediate, email_digest, digest_frequency,
        document_changes, document_shares, co_editing, matter_updates, billing_updates,
        sms_enabled, sms_phone, sms_deadlines, sms_urgent_matters, sms_payments, sms_calendar,
        ai_notifications, push_enabled, quiet_hours_start, quiet_hours_end, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        in_app = COALESCE($3, notification_preferences.in_app),
        email_immediate = COALESCE($4, notification_preferences.email_immediate),
        email_digest = COALESCE($5, notification_preferences.email_digest),
        digest_frequency = COALESCE($6, notification_preferences.digest_frequency),
        document_changes = COALESCE($7, notification_preferences.document_changes),
        document_shares = COALESCE($8, notification_preferences.document_shares),
        co_editing = COALESCE($9, notification_preferences.co_editing),
        matter_updates = COALESCE($10, notification_preferences.matter_updates),
        billing_updates = COALESCE($11, notification_preferences.billing_updates),
        sms_enabled = COALESCE($12, notification_preferences.sms_enabled),
        sms_phone = COALESCE($13, notification_preferences.sms_phone),
        sms_deadlines = COALESCE($14, notification_preferences.sms_deadlines),
        sms_urgent_matters = COALESCE($15, notification_preferences.sms_urgent_matters),
        sms_payments = COALESCE($16, notification_preferences.sms_payments),
        sms_calendar = COALESCE($17, notification_preferences.sms_calendar),
        ai_notifications = COALESCE($18, notification_preferences.ai_notifications),
        push_enabled = COALESCE($19, notification_preferences.push_enabled),
        quiet_hours_start = COALESCE($20, notification_preferences.quiet_hours_start),
        quiet_hours_end = COALESCE($21, notification_preferences.quiet_hours_end),
        updated_at = NOW()
      RETURNING *
    `, [
      userId, firmId, in_app, email_immediate, email_digest, digest_frequency,
      document_changes, document_shares, co_editing, matter_updates, billing_updates,
      sms_enabled, sms_phone, sms_deadlines, sms_urgent_matters, sms_payments, sms_calendar,
      ai_notifications, push_enabled, quiet_hours_start, quiet_hours_end
    ]);
    
    res.json({ success: true, preferences: result.rows[0] });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// ============================================
// NOTIFICATIONS CRUD
// ============================================

// Get notifications for user
router.get('/', async (req, res) => {
  try {
    const firmId = req.user.firmId;
    const userId = req.user.id;
    const { limit = 50, offset = 0, unread_only = false } = req.query;
    
    let query = `
      SELECT n.*, 
        u.name as triggered_by_name,
        u.avatar_url as triggered_by_avatar
      FROM notifications n
      LEFT JOIN users u ON n.triggered_by = u.id
      WHERE n.user_id = $1 AND n.firm_id = $2
    `;
    const params = [userId, firmId];
    
    if (unread_only === 'true') {
      query += ` AND n.read_at IS NULL`;
    }
    
    query += ` ORDER BY n.created_at DESC LIMIT $3 OFFSET $4`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await query(query, params);
    
    // Get unread count
    const countResult = await query(
      `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND firm_id = $2 AND read_at IS NULL`,
      [userId, firmId]
    );
    
    res.json({
      success: true,
      notifications: result.rows,
      unread_count: parseInt(countResult.rows[0].count),
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Create a notification (internal API / AI tool)
router.post('/', async (req, res) => {
  try {
    const firmId = req.user.firmId;
    
    const {
      user_id, // Can be single user or 'all' for all firm users
      type,
      title,
      message,
      priority = 'normal',
      entity_type,
      entity_id,
      action_url,
      channels = ['in_app'], // ['in_app', 'email', 'sms']
      scheduled_for,
      metadata
    } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    // If user_id is 'all', get all users in firm
    let targetUserIds = [];
    if (user_id === 'all') {
      const usersResult = await query(
        `SELECT id FROM users WHERE firm_id = $1`,
        [firmId]
      );
      targetUserIds = usersResult.rows.map(u => u.id);
    } else if (Array.isArray(user_id)) {
      targetUserIds = user_id;
    } else {
      targetUserIds = [user_id || req.user.id];
    }
    
    const notifications = [];
    const triggeredBy = req.user.id;
    
    for (const targetUserId of targetUserIds) {
      // Create the notification
      const result = await query(`
        INSERT INTO notifications (
          firm_id, user_id, type, title, message, priority,
          entity_type, entity_id, action_url, scheduled_for, metadata, triggered_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [
        firmId, targetUserId, type || 'general', title, message, priority,
        entity_type, entity_id, action_url, scheduled_for, 
        metadata ? JSON.stringify(metadata) : '{}', triggeredBy
      ]);
      
      const notification = result.rows[0];
      notifications.push(notification);
      
      // Queue delivery for each channel
      for (const channel of channels) {
        await queueNotificationDelivery(notification, channel, targetUserId, firmId);
      }
    }
    
    res.json({ 
      success: true, 
      notifications,
      message: `Created ${notifications.length} notification(s)`
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// Mark notification as read
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const result = await query(`
      UPDATE notifications SET read_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [id, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json({ success: true, notification: result.rows[0] });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// Mark all notifications as read
router.put('/read-all', async (req, res) => {
  try {
    const firmId = req.user.firmId;
    const userId = req.user.id;
    
    const result = await query(`
      UPDATE notifications SET read_at = NOW()
      WHERE user_id = $1 AND firm_id = $2 AND read_at IS NULL
    `, [userId, firmId]);
    
    res.json({ success: true, updated: result.rowCount });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

// Delete notification
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    await query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// ============================================
// NOTIFICATION DELIVERY (Email/SMS)
// ============================================

async function queueNotificationDelivery(notification, channel, userId, firmId) {
  try {
    // Get user preferences
    const prefsResult = await query(
      `SELECT * FROM notification_preferences WHERE user_id = $1`,
      [userId]
    );
    const prefs = prefsResult.rows[0] || {};
    
    // Get user contact info
    const userResult = await query(
      `SELECT email, phone FROM users WHERE id = $1`,
      [userId]
    );
    const user = userResult.rows[0] || {};
    
    // Check if user wants this channel
    if (channel === 'email' && !prefs.email_immediate) return;
    if (channel === 'sms' && !prefs.sms_enabled) return;
    if (channel === 'in_app' && prefs.in_app === false) return;
    
    // Create delivery record
    const deliveryData = {
      notification_id: notification.id,
      firm_id: firmId,
      user_id: userId,
      channel,
      status: 'pending'
    };
    
    if (channel === 'email') {
      deliveryData.email_to = user.email;
      deliveryData.email_subject = notification.title;
    } else if (channel === 'sms') {
      deliveryData.sms_to = prefs.sms_phone || user.phone;
    }
    
    await query(`
      INSERT INTO notification_deliveries (
        notification_id, firm_id, user_id, channel, status,
        email_to, email_subject, sms_to
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      deliveryData.notification_id, deliveryData.firm_id, deliveryData.user_id,
      deliveryData.channel, deliveryData.status,
      deliveryData.email_to, deliveryData.email_subject, deliveryData.sms_to
    ]);
    
    // Actually send the notification (would connect to Twilio/SendGrid in production)
    if (channel === 'email') {
      await sendEmailNotification(notification, user.email);
    } else if (channel === 'sms') {
      await sendSMSNotification(notification, prefs.sms_phone || user.phone);
    }
  } catch (error) {
    console.error(`Error queuing ${channel} delivery:`, error);
  }
}

async function sendEmailNotification(notification, email) {
  // In production, this would use SendGrid, Postmark, etc.
  console.log(`📧 Would send email to ${email}:`, {
    subject: notification.title,
    body: notification.message
  });
  
  // Mark as sent
  await query(`
    UPDATE notification_deliveries 
    SET status = 'sent', sent_at = NOW()
    WHERE notification_id = $1 AND channel = 'email'
  `, [notification.id]);
  
  return { success: true, provider: 'console' };
}

async function sendSMSNotification(notification, phone) {
  // In production, this would use Twilio
  console.log(`📱 Would send SMS to ${phone}:`, notification.title);
  
  // Check for Twilio credentials
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
  
  if (twilioSid && twilioToken && twilioPhone && phone) {
    try {
      // Dynamic import of Twilio
      const twilio = await import('twilio');
      const client = twilio.default(twilioSid, twilioToken);
      
      const message = await client.messages.create({
        body: `APEX: ${notification.title}${notification.message ? ' - ' + notification.message : ''}`,
        from: twilioPhone,
        to: phone
      });
      
      // Mark as sent with provider ID
      await query(`
        UPDATE notification_deliveries 
        SET status = 'sent', sent_at = NOW(), sms_provider_id = $2
        WHERE notification_id = $1 AND channel = 'sms'
      `, [notification.id, message.sid]);
      
      return { success: true, provider: 'twilio', sid: message.sid };
    } catch (error) {
      console.error('Twilio error:', error);
      await query(`
        UPDATE notification_deliveries 
        SET status = 'failed', failed_at = NOW(), failure_reason = $2
        WHERE notification_id = $1 AND channel = 'sms'
      `, [notification.id, error.message]);
    }
  } else {
    // Mark as sent (simulated)
    await query(`
      UPDATE notification_deliveries 
      SET status = 'sent', sent_at = NOW()
      WHERE notification_id = $1 AND channel = 'sms'
    `, [notification.id]);
  }
  
  return { success: true, provider: 'console' };
}

// ============================================
// NOTIFICATION TEMPLATES
// ============================================

// Get templates
router.get('/templates', async (req, res) => {
  try {
    const firmId = req.user.firmId;
    
    const result = await query(`
      SELECT * FROM notification_templates 
      WHERE firm_id = $1 OR firm_id IS NULL
      ORDER BY firm_id NULLS LAST, type, channel
    `, [firmId]);
    
    res.json({ success: true, templates: result.rows });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Create/update custom template
router.post('/templates', async (req, res) => {
  try {
    const firmId = req.user.firmId;
    const { type, channel, name, subject, body, available_variables } = req.body;
    
    const result = await query(`
      INSERT INTO notification_templates (firm_id, type, channel, name, subject, body, available_variables)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (firm_id, type, channel) DO UPDATE SET
        name = EXCLUDED.name,
        subject = EXCLUDED.subject,
        body = EXCLUDED.body,
        available_variables = EXCLUDED.available_variables,
        updated_at = NOW()
      RETURNING *
    `, [firmId, type, channel, name, subject, body, JSON.stringify(available_variables || [])]);
    
    res.json({ success: true, template: result.rows[0] });
  } catch (error) {
    console.error('Error saving template:', error);
    res.status(500).json({ error: 'Failed to save template' });
  }
});

// ============================================
// SMS CONFIGURATION
// ============================================

// Test SMS
router.post('/test-sms', async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    // Create a test notification
    const testNotification = {
      id: 'test-' + Date.now(),
      title: 'Test Message',
      message: 'This is a test SMS from Apex Legal. If you received this, SMS notifications are working correctly!'
    };
    
    const result = await sendSMSNotification(testNotification, phone);
    
    res.json({ 
      success: true, 
      message: 'Test SMS sent successfully',
      provider: result.provider
    });
  } catch (error) {
    console.error('Error sending test SMS:', error);
    res.status(500).json({ error: 'Failed to send test SMS' });
  }
});

// Verify phone number (send verification code)
router.post('/verify-phone', async (req, res) => {
  try {
    const userId = req.user.id;
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store code temporarily (in production, use Redis with TTL)
    // For now, we'll use the database
    await query(`
      INSERT INTO notification_preferences (user_id, firm_id, sms_phone)
      VALUES ($1, (SELECT firm_id FROM users WHERE id = $1), $2)
      ON CONFLICT (user_id) DO UPDATE SET sms_phone = $2
    `, [userId, phone]);
    
    // Send verification SMS
    await sendSMSNotification(
      { id: 'verify-' + Date.now(), title: `Your Apex verification code is: ${code}` },
      phone
    );
    
    // In production, store the code securely and verify it
    res.json({ 
      success: true, 
      message: 'Verification code sent',
      // Only include code in development
      ...(process.env.NODE_ENV !== 'production' && { code })
    });
  } catch (error) {
    console.error('Error sending verification:', error);
    res.status(500).json({ error: 'Failed to send verification' });
  }
});

export default router;
