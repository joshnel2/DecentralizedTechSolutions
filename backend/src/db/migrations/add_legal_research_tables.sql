-- ============================================================
-- Legal Research Tables
-- COMPLETELY ISOLATED from the main AI/Agent system.
-- These tables only store legal research sessions and messages.
-- The only FK to the main system is user_id for authentication.
-- ============================================================

-- Research sessions
CREATE TABLE IF NOT EXISTS legal_research_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New Research',
    jurisdiction TEXT,
    practice_area TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Research messages (conversation history)
CREATE TABLE IF NOT EXISTS legal_research_messages (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES legal_research_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_legal_research_sessions_user ON legal_research_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_research_messages_session ON legal_research_messages(session_id, created_at ASC);
