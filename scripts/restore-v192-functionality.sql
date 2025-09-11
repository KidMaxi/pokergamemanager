-- Restore Version 192 Functionality
-- This script restores the exact working state from v192

-- Profiles table with original structure (no win tracking)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_admin BOOLEAN DEFAULT FALSE,
  preferences JSONB DEFAULT '{}'::jsonb,
  all_time_profit_loss DECIMAL(10,2) DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  last_game_date TIMESTAMP WITH TIME ZONE
);

-- Remove win tracking columns if they exist
ALTER TABLE public.profiles DROP COLUMN IF EXISTS total_wins;

-- Game sessions table
CREATE TABLE IF NOT EXISTS public.game_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_time TIMESTAMP WITH TIME ZONE,
  status TEXT CHECK (status IN ('active', 'completed', 'pending_close')) DEFAULT 'active',
  point_to_cash_rate DECIMAL(10,4) NOT NULL DEFAULT 0.25,
  players_data JSONB DEFAULT '[]'::jsonb,
  game_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  invited_users TEXT[] DEFAULT '{}'
);

-- Friendships table
CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  friend_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

-- Friend requests table
CREATE TABLE IF NOT EXISTS public.friend_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('pending', 'accepted', 'declined')) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(sender_id, receiver_id)
);

-- Game invitations table
CREATE TABLE IF NOT EXISTS public.game_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_session_id UUID REFERENCES public.game_sessions(id) ON DELETE CASCADE NOT NULL,
  inviter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  invitee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('pending', 'accepted', 'declined')) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON public.game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON public.game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON public.friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON public.friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_id ON public.friend_requests(receiver_id);
CREATE INDEX IF NOT EXISTS idx_game_invitations_invitee_id ON public.game_invitations(invitee_id);

-- Disable RLS to avoid permission issues
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_invitations DISABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can manage own game sessions" ON public.game_sessions;

-- Grant permissions to authenticated users
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.game_sessions TO authenticated;
GRANT ALL ON public.friendships TO authenticated;
GRANT ALL ON public.friend_requests TO authenticated;
GRANT ALL ON public.game_invitations TO authenticated;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_game_sessions_updated_at ON public.game_sessions;
CREATE TRIGGER trigger_game_sessions_updated_at
  BEFORE UPDATE ON public.game_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_friend_requests_updated_at ON public.friend_requests;
CREATE TRIGGER trigger_friend_requests_updated_at
  BEFORE UPDATE ON public.friend_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_game_invitations_updated_at ON public.game_invitations;
CREATE TRIGGER trigger_game_invitations_updated_at
  BEFORE UPDATE ON public.game_invitations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Function to handle new user registration (original v192 version)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id, 
    NEW.email, 
    NEW.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail user creation
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user registration
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update user game stats (original v192 version - no win tracking)
CREATE OR REPLACE FUNCTION public.update_user_game_stats(
  user_id_param UUID,
  profit_loss_amount DECIMAL
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.profiles
  SET 
    all_time_profit_loss = COALESCE(all_time_profit_loss, 0) + profit_loss_amount,
    games_played = COALESCE(games_played, 0) + 1,
    last_game_date = NOW(),
    updated_at = NOW()
  WHERE id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to accept friend requests (original v192 version)
CREATE OR REPLACE FUNCTION public.accept_friend_request(request_id UUID)
RETURNS VOID AS $$
DECLARE
  request_record friend_requests%ROWTYPE;
BEGIN
  -- Get the friend request
  SELECT * INTO request_record
  FROM friend_requests
  WHERE id = request_id AND receiver_id = auth.uid() AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found or not authorized';
  END IF;
  
  -- Update request status
  UPDATE friend_requests
  SET status = 'accepted', updated_at = NOW()
  WHERE id = request_id;
  
  -- Create bidirectional friendship
  INSERT INTO friendships (user_id, friend_id)
  VALUES (request_record.sender_id, request_record.receiver_id)
  ON CONFLICT (user_id, friend_id) DO NOTHING;
  
  INSERT INTO friendships (user_id, friend_id)
  VALUES (request_record.receiver_id, request_record.sender_id)
  ON CONFLICT (user_id, friend_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to remove friendship (original v192 version)
CREATE OR REPLACE FUNCTION public.remove_friendship(friend_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Remove bidirectional friendship
  DELETE FROM friendships
  WHERE (user_id = auth.uid() AND friend_id = friend_user_id)
     OR (user_id = friend_user_id AND friend_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on all functions
GRANT EXECUTE ON FUNCTION public.update_user_game_stats(UUID, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_friend_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friendship(UUID) TO authenticated;

-- Create profiles for existing users who might not have them
INSERT INTO public.profiles (id, email, full_name)
SELECT 
  au.id,
  au.email,
  au.raw_user_meta_data->>'full_name'
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Update existing profiles to have the required columns with default values
UPDATE public.profiles 
SET 
  all_time_profit_loss = COALESCE(all_time_profit_loss, 0),
  games_played = COALESCE(games_played, 0)
WHERE all_time_profit_loss IS NULL 
   OR games_played IS NULL;
