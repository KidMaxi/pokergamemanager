-- Fix infinite recursion in RLS policies by using simple, direct policies
-- Drop all existing policies first to avoid conflicts

-- Drop existing policies for game_sessions
DROP POLICY IF EXISTS "game_sessions_select_own" ON game_sessions;
DROP POLICY IF EXISTS "game_sessions_insert_own" ON game_sessions;
DROP POLICY IF EXISTS "game_sessions_update_own" ON game_sessions;
DROP POLICY IF EXISTS "game_sessions_delete_own" ON game_sessions;

-- Drop existing policies for game_invitations
DROP POLICY IF EXISTS "game_invitations_select_own" ON game_invitations;
DROP POLICY IF EXISTS "game_invitations_insert_own" ON game_invitations;
DROP POLICY IF EXISTS "game_invitations_update_own" ON game_invitations;
DROP POLICY IF EXISTS "game_invitations_delete_own" ON game_invitations;

-- Drop existing policies for friend_requests
DROP POLICY IF EXISTS "friend_requests_select_own" ON friend_requests;
DROP POLICY IF EXISTS "friend_requests_insert_own" ON friend_requests;
DROP POLICY IF EXISTS "friend_requests_update_own" ON friend_requests;
DROP POLICY IF EXISTS "friend_requests_delete_own" ON friend_requests;

-- Drop existing policies for friendships
DROP POLICY IF EXISTS "friendships_select_own" ON friendships;
DROP POLICY IF EXISTS "friendships_insert_own" ON friendships;
DROP POLICY IF EXISTS "friendships_update_own" ON friendships;
DROP POLICY IF EXISTS "friendships_delete_own" ON friendships;

-- Create simple, non-recursive policies for game_sessions
-- Using direct column comparisons without subqueries to avoid recursion
CREATE POLICY "game_sessions_select_policy" ON game_sessions
    FOR SELECT USING (
        user_id = auth.uid() OR 
        auth.uid() = ANY(invited_users)
    );

CREATE POLICY "game_sessions_insert_policy" ON game_sessions
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "game_sessions_update_policy" ON game_sessions
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "game_sessions_delete_policy" ON game_sessions
    FOR DELETE USING (user_id = auth.uid());

-- Create simple policies for game_invitations
-- Direct column comparisons only, no joins or subqueries
CREATE POLICY "game_invitations_select_policy" ON game_invitations
    FOR SELECT USING (
        inviter_id = auth.uid() OR 
        invitee_id = auth.uid()
    );

CREATE POLICY "game_invitations_insert_policy" ON game_invitations
    FOR INSERT WITH CHECK (inviter_id = auth.uid());

CREATE POLICY "game_invitations_update_policy" ON game_invitations
    FOR UPDATE USING (
        inviter_id = auth.uid() OR 
        invitee_id = auth.uid()
    );

CREATE POLICY "game_invitations_delete_policy" ON game_invitations
    FOR DELETE USING (inviter_id = auth.uid());

-- Create simple policies for friend_requests
-- Direct column comparisons to prevent recursion
CREATE POLICY "friend_requests_select_policy" ON friend_requests
    FOR SELECT USING (
        sender_id = auth.uid() OR 
        receiver_id = auth.uid()
    );

CREATE POLICY "friend_requests_insert_policy" ON friend_requests
    FOR INSERT WITH CHECK (sender_id = auth.uid());

CREATE POLICY "friend_requests_update_policy" ON friend_requests
    FOR UPDATE USING (
        sender_id = auth.uid() OR 
        receiver_id = auth.uid()
    );

CREATE POLICY "friend_requests_delete_policy" ON friend_requests
    FOR DELETE USING (sender_id = auth.uid());

-- Create simple policies for friendships
-- Direct column comparisons only
CREATE POLICY "friendships_select_policy" ON friendships
    FOR SELECT USING (
        user_id = auth.uid() OR 
        friend_id = auth.uid()
    );

CREATE POLICY "friendships_insert_policy" ON friendships
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "friendships_update_policy" ON friendships
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "friendships_delete_policy" ON friendships
    FOR DELETE USING (user_id = auth.uid());

-- Ensure RLS is enabled on all tables
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create simple profile policies if they don't exist
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;

CREATE POLICY "profiles_select_policy" ON profiles
    FOR SELECT USING (true); -- Allow reading all profiles for friend discovery

CREATE POLICY "profiles_insert_policy" ON profiles
    FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_policy" ON profiles
    FOR UPDATE USING (id = auth.uid());

-- Grant necessary permissions
GRANT ALL ON game_sessions TO authenticated;
GRANT ALL ON game_invitations TO authenticated;
GRANT ALL ON friend_requests TO authenticated;
GRANT ALL ON friendships TO authenticated;
GRANT ALL ON profiles TO authenticated;

-- Refresh the schema cache
NOTIFY pgrst, 'reload schema';
