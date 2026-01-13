-- ============================================
-- DIAGNOSTIC: Check Database Schema for Clio Migration
-- Run this on your Azure PostgreSQL to see what exists
-- ============================================

-- Use a nice format
\echo ''
\echo '=========================================='
\echo '  APEX LEGAL DATABASE DIAGNOSTIC REPORT'
\echo '=========================================='
\echo ''

-- ============================================
-- 1. LIST ALL TABLES
-- ============================================
\echo '📋 ALL TABLES IN DATABASE:'
\echo '--------------------------'

SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- ============================================
-- 2. CHECK FOR MIGRATION-RELATED TABLES
-- ============================================
\echo ''
\echo '🔍 CHECKING FOR SPECIFIC TABLES:'
\echo '---------------------------------'

SELECT 
    table_name,
    CASE WHEN table_name IS NOT NULL THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
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

-- ============================================
-- 3. CHECK FOR CLIO_ID COLUMNS
-- ============================================
\echo ''
\echo '🔗 CLIO_ID COLUMNS (for deduplication):'
\echo '----------------------------------------'

SELECT 
    needed.table_name,
    CASE WHEN c.column_name IS NOT NULL THEN '✅ HAS clio_id' ELSE '❌ NO clio_id' END as status
FROM (
    VALUES 
        ('users'),
        ('clients'),
        ('matters'),
        ('time_entries'),
        ('expenses'),
        ('calendar_events'),
        ('invoices'),
        ('payments'),
        ('trust_accounts'),
        ('trust_transactions'),
        ('documents')
) AS needed(table_name)
LEFT JOIN information_schema.columns c 
    ON c.table_name = needed.table_name 
    AND c.column_name = 'clio_id' 
    AND c.table_schema = 'public'
ORDER BY needed.table_name;

-- ============================================
-- 4. CHECK CLIENTS TABLE COLUMNS
-- ============================================
\echo ''
\echo '👥 CLIENTS TABLE COLUMNS:'
\echo '-------------------------'

SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'clients' AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================
-- 5. CHECK MATTERS TABLE COLUMNS
-- ============================================
\echo ''
\echo '📁 MATTERS TABLE COLUMNS:'
\echo '-------------------------'

SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'matters' AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================
-- 6. CHECK CALENDAR_EVENTS TABLE COLUMNS
-- ============================================
\echo ''
\echo '📅 CALENDAR_EVENTS TABLE COLUMNS:'
\echo '----------------------------------'

SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'calendar_events' AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================
-- 7. CHECK IF NOTES TABLE EXISTS AND STRUCTURE
-- ============================================
\echo ''
\echo '📝 NOTES TABLE (if exists):'
\echo '----------------------------'

SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'notes' AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================
-- 8. CHECK IF TASKS TABLE EXISTS AND STRUCTURE
-- ============================================
\echo ''
\echo '✅ TASKS TABLE (if exists):'
\echo '----------------------------'

SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'tasks' AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================
-- 9. CHECK IF MATTER_NOTES TABLE EXISTS
-- ============================================
\echo ''
\echo '📝 MATTER_NOTES TABLE (if exists):'
\echo '------------------------------------'

SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'matter_notes' AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================
-- 10. CHECK USERS TABLE FOR CLIO COLUMNS
-- ============================================
\echo ''
\echo '👤 USERS TABLE COLUMNS:'
\echo '-----------------------'

SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'users' AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================
-- 11. CHECK FOR UNIQUE INDEXES (dedup support)
-- ============================================
\echo ''
\echo '🔐 UNIQUE INDEXES FOR CLIO DEDUPLICATION:'
\echo '------------------------------------------'

SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND (indexname LIKE '%clio%' OR indexdef LIKE '%clio_id%')
ORDER BY tablename, indexname;

-- ============================================
-- 12. COUNT RECORDS IN KEY TABLES
-- ============================================
\echo ''
\echo '📊 RECORD COUNTS IN KEY TABLES:'
\echo '--------------------------------'

SELECT 'firms' as table_name, COUNT(*) as row_count FROM firms
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'clients', COUNT(*) FROM clients  
UNION ALL SELECT 'matters', COUNT(*) FROM matters
UNION ALL SELECT 'time_entries', COUNT(*) FROM time_entries
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
UNION ALL SELECT 'calendar_events', COUNT(*) FROM calendar_events
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'documents', COUNT(*) FROM documents
ORDER BY table_name;

-- ============================================
-- 13. CHECK FOR ACTIVITY_CODES TABLE
-- ============================================
\echo ''
\echo '💼 ACTIVITY_CODES TABLE (if exists):'
\echo '-------------------------------------'

SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'activity_codes' AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================
-- SUMMARY
-- ============================================
\echo ''
\echo '=========================================='
\echo '  DIAGNOSTIC COMPLETE'
\echo '=========================================='
\echo ''
\echo 'Copy the output above and share it so we can'
\echo 'see exactly what exists in your database.'
\echo ''
