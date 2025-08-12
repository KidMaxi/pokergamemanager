-- Creating database functions for reliable stats updates
CREATE OR REPLACE FUNCTION increment_player_stats_with_win(player_id UUID, profit_loss NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles 
  SET 
    games_played = games_played + 1,
    all_time_profit_loss = all_time_profit_loss + profit_loss,
    total_wins = total_wins + 1
  WHERE id = player_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_player_stats(player_id UUID, profit_loss NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles 
  SET 
    games_played = games_played + 1,
    all_time_profit_loss = all_time_profit_loss + profit_loss
  WHERE id = player_id;
END;
$$ LANGUAGE plpgsql;
