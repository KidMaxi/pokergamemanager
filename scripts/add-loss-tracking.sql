-- Add total_losses column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS total_losses integer DEFAULT 0;

-- Update existing profiles to set total_losses = games_played - total_wins
UPDATE public.profiles 
SET total_losses = GREATEST(0, COALESCE(games_played, 0) - COALESCE(total_wins, 0))
WHERE total_losses IS NULL;

-- Add comment to document the column
COMMENT ON COLUMN public.profiles.total_losses IS 'Number of games where the player had a net loss';
