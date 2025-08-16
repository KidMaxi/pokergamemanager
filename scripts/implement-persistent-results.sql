begin;

-- 1) Persist per-player final results for every game
create table if not exists public.game_player_results (
  game_id uuid not null references public.game_sessions(id) on delete cascade, -- Reference existing game_sessions table instead of non-existent games table
  profile_id uuid not null references public.profiles(id) on delete cascade,
  buyin_dollars numeric(12,1) not null,
  cashout_dollars numeric(12,1) not null,
  net_dollars numeric(12,1) not null,
  winner boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (game_id, profile_id)
);

alter table public.game_player_results enable row level security;

-- Drop existing policies if they exist
drop policy if exists "results: owner can read" on public.game_player_results;

-- Read your own results (by joining to game_sessions.user_id or by participant)
create policy "results: owner can read" on public.game_player_results
  for select using (
    exists (
      select 1 from public.game_sessions gs -- Reference game_sessions table and user_id column
      where gs.id = game_id and gs.user_id = auth.uid()
    )
  );

-- 2) Use existing columns and remove duplicates
-- Remove total_sessions and total_net_dollars as requested, use existing games_played and all_time_profit_loss
alter table public.profiles
  add column if not exists total_buyin_dollars numeric(12,1) not null default 0,
  add column if not exists total_cashout_dollars numeric(12,1) not null default 0,
  add column if not exists total_wins integer not null default 0;

-- 3) Use existing game_finalizations table (already exists in schema)
-- No need to create it again

-- 4) RPC: idempotent finalize. Accepts either *_dollars or *_cents keys.
create or replace function public.profile_apply_game_result(
  p_game_id uuid,
  p_owner_id uuid,
  p_results jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_profile uuid;
  v_buyin numeric(12,1);
  v_cashout numeric(12,1);
  v_net numeric(12,1);
  v_winner boolean;
  v_already_finalized boolean := false;
begin
  raise notice 'Starting finalize for game_id: %, owner_id: %, results count: %', p_game_id, p_owner_id, jsonb_array_length(p_results);
  
  if p_game_id is null then raise exception 'p_game_id cannot be null'; end if;

  -- Check if already finalized
  select true into v_already_finalized from public.game_finalizations where game_id = p_game_id;
  
  if v_already_finalized then
    raise notice 'Game % already finalized, skipping', p_game_id;
    return;
  end if;

  -- Mark as finalized
  insert into public.game_finalizations(game_id, owner_id)
  values (p_game_id, p_owner_id);
  
  raise notice 'Marked game % as finalized', p_game_id;

  for r in select * from jsonb_array_elements(p_results) loop
    v_profile := (r->>'profile_id')::uuid; 
    if v_profile is null then 
      raise notice 'Skipping result with null profile_id: %', r;
      continue; 
    end if;
    
    v_buyin := round(coalesce((r->>'buyin_dollars')::numeric, ((r->>'buyin_cents')::numeric)/100.0, 0), 1);
    v_cashout := round(coalesce((r->>'cashout_dollars')::numeric, ((r->>'cashout_cents')::numeric)/100.0, 0), 1);
    v_net := round(v_cashout - v_buyin, 1);
    v_winner := coalesce((r->>'winner')::boolean, false);

    raise notice 'Processing player %: buyin=%, cashout=%, net=%, winner=%', v_profile, v_buyin, v_cashout, v_net, v_winner;

    -- Persist the per-player result (idempotent on (game_id, profile_id))
    insert into public.game_player_results(game_id, profile_id, buyin_dollars, cashout_dollars, net_dollars, winner)
    values (p_game_id, v_profile, v_buyin, v_cashout, v_net, v_winner)
    on conflict (game_id, profile_id) do update set
      buyin_dollars = excluded.buyin_dollars,
      cashout_dollars = excluded.cashout_dollars,
      net_dollars = excluded.net_dollars,
      winner = excluded.winner;

    -- Update lifetime totals using existing columns
    update public.profiles set
      games_played = games_played + 1, -- Use existing games_played instead of total_sessions
      total_buyin_dollars = total_buyin_dollars + v_buyin,
      total_cashout_dollars = total_cashout_dollars + v_cashout,
      all_time_profit_loss = all_time_profit_loss + v_net, -- Use existing all_time_profit_loss instead of total_net_dollars
      total_wins = total_wins + case when v_winner then 1 else 0 end
    where id = v_profile;
    
    raise notice 'Updated profile % totals', v_profile;
  end loop;
  
  raise notice 'Finalize complete for game %', p_game_id;
end; $$;

revoke all on function public.profile_apply_game_result(uuid, uuid, jsonb) from public;
grant execute on function public.profile_apply_game_result(uuid, uuid, jsonb) to authenticated;

-- 5) Derived view for profile stats — one source for the UI
create or replace view public.profile_stats as
select
  p.id,
  p.games_played, -- Use existing games_played column
  p.total_wins,
  p.total_buyin_dollars,
  p.total_cashout_dollars,
  p.all_time_profit_loss -- Use existing all_time_profit_loss column
from public.profiles p;

commit;
