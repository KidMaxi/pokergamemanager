-- Clean up all existing versions of the function and create the final working version
-- This script will fix the function signature conflict

-- Drop ALL existing versions of the function with different signatures
DROP FUNCTION IF EXISTS update_user_game_stats(uuid, numeric);
DROP FUNCTION IF EXISTS update_user_game_stats(text, numeric);
DROP FUNCTION IF EXISTS update_user_game_stats(uuid, numeric, integer, numeric);
DROP FUNCTION IF EXISTS update_user_game_stats(text, numeric, integer, numeric);

-- Also drop any other variations that might exist
DROP FUNCTION IF EXISTS public.update_user_game_stats(uuid, numeric);
DROP FUNCTION IF EXISTS public.update_user_game_stats(text, numeric);
DROP FUNCTION IF EXISTS public.update_user_game_stats(uuid, numeric, integer, numeric);
DROP FUNCTION IF EXISTS public.update_user_game_stats(text, numeric, integer, numeric);

-- Create the single, final version of the function
CREATE OR REPLACE FUNCTION update_user_game_stats(
    user_id_param uuid,
    profit_loss_amount numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
    current_games_played integer;
    current_profit_loss numeric;
    current_last_game_date timestamp with time zone;
BEGIN
    -- Log the function call for debugging
    RAISE NOTICE 'update_user_game_stats called with user_id: %, profit_loss: %', user_id_param, profit_loss_amount;
    
    -- Get current stats
    SELECT games_played, all_time_profit_loss, last_game_date
    INTO current_games_played, current_profit_loss, current_last_game_date
    FROM profiles 
    WHERE id = user_id_param;
    
    -- Check if user exists
    IF NOT FOUND THEN
        RAISE NOTICE 'User not found with ID: %', user_id_param;
        RETURN json_build_object(
            'success', false,
            'error', 'User not found',
            'user_id', user_id_param
        );
    END IF;
    
    RAISE NOTICE 'Current stats for user %: games_played=%, profit_loss=%', 
        user_id_param, current_games_played, current_profit_loss;
    
    -- Update the user's stats
    UPDATE profiles 
    SET 
        games_played = COALESCE(games_played, 0) + 1,
        all_time_profit_loss = COALESCE(all_time_profit_loss, 0) + profit_loss_amount,
        last_game_date = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = user_id_param;
    
    -- Check if update was successful
    IF NOT FOUND THEN
        RAISE NOTICE 'Failed to update user with ID: %', user_id_param;
        RETURN json_build_object(
            'success', false,
            'error', 'Failed to update user stats',
            'user_id', user_id_param
        );
    END IF;
    
    -- Log success
    RAISE NOTICE 'Successfully updated stats for user: %, new games_played: %, new profit_loss: %', 
        user_id_param, COALESCE(current_games_played, 0) + 1, COALESCE(current_profit_loss, 0) + profit_loss_amount;
    
    -- Return success result with detailed information
    result := json_build_object(
        'success', true,
        'user_id', user_id_param,
        'previous_games_played', COALESCE(current_games_played, 0),
        'new_games_played', COALESCE(current_games_played, 0) + 1,
        'previous_profit_loss', COALESCE(current_profit_loss, 0),
        'new_profit_loss', COALESCE(current_profit_loss, 0) + profit_loss_amount,
        'profit_loss_change', profit_loss_amount,
        'previous_last_game_date', current_last_game_date,
        'new_last_game_date', CURRENT_TIMESTAMP,
        'updated_at', CURRENT_TIMESTAMP
    );
    
    RETURN result;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in update_user_game_stats: %', SQLERRM;
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM,
            'user_id', user_id_param,
            'sql_state', SQLSTATE
        );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_user_game_stats(uuid, numeric) TO authenticated;

-- Test that the function was created successfully
DO $$
BEGIN
    RAISE NOTICE 'Function update_user_game_stats created successfully with signature: (uuid, numeric)';
END;
$$;

-- Verify no duplicate functions exist
SELECT 
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments,
    p.prosrc IS NOT NULL as has_body
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'update_user_game_stats'
AND n.nspname = 'public';
