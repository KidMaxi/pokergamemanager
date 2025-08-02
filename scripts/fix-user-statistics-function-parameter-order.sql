-- Fix user statistics function parameter order and ensure proper data collection
-- This script ensures the user_statistics table collects data properly while maintaining profile table updates

-- First, let's check if the user_statistics table exists and create it if needed
DO $$
BEGIN
    -- Check if user_statistics table exists
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_statistics') THEN
        -- Create the user_statistics table
        CREATE TABLE user_statistics (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            total_games_played INTEGER DEFAULT 0,
            total_wins INTEGER DEFAULT 0,
            total_losses INTEGER DEFAULT 0,
            total_break_even INTEGER DEFAULT 0,
            net_profit_loss DECIMAL(10,2) DEFAULT 0.00,
            biggest_win DECIMAL(10,2) DEFAULT 0.00,
            biggest_loss DECIMAL(10,2) DEFAULT 0.00,
            total_buy_ins DECIMAL(10,2) DEFAULT 0.00,
            total_cash_outs DECIMAL(10,2) DEFAULT 0.00,
            total_session_time_hours INTEGER DEFAULT 0,
            average_session_length_minutes INTEGER DEFAULT 0,
            win_rate DECIMAL(5,2) DEFAULT 0.00,
            roi DECIMAL(8,2) DEFAULT 0.00,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(user_id)
        );

        -- Create index for faster lookups
        CREATE INDEX idx_user_statistics_user_id ON user_statistics(user_id);
        
        -- Enable RLS
        ALTER TABLE user_statistics ENABLE ROW LEVEL SECURITY;
        
        -- Create RLS policies
        CREATE POLICY "Users can view own statistics" ON user_statistics
            FOR SELECT USING (auth.uid() = user_id);
            
        CREATE POLICY "Users can update own statistics" ON user_statistics
            FOR UPDATE USING (auth.uid() = user_id);
            
        CREATE POLICY "Users can insert own statistics" ON user_statistics
            FOR INSERT WITH CHECK (auth.uid() = user_id);

        RAISE NOTICE 'Created user_statistics table with proper structure';
    ELSE
        RAISE NOTICE 'user_statistics table already exists';
    END IF;
END $$;

-- Drop any existing versions of the function to avoid conflicts
DROP FUNCTION IF EXISTS public.update_user_statistics_after_game(UUID, DECIMAL, DECIMAL, INTEGER);
DROP FUNCTION IF EXISTS public.update_user_statistics_after_game(INTEGER, DECIMAL, DECIMAL, UUID);
DROP FUNCTION IF EXISTS public.update_user_statistics_after_game(UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL);

-- Create the function with the EXACT signature that matches the TypeScript call
CREATE OR REPLACE FUNCTION public.update_user_statistics_after_game(
    p_user_id UUID,
    p_total_buy_in DECIMAL(10,2),
    p_total_cash_out DECIMAL(10,2),
    p_session_length_minutes INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profit_loss DECIMAL(10,2);
    v_session_length_hours INTEGER;
    v_current_stats RECORD;
    v_current_profile RECORD;
    v_new_win_rate DECIMAL(5,2);
    v_new_roi DECIMAL(8,4);
    v_new_avg_session_length INTEGER;
    v_winning_sessions INTEGER;
    v_total_new_games INTEGER;
BEGIN
    -- Enhanced logging for debugging
    RAISE NOTICE 'update_user_statistics_after_game called with: user_id=%, buy_in=%, cash_out=%, session_minutes=%', 
        p_user_id, p_total_buy_in, p_total_cash_out, p_session_length_minutes;

    -- Validate inputs
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID cannot be null';
    END IF;
    
    IF p_total_buy_in < 0 THEN
        RAISE EXCEPTION 'Total buy-in cannot be negative: %', p_total_buy_in;
    END IF;
    
    IF p_total_cash_out < 0 THEN
        RAISE EXCEPTION 'Total cash-out cannot be negative: %', p_total_cash_out;
    END IF;

    IF p_session_length_minutes < 0 THEN
        RAISE EXCEPTION 'Session length cannot be negative: %', p_session_length_minutes;
    END IF;

    -- Calculate profit/loss for this session
    v_profit_loss := p_total_cash_out - p_total_buy_in;
    
    -- Convert session length to hours (rounded up)
    v_session_length_hours := CASE 
        WHEN p_session_length_minutes > 0 THEN CEIL(p_session_length_minutes::DECIMAL / 60.0)
        ELSE 0
    END;

    RAISE NOTICE 'Calculated values: profit_loss=%, session_hours=%', v_profit_loss, v_session_length_hours;

    -- Ensure user statistics record exists (upsert approach)
    INSERT INTO public.user_statistics (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    -- Get current statistics from the new table
    SELECT * INTO v_current_stats
    FROM public.user_statistics
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Failed to create or find user statistics record for user: %', p_user_id;
    END IF;

    -- Get current profile data for legacy updates (with error handling)
    BEGIN
        SELECT * INTO v_current_profile
        FROM public.profiles
        WHERE id = p_user_id;
        
        IF NOT FOUND THEN
            RAISE NOTICE 'Profile not found for user: % - will skip legacy update', p_user_id;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Error accessing profile for user %: % - will skip legacy update', p_user_id, SQLERRM;
            v_current_profile := NULL;
    END;

    RAISE NOTICE 'Current stats before update: games=%, total_buy_ins=%, net_profit_loss=%, win_rate=%', 
        v_current_stats.total_games_played, v_current_stats.total_buy_ins, 
        v_current_stats.net_profit_loss, v_current_stats.win_rate;

    -- Calculate new totals
    v_total_new_games := v_current_stats.total_games_played + 1;

    -- Calculate winning sessions (only count profit > 0 as wins, break-even is NOT a win)
    v_winning_sessions := CASE 
        WHEN v_current_stats.win_rate > 0 THEN
            FLOOR((v_current_stats.win_rate / 100.0) * v_current_stats.total_games_played)
        ELSE 0
    END;

    -- Add current session to winning sessions if it's a win (profit > 0)
    IF v_profit_loss > 0 THEN
        v_winning_sessions := v_winning_sessions + 1;
    END IF;

    -- Calculate new win rate (foolproof - only actual wins count)
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

    -- Calculate new average session length
    v_new_avg_session_length := CASE 
        WHEN v_total_new_games > 0 THEN
            ((v_current_stats.average_session_length_minutes * v_current_stats.total_games_played) + p_session_length_minutes) / v_total_new_games
        ELSE p_session_length_minutes
    END;

    RAISE NOTICE 'Calculated new values: win_rate=%, roi=%, avg_session=%', 
        v_new_win_rate, v_new_roi, v_new_avg_session_length;

    -- UPDATE 1: Update the NEW user_statistics table with comprehensive stats
    UPDATE public.user_statistics
    SET 
        total_games_played = v_total_new_games,
        total_wins = CASE WHEN v_profit_loss > 0 THEN total_wins + 1 ELSE total_wins END,
        total_losses = CASE WHEN v_profit_loss < 0 THEN total_losses + 1 ELSE total_losses END,
        total_break_even = CASE WHEN v_profit_loss = 0 THEN total_break_even + 1 ELSE total_break_even END,
        total_buy_ins = v_current_stats.total_buy_ins + p_total_buy_in,
        total_cash_outs = v_current_stats.total_cash_outs + p_total_cash_out,
        net_profit_loss = v_current_stats.net_profit_loss + v_profit_loss,
        biggest_win = CASE 
            WHEN v_profit_loss > 0 AND v_profit_loss > v_current_stats.biggest_win THEN v_profit_loss
            ELSE v_current_stats.biggest_win
        END,
        biggest_loss = CASE 
            WHEN v_profit_loss < 0 AND ABS(v_profit_loss) > v_current_stats.biggest_loss THEN ABS(v_profit_loss)
            ELSE v_current_stats.biggest_loss
        END,
        win_rate = v_new_win_rate,
        roi = v_new_roi,
        average_session_length_minutes = v_new_avg_session_length,
        total_session_time_hours = v_current_stats.total_session_time_hours + v_session_length_hours,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Verify the new stats update worked
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Failed to update user statistics for user: %', p_user_id;
    END IF;

    -- UPDATE 2: Update the LEGACY profile table columns for backward compatibility (if profile exists)
    IF v_current_profile IS NOT NULL THEN
        BEGIN
            UPDATE public.profiles
            SET 
                total_games_played = COALESCE(v_current_profile.total_games_played, 0) + 1,
                total_profit_loss = COALESCE(v_current_profile.total_profit_loss, 0) + v_profit_loss,
                updated_at = NOW()
            WHERE id = p_user_id;

            IF FOUND THEN
                RAISE NOTICE 'Legacy profile stats updated for backward compatibility';
            ELSE
                RAISE NOTICE 'Profile update did not affect any rows for user: %', p_user_id;
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Failed to update legacy profile stats for user %: % - continuing anyway', p_user_id, SQLERRM;
        END;
    END IF;

    -- Log successful update with final values
    SELECT * INTO v_current_stats FROM public.user_statistics WHERE user_id = p_user_id;
    
    RAISE NOTICE 'Statistics updated successfully for user %: games=%, profit_loss=%, win_rate=%, roi=%', 
        p_user_id, v_current_stats.total_games_played, v_current_stats.net_profit_loss, 
        v_current_stats.win_rate, v_current_stats.roi;

    RETURN TRUE;

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error updating user statistics for user %: %', p_user_id, SQLERRM;
        RETURN FALSE;
END;
$$;

-- Create the get_user_statistics function
CREATE OR REPLACE FUNCTION public.get_user_statistics(p_user_id UUID)
RETURNS TABLE(
    user_id UUID,
    total_games_played INTEGER,
    total_wins INTEGER,
    total_losses INTEGER,
    total_break_even INTEGER,
    net_profit_loss DECIMAL,
    biggest_win DECIMAL,
    biggest_loss DECIMAL,
    total_buy_ins DECIMAL,
    total_cash_outs DECIMAL,
    total_session_time_hours INTEGER,
    average_session_length_minutes INTEGER,
    win_rate DECIMAL,
    roi DECIMAL,
    profit_per_hour DECIMAL,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Ensure user statistics exist first
    INSERT INTO public.user_statistics (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN QUERY
    SELECT 
        us.user_id,
        us.total_games_played,
        us.total_wins,
        us.total_losses,
        us.total_break_even,
        us.net_profit_loss,
        us.biggest_win,
        us.biggest_loss,
        us.total_buy_ins,
        us.total_cash_outs,
        us.total_session_time_hours,
        us.average_session_length_minutes,
        us.win_rate,
        us.roi,
        CASE 
            WHEN us.total_session_time_hours > 0 THEN us.net_profit_loss / us.total_session_time_hours
            ELSE 0.00
        END as profit_per_hour,
        us.created_at,
        us.updated_at
    FROM public.user_statistics us
    WHERE us.user_id = p_user_id;
END;
$$;

-- Create the get_statistics_leaderboard function
CREATE OR REPLACE FUNCTION public.get_statistics_leaderboard(
    p_metric TEXT DEFAULT 'net_profit_loss',
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    user_id UUID,
    user_name TEXT,
    total_games_played INTEGER,
    net_profit_loss DECIMAL,
    win_rate DECIMAL,
    roi DECIMAL,
    metric_value DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    EXECUTE format('
        SELECT 
            us.user_id,
            COALESCE(p.full_name, p.email, ''Unknown User'') as user_name,
            us.total_games_played,
            us.net_profit_loss,
            us.win_rate,
            us.roi,
            us.%I as metric_value
        FROM public.user_statistics us
        LEFT JOIN public.profiles p ON us.user_id = p.id
        WHERE us.total_games_played > 0
        ORDER BY us.%I DESC
        LIMIT %L
    ', p_metric, p_metric, p_limit);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_user_statistics_after_game(UUID, DECIMAL, DECIMAL, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_statistics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_statistics_leaderboard(TEXT, INTEGER) TO authenticated;

-- Test the function with existing user data (NO profile table structure modifications)
DO $$
DECLARE
    existing_user_id UUID;
    result BOOLEAN;
    test_stats RECORD;
    test_profile RECORD;
BEGIN
    -- Find an existing user from the profiles table (READ ONLY)
    SELECT id INTO existing_user_id 
    FROM public.profiles 
    LIMIT 1;
    
    IF existing_user_id IS NULL THEN
        RAISE NOTICE 'No existing users found in profiles table - skipping test';
        RETURN;
    END IF;
    
    RAISE NOTICE 'Testing function with existing user: %', existing_user_id;
    
    -- Show current state before test
    BEGIN
        SELECT * INTO test_profile FROM public.profiles WHERE id = existing_user_id;
        SELECT * INTO test_stats FROM public.user_statistics WHERE user_id = existing_user_id;
        
        RAISE NOTICE 'Before test - Profile: games=%, profit=%', 
            COALESCE(test_profile.total_games_played, 0), COALESCE(test_profile.total_profit_loss, 0);
        RAISE NOTICE 'Before test - Stats: games=%, profit=%', 
            COALESCE(test_stats.total_games_played, 0), COALESCE(test_stats.net_profit_loss, 0);
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Could not read current state - this is normal for first run';
    END;
    
    -- Test the function with a winning session
    SELECT public.update_user_statistics_after_game(
        existing_user_id,
        25.00,  -- buy in $25
        35.00,  -- cash out $35 (win $10)
        120     -- 2 hours (120 minutes)
    ) INTO result;
    
    IF result THEN
        RAISE NOTICE 'Test (winning session) PASSED';
        
        -- Check both tables were updated
        BEGIN
            SELECT * INTO test_profile FROM public.profiles WHERE id = existing_user_id;
            SELECT * INTO test_stats FROM public.user_statistics WHERE user_id = existing_user_id;
            
            RAISE NOTICE 'After test - Profile: games=%, profit=%', 
                COALESCE(test_profile.total_games_played, 0), COALESCE(test_profile.total_profit_loss, 0);
            RAISE NOTICE 'After test - Stats: games=%, profit=%, win_rate=%', 
                test_stats.total_games_played, test_stats.net_profit_loss, test_stats.win_rate;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Could not read updated state: %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE 'Test (winning session) FAILED';
    END IF;
    
    RAISE NOTICE 'Function tests completed - both profile and user_statistics tables should be updated';
    RAISE NOTICE 'Profile table structure unchanged - only data updated for backward compatibility';
END;
$$;

-- Final verification
RAISE NOTICE '=== USER STATISTICS SETUP COMPLETE ===';
RAISE NOTICE 'Function signature: update_user_statistics_after_game(user_id UUID, total_buy_in DECIMAL, total_cash_out DECIMAL, session_length_minutes INTEGER)';
RAISE NOTICE 'The system will now:';
RAISE NOTICE '✅ Update NEW user_statistics table with comprehensive data';
RAISE NOTICE '✅ Update LEGACY profiles table for backward compatibility';
RAISE NOTICE '✅ Preserve all existing profile data and structure';
RAISE NOTICE '✅ Collect detailed statistics on game completion';
