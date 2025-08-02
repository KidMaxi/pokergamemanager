-- Fix the game invitation display issue
-- This ensures invited friends are properly shown in active games

-- First, let's create a function to properly accept game invitations
-- and add the user as a player in the game
CREATE OR REPLACE FUNCTION public.accept_game_invitation_v2(
    invitation_id UUID
)
RETURNS JSON
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
    v_buy_in_record JSONB;
    v_player_exists BOOLEAN := FALSE;
    v_result JSON;
BEGIN
    -- Get the invitation details
    SELECT gi.*, gs.name as game_name, gs.point_to_cash_rate, gs.players_data, gs.status as game_status
    INTO v_invitation
    FROM game_invitations gi
    JOIN game_sessions gs ON gi.game_session_id = gs.id
    WHERE gi.id = invitation_id AND gi.status = 'pending';
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invitation not found or already processed');
    END IF;
    
    -- Check if game is still active
    IF v_invitation.game_status != 'active' THEN
        RETURN json_build_object('success', false, 'error', 'Game is no longer active');
    END IF;
    
    -- Get invitee profile
    SELECT * INTO v_invitee_profile
    FROM profiles
    WHERE id = v_invitation.invitee_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'User profile not found');
    END IF;
    
    -- Get current players data
    v_players_data := COALESCE(v_invitation.players_data, '[]'::jsonb);
    
    -- Check if player already exists in the game
    SELECT EXISTS(
        SELECT 1 
        FROM jsonb_array_elements(v_players_data) AS player
        WHERE LOWER(TRIM(player->>'name')) = LOWER(TRIM(v_invitee_profile.full_name))
    ) INTO v_player_exists;
    
    IF v_player_exists THEN
        -- Just update invitation status if player already exists
        UPDATE game_invitations 
        SET status = 'accepted', updated_at = NOW()
        WHERE id = invitation_id;
        
        RETURN json_build_object(
            'success', true, 
            'message', 'Already in game',
            'initial_points', 0
        );
    END IF;
    
    -- Calculate initial points from standard buy-in (default $25)
    v_initial_points := FLOOR(25.0 / v_invitation.point_to_cash_rate);
    
    -- Create buy-in record
    v_buy_in_record := json_build_object(
        'logId', gen_random_uuid()::text,
        'amount', 25.0,
        'time', NOW()::text
    );
    
    -- Create new player object
    v_new_player := json_build_object(
        'playerId', 'invited-' || gen_random_uuid()::text,
        'name', v_invitee_profile.full_name,
        'pointStack', v_initial_points,
        'buyIns', json_build_array(v_buy_in_record),
        'cashOutAmount', 0,
        'cashOutLog', '[]'::json,
        'status', 'active'
    );
    
    -- Add player to the game
    v_players_data := v_players_data || jsonb_build_array(v_new_player);
    
    -- Update the game session with new player
    UPDATE game_sessions 
    SET 
        players_data = v_players_data,
        updated_at = NOW()
    WHERE id = v_invitation.game_session_id;
    
    -- Update invitation status
    UPDATE game_invitations 
    SET status = 'accepted', updated_at = NOW()
    WHERE id = invitation_id;
    
    -- Log the successful acceptance
    RAISE NOTICE 'Game invitation accepted: user % joined game % with % points', 
        v_invitee_profile.full_name, v_invitation.game_name, v_initial_points;
    
    RETURN json_build_object(
        'success', true, 
        'message', 'Successfully joined game',
        'initial_points', v_initial_points,
        'game_name', v_invitation.game_name
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error accepting invitation: %', SQLERRM;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.accept_game_invitation_v2(UUID) TO authenticated;

-- Create a function to refresh game data for all participants
CREATE OR REPLACE FUNCTION public.get_game_with_participants(
    game_session_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_game_session RECORD;
    v_result JSON;
BEGIN
    -- Get the complete game session data
    SELECT 
        gs.*,
        COALESCE(
            (SELECT json_agg(
                json_build_object(
                    'id', p.id,
                    'full_name', p.full_name,
                    'email', p.email
                )
            )
            FROM unnest(gs.invited_users) AS invited_user_id
            JOIN profiles p ON p.id::text = invited_user_id), 
            '[]'::json
        ) as invited_user_profiles
    INTO v_game_session
    FROM game_sessions gs
    WHERE gs.id = game_session_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Game session not found');
    END IF;
    
    -- Return complete game data
    RETURN json_build_object(
        'success', true,
        'game_session', row_to_json(v_game_session)
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_game_with_participants(UUID) TO authenticated;
