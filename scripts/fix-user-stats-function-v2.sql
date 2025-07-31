-- Fix the user stats function with correct column names
CREATE OR REPLACE FUNCTION update_user_game_stats(
  user_id_param UUID,
  profit_loss_amount NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Log the function call for debugging
  RAISE NOTICE 'Updating stats for user: %, P/L: %', user_id_param, profit_loss_amount;
  
  -- Update user statistics with correct column names
  UPDATE profiles 
  SET 
    games_played = COALESCE(games_played, 0) + 1,
    all_time_profit_loss = COALESCE(all_time_profit_loss, 0) + profit_loss_amount,
    last_game_date = NOW()::timestamp,
    updated_at = NOW()::timestamp
  WHERE id = user_id_param;
  
  -- Check if the update affected any rows
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User with ID % not found', user_id_param;
  END IF;
  
  -- Log successful update
  RAISE NOTICE 'Successfully updated stats for user: %', user_id_param;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_user_game_stats(UUID, NUMERIC) TO authenticated;

-- Test the function to ensure it works
DO $$
BEGIN
  RAISE NOTICE 'User stats function updated successfully with correct column names';
END;
$$;
