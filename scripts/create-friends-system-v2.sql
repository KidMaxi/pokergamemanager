-- Create friend_requests table
CREATE TABLE IF NOT EXISTS friend_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'declined')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(sender_id, receiver_id)
);

-- Create friendships table (bidirectional relationships)
CREATE TABLE IF NOT EXISTS friendships (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, friend_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON friend_requests(sender_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON friend_requests(receiver_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_status ON friend_requests(status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_created_at ON friend_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);

-- Enable RLS
ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- RLS Policies for friend_requests
CREATE POLICY "Users can view their own sent requests" ON friend_requests
    FOR SELECT USING (sender_id = auth.uid());

CREATE POLICY "Users can view requests sent to them" ON friend_requests
    FOR SELECT USING (receiver_id = auth.uid());

CREATE POLICY "Users can send friend requests" ON friend_requests
    FOR INSERT WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Users can update requests sent to them" ON friend_requests
    FOR UPDATE USING (receiver_id = auth.uid());

CREATE POLICY "Users can delete their own sent requests" ON friend_requests
    FOR DELETE USING (sender_id = auth.uid());

-- RLS Policies for friendships
CREATE POLICY "Users can view their friendships" ON friendships
    FOR SELECT USING (user_id = auth.uid() OR friend_id = auth.uid());

CREATE POLICY "Users can create friendships" ON friendships
    FOR INSERT WITH CHECK (user_id = auth.uid() OR friend_id = auth.uid());

CREATE POLICY "Users can delete their friendships" ON friendships
    FOR DELETE USING (user_id = auth.uid() OR friend_id = auth.uid());

-- Function to accept friend request and create bidirectional friendship
CREATE OR REPLACE FUNCTION accept_friend_request(request_id UUID)
RETURNS VOID AS $$
DECLARE
    req_sender_id UUID;
    req_receiver_id UUID;
BEGIN
    -- Get the request details
    SELECT sender_id, receiver_id INTO req_sender_id, req_receiver_id
    FROM friend_requests 
    WHERE id = request_id AND receiver_id = auth.uid() AND status = 'pending';
    
    IF req_sender_id IS NULL THEN
        RAISE EXCEPTION 'Friend request not found or not authorized';
    END IF;
    
    -- Delete the friend request (no longer needed)
    DELETE FROM friend_requests WHERE id = request_id;
    
    -- Create bidirectional friendship
    INSERT INTO friendships (user_id, friend_id) VALUES (req_sender_id, req_receiver_id);
    INSERT INTO friendships (user_id, friend_id) VALUES (req_receiver_id, req_sender_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to remove friendship (bidirectional)
CREATE OR REPLACE FUNCTION remove_friendship(friend_user_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Remove both directions of the friendship
    DELETE FROM friendships 
    WHERE (user_id = auth.uid() AND friend_id = friend_user_id)
       OR (user_id = friend_user_id AND friend_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old friend requests (run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_friend_requests()
RETURNS VOID AS $$
BEGIN
    -- Delete friend requests older than 48 hours
    DELETE FROM friend_requests 
    WHERE created_at < NOW() - INTERVAL '48 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a scheduled job to cleanup old requests (if using pg_cron extension)
-- SELECT cron.schedule('cleanup-friend-requests', '0 */6 * * *', 'SELECT cleanup_old_friend_requests();');
