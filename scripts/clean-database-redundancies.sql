-- Database Cleanup Script
-- Run this AFTER reviewing the results from check-database-redundancies.sql
-- This script will fix the identified issues

-- 1. Remove duplicate friendships (keep the oldest one)
DELETE FROM friendships 
WHERE id NOT IN (
    SELECT MIN(id) 
    FROM friendships 
    GROUP BY user_id, friend_id
);

-- 2. Remove self-friendships
DELETE FROM friendships 
WHERE user_id = friend_id;

-- 3. Remove self friend requests
DELETE FROM friend_requests 
WHERE sender_id = receiver_id;

-- 4. Remove duplicate friend requests (keep the most recent one)
DELETE FROM friend_requests 
WHERE id NOT IN (
    SELECT MAX(id) 
    FROM friend_requests 
    GROUP BY sender_id, receiver_id
);

-- 5. Remove orphaned friendships
DELETE FROM friendships 
WHERE user_id NOT IN (SELECT id FROM profiles)
   OR friend_id NOT IN (SELECT id FROM profiles);

-- 6. Remove orphaned friend requests
DELETE FROM friend_requests 
WHERE sender_id NOT IN (SELECT id FROM profiles)
   OR receiver_id NOT IN (SELECT id FROM profiles);

-- 7. Create missing bidirectional friendships
-- For each friendship A->B, ensure B->A exists
INSERT INTO friendships (user_id, friend_id, created_at)
SELECT f1.friend_id, f1.user_id, f1.created_at
FROM friendships f1
LEFT JOIN friendships f2 ON f1.user_id = f2.friend_id AND f1.friend_id = f2.user_id
WHERE f2.id IS NULL
  AND f1.user_id != f1.friend_id; -- Avoid creating self-friendships

-- 8. Update accepted friend requests to have corresponding friendships
-- This creates bidirectional friendships for accepted requests
INSERT INTO friendships (user_id, friend_id, created_at)
SELECT fr.sender_id, fr.receiver_id, fr.updated_at
FROM friend_requests fr
LEFT JOIN friendships f1 ON fr.sender_id = f1.user_id AND fr.receiver_id = f1.friend_id
WHERE fr.status = 'accepted' 
  AND f1.id IS NULL
  AND fr.sender_id != fr.receiver_id;

INSERT INTO friendships (user_id, friend_id, created_at)
SELECT fr.receiver_id, fr.sender_id, fr.updated_at
FROM friend_requests fr
LEFT JOIN friendships f2 ON fr.receiver_id = f2.user_id AND fr.sender_id = f2.friend_id
WHERE fr.status = 'accepted' 
  AND f2.id IS NULL
  AND fr.sender_id != fr.receiver_id;

-- 9. Clean up old accepted friend requests (optional - keep for audit trail)
-- DELETE FROM friend_requests WHERE status = 'accepted' AND created_at < NOW() - INTERVAL '30 days';

-- Final verification query
SELECT 'CLEANUP_COMPLETE' as status,
       'Run check-database-redundancies.sql again to verify' as next_step;
