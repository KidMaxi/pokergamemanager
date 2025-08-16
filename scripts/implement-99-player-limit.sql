begin;

-- 1) Participants table (idempotent). One row per player per game.
create table if not exists public.game_players (
  game_id uuid not null references public.game_sessions(id) on delete cascade,
  profile_id uuid null references public.profiles(id) on delete set null,
  display_name text not null,
  joined_at timestamptz not null default now(),
  primary key (game_id, display_name),
  unique (game_id, profile_id)
);

-- RLS (owner of the game can see their players)
alter table public.game_players enable row level security;

drop policy if exists "players: owner can select" on public.game_players;
create policy "players: owner can select" on public.game_players
  for select using (
    exists (
      select 1 from public.game_sessions gs
      where gs.id = game_id and gs.user_id = auth.uid()
    )
  );

drop policy if exists "players: owner can insert" on public.game_players;
create policy "players: owner can insert" on public.game_players
  for insert with check (
    exists (
      select 1 from public.game_sessions gs
      where gs.id = game_id and gs.user_id = auth.uid()
    )
  );

drop policy if exists "players: owner can delete" on public.game_players;
create policy "players: owner can delete" on public.game_players
  for delete using (
    exists (
      select 1 from public.game_sessions gs
      where gs.id = game_id and gs.user_id = auth.uid()
    )
  );

-- 2) DB trigger: enforce MAX 99 players per game
create or replace function public.enforce_max_99_players() returns trigger
language plpgsql as $$
begin
  -- Count BEFORE inserting this row; if already 99, block the 100th
  if (
    select count(*) from public.game_players gp
    where gp.game_id = NEW.game_id
  ) >= 99 then
    raise exception 'Max players per game is 99';
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_enforce_max_99_players on public.game_players;
create trigger trg_enforce_max_99_players
before insert on public.game_players
for each row execute function public.enforce_max_99_players();

-- 3) Update finalize RPC with defensive check
create or replace function public.profile_finalize_game(
  p_game_id uuid,
  p_results jsonb
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_game_owner uuid;
  v_result jsonb;
  v_profile_id uuid;
  v_buyin numeric;
  v_cashout numeric;
  v_winner boolean;
begin
  -- Defensive check: max 99 participants
  if jsonb_array_length(p_results) > 99 then
    raise exception 'Cannot finalize: participants (%), exceeds max 99', jsonb_array_length(p_results);
  end if;

  -- Verify game ownership
  select user_id into v_game_owner
  from public.game_sessions
  where id = p_game_id;

  if v_game_owner != auth.uid() then
    raise exception 'Access denied: not game owner';
  end if;

  -- Check idempotency
  if exists (
    select 1 from public.game_finalizations
    where game_id = p_game_id
  ) then
    raise notice 'Game % already finalized, skipping', p_game_id;
    return;
  end if;

  -- Process each player result
  for v_result in select jsonb_array_elements(p_results)
  loop
    v_profile_id := (v_result->>'profile_id')::uuid;
    v_buyin := (v_result->>'buyin_dollars')::numeric;
    v_cashout := (v_result->>'cashout_dollars')::numeric;
    v_winner := (v_result->>'winner')::boolean;

    -- Update profile stats
    update public.profiles set
      games_played = games_played + 1,
      total_wins = total_wins + case when v_winner then 1 else 0 end,
      total_buyin_dollars = total_buyin_dollars + v_buyin,
      total_cashout_dollars = total_cashout_dollars + v_cashout,
      all_time_profit_loss = all_time_profit_loss + (v_cashout - v_buyin)
    where id = v_profile_id;

    -- Store individual result
    insert into public.game_player_results (
      game_id, profile_id, buyin_dollars, cashout_dollars, net_dollars, winner
    ) values (
      p_game_id, v_profile_id, v_buyin, v_cashout, v_cashout - v_buyin, v_winner
    );
  end loop;

  -- Mark as finalized
  insert into public.game_finalizations (game_id, finalized_at)
  values (p_game_id, now());

  raise notice 'Successfully finalized game % with % participants', p_game_id, jsonb_array_length(p_results);
end; $$;

commit;
