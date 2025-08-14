-- Fixed SQL syntax by removing unsupported IF NOT EXISTS with ADD CONSTRAINT
-- Comprehensive solution to streamline profiles table and fix stats tracking
-- This script removes redundant columns and creates an idempotent finalization system

BEGIN;

-- Step 1: Create idempotent finalization function
CREATE OR REPLACE FUNCTION finalize_game_stats(
  p_game_id UUID,
  p_owner_id UUID,
  p_player_results JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB := '{"success": true, "message": "Stats updated successfully"}';
  v_player JSONB;
  v_profile_id UUID;
  v_profit_loss NUMERIC;
  v_is_winner BOOLEAN;
  v_already_finalized BOOLEAN;
BEGIN
  -- Check if game is already finalized
  SELECT EXISTS(
    SELECT 1 FROM game_finalizations 
    WHERE game_id = p_game_id AND owner_id = p_owner_id
  ) INTO v_already_finalized;
  
  IF v_already_finalized THEN
    RETURN '{"success": false, "message": "Game already finalized"}';
  END IF;

  -- Process each player's results
  FOR v_player IN SELECT * FROM jsonb_array_elements(p_player_results)
  LOOP
    v_profile_id := (v_player->>'profileId')::UUID;
    v_profit_loss := (v_player->>'profitLoss')::NUMERIC;
    v_is_winner := (v_player->>'isWinner')::BOOLEAN;
    
    -- Skip if no profile ID
    CONTINUE WHEN v_profile_id IS NULL;
    
    -- Update profile stats
    UPDATE profiles SET
      games_played = COALESCE(games_played, 0) + 1,
      all_time_profit_loss = COALESCE(all_time_profit_loss, 0) + v_profit_loss,
      last_game_date = NOW()
    WHERE id = v_profile_id;
    
    -- Award win if player won (idempotent)
    IF v_is_winner THEN
      INSERT INTO game_wins_awarded (game_id, profile_id, awarded_at)
      VALUES (p_game_id, v_profile_id, NOW())
      ON CONFLICT (game_id, profile_id) DO NOTHING;
      
      -- Update total_wins count
      UPDATE profiles SET
        total_wins = (
          SELECT COUNT(*) FROM game_wins_awarded 
          WHERE profile_id = v_profile_id
        )
      WHERE id = v_profile_id;
    END IF;
  END LOOP;
  
  -- Mark game as finalized
  INSERT INTO game_finalizations (game_id, owner_id, finalized_at)
  VALUES (p_game_id, p_owner_id, NOW())
  ON CONFLICT (game_id, owner_id) DO NOTHING;
  
  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Error: ' || SQLERRM
    );
END;
$$;

-- Step 2: Remove redundant columns from profiles table
-- First, migrate data if needed
UPDATE profiles SET 
  all_time_profit_loss = COALESCE(all_time_profit_loss, total_net_dollars, 0)
WHERE all_time_profit_loss IS NULL AND total_net_dollars IS NOT NULL;

UPDATE profiles SET 
  games_played = COALESCE(games_played, total_sessions, 0)
WHERE games_played IS NULL AND total_sessions IS NOT NULL;

-- Drop redundant columns
ALTER TABLE profiles DROP COLUMN IF EXISTS total_net_dollars;
ALTER TABLE profiles DROP COLUMN IF EXISTS total_sessions;
ALTER TABLE profiles DROP COLUMN IF EXISTS total_buyin_dollars;
ALTER TABLE profiles DROP COLUMN IF EXISTS total_cashout_dollars;

-- Step 3: Ensure proper constraints and indexes
ALTER TABLE profiles ALTER COLUMN games_played SET DEFAULT 0;
ALTER TABLE profiles ALTER COLUMN total_wins SET DEFAULT 0;
ALTER TABLE profiles ALTER COLUMN all_time_profit_loss SET DEFAULT 0;

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_game_wins_awarded_profile_id ON game_wins_awarded(profile_id);
CREATE INDEX IF NOT EXISTS idx_game_finalizations_game_id ON game_finalizations(game_id);

COMMIT;
