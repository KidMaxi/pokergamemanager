-- Database Performance Benchmark Script
-- This script runs comprehensive performance tests and generates benchmarks

-- Create benchmark schema
CREATE SCHEMA IF NOT EXISTS benchmark;

-- Create benchmark results table
CREATE TABLE IF NOT EXISTS benchmark.test_results (
    id SERIAL PRIMARY KEY,
    test_name TEXT NOT NULL,
    test_category TEXT NOT NULL,
    execution_time_ms NUMERIC NOT NULL,
    rows_processed INTEGER,
    operations_per_second NUMERIC,
    memory_usage_estimate_kb NUMERIC,
    cpu_usage_estimate NUMERIC,
    test_parameters JSONB,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Function to run benchmark test
CREATE OR REPLACE FUNCTION benchmark.run_test(
    p_test_name TEXT,
    p_test_category TEXT,
    p_test_sql TEXT,
    p_iterations INTEGER DEFAULT 1,
    p_parameters JSONB DEFAULT '{}'::jsonb
) RETURNS TABLE (
    test_name TEXT,
    avg_execution_time_ms NUMERIC,
    min_execution_time_ms NUMERIC,
    max_execution_time_ms NUMERIC,
    total_rows_processed BIGINT,
    avg_ops_per_second NUMERIC
) AS $$
DECLARE
    i INTEGER;
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    execution_time NUMERIC;
    total_time NUMERIC := 0;
    min_time NUMERIC := 999999;
    max_time NUMERIC := 0;
    total_rows BIGINT := 0;
    current_rows INTEGER;
BEGIN
    FOR i IN 1..p_iterations LOOP
        start_time := clock_timestamp();
        
        -- Execute the test SQL
        EXECUTE p_test_sql;
        GET DIAGNOSTICS current_rows = ROW_COUNT;
        
        end_time := clock_timestamp();
        execution_time := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
        
        total_time := total_time + execution_time;
        total_rows := total_rows + current_rows;
        
        IF execution_time < min_time THEN
            min_time := execution_time;
        END IF;
        
        IF execution_time > max_time THEN
            max_time := execution_time;
        END IF;
        
        -- Record individual result
        INSERT INTO benchmark.test_results (
            test_name, test_category, execution_time_ms, rows_processed,
            operations_per_second, test_parameters
        ) VALUES (
            p_test_name, p_test_category, execution_time, current_rows,
            CASE WHEN execution_time > 0 THEN (current_rows * 1000.0 / execution_time) ELSE 0 END,
            p_parameters
        );
    END LOOP;
    
    RETURN QUERY SELECT 
        p_test_name,
        ROUND(total_time / p_iterations, 2),
        ROUND(min_time, 2),
        ROUND(max_time, 2),
        total_rows,
        ROUND((total_rows * 1000.0) / total_time, 2);
END;
$$ LANGUAGE plpgsql;

-- Clear previous benchmark results
TRUNCATE benchmark.test_results;

-- ============================================================================
-- RUN COMPREHENSIVE BENCHMARKS
-- ============================================================================

-- 1. Basic CRUD Operations Benchmark
SELECT 'Starting CRUD Operations Benchmark...' as status;

-- Profile queries
SELECT * FROM benchmark.run_test(
    'profile_select_by_email',
    'CRUD',
    'SELECT * FROM public.profiles WHERE email LIKE ''%@%'' LIMIT 100',
    10
);

SELECT * FROM benchmark.run_test(
    'profile_select_by_id',
    'CRUD',
    'SELECT * FROM public.profiles WHERE id = (SELECT id FROM public.profiles LIMIT 1)',
    20
);

-- Game session queries
SELECT * FROM benchmark.run_test(
    'game_sessions_active',
    'CRUD',
    'SELECT * FROM public.game_sessions WHERE status = ''active''',
    15
);

SELECT * FROM benchmark.run_test(
    'game_sessions_by_user',
    'CRUD',
    'SELECT * FROM public.game_sessions WHERE user_id = (SELECT id FROM public.profiles LIMIT 1)',
    15
);

-- 2. Complex Join Operations Benchmark
SELECT 'Starting Complex Join Operations Benchmark...' as status;

SELECT * FROM benchmark.run_test(
    'dashboard_complex_query',
    'JOINS',
    'SELECT gs.id, gs.name, gs.status, p.full_name, COUNT(gi.id) as invitations
     FROM public.game_sessions gs
     LEFT JOIN public.profiles p ON gs.user_id = p.id
     LEFT JOIN public.game_invitations gi ON gs.id = gi.game_session_id
     GROUP BY gs.id, gs.name, gs.status, p.full_name
     ORDER BY gs.start_time DESC',
    10
);

SELECT * FROM benchmark.run_test(
    'friends_with_stats',
    'JOINS',
    'SELECT f.id, p1.full_name as user_name, p2.full_name as friend_name,
            p2.all_time_profit_loss, p2.games_played
     FROM public.friendships f
     JOIN public.profiles p1 ON f.user_id = p1.id
     JOIN public.profiles p2 ON f.friend_id = p2.id
     ORDER BY p2.all_time_profit_loss DESC',
    10
);

-- 3. Aggregation Operations Benchmark
SELECT 'Starting Aggregation Operations Benchmark...' as status;

SELECT * FROM benchmark.run_test(
    'user_stats_aggregation',
    'AGGREGATION',
    'SELECT 
        COUNT(*) as total_users,
        AVG(all_time_profit_loss) as avg_profit_loss,
        SUM(games_played) as total_games,
        MAX(all_time_profit_loss) as max_profit,
        MIN(all_time_profit_loss) as min_profit
     FROM public.profiles',
    10
);

SELECT * FROM benchmark.run_test(
    'game_status_summary',
    'AGGREGATION',
    'SELECT 
        status,
        COUNT(*) as count,
        AVG(point_to_cash_rate) as avg_rate
     FROM public.game_sessions
     GROUP BY status',
    15
);

-- 4. Full-text Search Benchmark (if applicable)
SELECT 'Starting Search Operations Benchmark...' as status;

SELECT * FROM benchmark.run_test(
    'profile_name_search',
    'SEARCH',
    'SELECT * FROM public.profiles WHERE full_name ILIKE ''%john%'' OR email ILIKE ''%john%''',
    10
);

-- 5. Concurrent Operations Simulation
SELECT 'Starting Concurrent Operations Benchmark...' as status;

SELECT * FROM benchmark.run_test(
    'concurrent_read_simulation',
    'CONCURRENT',
    'SELECT gs.*, p.full_name 
     FROM public.game_sessions gs 
     JOIN public.profiles p ON gs.user_id = p.id 
     WHERE gs.status IN (''active'', ''pending_close'')
     ORDER BY gs.start_time DESC',
    25
);

-- ============================================================================
-- GENERATE BENCHMARK REPORT
-- ============================================================================

SELECT '=== DATABASE PERFORMANCE BENCHMARK REPORT ===' as report_header;

-- Overall performance summary
SELECT 
    'PERFORMANCE SUMMARY BY CATEGORY' as section,
    test_category,
    COUNT(*) as total_tests,
    ROUND(AVG(execution_time_ms), 2) as avg_execution_time_ms,
    ROUND(MIN(execution_time_ms), 2) as min_execution_time_ms,
    ROUND(MAX(execution_time_ms), 2) as max_execution_time_ms,
    ROUND(AVG(operations_per_second), 2) as avg_ops_per_second
FROM benchmark.test_results
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY test_category
ORDER BY avg_execution_time_ms DESC;

-- Detailed test results
SELECT 
    'DETAILED BENCHMARK RESULTS' as section,
    test_name,
    test_category,
    COUNT(*) as iterations,
    ROUND(AVG(execution_time_ms), 2) as avg_time_ms,
    ROUND(STDDEV(execution_time_ms), 2) as stddev_time_ms,
    ROUND(AVG(operations_per_second), 2) as avg_ops_per_sec,
    SUM(rows_processed) as total_rows_processed
FROM benchmark.test_results
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY test_name, test_category
ORDER BY avg_time_ms DESC;

-- Performance grades
SELECT 
    'PERFORMANCE GRADES' as section,
    test_name,
    ROUND(AVG(execution_time_ms), 2) as avg_time_ms,
    CASE 
        WHEN AVG(execution_time_ms) < 10 THEN 'A+ (Excellent)'
        WHEN AVG(execution_time_ms) < 50 THEN 'A (Very Good)'
        WHEN AVG(execution_time_ms) < 100 THEN 'B (Good)'
        WHEN AVG(execution_time_ms) < 500 THEN 'C (Acceptable)'
        WHEN AVG(execution_time_ms) < 1000 THEN 'D (Needs Improvement)'
        ELSE 'F (Poor - Requires Optimization)'
    END as performance_grade,
    CASE 
        WHEN AVG(execution_time_ms) > 1000 THEN 'Consider adding indexes or optimizing query'
        WHEN AVG(execution_time_ms) > 500 THEN 'Monitor for potential optimization'
        ELSE 'Performance is acceptable'
    END as recommendation
FROM benchmark.test_results
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY test_name
ORDER BY AVG(execution_time_ms) DESC;

-- Slowest operations
SELECT 
    'TOP 5 SLOWEST OPERATIONS' as section,
    test_name,
    execution_time_ms,
    rows_processed,
    timestamp
FROM benchmark.test_results
WHERE timestamp > NOW() - INTERVAL '1 hour'
ORDER BY execution_time_ms DESC
LIMIT 5;

-- Fastest operations
SELECT 
    'TOP 5 FASTEST OPERATIONS' as section,
    test_name,
    execution_time_ms,
    rows_processed,
    timestamp
FROM benchmark.test_results
WHERE timestamp > NOW() - INTERVAL '1 hour'
AND execution_time_ms > 0
ORDER BY execution_time_ms ASC
LIMIT 5;

SELECT 'Benchmark analysis complete. Review results above for performance insights.' as final_message;
