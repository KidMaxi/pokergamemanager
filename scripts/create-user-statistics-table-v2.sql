-- Create user_statistics table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_statistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    total_games_played INTEGER DEFAULT 0,
    total_buy_ins DECIMAL(10,2) DEFAULT 0.00,
    total_cash_outs DECIMAL(10,2) DEFAULT 0.00,
    net_profit_loss DECIMAL(10,2) DEFAULT 0.00,
    biggest_win DECIMAL(10,2) DEFAULT 0.00,
    biggest_loss DECIMAL(10,2) DEFAULT 0.00,
    win_rate DECIMAL(5,2) DEFAULT 0.00, -- Percentage
    roi DECIMAL(8,4) DEFAULT 0.00, -- Return on Investment as decimal
    average_session_length_minutes INTEGER DEFAULT 0,
    total_session_time_minutes INTEGER DEFAULT 0,
    favorite_buy_in_amount DECIMAL(10,2) DEFAULT 25.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE user_statistics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own statistics" ON user_statistics
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own statistics" ON user_statistics
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own statistics" ON user_statistics
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create function to update user statistics after a game
CREATE OR REPLACE FUNCTION update_user_statistics_after_game(
    p_user_id UUID,
    p_total_buy_in DECIMAL(10,2),
    p_total_cash_out DECIMAL(10,2),
    p_session_length_minutes INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_profit_loss DECIMAL(10,2);
    v_is_win BOOLEAN;
    v_current_stats RECORD;
    v_new_win_rate DECIMAL(5,2);
    v_new_roi DECIMAL(8,4);
BEGIN
    -- Calculate profit/loss for this game
    v_profit_loss := p_total_cash_out - p_total_buy_in;
    v_is_win := v_profit_loss > 0;
    
    -- Get current statistics
    SELECT * INTO v_current_stats 
    FROM user_statistics 
    WHERE user_id = p_user_id;
    
    -- If no record exists, create one
    IF NOT FOUND THEN
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
            total_session_time_minutes,
            favorite_buy_in_amount
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
            p_session_length_minutes,
            p_total_buy_in
        );
        RETURN TRUE;
    END IF;
    
    -- Calculate new win rate
    v_new_win_rate := CASE 
        WHEN (v_current_stats.total_games_played + 1) > 0 THEN
            ((CASE WHEN v_current_stats.win_rate > 0 THEN 
                (v_current_stats.win_rate / 100.0) * v_current_stats.total_games_played 
              ELSE 0 END) + (CASE WHEN v_is_win THEN 1 ELSE 0 END)) 
            / (v_current_stats.total_games_played + 1) * 100
        ELSE 0
    END;
    
    -- Calculate new ROI
    v_new_roi := CASE 
        WHEN (v_current_stats.total_buy_ins + p_total_buy_in) > 0 THEN
            ((v_current_stats.net_profit_loss + v_profit_loss) / (v_current_stats.total_buy_ins + p_total_buy_in)) * 100
        ELSE 0
    END;
    
    -- Update existing record
    UPDATE user_statistics SET
        total_games_played = v_current_stats.total_games_played + 1,
        total_buy_ins = v_current_stats.total_buy_ins + p_total_buy_in,
        total_cash_outs = v_current_stats.total_cash_outs + p_total_cash_out,
        net_profit_loss = v_current_stats.net_profit_loss + v_profit_loss,
        biggest_win = CASE 
            WHEN v_is_win AND v_profit_loss > v_current_stats.biggest_win 
            THEN v_profit_loss 
            ELSE v_current_stats.biggest_win 
        END,
        biggest_loss = CASE 
            WHEN NOT v_is_win AND ABS(v_profit_loss) > v_current_stats.biggest_loss 
            THEN ABS(v_profit_loss) 
            ELSE v_current_stats.biggest_loss 
        END,
        win_rate = v_new_win_rate,
        roi = v_new_roi,
        total_session_time_minutes = v_current_stats.total_session_time_minutes + p_session_length_minutes,
        average_session_length_minutes = (v_current_stats.total_session_time_minutes + p_session_length_minutes) / (v_current_stats.total_games_played + 1),
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error updating user statistics: %', SQLERRM;
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get user statistics with calculated fields
CREATE OR REPLACE FUNCTION get_user_statistics(p_user_id UUID)
RETURNS TABLE (
    user_id UUID,
    total_games_played INTEGER,
    total_buy_ins DECIMAL(10,2),
    total_cash_outs DECIMAL(10,2),
    net_profit_loss DECIMAL(10,2),
    biggest_win DECIMAL(10,2),
    biggest_loss DECIMAL(10,2),
    win_rate DECIMAL(5,2),
    roi DECIMAL(8,4),
    average_session_length_minutes INTEGER,
    total_session_time_minutes INTEGER,
    profit_per_hour DECIMAL(10,2),
    favorite_buy_in_amount DECIMAL(10,2)
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
        us.total_session_time_minutes,
        CASE 
            WHEN us.total_session_time_minutes > 0 THEN 
                (us.net_profit_loss / (us.total_session_time_minutes / 60.0))
            ELSE 0
        END as profit_per_hour,
        us.favorite_buy_in_amount
    FROM user_statistics us
    WHERE us.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to initialize user statistics for existing users
CREATE OR REPLACE FUNCTION initialize_user_statistics()
RETURNS INTEGER AS $$
DECLARE
    v_user_record RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_user_record IN 
        SELECT id FROM profiles 
        WHERE id NOT IN (SELECT user_id FROM user_statistics)
    LOOP
        INSERT INTO user_statistics (user_id) VALUES (v_user_record.id);
        v_count := v_count + 1;
    END LOOP;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Initialize statistics for existing users
SELECT initialize_user_statistics();

-- Create trigger to automatically create user statistics for new users
CREATE OR REPLACE FUNCTION create_user_statistics_on_signup()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_statistics (user_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_statistics ON profiles;
CREATE TRIGGER on_auth_user_created_statistics
    AFTER INSERT ON profiles
    FOR EACH ROW EXECUTE FUNCTION create_user_statistics_on_signup();
