-- Remove the unnecessary players table since we're using local players per game
DROP TABLE IF EXISTS public.players CASCADE;

-- Remove any references to players table in other scripts
-- (This table was not being used effectively in the current implementation)
