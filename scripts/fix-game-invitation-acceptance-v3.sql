-- Drop the existing function first
DROP FUNCTION IF EXISTS accept_game_invitation(UUID);

-- Create an improved accept_game_invitation function with better error handling
CREATE OR REPLACE FUNCTION accept_game_invitation(invitation_id UUID)
RETURNS JSON AS $$
DECLARE
    invitation_record game_invitations%ROWTYPE;
    game_record game_sessions%ROWTYPE;
    user_profile profiles%ROWTYPE;
    new_player JSONB;
    updated_players JSONB;
    standard_buyin_amount NUMERIC;
    point_to_cash_rate NUMERIC;
    initial_points INTEGER;
    result JSON;
BEGIN
    -- Get the invitation details
    SELECT * INTO invitation_record 
    FROM game_invitations 
    WHERE id = invitation_id AND invitee_id = auth.uid() AND status = 'pending';
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Invitation not found, already processed, or not authorized'
        );
    END IF;
    
    -- Get the game session details
    SELECT * INTO game_record
    FROM game_sessions
    WHERE id = invitation_record.game_session_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Game session not found'
        );
    END IF;
    
    -- Check if game is still active
    IF game_record.status != 'active' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Game is no longer active and cannot accept new players'
        );
    END IF;
    
    -- Get the user profile
    SELECT * INTO user_profile
    FROM profiles
    WHERE id = auth.uid();
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'User profile not found'
        );
    END IF;
    
    -- Extract game settings from metadata
    standard_buyin_amount := COALESCE((game_record.game_metadata->>'standardBuyInAmount')::NUMERIC, 25);
    point_to_cash_rate := game_record.point_to_cash_rate;
    initial_points := FLOOR(standard_buyin_amount / point_to_cash_rate);
    
    -- Get current players and check if user already exists
    updated_players := COALESCE(game_record.players_data, '[]'::jsonb);
    
    -- Check if player with this name already exists (case-insensitive)
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(updated_players) AS player
        WHERE lower(trim(player->>'name')) = lower(trim(COALESCE(user_profile.full_name, user_profile.email, 'Unknown User')))
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'A player with this name already exists in the game'
        );
    END IF;
    
    -- Create new player object with proper structure
    new_player := jsonb_build_object(
        'playerId', 'invited-' || extract(epoch from now())::text || '-' || substring(gen_random_uuid()::text, 1, 8),
        'name', COALESCE(user_profile.full_name, user_profile.email, 'Unknown User'),
        'pointStack', initial_points,
        'buyIns', jsonb_build_array(
            jsonb_build_object(
                'logId', 'buyin-' || extract(epoch from now())::text || '-' || substring(gen_random_uuid()::text, 1, 8),
                'amount', standard_buyin_amount,
                'time', now()::text
            )
        ),
        'cashOutAmount', 0,
        'cashOutLog', '[]'::jsonb,
        'status', 'active'
    );
    
    -- Add the new player to the players array
    updated_players := updated_players || new_player;
    
    -- Update the game session with new player and ensure invited_users includes this user
    UPDATE game_sessions 
    SET 
        players_data = updated_players,
        invited_users = CASE 
            WHEN invited_users IS NULL THEN ARRAY[invitation_record.invitee_id::TEXT]
            WHEN NOT (invitation_record.invitee_id::TEXT = ANY(invited_users)) THEN invited_users || ARRAY[invitation_record.invitee_id::TEXT]
            ELSE invited_users
        END,
        updated_at = now()
    WHERE id = invitation_record.game_session_id;
    
    -- Update invitation status to accepted
    UPDATE game_invitations 
    SET 
        status = 'accepted', 
        updated_at = now()
    WHERE id = invitation_id;
    
    -- Return success with player info
    result := json_build_object(
        'success', true,
        'message', 'Successfully joined the game',
        'player_name', COALESCE(user_profile.full_name, user_profile.email, 'Unknown User'),
        'initial_points', initial_points,
        'buyin_amount', standard_buyin_amount
    );
    
    RETURN result;
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Database error: ' || SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION accept_game_invitation(UUID) TO authenticated;

-- Create a function to get game participants with proper name resolution
CREATE OR REPLACE FUNCTION get_game_participants(game_session_id UUID)
RETURNS JSON AS $$
DECLARE
    game_record game_sessions%ROWTYPE;
    participants JSON;
BEGIN
    -- Get the game session
    SELECT * INTO game_record
    FROM game_sessions
    WHERE id = game_session_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('error', 'Game session not found');
    END IF;
    
    -- Build participants info combining players_data with profile information
    WITH player_profiles AS (
        SELECT 
            p.id,
            p.full_name,
            p.email,
            p.all_time_profit_loss,
            p.games_played
        FROM profiles p
        WHERE p.id = ANY(COALESCE(game_record.invited_users, '{}')::text[])
           OR p.id = game_record.user_id
    ),
    players_with_profiles AS (
        SELECT 
            jsonb_array_elements(COALESCE(game_record.players_data, '[]'::jsonb)) as player_data,
            pp.id as profile_id,
            pp.full_name,
            pp.email,
            pp.all_time_profit_loss,
            pp.games_played
        FROM player_profiles pp
        WHERE lower(trim(pp.full_name)) IN (
            SELECT lower(trim(jsonb_array_elements(COALESCE(game_record.players_data, '[]'::jsonb))->>'name'))
        )
    )
    SELECT json_build_object(
        'game_id', game_record.id,
        'game_name', game_record.name,
        'host_id', game_record.user_id,
        'invited_users', COALESCE(game_record.invited_users, '{}'),
        'players_in_game', COALESCE(game_record.players_data, '[]'::jsonb),
        'participants_with_profiles', COALESCE(
            json_agg(
                json_build_object(
                    'player_data', pwp.player_data,
                    'profile_id', pwp.profile_id,
                    'full_name', pwp.full_name,
                    'email', pwp.email,
                    'stats', json_build_object(
                        'all_time_profit_loss', pwp.all_time_profit_loss,
                        'games_played', pwp.games_played
                    )
                )
            ) FILTER (WHERE pwp.profile_id IS NOT NULL),
            '[]'::json
        )
    ) INTO participants
    FROM players_with_profiles pwp;
    
    RETURN participants;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_game_participants(UUID) TO authenticated;
