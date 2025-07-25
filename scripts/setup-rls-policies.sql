-- Row Level Security Policies

-- Profiles policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Players policies
DROP POLICY IF EXISTS "Users can manage own players" ON public.players;
CREATE POLICY "Users can manage own players" ON public.players
  FOR ALL USING (
    user_id IN (
      SELECT id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Game sessions policies
DROP POLICY IF EXISTS "Users can manage own game sessions" ON public.game_sessions;
CREATE POLICY "Users can manage own game sessions" ON public.game_sessions
  FOR ALL USING (
    user_id IN (
      SELECT id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Player in game policies
DROP POLICY IF EXISTS "Users can manage own game players" ON public.player_in_game;
CREATE POLICY "Users can manage own game players" ON public.player_in_game
  FOR ALL USING (
    game_session_id IN (
      SELECT id FROM public.game_sessions WHERE user_id = auth.uid()
    )
  );

-- Buy-in records policies
DROP POLICY IF EXISTS "Users can manage own buy-in records" ON public.buy_in_records;
CREATE POLICY "Users can manage own buy-in records" ON public.buy_in_records
  FOR ALL USING (
    player_in_game_id IN (
      SELECT pig.id FROM public.player_in_game pig
      JOIN public.game_sessions gs ON pig.game_session_id = gs.id
      WHERE gs.user_id = auth.uid()
    )
  );

-- Cash-out records policies
DROP POLICY IF EXISTS "Users can manage own cash-out records" ON public.cash_out_records;
CREATE POLICY "Users can manage own cash-out records" ON public.cash_out_records
  FOR ALL USING (
    player_in_game_id IN (
      SELECT pig.id FROM public.player_in_game pig
      JOIN public.game_sessions gs ON pig.game_session_id = gs.id
      WHERE gs.user_id = auth.uid()
    )
  );

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user registration
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
