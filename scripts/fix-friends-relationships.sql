-- Drop existing tables if they exist to recreate with proper relationships
DROP TABLE IF EXISTS game_invitations CASCADE;
DROP TABLE IF EXISTS friendships CASCADE;

-- Create friendships table with proper foreign key to profiles
CREATE TABLE friendships (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, friend_id),
    CHECK (user_id != friend_id)
);

-- Create game_invitations table
CREATE TABLE game_invitations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_session_id UUID NOT NULL,
    inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(game_session_id, invitee_id)
);

-- Enable RLS
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_invitations ENABLE ROW LEVEL SECURITY;

-- RLS policies for friendships
CREATE POLICY "Users can view their own friendships" ON friendships
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own friendships" ON friendships
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own friendships" ON friendships
    FOR DELETE USING (user_id = auth.uid());

-- RLS policies for game_invitations
CREATE POLICY "Users can view invitations they sent or received" ON game_invitations
    FOR SELECT USING (inviter_id = auth.uid() OR invitee_id = auth.uid());

CREATE POLICY "Users can create invitations they send" ON game_invitations
    FOR INSERT WITH CHECK (inviter_id = auth.uid());

CREATE POLICY "Users can update invitations they received" ON game_invitations
    FOR UPDATE USING (invitee_id = auth.uid());

-- Create indexes for performance
CREATE INDEX idx_friendships_user_id ON friendships(user_id);
CREATE INDEX idx_friendships_friend_id ON friendships(friend_id);
CREATE INDEX idx_game_invitations_invitee_id ON game_invitations(invitee_id);
CREATE INDEX idx_game_invitations_game_session_id ON game_invitations(game_session_id);
CREATE INDEX idx_game_invitations_status ON game_invitations(status);
