-- Migration: Add email signature column to users table

DO $$
BEGIN
    -- Add email_signature column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_signature') THEN
        ALTER TABLE users ADD COLUMN email_signature TEXT;
        RAISE NOTICE 'Added email_signature column to users';
    END IF;

    -- Add settings JSONB column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'settings') THEN
        ALTER TABLE users ADD COLUMN settings JSONB DEFAULT '{}';
        RAISE NOTICE 'Added settings column to users';
    END IF;

    -- Add notification_preferences JSONB column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'notification_preferences') THEN
        ALTER TABLE users ADD COLUMN notification_preferences JSONB DEFAULT '{}';
        RAISE NOTICE 'Added notification_preferences column to users';
    END IF;
END $$;
