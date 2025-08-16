import { getSupabaseBrowser } from "@/lib/supabase"
import { roundDollars1, toDollarStr1, toDimesInt } from "@/lib/money"
import type { GameSession, PlayerInGame } from "@/types"

function perPlayer(p: PlayerInGame, pointToCashRate: number) {
  const buy = roundDollars1(p.buyIns.reduce((s, b) => s + Number(b.amount), 0))
  const cash = roundDollars1(p.cash || p.pointStack * pointToCashRate)

  console.log(`[v0] Player ${p.name} calculation:`, {
    pointStack: p.pointStack,
    pointToCashRate: pointToCashRate,
    playerCash: p.cash,
    rawCash: p.pointStack * pointToCashRate,
    finalCash: cash,
    totalBuyIn: buy,
    netProfit: cash - buy,
  })

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
    console.error("Finalize error - missing required data:", {
      ownerId: !!ownerId,
      gameId: !!gameId,
      sessionId: session.id,
    })
    throw new Error(`Missing required data for finalization: ${!ownerId ? "ownerId" : "gameId"}`)
  }

  console.log(`[v0] Starting finalization for game ${gameId} with ${session.playersInGame?.length || 0} players`)

  const rows = (session.playersInGame || [])
    .filter((p) => p.profileId)
    .map((p) => ({
      profileId: p.profileId!,
      ...perPlayer(p, session.pointToCashRate),
    }))

  if (!rows.length) {
    console.warn("No players with profileId found - no stats to update")
    return
  }

  const maxNet = Math.max(...rows.map((r) => r.netDimes))
  const results = rows.map((r) => ({
    profile_id: r.profileId,
    buyin_dollars: toDollarStr1(r.buy),
    cashout_dollars: toDollarStr1(r.cash),
    winner: r.netDimes === maxNet,
  }))

  console.log(`[v0] Calling RPC with results:`, results)

  const { error } = await supabase.rpc("profile_apply_game_result", {
    p_game_id: gameId,
    p_owner_id: ownerId,
    p_results: results,
  })

  if (error) {
    if (
      error.message?.includes('relation "public.game_finalizations" does not exist') ||
      error.message?.includes("function profile_apply_game_result") ||
      error.code === "42P01" ||
      error.code === "42883"
    ) {
      console.error("Database schema not set up. Please run the SQL script: scripts/fix-stats-pipeline.sql")
      throw new Error(
        "Database schema missing. Run scripts/fix-stats-pipeline.sql to set up the stats tracking system.",
      )
    }
    console.error("RPC error:", error)
    throw error
  }

  console.log(`[v0] Successfully finalized game and updated stats for ${results.length} players`)
}
