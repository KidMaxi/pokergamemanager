-- Creating comprehensive finalize pipeline with idempotent RPC function
begin;

-- Create games table if it doesn't exist
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  point_to_cash_rate numeric(10,2) default 1.0,
  status text default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create game_finalizations table for idempotency
create table if not exists public.game_finalizations (
  game_id uuid not null,
  owner_id uuid not null,
  finalized_at timestamptz default now(),
  primary key (game_id, owner_id)
);

-- Add dollar-based columns to profiles if they don't exist
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'total_buyin_dollars') then
    alter table public.profiles add column total_buyin_dollars numeric(12,1) default 0;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'total_cashout_dollars') then
    alter table public.profiles add column total_cashout_dollars numeric(12,1) default 0;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'total_net_dollars') then
    alter table public.profiles add column total_net_dollars numeric(12,1) default 0;
  end if;
end $$;

-- Create or replace the idempotent RPC function
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
  v_buyin numeric;
  v_cashout numeric;
  v_winner boolean;
begin
  if p_game_id is null then
    raise exception 'p_game_id cannot be null';
  end if;

  -- Idempotency: one row per game/owner
  insert into public.game_finalizations(game_id, owner_id)
  values (p_game_id, p_owner_id)
  on conflict do nothing;
  if not found then
    return; -- already finalized
  end if;

  -- Apply per-player aggregates; accept dollars OR cents
  for r in select * from jsonb_array_elements(p_results) loop
    v_profile := (r->>'profile_id')::uuid;
    if v_profile is null then continue; end if;

    v_buyin := coalesce(
      (r->>'buyin_dollars')::numeric,
      ((r->>'buyin_cents')::numeric) / 100.0,
      0
    );
    v_cashout := coalesce(
      (r->>'cashout_dollars')::numeric,
      ((r->>'cashout_cents')::numeric) / 100.0,
      0
    );
    v_winner := coalesce((r->>'winner')::boolean, false);

    update public.profiles set
      total_sessions = total_sessions + 1,
      total_buyin_dollars = total_buyin_dollars + round(v_buyin, 1),
      total_cashout_dollars = total_cashout_dollars + round(v_cashout, 1),
      total_net_dollars = total_net_dollars + round(v_cashout - v_buyin, 1),
      total_wins = total_wins + case when v_winner then 1 else 0 end
    where id = v_profile;
  end loop;

  -- Mark game as completed if the games table exists
  begin
    update public.games
      set status = 'completed', updated_at = now()
      where id = p_game_id and owner_id = p_owner_id;
  exception when undefined_table then
    -- ignore if games table not present
    null;
  end;
end;
$$;

-- Set proper permissions
revoke all on function public.profile_apply_game_result(uuid, uuid, jsonb) from public;
grant execute on function public.profile_apply_game_result(uuid, uuid, jsonb) to authenticated;

-- Enable RLS on new tables
alter table public.games enable row level security;
alter table public.game_finalizations enable row level security;

-- Create RLS policies
create policy "Users can manage their own games" on public.games
  for all using (auth.uid() = owner_id);

create policy "Users can manage their own finalizations" on public.game_finalizations
  for all using (auth.uid() = owner_id);

commit;
