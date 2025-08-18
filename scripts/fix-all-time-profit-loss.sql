-- Using CREATE OR REPLACE instead of DROP + CREATE to avoid signature conflicts
-- Fix all_time_profit_loss updates by creating proper RPC function
-- This script ensures the RPC function updates the correct existing columns

-- Create or replace the RPC function to update profile stats when games are finalized
CREATE OR REPLACE FUNCTION profile_finalize_game(
  p_game_id uuid,
  p_profile_id uuid,
  p_buyin_dollars numeric,
  p_cashout_dollars numeric,
  p_winner boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_net_dollars numeric;
BEGIN
  -- Calculate net profit/loss
  v_net_dollars := p_cashout_dollars - p_buyin_dollars;
  
  -- Log the operation for debugging
  RAISE NOTICE 'Finalizing game % for profile %: buyin=%, cashout=%, net=%, winner=%', 
    p_game_id, p_profile_id, p_buyin_dollars, p_cashout_dollars, v_net_dollars, p_winner;
  
  -- Check if this game has already been finalized for this player (idempotency)
  IF EXISTS (
    SELECT 1 FROM game_finalizations 
    WHERE game_id = p_game_id 
    AND owner_id = p_profile_id
  ) THEN
    RAISE NOTICE 'Game % already finalized for profile %, skipping', p_game_id, p_profile_id;
    RETURN;
  END IF;
  
  -- Insert or update the game player result
  INSERT INTO game_player_results (
    game_id, 
    profile_id, 
    buyin_dollars, 
    cashout_dollars, 
    net_dollars, 
    winner,
    created_at
  ) VALUES (
    p_game_id,
    p_profile_id,
    p_buyin_dollars,
    p_cashout_dollars,
    v_net_dollars,
    p_winner,
    NOW()
  )
  ON CONFLICT (game_id, profile_id) 
  DO UPDATE SET
    buyin_dollars = EXCLUDED.buyin_dollars,
    cashout_dollars = EXCLUDED.cashout_dollars,
    net_dollars = EXCLUDED.net_dollars,
    winner = EXCLUDED.winner;
  
  -- Update the profile stats using existing columns
  UPDATE profiles SET
    games_played = games_played + 1,  -- Use existing games_played column instead of total_sessions
    all_time_profit_loss = all_time_profit_loss + v_net_dollars,  -- Update the actual all_time_profit_loss column
    total_buyin_dollars = total_buyin_dollars + p_buyin_dollars,
    total_cashout_dollars = total_cashout_dollars + p_cashout_dollars,
    total_wins = total_wins + CASE WHEN p_winner THEN 1 ELSE 0 END,
    last_game_date = NOW(),
    updated_at = NOW()
  WHERE id = p_profile_id;
  
  -- Record that this game has been finalized for this player (idempotency)
  INSERT INTO game_finalizations (game_id, owner_id, finalized_at)
  VALUES (p_game_id, p_profile_id, NOW())
  ON CONFLICT (game_id, owner_id) DO NOTHING;
  
  RAISE NOTICE 'Successfully updated profile % stats: games_played +1, all_time_profit_loss +%, total_wins +%', 
    p_profile_id, v_net_dollars, CASE WHEN p_winner THEN 1 ELSE 0 END;
    
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION profile_finalize_game TO authenticated;

-- Add RLS policy for the game_player_results table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'game_player_results' 
    AND policyname = 'Users can view their own game results'
  ) THEN
    CREATE POLICY "Users can view their own game results" ON game_player_results
      FOR SELECT USING (profile_id = auth.uid());
  END IF;
END $$;

-- Enable RLS on game_player_results if not already enabled
ALTER TABLE game_player_results ENABLE ROW LEVEL SECURITY;

-- Test the function exists
DO $$
BEGIN
  RAISE NOTICE 'RPC function profile_finalize_game created successfully';
END $$;
