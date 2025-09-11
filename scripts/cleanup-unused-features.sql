-- Cleanup Script for Unused Features and Redundancies
-- This script removes or optimizes unused features identified in the analysis

-- ============================================================================
-- 1. REMOVE UNUSED COLUMNS (if they exist)
-- ============================================================================

-- Remove avatar_url if not used (check first)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'avatar_url') THEN
        ALTER TABLE profiles DROP COLUMN IF EXISTS avatar_url;
        RAISE NOTICE 'Removed avatar_url column from profiles table';
    END IF;
END $$;

-- Remove preferences if not used (check first)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'preferences') THEN
        -- Only drop if it's not being used (all values are null or default)
        IF (SELECT COUNT(*) FROM profiles WHERE preferences IS NOT NULL AND preferences != '{}') = 0 THEN
            ALTER TABLE profiles DROP COLUMN preferences;
            RAISE NOTICE 'Removed unused preferences column from profiles table';
        ELSE
            RAISE NOTICE 'Preferences column contains data, keeping it';
        END IF;
    END IF;
END $$;

-- ============================================================================
-- 2. OPTIMIZE GAME_METADATA USAGE
-- ============================================================================

-- Check if game_metadata is being used effectively
DO $$
DECLARE
    metadata_usage_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO metadata_usage_count 
    FROM game_sessions 
    WHERE game_metadata IS NOT NULL 
    AND game_metadata != '{}' 
    AND game_metadata != 'null';
    
    IF metadata_usage_count = 0 THEN
        RAISE NOTICE 'game_metadata column is not being used effectively. Consider removing or restructuring.';
    ELSE
        RAISE NOTICE 'game_metadata column is being used in % sessions', metadata_usage_count;
    END IF;
END $$;

-- ============================================================================
-- 3. ADD MISSING INDEXES FOR PERFORMANCE
-- ============================================================================

-- Add index on game_sessions.status for faster filtering
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status);

-- Add index on game_sessions.user_id for faster user queries
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON game_sessions(user_id);

-- Add index on friendships for faster friend lookups
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships(friend_id);

-- Add index on friend_requests for faster request queries
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_id ON friend_requests(receiver_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_id ON friend_requests(sender_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_status ON friend_requests(status);

-- Add index on game_invitations for faster invitation queries
CREATE INDEX IF NOT EXISTS idx_game_invitations_invitee_id ON game_invitations(invitee_id);
CREATE INDEX IF NOT EXISTS idx_game_invitations_game_session_id ON game_invitations(game_session_id);
CREATE INDEX IF NOT EXISTS idx_game_invitations_status ON game_invitations(status);

-- ============================================================================
-- 4. CLEAN UP OLD DATA (if any)
-- ============================================================================

-- Remove any test or invalid data
DELETE FROM friend_requests WHERE sender_id = receiver_id;
DELETE FROM friendships WHERE user_id = friend_id;

-- Remove old completed games older than 2 years (optional - uncomment if needed)
-- DELETE FROM game_sessions WHERE status = 'completed' AND end_time < NOW() - INTERVAL '2 years';

-- ============================================================================
-- 5. UPDATE STATISTICS
-- ============================================================================

-- Update table statistics for better query planning
ANALYZE profiles;
ANALYZE game_sessions;
ANALYZE friendships;
ANALYZE friend_requests;
ANALYZE game_invitations;

-- ============================================================================
-- 6. VERIFY CLEANUP
-- ============================================================================

-- Show current table sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Show index usage
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as times_used
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

RAISE NOTICE 'Cleanup completed successfully!';
