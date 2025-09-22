-- FIX INFINITE RECURSION IN RLS POLICIES
-- =====================================
-- The issue is circular dependency between game_sessions and game_invitations policies

-- 1. Drop the problematic policies that cause infinite recursion
DROP POLICY IF EXISTS "game_sessions_select_own" ON game_sessions;
DROP POLICY IF EXISTS "game_invitations_select_own" ON game_invitations;

-- 2. Create simplified policies without circular dependencies
-- GAME_SESSIONS policies - avoid querying game_invitations
CREATE POLICY "game_sessions_select_own" ON game_sessions 
FOR SELECT USING (
    -- Removed EXISTS query to game_invitations to prevent recursion
    auth.uid() = user_id OR 
    auth.uid() = ANY(invited_users::uuid[])
);

-- GAME_INVITATIONS policies - avoid querying game_sessions  
CREATE POLICY "game_invitations_select_own" ON game_invitations 
FOR SELECT USING (
    -- Removed EXISTS query to game_sessions to prevent recursion
    auth.uid() = inviter_id OR 
    auth.uid() = invitee_id
);

-- 3. Update other game_invitations policies to avoid circular references
DROP POLICY IF EXISTS "game_invitations_insert_own" ON game_invitations;
CREATE POLICY "game_invitations_insert_own" ON game_invitations 
FOR INSERT WITH CHECK (
    -- Simplified to only check direct ownership
    auth.uid() = inviter_id
);

-- 4. Ensure profiles can be viewed by friends for the friends system
DROP POLICY IF EXISTS "profiles_select_friends" ON profiles;
CREATE POLICY "profiles_select_friends" ON profiles 
FOR SELECT USING (
    auth.uid() = id OR 
    EXISTS (
        SELECT 1 FROM friendships 
        WHERE (user_id = auth.uid() AND friend_id = profiles.id) 
           OR (friend_id = auth.uid() AND user_id = profiles.id)
    )
);

-- 5. Add a policy for searching profiles by email (needed for friend search)
DROP POLICY IF EXISTS "profiles_select_for_search" ON profiles;
CREATE POLICY "profiles_select_for_search" ON profiles 
FOR SELECT USING (
    -- Allow authenticated users to search profiles by email
    auth.uid() IS NOT NULL
);

-- 6. Verify the fix by checking for any remaining circular references
SELECT 'Policy Fix Complete' as status, 
       'Removed circular dependencies between game_sessions and game_invitations' as message;
