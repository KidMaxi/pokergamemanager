-- Create function to accept friend requests
CREATE OR REPLACE FUNCTION accept_friend_request(request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    request_record friend_requests%ROWTYPE;
BEGIN
    -- Get the friend request
    SELECT * INTO request_record
    FROM friend_requests
    WHERE id = request_id
    AND status = 'pending'
    AND receiver_id = auth.uid(); -- Ensure only the receiver can accept
    
    -- Check if request exists and is pending
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Friend request not found or already processed';
    END IF;
    
    -- Update the request status to accepted
    UPDATE friend_requests
    SET status = 'accepted', updated_at = NOW()
    WHERE id = request_id;
    
    -- Create the friendship (bidirectional)
    INSERT INTO friendships (user_id, friend_id, created_at)
    VALUES 
        (request_record.sender_id, request_record.receiver_id, NOW()),
        (request_record.receiver_id, request_record.sender_id, NOW())
    ON CONFLICT DO NOTHING; -- Prevent duplicates
    
    -- Clean up - delete the accepted request to keep table clean
    DELETE FROM friend_requests WHERE id = request_id;
END;
$$;

-- Create function to remove friendships
CREATE OR REPLACE FUNCTION remove_friendship(friend_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Remove both directions of the friendship
    DELETE FROM friendships
    WHERE (user_id = auth.uid() AND friend_id = friend_user_id)
    OR (user_id = friend_user_id AND friend_id = auth.uid());
    
    -- Also remove any pending friend requests between these users
    DELETE FROM friend_requests
    WHERE (sender_id = auth.uid() AND receiver_id = friend_user_id)
    OR (sender_id = friend_user_id AND receiver_id = auth.uid());
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION accept_friend_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_friendship(uuid) TO authenticated;

-- Create RLS policies for friend_requests table
DROP POLICY IF EXISTS "Users can view their own friend requests" ON friend_requests;
CREATE POLICY "Users can view their own friend requests" ON friend_requests
    FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert friend requests" ON friend_requests;
CREATE POLICY "Users can insert friend requests" ON friend_requests
    FOR INSERT WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their received requests" ON friend_requests;
CREATE POLICY "Users can update their received requests" ON friend_requests
    FOR UPDATE USING (receiver_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own requests" ON friend_requests;
CREATE POLICY "Users can delete their own requests" ON friend_requests
    FOR DELETE USING (sender_id = auth.uid());

-- Create RLS policies for friendships table
DROP POLICY IF EXISTS "Users can view their friendships" ON friendships;
CREATE POLICY "Users can view their friendships" ON friendships
    FOR SELECT USING (user_id = auth.uid() OR friend_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert friendships via function" ON friendships;
CREATE POLICY "Users can insert friendships via function" ON friendships
    FOR INSERT WITH CHECK (true); -- Allow inserts via functions

DROP POLICY IF EXISTS "Users can delete their friendships" ON friendships;
CREATE POLICY "Users can delete their friendships" ON friendships
    FOR DELETE USING (user_id = auth.uid() OR friend_id = auth.uid());

-- Enable RLS on both tables
ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Add helpful indexes for performance
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_status ON friend_requests(sender_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_status ON friend_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships(friend_id);

-- Verification messages
DO $$
BEGIN
    RAISE NOTICE 'Friend system functions created successfully';
    RAISE NOTICE 'RLS policies updated for friend_requests and friendships tables';
    RAISE NOTICE 'Performance indexes added';
END $$;
