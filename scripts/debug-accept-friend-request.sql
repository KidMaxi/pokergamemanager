-- Enhanced accept_friend_request function with better error handling and logging
CREATE OR REPLACE FUNCTION accept_friend_request(request_id UUID)
RETURNS JSON AS $$
DECLARE
    req_sender_id UUID;
    req_receiver_id UUID;
    result JSON;
BEGIN
    -- Get the request details with better error handling
    SELECT sender_id, receiver_id INTO req_sender_id, req_receiver_id
    FROM friend_requests 
    WHERE id = request_id AND receiver_id = auth.uid() AND status = 'pending';
    
    IF req_sender_id IS NULL THEN
        RAISE EXCEPTION 'Friend request not found, already processed, or not authorized. Request ID: %, User ID: %', request_id, auth.uid();
    END IF;
    
    -- Check if friendship already exists (shouldn't happen, but safety check)
    IF EXISTS (
        SELECT 1 FROM friendships 
        WHERE (user_id = req_sender_id AND friend_id = req_receiver_id)
           OR (user_id = req_receiver_id AND friend_id = req_sender_id)
    ) THEN
        RAISE EXCEPTION 'Friendship already exists between users % and %', req_sender_id, req_receiver_id;
    END IF;
    
    -- Update request status
    UPDATE friend_requests 
    SET status = 'accepted', updated_at = NOW()
    WHERE id = request_id;
    
    -- Create bidirectional friendship with explicit error handling
    BEGIN
        INSERT INTO friendships (user_id, friend_id) VALUES (req_sender_id, req_receiver_id);
        INSERT INTO friendships (user_id, friend_id) VALUES (req_receiver_id, req_sender_id);
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'Friendship already exists (unique constraint violation)';
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Failed to create friendship: %', SQLERRM;
    END;
    
    -- Return success result with details
    result := json_build_object(
        'success', true,
        'sender_id', req_sender_id,
        'receiver_id', req_receiver_id,
        'message', 'Bidirectional friendship created successfully'
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
