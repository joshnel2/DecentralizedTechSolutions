-- Migration: Add AI custom instructions column to users table
-- This allows each user to customize how the AI assistant behaves for them

-- Add the column for storing custom AI instructions
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_custom_instructions TEXT;

-- Add a comment explaining the column
COMMENT ON COLUMN users.ai_custom_instructions IS 'User-defined custom instructions for the AI assistant. These are prepended to the system prompt when the user interacts with the AI.';

-- Optional: Add an index if you plan to search/filter by this field (usually not needed)
-- CREATE INDEX idx_users_ai_custom_instructions ON users(ai_custom_instructions) WHERE ai_custom_instructions IS NOT NULL;
