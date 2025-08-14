-- Fix RLS policies for profiles and friendships tables
-- This migration enables RLS and creates proper policies without losing data

BEGIN;

-- Enable RLS on profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "profiles: self can select" ON public.profiles;
DROP POLICY IF EXISTS "profiles: friends can select" ON public.profiles;
DROP POLICY IF EXISTS "profiles: self upsert" ON public.profiles;

-- Create policies for profiles table
-- Read own profile
CREATE POLICY "profiles: self can select" ON public.profiles
  FOR SELECT USING ( id = auth.uid() );

-- Fixed friends policy to remove non-existent status column
-- Read friends' profiles (friendships table only contains confirmed friendships)
CREATE POLICY "profiles: friends can select" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE (
        (f.user_id = auth.uid() AND f.friend_id = profiles.id)
        OR (f.friend_id = auth.uid() AND f.user_id = profiles.id)
      )
    )
  );

-- Allow upsert only by the profile owner
CREATE POLICY "profiles: self upsert" ON public.profiles
  FOR ALL USING ( id = auth.uid() )
  WITH CHECK ( id = auth.uid() );

-- Enable RLS on friendships table
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "friendships: participants can select" ON public.friendships;
DROP POLICY IF EXISTS "friendships: requester can insert" ON public.friendships;
DROP POLICY IF EXISTS "friendships: participants can update" ON public.friendships;
DROP POLICY IF EXISTS "friendships: participants can delete" ON public.friendships;

-- Create policies for friendships table
-- Read friendships you participate in
CREATE POLICY "friendships: participants can select" ON public.friendships
  FOR SELECT USING (
    auth.uid() = user_id OR auth.uid() = friend_id
  );

-- Create a friendship request as the requester
CREATE POLICY "friendships: requester can insert" ON public.friendships
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
  );

-- Allow updates only to participants
CREATE POLICY "friendships: participants can update" ON public.friendships
  FOR UPDATE USING (
    auth.uid() = user_id OR auth.uid() = friend_id
  ) WITH CHECK (
    auth.uid() = user_id OR auth.uid() = friend_id
  );

-- Allow delete by participants
CREATE POLICY "friendships: participants can delete" ON public.friendships
  FOR DELETE USING (
    auth.uid() = user_id OR auth.uid() = friend_id
  );

-- Added RLS policies for friend_requests table
-- Enable RLS on friend_requests table
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "friend_requests: participants can select" ON public.friend_requests;
DROP POLICY IF EXISTS "friend_requests: sender can insert" ON public.friend_requests;
DROP POLICY IF EXISTS "friend_requests: receiver can update" ON public.friend_requests;
DROP POLICY IF EXISTS "friend_requests: participants can delete" ON public.friend_requests;

-- Create policies for friend_requests table
-- Read friend requests you're involved in
CREATE POLICY "friend_requests: participants can select" ON public.friend_requests
  FOR SELECT USING (
    auth.uid() = sender_id OR auth.uid() = receiver_id
  );

-- Send friend requests
CREATE POLICY "friend_requests: sender can insert" ON public.friend_requests
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
  );

-- Accept/reject friend requests (receiver can update)
CREATE POLICY "friend_requests: receiver can update" ON public.friend_requests
  FOR UPDATE USING (
    auth.uid() = receiver_id
  ) WITH CHECK (
    auth.uid() = receiver_id
  );

-- Delete friend requests (both parties can delete)
CREATE POLICY "friend_requests: participants can delete" ON public.friend_requests
  FOR DELETE USING (
    auth.uid() = sender_id OR auth.uid() = receiver_id
  );

-- Added RLS policies for game_sessions table
-- Enable RLS on game_sessions table
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "game_sessions: owner can manage" ON public.game_sessions;
DROP POLICY IF EXISTS "game_sessions: invitees can select" ON public.game_sessions;

-- Create policies for game_sessions table
-- Game owner can do everything
CREATE POLICY "game_sessions: owner can manage" ON public.game_sessions
  FOR ALL USING ( user_id = auth.uid() )
  WITH CHECK ( user_id = auth.uid() );

-- Invited users can read games they're invited to
CREATE POLICY "game_sessions: invitees can select" ON public.game_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.game_invitations gi
      WHERE gi.game_session_id = game_sessions.id
        AND gi.invitee_id = auth.uid()
        AND gi.status = 'accepted'
    )
  );

-- Added RLS policies for game_invitations table
-- Enable RLS on game_invitations table
ALTER TABLE public.game_invitations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "game_invitations: participants can select" ON public.game_invitations;
DROP POLICY IF EXISTS "game_invitations: inviter can insert" ON public.game_invitations;
DROP POLICY IF EXISTS "game_invitations: invitee can update" ON public.game_invitations;

-- Create policies for game_invitations table
-- Read invitations you're involved in
CREATE POLICY "game_invitations: participants can select" ON public.game_invitations
  FOR SELECT USING (
    auth.uid() = inviter_id OR auth.uid() = invitee_id
  );

-- Send game invitations
CREATE POLICY "game_invitations: inviter can insert" ON public.game_invitations
  FOR INSERT WITH CHECK (
    auth.uid() = inviter_id
  );

-- Accept/reject game invitations
CREATE POLICY "game_invitations: invitee can update" ON public.game_invitations
  FOR UPDATE USING (
    auth.uid() = invitee_id
  ) WITH CHECK (
    auth.uid() = invitee_id
  );

-- Add indexes for better performance (only if missing)
CREATE INDEX IF NOT EXISTS idx_friendships_user ON public.friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON public.friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON public.friend_requests(sender_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON public.friend_requests(receiver_id);
CREATE INDEX IF NOT EXISTS idx_game_invitations_game ON public.game_invitations(game_session_id);
CREATE INDEX IF NOT EXISTS idx_game_invitations_invitee ON public.game_invitations(invitee_id);

-- Unique pair constraint (order-independent)
CREATE UNIQUE INDEX IF NOT EXISTS friendships_unique_pair ON public.friendships (
  LEAST(user_id, friend_id), 
  GREATEST(user_id, friend_id)
);

-- No self-friendship constraint
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'friendships_no_self'
  ) THEN
    ALTER TABLE public.friendships ADD CONSTRAINT friendships_no_self CHECK (user_id <> friend_id);
  END IF;
END $$;

COMMIT;

-- Testing helpers (for SQL editor):
-- SET LOCAL role authenticated;
-- SET LOCAL request.jwt.claims = '{"sub":"<some-existing-user-uuid>"}';
-- SELECT * FROM public.profiles; -- should return user and their friends
</sql>
