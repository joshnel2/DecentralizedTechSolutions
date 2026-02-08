-- Legal Research Sessions Table
-- Stores AI-powered legal research sessions conducted by the background agent
-- Each session represents a structured research workflow with findings, citations, and memos

CREATE TABLE IF NOT EXISTS legal_research_sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  research_type TEXT NOT NULL DEFAULT 'case_law',
  jurisdiction TEXT NOT NULL DEFAULT 'federal',
  practice_area TEXT NOT NULL DEFAULT 'litigation',
  query_text TEXT NOT NULL,
  matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'initialized',
  findings JSONB DEFAULT '[]'::jsonb,
  citations JSONB DEFAULT '[]'::jsonb,
  authorities JSONB DEFAULT '{"primary":[],"secondary":[]}'::jsonb,
  memo JSONB,
  analysis JSONB,
  quality_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_legal_research_user ON legal_research_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_legal_research_firm ON legal_research_sessions(firm_id);
CREATE INDEX IF NOT EXISTS idx_legal_research_matter ON legal_research_sessions(matter_id);
CREATE INDEX IF NOT EXISTS idx_legal_research_status ON legal_research_sessions(status);
CREATE INDEX IF NOT EXISTS idx_legal_research_type ON legal_research_sessions(research_type);
CREATE INDEX IF NOT EXISTS idx_legal_research_jurisdiction ON legal_research_sessions(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_legal_research_created ON legal_research_sessions(created_at DESC);

-- Legal Research Saved Results Table
-- Stores individual research results that attorneys have bookmarked or saved
CREATE TABLE IF NOT EXISTS legal_research_saved (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES legal_research_sessions(id) ON DELETE SET NULL,
  matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  research_type TEXT NOT NULL DEFAULT 'case_law',
  jurisdiction TEXT,
  citations JSONB DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT '{}',
  is_pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legal_research_saved_user ON legal_research_saved(user_id);
CREATE INDEX IF NOT EXISTS idx_legal_research_saved_matter ON legal_research_saved(matter_id);
CREATE INDEX IF NOT EXISTS idx_legal_research_saved_tags ON legal_research_saved USING GIN(tags);

-- Legal Research Templates Table
-- Pre-built research query templates for common legal research tasks
CREATE TABLE IF NOT EXISTS legal_research_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  research_type TEXT NOT NULL DEFAULT 'case_law',
  jurisdiction TEXT DEFAULT 'federal',
  practice_area TEXT DEFAULT 'litigation',
  query_template TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  is_system BOOLEAN DEFAULT FALSE,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legal_research_templates_firm ON legal_research_templates(firm_id);
CREATE INDEX IF NOT EXISTS idx_legal_research_templates_type ON legal_research_templates(research_type);
