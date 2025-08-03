-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS public.update_user_game_stats(UUID, DECIMAL);

-- Create the corrected function to update user game stats
CREATE OR REPLACE FUNCTION public.update_user_game_stats(
  user_id_param UUID,
  profit_loss_amount DECIMAL(10,2)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update the user's profile with new stats
  UPDATE public.profiles 
  SET 
    all_time_profit_loss = COALESCE(all_time_profit_loss, 0) + profit_loss_amount,
    games_played = COALESCE(games_played, 0) + 1,
    last_game_date = NOW(),
    updated_at = NOW()
  WHERE id = user_id_param;

  -- Log the update for debugging
  RAISE NOTICE 'Updated stats for user %: P/L change = %, New total P/L = %', 
    user_id_param, 
    profit_loss_amount,
    (SELECT all_time_profit_loss FROM public.profiles WHERE id = user_id_param);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_user_game_stats(UUID, DECIMAL) TO authenticated;

-- Test the function works by checking if it exists
SELECT 
  routine_name,
  routine_type,
  data_type
FROM information_schema.routines 
WHERE routine_name = 'update_user_game_stats' 
  AND routine_schema = 'public';
