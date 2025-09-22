-- Enhanced function to accept game invitation and add user as a player
CREATE OR REPLACE FUNCTION accept_game_invitation(invitation_id UUID)
RETURNS JSON AS $$
DECLARE
    invitation_record game_invitations%ROWTYPE;
    game_record game_sessions%ROWTYPE;
    user_profile profiles%ROWTYPE;
    initial_points INTEGER;
    new_player JSONB;
    updated_players_data JSONB;
BEGIN
    -- Get the invitation details
    SELECT * INTO invitation_record 
    FROM game_invitations 
    WHERE id = invitation_id AND invitee_id = auth.uid() AND status = 'pending';
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invitation not found, already processed, or not authorized');
    END IF;
    
    -- Get the game session details
    SELECT * INTO game_record 
    FROM game_sessions 
    WHERE id = invitation_record.game_session_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Game session not found');
    END IF;
    
    -- Get user profile
    SELECT * INTO user_profile 
    FROM profiles 
    WHERE id = auth.uid();
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'User profile not found');
    END IF;
    
    -- Calculate initial points based on standard buy-in
    initial_points := FLOOR((game_record.game_metadata->>'standardBuyInAmount')::NUMERIC / game_record.point_to_cash_rate);
    
    -- Create new player object
    new_player := json_build_object(
        'playerId', 'invited-' || extract(epoch from now()) || '-' || substring(gen_random_uuid()::text, 1, 8),
        'name', user_profile.full_name,
        'pointStack', initial_points,
        'buyIns', json_build_array(
            json_build_object(
                'logId', 'buyin-' || extract(epoch from now()) || '-' || substring(gen_random_uuid()::text, 1, 8),
                'amount', (game_record.game_metadata->>'standardBuyInAmount')::NUMERIC,
                'time', now()::text
            )
        ),
        'cashOutAmount', 0,
        'cashOutLog', json_build_array(),
        'status', 'active',
        'profileId', auth.uid()
    );
    
    -- Add the new player to the existing players_data array
    updated_players_data := COALESCE(game_record.players_data, '[]'::jsonb) || new_player::jsonb;
    
    -- Update invitation status
    UPDATE game_invitations 
    SET status = 'accepted', updated_at = NOW()
    WHERE id = invitation_id;
    
    -- Add user to the game session as a player and update invited_users array
    UPDATE game_sessions 
    SET 
        invited_users = COALESCE(invited_users, '{}') || ARRAY[invitation_record.invitee_id::TEXT],
        players_data = updated_players_data,
        updated_at = NOW()
    WHERE id = invitation_record.game_session_id;
    
    RETURN json_build_object(
        'success', true, 
        'message', 'Invitation accepted and added to game as player',
        'initial_points', initial_points,
        'player_name', user_profile.full_name
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION accept_game_invitation(UUID) TO authenticated;
