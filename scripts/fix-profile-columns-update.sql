-- Fix the RPC function to update the correct columns that the user expects to see
-- The user wants games_played and all_time_profit_loss to update, not total_sessions and total_net_dollars

create or replace function public.profile_finalize_game(
  p_game_id uuid,
  p_owner_id uuid,
  p_results jsonb  -- array of { profile_id, buyin_dollars|buyin_cents, cashout_dollars|cashout_cents, winner }
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

  -- Idempotency: only first call per game counts
  insert into public.game_finalizations(game_id, owner_id)
  values (p_game_id, p_owner_id)
  on conflict do nothing;
  if not found then return; end if; -- already finalized

  raise notice 'Processing % player results for game %', jsonb_array_length(p_results), p_game_id;

  for r in select * from jsonb_array_elements(p_results) loop
    v_profile := (r->>'profile_id')::uuid; if v_profile is null then continue; end if;
    v_buyin   := round(coalesce((r->>'buyin_dollars')::numeric,  ((r->>'buyin_cents')::numeric)/100.0, 0), 1);
    v_cashout := round(coalesce((r->>'cashout_dollars')::numeric,((r->>'cashout_cents')::numeric)/100.0, 0), 1);
    v_net     := round(v_cashout - v_buyin, 1);
    v_winner  := coalesce((r->>'winner')::boolean, false);

    raise notice 'Player %: buyin=%, cashout=%, net=%, winner=%', v_profile, v_buyin, v_cashout, v_net, v_winner;

    -- Snapshot (idempotent upsert)
    insert into public.game_player_results (game_id, profile_id, buyin_dollars, cashout_dollars, net_dollars, winner)
    values (p_game_id, v_profile, v_buyin, v_cashout, v_net, v_winner)
    on conflict (game_id, profile_id) do update set
      buyin_dollars = excluded.buyin_dollars,
      cashout_dollars = excluded.cashout_dollars,
      net_dollars = excluded.net_dollars,
      winner = excluded.winner;

    -- Update the correct columns that the user expects to see
    -- Use games_played instead of total_sessions, and all_time_profit_loss instead of total_net_dollars
    update public.profiles set
      games_played = games_played + 1,
      total_buyin_dollars = total_buyin_dollars + v_buyin,
      total_cashout_dollars = total_cashout_dollars + v_cashout,
      all_time_profit_loss = all_time_profit_loss + v_net,
      total_wins = total_wins + case when v_winner then 1 else 0 end
    where id = v_profile;

    raise notice 'Updated profile % stats: games_played +1, all_time_profit_loss +%, total_wins +%', 
      v_profile, v_net, case when v_winner then 1 else 0 end;
  end loop;

  raise notice 'Finalization complete for game %', p_game_id;
end; $$;
