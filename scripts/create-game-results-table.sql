-- Create game_results table to store completed game results
CREATE TABLE IF NOT EXISTS public.game_results (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  game_name TEXT NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  point_to_cash_rate DECIMAL(10,4) NOT NULL,
  player_results JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_game_results_user_id ON public.game_results(user_id);
CREATE INDEX IF NOT EXISTS idx_game_results_created_at ON public.game_results(created_at);

-- Enable RLS
ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
DROP POLICY IF EXISTS "Users can manage own game results" ON public.game_results;
CREATE POLICY "Users can manage own game results" ON public.game_results
  FOR ALL USING (auth.uid() = user_id);

-- Create updated_at trigger
DROP TRIGGER IF EXISTS trigger_game_results_updated_at ON public.game_results;
CREATE TRIGGER trigger_game_results_updated_at
  BEFORE UPDATE ON public.game_results
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
