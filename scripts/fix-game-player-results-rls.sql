-- Fix RLS policies for game_player_results table to allow INSERT operations

BEGIN;

-- Enable RLS on game_player_results table (if not already enabled)
ALTER TABLE public.game_player_results ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "results: owner can read" ON public.game_player_results;
DROP POLICY IF EXISTS "results: owner can insert" ON public.game_player_results;
DROP POLICY IF EXISTS "results: owner can update" ON public.game_player_results;

-- Create comprehensive RLS policies for game_player_results table
-- Allow game owner to read results from their games
CREATE POLICY "results: owner can read" ON public.game_player_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.game_sessions gs
      WHERE gs.id = game_id AND gs.user_id = auth.uid()
    )
  );

-- Allow game owner to insert results for their games
CREATE POLICY "results: owner can insert" ON public.game_player_results
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.game_sessions gs
      WHERE gs.id = game_id AND gs.user_id = auth.uid()
    )
  );

-- Allow game owner to update results for their games
CREATE POLICY "results: owner can update" ON public.game_player_results
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.game_sessions gs
      WHERE gs.id = game_id AND gs.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.game_sessions gs
      WHERE gs.id = game_id AND gs.user_id = auth.uid()
    )
  );

COMMIT;
