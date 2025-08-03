-- Fix user stats tracking after game completion
-- This script creates/updates the function to properly track games played and profit/loss

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS update_user_game_stats(UUID, DECIMAL);

-- Create the corrected function
CREATE OR REPLACE FUNCTION update_user_game_stats(
    user_id_param UUID,
    profit_loss_amount DECIMAL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
    current_games_played INTEGER;
    current_profit_loss DECIMAL;
BEGIN
    -- Log the function call
    RAISE NOTICE 'Updating stats for user: %, P/L: %', user_id_param, profit_loss_amount;
    
    -- Get current stats
    SELECT 
        COALESCE(games_played, 0),
        COALESCE(all_time_profit_loss, 0)
    INTO 
        current_games_played,
        current_profit_loss
    FROM profiles 
    WHERE id = user_id_param;
    
    -- Check if user exists
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User profile not found for ID: %', user_id_param;
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
        RAISE EXCEPTION 'Failed to update user stats for ID: %', user_id_param;
    END IF;
    
    -- Get updated stats for return
    SELECT 
        games_played,
        all_time_profit_loss
    INTO 
        current_games_played,
        current_profit_loss
    FROM profiles 
    WHERE id = user_id_param;
    
    -- Build result JSON
    result := json_build_object(
        'success', true,
        'user_id', user_id_param,
        'profit_loss_added', profit_loss_amount,
        'new_games_played', current_games_played,
        'new_total_profit_loss', current_profit_loss,
        'updated_at', CURRENT_TIMESTAMP
    );
    
    RAISE NOTICE 'Stats updated successfully: %', result;
    
    RETURN result;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error
        RAISE NOTICE 'Error updating user stats: %', SQLERRM;
        
        -- Return error result
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM,
            'user_id', user_id_param,
            'profit_loss_amount', profit_loss_amount
        );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_user_game_stats(UUID, DECIMAL) TO authenticated;

-- Test the function with a sample call (commented out for safety)
-- SELECT update_user_game_stats('00000000-0000-0000-0000-000000000000'::UUID, 25.50);

-- Add comment
COMMENT ON FUNCTION update_user_game_stats(UUID, DECIMAL) IS 'Updates user game statistics after completing a poker game';

-- Verify the function was created
SELECT 
    proname as function_name,
    pg_get_function_result(oid) as return_type,
    pg_get_function_arguments(oid) as arguments
FROM pg_proc 
WHERE proname = 'update_user_game_stats';
