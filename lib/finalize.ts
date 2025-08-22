import { getSupabaseBrowser } from "@/lib/supabase"
import { roundDollars1, toDimesInt } from "@/lib/money"
import type { GameSession, PlayerInGame } from "@/types"

function perPlayer(p: PlayerInGame, pointToCashRate: number) {
  const buy = roundDollars1(p.buyIns.reduce((s, b) => s + Number(b.amount), 0))

  console.log(`[v0] Player ${p.name} raw data:`, {
    cashOutAmount: p.cashOutAmount,
    pointStack: p.pointStack,
    hasCashOutAmount: p.cashOutAmount !== undefined && p.cashOutAmount !== null,
  })

  // Use cashOutAmount if it's explicitly set (including 0), otherwise calculate from points
  const cash =
    p.cashOutAmount !== undefined && p.cashOutAmount !== null
      ? roundDollars1(p.cashOutAmount)
      : roundDollars1(p.pointStack * pointToCashRate)

  console.log(`[v0] Player ${p.name} calculation:`, {
    pointStack: p.pointStack,
    pointToCashRate: pointToCashRate,
    playerCashOutAmount: p.cashOutAmount,
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
      name: p.name,
      ...perPlayer(p, session.pointToCashRate),
    }))

  if (!rows.length) {
    console.warn("No players with profileId found - no stats to update")
    return
  }

  // Process each player individually with direct database updates
  for (const row of rows) {
    const profitLoss = row.cash - row.buy
    const isWinner = profitLoss > 0 // Winner = positive P/L
    const isLoser = profitLoss < 0 // Loser = negative P/L

    let statusText = "BREAK-EVEN"
    if (isWinner) statusText = "WINNER"
    if (isLoser) statusText = "LOSER"

    console.log(
      `[v0] Player ${row.name}: Buy-ins = ${row.buy}, Cash-out = ${row.cash}, P/L = ${profitLoss}, Status = ${statusText}`,
    )

    // Fetch current profile data to get current values
    const { data: currentProfile, error: fetchError } = await supabase
      .from("profiles")
      .select("games_played, all_time_profit_loss, total_wins, total_losses")
      .eq("id", row.profileId)
      .single()

    if (fetchError) {
      console.error(`[v0] Error fetching current profile for ${row.name}:`, fetchError)
      continue
    }

    // Calculate new values explicitly
    const newGamesPlayed = (currentProfile.games_played || 0) + 1
    const newProfitLoss = (currentProfile.all_time_profit_loss || 0) + profitLoss
    const newTotalWins = (currentProfile.total_wins || 0) + (isWinner ? 1 : 0)
    const newTotalLosses = (currentProfile.total_losses || 0) + (isLoser ? 1 : 0)

    console.log(
      `[v0] Updating ${row.name}:`,
      `\n  games_played: ${currentProfile.games_played || 0} -> ${newGamesPlayed}`,
      `\n  all_time_profit_loss: ${currentProfile.all_time_profit_loss || 0} -> ${newProfitLoss}`,
      `\n  total_wins: ${currentProfile.total_wins || 0} -> ${newTotalWins}`,
      `\n  total_losses: ${currentProfile.total_losses || 0} -> ${newTotalLosses}`,
      `\n  Status: ${statusText}`,
    )

    // Update with explicit values
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        games_played: newGamesPlayed,
        all_time_profit_loss: newProfitLoss,
        total_wins: newTotalWins,
        total_losses: newTotalLosses,
      })
      .eq("id", row.profileId)

    if (updateError) {
      console.error(`[v0] Error updating profile for ${row.name}:`, updateError)
      throw updateError
    }

    console.log(
      `[v0] ✅ Successfully updated profile for ${row.name} - Final stats: W:${newTotalWins} L:${newTotalLosses} P/L:${newProfitLoss}`,
    )

    // Store the result in game_player_results table for summary display
    const { error: resultError } = await supabase.from("game_player_results").upsert({
      game_id: gameId,
      profile_id: row.profileId,
      buyin_dollars: row.buy,
      cashout_dollars: row.cash,
      net_dollars: profitLoss,
      winner: isWinner,
    })

    if (resultError) {
      console.error(`[v0] Error storing game result for ${row.name}:`, resultError)
      // Don't throw here - profile update is more important
    }
  }

  console.log(`[v0] Successfully finalized game and updated stats for ${rows.length} players`)

  console.log(`[v0] Verifying results were stored in database...`)
  const storedResults = await getGameResults(gameId)
  console.log(`[v0] Stored results verification:`, storedResults)
}

export async function getGameResults(gameId: string) {
  const supabase = getSupabaseBrowser()

  console.log(`[v0] Fetching game results for gameId: ${gameId}`)

  const { data, error } = await supabase
    .from("game_player_results")
    .select(`
      profile_id,
      buyin_dollars,
      cashout_dollars,
      net_dollars,
      winner,
      profiles!inner(full_name)
    `)
    .eq("game_id", gameId)
    .order("net_dollars", { ascending: false })

  console.log(`[v0] Raw database query result:`, { data, error })

  if (error) {
    console.error("Error fetching game results:", error)
    return []
  }

  const results =
    data?.map((result) => ({
      profileId: result.profile_id,
      name: result.profiles.full_name,
      buyinDollars: Number(result.buyin_dollars),
      cashoutDollars: Number(result.cashout_dollars),
      netDollars: Number(result.net_dollars),
      winner: result.winner,
    })) || []

  console.log(`[v0] Processed game results:`, results)
  return results
}
