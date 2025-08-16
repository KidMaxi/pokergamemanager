-- Complete database schema for idempotent stats tracking with whole dollars
begin;

-- Add lifetime stats columns to profiles (whole dollars with 1 decimal)
alter table public.profiles
  add column if not exists total_wins integer not null default 0,
  add column if not exists total_sessions integer not null default 0,
  add column if not exists total_buyin_dollars numeric(12,1) not null default 0,
  add column if not exists total_cashout_dollars numeric(12,1) not null default 0,
  add column if not exists total_net_dollars numeric(12,1) not null default 0;

-- Create games table for persistent game storage
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  point_to_cash_rate numeric(12,1) not null,
  start_time timestamptz not null default now(),
  end_time timestamptz
);

-- Create game finalization ledger (prevents double counting)
create table if not exists public.game_finalizations (
  game_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  finalized_at timestamptz not null default now()
);

-- RPC to apply results exactly once per game (dollars w/ 1 decimal)
create or replace function public.profile_apply_game_result(
  p_game_id uuid,
  p_owner_id uuid,
  p_results jsonb
) returns void
language plpgsql security definer set search_path=public as $$
declare 
  r jsonb; 
  v_profile uuid; 
  v_buyin numeric(12,1); 
  v_cashout numeric(12,1); 
  v_winner boolean; 
begin
  if p_game_id is null then 
    raise exception 'p_game_id cannot be null'; 
  end if;
  
  -- Insert into finalization ledger (idempotency check)
  insert into public.game_finalizations(game_id, owner_id) 
  values (p_game_id, p_owner_id) 
  on conflict do nothing;
  
  if not found then 
    return; -- already finalized
  end if;
  
  -- Process each player result
  for r in select * from jsonb_array_elements(p_results) loop
    v_profile := (r->>'profile_id')::uuid; 
    if v_profile is null then continue; end if;
    
    v_buyin := coalesce((r->>'buyin_dollars')::numeric, 0);
    v_cashout := coalesce((r->>'cashout_dollars')::numeric, 0);
    v_winner := coalesce((r->>'winner')::boolean, false);
    
    -- Update profile stats atomically
    update public.profiles set
      total_sessions = total_sessions + 1,
      total_buyin_dollars = total_buyin_dollars + v_buyin,
      total_cashout_dollars = total_cashout_dollars + v_cashout,
      total_net_dollars = total_net_dollars + (v_cashout - v_buyin),
      total_wins = total_wins + case when v_winner then 1 else 0 end
    where id = v_profile;
  end loop;
end; 
$$;

-- Set proper permissions
revoke all on function public.profile_apply_game_result(uuid,uuid,jsonb) from public;
grant execute on function public.profile_apply_game_result(uuid,uuid,jsonb) to authenticated;

-- Enable RLS on new tables
alter table public.games enable row level security;
alter table public.game_finalizations enable row level security;

-- RLS policies for games table
create policy "Users can view their own games" on public.games
  for select using (auth.uid() = owner_id);

create policy "Users can insert their own games" on public.games
  for insert with check (auth.uid() = owner_id);

create policy "Users can update their own games" on public.games
  for update using (auth.uid() = owner_id);

-- RLS policies for game_finalizations table
create policy "Users can view their own finalizations" on public.game_finalizations
  for select using (auth.uid() = owner_id);

commit;
