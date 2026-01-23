-- Migration: Add Azure folder column to firms table
-- This allows each firm to have a custom Azure folder path instead of auto-generated firm-{id}

-- Add azure_folder column to firms table
ALTER TABLE firms ADD COLUMN IF NOT EXISTS azure_folder VARCHAR(255);

-- Add index for faster lookups by azure folder
CREATE INDEX IF NOT EXISTS idx_firms_azure_folder ON firms(azure_folder) WHERE azure_folder IS NOT NULL;

-- Add drive_settings jsonb column for additional drive configuration
ALTER TABLE firms ADD COLUMN IF NOT EXISTS drive_settings JSONB DEFAULT '{}';

-- Comment for documentation
COMMENT ON COLUMN firms.azure_folder IS 'Custom Azure File Share folder path for this firm. If null, defaults to firm-{id}';
COMMENT ON COLUMN firms.drive_settings IS 'Drive-related settings: scan config, permissions defaults, sync options';
