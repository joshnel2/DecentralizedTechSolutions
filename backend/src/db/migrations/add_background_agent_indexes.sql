-- Background Agent Performance Indexes
-- These indexes optimize the queries used by the Amplifier autonomous agent service

-- AI Background Tasks table indexes for task retrieval
CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_user_id ON ai_background_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_firm_id ON ai_background_tasks(firm_id);
CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_status ON ai_background_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_user_status ON ai_background_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_background_tasks_user_started ON ai_background_tasks(user_id, started_at DESC);

-- AI Learning Patterns indexes for hierarchical learning queries
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_firm_id ON ai_learning_patterns(firm_id);
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_user_id ON ai_learning_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_level ON ai_learning_patterns(level);
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_category ON ai_learning_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_confidence ON ai_learning_patterns(confidence);
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_firm_level ON ai_learning_patterns(firm_id, level, confidence);
CREATE INDEX IF NOT EXISTS idx_ai_learning_patterns_user_level ON ai_learning_patterns(user_id, level, confidence);

-- Matter Notes indexes for fast note retrieval
CREATE INDEX IF NOT EXISTS idx_matter_notes_matter_id ON matter_notes(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_notes_created_at ON matter_notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matter_notes_created_by ON matter_notes(created_by);

-- Matter Tasks indexes for task management
CREATE INDEX IF NOT EXISTS idx_matter_tasks_matter_id ON matter_tasks(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_status ON matter_tasks(status);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_due_date ON matter_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_matter_status ON matter_tasks(matter_id, status);

-- Documents indexes for document search
-- Note: documents table uses uploaded_at (NOT created_at) and size (NOT file_size)
CREATE INDEX IF NOT EXISTS idx_documents_matter_id ON documents(matter_id);
CREATE INDEX IF NOT EXISTS idx_documents_firm_id ON documents(firm_id);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_firm_uploaded ON documents(firm_id, uploaded_by, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_name_search ON documents USING gin(to_tsvector('english', original_name));

-- Calendar Events indexes for deadline tracking
CREATE INDEX IF NOT EXISTS idx_calendar_events_matter_id ON calendar_events(matter_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_firm_date ON calendar_events(firm_id, start_time);

-- Time Entries indexes for billing queries
CREATE INDEX IF NOT EXISTS idx_time_entries_matter_id ON time_entries(matter_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_firm_user ON time_entries(firm_id, user_id);

-- Notifications table index for async process tracking
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Workflow Templates index
CREATE INDEX IF NOT EXISTS idx_ai_workflow_templates_firm_active ON ai_workflow_templates(firm_id, is_active);
