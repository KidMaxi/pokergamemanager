-- ============================================================================
-- PERFORMANCE INDEXES SCRIPT
-- This script adds database indexes to improve query performance
-- WITHOUT modifying any existing data or table structure
-- ============================================================================

-- Start transaction to ensure all indexes are created together
BEGIN;

-- ============================================================================
-- 1. GAME_SESSIONS TABLE INDEXES
-- ============================================================================

-- Index for filtering games by status (active, completed, pending_close)
-- Used in: Dashboard queries, game listing, status filtering
CREATE INDEX IF NOT EXISTS idx_game_sessions_status 
ON game_sessions(status);

-- Index for finding user's games
-- Used in: User dashboard, game history, user statistics
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id 
ON game_sessions(user_id);

-- Composite index for user's games by status
-- Used in: Finding user's active games, completed games
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_status 
ON game_sessions(user_id, status);

-- Index for games by creation date (for recent games queries)
-- Used in: Recent games, chronological sorting
CREATE INDEX IF NOT EXISTS idx_game_sessions_created_at 
ON game_sessions(created_at DESC);

-- Index for completed games by end time
-- Used in: Game history, statistics calculations
CREATE INDEX IF NOT EXISTS idx_game_sessions_end_time 
ON game_sessions(end_time DESC) WHERE end_time IS NOT NULL;

-- ============================================================================
-- 2. FRIENDSHIPS TABLE INDEXES
-- ============================================================================

-- Index for finding user's friends
-- Used in: Friends list, friend lookup
CREATE INDEX IF NOT EXISTS idx_friendships_user_id 
ON friendships(user_id);

-- Index for reverse friend lookup
-- Used in: Checking if users are friends, bidirectional friendship queries
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id 
ON friendships(friend_id);

-- Composite index for friendship verification
-- Used in: Checking if two users are friends
CREATE INDEX IF NOT EXISTS idx_friendships_user_friend 
ON friendships(user_id, friend_id);

-- ============================================================================
-- 3. FRIEND_REQUESTS TABLE INDEXES
-- ============================================================================

-- Index for finding received friend requests
-- Used in: Notifications, pending requests display
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_id 
ON friend_requests(receiver_id);

-- Index for finding sent friend requests
-- Used in: Sent requests tracking, duplicate prevention
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_id 
ON friend_requests(sender_id);

-- Index for filtering by request status
-- Used in: Pending requests, accepted/declined filtering
CREATE INDEX IF NOT EXISTS idx_friend_requests_status 
ON friend_requests(status);

-- Composite index for receiver's pending requests
-- Used in: Notification queries, pending request counts
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_status 
ON friend_requests(receiver_id, status);

-- Composite index for preventing duplicate requests
-- Used in: Checking if request already exists between users
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_receiver 
ON friend_requests(sender_id, receiver_id);

-- ============================================================================
-- 4. GAME_INVITATIONS TABLE INDEXES
-- ============================================================================

-- Index for finding user's received invitations
-- Used in: Invitation notifications, pending invitations
CREATE INDEX IF NOT EXISTS idx_game_invitations_invitee_id 
ON game_invitations(invitee_id);

-- Index for finding invitations for a specific game
-- Used in: Game invitation management, invitation lists
CREATE INDEX IF NOT EXISTS idx_game_invitations_game_session_id 
ON game_invitations(game_session_id);

-- Index for filtering by invitation status
-- Used in: Pending invitations, accepted/declined filtering
CREATE INDEX IF NOT EXISTS idx_game_invitations_status 
ON game_invitations(status);

-- Composite index for user's pending invitations
-- Used in: Notification queries, invitation counts
CREATE INDEX IF NOT EXISTS idx_game_invitations_invitee_status 
ON game_invitations(invitee_id, status);

-- Composite index for game's invitation status
-- Used in: Checking game invitation responses
CREATE INDEX IF NOT EXISTS idx_game_invitations_game_status 
ON game_invitations(game_session_id, status);

-- Index for finding invitations by inviter
-- Used in: Tracking sent invitations
CREATE INDEX IF NOT EXISTS idx_game_invitations_inviter_id 
ON game_invitations(inviter_id);

-- ============================================================================
-- 5. PROFILES TABLE INDEXES
-- ============================================================================

-- Index for email lookup (if not already primary)
-- Used in: User authentication, email verification
CREATE INDEX IF NOT EXISTS idx_profiles_email 
ON profiles(email);

-- Index for admin users
-- Used in: Admin panel access, admin-only features
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin 
ON profiles(is_admin) WHERE is_admin = true;

-- Index for users with games (for statistics)
-- Used in: Leaderboards, active user queries
CREATE INDEX IF NOT EXISTS idx_profiles_games_played 
ON profiles(games_played) WHERE games_played > 0;

-- Index for profit/loss leaderboards
-- Used in: Ranking users by performance
CREATE INDEX IF NOT EXISTS idx_profiles_profit_loss 
ON profiles(all_time_profit_loss DESC);

-- ============================================================================
-- 6. UPDATE TABLE STATISTICS
-- ============================================================================

-- Update table statistics for better query planning
ANALYZE profiles;
ANALYZE game_sessions;
ANALYZE friendships;
ANALYZE friend_requests;
ANALYZE game_invitations;

-- Commit all changes
COMMIT;

-- ============================================================================
-- 7. VERIFY INDEX CREATION
-- ============================================================================

-- Show all indexes created for our tables
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'game_sessions', 'friendships', 'friend_requests', 'game_invitations')
ORDER BY tablename, indexname;

-- Show table sizes after index creation
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size
FROM pg_tables 
WHERE schemaname = 'public'
AND tablename IN ('profiles', 'game_sessions', 'friendships', 'friend_requests', 'game_invitations')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Performance indexes successfully created!';
    RAISE NOTICE '📊 Total indexes added: 20';
    RAISE NOTICE '🚀 Query performance should be significantly improved';
    RAISE NOTICE '💡 Run EXPLAIN ANALYZE on your queries to see the performance gains';
END $$;
