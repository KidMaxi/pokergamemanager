-- Comprehensive fix for friend system issues
-- This script addresses RLS policies, missing functions, and database constraints

-- Drop existing functions first to avoid return type conflicts
DROP FUNCTION IF EXISTS public.accept_friend_request(uuid);
DROP FUNCTION IF EXISTS public.remove_friendship(uuid);

-- First, ensure RLS is properly configured for profiles table
-- Allow users to search for other users' profiles for friend requests
DROP POLICY IF EXISTS "profiles_select_for_friends" ON public.profiles;
CREATE POLICY "profiles_select_for_friends" 
ON public.profiles FOR SELECT 
USING (true); -- Allow all authenticated users to search profiles

-- Ensure friend_requests table has proper RLS policies
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friend_requests_select_own" ON public.friend_requests;
CREATE POLICY "friend_requests_select_own" 
ON public.friend_requests FOR SELECT 
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "friend_requests_insert_own" ON public.friend_requests;
CREATE POLICY "friend_requests_insert_own" 
ON public.friend_requests FOR INSERT 
WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "friend_requests_update_own" ON public.friend_requests;
CREATE POLICY "friend_requests_update_own" 
ON public.friend_requests FOR UPDATE 
USING (auth.uid() = receiver_id OR auth.uid() = sender_id);

DROP POLICY IF EXISTS "friend_requests_delete_own" ON public.friend_requests;
CREATE POLICY "friend_requests_delete_own" 
ON public.friend_requests FOR DELETE 
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Ensure friendships table has proper RLS policies
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friendships_select_own" ON public.friendships;
CREATE POLICY "friendships_select_own" 
ON public.friendships FOR SELECT 
USING (auth.uid() = user_id OR auth.uid() = friend_id);

DROP POLICY IF EXISTS "friendships_insert_own" ON public.friendships;
CREATE POLICY "friendships_insert_own" 
ON public.friendships FOR INSERT 
WITH CHECK (auth.uid() = user_id OR auth.uid() = friend_id);

DROP POLICY IF EXISTS "friendships_delete_own" ON public.friendships;
CREATE POLICY "friendships_delete_own" 
ON public.friendships FOR DELETE 
USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Create the accept_friend_request function
CREATE OR REPLACE FUNCTION public.accept_friend_request(request_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    request_record record;
    result json;
BEGIN
    -- Get the friend request details
    SELECT * INTO request_record
    FROM friend_requests
    WHERE id = request_id 
    AND receiver_id = auth.uid()
    AND status = 'pending';
    
    -- Check if request exists and user has permission
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Friend request not found or you do not have permission to accept it'
        );
    END IF;
    
    -- Update the request status to accepted
    UPDATE friend_requests
    SET status = 'accepted', updated_at = now()
    WHERE id = request_id;
    
    -- Create bidirectional friendship records
    INSERT INTO friendships (user_id, friend_id, created_at)
    VALUES 
        (request_record.sender_id, request_record.receiver_id, now()),
        (request_record.receiver_id, request_record.sender_id, now())
    ON CONFLICT (user_id, friend_id) DO NOTHING;
    
    -- Clean up - remove the accepted request after creating friendship
    DELETE FROM friend_requests WHERE id = request_id;
    
    result := json_build_object(
        'success', true,
        'message', 'Friend request accepted successfully'
    );
    
    RETURN result;
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', 'Failed to accept friend request: ' || SQLERRM
    );
END;
$$;

-- Create the remove_friendship function
CREATE OR REPLACE FUNCTION public.remove_friendship(friend_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id uuid;
    result json;
BEGIN
    current_user_id := auth.uid();
    
    -- Check if friendship exists
    IF NOT EXISTS (
        SELECT 1 FROM friendships 
        WHERE (user_id = current_user_id AND friend_id = friend_user_id)
        OR (user_id = friend_user_id AND friend_id = current_user_id)
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Friendship not found'
        );
    END IF;
    
    -- Remove both directions of the friendship
    DELETE FROM friendships 
    WHERE (user_id = current_user_id AND friend_id = friend_user_id)
    OR (user_id = friend_user_id AND friend_id = current_user_id);
    
    result := json_build_object(
        'success', true,
        'message', 'Friendship removed successfully'
    );
    
    RETURN result;
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', 'Failed to remove friendship: ' || SQLERRM
    );
END;
$$;

-- Add unique constraint to prevent duplicate friendships
ALTER TABLE public.friendships 
DROP CONSTRAINT IF EXISTS unique_friendship;

ALTER TABLE public.friendships 
ADD CONSTRAINT unique_friendship 
UNIQUE (user_id, friend_id);

-- Add unique constraint to prevent duplicate friend requests
ALTER TABLE public.friend_requests 
DROP CONSTRAINT IF EXISTS unique_pending_request;

ALTER TABLE public.friend_requests 
ADD CONSTRAINT unique_pending_request 
UNIQUE (sender_id, receiver_id, status) 
DEFERRABLE INITIALLY DEFERRED;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_status 
ON public.friend_requests (receiver_id, status);

CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_status 
ON public.friend_requests (sender_id, status);

CREATE INDEX IF NOT EXISTS idx_friendships_user_id 
ON public.friendships (user_id);

CREATE INDEX IF NOT EXISTS idx_friendships_friend_id 
ON public.friendships (friend_id);

CREATE INDEX IF NOT EXISTS idx_profiles_email 
ON public.profiles (email);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.accept_friend_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friendship(uuid) TO authenticated;

-- Verification queries (commented out for production)
-- SELECT 'Friend system setup completed successfully' as status;
