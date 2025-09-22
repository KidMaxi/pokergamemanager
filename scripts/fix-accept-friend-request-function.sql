-- Drop existing function if it exists
DROP FUNCTION IF EXISTS accept_friend_request(uuid);

-- Create the accept_friend_request function with proper error handling
CREATE OR REPLACE FUNCTION accept_friend_request(request_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    request_record friend_requests%ROWTYPE;
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

        -- Create the friendship (bidirectional - create one record)
        INSERT INTO friendships (user_id, friend_id, created_at)
        VALUES (request_record.sender_id, request_record.receiver_id, NOW());

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

-- Create or update RLS policies for friend_requests table
DROP POLICY IF EXISTS "Users can view their own friend requests" ON friend_requests;
CREATE POLICY "Users can view their own friend requests" ON friend_requests
    FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert friend requests" ON friend_requests;
CREATE POLICY "Users can insert friend requests" ON friend_requests
    FOR INSERT WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their received requests" ON friend_requests;
CREATE POLICY "Users can update their received requests" ON friend_requests
    FOR UPDATE USING (receiver_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their sent requests" ON friend_requests;
CREATE POLICY "Users can delete their sent requests" ON friend_requests
    FOR DELETE USING (sender_id = auth.uid());

-- Create or update RLS policies for friendships table
DROP POLICY IF EXISTS "Users can view their friendships" ON friendships;
CREATE POLICY "Users can view their friendships" ON friendships
    FOR SELECT USING (user_id = auth.uid() OR friend_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert friendships" ON friendships;
CREATE POLICY "Users can insert friendships" ON friendships
    FOR INSERT WITH CHECK (user_id = auth.uid() OR friend_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their friendships" ON friendships;
CREATE POLICY "Users can delete their friendships" ON friendships
    FOR DELETE USING (user_id = auth.uid() OR friend_id = auth.uid());

-- Ensure RLS is enabled
ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
