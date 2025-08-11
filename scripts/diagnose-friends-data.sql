-- Diagnostic script to check friends data for a specific user
-- Replace 'Maxschuringa37@gmali.com' with the actual email if needed

-- First, let's find the user profile
SELECT 'USER PROFILE CHECK' as check_type;
SELECT 
    id,
    email,
    full_name,
    created_at,
    updated_at
FROM profiles 
WHERE email ILIKE '%maxschuringa37%' OR email ILIKE '%gmail%';

-- Get the user ID for further queries
DO $$
DECLARE
    user_uuid UUID;
BEGIN
    -- Find the user ID
    SELECT id INTO user_uuid 
    FROM profiles 
    WHERE email ILIKE '%maxschuringa37%' OR email ILIKE '%gmail%'
    LIMIT 1;
    
    IF user_uuid IS NOT NULL THEN
        RAISE NOTICE 'Found user ID: %', user_uuid;
        
        -- Check friendships where user is the requester
        RAISE NOTICE '=== FRIENDSHIPS WHERE USER IS REQUESTER ===';
        PERFORM 1 FROM friendships WHERE user_id = user_uuid;
        IF FOUND THEN
            FOR rec IN 
                SELECT 
                    f.id,
                    f.user_id,
                    f.friend_id,
                    f.created_at,
                    p.full_name as friend_name,
                    p.email as friend_email
                FROM friendships f
                JOIN profiles p ON f.friend_id = p.id
                WHERE f.user_id = user_uuid
            LOOP
                RAISE NOTICE 'Friendship ID: %, Friend: % (%), Created: %', 
                    rec.id, rec.friend_name, rec.friend_email, rec.created_at;
            END LOOP;
        ELSE
            RAISE NOTICE 'No friendships found where user is requester';
        END IF;
        
        -- Check friendships where user is the friend
        RAISE NOTICE '=== FRIENDSHIPS WHERE USER IS FRIEND ===';
        PERFORM 1 FROM friendships WHERE friend_id = user_uuid;
        IF FOUND THEN
            FOR rec IN 
                SELECT 
                    f.id,
                    f.user_id,
                    f.friend_id,
                    f.created_at,
                    p.full_name as requester_name,
                    p.email as requester_email
                FROM friendships f
                JOIN profiles p ON f.user_id = p.id
                WHERE f.friend_id = user_uuid
            LOOP
                RAISE NOTICE 'Friendship ID: %, Requester: % (%), Created: %', 
                    rec.id, rec.requester_name, rec.requester_email, rec.created_at;
            END LOOP;
        ELSE
            RAISE NOTICE 'No friendships found where user is friend';
        END IF;
        
        -- Check friend requests sent by user
        RAISE NOTICE '=== FRIEND REQUESTS SENT BY USER ===';
        PERFORM 1 FROM friend_requests WHERE sender_id = user_uuid;
        IF FOUND THEN
            FOR rec IN 
                SELECT 
                    fr.id,
                    fr.sender_id,
                    fr.receiver_id,
                    fr.status,
                    fr.created_at,
                    p.full_name as receiver_name,
                    p.email as receiver_email
                FROM friend_requests fr
                JOIN profiles p ON fr.receiver_id = p.id
                WHERE fr.sender_id = user_uuid
            LOOP
                RAISE NOTICE 'Request ID: %, To: % (%), Status: %, Created: %', 
                    rec.id, rec.receiver_name, rec.receiver_email, rec.status, rec.created_at;
            END LOOP;
        ELSE
            RAISE NOTICE 'No friend requests sent by user';
        END IF;
        
        -- Check friend requests received by user
        RAISE NOTICE '=== FRIEND REQUESTS RECEIVED BY USER ===';
        PERFORM 1 FROM friend_requests WHERE receiver_id = user_uuid;
        IF FOUND THEN
            FOR rec IN 
                SELECT 
                    fr.id,
                    fr.sender_id,
                    fr.receiver_id,
                    fr.status,
                    fr.created_at,
                    p.full_name as sender_name,
                    p.email as sender_email
                FROM friend_requests fr
                JOIN profiles p ON fr.sender_id = p.id
                WHERE fr.receiver_id = user_uuid
            LOOP
                RAISE NOTICE 'Request ID: %, From: % (%), Status: %, Created: %', 
                    rec.id, rec.sender_name, rec.sender_email, rec.status, rec.created_at;
            END LOOP;
        ELSE
            RAISE NOTICE 'No friend requests received by user';
        END IF;
        
    ELSE
        RAISE NOTICE 'User not found with email pattern maxschuringa37';
    END IF;
END $$;

-- Summary counts
SELECT 'SUMMARY COUNTS' as check_type;

WITH user_info AS (
    SELECT id as user_id 
    FROM profiles 
    WHERE email ILIKE '%maxschuringa37%' OR email ILIKE '%gmail%'
    LIMIT 1
)
SELECT 
    'Total Friendships (as requester)' as metric,
    COUNT(*) as count
FROM friendships f, user_info u
WHERE f.user_id = u.user_id

UNION ALL

SELECT 
    'Total Friendships (as friend)' as metric,
    COUNT(*) as count
FROM friendships f, user_info u
WHERE f.friend_id = u.user_id

UNION ALL

SELECT 
    'Total Friend Requests Sent' as metric,
    COUNT(*) as count
FROM friend_requests fr, user_info u
WHERE fr.sender_id = u.user_id

UNION ALL

SELECT 
    'Total Friend Requests Received' as metric,
    COUNT(*) as count
FROM friend_requests fr, user_info u
WHERE fr.receiver_id = u.user_id;

-- Check if tables exist and have data
SELECT 'TABLE STATUS' as check_type;
SELECT 
    'friendships' as table_name,
    COUNT(*) as total_records
FROM friendships

UNION ALL

SELECT 
    'friend_requests' as table_name,
    COUNT(*) as total_records
FROM friend_requests

UNION ALL

SELECT 
    'profiles' as table_name,
    COUNT(*) as total_records
FROM profiles;
