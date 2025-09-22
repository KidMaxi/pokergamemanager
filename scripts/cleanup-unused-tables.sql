-- Remove unused tables that aren't being used in the current implementation

-- Drop player_in_game table and related tables since we're using local players per game
DROP TABLE IF EXISTS public.cash_out_records CASCADE;
DROP TABLE IF EXISTS public.buy_in_records CASCADE;
DROP TABLE IF EXISTS public.player_in_game CASCADE;

-- Drop game_results table if it exists (we're not using it effectively)
DROP TABLE IF EXISTS public.game_results CASCADE;

-- Remove unused tables identified in database analysis
-- Drop unused tables that exist in database but are not referenced in codebase
DROP TABLE IF EXISTS public.game_finalizations CASCADE;
DROP TABLE IF EXISTS public.safe_profiles CASCADE;

-- Verification messages for removed tables
DO $$
BEGIN
    RAISE NOTICE 'Cleanup complete: Removed unused tables game_finalizations and safe_profiles';
    RAISE NOTICE 'These tables were not referenced anywhere in the codebase';
END $$;

-- Keep only the essential tables:
-- - profiles (for user authentication and data)
-- - game_sessions (for basic game info, but player data is stored locally)
-- - friendships (for friend relationships)
-- - friend_requests (for pending friend requests)
-- - game_invitations (for game invites)
-- - game_player_results (for storing game results)

-- Update game_sessions table to be more streamlined
-- Remove columns that aren't needed since we store player data locally
ALTER TABLE public.game_sessions DROP COLUMN IF EXISTS current_physical_points_on_table;

-- Add a players_data JSONB column to store all player information locally
ALTER TABLE public.game_sessions 
ADD COLUMN IF NOT EXISTS players_data JSONB DEFAULT '[]'::jsonb;

-- Add a game_metadata JSONB column for any additional game settings
ALTER TABLE public.game_sessions 
ADD COLUMN IF NOT EXISTS game_metadata JSONB DEFAULT '{}'::jsonb;
</sql>
