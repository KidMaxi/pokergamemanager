-- Fix the accept_game_invitation function to properly handle user addition
CREATE OR REPLACE FUNCTION accept_game_invitation(invitation_id UUID)
RETURNS VOID AS $$
DECLARE
    invitation_record game_invitations%ROWTYPE;
    game_record game_sessions%ROWTYPE;
    user_profile profiles%ROWTYPE;
    new_player JSONB;
    updated_players JSONB;
    standard_buyin_amount NUMERIC;
    point_to_cash_rate NUMERIC;
    initial_points INTEGER;
BEGIN
    -- Get the invitation details
    SELECT * INTO invitation_record 
    FROM game_invitations 
    WHERE id = invitation_id AND invitee_id = auth.uid() AND status = 'pending';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found, already processed, or not authorized';
    END IF;
    
    -- Get the game session details
    SELECT * INTO game_record
    FROM game_sessions
    WHERE id = invitation_record.game_session_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Game session not found';
    END IF;
    
    -- Get the user profile
    SELECT * INTO user_profile
    FROM profiles
    WHERE id = auth.uid();
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User profile not found';
    END IF;
    
    -- Extract game settings
    standard_buyin_amount := COALESCE((game_record.game_metadata->>'standardBuyInAmount')::NUMERIC, 25);
    point_to_cash_rate := game_record.point_to_cash_rate;
    initial_points := FLOOR(standard_buyin_amount / point_to_cash_rate);
    
    -- Create new player object
    new_player := jsonb_build_object(
        'playerId', 'invited-' || extract(epoch from now()) || '-' || substring(gen_random_uuid()::text, 1, 8),
        'name', COALESCE(user_profile.full_name, user_profile.email, 'Unknown User'),
        'pointStack', initial_points,
        'buyIns', jsonb_build_array(
            jsonb_build_object(
                'logId', 'buyin-' || extract(epoch from now()) || '-' || substring(gen_random_uuid()::text, 1, 8),
                'amount', standard_buyin_amount,
                'time', now()::text
            )
        ),
        'cashOutAmount', 0,
        'cashOutLog', '[]'::jsonb,
        'status', 'active'
    );
    
    -- Get current players and check if user already exists
    updated_players := COALESCE(game_record.players_data, '[]'::jsonb);
    
    -- Check if player with this name already exists
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(updated_players) AS player
        WHERE lower(player->>'name') = lower(COALESCE(user_profile.full_name, user_profile.email, 'Unknown User'))
    ) THEN
        RAISE EXCEPTION 'A player with this name already exists in the game';
    END IF;
    
    -- Add the new player to the players array
    updated_players := updated_players || new_player;
    
    -- Update the game session
    UPDATE game_sessions 
    SET 
        players_data = updated_players,
        invited_users = COALESCE(invited_users, '{}') || ARRAY[invitation_record.invitee_id::TEXT],
        updated_at = now()
    WHERE id = invitation_record.game_session_id;
    
    -- Update invitation status
    UPDATE game_invitations 
    SET status = 'accepted', updated_at = now()
    WHERE id = invitation_id;
    
    -- Log the acceptance
    INSERT INTO game_invitations (game_session_id, inviter_id, invitee_id, status, created_at, updated_at)
    VALUES (
        invitation_record.game_session_id,
        invitation_record.inviter_id,
        invitation_record.invitee_id,
        'accepted',
        now(),
        now()
    ) ON CONFLICT DO NOTHING;
    
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION accept_game_invitation(UUID) TO authenticated;
