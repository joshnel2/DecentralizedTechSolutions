-- ============================================
-- DIAGNOSTIC: Check Database Schema for Clio Migration
-- Run this on your Azure PostgreSQL
-- Works in any SQL client (Azure Data Studio, DBeaver, pgAdmin, etc.)
-- ============================================

-- QUERY 1: Check which key tables exist
SELECT '1. KEY TABLES CHECK' as section;

SELECT 
    needed.table_name,
    CASE WHEN t.table_name IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as status
FROM (
    VALUES 
        ('notes'),
        ('tasks'),
        ('activity_codes'),
        ('matter_notes'),
        ('ai_tasks'),
        ('matter_permissions'),
        ('clio_document_manifest'),
        ('integrations'),
        ('sharing_groups')
) AS needed(table_name)
LEFT JOIN information_schema.tables t 
    ON t.table_name = needed.table_name AND t.table_schema = 'public'
ORDER BY needed.table_name;

-- QUERY 2: Check which tables have clio_id column
SELECT '2. CLIO_ID COLUMNS CHECK' as section;

SELECT 
    needed.table_name,
    CASE WHEN c.column_name IS NOT NULL THEN 'HAS clio_id' ELSE 'NO clio_id' END as status
FROM (
    VALUES 
        ('users'),
        ('clients'),
        ('matters'),
        ('time_entries'),
        ('expenses'),
        ('calendar_events'),
        ('invoices'),
        ('payments')
) AS needed(table_name)
LEFT JOIN information_schema.columns c 
    ON c.table_name = needed.table_name 
    AND c.column_name = 'clio_id' 
    AND c.table_schema = 'public'
ORDER BY needed.table_name;

-- QUERY 3: Check clients table for custom_fields column
SELECT '3. CLIENTS CUSTOM_FIELDS CHECK' as section;

SELECT 
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'clients' 
AND table_schema = 'public'
AND column_name IN ('clio_id', 'custom_fields', 'notes', 'external_id')
ORDER BY column_name;

-- QUERY 4: Check matters table for visibility and clio_id
SELECT '4. MATTERS VISIBILITY/CLIO_ID CHECK' as section;

SELECT 
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'matters' 
AND table_schema = 'public'
AND column_name IN ('clio_id', 'visibility', 'custom_fields')
ORDER BY column_name;

-- QUERY 5: Check calendar_events for clio_id and recurrence
SELECT '5. CALENDAR_EVENTS CHECK' as section;

SELECT 
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'calendar_events' 
AND table_schema = 'public'
AND column_name IN ('clio_id', 'recurrence_rule', 'recurrence_end_date', 'recurrence_count', 'parent_event_id')
ORDER BY column_name;

-- QUERY 6: If NOTES table exists, show its structure
SELECT '6. NOTES TABLE STRUCTURE (if exists)' as section;

SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'notes' AND table_schema = 'public'
ORDER BY ordinal_position;

-- QUERY 7: If TASKS table exists, show its structure  
SELECT '7. TASKS TABLE STRUCTURE (if exists)' as section;

SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'tasks' AND table_schema = 'public'
ORDER BY ordinal_position;

-- QUERY 8: If ACTIVITY_CODES table exists, show its structure
SELECT '8. ACTIVITY_CODES TABLE STRUCTURE (if exists)' as section;

SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'activity_codes' AND table_schema = 'public'
ORDER BY ordinal_position;

-- QUERY 9: Record counts
SELECT '9. RECORD COUNTS' as section;

SELECT 'firms' as table_name, COUNT(*) as row_count FROM firms
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'clients', COUNT(*) FROM clients  
UNION ALL SELECT 'matters', COUNT(*) FROM matters
UNION ALL SELECT 'time_entries', COUNT(*) FROM time_entries
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
UNION ALL SELECT 'calendar_events', COUNT(*) FROM calendar_events
UNION ALL SELECT 'documents', COUNT(*) FROM documents
ORDER BY table_name;

-- QUERY 10: Unique indexes for deduplication
SELECT '10. CLIO DEDUP INDEXES' as section;

SELECT 
    tablename,
    indexname
FROM pg_indexes
WHERE schemaname = 'public'
AND (indexname LIKE '%clio%' OR indexdef LIKE '%clio_id%')
ORDER BY tablename, indexname;
