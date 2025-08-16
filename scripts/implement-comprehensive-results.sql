-- Added proper view dropping and recreation to fix column naming conflict
begin;

-- 1) Snapshot table for per-player results (idempotent on (game_id, profile_id))
create table if not exists public.game_player_results (
  game_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  buyin_dollars numeric(12,1) not null,
  cashout_dollars numeric(12,1) not null,
  net_dollars numeric(12,1) not null,
  winner boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (game_id, profile_id)
);

alter table public.game_player_results enable row level security;

-- Replace policy to match your schema: game owner can read their results
drop policy if exists "results: owner can read" on public.game_player_results;
create policy "results: owner can read" on public.game_player_results
  for select using (
    exists (
      select 1 from public.game_sessions gs
      where gs.id = game_id and gs.user_id = auth.uid()
    )
  );

-- 2) Ensure lifetime totals exist on profiles (whole dollars; 1 decimal)
alter table public.profiles
  add column if not exists total_buyin_dollars numeric(12,1) not null default 0,
  add column if not exists total_cashout_dollars numeric(12,1) not null default 0,
  add column if not exists total_net_dollars numeric(12,1) not null default 0,
  add column if not exists total_wins integer not null default 0;

-- 3) Idempotency ledger (do NOT drop existing data)
create table if not exists public.game_finalizations (
  game_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  finalized_at timestamptz not null default now()
);

alter table public.game_finalizations enable row level security;

drop policy if exists "finalizations: owner can read" on public.game_finalizations;
create policy "finalizations: owner can read" on public.game_finalizations
  for select using (owner_id = auth.uid());

-- 4) Robust, idempotent finalize RPC (accepts *_dollars or *_cents). Updates totals + snapshot; DOES NOT touch all_time_profit_loss column.
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
begin
  if p_game_id is null then raise exception 'p_game_id cannot be null'; end if;

  -- idempotency per game
  insert into public.game_finalizations(game_id, owner_id)
  values (p_game_id, p_owner_id)
  on conflict do nothing;
  if not found then return; end if; -- already finalized

  for r in select * from jsonb_array_elements(p_results) loop
    v_profile := (r->>'profile_id')::uuid; if v_profile is null then continue; end if;
    v_buyin   := round(coalesce((r->>'buyin_dollars')::numeric,  ((r->>'buyin_cents')::numeric)/100.0, 0), 1);
    v_cashout := round(coalesce((r->>'cashout_dollars')::numeric,((r->>'cashout_cents')::numeric)/100.0, 0), 1);
    v_net     := round(v_cashout - v_buyin, 1);
    v_winner  := coalesce((r->>'winner')::boolean, false);

    -- snapshot (idempotent upsert)
    insert into public.game_player_results (game_id, profile_id, buyin_dollars, cashout_dollars, net_dollars, winner)
    values (p_game_id, v_profile, v_buyin, v_cashout, v_net, v_winner)
    on conflict (game_id, profile_id) do update set
      buyin_dollars = excluded.buyin_dollars,
      cashout_dollars = excluded.cashout_dollars,
      net_dollars = excluded.net_dollars,
      winner = excluded.winner;

    -- lifetime totals
    update public.profiles set
      total_buyin_dollars   = total_buyin_dollars + v_buyin,
      total_cashout_dollars = total_cashout_dollars + v_cashout,
      total_net_dollars     = total_net_dollars + v_net,
      total_wins = total_wins + case when v_winner then 1 else 0 end
    where id = v_profile;
  end loop;
end; $$;

revoke all on function public.profile_apply_game_result(uuid, uuid, jsonb) from public;
grant execute on function public.profile_apply_game_result(uuid, uuid, jsonb) to authenticated;

-- Drop existing view first to avoid column naming conflicts
drop view if exists public.profile_stats;

-- 5) Stable source for the Profile page (DERIVED P/L)
create view public.profile_stats as
select
  p.id,
  p.total_wins,
  p.total_buyin_dollars,
  p.total_cashout_dollars,
  p.total_net_dollars,
  (p.total_cashout_dollars - p.total_buyin_dollars) as all_time_profit_loss
from public.profiles p;

commit;
