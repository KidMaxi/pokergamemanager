-- Create friend_requests table
CREATE TABLE IF NOT EXISTS friend_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'declined')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(sender_id, receiver_id)
);

-- Create friendships table
CREATE TABLE IF NOT EXISTS friendships (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
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

-- Function to accept friend request (creates friendship and deletes request)
CREATE OR REPLACE FUNCTION accept_friend_request(request_id UUID)
RETURNS VOID AS $$
DECLARE
    req_record RECORD;
BEGIN
    -- Get the request details
    SELECT sender_id, receiver_id INTO req_record
    FROM friend_requests 
    WHERE id = request_id AND status = 'pending';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Friend request not found or already processed';
    END IF;
    
    -- Create bidirectional friendship
    INSERT INTO friendships (user_id, friend_id) 
    VALUES (req_record.sender_id, req_record.receiver_id);
    
    INSERT INTO friendships (user_id, friend_id) 
    VALUES (req_record.receiver_id, req_record.sender_id);
    
    -- Delete the request (no need to keep accepted requests)
    DELETE FROM friend_requests WHERE id = request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to remove friendship (removes both directions)
CREATE OR REPLACE FUNCTION remove_friendship(friend_user_id UUID)
RETURNS VOID AS $$
BEGIN
    DELETE FROM friendships 
    WHERE (user_id = auth.uid() AND friend_id = friend_user_id)
       OR (user_id = friend_user_id AND friend_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old friend requests (older than 48 hours)
CREATE OR REPLACE FUNCTION cleanup_old_friend_requests()
RETURNS VOID AS $$
BEGIN
    DELETE FROM friend_requests 
    WHERE created_at < NOW() - INTERVAL '48 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS
ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- RLS Policies for friend_requests
CREATE POLICY "Users can view their own friend requests" ON friend_requests
    FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "Users can create friend requests" ON friend_requests
    FOR INSERT WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Users can update their received requests" ON friend_requests
    FOR UPDATE USING (receiver_id = auth.uid());

CREATE POLICY "Users can delete their own requests" ON friend_requests
    FOR DELETE USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- RLS Policies for friendships
CREATE POLICY "Users can view their friendships" ON friendships
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage their friendships" ON friendships
    FOR ALL USING (user_id = auth.uid());

-- Schedule cleanup function (if pg_cron is available)
-- SELECT cron.schedule('cleanup-friend-requests', '0 */6 * * *', 'SELECT cleanup_old_friend_requests();');
