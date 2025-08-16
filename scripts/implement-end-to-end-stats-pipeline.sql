-- Creating comprehensive database schema for stats tracking
-- Add dollar-based columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS total_sessions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_buyin_dollars NUMERIC(12,1) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS total_cashout_dollars NUMERIC(12,1) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS total_net_dollars NUMERIC(12,1) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS total_wins INTEGER DEFAULT 0;

-- Create games table if it doesn't exist
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  point_to_cash_rate NUMERIC DEFAULT 1.0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create game finalizations ledger for idempotency
CREATE TABLE IF NOT EXISTS game_finalizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  finalized_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(game_id, owner_id)
);

-- Enable RLS on new tables
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_finalizations ENABLE ROW LEVEL SECURITY;

-- RLS policies for games
DROP POLICY IF EXISTS "Users can view their own games" ON games;
CREATE POLICY "Users can view their own games" ON games
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can insert their own games" ON games;
CREATE POLICY "Users can insert their own games" ON games
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update their own games" ON games;
CREATE POLICY "Users can update their own games" ON games
  FOR UPDATE USING (auth.uid() = owner_id);

-- RLS policies for game_finalizations
DROP POLICY IF EXISTS "Users can view their own finalizations" ON game_finalizations;
CREATE POLICY "Users can view their own finalizations" ON game_finalizations
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can insert their own finalizations" ON game_finalizations;
CREATE POLICY "Users can insert their own finalizations" ON game_finalizations
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Create idempotent RPC function for applying game results
CREATE OR REPLACE FUNCTION public.profile_apply_game_result(
  p_game_id UUID,
  p_owner_id UUID,
  p_results JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result_record RECORD;
BEGIN
  -- Check if this game has already been finalized
  IF EXISTS (
    SELECT 1 FROM game_finalizations 
    WHERE game_id = p_game_id AND owner_id = p_owner_id
  ) THEN
    RAISE NOTICE 'Game % already finalized by owner %', p_game_id, p_owner_id;
    RETURN;
  END IF;

  -- Insert finalization record for idempotency
  INSERT INTO game_finalizations (game_id, owner_id)
  VALUES (p_game_id, p_owner_id);

  -- Process each result
  FOR result_record IN 
    SELECT 
      (value->>'profile_id')::UUID as profile_id,
      (value->>'buyin_dollars')::NUMERIC as buyin_dollars,
      (value->>'cashout_dollars')::NUMERIC as cashout_dollars,
      (value->>'winner')::BOOLEAN as winner
    FROM jsonb_array_elements(p_results)
  LOOP
    -- Update profile stats
    UPDATE profiles 
    SET 
      total_sessions = total_sessions + 1,
      total_buyin_dollars = total_buyin_dollars + result_record.buyin_dollars,
      total_cashout_dollars = total_cashout_dollars + result_record.cashout_dollars,
      total_net_dollars = total_net_dollars + (result_record.cashout_dollars - result_record.buyin_dollars),
      total_wins = total_wins + CASE WHEN result_record.winner THEN 1 ELSE 0 END,
      updated_at = NOW()
    WHERE id = result_record.profile_id;
  END LOOP;

  -- Mark game as completed
  UPDATE games 
  SET status = 'completed', updated_at = NOW()
  WHERE id = p_game_id AND owner_id = p_owner_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.profile_apply_game_result TO authenticated;
