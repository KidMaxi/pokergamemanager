-- Add invited_users column to game_sessions table (if it doesn't exist)
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS invited_users TEXT[];

-- Create game_invitations table
CREATE TABLE IF NOT EXISTS game_invitations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    inviter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    invitee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS policies for game_invitations
ALTER TABLE game_invitations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view invitations they sent or received
DROP POLICY IF EXISTS "Users can view their game invitations" ON game_invitations;
CREATE POLICY "Users can view their game invitations" ON game_invitations
    FOR SELECT USING (
        auth.uid() = inviter_id OR 
        auth.uid() = invitee_id
    );

-- Policy: Users can insert invitations they are sending
DROP POLICY IF EXISTS "Users can send game invitations" ON game_invitations;
CREATE POLICY "Users can send game invitations" ON game_invitations
    FOR INSERT WITH CHECK (auth.uid() = inviter_id);

-- Policy: Users can update invitations they received (to accept/decline)
DROP POLICY IF EXISTS "Users can update received invitations" ON game_invitations;
CREATE POLICY "Users can update received invitations" ON game_invitations
    FOR UPDATE USING (auth.uid() = invitee_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_game_invitations_invitee_status ON game_invitations(invitee_id, status);
CREATE INDEX IF NOT EXISTS idx_game_invitations_game_session ON game_invitations(game_session_id);
CREATE INDEX IF NOT EXISTS idx_game_invitations_inviter ON game_invitations(inviter_id);

-- Function to accept game invitation and add user to invited_users array
CREATE OR REPLACE FUNCTION accept_game_invitation(invitation_id UUID)
RETURNS VOID AS $$
DECLARE
    invitation_record game_invitations%ROWTYPE;
BEGIN
    -- Get the invitation details
    SELECT * INTO invitation_record 
    FROM game_invitations 
    WHERE id = invitation_id AND invitee_id = auth.uid();
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found or not authorized';
    END IF;
    
    -- Update invitation status
    UPDATE game_invitations 
    SET status = 'accepted', updated_at = NOW()
    WHERE id = invitation_id;
    
    -- Add invitee to the game session's invited_users array
    UPDATE game_sessions 
    SET invited_users = COALESCE(invited_users, '{}') || ARRAY[invitation_record.invitee_id::TEXT]
    WHERE id = invitation_record.game_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decline game invitation
CREATE OR REPLACE FUNCTION decline_game_invitation(invitation_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Update invitation status
    UPDATE game_invitations 
    SET status = 'declined', updated_at = NOW()
    WHERE id = invitation_id AND invitee_id = auth.uid();
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found or not authorized';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION accept_game_invitation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION decline_game_invitation(UUID) TO authenticated;
