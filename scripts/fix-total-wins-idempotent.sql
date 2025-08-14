begin;

-- 1) Ensure total_wins column exists and is sane
alter table public.profiles
  add column if not exists total_wins integer not null default 0;

-- 2) Idempotency ledger: records that a given profile has already been awarded a win for a given game
create table if not exists public.game_wins_awarded (
  game_id uuid,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (game_id, profile_id)
);

-- 3) RPC: award wins once per (game_id, profile_id). If insert into ledger succeeds, increment total_wins
create or replace function public.profile_award_wins(p_game_id uuid, p_winner_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
begin
  if p_winner_ids is null or array_length(p_winner_ids,1) is null then
    return;
  end if;

  foreach pid in array p_winner_ids loop
    -- Use NULL game_id if none is provided; idempotency per game works best with a real id
    insert into public.game_wins_awarded(game_id, profile_id)
    values (p_game_id, pid)
    on conflict do nothing;

    if found then
      update public.profiles
        set total_wins = coalesce(total_wins, 0) + 1
      where id = pid;
    end if;
  end loop;
end;
$$;

-- Restrict execute to authenticated users
revoke all on function public.profile_award_wins(uuid, uuid[]) from public;
grant execute on function public.profile_award_wins(uuid, uuid[]) to authenticated;

commit;
