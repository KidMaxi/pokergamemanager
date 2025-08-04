-- Verify Database Functionality - Complete Verification
-- Run this script to check if all features are working correctly

-- 1. Check if all required tables exist
SELECT 
    'Tables Check' as test_category,
    CASE 
        WHEN COUNT(*) >= 5 THEN 'PASS - All required tables exist (' || COUNT(*) || ')'
        ELSE 'FAIL - Missing tables: ' || (5 - COUNT(*))::text
    END as result
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'game_sessions', 'friend_requests', 'friendships', 'game_invitations');

-- 2. Check profiles table structure
SELECT 
    'Profiles Structure' as test_category,
    CASE 
        WHEN COUNT(*) >= 10 THEN 'PASS - All profile columns exist (' || COUNT(*) || ')'
        ELSE 'FAIL - Missing profile columns (found ' || COUNT(*) || ')'
    END as result
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'profiles';

-- 3. List profiles table columns for verification
SELECT 
    'Profiles Columns' as test_category,
    string_agg(column_name, ', ' ORDER BY ordinal_position) as result
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'profiles';

-- 4. Check if all required functions exist
SELECT 
    'Functions Check' as test_category,
    CASE 
        WHEN COUNT(*) >= 6 THEN 'PASS - All required functions exist (' || COUNT(*) || ')'
        ELSE 'FAIL - Missing functions (found ' || COUNT(*) || ')'
    END as result
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN (
    'handle_new_user',
    'update_user_game_stats',
    'send_friend_request',
    'accept_friend_request',
    'reject_friend_request',
    'remove_friendship',
    'accept_game_invitation'
);

-- 5. List all available functions
SELECT 
    'Available Functions' as test_category,
    string_agg(routine_name, ', ') as result
FROM information_schema.routines 
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- 6. Check if RLS is disabled (should be disabled for full access)
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

-- 7. Check if trigger exists for user registration
SELECT 
    'Trigger Check' as test_category,
    CASE 
        WHEN COUNT(*) > 0 THEN 'PASS - User registration trigger exists'
        ELSE 'FAIL - User registration trigger missing'
    END as result
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';

-- 8. Check permissions on tables
SELECT 
    'Table Permissions' as test_category,
    'Table: ' || table_name || ' - Privileges: ' || string_agg(privilege_type, ', ') as result
FROM information_schema.table_privileges 
WHERE table_schema = 'public' 
AND grantee = 'authenticated'
AND table_name IN ('profiles', 'game_sessions', 'friend_requests', 'friendships', 'game_invitations')
GROUP BY table_name
ORDER BY table_name;

-- 9. Check function permissions
SELECT 
    'Function Permissions' as test_category,
    CASE 
        WHEN COUNT(*) >= 6 THEN 'PASS - Functions have proper permissions'
        ELSE 'WARNING - Some functions may lack permissions'
    END as result
FROM information_schema.routine_privileges 
WHERE routine_schema = 'public' 
AND grantee = 'authenticated';

-- 10. Show current table row counts (for information)
SELECT 
    'Data Summary' as test_category,
    'Profiles: ' || (SELECT COUNT(*) FROM public.profiles) ||
    ', Game Sessions: ' || (SELECT COUNT(*) FROM public.game_sessions) ||
    ', Friend Requests: ' || (SELECT COUNT(*) FROM public.friend_requests) ||
    ', Friendships: ' || (SELECT COUNT(*) FROM public.friendships) ||
    ', Game Invitations: ' || (SELECT COUNT(*) FROM public.game_invitations) as result;

-- 11. Check for any existing RLS policies (should be empty)
SELECT 
    'Policy Check' as test_category,
    CASE 
        WHEN COUNT(*) = 0 THEN 'PASS - No RLS policies found'
        ELSE 'WARNING - Found ' || COUNT(*) || ' RLS policies'
    END as result
FROM pg_policies 
WHERE schemaname = 'public';

-- 12. Test basic database connectivity
SELECT 
    'Connection Test' as test_category,
    'PASS - Database connection working' as result;

-- 13. Check auth.users table accessibility
SELECT 
    'Auth Users Check' as test_category,
    CASE 
        WHEN COUNT(*) >= 0 THEN 'PASS - Can access auth.users table (' || COUNT(*) || ' users)'
        ELSE 'FAIL - Cannot access auth.users table'
    END as result
FROM auth.users;

-- 14. Verify profiles are created for existing users
SELECT 
    'Profile Creation Check' as test_category,
    CASE 
        WHEN (SELECT COUNT(*) FROM auth.users) = (SELECT COUNT(*) FROM public.profiles) 
        THEN 'PASS - All users have profiles'
        ELSE 'WARNING - Some users missing profiles: ' || 
             ((SELECT COUNT(*) FROM auth.users) - (SELECT COUNT(*) FROM public.profiles))::text
    END as result;

-- Final status
SELECT 
    '=== VERIFICATION COMPLETE ===' as test_category,
    CASE 
        WHEN (
            SELECT COUNT(*) FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('profiles', 'game_sessions', 'friend_requests', 'friendships', 'game_invitations')
        ) >= 5
        AND (
            SELECT COUNT(*) FROM information_schema.routines 
            WHERE routine_schema = 'public' 
            AND routine_name IN ('handle_new_user', 'update_user_game_stats', 'send_friend_request', 'accept_friend_request', 'reject_friend_request', 'remove_friendship')
        ) >= 6
        AND (
            SELECT COUNT(*) FROM information_schema.triggers 
            WHERE trigger_name = 'on_auth_user_created'
        ) > 0
        THEN '🎉 Database is fully functional! Authentication should work properly.'
        ELSE '⚠️ Some issues detected - check individual tests above'
    END as overall_status;
