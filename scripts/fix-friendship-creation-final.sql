-- Fix friendship creation issues: bidirectional logic and RPC return type

-- Drop existing function to recreate with proper return handling
DROP FUNCTION IF EXISTS public.accept_friend_request(uuid);

-- Create improved accept_friend_request function that avoids duplicate returns
CREATE OR REPLACE FUNCTION public.accept_friend_request(request_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    request_record record;
    friendship_exists boolean := false;
BEGIN
    -- Get the friend request details
    SELECT * INTO request_record
    FROM friend_requests
    WHERE id = request_id
    AND status = 'pending'
    AND receiver_id = auth.uid(); -- Ensure only the receiver can accept

    -- Check if request exists and is valid
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Friend request not found or you do not have permission to accept it'
        );
    END IF;

    -- Check if friendship already exists
    SELECT EXISTS(
        SELECT 1 FROM friendships
        WHERE (user_id = request_record.sender_id AND friend_id = request_record.receiver_id)
           OR (user_id = request_record.receiver_id AND friend_id = request_record.sender_id)
    ) INTO friendship_exists;

    IF friendship_exists THEN
        -- Update request status to accepted even if friendship exists
        UPDATE friend_requests
        SET status = 'accepted', updated_at = NOW()
        WHERE id = request_id;
        
        RETURN json_build_object(
            'success', true,
            'message', 'You are already friends with this user'
        );
    END IF;

    -- Start transaction
    BEGIN
        -- Update the friend request status
        UPDATE friend_requests
        SET status = 'accepted', updated_at = NOW()
        WHERE id = request_id;

        -- Create bidirectional friendship records (both directions)
        INSERT INTO friendships (user_id, friend_id, created_at)
        VALUES 
            (request_record.sender_id, request_record.receiver_id, NOW()),
            (request_record.receiver_id, request_record.sender_id, NOW())
        ON CONFLICT (user_id, friend_id) DO NOTHING;

        -- Return success
        RETURN json_build_object(
            'success', true,
            'message', 'Friend request accepted successfully'
        );

    EXCEPTION WHEN OTHERS THEN
        -- Log the error and return failure
        RAISE LOG 'Error in accept_friend_request: %', SQLERRM;
        RETURN json_build_object(
            'success', false,
            'error', 'Database error: ' || SQLERRM
        );
    END;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION accept_friend_request(uuid) TO authenticated;

-- Fix the friendships query to avoid duplicates by using a consistent direction
-- Update RLS policy to ensure consistent friendship direction queries
DROP POLICY IF EXISTS "friendships_select_own" ON public.friendships;
CREATE POLICY "friendships_select_own" 
ON public.friendships FOR SELECT 
USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Add unique constraint to prevent duplicate friendships
ALTER TABLE public.friendships 
DROP CONSTRAINT IF EXISTS unique_friendship;

ALTER TABLE public.friendships 
ADD CONSTRAINT unique_friendship 
UNIQUE (user_id, friend_id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_friendships_user_friend 
ON public.friendships (user_id, friend_id);
