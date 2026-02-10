-- Migration: Add User AI Memory File
-- Each user gets a persistent "memory file" that the AI reads on every interaction.
-- Entries accumulate as the user works on the platform, and are periodically cleaned/consolidated.

-- The memory file is a collection of entries, each with a category and content.
-- Categories help organize and prioritize what gets injected into the AI prompt.
CREATE TABLE IF NOT EXISTS user_ai_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,

    -- Category for organizing memory entries
    -- core_identity: name, role, practice areas, preferences (rarely changes)
    -- working_style: how they like things done, tone, format preferences
    -- active_context: current matters, ongoing projects, recent focus areas
    -- learned_preference: inferred from behavior (auto-generated)
    -- correction: something the user or AI feedback corrected
    -- insight: interesting observation about the user's patterns
    category VARCHAR(50) NOT NULL DEFAULT 'learned_preference'
        CHECK (category IN (
            'core_identity', 'working_style', 'active_context',
            'learned_preference', 'correction', 'insight'
        )),

    -- The actual memory content (human-readable text)
    content TEXT NOT NULL,

    -- Where this memory came from
    -- user_explicit: user typed it in settings
    -- ai_inferred: AI learned it from interactions
    -- system_observed: system observed from behavior patterns
    -- task_feedback: learned from background task feedback
    -- document_analysis: learned from document patterns
    -- chat_interaction: learned from chat conversations
    source VARCHAR(50) NOT NULL DEFAULT 'ai_inferred'
        CHECK (source IN (
            'user_explicit', 'ai_inferred', 'system_observed',
            'task_feedback', 'document_analysis', 'chat_interaction'
        )),

    -- How confident we are in this memory (0.0 to 1.0)
    -- Higher confidence = more likely to be included in prompt
    confidence DECIMAL(3,2) NOT NULL DEFAULT 0.7,

    -- How many times this memory has been reinforced
    reinforcement_count INTEGER NOT NULL DEFAULT 1,

    -- Whether this entry is pinned (user wants it always included)
    pinned BOOLEAN NOT NULL DEFAULT false,

    -- Whether the user has dismissed/hidden this entry
    dismissed BOOLEAN NOT NULL DEFAULT false,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,

    -- Content hash for deduplication
    content_hash VARCHAR(64) GENERATED ALWAYS AS (encode(sha256(content::text::bytea), 'hex')) STORED
);

-- Indexes for fast memory retrieval
CREATE INDEX IF NOT EXISTS idx_user_ai_memory_user_firm
    ON user_ai_memory(user_id, firm_id);
CREATE INDEX IF NOT EXISTS idx_user_ai_memory_category
    ON user_ai_memory(user_id, firm_id, category);
CREATE INDEX IF NOT EXISTS idx_user_ai_memory_active
    ON user_ai_memory(user_id, firm_id, dismissed, confidence DESC)
    WHERE dismissed = false;
CREATE INDEX IF NOT EXISTS idx_user_ai_memory_pinned
    ON user_ai_memory(user_id, firm_id, pinned)
    WHERE pinned = true;
CREATE INDEX IF NOT EXISTS idx_user_ai_memory_expires
    ON user_ai_memory(expires_at)
    WHERE expires_at IS NOT NULL;

-- Prevent duplicate memories per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_ai_memory_dedup
    ON user_ai_memory(user_id, firm_id, category, content_hash)
    WHERE dismissed = false;

-- Memory consolidation log - tracks when cleanups happen
CREATE TABLE IF NOT EXISTS user_ai_memory_consolidation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,

    -- What happened
    action VARCHAR(50) NOT NULL,
    entries_before INTEGER NOT NULL DEFAULT 0,
    entries_after INTEGER NOT NULL DEFAULT 0,
    entries_merged INTEGER NOT NULL DEFAULT 0,
    entries_expired INTEGER NOT NULL DEFAULT 0,
    entries_pruned INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_ai_memory_consolidation_user
    ON user_ai_memory_consolidation_log(user_id, firm_id, created_at DESC);

-- ===== FIRM-LEVEL AI MEMORY =====
-- Managed by admins. Shared across ALL users in the firm.
-- Injected into every AI interaction for every user in this firm.
-- Use cases: firm policies, preferred terminology, standard procedures, jurisdictions

CREATE TABLE IF NOT EXISTS firm_ai_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,

    -- Category for organizing firm memory entries
    -- firm_identity: firm name, practice areas, jurisdictions
    -- firm_policy: policies, procedures, standards the AI should follow
    -- firm_style: firm-wide writing style, formatting, terminology
    -- firm_context: current firm-wide priorities, active projects
    -- firm_correction: firm-wide corrections (e.g., "never use this term")
    category VARCHAR(50) NOT NULL DEFAULT 'firm_policy'
        CHECK (category IN (
            'firm_identity', 'firm_policy', 'firm_style',
            'firm_context', 'firm_correction'
        )),

    -- The actual memory content (human-readable text)
    content TEXT NOT NULL,

    -- Who created/managed this entry
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Whether this entry is active
    active BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Content hash for deduplication
    content_hash VARCHAR(64) GENERATED ALWAYS AS (encode(sha256(content::text::bytea), 'hex')) STORED
);

-- Indexes for firm memory
CREATE INDEX IF NOT EXISTS idx_firm_ai_memory_firm
    ON firm_ai_memory(firm_id) WHERE active = true;

-- Prevent duplicate firm memories
CREATE UNIQUE INDEX IF NOT EXISTS idx_firm_ai_memory_dedup
    ON firm_ai_memory(firm_id, category, content_hash)
    WHERE active = true;

-- Comments for documentation
COMMENT ON TABLE user_ai_memory IS 'Per-user AI memory file - persistent context that grows as the attorney uses the platform';
COMMENT ON TABLE firm_ai_memory IS 'Firm-level AI memory - admin-managed context shared across all users in the firm';
COMMENT ON COLUMN user_ai_memory.category IS 'Category: core_identity, working_style, active_context, learned_preference, correction, insight';
COMMENT ON COLUMN user_ai_memory.source IS 'How this memory was created: user_explicit, ai_inferred, system_observed, task_feedback, document_analysis, chat_interaction';
COMMENT ON COLUMN user_ai_memory.confidence IS 'Confidence score 0.0-1.0 - higher means more likely to be included in AI prompt';
COMMENT ON COLUMN user_ai_memory.pinned IS 'User-pinned entries are always included in the AI prompt';
COMMENT ON COLUMN user_ai_memory.dismissed IS 'User-dismissed entries are hidden and excluded from prompts';
COMMENT ON COLUMN firm_ai_memory.category IS 'Category: firm_identity, firm_policy, firm_style, firm_context, firm_correction';
