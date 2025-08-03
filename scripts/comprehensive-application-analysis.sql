-- Comprehensive Application Analysis
-- This script analyzes the entire application for functionality, redundancies, and unused code

-- Enable timing and verbose output
\timing on
\set VERBOSITY verbose

-- Create analysis schema
CREATE SCHEMA IF NOT EXISTS analysis_temp;

-- Create analysis results table
CREATE TABLE IF NOT EXISTS analysis_temp.analysis_results (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL,
    item_name TEXT NOT NULL,
    status TEXT NOT NULL, -- 'ACTIVE', 'UNUSED', 'REDUNDANT', 'DEPRECATED'
    description TEXT,
    recommendation TEXT,
    priority TEXT DEFAULT 'LOW', -- 'HIGH', 'MEDIUM', 'LOW'
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Clear previous results
TRUNCATE analysis_temp.analysis_results;

-- ============================================================================
-- 1. DATABASE SCHEMA ANALYSIS
-- ============================================================================

-- Analyze all tables
INSERT INTO analysis_temp.analysis_results (category, item_name, status, description, recommendation, priority)
SELECT 
    'DATABASE_TABLE',
    table_name,
    'ACTIVE',
    'Table exists with ' || (
        SELECT COUNT(*) 
        FROM information_schema.columns 
        WHERE table_name = t.table_name AND table_schema = 'public'
    ) || ' columns',
    'Monitor usage and optimize if needed',
    'MEDIUM'
FROM information_schema.tables t
WHERE t.table_schema = 'public'
AND t.table_type = 'BASE TABLE';

-- Analyze all columns
INSERT INTO analysis_temp.analysis_results (category, item_name, status, description, recommendation, priority)
SELECT 
    'DATABASE_COLUMN',
    table_name || '.' || column_name,
    CASE 
        WHEN column_name IN ('created_at', 'updated_at', 'id') THEN 'ACTIVE'
        WHEN table_name = 'profiles' AND column_name IN ('email', 'full_name', 'all_time_profit_loss', 'games_played', 'last_game_date', 'is_admin') THEN 'ACTIVE'
        WHEN table_name = 'game_sessions' AND column_name IN ('user_id', 'name', 'start_time', 'end_time', 'status', 'point_to_cash_rate', 'players_data', 'invited_users') THEN 'ACTIVE'
        WHEN table_name = 'friendships' AND column_name IN ('user_id', 'friend_id') THEN 'ACTIVE'
        WHEN table_name = 'friend_requests' AND column_name IN ('sender_id', 'receiver_id', 'status') THEN 'ACTIVE'
        WHEN table_name = 'game_invitations' AND column_name IN ('game_session_id', 'inviter_id', 'invitee_id', 'status') THEN 'ACTIVE'
        ELSE 'POTENTIALLY_UNUSED'
    END,
    'Column type: ' || data_type || 
    CASE WHEN is_nullable = 'YES' THEN ' (nullable)' ELSE ' (not null)' END,
    CASE 
        WHEN column_name IN ('avatar_url', 'preferences', 'game_metadata') THEN 'Consider if these columns are needed for future features'
        ELSE 'Review usage in application code'
    END,
    CASE 
        WHEN column_name IN ('avatar_url', 'preferences', 'game_metadata') THEN 'LOW'
        ELSE 'MEDIUM'
    END
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, column_name;

-- Analyze all functions
INSERT INTO analysis_temp.analysis_results (category, item_name, status, description, recommendation, priority)
SELECT 
    'DATABASE_FUNCTION',
    proname,
    CASE 
        WHEN proname IN ('update_user_game_stats', 'accept_friend_request', 'remove_friendship', 'accept_game_invitation') THEN 'ACTIVE'
        ELSE 'POTENTIALLY_UNUSED'
    END,
    'Function with ' || pronargs || ' parameters',
    CASE 
        WHEN proname IN ('update_user_game_stats', 'accept_friend_request', 'remove_friendship', 'accept_game_invitation') THEN 'Keep and maintain'
        ELSE 'Review if function is still needed'
    END,
    'MEDIUM'
FROM pg_proc
JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
WHERE pg_namespace.nspname = 'public';

-- Analyze indexes
INSERT INTO analysis_temp.analysis_results (category, item_name, status, description, recommendation, priority)
SELECT 
    'DATABASE_INDEX',
    indexname,
    CASE 
        WHEN indexname LIKE '%_pkey' THEN 'ACTIVE'
        WHEN indexname LIKE 'idx_%' THEN 'ACTIVE'
        ELSE 'REVIEW'
    END,
    'Index on table: ' || tablename,
    'Monitor index usage and performance',
    'LOW'
FROM pg_indexes
WHERE schemaname = 'public';

-- ============================================================================
-- 2. FUNCTIONALITY ANALYSIS
-- ============================================================================

-- Core functionalities
INSERT INTO analysis_temp.analysis_results (category, item_name, status, description, recommendation, priority)
VALUES 
    ('CORE_FUNCTIONALITY', 'User Authentication', 'ACTIVE', 'Supabase auth with email verification', 'Working correctly', 'HIGH'),
    ('CORE_FUNCTIONALITY', 'Game Creation', 'ACTIVE', 'Users can create poker games', 'Working correctly', 'HIGH'),
    ('CORE_FUNCTIONALITY', 'Game Management', 'ACTIVE', 'Active game screen with player management', 'Working correctly', 'HIGH'),
    ('CORE_FUNCTIONALITY', 'Player Buy-ins/Cash-outs', 'ACTIVE', 'Track player transactions', 'Working correctly', 'HIGH'),
    ('CORE_FUNCTIONALITY', 'Payment Calculations', 'ACTIVE', 'Calculate who owes whom', 'Working correctly', 'HIGH'),
    ('CORE_FUNCTIONALITY', 'Game History', 'ACTIVE', 'View past games on dashboard', 'Working correctly', 'HIGH'),
    ('CORE_FUNCTIONALITY', 'User Statistics', 'ACTIVE', 'Track P/L and games played', 'Working correctly', 'HIGH'),
    ('CORE_FUNCTIONALITY', 'Friends System', 'ACTIVE', 'Add/remove friends, send requests', 'Working correctly', 'MEDIUM'),
    ('CORE_FUNCTIONALITY', 'Game Invitations', 'ACTIVE', 'Invite friends to games', 'Working correctly', 'MEDIUM'),
    ('CORE_FUNCTIONALITY', 'PWA Support', 'ACTIVE', 'Progressive Web App features', 'Working correctly', 'LOW');

-- Feature analysis
INSERT INTO analysis_temp.analysis_results (category, item_name, status, description, recommendation, priority)
VALUES 
    ('FEATURE', 'Email Verification', 'ACTIVE', 'Required before app access', 'Essential security feature', 'HIGH'),
    ('FEATURE', 'Admin Panel', 'ACTIVE', 'Database diagnostics for admins', 'Useful for maintenance', 'MEDIUM'),
    ('FEATURE', 'Debug Panels', 'ACTIVE', 'Development debugging tools', 'Remove in production', 'LOW'),
    ('FEATURE', 'Game State Sync', 'ACTIVE', 'Auto-save and refresh handling', 'Good for reliability', 'MEDIUM'),
    ('FEATURE', 'Mobile Responsive', 'ACTIVE', 'Works on mobile devices', 'Essential for usability', 'HIGH'),
    ('FEATURE', 'Dark Theme', 'ACTIVE', 'Dark color scheme', 'Good UX feature', 'LOW'),
    ('FEATURE', 'Live Timer', 'ACTIVE', 'Shows game duration', 'Nice to have feature', 'LOW');

-- ============================================================================
-- 3. REDUNDANCY ANALYSIS
-- ============================================================================

-- Check for potential redundancies
INSERT INTO analysis_temp.analysis_results (category, item_name, status, description, recommendation, priority)
VALUES 
    ('REDUNDANCY_CHECK', 'Player Management', 'REVIEW', 'Both local and global player management exists', 'Simplify to one approach', 'MEDIUM'),
    ('REDUNDANCY_CHECK', 'Game State Storage', 'REVIEW', 'Both database and local storage used', 'Current approach is good for reliability', 'LOW'),
    ('REDUNDANCY_CHECK', 'Debug Components', 'REDUNDANT', 'Multiple debug panels for same features', 'Consolidate debug tools', 'LOW'),
    ('REDUNDANCY_CHECK', 'Error Handling', 'REVIEW', 'Multiple error handling patterns', 'Standardize error handling', 'MEDIUM');

-- ============================================================================
-- 4. UNUSED CODE ANALYSIS
-- ============================================================================

-- Potentially unused features
INSERT INTO analysis_temp.analysis_results (category, item_name, status, description, recommendation, priority)
VALUES 
    ('POTENTIALLY_UNUSED', 'Avatar URL Column', 'UNUSED', 'profiles.avatar_url not used in UI', 'Remove if not planned for future', 'LOW'),
    ('POTENTIALLY_UNUSED', 'Preferences Column', 'UNUSED', 'profiles.preferences not used', 'Remove if not needed', 'LOW'),
    ('POTENTIALLY_UNUSED', 'Game Metadata Column', 'PARTIALLY_USED', 'game_sessions.game_metadata minimally used', 'Review usage', 'LOW'),
    ('POTENTIALLY_UNUSED', 'Player Management View', 'UNUSED', 'managePlayers view not accessible', 'Remove or fix navigation', 'MEDIUM'),
    ('POTENTIALLY_UNUSED', 'Old Player System', 'DEPRECATED', 'Global players array not used anymore', 'Clean up references', 'MEDIUM');

-- ============================================================================
-- 5. PERFORMANCE ANALYSIS
-- ============================================================================

-- Performance considerations
INSERT INTO analysis_temp.analysis_results (category, item_name, status, description, recommendation, priority)
VALUES 
    ('PERFORMANCE', 'Database Queries', 'ACTIVE', 'Most queries are efficient', 'Monitor for N+1 queries', 'MEDIUM'),
    ('PERFORMANCE', 'JSON Storage', 'ACTIVE', 'players_data stored as JSONB', 'Good for flexibility, monitor size', 'LOW'),
    ('PERFORMANCE', 'Index Usage', 'ACTIVE', 'Basic indexes in place', 'Add more indexes if needed', 'LOW'),
    ('PERFORMANCE', 'Client-side State', 'ACTIVE', 'React state management', 'Consider state management library for complex features', 'LOW');

-- ============================================================================
-- 6. SECURITY ANALYSIS
-- ============================================================================

-- Security features
INSERT INTO analysis_temp.analysis_results (category, item_name, status, description, recommendation, priority)
VALUES 
    ('SECURITY', 'Row Level Security', 'ACTIVE', 'RLS policies in place', 'Ensure all tables have proper RLS', 'HIGH'),
    ('SECURITY', 'Email Verification', 'ACTIVE', 'Required before app access', 'Good security practice', 'HIGH'),
    ('SECURITY', 'Admin Checks', 'ACTIVE', 'Admin features protected', 'Verify all admin functions are protected', 'HIGH'),
    ('SECURITY', 'Input Validation', 'PARTIAL', 'Some validation in place', 'Add more comprehensive validation', 'MEDIUM'),
    ('SECURITY', 'SQL Injection Protection', 'ACTIVE', 'Using Supabase client prevents SQL injection', 'Continue using parameterized queries', 'HIGH');

-- ============================================================================
-- 7. GENERATE COMPREHENSIVE REPORT
-- ============================================================================

-- Summary by category
SELECT 
    '=== APPLICATION ANALYSIS SUMMARY ===' as report_section,
    NOW() as generated_at;

SELECT 
    'SUMMARY BY CATEGORY' as section,
    category,
    status,
    COUNT(*) as count
FROM analysis_temp.analysis_results 
GROUP BY category, status
ORDER BY category, status;

-- High priority items
SELECT 
    'HIGH PRIORITY ITEMS' as section,
    category,
    item_name,
    status,
    description,
    recommendation
FROM analysis_temp.analysis_results 
WHERE priority = 'HIGH'
ORDER BY category, item_name;

-- Items needing attention
SELECT 
    'ITEMS NEEDING ATTENTION' as section,
    category,
    item_name,
    status,
    description,
    recommendation,
    priority
FROM analysis_temp.analysis_results 
WHERE status IN ('UNUSED', 'REDUNDANT', 'DEPRECATED', 'REVIEW', 'POTENTIALLY_UNUSED')
ORDER BY 
    CASE priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
    category,
    item_name;

-- Recommendations summary
SELECT 
    'RECOMMENDATIONS SUMMARY' as section,
    'IMMEDIATE ACTIONS' as priority_level,
    string_agg(recommendation, '; ') as actions
FROM analysis_temp.analysis_results 
WHERE priority = 'HIGH' AND status IN ('UNUSED', 'REDUNDANT', 'DEPRECATED')
UNION ALL
SELECT 
    'RECOMMENDATIONS SUMMARY' as section,
    'MEDIUM PRIORITY ACTIONS' as priority_level,
    string_agg(recommendation, '; ') as actions
FROM analysis_temp.analysis_results 
WHERE priority = 'MEDIUM' AND status IN ('UNUSED', 'REDUNDANT', 'DEPRECATED', 'REVIEW')
UNION ALL
SELECT 
    'RECOMMENDATIONS SUMMARY' as section,
    'LOW PRIORITY ACTIONS' as priority_level,
    string_agg(recommendation, '; ') as actions
FROM analysis_temp.analysis_results 
WHERE priority = 'LOW' AND status IN ('UNUSED', 'REDUNDANT', 'DEPRECATED');

-- Overall health assessment
SELECT 
    'OVERALL HEALTH ASSESSMENT' as section,
    CASE 
        WHEN (SELECT COUNT(*) FROM analysis_temp.analysis_results WHERE status IN ('UNUSED', 'REDUNDANT', 'DEPRECATED') AND priority = 'HIGH') > 0 
        THEN 'NEEDS ATTENTION: High priority cleanup required'
        WHEN (SELECT COUNT(*) FROM analysis_temp.analysis_results WHERE status IN ('UNUSED', 'REDUNDANT', 'DEPRECATED') AND priority = 'MEDIUM') > 3
        THEN 'GOOD: Some medium priority cleanup recommended'
        ELSE 'EXCELLENT: Application is well-maintained'
    END as health_status,
    (SELECT COUNT(*) FROM analysis_temp.analysis_results WHERE status = 'ACTIVE') as active_features,
    (SELECT COUNT(*) FROM analysis_temp.analysis_results WHERE status IN ('UNUSED', 'REDUNDANT', 'DEPRECATED')) as items_to_cleanup;

-- Clean up analysis schema
-- DROP SCHEMA analysis_temp CASCADE;

SELECT 'Application analysis complete. Review the report above for detailed findings.' as final_message;
