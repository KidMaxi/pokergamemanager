-- Fix the user statistics function with correct parameter order
-- This addresses the parameter mismatch error

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS public.update_user_statistics_after_game(UUID, DECIMAL, DECIMAL, INTEGER);
DROP FUNCTION IF EXISTS public.update_user_statistics_after_game(INTEGER, DECIMAL, DECIMAL, UUID);

-- Create the function with correct parameter order and enhanced logging
CREATE OR REPLACE FUNCTION public.update_user_statistics_after_game(
    p_user_id UUID,
    p_total_buy_in DECIMAL,
    p_total_cash_out DECIMAL,
    p_session_length_minutes INTEGER DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profit_loss DECIMAL;
    v_session_length_hours DECIMAL;
    v_current_stats RECORD;
    v_new_win_rate DECIMAL;
    v_new_roi DECIMAL;
    v_new_avg_session_length DECIMAL;
BEGIN
    -- Log function call for debugging
    RAISE NOTICE 'update_user_statistics_after_game called with: user_id=%, buy_in=%, cash_out=%, session_minutes=%', 
        p_user_id, p_total_buy_in, p_total_cash_out, p_session_length_minutes;

    -- Validate inputs
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID cannot be null';
    END IF;
    
    IF p_total_buy_in < 0 THEN
        RAISE EXCEPTION 'Total buy-in cannot be negative';
    END IF;
    
    IF p_total_cash_out < 0 THEN
        RAISE EXCEPTION 'Total cash-out cannot be negative';
    END IF;

    -- Calculate profit/loss for this session
    v_profit_loss := p_total_cash_out - p_total_buy_in;
    
    -- Convert session length to hours (rounded up)
    v_session_length_hours := CASE 
        WHEN p_session_length_minutes > 0 THEN CEIL(p_session_length_minutes::DECIMAL / 60.0)
        ELSE 0
    END;

    -- Ensure user statistics record exists
    INSERT INTO public.user_statistics (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    -- Get current statistics
    SELECT * INTO v_current_stats
    FROM public.user_statistics
    WHERE user_id = p_user_id;

    -- Calculate new win rate (only count profit > 0 as wins, break-even is not a win)
    v_new_win_rate := CASE 
        WHEN (v_current_stats.total_games_played + 1) > 0 THEN
            CASE 
                WHEN v_profit_loss > 0 THEN
                    ((v_current_stats.total_games_played * v_current_stats.win_rate / 100.0) + 1) / (v_current_stats.total_games_played + 1) * 100.0
                ELSE
                    (v_current_stats.total_games_played * v_current_stats.win_rate / 100.0) / (v_current_stats.total_games_played + 1) * 100.0
            END
        ELSE 0
    END;

    -- Calculate new ROI
    v_new_roi := CASE 
        WHEN (v_current_stats.total_buy_ins + p_total_buy_in) > 0 THEN
            (v_current_stats.net_profit_loss + v_profit_loss) / (v_current_stats.total_buy_ins + p_total_buy_in) * 100.0
        ELSE 0
    END;

    -- Calculate new average session length
    v_new_avg_session_length := CASE 
        WHEN (v_current_stats.total_games_played + 1) > 0 THEN
            (v_current_stats.average_session_length_minutes * v_current_stats.total_games_played + p_session_length_minutes) / (v_current_stats.total_games_played + 1)
        ELSE p_session_length_minutes
    END;

    -- Update statistics
    UPDATE public.user_statistics
    SET 
        total_games_played = total_games_played + 1,
        total_buy_ins = total_buy_ins + p_total_buy_in,
        total_cash_outs = total_cash_outs + p_total_cash_out,
        net_profit_loss = net_profit_loss + v_profit_loss,
        biggest_win = CASE 
            WHEN v_profit_loss > biggest_win THEN v_profit_loss
            ELSE biggest_win
        END,
        biggest_loss = CASE 
            WHEN v_profit_loss < biggest_loss THEN v_profit_loss
            ELSE biggest_loss
        END,
        win_rate = v_new_win_rate,
        roi = v_new_roi,
        average_session_length_minutes = v_new_avg_session_length,
        total_session_time_hours = total_session_time_hours + v_session_length_hours,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Log successful update
    RAISE NOTICE 'Statistics updated successfully for user %: profit_loss=%, new_win_rate=%, new_roi=%', 
        p_user_id, v_profit_loss, v_new_win_rate, v_new_roi;

    RETURN TRUE;

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error updating user statistics: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.update_user_statistics_after_game(UUID, DECIMAL, DECIMAL, INTEGER) TO authenticated;

-- Test the function with sample data
DO $$
DECLARE
    test_user_id UUID := gen_random_uuid();
    result BOOLEAN;
BEGIN
    -- Insert a test profile
    INSERT INTO public.profiles (id, email, full_name) 
    VALUES (test_user_id, 'test@example.com', 'Test User');
    
    -- Test the function
    SELECT public.update_user_statistics_after_game(
        test_user_id,
        25.00,  -- buy in
        30.00,  -- cash out
        120     -- 2 hours
    ) INTO result;
    
    IF result THEN
        RAISE NOTICE 'Function test PASSED';
    ELSE
        RAISE NOTICE 'Function test FAILED';
    END IF;
    
    -- Clean up test data
    DELETE FROM public.user_statistics WHERE user_id = test_user_id;
    DELETE FROM public.profiles WHERE id = test_user_id;
END;
$$;
