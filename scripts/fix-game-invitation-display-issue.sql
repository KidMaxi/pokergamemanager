-- Fix the game invitation system to properly display invited friends in active games
-- This ensures that when a friend accepts an invitation, they appear in the game for everyone

-- Create an improved function to accept game invitations and add the user as a player
CREATE OR REPLACE FUNCTION public.accept_game_invitation_v2(
    p_invitation_id UUID,
    p_invitee_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invitation RECORD;
    v_game_session RECORD;
    v_invitee_profile RECORD;
    v_players_data JSONB;
    v_new_player JSONB;
    v_initial_points INTEGER;
    v_player_exists BOOLEAN := FALSE;
BEGIN
    -- Log the function call
    RAISE NOTICE 'accept_game_invitation_v2 called with invitation_id=%, invitee_id=%', p_invitation_id, p_invitee_id;

    -- Get the invitation details
    SELECT * INTO v_invitation
    FROM public.game_invitations
    WHERE id = p_invitation_id AND invitee_id = p_invitee_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found or already processed';
    END IF;

    -- Get the game session details
    SELECT * INTO v_game_session
    FROM public.game_sessions
    WHERE id = v_invitation.game_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Game session not found';
    END IF;

    -- Get the invitee's profile
    SELECT * INTO v_invitee_profile
    FROM public.profiles
    WHERE id = p_invitee_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitee profile not found';
    END IF;

    RAISE NOTICE 'Processing invitation for game: % by user: %', v_game_session.name, v_invitee_profile.full_name;

    -- Get current players data
    v_players_data := COALESCE(v_game_session.players_data, '[]'::jsonb);

    -- Check if player already exists in the game
    SELECT EXISTS(
        SELECT 1 
        FROM jsonb_array_elements(v_players_data) AS player
        WHERE LOWER(TRIM(player->>'name')) = LOWER(TRIM(v_invitee_profile.full_name))
    ) INTO v_player_exists;

    IF v_player_exists THEN
        RAISE NOTICE 'Player % already exists in game, just updating invitation status', v_invitee_profile.full_name;
    ELSE
        -- Calculate initial points based on standard buy-in
        v_initial_points := FLOOR(25.00 / v_game_session.point_to_cash_rate);

        -- Create new player object with proper structure
        v_new_player := jsonb_build_object(
            'playerId', 'invited-' || p_invitee_id || '-' || extract(epoch from now()),
            'name', v_invitee_profile.full_name,
            'pointStack', v_initial_points,
            'buyIns', jsonb_build_array(
                jsonb_build_object(
                    'logId', 'buyin-' || extract(epoch from now()),
                    'amount', 25.00,
                    'time', now()
                )
            ),
            'cashOutAmount', 0,
            'cashOutLog', '[]'::jsonb,
            'status', 'active'
        );

        -- Add the new player to the players array
        v_players_data := v_players_data || jsonb_build_array(v_new_player);

        RAISE NOTICE 'Added new player to game: % with % points', v_invitee_profile.full_name, v_initial_points;

        -- Update the game session with the new player
        UPDATE public.game_sessions
        SET 
            players_data = v_players_data,
            updated_at = NOW()
        WHERE id = v_invitation.game_session_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Failed to update game session with new player';
        END IF;
    END IF;

    -- Update the invitation status to accepted
    UPDATE public.game_invitations
    SET 
        status = 'accepted',
        updated_at = NOW()
    WHERE id = p_invitation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Failed to update invitation status';
    END IF;

    RAISE NOTICE 'Successfully accepted invitation and added player to game';
    RETURN TRUE;

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error accepting game invitation: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.accept_game_invitation_v2(UUID, UUID) TO authenticated;

-- Test the function
DO $$
DECLARE
    test_host_id UUID := gen_random_uuid();
    test_invitee_id UUID := gen_random_uuid();
    test_game_id UUID := gen_random_uuid();
    test_invitation_id UUID := gen_random_uuid();
    result BOOLEAN;
BEGIN
    -- Create test profiles
    INSERT INTO public.profiles (id, email, full_name) VALUES 
        (test_host_id, 'host@test.com', 'Test Host'),
        (test_invitee_id, 'invitee@test.com', 'Test Invitee');
    
    -- Create test game session
    INSERT INTO public.game_sessions (id, user_id, name, status, point_to_cash_rate, players_data) VALUES 
        (test_game_id, test_host_id, 'Test Game', 'active', 1.0, '[]'::jsonb);
    
    -- Create test invitation
    INSERT INTO public.game_invitations (id, game_session_id, inviter_id, invitee_id, status) VALUES 
        (test_invitation_id, test_game_id, test_host_id, test_invitee_id, 'pending');
    
    -- Test the function
    SELECT public.accept_game_invitation_v2(test_invitation_id, test_invitee_id) INTO result;
    
    IF result THEN
        RAISE NOTICE 'accept_game_invitation_v2 test PASSED';
    ELSE
        RAISE NOTICE 'accept_game_invitation_v2 test FAILED';
    END IF;
    
    -- Clean up test data
    DELETE FROM public.game_invitations WHERE id = test_invitation_id;
    DELETE FROM public.game_sessions WHERE id = test_game_id;
    DELETE FROM public.profiles WHERE id IN (test_host_id, test_invitee_id);
    
    RAISE NOTICE 'Test completed and cleaned up';
END;
$$;
