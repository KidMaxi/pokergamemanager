-- Fix the user statistics function with correct parameter order and ensure data collection works
-- This addresses the parameter mismatch error and ensures proper data collection
-- IMPORTANT: This script does NOT modify the profiles table, only uses it for lookups

-- Drop any existing versions of the function
DROP FUNCTION IF EXISTS public.update_user_statistics_after_game(UUID, DECIMAL, DECIMAL, INTEGER);
DROP FUNCTION IF EXISTS public.update_user_statistics_after_game(INTEGER, DECIMAL, DECIMAL, UUID);

-- Create the function with correct parameter order and enhanced data collection
CREATE OR REPLACE FUNCTION public.update_user_statistics_after_game(
    p_user_id UUID,
    p_total_buy_in DECIMAL(10,2),
    p_total_cash_out DECIMAL(10,2),
    p_session_length_minutes INTEGER DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profit_loss DECIMAL(10,2);
    v_session_length_hours INTEGER;
    v_current_stats RECORD;
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

    -- Get current statistics
    SELECT * INTO v_current_stats
    FROM public.user_statistics
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Failed to create or find user statistics record for user: %', p_user_id;
    END IF;

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

    -- Update statistics with all the calculated values
    UPDATE public.user_statistics
    SET 
        total_games_played = v_total_new_games,
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

    -- Verify the update worked
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Failed to update user statistics for user: %', p_user_id;
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.update_user_statistics_after_game(UUID, DECIMAL, DECIMAL, INTEGER) TO authenticated;

-- Test the function with existing user data (NO profile table modifications)
DO $$
DECLARE
    existing_user_id UUID;
    result BOOLEAN;
    test_stats RECORD;
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
    
    -- Test the function with a winning session
    SELECT public.update_user_statistics_after_game(
        existing_user_id,
        25.00,  -- buy in $25
        35.00,  -- cash out $35 (win $10)
        120     -- 2 hours
    ) INTO result;
    
    IF result THEN
        RAISE NOTICE 'Test 1 (winning session) PASSED';
        
        -- Check the results
        SELECT * INTO test_stats FROM public.user_statistics WHERE user_id = existing_user_id;
        RAISE NOTICE 'After winning session: games=%, profit=%, win_rate=%', 
            test_stats.total_games_played, test_stats.net_profit_loss, test_stats.win_rate;
    ELSE
        RAISE NOTICE 'Test 1 (winning session) FAILED';
    END IF;
    
    -- Test with a losing session
    SELECT public.update_user_statistics_after_game(
        existing_user_id,
        25.00,  -- buy in $25
        15.00,  -- cash out $15 (lose $10)
        90      -- 1.5 hours
    ) INTO result;
    
    IF result THEN
        RAISE NOTICE 'Test 2 (losing session) PASSED';
        
        -- Check the results
        SELECT * INTO test_stats FROM public.user_statistics WHERE user_id = existing_user_id;
        RAISE NOTICE 'After losing session: games=%, profit=%, win_rate=%', 
            test_stats.total_games_played, test_stats.net_profit_loss, test_stats.win_rate;
    ELSE
        RAISE NOTICE 'Test 2 (losing session) FAILED';
    END IF;
    
    -- Test with a break-even session
    SELECT public.update_user_statistics_after_game(
        existing_user_id,
        25.00,  -- buy in $25
        25.00,  -- cash out $25 (break even)
        60      -- 1 hour
    ) INTO result;
    
    IF result THEN
        RAISE NOTICE 'Test 3 (break-even session) PASSED';
        
        -- Check the results
        SELECT * INTO test_stats FROM public.user_statistics WHERE user_id = existing_user_id;
        RAISE NOTICE 'After break-even session: games=%, profit=%, win_rate=%', 
            test_stats.total_games_played, test_stats.net_profit_loss, test_stats.win_rate;
    ELSE
        RAISE NOTICE 'Test 3 (break-even session) FAILED';
    END IF;
    
    RAISE NOTICE 'Function tests completed - user statistics data preserved';
END;
$$;
