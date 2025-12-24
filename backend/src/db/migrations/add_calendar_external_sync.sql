-- Migration: Add external sync support to calendar_events
-- This allows syncing calendar events from external sources like Outlook and Google Calendar

-- Add external_id column to track the event ID from the external source
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);

-- Add external_source column to track where the event came from (e.g., 'outlook', 'google')
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS external_source VARCHAR(50);

-- Create index for faster lookups when syncing
CREATE INDEX IF NOT EXISTS idx_calendar_events_external 
ON calendar_events(firm_id, external_id, external_source);

-- Add unique constraint to prevent duplicate synced events
-- (a firm can only have one event with a given external_id from a given source)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_firm_external_unique'
    ) THEN
        ALTER TABLE calendar_events 
        ADD CONSTRAINT calendar_events_firm_external_unique 
        UNIQUE (firm_id, external_id, external_source);
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
