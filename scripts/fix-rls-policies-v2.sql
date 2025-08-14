-- Clean RLS policies script without any status column references
-- This migration enables RLS and creates proper policies for the actual database schema

BEGIN;

-- Enable RLS on profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_friends" ON public.profiles;
DROP POLICY IF EXISTS "profiles_upsert_own" ON public.profiles;

-- Profiles policies
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles_select_friends" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.friendships
      WHERE (user_id = auth.uid() AND friend_id = profiles.id)
         OR (friend_id = auth.uid() AND user_id = profiles.id)
    )
  );

CREATE POLICY "profiles_upsert_own" ON public.profiles
  FOR ALL USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Enable RLS on friendships table
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "friendships_select" ON public.friendships;
DROP POLICY IF EXISTS "friendships_insert" ON public.friendships;
DROP POLICY IF EXISTS "friendships_update" ON public.friendships;
DROP POLICY IF EXISTS "friendships_delete" ON public.friendships;

-- Friendships policies (no status column - only confirmed friendships)
CREATE POLICY "friendships_select" ON public.friendships
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "friendships_insert" ON public.friendships
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "friendships_update" ON public.friendships
  FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = friend_id)
  WITH CHECK (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "friendships_delete" ON public.friendships
  FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Enable RLS on friend_requests table
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "friend_requests_select" ON public.friend_requests;
DROP POLICY IF EXISTS "friend_requests_insert" ON public.friend_requests;
DROP POLICY IF EXISTS "friend_requests_update" ON public.friend_requests;
DROP POLICY IF EXISTS "friend_requests_delete" ON public.friend_requests;

-- Friend requests policies (this table has status column)
CREATE POLICY "friend_requests_select" ON public.friend_requests
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "friend_requests_insert" ON public.friend_requests
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "friend_requests_update" ON public.friend_requests
  FOR UPDATE USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

CREATE POLICY "friend_requests_delete" ON public.friend_requests
  FOR DELETE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Enable RLS on game_sessions table
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "game_sessions_owner" ON public.game_sessions;
DROP POLICY IF EXISTS "game_sessions_invitees" ON public.game_sessions;

-- Game sessions policies
CREATE POLICY "game_sessions_owner" ON public.game_sessions
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "game_sessions_invitees" ON public.game_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.game_invitations
      WHERE game_session_id = game_sessions.id
        AND invitee_id = auth.uid()
        AND status = 'accepted'
    )
  );

-- Enable RLS on game_invitations table
ALTER TABLE public.game_invitations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "game_invitations_select" ON public.game_invitations;
DROP POLICY IF EXISTS "game_invitations_insert" ON public.game_invitations;
DROP POLICY IF EXISTS "game_invitations_update" ON public.game_invitations;

-- Game invitations policies
CREATE POLICY "game_invitations_select" ON public.game_invitations
  FOR SELECT USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);

CREATE POLICY "game_invitations_insert" ON public.game_invitations
  FOR INSERT WITH CHECK (auth.uid() = inviter_id);

CREATE POLICY "game_invitations_update" ON public.game_invitations
  FOR UPDATE USING (auth.uid() = invitee_id)
  WITH CHECK (auth.uid() = invitee_id);

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON public.friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON public.friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_id ON public.friend_requests(sender_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_id ON public.friend_requests(receiver_id);
CREATE INDEX IF NOT EXISTS idx_game_invitations_game_session_id ON public.game_invitations(game_session_id);
CREATE INDEX IF NOT EXISTS idx_game_invitations_invitee_id ON public.game_invitations(invitee_id);

COMMIT;
