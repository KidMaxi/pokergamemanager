-- COMPREHENSIVE DATABASE SCHEMA ANALYSIS AND FIXES
-- ================================================

-- 1. CRITICAL ISSUE: Missing Foreign Key Relationships
-- The debug logs show "Could not find a relationship between 'game_invitations' and 'game_sessions'"
-- This suggests missing or improperly configured foreign key constraints

-- Check current foreign key constraints
SELECT 
    tc.table_name, 
    tc.constraint_name, 
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;

-- 2. FIX: Add missing foreign key constraints
-- game_invitations should reference game_sessions and profiles
ALTER TABLE game_invitations 
DROP CONSTRAINT IF EXISTS game_invitations_game_session_id_fkey;

ALTER TABLE game_invitations 
ADD CONSTRAINT game_invitations_game_session_id_fkey 
FOREIGN KEY (game_session_id) REFERENCES game_sessions(id) ON DELETE CASCADE;

ALTER TABLE game_invitations 
DROP CONSTRAINT IF EXISTS game_invitations_inviter_id_fkey;

ALTER TABLE game_invitations 
ADD CONSTRAINT game_invitations_inviter_id_fkey 
FOREIGN KEY (inviter_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE game_invitations 
DROP CONSTRAINT IF EXISTS game_invitations_invitee_id_fkey;

ALTER TABLE game_invitations 
ADD CONSTRAINT game_invitations_invitee_id_fkey 
FOREIGN KEY (invitee_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 3. FIX: Ensure all user-related tables reference auth.users properly
-- profiles table should reference auth.users(id)
ALTER TABLE profiles 
DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE profiles 
ADD CONSTRAINT profiles_id_fkey 
FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- friendships table should reference profiles
ALTER TABLE friendships 
DROP CONSTRAINT IF EXISTS friendships_user_id_fkey;

ALTER TABLE friendships 
ADD CONSTRAINT friendships_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE friendships 
DROP CONSTRAINT IF EXISTS friendships_friend_id_fkey;

ALTER TABLE friendships 
ADD CONSTRAINT friendships_friend_id_fkey 
FOREIGN KEY (friend_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- friend_requests table should reference profiles
ALTER TABLE friend_requests 
DROP CONSTRAINT IF EXISTS friend_requests_sender_id_fkey;

ALTER TABLE friend_requests 
ADD CONSTRAINT friend_requests_sender_id_fkey 
FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE friend_requests 
DROP CONSTRAINT IF EXISTS friend_requests_receiver_id_fkey;

ALTER TABLE friend_requests 
ADD CONSTRAINT friend_requests_receiver_id_fkey 
FOREIGN KEY (receiver_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- game_sessions should reference profiles
ALTER TABLE game_sessions 
DROP CONSTRAINT IF EXISTS game_sessions_user_id_fkey;

ALTER TABLE game_sessions 
ADD CONSTRAINT game_sessions_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 4. CRITICAL: Enable Row Level Security on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_invitations ENABLE ROW LEVEL SECURITY;

-- 5. DROP existing policies to recreate them properly
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_own" ON profiles;

DROP POLICY IF EXISTS "friendships_select_own" ON friendships;
DROP POLICY IF EXISTS "friendships_insert_own" ON friendships;
DROP POLICY IF EXISTS "friendships_delete_own" ON friendships;

DROP POLICY IF EXISTS "friend_requests_select_own" ON friend_requests;
DROP POLICY IF EXISTS "friend_requests_insert_own" ON friend_requests;
DROP POLICY IF EXISTS "friend_requests_update_own" ON friend_requests;
DROP POLICY IF EXISTS "friend_requests_delete_own" ON friend_requests;

DROP POLICY IF EXISTS "game_sessions_select_own" ON game_sessions;
DROP POLICY IF EXISTS "game_sessions_insert_own" ON game_sessions;
DROP POLICY IF EXISTS "game_sessions_update_own" ON game_sessions;
DROP POLICY IF EXISTS "game_sessions_delete_own" ON game_sessions;

DROP POLICY IF EXISTS "game_invitations_select_own" ON game_invitations;
DROP POLICY IF EXISTS "game_invitations_insert_own" ON game_invitations;
DROP POLICY IF EXISTS "game_invitations_update_own" ON game_invitations;
DROP POLICY IF EXISTS "game_invitations_delete_own" ON game_invitations;

-- 6. CREATE comprehensive RLS policies
-- PROFILES policies
CREATE POLICY "profiles_select_own" ON profiles 
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_select_friends" ON profiles 
FOR SELECT USING (
    auth.uid() = id OR 
    EXISTS (
        SELECT 1 FROM friendships 
        WHERE (user_id = auth.uid() AND friend_id = profiles.id) 
           OR (friend_id = auth.uid() AND user_id = profiles.id)
    )
);

CREATE POLICY "profiles_insert_own" ON profiles 
FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON profiles 
FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "profiles_delete_own" ON profiles 
FOR DELETE USING (auth.uid() = id);

-- FRIENDSHIPS policies (bidirectional access)
CREATE POLICY "friendships_select_own" ON friendships 
FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "friendships_insert_own" ON friendships 
FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "friendships_delete_own" ON friendships 
FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- FRIEND_REQUESTS policies
CREATE POLICY "friend_requests_select_own" ON friend_requests 
FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "friend_requests_insert_own" ON friend_requests 
FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "friend_requests_update_own" ON friend_requests 
FOR UPDATE USING (auth.uid() = receiver_id OR auth.uid() = sender_id);

CREATE POLICY "friend_requests_delete_own" ON friend_requests 
FOR DELETE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- GAME_SESSIONS policies
CREATE POLICY "game_sessions_select_own" ON game_sessions 
FOR SELECT USING (
    auth.uid() = user_id OR 
    auth.uid() = ANY(invited_users) OR
    EXISTS (
        SELECT 1 FROM game_invitations gi 
        WHERE gi.game_session_id = game_sessions.id 
        AND gi.invitee_id = auth.uid()
        AND gi.status = 'accepted'
    )
);

CREATE POLICY "game_sessions_insert_own" ON game_sessions 
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "game_sessions_update_own" ON game_sessions 
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "game_sessions_delete_own" ON game_sessions 
FOR DELETE USING (auth.uid() = user_id);

-- GAME_INVITATIONS policies
CREATE POLICY "game_invitations_select_own" ON game_invitations 
FOR SELECT USING (
    auth.uid() = inviter_id OR 
    auth.uid() = invitee_id OR
    EXISTS (
        SELECT 1 FROM game_sessions gs 
        WHERE gs.id = game_invitations.game_session_id 
        AND gs.user_id = auth.uid()
    )
);

CREATE POLICY "game_invitations_insert_own" ON game_invitations 
FOR INSERT WITH CHECK (
    auth.uid() = inviter_id OR
    EXISTS (
        SELECT 1 FROM game_sessions gs 
        WHERE gs.id = game_session_id 
        AND gs.user_id = auth.uid()
    )
);

CREATE POLICY "game_invitations_update_own" ON game_invitations 
FOR UPDATE USING (auth.uid() = invitee_id OR auth.uid() = inviter_id);

CREATE POLICY "game_invitations_delete_own" ON game_invitations 
FOR DELETE USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);

-- 7. CREATE missing indexes for performance
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_id ON friend_requests(sender_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_id ON friend_requests(receiver_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_status ON friend_requests(status);
CREATE INDEX IF NOT EXISTS idx_game_invitations_game_session_id ON game_invitations(game_session_id);
CREATE INDEX IF NOT EXISTS idx_game_invitations_invitee_id ON game_invitations(invitee_id);
CREATE INDEX IF NOT EXISTS idx_game_invitations_status ON game_invitations(status);
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status);

-- 8. CREATE auto-profile creation trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY definer
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, created_at, updated_at, games_played, total_wins, all_time_profit_loss, is_admin)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'full_name', SPLIT_PART(new.email, '@', 1)),
        new.created_at,
        NOW(),
        0,
        0,
        0,
        false
    )
    ON CONFLICT (id) DO NOTHING;
    
    RETURN new;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 9. CREATE profiles for existing auth users who don't have profiles
INSERT INTO profiles (id, email, full_name, created_at, updated_at, games_played, total_wins, all_time_profit_loss, is_admin)
SELECT 
    au.id,
    au.email,
    COALESCE(au.raw_user_meta_data->>'full_name', SPLIT_PART(au.email, '@', 1)) as full_name,
    au.created_at,
    NOW(),
    0,
    0,
    0,
    false
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
WHERE p.id IS NULL
AND au.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 10. VERIFICATION QUERIES
-- Check that all relationships are properly established
SELECT 'Foreign Key Constraints' as check_type, COUNT(*) as count
FROM information_schema.table_constraints 
WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public';

-- Check that all tables have RLS enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Check profile creation results
SELECT 'Profile Creation Results' as check_type, COUNT(*) as profiles_created
FROM profiles;

-- Check for orphaned records
SELECT 'Orphaned Game Invitations' as check_type, COUNT(*) as count
FROM game_invitations gi
LEFT JOIN game_sessions gs ON gi.game_session_id = gs.id
WHERE gs.id IS NULL;

SELECT 'Orphaned Friendships' as check_type, COUNT(*) as count
FROM friendships f
LEFT JOIN profiles p1 ON f.user_id = p1.id
LEFT JOIN profiles p2 ON f.friend_id = p2.id
WHERE p1.id IS NULL OR p2.id IS NULL;

-- Final status report
SELECT 
    'Database Analysis Complete' as status,
    'All foreign keys, RLS policies, and triggers have been configured' as message;
