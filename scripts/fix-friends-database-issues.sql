-- Fix Friends Database Issues
-- This script addresses missing bidirectional friendships and converts accepted requests

-- First, let's see what we're working with
SELECT 'BEFORE CLEANUP - Friendships' as status, COUNT(*) as count FROM friendships;
SELECT 'BEFORE CLEANUP - Friend Requests' as status, COUNT(*) as count FROM friend_requests;
SELECT 'BEFORE CLEANUP - Accepted Requests' as status, COUNT(*) as count FROM friend_requests WHERE status = 'accepted';

-- Step 1: Convert accepted friend requests to friendships
INSERT INTO friendships (user_id, friend_id, created_at)
SELECT 
    sender_id,
    receiver_id,
    created_at
FROM friend_requests 
WHERE status = 'accepted'
AND NOT EXISTS (
    SELECT 1 FROM friendships 
    WHERE (user_id = friend_requests.sender_id AND friend_id = friend_requests.receiver_id)
    OR (user_id = friend_requests.receiver_id AND friend_id = friend_requests.sender_id)
);

-- Step 2: Create reverse friendships for existing friendships that are missing their bidirectional pair
INSERT INTO friendships (user_id, friend_id, created_at)
SELECT 
    f1.friend_id,
    f1.user_id,
    f1.created_at
FROM friendships f1
WHERE NOT EXISTS (
    SELECT 1 FROM friendships f2 
    WHERE f2.user_id = f1.friend_id 
    AND f2.friend_id = f1.user_id
)
AND f1.user_id != f1.friend_id; -- Prevent self-friendships

-- Step 3: Remove any self-friendships that might exist
DELETE FROM friendships WHERE user_id = friend_id;

-- Step 4: Delete accepted friend requests that have been converted to friendships
DELETE FROM friend_requests 
WHERE status = 'accepted'
AND EXISTS (
    SELECT 1 FROM friendships 
    WHERE (user_id = friend_requests.sender_id AND friend_id = friend_requests.receiver_id)
    OR (user_id = friend_requests.receiver_id AND friend_id = friend_requests.sender_id)
);

-- Step 5: Clean up any duplicate friendships (keep the oldest one)
WITH friendship_duplicates AS (
    SELECT 
        id,
        user_id,
        friend_id,
        created_at,
        ROW_NUMBER() OVER (
            PARTITION BY 
                LEAST(user_id::text, friend_id::text), 
                GREATEST(user_id::text, friend_id::text) 
            ORDER BY created_at ASC
        ) as rn
    FROM friendships
)
DELETE FROM friendships 
WHERE id IN (
    SELECT id FROM friendship_duplicates WHERE rn > 2
); -- Keep only 2 records (bidirectional pair)

-- Final verification
SELECT 'AFTER CLEANUP - Friendships' as status, COUNT(*) as count FROM friendships;
SELECT 'AFTER CLEANUP - Friend Requests' as status, COUNT(*) as count FROM friend_requests;
SELECT 'AFTER CLEANUP - Pending Requests' as status, COUNT(*) as count FROM friend_requests WHERE status = 'pending';

-- Check for any remaining issues
SELECT 
    'REMAINING ISSUES - Missing Bidirectional' as issue_type,
    COUNT(*) as count
FROM friendships f1
WHERE NOT EXISTS (
    SELECT 1 FROM friendships f2 
    WHERE f2.user_id = f1.friend_id 
    AND f2.friend_id = f1.user_id
);

SELECT 
    'REMAINING ISSUES - Self Friendships' as issue_type,
    COUNT(*) as count
FROM friendships 
WHERE user_id = friend_id;

-- Show sample of current friendships for verification
SELECT 
    f.user_id,
    p1.full_name as user_name,
    f.friend_id,
    p2.full_name as friend_name,
    f.created_at
FROM friendships f
JOIN profiles p1 ON f.user_id = p1.id
JOIN profiles p2 ON f.friend_id = p2.id
ORDER BY f.created_at DESC
LIMIT 10;
