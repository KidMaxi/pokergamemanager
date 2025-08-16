import { getSupabaseBrowser } from "@/lib/supabase"
import { roundDollars1, toDollarStr1, toDimesInt } from "@/lib/money"
import type { GameSession, PlayerInGame } from "@/types"

function perPlayer(p: PlayerInGame) {
  const buy = roundDollars1(p.buyIns.reduce((s, b) => s + Number(b.amount), 0))
  const cash = roundDollars1(p.cashOutAmount || 0)
  return {
    buy,
    cash,
    netDimes: toDimesInt(cash) - toDimesInt(buy),
  }
}

export async function finalizeAndUpdateStats(session: GameSession) {
  const supabase = getSupabaseBrowser()
  const { data: u } = await supabase.auth.getUser()
  const ownerId = u?.user?.id
  const gameId = session.dbId // must be the DB game uuid

  if (!ownerId || !gameId) {
    throw new Error("Missing ownerId or gameId")
  }

  const rows = (session.playersInGame || [])
    .filter((p) => p.profileId)
    .map((p) => ({
      profileId: p.profileId!,
      ...perPlayer(p),
    }))

  if (!rows.length) return

  const maxNet = Math.max(...rows.map((r) => r.netDimes))
  const results = rows.map((r) => ({
    profile_id: r.profileId,
    buyin_dollars: toDollarStr1(r.buy),
    cashout_dollars: toDollarStr1(r.cash),
    winner: r.netDimes === maxNet,
  }))

  const { error } = await supabase.rpc("profile_apply_game_result", {
    p_game_id: gameId,
    p_owner_id: ownerId,
    p_results: results,
  })

  if (error) throw error
}
