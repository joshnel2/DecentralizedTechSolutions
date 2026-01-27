-- Migration: Add matter_tasks and matter_updates tables
-- These tables store tasks and updates/notes for matters

-- Matter Tasks Table
CREATE TABLE IF NOT EXISTS matter_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE CASCADE, -- Optional: tasks can exist without a matter
    name VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    priority VARCHAR(20) DEFAULT 'medium',
    due_date DATE,
    assignee UUID REFERENCES users(id) ON DELETE SET NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_task_status CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    CONSTRAINT valid_task_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_matter_tasks_firm_id ON matter_tasks(firm_id);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_matter_id ON matter_tasks(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_assignee ON matter_tasks(assignee);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_status ON matter_tasks(status);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_due_date ON matter_tasks(due_date);

-- Matter Updates Table (for activity/notes on matters)
CREATE TABLE IF NOT EXISTS matter_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'general',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_matter_updates_firm_id ON matter_updates(firm_id);
CREATE INDEX IF NOT EXISTS idx_matter_updates_matter_id ON matter_updates(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_updates_date ON matter_updates(date);

-- Comments
COMMENT ON TABLE matter_tasks IS 'Tasks and to-do items for matters';
COMMENT ON TABLE matter_updates IS 'Activity updates and notes for matters';
COMMENT ON COLUMN matter_tasks.status IS 'Task status: pending, in_progress, completed, cancelled';
COMMENT ON COLUMN matter_tasks.priority IS 'Task priority: low, medium, high, urgent';
COMMENT ON COLUMN matter_updates.category IS 'Update category: general, court, discovery, client, billing, etc.';

SELECT 'Matter tasks and updates migration completed!' as status;
