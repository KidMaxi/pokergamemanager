-- Check if user_statistics table exists and its structure
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'user_statistics' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if any user_statistics records exist
SELECT COUNT(*) as total_records FROM user_statistics;

-- Show sample data if any exists
SELECT * FROM user_statistics LIMIT 5;

-- Check existing functions related to user statistics
SELECT 
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
    AND routine_name LIKE '%user_statistics%'
ORDER BY routine_name;
