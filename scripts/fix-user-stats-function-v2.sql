-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS update_user_game_stats(uuid, numeric);

-- Create the corrected function with proper parameter types and correct column names
CREATE OR REPLACE FUNCTION update_user_game_stats(
  user_id_param UUID,
  profit_loss_amount NUMERIC
) RETURNS void AS $$
BEGIN
  -- Update the user's stats in the profiles table using the correct column names
  UPDATE profiles 
  SET 
    games_played = COALESCE(games_played, 0) + 1,
    all_time_profit_loss = COALESCE(all_time_profit_loss, 0) + profit_loss_amount,
    last_game_date = NOW()::timestamp,
    updated_at = NOW()::timestamp
  WHERE id = user_id_param;
  
  -- If no rows were updated, the user doesn't exist
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User with ID % not found', user_id_param;
  END IF;
  
  -- Log the update for debugging
  RAISE NOTICE 'Updated stats for user %: games_played +1, profit_loss %', user_id_param, profit_loss_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_user_game_stats(UUID, NUMERIC) TO authenticated;
