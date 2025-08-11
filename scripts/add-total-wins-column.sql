-- Add total_wins column to profiles table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'total_wins') THEN
        ALTER TABLE profiles ADD COLUMN total_wins INTEGER DEFAULT 0;
        
        -- Update existing profiles to have total_wins = 0
        UPDATE profiles SET total_wins = 0 WHERE total_wins IS NULL;
        
        -- Add NOT NULL constraint
        ALTER TABLE profiles ALTER COLUMN total_wins SET NOT NULL;
        
        RAISE NOTICE 'Added total_wins column to profiles table';
    ELSE
        RAISE NOTICE 'total_wins column already exists in profiles table';
    END IF;
END $$;

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'total_wins';
