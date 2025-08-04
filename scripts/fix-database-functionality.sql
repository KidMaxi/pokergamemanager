-- Fix Database Functionality - Restore All Working Features
-- This script ensures all core functionality works without RLS

-- 1. Ensure profiles table exists with correct structure
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- User stats tracking
    games_played INTEGER DEFAULT 0,
    all_time_profit_loss DECIMAL(10,2) DEFAULT 0.00,
    last_game_date TIMESTAMP WITH TIME ZONE,
    -- Additional profile fields
    username TEXT UNIQUE,
    bio TEXT,
    privacy_settings JSONB DEFAULT '{"profile_visible": true, "stats_visible": true}'::jsonb
);

-- 2. Ensure game_sessions table exists with correct structure
CREATE TABLE IF NOT EXISTS public.game_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'pending_close')),
    point_to_cash_rate DECIMAL(10,2) DEFAULT 0.25,
    players_data JSONB DEFAULT '[]'::jsonb,
    game_metadata JSONB DEFAULT '{}'::jsonb,
    invited_users UUID[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Ensure friend_requests table exists
CREATE TABLE IF NOT EXISTS public.friend_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(sender_id, receiver_id)
);

-- 4. Ensure friendships table exists
CREATE TABLE IF NOT EXISTS public.friendships (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user1_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    user2_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user1_id, user2_id),
    CHECK (user1_id != user2_id)
);

-- 5. Ensure game_invitations table exists
CREATE TABLE IF NOT EXISTS public.game_invitations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    game_session_id UUID REFERENCES public.game_sessions(id) ON DELETE CASCADE NOT NULL,
    inviter_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    invitee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(game_session_id, invitee_id)
);

-- 6. Create or replace the user registration trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, created_at, updated_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NOW(),
        NOW()
    );
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the user creation
        RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create or replace the user stats update function
CREATE OR REPLACE FUNCTION public.update_user_game_stats(
    user_id_param UUID,
    profit_loss_amount DECIMAL
)
RETURNS JSON AS $$
DECLARE
    result_data JSON;
BEGIN
    -- Update user stats
    UPDATE public.profiles 
    SET 
        games_played = COALESCE(games_played, 0) + 1,
        all_time_profit_loss = COALESCE(all_time_profit_loss, 0) + profit_loss_amount,
        last_game_date = NOW(),
        updated_at = NOW()
    WHERE id = user_id_param;

    -- Return updated stats
    SELECT json_build_object(
        'user_id', id,
        'games_played', games_played,
        'all_time_profit_loss', all_time_profit_loss,
        'last_game_date', last_game_date,
        'updated_at', updated_at
    ) INTO result_data
    FROM public.profiles
    WHERE id = user_id_param;

    RETURN COALESCE(result_data, '{"error": "User not found"}'::json);
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'error', 'Failed to update user stats',
            'message', SQLERRM,
            'user_id', user_id_param,
            'profit_loss', profit_loss_amount
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Create friend request management functions
CREATE OR REPLACE FUNCTION public.send_friend_request(
    sender_id_param UUID,
    receiver_email_param TEXT
)
RETURNS JSON AS $$
DECLARE
    receiver_id_var UUID;
    existing_request_id UUID;
    existing_friendship_id UUID;
    result_data JSON;
BEGIN
    -- Find receiver by email
    SELECT id INTO receiver_id_var
    FROM auth.users
    WHERE email = receiver_email_param;

    IF receiver_id_var IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'User not found');
    END IF;

    IF sender_id_param = receiver_id_var THEN
        RETURN json_build_object('success', false, 'message', 'Cannot send friend request to yourself');
    END IF;

    -- Check if already friends
    SELECT id INTO existing_friendship_id
    FROM public.friendships
    WHERE (user1_id = sender_id_param AND user2_id = receiver_id_var)
       OR (user1_id = receiver_id_var AND user2_id = sender_id_param);

    IF existing_friendship_id IS NOT NULL THEN
        RETURN json_build_object('success', false, 'message', 'Already friends');
    END IF;

    -- Check for existing request
    SELECT id INTO existing_request_id
    FROM public.friend_requests
    WHERE (sender_id = sender_id_param AND receiver_id = receiver_id_var)
       OR (sender_id = receiver_id_var AND receiver_id = sender_id_param);

    IF existing_request_id IS NOT NULL THEN
        RETURN json_build_object('success', false, 'message', 'Friend request already exists');
    END IF;

    -- Create friend request
    INSERT INTO public.friend_requests (sender_id, receiver_id, status)
    VALUES (sender_id_param, receiver_id_var, 'pending');

    RETURN json_build_object('success', true, 'message', 'Friend request sent successfully');
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'message', 'Error sending friend request: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Create function to accept friend requests
CREATE OR REPLACE FUNCTION public.accept_friend_request(
    request_id_param UUID,
    user_id_param UUID
)
RETURNS JSON AS $$
DECLARE
    request_record RECORD;
    friendship_id UUID;
BEGIN
    -- Get the friend request
    SELECT * INTO request_record
    FROM public.friend_requests
    WHERE id = request_id_param AND receiver_id = user_id_param AND status = 'pending';

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Friend request not found or already processed');
    END IF;

    -- Create friendship (ensure consistent ordering)
    INSERT INTO public.friendships (user1_id, user2_id)
    VALUES (
        LEAST(request_record.sender_id, request_record.receiver_id),
        GREATEST(request_record.sender_id, request_record.receiver_id)
    )
    RETURNING id INTO friendship_id;

    -- Update request status
    UPDATE public.friend_requests
    SET status = 'accepted', updated_at = NOW()
    WHERE id = request_id_param;

    RETURN json_build_object('success', true, 'message', 'Friend request accepted', 'friendship_id', friendship_id);
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'message', 'Error accepting friend request: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Create function to reject friend requests
CREATE OR REPLACE FUNCTION public.reject_friend_request(
    request_id_param UUID,
    user_id_param UUID
)
RETURNS JSON AS $$
BEGIN
    UPDATE public.friend_requests
    SET status = 'rejected', updated_at = NOW()
    WHERE id = request_id_param AND receiver_id = user_id_param AND status = 'pending';

    IF FOUND THEN
        RETURN json_build_object('success', true, 'message', 'Friend request rejected');
    ELSE
        RETURN json_build_object('success', false, 'message', 'Friend request not found or already processed');
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'message', 'Error rejecting friend request: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Create function to accept game invitations
CREATE OR REPLACE FUNCTION public.accept_game_invitation(
    invitation_id_param UUID,
    user_id_param UUID
)
RETURNS JSON AS $$
DECLARE
    invitation_record RECORD;
BEGIN
    -- Get the invitation
    SELECT * INTO invitation_record
    FROM public.game_invitations
    WHERE id = invitation_id_param AND invitee_id = user_id_param AND status = 'pending';

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Game invitation not found or already processed');
    END IF;

    -- Update invitation status
    UPDATE public.game_invitations
    SET status = 'accepted', updated_at = NOW()
    WHERE id = invitation_id_param;

    RETURN json_build_object(
        'success', true, 
        'message', 'Game invitation accepted',
        'game_session_id', invitation_record.game_session_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'message', 'Error accepting game invitation: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Ensure the trigger exists for new user registration
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 13. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON public.game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON public.game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON public.friend_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON public.friend_requests(sender_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_user1 ON public.friendships(user1_id);
CREATE INDEX IF NOT EXISTS idx_friendships_user2 ON public.friendships(user2_id);
CREATE INDEX IF NOT EXISTS idx_game_invitations_invitee ON public.game_invitations(invitee_id, status);
CREATE INDEX IF NOT EXISTS idx_game_invitations_game ON public.game_invitations(game_session_id);

-- 14. Grant necessary permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.game_sessions TO authenticated;
GRANT ALL ON public.friend_requests TO authenticated;
GRANT ALL ON public.friendships TO authenticated;
GRANT ALL ON public.game_invitations TO authenticated;

-- 15. Ensure RLS is disabled on all tables (no restrictions)
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_invitations DISABLE ROW LEVEL SECURITY;

-- 16. Drop any existing RLS policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own games" ON public.game_sessions;
DROP POLICY IF EXISTS "Users can manage own games" ON public.game_sessions;
DROP POLICY IF EXISTS "Users can view own friend requests" ON public.friend_requests;
DROP POLICY IF EXISTS "Users can manage friend requests" ON public.friend_requests;
DROP POLICY IF EXISTS "Users can view friendships" ON public.friendships;
DROP POLICY IF EXISTS "Users can view game invitations" ON public.game_invitations;

-- 17. Create a simple function to test database connectivity
CREATE OR REPLACE FUNCTION public.test_connection()
RETURNS JSON AS $$
BEGIN
    RETURN json_build_object(
        'status', 'success',
        'message', 'Database connection working',
        'timestamp', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 18. Create function to get user profile safely
CREATE OR REPLACE FUNCTION public.get_user_profile(user_id_param UUID)
RETURNS JSON AS $$
DECLARE
    profile_data JSON;
BEGIN
    SELECT json_build_object(
        'id', id,
        'full_name', full_name,
        'avatar_url', avatar_url,
        'username', username,
        'bio', bio,
        'games_played', COALESCE(games_played, 0),
        'all_time_profit_loss', COALESCE(all_time_profit_loss, 0),
        'last_game_date', last_game_date,
        'created_at', created_at,
        'updated_at', updated_at
    ) INTO profile_data
    FROM public.profiles
    WHERE id = user_id_param;

    RETURN COALESCE(profile_data, '{"error": "Profile not found"}'::json);
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('error', 'Error fetching profile: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 19. Ensure all functions have proper permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_game_stats(UUID, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_friend_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_friend_request(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_friend_request(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_game_invitation(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_connection() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_profile(UUID) TO authenticated;

-- Success message
SELECT 'Database functionality restored successfully! All core features should now work properly.' as status;
