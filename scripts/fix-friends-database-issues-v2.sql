-- Fix Friends Database Issues (Version 2)
-- This script addresses database issues while respecting the unique constraint

-- First, let's see what we're working with
SELECT 'BEFORE CLEANUP - Friendships' as status, COUNT(*) as count FROM friendships;
SELECT 'BEFORE CLEANUP - Friend Requests' as status, COUNT(*) as count FROM friend_requests;
SELECT 'BEFORE CLEANUP - Accepted Requests' as status, COUNT(*) as count FROM friend_requests WHERE status = 'accepted';

-- Step 1: Convert accepted friend requests to friendships (respecting unique constraint)
INSERT INTO friendships (user_id, friend_id, created_at)
SELECT 
    CASE 
        WHEN sender_id::text < receiver_id::text THEN sender_id 
        ELSE receiver_id 
    END as user_id,
    CASE 
        WHEN sender_id::text < receiver_id::text THEN receiver_id 
        ELSE sender_id 
    END as friend_id,
    created_at
FROM friend_requests 
WHERE status = 'accepted'
AND NOT EXISTS (
    SELECT 1 FROM friendships 
    WHERE (user_id = LEAST(friend_requests.sender_id, friend_requests.receiver_id)
           AND friend_id = GREATEST(friend_requests.sender_id, friend_requests.receiver_id))
)
AND sender_id != receiver_id; -- Prevent self-friendships

-- Step 2: Remove any self-friendships that might exist
DELETE FROM friendships WHERE user_id = friend_id;

-- Step 3: Delete accepted friend requests that have been converted to friendships
DELETE FROM friend_requests 
WHERE status = 'accepted'
AND EXISTS (
    SELECT 1 FROM friendships 
    WHERE user_id = LEAST(friend_requests.sender_id, friend_requests.receiver_id)
    AND friend_id = GREATEST(friend_requests.sender_id, friend_requests.receiver_id)
);

-- Step 4: Clean up any remaining duplicate friendships (keep the oldest one)
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
    SELECT id FROM friendship_duplicates WHERE rn > 1
); -- Keep only 1 record per pair

-- Final verification
SELECT 'AFTER CLEANUP - Friendships' as status, COUNT(*) as count FROM friendships;
SELECT 'AFTER CLEANUP - Friend Requests' as status, COUNT(*) as count FROM friend_requests;
SELECT 'AFTER CLEANUP - Pending Requests' as status, COUNT(*) as count FROM friend_requests WHERE status = 'pending';

-- Check for any remaining issues
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
