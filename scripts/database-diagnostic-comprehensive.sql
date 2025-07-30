-- Comprehensive Database Diagnostic Analysis
-- This script performs a thorough examination of database integrity, performance, and consistency

-- Enable timing and verbose output
\timing on
\set VERBOSITY verbose

-- Create a temporary schema for diagnostic functions and tables
CREATE SCHEMA IF NOT EXISTS diagnostic_temp;

-- Function to log diagnostic results
CREATE OR REPLACE FUNCTION diagnostic_temp.log_diagnostic(
    test_name TEXT,
    status TEXT,
    details TEXT DEFAULT NULL,
    severity TEXT DEFAULT 'INFO'
) RETURNS VOID AS $$
BEGIN
    INSERT INTO diagnostic_temp.diagnostic_log (test_name, status, details, severity, timestamp)
    VALUES (test_name, status, details, severity, NOW());
END;
$$ LANGUAGE plpgsql;

-- Create diagnostic log table
CREATE TABLE IF NOT EXISTS diagnostic_temp.diagnostic_log (
    id SERIAL PRIMARY KEY,
    test_name TEXT NOT NULL,
    status TEXT NOT NULL,
    details TEXT,
    severity TEXT DEFAULT 'INFO',
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Create performance metrics table
CREATE TABLE IF NOT EXISTS diagnostic_temp.performance_metrics (
    id SERIAL PRIMARY KEY,
    test_name TEXT NOT NULL,
    execution_time_ms NUMERIC,
    rows_affected INTEGER,
    memory_usage_kb NUMERIC,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Clear previous diagnostic results
TRUNCATE diagnostic_temp.diagnostic_log;
TRUNCATE diagnostic_temp.performance_metrics;

-- ============================================================================
-- 1. DATA INTEGRITY CHECKS
-- ============================================================================

DO $$
DECLARE
    rec RECORD;
    error_count INTEGER := 0;
    total_profiles INTEGER;
    total_sessions INTEGER;
    total_friendships INTEGER;
    total_requests INTEGER;
    total_invitations INTEGER;
BEGIN
    PERFORM diagnostic_temp.log_diagnostic('DATA_INTEGRITY_START', 'RUNNING', 'Starting comprehensive data integrity checks');
    
    -- Check profiles table integrity
    SELECT COUNT(*) INTO total_profiles FROM public.profiles;
    PERFORM diagnostic_temp.log_diagnostic('PROFILES_COUNT', 'INFO', 'Total profiles: ' || total_profiles);
    
    -- Check for profiles with invalid email formats
    SELECT COUNT(*) INTO error_count 
    FROM public.profiles 
    WHERE email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';
    
    IF error_count > 0 THEN
        PERFORM diagnostic_temp.log_diagnostic('PROFILES_EMAIL_VALIDATION', 'ERROR', 
            'Found ' || error_count || ' profiles with invalid email formats', 'ERROR');
    ELSE
        PERFORM diagnostic_temp.log_diagnostic('PROFILES_EMAIL_VALIDATION', 'PASS', 'All email formats are valid');
    END IF;
    
    -- Check for duplicate emails
    SELECT COUNT(*) INTO error_count 
    FROM (SELECT email, COUNT(*) FROM public.profiles GROUP BY email HAVING COUNT(*) > 1) duplicates;
    
    IF error_count > 0 THEN
        PERFORM diagnostic_temp.log_diagnostic('PROFILES_DUPLICATE_EMAILS', 'ERROR', 
            'Found ' || error_count || ' duplicate email addresses', 'ERROR');
    ELSE
        PERFORM diagnostic_temp.log_diagnostic('PROFILES_DUPLICATE_EMAILS', 'PASS', 'No duplicate emails found');
    END IF;
    
    -- Check game sessions integrity
    SELECT COUNT(*) INTO total_sessions FROM public.game_sessions;
    PERFORM diagnostic_temp.log_diagnostic('GAME_SESSIONS_COUNT', 'INFO', 'Total game sessions: ' || total_sessions);
    
    -- Check for orphaned game sessions (user_id not in profiles)
    SELECT COUNT(*) INTO error_count 
    FROM public.game_sessions gs 
    LEFT JOIN public.profiles p ON gs.user_id = p.id 
    WHERE p.id IS NULL;
    
    IF error_count > 0 THEN
        PERFORM diagnostic_temp.log_diagnostic('GAME_SESSIONS_ORPHANED', 'ERROR', 
            'Found ' || error_count || ' orphaned game sessions', 'ERROR');
    ELSE
        PERFORM diagnostic_temp.log_diagnostic('GAME_SESSIONS_ORPHANED', 'PASS', 'No orphaned game sessions');
    END IF;
    
    -- Check for invalid game session statuses
    SELECT COUNT(*) INTO error_count 
    FROM public.game_sessions 
    WHERE status NOT IN ('active', 'completed', 'pending_close');
    
    IF error_count > 0 THEN
        PERFORM diagnostic_temp.log_diagnostic('GAME_SESSIONS_INVALID_STATUS', 'ERROR', 
            'Found ' || error_count || ' game sessions with invalid status', 'ERROR');
    ELSE
        PERFORM diagnostic_temp.log_diagnostic('GAME_SESSIONS_INVALID_STATUS', 'PASS', 'All game session statuses are valid');
    END IF;
    
    -- Check friendships integrity
    SELECT COUNT(*) INTO total_friendships FROM public.friendships;
    PERFORM diagnostic_temp.log_diagnostic('FRIENDSHIPS_COUNT', 'INFO', 'Total friendships: ' || total_friendships);
    
    -- Check for self-friendships
    SELECT COUNT(*) INTO error_count 
    FROM public.friendships 
    WHERE user_id = friend_id;
    
    IF error_count > 0 THEN
        PERFORM diagnostic_temp.log_diagnostic('FRIENDSHIPS_SELF_REFERENCE', 'ERROR', 
            'Found ' || error_count || ' self-friendship records', 'ERROR');
    ELSE
        PERFORM diagnostic_temp.log_diagnostic('FRIENDSHIPS_SELF_REFERENCE', 'PASS', 'No self-friendships found');
    END IF;
    
    -- Check for orphaned friendships
    SELECT COUNT(*) INTO error_count 
    FROM public.friendships f 
    LEFT JOIN public.profiles p1 ON f.user_id = p1.id 
    LEFT JOIN public.profiles p2 ON f.friend_id = p2.id 
    WHERE p1.id IS NULL OR p2.id IS NULL;
    
    IF error_count > 0 THEN
        PERFORM diagnostic_temp.log_diagnostic('FRIENDSHIPS_ORPHANED', 'ERROR', 
            'Found ' || error_count || ' orphaned friendship records', 'ERROR');
    ELSE
        PERFORM diagnostic_temp.log_diagnostic('FRIENDSHIPS_ORPHANED', 'PASS', 'No orphaned friendships');
    END IF;
    
    -- Check friend requests integrity
    SELECT COUNT(*) INTO total_requests FROM public.friend_requests;
    PERFORM diagnostic_temp.log_diagnostic('FRIEND_REQUESTS_COUNT', 'INFO', 'Total friend requests: ' || total_requests);
    
    -- Check for invalid friend request statuses
    SELECT COUNT(*) INTO error_count 
    FROM public.friend_requests 
    WHERE status NOT IN ('pending', 'accepted', 'declined');
    
    IF error_count > 0 THEN
        PERFORM diagnostic_temp.log_diagnostic('FRIEND_REQUESTS_INVALID_STATUS', 'ERROR', 
            'Found ' || error_count || ' friend requests with invalid status', 'ERROR');
    ELSE
        PERFORM diagnostic_temp.log_diagnostic('FRIEND_REQUESTS_INVALID_STATUS', 'PASS', 'All friend request statuses are valid');
    END IF;
    
    -- Check game invitations integrity
    SELECT COUNT(*) INTO total_invitations FROM public.game_invitations;
    PERFORM diagnostic_temp.log_diagnostic('GAME_INVITATIONS_COUNT', 'INFO', 'Total game invitations: ' || total_invitations);
    
    -- Check for orphaned game invitations
    SELECT COUNT(*) INTO error_count 
    FROM public.game_invitations gi 
    LEFT JOIN public.game_sessions gs ON gi.game_session_id = gs.id 
    WHERE gs.id IS NULL;
    
    IF error_count > 0 THEN
        PERFORM diagnostic_temp.log_diagnostic('GAME_INVITATIONS_ORPHANED', 'ERROR', 
            'Found ' || error_count || ' orphaned game invitations', 'ERROR');
    ELSE
        PERFORM diagnostic_temp.log_diagnostic('GAME_INVITATIONS_ORPHANED', 'PASS', 'No orphaned game invitations');
    END IF;
    
    PERFORM diagnostic_temp.log_diagnostic('DATA_INTEGRITY_COMPLETE', 'COMPLETE', 'Data integrity checks completed');
END $$;

-- ============================================================================
-- 2. INDEX VALIDATION AND PERFORMANCE
-- ============================================================================

DO $$
DECLARE
    idx_rec RECORD;
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    execution_time NUMERIC;
BEGIN
    PERFORM diagnostic_temp.log_diagnostic('INDEX_VALIDATION_START', 'RUNNING', 'Starting index validation and performance tests');
    
    -- Check if all expected indexes exist
    FOR idx_rec IN 
        SELECT 
            schemaname,
            tablename,
            indexname,
            indexdef
        FROM pg_indexes 
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname
    LOOP
        PERFORM diagnostic_temp.log_diagnostic('INDEX_EXISTS', 'INFO', 
            'Index found: ' || idx_rec.tablename || '.' || idx_rec.indexname);
    END LOOP;
    
    -- Test index performance on profiles table
    start_time := clock_timestamp();
    PERFORM COUNT(*) FROM public.profiles WHERE email LIKE '%@example.com';
    end_time := clock_timestamp();
    execution_time := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    INSERT INTO diagnostic_temp.performance_metrics (test_name, execution_time_ms, timestamp)
    VALUES ('PROFILES_EMAIL_SEARCH', execution_time, NOW());
    
    IF execution_time > 1000 THEN
        PERFORM diagnostic_temp.log_diagnostic('PROFILES_EMAIL_SEARCH_PERFORMANCE', 'WARNING', 
            'Email search took ' || execution_time || 'ms (>1000ms)', 'WARNING');
    ELSE
        PERFORM diagnostic_temp.log_diagnostic('PROFILES_EMAIL_SEARCH_PERFORMANCE', 'PASS', 
            'Email search completed in ' || execution_time || 'ms');
    END IF;
    
    -- Test index performance on game_sessions table
    start_time := clock_timestamp();
    PERFORM COUNT(*) FROM public.game_sessions WHERE status = 'active';
    end_time := clock_timestamp();
    execution_time := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    INSERT INTO diagnostic_temp.performance_metrics (test_name, execution_time_ms, timestamp)
    VALUES ('GAME_SESSIONS_STATUS_SEARCH', execution_time, NOW());
    
    IF execution_time > 1000 THEN
        PERFORM diagnostic_temp.log_diagnostic('GAME_SESSIONS_STATUS_SEARCH_PERFORMANCE', 'WARNING', 
            'Status search took ' || execution_time || 'ms (>1000ms)', 'WARNING');
    ELSE
        PERFORM diagnostic_temp.log_diagnostic('GAME_SESSIONS_STATUS_SEARCH_PERFORMANCE', 'PASS', 
            'Status search completed in ' || execution_time || 'ms');
    END IF;
    
    PERFORM diagnostic_temp.log_diagnostic('INDEX_VALIDATION_COMPLETE', 'COMPLETE', 'Index validation completed');
END $$;

-- ============================================================================
-- 3. RELATIONSHIP VALIDATION
-- ============================================================================

DO $$
DECLARE
    error_count INTEGER;
BEGIN
    PERFORM diagnostic_temp.log_diagnostic('RELATIONSHIP_VALIDATION_START', 'RUNNING', 'Starting relationship validation');
    
    -- Check foreign key constraints
    -- Profiles -> Auth users (this is handled by Supabase)
    
    -- Game sessions -> Profiles
    SELECT COUNT(*) INTO error_count 
    FROM public.game_sessions gs 
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = gs.user_id);
    
    IF error_count > 0 THEN
        PERFORM diagnostic_temp.log_diagnostic('FK_GAME_SESSIONS_PROFILES', 'ERROR', 
            'Found ' || error_count || ' game sessions with invalid user_id references', 'ERROR');
    ELSE
        PERFORM diagnostic_temp.log_diagnostic('FK_GAME_SESSIONS_PROFILES', 'PASS', 
            'All game sessions have valid user_id references');
    END IF;
    
    -- Friendships -> Profiles
    SELECT COUNT(*) INTO error_count 
    FROM public.friendships f 
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = f.user_id)
       OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = f.friend_id);
    
    IF error_count > 0 THEN
        PERFORM diagnostic_temp.log_diagnostic('FK_FRIENDSHIPS_PROFILES', 'ERROR', 
            'Found ' || error_count || ' friendships with invalid profile references', 'ERROR');
    ELSE
        PERFORM diagnostic_temp.log_diagnostic('FK_FRIENDSHIPS_PROFILES', 'PASS', 
            'All friendships have valid profile references');
    END IF;
    
    -- Friend requests -> Profiles
    SELECT COUNT(*) INTO error_count 
    FROM public.friend_requests fr 
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = fr.sender_id)
       OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = fr.receiver_id);
    
    IF error_count > 0 THEN
        PERFORM diagnostic_temp.log_diagnostic('FK_FRIEND_REQUESTS_PROFILES', 'ERROR', 
            'Found ' || error_count || ' friend requests with invalid profile references', 'ERROR');
    ELSE
        PERFORM diagnostic_temp.log_diagnostic('FK_FRIEND_REQUESTS_PROFILES', 'PASS', 
            'All friend requests have valid profile references');
    END IF;
    
    -- Game invitations -> Game sessions and Profiles
    SELECT COUNT(*) INTO error_count 
    FROM public.game_invitations gi 
    WHERE NOT EXISTS (SELECT 1 FROM public.game_sessions gs WHERE gs.id = gi.game_session_id)
       OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = gi.inviter_id)
       OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = gi.invitee_id);
    
    IF error_count > 0 THEN
        PERFORM diagnostic_temp.log_diagnostic('FK_GAME_INVITATIONS_REFERENCES', 'ERROR', 
            'Found ' || error_count || ' game invitations with invalid references', 'ERROR');
    ELSE
        PERFORM diagnostic_temp.log_diagnostic('FK_GAME_INVITATIONS_REFERENCES', 'PASS', 
            'All game invitations have valid references');
    END IF;
    
    PERFORM diagnostic_temp.log_diagnostic('RELATIONSHIP_VALIDATION_COMPLETE', 'COMPLETE', 'Relationship validation completed');
END $$;

-- ============================================================================
-- 4. PERFORMANCE TESTING UNDER LOAD
-- ============================================================================

DO $$
DECLARE
    i INTEGER;
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    execution_time NUMERIC;
    total_time NUMERIC := 0;
    avg_time NUMERIC;
BEGIN
    PERFORM diagnostic_temp.log_diagnostic('PERFORMANCE_TESTING_START', 'RUNNING', 'Starting performance testing under simulated load');
    
    -- Simulate concurrent read operations
    FOR i IN 1..10 LOOP
        start_time := clock_timestamp();
        
        -- Complex query simulating dashboard load
        PERFORM 
            gs.id,
            gs.name,
            gs.status,
            gs.start_time,
            COUNT(DISTINCT CASE WHEN gi.status = 'accepted' THEN gi.invitee_id END) as accepted_invites,
            p.full_name as owner_name
        FROM public.game_sessions gs
        LEFT JOIN public.profiles p ON gs.user_id = p.id
        LEFT JOIN public.game_invitations gi ON gs.id = gi.game_session_id
        WHERE gs.status IN ('active', 'pending_close')
        GROUP BY gs.id, gs.name, gs.status, gs.start_time, p.full_name
        ORDER BY gs.start_time DESC;
        
        end_time := clock_timestamp();
        execution_time := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
        total_time := total_time + execution_time;
        
        INSERT INTO diagnostic_temp.performance_metrics (test_name, execution_time_ms, timestamp)
        VALUES ('DASHBOARD_QUERY_ITERATION_' || i, execution_time, NOW());
    END LOOP;
    
    avg_time := total_time / 10;
    
    IF avg_time > 500 THEN
        PERFORM diagnostic_temp.log_diagnostic('DASHBOARD_QUERY_PERFORMANCE', 'WARNING', 
            'Average dashboard query time: ' || avg_time || 'ms (>500ms)', 'WARNING');
    ELSE
        PERFORM diagnostic_temp.log_diagnostic('DASHBOARD_QUERY_PERFORMANCE', 'PASS', 
            'Average dashboard query time: ' || avg_time || 'ms');
    END IF;
    
    -- Test friends system performance
    total_time := 0;
    FOR i IN 1..5 LOOP
        start_time := clock_timestamp();
        
        -- Complex friends query
        PERFORM 
            f.id,
            f.user_id,
            f.friend_id,
            p1.full_name as user_name,
            p2.full_name as friend_name,
            p2.all_time_profit_loss,
            p2.games_played
        FROM public.friendships f
        JOIN public.profiles p1 ON f.user_id = p1.id
        JOIN public.profiles p2 ON f.friend_id = p2.id
        ORDER BY p2.full_name;
        
        end_time := clock_timestamp();
        execution_time := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
        total_time := total_time + execution_time;
        
        INSERT INTO diagnostic_temp.performance_metrics (test_name, execution_time_ms, timestamp)
        VALUES ('FRIENDS_QUERY_ITERATION_' || i, execution_time, NOW());
    END LOOP;
    
    avg_time := total_time / 5;
    
    IF avg_time > 300 THEN
        PERFORM diagnostic_temp.log_diagnostic('FRIENDS_QUERY_PERFORMANCE', 'WARNING', 
            'Average friends query time: ' || avg_time || 'ms (>300ms)', 'WARNING');
    ELSE
        PERFORM diagnostic_temp.log_diagnostic('FRIENDS_QUERY_PERFORMANCE', 'PASS', 
            'Average friends query time: ' || avg_time || 'ms');
    END IF;
    
    PERFORM diagnostic_temp.log_diagnostic('PERFORMANCE_TESTING_COMPLETE', 'COMPLETE', 'Performance testing completed');
END $$;

-- ============================================================================
-- 5. CONCURRENT ACCESS TESTING
-- ============================================================================

DO $$
DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    execution_time NUMERIC;
BEGIN
    PERFORM diagnostic_temp.log_diagnostic('CONCURRENT_ACCESS_START', 'RUNNING', 'Starting concurrent access testing');
    
    -- Test concurrent read/write operations
    start_time := clock_timestamp();
    
    -- Simulate multiple operations that might happen concurrently
    BEGIN
        -- Update user stats
        UPDATE public.profiles 
        SET all_time_profit_loss = all_time_profit_loss + 10,
            games_played = games_played + 1
        WHERE id IN (SELECT id FROM public.profiles LIMIT 1);
        
        -- Insert friend request
        INSERT INTO public.friend_requests (sender_id, receiver_id, status)
        SELECT 
            p1.id, 
            p2.id, 
            'pending'
        FROM public.profiles p1, public.profiles p2 
        WHERE p1.id != p2.id 
        AND NOT EXISTS (
            SELECT 1 FROM public.friend_requests fr 
            WHERE fr.sender_id = p1.id AND fr.receiver_id = p2.id
        )
        LIMIT 1;
        
        -- Query game sessions
        PERFORM COUNT(*) FROM public.game_sessions WHERE status = 'active';
        
        -- Rollback test changes
        ROLLBACK;
        
    EXCEPTION WHEN OTHERS THEN
        PERFORM diagnostic_temp.log_diagnostic('CONCURRENT_ACCESS_ERROR', 'ERROR', 
            'Error during concurrent access test: ' || SQLERRM, 'ERROR');
        ROLLBACK;
    END;
    
    end_time := clock_timestamp();
    execution_time := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    INSERT INTO diagnostic_temp.performance_metrics (test_name, execution_time_ms, timestamp)
    VALUES ('CONCURRENT_ACCESS_TEST', execution_time, NOW());
    
    PERFORM diagnostic_temp.log_diagnostic('CONCURRENT_ACCESS_COMPLETE', 'PASS', 
        'Concurrent access test completed in ' || execution_time || 'ms');
END $$;

-- ============================================================================
-- 6. GENERATE COMPREHENSIVE REPORT
-- ============================================================================

-- Summary report
SELECT 
    '=== DATABASE DIAGNOSTIC REPORT ===' as report_section,
    NOW() as generated_at;

-- Overall status summary
SELECT 
    'OVERALL STATUS SUMMARY' as section,
    severity,
    COUNT(*) as count
FROM diagnostic_temp.diagnostic_log 
GROUP BY severity
ORDER BY 
    CASE severity 
        WHEN 'ERROR' THEN 1 
        WHEN 'WARNING' THEN 2 
        WHEN 'INFO' THEN 3 
        WHEN 'PASS' THEN 4 
        ELSE 5 
    END;

-- Detailed findings
SELECT 
    'DETAILED FINDINGS' as section,
    test_name,
    status,
    severity,
    details,
    timestamp
FROM diagnostic_temp.diagnostic_log 
ORDER BY 
    CASE severity 
        WHEN 'ERROR' THEN 1 
        WHEN 'WARNING' THEN 2 
        WHEN 'INFO' THEN 3 
        ELSE 4 
    END,
    timestamp;

-- Performance metrics summary
SELECT 
    'PERFORMANCE METRICS SUMMARY' as section,
    test_name,
    ROUND(AVG(execution_time_ms), 2) as avg_execution_time_ms,
    ROUND(MIN(execution_time_ms), 2) as min_execution_time_ms,
    ROUND(MAX(execution_time_ms), 2) as max_execution_time_ms,
    COUNT(*) as test_runs
FROM diagnostic_temp.performance_metrics 
GROUP BY test_name
ORDER BY avg_execution_time_ms DESC;

-- Database size and statistics
SELECT 
    'DATABASE STATISTICS' as section,
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_stat_get_tuples_returned(c.oid) as tuples_returned,
    pg_stat_get_tuples_fetched(c.oid) as tuples_fetched
FROM pg_tables pt
JOIN pg_class c ON c.relname = pt.tablename
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Index usage statistics
SELECT 
    'INDEX USAGE STATISTICS' as section,
    schemaname,
    tablename,
    indexname,
    idx_scan as times_used,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Recommendations
SELECT 
    'RECOMMENDATIONS' as section,
    CASE 
        WHEN EXISTS (SELECT 1 FROM diagnostic_temp.diagnostic_log WHERE severity = 'ERROR') 
        THEN 'CRITICAL: Address all ERROR level issues immediately'
        WHEN EXISTS (SELECT 1 FROM diagnostic_temp.diagnostic_log WHERE severity = 'WARNING') 
        THEN 'MODERATE: Review WARNING level issues for optimization'
        ELSE 'GOOD: Database appears to be in good health'
    END as priority_recommendation,
    'Review detailed findings above for specific action items' as next_steps;

-- Clean up diagnostic schema
-- DROP SCHEMA diagnostic_temp CASCADE;

SELECT 'Diagnostic analysis complete. Review the report above for findings and recommendations.' as final_message;
