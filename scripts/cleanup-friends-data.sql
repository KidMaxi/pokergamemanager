-- Comprehensive cleanup and setup script for friends system
-- This script ensures bidirectional friendships and proper data integrity

-- First, let's clean up any duplicate or orphaned data
DELETE FROM friend_requests WHERE sender_id = receiver_id;
DELETE FROM friendships WHERE user_id = friend_id;

-- Remove duplicate friend requests (keep the oldest one)
WITH duplicate_requests AS (
    SELECT id, ROW_NUMBER() OVER (
        PARTITION BY LEAST(sender_id::text, receiver_id::text), GREATEST(sender_id::text, receiver_id::text)
        ORDER BY created_at ASC
    ) as rn
    FROM friend_requests
)
DELETE FROM friend_requests 
WHERE id IN (
    SELECT id FROM duplicate_requests WHERE rn > 1
);

-- Ensure all friendships are bidirectional
-- First, find all unique friendship pairs
WITH friendship_pairs AS (
    SELECT DISTINCT
        LEAST(user_id, friend_id) as user1,
        GREATEST(user_id, friend_id) as user2,
        MIN(created_at) as earliest_date
    FROM friendships
    WHERE user_id != friend_id
    GROUP BY LEAST(user_id, friend_id), GREATEST(user_id, friend_id)
)
-- Clear existing friendships and recreate them bidirectionally
, clear_friendships AS (
    DELETE FROM friendships
    WHERE user_id != friend_id
    RETURNING *
)
-- Insert bidirectional friendships
INSERT INTO friendships (user_id, friend_id, created_at)
SELECT user1, user2, earliest_date FROM friendship_pairs
UNION ALL
SELECT user2, user1, earliest_date FROM friendship_pairs
ON CONFLICT (user_id, friend_id) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friendships_created_at ON friendships(created_at);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_id ON friend_requests(sender_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_id ON friend_requests(receiver_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_status ON friend_requests(status);

-- Enable RLS if not already enabled
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their friendships" ON friendships;
DROP POLICY IF EXISTS "Users can manage their friendships" ON friendships;
DROP POLICY IF EXISTS "Users can view their friend requests" ON friend_requests;
DROP POLICY IF EXISTS "Users can create friend requests" ON friend_requests;
DROP POLICY IF EXISTS "Users can update their received requests" ON friend_requests;
DROP POLICY IF EXISTS "Users can delete their own requests" ON friend_requests;

-- Create comprehensive RLS policies for friendships
CREATE POLICY "Users can view their friendships" ON friendships
    FOR SELECT USING (user_id = auth.uid() OR friend_id = auth.uid());

CREATE POLICY "Users can create friendships" ON friendships
    FOR INSERT WITH CHECK (user_id = auth.uid() OR friend_id = auth.uid());

CREATE POLICY "Users can delete their friendships" ON friendships
    FOR DELETE USING (user_id = auth.uid() OR friend_id = auth.uid());

-- Create comprehensive RLS policies for friend requests
CREATE POLICY "Users can view their friend requests" ON friend_requests
    FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "Users can create friend requests" ON friend_requests
    FOR INSERT WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Users can update their received requests" ON friend_requests
    FOR UPDATE USING (receiver_id = auth.uid());

CREATE POLICY "Users can delete their own requests" ON friend_requests
    FOR DELETE USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Create helper functions for friend management
CREATE OR REPLACE FUNCTION get_user_friends(user_id UUID)
RETURNS TABLE (
    friend_id UUID,
    friend_name TEXT,
    friend_email TEXT,
    friendship_created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        f.friend_id,
        p.full_name as friend_name,
        p.email as friend_email,
        f.created_at as friendship_created_at
    FROM friendships f
    JOIN profiles p ON f.friend_id = p.id
    WHERE f.user_id = user_id
    ORDER BY f.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION send_friend_request(sender_id UUID, receiver_id UUID)
RETURNS JSON AS $$
DECLARE
    existing_friendship INTEGER;
    existing_request INTEGER;
BEGIN
    -- Check if users are the same
    IF sender_id = receiver_id THEN
        RETURN json_build_object('success', false, 'message', 'Cannot send friend request to yourself');
    END IF;
    
    -- Check if already friends
    SELECT COUNT(*) INTO existing_friendship
    FROM friendships 
    WHERE (user_id = sender_id AND friend_id = receiver_id)
       OR (user_id = receiver_id AND friend_id = sender_id);
    
    IF existing_friendship > 0 THEN
        RETURN json_build_object('success', false, 'message', 'Already friends with this user');
    END IF;
    
    -- Check if request already exists (in either direction)
    SELECT COUNT(*) INTO existing_request
    FROM friend_requests 
    WHERE ((sender_id = send_friend_request.sender_id AND receiver_id = send_friend_request.receiver_id)
        OR (sender_id = send_friend_request.receiver_id AND receiver_id = send_friend_request.sender_id))
      AND status = 'pending';
    
    IF existing_request > 0 THEN
        RETURN json_build_object('success', false, 'message', 'Friend request already exists');
    END IF;
    
    -- Create the friend request
    INSERT INTO friend_requests (sender_id, receiver_id, status, created_at, updated_at)
    VALUES (sender_id, receiver_id, 'pending', NOW(), NOW());
    
    RETURN json_build_object('success', true, 'message', 'Friend request sent successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION accept_friend_request(request_id UUID, accepting_user_id UUID)
RETURNS JSON AS $$
DECLARE
    request_record RECORD;
BEGIN
    -- Get the request details
    SELECT * INTO request_record
    FROM friend_requests 
    WHERE id = request_id 
      AND receiver_id = accepting_user_id 
      AND status = 'pending';
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Friend request not found or already processed');
    END IF;
    
    -- Create bidirectional friendship
    INSERT INTO friendships (user_id, friend_id, created_at) 
    VALUES 
        (request_record.sender_id, request_record.receiver_id, NOW()),
        (request_record.receiver_id, request_record.sender_id, NOW())
    ON CONFLICT (user_id, friend_id) DO NOTHING;
    
    -- Delete the request
    DELETE FROM friend_requests WHERE id = request_id;
    
    RETURN json_build_object('success', true, 'message', 'Friend request accepted');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION remove_friendship(user_id UUID, friend_id UUID)
RETURNS JSON AS $$
BEGIN
    -- Remove both directions of the friendship
    DELETE FROM friendships 
    WHERE (user_id = remove_friendship.user_id AND friend_id = remove_friendship.friend_id)
       OR (user_id = remove_friendship.friend_id AND friend_id = remove_friendship.user_id);
    
    IF FOUND THEN
        RETURN json_build_object('success', true, 'message', 'Friendship removed successfully');
    ELSE
        RETURN json_build_object('success', false, 'message', 'Friendship not found');
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_user_friends(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION send_friend_request(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_friend_request(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_friendship(UUID, UUID) TO authenticated;

-- Final cleanup: Remove any orphaned records
DELETE FROM friend_requests 
WHERE sender_id NOT IN (SELECT id FROM profiles)
   OR receiver_id NOT IN (SELECT id FROM profiles);

DELETE FROM friendships 
WHERE user_id NOT IN (SELECT id FROM profiles)
   OR friend_id NOT IN (SELECT id FROM profiles);

-- Summary
SELECT 'CLEANUP COMPLETE' as status;
SELECT COUNT(*) as total_friendships FROM friendships;
SELECT COUNT(*) as total_friend_requests FROM friend_requests;
SELECT COUNT(*) as total_profiles FROM profiles;
