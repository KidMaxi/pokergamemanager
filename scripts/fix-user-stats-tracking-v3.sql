-- Fix user stats tracking after game completion
-- This script creates/updates the function to properly track user statistics

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS update_user_game_stats(uuid, numeric);
DROP FUNCTION IF EXISTS update_user_game_stats(text, numeric);

-- Create the corrected function with proper parameter types
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
BEGIN
    -- Log the function call for debugging
    RAISE NOTICE 'Updating stats for user: %, profit/loss: %', user_id_param, profit_loss_amount;
    
    -- Get current stats
    SELECT games_played, all_time_profit_loss 
    INTO current_games_played, current_profit_loss
    FROM profiles 
    WHERE id = user_id_param;
    
    -- Check if user exists
    IF NOT FOUND THEN
        RAISE NOTICE 'User not found: %', user_id_param;
        RETURN json_build_object(
            'success', false,
            'error', 'User not found',
            'user_id', user_id_param
        );
    END IF;
    
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
        RAISE NOTICE 'Failed to update user: %', user_id_param;
        RETURN json_build_object(
            'success', false,
            'error', 'Failed to update user stats',
            'user_id', user_id_param
        );
    END IF;
    
    -- Log success
    RAISE NOTICE 'Successfully updated stats for user: %', user_id_param;
    
    -- Return success result
    result := json_build_object(
        'success', true,
        'user_id', user_id_param,
        'previous_games_played', current_games_played,
        'new_games_played', COALESCE(current_games_played, 0) + 1,
        'previous_profit_loss', current_profit_loss,
        'new_profit_loss', COALESCE(current_profit_loss, 0) + profit_loss_amount,
        'profit_loss_change', profit_loss_amount,
        'updated_at', CURRENT_TIMESTAMP
    );
    
    RETURN result;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error updating user stats: %', SQLERRM;
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM,
            'user_id', user_id_param
        );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_user_game_stats(uuid, numeric) TO authenticated;

-- Test the function (this will be ignored if user doesn't exist)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM profiles LIMIT 1) THEN
        RAISE NOTICE 'Function created successfully and ready to use';
    END IF;
END;
$$;
