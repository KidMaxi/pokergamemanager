-- Comprehensive fix for floating player statistics tracking
-- This addresses the issue where non-account players aren't tracked properly

-- First, ensure the game_player_results table has all necessary columns
ALTER TABLE public.game_player_results 
ADD COLUMN IF NOT EXISTS player_name TEXT,
ADD COLUMN IF NOT EXISTS player_type TEXT DEFAULT 'account' CHECK (player_type IN ('account', 'local', 'guest')),
ADD COLUMN IF NOT EXISTS local_player_id TEXT;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_game_player_results_player_name ON public.game_player_results(player_name);
CREATE INDEX IF NOT EXISTS idx_game_player_results_local_player_id ON public.game_player_results(local_player_id);
CREATE INDEX IF NOT EXISTS idx_game_player_results_player_type ON public.game_player_results(player_type);

-- Create a comprehensive function to save all player results (account and floating players)
CREATE OR REPLACE FUNCTION public.save_all_player_results(
  game_session_id UUID,
  players_data JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  player_record JSONB;
  total_buyin DECIMAL(10,2);
  total_cashout DECIMAL(10,2);
  net_profit DECIMAL(10,2);
  is_winner BOOLEAN;
  matched_profile_id UUID;
BEGIN
  -- Clear existing results for this game to avoid duplicates
  DELETE FROM public.game_player_results WHERE game_id = game_session_id;
  
  -- Process each player in the game
  FOR player_record IN SELECT * FROM jsonb_array_elements(players_data)
  LOOP
    -- Calculate totals from buy-ins and cash-out
    SELECT 
      COALESCE(SUM((buyin->>'amount')::DECIMAL), 0),
      COALESCE((player_record->>'cashOutAmount')::DECIMAL, 0)
    INTO total_buyin, total_cashout
    FROM jsonb_array_elements(player_record->'buyIns') AS buyin;
    
    net_profit := total_cashout - total_buyin;
    is_winner := net_profit > 0;
    
    -- Try to match with existing profile by name (case-insensitive)
    SELECT id INTO matched_profile_id
    FROM public.profiles 
    WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(player_record->>'name'))
    LIMIT 1;
    
    -- Insert player result record
    INSERT INTO public.game_player_results (
      game_id,
      profile_id,
      player_name,
      player_type,
      local_player_id,
      buyin_dollars,
      cashout_dollars,
      net_dollars,
      winner
    ) VALUES (
      game_session_id,
      matched_profile_id, -- NULL for floating players
      player_record->>'name',
      CASE 
        WHEN matched_profile_id IS NOT NULL THEN 'account'
        WHEN (player_record->>'playerId') LIKE 'local-%' THEN 'local'
        ELSE 'guest'
      END,
      player_record->>'playerId',
      total_buyin,
      total_cashout,
      net_profit,
      is_winner
    );
    
    -- Update profile stats if player has an account
    IF matched_profile_id IS NOT NULL THEN
      UPDATE public.profiles 
      SET 
        all_time_profit_loss = COALESCE(all_time_profit_loss, 0) + net_profit,
        games_played = COALESCE(games_played, 0) + 1,
        last_game_date = NOW(),
        updated_at = NOW()
      WHERE id = matched_profile_id;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Successfully saved results for % players in game %', 
    jsonb_array_length(players_data), game_session_id;
END;
$$;

-- Create a function to get comprehensive player statistics (including floating players)
CREATE OR REPLACE FUNCTION public.get_player_statistics(
  player_identifier TEXT, -- Can be profile_id, player_name, or local_player_id
  identifier_type TEXT DEFAULT 'name' -- 'profile_id', 'name', or 'local_id'
)
RETURNS TABLE(
  total_games INTEGER,
  total_profit_loss DECIMAL(10,2),
  total_buyins DECIMAL(10,2),
  total_cashouts DECIMAL(10,2),
  wins INTEGER,
  losses INTEGER,
  win_rate DECIMAL(5,2),
  avg_profit_per_game DECIMAL(10,2),
  biggest_win DECIMAL(10,2),
  biggest_loss DECIMAL(10,2),
  last_game_date TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as total_games,
    COALESCE(SUM(gpr.net_dollars), 0) as total_profit_loss,
    COALESCE(SUM(gpr.buyin_dollars), 0) as total_buyins,
    COALESCE(SUM(gpr.cashout_dollars), 0) as total_cashouts,
    COUNT(CASE WHEN gpr.winner THEN 1 END)::INTEGER as wins,
    COUNT(CASE WHEN NOT gpr.winner THEN 1 END)::INTEGER as losses,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        ROUND((COUNT(CASE WHEN gpr.winner THEN 1 END)::DECIMAL / COUNT(*)::DECIMAL) * 100, 2)
      ELSE 0 
    END as win_rate,
    CASE 
      WHEN COUNT(*) > 0 THEN COALESCE(SUM(gpr.net_dollars), 0) / COUNT(*)
      ELSE 0 
    END as avg_profit_per_game,
    COALESCE(MAX(gpr.net_dollars), 0) as biggest_win,
    COALESCE(MIN(gpr.net_dollars), 0) as biggest_loss,
    MAX(gpr.created_at) as last_game_date
  FROM public.game_player_results gpr
  WHERE 
    CASE identifier_type
      WHEN 'profile_id' THEN gpr.profile_id::TEXT = player_identifier
      WHEN 'name' THEN LOWER(TRIM(gpr.player_name)) = LOWER(TRIM(player_identifier))
      WHEN 'local_id' THEN gpr.local_player_id = player_identifier
      ELSE FALSE
    END;
END;
$$;

-- Create a view for easy access to all player statistics
CREATE OR REPLACE VIEW public.comprehensive_player_stats AS
SELECT 
  gpr.player_name,
  gpr.player_type,
  gpr.profile_id,
  gpr.local_player_id,
  COUNT(*) as total_games,
  SUM(gpr.net_dollars) as total_profit_loss,
  SUM(gpr.buyin_dollars) as total_buyins,
  SUM(gpr.cashout_dollars) as total_cashouts,
  COUNT(CASE WHEN gpr.winner THEN 1 END) as wins,
  COUNT(CASE WHEN NOT gpr.winner THEN 1 END) as losses,
  ROUND((COUNT(CASE WHEN gpr.winner THEN 1 END)::DECIMAL / COUNT(*)::DECIMAL) * 100, 2) as win_rate,
  AVG(gpr.net_dollars) as avg_profit_per_game,
  MAX(gpr.net_dollars) as biggest_win,
  MIN(gpr.net_dollars) as biggest_loss,
  MAX(gpr.created_at) as last_game_date,
  p.full_name as account_name,
  p.email as account_email
FROM public.game_player_results gpr
LEFT JOIN public.profiles p ON gpr.profile_id = p.id
GROUP BY 
  gpr.player_name, 
  gpr.player_type, 
  gpr.profile_id, 
  gpr.local_player_id,
  p.full_name,
  p.email
ORDER BY total_profit_loss DESC;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.save_all_player_results(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_statistics(TEXT, TEXT) TO authenticated;
GRANT SELECT ON public.comprehensive_player_stats TO authenticated;

-- Create RLS policies for the updated table
ALTER TABLE public.game_player_results ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see results from games they participated in or own
CREATE POLICY "Users can view game results they participated in" ON public.game_player_results
FOR SELECT USING (
  -- User can see their own results (if they have a profile)
  profile_id = auth.uid()
  OR
  -- User can see results from games they own
  game_id IN (
    SELECT id FROM public.game_sessions 
    WHERE user_id = auth.uid()
  )
  OR
  -- User can see results from games they were invited to and accepted
  game_id IN (
    SELECT game_session_id FROM public.game_invitations 
    WHERE invitee_id = auth.uid() AND status = 'accepted'
  )
);

-- Policy: Only game owners can insert/update results
CREATE POLICY "Game owners can manage results" ON public.game_player_results
FOR ALL USING (
  game_id IN (
    SELECT id FROM public.game_sessions 
    WHERE user_id = auth.uid()
  )
);

COMMENT ON FUNCTION public.save_all_player_results IS 'Saves comprehensive player results for both account and floating players, updating profile stats where applicable';
COMMENT ON FUNCTION public.get_player_statistics IS 'Retrieves comprehensive statistics for any player (account or floating) by various identifiers';
COMMENT ON VIEW public.comprehensive_player_stats IS 'Unified view of all player statistics including floating players without accounts';
