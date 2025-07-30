-- Database Health Monitoring Script
-- Run this periodically to monitor ongoing database health

-- Create monitoring schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS monitoring;

-- Create health metrics table
CREATE TABLE IF NOT EXISTS monitoring.health_metrics (
    id SERIAL PRIMARY KEY,
    metric_name TEXT NOT NULL,
    metric_value NUMERIC,
    metric_unit TEXT,
    status TEXT CHECK (status IN ('GOOD', 'WARNING', 'CRITICAL')),
    threshold_warning NUMERIC,
    threshold_critical NUMERIC,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Create alert log table
CREATE TABLE IF NOT EXISTS monitoring.alert_log (
    id SERIAL PRIMARY KEY,
    alert_type TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    resolved BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Function to record health metric
CREATE OR REPLACE FUNCTION monitoring.record_metric(
    p_metric_name TEXT,
    p_metric_value NUMERIC,
    p_metric_unit TEXT DEFAULT NULL,
    p_threshold_warning NUMERIC DEFAULT NULL,
    p_threshold_critical NUMERIC DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
    v_status TEXT := 'GOOD';
    v_alert_message TEXT;
BEGIN
    -- Determine status based on thresholds
    IF p_threshold_critical IS NOT NULL AND p_metric_value >= p_threshold_critical THEN
        v_status := 'CRITICAL';
        v_alert_message := p_metric_name || ' is CRITICAL: ' || p_metric_value || ' ' || COALESCE(p_metric_unit, '');
        INSERT INTO monitoring.alert_log (alert_type, message, severity)
        VALUES (p_metric_name, v_alert_message, 'CRITICAL');
    ELSIF p_threshold_warning IS NOT NULL AND p_metric_value >= p_threshold_warning THEN
        v_status := 'WARNING';
        v_alert_message := p_metric_name || ' is WARNING: ' || p_metric_value || ' ' || COALESCE(p_metric_unit, '');
        INSERT INTO monitoring.alert_log (alert_type, message, severity)
        VALUES (p_metric_name, v_alert_message, 'WARNING');
    END IF;
    
    -- Record the metric
    INSERT INTO monitoring.health_metrics (
        metric_name, metric_value, metric_unit, status, 
        threshold_warning, threshold_critical
    ) VALUES (
        p_metric_name, p_metric_value, p_metric_unit, v_status,
        p_threshold_warning, p_threshold_critical
    );
    
    RETURN v_status;
END;
$$ LANGUAGE plpgsql;

-- Health check function
CREATE OR REPLACE FUNCTION monitoring.run_health_check() RETURNS TABLE (
    metric_name TEXT,
    current_value NUMERIC,
    status TEXT,
    message TEXT
) AS $$
DECLARE
    v_total_connections INTEGER;
    v_active_connections INTEGER;
    v_idle_connections INTEGER;
    v_database_size BIGINT;
    v_total_tables INTEGER;
    v_total_indexes INTEGER;
    v_slow_queries INTEGER;
    v_lock_waits INTEGER;
    v_cache_hit_ratio NUMERIC;
BEGIN
    -- Clear old metrics (keep last 24 hours)
    DELETE FROM monitoring.health_metrics WHERE timestamp < NOW() - INTERVAL '24 hours';
    DELETE FROM monitoring.alert_log WHERE timestamp < NOW() - INTERVAL '7 days' AND resolved = TRUE;
    
    -- Check database connections
    SELECT COUNT(*) INTO v_total_connections FROM pg_stat_activity;
    SELECT COUNT(*) INTO v_active_connections FROM pg_stat_activity WHERE state = 'active';
    SELECT COUNT(*) INTO v_idle_connections FROM pg_stat_activity WHERE state = 'idle';
    
    PERFORM monitoring.record_metric('total_connections', v_total_connections, 'connections', 80, 95);
    PERFORM monitoring.record_metric('active_connections', v_active_connections, 'connections', 50, 70);
    
    -- Check database size
    SELECT pg_database_size(current_database()) INTO v_database_size;
    PERFORM monitoring.record_metric('database_size', v_database_size / (1024*1024), 'MB', 1000, 5000);
    
    -- Check table and index counts
    SELECT COUNT(*) INTO v_total_tables FROM pg_tables WHERE schemaname = 'public';
    SELECT COUNT(*) INTO v_total_indexes FROM pg_indexes WHERE schemaname = 'public';
    
    PERFORM monitoring.record_metric('total_tables', v_total_tables, 'tables');
    PERFORM monitoring.record_metric('total_indexes', v_total_indexes, 'indexes');
    
    -- Check for slow queries (queries running longer than 30 seconds)
    SELECT COUNT(*) INTO v_slow_queries 
    FROM pg_stat_activity 
    WHERE state = 'active' 
    AND query_start < NOW() - INTERVAL '30 seconds'
    AND query NOT LIKE '%pg_stat_activity%';
    
    PERFORM monitoring.record_metric('slow_queries', v_slow_queries, 'queries', 1, 5);
    
    -- Check for lock waits
    SELECT COUNT(*) INTO v_lock_waits 
    FROM pg_stat_activity 
    WHERE wait_event_type = 'Lock';
    
    PERFORM monitoring.record_metric('lock_waits', v_lock_waits, 'processes', 2, 10);
    
    -- Check cache hit ratio
    SELECT 
        ROUND(
            (sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read) + 1)) * 100, 2
        ) INTO v_cache_hit_ratio
    FROM pg_statio_user_tables;
    
    PERFORM monitoring.record_metric('cache_hit_ratio', v_cache_hit_ratio, 'percent', NULL, 80);
    
    -- Return current metrics
    RETURN QUERY
    SELECT 
        hm.metric_name,
        hm.metric_value,
        hm.status,
        CASE 
            WHEN hm.status = 'CRITICAL' THEN 'Immediate attention required'
            WHEN hm.status = 'WARNING' THEN 'Monitor closely'
            ELSE 'Operating normally'
        END as message
    FROM monitoring.health_metrics hm
    WHERE hm.timestamp > NOW() - INTERVAL '5 minutes'
    ORDER BY 
        CASE hm.status 
            WHEN 'CRITICAL' THEN 1 
            WHEN 'WARNING' THEN 2 
            ELSE 3 
        END,
        hm.timestamp DESC;
END;
$$ LANGUAGE plpgsql;

-- Run the health check
SELECT * FROM monitoring.run_health_check();

-- Show recent alerts
SELECT 
    'RECENT ALERTS' as section,
    alert_type,
    message,
    severity,
    resolved,
    timestamp
FROM monitoring.alert_log 
WHERE timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

-- Show health trends (last 6 hours)
SELECT 
    'HEALTH TRENDS (Last 6 Hours)' as section,
    metric_name,
    COUNT(*) as measurements,
    ROUND(AVG(metric_value), 2) as avg_value,
    ROUND(MIN(metric_value), 2) as min_value,
    ROUND(MAX(metric_value), 2) as max_value,
    metric_unit
FROM monitoring.health_metrics 
WHERE timestamp > NOW() - INTERVAL '6 hours'
GROUP BY metric_name, metric_unit
ORDER BY metric_name;
