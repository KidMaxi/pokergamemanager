-- Add all-time profit/loss tracking to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS all_time_profit_loss DECIMAL(10,2) DEFAULT 0.00;

-- Add games played counter
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS games_played INTEGER DEFAULT 0;

-- Add last game date
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_game_date TIMESTAMP WITH TIME ZONE;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_all_time_profit_loss ON public.profiles(all_time_profit_loss);

-- Create a function to update user stats when a game is completed
CREATE OR REPLACE FUNCTION public.update_user_game_stats(
  user_id_param UUID,
  profit_loss_amount DECIMAL(10,2)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles 
  SET 
    all_time_profit_loss = COALESCE(all_time_profit_loss, 0) + profit_loss_amount,
    games_played = COALESCE(games_played, 0) + 1,
    last_game_date = NOW(),
    updated_at = NOW()
  WHERE id = user_id_param;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_user_game_stats(UUID, DECIMAL) TO authenticated;
