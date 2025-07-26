-- Drop existing tables if they exist to recreate with proper relationships
DROP TABLE IF EXISTS game_invitations CASCADE;
DROP TABLE IF EXISTS friendships CASCADE;

-- Recreate friendships table with proper foreign key references
CREATE TABLE friendships (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, friend_id),
    CHECK (user_id != friend_id)
);

-- Create indexes for better performance
CREATE INDEX idx_friendships_user_id ON friendships(user_id);
CREATE INDEX idx_friendships_friend_id ON friendships(friend_id);

-- Recreate game_invitations table with proper foreign key references
CREATE TABLE game_invitations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    inviter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    invitee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(game_session_id, invitee_id)
);

-- Create indexes for better performance
CREATE INDEX idx_game_invitations_invitee_id ON game_invitations(invitee_id);
CREATE INDEX idx_game_invitations_game_session_id ON game_invitations(game_session_id);
CREATE INDEX idx_game_invitations_status ON game_invitations(status);

-- Enable RLS
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_invitations ENABLE ROW LEVEL SECURITY;

-- RLS policies for friendships
CREATE POLICY "Users can view their own friendships" ON friendships
    FOR SELECT USING (user_id = auth.uid() OR friend_id = auth.uid());

CREATE POLICY "Users can create friendships" ON friendships
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own friendships" ON friendships
    FOR DELETE USING (user_id = auth.uid());

-- RLS policies for game_invitations
CREATE POLICY "Users can view invitations they sent or received" ON game_invitations
    FOR SELECT USING (inviter_id = auth.uid() OR invitee_id = auth.uid());

CREATE POLICY "Users can create invitations for their own games" ON game_invitations
    FOR INSERT WITH CHECK (inviter_id = auth.uid());

CREATE POLICY "Users can update invitations they received" ON game_invitations
    FOR UPDATE USING (invitee_id = auth.uid());

-- Recreate the database functions
CREATE OR REPLACE FUNCTION accept_game_invitation(invitation_id UUID)
RETURNS VOID AS $$
DECLARE
    invitation_record RECORD;
BEGIN
    -- Get the invitation details
    SELECT * INTO invitation_record
    FROM game_invitations
    WHERE id = invitation_id AND invitee_id = auth.uid() AND status = 'pending';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found or already processed';
    END IF;
    
    -- Update invitation status
    UPDATE game_invitations
    SET status = 'accepted', updated_at = NOW()
    WHERE id = invitation_id;
    
    -- Add the user to the game's invited_users array if not already there
    UPDATE game_sessions
    SET invited_users = COALESCE(invited_users, '[]'::jsonb) || 
        CASE 
            WHEN invited_users ? invitation_record.invitee_id::text THEN '[]'::jsonb
            ELSE jsonb_build_array(invitation_record.invitee_id::text)
        END
    WHERE id = invitation_record.game_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decline_game_invitation(invitation_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Update invitation status
    UPDATE game_invitations
    SET status = 'declined', updated_at = NOW()
    WHERE id = invitation_id AND invitee_id = auth.uid() AND status = 'pending';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found or already processed';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
