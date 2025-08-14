begin;

-- 1) Ensure lifetime stats columns exist in DOLLARS (one decimal place)
alter table public.profiles
  add column if not exists total_wins integer not null default 0,
  add column if not exists total_sessions integer not null default 0,
  add column if not exists total_buyin_dollars numeric(12,1) not null default 0,
  add column if not exists total_cashout_dollars numeric(12,1) not null default 0,
  add column if not exists total_net_dollars numeric(12,1) not null default 0;

-- 2) Idempotency ledger: one row per finalized game prevents double counting
create table if not exists public.game_finalizations (
  game_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  finalized_at timestamptz not null default now()
);

-- 3) RPC to apply per-player results exactly once (DOLLARS, one decimal place)
-- p_results is an array of objects: [{"profile_id":"uuid","buyin_dollars":"123.4","cashout_dollars":"200.0","winner":true}, ...]
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
  v_winner boolean;
begin
  if p_game_id is null then
    raise exception 'p_game_id cannot be null';
  end if;

  -- idempotency: insert once; skip if already finalized
  insert into public.game_finalizations(game_id, owner_id)
  values (p_game_id, p_owner_id)
  on conflict do nothing;
  if not found then
    return; -- already finalized; no-op
  end if;

  -- apply per-player aggregates (dollars)
  for r in select * from jsonb_array_elements(p_results) loop
    v_profile := (r->>'profile_id')::uuid;
    if v_profile is null then continue; end if;

    v_buyin := coalesce((r->>'buyin_dollars')::numeric, 0);
    v_cashout := coalesce((r->>'cashout_dollars')::numeric, 0);
    v_winner := coalesce((r->>'winner')::boolean, false);

    update public.profiles
       set total_sessions = total_sessions + 1,
           total_buyin_dollars = total_buyin_dollars + v_buyin,
           total_cashout_dollars = total_cashout_dollars + v_cashout,
           total_net_dollars = total_net_dollars + (v_cashout - v_buyin),
           total_wins = total_wins + case when v_winner then 1 else 0 end
     where id = v_profile;
  end loop;
end;
$$;

-- Lock down RPC to authenticated users only
revoke all on function public.profile_apply_game_result(uuid, uuid, jsonb) from public;
grant execute on function public.profile_apply_game_result(uuid, uuid, jsonb) to authenticated;

commit;
