-- Create the missing RPC function to update all_time_profit_loss and games_played
-- This function is called by the finalize process to update player statistics

-- Drop existing function if it exists (handles any signature conflicts)
DROP FUNCTION IF EXISTS profile_finalize_game(uuid, uuid, jsonb);

-- Create the RPC function that updates player statistics
CREATE OR REPLACE FUNCTION profile_finalize_game(
  p_game_id uuid,
  p_owner_id uuid,
  p_results jsonb
) RETURNS void AS $$
DECLARE
  result_record jsonb;
  v_profile_id uuid;
  v_buyin numeric;
  v_cashout numeric;
  v_net numeric;
  v_winner boolean;
  v_old_pl numeric;
  v_new_pl numeric;
BEGIN
  -- Check if this game has already been finalized (idempotency)
  IF EXISTS (
    SELECT 1 FROM game_finalizations 
    WHERE game_id = p_game_id AND owner_id = p_owner_id
  ) THEN
    RAISE NOTICE 'Game % already finalized, skipping', p_game_id;
    RETURN;
  END IF;

  -- Log the start of finalization
  RAISE NOTICE 'Starting finalization for game % with % results', p_game_id, jsonb_array_length(p_results);

  -- Process each player result
  FOR result_record IN SELECT * FROM jsonb_array_elements(p_results)
  LOOP
    -- Extract values from the JSON record
    v_profile_id := (result_record->>'profile_id')::uuid;
    v_buyin := (result_record->>'buyin_dollars')::numeric;
    v_cashout := (result_record->>'cashout_dollars')::numeric;
    v_net := v_cashout - v_buyin;
    v_winner := (result_record->>'winner')::boolean;

    -- Get current P/L before update
    SELECT COALESCE(all_time_profit_loss, 0) INTO v_old_pl 
    FROM profiles WHERE id = v_profile_id;

    -- Log the player being processed
    RAISE NOTICE 'Processing player %: buyin=%, cashout=%, net=%, winner=%, current_pl=%', 
      v_profile_id, v_buyin, v_cashout, v_net, v_winner, v_old_pl;

    -- Store the result in game_player_results table
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
      v_profile_id,
      v_buyin,
      v_cashout,
      v_net,
      v_winner,
      NOW()
    );

    -- Added better P/L tracking with before/after logging
    -- Update the player's profile statistics
    UPDATE profiles SET
      games_played = COALESCE(games_played, 0) + 1,
      all_time_profit_loss = COALESCE(all_time_profit_loss, 0) + v_net,
      total_buyin_dollars = COALESCE(total_buyin_dollars, 0) + v_buyin,
      total_cashout_dollars = COALESCE(total_cashout_dollars, 0) + v_cashout,
      total_wins = COALESCE(total_wins, 0) + CASE WHEN v_winner THEN 1 ELSE 0 END,
      last_game_date = NOW(),
      updated_at = NOW()
    WHERE id = v_profile_id;

    -- Get new P/L after update
    SELECT all_time_profit_loss INTO v_new_pl 
    FROM profiles WHERE id = v_profile_id;

    -- Log the profile update with before/after P/L values
    RAISE NOTICE 'Updated profile %: +1 game, P/L: % -> % (change: %), +% buyin, +% cashout, +% wins', 
      v_profile_id, v_old_pl, v_new_pl, v_net, v_buyin, v_cashout, CASE WHEN v_winner THEN 1 ELSE 0 END;
  END LOOP;

  -- Mark the game as finalized (idempotency ledger)
  INSERT INTO game_finalizations (game_id, owner_id, finalized_at)
  VALUES (p_game_id, p_owner_id, NOW());

  RAISE NOTICE 'Successfully finalized game % for % players', p_game_id, jsonb_array_length(p_results);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION profile_finalize_game(uuid, uuid, jsonb) TO authenticated;

-- Log completion
SELECT 'RPC function profile_finalize_game created successfully' as status;
