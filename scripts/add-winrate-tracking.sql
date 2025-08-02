-- Add winrate tracking columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS total_wins INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS win_ratio DECIMAL(5,2) DEFAULT 0.00;

-- Create index for better performance on win_ratio queries
CREATE INDEX IF NOT EXISTS idx_profiles_win_ratio ON profiles(win_ratio DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_total_wins ON profiles(total_wins DESC);

-- Update the existing update_user_game_stats function to include winrate tracking
CREATE OR REPLACE FUNCTION update_user_game_stats(
    user_id_param UUID,
    profit_loss_amount DECIMAL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    current_games_played INTEGER;
    current_total_wins INTEGER;
    new_win_ratio DECIMAL(5,2);
    is_winning_game BOOLEAN;
BEGIN
    -- Determine if this is a winning game (profit > 0)
    is_winning_game := profit_loss_amount > 0;
    
    -- Log the game result
    RAISE NOTICE 'Processing game for user %: P/L = %, Win = %', 
        user_id_param, profit_loss_amount, is_winning_game;
    
    -- Update the user's statistics
    UPDATE profiles 
    SET 
        all_time_profit_loss = COALESCE(all_time_profit_loss, 0) + profit_loss_amount,
        games_played = COALESCE(games_played, 0) + 1,
        total_wins = CASE 
            WHEN is_winning_game THEN COALESCE(total_wins, 0) + 1 
            ELSE COALESCE(total_wins, 0)
        END,
        updated_at = NOW()
    WHERE id = user_id_param;
    
    -- Get the updated values to calculate win ratio
    SELECT games_played, total_wins 
    INTO current_games_played, current_total_wins
    FROM profiles 
    WHERE id = user_id_param;
    
    -- Calculate win ratio (avoid division by zero)
    IF current_games_played > 0 THEN
        new_win_ratio := ROUND((current_total_wins::DECIMAL / current_games_played::DECIMAL) * 100, 2);
    ELSE
        new_win_ratio := 0.00;
    END IF;
    
    -- Update the win ratio
    UPDATE profiles 
    SET win_ratio = new_win_ratio
    WHERE id = user_id_param;
    
    RAISE NOTICE 'Updated stats for user %: Games=%, Wins=%, Win Ratio=%', 
        user_id_param, current_games_played, current_total_wins, new_win_ratio;
    
    -- Return the updated statistics
    RETURN json_build_object(
        'success', true,
        'games_played', current_games_played,
        'total_wins', current_total_wins,
        'win_ratio', new_win_ratio,
        'profit_loss', profit_loss_amount,
        'is_win', is_winning_game
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error updating user stats: %', SQLERRM;
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- Create a view for easy querying of user stats with winrate
CREATE OR REPLACE VIEW user_stats_with_winrate AS
SELECT 
    id,
    full_name,
    email,
    games_played,
    total_wins,
    (games_played - COALESCE(total_wins, 0)) as total_losses,
    win_ratio,
    all_time_profit_loss,
    CASE 
        WHEN games_played > 0 THEN ROUND(all_time_profit_loss / games_played, 2)
        ELSE 0
    END as avg_profit_per_game,
    created_at,
    updated_at
FROM profiles
WHERE games_played > 0
ORDER BY win_ratio DESC, all_time_profit_loss DESC;

-- Function to recalculate all win ratios (for data migration)
CREATE OR REPLACE FUNCTION recalculate_all_win_ratios()
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    user_record RECORD;
    updated_count INTEGER := 0;
    new_win_ratio DECIMAL(5,2);
BEGIN
    -- Loop through all users with games played
    FOR user_record IN 
        SELECT id, games_played, total_wins 
        FROM profiles 
        WHERE games_played > 0
    LOOP
        -- Calculate win ratio
        IF user_record.games_played > 0 THEN
            new_win_ratio := ROUND((COALESCE(user_record.total_wins, 0)::DECIMAL / user_record.games_played::DECIMAL) * 100, 2);
        ELSE
            new_win_ratio := 0.00;
        END IF;
        
        -- Update the win ratio
        UPDATE profiles 
        SET win_ratio = new_win_ratio
        WHERE id = user_record.id;
        
        updated_count := updated_count + 1;
        
        RAISE NOTICE 'Updated user %: Games=%, Wins=%, Win Ratio=%', 
            user_record.id, user_record.games_played, user_record.total_wins, new_win_ratio;
    END LOOP;
    
    RETURN json_build_object(
        'success', true,
        'updated_count', updated_count
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- Grant necessary permissions
GRANT SELECT ON user_stats_with_winrate TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_game_stats(UUID, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_all_win_ratios() TO authenticated;

-- Add some helpful comments
COMMENT ON COLUMN profiles.total_wins IS 'Number of games where profit_loss > 0';
COMMENT ON COLUMN profiles.win_ratio IS 'Percentage of games won (total_wins / games_played * 100)';
COMMENT ON VIEW user_stats_with_winrate IS 'Comprehensive view of user poker statistics including winrate';
