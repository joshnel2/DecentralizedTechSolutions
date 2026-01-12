-- Add column to store the full API key value (for admin visibility)
-- Note: This trades some security for convenience. In high-security environments,
-- consider encrypting this value at rest.

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_value VARCHAR(255);

-- Update schema comment
COMMENT ON COLUMN api_keys.key_value IS 'Full API key value, visible to admins';
COMMENT ON COLUMN api_keys.key_hash IS 'Hash of the key for authentication lookups';
