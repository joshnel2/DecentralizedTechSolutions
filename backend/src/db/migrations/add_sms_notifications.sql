-- Migration: Enhanced Notifications with SMS Support
-- Adds SMS delivery, notification templates, and delivery tracking

-- ============================================
-- UPDATE NOTIFICATION_PREFERENCES FOR SMS
-- ============================================

DO $$
BEGIN
    -- Add SMS enabled toggle
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notification_preferences' AND column_name = 'sms_enabled'
    ) THEN
        ALTER TABLE notification_preferences ADD COLUMN sms_enabled BOOLEAN DEFAULT false;
    END IF;

    -- Add phone number for SMS
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notification_preferences' AND column_name = 'sms_phone'
    ) THEN
        ALTER TABLE notification_preferences ADD COLUMN sms_phone VARCHAR(20);
    END IF;

    -- Add SMS notification types
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notification_preferences' AND column_name = 'sms_deadlines'
    ) THEN
        ALTER TABLE notification_preferences ADD COLUMN sms_deadlines BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notification_preferences' AND column_name = 'sms_urgent_matters'
    ) THEN
        ALTER TABLE notification_preferences ADD COLUMN sms_urgent_matters BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notification_preferences' AND column_name = 'sms_payments'
    ) THEN
        ALTER TABLE notification_preferences ADD COLUMN sms_payments BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notification_preferences' AND column_name = 'sms_calendar'
    ) THEN
        ALTER TABLE notification_preferences ADD COLUMN sms_calendar BOOLEAN DEFAULT false;
    END IF;

    -- Add AI notifications preference
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notification_preferences' AND column_name = 'ai_notifications'
    ) THEN
        ALTER TABLE notification_preferences ADD COLUMN ai_notifications BOOLEAN DEFAULT true;
    END IF;

    -- Add push notification preferences
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notification_preferences' AND column_name = 'push_enabled'
    ) THEN
        ALTER TABLE notification_preferences ADD COLUMN push_enabled BOOLEAN DEFAULT true;
    END IF;
END $$;

-- ============================================
-- NOTIFICATION DELIVERY LOG
-- ============================================

CREATE TABLE IF NOT EXISTS notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Delivery details
    channel VARCHAR(20) NOT NULL, -- 'in_app', 'email', 'sms', 'push'
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed', 'bounced'
    
    -- For email
    email_to VARCHAR(255),
    email_subject VARCHAR(500),
    email_message_id VARCHAR(255),
    
    -- For SMS
    sms_to VARCHAR(20),
    sms_provider_id VARCHAR(255), -- Twilio message SID, etc.
    
    -- Tracking
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,
    
    -- Retry tracking
    retry_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification ON notification_deliveries(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user ON notification_deliveries(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status ON notification_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_pending ON notification_deliveries(status, next_retry_at) WHERE status = 'pending';

-- ============================================
-- NOTIFICATION TEMPLATES
-- ============================================

CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE, -- NULL = system template
    
    -- Template identification
    type VARCHAR(50) NOT NULL, -- 'deadline_reminder', 'matter_update', 'payment_received', etc.
    channel VARCHAR(20) NOT NULL, -- 'email', 'sms', 'push'
    
    -- Template content
    name VARCHAR(100) NOT NULL,
    subject VARCHAR(500), -- For email
    body TEXT NOT NULL,
    
    -- Variables available (stored as JSON array)
    available_variables JSONB DEFAULT '[]',
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(firm_id, type, channel)
);

-- Insert default templates
INSERT INTO notification_templates (firm_id, type, channel, name, subject, body, available_variables, is_default) VALUES
    -- Email templates
    (NULL, 'deadline_reminder', 'email', 'Deadline Reminder', 
     'Reminder: {{matter_name}} deadline in {{time_until}}',
     'Hello {{user_name}},\n\nThis is a reminder that you have an upcoming deadline:\n\nMatter: {{matter_name}}\nDeadline: {{deadline_date}}\nTime remaining: {{time_until}}\n\nDescription: {{deadline_description}}\n\nPlease ensure this is addressed promptly.\n\nBest regards,\nApex Legal',
     '["user_name", "matter_name", "deadline_date", "time_until", "deadline_description"]', true),
    
    (NULL, 'matter_update', 'email', 'Matter Update',
     'Update on {{matter_name}}',
     'Hello {{user_name}},\n\nThere has been an update on matter {{matter_name}}:\n\n{{update_message}}\n\nUpdated by: {{updated_by}}\nTime: {{update_time}}\n\nView matter: {{matter_link}}\n\nBest regards,\nApex Legal',
     '["user_name", "matter_name", "update_message", "updated_by", "update_time", "matter_link"]', true),
    
    (NULL, 'payment_received', 'email', 'Payment Received',
     'Payment received for {{invoice_number}}',
     'Hello {{user_name}},\n\nA payment has been received:\n\nClient: {{client_name}}\nInvoice: {{invoice_number}}\nAmount: {{payment_amount}}\nPayment method: {{payment_method}}\n\nThank you,\nApex Legal',
     '["user_name", "client_name", "invoice_number", "payment_amount", "payment_method"]', true),
    
    -- SMS templates
    (NULL, 'deadline_reminder', 'sms', 'Deadline Reminder SMS',
     NULL,
     'APEX: Deadline reminder - {{matter_name}} due {{time_until}}. Check app for details.',
     '["matter_name", "time_until"]', true),
    
    (NULL, 'urgent_matter', 'sms', 'Urgent Matter SMS',
     NULL,
     'APEX URGENT: {{matter_name}} - {{message}}. Reply STOP to unsubscribe.',
     '["matter_name", "message"]', true),
    
    (NULL, 'payment_received', 'sms', 'Payment Received SMS',
     NULL,
     'APEX: Payment of {{payment_amount}} received for {{client_name}}.',
     '["payment_amount", "client_name"]', true),
    
    (NULL, 'calendar_reminder', 'sms', 'Calendar Reminder SMS',
     NULL,
     'APEX: Reminder - {{event_title}} at {{event_time}}.',
     '["event_title", "event_time"]', true)
ON CONFLICT (firm_id, type, channel) DO NOTHING;

-- ============================================
-- ADD COLUMNS TO NOTIFICATIONS TABLE
-- ============================================

DO $$
BEGIN
    -- Add priority
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notifications' AND column_name = 'priority'
    ) THEN
        ALTER TABLE notifications ADD COLUMN priority VARCHAR(20) DEFAULT 'normal'; -- 'low', 'normal', 'high', 'urgent'
    END IF;

    -- Add action URL
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notifications' AND column_name = 'action_url'
    ) THEN
        ALTER TABLE notifications ADD COLUMN action_url TEXT;
    END IF;

    -- Add delivery status
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notifications' AND column_name = 'delivery_status'
    ) THEN
        ALTER TABLE notifications ADD COLUMN delivery_status JSONB DEFAULT '{}'; -- Track per-channel status
    END IF;

    -- Add scheduled_for (for future notifications)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notifications' AND column_name = 'scheduled_for'
    ) THEN
        ALTER TABLE notifications ADD COLUMN scheduled_for TIMESTAMPTZ;
    END IF;

    -- Add metadata
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notifications' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE notifications ADD COLUMN metadata JSONB DEFAULT '{}';
    END IF;
END $$;

-- Index for scheduled notifications
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled ON notifications(scheduled_for) WHERE scheduled_for IS NOT NULL;

SELECT 'SMS notifications migration completed!' as status;
