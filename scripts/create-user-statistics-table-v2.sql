-- Drop the table if it exists to start fresh
DROP TABLE IF EXISTS public.user_statistics CASCADE;

-- Create the user_statistics table with proper structure
CREATE TABLE public.user_statistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    total_games_played INTEGER DEFAULT 0,
    total_buy_ins DECIMAL(10,2) DEFAULT 0.00,
    total_cash_outs DECIMAL(10,2) DEFAULT 0.00,
    net_profit_loss DECIMAL(10,2) DEFAULT 0.00,
    biggest_win DECIMAL(10,2) DEFAULT 0.00,
    biggest_loss DECIMAL(10,2) DEFAULT 0.00,
    win_rate DECIMAL(5,2) DEFAULT 0.00, -- Percentage (0-100)
    roi DECIMAL(8,4) DEFAULT 0.00, -- Return on Investment as percentage
    average_session_length_minutes INTEGER DEFAULT 0,
    total_session_time_hours INTEGER DEFAULT 0, -- Changed from minutes to hours, rounded up
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create indexes for better performance
CREATE INDEX idx_user_statistics_user_id ON public.user_statistics(user_id);
CREATE INDEX idx_user_statistics_net_profit_loss ON public.user_statistics(net_profit_loss);
CREATE INDEX idx_user_statistics_total_games_played ON public.user_statistics(total_games_played);

-- Enable RLS
ALTER TABLE public.user_statistics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own statistics" ON public.user_statistics
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own statistics" ON public.user_statistics
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own statistics" ON public.user_statistics
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Foolproof function to update user statistics after a game
CREATE OR REPLACE FUNCTION public.update_user_statistics_after_game(
    p_user_id UUID,
    p_total_buy_in DECIMAL(10,2),
    p_total_cash_out DECIMAL(10,2),
    p_session_length_minutes INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_profit_loss DECIMAL(10,2);
    v_is_win BOOLEAN;
    v_is_loss BOOLEAN;
    v_is_break_even BOOLEAN;
    v_current_stats RECORD;
    v_new_win_rate DECIMAL(5,2);
    v_new_roi DECIMAL(8,4);
    v_session_hours INTEGER;
    v_winning_sessions INTEGER;
    v_total_new_games INTEGER;
BEGIN
    -- Input validation
    IF p_user_id IS NULL OR p_total_buy_in < 0 OR p_total_cash_out < 0 OR p_session_length_minutes < 0 THEN
        RAISE LOG 'Invalid input parameters for user statistics update';
        RETURN FALSE;
    END IF;
    
    -- Calculate profit/loss for this game
    v_profit_loss := p_total_cash_out - p_total_buy_in;
    
    -- Determine session outcome (foolproof logic)
    v_is_win := v_profit_loss > 0;
    v_is_loss := v_profit_loss < 0;
    v_is_break_even := v_profit_loss = 0;
    
    -- Convert session minutes to hours (rounded up)
    v_session_hours := CASE 
        WHEN p_session_length_minutes = 0 THEN 0
        ELSE CEIL(p_session_length_minutes / 60.0)
    END;
    
    -- Get current statistics
    SELECT * INTO v_current_stats 
    FROM public.user_statistics 
    WHERE user_id = p_user_id;
    
    -- If no record exists, create one
    IF NOT FOUND THEN
        INSERT INTO public.user_statistics (
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
            total_session_time_hours
        ) VALUES (
            p_user_id,
            1,
            p_total_buy_in,
            p_total_cash_out,
            v_profit_loss,
            CASE WHEN v_is_win THEN v_profit_loss ELSE 0.00 END,
            CASE WHEN v_is_loss THEN ABS(v_profit_loss) ELSE 0.00 END,
            -- Win rate calculation: wins only count as wins, break-even is not a win
            CASE WHEN v_is_win THEN 100.00 ELSE 0.00 END,
            -- ROI calculation: handle break-even and zero buy-in cases
            CASE 
                WHEN p_total_buy_in > 0 THEN (v_profit_loss / p_total_buy_in) * 100 
                ELSE 0.00 
            END,
            p_session_length_minutes,
            v_session_hours
        );
        RETURN TRUE;
    END IF;
    
    -- Calculate new totals
    v_total_new_games := v_current_stats.total_games_played + 1;
    
    -- Calculate winning sessions (only actual wins, not break-even)
    v_winning_sessions := CASE 
        WHEN v_current_stats.win_rate > 0 THEN
            FLOOR((v_current_stats.win_rate / 100.0) * v_current_stats.total_games_played)
        ELSE 0
    END;
    
    -- Add current session to winning sessions if it's a win
    IF v_is_win THEN
        v_winning_sessions := v_winning_sessions + 1;
    END IF;
    
    -- Calculate new win rate (foolproof)
    v_new_win_rate := CASE 
        WHEN v_total_new_games > 0 THEN
            (v_winning_sessions::DECIMAL / v_total_new_games) * 100.0
        ELSE 0.00
    END;
    
    -- Calculate new ROI (foolproof - handles break-even and zero investment)
    v_new_roi := CASE 
        WHEN (v_current_stats.total_buy_ins + p_total_buy_in) > 0 THEN
            ((v_current_stats.net_profit_loss + v_profit_loss) / (v_current_stats.total_buy_ins + p_total_buy_in)) * 100.0
        ELSE 0.00
    END;
    
    -- Update existing record with foolproof calculations
    UPDATE public.user_statistics SET
        total_games_played = v_total_new_games,
        total_buy_ins = v_current_stats.total_buy_ins + p_total_buy_in,
        total_cash_outs = v_current_stats.total_cash_outs + p_total_cash_out,
        net_profit_loss = v_current_stats.net_profit_loss + v_profit_loss,
        biggest_win = CASE 
            WHEN v_is_win AND v_profit_loss > v_current_stats.biggest_win 
            THEN v_profit_loss 
            ELSE v_current_stats.biggest_win 
        END,
        biggest_loss = CASE 
            WHEN v_is_loss AND ABS(v_profit_loss) > v_current_stats.biggest_loss 
            THEN ABS(v_profit_loss) 
            ELSE v_current_stats.biggest_loss 
        END,
        win_rate = v_new_win_rate,
        roi = v_new_roi,
        total_session_time_hours = v_current_stats.total_session_time_hours + v_session_hours,
        average_session_length_minutes = CASE 
            WHEN v_total_new_games > 0 THEN
                ((v_current_stats.average_session_length_minutes * v_current_stats.total_games_played) + p_session_length_minutes) / v_total_new_games
            ELSE p_session_length_minutes
        END,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error updating user statistics for user %: %', p_user_id, SQLERRM;
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user statistics with calculated fields
CREATE OR REPLACE FUNCTION public.get_user_statistics(p_user_id UUID)
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
    total_session_time_hours INTEGER,
    profit_per_hour DECIMAL(10,2),
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
            WHEN us.total_session_time_hours > 0 THEN 
                us.net_profit_loss / us.total_session_time_hours
            ELSE 0.00
        END as profit_per_hour,
        us.created_at,
        us.updated_at
    FROM public.user_statistics us
    WHERE us.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get leaderboard statistics
CREATE OR REPLACE FUNCTION public.get_statistics_leaderboard(
    p_metric TEXT DEFAULT 'net_profit_loss',
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    user_id UUID,
    full_name TEXT,
    email TEXT,
    metric_value DECIMAL(10,2),
    total_games_played INTEGER,
    win_rate DECIMAL(5,2)
) AS $$
BEGIN
    IF p_metric = 'net_profit_loss' THEN
        RETURN QUERY
        SELECT 
            us.user_id,
            p.full_name,
            p.email,
            us.net_profit_loss AS metric_value,
            us.total_games_played,
            us.win_rate
        FROM public.user_statistics us
        JOIN public.profiles p ON us.user_id = p.id
        WHERE us.total_games_played > 0
        ORDER BY us.net_profit_loss DESC
        LIMIT p_limit;
    ELSIF p_metric = 'win_rate' THEN
        RETURN QUERY
        SELECT 
            us.user_id,
            p.full_name,
            p.email,
            us.win_rate AS metric_value,
            us.total_games_played,
            us.win_rate
        FROM public.user_statistics us
        JOIN public.profiles p ON us.user_id = p.id
        WHERE us.total_games_played >= 5 -- Minimum games for meaningful win rate
        ORDER BY us.win_rate DESC
        LIMIT p_limit;
    ELSIF p_metric = 'roi' THEN
        RETURN QUERY
        SELECT 
            us.user_id,
            p.full_name,
            p.email,
            us.roi AS metric_value,
            us.total_games_played,
            us.win_rate
        FROM public.user_statistics us
        JOIN public.profiles p ON us.user_id = p.id
        WHERE us.total_games_played >= 3 AND us.total_buy_ins > 0
        ORDER BY us.roi DESC
        LIMIT p_limit;
    ELSE
        -- Default to total games played
        RETURN QUERY
        SELECT 
            us.user_id,
            p.full_name,
            p.email,
            us.total_games_played::DECIMAL(10,2) AS metric_value,
            us.total_games_played,
            us.win_rate
        FROM public.user_statistics us
        JOIN public.profiles p ON us.user_id = p.id
        WHERE us.total_games_played > 0
        ORDER BY us.total_games_played DESC
        LIMIT p_limit;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to initialize user statistics for existing users
CREATE OR REPLACE FUNCTION public.initialize_user_statistics()
RETURNS INTEGER AS $$
DECLARE
    v_user_record RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_user_record IN 
        SELECT id FROM public.profiles 
        WHERE id NOT IN (SELECT user_id FROM public.user_statistics)
    LOOP
        INSERT INTO public.user_statistics (user_id) VALUES (v_user_record.id);
        v_count := v_count + 1;
    END LOOP;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Initialize statistics for existing users
SELECT public.initialize_user_statistics();

-- Create trigger to automatically create user statistics for new users
CREATE OR REPLACE FUNCTION public.create_user_statistics_on_signup()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_statistics (user_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_statistics ON public.profiles;
CREATE TRIGGER on_auth_user_created_statistics
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.create_user_statistics_on_signup();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.update_user_statistics_after_game(UUID, DECIMAL, DECIMAL, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_statistics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_statistics_leaderboard(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_user_statistics() TO authenticated;
