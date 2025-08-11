-- Database Redundancy Check Script
-- This script identifies and reports various data inconsistencies

-- 1. Check for duplicate friendships (same user_id and friend_id pairs)
SELECT 'DUPLICATE_FRIENDSHIPS' as issue_type, 
       user_id, 
       friend_id, 
       COUNT(*) as duplicate_count
FROM friendships 
GROUP BY user_id, friend_id 
HAVING COUNT(*) > 1;

-- 2. Check for self-friendships (users friends with themselves)
SELECT 'SELF_FRIENDSHIPS' as issue_type,
       user_id,
       friend_id,
       id
FROM friendships 
WHERE user_id = friend_id;

-- 3. Check for missing bidirectional relationships
-- (A is friends with B but B is not friends with A)
SELECT 'MISSING_BIDIRECTIONAL' as issue_type,
       f1.user_id as user_a,
       f1.friend_id as user_b,
       'Missing reverse friendship' as description
FROM friendships f1
LEFT JOIN friendships f2 ON f1.user_id = f2.friend_id AND f1.friend_id = f2.user_id
WHERE f2.id IS NULL;

-- 4. Check for duplicate friend requests
SELECT 'DUPLICATE_FRIEND_REQUESTS' as issue_type,
       sender_id,
       receiver_id,
       COUNT(*) as duplicate_count
FROM friend_requests 
GROUP BY sender_id, receiver_id 
HAVING COUNT(*) > 1;

-- 5. Check for self friend requests
SELECT 'SELF_FRIEND_REQUESTS' as issue_type,
       sender_id,
       receiver_id,
       id
FROM friend_requests 
WHERE sender_id = receiver_id;

-- 6. Check for orphaned friendships (referencing non-existent users)
SELECT 'ORPHANED_FRIENDSHIPS_USER' as issue_type,
       f.id,
       f.user_id,
       'User does not exist in profiles' as description
FROM friendships f
LEFT JOIN profiles p ON f.user_id = p.id
WHERE p.id IS NULL;

SELECT 'ORPHANED_FRIENDSHIPS_FRIEND' as issue_type,
       f.id,
       f.friend_id,
       'Friend does not exist in profiles' as description
FROM friendships f
LEFT JOIN profiles p ON f.friend_id = p.id
WHERE p.id IS NULL;

-- 7. Check for orphaned friend requests
SELECT 'ORPHANED_FRIEND_REQUESTS_SENDER' as issue_type,
       fr.id,
       fr.sender_id,
       'Sender does not exist in profiles' as description
FROM friend_requests fr
LEFT JOIN profiles p ON fr.sender_id = p.id
WHERE p.id IS NULL;

SELECT 'ORPHANED_FRIEND_REQUESTS_RECEIVER' as issue_type,
       fr.id,
       fr.receiver_id,
       'Receiver does not exist in profiles' as description
FROM friend_requests fr
LEFT JOIN profiles p ON fr.receiver_id = p.id
WHERE p.id IS NULL;

-- 8. Check for accepted friend requests that weren't converted to friendships
SELECT 'ACCEPTED_REQUESTS_NOT_CONVERTED' as issue_type,
       fr.id as request_id,
       fr.sender_id,
       fr.receiver_id,
       'Accepted request but no friendship exists' as description
FROM friend_requests fr
LEFT JOIN friendships f1 ON fr.sender_id = f1.user_id AND fr.receiver_id = f1.friend_id
LEFT JOIN friendships f2 ON fr.receiver_id = f2.user_id AND fr.sender_id = f2.friend_id
WHERE fr.status = 'accepted' 
  AND f1.id IS NULL 
  AND f2.id IS NULL;

-- 9. Check for friendships without corresponding accepted friend requests
SELECT 'FRIENDSHIPS_WITHOUT_REQUESTS' as issue_type,
       f.id as friendship_id,
       f.user_id,
       f.friend_id,
       'Friendship exists but no accepted request found' as description
FROM friendships f
LEFT JOIN friend_requests fr1 ON f.user_id = fr1.sender_id AND f.friend_id = fr1.receiver_id AND fr1.status = 'accepted'
LEFT JOIN friend_requests fr2 ON f.friend_id = fr2.sender_id AND f.user_id = fr2.receiver_id AND fr2.status = 'accepted'
WHERE fr1.id IS NULL AND fr2.id IS NULL;

-- 10. Summary counts
SELECT 'SUMMARY' as issue_type,
       'Total Profiles' as description,
       COUNT(*) as count
FROM profiles
UNION ALL
SELECT 'SUMMARY' as issue_type,
       'Total Friendships' as description,
       COUNT(*) as count
FROM friendships
UNION ALL
SELECT 'SUMMARY' as issue_type,
       'Total Friend Requests' as description,
       COUNT(*) as count
FROM friend_requests
UNION ALL
SELECT 'SUMMARY' as issue_type,
       'Pending Friend Requests' as description,
       COUNT(*) as count
FROM friend_requests
WHERE status = 'pending'
UNION ALL
SELECT 'SUMMARY' as issue_type,
       'Accepted Friend Requests' as description,
       COUNT(*) as count
FROM friend_requests
WHERE status = 'accepted';
