-- Fix user stats tracking after game completion
-- This script creates/updates the function to properly track games played and profit/loss

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS update_user_game_stats(UUID, DECIMAL);
DROP FUNCTION IF EXISTS update_user_game_stats(UUID, NUMERIC);

-- Create the corrected function
CREATE OR REPLACE FUNCTION update_user_game_stats(
    user_id_param UUID,
    profit_loss_amount NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
    current_games_played INTEGER;
    current_profit_loss NUMERIC;
    new_games_played INTEGER;
    new_profit_loss NUMERIC;
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
    
    -- Calculate new values
    new_games_played := current_games_played + 1;
    new_profit_loss := current_profit_loss + profit_loss_amount;
    
    -- Update the user's stats
    UPDATE profiles 
    SET 
        games_played = new_games_played,
        all_time_profit_loss = new_profit_loss,
        last_game_date = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = user_id_param;
    
    -- Check if update was successful
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Failed to update user stats for ID: %', user_id_param;
    END IF;
    
    -- Build result JSON
    result := json_build_object(
        'success', true,
        'user_id', user_id_param,
        'profit_loss_added', profit_loss_amount,
        'previous_games_played', current_games_played,
        'new_games_played', new_games_played,
        'previous_profit_loss', current_profit_loss,
        'new_total_profit_loss', new_profit_loss,
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
GRANT EXECUTE ON FUNCTION update_user_game_stats(UUID, NUMERIC) TO authenticated;

-- Add comment
COMMENT ON FUNCTION update_user_game_stats(UUID, NUMERIC) IS 'Updates user game statistics after completing a poker game';

-- Verify the function was created
SELECT 
    proname as function_name,
    pg_get_function_result(oid) as return_type,
    pg_get_function_arguments(oid) as arguments
FROM pg_proc 
WHERE proname = 'update_user_game_stats';

-- Test query to check if profiles table has the required columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'profiles' 
  AND column_name IN ('games_played', 'all_time_profit_loss', 'last_game_date')
ORDER BY column_name;
