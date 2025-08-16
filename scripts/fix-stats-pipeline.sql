-- Adding missing game_finalizations table and consolidating profiles columns
-- Creating comprehensive stats pipeline with consolidated columns
begin;

-- Create game_finalizations table for idempotency
create table if not exists public.game_finalizations (
  game_id uuid primary key,
  owner_id uuid not null,
  finalized_at timestamp with time zone default now()
);

-- Add dollar-based columns to profiles table if they don't exist
-- Only adding buyin/cashout columns, removing duplicates total_net_dollars and total_sessions
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'total_buyin_dollars') then
    alter table public.profiles add column total_buyin_dollars numeric(12,1) default 0;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'total_cashout_dollars') then
    alter table public.profiles add column total_cashout_dollars numeric(12,1) default 0;
  end if;
end $$;

-- Remove duplicate columns if they exist, keeping the original ones with data
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'total_net_dollars') then
    alter table public.profiles drop column total_net_dollars;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'total_sessions') then
    alter table public.profiles drop column total_sessions;
  end if;
end $$;

-- Creating resilient RPC function that uses consolidated columns
-- Updated to use games_played instead of total_sessions and all_time_profit_loss instead of total_net_dollars
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
  v_already_finalized boolean;
begin
  if p_game_id is null then
    raise exception 'p_game_id cannot be null';
  end if;

  -- Check if already finalized
  select exists(select 1 from public.game_finalizations where game_id = p_game_id) into v_already_finalized;
  
  if v_already_finalized then
    raise notice 'Game % already finalized, skipping', p_game_id;
    return;
  end if;

  -- Mark as finalized
  insert into public.game_finalizations(game_id, owner_id)
  values (p_game_id, p_owner_id);

  raise notice 'Processing % results for game %', jsonb_array_length(p_results), p_game_id;

  for r in select * from jsonb_array_elements(p_results) loop
    v_profile := (r->>'profile_id')::uuid;
    if v_profile is null then 
      raise notice 'Skipping result with null profile_id: %', r;
      continue; 
    end if;

    v_buyin := coalesce((r->>'buyin_dollars')::numeric, ((r->>'buyin_cents')::numeric)/100.0, 0);
    v_cashout := coalesce((r->>'cashout_dollars')::numeric, ((r->>'cashout_cents')::numeric)/100.0, 0);
    v_winner := coalesce((r->>'winner')::boolean, false);

    raise notice 'Updating profile % with buyin=%, cashout=%, winner=%', v_profile, v_buyin, v_cashout, v_winner;

    -- Using games_played instead of total_sessions and all_time_profit_loss instead of total_net_dollars
    update public.profiles set
      games_played = games_played + 1,
      total_buyin_dollars = total_buyin_dollars + round(v_buyin,1),
      total_cashout_dollars = total_cashout_dollars + round(v_cashout,1),
      all_time_profit_loss = all_time_profit_loss + round(v_cashout - v_buyin,1),
      total_wins = total_wins + case when v_winner then 1 else 0 end
    where id = v_profile;

    if not found then
      raise notice 'Profile % not found, skipping update', v_profile;
    end if;
  end loop;

  raise notice 'Successfully finalized game %', p_game_id;
end; $$;

-- Set proper permissions
revoke all on function public.profile_apply_game_result(uuid, uuid, jsonb) from public;
grant execute on function public.profile_apply_game_result(uuid, uuid, jsonb) to authenticated;

-- Enable RLS on game_finalizations
alter table public.game_finalizations enable row level security;

-- Drop existing policies before creating new ones to make script idempotent
drop policy if exists "Users can finalize their own games" on public.game_finalizations;
drop policy if exists "Users can view their own finalizations" on public.game_finalizations;

-- RLS policy for game_finalizations
create policy "Users can finalize their own games" on public.game_finalizations
  for insert with check (auth.uid() = owner_id);

create policy "Users can view their own finalizations" on public.game_finalizations
  for select using (auth.uid() = owner_id);

commit;
