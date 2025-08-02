-- Drop existing functions first to avoid conflicts
DROP FUNCTION IF EXISTS update_user_statistics_after_game(UUID, DECIMAL, DECIMAL, INTEGER);
DROP FUNCTION IF EXISTS get_user_statistics(UUID);
DROP FUNCTION IF EXISTS get_statistics_leaderboard(TEXT, INTEGER);
DROP FUNCTION IF EXISTS migrate_profile_stats_to_user_statistics();

-- Create comprehensive user statistics table
CREATE TABLE IF NOT EXISTS user_statistics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Game Statistics
    total_games_played INTEGER DEFAULT 0,
    total_buy_ins DECIMAL(10,2) DEFAULT 0.00,
    total_cash_outs DECIMAL(10,2) DEFAULT 0.00,
    net_profit_loss DECIMAL(10,2) DEFAULT 0.00,
    
    -- Win/Loss Statistics
    biggest_win DECIMAL(10,2) DEFAULT 0.00,
    biggest_loss DECIMAL(10,2) DEFAULT 0.00,
    win_rate DECIMAL(5,2) DEFAULT 0.00, -- Percentage of winning sessions
    roi DECIMAL(5,2) DEFAULT 0.00, -- Return on Investment percentage
    
    -- Session Statistics
    average_session_length_minutes INTEGER DEFAULT 0,
    total_session_time_hours DECIMAL(8,2) DEFAULT 0.00,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one record per user
    UNIQUE(user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_statistics_user_id ON user_statistics(user_id);

-- Create function to update user statistics after game completion
CREATE FUNCTION update_user_statistics_after_game(
    p_user_id UUID,
    p_total_buy_in DECIMAL,
    p_total_cash_out DECIMAL,
    p_session_length_minutes INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_profit_loss DECIMAL;
    v_is_win BOOLEAN;
    v_current_games INTEGER;
    v_current_wins INTEGER;
    v_new_win_rate DECIMAL;
    v_new_roi DECIMAL;
    v_current_biggest_win DECIMAL;
    v_current_biggest_loss DECIMAL;
BEGIN
    -- Calculate profit/loss for this session
    v_profit_loss := p_total_cash_out - p_total_buy_in;
    v_is_win := v_profit_loss > 0;
    
    -- Insert or update user statistics
    INSERT INTO user_statistics (
        user_id,
        total_games_played,
        total_buy_ins,
        total_cash_outs,
        net_profit_loss,
        biggest_win,
        biggest_loss,
        win_rate,
        roi,
        average_session_length_minutes,
        total_session_time_hours,
        updated_at
    ) VALUES (
        p_user_id,
        1,
        p_total_buy_in,
        p_total_cash_out,
        v_profit_loss,
        CASE WHEN v_is_win THEN v_profit_loss ELSE 0 END,
        CASE WHEN NOT v_is_win THEN ABS(v_profit_loss) ELSE 0 END,
        CASE WHEN v_is_win THEN 100.00 ELSE 0.00 END,
        CASE WHEN p_total_buy_in > 0 THEN (v_profit_loss / p_total_buy_in) * 100 ELSE 0 END,
        p_session_length_minutes,
        p_session_length_minutes / 60.0,
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        total_games_played = user_statistics.total_games_played + 1,
        total_buy_ins = user_statistics.total_buy_ins + p_total_buy_in,
        total_cash_outs = user_statistics.total_cash_outs + p_total_cash_out,
        net_profit_loss = user_statistics.net_profit_loss + v_profit_loss,
        biggest_win = GREATEST(user_statistics.biggest_win, CASE WHEN v_is_win THEN v_profit_loss ELSE 0 END),
        biggest_loss = GREATEST(user_statistics.biggest_loss, CASE WHEN NOT v_is_win THEN ABS(v_profit_loss) ELSE 0 END),
        win_rate = (
            SELECT CASE 
                WHEN (user_statistics.total_games_played + 1) = 0 THEN 0
                ELSE (
                    (CASE WHEN user_statistics.win_rate > 0 
                     THEN (user_statistics.win_rate / 100.0) * user_statistics.total_games_played 
                     ELSE 0 END + CASE WHEN v_is_win THEN 1 ELSE 0 END) 
                    / (user_statistics.total_games_played + 1)
                ) * 100
            END
        ),
        roi = CASE 
            WHEN (user_statistics.total_buy_ins + p_total_buy_in) > 0 
            THEN ((user_statistics.net_profit_loss + v_profit_loss) / (user_statistics.total_buy_ins + p_total_buy_in)) * 100
            ELSE 0 
        END,
        average_session_length_minutes = (
            (user_statistics.average_session_length_minutes * user_statistics.total_games_played + p_session_length_minutes) 
            / (user_statistics.total_games_played + 1)
        ),
        total_session_time_hours = user_statistics.total_session_time_hours + (p_session_length_minutes / 60.0),
        updated_at = NOW();
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error updating user statistics for user %: %', p_user_id, SQLERRM;
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Create function to get user statistics with calculated fields
CREATE FUNCTION get_user_statistics(p_user_id UUID)
RETURNS TABLE(
    user_id UUID,
    total_games_played INTEGER,
    total_buy_ins DECIMAL,
    total_cash_outs DECIMAL,
    net_profit_loss DECIMAL,
    biggest_win DECIMAL,
    biggest_loss DECIMAL,
    win_rate DECIMAL,
    roi DECIMAL,
    average_session_length_minutes INTEGER,
    total_session_time_hours DECIMAL,
    profit_per_hour DECIMAL,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        us.user_id,
        us.total_games_played,
        us.total_buy_ins,
        us.total_cash_outs,
        us.net_profit_loss,
        us.biggest_win,
        us.biggest_loss,
        us.win_rate,
        us.roi,
        us.average_session_length_minutes,
        us.total_session_time_hours,
        CASE 
            WHEN us.total_session_time_hours > 0 
            THEN us.net_profit_loss / us.total_session_time_hours
            ELSE 0 
        END as profit_per_hour,
        us.created_at,
        us.updated_at
    FROM user_statistics us
    WHERE us.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to get statistics leaderboard
CREATE FUNCTION get_statistics_leaderboard(
    p_metric TEXT DEFAULT 'net_profit_loss',
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    user_id UUID,
    full_name TEXT,
    email TEXT,
    metric_value DECIMAL,
    total_games_played INTEGER,
    win_rate DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    EXECUTE format('
        SELECT 
            us.user_id,
            p.full_name,
            p.email,
            CASE 
                WHEN %L = ''profit_per_hour'' THEN 
                    CASE WHEN us.total_session_time_hours > 0 
                         THEN us.net_profit_loss / us.total_session_time_hours 
                         ELSE 0 END
                ELSE us.%I
            END as metric_value,
            us.total_games_played,
            us.win_rate
        FROM user_statistics us
        JOIN profiles p ON us.user_id = p.id
        WHERE us.total_games_played > 0
        ORDER BY metric_value DESC
        LIMIT %L
    ', p_metric, p_metric, p_limit);
END;
$$ LANGUAGE plpgsql;

-- Create function to migrate existing profile stats to user_statistics (optional)
CREATE FUNCTION migrate_profile_stats_to_user_statistics()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    profile_record RECORD;
BEGIN
    FOR profile_record IN 
        SELECT id, games_played, all_time_profit_loss 
        FROM profiles 
        WHERE games_played > 0
    LOOP
        INSERT INTO user_statistics (
            user_id,
            total_games_played,
            net_profit_loss,
            created_at,
            updated_at
        ) VALUES (
            profile_record.id,
            profile_record.games_played,
            profile_record.all_time_profit_loss,
            NOW(),
            NOW()
        )
        ON CONFLICT (user_id) DO UPDATE SET
            total_games_played = GREATEST(user_statistics.total_games_played, profile_record.games_played),
            net_profit_loss = profile_record.all_time_profit_loss,
            updated_at = NOW();
        
        v_count := v_count + 1;
    END LOOP;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Test the functions with some sample data (will be skipped if no users exist)
DO $$
DECLARE
    test_user_id UUID;
BEGIN
    -- Get a test user ID (first user in profiles table)
    SELECT id INTO test_user_id FROM profiles LIMIT 1;
    
    IF test_user_id IS NOT NULL THEN
        -- Test the update function
        PERFORM update_user_statistics_after_game(
            test_user_id,
            100.00, -- buy in
            150.00, -- cash out
            120     -- session length in minutes
        );
        
        RAISE NOTICE 'Test completed successfully for user: %', test_user_id;
    ELSE
        RAISE NOTICE 'No users found in profiles table, skipping test';
    END IF;
END $$;

COMMENT ON TABLE user_statistics IS 'Comprehensive poker statistics for users';
COMMENT ON FUNCTION update_user_statistics_after_game IS 'Updates user statistics after a game session completes';
COMMENT ON FUNCTION get_user_statistics IS 'Retrieves user statistics with calculated fields';
COMMENT ON FUNCTION get_statistics_leaderboard IS 'Gets leaderboard for various statistics metrics';
