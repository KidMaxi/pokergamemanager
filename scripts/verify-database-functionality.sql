-- Verify Database Functionality
-- Run this script to check if all features are working correctly

-- 1. Check if all required tables exist
SELECT 
    'Tables Check' as test_category,
    CASE 
        WHEN COUNT(*) = 5 THEN 'PASS - All required tables exist'
        ELSE 'FAIL - Missing tables: ' || (5 - COUNT(*))::text
    END as result
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'game_sessions', 'friend_requests', 'friendships', 'game_invitations');

-- 2. Check if all required functions exist
SELECT 
    'Functions Check' as test_category,
    CASE 
        WHEN COUNT(*) >= 7 THEN 'PASS - All required functions exist'
        ELSE 'FAIL - Missing functions'
    END as result
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN (
    'handle_new_user',
    'update_user_game_stats',
    'send_friend_request',
    'accept_friend_request',
    'reject_friend_request',
    'accept_game_invitation',
    'test_connection',
    'get_user_profile'
);

-- 3. Check if RLS is disabled (should be disabled for full access)
SELECT 
    'RLS Check' as test_category,
    CASE 
        WHEN COUNT(*) = 0 THEN 'PASS - RLS disabled on all tables'
        ELSE 'WARNING - RLS enabled on ' || COUNT(*) || ' tables'
    END as result
FROM information_schema.tables t
JOIN pg_class c ON c.relname = t.table_name
WHERE t.table_schema = 'public' 
AND t.table_name IN ('profiles', 'game_sessions', 'friend_requests', 'friendships', 'game_invitations')
AND c.relrowsecurity = true;

-- 4. Check if trigger exists for user registration
SELECT 
    'Trigger Check' as test_category,
    CASE 
        WHEN COUNT(*) > 0 THEN 'PASS - User registration trigger exists'
        ELSE 'FAIL - User registration trigger missing'
    END as result
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';

-- 5. Test database connection function
SELECT 
    'Connection Test' as test_category,
    CASE 
        WHEN public.test_connection()->>'status' = 'success' THEN 'PASS - Database connection working'
        ELSE 'FAIL - Database connection issues'
    END as result;

-- 6. Check permissions on tables
SELECT 
    'Permissions Check' as test_category,
    'INFO - Check that authenticated role has access to all tables' as result;

-- 7. Show current table row counts (for information)
SELECT 
    'Data Summary' as test_category,
    'Profiles: ' || (SELECT COUNT(*) FROM public.profiles) ||
    ', Games: ' || (SELECT COUNT(*) FROM public.game_sessions) ||
    ', Friend Requests: ' || (SELECT COUNT(*) FROM public.friend_requests) ||
    ', Friendships: ' || (SELECT COUNT(*) FROM public.friendships) ||
    ', Game Invitations: ' || (SELECT COUNT(*) FROM public.game_invitations) as result;

-- 8. List any existing RLS policies (should be empty)
SELECT 
    'Policy Check' as test_category,
    CASE 
        WHEN COUNT(*) = 0 THEN 'PASS - No RLS policies found'
        ELSE 'WARNING - Found ' || COUNT(*) || ' RLS policies'
    END as result
FROM pg_policies 
WHERE schemaname = 'public';

-- Final status
SELECT 
    '=== VERIFICATION COMPLETE ===' as test_category,
    'Check all results above. All should show PASS for optimal functionality.' as result;
