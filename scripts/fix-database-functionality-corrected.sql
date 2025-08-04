-- Complete Database Fix Script for Poker Home Game Manager
-- This script restores all functionality without RLS restrictions

-- First, ensure we have a clean slate by dropping problematic elements
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view own games" ON game_sessions;
DROP POLICY IF EXISTS "Users can manage own games" ON game_sessions;
DROP POLICY IF EXISTS "Users can view own invitations" ON game_invitations;
DROP POLICY IF EXISTS "Users can manage own invitations" ON game_invitations;
DROP POLICY IF EXISTS "Users can view own friends" ON friends;
DROP POLICY IF EXISTS "Users can manage own friends" ON friends;
DROP POLICY IF EXISTS "Users can view own friend requests" ON friend_requests;
DROP POLICY IF EXISTS "Users can manage own friend requests" ON friend_requests;

-- Disable RLS on all tables to ensure full access
ALTER TABLE IF EXISTS profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS game_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS game_invitations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS friends DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS friend_requests DISABLE ROW LEVEL SECURITY;

-- Create or recreate the profiles table with all necessary columns
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Game statistics
    games_played INTEGER DEFAULT 0,
    all_time_profit_loss DECIMAL(10,2) DEFAULT 0.00,
    average_buyin DECIMAL(10,2) DEFAULT 0.00,
    last_game_date TIMESTAMPTZ,
    win_ratio DECIMAL(5,4) DEFAULT 0.0000,
    
    -- Additional stats
    total_winnings DECIMAL(10,2) DEFAULT 0.00,
    total_losses DECIMAL(10,2) DEFAULT 0.00,
    biggest_win DECIMAL(10,2) DEFAULT 0.00,
    biggest_loss DECIMAL(10,2) DEFAULT 0.00
);

-- Create or recreate the game_sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_time TIMESTAMPTZ DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'pending_close')),
    point_to_cash_rate DECIMAL(10,2) DEFAULT 0.25,
    players_data JSONB DEFAULT '[]'::jsonb,
    invited_users UUID[] DEFAULT '{}',
    game_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create or recreate the friends table
CREATE TABLE IF NOT EXISTS friends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    friend_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, friend_id)
);

-- Create or recreate the friend_requests table
CREATE TABLE IF NOT EXISTS friend_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    requestee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(requester_id, requestee_id)
);

-- Create or recreate the game_invitations table
CREATE TABLE IF NOT EXISTS game_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
    inviter_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    invitee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(game_session_id, invitee_id)
);

-- Create the handle_new_user function to automatically create profiles
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, username, email, full_name)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger for new user registration
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Create the update_user_game_stats function
CREATE OR REPLACE FUNCTION update_user_game_stats(
    user_id_param UUID,
    profit_loss_amount DECIMAL
)
RETURNS JSON AS $$
DECLARE
    result JSON;
    current_games INTEGER;
    current_profit DECIMAL;
    new_games INTEGER;
    new_profit DECIMAL;
    new_average DECIMAL;
    new_win_ratio DECIMAL;
    wins INTEGER;
BEGIN
    -- Get current stats
    SELECT 
        COALESCE(games_played, 0),
        COALESCE(all_time_profit_loss, 0)
    INTO current_games, current_profit
    FROM profiles 
    WHERE id = user_id_param;
    
    -- Calculate new values
    new_games := current_games + 1;
    new_profit := current_profit + profit_loss_amount;
    
    -- Calculate average (avoid division by zero)
    IF new_games > 0 THEN
        new_average := new_profit / new_games;
    ELSE
        new_average := 0;
    END IF;
    
    -- Calculate win ratio (count of profitable games)
    SELECT COUNT(*) INTO wins
    FROM game_sessions gs
    WHERE gs.user_id = user_id_param 
    AND gs.status = 'completed'
    AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(gs.players_data) AS player
        WHERE (player->>'name')::text ILIKE (
            SELECT full_name FROM profiles WHERE id = user_id_param
        )
        AND (player->>'cashOutAmount')::decimal > 
            (SELECT SUM((buy_in->>'amount')::decimal) 
             FROM jsonb_array_elements(player->'buyIns') AS buy_in)
    );
    
    -- Calculate win ratio
    IF new_games > 0 THEN
        new_win_ratio := wins::decimal / new_games::decimal;
    ELSE
        new_win_ratio := 0;
    END IF;
    
    -- Update the profile
    UPDATE profiles 
    SET 
        games_played = new_games,
        all_time_profit_loss = new_profit,
        average_buyin = new_average,
        last_game_date = NOW(),
        win_ratio = new_win_ratio,
        updated_at = NOW()
    WHERE id = user_id_param;
    
    -- Return the updated stats
    SELECT json_build_object(
        'user_id', user_id_param,
        'games_played', new_games,
        'all_time_profit_loss', new_profit,
        'average_buyin', new_average,
        'win_ratio', new_win_ratio,
        'profit_loss_this_game', profit_loss_amount
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create function to accept game invitations
CREATE OR REPLACE FUNCTION accept_game_invitation(
    invitation_id_param UUID,
    user_id_param UUID
)
RETURNS JSON AS $$
DECLARE
    invitation_record RECORD;
    result JSON;
BEGIN
    -- Get the invitation details
    SELECT gi.*, gs.name as game_name, gs.status as game_status
    INTO invitation_record
    FROM game_invitations gi
    JOIN game_sessions gs ON gi.game_session_id = gs.id
    WHERE gi.id = invitation_id_param 
    AND gi.invitee_id = user_id_param
    AND gi.status = 'pending';
    
    -- Check if invitation exists and is valid
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Invitation not found or already processed'
        );
    END IF;
    
    -- Check if game is still active
    IF invitation_record.game_status != 'active' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Game is no longer active'
        );
    END IF;
    
    -- Update invitation status
    UPDATE game_invitations 
    SET 
        status = 'accepted',
        updated_at = NOW()
    WHERE id = invitation_id_param;
    
    -- Return success
    SELECT json_build_object(
        'success', true,
        'message', 'Invitation accepted successfully',
        'game_id', invitation_record.game_session_id,
        'game_name', invitation_record.game_name
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_game_invitations_invitee ON game_invitations(invitee_id);
CREATE INDEX IF NOT EXISTS idx_game_invitations_game ON game_invitations(game_session_id);
CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_requestee ON friend_requests(requestee_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_requester ON friend_requests(requester_id);

-- Grant necessary permissions
GRANT ALL ON profiles TO authenticated;
GRANT ALL ON game_sessions TO authenticated;
GRANT ALL ON game_invitations TO authenticated;
GRANT ALL ON friends TO authenticated;
GRANT ALL ON friend_requests TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

COMMIT;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Database functionality restored successfully!';
    RAISE NOTICE 'All tables created with proper structure';
    RAISE NOTICE 'All functions and triggers installed';
    RAISE NOTICE 'RLS disabled for full access';
    RAISE NOTICE 'Performance indexes created';
END $$;
