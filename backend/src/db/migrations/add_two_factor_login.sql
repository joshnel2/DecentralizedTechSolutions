-- Add columns needed for secure 2FA login challenge flow
-- Keeps users.two_factor_secret for the actual TOTP secret (authenticator apps)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'two_factor_temp_token_hash'
  ) THEN
    ALTER TABLE users ADD COLUMN two_factor_temp_token_hash VARCHAR(255);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'two_factor_temp_token_created_at'
  ) THEN
    ALTER TABLE users ADD COLUMN two_factor_temp_token_created_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

