-- First, let's check if the user_statistics table exists and create/modify it as needed
CREATE TABLE IF NOT EXISTS public.user_statistics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    total_games_played INTEGER DEFAULT 0,
    total_buy_ins DECIMAL(10,2) DEFAULT 0.00,
    total_cash_outs DECIMAL(10,2) DEFAULT 0.00,
    net_profit_loss DECIMAL(10,2) DEFAULT 0.00,
    biggest_win DECIMAL(10,2) DEFAULT 0.00,
    biggest_loss DECIMAL(10,2) DEFAULT 0.00,
    average_session_length_minutes INTEGER DEFAULT 0,
    favorite_buy_in_amount DECIMAL(10,2) DEFAULT 0.00,
    total_session_time_minutes INTEGER DEFAULT 0,
    win_rate DECIMAL(5,2) DEFAULT 0.00, -- Percentage of winning sessions
    roi DECIMAL(5,2) DEFAULT 0.00, -- Return on investment percentage
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_statistics_user_id ON public.user_statistics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_statistics_net_profit_loss ON public.user_statistics(net_profit_loss);
CREATE INDEX IF NOT EXISTS idx_user_statistics_total_games_played ON public.user_statistics(total_games_played);

-- Enable RLS
ALTER TABLE public.user_statistics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own statistics" ON public.user_statistics
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own statistics" ON public.user_statistics
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own statistics" ON public.user_statistics
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Function to initialize user statistics when a user is created
CREATE OR REPLACE FUNCTION public.initialize_user_statistics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.user_statistics (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- Create trigger to automatically initialize statistics for new users
DROP TRIGGER IF EXISTS trigger_initialize_user_statistics ON public.profiles;
CREATE TRIGGER trigger_initialize_user_statistics
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.initialize_user_statistics();

-- Function to update user statistics after a game completion
CREATE OR REPLACE FUNCTION public.update_user_statistics_after_game(
    p_user_id UUID,
    p_total_buy_in DECIMAL(10,2),
    p_cash_out_amount DECIMAL(10,2),
    p_session_length_minutes INTEGER DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profit_loss DECIMAL(10,2);
    v_is_winning_session BOOLEAN;
    v_current_stats RECORD;
    v_new_win_rate DECIMAL(5,2);
    v_new_roi DECIMAL(5,2);
BEGIN
    -- Calculate profit/loss for this session
    v_profit_loss := p_cash_out_amount - p_total_buy_in;
    v_is_winning_session := v_profit_loss > 0;
    
    -- Get current statistics
    SELECT * INTO v_current_stats 
    FROM public.user_statistics 
    WHERE user_id = p_user_id;
    
    -- If no statistics record exists, create one
    IF v_current_stats IS NULL THEN
        INSERT INTO public.user_statistics (user_id) VALUES (p_user_id);
        SELECT * INTO v_current_stats 
        FROM public.user_statistics 
        WHERE user_id = p_user_id;
    END IF;
    
    -- Calculate new win rate
    IF v_is_winning_session THEN
        v_new_win_rate := ((v_current_stats.win_rate * v_current_stats.total_games_played / 100.0) + 1) 
                         / (v_current_stats.total_games_played + 1) * 100.0;
    ELSE
        v_new_win_rate := (v_current_stats.win_rate * v_current_stats.total_games_played / 100.0) 
                         / (v_current_stats.total_games_played + 1) * 100.0;
    END IF;
    
    -- Calculate new ROI
    IF (v_current_stats.total_buy_ins + p_total_buy_in) > 0 THEN
        v_new_roi := (v_current_stats.net_profit_loss + v_profit_loss) 
                    / (v_current_stats.total_buy_ins + p_total_buy_in) * 100.0;
    ELSE
        v_new_roi := 0.00;
    END IF;
    
    -- Update statistics
    UPDATE public.user_statistics
    SET 
        total_games_played = total_games_played + 1,
        total_buy_ins = total_buy_ins + p_total_buy_in,
        total_cash_outs = total_cash_outs + p_cash_out_amount,
        net_profit_loss = net_profit_loss + v_profit_loss,
        biggest_win = CASE 
            WHEN v_profit_loss > biggest_win THEN v_profit_loss 
            ELSE biggest_win 
        END,
        biggest_loss = CASE 
            WHEN v_profit_loss < biggest_loss THEN v_profit_loss 
            ELSE biggest_loss 
        END,
        total_session_time_minutes = total_session_time_minutes + COALESCE(p_session_length_minutes, 0),
        average_session_length_minutes = CASE 
            WHEN total_games_played + 1 > 0 THEN 
                (total_session_time_minutes + COALESCE(p_session_length_minutes, 0)) / (total_games_played + 1)
            ELSE 0 
        END,
        win_rate = v_new_win_rate,
        roi = v_new_roi,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- Update the most common buy-in amount (favorite_buy_in_amount)
    -- This is a simple approach - we could make it more sophisticated later
    UPDATE public.user_statistics
    SET favorite_buy_in_amount = (
        SELECT mode() WITHIN GROUP (ORDER BY p_total_buy_in)
        FROM (
            SELECT p_total_buy_in
            UNION ALL
            SELECT favorite_buy_in_amount FROM public.user_statistics WHERE user_id = p_user_id
        ) AS buy_ins
    )
    WHERE user_id = p_user_id;
    
END;
$$;

-- Function to get comprehensive user statistics
CREATE OR REPLACE FUNCTION public.get_user_statistics(p_user_id UUID)
RETURNS TABLE (
    user_id UUID,
    total_games_played INTEGER,
    total_buy_ins DECIMAL(10,2),
    total_cash_outs DECIMAL(10,2),
    net_profit_loss DECIMAL(10,2),
    biggest_win DECIMAL(10,2),
    biggest_loss DECIMAL(10,2),
    average_session_length_minutes INTEGER,
    favorite_buy_in_amount DECIMAL(10,2),
    total_session_time_minutes INTEGER,
    win_rate DECIMAL(5,2),
    roi DECIMAL(5,2),
    profit_per_hour DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
        us.average_session_length_minutes,
        us.favorite_buy_in_amount,
        us.total_session_time_minutes,
        us.win_rate,
        us.roi,
        CASE 
            WHEN us.total_session_time_minutes > 0 THEN 
                (us.net_profit_loss / (us.total_session_time_minutes / 60.0))
            ELSE 0.00 
        END AS profit_per_hour,
        us.created_at,
        us.updated_at
    FROM public.user_statistics us
    WHERE us.user_id = p_user_id;
END;
$$;

-- Function to get leaderboard statistics (top performers)
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
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- Function to migrate existing profile statistics to user_statistics table
CREATE OR REPLACE FUNCTION public.migrate_profile_stats_to_user_statistics()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_migrated_count INTEGER := 0;
    v_profile RECORD;
BEGIN
    -- Loop through all profiles that have statistics but no user_statistics record
    FOR v_profile IN 
        SELECT p.id, p.all_time_profit_loss, p.games_played
        FROM public.profiles p
        LEFT JOIN public.user_statistics us ON p.id = us.user_id
        WHERE us.user_id IS NULL 
        AND (p.all_time_profit_loss != 0 OR p.games_played > 0)
    LOOP
        -- Insert basic statistics from profile
        INSERT INTO public.user_statistics (
            user_id,
            total_games_played,
            net_profit_loss
        ) VALUES (
            v_profile.id,
            COALESCE(v_profile.games_played, 0),
            COALESCE(v_profile.all_time_profit_loss, 0.00)
        );
        
        v_migrated_count := v_migrated_count + 1;
    END LOOP;
    
    RETURN v_migrated_count;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.update_user_statistics_after_game(UUID, DECIMAL, DECIMAL, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_statistics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_statistics_leaderboard(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_profile_stats_to_user_statistics() TO authenticated;

-- Initialize statistics for existing users
SELECT public.migrate_profile_stats_to_user_statistics();
